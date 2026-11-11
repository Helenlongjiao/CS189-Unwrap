import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScenarioDetector } from './scenarios';
import { FRICTION_BASELINE, replayFrictionScenario, restoreFrictionMocks, scenarios } from './scenarioReplay';

interface Outcome {
  scenario: (typeof scenarios)[number];
  prompted: boolean;
}

const outcomes: Outcome[] = [];

describe('detector scenarios (demo-site cases)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    restoreFrictionMocks();
    vi.useRealTimers();
  });

  for (const scenario of scenarios) {
    it(`${scenario.detector}: ${scenario.id} should ${scenario.expect === 'prompt' ? 'prompt' : 'stay quiet'}`, async () => {
      const outcome = await replayFrictionScenario(scenario);
      outcomes.push({ scenario: outcome.scenario, prompted: outcome.prompted });
      expect(outcome.prompted, scenario.what).toBe(scenario.expect === 'prompt');
    });
  }
});

describe('measured rates', () => {
  afterAll(() => {
    const rows = (['rage_click', 'dead_click', 'error'] as ScenarioDetector[]).map((detector) => {
      const mine = outcomes.filter((o) => o.scenario.detector === detector);
      const should = mine.filter((o) => o.scenario.expect === 'prompt');
      const shouldNot = mine.filter((o) => o.scenario.expect === 'quiet');
      return {
        detector,
        'true-positive': `${should.filter((o) => o.prompted).length}/${should.length}`,
        'false-positive': `${shouldNot.filter((o) => o.prompted).length}/${shouldNot.length}`,
      };
    });
    console.table(rows);
  });

  it('keeps the true-positive rate above 90% and cuts false positives against the baseline', async () => {
    vi.useFakeTimers();
    try {
      for (const detector of ['rage_click', 'dead_click', 'error'] as ScenarioDetector[]) {
        const mine = scenarios.filter((s) => s.detector === detector);
        const results = [];
        for (const scenario of mine) results.push(await replayFrictionScenario(scenario));
        restoreFrictionMocks();

        const should = results.filter((o) => o.scenario.expect === 'prompt');
        const shouldNot = results.filter((o) => o.scenario.expect === 'quiet');
        const truePositive = should.filter((o) => o.prompted).length / should.length;
        const falsePositive = shouldNot.filter((o) => o.prompted).length / shouldNot.length;

        expect(truePositive, `${detector} true-positive rate`).toBeGreaterThan(0.9);
        expect(falsePositive, `${detector} false-positive rate`).toBeLessThan(FRICTION_BASELINE[detector].falsePositive);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
