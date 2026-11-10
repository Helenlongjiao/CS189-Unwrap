/** Points for a small nudge, and for opening the full guide. */
export const NUDGE_SCORE = 20;
export const FULL_SCORE = 50;
/** Points fade to zero over this long, so an old hop does not linger. */
export const DECAY_MS = 4 * 60_000;
/**
 * Distinct pages in a return before it counts as a circle.
 * A longer return scores more. Related pages (a catalog, add and drop) need `RELATED_CIRCLE_PAGES`.
 */
export const MIN_CIRCLE_PAGES = 4;
export const RELATED_CIRCLE_PAGES = 6;

/**
 * How circles inside the site's `reading` paths are scored.
 * `ignore` — documentation circles are reading.
 * `soft` — they count, at half the weight of a circle anywhere else.
 * `lost` — they count like any other circle.
 */
export type ReadingCircles = 'ignore' | 'soft' | 'lost';

export interface LostRuleOverride {
  weight?: number;
  when?: {
    count?: number;
    windowMs?: number;
    pages?: number;
    gapMs?: number;
    dwellMs?: number;
    fields?: number;
    range?: number;
    settleMs?: number;
    clickMs?: number;
    idleMs?: number;
    span?: number;
  };
}

/**
 * Knobs a website owner can set in `Pulse.init({ lost })`.
 * Unset fields keep the defaults. `rules` overrides one rule at a time
 * (`dwell-flat` and `scroll-thrash` start at weight 0, because reading a page is not lostness).
 * `disabled` turns rules off by id.
 */
export interface LostTuning {
  nudgeScore: number;
  fullScore: number;
  decayMs: number;
  readingCircles: ReadingCircles;
  /** Distinct pages an unrelated circle must cover. Related pages use `relatedCirclePages`. */
  minCirclePages: number;
  /** Distinct pages a circle inside one related area must cover, such as a catalog or add and drop. */
  relatedCirclePages: number;
  disabled?: string[];
  rules?: Record<string, LostRuleOverride>;
}

export const DEFAULT_LOST: LostTuning = {
  nudgeScore: NUDGE_SCORE,
  fullScore: FULL_SCORE,
  decayMs: DECAY_MS,
  readingCircles: 'ignore',
  minCirclePages: MIN_CIRCLE_PAGES,
  relatedCirclePages: RELATED_CIRCLE_PAGES,
};
