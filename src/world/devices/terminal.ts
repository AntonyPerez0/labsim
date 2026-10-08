/**
 * Counter-top LabSim terminals (World §3.1, §3.3): Mini 2 / Mini 3 (white wedge with the printer at
 * the rear top), Station 2 head (+ base), Station 2018 / Duo / Duo 2 (black-glass heads on a swivel
 * stand + base; the Duo carries a CFD) and the sealed "upcoming" boxes (Duo 3, Mini 4).
 * Device-local frame: origin = primary active-area centre on the glass, +Y screen top, +Z face normal.
 */
import { Matrix4 } from 'three';
import type { DeviceTypeCode } from '@/sim/types';
import { DEVICE_MODELS } from '../layout';
import { modelFor, type EffectiveModel } from './models';
import { DEG, boxG, cylG, placeMatrix, planeUvG, rboxG, sideProfileG } from '../rigs/kit/geom';
import type { AtlasRect } from '../rigs/kit/atlas';
import { chipSlot, decal, devCtx, lightPipe, logoRect, powerKey, put, screenStack, serialRect, sensorDot, swipeGroove, tapeLabel, tapeQuad, type DevCtx } from './common';
import type { DeviceBuildOptions, DeviceHandle, ScreenSlot } from './types';

const FRONT_Z = -0.5;

function serial(d: DevCtx, at: [number, number, number]): void {
  if (!d.opts.serial) return;
  tapeQuad(d, serialRect(d.kit, d.opts.serial), 16, 4, { p: at });
}

function tape(d: DevCtx, x: number, y: number): void {
  if (!d.opts.tape) return;
  const t = tapeLabel(d.kit, d.opts.tape, 3.6);
  tapeQuad(d, t.rect, t.w, t.h, { p: [x - t.w / 2, y, 0.06] });
}

/* ───────────────────────────── Mini 2 / Mini 3 ───────────────────────────── */

/**
 * Mini wedge: face W × Hf (white bezel) on a slope rising from the 35 mm front edge to the
 * 125/120 mm rear; the printer sits behind the face at the rear top. Built in counter coordinates
 * (u toward the rear, v up) and mapped into the face frame.
 */
