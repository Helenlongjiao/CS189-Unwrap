import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LOST_BASELINE,
  isLostTruePositive,
  measureLostBenchmark,
  type LostReplayOutcome,
} from './lostBenchmark';
import { replayLostScenario } from './lostReplay';
import { ciLostScenarios, heldOutLostScenarios, lostScenarios, lostTruePositiveTargets } from './lostScenarios';

async function replayAll(scenarios: typeof lostScenarios): Promise<LostReplayOutcome[]> {
  const out: LostReplayOutcome[] = [];
  for (const scenario of scenarios) out.push(await replayLostScenario(scenario));
  return out;
}

describe('stuck user stories (regression)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  for (const scenario of lostTruePositiveTargets) {
    it(`${scenario.id} should reach at least tier ${scenario.expectTier}`, async () => {
      const outcome = await replayLostScenario(scenario);
      expect(isLostTruePositive(outcome), scenario.what).toBe(true);
    });
  }
});

describe('lost benchmark metrics (CI corpus)', () => {
  const measured: ReturnType<typeof measureLostBenchmark> = {
    competentTotal: 0,
    stuckTotal: 0,
    falsePositiveRate: 0,
    falsePositiveCount: 0,
    falsePositiveIds: [],
    eligibleFalsePositiveRate: 0,
    eligibleFalsePositiveIds: [],
    weightedFalsePositiveRate: 0,
    falsePositiveByTag: {} as never,
    truePositiveRate: 0,
    truePositiveCount: 0,
    missedStuckIds: [],
    overshootIds: [],
    nudgeExpectedTotal: 0,
    overshootCount: 0,
    overshootRate: 0,
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
      'competent (CI)': measured.competentTotal,
      'FP rate': measured.falsePositiveRate.toFixed(3),
      'FP rate (eligible prompt)': measured.eligibleFalsePositiveRate.toFixed(3),
      'FP rate (weighted)': measured.weightedFalsePositiveRate.toFixed(3),
      'false positives': `${measured.falsePositiveCount}/${measured.competentTotal}`,
      'stuck (CI)': measured.stuckTotal,
      'TP rate': measured.truePositiveRate.toFixed(3),
      'overshoot rate': measured.overshootRate.toFixed(3),
      'overshoots (nudge→full)': `${measured.overshootCount}/${measured.nudgeExpectedTotal}`,
      'overshoot ids': measured.overshootIds.join(', ') || '—',
      'FP ids': measured.falsePositiveIds.join(', ') || '—',
    });
    if (Object.keys(measured.falsePositiveByTag).length) console.table(measured.falsePositiveByTag);
  });

  it('meets definable TP/FP rates on the CI-labeled corpus', async () => {
    const outcomes = await replayAll(ciLostScenarios);
    const rates = measureLostBenchmark(outcomes);
    Object.assign(measured, rates);

    expect(rates.truePositiveRate, `missed stuck: ${rates.missedStuckIds.join(', ') || 'none'}`).toBeGreaterThanOrEqual(
      LOST_BASELINE.minTruePositiveRate,
    );
    expect(
      rates.falsePositiveRate,
      `FPs: ${rates.falsePositiveIds.join(', ') || 'none'}`,
    ).toBeLessThan(LOST_BASELINE.maxFalsePositiveRate);
    expect(
      rates.eligibleFalsePositiveRate,
      `eligible FPs: ${rates.eligibleFalsePositiveIds.join(', ') || 'none'}`,
    ).toBeLessThan(LOST_BASELINE.maxEligibleFalsePositiveRate);
    expect(rates.weightedFalsePositiveRate).toBeLessThan(LOST_BASELINE.maxWeightedFalsePositiveRate);
    expect(
      rates.overshootRate,
      `overshoots (nudge→full): ${rates.overshootIds.join(', ') || 'none'}`,
    ).toBeLessThan(LOST_BASELINE.maxOvershootRate);
  });
});

describe('held-out lost stories', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports metrics without failing CI', async () => {
    const outcomes = await replayAll(heldOutLostScenarios);
    const rates = measureLostBenchmark(outcomes);
    console.info('[held-out]', heldOutLostScenarios.map((s) => s.id).join(', '));
    console.table(rates);
    expect(heldOutLostScenarios.length).toBeGreaterThan(0);
    expect(rates.stuckTotal + rates.competentTotal).toBe(heldOutLostScenarios.length);
  });
});
