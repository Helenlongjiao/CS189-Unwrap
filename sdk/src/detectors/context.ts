import type { Breadcrumbs } from '../breadcrumbs';
import type { Tap } from '../taps';
import type { Transport } from '../transport';
import type { TriggerEngine } from '../triggers';
import type { PulseConfig } from '../types';

export interface DetectorContext {
  config: PulseConfig;
  engine: TriggerEngine;
  breadcrumbs: Breadcrumbs;
  transport: Transport;
  onTap: (cb: (tap: Tap) => void) => () => void;
  /** Most recent user click, used to tie errors back to the action that caused them. */
  lastTap: () => Tap | undefined;
}

export type Detector = (ctx: DetectorContext) => () => void;
