import { DECAY_MS, patternFamily, totalScore } from '../scoring';
import type { Breadcrumb } from '../types';

// Decay, families and summing live in ../scoring so other detectors score the same way.
export { DECAY_MS, patternFamily };
export const NUDGE_SCORE = 20;
export const FULL_SCORE = 50;

export interface LostPage {
  at: number;
  url: string;
  title: string;
}
export interface LostClick {
  at: number;
  url: string;
  label: string;
}
export interface LostFocus {
  at: number;
  url: string;
  field: string;
}
export interface LostError {
  at: number;
  url: string;
  kind: string;
}
export interface LostScroll {
  at: number;
  url: string;
  y: number;
}
export interface LostSearch {
  at: number;
  query: string;
}

export interface LostSnapshot {
  now: number;
  pages: LostPage[];
  clicks: LostClick[];
  focuses: LostFocus[];
  submits: { at: number; url: string }[];
  errors: LostError[];
  scrolls: LostScroll[];
  searches: LostSearch[];
}

export interface LostMatch {
  id: string;
  weight: number;
  strong: boolean;
  at: number;
}

export function lostTier(matches: LostMatch[], now: number): { score: number; tier: 'none' | 'nudge' | 'full' } {
  const score = totalScore(matches, now);
  const tier = score >= FULL_SCORE ? 'full' : score >= NUDGE_SCORE ? 'nudge' : 'none';
  return { score, tier };
}

export function pageKey(url: string): string {
  try {
    const u = new URL(url, 'http://local.invalid');
    const path = u.pathname.replace(/\/$/, '');
    return path || '/';
  } catch {
    return url;
  }
}

export function inWindow<T extends { at: number }>(items: T[], now: number, ms: number): T[] {
  return items.filter((item) => now - item.at <= ms && now - item.at >= 0);
}

export function collapsedPages(pages: LostPage[], now: number, ms: number): { key: string; at: number }[] {
  const seq: { key: string; at: number }[] = [];
  for (const page of inWindow(pages, now, ms)) {
    const key = pageKey(page.url);
    if (seq[seq.length - 1]?.key !== key) seq.push({ key, at: page.at });
  }
  return seq;
}

/** How many times two pages alternate (A B A B is 3). */
export function alternatingSwitches(seq: { key: string }[]): number {
  let best = 0;
  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i].key;
    const b = seq[i + 1].key;
    if (a === b) continue;
    let switches = 1;
    for (let j = i + 2; j < seq.length; j++) {
      const expected = switches % 2 === 1 ? a : b;
      if (seq[j].key !== expected) break;
      switches++;
    }
    best = Math.max(best, switches);
  }
  return best;
}

/** A cycle that returns to its start, with every middle page distinct (A B C A). */
export function hasReturnCycle(seq: { key: string }[], span: number): boolean {
  for (let i = 0; i + span - 1 < seq.length; i++) {
    const w = seq.slice(i, i + span);
    if (w[0].key !== w[w.length - 1].key) continue;
    const mid = new Set(w.slice(0, -1).map((step) => step.key));
    if (mid.size === span - 1) return true;
  }
  return false;
}

export function quickReturns(pages: LostPage[], now: number, gapMs: number, windowMs: number): number {
  const seq = collapsedPages(pages, now, windowMs);
  let count = 0;
  for (let i = 2; i < seq.length; i++) {
    if (seq[i].key === seq[i - 2].key && seq[i].key !== seq[i - 1].key && seq[i].at - seq[i - 1].at <= gapMs) count++;
  }
  return count;
}

export function bounces(pages: LostPage[], now: number, maxDwell: number, windowMs: number): number {
  const raw = inWindow(pages, now, windowMs);
  let count = 0;
  for (let i = 0; i < raw.length - 1; i++) {
    const gap = raw[i + 1].at - raw[i].at;
    if (gap >= 0 && gap <= maxDwell && pageKey(raw[i].url) !== pageKey(raw[i + 1].url)) count++;
  }
  return count;
}

export function maxVisits(pages: LostPage[], now: number, windowMs: number): number {
  const counts = new Map<string, number>();
  for (const page of inWindow(pages, now, windowMs)) {
    const key = pageKey(page.url);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values());
}

export function distinctPages(pages: LostPage[], now: number, windowMs: number): number {
  return new Set(inWindow(pages, now, windowMs).map((page) => pageKey(page.url))).size;
}

const HELP = /\b(help|faq|support|contact)\b/i;

export function helpClicks(snapshot: LostSnapshot, ms: number): number {
  return inWindow(snapshot.clicks, snapshot.now, ms).filter((click) => HELP.test(click.label)).length;
}

