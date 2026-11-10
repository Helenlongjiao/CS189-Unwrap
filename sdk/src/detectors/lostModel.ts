import {
  DEFAULT_LOST,
  DECAY_MS,
  FULL_SCORE,
  MIN_CIRCLE_PAGES,
  NUDGE_SCORE,
  RELATED_CIRCLE_PAGES,
  type LostTuning,
} from './lostConfig';
import { EMPTY_PROFILE, LOST_MODEL_VERSION, matchesFunnel, type SiteProfile } from '../profile/profile';
import { pageIdentity, pageTemplate } from '../profile/route';
import type { Breadcrumb } from '../types';

export { LOST_MODEL_VERSION, NUDGE_SCORE, FULL_SCORE, DECAY_MS, MIN_CIRCLE_PAGES, RELATED_CIRCLE_PAGES };
export type { LostTuning };

const HELP = /\b(help|faq|support|contact)\b/i;

/**
 * Lostness prototype.
 *
 * Circling is the navigation signal, and only once a second pass covers several distinct pages.
 * One pass is progress: new pages, one reopen that moves on to a new page, or a step
 * back at the end. No site has to rank those pages. A circle inside one related area
 * (a catalog, add and drop, pages that share a parent) needs more pages and scores less.
 * Reading a page, walking a docs tree, and clicking distinct navbar categories in sequence
 * are not lostness. The site owner names those paths on `siteProfile` and can change any
 * weight, threshold, or rule through `Pulse.init({ lost })`.
 * One mild signal cannot nudge on its own. Points fade, and the same kind of behavior counts once.
 */

/** What the recent path looks like, so a docs circle is not reported as a navbar circle. */
export type LostMotion = 'reading' | 'sections' | 'circling' | 'other';

export interface LostTrailEvent {
  at: number;
  url: string;
  type: 'page' | 'click' | 'edit' | 'submit' | 'error' | 'scroll' | 'search';
  label?: string;
  identity?: string;
  field?: string;
  /** `page` and click-adjacent script errors count. `console` and `resource` never do. */
  kind?: string;
  /** Click toggled a tab, disclosure, or filter instead of navigating. */
  inPage?: boolean;
  y?: number;
  query?: string;
}

export interface RuleWhen {
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
}

export interface LostRule {
  id: string;
  family: string;
  weight: number;
  strong: boolean;
  /** When this rule matches, these families are dropped instead of adding points. */
  cancels?: readonly string[];
  test: string;
  when: RuleWhen;
}

export interface LostAssessment {
  version: string;
  score: number;
  tier: 'none' | 'nudge' | 'full';
  strong: boolean;
  motion: LostMotion;
  evidence: string[];
  recovered: string[];
}

interface Visit {
  at: number;
  identity: string;
  template: string;
}

interface Features {
  now: number;
  events: LostTrailEvent[];
  visits: Visit[];
  profile: SiteProfile;
  tuning: LostTuning;
}

interface Scored {
  id: string;
  family: string;
  weight: number;
  strong: boolean;
  at: number;
}

type Verdict = number | null;
type TestFn = (features: Features, when: RuleWhen) => Verdict;

function fits(identity: string, pattern: string): boolean {
  const left = identity.split('/').filter(Boolean);
  const right = pattern.split('/').filter(Boolean);
  if (left.length !== right.length) return false;
  return right.every((part, index) => part === ':id' || part.toLowerCase() === left[index].toLowerCase());
}

function templateFor(identity: string, profile: SiteProfile): string {
  for (const pattern of profile.listings) {
    if (fits(identity, pattern)) return pattern;
  }
  return pageTemplate(identity);
}

function inWindow(at: number, now: number, windowMs: number): boolean {
  return at <= now && now - at <= windowMs && now - at >= 0;
}

function windowVisits(features: Features, windowMs: number): Visit[] {
  return features.visits.filter((visit) => inWindow(visit.at, features.now, windowMs));
}

function buildVisits(events: LostTrailEvent[], profile: SiteProfile): Visit[] {
  const visits: Visit[] = [];
  for (const event of events) {
    if (event.type !== 'page') continue;
    const identity = event.identity || pageIdentity(event.url);
    const template = templateFor(identity, profile);
    // replaceState and duplicate page views on the same URL are one visit.
    if (visits[visits.length - 1]?.identity === identity) continue;
    visits.push({ at: event.at, identity, template });
  }
  return visits;
}

