import type { Trigger, TriggerType } from '../types';

export interface QuestionOption {
  value: string;
  label: string;
}

export interface ShowIf {
  question: string;
  in?: string[];
  notIn?: string[];
}

export interface Question {
  id: string;
  type: 'choice' | 'text';
  prompt: string;
  required?: boolean;
  options?: QuestionOption[];
  showIf?: ShowIf;
}

export interface TemplateConditions {
  urlPattern?: string;
  elementTags?: string[];
  context?: Record<string, unknown[]>;
}

export interface SurveyTemplate {
  id: string;
  slug: string;
  triggerType: TriggerType;
  title: string;
  priority?: number;
  conditions?: TemplateConditions;
  questions: Question[];
}

/** A survey personalized for one trigger, ready to render: from a template or written by the model. */
export interface Survey {
  templateId?: string;
  generatedSurveyId?: string;
  triggerId: string;
  triggerType: TriggerType;
  title: string;
  message?: string;
  questions: Question[];
}

export type Answers = Record<string, string>;

const MAX_QUESTIONS = 3;

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`);
}

export function matches(conditions: TemplateConditions = {}, trigger: Trigger): boolean {
  if (conditions.urlPattern) {
    let path = '';
    try {
      path = new URL(trigger.url).pathname;
    } catch {
      return false;
    }
    if (!globToRegExp(conditions.urlPattern).test(path)) return false;
  }
  if (conditions.elementTags?.length && !conditions.elementTags.includes(trigger.element?.tag ?? '')) return false;
  for (const [key, allowed] of Object.entries(conditions.context ?? {})) {
    if (!Array.isArray(allowed) || !allowed.includes(trigger.context[key])) return false;
  }
  return true;
}

function specificity(c: TemplateConditions = {}): number {
  return (c.urlPattern ? 1 : 0) + (c.elementTags?.length ? 1 : 0) + Object.keys(c.context ?? {}).length;
}

/** Highest-priority template whose conditions all match; ties go to the more specific template. */
export function selectTemplate(templates: SurveyTemplate[], trigger: Trigger): SurveyTemplate | null {
  const candidates = templates.filter((t) => t.triggerType === trigger.type && matches(t.conditions, trigger));
  candidates.sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || specificity(b.conditions) - specificity(a.conditions),
  );
  return candidates[0] ?? null;
}

/** Replaces `{{path}}` / `{{path|fallback}}` with values from the trigger. Output is plain text, never HTML. */
export function interpolate(text: string, trigger: Trigger): string {
  let path = '';
  try {
    path = new URL(trigger.url).pathname;
  } catch {
    /* keep empty */
  }
  const scope: Record<string, unknown> = {
    element: trigger.element ?? {},
    context: trigger.context,
    page: { title: trigger.title, path },
  };
  return text.replace(/\{\{\s*([\w.]+)\s*(?:\|([^}]*))?\}\}/g, (_m, key: string, fallback?: string) => {
    const value = key.split('.').reduce<unknown>((acc, part) => (acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[part] : undefined), scope);
    if (value === undefined || value === null || value === '') return (fallback ?? '').trim();
    return String(value);
  });
}

export function buildSurvey(template: SurveyTemplate, trigger: Trigger): Survey {
  return {
    templateId: template.id,
    triggerId: trigger.id,
    triggerType: trigger.type,
    title: interpolate(template.title, trigger),
    questions: template.questions.slice(0, MAX_QUESTIONS).map((q) => ({
      ...q,
      prompt: interpolate(q.prompt, trigger),
      options: q.options?.map((o) => ({ ...o, label: interpolate(o.label, trigger) })),
    })),
  };
}

export function isVisible(question: Question, answers: Answers): boolean {
  const rule = question.showIf;
  if (!rule) return true;
  const answer = answers[rule.question];
  if (answer === undefined) return false;
  if (rule.in && !rule.in.includes(answer)) return false;
  if (rule.notIn && rule.notIn.includes(answer)) return false;
  return true;
}

export function visibleQuestions(survey: Survey, answers: Answers): Question[] {
  return survey.questions.filter((q) => isVisible(q, answers));
}

/** Answers for visible questions only, so stale answers to hidden follow-ups are never sent. */
export function finalAnswers(survey: Survey, answers: Answers): Answers {
  const out: Answers = {};
  for (const q of visibleQuestions(survey, answers)) {
    const value = answers[q.id]?.trim();
    if (value) out[q.id] = value;
  }
  return out;
}

export function isComplete(survey: Survey, answers: Answers): boolean {
  return visibleQuestions(survey, answers).every((q) => !q.required || !!answers[q.id]?.trim());
}
