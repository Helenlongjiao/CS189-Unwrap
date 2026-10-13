import type { Transport } from '../transport';
import type { TriggerEngine } from '../triggers';
import type { PulseConfig, Trigger } from '../types';
import { safeUrl } from '../util';
import { Widget } from '../widget/widget';
import { buildSurvey, finalAnswers, selectTemplate, type Answers, type Survey, type SurveyTemplate } from './rules';

export interface SurveyController {
  /** Opens the user-initiated "How can we help?" survey. */
  open(): Promise<void>;
  destroy(): void;
}

/**
 * Connects detection to the widget: loads templates once, opens the best-matching survey when an
 * eligible trigger fires, and posts answers (or dismissals) linked to the trigger that caused them.
 */
export function mountSurveys(config: PulseConfig, engine: TriggerEngine, transport: Transport): SurveyController {
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

  const present = (trigger: Trigger, auto: boolean): boolean => {
    const template = selectTemplate(templates, trigger);
    if (!template) return false;
    // Send the friction event (and its trail) now, so it is stored before any answer arrives.
    transport.flush();
    widget.show(buildSurvey(template, trigger), { auto });
    return true;
  };

  const offTrigger = engine.onTrigger((trigger) => {
    if (!config.autoOpen || !trigger.eligible || trigger.type === 'manual' || widget.isOpen()) return;
    if (present(trigger, true)) engine.notePrompted(trigger.type);
  });

  const open = async () => {
    await loaded;
    const trigger = engine.fire('manual', { context: { source: 'launcher' } });
    if (!present(trigger, false) && config.debug) console.warn('[pulse] no survey template for manual feedback');
  };

  return {
    open,
    destroy() {
      offTrigger();
      widget.destroy();
    },
  };
}
