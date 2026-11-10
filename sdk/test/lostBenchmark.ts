import type { LostScenario } from './lostScenarios';

export type ObservedTier = 'none' | 'nudge' | 'full';

/** Competent navigation that must not be treated as “lost” (see stories tagged in `lostScenarios.ts`). */
export type CompetentNavigationStory = LostScenario & { kind: 'competent_navigation' };

/** User is actually stuck; we expect a nudge or full lost tier. */
export type StuckUserStory = LostScenario & { kind: 'stuck'; expectTier: 'nudge' | 'full' };

export interface LostReplayOutcome {
  scenario: LostScenario;
  tier: ObservedTier;
}

/**
 * ## Lost detector benchmark (false positives)
 *
 * **Corpus:** replayable user stories in `lostScenarios.ts`, labeled by humans.
 *
 * **False positive:** `competent_navigation` story where the detector fires (`tier` is `nudge` or `full`).
 * Any prompt on normal shopping, reading, searching-with-click, or completing a form counts.
 *
 * **False positive rate:** `FP / competent_navigation_stories` (0–1). Lower is better.
 *
 * **True positive:** `stuck` story where `tier` matches `expectTier` (at least `nudge` when `nudge` expected).
 *
 * **True positive rate:** `TP / stuck_stories` (0–1). Higher is better.
 *
 * CI gates use `LOST_BASELINE`: recall must stay above `minTruePositiveRate`; FP rate must not exceed
 * `maxFalsePositiveRate` (a frozen ceiling from the last intentional baseline run, not “zero FPs”).
 */
export function isLostFalsePositive(tier: ObservedTier): boolean {
  return tier === 'nudge' || tier === 'full';
}

export function isLostTruePositive(outcome: LostReplayOutcome): boolean {
  if (outcome.scenario.kind !== 'stuck') return false;
  const expected = outcome.scenario.expectTier;
  if (expected === 'full') return outcome.tier === 'full';
  return outcome.tier === 'nudge' || outcome.tier === 'full';
}

export function measureLostBenchmark(results: LostReplayOutcome[]) {
  const competent = results.filter((r) => r.scenario.kind === 'competent_navigation');
  const stuck = results.filter((r) => r.scenario.kind === 'stuck');

  const falsePositiveIds = competent.filter((r) => isLostFalsePositive(r.tier)).map((r) => r.scenario.id);
  const falsePositiveRate = competent.length ? falsePositiveIds.length / competent.length : 0;

  const truePositiveIds = stuck.filter((r) => isLostTruePositive(r)).map((r) => r.scenario.id);
  const missedStuckIds = stuck.filter((r) => !isLostTruePositive(r)).map((r) => r.scenario.id);
  const truePositiveRate = stuck.length ? truePositiveIds.length / stuck.length : 1;

  return {
    competentTotal: competent.length,
    stuckTotal: stuck.length,
    falsePositiveRate,
    falsePositiveCount: falsePositiveIds.length,
    falsePositiveIds,
    truePositiveRate,
    truePositiveCount: truePositiveIds.length,
    missedStuckIds,
  };
}

/**
 * Frozen reference rates. Re-measure with `npm test -- lostScenarios` when the corpus changes.
 *
 * `maxFalsePositiveRate` is an upper bound from a prior run (not zero): CI requires the live rate to
 * be **strictly below** this value so improvements are mandatory; tighten this number when FPs drop.
 */
export const LOST_BASELINE = {
  maxFalsePositiveRate: 5 / 8,
  minTruePositiveRate: 0.9,
} as const;

/** Snapshot of the last baseline run (for dashboards / docs); not used as CI gate. */
export const LOST_BASELINE_SNAPSHOT = {
  measuredFalsePositiveRate: 4 / 8,
  measuredTruePositiveRate: 6 / 6,
  measuredAt: '2026-03-11',
} as const;
