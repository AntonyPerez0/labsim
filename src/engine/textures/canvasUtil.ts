/**
 * Canvas helpers for procedural textures: seeded PRNG, tileable value-noise / fBm, height → normal
 * conversion, and texture wrapping. All generators are deterministic (seeded) so the lab looks the
 * same on every load.
 */
import {
  CanvasTexture,
  LinearMipmapLinearFilter,
  LinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('2D canvas unavailable');
  return { canvas, ctx };
}

/** mulberry32 — tiny seeded PRNG. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Tileable 2D value noise. `period` lattice cells span the texture so it wraps seamlessly.
 * Returns a sampler over normalised coordinates u, v ∈ [0, 1).
 */
export function tileableNoise(period: number, seed: number): (u: number, v: number) => number {
  const r = rng(seed);
  const n = Math.max(1, Math.round(period));
  const grid = new Float32Array(n * n);
  for (let i = 0; i < grid.length; i++) grid[i] = r();
  return (u: number, v: number) => {
    const x = (u - Math.floor(u)) * n;
    const y = (v - Math.floor(v)) * n;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const x1 = (x0 + 1) % n;
    const y1 = (y0 + 1) % n;
    const a = grid[y0 * n + x0]!;
    const b = grid[y0 * n + x1]!;
    const c = grid[y1 * n + x0]!;
    const d = grid[y1 * n + x1]!;
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

/** Tileable fractal noise (sum of octaves, normalised to ~[0, 1]). */
export function tileableFbm(basePeriod: number, octaves: number, seed: number, gain = 0.5): (u: number, v: number) => number {
  const layers: ((u: number, v: number) => number)[] = [];
  let norm = 0;
  let amp = 1;
  const amps: number[] = [];
  for (let o = 0; o < octaves; o++) {
    layers.push(tileableNoise(basePeriod * 2 ** o, seed + o * 1013));
    amps.push(amp);
    norm += amp;
    amp *= gain;
  }
  return (u, v) => {
    let s = 0;
    for (let o = 0; o < layers.length; o++) s += layers[o]!(u, v) * amps[o]!;
    return s / norm;
  };
}

/** Fill an ImageData by calling `fn(x, y)` → [r, g, b] in 0..255. */
export function fillPixels(ctx: CanvasRenderingContext2D, w: number, h: number, fn: (x: number, y: number, out: Uint8ClampedArray, i: number) => void): void {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      fn(x, y, d, i);
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/** Read a canvas channel (red) as heights 0..1. */
export function readHeights(ctx: CanvasRenderingContext2D, w: number, h: number): Float32Array {
  const d = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4]! / 255;
  return out;
}

/**
 * Tangent-space normal map from a tileable height field (central differences with wrap-around).
 * `strength` scales the slope (bigger = bumpier).
 */
export function heightsToNormalCanvas(heights: Float32Array, w: number, h: number, strength: number): HTMLCanvasElement {
  const { canvas, ctx } = makeCanvas(w, h);
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const yu = (y - 1 + h) % h;
    const yd = (y + 1) % h;
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w;
      const xr = (x + 1) % w;
      const dx = (heights[y * w + xr]! - heights[y * w + xl]!) * strength;
      // canvas y grows downward; texture v grows upward (flipY) → invert dy for +Y-up normal maps
      const dy = (heights[yd * w + x]! - heights[yu * w + x]!) * strength;
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

export interface TexOptions {
  /** Colour data (sRGB) vs data maps (normal/roughness/alpha → no colour space). */
  srgb: boolean;
  repeat?: boolean;
  anisotropy?: number;
  /** Physical size in metres of one texture tile — stored in `texture.userData.tileSize`. */
  tileSize?: [number, number];
}

export function toTexture(canvas: HTMLCanvasElement, opts: TexOptions): Texture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = opts.srgb ? SRGBColorSpace : NoColorSpace;
  if (opts.repeat !== false) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  }
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = opts.anisotropy ?? 1;
  if (opts.tileSize) t.userData.tileSize = opts.tileSize;
  t.needsUpdate = true;
  return t;
}

/** CSS colour helpers. */
export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [128, 128, 128];
  let s = m[1]!;
  if (s.length === 3) s = s[0]! + s[0]! + s[1]! + s[1]! + s[2]! + s[2]!;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
