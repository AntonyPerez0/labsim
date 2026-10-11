/**
 * Where a coach bubble goes (pure): next to its anchor on the preferred side when it fits, otherwise
 * the next side that fits, otherwise inside the anchor's top edge — always clamped to the viewport so
 * it stays on screen on narrow phones.
 */
import type { CoachPlace } from './tips';

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type PlacedSide = 'below' | 'above' | 'left' | 'right' | 'inside' | 'float';

export interface Placement {
  x: number;
  y: number;
  side: PlacedSide;
  /** Arrow offset along the bubble edge facing the anchor (px), or null for no arrow. */
  arrow: number | null;
}

const GAP = 12;

export function placeBubble(anchor: Rect | null, bubble: { w: number; h: number }, vp: { w: number; h: number }, pref: CoachPlace = 'auto', margin = 8): Placement {
  const maxX = Math.max(margin, vp.w - bubble.w - margin);
  const maxY = Math.max(margin, vp.h - bubble.h - margin);
  const clampX = (x: number) => Math.min(maxX, Math.max(margin, x));
  const clampY = (y: number) => Math.min(maxY, Math.max(margin, y));
  if (!anchor) return { x: clampX((vp.w - bubble.w) / 2), y: clampY(Math.min(84, vp.h * 0.12)), side: 'float', arrow: null };

  const right = anchor.left + anchor.width;
  const bottom = anchor.top + anchor.height;
  const cx = anchor.left + anchor.width / 2;
  const cy = anchor.top + anchor.height / 2;
  const fits: Record<Exclude<PlacedSide, 'float' | 'inside'>, boolean> = {
    below: bottom + GAP + bubble.h <= vp.h - margin,
    above: anchor.top - GAP - bubble.h >= margin,
    right: right + GAP + bubble.w <= vp.w - margin,
    left: anchor.left - GAP - bubble.w >= margin,
  };
  const order: PlacedSide[] = pref === 'inside' ? ['inside'] : [...(pref !== 'auto' ? [pref] : []), 'below', 'above', 'right', 'left', 'inside'];
  const side = order.find((s) => s === 'inside' || fits[s as keyof typeof fits]) ?? 'inside';
  const arrowAlong = (pos: number, start: number, len: number) => Math.min(len - 18, Math.max(18, pos - start));

  switch (side) {
    case 'below': {
      const x = clampX(cx - bubble.w / 2);
      return { x, y: bottom + GAP, side, arrow: arrowAlong(cx, x, bubble.w) };
    }
    case 'above': {
      const x = clampX(cx - bubble.w / 2);
      return { x, y: anchor.top - GAP - bubble.h, side, arrow: arrowAlong(cx, x, bubble.w) };
    }
    case 'right': {
      const y = clampY(cy - bubble.h / 2);
      return { x: right + GAP, y, side, arrow: arrowAlong(cy, y, bubble.h) };
    }
    case 'left': {
      const y = clampY(cy - bubble.h / 2);
      return { x: anchor.left - GAP - bubble.w, y, side, arrow: arrowAlong(cy, y, bubble.h) };
    }
    default: {
      // Inside the top of the anchor (e.g. an app window: just under its title bar), centred.
      const x = clampX(cx - bubble.w / 2);
      const y = clampY(Math.max(anchor.top, 0) + Math.min(56, anchor.height * 0.15));
      return { x, y, side: 'inside', arrow: null };
    }
  }
}

/** True when the rect is a visible box that overlaps the viewport. */
export function rectOnScreen(r: Rect, vp: { w: number; h: number }): boolean {
  return r.width > 2 && r.height > 2 && r.left < vp.w && r.top < vp.h && r.left + r.width > 0 && r.top + r.height > 0;
}