export function buildMini(type: DeviceTypeCode, opts: DeviceBuildOptions): DeviceHandle {
  const model = modelFor(type);
  const d = devCtx(opts);
  const m = d.kit.mats;
  const [W, rearH, depth] = model.bodyMm;
  const front = model.wedgeFrontMm ?? 35;
  const faceH = type === 'MINI_3' ? 158 : 160;
  const faceW = type === 'MINI_3' ? 208 : 210;
  const [sw, sh] = model.screen!.mm;
  const mg = model.margins!;
  const P0: [number, number] = [4, front + 2];
  const alpha = Math.atan2(rearH - P0[1] - 6, depth - P0[0]);
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  const ysc = mg.bottom + sh / 2;
  const O: [number, number] = [P0[0] + ysc * cosA, P0[1] + ysc * sinA];
  const toFace = (u: number, v: number): [number, number] => {
    const du = u - O[0];
    const dv = v - O[1];
    return [du * cosA + dv * sinA, -du * sinA + dv * cosA];
  };
  const face1: [number, number] = [P0[0] + faceH * cosA, P0[1] + faceH * sinA];
  const cap = d.opts.maxBodyDepthMm ?? Infinity;
  const head = opts.arrangement === 'head';
  const yz = (pts: [number, number][], dz = 0): [number, number][] => pts.map(([u, v]) => toFace(u, v)).map(([y, z]) => [Math.max(z, -cap) + FRONT_Z + dz, y]);
  if (head) {
    // tethered panel faces: a slim head (the wedge is hidden behind the panel)
    put(d, rboxG(faceW, faceH, 26, 6, 3), m.labwhite, { p: [0, faceH / 2 - ysc, FRONT_Z - 13] });
    put(d, rboxG(faceW - 30, faceH - 40, 60, 8, 2), m.labwhite, { p: [0, faceH / 2 - ysc - 10, FRONT_Z - 45] });
  } else {
    put(d, sideProfileG(yz([[0, 0], [depth, 0], [depth, rearH], face1, P0, [0, front]]), W), m.labwhite);
    // printer door seam + paper slot on the rear top (behind the face)
    const pd = toFace((face1[0] + depth) / 2, rearH - 2);
    put(d, boxG(W - 30, 1.2, 0.6), m.darkPort, { p: [0, pd[0], Math.max(pd[1], -cap) + FRONT_Z + 0.3], r: [0, 0, 0] }, true);
    // rubber feet strip under the base
    put(d, sideProfileG(yz([[8, -1], [depth - 8, -1], [depth - 8, 1], [8, 1]]), W - 20), m.rubber);
  }
  const scr = screenStack(d, 'primary', sw, sh, [0, 0, 0], {}, 1.2, model.primaryScreen?.logicalMm);
  const botY = -ysc;
  const topY = faceH - ysc;
  // bezel: logo bottom-left, light pipe bottom centre, sensor dot top right, swipe groove on top edge
  const logo = d.opts.logo ?? model.logo;
  if (logo === 'wordmark') decal(d, logoRect(d.kit, 'wordmark', '#8b8f93'), 32, 9.6, { p: [-faceW / 2 + 26, botY + mg.bottom * 0.45, 0.05] });
  else if (logo === 'leaf') decal(d, logoRect(d.kit, 'leaf', '#8b8f93'), 9, 9, { p: [-faceW / 2 + 14, botY + mg.bottom * 0.45, 0.05] });
  if (d.opts.lightPipe !== false) lightPipe(d, [0, botY + mg.bottom * 0.45, 0.2]);
  sensorDot(d, [faceW / 2 - 9, topY - mg.top * 0.5, 0.05], 3);
  swipeGroove(d, [0, topY + 0.1, FRONT_Z - 6], 120, 'x');
  chipSlot(d, [0, botY - 0.5, FRONT_Z - 17]);
  tape(d, faceW / 2 - 30, botY + mg.bottom * 0.45);
  serial(d, [faceW / 2 - 60, botY + mg.bottom * 0.45, 0.06]);
  const keyY = topY - (model.powerKeyFromTopMm ?? 20);
  powerKey(d, faceW / 2, keyY, FRONT_Z - 10);
  const rearTop = toFace((face1[0] + depth) / 2, rearH);
  return {
    type,
    screens: [scr],
    anchors: {
      chipSlot: [0, botY, FRONT_Z - 17],
      powerKey: [faceW / 2, keyY, FRONT_Z - 10],
      nfc: [0, -sh / 2 - 12, 0],
      paper: model.hasPrinter && !head ? { pos: [0, rearTop[0], Math.max(rearTop[1], -cap) + FRONT_Z], dir: [0, cosA, sinA], normal: [0, sinA, -cosA] } : null,
      min: [-faceW / 2, botY, -Math.min(cap, 115)],
      max: [faceW / 2, topY, 0],
    },
    rest: new Matrix4().copy(placeMatrix({ p: [0, O[1], -(O[0] - depth / 2)], r: [alpha - 90 * DEG, 0, 0] })),
  };
}

/* ───────────────────────────── Station heads ───────────────────────────── */

interface HeadSpec {
  w: number;
  h: number;
  d: number;
  sw: number;
  sh: number;
  top: number;
  bottom: number;
  black: boolean;
  /** Sim screen-mm frame when the plane is a scaled copy (see `models.ts`). */
  logical?: readonly [number, number];
}

