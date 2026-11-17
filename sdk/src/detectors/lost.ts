import { asElement, isInsidePulse } from '../dom';
import { safeUrl } from '../util';
import type { Detector } from './context';
import { evaluateLost } from './lostPatterns';
import { lostFamily, lostTier, snapshotFromTrail, type LostMatch, type LostScroll, type LostSearch } from './lostScore';

function isSearchField(el: Element): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el instanceof HTMLInputElement && (el.type === 'password' || el.type === 'hidden' || el.type === 'email')) return false;
  const blob = `${el.getAttribute('type') || ''} ${el.getAttribute('name') || ''} ${el.id || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('role') || ''}`.toLowerCase();
  return blob.includes('search');
}

type LostTier = 'none' | 'nudge' | 'full';

/** What the user has already been prompted about in this episode. */
interface Prompted {
  /** Highest tier shown. */
  tier: LostTier;
  /** Families (`lostFamily`) whose evidence is already spent on a prompt. */
  spent: string[];
}

const PROMPTED_KEY = 'pulse_lost_prompted';
/** A prompt counts as seen once it has been up this long; one raised as the page unloads was not. */
const SEEN_MS = 1000;
const RANK: Record<LostTier, number> = { none: 0, nudge: 1, full: 2 };

function loadPrompted(): Prompted {
  try {
    const saved = JSON.parse(sessionStorage.getItem(PROMPTED_KEY) || 'null') as Prompted | null;
    if (saved && (saved.tier === 'nudge' || saved.tier === 'full') && Array.isArray(saved.spent)) return saved;
  } catch {
    /* storage blocked or corrupt: nothing prompted yet */
  }
  return { tier: 'none', spent: [] };
}

function savePrompted(prompted: Prompted) {
  try {
    if (prompted.tier === 'none') sessionStorage.removeItem(PROMPTED_KEY);
    else sessionStorage.setItem(PROMPTED_KEY, JSON.stringify(prompted));
  } catch {
    /* storage blocked: remembered for this page only */
  }
}

/**
 * Scores generalized "lost" patterns. 20–49 points raises a small nudge; 50 or more opens the
 * full guide. Each pattern counts once per tab, and old points decay.
 *
 * Within one lost episode (until the score falls back under the nudge line) the user is prompted
 * again only when the score climbs to a higher tier, or when a different kind of lost behavior
 * adds a nudge's worth of points on its own. Evidence that already raised a prompt is not reused,
 * so closing the prompt and carrying on does not bring it back on every page. This is kept across
 * page loads.
 */
export const lostDetector: Detector = ({ engine, breadcrumbs }) => {
  const scrolls: LostScroll[] = [];
  const searches: LostSearch[] = [];
  const matched = new Map<string, LostMatch>();
  let prompted = loadPrompted();
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let seenTimer: ReturnType<typeof setTimeout> | undefined;

  const evalNow = () => {
    const now = Date.now();
    const snapshot = snapshotFromTrail(breadcrumbs.snapshot(), { now, scrolls, searches });
    let added = false;
    for (const hit of evaluateLost(snapshot)) {
      if (matched.has(hit.id)) continue;
      matched.set(hit.id, { ...hit, at: now });
      added = true;
    }
    const matches = [...matched.values()];
    const { score, tier } = lostTier(matches, now);
    if (tier === 'none' && prompted.tier !== 'none') {
      // No longer looks lost: the episode is over and everything may prompt again.
      prompted = { tier: 'none', spent: [] };
      clearTimeout(seenTimer);
      savePrompted(prompted);
    }
    if (!added || tier === 'none') return;
    const spent = new Set(prompted.spent);
    const fresh = lostTier(
      matches.filter((match) => !spent.has(lostFamily(match.id))),
      now,
    );
    const climbed = RANK[tier] > RANK[prompted.tier];
    const newEvidence = prompted.tier !== 'none' && fresh.tier !== 'none';
    if (!climbed && !newEvidence) return;
    prompted = {
      tier: climbed ? tier : prompted.tier,
      spent: [...new Set([...prompted.spent, ...matches.map((match) => lostFamily(match.id))])],
    };
    const shown = prompted;
    clearTimeout(seenTimer);
    seenTimer = setTimeout(() => savePrompted(shown), SEEN_MS);
    const query = searches[searches.length - 1]?.query;
    engine.fire('lost', {
      context: {
        tier,
        score,
        strong: [...matched.values()].some((match) => match.strong),
        patternIds: [...matched.keys()].slice(0, 40),
        ...(query ? { query } : {}),
      },
    });
  };

  const onScroll = () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      scrolls.push({ at: Date.now(), url: safeUrl(), y });
      if (scrolls.length > 40) scrolls.shift();
      evalNow();
    }, 200);
  };

  const onInput = (event: Event) => {
    const target = asElement(event.target);
    if (!target || isInsidePulse(target) || !isSearchField(target)) return;
    const raw = 'value' in target ? String((target as HTMLInputElement).value) : '';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      const query = raw.trim().slice(0, 80);
      if (query.length < 2) return;
      searches.push({ at: Date.now(), query });
      if (searches.length > 10) searches.shift();
      evalNow();
    }, 400);
  };

  const offTrail = breadcrumbs.onAdd(() => evalNow());
  // On a full page load the page_view is recorded before detectors start, so without this the
  // first check would wait for the 5s tick. Check once on arrival, after the widget has mounted.
  const arrival = setTimeout(evalNow, 0);
  const tick = setInterval(evalNow, 5000);
  (tick as unknown as { unref?: () => void }).unref?.();
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('input', onInput, true);

  return () => {
    offTrail();
    clearTimeout(arrival);
    clearTimeout(seenTimer);
    clearInterval(tick);
    clearTimeout(scrollTimer);
    clearTimeout(searchTimer);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('input', onInput, true);
  };
};
