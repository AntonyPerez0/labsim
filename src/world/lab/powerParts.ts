/**
 * Power-wall part models (World §1.5, §2.8 fuse model, §6.2 `meanWellLabel` / `fuseBlade`): Mean Well
 * LRS-600-24, 24 V bus bars, finned buck regulators, inline ATO fuse holders, DC tap leads, the
 * 6-outlet metal AC strip and NEMA 5-15R duplex outlets. Each builder models in a local frame whose
 * origin is the part centre ON the mounting face, +Z out of the face, +Y up.
 */
import { Group, Mesh, MeshPhysicalMaterial, MeshStandardMaterial, type Material } from 'three';
import { StaticBatch, xf } from './kit/batch';
import { boxGeo, cylGeo, rboxGeo, tubeGeo, torusGeo, type V3 } from './kit/shapes';
import { addPrint, addTape, type LabCtx } from './kit/context';
import { FONT, fitText, roundRect } from './kit/draw';
import { screwAt } from './kit/shared';
import { FUSE_COLORS } from '../layout';

const mm = (v: number) => v / 1000;

/* ───────────────────────────── Mean Well LRS-600-24 ───────────────────────────── */

function drawMeanWellLabel(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#d9dde2';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1d4f9c';
  g.fillRect(0, 0, w, h * 0.3);
  g.fillStyle = '#ffffff';
  g.font = `900 italic ${h * 0.2}px ${FONT.UI_SANS}`;
  g.textBaseline = 'middle';
  g.fillText('MEAN WELL', w * 0.04, h * 0.15);
  g.font = `700 ${h * 0.12}px ${FONT.UI_SANS}`;
  g.textAlign = 'right';
  g.fillText('LRS-600-24', w * 0.96, h * 0.15);
  g.textAlign = 'left';
  g.fillStyle = '#1b1f26';
  g.font = `700 ${h * 0.085}px ${FONT.UI_SANS}`;
  g.fillText('MEAN WELL · INPUT 120VAC · OUTPUT 24VDC', w * 0.04, h * 0.4);
  g.fillText('LRS-600-24 · 24V 25A', w * 0.04, h * 0.53);
  g.font = `500 ${h * 0.065}px ${FONT.UI_SANS}`;
  g.fillText('INPUT: 115/230VAC  8.5A/4.2A  50/60Hz', w * 0.04, h * 0.66);
  g.fillText('OUTPUT: +24V ⎓ 25A  600W MAX', w * 0.04, h * 0.76);
  g.fillText('L  N  ⏚  −V  −V  +V  +V', w * 0.04, h * 0.88);
  // compliance boxes
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = '#1b1f26';
    g.lineWidth = 2;
    roundRect(g, w * (0.7 + i * 0.07), h * 0.62, w * 0.055, h * 0.16, 4);
    g.stroke();
  }
}

/** Perforation dots for the PSU lid (holes on a 5 mm pitch). */
function drawPerf(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = '#b8bcc0';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#2a2d31';
  const p = w / 40;
  for (let y = p; y < h - p * 0.5; y += p)
    for (let x = p * (Math.floor(y / p) % 2 ? 1 : 0.5); x < w - p * 0.4; x += p) {
      g.beginPath();
      g.arc(x, y, p * 0.3, 0, Math.PI * 2);
      g.fill();
    }
}

