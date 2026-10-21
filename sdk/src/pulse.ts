import { Breadcrumbs } from './breadcrumbs';
import { resolveConfig, type PulseOptions } from './config';
import type { Detector, DetectorContext } from './detectors/context';
import { deadClickDetector } from './detectors/deadClick';
import { errorDetector } from './detectors/errors';
import { formAbandonDetector } from './detectors/formAbandon';
import { lostDetector } from './detectors/lost';
import { rageClickDetector } from './detectors/rageClick';
import { describe, findInteractive } from './dom';
import { onNavigate } from './navigation';
import { clientContext } from './client';
import { mountSurveys } from './surveys/controller';
import { onTap, type Tap } from './taps';
import { Transport } from './transport';
import { TriggerEngine } from './triggers';
import type { PulseConfig, Trigger } from './types';
import { getSessionId, safeUrl } from './util';

const DETECTORS: Detector[] = [rageClickDetector, deadClickDetector, errorDetector, formAbandonDetector, lostDetector];

export interface PulseInstance {
  config: PulseConfig;
  sessionId: string;
  /** Opens the "How can we help?" survey, e.g. from a site's own Help button. */
  open(): Promise<void>;
  onTrigger(cb: (t: Trigger) => void): () => void;
  flush(): void;
  destroy(): void;
}

/**
 * A page that itself loaded with an HTTP error (a 404 from a broken link, a 500 from the server).
 * The status comes from the Navigation Timing API (Chromium 109+); other browsers skip this check.
 */
function detectBrokenPage(engine: TriggerEngine, breadcrumbs: Breadcrumbs) {
  const nav = performance.getEntriesByType?.('navigation')[0] as (PerformanceEntry & { responseStatus?: number }) | undefined;
  const status = nav?.responseStatus;
  if (!status || status < 400) return;
  const trail = breadcrumbs.snapshot();
  const cameFrom = [...trail].reverse().find((b) => b.type === 'page_view' && b.url !== safeUrl());
  const lastClick = [...trail].reverse().find((b) => b.type === 'click' && b.url === cameFrom?.url);
  breadcrumbs.add('error', { kind: 'page', status });
  engine.fire('error', {
    element: lastClick
      ? {
          selector: String(lastClick.data.selector ?? ''),
          tag: String(lastClick.data.tag ?? 'a'),
          label: String(lastClick.data.label ?? ''),
          ...(lastClick.data.area ? { area: String(lastClick.data.area) } : {}),
        }
      : undefined,
    context: {
      kind: 'page',
      status,
      message: status === 404 ? 'Page not found' : `Page failed to load (${status})`,
      cameFrom: cameFrom?.url,
      cameFromTitle: cameFrom?.data.title,
    },
  });
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
    client: clientContext(),
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

  const surveys = config.widget ? mountSurveys(config, engine, transport, breadcrumbs) : null;
  if (surveys) teardown.push(() => surveys.destroy());

  // After surveys are mounted, so a broken page can prompt as soon as it loads.
  detectBrokenPage(engine, breadcrumbs);

  return {
    config,
    sessionId,
    open: () => surveys?.open() ?? Promise.resolve(),
    onTrigger: (cb) => engine.onTrigger(cb),
    flush: () => transport.flush(),
    destroy() {
      teardown.splice(0).forEach((fn) => fn());
      transport.destroy();
    },
  };
}
