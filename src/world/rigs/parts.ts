/**
 * Reusable rig hardware (World §2.8, §2.12–§2.14, §3.4): a frame-relative builder `B` plus the
 * Raspberry Pi case, inline ATO fuse holder, AC brick, gooseneck webcam, commercial AC strip,
 * LabSim connectivity hub, SmartStripe dongle, Collis probe, Minix / NUC boxes and cable tubes.
 * Everything static goes into the kit's world-space batches (merged per material).
 */
import { Matrix4, Mesh, MeshStandardMaterial, Vector3, type BufferGeometry, type Material } from 'three';
import { FUSE_COLORS } from '../layout';
import type { RigKit } from './kit/context';
import type { MeshBatch } from './kit/batch';
import { atlasRect, tapeLabel } from '../devices/common';
import { paintRaisedText, type AtlasRect, type TapeStyle } from './kit/atlas';
import { MM, boxG, cylG, placeMatrix, planeUvG, rboxG, tubeG, type Place } from './kit/geom';
import type { LedHandle } from './kit/instances';
import { fuseBlade } from './kit/textures';

export type V3 = [number, number, number];

/** Frame-relative builder: placements in mm inside `frame` (a world matrix). */
export class B {
  constructor(
    readonly kit: RigKit,
    readonly frame: Matrix4,
    readonly batch: MeshBatch = kit.stat,
    readonly detail: MeshBatch = kit.statNoShadow,
  ) {}

  get m() {
    return this.kit.mats;
  }

  /** World matrix of a local placement. */
  mat(place: Place = {}): Matrix4 {
    return this.frame.clone().multiply(placeMatrix(place));
  }

  /** A child builder whose frame is a local placement. */
  sub(place: Place, batch: MeshBatch = this.batch, detail: MeshBatch = this.detail): B {
    return new B(this.kit, this.mat(place), batch, detail);
  }

  add(g: BufferGeometry, mat: Material, place: Place = {}, detail = false): this {
    (detail ? this.detail : this.batch).add(g, mat, this.mat(place));
    return this;
  }

  /** Box w × h × d (mm) centred at p; rounded when r > 0. */
  box(mat: Material, w: number, h: number, d: number, p: V3, r = 0, rot?: V3, detail = false): this {
    return this.add(r > 0 ? rboxG(w, h, d, r, r >= 5 ? 2 : 1) : boxG(w, h, d), mat, { p, r: rot ?? [0, 0, 0] }, detail);
  }

  /** Box from min/max corners (mm). */
  span(mat: Material, a: V3, b: V3, r = 0, detail = false): this {
    const w = Math.abs(b[0] - a[0]);
    const h = Math.abs(b[1] - a[1]);
    const d = Math.abs(b[2] - a[2]);
    return this.box(mat, w, h, d, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r, undefined, detail);
  }

  cyl(mat: Material, dMm: number, hMm: number, p: V3, rot: V3 = [0, 0, 0], seg = 16, detail = false): this {
    return this.add(cylG(dMm, hMm, seg), mat, { p, r: rot }, detail);
  }

  /** Cable through local points (mm). Radial segments follow the quality (≥ 5). */
  tube(mat: Material, pts: V3[], dMm: number, radial = 6, detail = true): this {
    if (pts.length < 2) return this;
    return this.add(tubeG(pts, dMm, Math.min(radial, dMm > 10 ? 8 : dMm > 4 ? 6 : 4), 4), mat, {}, detail);
  }

  /** Label-maker tape (auto width) facing local +Z at p; returns its size (mm). */
  tape(text: string, capMm: number, place: Place, style: TapeStyle = {}, align: 'center' | 'left' | 'right' = 'center'): { w: number; h: number } {
    const t = tapeLabel(this.kit, text, capMm, style);
    const p = place.p ?? [0, 0, 0];
    const dx = align === 'left' ? t.w / 2 : align === 'right' ? -t.w / 2 : 0;
    const pl: Place = { ...place, p: [p[0] + dx, p[1], p[2]] };
    this.detail.add(planeUvG(t.w, t.h, [t.rect.u0, t.rect.v0, t.rect.u1, t.rect.v1]), this.kit.tape.material, this.mat(pl));
    return { w: t.w, h: t.h };
  }

