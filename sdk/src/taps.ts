import { asElement, findDisabled, isInsidePulse } from './dom';

export interface Tap {
  target: Element;
  x: number;
  y: number;
  at: number;
  /** Disabled controls swallow `click`, so they are observed through `pointerdown` instead. */
  disabled: boolean;
}

type TapListener = (tap: Tap) => void;

/**
 * One stream of user clicks shared by all detectors. Regular clicks come from `click`;
 * clicks on disabled controls come from `pointerdown`, because browsers never dispatch
 * `click` for them. A single physical click is therefore never counted twice.
 */
export function onTap(cb: TapListener): () => void {
  const handle = (e: MouseEvent, fromPointer: boolean) => {
    const target = asElement(e.target);
    if (!target || isInsidePulse(target)) return;
    const disabled = !!findDisabled(target);
    if (fromPointer !== disabled) return;
    cb({ target, x: e.clientX, y: e.clientY, at: Date.now(), disabled });
  };
  const onClick = (e: MouseEvent) => handle(e, false);
  const onPointer = (e: MouseEvent) => handle(e, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('pointerdown', onPointer, true);
  return () => {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('pointerdown', onPointer, true);
  };
}
