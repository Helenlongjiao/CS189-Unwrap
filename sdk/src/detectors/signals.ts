import { isInsidePulse } from '../dom';
import { onNavigate } from '../navigation';

/** Controls that clearly announce "click me" (as opposed to a div that merely has a click handler). */
const EXPLICIT_CONTROL =
  'button,summary,[role="button"],a[href],input[type="submit"],input[type="button"],input[type="reset"],input[type="image"]';

const TEXT_FIELD =
  'input:not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]):not([type="checkbox"]):not([type="radio"]),textarea,[contenteditable]';

export function isExplicitControl(el: Element): boolean {
  return el.matches(EXPLICIT_CONTROL);
}

/**
 * The page styled this element with a pointer cursor, which tells the user "you can click this"
 * even when it is a plain div or chip rather than a button.
 */
export function looksClickable(el: Element): boolean {
  try {
    return getComputedStyle(el).cursor === 'pointer';
  } catch {
    return false;
  }
}

/** Clicking into a field only places the cursor; repeating it is not frustration. */
export function isTextField(el: Element): boolean {
  return !!el.closest(TEXT_FIELD);
}

/**
 * A submit button inside a form the browser will refuse to submit (empty required field, bad
 * email). The browser shows its own message, so no page change is expected.
 */
export function blockedByNativeValidation(el: Element): boolean {
  const button = el as HTMLButtonElement | HTMLInputElement;
  if (button.type !== 'submit' || !button.form || button.form.noValidate || (button as HTMLButtonElement).formNoValidate) return false;
  return Array.from(button.form.elements).some((field) => {
    const f = field as HTMLInputElement;
    return f.willValidate && f.validity && !f.validity.valid;
  });
}

export interface ChangeWatcher {
  /** True if the page visibly responded (DOM change, submit, scroll, navigation) at or after `at`. */
  changedSince(at: number): boolean;
  stop(): void;
}

/**
 * Remembers when the page last responded to the user. Changes inside the SDK's own widget are
 * ignored so showing a survey never counts as the page reacting.
 */
export function watchChanges(): ChangeWatcher {
  let last = 0;
  const bump = () => {
    last = Date.now();
  };
  const handle = (records: MutationRecord[]) => {
    if (records.some((r) => !isInsidePulse(r.target instanceof Element ? r.target : r.target.parentElement))) bump();
  };

  const observer = new MutationObserver(handle);
  observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  const offNav = onNavigate(bump);
  document.addEventListener('submit', bump, true);
  window.addEventListener('scroll', bump, true);

  return {
    changedSince(at) {
      handle(observer.takeRecords());
      return last >= at;
    },
    stop() {
      observer.disconnect();
      offNav();
      document.removeEventListener('submit', bump, true);
      window.removeEventListener('scroll', bump, true);
    },
  };
}

/**
 * An empty, fixed-position element: a backdrop or transparent layer. A click that lands on one
 * (instead of the control underneath) means something is covering the page.
 */
export function isEmptyOverlay(el: Element): boolean {
  try {
    if (getComputedStyle(el).position !== 'fixed') return false;
  } catch {
    return false;
  }
  return !(el.textContent ?? '').trim() && !el.querySelector('img,svg,video,canvas,input,button,a');
}

type EffectListener = () => void;
const effectListeners = new Set<EffectListener>();

/** Wraps `obj[key]` once so every call tells the active watchers. Always calls through. */
function wrapOnce(obj: unknown, key: string) {
  const target = obj as Record<string, unknown> | null | undefined;
  const fn = target?.[key];
  if (!target || typeof fn !== 'function' || (fn as { __pulseEffect?: boolean }).__pulseEffect) return;
  const wrapped = function (this: unknown, ...args: unknown[]) {
    effectListeners.forEach((notify) => notify());
    return (fn as (...a: unknown[]) => unknown).apply(this, args);
  };
  (wrapped as { __pulseEffect?: boolean }).__pulseEffect = true;
  try {
    target[key] = wrapped;
  } catch {
    // Read-only in this browser: the response is simply not observed.
  }
}

export interface SideEffectWatcher {
  /** True if, since `at`, the page wrote to the clipboard, opened a window, or moved focus away from `tapped`. */
  since(at: number, tapped?: Element): boolean;
  stop(): void;
}

/**
 * Responses that do not change the page: a copy button, a link that opens a new window, an icon
 * that only moves focus to a field. They count as the page responding.
 */
export function watchSideEffects(): SideEffectWatcher {
  wrapOnce(typeof navigator !== 'undefined' ? navigator.clipboard : undefined, 'writeText');
  wrapOnce(typeof navigator !== 'undefined' ? navigator.clipboard : undefined, 'write');
  wrapOnce(window, 'open');

  let effectAt = -1;
  let focusAt = -1;
  let focused: Element | undefined;
  const notify = () => {
    effectAt = Date.now();
  };
  effectListeners.add(notify);
  const onFocus = (e: FocusEvent) => {
    if (e.target instanceof Element && !isInsidePulse(e.target)) {
      focused = e.target;
      focusAt = Date.now();
    }
  };
  document.addEventListener('focusin', onFocus, true);

  return {
    since(at, tapped) {
      if (effectAt >= at) return true;
      return !!focused && focusAt >= at && !!tapped && !tapped.contains(focused) && !focused.contains(tapped);
    },
    stop() {
      effectListeners.delete(notify);
      document.removeEventListener('focusin', onFocus, true);
    },
  };
}
