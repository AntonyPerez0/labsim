/**
 * Metal surface generators: perforated powder-coated steel (round holes or the staggered slots of
 * the lab's rack shelves), hexagonal mesh, and brushed aluminium (2020 extrusions).
 */
import type { Texture } from 'three';
import { clamp255, fillPixels, heightsToNormalCanvas, makeCanvas, readHeights, rng, tileableFbm, toTexture } from './canvasUtil';

export interface PerforatedOptions {
  /** Hole diameter (round) or slot width (slots), mm. */
  holeMm: number;
  /** Hole pitch (round) or row pitch (slots), mm. */
  pitchMm: number;
  slots: boolean;
}

export interface PerforatedSet {
  map: Texture;
  alphaMap: Texture;
  normalMap?: Texture;
}

const STEEL_BASE = [30, 31, 33] as const; // powder-coated black (sRGB)

/** Rounded rectangle path. */
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.arc(x + w - rr, y + rr, rr, -Math.PI / 2, 0);
  ctx.lineTo(x + w, y + h - rr);
  ctx.arc(x + w - rr, y + h - rr, rr, 0, Math.PI / 2);
  ctx.lineTo(x + rr, y + h);
  ctx.arc(x + rr, y + h - rr, rr, Math.PI / 2, Math.PI);
  ctx.lineTo(x, y + rr);
  ctx.arc(x + rr, y + rr, rr, Math.PI, Math.PI * 1.5);
  ctx.closePath();
}

/**
 * Layout of one seamless tile. Round holes: 60° staggered grid (8 × 8 holes per tile).
 * Slots: brick-staggered horizontal slots (4 × 8 per tile), like the rack shelves in the photos.
 */
