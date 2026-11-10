const NUMERIC = /^\d+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX = /^[0-9a-f]{16,}$/i;

/** Ids, tokens, and already-redacted segments collapse to one template slot. */
function isDynamic(segment: string): boolean {
  return NUMERIC.test(segment) || UUID.test(segment) || HEX.test(segment) || segment.length >= 24 || segment.startsWith('id:');
}

function fnv(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function rawPath(href: string): string {
  try {
    const url = new URL(href, 'http://local.invalid');
    let path = url.pathname;
    const hash = url.hash.replace(/^#/, '');
    // Hash routers (`#/inbox`, `#!/billing`) are pages. Anchors (`#section`) are not.
    if (/^!?\//.test(hash)) path = hash.replace(/^!/, '').split('?')[0] || '/';
    const parts = path.split('/').filter(Boolean).map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        return segment;
      }
    });
    return '/' + parts.join('/') || '/';
  } catch {
    return '/';
  }
}

/** Path identity with the query string removed. Hash routes keep their path; anchors do not. */
export function pageIdentity(href: string): string {
  return rawPath(href);
}

/** Same kind of page: `/products/42` and `/products/7` are both `/products/:id`. */
export function pageTemplate(href: string): string {
  const parts = pageIdentity(href)
    .split('/')
    .filter(Boolean)
    .map((segment) => (isDynamic(segment) ? ':id' : segment.toLowerCase()));
  return '/' + parts.join('/') || '/';
}

/**
 * Identity safe to store on a breadcrumb. Long tokens are hashed so a reset link
 * still counts as its own page without leaving the secret in the trail.
 */
export function routeFields(href: string): { identity: string; template: string } {
  const parts = pageIdentity(href)
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      if (segment.startsWith('id:')) return segment;
      if (segment.length >= 24 || UUID.test(segment) || HEX.test(segment)) return `id:${fnv(segment)}`;
      return segment;
    });
  return { identity: '/' + parts.join('/') || '/', template: pageTemplate(href) };
}
