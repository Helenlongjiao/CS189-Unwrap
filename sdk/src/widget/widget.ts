import { HOST_ATTR } from '../dom';
import { isComplete, isVisible, type Answers, type Question, type Survey } from '../surveys/rules';
import { CSS } from './styles';

export interface WidgetOptions {
  position: 'bottom-right' | 'bottom-left';
  accentColor?: string;
  onLauncher: () => void;
  onSubmit: (survey: Survey, answers: Answers, autoOpened: boolean) => void;
  onDismiss: (survey: Survey, autoOpened: boolean) => void;
}

const ICON =
  '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

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

/**
 * Corner launcher plus survey panel, rendered in a Shadow DOM so host-page CSS can't restyle it and
 * its CSS can't leak out. Styles are attached as a constructed stylesheet where supported, which
 * also keeps the widget working on sites whose Content Security Policy forbids inline <style>.
 */
export class Widget {
  private host: HTMLElement;
  private wrap: HTMLElement;
  private launcher: HTMLButtonElement;
  private panel: HTMLElement | null = null;
  private current: { survey: Survey; auto: boolean; answers: Answers } | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;

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

    this.launcher = el('button', { class: 'launcher', type: 'button', 'aria-label': 'Get help or share feedback', 'aria-expanded': 'false' });
    this.launcher.innerHTML = ICON;
    this.launcher.addEventListener('click', () => (this.current ? this.close(true) : this.opts.onLauncher()));

    this.wrap = el('div', { class: `wrap ${opts.position === 'bottom-left' ? 'left' : 'right'}` }, this.launcher);
    root.append(this.wrap);
    (document.body ?? document.documentElement).append(this.host);
  }

  isOpen(): boolean {
    return !!this.current;
  }

  show(survey: Survey, { auto }: { auto: boolean }) {
    clearTimeout(this.closeTimer);
    this.panel?.remove();
    this.current = { survey, auto, answers: {} };
    this.panel = this.renderPanel(survey);
    this.wrap.insertBefore(this.panel, this.launcher);
    this.launcher.setAttribute('aria-expanded', 'true');
    if (auto) {
      this.launcher.classList.remove('nudge');
      void this.launcher.offsetWidth;
      this.launcher.classList.add('nudge');
    } else {
      this.panel.querySelector<HTMLElement>('input,textarea,button.send')?.focus();
    }
  }

  /** `dismissed` is true when the user closed the survey without answering. */
  close(dismissed: boolean) {
    const current = this.current;
    clearTimeout(this.closeTimer);
    this.panel?.remove();
    this.panel = null;
    this.current = null;
    this.launcher.setAttribute('aria-expanded', 'false');
    if (dismissed && current) this.opts.onDismiss(current.survey, current.auto);
  }

  destroy() {
    clearTimeout(this.closeTimer);
    this.host.remove();
  }

  private renderPanel(survey: Survey): HTMLElement {
    const titleId = `pulse-title-${++uid}`;
    const close = el('button', { class: 'close', type: 'button', 'aria-label': 'Close' }, '×');
    close.addEventListener('click', () => this.close(true));

    const send = el('button', { class: 'send', type: 'submit', disabled: '' }, 'Send');
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
      this.closeTimer = setTimeout(() => this.close(false), 2500);
    });

    const panel = el(
      'div',
      { class: 'panel', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': titleId },
      el('div', { class: 'head' }, el('h2', { class: 'title', id: titleId }, survey.title), close),
      form,
    );
    panel.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.close(true);
        this.launcher.focus();
      }
    });
    return panel;
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