function perforatedLayout(o: PerforatedOptions): { wMm: number; hMm: number; draw: (ctx: CanvasRenderingContext2D, pxPerMm: number, grow: number) => void } {
  if (o.slots) {
    const slotW = o.holeMm; // slot height (short side)
    const slotL = o.holeMm * 5; // slot length (7 × 35 mm by default, as on the rack shelves)
    const xPitch = slotL + o.holeMm * 2.2;
    const yPitch = o.pitchMm;
    const cols = 4;
    const rows = 8;
    const wMm = cols * xPitch;
    const hMm = rows * yPitch;
    return {
      wMm,
      hMm,
      draw(ctx, k, grow) {
        ctx.beginPath();
        for (let j = 0; j < rows; j++) {
          const off = j % 2 ? xPitch / 2 : 0;
          for (let i = -1; i <= cols; i++) {
            const cx = (i * xPitch + off + xPitch / 2) * k;
            const cy = (j * yPitch + yPitch / 2) * k;
            const w = slotL * k + grow * 2;
            const h = slotW * k + grow * 2;
            roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2);
          }
        }
        ctx.fill();
      },
    };
  }
  const cols = 8;
  const rows = 8;
  const p = o.pitchMm;
  const rowH = p * 0.8660254;
  const wMm = cols * p;
  const hMm = rows * rowH;
  return {
    wMm,
    hMm,
    draw(ctx, k, grow) {
      ctx.beginPath();
      const r = (o.holeMm / 2) * k + grow;
      for (let j = -1; j <= rows; j++) {
        const off = j % 2 ? p / 2 : 0;
        for (let i = -1; i <= cols; i++) {
          const cx = (i * p + off + p / 2) * k;
          const cy = (j * rowH + rowH / 2) * k;
          ctx.moveTo(cx + r, cy);
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    },
  };
}

export function makePerforatedSteel(o: PerforatedOptions, anisotropy: number): PerforatedSet {
  const layout = perforatedLayout(o);
  const W = 512;
  const k = W / layout.wMm;
  const H = Math.max(16, Math.round(layout.hMm * k));
  const tileSize: [number, number] = [layout.wMm / 1000, layout.hMm / 1000];

  // Alpha: white steel, black holes.
  const alpha = makeCanvas(W, H);
  alpha.ctx.fillStyle = '#fff';
  alpha.ctx.fillRect(0, 0, W, H);
  alpha.ctx.fillStyle = '#000';
  layout.draw(alpha.ctx, k, 0);

  // Height: blurred hole mask → rolled/punched edge bevel.
  const height = makeCanvas(W, H);
  height.ctx.fillStyle = '#fff';
  height.ctx.fillRect(0, 0, W, H);
  height.ctx.filter = 'blur(2.5px)';
  height.ctx.fillStyle = '#000';
  layout.draw(height.ctx, k, 1.5);
  height.ctx.filter = 'none';
  const heights = readHeights(height.ctx, W, H);

  // Colour: powder coat with faint mottling; slightly lighter worn rims around holes.
  const color = makeCanvas(W, H);
  const fbm = tileableFbm(6, 3, 911);
  const r = rng(77);
  fillPixels(color.ctx, W, H, (x, y, d, i) => {
    const n = fbm(x / W, y / H) - 0.5;
    const hgt = heights[y * W + x]!;
    const rim = hgt > 0.05 && hgt < 0.85 ? (1 - Math.abs(hgt - 0.45) / 0.4) * 10 : 0;
    const grain = (r() - 0.5) * 3;
    const v = n * 6 + rim + grain;
    d[i] = clamp255(STEEL_BASE[0] + v);
    d[i + 1] = clamp255(STEEL_BASE[1] + v);
    d[i + 2] = clamp255(STEEL_BASE[2] + v * 1.05);
  });

  const normal = heightsToNormalCanvas(heights, W, H, 5);
  return {
    map: toTexture(color.canvas, { srgb: true, anisotropy, tileSize }),
    alphaMap: toTexture(alpha.canvas, { srgb: false, anisotropy, tileSize }),
    normalMap: toTexture(normal, { srgb: false, anisotropy, tileSize }),
  };
}

/** Black hexagonal mesh (≈ 70 % open), as on the gantry side guards. */
export function makeHexMesh(anisotropy: number): { map: Texture; alphaMap: Texture } {
  const cols = 8;
  const rows = 8;
  const a = 7; // flat-to-flat, mm
  const bar = 1.3; // mm
  const rowH = a * 0.8660254;
  const wMm = cols * a;
  const hMm = rows * rowH;
  const W = 512;
  const k = W / wMm;
  const H = Math.round(hMm * k);
  const tileSize: [number, number] = [wMm / 1000, hMm / 1000];

  const drawHexes = (ctx: CanvasRenderingContext2D) => {
    const inner = ((a - bar) / 2) * k; // apothem of the hole
    const rad = inner / 0.8660254; // circumradius
    ctx.beginPath();
    for (let j = -1; j <= rows; j++) {
      const off = j % 2 ? a / 2 : 0;
      for (let i = -1; i <= cols; i++) {
        const cx = (i * a + off + a / 2) * k;
        const cy = (j * rowH + rowH / 2) * k;
        for (let s = 0; s < 6; s++) {
          const ang = Math.PI / 6 + (s * Math.PI) / 3; // pointy-top hexagon
          const px = cx + Math.cos(ang) * rad;
          const py = cy + Math.sin(ang) * rad;
          if (s === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      }
    }
    ctx.fill();
  };

  const alpha = makeCanvas(W, H);
  alpha.ctx.fillStyle = '#fff';
  alpha.ctx.fillRect(0, 0, W, H);
  alpha.ctx.fillStyle = '#000';
  drawHexes(alpha.ctx);

  const color = makeCanvas(W, H);
  color.ctx.fillStyle = 'rgb(24,25,27)';
  color.ctx.fillRect(0, 0, W, H);
  // faint highlight along bar centres
  color.ctx.globalAlpha = 0.25;
  color.ctx.fillStyle = 'rgb(60,62,66)';
  color.ctx.fillRect(0, 0, W, H);
  color.ctx.globalAlpha = 1;
  color.ctx.fillStyle = 'rgb(18,19,21)';
  drawHexes(color.ctx);

  return {
    map: toTexture(color.canvas, { srgb: true, anisotropy, tileSize }),
    alphaMap: toTexture(alpha.canvas, { srgb: false, anisotropy, tileSize }),
  };
}

/** Brushed aluminium: fine directional streaks along U; roughness map encodes 0.26–0.42. */
export function makeBrushedAluminium(anisotropy: number): { map: Texture; roughnessMap: Texture } {
  const W = 512;
  const H = 512;
  const r = rng(4242);
  // Per-row streak values (directional brushing), plus long low-frequency variation.
  const rowA = new Float32Array(H);
  const rowB = new Float32Array(H);
  for (let y = 0; y < H; y++) {
    rowA[y] = r() - 0.5;
    rowB[y] = r() - 0.5;
  }
  const fbm = tileableFbm(4, 3, 31337);
  const streak = (x: number, y: number) => {
    // streak intensity varies slowly along the row so lines fade in and out
    const fade = 0.5 + 0.5 * Math.sin((x / W) * Math.PI * 2 * (1 + (y % 7)) + rowB[y]! * 6.28);
    return rowA[y]! * fade;
  };
  const color = makeCanvas(W, H);
  const rough = makeCanvas(W, H);
  const colorImg = color.ctx.createImageData(W, H);
  const roughImg = rough.ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const s = streak(x, y);
      const n = fbm(x / W, y / H) - 0.5;
      const fine = (r() - 0.5) * 4;
      const v = 192 + s * 22 + n * 10 + fine;
      colorImg.data[i] = clamp255(v - 2);
      colorImg.data[i + 1] = clamp255(v);
      colorImg.data[i + 2] = clamp255(v + 4);
      colorImg.data[i + 3] = 255;
      const rv = clamp255((0.34 + s * 0.12 + n * 0.06) * 255);
      roughImg.data[i] = rv;
      roughImg.data[i + 1] = rv;
      roughImg.data[i + 2] = rv;
      roughImg.data[i + 3] = 255;
    }
  }
  color.ctx.putImageData(colorImg, 0, 0);
  rough.ctx.putImageData(roughImg, 0, 0);
  const tileSize: [number, number] = [0.25, 0.25];
  return {
    map: toTexture(color.canvas, { srgb: true, anisotropy, tileSize }),
    roughnessMap: toTexture(rough.canvas, { srgb: false, anisotropy, tileSize }),
  };
}
