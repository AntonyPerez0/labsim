/**
 * Office furniture and desk equipment (World §1.4 "Workstations"): desks (grey laminate, black
 * steel frame, modesty panel), black mesh office chairs, 24" monitors, keyboards with real keycaps,
 * mice + pads, PC tower, bins. Everything is modelled in the prop's local frame (front = local +Z)
 * and added to a `StaticBatch` (call inside `batch.at(...)`).
 */
import { CanvasTexture, MeshStandardMaterial, SRGBColorSpace, type BufferGeometry, type Material } from 'three';
import type { StaticBatch } from '../kit/batch';
import { xf } from '../kit/batch';
import { boxGeo, cylGeo, latheGeo, planeGeo, profileGeo, rboxGeo, sphereGeo, torusGeo } from '../kit/shapes';

const rad = (d: number) => (d * Math.PI) / 180;
import type { LabCtx } from '../kit/context';
import { FONT } from '../kit/draw';

/* ───────────────────────────── desk ───────────────────────────── */

export interface DeskOpts {
  w?: number;
  d?: number;
  topY?: number;
  top?: Material;
}

/** Office desk 1.60 × 0.75 × 0.74: laminate top with darker edge band, 4 steel legs, apron, modesty panel (local −Z). */
export function desk(ctx: LabCtx, b: StaticBatch, o: DeskOpts = {}): void {
  const { mats } = ctx;
  const w = o.w ?? 1.6;
  const d = o.d ?? 0.75;
  const top = o.topY ?? 0.74;
  const t = 0.025;
  b.add(rboxGeo(w, t, d, 0.003, 1), o.top ?? mats.laminateGrey, xf(0, top - t / 2, 0));
  // edge band (slightly darker, 2 mm proud)
  b.box(w + 0.002, t - 0.004, 0.002, mats.darkGreyPlastic, 0, top - t / 2, d / 2 + 0.0005, 0, 'none');
  const legY = (top - t) / 2;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      b.box(0.05, top - t, 0.05, mats.satinBlack, sx * (w / 2 - 0.06), legY, sz * (d / 2 - 0.06));
      b.add(cylGeo(0.022, 0.024, 0.012, 12), mats.rubberTip, xf(sx * (w / 2 - 0.06), 0.006, sz * (d / 2 - 0.06)), 'none');
    }
  // apron rails
  b.box(w - 0.1, 0.05, 0.025, mats.satinBlack, 0, top - t - 0.025, -(d / 2 - 0.06));
  b.box(0.025, 0.05, d - 0.12, mats.satinBlack, -(w / 2 - 0.06), top - t - 0.025, 0);
  b.box(0.025, 0.05, d - 0.12, mats.satinBlack, w / 2 - 0.06, top - t - 0.025, 0);
  // modesty panel (perforated look via dark steel)
  b.box(w - 0.16, 0.42, 0.012, mats.satinBlack, 0, top - t - 0.27, -(d / 2 - 0.08));
  // cable tray under the back edge
  b.box(w * 0.6, 0.06, 0.12, mats.satinBlack, 0, top - t - 0.09, -(d / 2 - 0.16), 0, 'none');
}

/* ───────────────────────────── chair ───────────────────────────── */

