import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from '../src/breadcrumbs';
import { resolveConfig } from '../src/config';
import { createPulse, type PulseInstance } from '../src/pulse';
import type { Transport } from '../src/transport';
import { TriggerEngine } from '../src/triggers';
import { click } from './harness';

describe('trigger engine prompt budget', () => {
  beforeEach(() => sessionStorage.clear());

  const make = () =>
    new TriggerEngine(
      resolveConfig({ siteKey: 'pk', endpoint: 'http://x', cooldownMs: 60_000, maxPromptsPerSession: 2 }),
      { send: () => {} } as unknown as Transport,
      new Breadcrumbs(10),
    );

  it('enforces a cooldown after a prompt and a per-session cap', () => {
    vi.useFakeTimers();
    const engine = make();
    expect(engine.fire('rage_click').eligible).toBe(true);
    engine.notePrompted('rage_click');
    expect(engine.fire('dead_click').eligible).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(engine.fire('dead_click').eligible).toBe(true);
    engine.notePrompted('dead_click');

    vi.advanceTimersByTime(10 * 60_000);
    expect(engine.fire('error').eligible).toBe(false);
    expect(engine.fire('manual').eligible).toBe(true);
    vi.useRealTimers();
  });

  it('lets every trigger prompt when limits are off', () => {
    const engine = new TriggerEngine(
      resolveConfig({ siteKey: 'pk', endpoint: 'http://x', limits: false, maxPromptsPerSession: 1 }),
      { send: () => {} } as unknown as Transport,
      new Breadcrumbs(10),
    );
    for (let i = 0; i < 3; i++) {
      expect(engine.fire('rage_click').eligible).toBe(true);
      engine.notePrompted('rage_click');
    }
  });

  it('keeps the budget across page loads in the same tab', () => {
    make().notePrompted('rage_click');
    expect(make().fire('rage_click').eligible).toBe(false);
  });
});

describe('createPulse', () => {
  let pulse: PulseInstance;
  const fetchMock = vi.fn(async () => new Response('{}', { status: 202 }));

  beforeEach(() => {
    sessionStorage.clear();
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    document.title = 'Checkout';
    document.body.innerHTML = '<a id="help" href="#help">Help center</a>';
  });

  afterEach(() => {
    pulse?.destroy();
    vi.unstubAllGlobals();
  });

  it('records the user path and ships it to the ingestion endpoint', () => {
    pulse = createPulse({ siteKey: 'pk_test', endpoint: 'http://api.test/', widget: false });
    click(document.getElementById('help')!);
    pulse.flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/v1/events');
    const body = JSON.parse(init.body as string);
    expect(body).toMatchObject({ siteKey: 'pk_test', sessionId: pulse.sessionId });
    const interactions = body.events.filter((e: { kind: string }) => e.kind === 'interaction');
    expect(interactions.map((e: { type: string }) => e.type)).toEqual(['page_view', 'click']);
    expect(interactions[1].data).toMatchObject({ label: 'Help center', tag: 'a', selector: '#help' });
  });

  it('keeps the same session id within a tab', () => {
    pulse = createPulse({ siteKey: 'pk_test', endpoint: 'http://api.test', widget: false });
    const id = pulse.sessionId;
    pulse.destroy();
    pulse = createPulse({ siteKey: 'pk_test', endpoint: 'http://api.test', widget: false });
    expect(pulse.sessionId).toBe(id);
  });
});