/** Distinct pages in the longest walk that leaves a page and comes back to it. */
function circlePages(visits: Visit[]): number {
  let best = 0;
  for (let start = 0; start < visits.length; start++) {
    const seen = new Set<string>([visits[start].identity]);
    for (let end = start + 1; end < visits.length; end++) {
      if (visits[end].identity === visits[start].identity) best = Math.max(best, seen.size);
      seen.add(visits[end].identity);
    }
  }
  return best;
}

/** Shared parent, or the stem of a listing template such as `/products/:id`. */
function automaticCategory(visit: Visit): string {
  if (visit.template.includes(':id')) {
    const stem = visit.template.replace(/\/:id$/, '');
    return `listing:${stem || '/'}`;
  }
  const parts = visit.identity.split('/').filter(Boolean);
  if (parts.length >= 2) return `parent:/${parts.slice(0, -1).join('/').toLowerCase()}`;
  return `page:${visit.identity.toLowerCase()}`;
}

/** Catalog items, add and drop, or any other pages the owner grouped as one task. */
function isRelatedCircle(visits: Visit[], profile: SiteProfile): boolean {
  if (visits.length < 2) return false;
  for (const group of profile.related ?? []) {
    if (visits.every((visit) => group.some((pattern) => matchesPattern(visit, pattern, true)))) return true;
  }
  if (isCatalog(visits)) return true;
  return new Set(visits.map((visit) => automaticCategory(visit))).size === 1;
}

/**
 * How many distinct pages this rule needs.
 * `pages` is the unrelated length at the default minimum. Raising `minCirclePages` shifts every circle rule.
 * A related circle adds the gap between `relatedCirclePages` and `minCirclePages`.
 */
function circleNeed(features: Features, visits: Visit[], pages: number): number {
  const shift = features.tuning.minCirclePages - MIN_CIRCLE_PAGES;
  const base = pages + shift;
  if (!isRelatedCircle(visits, features.profile)) return Math.max(2, base);
  const extra = Math.max(0, features.tuning.relatedCirclePages - features.tuning.minCirclePages);
  return Math.max(2, base + extra);
}

function bounceCount(visits: Visit[], maxDwell: number): number {
  let count = 0;
  for (let i = 0; i < visits.length - 1; i++) {
    const gap = visits[i + 1].at - visits[i].at;
    if (gap >= 0 && gap <= maxDwell && visits[i].identity !== visits[i + 1].identity) count++;
  }
  return count;
}

function maxIdentity(visits: Visit[]): number {
  const counts = new Map<string, number>();
  for (const visit of visits) counts.set(visit.identity, (counts.get(visit.identity) ?? 0) + 1);
  return counts.size ? Math.max(...counts.values()) : 0;
}

function isForward(visits: Visit[]): boolean {
  if (visits.length < 2) return false;
  return new Set(visits.map((visit) => visit.identity)).size === visits.length;
}

/**
 * One forward pass over pages in the order this visit first opened them.
 * In progress when every page is new, the only repeats step back at the end,
 * or one earlier page is opened again and the next page is new.
 * Two pages each visited again after the path has moved on are a second pass.
 * Timing is unused.
 */
function isProgress(visits: Visit[]): boolean {
  if (visits.length < 2) return false;
  const firstAt = new Map<string, number>();
  visits.forEach((visit, index) => {
    if (!firstAt.has(visit.identity)) firstAt.set(visit.identity, index);
  });
  const rank = (index: number) => firstAt.get(visits[index].identity) ?? index;
  const isNew = (index: number) => rank(index) === index;
  const stepsBack = (from: number) => {
    if (from >= visits.length) return false;
    for (let index = from; index < visits.length; index++) {
      if (isNew(index) || rank(index) >= rank(index - 1)) return false;
    }
    return true;
  };
  let reopened = false;
  for (let index = 1; index < visits.length; index++) {
    if (isNew(index)) continue;
    if (stepsBack(index)) return true;
    if (!reopened && index + 1 < visits.length && isNew(index + 1)) {
      reopened = true;
      continue;
    }
    return false;
  }
  return true;
}

