import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lostDetector } from '../src/detectors/lost';
import type { Trigger } from '../src/types';
import { LOST_BASELINE, isLostTruePositive, measureLostBenchmark, type LostReplayOutcome, type ObservedTier } from './lostBenchmark';
import { setup } from './harness';
import { createTrail, lostScenarios, stuckUserStories, tick, type LostScenario } from './lostScenarios';

function observedTier(triggers: Trigger[]): ObservedTier {
  const lost = triggers.filter((t) => t.type === 'lost');
  if (!lost.length) return 'none';
  const last = lost[lost.length - 1]!;
  const tier = last.context.tier;
  return tier === 'full' || tier === 'nudge' ? tier : 'none';
}

async function replay(scenario: LostScenario): Promise<LostReplayOutcome> {
  sessionStorage.clear();
  document.body.innerHTML = scenario.html ?? '<div id="app"></div>';
  scenario.prepare?.();
  const h = setup(lostDetector);
  const trail = createTrail(h.breadcrumbs, tick);
  try {
    await scenario.play(trail);
    await vi.advanceTimersByTimeAsync(6_000);
  } finally {
    h.cleanup();
  }
  return { scenario, tier: observedTier(h.triggers) };
}

describe('stuck user stories (regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  for (const scenario of stuckUserStories) {
    it(`${scenario.id} should reach at least tier ${scenario.expectTier}`, async () => {
      const outcome = await replay(scenario);
      expect(isLostTruePositive(outcome), scenario.what).toBe(true);
    });
  }
});

describe('lost benchmark metrics', () => {
  const measured: ReturnType<typeof measureLostBenchmark> & { outcomes: LostReplayOutcome[] } = {
    outcomes: [],
    competentTotal: 0,
    stuckTotal: 0,
    falsePositiveRate: 0,
    falsePositiveCount: 0,
    falsePositiveIds: [],
    truePositiveRate: 0,
    truePositiveCount: 0,
    missedStuckIds: [],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    console.table({
      'competent stories': measured.competentTotal,
      'false-positive rate': measured.falsePositiveRate.toFixed(3),
      'false positives': `${measured.falsePositiveCount}/${measured.competentTotal}`,
      'stuck stories': measured.stuckTotal,
      'true-positive rate': measured.truePositiveRate.toFixed(3),
      'missed stuck': measured.missedStuckIds.join(', ') || '—',
      'competent FP ids': measured.falsePositiveIds.join(', ') || '—',
    });
  });

  it('meets definable TP/FP rates on the labeled story corpus', async () => {
    const outcomes: LostReplayOutcome[] = [];
    for (const scenario of lostScenarios) outcomes.push(await replay(scenario));

    const rates = measureLostBenchmark(outcomes);
    Object.assign(measured, rates, { outcomes });

    expect(
      rates.truePositiveRate,
      `true-positive rate (missed: ${rates.missedStuckIds.join(', ') || 'none'})`,
    ).toBeGreaterThanOrEqual(LOST_BASELINE.minTruePositiveRate);

    expect(
      rates.falsePositiveRate,
      `false-positive rate on competent navigation (FPs: ${rates.falsePositiveIds.join(', ') || 'none'})`,
    ).toBeLessThan(LOST_BASELINE.maxFalsePositiveRate);
  });
});