/** A display head (slab) whose active area is centred at `c` (device-local). Returns its screen slot. */
function head(d: DevCtx, display: 'primary' | 'secondary', s: HeadSpec, c: [number, number, number], logo: 'wordmark' | 'leaf' | 'none'): ScreenSlot {
  const m = d.kit.mats;
  const cy = c[1] + (s.top - s.bottom) / 2;
  if (s.black) {
    // white back shell + black glass front plate
    put(d, rboxG(s.w, s.h, s.d - 2, 7, 3), m.labwhite, { p: [c[0], cy, c[2] + FRONT_Z - 1 - (s.d - 2) / 2] });
    put(d, rboxG(s.w - 0.6, s.h - 0.6, 2.2, 5, 2), m.bezelBlack, { p: [c[0], cy, c[2] + FRONT_Z - 1.1] });
  } else {
    put(d, rboxG(s.w, s.h, s.d, 6, 3), m.labwhite, { p: [c[0], cy, c[2] + FRONT_Z - s.d / 2] });
  }
  const scr = screenStack(d, display, s.sw, s.sh, c, {}, s.black ? 0.8 : 1.2, s.logical);
  const botY = c[1] - s.sh / 2 - s.bottom;
  const col = s.black ? '#d8dadc' : '#8b8f93';
  if (logo === 'leaf') decal(d, logoRect(d.kit, 'leaf', col), 9, 9, { p: [c[0], botY + s.bottom * 0.5, c[2] + 0.05] });
  else if (logo === 'wordmark') decal(d, logoRect(d.kit, 'wordmark', col), 30, 9, { p: [c[0] - s.w / 2 + 26, botY + s.bottom * 0.45, c[2] + 0.05] });
  sensorDot(d, [c[0], c[1] + s.sh / 2 + s.top * 0.5, c[2] + 0.05], 3);
  return scr;
}

const ST_MARGINS = { top: 22, bottom: 35.7 };

function stationMfd(model: EffectiveModel): HeadSpec {
  const [w, h, dd] = model.bodyMm;
  const [sw, sh] = model.screen!.mm;
  const [w0, h0] = DEVICE_MODELS[model.type].screen!.mm;
  void w0;
  const grow = (h0 - sh) / 2;
  return { w, h, d: dd, sw, sh, top: ST_MARGINS.top + grow, bottom: ST_MARGINS.bottom + grow, black: true, logical: model.primaryScreen?.logicalMm };
}

const DUO_CFD: HeadSpec = { w: 215, h: 150, d: 30, sw: 172.3, sh: 107.7, top: 14, bottom: 28.3, black: true };
/** Duo CFD centre relative to the MFD screen centre when both lie in one tray (R2-D2, World §2.10). */
export const DUO_CFD_TRAY_OFFSET: [number, number, number] = [0, -205.7, 0];

/** Base with paper door (Station family): W × H × D, white with a black front band and a green leaf. */
function stationBase(d: DevCtx, at: Matrix4, bw: number, bh: number, bd: number, printer: boolean): void {
  const m = d.kit.mats;
  const P = (pl: Parameters<typeof placeMatrix>[0]) => at.clone().multiply(placeMatrix(pl));
  d.batch.add(rboxG(bw, bh, bd, 10, 3), m.labwhite, P({ p: [0, bh / 2, 0] }));
  d.batch.add(rboxG(bw - 8, bh * 0.55, 1.4, 3, 2), m.bezelBlack, P({ p: [0, bh * 0.45, bd / 2 + 0.2] }));
  if (printer) {
    d.detail.add(boxG(bw - 60, 0.8, 0.6), m.darkPort, P({ p: [0, bh - 0.2, -bd / 2 + 60] }));
    d.detail.add(boxG(0.8, 0.6, bd - 80), m.darkPort, P({ p: [-bw / 2 + 30, bh + 0.1, 0] }));
  }
  const leaf = logoRect(d.kit, 'leaf', '#2fd468');
  d.detail.add(planeQuad(leaf, 12, 12), d.kit.decal.material, P({ p: [bw / 2 - 20, bh * 0.45, bd / 2 + 1] }));
  d.batch.add(rboxG(bw - 12, 4, bd - 12, 2, 1), m.rubber, P({ p: [0, 2, 0] }));
}

function planeQuad(r: AtlasRect, w: number, h: number) {
  return planeUvG(w, h, [r.u0, r.v0, r.u1, r.v1]);
}

/**
 * Station 2018 / Duo / Duo 2 (MFD = L14 head with black glass) and Station 2 (8" white head).
 * `tray`: heads lie in the device frame (Duo CFD in front of the MFD, World §2.10);
 * `head`: the display head only; `stand`: head on a silver hinge arm above its base.
 */
