import { describe, expect, it } from 'vitest';
import { LOST_PATTERNS, evaluateLost } from '../src/detectors/lostPatterns';
import { DECAY_MS, FULL_SCORE, NUDGE_SCORE, emptySnapshot, lostTier, type LostSnapshot } from '../src/detectors/lostScore';

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
