/**
 * Shared device construction (World §3.3): screen stack (canvas plane + black-glass backing +
 * glass overlay), bezel decals (logo, label tape, serial sticker), chip slot with the green arrow
 * light pipe, power key, swipe channel.
 */
import { Mesh, MeshBasicMaterial, PlaneGeometry, Shape, ShapeGeometry, type Material, type Matrix4 } from 'three';
import { FONTS } from '@/render2d/api';
import { drawMark, drawWordmark } from '@/render2d/shared/labLogo';
import { MM, boxG, extrudeG, placeMatrix, planeUvG, rboxG, rrectPts, shapeMm, type Place } from '../rigs/kit/geom';
import { paintTape, type Atlas, type AtlasRect } from '../rigs/kit/atlas';
import type { MeshBatch } from '../rigs/kit/batch';
import type { RigKit } from '../rigs/kit/context';
import type { DeviceBuildOptions, ScreenSlot } from './types';

export interface DevCtx {
  kit: RigKit;
  frame: Matrix4;
  batch: MeshBatch;
  /** Small details that should not cast shadows. */
  detail: MeshBatch;
  opts: DeviceBuildOptions;
}

export function devCtx(opts: DeviceBuildOptions): DevCtx {
  return { kit: opts.kit, frame: opts.frame, batch: opts.batch ?? opts.kit.stat, detail: opts.detail ?? opts.kit.statNoShadow, opts };
}

/** Add a geometry at a device-local mm placement. */
export function put(d: DevCtx, g: import('three').BufferGeometry, mat: Material, place: Place = {}, detail = false): void {
  (detail ? d.detail : d.batch).add(g, mat, d.frame.clone().multiply(placeMatrix(place)));
}

/* ───────────────────────────── atlas memo ───────────────────────────── */

const memo = new WeakMap<Atlas, Map<string, AtlasRect>>();

export function atlasRect(atlas: Atlas, key: string, wPx: number, hPx: number, draw: Parameters<Atlas['alloc']>[2]): AtlasRect {
  let m = memo.get(atlas);
  if (!m) {
    m = new Map();
    memo.set(atlas, m);
  }
  let r = m.get(key);
  if (!r) {
    r = atlas.alloc(wPx, hPx, draw);
    m.set(key, r);
  }
  return r;
}

/** Decal quad (w × h mm) facing local +Z at a placement, from the decal atlas. */
export function decal(d: DevCtx, rect: AtlasRect, wMm: number, hMm: number, place: Place): void {
  d.detail.add(planeUvG(wMm, hMm, [rect.u0, rect.v0, rect.u1, rect.v1]), d.kit.decal.material, d.frame.clone().multiply(placeMatrix(place)));
}

export function tapeQuad(d: DevCtx, rect: AtlasRect, wMm: number, hMm: number, place: Place): void {
  d.detail.add(planeUvG(wMm, hMm, [rect.u0, rect.v0, rect.u1, rect.v1]), d.kit.tape.material, d.frame.clone().multiply(placeMatrix(place)));
}

/** LabSim logo decal: wordmark (leaf + `lab`) or leaf only, in a colour. */
export function logoRect(kit: RigKit, variant: 'wordmark' | 'leaf', color: string): AtlasRect {
  const key = `logo:${variant}:${color}`;
  if (variant === 'leaf') return atlasRect(kit.decal, key, 96, 96, (c, x, y, w, h) => drawMark(c, x + w / 2, y + h / 2, w * 0.86, color));
  return atlasRect(kit.decal, key, 320, 96, (c, x, y, w, h) => {
    drawMark(c, x + h * 0.45, y + h / 2, h * 0.7, color);
    drawWordmark(c, x + h * 0.9, y + h * 0.72, h * 0.62, color, 600);
  });
}

/** Label-maker tape (e.g. `FLEX 3`) — width from the text length. Returns rect and mm size. */
export function tapeLabel(kit: RigKit, text: string, capMm: number, style: Parameters<typeof paintTape>[1] = {}): { rect: AtlasRect; w: number; h: number } {
  const h = capMm * 1.9;
  const w = Math.max(h * 1.4, text.split('\n').reduce((m, l) => Math.max(m, l.length), 0) * capMm * 0.68 + 6);
  const lines = text.split('\n').length;
  const hh = h * (lines > 1 ? lines * 0.85 : 1);
  // ~44 px tall per text line keeps labels crisp while the 2048² atlas holds every tape in the area
  const pxPerMm = Math.max(3, Math.min(12, (44 * (lines > 1 ? lines : 1)) / hh, 1000 / w));
  const rect = atlasRect(kit.tape, `tape:${text}:${capMm}:${style.bg ?? ''}:${style.fg ?? ''}`, w * pxPerMm, hh * pxPerMm, paintTape(text, style));
  return { rect, w, h: hh };
}

/** Serial sticker: white with Code-128-like bars + `S/N …`. */
export function serialRect(kit: RigKit, serial: string): AtlasRect {
  return atlasRect(kit.tape, `serial:${serial}`, 320, 80, (c, x, y, w, h) => {
    c.fillStyle = '#fbfbf8';
    c.fillRect(x, y, w, h);
    let seed = 7;
    for (let i = 0; i < serial.length; i++) seed = (seed * 31 + serial.charCodeAt(i)) >>> 0;
    let bx = x + 10;
    c.fillStyle = '#111';
    while (bx < x + w - 10) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      const bw = 1 + (seed % 4);
      if ((seed >> 5) % 2) c.fillRect(bx, y + 6, bw, h * 0.5);
      bx += bw + 1;
    }
    c.font = `600 ${h * 0.28}px ${FONTS.MONO}`;
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    c.fillText(`S/N ${serial}`, x + w / 2, y + h - 6, w - 12);
  });
}

