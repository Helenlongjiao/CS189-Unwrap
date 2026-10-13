export const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  position: fixed; bottom: 20px; z-index: 2147483000;
  font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #1f2328; display: flex; flex-direction: column; gap: 12px;
}
.wrap.right { right: 20px; align-items: flex-end; }
.wrap.left { left: 20px; align-items: flex-start; }
.launcher {
  width: 48px; height: 48px; border-radius: 50%; border: 0; cursor: pointer;
  background: var(--pulse-accent, #4f46e5); color: #fff;
  box-shadow: 0 4px 14px rgba(0,0,0,.2); display: grid; place-items: center;
  transition: transform .15s ease;
}
.launcher:hover { transform: scale(1.06); }
.launcher:focus-visible, button:focus-visible, textarea:focus-visible, .opt input:focus-visible + span {
  outline: 3px solid var(--pulse-accent, #4f46e5); outline-offset: 2px;
}
.launcher.nudge { animation: nudge 1.2s ease 2; }
@keyframes nudge { 0%,100% { transform: scale(1); } 50% { transform: scale(1.15); } }
.panel {
  width: min(340px, calc(100vw - 40px)); max-height: min(520px, calc(100vh - 100px)); overflow: auto;
  background: #fff; border-radius: 14px; box-shadow: 0 12px 40px rgba(0,0,0,.22);
  padding: 16px; animation: pop .18s ease-out;
}
@keyframes pop { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
.head { display: flex; align-items: flex-start; gap: 8px; margin-bottom: 12px; }
.title { flex: 1; margin: 0; font-size: 15px; font-weight: 600; }
.close {
  border: 0; background: none; cursor: pointer; font-size: 20px; line-height: 1;
  color: #656d76; padding: 2px 6px; border-radius: 6px;
}
.close:hover { background: #f3f4f6; }
fieldset { border: 0; margin: 0 0 14px; padding: 0; }
fieldset[hidden] { display: none; }
legend, .label { display: block; font-weight: 500; margin-bottom: 8px; padding: 0; }
.opts { display: flex; flex-direction: column; gap: 6px; }
.opt { display: block; cursor: pointer; }
.opt input { position: absolute; opacity: 0; pointer-events: none; }
.opt span {
  display: block; padding: 8px 12px; border: 1px solid #d0d7de; border-radius: 8px;
  transition: border-color .1s, background .1s;
}
.opt:hover span { border-color: var(--pulse-accent, #4f46e5); }
.opt input:checked + span {
  border-color: var(--pulse-accent, #4f46e5); background: color-mix(in srgb, var(--pulse-accent, #4f46e5) 10%, #fff);
  font-weight: 500;
}
textarea {
  width: 100%; min-height: 72px; resize: vertical; padding: 8px 10px; font: inherit; color: inherit;
  border: 1px solid #d0d7de; border-radius: 8px;
}
.actions { display: flex; justify-content: flex-end; }
.send {
  border: 0; border-radius: 8px; padding: 8px 16px; cursor: pointer; font: inherit; font-weight: 600;
  background: var(--pulse-accent, #4f46e5); color: #fff;
}
.send:disabled { opacity: .45; cursor: not-allowed; }
.thanks { margin: 4px 0; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (prefers-reduced-motion: reduce) {
  .launcher, .panel, .launcher.nudge { animation: none; transition: none; }
}
`;