/** Black mesh office chair, seat top 0.47, 5-star base; front = local +Z. */
export function officeChair(ctx: LabCtx, b: StaticBatch, swivel = 0): void {
  const { mats } = ctx;
  // base
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const cx = Math.cos(a);
    const cz = Math.sin(a);
    b.add(rboxGeo(0.3, 0.03, 0.045, 0.01), mats.satinBlack, xf(cx * 0.16, 0.085, cz * 0.16, 0, -a, -0.08));
    // caster: fork + twin wheel
    b.add(boxGeo(0.02, 0.04, 0.03), mats.satinBlack, xf(cx * 0.31, 0.055, cz * 0.31, 0, -a, 0), 'none');
    b.add(cylGeo(0.025, 0.025, 0.04, 14), mats.blackPlastic, xf(cx * 0.31 + 0.01, 0.025, cz * 0.31, 0, -a, Math.PI / 2), 'none');
  }
  b.add(cylGeo(0.035, 0.045, 0.06, 16), mats.satinBlack, xf(0, 0.09, 0));
  b.within(xf(0, 0, 0, 0, swivel, 0), () => {
    b.add(cylGeo(0.014, 0.014, 0.2, 12), mats.chrome, xf(0, 0.2, 0));
    b.add(cylGeo(0.024, 0.026, 0.14, 14), mats.satinBlack, xf(0, 0.17, 0));
    // seat mechanism + seat
    b.add(boxGeo(0.2, 0.05, 0.24), mats.satinBlack, xf(0, 0.36, -0.01));
    b.add(rboxGeo(0.5, 0.075, 0.48, 0.03, 2), mats.meshFabric, xf(0, 0.432, 0.02));
    b.add(rboxGeo(0.51, 0.02, 0.49, 0.008, 2), mats.satinBlack, xf(0, 0.392, 0.02), 'none');
    // spine + back (mesh in a black frame), slight recline
    b.add(rboxGeo(0.06, 0.32, 0.03, 0.01), mats.satinBlack, xf(0, 0.53, -0.23, -0.15, 0, 0));
    b.within(xf(0, 0.86, -0.27, -0.16, 0, 0), () => {
      b.add(rboxGeo(0.47, 0.56, 0.03, 0.04, 2), mats.satinBlack);
      b.add(rboxGeo(0.43, 0.52, 0.012, 0.035, 2), mats.meshFabric, xf(0, 0, 0.012), 'none');
      b.add(rboxGeo(0.36, 0.06, 0.03, 0.015, 2), mats.satinBlack, xf(0, -0.12, 0.02), 'none'); // lumbar
    });
    // armrests
    for (const s of [-1, 1]) {
      b.add(rboxGeo(0.03, 0.22, 0.05, 0.008), mats.satinBlack, xf(s * 0.24, 0.53, -0.04));
      b.add(rboxGeo(0.07, 0.03, 0.25, 0.012), mats.blackPlastic, xf(s * 0.245, 0.655, 0.0));
      b.add(boxGeo(0.02, 0.03, 0.18), mats.satinBlack, xf(s * 0.21, 0.405, -0.04), 'none');
    }
  });
}

/* ───────────────────────────── monitor ───────────────────────────── */

export interface ScreenSpec {
  geo: (w: number, h: number) => BufferGeometry;
  mat: Material;
}

/**
 * 24" 16:9 monitor standing on a desk (origin = desk surface under the stand), screen centre at
 * `centreY` above the origin, front = local +Z. Returns the local screen-centre position.
 */
export function monitor24(ctx: LabCtx, b: StaticBatch, centreY: number, screen: ScreenSpec | null, opts: { ledIndexOut?: (pos: [number, number, number]) => void } = {}): [number, number, number] {
  const { mats } = ctx;
  const W = 0.545;
  const H = 0.325;
  const sz = 0.065; // housing front plane z (stand at the back)
  // base + neck
  b.add(rboxGeo(0.22, 0.014, 0.18, 0.006, 2), mats.satinBlack, xf(0, 0.007, 0));
  b.add(rboxGeo(0.05, centreY - 0.06, 0.022, 0.008, 2), mats.satinBlack, xf(0, (centreY - 0.06) / 2 + 0.01, -0.02, 0.06, 0, 0));
  b.add(rboxGeo(0.12, 0.12, 0.02, 0.01, 2), mats.satinBlack, xf(0, centreY - 0.02, sz - 0.04));
  // housing: thin panel + rear electronics bump
  b.add(rboxGeo(W, H, 0.014, 0.004, 2), mats.monitorBlack, xf(0, centreY, sz));
  b.add(rboxGeo(0.34, 0.2, 0.03, 0.02, 2), mats.monitorBlack, xf(0, centreY - 0.02, sz - 0.02));
  // slightly glossier chin with logo dot
  b.box(W - 0.01, 0.012, 0.002, mats.satinBlack, 0, centreY - H / 2 + 0.008, sz + 0.0072, 0, 'none');
  const aw = 0.531;
  const ah = 0.299;
  const sy = centreY + 0.004;
  if (screen) b.add(screen.geo(aw, ah), screen.mat, xf(0, sy, sz + 0.0072), 'none');
  else b.add(planeGeo(aw, ah), mats.screenGlass, xf(0, sy, sz + 0.0072), 'none');
  opts.ledIndexOut?.([W / 2 - 0.02, centreY - H / 2 + 0.006, sz + 0.0075]);
  return [0, sy, sz + 0.0072];
}

/* ───────────────────────────── keyboard & mouse ───────────────────────────── */

let legendMat: Material | null = null;

/** Transparent legend overlay (white glyphs) for the 104-key layout (§6.2 `keycaps`). */
function keyLegendMaterial(): Material {
  if (legendMat) return legendMat;
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 316;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  g.fillStyle = 'rgba(235,235,235,0.95)';
  g.textAlign = 'left';
  g.textBaseline = 'top';
  for (const k of keyLayout()) {
    const x = (k.x / 440) * 1024;
    const y = (k.z / 135) * 316;
    g.font = `${k.label.length > 2 ? 11 : 15}px ${FONT.UI_SANS}`;
    g.fillText(k.label, x + 5, y + 4);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  legendMat = new MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.3, roughness: 0.6, depthWrite: false });
  legendMat.name = 'lab.keyLegends';
  return legendMat;
}