export function clicksWithoutNavigation(snapshot: LostSnapshot, ms: number): number {
  const clicks = inWindow(snapshot.clicks, snapshot.now, ms);
  const keys = new Set(inWindow(snapshot.pages, snapshot.now, ms).map((page) => pageKey(page.url)));
  if (keys.size > 1) return 0;
  return clicks.length;
}

export function repeatedLabel(snapshot: LostSnapshot, ms: number, times: number): boolean {
  const counts = new Map<string, number>();
  for (const click of inWindow(snapshot.clicks, snapshot.now, ms)) {
    const label = click.label.trim().toLowerCase();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.values()].some((count) => count >= times);
}

export function scrollReversals(snapshot: LostSnapshot, ms: number): number {
  const points = inWindow(snapshot.scrolls, snapshot.now, ms);
  let reversals = 0;
  let dir = 0;
  for (let i = 1; i < points.length; i++) {
    const dy = points[i].y - points[i - 1].y;
    if (Math.abs(dy) < 40) continue;
    const next = dy > 0 ? 1 : -1;
    if (dir && next !== dir) reversals++;
    dir = next;
  }
  return reversals;
}

export function dwellNoClick(snapshot: LostSnapshot, ms: number): boolean {
  const last = snapshot.pages[snapshot.pages.length - 1];
  if (!last || snapshot.now - last.at < ms) return false;
  return !snapshot.clicks.some((click) => click.at >= last.at) && !snapshot.submits.some((submit) => submit.at >= last.at);
}

export function focusesThenLeft(snapshot: LostSnapshot, fields: number, windowMs: number): boolean {
  if (snapshot.pages.length < 2) return false;
  const current = snapshot.pages[snapshot.pages.length - 1];
  const previous = snapshot.pages[snapshot.pages.length - 2];
  if (snapshot.now - current.at > windowMs) return false;
  const seen = new Set(
    snapshot.focuses
      .filter((focus) => focus.at >= previous.at && focus.at < current.at && pageKey(focus.url) === pageKey(previous.url))
      .map((focus) => focus.field),
  );
  const submitted = snapshot.submits.some((submit) => submit.at >= previous.at && submit.at < current.at);
  return seen.size >= fields && !submitted;
}

export function pagesAfterError(snapshot: LostSnapshot, count: number, windowMs: number, kind?: string): boolean {
  const errors = inWindow(snapshot.errors, snapshot.now, windowMs).filter((error) => !kind || error.kind === kind);
  const error = errors[errors.length - 1];
  if (!error) return false;
  const keys = new Set(snapshot.pages.filter((page) => page.at > error.at && snapshot.now - page.at <= windowMs).map((page) => pageKey(page.url)));
  return keys.size >= count;
}

export function searchesIn(snapshot: LostSnapshot, ms: number): LostSearch[] {
  return inWindow(snapshot.searches, snapshot.now, ms).filter((search) => search.query.trim().length >= 2);
}

export function searchNoFollow(snapshot: LostSnapshot, idleMs: number, windowMs: number): boolean {
  const list = searchesIn(snapshot, windowMs);
  const last = list[list.length - 1];
  if (!last || snapshot.now - last.at < idleMs) return false;
  return !snapshot.clicks.some((click) => click.at > last.at);
}

export function distinctQueries(snapshot: LostSnapshot, ms: number): number {
  return new Set(searchesIn(snapshot, ms).map((search) => search.query.trim().toLowerCase())).size;
}

export function emptySnapshot(now = 0): LostSnapshot {
  return { now, pages: [], clicks: [], focuses: [], submits: [], errors: [], scrolls: [], searches: [] };
}

export function snapshotFromTrail(
  trail: Breadcrumb[],
  extra: { now: number; scrolls: LostScroll[]; searches: LostSearch[] },
): LostSnapshot {
  const text = (value: unknown) => (typeof value === 'string' ? value : '');
  return {
    now: extra.now,
    scrolls: extra.scrolls,
    searches: extra.searches,
    pages: trail
      .filter((step) => step.type === 'page_view')
      .map((step) => ({ at: step.at, url: step.url, title: text(step.data.title) })),
    clicks: trail
      .filter((step) => step.type === 'click')
      .map((step) => ({ at: step.at, url: step.url, label: text(step.data.label) })),
    focuses: trail
      .filter((step) => step.type === 'focus')
      .map((step) => ({ at: step.at, url: step.url, field: text(step.data.field) })),
    submits: trail.filter((step) => step.type === 'submit').map((step) => ({ at: step.at, url: step.url })),
    errors: trail
      .filter((step) => step.type === 'error')
      .map((step) => ({ at: step.at, url: step.url, kind: text(step.data.kind) })),
  };
}
