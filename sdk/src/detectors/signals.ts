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
