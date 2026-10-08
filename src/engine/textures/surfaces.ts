/**
 * Architectural & printed-part surfaces: vinyl floor tiles, acoustic ceiling tiles, wall paint,
 * FDM PLA layer lines and a light wood grain.
 */
import type { Texture } from 'three';
import { clamp255, fillPixels, hexToRgb, heightsToNormalCanvas, makeCanvas, rng, tileableFbm, tileableNoise, toTexture } from './canvasUtil';

/** Light-grey vinyl / epoxy floor: 2 × 2 tiles of 600 mm per texture (1.2 m), seams, chips, scuffs. */
export function makeFloorTiles(anisotropy: number): { map: Texture; roughnessMap: Texture } {
  const W = 1024;
  const tiles = 2;
  const tilePx = W / tiles;
  const r = rng(1001);
  const tileTone: number[] = [];
  for (let i = 0; i < tiles * tiles; i++) tileTone.push((r() - 0.5) * 7);
  const cloud = tileableFbm(5, 4, 202);
  const chipNoise = tileableNoise(180, 303);
  const scuffNoise = tileableFbm(3, 3, 404);
  const color = makeCanvas(W, W);
  const rough = makeCanvas(W, W);
  const cImg = color.ctx.createImageData(W, W);
  const rImg = rough.ctx.createImageData(W, W);
  const base = [176, 178, 176];
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const tx = Math.floor(x / tilePx);
      const ty = Math.floor(y / tilePx);
      const lx = x - tx * tilePx;
      const ly = y - ty * tilePx;
      const edge = Math.min(lx, ly, tilePx - 1 - lx, tilePx - 1 - ly);
      const u = x / W;
      const v = y / W;
      let tone = tileTone[ty * tiles + tx]! + (cloud(u, v) - 0.5) * 10;
      // vinyl chips: sparse darker / lighter flecks
      const c = chipNoise(u, v);
      const fleck = r();
      if (fleck > 0.985) tone += c > 0.5 ? 16 : -22;
      else tone += (fleck - 0.5) * 4;
      // seams: dark 2 px groove with a 1 px light lip
      let seam = 0;
      if (edge < 1.5) seam = -38;
      else if (edge < 2.5) seam = 6;
      const v0 = tone + seam;
      cImg.data[i] = clamp255(base[0]! + v0);
      cImg.data[i + 1] = clamp255(base[1]! + v0);
      cImg.data[i + 2] = clamp255(base[2]! + v0 * 0.97);
      cImg.data[i + 3] = 255;
      // roughness: 0.62 base, polished traffic scuffs → smoother, seams rougher
      const sc = scuffNoise(u, v);
      let rv = 0.62 - Math.max(0, sc - 0.55) * 0.6 + (r() - 0.5) * 0.04;
      if (edge < 2.5) rv = 0.85;
      const rb = clamp255(rv * 255);
      rImg.data[i] = rb;
      rImg.data[i + 1] = rb;
      rImg.data[i + 2] = rb;
      rImg.data[i + 3] = 255;
    }
  }
  color.ctx.putImageData(cImg, 0, 0);
  rough.ctx.putImageData(rImg, 0, 0);
  const tileSize: [number, number] = [1.2, 1.2];
  return {
    map: toTexture(color.canvas, { srgb: true, anisotropy, tileSize }),
    roughnessMap: toTexture(rough.canvas, { srgb: false, anisotropy, tileSize }),
  };
}

