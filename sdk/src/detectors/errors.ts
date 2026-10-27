import { describe, findInteractive } from '../dom';
import { explainScore, type Evidence } from '../scoring';
import type { ErrorKind } from '../types';
import { safeUrl, truncate } from '../util';
import type { Detector } from './context';

interface CapturedError {
  kind: ErrorKind;
  message: string;
  [key: string]: unknown;
}

/** How blocking each kind of error usually is, before looking at what the user was doing. */
const BASE_POINTS: Record<ErrorKind, number> = { js: 40, promise: 30, network: 35, page: 40, console: 15, resource: 15 };

/** Browser warnings that say nothing about the page being broken. */
const BENIGN_MESSAGE = /ResizeObserver loop/i;

/** Analytics, ads and monitoring hosts. Their failures are not the user's problem. */
const NOISE_HOSTS =
  /(^|\.)(googletagmanager\.com|google-analytics\.com|doubleclick\.net|googlesyndication\.com|facebook\.net|hotjar\.com|segment\.(io|com)|mixpanel\.com|amplitude\.com|fullstory\.com|clarity\.ms|sentry\.io|datadoghq\.com|newrelic\.com|nr-data\.net|intercom\.io|hubspot\.com|adobedtm\.com)$/i;

/** True for browser-extension scripts and well-known third-party hosts. Checked on the raw URL. */
function isThirdPartyNoise(raw: unknown): boolean {
  if (typeof raw !== 'string' || !raw) return false;
  if (/^[a-z-]+-extension:/i.test(raw)) return true;
  try {
    return NOISE_HOSTS.test(new URL(raw, location.href).hostname);
  } catch {
    return false;
  }
}

const noise = (raw: unknown) => (isThirdPartyNoise(raw) ? { thirdParty: true } : {});

/**
 * Captures JS exceptions, unhandled promise rejections, `console.error`, failed resource loads,
 * and failed network calls (5xx or no response). Every error is stored with the user's trail.
 *
 * Each error is scored: its kind sets the starting points (a crash or failed request outweighs a
 * console warning or a missing image); an error right after a click adds points that fade the
 * longer it takes to arrive; a failed write (POST, PUT, ...) adds more; browser warnings, errors
 * with no readable source, extension scripts and third-party trackers take points away.
 * Only an error that follows a click within `errorClickWindowMs` AND reaches
 * `scoreThreshold.error` may prompt; the rest are recorded with their score.
 */
export const errorDetector: Detector = ({ config, engine, breadcrumbs, transport, lastTap }) => {
  const seen = new Set<string>();
  let reporting = false;

  const scoreError = (err: CapturedError, now: number, tapAt: number | undefined, causedByClick: boolean) => {
    const evidence: Evidence[] = [{ id: `error-${err.kind}`, weight: BASE_POINTS[err.kind], at: now }];
    // Dated at the click, so it fades as the gap between click and error grows.
    if (causedByClick && tapAt !== undefined) evidence.push({ id: 'after-click', weight: 30, at: tapAt });
    if (err.kind === 'network' && typeof err.method === 'string' && !['GET', 'HEAD'].includes(err.method)) {
      evidence.push({ id: 'failed-write', weight: 15, at: now });
    }
    if (BENIGN_MESSAGE.test(err.message)) evidence.push({ id: 'benign-browser-warning', weight: -60, at: now });
    if (err.message === 'Script error.') evidence.push({ id: 'unreadable-script-error', weight: -30, at: now });
    if (err.thirdParty) evidence.push({ id: 'third-party-source', weight: -50, at: now });
    return explainScore(evidence, now, config.errorClickWindowMs);
  };

  const report = (err: CapturedError) => {
    if (reporting) return;
    reporting = true;
    try {
      const tap = lastTap();
      // Without limits, the same error counts again when a new click causes it.
      const key = `${err.kind}:${err.message}${config.limits ? '' : `:${tap?.at ?? ''}`}`;
      if (seen.has(key)) return;
      seen.add(key);
      breadcrumbs.add('error', { kind: err.kind, message: err.message });

      const now = Date.now();
      const causedByClick = !!tap && now - tap.at <= config.errorClickWindowMs;
      const element = causedByClick ? describe(findInteractive(tap!.target) ?? tap!.target) : undefined;
      const { score, signals } = scoreError(err, now, tap?.at, causedByClick);
      const input = { element, context: { ...err, causedByClick, score, signals } };
      if (causedByClick && score >= config.scoreThreshold.error) engine.fire('error', input);
      else engine.record('error', input);
    } finally {
      reporting = false;
    }
  };

  const onError = (e: ErrorEvent | Event) => {
    const target = e.target;
    if (target instanceof HTMLElement) {
      const src = (target as HTMLImageElement).src || (target as HTMLLinkElement).href || '';
      report({ kind: 'resource', message: `Failed to load ${target.tagName.toLowerCase()}`, resource: safeUrl(src), ...noise(src) });
      return;
    }
    const ev = e as ErrorEvent;
    report({
      kind: 'js',
      message: truncate(ev.message || String(ev.error), 300),
      source: ev.filename ? safeUrl(ev.filename) : undefined,
      ...noise(ev.filename),
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
          report({ kind: 'network', message: `${method} ${safeUrl(url)} failed with ${res.status}`, method, url: safeUrl(url), status: res.status, ...noise(new URL(url, location.href).href) });
        }
        return res;
      } catch (err) {
        if (!ours && !(err instanceof DOMException && err.name === 'AbortError')) {
          report({ kind: 'network', message: `${method} ${safeUrl(url)} failed (no response)`, method, url: safeUrl(url), status: 0, ...noise(new URL(url, location.href).href) });
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
            ...noise(new URL(info.url, location.href).href),
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
