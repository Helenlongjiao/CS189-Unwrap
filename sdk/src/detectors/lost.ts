import { asElement, isInsidePulse } from '../dom';
import { safeUrl } from '../util';
import type { Detector } from './context';
import { evaluateLost } from './lostPatterns';
import { lostTier, snapshotFromTrail, type LostMatch, type LostScroll, type LostSearch } from './lostScore';

function isSearchField(el: Element): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el instanceof HTMLInputElement && (el.type === 'password' || el.type === 'hidden' || el.type === 'email')) return false;
  const blob = `${el.getAttribute('type') || ''} ${el.getAttribute('name') || ''} ${el.id || ''} ${el.getAttribute('placeholder') || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('role') || ''}`.toLowerCase();
  return blob.includes('search');
}

/**
 * Scores generalized "lost" patterns. 20–49 points raises a small nudge; 50 or more opens the
 * full guide. Each pattern counts once per tab, and old points decay.
 */
export const lostDetector: Detector = ({ engine, breadcrumbs }) => {
  const scrolls: LostScroll[] = [];
  const searches: LostSearch[] = [];
  const matched = new Map<string, LostMatch>();
  let announced: 'none' | 'nudge' | 'full' = 'none';
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  const evalNow = () => {
    const now = Date.now();
    const snapshot = snapshotFromTrail(breadcrumbs.snapshot(), { now, scrolls, searches });
    let added = false;
    for (const hit of evaluateLost(snapshot)) {
      if (matched.has(hit.id)) continue;
      matched.set(hit.id, { ...hit, at: now });
      added = true;
    }
    if (!added) return;
    const { score, tier } = lostTier([...matched.values()], now);
    if (tier === 'none' || (tier === 'nudge' && announced !== 'none') || (tier === 'full' && announced === 'full')) return;
    announced = tier;
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
  const tick = setInterval(evalNow, 5000);
  (tick as unknown as { unref?: () => void }).unref?.();
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('input', onInput, true);

  return () => {
    offTrail();
    clearInterval(tick);
    clearTimeout(scrollTimer);
    clearTimeout(searchTimer);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('input', onInput, true);
  };
};