  /** Decal quad (decal atlas) facing local +Z. */
  decal(rect: AtlasRect, w: number, h: number, place: Place): this {
    this.detail.add(planeUvG(w, h, [rect.u0, rect.v0, rect.u1, rect.v1]), this.kit.decal.material, this.mat(place));
    return this;
  }

  /** Raised-text decal (PLA lettering, silkscreen). */
  text(text: string, color: string, w: number, h: number, place: Place, opts: Parameters<typeof paintRaisedText>[2] = {}): this {
    const rect = atlasRect(this.kit.decal, `txt:${text}:${color}:${w}:${h}:${opts.vertical ? 'v' : 'h'}`, Math.max(16, w * 8), Math.max(16, h * 8), paintRaisedText(text, color, opts));
    return this.decal(rect, w, h, place);
  }

  /** M5 button-head screw; the dome faces local +Y of `rot` (default faces +Z). */
  screw(p: V3, rot: V3 = [Math.PI / 2, 0, 0], chrome = false, scale = 1): this {
    (chrome ? this.kit.screwsChrome : this.kit.screwsBlack).add(this.mat({ p, r: rot, s: [scale, scale, scale] }));
    return this;
  }

  /** Indicator LED lens (diameter mm) facing local +Z. */
  led(p: V3, dMm: number, hex: string, intensity = 7, rot: V3 = [0, 0, 0], offHex?: string): LedHandle {
    return this.kit.leds.add(null, this.mat({ p, r: rot, s: [dMm, dMm, dMm] }), hex, intensity, offHex);
  }

  point(p: V3): Vector3 {
    return new Vector3(p[0] * MM, p[1] * MM, p[2] * MM).applyMatrix4(this.frame);
  }
}

/* ───────────────────────────── Raspberry Pi (§2.8) ───────────────────────────── */

export interface PiHandles {
  pwr: LedHandle;
  act: LedHandle;
  link: LedHandle;
  speed: LedHandle;
  /** Local (to the Pi placement) RJ45 jack mouth and USB-C input. */
  jack: V3;
  usbc: V3;
}

/**
 * Black 2-part Pi case 94 × 63 × 30 (local: x along 94, z along 63, y up), vent slots, two USB-A
 * stacks + RJ45 on the +X end, USB-C and micro-HDMI on the −Z side, light pipes PWR (red) / ACT
 * (green) on the RJ45 end, jack LEDs (green link/act, amber speed).
 */
export function buildPi(b: B, upright = false): PiHandles {
  const m = b.m;
  const s = upright ? b.sub({ p: [0, 47, 0], r: [0, 0, Math.PI / 2] }) : b;
  s.box(m.blackPla, 94, 13, 63, [0, 6.5, 0], 2.5);
  s.box(m.minixBlack, 94, 16, 63, [0, 21.5, 0], 3);
  // vent slots on the lid
  for (let i = 0; i < 9; i++) s.box(m.darkPort, 2, 0.6, 30, [-30 + i * 6, 29.8, 6], 0, undefined, true);
  // green PCB edge visible at the split line (IMG-R)
  s.box(m.pcbGreen, 92, 1.6, 61, [0, 13.6, 0], 0, undefined, true);
  // +X end: two USB-A stacks + RJ45
  for (const z of [-22, -4]) {
    s.box(m.steelSatin, 1.5, 15, 13.5, [47.2, 12, z], 0, undefined, true);
    s.box(m.usbBlue, 0.6, 2, 9, [47.9, 9, z], 0, undefined, true);
    s.box(m.usbBlue, 0.6, 2, 9, [47.9, 16, z], 0, undefined, true);
  }
  s.box(m.steelSatin, 1.5, 13.5, 16, [47.2, 11, 18], 0, undefined, true);
  s.box(m.darkPort, 0.6, 10, 12, [48, 10, 18], 0, undefined, true);
  // −Z side: USB-C + micro-HDMI ×2
  s.box(m.steelSatin, 9, 3.4, 1.2, [-30, 8, -31.8], 1, undefined, true);
  s.box(m.steelSatin, 7, 3.2, 1.2, [-14, 8, -31.8], 0.6, undefined, true);
  s.box(m.steelSatin, 7, 3.2, 1.2, [0, 8, -31.8], 0.6, undefined, true);
  const pwr = s.led([47.6, 25, -26], 2.6, '#ff2614', 7, [0, Math.PI / 2, 0]);
  const act = s.led([47.6, 25, -20], 2.6, '#2bff6a', 7, [0, Math.PI / 2, 0]);
  const link = s.led([48.1, 14.5, 13], 1.6, '#2bff6a', 6, [0, Math.PI / 2, 0]);
  const speed = s.led([48.1, 14.5, 23], 1.6, '#ffa516', 6, [0, Math.PI / 2, 0]);
  return upright ? { pwr, act, link, speed, jack: [-11, 95, 18], usbc: [-8, 17, -32] } : { pwr, act, link, speed, jack: [49, 11, 18], usbc: [-30, 8, -33] };
}

