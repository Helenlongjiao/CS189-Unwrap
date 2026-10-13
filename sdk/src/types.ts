export type TriggerType = 'rage_click' | 'dead_click' | 'error' | 'form_abandon' | 'manual';

export type ErrorKind = 'js' | 'promise' | 'console' | 'resource' | 'network';

export interface ElementInfo {
  selector: string;
  tag: string;
  label: string;
}

export type BreadcrumbType = 'page_view' | 'click' | 'focus' | 'submit' | 'error';

export interface Breadcrumb {
  type: BreadcrumbType;
  at: number;
  url: string;
  data: Record<string, unknown>;
}

export interface Trigger {
  id: string;
  type: TriggerType;
  at: number;
  url: string;
  title: string;
  element?: ElementInfo;
  context: Record<string, unknown>;
  /** Snapshot of the user's recent path and clicks leading up to the trigger. */
  trail: Breadcrumb[];
  /** True when cooldowns and session caps allow asking the user about it. */
  eligible: boolean;
  /** Recorded-only triggers (e.g. abandonment on page exit) can never prompt. */
  recordOnly: boolean;
}

export interface PulseConfig {
  siteKey: string;
  endpoint: string;
  debug: boolean;
  captureInteractions: boolean;
  rageClick: { count: number; windowMs: number; radiusPx: number };
  deadClick: { timeoutMs: number };
  formIdleMs: number;
  /** An error only becomes a prompt-worthy trigger if it follows a user click within this window. */
  errorClickWindowMs: number;
  /** Minimum gap between any two prompts. */
  cooldownMs: number;
  /** Minimum gap between two prompts of the same trigger type. */
  sameTypeCooldownMs: number;
  maxPromptsPerSession: number;
  trailSize: number;
}
