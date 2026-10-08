/**
 * Label / decal atlases (World §10.3 "Label atlas"): every static tape label, sticker and printed
 * decal is drawn once into a shared canvas and placed as a UV-mapped quad merged into one mesh, so
 * all labels of the rig area cost one draw call per atlas.
 *
 * Two atlases: `tape` (opaque label-maker tape, stickers) and `decal` (alpha-tested raised PLA text,
 * logos, silkscreen) — the decal atlas has a transparent background.
 */
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, SRGBColorSpace, type Material } from 'three';
import { FONTS } from '@/render2d/api';
import { planeUvG, type Place } from './geom';
import type { MeshBatch } from './batch';

export interface AtlasRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Draw callback in atlas px: (ctx, x, y, w, h). */
export type AtlasDraw = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;

export class Atlas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  private x = 0;
  private y = 0;
  private rowH = 0;
  private readonly pad = 2;
  readonly material: Material;
  private full = false;

  constructor(
    readonly size: number,
    readonly kind: 'tape' | 'decal',
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = size;
    this.ctx = this.canvas.getContext('2d')!;
    if (kind === 'tape') {
      this.ctx.fillStyle = '#f3f2ec';
      this.ctx.fillRect(0, 0, size, size);
    }
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.magFilter = LinearFilter;
    this.texture.anisotropy = 8;
    this.texture.flipY = true;
    this.material =
      kind === 'tape'
        ? new MeshStandardMaterial({ map: this.texture, roughness: 0.55, metalness: 0 })
        : new MeshStandardMaterial({ map: this.texture, roughness: 0.62, metalness: 0, transparent: false, alphaTest: 0.45 });
    this.material.name = `atlas:${kind}`;
    (this.material as MeshStandardMaterial).polygonOffset = true;
    (this.material as MeshStandardMaterial).polygonOffsetFactor = -1;
    (this.material as MeshStandardMaterial).polygonOffsetUnits = -2;
  }

  /** Reserve w × h px, run `draw` there and return the UV rect (flipY-aware). */
  alloc(w: number, h: number, draw: AtlasDraw): AtlasRect {
    w = Math.ceil(w);
    h = Math.ceil(h);
    if (this.x + w + this.pad > this.size) {
      this.x = 0;
      this.y += this.rowH + this.pad;
      this.rowH = 0;
    }
    if (this.y + h > this.size) {
      if (!this.full) console.warn(`[world-rigs] ${this.kind} atlas full; reusing the last slot`);
      this.full = true;
      this.x = 0;
      this.y = this.size - h;
    }
    const x = this.x;
    const y = this.y;
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();
    draw(this.ctx, x, y, w, h);
    this.ctx.restore();
    this.x += w + this.pad;
    this.rowH = Math.max(this.rowH, h);
    // canvas y down, texture v up (flipY): v = 1 - y / size
    const inset = 0.5;
    return {
      u0: (x + inset) / this.size,
      u1: (x + w - inset) / this.size,
      v0: 1 - (y + h - inset) / this.size,
      v1: 1 - (y + inset) / this.size,
    };
  }

  /** Add a quad (w × h mm, facing +Z of the placement) showing `rect` to a batch. */
  quad(batch: MeshBatch, wMm: number, hMm: number, rect: AtlasRect, place: Place): void {
    batch.add(planeUvG(wMm, hMm, [rect.u0, rect.v0, rect.u1, rect.v1]), this.material, place);
  }

  flush(): void {
    this.texture.needsUpdate = true;
  }
}

/* ───────────────────────────── label painters ───────────────────────────── */

export interface TapeStyle {
  bg?: string;
  fg?: string;
  font?: string;
  weight?: number;
  /** Two-line labels: lines separated by \n. */
  align?: 'center' | 'left';
  /** Darker 1.5 px edges (label-maker tape). */
  edges?: boolean;
}

/** Label-maker tape: white tape with darker edges, black text auto-fitted (World §6.2 `label`). */
export function paintTape(text: string, style: TapeStyle = {}): AtlasDraw {
  return (c, x, y, w, h) => {
    c.fillStyle = style.bg ?? '#f5f5f0';
    c.fillRect(x, y, w, h);
    // faint sheen
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.12)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.07)');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    if (style.edges !== false) {
      c.strokeStyle = 'rgba(0,0,0,0.18)';
      c.lineWidth = 1.5;
      c.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);
    }
    fitText(c, text, x, y, w, h, style.fg ?? '#111111', style.font ?? FONTS.LABEL, style.weight ?? 700, style.align ?? 'center');
  };
}

/** Text auto-fitted into a box (multi-line on \n). */
export function fitText(c: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, h: number, color: string, family: string, weight: number, align: 'center' | 'left' = 'center', marginK = 0.08): void {
  const lines = text.split('\n');
  const mx = w * marginK;
  const my = h * 0.12;
  const availW = w - 2 * mx;
  const availH = h - 2 * my;
  let size = Math.floor(availH / (lines.length * 1.05));
  c.textBaseline = 'middle';
  c.textAlign = align;
  for (; size > 5; size--) {
    c.font = `${weight} ${size}px ${family}`;
    if (lines.every((l) => c.measureText(l).width <= availW)) break;
  }
  c.font = `${weight} ${size}px ${family}`;
  c.fillStyle = color;
  const lh = size * 1.05;
  const top = y + h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => c.fillText(l, align === 'center' ? x + w / 2 : x + mx, top + i * lh + size * 0.04));
}

/** Raised PLA text decal: light text with a dark offset shadow edge (reads as embossed). */
export function paintRaisedText(text: string, color: string, opts: { family?: string; weight?: number; vertical?: boolean; shadow?: string } = {}): AtlasDraw {
  return (c, x, y, w, h) => {
    c.clearRect(x, y, w, h);
    const fam = opts.family ?? FONTS.LABEL;
    const wt = opts.weight ?? 700;
    if (opts.vertical) {
      // stacked letters top → bottom
      const letters = [...text];
      const cell = h / letters.length;
      const size = Math.min(w * 0.95, cell * 0.95);
      c.font = `${wt} ${size}px ${fam}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      letters.forEach((ch, i) => {
        c.fillStyle = opts.shadow ?? 'rgba(0,0,0,0.85)';
        c.fillText(ch, x + w / 2 + size * 0.035, y + cell * (i + 0.5) + size * 0.04);
        c.fillStyle = color;
        c.fillText(ch, x + w / 2, y + cell * (i + 0.5));
      });
      return;
    }
    const shadowCol = opts.shadow ?? 'rgba(0,0,0,0.85)';
    // shadow pass then face
    c.save();
    c.translate(h * 0.03, h * 0.04);
    fitText(c, text, x, y, w, h, shadowCol, fam, wt, 'center', 0.02);
    c.restore();
    fitText(c, text, x, y, w, h, color, fam, wt, 'center', 0.02);
  };
}
