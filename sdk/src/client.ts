export interface ClientContext {
  timezone: string;
  /** Rough place derived from the timezone, e.g. "Los Angeles". No geolocation permission is used. */
  region: string;
  localTime: string;
  partOfDay: 'late night' | 'morning' | 'afternoon' | 'evening' | 'night';
  weekday: string;
  language: string;
  browser: string;
  os: string;
  device: 'mobile' | 'tablet' | 'desktop';
  viewport: { width: number; height: number };
  touch: boolean;
  connection?: string;
  referrer?: string;
}

/** Order matters: Edge and Opera also contain "Chrome", and Chrome also contains "Safari". */
const BROWSERS: Array<[string, RegExp]> = [
  ['Edge', /Edg\/(\d+)/],
  ['Opera', /OPR\/(\d+)/],
  ['Firefox', /Firefox\/(\d+)/],
  ['Chrome', /Chrome\/(\d+)/],
  ['Safari', /Version\/(\d+).*Safari/],
];

function browserName(ua: string): string {
  for (const [name, re] of BROWSERS) {
    const m = re.exec(ua);
    if (m) return `${name} ${m[1]}`;
  }
  return 'Unknown browser';
}

function osName(ua: string): string {
  if (/iPhone|iPad|iPod/.test(ua)) return 'iOS';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/.test(ua)) return 'macOS';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Linux/.test(ua)) return 'Linux';
  return 'Unknown OS';
}

function partOfDay(hour: number): ClientContext['partOfDay'] {
  if (hour < 5) return 'late night';
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

export function clientContext(now = new Date()): ClientContext {
  const ua = navigator.userAgent;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const width = window.innerWidth;
  const device = /iPad|Tablet/.test(ua) ? 'tablet' : /Mobi|iPhone|Android/.test(ua) || width < 600 ? 'mobile' : 'desktop';
  const connection = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;
  return {
    timezone,
    region: (timezone.split('/').pop() || timezone).replace(/_/g, ' '),
    localTime: now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
    partOfDay: partOfDay(now.getHours()),
    weekday: now.toLocaleDateString('en-US', { weekday: 'long' }),
    language: navigator.language,
    browser: browserName(ua),
    os: osName(ua),
    device,
    viewport: { width, height: window.innerHeight },
    touch: navigator.maxTouchPoints > 0,
    ...(connection && { connection }),
    ...(document.referrer && { referrer: document.referrer.split('?')[0] }),
  };
}
