import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rageClickDetector } from '../src/detectors/rageClick';
import { click, setup } from './harness';

describe('rage click detector', () => {
  let h: ReturnType<typeof setup>;
  let button: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = '<button id="pay">Pay now</button>';
    button = document.querySelector('button')!;
    h = setup(rageClickDetector);
  });

  afterEach(() => {
    h.cleanup();
    vi.useRealTimers();
  });

  it('fires once when clicks cluster in time and space', () => {
    for (let i = 0; i < 6; i++) {
      click(button, 100 + i, 50);
      vi.advanceTimersByTime(100);
    }
    expect(h.triggers).toHaveLength(1);
    const [t] = h.triggers;
    expect(t.type).toBe('rage_click');
    expect(t.element).toMatchObject({ selector: '#pay', tag: 'button', label: 'Pay now' });
    expect(t.context.clickCount).toBe(3);
    expect(t.eligible).toBe(true);
  });

  it('ignores clicks that are spread out on the page', () => {
    click(button, 0, 0);
    click(button, 200, 0);
    click(button, 400, 0);
    expect(h.triggers).toHaveLength(0);
  });

  it('ignores clicks that are slow', () => {
    for (let i = 0; i < 5; i++) {
      click(button);
      vi.advanceTimersByTime(800);
    }
    expect(h.triggers).toHaveLength(0);
  });

  it('starts a new burst after a pause', () => {
    for (let i = 0; i < 3; i++) click(button);
    vi.advanceTimersByTime(2000);
    for (let i = 0; i < 3; i++) click(button);
    expect(h.triggers).toHaveLength(2);
    expect(h.sent.filter((e) => e.kind === 'friction')).toHaveLength(2);
  });
});
