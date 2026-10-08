/**
 * Rig-specific procedural canvas textures (World §6.2): rack-unit rail strips with square holes and
 * U numbers (IMG-T), LED strip dots, motor PCB, ribbon cable, braided sleeve weave, GT2 belt teeth,
 * NFC copper coil, rounded-slot perforated steel (IMG-R), fuse blades, screen smudges. Deterministic
 * and cached by key.
 */
import {
  CanvasTexture,
  ClampToEdgeWrapping,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from 'three';
import { FONTS } from '@/render2d/api';
import { RACK_FRAME, uBottomMm } from '../../layout';

const cache = new Map<string, unknown>();

function once<T>(key: string, make: () => T): T {
  const hit = cache.get(key);
  if (hit) return hit as T;
  const v = make();
  cache.set(key, v);
  return v;
}

export function makeCanvas(w: number, h: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function tex(canvas: HTMLCanvasElement, opts: { srgb?: boolean; repeat?: boolean; aniso?: number } = {}): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = opts.srgb === false ? NoColorSpace : SRGBColorSpace;
  t.wrapS = t.wrapT = opts.repeat ? RepeatWrapping : ClampToEdgeWrapping;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = opts.aniso ?? 4;
  t.generateMipmaps = true;
  return t;
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────────────────────────── rack-unit rail strip (IMG-T) ───────────────────────────── */

/** Rail texture covers U1 bottom … U42 top (1866.9 mm) × the 30 mm flange. */
export const RAIL_TEX = { wMm: 30, y0Mm: RACK_FRAME.u1BottomMm, y1Mm: uBottomMm(43), pxW: 72, pxH: 4096 } as const;

/**
 * Front rail flange: black steel with 9.5 mm square holes (3 per U) on the inner half and white
 * U numbers + 6 mm ticks in the outer 15 mm band. `side` = which rail (left numbers right-aligned).
 * Canvas x 0 = the flange edge at |x| 255 (outer) for the left rail and |x| 225 (inner) for the right
 * rail, i.e. canvas x always runs toward rack +X.
 */
export function railStrip(side: 'left' | 'right'): { map: Texture; alphaMap: Texture } {
  return once(`rail:${side}`, () => {
    const { pxW, pxH, wMm, y0Mm, y1Mm } = RAIL_TEX;
    const kx = pxW / wMm;
    const ky = pxH / (y1Mm - y0Mm);
    const col = makeCanvas(pxW, pxH);
    const alpha = makeCanvas(pxW, pxH);
    const c = col.ctx;
    const a = alpha.ctx;
    c.fillStyle = '#1d1e20';
    c.fillRect(0, 0, pxW, pxH);
    // subtle powder-coat grain
    const r = rng(side === 'left' ? 11 : 13);
    c.globalAlpha = 0.06;
    for (let i = 0; i < 2500; i++) {
      c.fillStyle = r() > 0.5 ? '#ffffff' : '#000000';
      c.fillRect(r() * pxW, r() * pxH, 1, 1);
    }
    c.globalAlpha = 1;
    a.fillStyle = '#ffffff';
    a.fillRect(0, 0, pxW, pxH);
    const yPx = (mm: number) => pxH - (mm - y0Mm) * ky; // canvas y (down) from rack-local mm (up)
    // x (mm from canvas left) of the hole centre and the number band
    const holeX = side === 'left' ? 255 - 232.5 : 232.5 - 225; // 22.5 / 7.5
    const bandX0 = side === 'left' ? 0 : 15;
    const bandX1 = bandX0 + 15;
    const hole = RACK_FRAME.rail.squareHoleMm;
    for (let n = 1; n <= RACK_FRAME.units; n++) {
      const ub = uBottomMm(n);
      for (const off of RACK_FRAME.rail.holeOffsetsMm) {
        const cy = yPx(ub + off);
        const x = (holeX - hole / 2) * kx;
        const s = hole * kx;
        a.fillStyle = '#000000';
        a.fillRect(x, cy - (hole * ky) / 2, s, hole * ky);
        // slightly lighter punched edge around the hole
        c.strokeStyle = '#3a3c40';
        c.lineWidth = 1;
        c.strokeRect(x - 0.5, cy - (hole * ky) / 2 - 0.5, s + 1, hole * ky + 1);
      }
      // U boundary tick
      c.fillStyle = '#f2f2f2';
      const ty = yPx(ub);
      const tickW = RACK_FRAME.railNumbers.tickMm * kx;
      if (side === 'left') c.fillRect(bandX0 * kx, ty - 1, tickW, 2);
      else c.fillRect(bandX1 * kx - tickW, ty - 1, tickW, 2);
      // number centred on the U
      const cap = RACK_FRAME.railNumbers.capMm;
      c.font = `700 ${cap * ky * 1.38}px ${FONTS.LABEL}`;
      c.textBaseline = 'middle';
      c.fillStyle = RACK_FRAME.railNumbers.color;
      const midY = yPx(ub + RACK_FRAME.uMm / 2);
      if (side === 'left') {
        c.textAlign = 'right';
        c.fillText(String(n), bandX1 * kx - 2, midY, 15 * kx - 3);
      } else {
        c.textAlign = 'left';
        c.fillText(String(n), bandX0 * kx + 2, midY, 15 * kx - 3);
      }
    }
    return { map: tex(col.canvas, { aniso: 8 }), alphaMap: tex(alpha.canvas, { srgb: false, aniso: 8 }) };
  });
}

/* ───────────────────────────── LED strip (60 LEDs/m) ───────────────────────────── */

/** One LED pitch (16.67 mm) tile: dark PCB with a bright SMD LED — emissive map + colour map. */
export function ledStripDots(): { map: Texture; emissiveMap: Texture } {
  return once('ledstrip', () => {
    const W = 32;
    const H = 64;
    const col = makeCanvas(W, H);
    const em = makeCanvas(W, H);
    col.ctx.fillStyle = '#0b2014';
    col.ctx.fillRect(0, 0, W, H);
    col.ctx.fillStyle = '#e8e8e0';
    col.ctx.fillRect(W * 0.25, H * 0.35, W * 0.5, H * 0.3);
    em.ctx.fillStyle = '#000000';
    em.ctx.fillRect(0, 0, W, H);
    const g = em.ctx.createRadialGradient(W / 2, H / 2, 1, W / 2, H / 2, W * 0.55);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.35, '#d8ffe4');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    em.ctx.fillStyle = g;
    em.ctx.fillRect(0, 0, W, H);
    return { map: tex(col.canvas, { repeat: true }), emissiveMap: tex(em.canvas, { repeat: true }) };
  });
}

/* ───────────────────────────── motor controller PCB ───────────────────────────── */

export function pcbBoard(seed = 'motor-pcb'): Texture {
  return once(`pcb:${seed}`, () => {
    const W = 512;
    const H = 360;
    const { canvas, ctx: c } = makeCanvas(W, H);
    c.fillStyle = '#1d5d30';
    c.fillRect(0, 0, W, H);
    const r = rng(seed.length * 977 + 3);
    // copper traces (Manhattan routes)
    c.strokeStyle = '#2f7d45';
    c.lineWidth = 3;
    for (let i = 0; i < 70; i++) {
      let x = r() * W;
      let y = r() * H;
      c.beginPath();
      c.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        if (k % 2 === 0) x = Math.max(8, Math.min(W - 8, x + (r() - 0.5) * 220));
        else y = Math.max(8, Math.min(H - 8, y + (r() - 0.5) * 160));
        c.lineTo(x, y);
      }
      c.stroke();
    }
    // pads / vias
    for (let i = 0; i < 160; i++) {
      c.fillStyle = r() > 0.3 ? '#c9a24a' : '#d8d8d0';
      const x = r() * W;
      const y = r() * H;
      c.beginPath();
      c.arc(x, y, 2 + r() * 2.5, 0, Math.PI * 2);
      c.fill();
    }
    // DB-25 footprint along the top edge
    c.fillStyle = '#c9a24a';
    for (let i = 0; i < 13; i++) c.fillRect(110 + i * 22, 18, 8, 8);
    for (let i = 0; i < 12; i++) c.fillRect(121 + i * 22, 34, 8, 8);
    // silkscreen
    c.fillStyle = '#f0f0e8';
    c.font = `700 22px ${FONTS.MONO}`;
    c.fillText('25-PIN MOTOR CTRL · MADE IN HONG KONG', 18, H - 18, W - 36);
    c.font = `700 18px ${FONTS.MONO}`;
    c.fillText('J1 DB25', 20, 34);
    c.fillText('24V IN', 20, H - 60);
    c.fillText('SOL', 160, H - 60);
    c.fillText('SERVO', 260, H - 60);
    c.fillText('USB', W - 70, H - 60);
    c.strokeStyle = '#f0f0e8';
    c.lineWidth = 2;
    c.strokeRect(6, 6, W - 12, H - 12);
    for (const [x, y] of [
      [16, 16],
      [W - 16, 16],
      [16, H - 16],
      [W - 16, H - 16],
    ] as const) {
      c.fillStyle = '#c9a24a';
      c.beginPath();
      c.arc(x, y, 9, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#0d2a16';
      c.beginPath();
      c.arc(x, y, 5, 0, Math.PI * 2);
      c.fill();
    }
    return tex(canvas, { aniso: 4 });
  });
}

/* ───────────────────────────── cables ───────────────────────────── */

/** Grey ridged ribbon cable with one red edge wire (tiles along v). 25.4 mm across. */
export function ribbonCable(wires = 20): Texture {
  return once(`ribbon:${wires}`, () => {
    const W = 128;
    const H = 16;
    const { canvas, ctx: c } = makeCanvas(W, H);
    const pitch = W / wires;
    for (let i = 0; i < wires; i++) {
      const g = c.createLinearGradient(i * pitch, 0, (i + 1) * pitch, 0);
      const base = i === 0 ? ['#7a1a14', '#c0392b', '#7a1a14'] : ['#7b7d80', '#b9bcc0', '#7b7d80'];
      g.addColorStop(0, base[0]!);
      g.addColorStop(0.5, base[1]!);
      g.addColorStop(1, base[2]!);
      c.fillStyle = g;
      c.fillRect(i * pitch, 0, pitch, H);
    }
    return tex(canvas, { repeat: true });
  });
}

/** Expandable PET braided sleeve: diagonal over-under weave (8 mm tile). */
export function braidWeave(): Texture {
  return once('braid', () => {
    const S = 64;
    const { canvas, ctx: c } = makeCanvas(S, S);
    c.fillStyle = '#0c0c0c';
    c.fillRect(0, 0, S, S);
    c.lineWidth = 5;
    for (let i = -S; i < 2 * S; i += 8) {
      c.strokeStyle = '#2a2a2a';
      c.beginPath();
      c.moveTo(i, 0);
      c.lineTo(i + S, S);
      c.stroke();
      c.strokeStyle = '#1c1c1c';
      c.beginPath();
      c.moveTo(i + S, 0);
      c.lineTo(i, S);
      c.stroke();
    }
    c.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < S; i += 4) c.fillRect(0, i, S, 1);
    return tex(canvas, { repeat: true });
  });
}

