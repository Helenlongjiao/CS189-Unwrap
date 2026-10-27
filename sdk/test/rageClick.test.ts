import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rageClickDetector } from '../src/detectors/rageClick';
import { click, pointerdown, setup } from './harness';

describe('rage click detector', () => {
  let h: ReturnType<typeof setup>;
  let button: HTMLButtonElement;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = '<button id="pay">Pay now</button><p id="text">Some text</p><button id="off" disabled>Off</button>';
    button = document.getElementById('pay') as HTMLButtonElement;
    h = setup(rageClickDetector);
  });

  afterEach(() => {
    h.cleanup();
    vi.useRealTimers();
  });

  it('fires once when clicks cluster in time and space on a control that does not respond', () => {
    for (let i = 0; i < 6; i++) {
      click(button, 100 + i, 50);
      vi.advanceTimersByTime(100);
    }
    expect(h.triggers.filter((t) => !t.recordOnly)).toHaveLength(1);
    const [t] = h.triggers;
    expect(t.type).toBe('rage_click');
    expect(t.element).toMatchObject({ selector: '#pay', tag: 'button', label: 'Pay now' });
    expect(t.context.clickCount).toBe(3);
    expect(t.context.score).toBeGreaterThanOrEqual(h.config.scoreThreshold.rageClick);
    expect(t.eligible).toBe(true);
  });

  it('prompts on the third click when the earlier clicks changed nothing', () => {
    for (let i = 0; i < 3; i++) click(button);
    expect(h.triggers).toHaveLength(1);
    expect(h.triggers[0]).toMatchObject({ type: 'rage_click', recordOnly: false });
    expect(h.triggers[0].context.signals).toContain('no-response:30');
  });

  it('prompts at once for repeated presses on a disabled control', () => {
    for (let i = 0; i < 3; i++) pointerdown(document.getElementById('off')!);
    expect(h.triggers).toHaveLength(1);
    expect(h.triggers[0].context).toMatchObject({ disabled: true });
    expect(h.triggers[0].context.signals).toEqual(expect.arrayContaining([expect.stringMatching(/^disabled-target:/)]));
  });

  it('records, without prompting, a burst where the page responded', () => {
    button.addEventListener('click', () => (document.getElementById('text')!.textContent = String(Math.random())));
    for (let i = 0; i < 5; i++) {
      click(button);
      vi.advanceTimersByTime(60);
    }
    vi.advanceTimersByTime(1000);
    expect(h.triggers.filter((t) => !t.recordOnly)).toHaveLength(0);
    expect(h.triggers).toHaveLength(1);
    expect(h.triggers[0]).toMatchObject({ recordOnly: true, eligible: false });
    expect(h.triggers[0].context.signals).toContain('page-responded:-30');
  });

  it('records, without prompting, a triple-click on plain text', () => {
    for (let i = 0; i < 3; i++) click(document.getElementById('text')!, 40, 20);
    vi.advanceTimersByTime(1000);
    expect(h.triggers.filter((t) => !t.recordOnly)).toHaveLength(0);
    expect(h.triggers[0]?.context.score).toBeLessThan(h.config.scoreThreshold.rageClick);
  });

  it('honors a custom threshold', () => {
    h.cleanup();
    h = setup(rageClickDetector, { scoreThreshold: { rageClick: 20 } });
    for (let i = 0; i < 3; i++) click(document.getElementById('text')!, 40, 20);
    vi.advanceTimersByTime(1000);
    expect(h.triggers.filter((t) => !t.recordOnly)).toHaveLength(1);
  });

  it('ignores clicks that are spread out on the page', () => {
    click(button, 0, 0);
    click(button, 200, 0);
    click(button, 400, 0);
    vi.advanceTimersByTime(1000);
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
    vi.advanceTimersByTime(2000);
    expect(h.triggers).toHaveLength(2);
    expect(h.sent.filter((e) => e.kind === 'friction')).toHaveLength(2);
  });

  it('counts an earlier burst on the same control toward the next one', () => {
    h.cleanup();
    h = setup(rageClickDetector);
    const text = document.getElementById('text')!;
    for (let i = 0; i < 3; i++) click(text, 40, 20);
    vi.advanceTimersByTime(2000);
    for (let i = 0; i < 3; i++) click(text, 40, 20);
    vi.advanceTimersByTime(2000);
    expect(h.triggers).toHaveLength(2);
    expect(h.triggers[1].context.signals).toEqual(expect.arrayContaining([expect.stringMatching(/^earlier-burst:/)]));
  });
});
