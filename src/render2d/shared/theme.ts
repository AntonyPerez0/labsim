/**
 * Shared drawing helpers for render2d (World §4.1): a millimetre drawing context, font helpers,
 * money/clock formatting. Pure Canvas2D — no three.js, no React.
 */
import { FONTS, SCREEN_PALETTE } from '../api';
import type { LabState } from '@/sim/types';

export const C = SCREEN_PALETTE;

export type Align = 'left' | 'center' | 'right';

export interface TextOpts {
  weight?: number | 'bold' | 'normal';
  color?: string;
  align?: Align;
  family?: string;
  /** Maximum width in mm (text is shrunk horizontally to fit). */
  maxW?: number;
  italic?: boolean;
  alpha?: number;
  baseline?: CanvasTextBaseline;
}

/**
 * Drawing context in screen millimetres. `k` = output px per mm. `sx`/`sy` scale positions (derived
 * layout classes P-s / L14 are scaled copies of P / L8, World §4.2); `fs` scales font sizes, radii
 * and line widths uniformly so glyphs and circles are never distorted.
 */
export class MmCtx {
  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly k: number,
    readonly sx = 1,
    readonly sy = 1,
    readonly fs = 1,
  ) {}

  /** Same canvas, identity position scale (target-class mm), same font scale. */
  identity(): MmCtx {
    return new MmCtx(this.ctx, this.k, 1, 1, this.fs);
  }

  X(mm: number): number {
    return mm * this.k * this.sx;
  }
  Y(mm: number): number {
    return mm * this.k * this.sy;
  }
  /** Uniform size (fonts, radii, line widths). */
  S(mm: number): number {
    return mm * this.k * this.fs;
  }

  fillRect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(this.X(x), this.Y(y), this.X(w), this.Y(h));
  }

  /** Rounded rect path in mm (radius uniform). */
  rrPath(x: number, y: number, w: number, h: number, r: number): void {
    roundRectPath(this.ctx, this.X(x), this.Y(y), this.X(w), this.Y(h), this.S(r));
  }

  rrect(x: number, y: number, w: number, h: number, r: number, fill: string | CanvasGradient | null, stroke?: string | null, lineMm = 0.3): void {
    const c = this.ctx;
    this.rrPath(x, y, w, h, r);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = Math.max(1, this.S(lineMm));
      c.stroke();
    }
  }

  circle(cx: number, cy: number, r: number, fill: string | null, stroke?: string | null, lineMm = 0.3): void {
    const c = this.ctx;
    c.beginPath();
    c.arc(this.X(cx), this.Y(cy), Math.max(0.5, this.S(r)), 0, Math.PI * 2);
    if (fill) {
      c.fillStyle = fill;
      c.fill();
    }
    if (stroke) {
      c.strokeStyle = stroke;
      c.lineWidth = Math.max(1, this.S(lineMm));
      c.stroke();
    }
  }

  line(x1: number, y1: number, x2: number, y2: number, color: string, lineMm = 0.3): void {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(this.X(x1), this.Y(y1));
    c.lineTo(this.X(x2), this.Y(y2));
    c.strokeStyle = color;
    c.lineWidth = Math.max(1, this.S(lineMm));
    c.stroke();
  }

  font(sizeMm: number, weight: TextOpts['weight'] = 400, family: string = FONTS.UI_SANS, italic = false): string {
    const px = Math.max(1, this.S(sizeMm));
    return `${italic ? 'italic ' : ''}${weight} ${px.toFixed(2)}px ${family}`;
  }

  /** Text with its baseline at y (mm). Returns the drawn width in mm (position space). */
  text(str: string, x: number, y: number, sizeMm: number, o: TextOpts = {}): number {
    const c = this.ctx;
    c.font = this.font(sizeMm, o.weight ?? 400, o.family ?? FONTS.UI_SANS, o.italic);
    c.fillStyle = o.color ?? C.ink;
    c.textAlign = o.align ?? 'left';
    c.textBaseline = o.baseline ?? 'alphabetic';
    const prevAlpha = c.globalAlpha;
    if (o.alpha !== undefined) c.globalAlpha = prevAlpha * o.alpha;
    let w = c.measureText(str).width;
    const maxPx = o.maxW !== undefined ? this.X(o.maxW) : undefined;
    if (maxPx !== undefined && w > maxPx && w > 0) {
      c.fillText(str, this.X(x), this.Y(y), maxPx);
      w = maxPx;
    } else {
      c.fillText(str, this.X(x), this.Y(y));
    }
    c.globalAlpha = prevAlpha;
    return w / (this.k * this.sx);
  }

  measure(str: string, sizeMm: number, weight: TextOpts['weight'] = 400, family: string = FONTS.UI_SANS): number {
    this.ctx.font = this.font(sizeMm, weight, family);
    return this.ctx.measureText(str).width / (this.k * this.sx);
  }

  /** Vertical gradient fill over a rect. */
  vgrad(x: number, y: number, w: number, h: number, stops: readonly (readonly [number, string])[]): void {
    const c = this.ctx;
    const g = c.createLinearGradient(0, this.Y(y), 0, this.Y(y + h));
    for (const [t, col] of stops) g.addColorStop(t, col);
    c.fillStyle = g;
    c.fillRect(this.X(x), this.Y(y), this.X(w), this.Y(h));
  }

  save(): void {
    this.ctx.save();
  }
  restore(): void {
    this.ctx.restore();
  }

  clip(x: number, y: number, w: number, h: number): void {
    const c = this.ctx;
    c.beginPath();
    c.rect(this.X(x), this.Y(y), this.X(w), this.Y(h));
    c.clip();
  }
}