/** Listing index plus its items, or several ids of one template, and nobody stuck on one id. */
function isCatalog(visits: Visit[]): boolean {
  if (visits.length < 2 || maxIdentity(visits) >= 4) return false;
  const templates = [...new Set(visits.map((visit) => visit.template))];
  if (templates.length === 1 && templates[0].includes(':id')) return true;
  if (templates.length === 2) {
    const item = templates.find((template) => template.endsWith('/:id'));
    const index = templates.find((template) => template !== item);
    if (item && index && item === `${index}/:id`) return true;
  }
  return false;
}

/** Each page extends the one before it: `/checkout` then `/checkout/shipping`. */
function isDeepening(visits: Visit[]): boolean {
  if (visits.length < 2) return false;
  for (let i = 1; i < visits.length; i++) {
    const previous = visits[i - 1].identity;
    const next = visits[i].identity;
    if (!(next.startsWith(previous + '/') || previous.startsWith(next + '/'))) return false;
  }
  return true;
}

/** Later pages live under the first one: `/checkout` then `/checkout/payment`. */
function underFirst(visits: Visit[]): boolean {
  if (visits.length < 2) return false;
  const root = visits[0].identity.replace(/\/$/, '');
  if (!root || root === '/') return false;
  return visits.every((visit) => visit.identity === root || visit.identity.startsWith(root + '/'));
}

function matchesPattern(visit: Visit, pattern: string, asPrefix: boolean): boolean {
  if (fits(visit.identity, pattern) || visit.template === pattern || visit.identity === pattern) return true;
  if (pattern.endsWith('/:id')) {
    const index = pattern.slice(0, -'/:id'.length) || '/';
    if (visit.identity === index || visit.template === index) return true;
  }
  if (!asPrefix || pattern.includes(':id')) return false;
  const prefix = pattern.replace(/\/$/, '');
  if (!prefix || prefix === '/') return false;
  return visit.identity === prefix || visit.identity.startsWith(prefix + '/') || visit.template === prefix || visit.template.startsWith(prefix + '/');
}

function isReadingVisit(visit: Visit, profile: SiteProfile): boolean {
  return (profile.reading ?? []).some((pattern) => matchesPattern(visit, pattern, true));
}

function isSectionVisit(visit: Visit, profile: SiteProfile): boolean {
  return (profile.sections ?? []).some((pattern) => matchesPattern(visit, pattern, false));
}

/** Every page is in the owner's reading set. An empty set matches nothing. */
function isReadingSet(visits: Visit[], profile: SiteProfile): boolean {
  return (profile.reading ?? []).length > 0 && visits.length >= 2 && visits.every((visit) => isReadingVisit(visit, profile));
}

/** Distinct navbar categories, in sequence, with no return. */
function isSectionSequence(visits: Visit[], profile: SiteProfile): boolean {
  return (profile.sections ?? []).length > 0 && isForward(visits) && visits.every((visit) => isSectionVisit(visit, profile));
}

function isSectionLabel(label: string | undefined, profile: SiteProfile): boolean {
  if (!label) return false;
  const name = label.trim().toLowerCase();
  return (profile.sectionLabels ?? []).some((item) => item.trim().toLowerCase() === name);
}

function helpClicks(features: Features, windowMs: number): LostTrailEvent[] {
  return features.events.filter(
    (event) => event.type === 'click' && HELP.test(event.label || '') && inWindow(event.at, features.now, windowMs),
  );
}

function searches(features: Features, windowMs: number): LostTrailEvent[] {
  return features.events.filter((event) => {
    if (event.type !== 'search' || !inWindow(event.at, features.now, windowMs)) return false;
    return (event.query || '').trim().length >= 2;
  });
}

function distinctQueries(list: LostTrailEvent[]): number {
  return new Set(list.map((event) => (event.query || '').trim().toLowerCase())).size;
}

interface ErrorHit {
  at: number;
}

