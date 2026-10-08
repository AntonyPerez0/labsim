/**
 * LabSim device models for the lab's own props (device library §3.2, coworker desk devices §1.4).
 * The rig builder owns the devices inside rigs; these follow the same §3.1 dimensions and §3.3
 * construction recipe (white body, bezel, screen stack, logo, card features, printer) but are
 * modelled upright/on stands for display. Origin = base centre on the shelf/desk, front = +Z.
 */
import type { Material, BufferGeometry } from 'three';
import type { DeviceTypeCode } from '@/sim/types';
import { DEVICE_MODELS } from '../../layout';
import { xf, type StaticBatch } from '../kit/batch';
import { boxGeo, cylGeo, planeGeo, profileGeo, rboxGeo } from '../kit/shapes';
import { addPrint, type LabCtx } from '../kit/context';
import { drawLabMark, drawLabWordmark, drawPlate } from '../kit/draw';

const mm = (v: number) => v / 1000;

export interface LitScreen {
  /** Geometry factory for the active area (w × h metres, facing +Z). */
  geo: (w: number, h: number) => BufferGeometry;
  mat: Material;
}

function logo(ctx: LabCtx, b: StaticBatch, variant: 'wordmark' | 'leaf', wM: number, onDark: boolean, m: ReturnType<typeof xf>): void {
  const col = onDark ? '#e8e8e8' : '#8b8f93';
  const bg = onDark ? '#06080a' : '#ecebe5';
  if (variant === 'wordmark') {
    addPrint(ctx.labels, b, wM, wM * 0.3, 240, 72, (g, w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      drawLabWordmark(g, w * 0.04, h / 2, h * 0.62, col);
    }, m);
  } else {
    addPrint(ctx.labels, b, wM, wM, 64, 64, (g, w, h) => {
      g.fillStyle = bg;
      g.fillRect(0, 0, w, h);
      drawLabMark(g, w / 2, h / 2, w * 0.8, col);
    }, m);
  }
}

/** Screen stack: lit canvas or dark glass, inset in a bezel opening. */
function screen(ctx: LabCtx, b: StaticBatch, wM: number, hM: number, lit: LitScreen | null, m: ReturnType<typeof xf>): void {
  if (lit) b.add(lit.geo(wM, hM), lit.mat, m, 'none');
  else b.add(planeGeo(wM, hM), ctx.mats.screenGlass, m, 'none');
}

