import type { Breadcrumbs } from '../breadcrumbs';
import { clientContext, type ClientContext } from '../client';
import type { Transport } from '../transport';
import type { TriggerEngine } from '../triggers';
import type { Breadcrumb, PulseConfig, Trigger } from '../types';
import { safeUrl } from '../util';
import { Widget, type GuideMatch, type Hud } from '../widget/widget';
import { buildSurvey, finalAnswers, selectTemplate, type Answers, type Question, type Survey, type SurveyTemplate } from './rules';

export interface SurveyController {
  /** Opens the user-initiated "How can we help?" survey. */
  open(): Promise<void>;
  destroy(): void;
}

interface GeneratedSurvey {
  id: string;
  headline: string;
  message: string;
  questions: Question[];
}

function pathOf(url: unknown): string {
  try {
    return new URL(String(url)).pathname;
  } catch {
    return '';
  }
}

/** One-line plain-English summary of what the SDK caught, for the panel header. */
function describeTrigger(t: Trigger): string {
  const label = t.element?.label ? `“${t.element.label}”` : '';
  const c = t.context;
  switch (t.type) {
    case 'rage_click':
      return `Repeated clicks on ${label || 'an element'}`;
    case 'dead_click':
      return c.reason === 'disabled' ? `${label || 'Control'} is disabled` : `${label || 'Element'} didn't respond`;
    case 'form_abandon':
      return `Form stalled${c.lastField ? ` at “${c.lastField}”` : ''}`;
    case 'manual':
      return INTENTS.find((i) => i.value === c.intent)?.detail ?? 'How can I help?';
    case 'error':
      if (c.kind === 'page') return `${c.status === 404 ? 'Page not found' : `Page error ${c.status}`} · ${pathOf(t.url)}`;
      if (c.kind === 'network') return `Request failed · ${c.method} ${pathOf(c.url)} (${c.status || 'no response'})`;
      return `Script error${label ? ` after ${label}` : ''}`;
    case 'lost':
      return c.tier === 'nudge' ? 'Need help getting somewhere?' : 'You look turned around';
  }
}

const INTENTS = [
  { value: 'lost', label: 'I’m lost', hint: 'Help me find a page or feature', detail: 'Finding your way' },
  { value: 'issue', label: 'Something went wrong', hint: 'I ran into a problem on this page', detail: 'Reporting an issue' },
  { value: 'question', label: 'I have a question', hint: 'General question or feedback', detail: 'General question' },
];

const OPENED_KEY = 'pulse_opened_at';

/** Records that the panel is opening now and returns when it last opened (0 if never this tab). */
function markOpened(): number {
  try {
    const last = Number(sessionStorage.getItem(OPENED_KEY)) || 0;
    sessionStorage.setItem(OPENED_KEY, String(Date.now()));
    return last;
  } catch {
    return 0;
  }
}

/**
 * Page names since the panel last opened, starting from the page the user was on then, minus a
 * segment every title shares ("Skyline Air · Home" → "Home").
 */
function routeNames(trail: Breadcrumb[], since: number): string[] {
  const views = trail.filter((step) => step.type === 'page_view');
  const titleOf = (step: Breadcrumb) => String(step.data.title || pathOf(step.url) || 'Page');
  const split = (t: string) => t.split(/\s+[·|–—-]\s+/);
  const all = [...new Set(views.map(titleOf))];
  const shared = all.length > 1 ? split(all[0]).filter((seg) => all.every((t) => split(t).includes(seg))) : [];
  let start = 0;
  views.forEach((step, i) => {
    if (since && step.at <= since) start = i;
  });
  const names: string[] = [];
  for (const step of views.slice(start)) {
    const t = titleOf(step);
    const name = split(t).filter((seg) => !shared.includes(seg)).join(' · ') || t;
    if (names[names.length - 1] !== name) names.push(name);
  }
  return names;
}

/** `trigger` is null for the intent picker, before anything has been recorded. */
function hudFor(trigger: Trigger | null, trail: Breadcrumb[], client: ClientContext, since: number): Hud {
  const el = trigger?.element;
  const target = el ? [el.area, el.field, el.label].filter((s, i, a): s is string => !!s && a.indexOf(s) === i) : [];
  const pages = routeNames(trail, since);
  return {
    label: trigger?.type === 'lost' ? 'Guidance' : !trigger || trigger.type === 'manual' ? 'Assist mode' : 'Anomaly detected',
    detail: trigger ? describeTrigger(trigger) : 'How can I help?',
    route: [...pages.slice(-Math.max(1, 5 - target.length)), ...target],
    meta: `${client.weekday} ${client.localTime} · ${client.region} · ${client.browser} on ${client.os}`,
  };
}

/**
 * Connects detection to the widget: opens a survey when an eligible trigger fires (or the user asks),
 * gets the questions from the language model when enabled, falls back to the stored templates, and
 * posts answers (or dismissals) linked to the trigger that caused them.
 */
