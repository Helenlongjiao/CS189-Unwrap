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

  const realFetch = window.fetch;

  afterEach(() => {
    h.cleanup();
    window.fetch = realFetch;
    vi.useRealTimers();
  });

  /** Replaces fetch, then restarts the detector so it watches the replacement. */
  function withFetch(status: number) {
    h.cleanup();
    window.fetch = vi.fn(async () => new Response('{}', { status })) as typeof fetch;
    h = setup(rageClickDetector);
  }

  async function clickAndSend(times: number, onResponse?: (res: Response) => void) {
    button.onclick = async () => onResponse?.(await window.fetch('/api/pay', { method: 'POST' }));
    for (let i = 0; i < times; i++) {
      click(button);
      await vi.advanceTimersByTimeAsync(150);
    }
  }

  it('always prompts when a request failed during the burst, even though the page showed an error message', async () => {
    withFetch(500);
    await clickAndSend(3, () => {
      document.getElementById('text')!.textContent = 'Something went wrong';
    });
    const prompts = h.triggers.filter((t) => !t.recordOnly);
    expect(prompts).toHaveLength(1);
    expect(prompts[0].context.fixedRule).toBe('request-failed');
    expect(prompts[0].context.signals).toEqual(expect.arrayContaining([expect.stringMatching(/^page-responded:/), expect.stringMatching(/^request-failed:/)]));
  });

  it('does not prompt for fast clicks when each one sends a request that succeeds', async () => {
    withFetch(200);
    await clickAndSend(5, () => {
      document.getElementById('text')!.textContent = String(Math.random());
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.triggers.filter((t) => !t.recordOnly)).toHaveLength(0);
    expect(h.triggers[0].context.signals).toEqual(expect.arrayContaining([expect.stringMatching(/^request-ok:/)]));
  });

  it('counts "no request went out" as extra evidence when nothing responded either', () => {
    for (let i = 0; i < 3; i++) click(button);
    expect(h.triggers[0].context.signals).toContain('no-request:10');
  });

  it('adds points for frantic mouse movement during the burst', async () => {
    const move = (x: number, y: number) => document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: x, clientY: y }));
    for (let i = 0; i < 3; i++) {
      click(button, 100, 100);
      for (let j = 0; j < 6; j++) move(100 + (j % 2 ? 25 : -25), 100 + j * 3);
      await vi.advanceTimersByTimeAsync(60);
    }
    expect(h.triggers[0].context.signals).toEqual(expect.arrayContaining([expect.stringMatching(/^frantic-mouse:/)]));
  });

  it('does not add the frantic-mouse points when the mouse stays still', () => {
    for (let i = 0; i < 3; i++) click(button, 100, 100);
    expect(h.triggers[0].context.signals).not.toEqual(expect.arrayContaining([expect.stringMatching(/^frantic-mouse:/)]));
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
