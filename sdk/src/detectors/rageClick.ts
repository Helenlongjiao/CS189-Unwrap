import { describe, findInteractive } from '../dom';
import type { Tap } from '../taps';
import type { Detector } from './context';

/**
 * Rage click: `count` or more clicks within `windowMs` that land within `radiusPx` of each other.
 * Fires once per burst; a new burst starts after a pause longer than the window.
 */
export const rageClickDetector: Detector = ({ config, engine, onTap }) => {
  const { count, windowMs, radiusPx } = config.rageClick;
  let recent: Tap[] = [];
  let firedThisBurst = false;

  return onTap((tap) => {
    const last = recent[recent.length - 1];
    if (last && tap.at - last.at > windowMs) firedThisBurst = false;
    recent = recent.filter((t) => tap.at - t.at <= windowMs);
    recent.push(tap);

    const cluster = recent.filter((t) => Math.hypot(t.x - tap.x, t.y - tap.y) <= radiusPx);
    if (cluster.length < count || firedThisBurst) return;
    firedThisBurst = true;

    const target = findInteractive(tap.target) ?? tap.target;
    engine.fire('rage_click', {
      element: describe(target),
      context: { clickCount: cluster.length, durationMs: tap.at - cluster[0].at, disabled: tap.disabled },
    });
  });
};
