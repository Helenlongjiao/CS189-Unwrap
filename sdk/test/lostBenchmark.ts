import type { CompetentTag, LostScenario } from './lostScenarios';

export type ObservedTier = 'none' | 'nudge' | 'full';

export interface LostReplayOutcome {
  scenario: LostScenario;
  tier: ObservedTier;
  /** Lost tier fired and trigger was eligible under prompt budgets. */
  wouldPrompt: boolean;
  /** Expected nudge but reached full. */
  overshoot: boolean;
}

/**
 * ## Lost detector benchmark
 *
 * **False positive:** competent story where lost reaches `nudge` or `full`.
 * **False positive (prompt):** competent story with `wouldPrompt` (eligible lost trigger).
 * **Weighted FP:** sum of weights (full=1, nudge=0.5) / competent count.
 *
 * **Overshoot rate:** among stuck stories with `expectTier: 'nudge'`, fraction that reached `full` (count: overshoots nudge→full).
 *
 * Stories with `heldOut: true` are excluded from CI gates but reported separately.
 */
export function isLostFalsePositive(tier: ObservedTier): boolean {
  return tier === 'nudge' || tier === 'full';
}

export function tierWeight(tier: ObservedTier): number {
  if (tier === 'full') return 1;
  if (tier === 'nudge') return 0.5;
  return 0;
}

export function isLostTruePositive(outcome: LostReplayOutcome): boolean {
  if (outcome.scenario.kind !== 'stuck') return false;
  const expected = outcome.scenario.expectTier;
  if (expected === 'full') return outcome.tier === 'full';
  return outcome.tier === 'nudge' || outcome.tier === 'full';
}

function tagFalsePositiveCounts(competent: LostReplayOutcome[]): Record<CompetentTag, { total: number; falsePositives: number }> {
  const tags: CompetentTag[] = ['shopping', 'reading', 'search', 'forms', 'banking'];
  const out = Object.fromEntries(tags.map((t) => [t, { total: 0, falsePositives: 0 }])) as Record<
    CompetentTag,
    { total: number; falsePositives: number }
  >;
  for (const row of competent) {
    if (row.scenario.kind !== 'competent_navigation') continue;
    for (const tag of row.scenario.tags) {
      out[tag].total += 1;
      if (isLostFalsePositive(row.tier)) out[tag].falsePositives += 1;
    }
  }
  return out;
}

export function measureLostBenchmark(results: LostReplayOutcome[]) {
  const competent = results.filter((r) => r.scenario.kind === 'competent_navigation');
  const stuck = results.filter((r) => r.scenario.kind === 'stuck');

  const falsePositiveIds = competent.filter((r) => isLostFalsePositive(r.tier)).map((r) => r.scenario.id);
  const falsePositiveRate = competent.length ? falsePositiveIds.length / competent.length : 0;

  const eligibleFalsePositiveIds = competent.filter((r) => r.wouldPrompt).map((r) => r.scenario.id);
  const eligibleFalsePositiveRate = competent.length ? eligibleFalsePositiveIds.length / competent.length : 0;

  const weightedFalsePositiveRate = competent.length
    ? competent.reduce((sum, r) => sum + tierWeight(r.tier), 0) / competent.length
    : 0;

  const truePositiveIds = stuck.filter((r) => isLostTruePositive(r)).map((r) => r.scenario.id);
  const missedStuckIds = stuck.filter((r) => !isLostTruePositive(r)).map((r) => r.scenario.id);
  const truePositiveRate = stuck.length ? truePositiveIds.length / stuck.length : 1;
  const overshootIds = stuck.filter((r) => r.overshoot).map((r) => r.scenario.id);
  const nudgeExpected = stuck.filter((r) => r.scenario.expectTier === 'nudge');
  const overshootCount = nudgeExpected.filter((r) => r.overshoot).length;
  const overshootRate = nudgeExpected.length ? overshootCount / nudgeExpected.length : 0;

  return {
    competentTotal: competent.length,
    stuckTotal: stuck.length,
    falsePositiveRate,
    falsePositiveCount: falsePositiveIds.length,
    falsePositiveIds,
    eligibleFalsePositiveRate,
    eligibleFalsePositiveIds,
    weightedFalsePositiveRate,
    falsePositiveByTag: tagFalsePositiveCounts(competent),
    truePositiveRate,
    truePositiveCount: truePositiveIds.length,
    missedStuckIds,
    overshootIds,
    nudgeExpectedTotal: nudgeExpected.length,
    overshootCount,
    overshootRate,
  };
}

/**
 * CI ceilings for FP, eligible prompt FP, weighted FP, and overshoot rates. Taken from a run of the first version of lostness detector.
 */
export const LOST_BASELINE = {
  maxFalsePositiveRate: 11 / 17,
  maxEligibleFalsePositiveRate: 11 / 17,
  maxWeightedFalsePositiveRate: 0.34,
  maxOvershootRate: 4 / 6,
  minTruePositiveRate: 0.9,
} as const;
/** Snapshot of the last baseline run */
export const LOST_BASELINE_SNAPSHOT = {
  measuredFalsePositiveRate: 10 / 17,
  measuredEligibleFalsePositiveRate: 10 / 17,
  measuredWeightedFalsePositiveRate: 0.324,
  measuredTruePositiveRate: 14 / 14,
  measuredOvershootRate: 3 / 6,
  competentTotal: 17,
  stuckTotal: 14,
  measuredAt: '2026-03-11',
} as const;