/* ───────────────────────────── Inline ATO fuse holder (§2.8, D3) ───────────────────────────── */

export interface FuseHandles {
  blade: Mesh;
  setState(state: { blown: boolean; removed: boolean; ratingA: number }): void;
}

const FUSE_BLADE_GEO = rboxG(19, 18, 5, 1, 1);
const FUSE_CAP_GEO = rboxG(30, 24, 20, 3, 2);

/** Black inline holder 55 × 22 × 18 with a smoked cap over a coloured blade; tape label. */
export function buildFuseHolder(b: B, tapeText: string, rot: V3 = [0, 0, 0]): FuseHandles {
  const m = b.m;
  const s = b.sub({ r: rot });
  s.box(m.blackPla, 55, 18, 22, [0, 0, 0], 3);
  s.cyl(m.wire('red'), 3.5, 40, [-45, 0, 0], [0, 0, Math.PI / 2]);
  s.cyl(m.wire('red'), 3.5, 40, [45, 0, 0], [0, 0, Math.PI / 2]);
  s.tape(tapeText, 3.2, { p: [0, -3, 11.2] });
  const mat = new MeshStandardMaterial({ map: fuseBlade(FUSE_COLORS['10'] ?? '#d0211c', '10', false), roughness: 0.4, transparent: true, opacity: 0.95 });
  const blade = new Mesh(FUSE_BLADE_GEO, mat);
  s.mat({ p: [0, 13, 0] }).decompose(blade.position, blade.quaternion, blade.scale);
  s.add(FUSE_CAP_GEO, m.smokedPlastic, { p: [0, 14, 0] }, true);
  b.kit.root.add(blade);
  let key = '';
  return {
    blade,
    setState({ blown, removed, ratingA }) {
      const k = `${blown}:${removed}:${ratingA}`;
      if (k === key) return;
      key = k;
      blade.visible = !removed;
      const color = FUSE_COLORS[String(ratingA)] ?? '#d0211c';
      mat.map = fuseBlade(color, String(ratingA), blown);
      mat.needsUpdate = true;
    },
  };
}

/* ───────────────────────────── AC brick, webcam ───────────────────────────── */

/** 18 V AC brick 110 × 60 × 32 lying on a surface (local x along 110). */
export function buildAcBrick(b: B, white: boolean): void {
  const mat = white ? b.m.labwhite : b.m.minixBlack;
  b.box(mat, 110, 32, 60, [0, 16, 0], 6);
  b.text('18V⎓', white ? '#c9cac4' : '#3a3a3c', 22, 7, { p: [0, 32.1, 0], r: [-Math.PI / 2, 0, 0] }, { shadow: 'rgba(0,0,0,0.15)' });
}

export interface WebcamHandles {
  led: LedHandle;
  /** World position and aim direction of the lens (for virtual cameras). */
  lensWorld: Vector3;
  aimWorld: Vector3;
}

/**
 * Black webcam 72 × 31 × 30 (glossy front, Ø 12 lens, white activity LED) on a Ø 8 gooseneck from
 * `clamp` to `cam`, aimed at `target` (all local mm).
 */
