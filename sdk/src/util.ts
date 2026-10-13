export function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max - 1) + '…' : clean;
}

/** Drops query string and hash so tokens and emails in URLs are not collected. */
export function safeUrl(href: string = location.href): string {
  try {
    const u = new URL(href, location.href);
    return u.origin + u.pathname;
  } catch {
    return '';
  }
}

export function getSessionId(): string {
  const key = 'pulse_sid';
  try {
    let id = sessionStorage.getItem(key);
    if (!id) {
      id = uuid();
      sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return uuid();
  }
}