function relevantError(features: Features, when: RuleWhen): ErrorHit | null {
  const windowMs = when.windowMs ?? 90_000;
  const clickMs = when.clickMs ?? 3_000;
  const errors = features.events.filter((event) => event.type === 'error' && inWindow(event.at, features.now, windowMs));
  for (let i = errors.length - 1; i >= 0; i--) {
    const error = errors[i];
    if (error.kind === 'console' || error.kind === 'resource') continue;
    if (error.kind === 'page') return { at: error.at };
    if (error.kind === 'js' || error.kind === 'promise' || error.kind === 'network') {
      const caused = features.events.some(
        (event) => event.type === 'click' && error.at - event.at <= clickMs && error.at - event.at >= 0,
      );
      if (caused) return { at: error.at };
    }
  }
  return null;
}

function scrollPoints(features: Features, windowMs: number): { at: number; y: number }[] {
  return features.events
    .filter((event) => event.type === 'scroll' && typeof event.y === 'number' && inWindow(event.at, features.now, windowMs))
    .map((event) => ({ at: event.at, y: event.y as number }));
}

function reversalInfo(points: { at: number; y: number }[]): { count: number; lastAt: number } {
  let count = 0;
  let direction = 0;
  let lastAt = 0;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].y - points[i - 1].y;
    if (Math.abs(delta) < 40) continue;
    const next = delta > 0 ? 1 : -1;
    if (direction && next !== direction) {
      count++;
      lastAt = points[i].at;
    }
    direction = next;
  }
  return { count, lastAt };
}

function scrollRange(points: { y: number }[]): number {
  if (!points.length) return 0;
  const ys = points.map((point) => point.y);
  return Math.max(...ys) - Math.min(...ys);
}

function latest(visits: Visit[], now: number): number {
  return visits.length ? visits[visits.length - 1].at : now;
}

