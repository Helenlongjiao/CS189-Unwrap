import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deadClickDetector } from '../src/detectors/deadClick';
import { errorDetector } from '../src/detectors/errors';
import { rageClickDetector } from '../src/detectors/rageClick';
import type { Detector } from '../src/detectors/context';
import type { Trigger } from '../src/types';
import { setup } from './harness';
import { api, scenarios, type Scenario, type ScenarioDetector } from './scenarios';

const DETECTORS: Record<ScenarioDetector, Detector> = {
  rage_click: rageClickDetector,
  dead_click: deadClickDetector,
  error: errorDetector,
};

/**
 * Measured on these same scenarios with the detectors before scoring was added
 * (fixed thresholds only). Re-measure by checking out the commit before the scoring change.
 */
const BASELINE = {
  rage_click: { truePositive: 6 / 6, falsePositive: 7 / 8 },
  dead_click: { truePositive: 5 / 5, falsePositive: 5 / 7 },
  error: { truePositive: 5 / 5, falsePositive: 7 / 9 },
} as const;

interface Outcome {
  scenario: Scenario;
  prompted: boolean;
  recorded: Trigger[];
}

const outcomes: Outcome[] = [];

const realFetch = window.fetch;
const realConsoleError = console.error;

async function replay(scenario: Scenario): Promise<Outcome> {
  sessionStorage.clear();
  document.body.innerHTML = scenario.html;
  console.error = vi.fn();
  window.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
  scenario.prepare?.();
  const h = setup(DETECTORS[scenario.detector]);
  try {
    await scenario.play(api);
    await vi.advanceTimersByTimeAsync(2000);
  } finally {
    h.cleanup();
  }
  const mine = h.triggers.filter((t) => t.type === scenario.detector);
  return { scenario, prompted: mine.some((t) => !t.recordOnly), recorded: mine };
}

describe('detector scenarios (demo-site cases)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    window.fetch = realFetch;
    console.error = realConsoleError;
    vi.useRealTimers();
  });

  for (const scenario of scenarios) {
    it(`${scenario.detector}: ${scenario.id} should ${scenario.expect === 'prompt' ? 'prompt' : 'stay quiet'}`, async () => {
      const outcome = await replay(scenario);
      outcomes.push(outcome);
      expect(outcome.prompted, scenario.what).toBe(scenario.expect === 'prompt');
    });
  }
});

describe('measured rates', () => {
  afterAll(() => {
    const rows = (Object.keys(DETECTORS) as ScenarioDetector[]).map((detector) => {
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
      for (const detector of Object.keys(DETECTORS) as ScenarioDetector[]) {
        const mine = scenarios.filter((s) => s.detector === detector);
        const results = [];
        for (const scenario of mine) results.push(await replay(scenario));
        window.fetch = realFetch;
        console.error = realConsoleError;

        const should = results.filter((o) => o.scenario.expect === 'prompt');
        const shouldNot = results.filter((o) => o.scenario.expect === 'quiet');
        const truePositive = should.filter((o) => o.prompted).length / should.length;
        const falsePositive = shouldNot.filter((o) => o.prompted).length / shouldNot.length;

        expect(truePositive, `${detector} true-positive rate`).toBeGreaterThan(0.9);
        expect(falsePositive, `${detector} false-positive rate`).toBeLessThan(BASELINE[detector].falsePositive);
      }
    } finally {
      vi.useRealTimers();
    }
  });
});