/** Returns local positions of the DC OK LED and the fan centre. */
export function meanWell(ctx: LabCtx, b: StaticBatch): { led: V3; fan: V3 } {
  const { mats } = ctx;
  const W = mm(215);
  const H = mm(115);
  const D = mm(50);
  // U-chassis + perforated cover (front face = the cover, facing the room)
  b.add(rboxGeo(W, H, D, 0.0015, 1), mats.lightGreyMetal, xf(0, 0, D / 2));
  addPrint(ctx.prints, b, W - mm(60), H - mm(8), 640, 330, drawPerf, xf(-mm(28), 0, D + 0.0004));
  addPrint(ctx.prints, b, mm(120), mm(60), 512, 256, drawMeanWellLabel, xf(-mm(28), mm(4), D + 0.0008));
  // mounting flanges + screws into the board
  for (const sx of [-1, 1]) {
    b.box(mm(12), H + mm(16), mm(1.5), mats.lightGreyMetal, sx * (W / 2 - mm(20)), 0, mm(0.75), 0, 'none');
    for (const sy of [-1, 1]) screwAt(ctx, b, sx * (W / 2 - mm(20)), sy * (H / 2 + mm(4)), mm(1.5));
  }
  // fan grille on the left end
  b.add(cylGeo(mm(20), mm(20), mm(1), 24), mats.satinBlack, xf(-W / 2 - mm(0.4), 0, D / 2, 0, 0, Math.PI / 2), 'none');
  for (const r of [7, 12, 17]) b.add(torusGeo(mm(r), mm(0.8), 4, 24), mats.lightGreyMetal, xf(-W / 2 - mm(1), 0, D / 2, 0, Math.PI / 2, 0), 'none');
  // terminal strip under a clear cover on the right end (7-way)
  const tx = W / 2 - mm(26);
  b.add(boxGeo(mm(46), H - mm(10), mm(14)), mats.blackPlastic, xf(tx, 0, D + mm(7)));
  for (let i = 0; i < 7; i++) {
    const y = H / 2 - mm(14) - i * mm(13.5);
    b.box(mm(10), mm(1), mm(15), mats.blackPlastic, tx - mm(4), y - mm(6.7), D + mm(7.5), 0, 'none'); // barrier
    b.add(cylGeo(mm(3.2), mm(3.2), mm(2), 12), mats.steelChrome, xf(tx - mm(4), y, D + mm(14.5), Math.PI / 2, 0, 0), 'none');
    b.box(mm(5), mm(0.8), mm(0.3), mats.blackPlastic, tx - mm(4), y, D + mm(15.6), 0.5, 'none');
  }
  b.add(boxGeo(mm(36), H - mm(6), mm(1.5)), mats.glassClear, xf(tx - mm(4), 0, D + mm(19)), 'none');
  addPrint(ctx.labels, b, mm(8), H - mm(14), 40, 400, (g, w, h) => {
    g.fillStyle = '#141414';
    g.fillRect(0, 0, w, h);
    const l = ['L', 'N', '⏚', '−V', '−V', '+V', '+V'];
    l.forEach((s, i) => {
      g.save();
      g.translate(0, (i * h) / 7);
      fitText(g, s, w, h / 7, { color: '#e8e8e8', font: FONT.UI_SANS, weight: 700, marginX: 0.05, marginY: 0.25 });
      g.restore();
    });
  }, xf(tx + mm(14), 0, D + mm(14.1)));
  // V.ADJ pot + DC OK LED window
  b.add(cylGeo(mm(2.4), mm(2.4), mm(3), 12), mats.orangePla, xf(tx + mm(16), -H / 2 + mm(18), D + mm(1.5), Math.PI / 2, 0, 0), 'none');
  addTape(ctx, b, 'V.ADJ', 2.2, xf(tx + mm(16), -H / 2 + mm(10), D + mm(0.5)), { bg: '#d9dde2' });
  addTape(ctx, b, 'DC OK', 2.2, xf(tx + mm(16), -H / 2 + mm(34), D + mm(0.5)), { bg: '#d9dde2' });
  return { led: [tx + mm(16), -H / 2 + mm(27), D + mm(0.2)], fan: [-W / 2, 0, D / 2] };
}

/* ───────────────────────────── 24 V bus bars ───────────────────────────── */

/** Returns the lug positions (local) of the + bar then the − bar. */
export function busBars(ctx: LabCtx, b: StaticBatch): { plus: V3[]; minus: V3[] } {
  const { mats } = ctx;
  const L = mm(300);
  const out = { plus: [] as V3[], minus: [] as V3[] };
  // insulated base strip + 4 standoffs
  b.box(L + mm(20), mm(40), mm(4), mats.blackPlastic, 0, 0, mm(2), 0, 'both');
  for (const sx of [-1, -0.33, 0.33, 1]) {
    for (const yy of [mm(10), -mm(10)]) b.add(cylGeo(mm(4), mm(4), mm(14), 6), mats.blackPlastic, xf(sx * (L / 2 - mm(10)), yy, mm(11), Math.PI / 2, 0, 0), 'none');
  }
  const bar = (y: number, cap: Material, list: V3[]) => {
    b.add(rboxGeo(L, mm(12), mm(5), mm(1), 1), mats.copper, xf(0, y, mm(20.5)));
    b.add(boxGeo(mm(10), mm(13), mm(6)), cap, xf(-L / 2 - mm(3), y, mm(20.5)), 'none');
    for (let i = 0; i < 6; i++) {
      const x = -L / 2 + mm(25) + i * mm(50);
      screwAt(ctx, b, x, y, mm(23), [0, 0, 1], 'nut');
      list.push([x, y, mm(25)]);
    }
  };
  bar(mm(10), mats.wireRed, out.plus);
  bar(-mm(10), mats.wireBlack, out.minus);
  return out;
}

