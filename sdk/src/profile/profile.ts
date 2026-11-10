/** Bump when a threshold change should not be compared with older lost events. */
export const LOST_MODEL_VERSION = 'lost-score/7';

/**
 * What the site owner (or the integration-guide crawl) knows about a site.
 * Paths are templates: `/docs` covers `/docs` and everything under it, `/products/:id` is one listing.
 */
export interface SiteProfile {
  version: string;
  /** Templates where many ids are normal browsing, e.g. `/products/:id`. */
  listings: string[];
  /**
   * Documentation. A straight read and a circle inside these pages (article, index, next article)
   * are reading, not lostness. The owner chooses how circles here score.
   */
  reading?: string[];
  /**
   * Navbar and other top-level categories, e.g. `/pricing`. A sequence of distinct ones is
   * exploration. A long circle through them is lostness, unlike a circle inside `reading`.
   */
  sections?: string[];
  /**
   * Pages that belong to one task even when their paths differ, e.g. `['/catalog', '/classes/add', '/classes/drop']`.
   * A circle that stays inside one group needs more pages and scores less. Pages that share a parent
   * or a listing template are related on their own.
   */
  related?: string[][];
  /** Visible labels of those categories, so navbar clicks count even when the URL does not change. */
  sectionLabels?: string[];
  /** Templates linked as help, FAQ, support, or contact. */
  help: string[];
  /** Templates that contain a search box. */
  search: string[];
  /** Happy paths, each a list of templates in order. */
  funnels: string[][];
}

export const EMPTY_PROFILE: SiteProfile = {
  version: LOST_MODEL_VERSION,
  listings: [],
  help: [],
  search: [],
  funnels: [],
};

/** True when `templates` walks the start of a known funnel and has not left it. */
export function matchesFunnel(templates: string[], funnels: readonly (readonly string[])[]): boolean {
  if (templates.length < 2) return false;
  return funnels.some(
    (funnel) => funnel.length >= templates.length && templates.every((step, index) => step === funnel[index]),
  );
}
