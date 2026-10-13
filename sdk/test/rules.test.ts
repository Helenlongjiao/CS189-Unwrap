import { describe, expect, it } from 'vitest';
import {
  buildSurvey,
  finalAnswers,
  interpolate,
  isComplete,
  selectTemplate,
  visibleQuestions,
  type SurveyTemplate,
} from '../src/surveys/rules';
import type { Trigger } from '../src/types';

function trigger(overrides: Partial<Trigger> = {}): Trigger {
  return {
    id: 't1',
    type: 'dead_click',
    at: 0,
    url: 'https://shop.test/checkout/payment',
    title: 'Payment',
    element: { selector: '#submit', tag: 'button', label: 'Submit' },
    context: { reason: 'no_response' },
    trail: [],
    eligible: true,
    recordOnly: false,
    ...overrides,
  };
}

const q = (id: string) => ({ id, type: 'text' as const, prompt: id });

const templates: SurveyTemplate[] = [
  { id: 'default', slug: 'dead-default', triggerType: 'dead_click', title: 'Default', questions: [q('a')] },
  { id: 'disabled', slug: 'dead-disabled', triggerType: 'dead_click', title: 'Disabled', priority: 10, conditions: { context: { reason: ['disabled'] } }, questions: [q('a')] },
  { id: 'checkout', slug: 'dead-checkout', triggerType: 'dead_click', title: 'Checkout', conditions: { urlPattern: '/checkout/*' }, questions: [q('a')] },
  { id: 'links', slug: 'dead-links', triggerType: 'dead_click', title: 'Links', priority: 5, conditions: { elementTags: ['a'] }, questions: [q('a')] },
  { id: 'rage', slug: 'rage', triggerType: 'rage_click', title: 'Rage', questions: [q('a')] },
];

describe('selectTemplate', () => {
  it('prefers matching templates by priority, then by specificity', () => {
    expect(selectTemplate(templates, trigger({ context: { reason: 'disabled' } }))?.id).toBe('disabled');
    expect(selectTemplate(templates, trigger())?.id).toBe('checkout');
    expect(selectTemplate(templates, trigger({ url: 'https://shop.test/home' }))?.id).toBe('default');
    expect(selectTemplate(templates, trigger({ url: 'https://shop.test/home', element: { selector: 'a', tag: 'a', label: 'x' } }))?.id).toBe('links');
  });

  it('returns null when no template exists for the trigger type', () => {
    expect(selectTemplate(templates, trigger({ type: 'form_abandon' }))).toBeNull();
  });
});

describe('interpolate', () => {
  it('fills placeholders from the trigger and falls back when a value is missing', () => {
    const t = trigger({ context: { lastField: 'Card number' } });
    expect(interpolate('Stuck on “{{context.lastField}}” in {{page.title}} ({{page.path}})?', t)).toBe(
      'Stuck on “Card number” in Payment (/checkout/payment)?',
    );
    expect(interpolate('Is {{element.label}} broken?', t)).toBe('Is Submit broken?');
    expect(interpolate('About {{context.missing|this field}}', t)).toBe('About this field');
    expect(interpolate('About {{context.missing}}', t)).toBe('About ');
  });
});

describe('conditional questions', () => {
  const template: SurveyTemplate = {
    id: 'tpl',
    slug: 'manual',
    triggerType: 'manual',
    title: 'Help on {{page.title}}',
    questions: [
      { id: 'kind', type: 'choice', prompt: 'What?', required: true, options: [{ value: 'lost', label: 'Lost' }, { value: 'broken', label: 'Broken' }] },
      { id: 'looking_for', type: 'text', prompt: 'Looking for?', required: true, showIf: { question: 'kind', in: ['lost'] } },
      { id: 'details', type: 'text', prompt: 'Details', showIf: { question: 'kind', notIn: ['lost'] } },
      { id: 'extra', type: 'text', prompt: 'Never shown: templates are capped at 3 questions' },
    ],
  };
  const survey = buildSurvey(template, trigger({ type: 'manual' }));

  it('caps questions at 3 and personalizes the title', () => {
    expect(survey.questions).toHaveLength(3);
    expect(survey.title).toBe('Help on Payment');
  });

  it('shows follow-ups based on earlier answers', () => {
    expect(visibleQuestions(survey, {}).map((x) => x.id)).toEqual(['kind']);
    expect(visibleQuestions(survey, { kind: 'lost' }).map((x) => x.id)).toEqual(['kind', 'looking_for']);
    expect(visibleQuestions(survey, { kind: 'broken' }).map((x) => x.id)).toEqual(['kind', 'details']);
  });

  it('requires visible required questions and drops answers to hidden ones', () => {
    expect(isComplete(survey, { kind: 'lost' })).toBe(false);
    expect(isComplete(survey, { kind: 'lost', looking_for: 'refund policy' })).toBe(true);
    expect(isComplete(survey, { kind: 'broken' })).toBe(true);
    expect(finalAnswers(survey, { kind: 'broken', looking_for: 'stale', details: ' it crashed ' })).toEqual({ kind: 'broken', details: 'it crashed' });
  });
});