interface KeyDef {
  x: number; // mm from the left
  z: number; // mm from the back
  w: number;
  label: string;
}

let layoutCache: KeyDef[] | null = null;
/** Simplified US 104-key layout in mm (19.05 mm pitch). */
function keyLayout(): KeyDef[] {
  if (layoutCache) return layoutCache;
  const u = 19.05;
  const out: KeyDef[] = [];
  const row = (z: number, x0: number, keys: [string, number][]) => {
    let x = x0;
    for (const [label, w] of keys) {
      if (label !== '') out.push({ x, z, w: w * u, label });
      x += w * u;
    }
  };
  const ones = (s: string) => s.split(' ').map((k) => [k, 1] as [string, number]);
  row(8, 8, [['Esc', 1], ['', 1], ...ones('F1 F2 F3 F4'), ['', 0.5], ...ones('F5 F6 F7 F8'), ['', 0.5], ...ones('F9 F10 F11 F12')]);
  row(34, 8, [...ones('` 1 2 3 4 5 6 7 8 9 0 - ='), ['Bksp', 2]]);
  row(53, 8, [['Tab', 1.5], ...ones('Q W E R T Y U I O P [ ]'), ['\\', 1.5]]);
  row(72, 8, [['Caps', 1.75], ...ones('A S D F G H J K L ; \''), ['Enter', 2.25]]);
  row(91, 8, [['Shift', 2.25], ...ones('Z X C V B N M , . /'), ['Shift', 2.75]]);
  row(110, 8, [['Ctrl', 1.25], ['Win', 1.25], ['Alt', 1.25], [' ', 6.25], ['Alt', 1.25], ['Fn', 1.25], ['', 1.25], ['Ctrl', 1.25]]);
  // nav cluster + numpad
  for (const [i, r] of [['Ins Hm PgU', 34], ['Del End PgD', 53]] as const) row(r, 300, ones(i));
  row(91, 319, ones('↑'));
  row(110, 300, ones('← ↓ →'));
  row(34, 365, ones('Num / * -'));
  row(53, 365, ones('7 8 9 +'));
  row(72, 365, ones('4 5 6'));
  row(91, 365, ones('1 2 3 Ent'));
  row(110, 365, [['0', 2], ['.', 1]]);
  layoutCache = out;
  return out;
}

/** Full-size keyboard 440 × 135 × 25 mm with real keycaps; origin = desk surface, front = +Z. */
export function keyboard(ctx: LabCtx, b: StaticBatch): void {
  const { mats } = ctx;
  b.add(profileGeo([[-0.0675, 0], [0.0675, 0], [0.0675, 0.012], [-0.0675, 0.022]], 0.44, 0.002), mats.satinBlack);
  b.within(xf(0, 0.017, 0, Math.atan2(0.01, 0.135), 0, 0), () => {
    for (const k of keyLayout()) {
      const kw = k.w / 1000 - 0.003;
      b.add(boxGeo(kw, 0.008, 0.016), mats.keycap, xf(k.x / 1000 - 0.22 + kw / 2 + 0.0015, 0.004, k.z / 1000 - 0.0675 + 0.009), 'none');
    }
    const lg = planeGeo(0.44, 0.135);
    b.add(lg, keyLegendMaterial(), xf(0, 0.0082, 0, -Math.PI / 2, 0, 0), 'none');
  });
}

/** Mouse + fabric pad; origin = pad centre on the desk. */
export function mouseAndPad(ctx: LabCtx, b: StaticBatch, padW = 0.25, padD = 0.21): void {
  const { mats } = ctx;
  b.add(rboxGeo(padW, 0.003, padD, 0.012, 2), mats.meshFabric, xf(0, 0.0015, 0), 'receive');
  b.within(xf(0.02, 0.003, 0.01, 0, 0.12, 0), () => mouseShell(ctx, b));
}

/** Scaled ellipsoid mouse shell (sphere geometry baked with non-uniform scale). */
export function mouseShell(ctx: LabCtx, b: StaticBatch): void {
  const g = sphereGeo(1, 18, 12);
  g.scale(0.0325, 0.02, 0.0575);
  g.translate(0, 0.004, 0);
  b.add(g, ctx.mats.satinBlack, null, 'none');
  b.box(0.002, 0.004, 0.035, ctx.mats.darkGreyPlastic, 0, 0.0235, -0.03, 0, 'none');
  b.add(cylGeo(0.004, 0.004, 0.008, 10), ctx.mats.darkGreyPlastic, xf(0, 0.024, -0.028, 0, 0, Math.PI / 2), 'none');
}

