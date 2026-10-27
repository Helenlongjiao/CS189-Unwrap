import { describe, findInteractive } from '../dom';
import { Ledger, type Evidence } from '../scoring';
import type { Tap } from '../taps';
import type { Detector } from './context';
import { isTextField, watchChanges } from './signals';

/**
 * Rage click: a burst of `count` or more clicks within `windowMs` that land within `radiusPx` of
 * each other, judged by evidence rather than click count alone:
 *
 *   more clicks, a disabled control, or a control that never responded add points;
 *   a page that did respond (a quantity going up, a menu opening), plain text (triple-click to
 *   select) or a text field take points away.
 *
 * A burst prompts only if its score reaches `scoreThreshold.rageClick`, judged on every click
 * from the `count`-th on. By then the earlier clicks have had their chance to change the page,
 * so "nothing happened" is already known and a stuck user is prompted as fast as before. A burst
 * that never reaches the threshold is recorded, with its score, `settleMs` after its last click,
 * so thresholds can be tuned from real data.
 */
export const rageClickDetector: Detector = ({ config, engine, onTap }) => {
  const { count, windowMs, radiusPx, settleMs } = config.rageClick;
  const threshold = config.scoreThreshold.rageClick;
  const watcher = watchChanges();
  const ledgers = new WeakMap<Element, Ledger>();
  let recent: Tap[] = [];
  let burstDone = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const judge = (tap: Tap, cluster: Tap[]) => {
    const now = Date.now();
    const target = findInteractive(tap.target) ?? tap.target;
    let ledger = ledgers.get(target);
    if (!ledger) ledgers.set(target, (ledger = new Ledger()));

    const evidence: Evidence[] = [];
    const add = (id: string, weight: number) => evidence.push({ id, weight, at: now });

    const n = cluster.length;
    add(`clicks-${Math.min(n, 5)}`, n >= 5 ? 40 : n === 4 ? 30 : 20);
    if (tap.disabled) add('disabled-target', 40);
    if (findInteractive(tap.target)) add('interactive-target', 10);
    else if (!tap.disabled) add('plain-target', -25);
    if (isTextField(tap.target)) add('text-field', -40);
    // Responses to earlier clicks in the burst are already visible; this click's own is not yet.
    if (watcher.changedSince(cluster[0].at)) add('page-responded', -30);
    else add('no-response', 30);

    return { target, ledger, n, ...ledger.score(now, evidence) };
  };

  /** Prompts if the burst scores high enough; with `settled`, records a burst that never did. */
  const report = (tap: Tap, cluster: Tap[], settled: boolean): boolean => {
    const result = judge(tap, cluster);
    const input = {
      element: describe(result.target),
      context: {
        clickCount: result.n,
        durationMs: tap.at - cluster[0].at,
        disabled: tap.disabled,
        score: result.score,
        signals: result.signals,
      },
    };
    if (result.score >= threshold) {
      engine.fire('rage_click', input);
      return true;
    }
    if (settled) {
      engine.record('rage_click', input);
      // Another burst on the same control soon after is more telling than the first.
      result.ledger.add('earlier-burst', 15, Date.now());
    }
    return false;
  };

  const offTap = onTap((tap) => {
    const last = recent[recent.length - 1];
    if (last && tap.at - last.at > windowMs) burstDone = false;
    recent = recent.filter((t) => tap.at - t.at <= windowMs);
    recent.push(tap);

    const cluster = recent.filter((t) => Math.hypot(t.x - tap.x, t.y - tap.y) <= radiusPx);
    if (cluster.length < count || burstDone) return;

    clearTimeout(settleTimer);
    if (report(tap, cluster, false)) {
      burstDone = true;
      return;
    }
    settleTimer = setTimeout(() => {
      if (burstDone) return;
      burstDone = true;
      report(tap, cluster, true);
    }, settleMs);
  });

  return () => {
    offTap();
    clearTimeout(settleTimer);
    watcher.stop();
  };
};
