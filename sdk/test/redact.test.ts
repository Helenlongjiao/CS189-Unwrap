import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { redact, redactDeep } from '../src/redact';
import { Transport } from '../src/transport';

// Test strings come from fields the data-collection inventory lists as personal or maybe-personal:
// click labels and areas, page titles, URLs, error messages, the search-box query, survey answers
// and guide questions.
describe('redact', () => {
  it.each([
    ['SECRETVALUE leak@example.com', 'SECRETVALUE [email]'],
    ['my email is Jane.Doe+promo@mail.example.co.uk, thanks', 'my email is [email], thanks'],
    ['failed for leak@example.com', 'failed for [email]'],
    ['http://localhost:5173/users/jane@example.com', 'http://localhost:5173/users/[email]'],
  ])('masks emails: %s', (input, output) => expect(redact(input)).toBe(output));

  it.each([
    ['call me at (805) 555-1234', 'call me at [phone]'],
    ['805-555-1234', '[phone]'],
    ['805.555.1234 or 8055551234', '[phone] or [phone]'],
    ['+1 805 555 1234', '[phone]'],
    ['UK office +44 20 7946 0958', 'UK office [phone]'],
  ])('masks phone numbers: %s', (input, output) => expect(redact(input)).toBe(output));

  it.each([
    ['blocked from 203.0.113.42 again', 'blocked from [ip] again'],
    ['client ip=10.0.0.1', 'client ip=[ip]'],
  ])('masks IPv4 addresses: %s', (input, output) => expect(redact(input)).toBe(output));

  it.each([
    ['card 4111 1111 1111 1111 was declined', 'card [card] was declined'],
    ['4242424242424242', '[card]'],
    ['5555-5555-5555-4444', '[card]'],
  ])('masks card numbers that pass the Luhn check: %s', (input, output) => expect(redact(input)).toBe(output));

  it('does not call a number a card when it fails the Luhn check', () => {
    expect(redact('4111 1111 1111 1112')).toBe('4111 1111 1111 1112');
    expect(redact('4111111111111112')).toBe('[account]');
  });

  it.each([
    ['account 12345678 is locked', 'account [account] is locked'],
    ['routing 021000021, acct 000123456789', 'routing [account], acct [account]'],
    ['http://localhost:5173/accounts/987654321/statements', 'http://localhost:5173/accounts/[account]/statements'],
  ])('masks long account numbers: %s', (input, output) => expect(redact(input)).toBe(output));

  it.each([
    ['http://localhost:5173/users/jane-doe', 'http://localhost:5173/users/[name]'],
    ['http://localhost:5173/profile/Jane.Doe/settings', 'http://localhost:5173/profile/[name]/settings'],
    ['/members/jane_doe and /patients/john-smith', '/members/[name] and /patients/[name]'],
    ['GET http://localhost:5176/students/maria%20lopez/grades failed with 500', 'GET http://localhost:5176/students/[name]/grades failed with 500'],
    ['at load (http://localhost:5173/u/jdoe/app.js:12:5)', 'at load (http://localhost:5173/u/[name]/app.js:12:5)'],
  ])('masks the name after a person folder in a URL path: %s', (input, output) => expect(redact(input)).toBe(output));

  it('keeps other masks and number-only ids after a person folder', () => {
    expect(redact('/users/jane@example.com')).toBe('/users/[email]');
    expect(redact('/users/48213')).toBe('/users/48213');
  });

  it.each([
    'Apply',
    'Passenger details',
    'Promo code',
    'LAX → Tokyo (HND)',
    'View seat map',
    'Total: $1,299.00',
    'Nov 5, 2026 at 11:26 AM',
    '2026-11-05',
    '11/05/2026',
    'Flight SK12, 2 adults, seat 14C',
    'Zip 93106',
    'Order #4821',
    'Cannot read properties of undefined (reading \'price\')',
    'POST http://localhost:5173/api/book failed with 500',
    'http://localhost:5173/checkout.html',
    'http://127.0.0.1:5173/checkout.html',
    'America/Los_Angeles',
    'Chrome 120 on macOS',
    'jquery-3.6.0.min.js',
    'http://localhost:5177/records.html',
    'http://localhost:5175/accounts.html',
    'Ask other users for help',
  ])('leaves normal text alone: %s', (text) => expect(redact(text)).toBe(text));
});