const TESTS: Record<string, TestFn> = {
  circle: (features, when) => {
    const visits = windowVisits(features, when.windowMs ?? 120_000);
    const length = circlePages(visits);
    return length >= circleNeed(features, visits, when.pages ?? MIN_CIRCLE_PAGES) ? latest(visits, features.now) : null;
  },
  hops: (features, when) => {
    const visits = windowVisits(features, when.windowMs ?? 60_000);
    // A return is a circle. The same pages should not also score as wandering.
    if (circlePages(visits) >= 2) return null;
    const distinct = new Set(visits.map((visit) => visit.template)).size;
    return distinct >= (when.count ?? 4) ? latest(visits, features.now) : null;
  },
  bounces: (features, when) => {
    const visits = windowVisits(features, when.windowMs ?? 60_000);
    if (circlePages(visits) >= 2) return null;
    return bounceCount(visits, when.dwellMs ?? 2_000) >= (when.count ?? 3) ? latest(visits, features.now) : null;
  },
  revisits: (features, when) => {
    const visits = windowVisits(features, when.windowMs ?? 120_000);
    if (circlePages(visits) >= 2) return null;
    return maxIdentity(visits) >= (when.count ?? 4) ? latest(visits, features.now) : null;
  },
  help: (features, when) => {
    const clicks = helpClicks(features, when.windowMs ?? 180_000);
    return clicks.length >= (when.count ?? 1) ? clicks[clicks.length - 1].at : null;
  },
  searchIdle: (features, when) => {
    const list = searches(features, when.windowMs ?? 180_000);
    if (distinctQueries(list) < (when.count ?? 2)) return null;
    const last = list[list.length - 1];
    if (features.now - last.at < (when.idleMs ?? 15_000)) return null;
    const moved = features.events.some(
      (event) => event.at > last.at && event.at <= features.now && (event.type === 'page' || (event.type === 'click' && !event.inPage)),
    );
    return moved ? null : last.at;
  },
  searchHop: (features, when) => {
    const list = searches(features, when.windowMs ?? 180_000);
    if (distinctQueries(list) < (when.count ?? 2)) return null;
    const first = list[0];
    const laterVisits = features.visits.filter((visit) => visit.at > first.at && inWindow(visit.at, features.now, when.windowMs ?? 180_000));
    const clicked = features.events.some((event) => event.type === 'click' && !event.inPage && event.at > first.at && event.at <= features.now);
    if (clicked) return null;
    const templates = new Set(laterVisits.map((visit) => visit.template));
    return templates.size >= (when.pages ?? 2) ? latest(laterVisits, features.now) : null;
  },
  scrollThrash: (features, when) => {
    const points = scrollPoints(features, when.windowMs ?? 45_000);
    const info = reversalInfo(points);
    if (info.count < (when.count ?? 4)) return null;
    if (features.now - info.lastAt >= (when.settleMs ?? 8_000)) return null;
    return features.now;
  },
  flatDwell: (features, when) => {
    const last = features.visits[features.visits.length - 1];
    if (!last || features.now - last.at < (when.dwellMs ?? 45_000)) return null;
    const since = features.events.filter((event) => event.at >= last.at && event.at <= features.now);
    if (since.some((event) => event.type === 'click' || event.type === 'submit')) return null;
    const points = since.filter((event) => event.type === 'scroll' && typeof event.y === 'number').map((event) => ({ y: event.y as number }));
    if (scrollRange(points) >= (when.range ?? 80)) return null;
    return features.now;
  },
  formLeft: (features, when) => {
    const windowMs = when.windowMs ?? 90_000;
    const pages = features.visits;
    let at: number | null = null;
    for (let i = 0; i < pages.length - 1; i++) {
      const start = pages[i].at;
      const end = pages[i + 1].at;
      if (!inWindow(end, features.now, windowMs)) continue;
      const fields = new Set(
        features.events
          .filter((event) => event.type === 'edit' && event.at >= start && event.at < end && (event.field || '').trim())
          .map((event) => (event.field || '').trim().toLowerCase()),
      );
      const submitted = features.events.some((event) => event.type === 'submit' && event.at >= start && event.at <= end);
      if (fields.size >= (when.fields ?? 2) && !submitted) at = end;
    }
    return at;
  },
  clickThrash: (features, when) => {
    const windowMs = when.windowMs ?? 30_000;
    if (windowVisits(features, windowMs).length > 1) return null;
    const clicks = features.events.filter(
      (event) =>
        event.type === 'click' &&
        !event.inPage &&
        !isSectionLabel(event.label, features.profile) &&
        inWindow(event.at, features.now, windowMs),
    );
    return clicks.length >= (when.count ?? 6) ? clicks[clicks.length - 1].at : null;
  },
  errorWander: (features, when) => {
    const error = relevantError(features, when);
    if (!error) return null;
    const windowMs = when.windowMs ?? 90_000;
    const after = features.visits.filter((visit) => visit.at > error.at && inWindow(visit.at, features.now, windowMs));
    if (new Set(after.map((visit) => visit.template)).size < (when.pages ?? 3)) return null;
    if (
      isCatalog(after) ||
      isDeepening(after) ||
      underFirst(after) ||
      matchesFunnel(after.map((visit) => visit.template), features.profile.funnels) ||
      (isReadingSet(after, features.profile) && features.tuning.readingCircles !== 'lost') ||
      isSectionSequence(after, features.profile)
    ) {
      return null;
    }
    return latest(after, features.now);
  },
  catalog: (features, when) => {
    const visits = windowVisits(features, when.windowMs ?? 120_000);
    return isCatalog(visits) ? features.now : null;
  },
  catalogLoose: (features, when) => {
    const visits = windowVisits(features, when.windowMs ?? 120_000);
    // Short returns inside a listing are browsing. A long circle through it still scores, at the related weight.
    if (!isCatalog(visits)) return null;
    return circlePages(visits) >= circleNeed(features, visits, MIN_CIRCLE_PAGES) ? null : features.now;
  },
  forward: (features, when) => {
    const visits = windowVisits(features, when.windowMs ?? 120_000);
    return isForward(visits) ? features.now : null;
  },
  progress: (features, when) => {
    const visits = windowVisits(features, when.windowMs ?? 120_000);
    // A one-pass return looks like a circle. It is the task finishing, so the loop rules stand down.
    if (!isProgress(visits) || circlePages(visits) < 2) return null;
    return features.now;
  },
  submitted: (features, when) => {
    const submits = features.events.filter((event) => event.type === 'submit' && inWindow(event.at, features.now, when.windowMs ?? 180_000));
    return submits.length ? submits[submits.length - 1].at : null;
  },
  submitHelp: (features, when) => {
    const windowMs = when.windowMs ?? 180_000;
    const clicks = helpClicks(features, windowMs);
    if (!clicks.length) return null;
    const helpAt = clicks[clicks.length - 1].at;
    const submit = features.events.find((event) => event.type === 'submit' && event.at >= helpAt && inWindow(event.at, features.now, windowMs));
    if (!submit) return null;
    const visits = windowVisits(features, windowMs);
    if (circlePages(visits) >= circleNeed(features, visits, MIN_CIRCLE_PAGES)) return null;
    if (relevantError(features, { windowMs, clickMs: 3_000 })) return null;
    return submit.at;
  },
  searchHit: (features, when) => {
    const list = searches(features, when.windowMs ?? 180_000);
    if (!list.length) return null;
    const last = list[list.length - 1];
    const click = features.events.find((event) => event.type === 'click' && !event.inPage && event.at > last.at && event.at <= features.now);
    return click ? click.at : null;
  },
  readingTree: (features, when) => {
    const visits = windowVisits(features, when.windowMs ?? 120_000);
    if (features.tuning.readingCircles === 'lost' || !isReadingSet(visits, features.profile)) return null;
    return features.now;
  },
  readingCircle: (features, when) => {
    const visits = windowVisits(features, when.windowMs ?? 120_000);
    if (features.tuning.readingCircles !== 'ignore' || !isReadingSet(visits, features.profile)) return null;
    return features.now;
  },
  sectionTour: (features, when) => {
    const visits = windowVisits(features, when.windowMs ?? 120_000);
    return isSectionSequence(visits, features.profile) ? features.now : null;
  },
  reading: (features, when) => {
    const points = scrollPoints(features, when.windowMs ?? 90_000);
    if (scrollRange(points) < (when.range ?? 80)) return null;
    const info = reversalInfo(points);
    if (info.count > 2) return null;
    if (info.count > 0 && features.now - info.lastAt < (when.settleMs ?? 8_000)) return null;
    return features.now;
  },
};

