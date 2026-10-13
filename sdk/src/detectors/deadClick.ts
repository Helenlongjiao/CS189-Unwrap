import { describe, findDisabled, findInteractive, isInsidePulse } from '../dom';
import { onNavigate } from '../navigation';
import type { Detector } from './context';

/** Controls whose response is a state change the DOM doesn't reflect (checked, focus, native picker). */
const SELF_RESPONDING = 'input:not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),textarea,select,label,[contenteditable]';

/**
 * Dead click: the user clicked something that looks interactive and nothing visibly changed
 * (no DOM mutation, no navigation) within `timeoutMs`. Clicks on disabled controls are dead by
 * definition and fire immediately, which covers the greyed-out "Submit" button case.
 */
export const deadClickDetector: Detector = ({ config, engine, onTap }) => {
  const pending = new Set<() => void>();
  const watching = new Set<Element>();
  const lastFired = new WeakMap<Element, number>();
  const DEDUPE_MS = 5000;

  const fireOnce = (target: Element, context: Record<string, unknown>) => {
    const prev = lastFired.get(target);
    if (prev && Date.now() - prev < DEDUPE_MS) return;
    lastFired.set(target, Date.now());
    engine.fire('dead_click', { element: describe(target), context });
  };

  const offTap = onTap((tap) => {
    if (tap.disabled) {
      fireOnce(findDisabled(tap.target) ?? tap.target, { reason: 'disabled' });
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

    const cleanup = () => {
      clearTimeout(timer);
      observer.disconnect();
      offNav();
      window.removeEventListener('beforeunload', markChanged);
      pending.delete(cleanup);
      watching.delete(target);
    };
    const timer = setTimeout(() => {
      cleanup();
      if (!changed) fireOnce(target, { reason: 'no_response', waitedMs: config.deadClick.timeoutMs });
    }, config.deadClick.timeoutMs);
    pending.add(cleanup);
  });

  return () => {
    offTap();
    pending.forEach((fn) => fn());
  };
};
