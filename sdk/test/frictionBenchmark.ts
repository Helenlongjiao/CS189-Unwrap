import type { ScenarioDetector } from './scenarios';
import type { FrictionReplayOutcome } from './scenarioReplay';

export interface FrictionDetectorRates {
  detector: ScenarioDetector;
  truePositiveRate: number;
  falsePositiveRate: number;
  truePositiveCount: number;
  truePositiveTotal: number;
  falsePositiveCount: number;
  falsePositiveTotal: number;
  falsePositiveIds: string[];
}

export interface FrictionBenchmarkReport {
  byDetector: FrictionDetectorRates[];
  overallFalsePositiveRate: number;
  overallTruePositiveRate: number;
}

export function measureFrictionBenchmark(results: FrictionReplayOutcome[]): FrictionBenchmarkReport {
  const detectors: ScenarioDetector[] = ['rage_click', 'dead_click', 'error'];
  const byDetector = detectors.map((detector) => {
    const mine = results.filter((r) => r.scenario.detector === detector);
    const should = mine.filter((r) => r.scenario.expect === 'prompt');
    const shouldNot = mine.filter((r) => r.scenario.expect === 'quiet');
    const falsePositiveIds = shouldNot.filter((r) => r.prompted).map((r) => r.scenario.id);
    return {
      detector,
      truePositiveRate: should.length ? should.filter((r) => r.prompted).length / should.length : 1,
      falsePositiveRate: shouldNot.length ? falsePositiveIds.length / shouldNot.length : 0,
      truePositiveCount: should.filter((r) => r.prompted).length,
      truePositiveTotal: should.length,
      falsePositiveCount: falsePositiveIds.length,
      falsePositiveTotal: shouldNot.length,
      falsePositiveIds,
    };
  });

  const allPrompt = results.filter((r) => r.scenario.expect === 'prompt');
  const allQuiet = results.filter((r) => r.scenario.expect === 'quiet');

  return {
    byDetector,
    overallTruePositiveRate: allPrompt.length ? allPrompt.filter((r) => r.prompted).length / allPrompt.length : 1,
    overallFalsePositiveRate: allQuiet.length ? allQuiet.filter((r) => r.prompted).length / allQuiet.length : 0,
  };
}
