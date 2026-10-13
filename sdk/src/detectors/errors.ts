import { describe, findInteractive } from '../dom';
import type { ErrorKind } from '../types';
import { safeUrl, truncate } from '../util';
import type { Detector } from './context';

interface CapturedError {
  kind: ErrorKind;
  message: string;
  [key: string]: unknown;
}

/**
 * Captures JS exceptions, unhandled promise rejections, `console.error`, failed resource loads,
 * and failed network calls (5xx or no response). Every error is stored with the user's trail;
 * only errors that follow a user click within `errorClickWindowMs` may prompt, since background
 * errors the user never noticed aren't worth interrupting them for.
 */
export const errorDetector: Detector = ({ config, engine, breadcrumbs, transport, lastTap }) => {
  const seen = new Set<string>();
  let reporting = false;

  const report = (err: CapturedError) => {
    if (reporting) return;
    reporting = true;
    try {
      const key = `${err.kind}:${err.message}`;
      if (seen.has(key)) return;
      seen.add(key);
      breadcrumbs.add('error', { kind: err.kind, message: err.message });

      const tap = lastTap();
      const causedByClick = !!tap && Date.now() - tap.at <= config.errorClickWindowMs;
      const element = causedByClick ? describe(findInteractive(tap!.target) ?? tap!.target) : undefined;
      const input = { element, context: { ...err, causedByClick } };
      if (causedByClick) engine.fire('error', input);
      else engine.record('error', input);
    } finally {
      reporting = false;
    }
  };

  const onError = (e: ErrorEvent | Event) => {
    const target = e.target;
    if (target instanceof HTMLElement) {
      const src = (target as HTMLImageElement).src || (target as HTMLLinkElement).href || '';
      report({ kind: 'resource', message: `Failed to load ${target.tagName.toLowerCase()}`, resource: safeUrl(src) });
      return;
    }
    const ev = e as ErrorEvent;
    report({
      kind: 'js',
      message: truncate(ev.message || String(ev.error), 300),
      source: ev.filename ? safeUrl(ev.filename) : undefined,
      line: ev.lineno,
      column: ev.colno,
      stack: ev.error?.stack ? truncate(String(ev.error.stack), 1000) : undefined,
    });
  };

  const onRejection = (e: PromiseRejectionEvent) => {
    const reason = e.reason;
    report({
      kind: 'promise',
      message: truncate(reason instanceof Error ? reason.message : String(reason), 300),
      stack: reason instanceof Error && reason.stack ? truncate(reason.stack, 1000) : undefined,
    });
  };

  const originalConsoleError = console.error;
  console.error = function (...args: unknown[]) {
    report({
      kind: 'console',
      message: truncate(args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : safeStringify(a))).join(' '), 300),
    });
    return originalConsoleError.apply(this, args);
  };

  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function') {
    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
      const ours = transport.isOwnRequest(new URL(url, location.href).href);
      try {
        const res = await originalFetch.call(window, input, init);
        if (!ours && res.status >= 500) {
          report({ kind: 'network', message: `${method} ${safeUrl(url)} failed with ${res.status}`, method, url: safeUrl(url), status: res.status });
        }
        return res;
      } catch (err) {
        if (!ours && !(err instanceof DOMException && err.name === 'AbortError')) {
          report({ kind: 'network', message: `${method} ${safeUrl(url)} failed (no response)`, method, url: safeUrl(url), status: 0 });
        }
        throw err;
      }
    };
  }

  const xhrProto = XMLHttpRequest.prototype;
  const originalOpen = xhrProto.open;
  const originalSend = xhrProto.send;
  xhrProto.open = function (this: XMLHttpRequest & { __pulse?: { method: string; url: string } }, method: string, url: string | URL, ...rest: unknown[]) {
    this.__pulse = { method: method.toUpperCase(), url: String(url) };
    return (originalOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
  } as typeof xhrProto.open;
  xhrProto.send = function (this: XMLHttpRequest & { __pulse?: { method: string; url: string } }, body?: Document | XMLHttpRequestBodyInit | null) {
    const info = this.__pulse;
    if (info && !transport.isOwnRequest(new URL(info.url, location.href).href)) {
      this.addEventListener('loadend', () => {
        if (this.status === 0 || this.status >= 500) {
          const status = this.status;
          report({
            kind: 'network',
            message: `${info.method} ${safeUrl(info.url)} failed ${status ? `with ${status}` : '(no response)'}`,
            method: info.method,
            url: safeUrl(info.url),
            status,
          });
        }
      });
    }
    return originalSend.call(this, body);
  };

  window.addEventListener('error', onError, true);
  window.addEventListener('unhandledrejection', onRejection);

  return () => {
    window.removeEventListener('error', onError, true);
    window.removeEventListener('unhandledrejection', onRejection);
    console.error = originalConsoleError;
    if (originalFetch) window.fetch = originalFetch;
    xhrProto.open = originalOpen;
    xhrProto.send = originalSend;
  };
};

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