/** Handheld (Flex family / Pocket) standing in a printed stand, tilted back 14°. */
function handheld(ctx: LabCtx, b: StaticBatch, type: DeviceTypeCode, lit: LitScreen | null, stand: 'stand' | 'dock'): void {
  const { mats } = ctx;
  const d = DEVICE_MODELS[type];
  const [W, H, D] = d.bodyMm.map(mm) as [number, number, number];
  const tilt = -0.24;
  if (stand === 'stand') {
    // printed stand: base plate + back rest + front lip (black PLA)
    b.add(profileGeo([[0.04, 0], [0.04, 0.02], [0.02, 0.022], [-0.035, 0.07], [-0.05, 0.07], [-0.05, 0]], W + 0.016, 0.002), mats.blackPla);
  } else {
    // white charging dock 110 × 90 × 50 with pogo pins
    b.add(rboxGeo(0.11, 0.05, 0.09, 0.012, 2), mats.labwhite, xf(0, 0.025, 0));
    b.add(boxGeo(W + 0.004, 0.03, D + 0.006), mats.darkGreyPlastic, xf(0, 0.045, -0.005), 'none');
  }
  const baseY = stand === 'stand' ? 0.012 : 0.035;
  b.within(xf(0, baseY, -0.005, tilt, 0, 0), () => {
    // body (white front shell)
    b.add(rboxGeo(W, H, D, mm(6), 2), mats.labwhite, xf(0, H / 2, 0));
    // back plate (grey on Flex 1/2/4)
    const back = type === 'FLEX_1' || type === 'FLEX_2' || type === 'FLEX_4' ? mats.deviceGreyBack : mats.labwhite;
    b.add(rboxGeo(W - mm(4), H - mm(30), mm(2), mm(4), 1), back, xf(0, H / 2 - mm(10), -D / 2 - mm(0.6)), 'none');
    if (d.printerBulge) {
      const pt = mm(d.printerBulge.thicknessMm);
      const pl = mm(d.printerBulge.lenMm);
      b.add(rboxGeo(W, pl, pt, mm(8), 2), mats.labwhite, xf(0, H - pl / 2, D / 2 - pt / 2));
      b.box(W - mm(14), mm(1.5), mm(4), mats.darkGreyPlastic, 0, H - mm(2), D / 2 - pt / 2, 0, 'none'); // paper slot
    }
    // front bezel + screen
    const s = d.screen!;
    const mg = d.margins!;
    const sw = mm(s.mm[0]);
    const sh = mm(s.mm[1]);
    const cy = mm(mg.bottom) + sh / 2;
    b.add(rboxGeo(W - mm(2), H - mm(2), mm(0.6), mm(5), 1), mats.labwhite, xf(0, H / 2, D / 2 + mm(0.3)), 'none');
    b.box(sw + mm(1.5), sh + mm(1.5), mm(0.4), mats.screenGlass, 0, cy, D / 2 + mm(0.6), 0, 'none');
    screen(ctx, b, sw, sh, lit, xf(0, cy, D / 2 + mm(0.85)));
    logo(ctx, b, 'wordmark', mm(30), false, xf(0, mm(mg.bottom) * 0.45, D / 2 + mm(0.7)));
    // chip slot at the bottom end + power key on the right edge
    b.box(mm(64), mm(2), mm(4), mats.blackPlastic, 0, mm(1), D / 2 - mm(8), 0, 'none');
    if (d.powerKeyFromTopMm) b.add(rboxGeo(mm(2), mm(14), mm(6), mm(0.9), 1), mats.midGreyPlastic, xf(W / 2 + mm(0.6), H - mm(d.powerKeyFromTopMm), 0), 'none');
    if (type === 'FLEX_4') b.add(cylGeo(mm(1.6), mm(1.6), mm(0.4), 10), mats.blackPlastic, xf(0, H - mm(14), D / 2 + mm(0.75), Math.PI / 2, 0, 0), 'none');
  });
}

/** Countertop wedge (Mini family / Compact) with the face on the slope. */
function wedge(ctx: LabCtx, b: StaticBatch, type: DeviceTypeCode, lit: LitScreen | null): void {
  const { mats } = ctx;
  const d = DEVICE_MODELS[type];
  const W = mm(d.bodyMm[0]);
  const Hr = mm(d.bodyMm[1]);
  const Dp = mm(d.bodyMm[2]);
  const Hf = mm(d.wedgeFrontMm ?? 35);
  const compact = type === 'COMPACT';
  // body profile (z forward): front low edge, rear tall edge
  b.add(profileGeo([[Dp / 2, 0], [Dp / 2, Hf], [-Dp / 2 + mm(10), Hr], [-Dp / 2, Hr - mm(8)], [-Dp / 2, 0]], W, mm(3)), compact ? mats.labwhite : mats.labwhite);
  if (compact) b.box(W + mm(2), mm(14), Dp + mm(2), mats.deviceGreyBack, 0, mm(7), 0, 0, 'none');
  b.box(W - mm(10), mm(4), Dp - mm(10), mats.rubberTip, 0, mm(1), 0, 0, 'none');
  // face plane on the slope
  const slope = Math.atan2(Hr - Hf, Dp - mm(10));
  const faceLen = Math.hypot(Hr - Hf, Dp - mm(10));
  const s = d.screen!;
  const mg = d.margins!;
  const sw = mm(s.mm[0]);
  const sh = mm(s.mm[1]);
  b.within(xf(0, (Hf + Hr) / 2 + mm(3.5), mm(5), -(Math.PI / 2 - slope), 0, 0), () => {
    // local: plane facing +Z along the slope; +Y up the slope
    const faceH = Math.min(faceLen, mm(158));
    b.add(rboxGeo(W - mm(2), faceH, mm(1.2), mm(6), 1), mats.labwhite, xf(0, 0, 0), 'none');
    const cy = (mm(mg.bottom) - mm(mg.top)) / 2 * (faceH / mm(158));
    b.box(sw + mm(1.5), sh + mm(1.5), mm(0.4), mats.screenGlass, 0, cy, mm(0.7), 0, 'none');
    screen(ctx, b, sw, sh, lit, xf(0, cy, mm(1.0)));
    if (d.logo === 'wordmark') logo(ctx, b, 'wordmark', mm(34), false, xf(-W / 2 + mm(30), -faceH / 2 + mm(9), mm(0.8)));
    else logo(ctx, b, 'leaf', mm(9), false, xf(-W / 2 + mm(14), -faceH / 2 + mm(9), mm(0.8)));
    // chip slot light pipe (green arrows) at the bottom edge
    b.box(mm(60), mm(5), mm(1), mats.blackPlastic, 0, -faceH / 2 + mm(6), mm(0.9), 0, 'none');
  });
  if (d.hasPrinter && !compact) b.box(W - mm(30), mm(1.5), mm(60), mats.darkGreyPlastic, 0, Hr + mm(0.3), -Dp / 2 + mm(40), 0, 'none');
}

