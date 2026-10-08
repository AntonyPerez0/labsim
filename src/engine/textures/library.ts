/**
 * `TextureLibrary` implementation: canvas-generated textures cached by key.
 *
 * Every texture carries `userData.tileSize = [widthM, heightM]` — the physical size of one tile — so
 * world builders can set `repeat` from mesh dimensions. Textures are shared: if you need a different
 * `repeat`/`offset`, `clone()` it (clones share the GPU upload of the same image source).
 */
import { CanvasTexture, SRGBColorSpace, LinearFilter, LinearMipmapLinearFilter, type Texture } from 'three';
import type { TextureLibrary } from '../types';
import { makeCanvas } from './canvasUtil';
import { makeLabel, type LabelOptions } from './label';
import { makeBrushedAluminium, makeHexMesh, makePerforatedSteel, type PerforatedSet } from './metal';
import { makeCeilingTiles, makeFloorTiles, makePlaLayers, makeWallPaint, makeWoodGrain } from './surfaces';

export class CanvasTextureLibrary implements TextureLibrary {
  private cache = new Map<string, unknown>();
  private all = new Set<Texture>();
  private requestedAnisotropy = 4;
  private maxAnisotropy = 16;

  private get anisotropy(): number {
    return Math.max(1, Math.min(this.maxAnisotropy, this.requestedAnisotropy));
  }

  /** Called by the engine once the renderer exists. */
  setMaxAnisotropy(max: number): void {
    this.maxAnisotropy = Math.max(1, max);
    this.applyAnisotropy();
  }

  /** Apply a quality preset's anisotropy to every texture created so far (and future ones). */
  setAnisotropy(level: number): void {
    this.requestedAnisotropy = level;
    this.applyAnisotropy();
  }

  private applyAnisotropy(): void {
    const a = this.anisotropy;
    for (const t of this.all) {
      if (t.anisotropy !== a) {
        t.anisotropy = a;
        t.needsUpdate = true;
      }
    }
  }

  private track<T>(key: string, make: (aniso: number) => T): T {
    const hit = this.cache.get(key);
    if (hit) return hit as T;
    const value = make(this.anisotropy);
    this.cache.set(key, value);
    const v = value as unknown;
    if (v && typeof v === 'object') {
      if ((v as Texture).isTexture) this.all.add(v as Texture);
      else for (const t of Object.values(v as Record<string, unknown>)) if (t && (t as Texture).isTexture) this.all.add(t as Texture);
    }
    return value;
  }

  perforatedSteel(opts: { holeMm?: number; pitchMm?: number; slots?: boolean } = {}): PerforatedSet {
    const slots = opts.slots ?? false;
    const holeMm = opts.holeMm ?? (slots ? 7 : 5);
    const pitchMm = opts.pitchMm ?? (slots ? 17 : 8);
    return this.track(`perf:${holeMm}:${pitchMm}:${slots}`, (a) => makePerforatedSteel({ holeMm, pitchMm, slots }, a));
  }

  hexMesh(): { map: Texture; alphaMap: Texture } {
    return this.track('hex', (a) => makeHexMesh(a));
  }

  brushedAluminium(): { map: Texture; roughnessMap: Texture } {
    return this.track('alu', (a) => makeBrushedAluminium(a));
  }

  plaLayers(color = '#1b1b1c'): { map: Texture; normalMap: Texture } {
    return this.track(`pla:${color.toLowerCase()}`, (a) => makePlaLayers(color, a));
  }

  floorTiles(): { map: Texture; roughnessMap: Texture } {
    return this.track('floor', (a) => makeFloorTiles(a));
  }

  ceilingTiles(): { map: Texture } {
    return this.track('ceiling', (a) => makeCeilingTiles(a));
  }

  wallPaint(): { map: Texture } {
    return this.track('wall', (a) => makeWallPaint(a));
  }

  /** Extra (not in the contract): light wood grain for desks/benches. */
  woodGrain(): { map: Texture } {
    return this.track('wood', (a) => makeWoodGrain(a));
  }

  label(text: string, opts: LabelOptions = {}): Texture {
    const key = `label:${text}|${opts.bg ?? ''}|${opts.fg ?? ''}|${opts.font ?? ''}|${opts.widthPx ?? ''}|${opts.heightPx ?? ''}`;
    return this.track(key, (a) => makeLabel(text, opts, a));
  }

  canvas(widthPx: number, heightPx: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; texture: Texture } {
    const { canvas, ctx } = makeCanvas(widthPx, heightPx);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = this.anisotropy;
    texture.generateMipmaps = true;
    texture.minFilter = LinearMipmapLinearFilter;
    texture.magFilter = LinearFilter;
    this.all.add(texture);
    texture.addEventListener('dispose', () => this.all.delete(texture));
    return { canvas, ctx, texture };
  }
}