export function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + rr, y);
  c.lineTo(x + w - rr, y);
  c.arcTo(x + w, y, x + w, y + rr, rr);
  c.lineTo(x + w, y + h - rr);
  c.arcTo(x + w, y + h, x + w - rr, y + h, rr);
  c.lineTo(x + rr, y + h);
  c.arcTo(x, y + h, x, y + h - rr, rr);
  c.lineTo(x, y + rr);
  c.arcTo(x, y, x + rr, y, rr);
  c.closePath();
}

/** `$10.83` / `CA$11.94`. */
export function money(cents: number, prefix = '$'): string {
  const neg = cents < 0;
  const v = Math.abs(Math.round(cents));
  return `${neg ? '−' : ''}${prefix}${Math.floor(v / 100)}.${String(v % 100).padStart(2, '0')}`;
}

/** Minutes since midnight of the in-game wall clock (handles both sim clock conventions). */
export function gameMinuteOfDay(lab: LabState | null | undefined): number {
  const t = lab?.time as (LabState['time'] & { epochDate?: string }) | undefined;
  if (!t) return 15 * 60 + 45;
  const now = Number.isFinite(t.nowMs) ? t.nowMs : 0;
  // 40-simulation §0.3: nowMs counts from game-midnight (has `epochDate`). The contract stub
  // starts the clock at `startHour` instead.
  const base = t.epochDate ? 0 : (t.startHour ?? 9) * 60;
  const m = Math.floor(base + now / 60000);
  return ((m % 1440) + 1440) % 1440;
}

/** `{ hm: '3:45', ampm: 'PM', hhmm24: '15:45' }` from the game clock. */
export function clockLabel(lab: LabState | null | undefined): { hm: string; ampm: 'AM' | 'PM'; hhmm24: string } {
  const m = gameMinuteOfDay(lab);
  const h24 = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hm: `${h12}:${mm}`, ampm: h24 < 12 ? 'AM' : 'PM', hhmm24: `${String(h24).padStart(2, '0')}:${mm}` };
}

export function dateLabel(lab: LabState | null | undefined): string {
  return lab?.time?.dateLabel ?? 'WED, NOV 5';
}

/** Shade a #rrggbb colour: amount > 0 lightens towards white, < 0 darkens towards black. */
export function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1]!, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const t = amount >= 0 ? v + (255 - v) * amount : v * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(t)));
  });
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Small deterministic hash for seeded decorative randomness (screensaver drift, QR data). */
export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
