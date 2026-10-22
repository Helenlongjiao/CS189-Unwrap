import type { Breadcrumb, BreadcrumbType } from './types';
import { safeUrl } from './util';

const STORAGE_KEY = 'pulse_trail';

/**
 * Ring buffer of the user's recent path: pages visited, clicks, focused fields, submits, errors.
 * It is kept in sessionStorage so the route survives full page loads; a 404 page can then show
 * the link on the previous page that led there.
 */
export class Breadcrumbs {
  private items: Breadcrumb[] = [];
  private listeners = new Set<(b: Breadcrumb) => void>();

  constructor(private size: number) {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) this.items = saved.slice(-size);
    } catch {
      /* storage blocked or corrupt: start empty */
    }
  }

  add(type: BreadcrumbType, data: Record<string, unknown> = {}): Breadcrumb {
    const crumb: Breadcrumb = { type, at: Date.now(), url: safeUrl(), data };
    this.items.push(crumb);
    if (this.items.length > this.size) this.items.shift();
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(this.items));
    } catch {
      /* storage full or blocked: the in-memory trail still works */
    }
    this.listeners.forEach((cb) => cb(crumb));
    return crumb;
  }

  snapshot(): Breadcrumb[] {
    return this.items.slice();
  }

  onAdd(cb: (b: Breadcrumb) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
