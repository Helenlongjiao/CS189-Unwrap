import { vi } from 'vitest';
import { deadClickDetector } from '../src/detectors/deadClick';
import { errorDetector } from '../src/detectors/errors';
import { rageClickDetector } from '../src/detectors/rageClick';
import type { Detector } from '../src/detectors/context';
import type { Trigger } from '../src/types';
import { setup } from './harness';
import { api, scenarios, type Scenario, type ScenarioDetector } from './scenarios';

export const FRICTION_DETECTORS: Record<ScenarioDetector, Detector> = {
  rage_click: rageClickDetector,
  dead_click: deadClickDetector,
  error: errorDetector,
};

export const FRICTION_BASELINE = {
  rage_click: { truePositive: 6 / 6, falsePositive: 7 / 8 },
  dead_click: { truePositive: 5 / 5, falsePositive: 5 / 7 },
  error: { truePositive: 5 / 5, falsePositive: 7 / 9 },
} as const;

export interface FrictionReplayOutcome {
  scenario: Scenario;
  prompted: boolean;
  eligiblePrompt: boolean;
  recorded: Trigger[];
}

const realFetch = window.fetch;
const realConsoleError = console.error;

export async function replayFrictionScenario(scenario: Scenario): Promise<FrictionReplayOutcome> {
  sessionStorage.clear();
  document.body.innerHTML = scenario.html;
  console.error = vi.fn();
  window.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as typeof fetch;
  scenario.prepare?.();
  const h = setup(FRICTION_DETECTORS[scenario.detector]);
  try {
    await scenario.play(api);
    await vi.advanceTimersByTimeAsync(2000);
  } finally {
    h.cleanup();
  }
  const mine = h.triggers.filter((t) => t.type === scenario.detector);
  const prompted = mine.some((t) => !t.recordOnly && t.eligible);
  return {
    scenario,
    prompted: mine.some((t) => !t.recordOnly),
    eligiblePrompt: prompted,
    recorded: mine,
  };
}

export function restoreFrictionMocks() {
  window.fetch = realFetch;
  console.error = realConsoleError;
}

export { scenarios };
