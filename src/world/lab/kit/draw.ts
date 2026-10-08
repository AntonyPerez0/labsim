/**
 * Canvas drawing helpers for printed things in the lab: label-maker tape, stickers, signs, wrapped
 * text, sticky notes (World §0.1 fonts, §6.2/§6.3). Vector ops only (they are replayed into atlas
 * padding with a transform, so never use putImageData here).
 */
import { seeded } from './procTex';

export const FONT = {
  UI_SANS: 'Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif',
  LABEL: '"Arial Narrow", Arial, "Helvetica Neue", sans-serif',
  MONO: '"DejaVu Sans Mono", Menlo, Consolas, monospace',
  HAND: '"Segoe Print", "Marker Felt", "Comic Sans MS", cursive',
  MARKER: '"Marker Felt", "Segoe Print", "Comic Sans MS", cursive',
} as const;

let measureCtx: CanvasRenderingContext2D | null = null;

export function measure(text: string, font: string): number {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')!;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

/** Physical size (mm) of a label-maker tape with the given cap height (§6.2: width = text + 6 mm, height = cap × 1.9). */
export function tapeSizeMm(text: string, capMm: number): { w: number; h: number } {
  const lines = text.split('\n');
  const pxPerMm = 10;
  const fontPx = capMm * pxPerMm * 1.38; // cap height ≈ 0.72 em
  const widest = Math.max(...lines.map((l) => measure(l, `700 ${fontPx}px ${FONT.LABEL}`)));
  return { w: widest / pxPerMm + 6, h: capMm * 1.9 * lines.length - capMm * 0.5 * (lines.length - 1) };
}

export interface TapeStyle {
  bg?: string;
  fg?: string;
  font?: string;
  weight?: number;
  /** Text alignment inside the tape. */
  align?: CanvasTextAlign;
}

/** Label-maker tape: white tape, slightly darker edges, black bold narrow text, auto-fitted. */
export function drawTape(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, style: TapeStyle = {}): void {
  const bg = style.bg ?? '#f5f5f0';
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0.06)');
  grad.addColorStop(0.15, 'rgba(255,255,255,0.05)');
  grad.addColorStop(0.85, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(0.75, 0.75, w - 1.5, h - 1.5);
  fitText(ctx, text, w, h, { color: style.fg ?? '#111111', font: style.font ?? FONT.LABEL, weight: style.weight ?? 700, marginX: 0.06, marginY: 0.14, align: style.align ?? 'center' });
}

export interface FitOpts {
  color: string;
  font: string;
  weight?: number;
  marginX?: number;
  marginY?: number;
  align?: CanvasTextAlign;
  lineGap?: number;
}

/** Auto-fit multi-line text into a box (largest size that fits). */
export function fitText(ctx: CanvasRenderingContext2D, text: string, w: number, h: number, o: FitOpts): number {
  const lines = text.split('\n');
  const mx = w * (o.marginX ?? 0.06);
  const my = h * (o.marginY ?? 0.12);
  const availW = w - mx * 2;
  const availH = h - my * 2;
  const gap = o.lineGap ?? 1.12;
  let size = Math.floor(availH / (lines.length * gap) / 0.74);
  const weight = o.weight ?? 400;
  for (; size > 5; size--) {
    ctx.font = `${weight} ${size}px ${o.font}`;
    let widest = 0;
    for (const l of lines) widest = Math.max(widest, ctx.measureText(l).width);
    if (widest <= availW && lines.length * size * gap * 0.82 <= availH + size * 0.2) break;
  }
  ctx.font = `${weight} ${size}px ${o.font}`;
  ctx.fillStyle = o.color;
  ctx.textBaseline = 'middle';
  ctx.textAlign = o.align ?? 'center';
  const lh = size * gap * 0.86;
  const total = lines.length * lh;
  const top = (h - total) / 2 + lh / 2;
  const x = ctx.textAlign === 'left' ? mx : ctx.textAlign === 'right' ? w - mx : w / 2;
  lines.forEach((l, i) => ctx.fillText(l, x, top + i * lh + size * 0.03));
  return size;
}

/** Word-wrap text at `maxW`, returns the y after the last line. */
export function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number): number {
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) {
        ctx.fillText(line, x, y);
        y += lineH;
        line = word;
      } else line = t;
    }
    ctx.fillText(line, x, y);
    y += lineH;
  }
  return y;
}

