/**
 * Handheld LabSim devices (World §3.1, §3.3): Flex 1 / 2 / 3 / 4, Flex Pocket (no printer) and the
 * countertop Compact wedge. Built in the device-local frame (origin = active-area centre on the
 * glass, +Y = screen top, +Z = face normal, mm).
 */
import { Matrix4 } from 'three';
import type { DeviceTypeCode } from '@/sim/types';
import { modelFor } from './models';
import { DEG, placeMatrix, rboxG, sideProfileG, boxG } from '../rigs/kit/geom';
import { chipSlot, decal, devCtx, logoRect, powerKey, put, screenStack, serialRect, sensorDot, swipeGroove, tapeLabel, tapeQuad, type DevCtx } from './common';
import type { DeviceBuildOptions, DeviceHandle } from './types';

/** Body front face sits 0.5 mm below the glass top (the screen plane is 0.4 mm below it). */
const FRONT_Z = -0.5;

export function buildFlex(type: DeviceTypeCode, opts: DeviceBuildOptions): DeviceHandle {
  const model = modelFor(type);
  const d = devCtx(opts);
  const m = d.kit.mats;
  const [W, H, D] = model.bodyMm;
  const [sw, sh] = model.screen!.mm;
  const mg = model.margins!;
  const topY = sh / 2 + mg.top;
  const botY = -(sh / 2 + mg.bottom);
  const cy = (topY + botY) / 2;
  const radius = type === 'FLEX_1' ? 7 : 6;
  // main body (white front shell)
  put(d, rboxG(W, H, D, radius, 3), m.labwhite, { p: [0, cy, FRONT_Z - D / 2] });
  // back colour: Flex 1 dark-grey back, Flex 2 grey back band, Flex 4 textured grip band
  if (type === 'FLEX_1') put(d, rboxG(W - 1.5, H - 1.5, 3, radius - 1, 2), m.deviceGreyBack, { p: [0, cy, FRONT_Z - D + 1.2] });
  if (type === 'FLEX_2' || type === 'FLEX_4') put(d, rboxG(W - 1, 60, 1.6, 3, 2), type === 'FLEX_4' ? m.plasticGrey : m.deviceGreyBack, { p: [0, cy - 20, FRONT_Z - D - 0.2] });
  // printer bulge on the back of the top end
  let paper: DeviceHandle['anchors']['paper'] = null;
  let backZ = FRONT_Z - D;
  if (model.printerBulge) {
    const { thicknessMm: T, lenMm: L } = model.printerBulge;
    put(d, rboxG(W - 0.4, L, T, radius, 3), m.labwhite, { p: [0, topY - L / 2, FRONT_Z - T / 2] });
    // paper door seam + exit slot across the top of the bulge
    put(d, boxG(W - 14, 0.6, 0.4), m.darkPort, { p: [0, topY - L + 3, FRONT_Z - T - 0.1] }, true);
    put(d, boxG(60, 1.6, 0.6), m.darkPort, { p: [0, topY + 0.05, FRONT_Z - T * 0.55] }, true);
    paper = { pos: [0, topY + 0.3, FRONT_Z - T * 0.55], dir: [0, 1, 0], normal: [0, 0, 1] };
    backZ = FRONT_Z - T;
  }
  const scr = screenStack(d, 'primary', sw, sh, [0, 0, 0], {}, 1.4, model.primaryScreen?.logicalMm);
  // bezel details: logo on the bottom bezel, front camera (Flex 4), sensor slit
  const logo = d.opts.logo ?? model.logo;
  if (logo !== 'none') {
    const lr = logoRect(d.kit, logo === 'leaf' ? 'leaf' : 'wordmark', '#8b8f93');
    if (logo === 'leaf') decal(d, lr, 7, 7, { p: [0, botY + mg.bottom * 0.55, 0.05] });
    else decal(d, lr, 22, 6.6, { p: [0, botY + mg.bottom * 0.62, 0.05] });
  }
  sensorDot(d, [0, topY - mg.top * 0.45, 0.05], type === 'FLEX_4' ? 3 : 2);
  if (type === 'FLEX_4') sensorDot(d, [10, topY - mg.top * 0.45, 0.05], 1.6);
  // label tape and serial sticker on the bottom bezel (VID: `FLEX 3`)
  const tapeText = d.opts.tape;
  if (tapeText) {
    const t = tapeLabel(d.kit, tapeText, 3.2);
    tapeQuad(d, t.rect, t.w, t.h, { p: [W / 2 - t.w / 2 - 4, botY + mg.bottom * 0.28, 0.06] });
  }
  if (d.opts.serial) decal2Serial(d, d.opts.serial, [-(W / 2) + 13, botY + mg.bottom * 0.25, 0.06]);
  // card features: chip slot on the bottom edge, swipe groove on the right side, power key
  chipSlot(d, [0, botY - 0.6, FRONT_Z - D / 2]);
  swipeGroove(d, [W / 2 + 0.15, cy - 10, FRONT_Z - D * 0.55], 80, 'y');
  const keyY = topY - (model.powerKeyFromTopMm ?? 40);
  powerKey(d, W / 2, keyY, FRONT_Z - D / 2);
  // USB-C on the bottom-left of the bottom edge
  put(d, rboxG(9, 1.2, 3.4, 0.6), m.darkPort, { p: [-W / 2 + 14, botY - 0.4, FRONT_Z - D / 2] }, true);
  const nfcY = sh / 2 - (sh - 25);
  return {
    type,
    screens: [scr],
    anchors: {
      chipSlot: [0, botY, FRONT_Z - D / 2],
      powerKey: [W / 2, keyY, FRONT_Z - D / 2],
      nfc: [0, nfcY, 0],
      paper,
      min: [-W / 2, botY, backZ],
      max: [W / 2, topY, 0],
    },
    // lying face-up on a surface: device +Z → up, device +Y → away from the viewer
    rest: placeMatrix({ p: [0, -backZ, cy], r: [-Math.PI / 2, 0, 0] }),
  };
}