/** Acoustic mineral-fibre ceiling tiles in a white T-bar grid: 2 × 2 tiles of 600 mm (1.2 m). */
export function makeCeilingTiles(anisotropy: number): { map: Texture } {
  const W = 1024;
  const tiles = 2;
  const tilePx = W / tiles;
  const barPx = Math.round((24 / 600) * tilePx); // 24 mm T-bar
  const { canvas, ctx } = makeCanvas(W, W);
  const r = rng(5150);
  const fbm = tileableFbm(8, 3, 6061);
  fillPixels(ctx, W, W, (x, y, d, i) => {
    const n = (fbm(x / W, y / W) - 0.5) * 8;
    const speck = r();
    let v = 233 + n;
    if (speck > 0.97) v -= 14 + r() * 18; // perforation pinholes
    d[i] = clamp255(v);
    d[i + 1] = clamp255(v);
    d[i + 2] = clamp255(v - 3);
  });
  // fissures: short wavy strokes
  ctx.strokeStyle = 'rgba(150,148,140,0.35)';
  ctx.lineCap = 'round';
  for (let k = 0; k < 900; k++) {
    const x = r() * W;
    const y = r() * W;
    const len = 4 + r() * 12;
    const a = r() * Math.PI * 2;
    ctx.lineWidth = 0.8 + r() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + Math.cos(a + 1) * len * 0.6, y + Math.sin(a + 1) * len * 0.6, x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // T-bar grid: white enamel with a thin shadow line where the tile meets the bar
  for (let t = 0; t <= tiles; t++) {
    const p = t * tilePx;
    ctx.fillStyle = 'rgb(244,244,241)';
    ctx.fillRect(p - barPx / 2, 0, barPx, W);
    ctx.fillRect(0, p - barPx / 2, W, barPx);
    ctx.fillStyle = 'rgba(120,118,112,0.45)';
    ctx.fillRect(p + barPx / 2, 0, 1.5, W);
    ctx.fillRect(0, p + barPx / 2, W, 1.5);
    ctx.fillRect(p - barPx / 2 - 1.5, 0, 1.5, W);
    ctx.fillRect(0, p - barPx / 2 - 1.5, W, 1.5);
  }
  return { map: toTexture(canvas, { srgb: true, anisotropy, tileSize: [1.2, 1.2] }) };
}

/** Warm off-white eggshell wall paint with faint roller stipple (1 m tile). */
export function makeWallPaint(anisotropy: number): { map: Texture } {
  const W = 512;
  const { canvas, ctx } = makeCanvas(W, W);
  const low = tileableFbm(3, 3, 777);
  const stipple = tileableNoise(128, 778);
  const r = rng(779);
  fillPixels(ctx, W, W, (x, y, d, i) => {
    const u = x / W;
    const v = y / W;
    const n = (low(u, v) - 0.5) * 7 + (stipple(u, v) - 0.5) * 5 + (r() - 0.5) * 2.5;
    d[i] = clamp255(236 + n);
    d[i + 1] = clamp255(233 + n);
    d[i + 2] = clamp255(226 + n);
  });
  return { map: toTexture(canvas, { srgb: true, anisotropy, tileSize: [1, 1] }) };
}

/** FDM print layer lines (0.25 mm layers over a 16 mm tile) with a matching normal map. */
export function makePlaLayers(color: string, anisotropy: number): { map: Texture; normalMap: Texture } {
  const W = 256;
  const H = 256;
  const layers = 64;
  const [cr, cg, cb] = hexToRgb(color);
  const r = rng(hashColor(color));
  const wobble = tileableNoise(6, 99);
  const fine = tileableNoise(64, 100);
  const heights = new Float32Array(W * H);
  const { canvas, ctx } = makeCanvas(W, H);
  const img = ctx.createImageData(W, H);
  const lum = (cr + cg + cb) / 3;
  const contrast = lum < 60 ? 9 : 6;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const v = y / H;
      // layer phase with a slight wobble (extrusion width variation)
      const phase = (v * layers + (wobble(u, v) - 0.5) * 0.15) * Math.PI * 2;
      const ridge = Math.cos(phase); // 1 at the bead centre
      const h = 0.5 + 0.5 * ridge;
      heights[y * W + x] = h * 0.8 + fine(u, v) * 0.2;
      const shade = (ridge * 0.5 - 0.25) * contrast + (r() - 0.5) * 3;
      const i = (y * W + x) * 4;
      img.data[i] = clamp255(cr + shade);
      img.data[i + 1] = clamp255(cg + shade);
      img.data[i + 2] = clamp255(cb + shade);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const normal = heightsToNormalCanvas(heights, W, H, 1.4);
  const tileSize: [number, number] = [0.016, 0.016];
  return {
    map: toTexture(canvas, { srgb: true, anisotropy, tileSize }),
    normalMap: toTexture(normal, { srgb: false, anisotropy, tileSize }),
  };
}

/** Light oak/birch laminate: fine, low-contrast grain running along U (0.6 m tile). */
export function makeWoodGrain(anisotropy: number): { map: Texture } {
  const W = 1024;
  const H = 512;
  const { canvas, ctx } = makeCanvas(W, H);
  const warp = tileableFbm(3, 4, 8080);
  const fibre = tileableNoise(256, 8082);
  const r = rng(8081);
  // per-row fibre streaks (grain runs along x)
  const rowStreak = new Float32Array(H);
  for (let y = 0; y < H; y++) rowStreak[y] = r() - 0.5;
  fillPixels(ctx, W, H, (x, y, d, i) => {
    const u = x / W;
    const v = y / H;
    const rings = Math.sin((v * 34 + warp(u, v) * 2.2) * Math.PI * 2);
    const late = Math.max(0, rings) ** 3; // narrow darker latewood bands
    const streak = rowStreak[y]! * 7 + (fibre(u * 0.25, v) - 0.5) * 6;
    const pore = r() > 0.995 ? -10 : 0;
    const t = late * 16 - streak;
    d[i] = clamp255(196 - t + pore);
    d[i + 1] = clamp255(160 - t * 0.85 + pore);
    d[i + 2] = clamp255(118 - t * 0.6 + pore);
  });
  return { map: toTexture(canvas, { srgb: true, anisotropy, tileSize: [1.2, 0.6] }) };
}

function hashColor(c: string): number {
  let h = 17;
  for (let i = 0; i < c.length; i++) h = (h * 31 + c.charCodeAt(i)) >>> 0;
  return h;
}
