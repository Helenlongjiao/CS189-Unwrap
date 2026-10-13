type NavListener = (url: string) => void;

const listeners = new Set<NavListener>();
let patched = false;

function emit() {
  listeners.forEach((cb) => cb(location.href));
}

function patchHistory() {
  if (patched) return;
  patched = true;
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method];
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args);
      emit();
      return result;
    };
  }
  window.addEventListener('popstate', emit);
  window.addEventListener('hashchange', emit);
}

/** Fires on SPA route changes (pushState, replaceState, back/forward, hash changes). */
export function onNavigate(cb: NavListener): () => void {
  patchHistory();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
