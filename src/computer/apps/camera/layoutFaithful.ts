/**
 * Layout-faithful device displays for webcam frames and screencaps (Apps §6.5, §8.5).
 *
 * The lessons measure text in these images (Cur M16 s6: R2-D2 CFD `TOTAL $10.83` at 412, 288, 236 × 44 in the
 * webcam frame; GP INC24: FLEX_3 `Payment Successful` at 208, 512, 304 × 40 in a screencap). The sim's frame model
 * (`sim.ocr.frame`, Sim §3.12.1) places every *label* from the firmware layout tables, while `render2d` draws its
 * own illustrated screens whose text does not sit on those rectangles. Buttons agree (render2d takes them from the
 * same layouts), labels do not — so for a display that shows layout labels we composite:
 *   background colour + header band + every button rect copied from render2d, then each label drawn exactly on its
 *   layout rectangle. Displays without labels are left exactly as render2d drew them.
 */
import type { TerminalDevice, LabState } from '@/sim/types';
import { liveElements } from '@/sim/core/devices';

type Disp = 'primary' | 'secondary';

export interface LayoutEl {
  kind: string;
  text: string;
  /** Top-left in display px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Layout elements of a display in display px (pxX/pxY = px per mm), labels shifted by `labelShiftPx` (CFD). */
export function displayElements(lab: LabState, dev: TerminalDevice, display: Disp, pxX: number, pxY: number, labelShiftPx = 0): LayoutEl[] {
  let els: ReturnType<typeof liveElements>;
  try {
    els = liveElements(lab, dev, display);
  } catch {
    return [];
  }
  const out: LayoutEl[] = [];
  for (const e of els) {
    if ((e.kind !== 'label' && e.kind !== 'button') || !e.text) continue;
    out.push({
      kind: e.kind,
      text: e.text,
      x: (e.x - e.w / 2) * pxX,
      y: (e.y - e.h / 2) * pxY + (e.kind === 'label' ? labelShiftPx : 0),
      w: e.w * pxX,
      h: e.h * pxY,
    });
  }
  return out;
}

type RGB = [number, number, number];

function dominantColour(data: Uint8ClampedArray, w: number, h: number): RGB {
  const counts = new Map<number, number>();
  const stepX = Math.max(1, Math.floor(w / 40));
  const stepY = Math.max(1, Math.floor(h / 40));
  for (let y = Math.floor(stepY / 2); y < h; y += stepY) {
    for (let x = Math.floor(stepX / 2); x < w; x += stepX) {
      const i = (y * w + x) * 4;
      const key = ((data[i]! >> 3) << 10) | ((data[i + 1]! >> 3) << 5) | (data[i + 2]! >> 3);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best = 0;
  let bestN = -1;
  for (const [k, n] of counts) if (n > bestN) ((best = k), (bestN = n));
  return [((best >> 10) & 31) * 8 + 4, ((best >> 5) & 31) * 8 + 4, (best & 31) * 8 + 4];
}

function near(data: Uint8ClampedArray, i: number, c: RGB, tol = 18): boolean {
  return Math.abs(data[i]! - c[0]) <= tol && Math.abs(data[i + 1]! - c[1]) <= tol && Math.abs(data[i + 2]! - c[2]) <= tol;
}

/** Height of a header band at the top that differs from the background (0 when none or implausibly tall). */
function headerBand(data: Uint8ClampedArray, w: number, h: number, bg: RGB): number {
  const cx = Math.min(w - 1, Math.floor(w * 0.1));
  let firstNonBg = -1;
  for (let y = 0; y < Math.floor(h * 0.25); y++) {
    const off = !near(data, (y * w + cx) * 4, bg);
    if (firstNonBg < 0 && off) firstNonBg = y;
    if (firstNonBg >= 0 && !off) return y;
  }
  return 0;
}

function fitFont(ctx: CanvasRenderingContext2D, text: string, maxW: number, size: number, weight: string): number {
  let s = size;
  for (let i = 0; i < 12; i++) {
    ctx.font = `${weight} ${s}px "Roboto", "Segoe UI", system-ui, sans-serif`;
    if (ctx.measureText(text).width <= maxW || s <= 6) break;
    s = Math.max(6, Math.floor(s * 0.88));
  }
  return s;
}

/** Draw one label exactly inside its rectangle (`name … $amount` rows are justified like the CFD totals). */
function drawLabel(ctx: CanvasRenderingContext2D, el: LayoutEl, ink: string): void {
  const bold = /^(TOTAL|Total|Payment|Approved|Thank)\b/.test(el.text);
  const weight = bold ? '700' : '400';
  const size = Math.max(6, Math.round(el.h * 0.62));
  ctx.fillStyle = ink;
  ctx.textBaseline = 'middle';
  const cy = el.y + el.h / 2;
  const m = /^(.*\S)\s+(\$[\d,]+\.\d\d)$/.exec(el.text);
  if (m) {
    const s = fitFont(ctx, el.text, el.w * 0.98, size, weight);
    ctx.font = `${weight} ${s}px "Roboto", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'left';
    ctx.fillText(m[1]!, el.x, cy);
    ctx.textAlign = 'right';
    ctx.fillText(m[2]!, el.x + el.w, cy);
  } else {
    const s = fitFont(ctx, el.text, el.w, size, weight);
    ctx.font = `${weight} ${s}px "Roboto", "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(el.text, el.x + el.w / 2, cy);
  }
  ctx.textAlign = 'left';
}


let sampler: { c: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null = null;
function samplerCtx(w: number, h: number): CanvasRenderingContext2D | null {
  if (!sampler) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    sampler = { c, ctx };
  }
  if (sampler.c.width !== w) sampler.c.width = w;
  if (sampler.c.height !== h) sampler.c.height = h;
  sampler.ctx.clearRect(0, 0, w, h);
  return sampler.ctx;
}

/** Background colour (from a 128-px-wide downsample) and header band height (from a full-height column). */
function sample(src: HTMLCanvasElement): { bg: RGB; band: number } | null {
  const w = src.width;
  const h = src.height;
  try {
    const sw = Math.min(128, w);
    const sh = Math.max(1, Math.round((h * sw) / w));
    let ctx = samplerCtx(sw, sh);
    if (!ctx) return null;
    ctx.drawImage(src, 0, 0, sw, sh);
    const bg = dominantColour(ctx.getImageData(0, 0, sw, sh).data, sw, sh);
    ctx = samplerCtx(1, h);
    if (!ctx) return null;
    ctx.drawImage(src, Math.floor(w * 0.1), 0, 1, h, 0, 0, 1, h);
    const band = headerBand(ctx.getImageData(0, 0, 1, h).data, 1, h, bg);
    return { bg, band };
  } catch {
    return null;
  }
}

/**
 * Composite a render2d display canvas into a layout-faithful one. Returns `src` unchanged when the display shows
 * no layout labels (or the canvas cannot be read).
 */
export function layoutFaithful(src: HTMLCanvasElement, els: LayoutEl[]): HTMLCanvasElement {
  const labels = els.filter((e) => e.kind === 'label');
  if (!labels.length) return src;
  const w = src.width;
  const h = src.height;
  const sampled = sample(src);
  if (!sampled) return src;
  const { bg, band } = sampled;
  const out = document.createElement('canvas');
  out.width = w;
  out.height = h;
  const ctx = out.getContext('2d');
  if (!ctx) return src;
  ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
  ctx.fillRect(0, 0, w, h);
  if (band > 0) ctx.drawImage(src, 0, 0, w, band, 0, 0, w, band);
  for (const b of els) {
    if (b.kind !== 'button') continue;
    const x = Math.max(0, Math.floor(b.x - 2));
    const y = Math.max(0, Math.floor(b.y - 2));
    const bw = Math.min(w - x, Math.ceil(b.w + 4));
    const bh = Math.min(h - y, Math.ceil(b.h + 4));
    if (bw > 0 && bh > 0) ctx.drawImage(src, x, y, bw, bh, x, y, bw, bh);
  }
  const lum = (0.299 * bg[0] + 0.587 * bg[1] + 0.114 * bg[2]) / 255;
  const ink = lum > 0.55 ? '#1d1d1f' : '#ffffff';
  for (const l of labels) drawLabel(ctx, l, ink);
  return out;
}
