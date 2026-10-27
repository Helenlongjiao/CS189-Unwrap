import { describe, findDisabled, findInteractive, isInsidePulse } from '../dom';
import { onNavigate } from '../navigation';
import { Ledger, type Evidence } from '../scoring';
import type { Detector } from './context';
import { blockedByNativeValidation, isExplicitControl } from './signals';

/** Controls whose response is a state change the DOM doesn't reflect (checked, focus, native picker). */
const SELF_RESPONDING = 'input:not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),textarea,select,label,[contenteditable]';

/**
 * Dead click: the user clicked something that looks interactive and the page did not respond
 * (no DOM change, submit, scroll or navigation) within `timeoutMs`. Clicks on disabled controls
 * are dead by definition and are judged immediately, which covers the greyed-out "Submit" case.
 *
 * Each dead click is scored: a disabled or unresponsive control adds points; a real button, link
 * or submit control adds more than a div that merely has a click handler; a submit button the
 * browser blocked for an empty required field takes points away. Trying the same control again
 * adds points that fade over a few minutes. Only a score at or above `scoreThreshold.deadClick`
 * prompts; the rest is recorded with its score.
 */
export const deadClickDetector: Detector = ({ config, engine, onTap }) => {
  const threshold = config.scoreThreshold.deadClick;
  const pending = new Set<() => void>();
  const watching = new Set<Element>();
  const lastFired = new WeakMap<Element, number>();
  const ledgers = new WeakMap<Element, Ledger>();
  const DEDUPE_MS = 5000;

  const judge = (target: Element, context: Record<string, unknown>) => {
    const now = Date.now();
    let ledger = ledgers.get(target);
    if (!ledger) ledgers.set(target, (ledger = new Ledger()));

    const evidence: Evidence[] = [];
    const add = (id: string, weight: number) => evidence.push({ id, weight, at: now });
    if (context.reason === 'disabled') add('disabled', 60);
    else add('no-response', 35);
    if (isExplicitControl(target)) add('explicit-control', 15);
    if (context.reason !== 'disabled' && blockedByNativeValidation(target)) add('native-validation', -35);

    const result = ledger.score(now, evidence);
    // Remembered after scoring, so it only counts toward a later click on this control.
    ledger.add('earlier-dead-click', 20, now);
    return result;
  };

  const report = (target: Element, context: Record<string, unknown>) => {
    const { score, signals } = judge(target, context);
    const input = { element: describe(target), context: { ...context, score, signals } };
    if (score < threshold) {
      engine.record('dead_click', input);
      return;
    }
    const prev = lastFired.get(target);
    if (prev && Date.now() - prev < DEDUPE_MS) return;
    lastFired.set(target, Date.now());
    engine.fire('dead_click', input);
  };

  const offTap = onTap((tap) => {
    if (tap.disabled) {
      report(findDisabled(tap.target) ?? tap.target, { reason: 'disabled' });
      return;
    }
    if (tap.target.closest(SELF_RESPONDING)) return;
    const target = findInteractive(tap.target);
    if (!target || watching.has(target)) return;
    const anchor = target.closest('a');
    if (anchor && (anchor.target === '_blank' || anchor.hasAttribute('download'))) return;
    watching.add(target);

    let changed = false;
    const markChanged = () => {
      changed = true;
    };
    const observer = new MutationObserver((records) => {
      if (records.some((r) => !isInsidePulse(r.target instanceof Element ? r.target : r.target.parentElement))) {
        markChanged();
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
    const offNav = onNavigate(markChanged);
    window.addEventListener('beforeunload', markChanged);
    // A submit handler or a scroll is the page responding, even when no element changes.
    document.addEventListener('submit', markChanged, true);
    window.addEventListener('scroll', markChanged, true);

    const cleanup = () => {
      clearTimeout(timer);
      observer.disconnect();
      offNav();
      window.removeEventListener('beforeunload', markChanged);
      document.removeEventListener('submit', markChanged, true);
      window.removeEventListener('scroll', markChanged, true);
      pending.delete(cleanup);
      watching.delete(target);
    };
    const timer = setTimeout(() => {
      cleanup();
      if (!changed) report(target, { reason: 'no_response', waitedMs: config.deadClick.timeoutMs });
    }, config.deadClick.timeoutMs);
    pending.add(cleanup);
  });

  return () => {
    offTap();
    pending.forEach((fn) => fn());
  };
};
