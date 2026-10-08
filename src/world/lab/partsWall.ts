/**
 * Parts wall above Jared's bench and the storage beside it (World §1.4, §6.3, §9.2; IMG-R
 * background): dark-grey louvred panel with 4 × 5 red/blue stack bins (instanced), two 64-drawer
 * organisers (128 instanced clear drawers that slide open, labelled drawers per §6.3), the Husky
 * rolling tool chest (5 drawers, spare Flex 2 / Mini 3 in drawers 2 / 3) and the grey storage
 * cabinet (locked lower doors with keypad, open upper shelves, legacy Flex 1 shelf).
 */
import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { emit, store } from '@/core/store';
import { HARDWARE_LEAD, personName } from '@/content/team';
import type { CarriedItemId, FuseRating } from '@/core/state';
import { WALL_BINS, WALL_DRAWER_LABELS, getProp, wallDrawerId } from '../layout';
import { StaticBatch, prepGeometry, xf } from './kit/batch';
import { boxGeo, cylGeo, planeGeo, profileGeo, rboxGeo, torusGeo } from './kit/shapes';
import { addPrint, addTape, type LabCtx } from './kit/context';
import { drawPlate, drawTape, tapeSizeMm, FONT, fitText } from './kit/draw';
import { louvreAlpha, seeded } from './kit/procTex';
import { pickVerbs, toast } from './kit/runtime';
import { carry, placeCarried, takeFuse, takePart } from './kit/inventory';
import { screwAt } from './kit/shared';

const WALL_Z = -5.0;

/* ───────────────────────────── stack bin geometry ───────────────────────────── */

/** Hanging stack bin: W 0.21, back 0.125, front lip 0.07, D 0.27; origin = back-bottom centre, front +Z. */
function stackBinGeo(): BufferGeometry {
  const W = 0.21;
  const D = 0.27;
  const t = 0.003;
  const prof: [number, number][] = [[0, 0], [D, 0], [D, 0.07], [D - 0.03, 0.075], [0.06, 0.125], [0, 0.125]];
  const parts: BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const g = profileGeo(prof, t);
    parts.push(prepGeometry(g, xf(s * (W / 2 - t / 2), 0, 0)));
  }
  parts.push(prepGeometry(boxGeo(W, t, D), xf(0, t / 2, D / 2)));
  parts.push(prepGeometry(boxGeo(W, 0.125, t), xf(0, 0.0625, t / 2)));
  parts.push(prepGeometry(boxGeo(W, 0.07, t), xf(0, 0.035, D - t / 2)));
  parts.push(prepGeometry(boxGeo(W, 0.012, 0.02), xf(0, 0.072, D - 0.012, 0.6, 0, 0))); // label lip
  parts.push(prepGeometry(boxGeo(W * 0.8, 0.02, 0.01), xf(0, 0.135, 0.004))); // hanging hook
  return mergeGeometries(parts, false)!;
}

/* ───────────────────────────── drawer geometry ───────────────────────────── */

const DW = 0.058;
const DH = 0.043;
const DD = 0.15;

/** Organiser drawer (open-top clear tray with a front + pull), origin = front-face centre, front +Z. */
function drawerGeo(): BufferGeometry {
  const t = 0.0015;
  const parts = [
    prepGeometry(boxGeo(DW, DH, t), xf(0, 0, -t / 2)),
    prepGeometry(boxGeo(DW - 0.004, t, DD), xf(0, -DH / 2 + 0.002, -DD / 2)),
    prepGeometry(boxGeo(t, DH * 0.8, DD), xf(-DW / 2 + 0.002, -DH * 0.08, -DD / 2)),
    prepGeometry(boxGeo(t, DH * 0.8, DD), xf(DW / 2 - 0.002, -DH * 0.08, -DD / 2)),
    prepGeometry(boxGeo(DW - 0.004, DH * 0.8, t), xf(0, -DH * 0.08, -DD + t)),
    prepGeometry(boxGeo(0.02, 0.006, 0.008), xf(0, -DH * 0.25, 0.004)),
  ];
  return mergeGeometries(parts, false)!;
}

interface DrawerSlot {
  index: number;
  base: Matrix4;
  open: number;
  target: number;
  label: string | null;
  labelVerts: [number, number] | null;
}

/* ───────────────────────────── items in labelled drawers ───────────────────────────── */

