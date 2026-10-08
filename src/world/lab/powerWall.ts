/**
 * Power wall (World §1.5) and the power bench (§1.4 "Power wall"): plywood backboard, Mean Well
 * MW-1, 24 V bus bars, the 12 V and three 5 V buck regulators, inline rack fuses, DC tap leads,
 * STRIP-W, line-end tags, safety sign, every wall outlet W1–W14 (§1.5 "Other wall outlets"), the
 * wiring looms (+ glow overlays for the M03 power trace), and the bench with the multimeter, the
 * spare fuse tray, the Flex 4 brick, the spare Collis probe and the desk fan.
 * Interactions and sim bindings live in `powerBind.ts`.
 */
import { Group, Mesh, MeshStandardMaterial, Color, type Material } from 'three';
import { DC_TAP_TAG_COLORS, FUSE_COLORS, FUSE_TRAY_CONTENTS, OUTLETS, POWER_TRACE, POWER_WALL, POWER_WALL_PARTS, getProp } from '../layout';
import { StaticBatch, xf } from './kit/batch';
import { boxGeo, cylGeo, latheGeo, rboxGeo, sphereGeo, torusGeo, tubeGeo, type V3 } from './kit/shapes';
import { addPrint, addTape, type LabCtx } from './kit/context';
import { drawPlate, drawWarningSign, FONT, fitText } from './kit/draw';
import { rad, screwAt } from './kit/shared';
import { acStrip, busBars, dcTap, duplexOutlet, fuseHolder, meanWell, plugGeo, regulator, type FuseHolderRig } from './powerParts';

const F = POWER_WALL.boardFaceZ;
const mm = (v: number) => v / 1000;
const part = (id: string) => POWER_WALL_PARTS.find((p) => p.id === id)!;

export interface PowerWallRig {
  proxies: Map<string, Mesh>;
  fuses: Map<string, FuseHolderRig>;
  psuLed: number;
  regLeds: Map<string, number>;
  stripRocker: number;
  stripPlugs: Mesh[];
  psuCordIn: Mesh;
  psuCordOut: Mesh;
  /** Power-trace glow per node id (lit when that node is reached). */
  traceGlow: Map<string, Mesh>;
  pickups: Map<string, Group>;
}

/** Wire tube in world coordinates. */
function wire(b: StaticBatch, pts: V3[], r: number, mat: Material, perM = 32): void {
  b.add(tubeGeo(pts, r, 5, perM), mat, null, 'none');
}