describe('redactDeep', () => {
  it('masks every string value, nested ones too, without changing the original', () => {
    const event = {
      kind: 'friction',
      type: 'lost',
      context: { tier: 'full', score: 62, strong: true, query: 'SECRETVALUE leak@example.com' },
      trail: [{ type: 'click', at: 1, url: 'http://localhost:5173/', data: { label: 'Email jane@example.com', x: 4 } }],
    };
    const copy = structuredClone(event);
    expect(redactDeep(event)).toEqual({
      kind: 'friction',
      type: 'lost',
      context: { tier: 'full', score: 62, strong: true, query: 'SECRETVALUE [email]' },
      trail: [{ type: 'click', at: 1, url: 'http://localhost:5173/', data: { label: 'Email [email]', x: 4 } }],
    });
    expect(event).toEqual(copy);
  });

  it('keeps ids and the browser’s user agent, which the server needs as they are', () => {
    const id = '12345678-1234-4123-8123-123456789012';
    const userAgent = 'Mozilla/5.0 (Macintosh; rv:121.0) Gecko/20100101 Firefox/121.0 Chrome/120.0.0.0';
    expect(redactDeep({ id, triggerId: id, userAgent })).toEqual({ id, triggerId: id, userAgent });
  });

  it('leaves numbers, booleans, null and undefined untouched', () => {
    expect(redactDeep({ at: 1793906800061, status: 500, ok: false, none: null, gone: undefined })).toEqual({
      at: 1793906800061,
      status: 500,
      ok: false,
      none: null,
      gone: undefined,
    });
  });
});

describe('Transport masks what leaves the browser', () => {
  const sessionId = '0b6c7c38-5f4e-4c1e-9a43-1f7f6f1d2a10';
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  let transport: Transport;

  const body = (call: number) => JSON.parse((fetchMock.mock.calls[call] as unknown as [string, RequestInit])[1].body as string);

  beforeEach(() => {
    fetchMock.mockClear();
    vi.stubGlobal('fetch', fetchMock);
    transport = new Transport('http://api.test', 'pk_test', sessionId, () => ({
      referrer: 'http://localhost:5173/users/jane@example.com',
      client: { region: 'Los Angeles', viewport: { width: 1280, height: 800 } },
    }));
  });

  afterEach(() => {
    transport.destroy();
    vi.unstubAllGlobals();
  });

  it('masks events and page info in flush(), but not the site key, session id or event id', () => {
    const id = '9d1f3c2a-7b4e-4f6a-8c1d-2e3f4a5b6c7d';
    transport.send({ kind: 'friction', id, type: 'error', context: { kind: 'console', message: 'failed for leak@example.com' } });
    transport.flush();

    const sent = body(0);
    expect(sent.siteKey).toBe('pk_test');
    expect(sent.sessionId).toBe(sessionId);
    expect(sent.meta).toEqual({
      referrer: 'http://localhost:5173/users/[email]',
      client: { region: 'Los Angeles', viewport: { width: 1280, height: 800 } },
    });
    expect(sent.events[0]).toMatchObject({ id, context: { message: 'failed for [email]' } });
  });

  it('masks survey answers and guide questions in post()', async () => {
    const triggerId = '9d1f3c2a-7b4e-4f6a-8c1d-2e3f4a5b6c7d';
    await transport.post('/v1/responses', {
      triggerId,
      status: 'submitted',
      answers: { kind: 'something_broke', details: 'my email is leak@example.com, call 805-555-1234' },
    });
    await transport.post('/v1/guide', { query: 'refund to card 4111 1111 1111 1111', url: 'http://localhost:5173/help' });

    expect(body(0)).toMatchObject({
      siteKey: 'pk_test',
      sessionId,
      triggerId,
      answers: { kind: 'something_broke', details: 'my email is [email], call [phone]' },
    });
    expect(body(1)).toMatchObject({ query: 'refund to card [card]', url: 'http://localhost:5173/help' });
  });
});
