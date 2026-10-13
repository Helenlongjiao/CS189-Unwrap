export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  --a: var(--pulse-accent, #22d3ee);
  --warn: #fbbf24;
  position: fixed; bottom: 22px; z-index: 2147483000;
  font: 13.5px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #dbeafe; display: flex; flex-direction: column; gap: 14px;
}
.wrap.right { right: 22px; align-items: flex-end; }
.wrap.left { left: 22px; align-items: flex-start; }
.mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; }

/* Arc-reactor launcher */
.launcher {
  position: relative; width: 56px; height: 56px; border-radius: 50%; border: 0; padding: 0; cursor: pointer;
  background: radial-gradient(circle, #0b1220 55%, #050912 100%);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--a) 45%, transparent), 0 0 22px color-mix(in srgb, var(--a) 35%, transparent);
  transition: transform .2s ease, box-shadow .2s ease;
}
.launcher:hover { transform: scale(1.07); box-shadow: 0 0 0 1px var(--a), 0 0 32px color-mix(in srgb, var(--a) 55%, transparent); }
.launcher .ring {
  position: absolute; inset: 5px; border-radius: 50%;
  background: conic-gradient(from 0deg, transparent 0 15%, var(--a) 15% 25%, transparent 25% 40%, var(--a) 40% 50%, transparent 50% 65%, var(--a) 65% 75%, transparent 75%);
  -webkit-mask: radial-gradient(circle, transparent 62%, #000 63%); mask: radial-gradient(circle, transparent 62%, #000 63%);
  animation: spin 9s linear infinite; opacity: .85;
}
.launcher .ring.inner { inset: 13px; animation-duration: 6s; animation-direction: reverse; opacity: .6; }
.launcher .core {
  position: absolute; inset: 21px; border-radius: 50%; background: #e0fbff;
  box-shadow: 0 0 10px 3px var(--a), 0 0 22px 6px color-mix(in srgb, var(--a) 50%, transparent);
  animation: breathe 3s ease-in-out infinite;
}
.launcher.alert .ring { background: conic-gradient(from 0deg, transparent 0 15%, var(--warn) 15% 25%, transparent 25% 40%, var(--warn) 40% 50%, transparent 50% 65%, var(--warn) 65% 75%, transparent 75%); animation-duration: 2.5s; }
.launcher.alert .core { box-shadow: 0 0 10px 3px var(--warn), 0 0 24px 8px color-mix(in srgb, var(--warn) 50%, transparent); }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes breathe { 50% { transform: scale(.82); opacity: .85; } }
.launcher:focus-visible, button:focus-visible, textarea:focus-visible, .opt input:focus-visible + span { outline: 2px solid var(--a); outline-offset: 3px; }

/* HUD panel */
.panel {
  position: relative; width: min(360px, calc(100vw - 44px)); max-height: calc(100vh - 110px); overflow-y: auto;
  scrollbar-width: none; overscroll-behavior: contain;
  padding: 14px 16px 14px; border-radius: 14px;
  background:
    linear-gradient(color-mix(in srgb, var(--a) 6%, transparent) 1px, transparent 1px) 0 0 / 100% 22px,
    linear-gradient(160deg, rgba(10,20,36,.96), rgba(4,9,18,.97));
  border: 1px solid color-mix(in srgb, var(--a) 35%, transparent);
  box-shadow: 0 0 0 1px rgba(0,0,0,.4), 0 18px 50px rgba(0,0,0,.55), 0 0 40px color-mix(in srgb, var(--a) 14%, transparent), inset 0 0 30px color-mix(in srgb, var(--a) 6%, transparent);
  backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
  animation: boot .35s cubic-bezier(.2,.9,.3,1.2);
}
.panel::before, .panel::after {
  content: ""; position: absolute; width: 16px; height: 16px; border: 2px solid var(--a); pointer-events: none; opacity: .9;
}
.panel::before { top: 6px; left: 6px; border-right: 0; border-bottom: 0; border-top-left-radius: 6px; }
.panel::after { bottom: 6px; right: 6px; border-left: 0; border-top: 0; border-bottom-right-radius: 6px; }
@keyframes boot { from { opacity: 0; transform: translateY(10px) scale(.96); filter: blur(4px); } to { opacity: 1; transform: none; filter: none; } }

.status { display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: var(--a); }
.status .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--a); box-shadow: 0 0 8px var(--a); animation: blink 1.4s infinite; }
.status.alert { color: var(--warn); }
.status.alert .dot { background: var(--warn); box-shadow: 0 0 8px var(--warn); }
@keyframes blink { 50% { opacity: .3; } }
.close {
  margin-left: auto; border: 1px solid color-mix(in srgb, var(--a) 30%, transparent); background: transparent; color: #93c5fd;
  width: 26px; height: 26px; border-radius: 7px; cursor: pointer; font-size: 16px; line-height: 1;
}
.close:hover { color: #fff; border-color: var(--a); box-shadow: 0 0 10px color-mix(in srgb, var(--a) 40%, transparent); }
.detail { margin: 6px 0 0; font-size: 11.5px; color: #fde68a; }
.route { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; margin: 6px 0 2px; font-size: 10px; }
.chip { padding: 2px 7px; border-radius: 999px; border: 1px solid color-mix(in srgb, var(--a) 30%, transparent); color: #bae6fd; background: color-mix(in srgb, var(--a) 7%, transparent); }
.chip.here { border-color: var(--warn); color: #fde68a; }
.sep { color: color-mix(in srgb, var(--a) 60%, transparent); }
.meta { font-size: 9.5px; color: #64748b; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.divider { height: 1px; margin: 10px 0 12px; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--a) 60%, transparent), transparent); }

.title { margin: 0 0 4px; font-size: 15px; font-weight: 650; color: #f0f9ff; letter-spacing: .01em; }
.message { margin: 0 0 12px; font-size: 13px; color: #a5b4c8; min-height: 1.45em; }
.message.typing::after { content: "▍"; color: var(--a); animation: blink .8s infinite; margin-left: 1px; }

.scan { position: relative; height: 64px; margin: 6px 0 10px; border-radius: 10px; overflow: hidden; border: 1px solid color-mix(in srgb, var(--a) 20%, transparent); background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--a) 7%, transparent) 0 1px, transparent 1px 14px); }
.scan::after { content: ""; position: absolute; top: 0; bottom: 0; width: 35%; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--a) 35%, transparent), transparent); animation: sweep 1.3s ease-in-out infinite; }
@keyframes sweep { from { left: -35%; } to { left: 100%; } }
.scan-text { font-size: 11px; color: var(--a); }

fieldset { border: 0; margin: 0 0 12px; padding: 0; }
fieldset[hidden] { display: none; }
legend, .label { display: block; font-weight: 550; color: #e2e8f0; margin-bottom: 7px; padding: 0; font-size: 13px; }
.opts { display: flex; flex-direction: column; gap: 5px; }
.opt { display: block; cursor: pointer; }
.opt input { position: absolute; opacity: 0; pointer-events: none; }
.opt span {
  position: relative; display: block; padding: 7px 12px 7px 30px; border-radius: 9px; color: #cbd5e1; font-size: 13px;
  border: 1px solid rgba(148,163,184,.22); background: rgba(15,23,42,.55); transition: all .15s ease;
}
.opt span::before {
  content: ""; position: absolute; left: 11px; top: 50%; width: 9px; height: 9px; margin-top: -4.5px; border-radius: 2px;
  border: 1px solid color-mix(in srgb, var(--a) 60%, transparent); transform: rotate(45deg); transition: all .15s ease;
}
.opt:hover span { border-color: color-mix(in srgb, var(--a) 60%, transparent); color: #f1f5f9; }
.opt input:checked + span {
  border-color: var(--a); color: #fff; background: color-mix(in srgb, var(--a) 13%, rgba(15,23,42,.7));
  box-shadow: 0 0 14px color-mix(in srgb, var(--a) 25%, transparent), inset 3px 0 0 var(--a);
}
.opt input:checked + span::before { background: var(--a); box-shadow: 0 0 8px var(--a); }
textarea {
  width: 100%; min-height: 54px; resize: vertical; padding: 9px 11px; font: inherit; color: #f1f5f9;
  background: rgba(2,6,15,.7); border: 1px solid rgba(148,163,184,.25); border-radius: 9px;
}
textarea:focus { border-color: var(--a); box-shadow: 0 0 12px color-mix(in srgb, var(--a) 25%, transparent); outline: none; }
.actions { display: flex; justify-content: flex-end; }
.send {
  border: 1px solid var(--a); border-radius: 9px; padding: 8px 18px; cursor: pointer; font-size: 11.5px; font-weight: 700;
  background: linear-gradient(180deg, color-mix(in srgb, var(--a) 35%, transparent), color-mix(in srgb, var(--a) 12%, transparent));
  color: #ecfeff; box-shadow: 0 0 16px color-mix(in srgb, var(--a) 30%, transparent); transition: all .15s ease;
}
.send:hover:not(:disabled) { box-shadow: 0 0 24px color-mix(in srgb, var(--a) 55%, transparent); }
.send:disabled { opacity: .35; cursor: not-allowed; box-shadow: none; }
.panel::-webkit-scrollbar { display: none; }
.intents { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.intent {
  display: flex; flex-direction: column; gap: 2px; text-align: left; cursor: pointer; font: inherit;
  padding: 10px 12px; border-radius: 10px; color: #e2e8f0;
  border: 1px solid rgba(148,163,184,.22); background: rgba(15,23,42,.55); transition: all .15s ease;
}
.intent:hover, .intent:focus-visible {
  border-color: var(--a); background: color-mix(in srgb, var(--a) 10%, rgba(15,23,42,.7));
  box-shadow: 0 0 14px color-mix(in srgb, var(--a) 22%, transparent), inset 3px 0 0 var(--a); outline: none;
}
.intent-title { font-weight: 600; font-size: 13.5px; }
.intent-sub { font-size: 12px; color: #94a3b8; }
.thanks { margin: 6px 0 2px; color: #a7f3d0; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
  .launcher .ring, .launcher .core, .panel, .scan::after, .status .dot, .message.typing::after { animation: none; }
}
`;