export const LOST_RULES: readonly LostRule[] = [
  { id: 'circle-4', family: 'loop', weight: 16, strong: false, test: 'circle', when: { pages: MIN_CIRCLE_PAGES, windowMs: 120_000 } },
  { id: 'circle-6', family: 'loop', weight: 34, strong: false, test: 'circle', when: { pages: MIN_CIRCLE_PAGES + 2, windowMs: 120_000 } },
  { id: 'hop-4', family: 'browse', weight: 16, strong: false, test: 'hops', when: { count: 4, windowMs: 60_000 } },
  { id: 'hop-6', family: 'browse', weight: 34, strong: false, test: 'hops', when: { count: 6, windowMs: 90_000 } },
  { id: 'bounce-3', family: 'browse', weight: 16, strong: false, test: 'bounces', when: { count: 3, dwellMs: 2_000, windowMs: 60_000 } },
  { id: 'bounce-4', family: 'browse', weight: 34, strong: false, test: 'bounces', when: { count: 4, dwellMs: 2_000, windowMs: 90_000 } },
  { id: 'revisit-4', family: 'browse', weight: 16, strong: false, test: 'revisits', when: { count: 4, windowMs: 120_000 } },
  { id: 'revisit-5', family: 'browse', weight: 34, strong: false, test: 'revisits', when: { count: 5, windowMs: 120_000 } },
  { id: 'help', family: 'help', weight: 16, strong: false, test: 'help', when: { count: 1, windowMs: 180_000 } },
  { id: 'search-reformulation', family: 'search', weight: 16, strong: false, test: 'searchIdle', when: { count: 2, windowMs: 180_000, idleMs: 15_000 } },
  { id: 'search-then-hop', family: 'search', weight: 50, strong: true, test: 'searchHop', when: { count: 2, pages: 2, windowMs: 180_000 } },
  // Reading a page is not lostness. An owner opts in by raising the weight.
  { id: 'scroll-thrash', family: 'scroll', weight: 0, strong: false, test: 'scrollThrash', when: { count: 4, windowMs: 45_000, settleMs: 8_000 } },
  { id: 'dwell-flat', family: 'dwell', weight: 0, strong: false, test: 'flatDwell', when: { dwellMs: 45_000, range: 80 } },
  { id: 'form-left', family: 'form', weight: 16, strong: false, test: 'formLeft', when: { fields: 2, windowMs: 90_000 } },
  { id: 'click-thrash', family: 'thrash', weight: 16, strong: false, test: 'clickThrash', when: { count: 6, windowMs: 30_000 } },
  { id: 'error-wander', family: 'error', weight: 50, strong: true, test: 'errorWander', when: { pages: 3, windowMs: 90_000, clickMs: 3_000 } },
  { id: 'catalog', family: 'browse', weight: 0, strong: false, cancels: ['browse'], test: 'catalog', when: { windowMs: 120_000 } },
  { id: 'catalog-loose', family: 'loop', weight: 0, strong: false, cancels: ['loop'], test: 'catalogLoose', when: { windowMs: 120_000 } },
  { id: 'forward', family: 'browse', weight: 0, strong: false, cancels: ['browse'], test: 'forward', when: { windowMs: 120_000 } },
  { id: 'progress', family: 'loop', weight: 0, strong: false, cancels: ['loop'], test: 'progress', when: { windowMs: 120_000 } },
  { id: 'reading-tree', family: 'browse', weight: 0, strong: false, cancels: ['browse'], test: 'readingTree', when: { windowMs: 120_000 } },
  { id: 'reading-circle', family: 'loop', weight: 0, strong: false, cancels: ['loop'], test: 'readingCircle', when: { windowMs: 120_000 } },
  { id: 'section-tour', family: 'browse', weight: 0, strong: false, cancels: ['browse'], test: 'sectionTour', when: { windowMs: 120_000 } },
  { id: 'submit-form', family: 'form', weight: 0, strong: false, cancels: ['form'], test: 'submitted', when: { windowMs: 180_000 } },
  { id: 'submit-help', family: 'help', weight: 0, strong: false, cancels: ['help'], test: 'submitHelp', when: { windowMs: 180_000 } },
  { id: 'search-hit', family: 'search', weight: 0, strong: false, cancels: ['search'], test: 'searchHit', when: { windowMs: 180_000 } },
  { id: 'reading', family: 'dwell', weight: 0, strong: false, cancels: ['dwell', 'scroll'], test: 'reading', when: { windowMs: 90_000, range: 80, settleMs: 8_000 } },
];