function decal2Serial(d: DevCtx, serial: string, at: [number, number, number]): void {
  const r = serialRect(d.kit, serial);
  tapeQuad(d, r, 16, 4, { p: at });
}

/**
 * LabSim Compact (CA): countertop wedge 90 × 185 × 58, front edge 30, white top with a dark-grey
 * base. Face tilt from the wedge geometry; the `CA` sticker sits on the bottom bezel.
 */
export function buildCompact(opts: DeviceBuildOptions): DeviceHandle {
  const type: DeviceTypeCode = 'COMPACT';
  const model = modelFor(type);
  const d = devCtx(opts);
  const m = d.kit.mats;
  const [W, L, Dp] = model.bodyMm; // width, face length, depth (rear height)
  const [sw, sh] = model.screen!.mm;
  const mg = model.margins!;
  const front = model.wedgeFrontMm ?? 30;
  // face length L along the slope rising from `front` to `Dp`
  const alpha = Math.asin(Math.min(0.95, (Dp - front) / L));
  const cosA = Math.cos(alpha);
  const sinA = Math.sin(alpha);
  // counter coords (u toward the rear, v up). Face bottom P0 at (0, front); face top at P0 + L·dir.
  const P0: [number, number] = [0, front];
  const depthU = L * cosA;
  const ysc = mg.bottom + sh / 2; // screen centre measured from the face bottom along the slope
  const O: [number, number] = [P0[0] + ysc * cosA, P0[1] + ysc * sinA];
  const toFace = (u: number, v: number): [number, number] => {
    const du = u - O[0];
    const dv = v - O[1];
    return [du * cosA + dv * sinA, -du * sinA + dv * cosA]; // (y, z)
  };
  const cap = d.opts.maxBodyDepthMm ?? Infinity;
  const profileUV: [number, number][] = [
    [0, 0],
    [depthU, 0],
    [depthU, Dp],
    [0, front],
  ];
  // top (white) shell = the full wedge; base (dark grey) = a 12 mm plinth under it
  const pts = profileUV.map(([u, v]) => toFace(u, v)).map(([y, z]) => [Math.max(z, -cap) + FRONT_Z, y] as [number, number]);
  put(d, sideProfileG(pts, W), m.labwhite);
  const plinth = ([
    [2, 0],
    [depthU - 2, 0],
    [depthU - 2, 12],
    [2, 12],
  ] as [number, number][]).map(([u, v]) => toFace(u, v)).map(([y, z]) => [Math.max(z, -cap) + FRONT_Z - 0.2, y] as [number, number]);
  put(d, sideProfileG(plinth, W + 1), m.deviceGreyBack);
  const scr = screenStack(d, 'primary', sw, sh, [0, 0, 0], {}, 1.4, model.primaryScreen?.logicalMm);
  const botY = -ysc;
  const topY = L - ysc;
  const lr = logoRect(d.kit, 'wordmark', '#8b8f93');
  decal(d, lr, 22, 6.6, { p: [0, botY + mg.bottom * 0.6, 0.05] });
  // `CA` country sticker (illustrative)
  const ca = tapeLabel(d.kit, 'CA', 2.6, { bg: '#d52b1e', fg: '#ffffff' });
  tapeQuad(d, ca.rect, ca.w, ca.h, { p: [-W / 2 + 10, botY + mg.bottom * 0.3, 0.06] });
  if (d.opts.tape) {
    const t = tapeLabel(d.kit, d.opts.tape, 3.2);
    tapeQuad(d, t.rect, t.w, t.h, { p: [W / 2 - t.w / 2 - 4, botY + mg.bottom * 0.28, 0.06] });
  }
  if (d.opts.serial) decal2Serial(d, d.opts.serial, [0, botY + mg.bottom * 0.28, 0.06]);
  sensorDot(d, [0, topY - mg.top * 0.5, 0.05], 2);
  chipSlot(d, [0, botY - 0.6, FRONT_Z - front * 0.45]);
  const keyY = topY - (model.powerKeyFromTopMm ?? 40);
  powerKey(d, W / 2, keyY, FRONT_Z - 12);
  // printer paper slot across the rear top
  const rearTop = toFace(depthU - 8, Dp);
  put(d, boxG(60, 1.6, 0.6), m.darkPort, { p: [0, rearTop[0] + 0.5, rearTop[1] + FRONT_Z - 0.2] }, true);
  const rest = new Matrix4().copy(placeMatrix({ p: [0, O[1], -(O[0] - depthU / 2)], r: [alpha - 90 * DEG, 0, 0] }));
  return {
    type,
    screens: [scr],
    anchors: {
      chipSlot: [0, botY, FRONT_Z - front * 0.45],
      powerKey: [W / 2, keyY, FRONT_Z - 12],
      nfc: [0, sh / 2 - (sh - 25), 0],
      paper: { pos: [0, rearTop[0] + 0.5, rearTop[1] + FRONT_Z], dir: [0, 1, 0], normal: [0, 0, 1] },
      min: [-W / 2, botY, -Math.min(cap, Dp)],
      max: [W / 2, topY, 0],
    },
    rest,
  };
}
