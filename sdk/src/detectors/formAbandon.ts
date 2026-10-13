import { cssPath, fieldLabel, isInsidePulse } from '../dom';
import type { Detector } from './context';

interface FormState {
  form: HTMLFormElement;
  touched: Set<string>;
  lastField?: Element;
  timer?: ReturnType<typeof setTimeout>;
  submitted: boolean;
  fired: boolean;
}

const FIELD = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]),select,textarea';

/**
 * Idle form abandonment: the user started filling a form, then went quiet for `formIdleMs`
 * without submitting. That prompts once per form. Leaving the page with a started, unsubmitted
 * form is recorded too, but can't prompt because the page is already going away.
 * Only field names and labels are collected, never what the user typed.
 */
export const formAbandonDetector: Detector = ({ config, engine, breadcrumbs }) => {
  const forms = new Map<HTMLFormElement, FormState>();

  const summarize = (state: FormState, reason: 'idle' | 'exit') => {
    const fields = Array.from(state.form.querySelectorAll(FIELD));
    const required = fields.filter((f) => (f as HTMLInputElement).required);
    const emptyRequired = required.filter((f) => !(f as HTMLInputElement).value);
    return {
      element: {
        selector: cssPath(state.form),
        tag: 'form',
        label: state.form.getAttribute('aria-label') || state.form.getAttribute('name') || state.form.id || 'form',
      },
      context: {
        reason,
        idleMs: config.formIdleMs,
        fieldsTouched: state.touched.size,
        fieldsTotal: fields.length,
        requiredRemaining: emptyRequired.length,
        lastField: state.lastField ? fieldLabel(state.lastField) : undefined,
        lastFieldSelector: state.lastField ? cssPath(state.lastField) : undefined,
      },
    };
  };

  const activity = (e: Event) => {
    const field = e.target instanceof Element ? e.target.closest(FIELD) : null;
    const form = (field as HTMLInputElement | null)?.form;
    if (!field || !form || isInsidePulse(form)) return;

    let state = forms.get(form);
    if (!state) {
      state = { form, touched: new Set(), submitted: false, fired: false };
      forms.set(form, state);
    }
    if (state.submitted || state.fired) return;
    state.lastField = field;
    if (e.type === 'focusin') breadcrumbs.add('focus', { field: fieldLabel(field), selector: cssPath(field) });
    else state.touched.add(field.getAttribute('name') || cssPath(field));

    clearTimeout(state.timer);
    if (!state.touched.size) return;
    const current = state;
    current.timer = setTimeout(() => {
      if (current.submitted || current.fired || !current.form.isConnected) return;
      current.fired = true;
      engine.fire('form_abandon', summarize(current, 'idle'));
    }, config.formIdleMs);
  };

  const onSubmit = (e: Event) => {
    const form = e.target as HTMLFormElement;
    const state = forms.get(form);
    if (state) {
      state.submitted = true;
      clearTimeout(state.timer);
    }
    breadcrumbs.add('submit', { selector: cssPath(form) });
  };

  const onPageHide = () => {
    forms.forEach((state) => {
      if (!state.submitted && !state.fired && state.touched.size) {
        state.fired = true;
        engine.record('form_abandon', summarize(state, 'exit'));
      }
    });
  };

  document.addEventListener('input', activity, true);
  document.addEventListener('change', activity, true);
  document.addEventListener('focusin', activity, true);
  document.addEventListener('submit', onSubmit, true);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    document.removeEventListener('input', activity, true);
    document.removeEventListener('change', activity, true);
    document.removeEventListener('focusin', activity, true);
    document.removeEventListener('submit', onSubmit, true);
    window.removeEventListener('pagehide', onPageHide);
    forms.forEach((s) => clearTimeout(s.timer));
  };
};