export function mountSurveys(config: PulseConfig, engine: TriggerEngine, transport: Transport, breadcrumbs: Breadcrumbs): SurveyController {
  let templates: SurveyTemplate[] = [];
  const loaded = transport
    .request<{ templates: SurveyTemplate[] }>(`/v1/surveys?siteKey=${encodeURIComponent(config.siteKey)}`)
    .then((res) => {
      templates = res.templates;
    })
    .catch((err) => {
      if (config.debug) console.warn('[pulse] could not load survey templates', err);
    });

  const respond = (survey: Survey, status: 'submitted' | 'dismissed', answers: Answers, autoOpened: boolean) => {
    transport
      .post('/v1/responses', {
        triggerId: survey.triggerId,
        templateId: survey.templateId,
        generatedSurveyId: survey.generatedSurveyId,
        triggerType: survey.triggerType,
        status,
        answers: status === 'submitted' ? finalAnswers(survey, answers) : {},
        autoOpened,
        url: safeUrl(),
      })
      .catch((err) => {
        if (config.debug) console.warn('[pulse] could not save response', err);
      });
  };

  const widget = new Widget({
    position: config.position,
    accentColor: config.accentColor,
    onLauncher: () => void open(),
    onSubmit: (survey, answers, auto) => respond(survey, 'submitted', answers, auto),
    onDismiss: (survey, auto) => respond(survey, 'dismissed', {}, auto),
  });

  const fromTemplate = (trigger: Trigger): Survey | null => {
    const template = selectTemplate(templates, trigger);
    return template ? buildSurvey(template, trigger) : null;
  };

  const generate = async (trigger: Trigger, client: ClientContext): Promise<Survey | null> => {
    try {
      const res = (await transport.post('/v1/surveys/generate', { trigger, client })) as GeneratedSurvey;
      return {
        generatedSurveyId: res.id,
        triggerId: trigger.id,
        triggerType: trigger.type,
        title: res.headline,
        message: res.message,
        questions: res.questions,
      };
    } catch (err) {
      if (config.debug) console.warn('[pulse] AI survey unavailable, using template', err);
      return null;
    }
  };

  const openGuide = (trigger: Trigger, auto: boolean, since = markOpened()) => {
    transport.flush();
    const hud = hudFor(trigger, trigger.trail.length ? trigger.trail : breadcrumbs.snapshot(), clientContext(), since);
    const prefill = typeof trigger.context.query === 'string' ? trigger.context.query : '';
    widget.showGuide(hud, {
      auto,
      prefill,
      onAsk: async (query) => {
        const res = (await transport.post('/v1/guide', { query, url: safeUrl() })) as { matches?: GuideMatch[] };
        return res.matches ?? [];
      },
    });
  };

  /** Resolves to true if a survey (or the analyzing state leading to one) was shown. */
  const present = async (trigger: Trigger, auto: boolean, since = markOpened()): Promise<boolean> => {
    // Send the friction event (and its trail) now, so it is stored before any answer arrives.
    transport.flush();
    const client = clientContext();
    const hud = hudFor(trigger, trigger.trail, client, since);

    if (!config.ai) {
      const survey = fromTemplate(trigger);
      if (survey) widget.show(survey, { auto, hud });
      return !!survey;
    }

    const token = widget.analyzing(hud, { auto });
    const survey = (await generate(trigger, client)) ?? (await loaded, fromTemplate(trigger));
    if (!widget.isShowing(token)) return true;
    if (survey) widget.show(survey, { auto, hud });
    else widget.close(false);
    return true;
  };

  const offTrigger = engine.onTrigger((trigger) => {
    if (!config.autoOpen || !trigger.eligible || trigger.type === 'manual') return;
    if (trigger.type === 'lost') {
      if (trigger.context.tier === 'full') {
        if (widget.isOpen()) return;
        engine.notePrompted('lost');
        openGuide(trigger, true);
      } else if (trigger.context.tier === 'nudge' && !widget.isOpen() && !widget.isNudging()) {
        widget.nudge(() => {
          engine.notePrompted('lost');
          openGuide(trigger, true);
        });
      }
      return;
    }
    if (widget.isOpen()) return;
    if (!config.ai && !selectTemplate(templates, trigger)) return;
    engine.notePrompted(trigger.type);
    void present(trigger, true);
  });

  const open = async () => {
    const since = markOpened();
    const hud = hudFor(null, breadcrumbs.snapshot(), clientContext(), since);
    widget.chooseIntent(hud, INTENTS, async (intent) => {
      if (!config.ai) await loaded;
      const trigger = engine.fire('manual', { context: { source: 'launcher', intent } });
      if (intent === 'lost') {
        openGuide(trigger, false, since);
        return;
      }
      if (!(await present(trigger, false, since)) && config.debug) console.warn('[pulse] no survey template for manual feedback');
    });
  };

  return {
    open,
    destroy() {
      offTrigger();
      widget.destroy();
    },
  };
}