/* ───────────────────────────── buck regulator ───────────────────────────── */

export interface RegulatorModel {
  led: V3;
  switchPos: V3;
  inPlus: V3;
  inMinus: V3;
  outPlus: V3;
  outMinus: V3;
}

/** Finned buck module (W × H × D mm); black (12 V) or silver (5 V). */
export function regulator(ctx: LabCtx, b: StaticBatch, wMm: number, hMm: number, dMm: number, black: boolean): RegulatorModel {
  const { mats } = ctx;
  const W = mm(wMm);
  const H = mm(hMm);
  const D = mm(dMm);
  const body = black ? mats.anodisedBlack : mats.aluminium;
  // base plate with ears
  b.box(W + mm(14), H, mm(3), body, 0, 0, mm(1.5));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) screwAt(ctx, b, sx * (W / 2 + mm(4)), sy * (H / 2 - mm(6)), mm(3), [0, 0, 1], black ? 'screwBlack' : 'screw');
  // potted body + fins (vertical fins so convection works)
  b.box(W, H, D * 0.45, body, 0, 0, mm(3) + D * 0.225);
  const nf = Math.round(wMm / 6.5);
  for (let i = 0; i < nf; i++) {
    const x = -W / 2 + mm(3) + (i * (W - mm(6))) / (nf - 1);
    b.box(mm(1.6), H - mm(4), D * 0.55, body, x, 0, mm(3) + D * 0.45 + D * 0.275, 0, 'cast');
  }
  // input switch (small black rocker) on the left end + status LED
  b.add(rboxGeo(mm(10), mm(16), mm(8), mm(1.5), 1), mats.blackPlastic, xf(-W / 2 - mm(4), mm(12), mm(8)));
  b.add(rboxGeo(mm(7), mm(10), mm(3), mm(1), 1), mats.red, xf(-W / 2 - mm(4), mm(13), mm(13.2), 0.2, 0, 0), 'none');
  // screw terminals: input (left end) / output (right end)
  for (const [x, n] of [[-W / 2 + mm(6), 'in'], [W / 2 - mm(6), 'out']] as const) {
    b.box(mm(10), mm(18), mm(10), mats.greenPaint, x, -H / 2 + mm(12), D + mm(2), 0, 'none');
    for (const yy of [mm(4), -mm(4)]) b.add(cylGeo(mm(2), mm(2), mm(1.5), 10), mats.steelChrome, xf(x, -H / 2 + mm(12) + yy, D + mm(7.5), Math.PI / 2, 0, 0), 'none');
    void n;
  }
  return {
    led: [-W / 2 - mm(4), -mm(2), mm(12.2)],
    switchPos: [-W / 2 - mm(4), mm(12), mm(12)],
    inPlus: [-W / 2 + mm(6), -H / 2 + mm(16), D + mm(4)],
    inMinus: [-W / 2 + mm(6), -H / 2 + mm(8), D + mm(4)],
    outPlus: [W / 2 - mm(6), -H / 2 + mm(16), D + mm(4)],
    outMinus: [W / 2 - mm(6), -H / 2 + mm(8), D + mm(4)],
  };
}

/* ───────────────────────────── inline ATO fuse holder ───────────────────────────── */

const bladeMats = new Map<string, Material>();
function bladeMat(rating: number, blown: boolean): Material {
  const key = `${rating}|${blown}`;
  let m = bladeMats.get(key);
  if (!m) {
    const c = FUSE_COLORS[String(rating)] ?? '#d0211c';
    m = new MeshPhysicalMaterial({ color: blown ? '#3a1d14' : c, roughness: 0.3, transmission: 0, transparent: true, opacity: 0.92, clearcoat: 0.5 });
    m.name = `lab.fuseBlade.${key}`;
    bladeMats.set(key, m);
  }
  return m;
}

