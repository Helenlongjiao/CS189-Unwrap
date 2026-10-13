import { vi } from 'vitest';
import { Breadcrumbs } from '../src/breadcrumbs';
import { resolveConfig, type PulseOptions } from '../src/config';
import type { Detector, DetectorContext } from '../src/detectors/context';
import { onTap, type Tap } from '../src/taps';
import type { Transport } from '../src/transport';
import { TriggerEngine } from '../src/triggers';
import type { Trigger } from '../src/types';

export const ENDPOINT = 'http://api.test';

export function setup(detector: Detector, overrides: Partial<PulseOptions> = {}) {
  const config = resolveConfig({ siteKey: 'pk_test', endpoint: ENDPOINT, ...overrides });
  const sent: Record<string, unknown>[] = [];
  const transport = {
    send: (e: Record<string, unknown>) => sent.push(e),
    flush: vi.fn(),
    isOwnRequest: (url: string) => url.startsWith(ENDPOINT),
  } as unknown as Transport;
  const breadcrumbs = new Breadcrumbs(config.trailSize);
  const engine = new TriggerEngine(config, transport, breadcrumbs);
  const triggers: Trigger[] = [];
  engine.onTrigger((t) => triggers.push(t));

  let latest: Tap | undefined;
  const offLatest = onTap((t) => (latest = t));
  const ctx: DetectorContext = { config, engine, breadcrumbs, transport, onTap, lastTap: () => latest };
  const teardown = detector(ctx);

  return {
    config,
    engine,
    breadcrumbs,
    sent,
    triggers,
    cleanup() {
      teardown();
      offLatest();
    },
  };
}

export function click(el: Element, x = 10, y = 10) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: x, clientY: y }));
}

export function pointerdown(el: Element, x = 10, y = 10) {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y }));
}

export function type(input: HTMLInputElement, value: string) {
  input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