export function buildPowerWall(ctx: LabCtx): PowerWallRig {
  const { mats } = ctx;
  const b = new StaticBatch('power-wall');
  const proxies = new Map<string, Mesh>();
  const prox = (id: string, w: number, h: number, d: number, x: number, y: number, z: number) => proxies.set(id, ctx.ia.proxy(ctx.root, w, h, d, xf(x, y, z), id));
  const boardPaint = ctx.engine.materials.get('lab.boardPaint', () => new MeshStandardMaterial({ color: '#c9cbc7', roughness: 0.8 }));
  const glowMat = new MeshStandardMaterial({ color: '#ff7a1a', emissive: new Color(POWER_TRACE.highlightColor), emissiveIntensity: POWER_TRACE.highlightEmissive, roughness: 0.5 });
  glowMat.name = 'lab.traceGlow';

  /* ── backboard ── */
  const bw = POWER_WALL.maxX - POWER_WALL.minX;
  const bh = POWER_WALL.maxY - POWER_WALL.minY;
  const cx = (POWER_WALL.minX + POWER_WALL.maxX) / 2;
  const cy = (POWER_WALL.minY + POWER_WALL.maxY) / 2;
  b.box(bw, bh, 0.019, boardPaint, cx, cy, F - 0.0095, 0, 'receive');
  for (const [w, h, x, y] of [[bw + 0.05, 0.025, cx, POWER_WALL.maxY + 0.0125], [bw + 0.05, 0.025, cx, POWER_WALL.minY - 0.0125], [0.025, bh, POWER_WALL.minX - 0.0125, cy], [0.025, bh, POWER_WALL.maxX + 0.0125, cy]] as const)
    b.box(w, h, 0.022, mats.satinBlack, x, y, F - 0.011, 0, 'none');
  for (const x of [POWER_WALL.minX + 0.05, cx, POWER_WALL.maxX - 0.05]) for (const y of [POWER_WALL.minY + 0.05, POWER_WALL.maxY - 0.05]) screwAt(ctx, b, x, y, F, [0, 0, 1], 'screwBlack');
  // DIN-style wire duct along the top edge (the looms leave the board through it)
  b.box(bw - 0.1, 0.03, 0.04, mats.darkGreyPlastic, cx, POWER_WALL.maxY - 0.017, F + 0.02, 0, 'cast');
  // slotted grey wire duct carrying the 24 V feeds from the bus to the regulators
  const ductMat = ctx.engine.materials.get('lab.wireDuct', () => new MeshStandardMaterial({ color: '#8f9396', roughness: 0.7 }));
  const dx0 = -1.07;
  const dx1 = 0.6;
  b.box(dx1 - dx0, 0.045, 0.045, ductMat, (dx0 + dx1) / 2, 1.945, F + 0.0225, 0, 'cast');
  b.box(dx1 - dx0 + 0.004, 0.008, 0.05, ctx.mats.midGreyPlastic, (dx0 + dx1) / 2, 1.945, F + 0.026, 0, 'none'); // cover
  for (let x = dx0 + 0.012; x < dx1 - 0.01; x += 0.012) {
    for (const yy of [1.9235, 1.9665]) b.box(0.005, 0.016, 0.0465, ctx.mats.darkGreyPlastic, x, yy, F + 0.0222, 0, 'none'); // finger slots
  }

  /* ── Mean Well ── */
  const psu = part('power.psu.mw-1');
  let psuLed = -1;
  b.at(psu.x, psu.y, F, 0, () => {
    const m = meanWell(ctx, b);
    psuLed = ctx.leds.add({ pos: [psu.x + m.led[0], psu.y + m.led[1], F + m.led[2]], normal: [0, 0, 1], color: '#2bff6a', size: 0.004 });
  });
  prox('power.psu.mw-1', 0.24, 0.13, 0.08, psu.x, psu.y, F + 0.035);

  /* ── bus bars ── */
  const bus = part('power.bus.24v');
  let lugs: { plus: V3[]; minus: V3[] } = { plus: [], minus: [] };
  b.at(bus.x, bus.y, F, 0, () => (lugs = busBars(ctx, b)));
  const lug = (l: V3): V3 => [bus.x + l[0], bus.y + l[1], F + l[2]];
  addTape(ctx, b, '24V DC RAIL', 6, xf(bus.x, bus.y + 0.035, F + 0.001));
  prox('power.bus.24v', 0.32, 0.06, 0.05, bus.x, bus.y, F + 0.02);

  // PSU DC out → bus (2 × 10 AWG red/black)
  const psuTermX = psu.x + mm(215) / 2 - mm(30);
  const psuDc = { plus: [psuTermX, psu.y - mm(30), F + mm(64)] as V3, minus: [psuTermX, psu.y - mm(4), F + mm(64)] as V3 };
  const psuToBusPlus: V3[] = [psuDc.plus, [psuTermX + 0.03, psu.y - 0.03, F + 0.06], [bus.x - 0.17, bus.y + 0.01, F + 0.04], lug(lugs.plus[0]!)];
  wire(b, psuToBusPlus, mm(2.8), mats.wireRed);
  wire(b, [psuDc.minus, [psuTermX + 0.035, psu.y - 0.004, F + 0.06], [bus.x - 0.17, bus.y - 0.01, F + 0.04], lug(lugs.minus[0]!)], mm(2.8), mats.wireBlack);

  /* ── regulators + fuses + taps ── */
  const regIds = ['power.reg.12v', 'power.reg.5v-a', 'power.reg.5v-b', 'power.reg.5v-c'] as const;
  const fuseIds = ['power.fuse.12v', 'power.fuse.5v-a', 'power.fuse.5v-b', 'power.fuse.5v-c'] as const;
  const regLeds = new Map<string, number>();
  const fuses = new Map<string, FuseHolderRig>();
  const traceGlow = new Map<string, Mesh>();
  const glow = (node: string, pts: V3[], r: number) => {
    const m = new Mesh(tubeGeo(pts, r * 1.25, 6, 60), glowMat);
    m.visible = false;
    m.name = `trace:${node}`;
    ctx.root.add(m);
    traceGlow.set(node, m);
  };
  glow('power.psu.mw-1', psuToBusPlus, mm(2.8));
  regIds.forEach((id, i) => {
    const p = part(id);
    const [w, h, d] = p.sizeMm;
    let model!: ReturnType<typeof regulator>;
    b.at(p.x, p.y, F, 0, () => (model = regulator(ctx, b, w, h, d, i === 0)));
    const W = (l: V3): V3 => [p.x + l[0], p.y + l[1], F + l[2]];
    regLeds.set(id, ctx.leds.add({ pos: W(model.led), normal: [0, 0, 1], color: '#2bff6a', size: 0.003 }));
    addTape(ctx, b, p.labels[0]!, 5, xf(p.x, p.y + mm(h) / 2 + 0.011, F + 0.001));
    addTape(ctx, b, p.labels[1]!, 4, xf(p.x, p.y + mm(h) / 2 + 0.024, F + 0.001));
    prox(id, mm(w) + 0.03, mm(h) + 0.01, mm(d) + 0.01, p.x, p.y, F + mm(d) / 2);
    // bus → regulator input (14 AWG red/black) along a y = 1.95 run
    const busOutP = lug(lugs.plus[5 - (i % 2)]!);
    const busOutM = lug(lugs.minus[5 - (i % 2)]!);
    const runY = 1.955 - i * 0.004;
    const inP = W(model.inPlus);
    const inM = W(model.inMinus);
    const pPath: V3[] = [busOutP, [busOutP[0] + 0.03, runY, F + 0.03], [inP[0] - 0.03, runY, F + 0.03], inP];
    wire(b, pPath, mm(1.2), mats.wireRed);
    wire(b, [busOutM, [busOutM[0] + 0.03, runY - 0.008, F + 0.026], [inM[0] - 0.03, runY - 0.008, F + 0.026], inM], mm(1.2), mats.wireBlack);
    if (id === 'power.reg.12v') glow('power.bus.24v', pPath, mm(1.2));
    // regulator out → fuse top, fuse bottom → riser to the tag → top duct → tray
    const f = part(fuseIds[i]!);
    const g = new Group();
    g.position.set(f.x, f.y, F);
    g.name = f.id;
    ctx.root.add(g);
    const rig = fuseHolder(ctx, g);
    fuses.set(f.id, rig);
    addTape(ctx, b, f.labels[0]!, 4, xf(f.x - 0.034, f.y, F + 0.001, 0, 0, Math.PI / 2));
    prox(f.id, 0.04, 0.075, 0.035, f.x, f.y, F + 0.015);
    const outP = W(model.outPlus);
    const outM = W(model.outMinus);
    const fTop: V3 = [f.x, f.y + mm(30), F + mm(6)];
    const fBot: V3 = [f.x, f.y - mm(30), F + mm(6)];
    const regToFuse: V3[] = [outP, [outP[0] + 0.012, outP[1] - 0.04, F + 0.03], [f.x + 0.01, fTop[1] + 0.05, F + 0.012], fTop];
    wire(b, regToFuse, mm(1.2), mats.wireRed);
    const riserX = f.x + 0.065;
    const riser: V3[] = [fBot, [f.x, f.y - 0.06, F + 0.01], [riserX, f.y - 0.05, F + 0.012], [riserX, 2.12, F + 0.012], [f.x + 0.012, 2.16, F + 0.012], [f.x + 0.01, POWER_WALL.maxY - 0.03, F + 0.02], [f.x + 0.02, 2.36, -4.8], [f.x + 0.03, 2.43, -4.66]];
    wire(b, riser, mm(1.2), mats.wireRed);
    wire(b, [outM, [outM[0] + 0.03, outM[1] - 0.03, F + 0.02], [riserX + 0.006, f.y, F + 0.012], [riserX + 0.006, 2.12, F + 0.014], [f.x + 0.02, 2.16, F + 0.014], [f.x + 0.02, POWER_WALL.maxY - 0.03, F + 0.022], [f.x + 0.03, 2.36, -4.8], [f.x + 0.04, 2.43, -4.66]], mm(1.2), mats.wireBlack);
    for (const yy of [1.85, 2.0, 2.11]) b.add(torusGeo(mm(3.5), mm(0.6), 4, 10), mats.blackPlastic, xf(riserX + 0.003, yy, F + 0.012, Math.PI / 2, 0, 0), 'none'); // zip ties
    if (id === 'power.reg.12v') glow('power.reg.12v', regToFuse, mm(1.2));
    if (id === 'power.reg.5v-b') glow('power.reg.5v-b', regToFuse, mm(1.2));
    if (i === 0) glow('power.fuse.12v', riser.slice(0, 6), mm(1.2));
    if (i === 2) glow('power.fuse.5v-b', riser.slice(0, 6), mm(1.2));
  });

  // spare DC taps fed from a small terminal block (T-24V / T-12V / T-5V spare)
  b.add(rboxGeo(0.12, 0.03, 0.02, 0.003, 1), mats.greenPaint, xf(-1.15, 1.66, F + 0.01));
  addTape(ctx, b, 'SPARE TAPS — PIs / NUCs ONLY', 3.5, xf(-1.15, 1.69, F + 0.001));
  for (const id of ['power.tap.24v', 'power.tap.12v', 'power.tap.5v']) {
    const p = part(id);
    b.at(p.x, p.y, F + 0.002, 0, () => dcTap(ctx, b, [0, 1.66 - p.y, 0.018], DC_TAP_TAG_COLORS[id]!, p.labels[0]!));
    prox(id, 0.05, 0.16, 0.05, p.x, p.y - 0.01, F + 0.025);
  }
  // feeds to the tap block from the 24 V bus and the 12 V / 5 V-C outputs (thin, along the board)
  wire(b, [lug(lugs.plus[1]!), [-1.3, 1.78, F + 0.02], [-1.21, 1.68, F + 0.015]], mm(1), mats.wireRed);
  wire(b, [[-1.115, 1.92, F + 0.02], [-1.115, 1.8, F + 0.014], [-1.12, 1.68, F + 0.014]], mm(1), mats.wireYellow);
  wire(b, [[-1.1, 1.92, F + 0.02], [-1.1, 1.8, F + 0.012], [-1.095, 1.68, F + 0.014]], mm(1), mats.wireBlue);
  // motor bundle (orange/black) from the bus up into the tray
  const motorX = part('power.tag.motor').x;
  wire(b, [lug(lugs.plus[2]!), [motorX - 0.01, 1.95, F + 0.02], [motorX, POWER_WALL.maxY - 0.03, F + 0.02], [motorX + 0.01, 2.36, -4.8], [motorX + 0.02, 2.43, -4.66]], mm(2), mats.wireOrange);
  wire(b, [lug(lugs.minus[2]!), [motorX + 0.008, 1.95, F + 0.024], [motorX + 0.012, POWER_WALL.maxY - 0.03, F + 0.024], [motorX + 0.022, 2.36, -4.8], [motorX + 0.032, 2.43, -4.66]], mm(2), mats.wireBlack);

  /* ── tags + sign ── */
  for (const id of ['power.tag.nuc', 'power.tag.pi', 'power.tag.motor']) {
    const p = part(id);
    const x = id === 'power.tag.motor' ? p.x + 0.035 : p.x + 0.045;
    b.box(0.062, 0.027, 0.0012, mats.paperWhite, x, p.y, F + 0.027, 0, 'none');
    addPrint(ctx.labels, b, 0.06, 0.025, 240, 100, (g, w, h) => drawPlate(g, w, h, p.labels[0]!, { bg: '#fff7d6', fg: '#1b1b1b', border: '#d0211c' }), xf(x, p.y, F + 0.0278));
    b.add(torusGeo(mm(4), mm(0.6), 4, 10), mats.cableWhite, xf(x - 0.033, p.y, F + 0.022, 0, Math.PI / 2, 0), 'none');
    prox(id, 0.07, 0.035, 0.02, x, p.y, F + 0.027);
  }
  const sign = part('power.sign');
  addPrint(ctx.prints, b, 0.3, 0.2, 600, 400, (g, w, h) => drawWarningSign(g, w, h, sign.labels[0]!), xf(sign.x, sign.y, F + 0.0012));

  /* ── power trace card (M03) ── */
  addPrint(ctx.prints, b, 0.15, 0.21, 300, 420, (g, w, h) => {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#1f2328';
    g.fillRect(0, 0, w, h * 0.12);
    g.save();
    fitText(g, 'POWER TRACE', w, h * 0.12, { color: '#ffffff', font: FONT.UI_SANS, weight: 800 });
    g.restore();
    ['W1 120V', 'MEAN WELL', '24V RAIL', 'REG 12V', 'REG 5V', 'FUSES', '→ NUC SHELF', '→ PI SHELVES'].forEach((s, i) => {
      const y = h * 0.16 + i * h * 0.1;
      g.fillStyle = i % 2 ? '#eef3f0' : '#fff3e6';
      g.fillRect(w * 0.08, y, w * 0.84, h * 0.08);
      g.save();
      g.translate(w * 0.08, y);
      fitText(g, `${i + 1}. ${s}`, w * 0.84, h * 0.08, { color: '#1f2328', font: FONT.UI_SANS, weight: 700, align: 'left', marginX: 0.06 });
      g.restore();
    });
  }, xf(-2.06, 1.62, F + 0.002));
  b.box(0.16, 0.22, 0.003, mats.glassClear, -2.06, 1.62, F + 0.004, 0, 'none');
  prox('power.trace', 0.17, 0.23, 0.02, -2.06, 1.62, F + 0.01);

  /* ── STRIP-W on the board ── */
  const sw = part('power.strip.w');
  const [swW, swH, swD] = sw.sizeMm;
  let swModel!: ReturnType<typeof acStrip>;
  b.at(sw.x, sw.y, F, 0, () => (swModel = acStrip(ctx, b, swW, swH, swD, sw.labels[0]!)));
  const stripRocker = ctx.leds.add({ pos: [sw.x + swModel.rocker[0], sw.y, F + swModel.rocker[2]], normal: [0, 0, 1], color: '#ff2614', size: [0.022, 0.012] });
  prox('power.strip.w', mm(swW), mm(swH) + 0.01, mm(swD), sw.x, sw.y, F + mm(swD) / 2);
  const stripPlugs: Mesh[] = [];
  swModel.sockets.forEach((s, i) => {
    const pos: V3 = [sw.x + s[0], sw.y + s[1], F + s[2]];
    const plug = new Mesh(plugGeo(), mats.blackPlastic);
    plug.position.set(...pos);
    plug.visible = i < 2;
    ctx.root.add(plug);
    stripPlugs.push(plug);
    prox(`power.strip.w.s${i + 1}`, 0.03, 0.035, 0.02, pos[0], pos[1], pos[2] + 0.005);
  });
  wire(b, [[sw.x + mm(swW) / 2 + 0.012, sw.y, F + 0.022], [0.62, 1.16, F + 0.03], [0.66, 1.1, F + 0.03], [0.65, 1.035, F + 0.03]], mm(3.5), mats.cableBlack);

  /* ── outlets W1–W14 (+ cords plugged into the board outlets) ── */
  for (const o of OUTLETS) {
    let faces: V3[] = [];
    const [x, y, z] = o.pos;
    const face = o.mountedOn === 'power-board' ? F : o.mountedOn === 'north' ? -4.999 : o.mountedOn === 'south' ? 4.999 : 6.999;
    const pos: V3 = o.mountedOn === 'east' ? [face, y, z] : [x, y, face];
    b.at(pos[0], pos[1], pos[2], rad(o.rotY), () => {
      faces = duplexOutlet(ctx, b, o.label);
    });
    const n: V3 = o.rotY === 0 ? [0, 0, 1] : o.rotY === 180 ? [0, 0, -1] : [-1, 0, 0];
    prox(o.id, Math.abs(n[0]) > 0.5 ? 0.03 : 0.08, 0.125, Math.abs(n[0]) > 0.5 ? 0.08 : 0.03, pos[0] + n[0] * 0.01, pos[1], pos[2] + n[2] * 0.01);
    void faces;
  }
  // board outlet plugs + cords: W2/W3 feed rack strips (both sockets, cords up into the tray), W4 bottom = STRIP-W
  const plugIn = (x: number, y: number) => b.add(plugGeo(), mats.blackPlastic, xf(x, y, F + 0.009), 'none');
  for (const x of [-1.25, -0.25]) {
    for (const [yy, dx] of [[1.071, -0.01], [1.029, 0.012]] as const) {
      plugIn(x, yy);
      wire(b, [[x, yy - 0.015, F + 0.035], [x + dx, yy - 0.06, F + 0.04], [x + dx + 0.04, yy - 0.04, F + 0.05], [x + 0.06 + dx, 1.4, F + 0.045], [x + 0.07 + dx, 2.0, F + 0.04], [x + 0.08 + dx, POWER_WALL.maxY - 0.03, F + 0.03], [x + 0.08 + dx, 2.36, -4.8], [x + 0.09 + dx, 2.43, -4.66]], mm(3.5), mats.cableBlack, 30);
    }
  }
  plugIn(0.65, 1.029);
  // the PSU AC cord to W1 top socket: plugged and unplugged variants (toggled by the binder)
  const psuAcFrom: V3 = [psuTermX, psu.y + mm(40), F + mm(64)];
  const cordPts: V3[] = [psuAcFrom, [psuTermX + 0.03, psu.y + 0.07, F + 0.05], [-1.62, 1.55, F + 0.05], [-1.9, 1.2, F + 0.05], [-2.05, 1.13, F + 0.045], [-2.05, 1.071 + 0.02, F + 0.03]];
  const psuCordIn = new Mesh(tubeGeo(cordPts, mm(3.5), 6, 40), mats.cableBlack);
  const plugW1 = plugGeo();
  plugW1.translate(-2.05, 1.071, F + 0.009);
  const psuCordInPlug = new Mesh(plugW1, mats.blackPlastic);
  psuCordIn.add(psuCordInPlug);
  ctx.root.add(psuCordIn);
  const loose: V3[] = [psuAcFrom, [psuTermX + 0.03, psu.y + 0.07, F + 0.05], [-1.62, 1.55, F + 0.06], [-1.75, 1.25, F + 0.09], [-1.8, 1.02, F + 0.12]];
  const psuCordOut = new Mesh(tubeGeo(loose, mm(3.5), 6, 40), mats.cableBlack);
  const pl2 = plugGeo();
  pl2.rotateX(Math.PI / 2);
  pl2.translate(-1.8, 1.0, F + 0.12);
  psuCordOut.add(new Mesh(pl2, mats.blackPlastic));
  psuCordOut.visible = false;
  ctx.root.add(psuCordOut);
  glow('power.outlet.w1', cordPts, mm(3.5));
  // tags: lit when the trace reaches them
  for (const id of ['power.tag.nuc', 'power.tag.pi']) {
    const p = part(id);
    glow(id, [[p.x + 0.014, p.y - 0.02, F + 0.03], [p.x + 0.014, p.y + 0.02, F + 0.03], [p.x + 0.03, POWER_WALL.maxY, F + 0.04], [p.x + 0.03, 2.43, -4.66]], mm(1.6));
  }

  ctx.statics.add(b);
  const pickups = buildBench(ctx, proxies);
  return { proxies, fuses, psuLed, regLeds, stripRocker, stripPlugs, psuCordIn, psuCordOut, traceGlow, pickups };
}

