/**
 * Shared evidence scoring. Detectors turn what they see into weighted evidence; points fade with
 * age; related evidence is counted once; the total is compared with a threshold.
 * Used by the lost detector (lostScore.ts) and by the rage click, dead click and error detectors.
 */

/** Points older than this fade to zero, so something from half an hour ago does not linger. */
export const DECAY_MS = 4 * 60_000;

export interface Evidence {
  /** `hop-3-30s` and `hop-4-45s` share a family (`hop`): one behavior seen at two windows. */
  id: string;
  /** Points when fresh. Negative weights are damping signals (evidence the user is not stuck). */
  weight: number;
  at: number;
  strong?: boolean;
}

/** Name part of an id before the first segment that starts with a digit. */
export function patternFamily(id: string): string {
  const name: string[] = [];
  for (const part of id.split('-')) {
    if (/^\d/.test(part)) break;
    name.push(part);
  }
  return name.join('-') || id;
}

/** Points still counted: full weight when fresh, fading linearly to zero after `decayMs`. */
export function pointsLeft(evidence: Evidence, now: number, decayMs = DECAY_MS): number {
  const age = Math.max(0, now - evidence.at);
  return evidence.weight * Math.max(0, 1 - age / decayMs);
}

/** Per family, only the evidence with the most points left counts; the rest are summed. Never below 0. */
export function totalScore(evidence: Evidence[], now: number, decayMs = DECAY_MS): number {
  const best = new Map<string, Evidence>();
  for (const item of evidence) {
    const family = patternFamily(item.id);
    const current = best.get(family);
    if (!current || Math.abs(pointsLeft(item, now, decayMs)) > Math.abs(pointsLeft(current, now, decayMs))) best.set(family, item);
  }
  let score = 0;
  for (const item of best.values()) score += pointsLeft(item, now, decayMs);
  return Math.max(0, Math.round(score));
}

export interface ScoreResult {
  score: number;
  /** Counted evidence as `id:points`, strongest first, for debugging and analysis. */
  signals: string[];
}

/** Like `totalScore`, but also explains which evidence produced the points. */
export function explainScore(evidence: Evidence[], now: number, decayMs = DECAY_MS): ScoreResult {
  const signals = evidence
    .map((item) => ({ id: item.id, points: Math.round(pointsLeft(item, now, decayMs)) }))
    .filter((item) => item.points !== 0)
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .map((item) => `${item.id}:${item.points}`);
  return { score: totalScore(evidence, now, decayMs), signals };
}

/**
 * Evidence remembered across events, e.g. an earlier dead click on the same button. Remembered
 * points decay like any other. `score(now, extra)` adds this moment's evidence without storing it.
 */
export class Ledger {
  private items: Evidence[] = [];

  constructor(private decayMs = DECAY_MS) {}

  add(id: string, weight: number, at: number, strong = false) {
    this.items = this.items.filter((item) => item.id !== id);
    this.items.push({ id, weight, at, strong });
  }

  /** Remembered evidence that still has points left. */
  active(now: number): Evidence[] {
    this.items = this.items.filter((item) => pointsLeft(item, now, this.decayMs) !== 0 || item.weight === 0);
    return this.items.slice();
  }

  score(now: number, extra: Evidence[] = []): ScoreResult {
    return explainScore([...this.active(now), ...extra], now, this.decayMs);
  }
}
