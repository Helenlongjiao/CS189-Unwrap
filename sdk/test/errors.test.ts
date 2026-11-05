import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { errorDetector } from '../src/detectors/errors';
import { ENDPOINT, click, setup } from './harness';

describe('error detector', () => {
  let h: ReturnType<typeof setup>;
  const realFetch = window.fetch;
  const realConsoleError = console.error;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    console.error = vi.fn();
    window.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response('{}', { status: url.includes('/broken') || url.startsWith(ENDPOINT) ? 500 : 200 });
    }) as typeof fetch;
    document.body.innerHTML = '<button id="save">Save</button>';
    h = setup(errorDetector);
  });

  afterEach(() => {
    h.cleanup();
    window.fetch = realFetch;
    console.error = realConsoleError;
    vi.useRealTimers();
  });

  it('turns a JS error right after a click into a prompt-worthy trigger tied to that click', () => {
    click(document.getElementById('save')!);
    window.dispatchEvent(new ErrorEvent('error', { message: 'Cannot read properties of undefined', filename: 'https://site.test/app.js?v=1', lineno: 3 }));
    expect(h.triggers).toHaveLength(1);
    const [t] = h.triggers;
    expect(t).toMatchObject({ type: 'error', eligible: true, recordOnly: false });
    expect(t.context).toMatchObject({ kind: 'js', causedByClick: true, source: 'https://site.test/app.js', line: 3 });
    expect(t.element?.label).toBe('Save');
    expect(h.breadcrumbs.snapshot().some((b) => b.type === 'error')).toBe(true);
  });

  it('records background errors without prompting', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'boom' }));
    expect(h.triggers[0]).toMatchObject({ type: 'error', eligible: false, recordOnly: true });
  });

  it('reports failed network calls but not the SDK’s own requests', async () => {
    click(document.getElementById('save')!);
    await window.fetch('https://site.test/api/broken?token=secret', { method: 'POST' });
    await window.fetch(`${ENDPOINT}/v1/events`, { method: 'POST' });
    await window.fetch('https://site.test/api/ok');
    expect(h.triggers).toHaveLength(1);
    expect(h.triggers[0].context).toMatchObject({ kind: 'network', status: 500, method: 'POST', url: 'https://site.test/api/broken' });
  });

  it('drops query strings and hashes from URLs in crash reports', () => {
    const error = new TypeError('price is undefined');
    error.stack =
      'TypeError: price is undefined\n' +
      '    at pay (http://localhost:5173/checkout.html?q=leak@example.com:69:12)\n' +
      '    at http://localhost:5173/app.js?v=3#top:10:5';
    window.dispatchEvent(new ErrorEvent('error', { message: error.message, error }));
    expect(h.triggers[0].context.stack).toBe(
      'TypeError: price is undefined at pay (http://localhost:5173/checkout.html:69:12) at http://localhost:5173/app.js:10:5',
    );

    const rejection = new Error('Transfer rejected');
    rejection.stack = 'Error: Transfer rejected\npay@http://localhost:5173/checkout.html?flight=SK12:70:3';
    window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: rejection }));
    expect(h.triggers[1].context.stack).toBe('Error: Transfer rejected pay@http://localhost:5173/checkout.html:70:3');
  });

  it('captures console.error and still calls the original', () => {
    console.error('Payment widget failed', { code: 42 });
    expect(h.triggers[0].context).toMatchObject({ kind: 'console', message: 'Payment widget failed {"code":42}' });
  });

  it('reports the same error only once per page', () => {
    window.dispatchEvent(new ErrorEvent('error', { message: 'same' }));
    window.dispatchEvent(new ErrorEvent('error', { message: 'same' }));
    expect(h.triggers).toHaveLength(1);
  });
});
