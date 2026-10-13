import { optionsFromScript, type PulseOptions } from './config';
import { createPulse, type PulseInstance } from './pulse';

export const version = '0.1.0';

let instance: PulseInstance | null = null;

/** Starts the SDK. Calling it again returns the running instance. */
export function init(opts: PulseOptions): PulseInstance {
  if (!instance) instance = createPulse(opts);
  return instance;
}

export function destroy() {
  instance?.destroy();
  instance = null;
}

export function getInstance(): PulseInstance | null {
  return instance;
}

function autoInit() {
  const script =
    (document.currentScript as HTMLScriptElement | null) ??
    document.querySelector<HTMLScriptElement>('script[data-site-key]');
  const opts = script && optionsFromScript(script);
  if (!opts) return;
  const start = () => {
    try {
      init(opts);
    } catch (err) {
      console.warn('[pulse] failed to start', err);
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') autoInit();
