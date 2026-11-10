import { describe, findInteractive, isInsidePulse } from '../dom';
import { Ledger, type Evidence } from '../scoring';
import type { Tap } from '../taps';
import type { Detector } from './context';
import { watchRequests } from './requests';
import { isTextField, watchChanges } from './signals';

/** Mouse path length (px) between the first and last click of a burst that counts as frantic. */
const FRANTIC_MOUSE_PX = 150;

interface MouseSample {
  x: number;
  y: number;
  at: number;
}

/**
 * Rage click: a burst of `count` or more clicks within `windowMs` that land within `radiusPx` of
 * each other. This is a "the page looks broken" signal and is kept apart from the lostness score.
 * A burst is judged by layers of evidence, so ordinary repeated clicking (a quantity arrow, a
 * carousel, selecting text) does not prompt:
 *
 *   adds points:    more clicks (5+ is strong), a disabled control, the page not responding,
 *                   no request going out, a request that failed, frantic mouse movement
 *   takes points:   the page responding (a number going up, a menu opening), a request that
 *                   succeeded (working, maybe slow), plain text, a text field
 *
 * Fixed rule: if the page is clearly broken, it prompts no matter what else the score says.
 * That means a request failed during the burst (even if the page then showed an error message),
 * or the control is disabled. Otherwise the burst prompts only when its score reaches
 * `scoreThreshold.rageClick`.
 *
 * Judged on every click from the `count`-th on. By then the earlier clicks have had their chance
 * to change the page or send a request, so "nothing happened" is already known. A burst that never
 * prompts is recorded, with its score, `settleMs` after its last click, so thresholds can be
 * tuned from real data.
 */
export const rageClickDetector: Detector = ({ config, engine, transport, onTap }) => {
  const { count, windowMs, radiusPx, settleMs } = config.rageClick;
  const threshold = config.scoreThreshold.rageClick;
  const changes = watchChanges();
  const requests = watchRequests((url) => transport.isOwnRequest(url));
  const ledgers = new WeakMap<Element, Ledger>();
  let recent: Tap[] = [];
  let mouse: MouseSample[] = [];
  let burstDone = false;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;

  const onMove = (e: MouseEvent) => {
    const last = mouse[mouse.length - 1];
    if (last && Math.hypot(e.clientX - last.x, e.clientY - last.y) < 1) return;
    if (e.target instanceof Element && isInsidePulse(e.target)) return;
    mouse.push({ x: e.clientX, y: e.clientY, at: Date.now() });
    if (mouse.length > 80) mouse.shift();
  };
  document.addEventListener('mousemove', onMove, { capture: true, passive: true });

  const mouseTravel = (from: number, to: number): number => {
    const path = mouse.filter((s) => s.at >= from && s.at <= to);
    let total = 0;
    for (let i = 1; i < path.length; i++) total += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    return Math.round(total);
  };

  const judge = (tap: Tap, cluster: Tap[]) => {
    const now = Date.now();
    const target = findInteractive(tap.target) ?? tap.target;
    let ledger = ledgers.get(target);
    if (!ledger) ledgers.set(target, (ledger = new Ledger()));

    const evidence: Evidence[] = [];
    const add = (id: string, weight: number) => evidence.push({ id, weight, at: now });
    const first = cluster[0].at;

    const n = cluster.length;
    add(`clicks-${Math.min(n, 5)}`, n >= 5 ? 40 : n === 4 ? 30 : 20);
    if (tap.disabled) add('disabled-target', 40);
    if (findInteractive(tap.target)) add('interactive-target', 10);
    else if (!tap.disabled) add('plain-target', -25);
    if (isTextField(tap.target)) add('text-field', -40);

    // Responses to earlier clicks in the burst are already visible; this click's own is not yet.
    const responded = changes.changedSince(first);
    if (responded) add('page-responded', -30);
    else add('no-response', 30);

    const net = requests.since(first);
    if (net.failed > 0) add('request-failed', 40);
    else if (net.ok > 0) add('request-ok', -25);
    else if (net.started === 0 && !responded) add('no-request', 10);

    if (mouseTravel(first, tap.at) >= FRANTIC_MOUSE_PX) add('frantic-mouse', 15);

    const rule = net.failed > 0 ? 'request-failed' : tap.disabled ? 'disabled-control' : undefined;
    return { target, ledger, n, rule, ...ledger.score(now, evidence) };
  };

  /** Prompts if the page is clearly broken or the score is high enough; with `settled`, records a burst that never did. */
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
        ...(result.rule ? { fixedRule: result.rule } : {}),
      },
    };
    if (result.rule || result.score >= threshold) {
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
    document.removeEventListener('mousemove', onMove, { capture: true });
    changes.stop();
    requests.stop();
  };
};