/** Station-family head on a stand + base (Station 2018, Station 2, Duo, Duo 2). */
function station(ctx: LabCtx, b: StaticBatch, type: DeviceTypeCode, lit: LitScreen | null): void {
  const { mats } = ctx;
  const d = DEVICE_MODELS[type];
  const [hw, hh, hd] = d.bodyMm.map(mm) as [number, number, number];
  const base = (d.baseMm ?? [330, 105, 230]).map(mm) as [number, number, number];
  // base with paper door + green leaf
  b.add(rboxGeo(base[0], base[1], base[2], mm(14), 3), mats.labwhite, xf(0, base[1] / 2, 0));
  if (d.hasPrinter) {
    b.box(base[0] * 0.55, mm(1.5), base[2] * 0.5, mats.offWhitePlastic, 0, base[1] + mm(0.3), -base[2] * 0.15, 0, 'none');
    logo(ctx, b, 'leaf', mm(18), false, xf(0, base[1] * 0.55, base[2] / 2 + mm(0.4)));
  }
  // hinge arm (silver) + head
  const headY = base[1] + mm(type === 'STATION_2' ? 90 : 135);
  b.add(rboxGeo(mm(60), headY - base[1], mm(26), mm(8), 2), mats.lightGreyMetal, xf(0, base[1] + (headY - base[1]) / 2, -base[2] * 0.12));
  const blackGlass = d.bezelColor === 'black-glass';
  b.within(xf(0, headY, -base[2] * 0.08, -0.26, 0, 0), () => {
    b.add(rboxGeo(hw, hh, hd, mm(10), 2), mats.labwhite, xf(0, 0, -hd / 2));
    b.add(rboxGeo(hw - mm(1), hh - mm(1), mm(1), mm(9), 1), blackGlass ? mats.screenGlass : mats.labwhite, xf(0, 0, mm(0.4)), 'none');
    const s = d.screen!;
    const mg = d.margins!;
    const sw = mm(s.mm[0]);
    const sh = mm(s.mm[1]);
    const cy = (mm(mg.bottom) - mm(mg.top)) / 2;
    if (!blackGlass) b.box(sw + mm(1.5), sh + mm(1.5), mm(0.4), mats.screenGlass, 0, cy, mm(1.0), 0, 'none');
    screen(ctx, b, sw, sh, lit, xf(0, cy, mm(1.3)));
    logo(ctx, b, blackGlass ? 'leaf' : 'wordmark', mm(blackGlass ? 12 : 34), blackGlass, xf(blackGlass ? 0 : -hw / 2 + mm(30), -hh / 2 + mm(12), mm(1.1)));
    if (d.cfdHeadMm) {
      // CFD on the back of the stand, facing −Z
      const [cw, ch, cd] = d.cfdHeadMm.map(mm) as [number, number, number];
      b.add(rboxGeo(cw, ch, cd, mm(8), 2), mats.labwhite, xf(0, -mm(20), -hd - cd / 2 - mm(8)));
      const sec = d.secondary!;
      b.add(planeGeo(mm(sec.mm[0]), mm(sec.mm[1])), mats.screenGlass, xf(0, -mm(20), -hd - cd - mm(8.5), 0, Math.PI, 0), 'none');
    }
  });
}