export function buildStation(type: DeviceTypeCode, opts: DeviceBuildOptions): DeviceHandle {
  const model = modelFor(type);
  const d = devCtx(opts);
  const m = d.kit.mats;
  const duo = type === 'STATION_DUO' || type === 'STATION_DUO_2';
  const s2 = type === 'STATION_2';
  const mfd: HeadSpec = s2
    ? { w: 210, h: 160, d: 28, sw: model.screen!.mm[0], sh: model.screen!.mm[1], top: model.margins!.top, bottom: model.margins!.bottom, black: false, logical: model.primaryScreen?.logicalMm }
    : stationMfd(model);
  const cfdSpec: HeadSpec = { ...DUO_CFD, logical: model.secondaryScreen?.logicalMm };
  const logo = opts.logo ?? (s2 ? 'wordmark' : 'leaf');
  const screens: ScreenSlot[] = [head(d, 'primary', mfd, [0, 0, 0], logo)];
  const mfdBot = -mfd.sh / 2 - mfd.bottom;
  const mfdTop = mfd.sh / 2 + mfd.top;
  let chip: [number, number, number] = [0, mfdBot, FRONT_Z - mfd.d / 2];
  let nfc: [number, number, number] = [0, -mfd.sh / 2 - (s2 ? 12 : 18), 0];
  let minY = mfdBot;
  if (!s2 && !duo) {
    // Station 2018: card-reader module on the head's bottom edge†
    put(d, rboxG(110, 14, 24, 4, 2), m.bezelBlack, { p: [0, mfdBot - 6, FRONT_Z - 14] });
    put(d, boxG(64, 1.2, 2), m.darkPort, { p: [0, mfdBot - 13.2, FRONT_Z - 14] }, true);
    chip = [0, mfdBot - 13, FRONT_Z - 14];
    minY = mfdBot - 13;
  }
  if (s2) {
    lightPipe(d, [0, mfdBot + mfd.bottom * 0.45, 0.2]);
    swipeGroove(d, [0, mfdTop + 0.1, FRONT_Z - 6], 120, 'x');
    chipSlot(d, [0, mfdBot - 0.5, FRONT_Z - 14]);
  }
  let rest = placeMatrix({ p: [0, 180, 0], r: [-15 * DEG, 0, 0] });
  if (duo) {
    if (opts.arrangement === 'tray') {
      const c = DUO_CFD_TRAY_OFFSET;
      screens.push(head(d, 'secondary', cfdSpec, c, 'leaf'));
      const cBot = c[1] - DUO_CFD.sh / 2 - DUO_CFD.bottom;
      lightPipe(d, [c[0], cBot + DUO_CFD.bottom * 0.45, c[2] + 0.2]);
      swipeGroove(d, [c[0], c[1] + DUO_CFD.sh / 2 + DUO_CFD.top + 0.1, FRONT_Z - 6], 120, 'x');
      chipSlot(d, [c[0], cBot - 0.5, FRONT_Z - 15]);
      chip = [c[0], cBot, FRONT_Z - 15];
      nfc = [c[0], c[1] - DUO_CFD.sh / 2 - 12, 0];
      minY = cBot;
    } else {
      // CFD back-to-back on the stand: faces −Z, 20 mm behind the MFD shell
      const back = new Matrix4().copy(placeMatrix({ p: [0, -10, -mfd.d - 26], r: [0, Math.PI, 0] }));
      const saved = d.frame;
      d.frame = saved.clone().multiply(back);
      screens.push(head(d, 'secondary', cfdSpec, [0, 0, 0], 'leaf'));
      lightPipe(d, [0, -DUO_CFD.sh / 2 - DUO_CFD.bottom * 0.55, 0.2]);
      d.frame = saved;
    }
  }
  if (opts.arrangement === 'stand') {
    // swivel stand: silver hinge arm from the base top to the back of the head, base below
    const tilt = -15 * DEG;
    const [bw, bh, bd] = model.baseMm ?? [330, 105, 230];
    const headCy = (mfdTop + mfdBot) / 2;
    // rest frame: base centre on the surface; head centre 130 mm above the base top
    const headPos: [number, number, number] = [0, bh + 30 + (mfdTop - mfdBot) / 2, 20];
    rest = placeMatrix({ p: [headPos[0], headPos[1] - headCy, headPos[2]], r: [tilt, 0, 0] });
    const inv = rest.clone().invert();
    const baseAt = d.frame.clone().multiply(inv);
    stationBase(d, baseAt, bw, bh, bd, model.hasPrinter);
    // hinge arm (silver) from the base top to the head back
    d.batch.add(rboxG(70, 90, 22, 6, 2), m.aluminium, baseAt.clone().multiply(placeMatrix({ p: [0, bh + 40, -20], r: [tilt, 0, 0] })));
    d.batch.add(cylG(40, 80, 20), m.aluminium, baseAt.clone().multiply(placeMatrix({ p: [0, bh + 2, -20], r: [0, 0, Math.PI / 2] })));
  } else if (s2 && opts.arrangement === 'head') {
    // flat head cable boss on the back
    put(d, rboxG(60, 30, 10, 3, 1), m.labwhite, { p: [0, mfdBot + 30, FRONT_Z - mfd.d - 4] });
  }
  if (opts.tape) {
    const t = tapeLabel(d.kit, opts.tape, 4);
    tapeQuad(d, t.rect, t.w, t.h, { p: [mfd.w / 2 - t.w / 2 - 8, mfdBot + mfd.bottom * 0.45, 0.06] });
  }
  serial(d, [mfd.w / 2 - 70, mfdBot + mfd.bottom * 0.45, 0.06]);
  const keyY = mfdTop - (model.powerKeyFromTopMm ?? 40);
  powerKey(d, mfd.w / 2, keyY, FRONT_Z - 12);
  return {
    type,
    screens,
    anchors: {
      chipSlot: chip,
      powerKey: [mfd.w / 2, keyY, FRONT_Z - 12],
      nfc,
      paper: null,
      min: [-mfd.w / 2, minY, -mfd.d],
      max: [mfd.w / 2, mfdTop, 0],
    },
    rest,
  };
}

