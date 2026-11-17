import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { measureFrictionBenchmark } from './frictionBenchmark';
import {
  FRICTION_BASELINE,
  replayFrictionScenario,
  restoreFrictionMocks,
  type FrictionReplayOutcome,
} from './scenarioReplay';
import { independentScenarios } from './independentScenarios';
import { ciScenarios, heldOutScenarios, regressionScenarios, type Scenario } from './scenarios';

async function replayAll(list: Scenario[]): Promise<FrictionReplayOutcome[]> {
  const out: FrictionReplayOutcome[] = [];
  for (const scenario of list) out.push(await replayFrictionScenario(scenario));
  return out;
}

function table(report: ReturnType<typeof measureFrictionBenchmark>) {
  return report.byDetector.map((d) => ({
    detector: d.detector,
    'true-positive': `${d.truePositiveCount}/${d.truePositiveTotal}`,
    'false-positive': `${d.falsePositiveCount}/${d.falsePositiveTotal}`,
    'false-positive ids': d.falsePositiveIds.join(', ') || '—',
  }));
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  restoreFrictionMocks();
  vi.useRealTimers();
});

describe('detector scenarios (demo-site cases and regression guards)', () => {
  for (const scenario of [...ciScenarios, ...regressionScenarios]) {
    it(`${scenario.detector}: ${scenario.id} should ${scenario.expect === 'prompt' ? 'prompt' : 'stay quiet'}`, async () => {
      const outcome = await replayFrictionScenario(scenario);
      expect(outcome.prompted, scenario.what).toBe(scenario.expect === 'prompt');
    });
  }
});

describe('friction benchmark (CI corpus)', () => {
  it('keeps the true-positive rate above 90% and cuts false positives against the baseline', async () => {
    const report = measureFrictionBenchmark(await replayAll(ciScenarios));
    console.table(table(report));
    console.table({
      'overall true-positive': report.overallTruePositiveRate.toFixed(3),
      'overall false-positive': report.overallFalsePositiveRate.toFixed(3),
    });

    for (const d of report.byDetector) {
      expect(d.truePositiveRate, `${d.detector} true-positive rate`).toBeGreaterThan(0.9);
      expect(d.falsePositiveRate, `${d.detector} false-positive rate`).toBeLessThan(
        FRICTION_BASELINE[d.detector].falsePositive,
      );
    }
  });

  it('never prompts more than once per quiet scenario (no duplicate prompts)', async () => {
    const outcomes = await replayAll(ciScenarios.filter((s) => s.expect === 'quiet'));
    for (const o of outcomes) {
      const prompts = o.recorded.filter((t) => !t.recordOnly);
      expect(prompts.length, o.scenario.id).toBe(0);
    }
  });
});

function report(label: string, list: Scenario[], outcomes: FrictionReplayOutcome[]) {
  const result = measureFrictionBenchmark(outcomes);
  const wrong = outcomes
    .filter((o) => o.prompted !== (o.scenario.expect === 'prompt'))
    .map((o) => `${o.scenario.id} (${o.scenario.expect === 'prompt' ? 'missed' : 'false alarm'})`);
  console.log(`[${label}]`, list.length, 'scenarios; wrong:', wrong.join(', ') || 'none');
  console.table(table(result));
}

describe('held-out scenarios (reported only, never tuned against)', () => {
  it('site-derived: written from the demo sites after tuning', async () => {
    const outcomes = await replayAll(heldOutScenarios);
    report('held-out, site-derived', heldOutScenarios, outcomes);
    expect(outcomes.length).toBe(heldOutScenarios.length);
  });

  it('independent: written without reading the detector code', async () => {
    const outcomes = await replayAll(independentScenarios);
    report('held-out, independent', independentScenarios, outcomes);
    // Reported, not gated: a miss here is information about the detectors, not a test failure.
    expect(outcomes.length).toBe(independentScenarios.length);
  });
});
