import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPulse, type PulseInstance } from '../src/pulse';
import type { SurveyTemplate } from '../src/surveys/rules';
import { click } from './harness';

const TEMPLATES: SurveyTemplate[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    slug: 'rage-click-default',
    triggerType: 'rage_click',
    title: 'Is “{{element.label}}” giving you trouble?',
    questions: [
      { id: 'outcome', type: 'choice', prompt: 'What happened?', required: true, options: [{ value: 'nothing', label: 'Nothing happened' }, { value: 'slow', label: 'Too slow' }] },
      { id: 'details', type: 'text', prompt: 'Anything else?', showIf: { question: 'outcome', in: ['nothing'] } },
    ],
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    slug: 'manual-default',
    triggerType: 'manual',
    title: 'How can we help?',
    questions: [{ id: 'details', type: 'text', prompt: 'Tell us what you’re trying to do', required: true }],
  },
];

describe('survey widget', () => {
  let pulse: PulseInstance;
  const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
    if (url.includes('/v1/surveys')) return new Response(JSON.stringify({ templates: TEMPLATES }), { status: 200 });
    return new Response('{}', { status: url.includes('/v1/responses') ? 201 : 202 });
  });

  const root = () => document.querySelector('[data-pulse-root]')!.shadowRoot!;
  const panel = () => root().querySelector('.panel');
  const posts = (path: string) =>
    fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith(path))
      .map(([, init]) => JSON.parse((init as unknown as RequestInit).body as string));

  const rageClick = (el: Element) => {
    for (let i = 0; i < 3; i++) click(el, 50, 50);
  };

  beforeEach(async () => {
    sessionStorage.clear();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    document.body.innerHTML = '<button id="pay">Pay now</button>';
    pulse = createPulse({ siteKey: 'pk_test', endpoint: 'http://api.test' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('http://api.test/v1/surveys?siteKey=pk_test', undefined));
    await new Promise((r) => setTimeout(r, 0));
  });

  afterEach(() => {
    pulse.destroy();
    vi.unstubAllGlobals();
  });

  it('mounts a small launcher in a shadow root, isolated from the page', () => {
    expect(root().querySelector('button.launcher')?.getAttribute('aria-label')).toBe('Get help or share feedback');
    expect(document.querySelector('.launcher')).toBeNull();
    expect(panel()).toBeNull();
  });

  it('auto-opens a personalized survey on friction and saves the answers with the trigger id', async () => {
    rageClick(document.getElementById('pay')!);
    expect(panel()?.querySelector('.title')?.textContent).toBe('Is “Pay now” giving you trouble?');

    const friction = posts('/v1/events').flatMap((b) => b.events).find((e: { kind: string; type: string }) => e.kind === 'friction' && e.type === 'rage_click');
    expect(friction).toMatchObject({ type: 'rage_click' });

    const details = () => panel()!.querySelectorAll('fieldset')[1] as HTMLFieldSetElement;
    const send = () => panel()!.querySelector<HTMLButtonElement>('button.send')!;
    expect(details().hidden).toBe(true);
    expect(send().disabled).toBe(true);

    const radio = panel()!.querySelector<HTMLInputElement>('input[value="nothing"]')!;
    radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
    expect(details().hidden).toBe(false);
    expect(send().disabled).toBe(false);

    const textarea = details().querySelector('textarea')!;
    textarea.value = 'Button never responds';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    panel()!.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));

    expect(panel()?.querySelector('.thanks')).not.toBeNull();
    expect(posts('/v1/responses')[0]).toMatchObject({
      siteKey: 'pk_test',
      triggerId: friction.id,
      templateId: TEMPLATES[0].id,
      triggerType: 'rage_click',
      status: 'submitted',
      autoOpened: true,
      answers: { outcome: 'nothing', details: 'Button never responds' },
    });
  });

  it('records a dismissal and does not reopen during the cooldown', () => {
    const pay = document.getElementById('pay')!;
    rageClick(pay);
    root().querySelector<HTMLButtonElement>('.close')!.click();
    expect(panel()).toBeNull();
    expect(posts('/v1/responses')[0]).toMatchObject({ status: 'dismissed', answers: {} });

    vi.useFakeTimers();
    vi.advanceTimersByTime(2000);
    rageClick(pay);
    expect(panel()).toBeNull();
    vi.useRealTimers();
  });

  it('asks a user who opens the launcher why they are here before showing a survey', async () => {
    root().querySelector<HTMLButtonElement>('.launcher')!.click();
    expect(panel()?.querySelector('.title')?.textContent).toBe('What brings you here?');
    const intents = Array.from(panel()!.querySelectorAll('.intent-title')).map((n) => n.textContent);
    expect(intents).toEqual(['I’m lost', 'Something went wrong', 'I have a question']);
    expect(posts('/v1/events')).toHaveLength(0);

    panel()!.querySelectorAll<HTMLButtonElement>('.intent')[0].click();
    await vi.waitFor(() => expect(panel()?.querySelector('.title')?.textContent).toBe('Where do you need to go?'));
    const lost = posts('/v1/events').flatMap((b) => b.events).find((e: { type: string }) => e.type === 'manual');
    expect(lost.context).toMatchObject({ source: 'launcher', intent: 'lost' });

    root().querySelector<HTMLButtonElement>('.close')!.click();
    root().querySelector<HTMLButtonElement>('.launcher')!.click();
    panel()!.querySelectorAll<HTMLButtonElement>('.intent')[1].click();
    await vi.waitFor(() => expect(panel()?.querySelector('.title')?.textContent).toBe('How can we help?'));
    const issue = posts('/v1/events').flatMap((b) => b.events).filter((e: { type: string }) => e.type === 'manual');
    expect(issue[1].context).toMatchObject({ source: 'launcher', intent: 'issue' });
  });

  it('shows only the route since the panel last opened, ending at the clicked control', async () => {
    pulse.destroy();
    const now = Date.now();
    const view = (title: string, path: string, ago: number) => ({ type: 'page_view', at: now - ago, url: `http://localhost${path}`, data: { title } });
    sessionStorage.setItem(
      'pulse_trail',
      JSON.stringify([view('Skyline Air · Home', '/', 600_000), view('Skyline Air · Flights', '/flights', 540_000), view('Skyline Air · Checkout', '/checkout', 480_000)]),
    );
    sessionStorage.setItem('pulse_opened_at', String(now - 5_000));
    document.title = 'Skyline Air · Checkout';
    document.body.innerHTML =
      '<form><h2>Passenger details</h2><input id="name" />' +
      '<div class="row"><div><label for="promo">Promo code</label><input id="promo" /></div><button type="button" id="apply">Apply</button></div></form>';
    fetchMock.mockClear();
    pulse = createPulse({ siteKey: 'pk_test', endpoint: 'http://api.test' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));

    rageClick(document.getElementById('apply')!);
    const chips = Array.from(panel()!.querySelectorAll('.chip')).map((n) => n.textContent);
    expect(chips).toEqual(['Checkout', 'Passenger details', 'Promo code', 'Apply']);
  });

  it('does not count clicks inside the widget as friction on the page', async () => {
    const launcher = root().querySelector<HTMLButtonElement>('.launcher')!;
    for (let i = 0; i < 4; i++) launcher.click();
    await new Promise((r) => setTimeout(r, 0));
    const events = posts('/v1/events').flatMap((b) => b.events);
    expect(events.filter((e: { type: string }) => e.type === 'rage_click')).toHaveLength(0);
  });
});