/** Station 2 base on its own (it stands on S1 of the tethered rack, cable up to the MFD head). */
export function buildStationBase(opts: DeviceBuildOptions, type: DeviceTypeCode = 'STATION_2'): void {
  const d = devCtx(opts);
  const [bw, bh, bd] = DEVICE_MODELS[type].baseMm ?? [240, 95, 200];
  stationBase(d, d.frame, bw, bh, bd, true);
}

/* ───────────────────────────── Sealed boxes (library) ───────────────────────────── */

export function buildSealedBox(type: DeviceTypeCode, opts: DeviceBuildOptions): DeviceHandle {
  const model = DEVICE_MODELS[type];
  const d = devCtx(opts);
  const m = d.kit.mats;
  const [w, h, dd] = model.bodyMm;
  put(d, rboxG(w, h, dd, 2, 1), m.paperWhite, { p: [0, h / 2, 0] });
  put(d, boxG(w + 0.6, 30, dd + 0.6), m.greenPla, { p: [0, h * 0.35, 0] });
  const t = tapeLabel(d.kit, type === 'MINI_4' ? 'MINI 4 — UPCOMING' : 'STATION DUO 3 — UPCOMING', 9);
  tapeQuad(d, t.rect, Math.min(w - 20, t.w), t.h, { p: [0, h * 0.7, dd / 2 + 0.4] });
  decal(d, logoRect(d.kit, 'wordmark', '#2e9e4f'), 90, 27, { p: [0, h * 0.82, dd / 2 + 0.4] });
  return {
    type,
    screens: [],
    anchors: { chipSlot: [0, 0, 0], powerKey: null, nfc: null, paper: null, min: [-w / 2, 0, -dd / 2], max: [w / 2, h, dd / 2] },
    rest: new Matrix4(),
  };
}
