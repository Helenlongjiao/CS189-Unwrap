import { asElement, fieldLabel, findInteractive, isInsidePulse } from '../dom';
import { safeUrl } from '../util';
import type { Detector } from './context';
import {
  assessLost,
  eventsFromSession,
  type ClickNote,
  type EditSample,
  type ScrollSample,
  type SearchSample,
} from './lostModel';

const SEARCH_WORD = /\bsearch\b/i;

/**
 * A search box is `type="search"`, `role="searchbox"`, or a label that is the word "search".
 * A placeholder like "research interests" does not match.
 */
function isSearchField(el: Element): boolean {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false;
  if (el instanceof HTMLInputElement && ['password', 'hidden', 'email', 'tel', 'number'].includes(el.type)) return false;
  if (el instanceof HTMLInputElement && el.type === 'search') return true;
  if ((el.getAttribute('role') || '').toLowerCase() === 'searchbox') return true;
  const blob = [el.getAttribute('name'), el.id, el.getAttribute('placeholder'), el.getAttribute('aria-label')].join(' ');
  return SEARCH_WORD.test(blob);
}

function isEditableField(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  if (!(el instanceof HTMLInputElement)) return false;
  return !['hidden', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio'].includes(el.type);
}

/** Tabs, disclosures, and filters change the page in place. They are not "clicks that go nowhere." */
function isInPageControl(el: Element): boolean {
  const role = (el.getAttribute('role') || '').toLowerCase();
  if (['tab', 'switch', 'checkbox', 'radio', 'option'].includes(role)) return true;
  const tag = el.tagName.toLowerCase();
  if (tag === 'summary' || tag === 'select') return true;
  if (el.matches('input[type="checkbox"], input[type="radio"]')) return true;
  if (el.hasAttribute('aria-expanded') || el.hasAttribute('aria-controls')) return true;
  return !!el.closest('[role="tablist"], [role="radiogroup"], [role="listbox"]');
}

/**
 * Scores whether this tab looks lost. A nudge is 20–49; the full guide is 50 or more.
 * One mild signal is never enough. Points decay, and a finished task removes the signal that led there.
 */
export const lostDetector: Detector = ({ config, engine, breadcrumbs }) => {
  const scrolls: ScrollSample[] = [];
  const searches: SearchSample[] = [];
  const edits: EditSample[] = [];
  const clickNotes: ClickNote[] = [];
  let announced: 'none' | 'nudge' | 'full' = 'none';
  let scrollTimer: ReturnType<typeof setTimeout> | undefined;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  const evalNow = () => {
    const now = Date.now();
    const assessment = assessLost(
      eventsFromSession({ trail: breadcrumbs.snapshot(), scrolls, searches, edits, clickNotes }),
      now,
      config.siteProfile,
      config.lost,
    );
    if (assessment.tier === 'none' || assessment.tier === announced || (assessment.tier === 'nudge' && announced === 'full')) return;
    announced = assessment.tier;
    const query = searches[searches.length - 1]?.query;
    engine.fire('lost', {
      context: {
        tier: assessment.tier,
        score: assessment.score,
        strong: assessment.strong,
        version: assessment.version,
        motion: assessment.motion,
        patternIds: assessment.evidence.slice(0, 40),
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

  const onClick = (event: Event) => {
    const target = asElement(event.target);
    if (!target || isInsidePulse(target)) return;
    const control = findInteractive(target) ?? target;
    clickNotes.push({ at: Date.now(), inPage: isInPageControl(control) });
    if (clickNotes.length > 80) clickNotes.shift();
    // The trail listener runs first and scores before this note exists. Score again with it.
    evalNow();
  };

  const onInput = (event: Event) => {
    const target = asElement(event.target);
    if (!target || isInsidePulse(target)) return;
    if (isSearchField(target)) {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        const raw = 'value' in target ? String((target as HTMLInputElement).value) : '';
        const query = raw.trim().slice(0, 80);
        if (query.length < 2) return;
        searches.push({ at: Date.now(), url: safeUrl(), query });
        if (searches.length > 10) searches.shift();
        evalNow();
      }, 400);
      return;
    }
    // Keyboard focus alone is not a started form. Only a value change counts, and never the value.
    if (!isEditableField(target)) return;
    edits.push({ at: Date.now(), url: safeUrl(), field: fieldLabel(target) });
    if (edits.length > 30) edits.shift();
  };

  const offTrail = breadcrumbs.onAdd(() => evalNow());
  const tick = setInterval(evalNow, 5000);
  (tick as unknown as { unref?: () => void }).unref?.();
  window.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('click', onClick, true);
  document.addEventListener('input', onInput, true);

  return () => {
    offTrail();
    clearInterval(tick);
    clearTimeout(scrollTimer);
    clearTimeout(searchTimer);
    window.removeEventListener('scroll', onScroll);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('input', onInput, true);
  };
};
