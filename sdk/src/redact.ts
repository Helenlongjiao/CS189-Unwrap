const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
/** An IP straight after `//` is the host of a URL (the site's own server), not a visitor's address. */
const IPV4 = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
/** 13–19 digits, optionally split by single spaces or dashes. Only masked if it passes the Luhn check. */
const CARD = /\b\d(?:[ -]?\d){12,18}\b/g;
/** `+` and a country code, then 8–15 digits in all (the international maximum). */
const INTL_PHONE = /\+\d[\d ().-]{6,}\d/g;
/** US-style: (805) 555-1234, 805-555-1234, 805.555.1234, 8055551234. */
const PHONE = /(?:\(\d{3}\)|\b\d{3})[ .-]?\d{3}[ .-]?\d{4}\b/g;
const ACCOUNT = /\b\d{8,}\b/g;
/** Names have no pattern, so the path part right after a folder about people is masked: /users/jane-doe. */
const PERSON_PATH = /\/(users?|profiles?|people|persons?|members?|u|customers?|patients?|students?)\/([^/?#\s):]+)/gi;

/** Ids the SDK and server make up (session, trigger, survey). They hold no personal info and must arrive intact. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The browser's own string. Version numbers in it (Chrome/120.0.0.0, Gecko/20100101) look like an IP or account. */
const KEEP_KEYS = new Set(['userAgent']);

function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Swaps emails, phone numbers, IPv4 addresses, card numbers, long account numbers and names in
 * URL paths for placeholders like `[email]`. Errs on the side of hiding too much: short numbers,
 * prices and dates stay, but any run of 8+ digits is treated as an account number.
 */
export function redact(text: string): string {
  return text
    .replace(EMAIL, '[email]')
    .replace(IPV4, (ip, at: number, all: string) => (all.slice(at - 2, at) === '//' ? ip : '[ip]'))
    .replace(CARD, (card) => (passesLuhn(card.replace(/\D/g, '')) ? '[card]' : card))
    .replace(INTL_PHONE, (phone) => {
      const digits = phone.replace(/\D/g, '').length;
      return digits >= 8 && digits <= 15 ? '[phone]' : phone;
    })
    .replace(PHONE, '[phone]')
    .replace(ACCOUNT, '[account]')
    .replace(PERSON_PATH, (path, folder: string, part: string) =>
      // Leaves parts already masked above, and number-only ids (a later follow-up).
      part.startsWith('[') || !/[a-z]/i.test(part) ? path : `/${folder}/[name]`,
    );
}

/** Copy of a JSON-like value with every string redacted, nested ones too. The original is not changed. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') return (UUID.test(value) ? value : redact(value)) as T;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = KEEP_KEYS.has(key) ? item : redactDeep(item);
    return out as T;
  }
  return value;
}
