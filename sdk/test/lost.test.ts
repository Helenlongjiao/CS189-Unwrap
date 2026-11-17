import { afterEach, describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from '../src/breadcrumbs';
import { resolveConfig } from '../src/config';
import { lostDetector } from '../src/detectors/lost';
import { LOST_PATTERNS, evaluateLost } from '../src/detectors/lostPatterns';
import { DECAY_MS, FULL_SCORE, NUDGE_SCORE, emptySnapshot, lostTier, type LostSnapshot } from '../src/detectors/lostScore';
import type { Transport } from '../src/transport';
import { TriggerEngine } from '../src/triggers';
import type { Trigger } from '../src/types';

function snap(partial: Partial<LostSnapshot> & { now: number }): LostSnapshot {
  return { ...emptySnapshot(partial.now), ...partial };
}

describe('lost patterns', () => {
  it('lists about 100 unique generalized workflows', () => {
    const ids = LOST_PATTERNS.map((pattern) => pattern.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(100);
    expect(LOST_PATTERNS.filter((pattern) => pattern.strong).length).toBeGreaterThanOrEqual(10);
  });

  it('toasts for one help click and does not open the full guide yet', () => {
    const now = 1_000_000;
    const found = evaluateLost(
      snap({
        now,
        pages: [{ at: now, url: 'http://shop.test/', title: 'Home' }],
        clicks: [{ at: now, url: 'http://shop.test/', label: 'Help' }],
      }),
    );
    expect(found.some((hit) => hit.strong)).toBe(false);
    const tier = lostTier(found.map((hit) => ({ ...hit, at: now })), now);
    expect(tier.score).toBeGreaterThanOrEqual(NUDGE_SCORE);
    expect(tier.score).toBeLessThan(FULL_SCORE);
    expect(tier.tier).toBe('nudge');
    expect(found.map((hit) => hit.id)).toContain('help-once-180s');
  });

  it('opens the full guide for a strong pattern', () => {
    const now = 1_000_000;
    const found = evaluateLost(
      snap({
        now,
        errors: [{ at: now - 50_000, url: 'http://shop.test/missing', kind: 'page' }],
        pages: [0, 1, 2, 3].map((i) => ({
          at: now - 40_000 + i * 1000,
          url: `http://shop.test/p${i}`,
          title: `Page ${i}`,
        })),
      }),
    );
    expect(found.map((hit) => hit.id)).toContain('error-then-4-pages-60s');
    expect(lostTier(found.map((hit) => ({ ...hit, at: now })), now).tier).toBe('full');
  });

  it('nudges when weak signals stack, then opens fully when they pass the line', () => {
    const now = 5_000_000;
    const weak = [
      { id: 'a', weight: 12, strong: false, at: now },
      { id: 'b', weight: 14, strong: false, at: now },
      { id: 'c', weight: 16, strong: false, at: now },
    ];
    expect(lostTier(weak, now)).toMatchObject({ tier: 'nudge' });
    expect(lostTier(weak, now).score).toBeGreaterThanOrEqual(NUDGE_SCORE);
    expect(lostTier(weak, now).score).toBeLessThan(FULL_SCORE);

    const stacked = [...weak, { id: 'd', weight: 18, strong: false, at: now }, { id: 'e', weight: 16, strong: false, at: now }];
    expect(lostTier(stacked, now).tier).toBe('full');
  });

  it('counts overlapping windows of the same behavior once', () => {
    const now = 1_000;
    const tier = lostTier(
      [
        { id: 'hop-3-30s', weight: 14, strong: false, at: now },
        { id: 'hop-3-60s', weight: 12, strong: false, at: now },
        { id: 'hop-4-45s', weight: 16, strong: false, at: now },
      ],
      now,
    );
    expect(tier).toEqual({ score: 16, tier: 'none' });
  });

  it('forgets points after a few minutes', () => {
    const now = 9_000_000;
    const tier = lostTier([{ id: 'old', weight: 80, strong: true, at: now - DECAY_MS - 1 }], now);
    expect(tier).toEqual({ score: 0, tier: 'none' });
  });
});

describe('lost detector across full page loads', () => {
  afterEach(() => {
    vi.useRealTimers();
    sessionStorage.clear();
  });

  /** One full page load, in createPulse order: trail restored and page_view recorded before detectors start. */
  function loadPage(path: string, seen: Trigger[]) {
    history.pushState({}, '', path);
    const config = resolveConfig({ siteKey: 'pk_test', endpoint: 'http://api.test' });
    const transport = { send() {}, flush() {}, isOwnRequest: () => false } as unknown as Transport;
    const breadcrumbs = new Breadcrumbs(config.trailSize);
    const engine = new TriggerEngine(config, transport, breadcrumbs);
    breadcrumbs.add('page_view', { title: path });
    engine.onTrigger((t) => t.type === 'lost' && seen.push(t));
    const stop = lostDetector({ config, engine, breadcrumbs, transport, onTap: () => () => {}, lastTap: () => undefined });
    return { breadcrumbs, stop };
  }

  async function bounceThrough(paths: string[], seen: Trigger[], dwellMs = 1_500) {
    for (const path of paths) {
      const page = loadPage(path, seen);
      await vi.advanceTimersByTimeAsync(dwellMs);
      page.stop();
    }
  }

  it('prompts right after landing, not on the next 5s tick', async () => {
    vi.useFakeTimers();
    sessionStorage.clear();
    const seen: Trigger[] = [];
    let landedAt = 0;
    for (const path of ['/hotels', '/cars', '/flights', '/trips']) {
      const page = loadPage(path, seen);
      landedAt = Date.now();
      await vi.advanceTimersByTimeAsync(1_000);
      page.stop();
      if (seen.length) break;
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen[0].at - landedAt).toBeLessThan(1_000);
  });

  it('does not repeat a prompt the user already saw on every later page', async () => {
    vi.useFakeTimers();
    sessionStorage.clear();
    const seen: Trigger[] = [];
    await bounceThrough(['/hotels', '/cars', '/flights'], seen);
    expect(seen.map((t) => t.context.tier)).toEqual(['nudge']);
    // Stays long enough to see it (and close it), then keeps browsing at a normal pace.
    await bounceThrough(['/trips', '/hotel', '/support'], seen, 6_000);
    expect(seen.map((t) => t.context.tier)).toEqual(['nudge']);
  });

  it('shows again on the next page when the prompt fired as the last page was closing', async () => {
    vi.useFakeTimers();
    sessionStorage.clear();
    const seen: Trigger[] = [];
    await bounceThrough(['/hotels', '/cars'], seen);
    const page = loadPage('/flights', seen);
    await vi.advanceTimersByTimeAsync(100);
    page.stop();
    expect(seen).toHaveLength(1);
    const next = loadPage('/trips', seen);
    await vi.advanceTimersByTimeAsync(100);
    next.stop();
    expect(seen).toHaveLength(2);
  });

  it('prompts again after a closed prompt when the user does something else that looks lost', async () => {
    vi.useFakeTimers();
    sessionStorage.clear();
    const seen: Trigger[] = [];
    await bounceThrough(['/hotels', '/cars', '/flights', '/trips'], seen);
    const afterBounce = seen.length;
    expect(afterBounce).toBeGreaterThan(0);
    // More of the same bouncing (through new pages) is not new evidence.
    await bounceThrough(['/deals', '/stays'], seen);
    expect(seen).toHaveLength(afterBounce);
    // Asking for help is.
    const page = loadPage('/support', seen);
    await vi.advanceTimersByTimeAsync(2_000);
    page.breadcrumbs.add('click', { label: 'Help' });
    await vi.advanceTimersByTimeAsync(2_000);
    page.stop();
    expect(seen).toHaveLength(afterBounce + 1);
  });

  it('prompts again for a new episode once the score has dropped', async () => {
    vi.useFakeTimers();
    sessionStorage.clear();
    const seen: Trigger[] = [];
    await bounceThrough(['/hotels', '/cars', '/flights'], seen);
    expect(seen).toHaveLength(1);
    const calm = loadPage('/trips', seen);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    calm.stop();
    await bounceThrough(['/cars', '/hotels', '/flights', '/support'], seen);
    expect(seen.length).toBeGreaterThan(1);
  });
});
