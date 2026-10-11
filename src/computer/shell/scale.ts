/**
 * Small-screen desktop scaling. The workstation desktop and its apps are designed for ≥ 1280 px;
 * on phones and small tablets the desktop is laid out at a larger LOGICAL size and scaled down with
 * a CSS transform (like a real high-DPI display at 150–200 %), so every app keeps its desktop
 * layout and the windows open maximised. Pointer maths in the shell converts screen-px deltas to
 * desktop px with `desktopScale()`.
 */

/** Smallest logical desktop the apps stay usable at (landscape / portrait). */
export const MIN_LANDSCAPE = { w: 960, h: 540 } as const;
export const MIN_PORTRAIT = { w: 720, h: 900 } as const;

let current = 1;

/** Current screen-px per desktop-px (1 = unscaled). */
export function desktopScale(): number {
  return current;
}

export function setDesktopScale(s: number): void {
  current = s > 0 && Number.isFinite(s) ? s : 1;
}

/** Scale for a container of `w × h` CSS px (pure). Never enlarges. */
export function fitScale(w: number, h: number): number {
  if (!(w > 0 && h > 0)) return 1;
  const min = w >= h ? MIN_LANDSCAPE : MIN_PORTRAIT;
  const s = Math.min(1, w / min.w, h / min.h);
  return Math.round(Math.max(0.4, s) * 1000) / 1000;
}
