import type { ElementInfo } from './types';
import { truncate } from './util';

export const HOST_ATTR = 'data-pulse-root';

function esc(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  return value.replace(/^\d|[^\w-]/g, (c) => `\\${c.charCodeAt(0).toString(16)} `);
}

const INTERACTIVE =
  'a[href],button,summary,select,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="checkbox"],' +
  'input[type="submit"],input[type="button"],input[type="reset"],input[type="image"],[onclick],[data-pulse-clickable]';

const DISABLED = 'button:disabled,input:disabled,select:disabled,textarea:disabled,[aria-disabled="true"]';

export function isInsidePulse(el: Element | null): boolean {
  return !!el && !!el.closest(`[${HOST_ATTR}]`);
}

export function asElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
}

/** Nearest element the user plausibly meant to click, or null if nothing looks clickable. */
export function findInteractive(el: Element): Element | null {
  const match = el.closest(INTERACTIVE);
  if (match) return match;
  let node: Element | null = el;
  for (let depth = 0; node && depth < 3; depth++, node = node.parentElement) {
    if (getComputedStyle(node).cursor === 'pointer') return node;
  }
  return null;
}

export function findDisabled(el: Element): Element | null {
  return el.closest(DISABLED);
}

export function cssPath(el: Element): string {
  if (el.id) return `#${esc(el.id)}`;
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.documentElement && parts.length < 4) {
    let part = node.tagName.toLowerCase();
    if (node.id) {
      parts.unshift(`#${esc(node.id)}`);
      break;
    }
    const classes = Array.from(node.classList).slice(0, 2);
    if (classes.length) part += '.' + classes.map((c) => esc(c)).join('.');
    const parent: Element | null = node.parentElement;
    if (parent) {
      const same = Array.from(parent.children).filter((c) => c.tagName === node!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(node) + 1})`;
    }
    parts.unshift(part);
    node = parent;
  }
  return parts.join(' > ');
}

/** Human-readable label for a field, never its value. */
export function fieldLabel(el: Element): string {
  const id = el.getAttribute('id');
  if (id) {
    const label = document.querySelector(`label[for="${esc(id)}"]`);
    if (label?.textContent) return truncate(label.textContent, 60);
  }
  const wrapping = el.closest('label');
  if (wrapping?.textContent) return truncate(wrapping.textContent, 60);
  return truncate(
    el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('name') || el.tagName.toLowerCase(),
    60,
  );
}

export function describe(el: Element): ElementInfo {
  const tag = el.tagName.toLowerCase();
  let label = el.getAttribute('aria-label') || '';
  if (!label && (tag === 'input' || tag === 'select' || tag === 'textarea')) {
    const type = (el as HTMLInputElement).type;
    label = ['submit', 'button', 'reset'].includes(type) ? (el as HTMLInputElement).value : fieldLabel(el);
  }
  if (!label) label = (el as HTMLElement).innerText || el.textContent || '';
  if (!label) label = el.getAttribute('title') || el.getAttribute('alt') || tag;
  return { selector: cssPath(el), tag, label: truncate(label, 60) };
}