/** GT2 belt: black rubber with fibre ribs and 2 mm tooth lines (tiles along u). */
export function beltTeeth(): Texture {
  return once('belt', () => {
    const W = 32;
    const H = 16;
    const { canvas, ctx: c } = makeCanvas(W, H);
    c.fillStyle = '#121212';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#060606';
    c.fillRect(0, 0, W / 2, H);
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.fillRect(0, H * 0.45, W, 1);
    return tex(canvas, { repeat: true });
  });
}

/** Copper spiral NFC coil on black with a white `NFC` print (tap paddle). */
export function copperCoil(): Texture {
  return once('coil', () => {
    const S = 256;
    const { canvas, ctx: c } = makeCanvas(S, S);
    c.fillStyle = '#151515';
    c.fillRect(0, 0, S, S);
    c.strokeStyle = '#c87a46';
    c.lineWidth = 4;
    for (let i = 0; i < 9; i++) {
      const m = 20 + i * 11;
      c.strokeRect(m, m * 0.72, S - 2 * m, S - 2 * m * 0.72 - 40);
    }
    c.fillStyle = '#f2f2f2';
    c.font = `700 34px ${FONTS.UI_SANS}`;
    c.textAlign = 'center';
    c.fillText('NFC', S / 2, S - 12);
    return tex(canvas);
  });
}

