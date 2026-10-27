import type { PulseConfig } from './types';

export type PulseOptions = Partial<Omit<PulseConfig, 'rageClick' | 'deadClick' | 'scoreThreshold'>> & {
  siteKey: string;
  rageClick?: Partial<PulseConfig['rageClick']>;
  deadClick?: Partial<PulseConfig['deadClick']>;
  scoreThreshold?: Partial<PulseConfig['scoreThreshold']>;
};

export const DEFAULTS: Omit<PulseConfig, 'siteKey' | 'endpoint'> = {
  debug: false,
  captureInteractions: true,
  rageClick: { count: 3, windowMs: 700, radiusPx: 30, settleMs: 300 },
  deadClick: { timeoutMs: 1000 },
  scoreThreshold: { rageClick: 50, deadClick: 45, error: 50 },
  formIdleMs: 30_000,
  errorClickWindowMs: 3_000,
  cooldownMs: 60_000,
  sameTypeCooldownMs: 5 * 60_000,
  maxPromptsPerSession: 3,
  limits: true,
  trailSize: 50,
  widget: true,
  autoOpen: true,
  position: 'bottom-right',
  ai: false,
};

export function resolveConfig(opts: PulseOptions): PulseConfig {
  if (!opts.siteKey) throw new Error('[pulse] siteKey is required');
  return {
    ...DEFAULTS,
    ...opts,
    endpoint: (opts.endpoint || location.origin).replace(/\/+$/, ''),
    rageClick: { ...DEFAULTS.rageClick, ...opts.rageClick },
    deadClick: { ...DEFAULTS.deadClick, ...opts.deadClick },
    scoreThreshold: { ...DEFAULTS.scoreThreshold, ...opts.scoreThreshold },
  };
}

/** Reads `data-*` attributes from the embedding <script> tag. */
export function optionsFromScript(script: HTMLScriptElement): PulseOptions | null {
  const siteKey = script.dataset.siteKey;
  if (!siteKey) return null;
  let endpoint = script.dataset.endpoint;
  if (!endpoint && script.src) endpoint = new URL(script.src, location.href).origin;
  const d = script.dataset;
  return {
    siteKey,
    endpoint,
    debug: d.debug === 'true',
    ...(d.widget === 'false' && { widget: false }),
    ...(d.autoOpen === 'false' && { autoOpen: false }),
    ...(d.position === 'bottom-left' && { position: 'bottom-left' as const }),
    ...(d.accent && { accentColor: d.accent }),
    ...(d.ai === 'true' && { ai: true }),
    ...(d.limits === 'off' && { limits: false }),
  };
}
