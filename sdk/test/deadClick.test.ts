import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deadClickDetector } from '../src/detectors/deadClick';
import { click, pointerdown, setup } from './harness';

describe('dead click detector', () => {
  let h: ReturnType<typeof setup>;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    document.body.innerHTML = `
      <button id="dead">Download report</button>
      <button id="live">Show details</button>
      <div id="details"></div>
      <button id="submit" disabled>Submit</button>
      <input id="name" />
      <p id="plain">Just text</p>`;
    document.getElementById('live')!.addEventListener('click', () => {
      document.getElementById('details')!.textContent = 'Here are the details';
    });
    h = setup(deadClickDetector);
  });

  afterEach(() => {
    h.cleanup();
    vi.useRealTimers();
  });

  it('fires when a clickable element produces no visible change', async () => {
    click(document.getElementById('dead')!);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.triggers).toHaveLength(1);
    expect(h.triggers[0]).toMatchObject({ type: 'dead_click', context: { reason: 'no_response' } });
    expect(h.triggers[0].element?.label).toBe('Download report');
  });

  it('does not fire when the click changes the page', async () => {
    click(document.getElementById('live')!);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.triggers).toHaveLength(0);
  });

  it('fires immediately for clicks on disabled controls', () => {
    pointerdown(document.getElementById('submit')!);
    expect(h.triggers).toHaveLength(1);
    expect(h.triggers[0]).toMatchObject({ type: 'dead_click', context: { reason: 'disabled' } });
    expect(h.triggers[0].element?.label).toBe('Submit');
  });

  it('reports repeated clicks on the same element only once', async () => {
    const dead = document.getElementById('dead')!;
    click(dead);
    click(dead);
    await vi.advanceTimersByTimeAsync(1000);
    click(dead);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.triggers).toHaveLength(1);
  });

  it('ignores text inputs and non-interactive elements', async () => {
    click(document.getElementById('name')!);
    click(document.getElementById('plain')!);
    await vi.advanceTimersByTimeAsync(1000);
    expect(h.triggers).toHaveLength(0);
  });
});