/* ───────────────────────────── screen stack ───────────────────────────── */

/**
 * The live screen plane (canvas texture assigned later by the screen manager), a black-glass
 * backing (shown when the display is off) and a faint glass overlay (reflections).
 * `centre` is device-local mm of the screen centre; `rotZ` rotates the screen in its plane.
 */
export function screenStack(d: DevCtx, display: 'primary' | 'secondary', wMm: number, hMm: number, centre: [number, number, number], placeExtra: Place = {}, borderMm = 1.2, logicalMm?: readonly [number, number]): ScreenSlot {
  const m = d.frame.clone().multiply(placeMatrix({ p: centre, r: placeExtra.r ?? [0, 0, 0] }));
  // black-glass backing (the inactive border around the active area, and the whole face when off)
  d.batch.add(rrectPlaneG(wMm + 2 * borderMm, hMm + 2 * borderMm, Math.min(3, borderMm + 1)), d.kit.mats.screenGlass, m.clone().multiply(placeMatrix({ p: [0, 0, -0.46] })));
  // glass overlay (transparent, merged into the no-shadow batch)
  d.detail.add(new PlaneGeometry((wMm + 2 * borderMm) * MM, (hMm + 2 * borderMm) * MM), d.kit.mats.screenGlassOverlay, m.clone().multiply(placeMatrix({ p: [0, 0, 0.02] })));
  const mesh = new Mesh(new PlaneGeometry(wMm * MM, hMm * MM), new MeshBasicMaterial({ color: '#000000' }));
  mesh.name = `screen:${display}`;
  m.clone().multiply(placeMatrix({ p: [0, 0, -0.4] })).decompose(mesh.position, mesh.quaternion, mesh.scale);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  mesh.visible = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  d.opts.screenParent.add(mesh);
  // normal/up in device-local space (only an in-plane rotation is supported)
  // wMm/hMm = the sim's screen-mm frame (UV → mm); the plane may be a uniformly scaled copy
  return { display, mesh, wMm: logicalMm?.[0] ?? wMm, hMm: logicalMm?.[1] ?? hMm, centreMm: centre, normal: [0, 0, 1], up: [0, 1, 0] };
}

/** Flat rounded-rectangle plane (w × h mm, corner r mm) facing +Z. */
export function rrectPlaneG(w: number, h: number, r: number): import('three').BufferGeometry {
  const g = new ShapeGeometry(shapeMm(rrectPts(0, 0, w, h, r, 3)), 1);
  return g;
}

/* ───────────────────────────── card features ───────────────────────────── */

/** Chip slot opening (64 × 2 mm, 10 deep) on an edge face whose outward normal is local −Y. */
export function chipSlot(d: DevCtx, at: [number, number, number], widthMm = 64): void {
  put(d, boxG(widthMm, 2.2, 3), d.kit.mats.darkPort, { p: [at[0], at[1] + 1.2, at[2]] }, true);
}

/**
 * Green arrow light pipe (IMG-R): black inset 60 × 8 mm with two ▲ arrows and a centre bar, on the
 * face at `at` (device-local mm, face +Z).
 */
export function lightPipe(d: DevCtx, at: [number, number, number]): void {
  put(d, rboxG(62, 9, 1.2, 1.5), d.kit.mats.monitorBlack, { p: [at[0], at[1], at[2] - 0.4] }, true);
  const tri = new Shape();
  tri.moveTo(-3.5 * MM, -2.2 * MM);
  tri.lineTo(3.5 * MM, -2.2 * MM);
  tri.lineTo(0, 2.4 * MM);
  tri.closePath();
  const tg = extrudeG(tri, 0.5, 1);
  for (const dx of [-18, 18]) put(d, tg, d.kit.mats.chipArrowGreen, { p: [at[0] + dx, at[1], at[2] + 0.2] }, true);
  put(d, boxG(14, 1.6, 0.5), d.kit.mats.chipArrowGreen, { p: [at[0], at[1], at[2] + 0.35] }, true);
}

/** Power key on the right edge (+X face) at local y; a small rounded pill. */
export function powerKey(d: DevCtx, x: number, y: number, z: number, lenMm = 12): void {
  put(d, rboxG(1.6, lenMm, 3.2, 0.7), d.kit.mats.plasticGrey, { p: [x + 0.4, y, z] }, true);
}

/** 3 mm swipe groove: a dark strip along an edge. */
export function swipeGroove(d: DevCtx, at: [number, number, number], lenMm: number, axis: 'x' | 'y'): void {
  put(d, axis === 'x' ? boxG(lenMm, 1.2, 3) : boxG(1.2, lenMm, 3), d.kit.mats.darkPort, { p: at }, true);
}

/** A small black sensor / camera dot on the bezel. */
export function sensorDot(d: DevCtx, at: [number, number, number], dMm = 3): void {
  const g = new PlaneGeometry(dMm * MM, dMm * MM);
  put(d, g, d.kit.mats.monitorBlack, { p: at }, true);
}
