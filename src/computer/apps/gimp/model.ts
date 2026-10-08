/**
 * GIMP-lite model (Apps §6): selection math, units, zoom steps, device px/mm for screencaps, open-image store
 * (session-local, survives route changes), recent files.
 */
import type { ImageEntry } from '@/computer/apps';
import type { LabState } from '@/sim/types';
import { screenOf } from '@/sim/seed/deviceTypes';

export interface Sel {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Tool = 'rect' | 'ellipse' | 'free' | 'fuzzy' | 'move' | 'align' | 'crop' | 'transform' | 'text' | 'bucket' | 'gradient' | 'paint' | 'eraser' | 'clone' | 'smudge' | 'dodge' | 'paths' | 'picker' | 'zoom' | 'measure';
export type Unit = 'px' | 'mm' | 'in';

export const FUNCTIONAL: ReadonlySet<Tool> = new Set<Tool>(['rect', 'move', 'zoom', 'measure', 'picker']);

export const TOOL_INFO: Record<Tool, { label: string; key?: string; hint: string }> = {
  rect: { label: 'Rectangle Select', key: 'R', hint: 'Rectangle Select: Click-Drag to create a new selection' },
  ellipse: { label: 'Ellipse Select', key: 'E', hint: '' },
  free: { label: 'Free Select', key: 'F', hint: '' },
  fuzzy: { label: 'Fuzzy Select', key: 'U', hint: '' },
  move: { label: 'Move', key: 'M', hint: 'Move: Click-Drag to pan the view' },
  align: { label: 'Alignment', key: 'Q', hint: '' },
  crop: { label: 'Crop', key: 'Shift+C', hint: '' },
  transform: { label: 'Unified Transform', key: 'Shift+T', hint: '' },
  text: { label: 'Text', key: 'T', hint: '' },
  bucket: { label: 'Bucket Fill', key: 'Shift+B', hint: '' },
  gradient: { label: 'Gradient', key: 'G', hint: '' },
  paint: { label: 'Paintbrush', key: 'P', hint: '' },
  eraser: { label: 'Eraser', key: 'Shift+E', hint: '' },
  clone: { label: 'Clone', key: 'C', hint: '' },
  smudge: { label: 'Smudge', key: 'S', hint: '' },
  dodge: { label: 'Dodge / Burn', key: 'Shift+D', hint: '' },
  paths: { label: 'Paths', key: 'B', hint: '' },
  picker: { label: 'Color Picker', key: 'O', hint: 'Color Picker: Click in any image to view its color' },
  zoom: { label: 'Zoom', key: 'Z', hint: 'Zoom: Click or Click-Drag to zoom in (Ctrl to zoom out)' },
  measure: { label: 'Measure', key: 'Shift+M', hint: 'Measure: Click-Drag to create a line' },
};

export const ZOOM_STEPS = [0.0625, 0.125, 0.182, 0.25, 0.333, 0.5, 0.667, 1, 1.5, 2, 3, 4, 5.5, 8, 11, 16, 23, 32];

export function zoomIn(z: number): number {
  return ZOOM_STEPS.find((s) => s > z + 1e-6) ?? z;
}

export function zoomOut(z: number): number {
  return [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-6) ?? z;
}

export function clampSel(s: Sel, W: number, H: number): Sel {
  let x = Math.round(s.x);
  let y = Math.round(s.y);
  let w = Math.round(s.w);
  let h = Math.round(s.h);
  if (w < 0) {
    x += w;
    w = -w;
  }
  if (h < 0) {
    y += h;
    h = -h;
  }
  const x2 = Math.min(W, x + w);
  const y2 = Math.min(H, y + h);
  x = Math.max(0, Math.min(W, x));
  y = Math.max(0, Math.min(H, y));
  return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
}

/** Move a selection keeping its size, clamped inside the image. */
export function moveSel(s: Sel, dx: number, dy: number, W: number, H: number): Sel {
  return { x: Math.max(0, Math.min(W - s.w, Math.round(s.x + dx))), y: Math.max(0, Math.min(H - s.h, Math.round(s.y + dy))), w: s.w, h: s.h };
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Handle under an image-px point (handle size in image px), or 'inside' / null. */
export function hitHandle(s: Sel, px: number, py: number, size: number): Handle | 'inside' | null {
  if (px < s.x - size * 0.3 || px > s.x + s.w + size * 0.3 || py < s.y - size * 0.3 || py > s.y + s.h + size * 0.3) return null;
  const hs = Math.min(size, s.w / 3, s.h / 3);
  const left = px < s.x + hs;
  const right = px > s.x + s.w - hs;
  const top = py < s.y + hs;
  const bottom = py > s.y + s.h - hs;
  if (top && left) return 'nw';
  if (top && right) return 'ne';
  if (bottom && left) return 'sw';
  if (bottom && right) return 'se';
  if (top) return 'n';
  if (bottom) return 's';
  if (left) return 'w';
  if (right) return 'e';
  return 'inside';
}

export function resizeSel(s: Sel, h: Handle, dx: number, dy: number, W: number, H: number): Sel {
  let x1 = s.x;
  let y1 = s.y;
  let x2 = s.x + s.w;
  let y2 = s.y + s.h;
  if (h.includes('w')) x1 += dx;
  if (h.includes('e')) x2 += dx;
  if (h.includes('n')) y1 += dy;
  if (h.includes('s')) y2 += dy;
  return clampSel({ x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) }, W, H);
}

/** GIMP's own unit conversion uses the image print resolution (72 ppi). */
export function toUnit(px: number, unit: Unit): string {
  if (unit === 'px') return String(Math.round(px));
  if (unit === 'in') return (px / 72).toFixed(3);
  return ((px / 72) * 25.4).toFixed(1);
}

/** Device px/mm for an ADB screencap ref (`img:screencap:<deviceId>:<ms>`), else null. */
export function screencapDevice(lab: LabState, ref: string): { type: string; pxPerMm: number } | null {
  const m = /^img:screencap:(.+):[^:]+$/.exec(ref);
  if (!m) return null;
  const dev = lab.devices[m[1]!];
  if (!dev) return null;
  try {
    const s = screenOf(dev.type, 'primary');
    return { type: dev.type, pxPerMm: s.px.x };
  } catch {
    return null;
  }
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export function stem(path: string): string {
  const b = baseName(path);
  return b.includes('.') ? b.slice(0, b.lastIndexOf('.')) : b;
}

/** `2.6 MB` (GIMP's memory size of an 8-bit RGB layer). */
export function memSize(w: number, h: number): string {
  const mb = (w * h * 3) / 1048576;
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.round((w * h * 3) / 1024)} kB`;
}

/* ── open images (per window, session-local) ── */

export interface OpenImage {
  path: string;
  ref: string | null;
  entry: ImageEntry | null;
  error: string | null;
  sel: Sel | null;
  undo: (Sel | null)[];
  redo: (Sel | null)[];
  zoom: number | null;
  scroll: { x: number; y: number } | null;
}

const stores = new Map<string, OpenImage[]>();

export function imagesOf(windowId: string): OpenImage[] {
  let l = stores.get(windowId);
  if (!l) {
    l = [];
    stores.set(windowId, l);
  }
  return l;
}

const recent: string[] = [];

export function addRecent(path: string): void {
  const i = recent.indexOf(path);
  if (i >= 0) recent.splice(i, 1);
  recent.unshift(path);
  recent.length = Math.min(recent.length, 5);
}

export function recentFiles(): string[] {
  return [...recent];
}
