import type { Breadcrumbs } from './breadcrumbs';
import type { Transport } from './transport';
import type { ElementInfo, PulseConfig, Trigger, TriggerType } from './types';
import { safeUrl, uuid } from './util';

interface TriggerInput {
  element?: ElementInfo;
  context?: Record<string, unknown>;
}

interface PromptState {
  count: number;
  lastAt: number;
  lastByType: Partial<Record<TriggerType, number>>;
}

const STATE_KEY = 'pulse_prompts';

/**
 * Turns detector output into recorded triggers and decides whether each one may prompt the user.
 * Prompt budgets live in sessionStorage so they hold across page loads, which keeps false
 * positives (fast double-clickers, noisy pages) from spamming anyone.
 */
export class TriggerEngine {
  private listeners = new Set<(t: Trigger) => void>();

  constructor(
    private config: PulseConfig,
    private transport: Transport,
    private breadcrumbs: Breadcrumbs,
  ) {}

  /** A trigger that may prompt the user if the budget allows. */
  fire(type: TriggerType, input: TriggerInput = {}): Trigger {
    return this.emit(type, input, false);
  }

  /** A trigger stored for analysis only, e.g. when the page is already closing. */
  record(type: TriggerType, input: TriggerInput = {}): Trigger {
    return this.emit(type, input, true);
  }

  onTrigger(cb: (t: Trigger) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** Called by whatever UI actually showed a prompt, so the budget is only spent on real prompts. */
  notePrompted(type: TriggerType) {
    const state = this.loadState();
    const now = Date.now();
    state.count += 1;
    state.lastAt = now;
    state.lastByType[type] = now;
    this.saveState(state);
  }

  isEligible(type: TriggerType): boolean {
    if (type === 'manual' || !this.config.limits) return true;
    const state = this.loadState();
    const now = Date.now();
    if (state.count >= this.config.maxPromptsPerSession) return false;
    if (now - state.lastAt < this.config.cooldownMs) return false;
    const lastSame = state.lastByType[type];
    return !(lastSame && now - lastSame < this.config.sameTypeCooldownMs);
  }

  private emit(type: TriggerType, input: TriggerInput, recordOnly: boolean): Trigger {
    const trigger: Trigger = {
      id: uuid(),
      type,
      at: Date.now(),
      url: safeUrl(),
      title: document.title,
      element: input.element,
      context: input.context ?? {},
      trail: this.breadcrumbs.snapshot(),
      eligible: !recordOnly && this.isEligible(type),
      recordOnly,
    };
    this.transport.send({ kind: 'friction', ...trigger });
    if (this.config.debug) console.info('[pulse] trigger', trigger);
    this.listeners.forEach((cb) => cb(trigger));
    return trigger;
  }

  private loadState(): PromptState {
    try {
      const raw = sessionStorage.getItem(STATE_KEY);
      if (raw) return JSON.parse(raw) as PromptState;
    } catch {
      /* storage blocked or corrupt: fall through to a fresh budget */
    }
    return { count: 0, lastAt: 0, lastByType: {} };
  }

  private saveState(state: PromptState) {
    try {
      sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
    } catch {
      /* storage blocked: budget resets on reload */
    }
  }
}
