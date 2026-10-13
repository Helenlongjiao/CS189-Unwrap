export type OutboundEvent = Record<string, unknown> & { kind: string };

function getFetch(): typeof fetch | undefined {
  return typeof fetch === 'function' ? fetch : undefined;
}

/**
 * Batches events and ships them as `text/plain` JSON. That content type keeps requests
 * "simple" (no CORS preflight) and is the only reliable option for `sendBeacon` on page exit.
 */
export class Transport {
  private queue: OutboundEvent[] = [];
  private timer: ReturnType<typeof setInterval> | undefined;
  private onHide = () => {
    if (document.visibilityState === 'hidden') this.flush(true);
  };
  private onPageHide = () => this.flush(true);

  constructor(
    private endpoint: string,
    private siteKey: string,
    private sessionId: string,
    private meta: () => Record<string, unknown>,
    private maxBatch = 20,
    flushIntervalMs = 5000,
  ) {
    this.timer = setInterval(() => this.flush(), flushIntervalMs);
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onPageHide);
  }

  isOwnRequest(url: string): boolean {
    return url.startsWith(this.endpoint);
  }

  send(event: OutboundEvent) {
    this.queue.push(event);
    if (this.queue.length >= this.maxBatch) this.flush();
  }

  flush(exiting = false) {
    if (!this.queue.length) return;
    const events = this.queue.splice(0, this.queue.length);
    const body = JSON.stringify({ siteKey: this.siteKey, sessionId: this.sessionId, meta: this.meta(), events });
    const url = `${this.endpoint}/v1/events`;
    if (exiting && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(url, new Blob([body], { type: 'text/plain' }))) return;
    }
    getFetch()?.(url, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } }).catch(() => {
      this.queue.unshift(...events.slice(0, this.maxBatch * 5 - this.queue.length));
    });
  }

  /** Posts one JSON body as `text/plain` (no CORS preflight), surviving page unload. */
  post(path: string, payload: Record<string, unknown>): Promise<unknown> {
    const body = JSON.stringify({ siteKey: this.siteKey, sessionId: this.sessionId, ...payload });
    return this.request(path, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' } });
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const f = getFetch();
    if (!f) throw new Error('fetch unavailable');
    const res = await f(`${this.endpoint}${path}`, init);
    if (!res.ok) throw new Error(`[pulse] ${path} responded ${res.status}`);
    return res.json() as Promise<T>;
  }

  destroy() {
    this.flush(true);
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onPageHide);
  }
}