export function buildWebcam(b: B, clamp: V3, cam: V3, target: V3): WebcamHandles {
  const m = b.m;
  b.box(m.blackPla, 24, 18, 20, clamp, 3);
  const mid: V3 = [(clamp[0] + cam[0]) / 2, Math.max(clamp[1], cam[1]) + 35, (clamp[2] + cam[2]) / 2];
  const dir = new Vector3(target[0] - cam[0], target[1] - cam[1], target[2] - cam[2]).normalize();
  const back: V3 = [cam[0] - dir.x * 30, cam[1] - dir.y * 30 + 6, cam[2] - dir.z * 30];
  b.tube(m.cable('cableBlack'), [clamp, mid, back], 8, 8, false);
  // camera body oriented so its local +Z looks at the target
  const look = new Matrix4().lookAt(new Vector3(0, 0, 0), dir.clone().negate(), new Vector3(0, 1, 0));
  const rot = new Matrix4().extractRotation(look);
  const at = b.frame.clone().multiply(placeMatrix({ p: cam })).multiply(rot);
  const s = new B(b.kit, at, b.batch, b.detail);
  s.box(m.minixBlack, 72, 31, 30, [0, 0, 0], 6);
  s.box(m.bezelBlack, 66, 25, 1, [0, 0, 15.2], 4);
  s.cyl(m.screenGlass, 12, 2, [0, 0, 16], [Math.PI / 2, 0, 0], 20);
  s.cyl(m.steelSatin, 15, 1.2, [0, 0, 15.6], [Math.PI / 2, 0, 0], 20);
  const led = s.led([22, 0, 15.8], 2, '#ffffff', 5);
  // USB lead from the camera back down the gooseneck
  b.tube(m.cable('cableBlack'), [back, [clamp[0], clamp[1] - 10, clamp[2] - 10], [clamp[0], clamp[1] - 120, clamp[2] - 30]], 3.5, 6);
  return { led, lensWorld: s.point([0, 0, 17]), aimWorld: b.point(target) };
}

/* ───────────────────────────── Commercial AC strip ───────────────────────────── */

export interface StripHandles {
  switchLed: LedHandle;
  /** Local socket centres (mm, on the socket face). */
  sockets: V3[];
}

/**
 * 6-outlet metal strip, local x = long axis, sockets on the local +Z face (rack strips) or the top
 * face (`top` true: strips lying on a shelf). Red illuminated rocker at the −X end; tape label.
 */
export function buildAcStrip(b: B, lenMm: number, hMm: number, dMm: number, tape: string, top: boolean): StripHandles {
  const m = b.m;
  b.box(m.steelSatin, lenMm, hMm, dMm, [0, 0, 0], 2);
  const sockets: V3[] = [];
  const n = 6;
  const pitch = (lenMm - 70) / n;
  for (let i = 0; i < n; i++) {
    const x = -lenMm / 2 + 55 + pitch * (i + 0.5);
    const p: V3 = top ? [x, hMm / 2 + 0.3, 0] : [x, 0, dMm / 2 + 0.3];
    const rot: V3 = top ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
    const face = b.sub({ p, r: rot });
    face.box(m.plasticGrey, Math.min(30, pitch - 4), Math.min(hMm - 8, dMm - 8, 34), 1.2, [0, 0, 0], 3);
    face.box(m.darkPort, 1.6, 6, 1, [-4, 2, 0.4], 0, undefined, true);
    face.box(m.darkPort, 1.6, 7, 1, [4, 2, 0.4], 0, undefined, true);
    face.box(m.darkPort, 3.2, 3.2, 1, [0, -6, 0.4], 1.4, undefined, true);
    sockets.push(p);
  }
  const swP: V3 = top ? [-lenMm / 2 + 22, hMm / 2 + 2, 0] : [-lenMm / 2 + 22, 0, dMm / 2 + 2];
  const swRot: V3 = top ? [-Math.PI / 2, 0, 0] : [0, 0, 0];
  b.add(rboxG(14, 22, 5, 1.5, 1), m.plasticGrey, { p: swP, r: swRot });
  const switchLed = b.kit.leds.add(null, b.mat({ p: [swP[0], swP[1] + (top ? 2.6 : 0), swP[2] + (top ? 0 : 2.6)], r: swRot, s: [11, 18, 3] }), '#ff2614', 4, '#3a0a08');
  const tp: V3 = top ? [lenMm / 2 - 60, hMm / 2 + 0.25, -dMm / 2 + 8] : [lenMm / 2 - 60, hMm / 2 - 8, dMm / 2 + 0.25];
  b.tape(tape, 4, { p: tp, r: top ? [-Math.PI / 2, 0, 0] : [0, 0, 0] });
  return { switchLed, sockets };
}