/** Sealed "UPCOMING" box (Station Duo 3 / Mini 4): white box with a green band + label. */
function sealedBox(ctx: LabCtx, b: StaticBatch, type: DeviceTypeCode, label: string): void {
  const { mats } = ctx;
  const [w, h, d] = DEVICE_MODELS[type].bodyMm.map(mm) as [number, number, number];
  b.add(rboxGeo(w, h, d, mm(3), 1), mats.whiteEnamel, xf(0, h / 2, 0));
  b.box(w + mm(1), mm(40), d + mm(1), mats.greenPaint, 0, h * 0.62, 0, 0, 'none');
  addPrint(ctx.labels, b, w * 0.8, h * 0.22, 480, 132, (g, ww, hh) => drawPlate(g, ww, hh, label, { bg: '#ffffff', fg: '#1f2328' }), xf(0, h * 0.3, d / 2 + mm(0.6)));
  logo(ctx, b, 'wordmark', w * 0.4, false, xf(0, h * 0.82, d / 2 + mm(0.6)));
}

/** Build any device type for display (library, desks). */
export function displayDevice(ctx: LabCtx, b: StaticBatch, type: DeviceTypeCode, opts: { lit?: LitScreen | null; holder?: 'stand' | 'dock'; sealedLabel?: string } = {}): void {
  const d = DEVICE_MODELS[type];
  if (d.sealedBox) return sealedBox(ctx, b, type, opts.sealedLabel ?? d.displayName.toUpperCase());
  if (type.startsWith('FLEX')) return handheld(ctx, b, type, opts.lit ?? null, opts.holder ?? 'stand');
  if (type.startsWith('MINI') || type === 'COMPACT') return wedge(ctx, b, type, opts.lit ?? null);
  return station(ctx, b, type, opts.lit ?? null);
}

/** Screen active-area centre and normal in the device's local frame (for focus poses). */
export function deviceFaceLocal(type: DeviceTypeCode, holder: 'stand' | 'dock' = 'stand'): { centre: [number, number, number]; normal: [number, number, number] } {
  const d = DEVICE_MODELS[type];
  if (type.startsWith('FLEX')) {
    const D = mm(d.bodyMm[2]);
    const a = -0.24; // same tilt as handheld()
    const baseY = holder === 'stand' ? 0.012 : 0.035;
    const cy = mm(d.margins!.bottom) + mm(d.screen!.mm[1]) / 2;
    const zf = D / 2 + mm(0.85);
    return {
      centre: [0, baseY + cy * Math.cos(a) - zf * Math.sin(a), -0.005 + cy * Math.sin(a) + zf * Math.cos(a)],
      normal: [0, -Math.sin(a), Math.cos(a)],
    };
  }
  if (type.startsWith('MINI') || type === 'COMPACT') {
    const Hr = mm(d.bodyMm[1]);
    const Hf = mm(d.wedgeFrontMm ?? 35);
    return { centre: [0, (Hf + Hr) / 2 + 0.004, 0.006], normal: [0, 0.88, 0.47] };
  }
  const base = (d.baseMm ?? [330, 105, 230]).map(mm) as [number, number, number];
  const headY = base[1] + mm(type === 'STATION_2' ? 90 : 135);
  return { centre: [0, headY, -base[2] * 0.08 + 0.002], normal: [0, 0.26, 0.97] };
}
