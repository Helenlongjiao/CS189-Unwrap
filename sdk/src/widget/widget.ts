import { HOST_ATTR } from '../dom';
import { isComplete, isVisible, type Answers, type Question, type Survey } from '../surveys/rules';
import { CSS } from './styles';

/** What the SDK caught, shown at the top of the panel. */
export interface Hud {
  label: string;
  detail: string;
  route: string[];
  meta: string;
}

export interface IntentChoice {
  value: string;
  label: string;
  hint: string;
}

export interface GuideStep {
  label: string;
  url: string;
}

export interface GuideMatch {
  url: string;
  title: string;
  reason: string;
  steps: GuideStep[];
}

export interface WidgetOptions {
  position: 'bottom-right' | 'bottom-left';
  accentColor?: string;
  onLauncher: () => void;
  onSubmit: (survey: Survey, answers: Answers, autoOpened: boolean) => void;
  onDismiss: (survey: Survey, autoOpened: boolean) => void;
}

let uid = 0;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: Array<Node | string>
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Corner launcher plus a HUD-style survey panel, rendered in a Shadow DOM so host-page CSS can't
 * restyle it and its CSS can't leak out. Styles are attached as a constructed stylesheet where
 * supported, which keeps the widget working on sites whose CSP forbids inline <style>.
 */
export class Widget {
  private host: HTMLElement;
  private wrap: HTMLElement;
  private launcher: HTMLButtonElement;
  private panel: HTMLElement | null = null;
  private nudgeEl: HTMLElement | null = null;
  private token = 0;
  private current: { survey: Survey | null; auto: boolean; answers: Answers } | null = null;
  private timers: Array<ReturnType<typeof setTimeout>> = [];

  constructor(private opts: WidgetOptions) {
    this.host = el('div', { [HOST_ATTR]: '' });
    if (opts.accentColor) this.host.style.setProperty('--pulse-accent', opts.accentColor);
    const root = this.host.attachShadow({ mode: 'open' });

    if ('adoptedStyleSheets' in Document.prototype && typeof CSSStyleSheet !== 'undefined' && 'replaceSync' in CSSStyleSheet.prototype) {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      root.adoptedStyleSheets = [sheet];
    } else {
      root.append(el('style', {}, CSS));
    }

    this.launcher = el(
      'button',
      { class: 'launcher', type: 'button', 'aria-label': 'Get help or share feedback', 'aria-expanded': 'false' },
      el('span', { class: 'ring', 'aria-hidden': 'true' }),
      el('span', { class: 'ring inner', 'aria-hidden': 'true' }),
      el('span', { class: 'core', 'aria-hidden': 'true' }),
    );
    this.launcher.addEventListener('click', () => (this.current ? this.close(true) : this.opts.onLauncher()));

    this.wrap = el('div', { class: `wrap ${opts.position === 'bottom-left' ? 'left' : 'right'}` }, this.launcher);
    root.append(this.wrap);
    (document.body ?? document.documentElement).append(this.host);
  }

  isOpen(): boolean {
    return !!this.current;
  }

  isNudging(): boolean {
    return !!this.nudgeEl;
  }

  /** Small prompt for a weak "lost" score. Does not count as the panel being open. */
  nudge(onYes: () => void, onNo: () => void = () => {}) {
    this.dismissNudge();
    const yes = el('button', { class: 'nudge-yes', type: 'button' }, 'Yes');
    const no = el('button', { class: 'nudge-no', type: 'button' }, 'No');
    yes.addEventListener('click', () => {
      this.dismissNudge();
      onYes();
    });
    no.addEventListener('click', () => {
      this.dismissNudge();
      onNo();
    });
    this.nudgeEl = el(
      'div',
      { class: 'nudge', role: 'status' },
      el('p', {}, 'Need help getting somewhere?'),
      el('div', { class: 'nudge-row' }, no, yes),
    );
    this.wrap.insertBefore(this.nudgeEl, this.launcher);
  }

  dismissNudge() {
    this.nudgeEl?.remove();
    this.nudgeEl = null;
  }