/* ───────────────────────────── LabSim connectivity hub (§3.4) ───────────────────────────── */

/**
 * White rounded box standing on its long edge: 40 W × 165 H × 120 D, port face (local +Z) from top:
 * RJ45 with link LED, printed icons, DC barrel, two stacked USB-A.
 */
export function buildHub(b: B): LedHandle {
  const m = b.m;
  b.box(m.labwhite, 40, 165, 120, [0, 82.5, 0], 8);
  b.box(m.darkPort, 15, 13, 2, [2, 140, 60.2], 1);
  const led = b.led([-12, 146, 60.6], 2, '#2bff6a', 6);
  b.cyl(m.darkPort, 8, 2, [2, 100, 60.4], [Math.PI / 2, 0, 0], 14);
  b.cyl(m.steelSatin, 3, 2.4, [2, 100, 60.6], [Math.PI / 2, 0, 0], 8);
  for (const y of [55, 35]) {
    b.box(m.steelSatin, 14, 6, 1.5, [2, y, 60.4], 0.5);
    b.box(m.darkPort, 12, 2.6, 1, [2, y, 61], 0, undefined, true);
  }
  // printed grey icons beside each port (ethernet / power / usb)
  for (const y of [140, 100, 45]) b.box(m.plasticGrey, 5, 5, 0.4, [-12, y, 60.3], 1, undefined, true);
  return led;
}

/* ───────────────────────────── Collis probe (§2.14) ───────────────────────────── */

export interface CollisHandles {
  led: LedHandle;
  /** Local rear-panel IDC header centre (the ribbon leaves from here toward local −Z). */
  ribbonOut: V3;
}

/** Light-grey aluminium box 150 W × 45 H × 110 D: front sticker, status LED, USB-B, DC in; rear IDC. */
export function buildCollis(b: B, hrn: string): CollisHandles {
  const m = b.m;
  b.box(m.collisGrey, 150, 45, 110, [0, 22.5, 0], 2.5);
  b.box(m.collisGrey, 154, 4, 114, [0, 2, 0], 1);
  b.tape('UL Transaction Security', 3.2, { p: [-25, 26, 55.3] }, { bg: '#fbfbf8', edges: false });
  const led = b.led([45, 30, 55.4], 3, '#2bff6a', 7);
  b.box(m.darkPort, 12, 11, 1.5, [60, 16, 55.4], 1);
  b.cyl(m.darkPort, 8, 2, [30, 14, 55.6], [Math.PI / 2, 0, 0], 14);
  b.box(m.minixBlack, 56, 10, 6, [0, 22, -57], 1);
  b.tape(`COLLIS · ${hrn}`, 4, { p: [0, 45.3, 10], r: [-Math.PI / 2, 0, 0] });
  return { led, ribbonOut: [0, 22, -60] };
}

/* ───────────────────────────── Windows boxes (§2.14) ───────────────────────────── */

export function buildMinix(b: B, label: string): LedHandle {
  const m = b.m;
  b.box(m.minixBlack, 120, 19, 120, [0, 9.5, 0], 6);
  b.box(m.darkPort, 7, 2.5, 1, [-40, 9, 60.3], 0.5);
  b.cyl(m.plasticGrey, 6, 1.4, [44, 9.5, 60.4], [Math.PI / 2, 0, 0], 12);
  b.tape(label, 4, { p: [0, 19.3, 30], r: [-Math.PI / 2, 0, 0] });
  return b.led([30, 9.5, 60.5], 2.2, '#2f6bff', 9.1);
}

export function buildNuc(b: B, label: string): LedHandle {
  const m = b.m;
  b.box(m.nucBody, 117, 45, 112, [0, 22.5, 0], 6);
  b.box(m.nucTop, 117, 6, 112, [0, 48, 0], 6);
  b.cyl(m.minixBlack, 9, 1.6, [42, 30, 56.4], [Math.PI / 2, 0, 0], 16);
  const led = b.kit.leds.add(null, b.mat({ p: [42, 30, 57], s: [11, 11, 1.4] }), '#2f6bff', 9.1);
  b.box(m.darkPort, 12, 6, 1, [-30, 28, 56.2], 1);
  b.tape(label, 4, { p: [-20, 51.2, 30], r: [-Math.PI / 2, 0, 0] });
  return led;
}