/* ───────────────────────────── misc ───────────────────────────── */

/** Black PC tower (W 0.20 × D 0.42 × H 0.45), front = +Z; returns the power-LED position. */
export function pcTower(ctx: LabCtx, b: StaticBatch, w = 0.2, d = 0.42, h = 0.45, mat?: Material): [number, number, number] {
  const { mats } = ctx;
  b.add(rboxGeo(w, h, d, 0.006, 2), mat ?? mats.satinBlack, xf(0, h / 2 + 0.012, 0));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(cylGeo(0.012, 0.012, 0.012, 10), mats.rubberTip, xf((sx * w) / 2.6, 0.006, (sz * d) / 2.4), 'none');
  // front vents
  for (let i = 0; i < 9; i++) b.box(w * 0.7, 0.004, 0.002, mats.blackPlastic, 0, 0.08 + i * 0.022, d / 2 + 0.001, 0, 'none');
  b.add(cylGeo(0.009, 0.009, 0.004, 16), mats.chrome, xf(0, h - 0.02, d / 2 - 0.02, 0, 0, 0), 'none');
  b.box(0.012, 0.004, 0.002, mats.darkGreyPlastic, -0.04, h - 0.02, d / 2 + 0.001, 0, 'none');
  b.box(0.012, 0.004, 0.002, mats.darkGreyPlastic, -0.06, h - 0.02, d / 2 + 0.001, 0, 'none');
  return [0.04, h - 0.008, d / 2 + 0.0012];
}

/** Waste bin (tapered, open top); origin = floor centre. */
export function bin(ctx: LabCtx, b: StaticBatch, mat: Material, d = 0.3, h = 0.4): void {
  const r = d / 2;
  const g = latheGeo([[r * 0.78, 0], [r * 0.8, 0.004], [r, h - 0.01], [r + 0.006, h], [r - 0.004, h], [r * 0.78 - 0.004, 0.006]], 28);
  b.add(g, mat);
  b.add(cylGeo(r * 0.78, r * 0.78, 0.004, 28), mat, xf(0, 0.004, 0), 'none');
}

/** Ceramic mug (Ø 85 × 95 mm) with handle; origin = desk surface. */
export function mug(ctx: LabCtx, b: StaticBatch, mat?: Material): void {
  const m = mat ?? ctx.mats.whiteEnamel;
  b.add(latheGeo([[0.001, 0], [0.038, 0], [0.042, 0.004], [0.0425, 0.095], [0.0395, 0.095], [0.039, 0.008], [0.001, 0.008]], 28), m);
  b.add(torusGeo(0.024, 0.006, 8, 16, Math.PI * 1.1), m, xf(0.046, 0.05, 0, 0, 0, -Math.PI * 0.55), 'none');
}

/** Open laptop (origin = desk surface, front = +Z); `screenMat`/`geo` draw the display. */
export function laptop(ctx: LabCtx, b: StaticBatch, screenMat: Material | null, geo: ((w: number, h: number) => BufferGeometry) | null, lidDeg = 110, sticker = false): void {
  const { mats } = ctx;
  b.add(rboxGeo(0.34, 0.016, 0.235, 0.008, 2), mats.lightGreyMetal, xf(0, 0.008, 0));
  b.box(0.3, 0.001, 0.11, mats.keycap, 0, 0.0165, -0.03, 0, 'none');
  b.box(0.1, 0.001, 0.06, mats.greySteel, 0, 0.0165, 0.075, 0, 'none');
  b.within(xf(0, 0.016, -0.115, -rad(lidDeg - 90), 0, 0), () => {
    b.add(rboxGeo(0.34, 0.225, 0.006, 0.008, 2), mats.lightGreyMetal, xf(0, 0.1125, -0.003));
    b.box(0.33, 0.215, 0.001, mats.blackPlastic, 0, 0.1125, 0.0005, 0, 'none');
    if (screenMat && geo) b.add(geo(0.31, 0.19), screenMat, xf(0, 0.115, 0.0012), 'none');
    if (sticker) {
      const cols = ['#43b02a', '#e5484d', '#5aa2ff', '#f2b233', '#7c5cff', '#ffffff'];
      cols.forEach((c, i) => b.add(cylGeo(0.018, 0.018, 0.001, 14), ctx.engine.materials.get(`lab.sticker${i}`, () => new MeshStandardMaterial({ color: c, roughness: 0.4 })), xf(-0.1 + (i % 3) * 0.09, 0.06 + Math.floor(i / 3) * 0.09, -0.0065, Math.PI / 2, 0, 0), 'none'));
    }
  });
}

