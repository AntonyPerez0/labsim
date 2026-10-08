/**
 * Canvas texture atlas (World §10.3 "label atlas"): static tape labels, stickers, lip cards, posters
 * and signs are drawn into a few large canvases so all their quads merge into one draw call per
 * page. Shelf packing with padding; a new page is opened when one fills up.
 */
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Material,
} from 'three';
import type { Engine } from '@/engine/types';
import { uvPlane, type UvRect } from './shapes';
import type { BufferGeometry } from 'three';

export type DrawFn = (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

export interface AtlasSlot {
  page: AtlasPage;
  rect: UvRect;
  /** Pixel rect inside the page canvas. */
  px: { x: number; y: number; w: number; h: number };
}

export class AtlasPage {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly texture: CanvasTexture;
  material: Material;
  private shelfY = 0;
  private shelfH = 0;
  private cursorX = 0;

  constructor(
    readonly size: number,
    readonly index: number,
    makeMaterial: (tex: CanvasTexture) => Material,
    anisotropy: number,
    readonly height = size,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = size;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.fillStyle = '#808080';
    this.ctx.fillRect(0, 0, size, height);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = anisotropy;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = LinearMipmapLinearFilter;
    this.texture.magFilter = LinearFilter;
    this.material = makeMaterial(this.texture);
  }

  /** Try to reserve w × h px (+ padding); null when the page is full. */
  reserve(w: number, h: number, pad: number): { x: number; y: number } | null {
    const W = w + pad * 2;
    const H = h + pad * 2;
    if (W > this.size || H > this.height) return null;
    if (this.cursorX + W > this.size) {
      this.shelfY += this.shelfH;
      this.shelfH = 0;
      this.cursorX = 0;
    }
    if (this.shelfY + H > this.height) return null;
    const x = this.cursorX + pad;
    const y = this.shelfY + pad;
    this.cursorX += W;
    this.shelfH = Math.max(this.shelfH, H);
    return { x, y };
  }
}

export class CanvasAtlas {
  readonly pages: AtlasPage[] = [];
  private dirty = new Set<AtlasPage>();

  constructor(
    private readonly engine: Engine,
    readonly name: string,
    private readonly size = 2048,
    private readonly pad = 6,
    private readonly makeMaterial: (tex: CanvasTexture) => Material = (tex) =>
      new MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0 }),
    private readonly height = size,
  ) {}

  private newPage(): AtlasPage {
    const p = new AtlasPage(this.size, this.pages.length, this.makeMaterial, 8, this.height);
    p.material.name = `${this.name}#${p.index}`;
    this.pages.push(p);
    return p;
  }

  /** Allocate a w × h px region and draw into it (ctx translated + clipped to the region). */
  draw(w: number, h: number, fn: DrawFn): AtlasSlot {
    w = Math.max(4, Math.round(w));
    h = Math.max(4, Math.round(h));
    let page: AtlasPage | undefined;
    let at: { x: number; y: number } | null = null;
    for (const p of this.pages) {
      at = p.reserve(w, h, this.pad);
      if (at) {
        page = p;
        break;
      }
    }
    if (!page || !at) {
      page = this.newPage();
      at = page.reserve(w, h, this.pad);
      if (!at) throw new Error(`atlas ${this.name}: ${w}×${h} does not fit`);
    }
    const ctx = page.ctx;
    // Bleed: fill the padding with the edge colour by drawing slightly larger first.
    ctx.save();
    ctx.beginPath();
    ctx.rect(at.x - this.pad, at.y - this.pad, w + this.pad * 2, h + this.pad * 2);
    ctx.clip();
    ctx.translate(at.x - this.pad, at.y - this.pad);
    ctx.scale((w + this.pad * 2) / w, (h + this.pad * 2) / h);
    fn(ctx, w, h);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(at.x, at.y, w, h);
    ctx.clip();
    ctx.translate(at.x, at.y);
    fn(ctx, w, h);
    ctx.restore();
    this.dirty.add(page);
    const S = this.size;
    const SH = this.height;
    return {
      page,
      px: { x: at.x, y: at.y, w, h },
      rect: { u0: at.x / S, u1: (at.x + w) / S, v0: 1 - (at.y + h) / SH, v1: 1 - at.y / SH },
    };
  }

  /** Plane geometry (w × h metres, facing +Z) textured with `slot`. */
  quad(widthM: number, heightM: number, slot: AtlasSlot): BufferGeometry {
    return uvPlane(widthM, heightM, slot.rect);
  }

  /** Upload all pages that changed. */
  commit(): void {
    for (const p of this.dirty) p.texture.needsUpdate = true;
    this.dirty.clear();
  }

  /** Mark a region as changed after drawing into it directly (dynamic atlases). */
  touch(slot: AtlasSlot): void {
    slot.page.texture.needsUpdate = true;
  }
}

/** Redraw a slot in place (dynamic screens): fn draws in slot-local px. */
export function redrawSlot(slot: AtlasSlot, fn: DrawFn): void {
  const { ctx } = slot.page;
  const { x, y, w, h } = slot.px;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x, y);
  fn(ctx, w, h);
  ctx.restore();
  slot.page.texture.needsUpdate = true;
}