for (const rule of LOST_RULES) {
  if (!TESTS[rule.test]) throw new Error(`[pulse] lost rule ${rule.id} has no test ${rule.test}`);
}

function decayed(weight: number, at: number, now: number, decayMs: number): number {
  const age = Math.max(0, now - at);
  return weight * Math.max(0, 1 - age / decayMs);
}

function preparedRules(tuning: LostTuning): LostRule[] {
  const disabled = new Set(tuning.disabled ?? []);
  return LOST_RULES.filter((rule) => !disabled.has(rule.id)).map((rule) => {
    const over = tuning.rules?.[rule.id];
    if (!over) return rule;
    return { ...rule, weight: over.weight ?? rule.weight, when: { ...rule.when, ...over.when } };
  });
}

/** Docs circles and circles inside one related area count less than a circle across the site. */
function weightFor(rule: LostRule, features: Features): number {
  if (rule.family !== 'loop') return rule.weight;
  const visits = windowVisits(features, 120_000);
  let weight = rule.weight;
  if (features.tuning.readingCircles === 'soft' && isReadingSet(visits, features.profile)) weight /= 2;
  if (isRelatedCircle(visits, features.profile)) weight /= 2;
  return weight;
}

function sectionClickSequence(features: Features): boolean {
  const labels = features.profile.sectionLabels ?? [];
  if (!labels.length) return false;
  const names = features.events.filter(
    (event) => event.type === 'click' && isSectionLabel(event.label, features.profile) && inWindow(event.at, features.now, 120_000),
  );
  if (names.length < 2) return false;
  return new Set(names.map((event) => (event.label || '').trim().toLowerCase())).size === names.length;
}

function classify(features: Features): LostMotion {
  const visits = windowVisits(features, 120_000);
  const circling = !isProgress(visits) && circlePages(visits) >= circleNeed(features, visits, MIN_CIRCLE_PAGES);
  const reading = isReadingSet(visits, features.profile) || (visits.length === 1 && isReadingVisit(visits[0], features.profile));
  if (reading && features.tuning.readingCircles !== 'lost') return 'reading';
  if (reading && !circling) return 'reading';
  if (circling) return 'circling';
  if (isSectionSequence(visits, features.profile) || sectionClickSequence(features)) return 'sections';
  const points = scrollPoints(features, 90_000);
  if (visits.length <= 1 && scrollRange(points) >= 80 && reversalInfo(points).count <= 2) return 'reading';
  return 'other';
}

