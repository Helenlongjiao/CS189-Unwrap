import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from '../src/breadcrumbs';
import { createPulse, type PulseInstance } from '../src/pulse';
import { click } from './harness';

const TEMPLATE = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'rage-click-default',
  triggerType: 'rage_click',
  title: 'Template title',
  questions: [{ id: 'q', type: 'text', prompt: 'Template question' }],
};

const GENERATED = {
  id: '33333333-3333-4333-8333-333333333333',
  headline: 'The Pay button stopped responding',
  message: 'Sorry about that. Your answer helps us fix it.',
  questions: [{ id: 'q1', type: 'choice', prompt: 'Were you paying for the Tokyo flight?', required: true, options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] }],
};

describe('AI-written surveys', () => {
  let pulse: PulseInstance;
  let generateOk = true;
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes('/v1/surveys/generate')) {
      return generateOk ? new Response(JSON.stringify(GENERATED), { status: 201 }) : new Response('{}', { status: 502 });
    }
    if (url.includes('/v1/surveys')) return new Response(JSON.stringify({ templates: [TEMPLATE] }), { status: 200 });
    return new Response('{}', { status: 201 });
  });
  const root = () => document.querySelector('[data-pulse-root]')!.shadowRoot!;
  const body = (path: string) =>
    fetchMock.mock.calls.filter(([u]) => String(u).endsWith(path)).map(([, init]) => JSON.parse(init!.body as string));

  beforeEach(async () => {
    sessionStorage.clear();
    fetchMock.mockClear();
    generateOk = true;
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    document.body.innerHTML = '<button id="pay">Pay now</button>';
    pulse = createPulse({ siteKey: 'pk_test', endpoint: 'http://api.test', ai: true });
    await new Promise((r) => setTimeout(r, 0));
  });

  afterEach(() => {
    pulse.destroy();
    vi.unstubAllGlobals();
  });

  const rage = () => {
    for (let i = 0; i < 3; i++) click(document.getElementById('pay')!, 40, 40);
  };

  it('shows the analyzing state, then the generated survey, with browser context sent to the server', async () => {
    rage();
    expect(root().querySelector('.scan')).not.toBeNull();
    expect(root().querySelector('.detail')?.textContent).toBe('Repeated clicks on “Pay now”');

    await vi.waitFor(() => expect(root().querySelector('.title')?.textContent).toBe(GENERATED.headline));
    expect(root().querySelector('.message')?.textContent).toBe(GENERATED.message);

    const [req] = body('/v1/surveys/generate');
    expect(req.trigger).toMatchObject({ type: 'rage_click', element: { label: 'Pay now' } });
    expect(req.client).toMatchObject({ timezone: expect.any(String), partOfDay: expect.any(String), browser: expect.any(String) });

    const radio = root().querySelector<HTMLInputElement>('input[value="yes"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    root().querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    expect(body('/v1/responses')[0]).toMatchObject({ generatedSurveyId: GENERATED.id, answers: { q1: 'yes' }, status: 'submitted' });
  });

  it('falls back to the stored template when generation fails', async () => {
    generateOk = false;
    rage();
    await vi.waitFor(() => expect(root().querySelector('.title')?.textContent).toBe('Template title'));
  });
});

describe('trail persistence', () => {
  beforeEach(() => sessionStorage.clear());

  it('keeps the route across page loads in the same tab', () => {
    new Breadcrumbs(5).add('click', { label: 'View seat map' });
    const next = new Breadcrumbs(5);
    expect(next.snapshot()).toHaveLength(1);
    expect(next.snapshot()[0].data.label).toBe('View seat map');
  });
});