export interface FuseHolderRig {
  group: Group;
  capPivot: Group;
  blade: Mesh;
  scorch: Mesh;
  setState(s: { rating: number; blown: boolean; removed: boolean; open: number }): void;
  /** Local top/bottom wire entry points. */
  top: V3;
  bottom: V3;
}

/** Vertical inline ATO holder 55 × 22 × 18 mm (long axis Y) with a hinged smoked cap. Origin = holder centre. */
export function fuseHolder(ctx: LabCtx, parent: Group): FuseHolderRig {
  const { mats } = ctx;
  const group = new Group();
  parent.add(group);
  const b = new StaticBatch('fuse-holder');
  // body halves + wire boots
  b.add(rboxGeo(mm(22), mm(40), mm(12), mm(3), 2), mats.blackPlastic, xf(0, -mm(4), mm(6)));
  for (const s of [-1, 1]) b.add(cylGeo(mm(4), mm(5.5), mm(8), 10), mats.blackPlastic, xf(0, s * mm(26), mm(6)), 'none');
  // clip to the board
  b.box(mm(26), mm(6), mm(2), mats.greySteel, 0, -mm(4), mm(1), 0, 'none');
  ctx.statics.flushInto(b, group);
  // blade (visible through the cap)
  const blade = new Mesh(boxGeo(mm(19), mm(12), mm(5)), bladeMat(10, false));
  blade.position.set(0, mm(8), mm(9));
  group.add(blade);
  const scorch = new Mesh(boxGeo(mm(6), mm(3), mm(5.4)), mats.satinBlack);
  scorch.position.set(0, mm(9), mm(9));
  group.add(scorch);
  // smoked cap (hinged at the bottom of the cap, opens toward the viewer)
  const capPivot = new Group();
  capPivot.position.set(0, mm(-2), mm(12));
  group.add(capPivot);
  const cap = new Mesh(rboxGeo(mm(23), mm(22), mm(10), mm(3), 2), mats.smokedPlastic);
  cap.position.set(0, mm(12), mm(0));
  capPivot.add(cap);
  return {
    group,
    capPivot,
    blade,
    scorch,
    top: [0, mm(30), mm(6)],
    bottom: [0, -mm(30), mm(6)],
    setState({ rating, blown, removed, open }) {
      blade.visible = !removed;
      scorch.visible = blown && !removed;
      blade.material = bladeMat(rating, blown);
      capPivot.rotation.x = open * 1.6;
    },
  };
}

/* ───────────────────────────── DC tap lead ───────────────────────────── */

/** Lead from `from` (local, on the rail) to a barrel plug hanging on a hook at the origin. */
export function dcTap(ctx: LabCtx, b: StaticBatch, from: V3, tagHex: string, label: string): void {
  const { mats } = ctx;
  const tagColor = ctx.engine.materials.get(`lab.tag${tagHex}`, () => new MeshStandardMaterial({ color: tagHex, roughness: 0.6 }));
  // hook
  b.add(tubeGeo([[0, mm(40), 0], [0, mm(40), mm(18)], [0, mm(30), mm(24)], [0, mm(24), mm(18)]], mm(1.5), 6, 400), mats.steelChrome, null, 'none');
  b.add(cylGeo(mm(5), mm(5), mm(2), 10), mats.steelChrome, xf(0, mm(40), mm(1), Math.PI / 2, 0, 0), 'none');
  // lead: from the rail, down, looping over the hook, plug hanging below
  b.add(tubeGeo([from, [from[0] * 0.6, from[1] * 0.55, mm(20)], [mm(3), mm(32), mm(22)], [0, mm(10), mm(22)], [0, -mm(10), mm(22)]], mm(2.2), 6, 120), mats.wireBlack, null, 'none');
  // barrel plug + strain relief
  b.add(cylGeo(mm(5), mm(4.2), mm(28), 12), mats.blackPlastic, xf(0, -mm(24), mm(22)), 'none');
  b.add(cylGeo(mm(2.75), mm(2.75), mm(10), 12), mats.steelChrome, xf(0, -mm(43), mm(22)), 'none');
  // coloured flag tag with the voltage
  b.box(mm(24), mm(14), mm(1.2), tagColor, mm(14), -mm(18), mm(22), 0, 'none');
  addTape(ctx, b, label, 5, xf(mm(14), -mm(18), mm(22.7)), { bg: tagHex, fg: label === '12V' ? '#111' : '#ffffff' }, { w: 20, h: 10 });
}