/* ───────────────────────────── rounded-slot perforated steel (IMG-R) ───────────────────────────── */

/** Rounded slots 8 × 22 mm, staggered, pitch 18 (x) × 32 (y) mm — `perforatedSteelRounded`. */
export function perforatedRounded(): { map: Texture; alphaMap: Texture; tileM: [number, number] } {
  return once('perfRounded', () => {
    const tileMm: [number, number] = [36, 64];
    const k = 8; // px per mm
    const W = tileMm[0] * k;
    const H = tileMm[1] * k;
    const col = makeCanvas(W, H);
    const al = makeCanvas(W, H);
    col.ctx.fillStyle = '#1e1f21';
    col.ctx.fillRect(0, 0, W, H);
    al.ctx.fillStyle = '#ffffff';
    al.ctx.fillRect(0, 0, W, H);
    const slot = (cx: number, cy: number) => {
      for (const ctx of [al.ctx, col.ctx]) {
        ctx.beginPath();
        const w = 8 * k;
        const h = 22 * k;
        const r = w / 2;
        ctx.moveTo(cx - r, cy - h / 2 + r);
        ctx.arc(cx, cy - h / 2 + r, r, Math.PI, 0);
        ctx.lineTo(cx + r, cy + h / 2 - r);
        ctx.arc(cx, cy + h / 2 - r, r, 0, Math.PI);
        ctx.closePath();
        if (ctx === al.ctx) {
          ctx.fillStyle = '#000000';
          ctx.fill();
        } else {
          ctx.strokeStyle = '#3a3c40';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
      }
    };
    // two columns per tile, the second shifted half a pitch vertically
    for (const [x, y] of [
      [9, 16],
      [9, 48],
      [27, 0],
      [27, 32],
      [27, 64],
    ] as const)
      slot(x * k, y * k);
    const map = tex(col.canvas, { repeat: true });
    const alphaMap = tex(al.canvas, { srgb: false, repeat: true });
    map.userData.tileSize = [tileMm[0] / 1000, tileMm[1] / 1000];
    alphaMap.userData.tileSize = map.userData.tileSize;
    return { map, alphaMap, tileM: [tileMm[0] / 1000, tileMm[1] / 1000] };
  });
}

/* ───────────────────────────── fuse blade ───────────────────────────── */

/** ATO blade fuse face (rating colour, S-link; blown = gap + scorch). 19 × 18 mm. */
export function fuseBlade(colorHex: string, rating: string, blown: boolean): Texture {
  return once(`fuse:${colorHex}:${rating}:${blown}`, () => {
    const W = 64;
    const H = 96;
    const { canvas, ctx: c } = makeCanvas(W, H);
    c.fillStyle = colorHex;
    c.fillRect(0, 0, W, H * 0.62);
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.fillRect(6, 6, W - 12, H * 0.5);
    c.strokeStyle = blown ? '#4a2a10' : '#d9d9d9';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(18, H * 0.45);
    c.bezierCurveTo(18, 14, 46, 40, 46, 14);
    if (blown) c.moveTo(46, 30);
    c.stroke();
    if (blown) {
      const g = c.createRadialGradient(32, 28, 2, 32, 28, 22);
      g.addColorStop(0, 'rgba(60,30,10,0.9)');
      g.addColorStop(1, 'rgba(60,30,10,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H * 0.62);
    }
    c.fillStyle = '#ffffff';
    c.font = `700 22px ${FONTS.UI_SANS}`;
    c.textAlign = 'center';
    c.fillText(rating, W / 2, H * 0.58);
    c.fillStyle = '#cfcfcf';
    c.fillRect(8, H * 0.62, 16, H * 0.38);
    c.fillRect(W - 24, H * 0.62, 16, H * 0.38);
    return tex(canvas);
  });
}
