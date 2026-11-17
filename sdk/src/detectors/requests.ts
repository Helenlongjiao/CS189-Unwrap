/**
 * Watches the page's own network requests (fetch and XMLHttpRequest) so detectors can tell
 * "I clicked and a request went out" from "I clicked and nothing was sent", and whether it failed.
 *
 * The wrappers are installed once and stay in place as pass-throughs; they only report to
 * watchers that are listening. They are never removed, because other code (the error detector)
 * wraps the same functions and removing ours could undo theirs.
 */

type Outcome = 'start' | 'ok' | 'failed';
interface RequestEvent {
  at: number;
  url: string;
  outcome: Outcome;
}

export interface RequestActivity {
  /** Requests that began at or after the given time. */
  started: number;
  /** Requests that finished fine (any answer below 500; a 404 or 422 is the page working). */
  ok: number;
  /** Requests that got a 5xx or no response at all. */
  failed: number;
}

export interface RequestWatcher {
  since(at: number): RequestActivity;
  stop(): void;
}

const MARK = '__pulseRequests';
const listeners = new Set<(event: RequestEvent) => void>();

function emit(url: string, outcome: Outcome) {
  const event = { at: Date.now(), url, outcome };
  listeners.forEach((listener) => listener(event));
}

function absolute(url: string): string {
  try {
    return new URL(url, location.href).href;
  } catch {
    return url;
  }
}

function install() {
  const originalFetch = window.fetch;
  if (typeof originalFetch === 'function' && !(originalFetch as unknown as Record<string, unknown>)[MARK]) {
    const wrapped = async function (input: RequestInfo | URL, init?: RequestInit) {
      const url = absolute(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
      emit(url, 'start');
      try {
        const res = await originalFetch.call(window, input, init);
        emit(url, res.status >= 500 ? 'failed' : 'ok');
        return res;
      } catch (err) {
        // An aborted request is the page changing its mind, not a failure.
        emit(url, err instanceof DOMException && err.name === 'AbortError' ? 'ok' : 'failed');
        throw err;
      }
    };
    (wrapped as unknown as Record<string, unknown>)[MARK] = true;
    window.fetch = wrapped as typeof fetch;
  }

  const proto = XMLHttpRequest.prototype;
  if (!(proto.send as unknown as Record<string, unknown>)[MARK]) {
    const originalOpen = proto.open;
    const originalSend = proto.send;
    proto.open = function (this: XMLHttpRequest & { __pulseUrl?: string }, method: string, url: string | URL, ...rest: unknown[]) {
      this.__pulseUrl = absolute(String(url));
      return (originalOpen as (...a: unknown[]) => void).call(this, method, url, ...rest);
    } as typeof proto.open;
    const send = function (this: XMLHttpRequest & { __pulseUrl?: string }, body?: Document | XMLHttpRequestBodyInit | null) {
      const url = this.__pulseUrl;
      if (url) {
        emit(url, 'start');
        this.addEventListener('loadend', () => emit(url, this.status === 0 || this.status >= 500 ? 'failed' : 'ok'));
      }
      return originalSend.call(this, body);
    };
    (send as unknown as Record<string, unknown>)[MARK] = true;
    proto.send = send as typeof proto.send;
  }
}

/** `isOwn` filters out the SDK's own traffic so it never counts as the page responding. */
export function watchRequests(isOwn: (url: string) => boolean): RequestWatcher {
  const log: RequestEvent[] = [];
  const listener = (event: RequestEvent) => {
    if (isOwn(event.url)) return;
    log.push(event);
    if (log.length > 100) log.shift();
  };
  install();
  listeners.add(listener);

  return {
    since(at) {
      const recent = log.filter((event) => event.at >= at);
      return {
        started: recent.filter((e) => e.outcome === 'start').length,
        ok: recent.filter((e) => e.outcome === 'ok').length,
        failed: recent.filter((e) => e.outcome === 'failed').length,
      };
    },
    stop() {
      listeners.delete(listener);
    },
  };
}