/* ───────────────────────────── AC strip (6-outlet metal) ───────────────────────────── */

/** Local positions of the 6 socket faces (strip long axis = local X, sockets face +Z). */
export function acStrip(ctx: LabCtx, b: StaticBatch, wMm: number, hMm: number, dMm: number, tape: string): { sockets: V3[]; rocker: V3 } {
  const { mats } = ctx;
  const W = mm(wMm);
  const H = mm(hMm);
  const D = mm(dMm);
  b.add(rboxGeo(W, H, D, mm(2), 1), mats.satinBlack, xf(0, 0, D / 2));
  for (const s of [-1, 1]) {
    b.box(mm(14), H + mm(10), mm(2), mats.satinBlack, s * (W / 2 + mm(5)), 0, mm(1), 0, 'none');
    screwAt(ctx, b, s * (W / 2 + mm(5)), 0, mm(2));
  }
  const sockets: V3[] = [];
  const pitch = (W - mm(80)) / 6;
  for (let i = 0; i < 6; i++) {
    const x = -W / 2 + mm(70) + pitch * (i + 0.5);
    b.add(rboxGeo(mm(26), mm(30), mm(1.2), mm(4), 1), mats.blackPlastic, xf(x, 0, D + mm(0.4)), 'none');
    for (const sx of [-1, 1]) b.box(mm(2), mm(7), mm(0.6), mats.coffee, x + sx * mm(6), mm(4), D + mm(1.1), 0, 'none');
    b.add(cylGeo(mm(2.5), mm(2.5), mm(0.6), 10), mats.coffee, xf(x, -mm(7), D + mm(1.1), Math.PI / 2, 0, 0), 'none');
    sockets.push([x, 0, D + mm(1)]);
  }
  // illuminated rocker on the left end
  b.add(rboxGeo(mm(28), mm(18), mm(4), mm(2), 1), mats.blackPlastic, xf(-W / 2 + mm(30), 0, D + mm(1.5)), 'none');
  addTape(ctx, b, tape, 4, xf(0, H / 2 + mm(7), mm(2)));
  // cord exit on the right end
  b.add(cylGeo(mm(5), mm(4), mm(14), 10), mats.blackPlastic, xf(W / 2 + mm(6), 0, D / 2, 0, 0, Math.PI / 2), 'none');
  return { sockets, rocker: [-W / 2 + mm(30), 0, D + mm(3.6)] };
}

/** Black plug body sitting in a socket (local origin = socket face). */
export function plugGeo(): ReturnType<typeof rboxGeo> {
  const g = rboxGeo(mm(30), mm(34), mm(24), mm(5), 2);
  g.translate(0, 0, mm(12));
  return g;
}

/* ───────────────────────────── duplex wall outlet ───────────────────────────── */

/** NEMA 5-15R duplex in a white 70 × 115 plate (origin = plate centre on the wall). */
export function duplexOutlet(ctx: LabCtx, b: StaticBatch, label: string): V3[] {
  const { mats } = ctx;
  b.add(rboxGeo(mm(70), mm(115), mm(6), mm(3), 1), mats.offWhitePlastic, xf(0, 0, mm(3)));
  const faces: V3[] = [];
  for (const y of [mm(21), -mm(21)]) {
    b.add(rboxGeo(mm(35), mm(30), mm(4), mm(6), 1), mats.whiteEnamel, xf(0, y, mm(7)), 'none');
    for (const sx of [-1, 1]) b.box(mm(2), mm(8), mm(0.6), mats.blackPlastic, sx * mm(6.4), y + mm(4), mm(9.1), 0, 'none');
    b.add(cylGeo(mm(2.6), mm(2.6), mm(0.6), 10, false), mats.blackPlastic, xf(0, y - mm(7), mm(9.1), Math.PI / 2, 0, 0), 'none');
    faces.push([0, y, mm(9)]);
  }
  screwAt(ctx, b, 0, 0, mm(6), [0, 0, 1]);
  addTape(ctx, b, label, 5, xf(0, mm(70), mm(0.6)));
  return faces;
}

export const BLACK_PLUG_MAT = (ctx: LabCtx): Material => ctx.mats.blackPlastic as MeshStandardMaterial;
