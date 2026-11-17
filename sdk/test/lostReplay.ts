import { vi } from 'vitest';
import { lostDetector } from '../src/detectors/lost';
import type { Trigger } from '../src/types';
import type { LostReplayOutcome, ObservedTier } from './lostBenchmark';
import { setup } from './harness';
import { createTrail, tick, type LostScenario } from './lostScenarios';

function observedLost(triggers: Trigger[]): { tier: ObservedTier; wouldPrompt: boolean } {
  const lost = triggers.filter((t) => t.type === 'lost');
  if (!lost.length) return { tier: 'none', wouldPrompt: false };
  const last = lost[lost.length - 1]!;
  const tier = last.context.tier;
  const observed: ObservedTier = tier === 'full' || tier === 'nudge' ? tier : 'none';
  const wouldPrompt = observed !== 'none' && last.eligible;
  return { tier: observed, wouldPrompt };
}

export async function replayLostScenario(scenario: LostScenario): Promise<LostReplayOutcome> {
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
  const { tier, wouldPrompt } = observedLost(h.triggers);
  const overshoot =
    scenario.kind === 'stuck' && scenario.expectTier === 'nudge' && tier === 'full';
  return { scenario, tier, wouldPrompt, overshoot };
}
