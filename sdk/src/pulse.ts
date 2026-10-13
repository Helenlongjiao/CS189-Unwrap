import { Breadcrumbs } from './breadcrumbs';
import { resolveConfig, type PulseOptions } from './config';
import type { Detector, DetectorContext } from './detectors/context';
import { deadClickDetector } from './detectors/deadClick';
import { errorDetector } from './detectors/errors';
import { formAbandonDetector } from './detectors/formAbandon';
import { rageClickDetector } from './detectors/rageClick';
import { describe, findInteractive } from './dom';
import { onNavigate } from './navigation';
import { onTap, type Tap } from './taps';
import { Transport } from './transport';
import { TriggerEngine } from './triggers';
import type { PulseConfig, Trigger } from './types';
import { getSessionId, safeUrl } from './util';

const DETECTORS: Detector[] = [rageClickDetector, deadClickDetector, errorDetector, formAbandonDetector];

export interface PulseInstance {
  config: PulseConfig;
  sessionId: string;
  onTrigger(cb: (t: Trigger) => void): () => void;
  flush(): void;
  destroy(): void;
}

export function createPulse(opts: PulseOptions): PulseInstance {
  const config = resolveConfig(opts);
  const sessionId = getSessionId();
  const breadcrumbs = new Breadcrumbs(config.trailSize);
  const transport = new Transport(config.endpoint, config.siteKey, sessionId, () => ({
    userAgent: navigator.userAgent,
    language: navigator.language,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    referrer: document.referrer ? safeUrl(document.referrer) : undefined,
  }));
  const engine = new TriggerEngine(config, transport, breadcrumbs);

  let latestTap: Tap | undefined;
  const teardown: Array<() => void> = [];

  teardown.push(
    onTap((tap) => {
      latestTap = tap;
      const target = findInteractive(tap.target) ?? tap.target;
      breadcrumbs.add('click', { ...describe(target), x: Math.round(tap.x), y: Math.round(tap.y), disabled: tap.disabled });
    }),
  );

  if (config.captureInteractions) {
    teardown.push(breadcrumbs.onAdd((crumb) => transport.send({ kind: 'interaction', ...crumb })));
  }

  breadcrumbs.add('page_view', { title: document.title });
  let lastUrl = safeUrl();
  teardown.push(
    onNavigate(() => {
      const url = safeUrl();
      if (url === lastUrl) return;
      lastUrl = url;
      breadcrumbs.add('page_view', { title: document.title });
    }),
  );

  const ctx: DetectorContext = { config, engine, breadcrumbs, transport, onTap, lastTap: () => latestTap };
  DETECTORS.forEach((detector) => teardown.push(detector(ctx)));

  return {
    config,
    sessionId,
    onTrigger: (cb) => engine.onTrigger(cb),
    flush: () => transport.flush(),
    destroy() {
      teardown.splice(0).forEach((fn) => fn());
      transport.destroy();
    },
  };
}