const DRAWER_ITEM: Record<string, { part?: string; fuse?: FuseRating; name: string }> = {
  'M2.5 BOLTS': { part: 'bolt-2.5mm', name: 'M2.5 bolt' },
  'M5 BOLTS': { part: 'bolt-5mm', name: 'M5 bolt' },
  'M2.5 NUTS': { part: 'nut-2.5mm', name: 'M2.5 nut' },
  'M5 NUTS': { part: 'nut-5mm', name: 'M5 nut' },
  SOLENOIDS: { part: 'solenoid-spare', name: 'Spare solenoid' },
  'LIMIT SW': { part: 'limit-switch', name: 'Limit switch' },
  'V-WHEELS': { part: 'v-wheel', name: 'V-wheel' },
  'GT2 BELT': { part: 'gt2-belt', name: 'GT2 belt (1 m)' },
  PULLEYS: { part: 'gt2-pulley', name: 'GT2 pulley' },
  RIBBON: { part: 'ribbon', name: 'Ribbon cable' },
  'CARD INSERT': { part: 'card-insert-ribbon', name: 'Card insert ribbon' },
  'FUSES 10A': { fuse: 10, name: '10 A blade fuse' },
  'HEAT SHRINK': { part: 'heat-shrink', name: 'Heat shrink' },
  'ZIP TIES': { part: 'zip-ties', name: 'Zip ties' },
};