  /** Asks what the visitor is trying to do, then shows pages from the site index. */
  showGuide(hud: Hud, { auto, prefill, onAsk }: { auto: boolean; prefill: string; onAsk: (query: string) => Promise<GuideMatch[]> }) {
    const id = `pulse-guide-${uid + 1}`;
    const input = el('input', {
      class: 'guide-input',
      id,
      type: 'text',
      maxlength: '200',
      placeholder: 'Try “returns” or “size guide”',
      'aria-label': 'What are you trying to do?',
    });
    input.value = prefill;
    const results = el('div', { class: 'guide-results' });
    const send = el('button', { class: 'send mono', type: 'submit' }, 'Find');
    const form = el(
      'form',
      {},
      el('label', { class: 'label', for: id }, 'What are you trying to do?'),
      input,
      el('div', { class: 'actions' }, send),
    );
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (!query) return;
      send.disabled = true;
      results.replaceChildren(el('p', { class: 'message' }, 'Searching this site…'));
      void onAsk(query)
        .then((matches) => {
          results.replaceChildren();
          if (!matches.length) {
            results.append(el('p', { class: 'message' }, 'Nothing on this site matches that yet.'));
            return;
          }
          for (const match of matches) results.append(this.renderGuideMatch(match));
        })
        .catch(() => {
          results.replaceChildren(el('p', { class: 'message' }, 'Guide is unavailable right now.'));
        })
        .finally(() => {
          send.disabled = false;
        });
    });
    const body = el('div', {}, el('h2', { class: 'title' }, 'Where do you need to go?'), form, results);
    this.mount(hud, null, auto, body);
    input.focus();
  }

  /** True while the panel opened with `token` is still on screen (the user hasn't closed it). */
  isShowing(token: number): boolean {
    return !!this.current && this.token === token;
  }

  /** Shows the scanning state while a survey is being written. Returns a token for `isShowing`. */
  analyzing(hud: Hud, { auto }: { auto: boolean }): number {
    const body = el(
      'div',
      { role: 'status' },
      el('div', { class: 'scan', 'aria-hidden': 'true' }),
      el('div', { class: 'scan-text mono' }, 'Analyzing session trace…'),
    );
    this.mount(hud, null, auto, body);
    return this.token;
  }

  /** First step of a user-opened panel: ask why they're here instead of assuming something broke. */
  chooseIntent(hud: Hud, choices: IntentChoice[], onPick: (value: string) => void): number {
    const list = el('div', { class: 'intents', role: 'group', 'aria-label': 'What brings you here?' });
    for (const c of choices) {
      const btn = el('button', { class: 'intent', type: 'button' }, el('span', { class: 'intent-title' }, c.label), el('span', { class: 'intent-sub' }, c.hint));
      btn.addEventListener('click', () => onPick(c.value));
      list.append(btn);
    }
    this.mount(hud, null, false, el('div', {}, el('h2', { class: 'title' }, 'What brings you here?'), list));
    this.panel!.querySelector<HTMLElement>('.intent')?.focus();
    return this.token;
  }

  show(survey: Survey, { auto, hud }: { auto: boolean; hud: Hud }) {
    const body = el('div');
    const title = el('h2', { class: 'title', id: `pulse-title-${uid + 1}` }, survey.title);
    body.append(title);
    const message = survey.message ? el('p', { class: 'message' }) : null;
    if (message) body.append(message);
    this.mount(hud, survey, auto, body);
    if (message) this.typeOut(message, survey.message!);
    this.panel!.setAttribute('aria-labelledby', title.id);
    body.append(this.renderForm(survey));
    if (!auto) this.panel!.querySelector<HTMLElement>('input,textarea,button.send')?.focus();
  }

  /** `dismissed` is true when the user closed the survey without answering. */
  close(dismissed: boolean) {
    const current = this.current;
    this.clearTimers();
    this.panel?.remove();
    this.panel = null;
    this.current = null;
    this.launcher.classList.remove('alert');
    this.launcher.setAttribute('aria-expanded', 'false');
    if (dismissed && current?.survey) this.opts.onDismiss(current.survey, current.auto);
  }

  destroy() {
    this.clearTimers();
    this.dismissNudge();
    this.host.remove();
  }

  private renderGuideMatch(match: GuideMatch): HTMLElement {
    const route = el('div', { class: 'route mono', 'aria-label': 'How to get there' });
    match.steps.forEach((step, i) => {
      if (i) route.append(el('span', { class: 'sep', 'aria-hidden': 'true' }, '›'));
      route.append(el('span', { class: i === match.steps.length - 1 ? 'chip here' : 'chip' }, step.label));
    });
    const go = el('a', { class: 'send mono guide-go', href: match.url }, 'Go there');
    return el(
      'div',
      { class: 'guide-hit' },
      el('div', { class: 'guide-title' }, match.title),
      el('p', { class: 'message' }, match.reason),
      ...(match.steps.length ? [route] : []),
      go,
    );
  }

  private mount(hud: Hud, survey: Survey | null, auto: boolean, body: HTMLElement) {
    this.clearTimers();
    this.dismissNudge();
    this.panel?.remove();
    uid++;
    this.token++;
    this.current = { survey, auto, answers: {} };

    const alert = hud.label === 'Anomaly detected';
    const close = el('button', { class: 'close', type: 'button', 'aria-label': 'Close' }, '×');
    close.addEventListener('click', () => this.close(true));

    const route = el('div', { class: 'route mono', 'aria-label': 'Your route' });
    hud.route.forEach((name, i) => {
      if (i) route.append(el('span', { class: 'sep', 'aria-hidden': 'true' }, '›'));
      route.append(el('span', { class: i === hud.route.length - 1 ? 'chip here' : 'chip' }, name));
    });

    this.panel = el(
      'div',
      { class: 'panel', role: 'dialog', 'aria-modal': 'false', 'aria-label': hud.label },
      el('div', { class: `status mono${alert ? ' alert' : ''}` }, el('span', { class: 'dot', 'aria-hidden': 'true' }), hud.label, close),
      el('div', { class: 'detail mono' }, hud.detail),
      ...(hud.route.length ? [route] : []),
      el('div', { class: 'meta mono' }, hud.meta),
      el('div', { class: 'divider', 'aria-hidden': 'true' }),
      body,
    );
    this.panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close(true);
        this.launcher.focus();
      }
    });
    this.wrap.insertBefore(this.panel, this.launcher);
    this.launcher.setAttribute('aria-expanded', 'true');
    this.launcher.classList.toggle('alert', alert && auto);
  }

  private typeOut(node: HTMLElement, text: string) {
    if (reducedMotion()) {
      node.textContent = text;
      return;
    }
    node.classList.add('typing');
    node.setAttribute('aria-label', text);
    let i = 0;
    const step = () => {
      i = Math.min(text.length, i + 2);
      node.textContent = text.slice(0, i);
      if (i < text.length) this.timers.push(setTimeout(step, 16));
      else node.classList.remove('typing');
    };
    step();
  }

  private clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  private renderForm(survey: Survey): HTMLFormElement {
    const send = el('button', { class: 'send mono', type: 'submit', disabled: '' }, 'Transmit');
    const fields = survey.questions.map((q) => this.renderQuestion(q));
    const form = el('form', { novalidate: '' }, ...fields.map((f) => f.node), el('div', { class: 'actions' }, send));

    const refresh = () => {
      const answers = this.current?.answers ?? {};
      fields.forEach((f) => (f.node.hidden = !isVisible(f.question, answers)));
      send.disabled = !isComplete(survey, answers);
    };
    form.addEventListener('input', refresh);
    form.addEventListener('change', refresh);
    refresh();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!this.current || !isComplete(survey, this.current.answers)) return;
      const { answers, auto } = this.current;
      this.opts.onSubmit(survey, answers, auto);
      form.replaceWith(el('p', { class: 'thanks', role: 'status' }, 'Thanks! This goes straight to the team working on this page.'));
      this.timers.push(setTimeout(() => this.close(false), 2800));
    });
    return form;
  }

  private renderQuestion(q: Question): { question: Question; node: HTMLFieldSetElement } {
    const name = `pulse-${uid}-${q.id}`;
    const setAnswer = (value: string) => {
      if (this.current) this.current.answers[q.id] = value;
    };

    if (q.type === 'choice') {
      const opts = el('div', { class: 'opts', role: 'radiogroup' });
      for (const o of q.options ?? []) {
        const input = el('input', { type: 'radio', name, value: o.value });
        input.addEventListener('change', () => setAnswer(o.value));
        opts.append(el('label', { class: 'opt' }, input, el('span', {}, o.label)));
      }
      return { question: q, node: el('fieldset', {}, el('legend', {}, q.prompt), opts) };
    }

    const id = `${name}-text`;
    const textarea = el('textarea', { id, maxlength: '2000', rows: '3' });
    textarea.addEventListener('input', () => setAnswer(textarea.value));
    const label = el('label', { class: 'label', for: id }, q.prompt);
    if (!q.required) label.append(el('span', { class: 'sr' }, ' (optional)'));
    return { question: q, node: el('fieldset', {}, label, textarea) };
  }
}