/** Yellow sticky note (76 mm) with handwriting and curl shading (§6.2 `stickyNote`). */
export function drawSticky(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, seed = 1, color = '#ffe866'): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,0.10)');
  g.addColorStop(0.18, 'rgba(0,0,0,0)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.06)');
  g.addColorStop(1, 'rgba(0,0,0,0.12)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = seeded(seed);
  ctx.fillStyle = '#1b1f2a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const size = Math.round(h * 0.13);
  ctx.font = `${size}px ${FONT.HAND}`;
  const words = text.split(' ');
  let line = '';
  let y = h * 0.28;
  const lines: string[] = [];
  for (const wd of words) {
    const t = line ? `${line} ${wd}` : wd;
    if (ctx.measureText(t).width > w * 0.84 && line) {
      lines.push(line);
      line = wd;
    } else line = t;
  }
  lines.push(line);
  for (const l of lines) {
    ctx.save();
    ctx.translate(w * 0.08 + (r() - 0.5) * 4, y + (r() - 0.5) * 3);
    ctx.rotate((r() - 0.5) * 0.05);
    ctx.fillText(l, 0, 0);
    ctx.restore();
    y += size * 1.22;
  }
}

/** Generic sticker / plate: background, optional border, centred multi-line text. */
export function drawPlate(ctx: CanvasRenderingContext2D, w: number, h: number, text: string, o: { bg: string; fg: string; border?: string; font?: string; weight?: number; radius?: number }): void {
  ctx.fillStyle = o.bg;
  roundRect(ctx, 0, 0, w, h, o.radius ?? 0);
  ctx.fill();
  if (o.border) {
    ctx.strokeStyle = o.border;
    ctx.lineWidth = Math.max(2, h * 0.04);
    roundRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth, o.radius ?? 0);
    ctx.stroke();
  }
  fitText(ctx, text, w, h, { color: o.fg, font: o.font ?? FONT.UI_SANS, weight: o.weight ?? 700, marginX: 0.08, marginY: 0.16 });
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** LabSim four-leaf glyph (4 circles in a 2 × 2 with a small stem notch). */
export function drawLabMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string): void {
  const r = size * 0.24;
  const o = size * 0.25;
  ctx.fillStyle = color;
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    ctx.beginPath();
    ctx.arc(cx + dx * o, cy + dy * o, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** LabSim wordmark: leaf + lowercase `lab`. */
export function drawLabWordmark(ctx: CanvasRenderingContext2D, x: number, cy: number, h: number, color: string): void {
  drawLabMark(ctx, x + h * 0.5, cy, h, color);
  ctx.fillStyle = color;
  ctx.font = `600 ${h * 1.05}px ${FONT.UI_SANS}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('labsim', x + h * 1.15, cy + h * 0.02);
}

/** Yellow/black hazard sign with ⚡ glyph (§6.2 `warningSign`). */
export function drawWarningSign(ctx: CanvasRenderingContext2D, w: number, h: number, text: string): void {
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, w, h);
  const b = h * 0.07;
  // diagonal hazard stripes border
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.rect(b, b, w - 2 * b, h - 2 * b);
  ctx.clip('evenodd');
  ctx.fillStyle = '#ffd400';
  for (let x = -h; x < w + h; x += b * 2) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + b, 0);
    ctx.lineTo(x + b - h, h);
    ctx.lineTo(x - h, h);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  ctx.fillStyle = '#ffd400';
  ctx.fillRect(b, b, w - 2 * b, h - 2 * b);
  // ⚡ triangle
  const tx = b * 1.6;
  const ts = h - b * 3.2;
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.moveTo(tx + ts * 0.5, b * 1.6);
  ctx.lineTo(tx + ts, b * 1.6 + ts * 0.9);
  ctx.lineTo(tx, b * 1.6 + ts * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffd400';
  ctx.beginPath();
  ctx.moveTo(tx + ts * 0.5, b * 1.6 + ts * 0.18);
  ctx.lineTo(tx + ts * 0.86, b * 1.6 + ts * 0.82);
  ctx.lineTo(tx + ts * 0.14, b * 1.6 + ts * 0.82);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  const bx = tx + ts * 0.5;
  const by = b * 1.6 + ts * 0.3;
  ctx.moveTo(bx + ts * 0.06, by);
  ctx.lineTo(bx - ts * 0.1, by + ts * 0.24);
  ctx.lineTo(bx + 0.01 * ts, by + ts * 0.24);
  ctx.lineTo(bx - ts * 0.07, by + ts * 0.44);
  ctx.lineTo(bx + ts * 0.12, by + ts * 0.18);
  ctx.lineTo(bx + 0.0 * ts, by + ts * 0.18);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.translate(tx + ts + b * 0.6, 0);
  fitText(ctx, text, w - tx - ts - b * 2.2, h, { color: '#111111', font: FONT.UI_SANS, weight: 800, marginX: 0.02, marginY: 0.16, align: 'left' });
  ctx.restore();
}