export function assessLost(
  events: LostTrailEvent[],
  now: number,
  profile: SiteProfile = EMPTY_PROFILE,
  tuning: Partial<LostTuning> = {},
): LostAssessment {
  const visible = events.filter((event) => event.at <= now).sort((a, b) => a.at - b.at);
  const resolved: LostTuning = { ...DEFAULT_LOST, ...tuning };
  const features: Features = { now, events: visible, visits: buildVisits(visible, profile), profile, tuning: resolved };
  const cancelled = new Set<string>();
  const recovered: string[] = [];
  const hits: Scored[] = [];

  for (const rule of preparedRules(resolved)) {
    const at = TESTS[rule.test](features, rule.when);
    if (at === null) continue;
    if (rule.cancels) {
      recovered.push(rule.id);
      for (const family of rule.cancels) cancelled.add(family);
      continue;
    }
    hits.push({ id: rule.id, family: rule.family, weight: weightFor(rule, features), strong: rule.strong, at });
  }

  const best = new Map<string, Scored>();
  for (const hit of hits) {
    if (cancelled.has(hit.family)) continue;
    const points = decayed(hit.weight, hit.at, now, resolved.decayMs);
    if (points <= 0) continue;
    const current = best.get(hit.family);
    if (!current || points > decayed(current.weight, current.at, now, resolved.decayMs)) best.set(hit.family, hit);
  }

  const chosen = [...best.values()];
  let score = Math.round(chosen.reduce((sum, hit) => sum + decayed(hit.weight, hit.at, now, resolved.decayMs), 0));
  const strong = chosen.some((hit) => hit.strong);
  // One signal — a help click, a circle, a catalog — stays under a nudge. Reading adds nothing by default.
  if (!strong && chosen.length < 2) score = Math.min(score, resolved.nudgeScore - 1);
  const tier = score >= resolved.fullScore ? 'full' : score >= resolved.nudgeScore ? 'nudge' : 'none';
  return {
    version: LOST_MODEL_VERSION,
    score,
    tier,
    strong,
    motion: classify(features),
    evidence: chosen.map((hit) => hit.id),
    recovered,
  };
}

export interface ClickNote {
  at: number;
  inPage: boolean;
}

export interface ScrollSample {
  at: number;
  url: string;
  y: number;
}

export interface SearchSample {
  at: number;
  url: string;
  query: string;
}

export interface EditSample {
  at: number;
  url: string;
  field: string;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Turn the breadcrumb trail plus the detector's own notes into model events. */
export function eventsFromSession(input: {
  trail: Breadcrumb[];
  scrolls: ScrollSample[];
  searches: SearchSample[];
  edits: EditSample[];
  clickNotes: ClickNote[];
}): LostTrailEvent[] {
  const events: LostTrailEvent[] = [];
  let note = 0;
  for (const step of input.trail) {
    if (step.type === 'page_view') {
      const identity = text(step.data.identity);
      events.push({ type: 'page', at: step.at, url: step.url, ...(identity ? { identity } : {}) });
    } else if (step.type === 'click') {
      let inPage = false;
      while (note < input.clickNotes.length && input.clickNotes[note].at < step.at - 50) note++;
      const mark = input.clickNotes[note];
      if (mark && Math.abs(mark.at - step.at) <= 50) {
        inPage = mark.inPage;
        note++;
      }
      events.push({ type: 'click', at: step.at, url: step.url, label: text(step.data.label), inPage });
    } else if (step.type === 'submit') {
      events.push({ type: 'submit', at: step.at, url: step.url });
    } else if (step.type === 'error') {
      events.push({ type: 'error', at: step.at, url: step.url, kind: text(step.data.kind) || 'js' });
    }
  }
  for (const scroll of input.scrolls) events.push({ type: 'scroll', at: scroll.at, url: scroll.url, y: scroll.y });
  for (const search of input.searches) events.push({ type: 'search', at: search.at, url: search.url, query: search.query });
  for (const edit of input.edits) events.push({ type: 'edit', at: edit.at, url: edit.url, field: edit.field });
  events.sort((a, b) => a.at - b.at);
  return events;
}