/* ───────────────────────────── power bench + pickups ───────────────────────────── */

function buildBench(ctx: LabCtx, proxies: Map<string, Mesh>): Map<string, Group> {
  const { mats } = ctx;
  const b = new StaticBatch('power-bench');
  const p = getProp('bench.power');
  const [W, D, H] = p.size!;
  const pickups = new Map<string, Group>();
  b.at(p.pos[0], 0, p.pos[2], 0, () => {
    // ESD laminate top with a black T-mould edge
    b.add(rboxGeo(W, 0.03, D, 0.003, 1), mats.esdLaminate, xf(0, H - 0.015, 0));
    b.box(W + 0.004, 0.03, 0.004, mats.satinBlack, 0, H - 0.015, D / 2 + 0.001, 0, 'none');
    // frame: legs, rails, under-shelf (perforated look)
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) b.box(0.04, H - 0.03, 0.04, mats.satinBlack, sx * (W / 2 - 0.03), (H - 0.03) / 2, sz * (D / 2 - 0.03));
    for (const sz of [-1, 1]) b.box(W - 0.04, 0.05, 0.03, mats.satinBlack, 0, H - 0.055, sz * (D / 2 - 0.03));
    b.add(boxGeo(W - 0.06, 0.02, D - 0.06), mats.perforatedSteel, xf(0, 0.19, 0));
    for (const sx of [-1, 0, 1]) for (const sz of [-1, 1]) b.add(cylGeo(0.02, 0.022, 0.01, 10), mats.rubberTip, xf(sx * (W / 2 - 0.03), 0.005, sz * (D / 2 - 0.03)), 'none');
    // ESD ground point + coiled wrist strap
    b.add(cylGeo(0.008, 0.008, 0.01, 10), mats.chrome, xf(W / 2 - 0.08, H - 0.03, D / 2 + 0.004, Math.PI / 2, 0, 0), 'none');
    b.add(tubeGeo(Array.from({ length: 30 }, (_, i) => [W / 2 - 0.08 + Math.cos(i * 0.9) * 0.012, H - 0.04 - i * 0.008, D / 2 + 0.02 + Math.sin(i * 0.9) * 0.012] as V3), 0.0018, 5, 200), mats.cableBlack, null, 'none');
  });

  /* fuse tray: clear-lid compartment box, 4 compartments × 6 blades */
  const ft = getProp('power.fuse-tray');
  b.at(ft.pos[0], ft.pos[1], ft.pos[2], 0, () => {
    // open compartment box (floor + walls) so the blades show through the clear lid
    b.box(0.2, 0.003, 0.12, mats.darkGreyPlastic, 0, 0.0015, 0);
    for (const s of [-1, 1]) {
      b.box(0.2, 0.025, 0.003, mats.darkGreyPlastic, 0, 0.0125, s * 0.0585);
      b.box(0.003, 0.025, 0.12, mats.darkGreyPlastic, s * 0.0985, 0.0125, 0);
    }
    const lid = ctx.engine.materials.get('lab.fuseTrayLid', () => {
      const m = new MeshStandardMaterial({ color: '#eef4f6', roughness: 0.08, transparent: true, opacity: 0.12, depthWrite: false, envMapIntensity: 0.25 });
      m.userData.noMerge = true;
      return m;
    });
    b.add(boxGeo(0.2, 0.003, 0.12), lid, xf(0, 0.0265, 0), 'none');
    const ratings = Object.keys(FUSE_TRAY_CONTENTS).sort((a, b) => Number(a) - Number(b));
    ratings.forEach((r, i) => {
      const x = -0.075 + i * 0.05;
      b.box(0.002, 0.022, 0.11, mats.blackPlastic, x + 0.025, 0.012, 0, 0, 'none');
      const mat = ctx.engine.materials.get(`lab.fuseTray.${r}`, () => new MeshStandardMaterial({ color: FUSE_COLORS[r], roughness: 0.35 }));
      for (let k = 0; k < FUSE_TRAY_CONTENTS[r]!; k++) b.add(boxGeo(0.019, 0.005, 0.012), mat, xf(x + (k % 2) * 0.012 - 0.006, 0.006 + (k % 3) * 0.003, -0.04 + Math.floor(k / 2) * 0.03, 0.2 * (k % 2), 0.3 * k, 0), 'none');
      addTape(ctx, b, `${r} A`, 3, xf(x, 0.0185, 0.0605));
    });
  });
  proxies.set('power.fuse-tray', ctx.ia.proxy(ctx.root, 0.21, 0.04, 0.13, xf(ft.pos[0], ft.pos[1] + 0.02, ft.pos[2]), 'power.fuse-tray'));

  /* pickups (own groups so they can disappear when taken) */
  const group = (id: string, rotYDeg = 0) => {
    const pp = getProp(id);
    const g = new Group();
    g.name = id;
    g.position.set(pp.pos[0], pp.pos[1], pp.pos[2]);
    g.rotation.y = rad(rotYDeg || pp.rotY);
    ctx.root.add(g);
    pickups.set(id, g);
    return g;
  };
  // multimeter in its yellow holster, lying face-up, probes coiled beside it
  {
    const g = group('tool.multimeter');
    const mb = new StaticBatch('multimeter');
    mb.add(rboxGeo(0.09, 0.05, 0.18, 0.012, 3), mats.yellowPlastic, xf(0, 0.025, 0));
    mb.add(rboxGeo(0.074, 0.006, 0.16, 0.008, 2), mats.satinBlack, xf(0, 0.049, 0));
    mb.box(0.056, 0.002, 0.034, ctx.engine.materials.get('lab.lcd', () => new MeshStandardMaterial({ color: '#9fae8f', roughness: 0.3 })), 0, 0.0525, -0.05, 0, 'none');
    mb.add(cylGeo(0.022, 0.022, 0.006, 24), mats.darkGreyPlastic, xf(0, 0.053, 0.01), 'none');
    mb.box(0.004, 0.003, 0.02, mats.whiteEnamel, 0, 0.057, 0.0, 0.3, 'none');
    for (const [x, m] of [[-0.022, mats.blackPlastic], [0, mats.red], [0.022, mats.red]] as const) mb.add(cylGeo(0.005, 0.005, 0.004, 12), m, xf(x, 0.052, 0.065), 'none');
    for (const [dx, m] of [[0.07, mats.red], [0.09, mats.satinBlack]] as const) {
      mb.add(tubeGeo(Array.from({ length: 16 }, (_, i) => [dx + Math.cos(i * 0.8) * 0.03, 0.004 + i * 0.0006, Math.sin(i * 0.8) * 0.05] as V3), 0.0018, 5, 80), m, null, 'none');
      mb.add(cylGeo(0.004, 0.003, 0.11, 8), m, xf(dx, 0.006, 0.06, Math.PI / 2, 0, 0), 'none');
    }
    ctx.statics.flushInto(mb, g);
    ctx.ia.proxy(g, 0.16, 0.06, 0.2, xf(0.03, 0.03, 0), 'proxy');
  }
  // Flex 4 power brick (white, cord + 2-prong plug)
  {
    const g = group('power.bench.flex4-psu');
    const pb = new StaticBatch('flex4-psu');
    pb.add(rboxGeo(0.11, 0.032, 0.06, 0.008, 2), mats.labwhite, xf(0, 0.016, 0));
    addTape(ctx, pb, 'FLEX 4 · 18V ⎓', 4, xf(0, 0.0322, 0, -Math.PI / 2, 0, 0));
    pb.add(tubeGeo(Array.from({ length: 22 }, (_, i) => [0.1 + Math.cos(i * 0.7) * 0.04, 0.004 + i * 0.0004, Math.sin(i * 0.7) * 0.035] as V3), 0.0022, 5, 100), mats.cableWhite, null, 'none');
    pb.add(rboxGeo(0.025, 0.02, 0.035, 0.004, 1), mats.labwhite, xf(0.17, 0.01, 0.02));
    for (const s of [-1, 1]) pb.box(0.0015, 0.008, 0.016, mats.chrome, 0.17 + s * 0.006, 0.01, 0.045, 0, 'none');
    ctx.statics.flushInto(pb, g);
    ctx.ia.proxy(g, 0.22, 0.05, 0.1, xf(0.06, 0.02, 0), 'proxy');
  }
  // spare Collis probe + its AC brick
  {
    const g = group('power.bench.collis-spare');
    const cb = new StaticBatch('collis-spare');
    cb.add(rboxGeo(0.15, 0.045, 0.11, 0.004, 2), mats.collisGrey, xf(0, 0.0225, 0));
    addPrint(ctx.labels, cb, 0.07, 0.016, 280, 64, (gg, w, h) => drawPlate(gg, w, h, 'UL Transaction Security', { bg: '#ffffff', fg: '#222222' }), xf(0, 0.022, 0.0552));
    cb.box(0.012, 0.01, 0.004, mats.blackPlastic, 0.05, 0.02, 0.056, 0, 'none');
    cb.add(rboxGeo(0.09, 0.03, 0.05, 0.006, 1), mats.satinBlack, xf(-0.03, 0.015, -0.11));
    cb.add(tubeGeo([[-0.075, 0.015, -0.11], [-0.11, 0.01, -0.06], [-0.09, 0.008, 0.0], [-0.075, 0.02, 0.02]], 0.002, 5, 60), mats.cableBlack, null, 'none');
    ctx.statics.flushInto(cb, g);
    ctx.leds.add({ pos: [getProp('power.bench.collis-spare').pos[0] - 0.05, 0.92, -4.6 + 0.0555], normal: [0, 0, 1], color: '#2bff6a', size: 0.003, level: 0 });
    ctx.ia.proxy(g, 0.17, 0.06, 0.24, xf(0, 0.025, -0.04), 'proxy');
  }
  // desk fan (stored on the under-shelf)
  {
    const g = group('power.bench.desk-fan');
    const fb = new StaticBatch('desk-fan');
    fb.add(rboxGeo(0.2, 0.025, 0.14, 0.01, 2), mats.whiteEnamel, xf(0, 0.0125, 0));
    fb.add(cylGeo(0.012, 0.014, 0.12, 12), mats.whiteEnamel, xf(0, 0.08, -0.01));
    fb.add(cylGeo(0.035, 0.03, 0.06, 16), mats.whiteEnamel, xf(0, 0.2, -0.03, Math.PI / 2, 0, 0));
    for (let i = 0; i < 5; i++) {
      const bl = sphereGeo(1, 8, 6);
      bl.scale(0.05, 0.018, 0.004);
      fb.add(bl, mats.offWhitePlastic, xf(Math.cos((i * 2 * Math.PI) / 5) * 0.05, 0.2 + Math.sin((i * 2 * Math.PI) / 5) * 0.05, 0.02, 0, 0, (i * 2 * Math.PI) / 5 + 0.3), 'none');
    }
    for (const r of [0.04, 0.08, 0.115]) {
      fb.add(torusGeo(r, 0.0015, 4, 36), mats.whiteEnamel, xf(0, 0.2, 0.04), 'none');
      fb.add(torusGeo(r, 0.0015, 4, 36), mats.whiteEnamel, xf(0, 0.2, 0.0), 'none');
    }
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      fb.add(tubeGeo([[Math.cos(a) * 0.115, 0.2 + Math.sin(a) * 0.115, 0], [Math.cos(a) * 0.12, 0.2 + Math.sin(a) * 0.12, 0.02], [Math.cos(a) * 0.115, 0.2 + Math.sin(a) * 0.115, 0.04]], 0.0012, 4, 60), mats.whiteEnamel, null, 'none');
    }
    ctx.statics.flushInto(fb, g);
    ctx.ia.proxy(g, 0.26, 0.33, 0.16, xf(0, 0.16, 0), 'proxy');
  }
  // bench clutter: wire cutters, a roll of electrical tape, an anti-static bag, label tape
  b.at(-1.95, 0.9, -4.6, 0.4, () => {
    b.add(latheGeo([[0.02, 0], [0.03, 0], [0.03, 0.018], [0.02, 0.018]], 20), mats.satinBlack);
    b.add(rboxGeo(0.12, 0.002, 0.16, 0.004, 1), ctx.engine.materials.get('lab.antistatic', () => new MeshStandardMaterial({ color: '#8e9499', roughness: 0.25, metalness: 0.6, transparent: true, opacity: 0.85 })), xf(0.12, 0.002, 0.02, 0, 0.3, 0), 'none');
  });
  b.at(0.0, 0.9, -4.5, -0.5, () => {
    for (const s of [-1, 1]) b.add(rboxGeo(0.012, 0.008, 0.07, 0.004, 1), mats.red, xf(s * 0.01, 0.004, 0.04, 0, s * 0.12, 0), 'none');
    b.add(boxGeo(0.014, 0.006, 0.03), mats.greySteel, xf(0, 0.004, -0.01), 'none');
  });
  ctx.statics.add(b);
  return pickups;
}
