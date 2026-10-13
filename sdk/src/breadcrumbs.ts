import type { Breadcrumb, BreadcrumbType } from './types';
import { safeUrl } from './util';

/** Ring buffer of the user's recent path: pages visited, clicks, focused fields, submits, errors. */
export class Breadcrumbs {
  private items: Breadcrumb[] = [];
  private listeners = new Set<(b: Breadcrumb) => void>();

  constructor(private size: number) {}

  add(type: BreadcrumbType, data: Record<string, unknown> = {}): Breadcrumb {
    const crumb: Breadcrumb = { type, at: Date.now(), url: safeUrl(), data };
    this.items.push(crumb);
    if (this.items.length > this.size) this.items.shift();
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