export function buildPartsWall(ctx: LabCtx): void {
  const { mats, engine } = ctx;
  const b = new StaticBatch('parts-wall');

  /* ── louvred panel + 20 bins ── */
  const wb = getProp('wall.bins');
  const [pw, , ph] = wb.size!;
  const louvre = ctx.engine.materials.get('lab.louvrePanel', () => new MeshStandardMaterial({ color: '#4d5156', roughness: 0.5, metalness: 0.6, alphaMap: louvreAlpha(), alphaTest: 0.5 }));
  b.box(pw, ph, 0.012, mats.satinBlack, wb.pos[0], wb.pos[1], WALL_Z + 0.006, 0, 'none');
  const lp = planeGeo(pw - 0.02, ph - 0.02);
  const uv = lp.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ((pw - 0.02) / 0.15), uv.getY(i) * ((ph - 0.02) / 0.15));
  b.add(lp, louvre, xf(wb.pos[0], wb.pos[1], WALL_Z + 0.0125), 'receive');
  b.box(pw + 0.02, ph + 0.02, 0.01, ctx.engine.materials.get('lab.louvreFrame', () => new MeshStandardMaterial({ color: '#5a5e63', roughness: 0.5, metalness: 0.6 })), wb.pos[0], wb.pos[1], WALL_Z + 0.005, 0, 'none');
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) screwAt(ctx, b, wb.pos[0] + sx * (pw / 2 - 0.02), wb.pos[1] + sy * (ph / 2 - 0.02), WALL_Z + 0.013);
  ctx.inst.define('binRed', stackBinGeo, mats.binRed, true);
  ctx.inst.define('binBlue', stackBinGeo, mats.binBlue, true);
  const binPos: { pos: [number, number, number]; red: boolean; row: number; col: number }[] = [];
  const rnd = seeded(31);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const x = wb.pos[0] - pw / 2 + 0.13 + col * 0.26;
      const y = wb.pos[1] + ph / 2 - 0.2 - row * 0.215;
      const red = row < 2;
      ctx.inst.add(red ? 'binRed' : 'binBlue', new Matrix4().makeTranslation(x, y, WALL_Z + 0.016));
      binPos.push({ pos: [x, y, WALL_Z + 0.016], red, row, col });
      // contents peeking out (cables / small parts)
      const n = 2 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const m = [mats.cableBlack, mats.cat6Yellow, mats.blackPla, mats.pcbGreen, mats.cableBlue, mats.cableWhite][Math.floor(rnd() * 6)]!;
        b.add(rboxGeo(0.04 + rnd() * 0.06, 0.02 + rnd() * 0.03, 0.04 + rnd() * 0.06, 0.006, 1), m, xf(x - 0.06 + rnd() * 0.12, y + 0.02 + rnd() * 0.02, WALL_Z + 0.08 + rnd() * 0.14, 0, rnd() * 3, 0), 'none');
      }
    }
  }
  // the two labelled bins (§6.3): red row 1 col 0, blue row 3 col 0
  const redBin = binPos.find((p) => p.red && p.row === 1 && p.col === 0)!;
  const blueBin = binPos.find((p) => !p.red && p.row === 3 && p.col === 0)!;
  for (const [bin, label] of [[redBin, WALL_BINS.red.label], [blueBin, WALL_BINS.blue.label]] as const) {
    addTape(ctx, b, label, 5, xf(bin.pos[0], bin.pos[1] + 0.074, bin.pos[2] + 0.262, -0.97, 0, 0));
  }
  const binProxy = (p: (typeof binPos)[number]) => ctx.ia.proxy(ctx.root, 0.21, 0.13, 0.27, xf(p.pos[0], p.pos[1] + 0.065, p.pos[2] + 0.135), 'bin');

  /* ── two 64-drawer organisers ── */
  const wd = getProp('wall.drawers');
  const frameMat = ctx.engine.materials.get('lab.organiserFrame', () => new MeshStandardMaterial({ color: '#3d4146', roughness: 0.6 }));
  const slots: DrawerSlot[] = [];
  const COLS = 8;
  const ROWS = 8;
  const OW = 0.5;
  const OH = 0.4;
  const ODp = 0.16;
  const labelGeos: BufferGeometry[] = [];
  let labelVert = 0;
  let labelIdx = 0;
  let labelPageMat: MeshStandardMaterial | null = null;
  for (const ox of [wd.pos[0] - 0.25, wd.pos[0] + 0.25]) {
    const y0 = wd.pos[1] - OH / 2;
    const zf = WALL_Z + ODp; // drawer fronts plane
    // frame: back, sides, top, bottom, dividers
    b.box(OW, OH, 0.004, frameMat, ox, wd.pos[1], WALL_Z + 0.004 + 0.005);
    for (const s of [-1, 1]) b.box(0.006, OH, ODp, frameMat, ox + s * (OW / 2 - 0.003), wd.pos[1], WALL_Z + ODp / 2 + 0.005);
    for (const yy of [y0 + 0.003, y0 + OH - 0.003]) b.box(OW, 0.006, ODp, frameMat, ox, yy, WALL_Z + ODp / 2 + 0.005);
    for (let r = 1; r < ROWS; r++) b.box(OW - 0.01, 0.003, ODp, frameMat, ox, y0 + (r * OH) / ROWS, WALL_Z + ODp / 2 + 0.005, 0, 'none');
    for (let c = 1; c < COLS; c++) b.box(0.003, OH - 0.01, ODp, frameMat, ox - OW / 2 + (c * OW) / COLS, wd.pos[1], WALL_Z + ODp / 2 + 0.005, 0, 'none');
    // wall bracket
    b.box(OW - 0.06, 0.03, 0.03, mats.greySteel, ox, y0 - 0.015, WALL_Z + 0.02, 0, 'none');
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = ox - OW / 2 + (c + 0.5) * (OW / COLS);
        const y = y0 + OH - (r + 0.5) * (OH / ROWS);
        const base = new Matrix4().makeTranslation(x, y, zf + 0.003);
        const index = slots.length;
        const label = index < WALL_DRAWER_LABELS.length * 4 && index % 4 === 0 ? WALL_DRAWER_LABELS[index / 4] ?? null : null;
        let lv: [number, number] | null = null;
        if (label) {
          const sz = tapeSizeMm(label, 3.2);
          const w = Math.min(DW - 0.006, sz.w / 1000);
          const h = sz.h / 1000;
          const slot = ctx.labels.draw(w * 14000, h * 14000, (g, ww, hh) => drawTape(g, ww, hh, label));
          labelPageMat = slot.page.material as MeshStandardMaterial;
          const q = prepGeometry(ctx.labels.quad(w, h, slot), new Matrix4().makeTranslation(x, y + DH * 0.18, zf + 0.0042));
          const n = q.getAttribute('position').count;
          lv = [labelVert, n];
          labelVert += n;
          labelGeos.push(q);
          labelIdx++;
        }
        slots.push({ index, base, open: 0, target: 0, label, labelVerts: lv });
      }
    }
  }
  const drawers = new InstancedMesh(drawerGeo(), mats.drawerClear, slots.length);
  drawers.name = 'wall.drawers';
  drawers.instanceMatrix.setUsage(DynamicDrawUsage);
  const contents = new InstancedMesh(boxGeo(DW - 0.012, 0.014, DD - 0.03), new MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.4 }), slots.length);
  contents.name = 'wall.drawers.contents';
  contents.instanceMatrix.setUsage(DynamicDrawUsage);
  contents.instanceColor = new InstancedBufferAttribute(new Float32Array(slots.length * 3), 3);
  const palette = ['#8a8d90', '#2a2a2a', '#c9a24a', '#b9bcbf', '#1b1b1b', '#d0211c', '#1f4fd1', '#e9e9e4'];
  const tmpC = new Color();
  const cOff = new Matrix4().makeTranslation(0, -DH / 2 + 0.01, -DD / 2);
  for (const s of slots) {
    drawers.setMatrixAt(s.index, s.base);
    contents.setMatrixAt(s.index, s.base.clone().multiply(cOff));
    contents.setColorAt(s.index, tmpC.set(palette[Math.floor(rnd() * palette.length)]!));
  }
  ctx.root.add(drawers, contents);
  const labelGeo = labelGeos.length ? mergeGeometries(labelGeos, false)! : new BufferGeometry();
  const labelBase = (labelGeo.getAttribute('position') as Float32BufferAttribute).array.slice() as Float32Array;
  (labelGeo.getAttribute('position') as Float32BufferAttribute).setUsage(DynamicDrawUsage);
  const labels = new Mesh(labelGeo, labelPageMat ?? mats.paperWhite);
  labels.name = 'wall.drawers.labels';
  ctx.root.add(labels);

  /* ── Husky rolling tool chest ── */
  const hk = getProp('chest.husky');
  const [hw, hd, hh] = hk.size!;
  const casterH = 0.1;
  const heights = [0.07, 0.09, 0.14, 0.14, 0.3];
  const huskyDrawers: { group: Group; open: number; target: number; item: CarriedItemId | null; itemGroup: Group | null; y: number; h: number }[] = [];
  b.at(hk.pos[0], 0, hk.pos[2], 0, () => {
    b.add(rboxGeo(hw, hh - casterH, hd, 0.012, 2), mats.huskyBlack, xf(0, casterH + (hh - casterH) / 2, 0));
    b.add(rboxGeo(hw + 0.01, 0.012, hd + 0.01, 0.004, 1), mats.rubberTip, xf(0, hh + 0.006, 0)); // top mat
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        b.box(0.05, 0.02, 0.05, mats.greySteel, sx * (hw / 2 - 0.05), casterH - 0.01, sz * (hd / 2 - 0.05));
        b.add(cylGeo(0.04, 0.04, 0.03, 16), mats.blackPlastic, xf(sx * (hw / 2 - 0.05), 0.04, sz * (hd / 2 - 0.05), 0, 0, Math.PI / 2));
      }
    // side handle
    b.add(torusGeo(0.08, 0.008, 6, 16, Math.PI), mats.steelChrome, xf(hw / 2 + 0.01, hh - 0.12, 0, 0, Math.PI / 2, -Math.PI / 2), 'none');
    // HUSKY badge (top front) + round emblem on the bottom drawer
    addPrint(ctx.labels, b, 0.12, 0.03, 256, 64, (g, w, h) => {
      g.fillStyle = '#0d0d0e';
      g.fillRect(0, 0, w, h);
      fitText(g, 'HUSKY', w, h, { color: '#d6d8db', font: FONT.UI_SANS, weight: 900, marginY: 0.12 });
    }, xf(0, hh - 0.03, hd / 2 + 0.0015));
  });
  let y = hh - 0.06;
  heights.forEach((h, i) => {
    y -= h;
    const g = new Group();
    g.name = `chest.husky.d${i + 1}`;
    g.position.set(hk.pos[0], y + h / 2, hk.pos[2] + hd / 2);
    const db = new StaticBatch(`husky-d${i + 1}`);
    db.add(rboxGeo(hw - 0.03, h - 0.008, 0.012, 0.004, 1), mats.huskyBlack, xf(0, 0, 0.006));
    // open drawer tray (bottom, sides, back) so the contents show when it slides out
    const tw = hw - 0.05;
    const td = hd - 0.06;
    const th = h - 0.02;
    const wt = 0.006;
    db.add(boxGeo(tw, wt, td), mats.satinBlack, xf(0, -0.002 - th / 2 + wt / 2, -hd / 2 + 0.02), 'none');
    for (const sx of [-1, 1]) db.add(boxGeo(wt, th, td), mats.satinBlack, xf(sx * (tw / 2 - wt / 2), -0.002, -hd / 2 + 0.02), 'none');
    db.add(boxGeo(tw, th, wt), mats.satinBlack, xf(0, -0.002, -hd / 2 + 0.02 - td / 2 + wt / 2), 'none');
    db.add(rboxGeo(hw - 0.06, 0.016, 0.022, 0.006, 2), mats.steelChrome, xf(0, h / 2 - 0.022, 0.022), 'none'); // full-width pull
    if (i === 4) {
      addPrint(ctx.labels, db, 0.07, 0.07, 128, 128, (gg, w, hh2) => {
        gg.fillStyle = '#121314';
        gg.fillRect(0, 0, w, hh2);
        gg.strokeStyle = '#c9ccd0';
        gg.lineWidth = 6;
        gg.beginPath();
        gg.arc(w / 2, hh2 / 2, w * 0.42, 0, Math.PI * 2);
        gg.stroke();
        fitText(gg, 'H', w, hh2, { color: '#c9ccd0', font: FONT.UI_SANS, weight: 900, marginX: 0.3, marginY: 0.3 });
      }, xf(0, -0.03, 0.0125));
    }
    if (i === 1) addTape(ctx, db, 'SPARE FLEX 2', 6, xf(-hw / 2 + 0.09, -h / 2 + 0.018, 0.0125));
    if (i === 2) addTape(ctx, db, 'SPARE MINI 3', 6, xf(-hw / 2 + 0.09, -h / 2 + 0.02, 0.0125));
    ctx.statics.flushInto(db, g); // drawers sit inside the chest body: no own shadow (draw-call budget)
    let itemGroup: Group | null = null;
    if (i === 1 || i === 2) {
      itemGroup = new Group();
      const ib = new StaticBatch(`husky-item-${i}`);
      if (i === 1) {
        // Flex 2 lying face-up in foam
        ib.box(hw - 0.08, 0.02, hd - 0.1, ctx.engine.materials.get('lab.foam', () => new MeshStandardMaterial({ color: '#2b2c2e', roughness: 1 })), 0, -h / 2 + 0.02, -hd / 2 + 0.01, 0, 'none');
        ib.add(rboxGeo(0.082, 0.024, 0.218, 0.006, 2), mats.labwhite, xf(0, -h / 2 + 0.042, -hd / 2 + 0.03, 0, Math.PI / 2, 0));
        ib.box(0.136, 0.001, 0.068, mats.screenGlass, 0.01, -h / 2 + 0.0545, -hd / 2 + 0.03, 0, 'none');
      } else {
        ib.add(rboxGeo(0.208, 0.09, 0.165, 0.01, 2), mats.labwhite, xf(0, -h / 2 + 0.055, -hd / 2 + 0.02));
        ib.box(0.172, 0.001, 0.108, mats.screenGlass, 0, -h / 2 + 0.101, -hd / 2 + 0.02, 0, 'none');
      }
      ctx.statics.flushInto(ib, itemGroup);
      g.add(itemGroup);
    }
    ctx.root.add(g);
    huskyDrawers.push({ group: g, open: 0, target: 0, item: i === 1 ? 'flex2-spare' : i === 2 ? 'mini3-spare' : null, itemGroup, y: y + h / 2, h });
  });

  /* ── storage cabinet ── */
  const sc = getProp('cabinet.storage');
  const [cw, cd, chh] = sc.size!;
  const legacy = new Group();
  b.at(sc.pos[0], 0, sc.pos[2], 0, () => {
    const t = 0.012;
    // carcass (back, sides, top, base) + lower doors + upper open shelves
    b.box(cw, chh, t, mats.cabinetGrey, 0, chh / 2, -cd / 2 + t / 2);
    for (const s of [-1, 1]) b.box(t, chh, cd, mats.cabinetGrey, s * (cw / 2 - t / 2), chh / 2, 0);
    b.box(cw, t, cd, mats.cabinetGrey, 0, chh - t / 2, 0);
    b.box(cw, 0.06, cd, mats.satinBlack, 0, 0.03, 0);
    for (const yy of [1.05, 1.45]) b.box(cw - 2 * t, 0.015, cd - t, mats.cabinetGrey, 0, yy - 0.0075, t / 2);
    // locked lower doors with keypad
    for (const s of [-1, 1]) {
      b.box(cw / 2 - 0.006, 0.98, 0.018, mats.cabinetGrey, s * (cw / 4), 0.55, cd / 2 - 0.009);
      b.box(0.012, 0.18, 0.025, mats.steelChrome, s * 0.04, 0.68, cd / 2 + 0.005, 0, 'none');
    }
    b.add(rboxGeo(0.07, 0.11, 0.03, 0.006, 1), mats.satinBlack, xf(0.16, 0.8, cd / 2 + 0.015));
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b.add(rboxGeo(0.014, 0.012, 0.004, 0.002, 1), mats.darkGreyPlastic, xf(0.16 - 0.018 + c * 0.018, 0.835 - r * 0.02, cd / 2 + 0.031), 'none');
    ctx.leds.add({ pos: [sc.pos[0] + 0.16, 0.85 + 0.004, sc.pos[2] + cd / 2 + 0.031], normal: [0, 0, 1], color: '#ff2614', size: 0.003 });
    for (let i = 0; i < 8; i++) b.box(0.3, 0.004, 0.003, mats.greySteel, -0.25, 0.2 + i * 0.012, cd / 2 + 0.001, 0, 'none'); // vents
    addPrint(ctx.labels, b, 0.32, 0.05, 640, 100, (g, w, h) => drawPlate(g, w, h, `SPARES — SIGN OUT WITH ${personName(HARDWARE_LEAD).toUpperCase()}`, { bg: '#fff3c4', fg: '#1b1b1b', border: '#d0211c' }), xf(-0.2, 0.98, cd / 2 + 0.0005));
    // LabSim boxes on the upper shelves
    const box = (x: number, yy: number, w: number, h: number, d: number, label: string) => {
      b.add(boxGeo(w, h, d), mats.whiteEnamel, xf(x, yy + h / 2, 0.0));
      b.box(w + 0.001, 0.02, d + 0.001, mats.greenPaint, x, yy + h * 0.65, 0, 0, 'none');
      addTape(ctx, b, label, 5, xf(x, yy + h * 0.35, d / 2 + 0.0008));
    };
    box(-0.32, 1.45, 0.26, 0.18, 0.3, 'FLEX 3 · BOXED');
    box(-0.03, 1.45, 0.22, 0.16, 0.28, 'MINI 3 · BOXED');
    box(0.27, 1.45, 0.34, 0.24, 0.32, 'STATION DUO');
    b.add(boxGeo(0.3, 0.2, 0.3), mats.cardboard, xf(0.3, 1.05 + 0.1, 0));
    addTape(ctx, b, 'CRADLES — OLD', 5, xf(0.3, 1.18, 0.1505));
  });
  // legacy Flex 1 (shown once it has been placed)
  legacy.position.set(sc.pos[0] - 0.25, 1.05, sc.pos[2] + 0.02);
  {
    const lb = new StaticBatch('legacy-flex1');
    lb.add(rboxGeo(0.084, 0.026, 0.205, 0.006, 2), mats.labwhite, xf(0, 0.013, 0));
    lb.box(0.062, 0.001, 0.11, mats.screenGlass, 0, 0.0265, 0.02, 0, 'none');
    addTape(ctx, lb, 'LEGACY · FLEX 1', 5, xf(0, 0.027, -0.07, -Math.PI / 2, 0, 0));
    ctx.statics.flushInto(lb, legacy);
  }
  legacy.visible = false;
  ctx.root.add(legacy);
  ctx.statics.add(b);

  /* ── interactions ── */
  const binChoice = { red: 0, blue: 0 };
  const RED_ITEMS: { label: string; take: () => boolean }[] = [
    { label: 'spare Pi', take: () => carry('pi-spare', 'Spare Raspberry Pi', 'pi-spare', WALL_BINS.red.id) },
    { label: 'SD card', take: () => takePart('sd-card', 'SD card') },
    { label: '10 A fuse', take: () => takeFuse(10) && (toast('success', 'Took a 10 A blade fuse'), true) },
  ];
  const BLUE_ITEMS: { label: string; take: () => boolean }[] = [
    { label: 'Ethernet cable', take: () => takePart('ethernet-cable', 'Ethernet cable') },
    { label: 'USB-C lead', take: () => takePart('usb-lead', 'USB-C lead') },
    { label: 'micro-USB lead', take: () => takePart('micro-usb-lead', 'micro-USB lead') },
  ];
  for (const [id, bin, items, k] of [[WALL_BINS.red.id, redBin, RED_ITEMS, 'red'], [WALL_BINS.blue.id, blueBin, BLUE_ITEMS, 'blue']] as const) {
    ctx.ia.register(id, binProxy(bin), () => {
      const sel = items[binChoice[k] % items.length]!;
      return pickVerbs([
        { key: 'E', label: `Take ${sel.label}`, run: () => void sel.take() },
        { key: 'R', label: 'Next item', run: () => void (binChoice[k] = (binChoice[k] + 1) % items.length) },
      ]);
    });
  }
  // labelled drawers
  for (const s of slots) {
    if (!s.label) continue;
    const label = s.label;
    const pos = new Vector3().setFromMatrixPosition(s.base);
    const proxy = ctx.ia.proxy(ctx.root, DW, DH, 0.03, new Matrix4().makeTranslation(pos.x, pos.y, pos.z + 0.01), `drawer-${label}`);
    const item = DRAWER_ITEM[label];
    ctx.ia.register(wallDrawerId(label), proxy, () =>
      pickVerbs([
        s.target > 0.5 && item
          ? {
              key: 'E',
              label: `Take ${item.name}`,
              run: () => {
                if (item.fuse) void (takeFuse(item.fuse) && toast('success', `Took a ${item.fuse} A blade fuse`));
                else if (item.part) takePart(item.part, item.name);
                s.target = 0;
                engine.audio.play('door', { position: [pos.x, pos.y, pos.z], volume: 0.15, rate: 2.2 });
              },
            }
          : {
              key: 'E',
              label: s.target > 0.5 ? 'Close' : 'Open',
              run: () => {
                s.target = s.target > 0.5 ? 0 : 1;
                engine.audio.play('door', { position: [pos.x, pos.y, pos.z], volume: 0.15, rate: 2.2 });
              },
            },
        { key: 'R', label: 'Close', show: () => s.target > 0.5, run: () => void (s.target = 0) },
      ]),
    );
  }
  // Husky drawers
  huskyDrawers.forEach((d, i) => {
    const n = i + 1;
    // front face + the whole tray: an open drawer stays targetable when looking down into it
    const proxy = ctx.ia.proxy(d.group, hw - 0.02, d.h - 0.004, hd - 0.03, xf(0, 0, 0.03 - (hd - 0.03) / 2), `husky-d${n}`);
    const itemLabel = d.item === 'flex2-spare' ? 'SPARE FLEX 2' : d.item === 'mini3-spare' ? 'SPARE MINI 3' : null;
    ctx.ia.register(`chest.husky.d${n}`, proxy, () =>
      pickVerbs([
        {
          key: 'E',
          label: d.target > 0.5 ? 'Close' : 'Open',
          run: () => {
            d.target = d.target > 0.5 ? 0 : 1;
            engine.audio.play('door', { position: [hk.pos[0], d.y, hk.pos[2] + 0.25], volume: 0.35, rate: 1.4 });
          },
        },
        {
          key: 'R',
          label: `Take ${itemLabel ?? ''}`,
          show: () => !!itemLabel && d.target > 0.5 && !!d.itemGroup?.visible,
          run: () => {
            const lab = store.getState().lab;
            const want = d.item === 'flex2-spare' ? 'FLEX_2' : 'MINI_3';
            const dev = lab?.devices ? Object.values(lab.devices).find((x) => x.rigId === `husky-drawer-${n}` || (x.rigId?.startsWith('husky') && x.type === want)) : undefined;
            if (carry(d.item!, itemLabel === 'SPARE FLEX 2' ? 'Spare Flex 2' : 'Spare Mini 3', dev?.id ?? (d.item === 'flex2-spare' ? 'dev-spare-flex2' : 'dev-spare-mini3'), `chest.husky.d${n}`)) {
              toast('success', `Took the ${itemLabel?.toLowerCase()}`, 'Carry it to the rig and E on the cradle to install.');
            }
          },
        },
      ]),
    );
  });
  // storage cabinet
  const cabProxy = ctx.ia.proxy(ctx.root, cw, 1.0, 0.05, xf(sc.pos[0], 0.55, sc.pos[2] + cd / 2), 'cabinet');
  let signOutAt = -1;
  let now = 0;
  ctx.ia.register('cabinet.storage', cabProxy, () =>
    pickVerbs([
      {
        key: 'E',
        label: signOutAt > 0 ? `Signing out… ${Math.max(0, Math.ceil(120 - (now - signOutAt)))} s` : 'Sign out spare',
        blocked: () => (signOutAt > 0 ? `${personName(HARDWARE_LEAD)} is fetching the key` : null),
        run: () => {
          signOutAt = now;
          emit('app.action', { app: 'world', action: 'storage.signOut', data: { item: 'collis-probe-spare' } });
          toast('info', 'Storage cabinet', `Sign-out requested — ${personName(HARDWARE_LEAD)} will unlock it in about 2 minutes.`);
        },
      },
    ]),
  );
  const legacyProxy = ctx.ia.proxy(ctx.root, 0.4, 0.3, 0.4, xf(sc.pos[0] - 0.25, 1.2, sc.pos[2]), 'legacy-shelf');
  ctx.ia.register('cabinet.storage.legacy-shelf', legacyProxy, () => {
    const carried = store.getState().session.items.carried;
    return pickVerbs([
      carried?.id === 'flex1-legacy' || (carried?.id === 'device' && /flex.?1/i.test(carried.label))
        ? {
            key: 'E',
            label: `Place ${carried.label}`,
            run: () => {
              if (placeCarried('cabinet.storage.legacy-shelf', true)) {
                legacy.visible = true;
                engine.audio.play('plug-in', { position: [sc.pos[0] - 0.25, 1.06, sc.pos[2]], volume: 0.3, rate: 0.6 });
              }
            },
          }
        : {
            key: 'E',
            label: legacy.visible ? 'Take legacy Flex 1' : 'Place / Take',
            blocked: () => (legacy.visible ? null : 'Shelf is empty — bring the legacy Flex 1 here'),
            run: () => {
              if (carry('flex1-legacy', 'Legacy Flex 1', 'dev-legacy-flex1', 'cabinet.storage.legacy-shelf')) legacy.visible = false;
            },
          },
    ]);
  });

  /* ── per-frame: drawer animation + Husky contents ── */
  const tmpM = new Matrix4();
  const lpos = labelGeo.getAttribute('position') as Float32BufferAttribute | undefined;
  ctx.hooks.push((dt, t, lab) => {
    now = t;
    if (signOutAt > 0 && t - signOutAt >= 120) {
      signOutAt = -1;
      if (carry('collis-probe-spare', 'Spare Collis probe', 'collis-spare', 'cabinet.storage')) toast('success', 'Spare Collis probe signed out', 'Plug its brick into an AC strip — never a DC tap.');
    }
    let moved = false;
    let labelsMoved = false;
    for (const s of slots) {
      if (s.open === s.target) continue;
      s.open += Math.sign(s.target - s.open) * Math.min(Math.abs(s.target - s.open), dt * 5);
      const off = s.open * 0.1;
      tmpM.makeTranslation(0, 0, off).multiply(s.base);
      drawers.setMatrixAt(s.index, tmpM);
      contents.setMatrixAt(s.index, tmpM.clone().multiply(cOff));
      moved = true;
      if (s.labelVerts && lpos) {
        const [start, n] = s.labelVerts;
        for (let v = start; v < start + n; v++) lpos.setZ(v, labelBase[v * 3 + 2]! + off);
        labelsMoved = true;
      }
    }
    if (moved) {
      drawers.instanceMatrix.needsUpdate = true;
      contents.instanceMatrix.needsUpdate = true;
    }
    if (labelsMoved && lpos) {
      lpos.needsUpdate = true;
      labelGeo.computeBoundingSphere();
    }
    for (const d of huskyDrawers) {
      if (d.open !== d.target) {
        d.open += Math.sign(d.target - d.open) * Math.min(Math.abs(d.target - d.open), dt * 3);
        d.group.position.z = hk.pos[2] + hd / 2 + d.open * (hd - 0.08);
      }
      if (d.itemGroup) {
        const carried = store.getState().session.items.carried?.id === d.item;
        const want = d.item === 'flex2-spare' ? 'FLEX_2' : 'MINI_3';
        const devs = lab?.devices ? Object.values(lab.devices) : [];
        const simKnows = devs.some((x) => x.rigId?.startsWith('husky'));
        const inDrawer = simKnows ? devs.some((x) => x.rigId?.startsWith('husky') && x.type === want) : true;
        d.itemGroup.visible = !carried && inDrawer;
      }
    }
  });
  void cylGeo;
  void planeGeo;
  void labelIdx;
}
