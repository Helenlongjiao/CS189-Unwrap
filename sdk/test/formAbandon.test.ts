import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formAbandonDetector } from '../src/detectors/formAbandon';
import { setup, type } from './harness';

describe('form abandonment detector', () => {
  let h: ReturnType<typeof setup>;
  let email: HTMLInputElement;
  let card: HTMLInputElement;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = `
      <form id="checkout" aria-label="Checkout">
        <label for="email">Email address</label><input id="email" name="email" required />
        <label for="card">Card number</label><input id="card" name="card" required />
        <button type="submit">Pay</button>
      </form>`;
    email = document.getElementById('email') as HTMLInputElement;
    card = document.getElementById('card') as HTMLInputElement;
    document.querySelector('form')!.addEventListener('submit', (e) => e.preventDefault());
    h = setup(formAbandonDetector, { formIdleMs: 30_000 });
  });

  afterEach(() => {
    h.cleanup();
    vi.useRealTimers();
  });

  it('fires after the user goes idle mid-form, describing where they stopped but not what they typed', () => {
    type(email, 'someone@example.com');
    card.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    vi.advanceTimersByTime(29_000);
    expect(h.triggers).toHaveLength(0);
    vi.advanceTimersByTime(1_000);

    expect(h.triggers).toHaveLength(1);
    const [t] = h.triggers;
    expect(t.type).toBe('form_abandon');
    expect(t.element).toMatchObject({ selector: '#checkout', label: 'Checkout' });
    expect(t.context).toMatchObject({ reason: 'idle', fieldsTouched: 1, fieldsTotal: 2, requiredRemaining: 1, lastField: 'Card number' });
    expect(JSON.stringify(t)).not.toContain('someone@example.com');
  });

  it('keeps waiting while the user is still active', () => {
    type(email, 'a');
    vi.advanceTimersByTime(20_000);
    type(card, '4242');
    vi.advanceTimersByTime(20_000);
    expect(h.triggers).toHaveLength(0);
  });

  it('does not fire once the form is submitted', () => {
    type(email, 'a');
    document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(60_000);
    expect(h.triggers).toHaveLength(0);
  });

  it('records, without prompting, when the user leaves the page mid-form', () => {
    type(email, 'a');
    window.dispatchEvent(new Event('pagehide'));
    expect(h.triggers[0]).toMatchObject({ type: 'form_abandon', recordOnly: true, eligible: false, context: { reason: 'exit' } });
  });
});
