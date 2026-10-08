/**
 * 3D print corner (World §1.4 "print corner", §3.6, §9.2): birch bench, Prusa MK4-style
 * bed-slinger (black frame, orange printed parts, LCD + knob, spool on top), Bambu Lab enclosed
 * CoreXY with AMS, CAD laptop, wall filament rack, the clear parts bin with the spare cradle,
 * drybox, and the Lab Safety Card holder on the west wall. Printer LCDs + motion follow
 * `lab.printer3d` (start via `sim.printer3d.start`).
 */
import { Group, Mesh, MeshStandardMaterial, type Material } from 'three';
import { bus } from '@/core/bus';
import { emit, mutate, store } from '@/core/store';
import { sim } from '@/sim';
import type { LabState } from '@/sim/types';
import { getProp, uprightFocusPose, LOCATION_BY_ID } from '../layout';
import { StaticBatch, xf } from './kit/batch';
import { boxGeo, cylGeo, latheGeo, rboxGeo, torusGeo, tubeGeo, type V3 } from './kit/shapes';
import { addPrint, addTape, type LabCtx } from './kit/context';
import { redrawSlot } from './kit/atlas';
import { pickVerbs, simCall, showCallouts, toast } from './kit/runtime';
import { carry } from './kit/inventory';
import { rad, screwAt } from './kit/shared';
import { throttle } from './kit/bind';
import { laptop } from './props/furniture';
import { drawCad, drawPrinterLcd } from './props/screenArt';
import { drawSafetyCard } from './props/posters';

const mm = (v: number) => v / 1000;
type PrinterKey = 'prusa' | 'bambu';

function printerState(lab: LabState, k: PrinterKey): { busy: boolean; job: string | null; endsPhysMs: number | null } {
  return lab?.printer3d?.printers?.[k] ?? { busy: false, job: null, endsPhysMs: null };
}

/** Spool (Ø 200 × 70) lying on its axis along local X. */
function spool(ctx: LabCtx, b: StaticBatch, mat: Material): void {
  const { mats } = ctx;
  for (const s of [-1, 1]) b.add(cylGeo(0.1, 0.1, 0.004, 28), mats.blackPlastic, xf(s * 0.033, 0, 0, 0, 0, Math.PI / 2));
  b.add(cylGeo(0.088, 0.088, 0.062, 28), mat, xf(0, 0, 0, 0, 0, Math.PI / 2));
  b.add(cylGeo(0.027, 0.027, 0.072, 16, true), mats.blackPlastic, xf(0, 0, 0, 0, 0, Math.PI / 2), 'none');
}

export function buildFab(ctx: LabCtx): void {
  const { mats, engine } = ctx;
  const b = new StaticBatch('fab');
  const bench = getProp('bench.fab');
  const [W, D, H] = bench.size!;
  b.at(bench.pos[0], 0, bench.pos[2], 0, () => {
    b.add(rboxGeo(W, 0.03, D, 0.004, 1), mats.birchLaminate, xf(0, H - 0.015, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.045, H - 0.03, 0.045, mats.satinBlack, sx * (W / 2 - 0.04), (H - 0.03) / 2, sz * (D / 2 - 0.04));
    b.box(W - 0.06, 0.018, D - 0.06, mats.birchLaminate, 0, 0.25 - 0.009, 0);
    for (const sz of [-1, 1]) b.box(W - 0.08, 0.05, 0.025, mats.satinBlack, 0, H - 0.055, sz * (D / 2 - 0.04));
  });

  /* ── Prusa MK4 ── */
  const pr = getProp('fab.printer-prusa');
  const prusaBed = new Group();
  const prusaHead = new Group();
  const prusaSlot = ctx.screens.draw(128, 64, (g, w, h) => drawPrinterLcd(g, w, h, 'prusa', 0, false));
  b.at(pr.pos[0], pr.pos[1], pr.pos[2], 0, () => {
    // base: 2 front-to-back extrusions + front/back plates + PSU
    for (const s of [-1, 1]) b.box(0.03, 0.03, 0.44, mats.satinBlack, s * 0.12, 0.05, 0);
    b.box(0.32, 0.07, 0.025, mats.satinBlack, 0, 0.035, 0.21);
    b.box(0.32, 0.06, 0.025, mats.satinBlack, 0, 0.03, -0.21);
    b.box(0.07, 0.05, 0.2, mats.satinBlack, 0.2, 0.04, -0.08); // PSU
    for (const s of [-1, 1]) b.add(rboxGeo(0.03, 0.012, 0.04, 0.004, 1), mats.rubberTip, xf(s * 0.14, 0.006, s * 0.18), 'none');
    // front LCD panel (orange housing) + knob
    b.add(rboxGeo(0.13, 0.065, 0.03, 0.006, 2), mats.orangePla, xf(-0.06, 0.06, 0.24, -0.35, 0, 0));
    b.add(ctx.screens.quad(0.075, 0.04, prusaSlot), prusaSlot.page.material, xf(-0.07, 0.063, 0.2565, -0.35, 0, 0), 'none');
    b.add(cylGeo(0.012, 0.012, 0.012, 18), mats.orangePla, xf(0.035, 0.055, 0.258, Math.PI / 2 - 0.35, 0, 0), 'none');
    // portal frame (black aluminium) with orange Z-top printed parts
    b.box(0.38, 0.04, 0.03, mats.satinBlack, 0, 0.53, -0.02);
    for (const s of [-1, 1]) {
      b.box(0.04, 0.48, 0.03, mats.satinBlack, s * 0.17, 0.3, -0.02);
      b.add(rboxGeo(0.06, 0.05, 0.05, 0.006, 1), mats.orangePla, xf(s * 0.15, 0.53, 0.0));
      b.add(cylGeo(0.004, 0.004, 0.44, 8), mats.chrome, xf(s * 0.14, 0.3, 0.02), 'none'); // Z rods
      b.add(cylGeo(0.004, 0.004, 0.44, 8), mats.brass, xf(s * 0.12, 0.3, 0.02), 'none'); // lead screws
      b.add(rboxGeo(0.042, 0.042, 0.04, 0.004, 1), mats.satinBlack, xf(s * 0.14, 0.09, 0.0)); // Z motors
    }
    // spool holder + spool on top
    b.add(boxGeo(0.02, 0.06, 0.02), mats.orangePla, xf(0, 0.58, -0.02));
    b.within(xf(0, 0.69, -0.03), () => spool(ctx, b, ctx.engine.materials.get('lab.filamentOrange', () => new MeshStandardMaterial({ color: '#e56a1c', roughness: 0.5 }))));
    b.add(tubeGeo([[0.02, 0.64, -0.03], [0.1, 0.5, 0.0], [0.05, 0.38, 0.02]], 0.0009, 4, 80), ctx.engine.materials.get('lab.filamentOrange', () => new MeshStandardMaterial({ color: '#e56a1c' })), null, 'none');
    addTape(ctx, b, 'PRUSA MK4', 6, xf(0, 0.53, -0.004));
  });
  // moving bed (Y) and X-gantry head as groups
  prusaBed.position.set(pr.pos[0], pr.pos[1] + 0.085, pr.pos[2]);
  {
    const bb = new StaticBatch('prusa-bed');
    bb.box(0.25, 0.006, 0.21, mats.satinBlack, 0, 0, 0);
    bb.box(0.254, 0.0015, 0.214, mats.brass, 0, 0.0037, 0, 0, 'none'); // textured PEI sheet (gold)
    bb.box(0.2, 0.012, 0.18, mats.lightGreyMetal, 0, -0.01, 0, 0, 'none');
    ctx.statics.flushInto(bb, prusaBed);
  }
  ctx.root.add(prusaBed);
  prusaHead.position.set(pr.pos[0], pr.pos[1] + 0.24, pr.pos[2] + 0.02);
  {
    const hb = new StaticBatch('prusa-x');
    for (const yy of [0, 0.045]) hb.add(cylGeo(0.004, 0.004, 0.34, 8), mats.chrome, xf(0, yy, -0.01, 0, 0, Math.PI / 2), 'none');
    for (const s of [-1, 1]) hb.add(rboxGeo(0.05, 0.07, 0.04, 0.005, 1), mats.orangePla, xf(s * 0.14, 0.022, -0.01));
    ctx.statics.flushInto(hb, prusaHead);
    const ex = new Group();
    ex.name = 'extruder';
    const eb = new StaticBatch('prusa-extruder');
    eb.add(rboxGeo(0.05, 0.07, 0.045, 0.006, 2), mats.orangePla, xf(0, 0.02, 0.015));
    eb.add(rboxGeo(0.042, 0.042, 0.03, 0.004, 1), mats.satinBlack, xf(0, 0.055, -0.005)); // motor
    eb.add(cylGeo(0.016, 0.016, 0.006, 16), mats.satinBlack, xf(0.028, 0.0, 0.02, 0, 0, Math.PI / 2), 'none'); // fan
    eb.add(cylGeo(0.003, 0.001, 0.012, 8), mats.brass, xf(0, -0.022, 0.015), 'none'); // nozzle
    ctx.statics.flushInto(eb, ex);
    prusaHead.add(ex);
  }
  ctx.root.add(prusaHead);
  const prusaProxy = ctx.ia.proxy(ctx.root, 0.5, 0.62, 0.55, xf(pr.pos[0], pr.pos[1] + 0.31, pr.pos[2]), 'prusa');

  /* ── Bambu Lab (enclosed CoreXY + AMS) ── */
  const bm = getProp('fab.printer-bambu');
  const [bw, bd] = [bm.size![0], bm.size![1]];
  const bambuSlot = ctx.screens.draw(192, 108, (g, w, h) => drawPrinterLcd(g, w, h, 'bambu', 0, false));
  const bambuHead = new Group();
  const shell = ctx.engine.materials.get('lab.bambuShell', () => new MeshStandardMaterial({ color: '#2b2d30', roughness: 0.55 }));
  const bodyH = 0.48;
  b.at(bm.pos[0], bm.pos[1], bm.pos[2], 0, () => {
    // shell: back, sides, base and top frame (front door + top lid are glass)
    b.add(rboxGeo(bw, 0.07, bd, 0.012, 2), shell, xf(0, 0.035, 0));
    for (const s of [-1, 1]) b.box(0.02, bodyH - 0.07, bd, shell, s * (bw / 2 - 0.01), 0.07 + (bodyH - 0.07) / 2, 0);
    b.box(bw, bodyH - 0.07, 0.02, shell, 0, 0.07 + (bodyH - 0.07) / 2, -bd / 2 + 0.01);
    b.box(bw, 0.025, bd, shell, 0, bodyH - 0.0125, 0);
    b.add(boxGeo(bw - 0.03, bodyH - 0.12, 0.004), mats.glassDark, xf(0, 0.07 + (bodyH - 0.1) / 2, bd / 2 - 0.004), 'none');
    b.box(0.012, 0.12, 0.012, mats.blackPlastic, bw / 2 - 0.03, 0.27, bd / 2 + 0.004, 0, 'none'); // door handle
    // front screen top-left of the base
    b.add(ctx.screens.quad(0.07, 0.04, bambuSlot), bambuSlot.page.material, xf(-bw / 2 + 0.06, 0.035, bd / 2 + 0.0015), 'none');
    addTape(ctx, b, 'Bambu Lab', 5, xf(0.08, 0.035, bd / 2 + 0.0015), { bg: '#2b2d30', fg: '#e8e8e8' });
    // interior: bed + rods, chamber light
    b.box(bw - 0.07, 0.006, bd - 0.1, mats.brass, 0, 0.16, 0.0, 0, 'none');
    for (const s of [-1, 1]) b.add(cylGeo(0.004, 0.004, bodyH - 0.12, 8), mats.chrome, xf(s * (bw / 2 - 0.045), 0.07 + (bodyH - 0.12) / 2, -bd / 2 + 0.05), 'none');
    // AMS on top: 4 spool bays under a smoked lid
    b.add(rboxGeo(bw - 0.01, 0.17, bd - 0.07, 0.012, 2), mats.offWhitePlastic, xf(0, bodyH + 0.085, -0.02));
    b.add(boxGeo(bw - 0.04, 0.09, 0.004), mats.smokedPlastic, xf(0, bodyH + 0.11, bd / 2 - 0.05), 'none');
    const cols = ['#111111', '#7d8085', '#f2f2f2', '#2fb34f'];
    cols.forEach((c, i) => b.within(xf(-0.12 + i * 0.08, bodyH + 0.1, -0.02, 0, Math.PI / 2, 0), () => {
      const m = ctx.engine.materials.get(`lab.filament.${c}`, () => new MeshStandardMaterial({ color: c, roughness: 0.5 }));
      b.add(cylGeo(0.07, 0.07, 0.055, 24), m, xf(0, 0, 0, 0, 0, Math.PI / 2), 'none');
    }));
    b.add(tubeGeo([[0.1, bodyH + 0.15, -0.15], [0.17, bodyH + 0.2, -0.22], [0.12, bodyH, -0.22], [0.05, bodyH - 0.03, -0.1]], 0.002, 6, 30), mats.glassClear, null, 'none'); // PTFE tube
  });
  bambuHead.position.set(bm.pos[0], bm.pos[1] + 0.36, bm.pos[2]);
  {
    const hb = new StaticBatch('bambu-head');
    hb.add(rboxGeo(0.05, 0.06, 0.05, 0.008, 2), mats.offWhitePlastic, xf(0, 0, 0));
    hb.add(cylGeo(0.003, 0.003, bw - 0.08, 6), mats.chrome, xf(0, 0.03, 0, 0, 0, Math.PI / 2), 'none');
    ctx.statics.flushInto(hb, bambuHead);
  }
  ctx.root.add(bambuHead);
  const bambuProxy = ctx.ia.proxy(ctx.root, bw, 0.71, bd, xf(bm.pos[0], bm.pos[1] + 0.355, bm.pos[2]), 'bambu');

  /* ── CAD laptop ── */
  const lp = getProp('fab.laptop-cad');
  const cadSlot = ctx.screens.draw(512, 320, drawCad);
  b.at(lp.pos[0], lp.pos[1], lp.pos[2], rad(lp.rotY), () => laptop(ctx, b, cadSlot.page.material, (w, h) => ctx.screens.quad(w, h, cadSlot), 110));
  const lapProxy = ctx.ia.proxy(ctx.root, 0.36, 0.25, 0.3, xf(lp.pos[0], lp.pos[1] + 0.1, lp.pos[2]), 'laptop');
  b.at(lp.pos[0] + 0.2, lp.pos[1], lp.pos[2] + 0.05, 0, () => b.add(rboxGeo(0.06, 0.035, 0.1, 0.015, 3), mats.satinBlack, xf(0, 0.017, 0))); // 3D mouse puck

  /* ── wall filament rack ── */
  const fr = getProp('fab.filament-rack');
  const [fw, fd, fh] = fr.size!;
  const spoolCols = ['#151515', '#151515', '#151515', '#7d8085', '#151515', '#f2f2f2', '#151515', '#2fb34f'];
  b.at(fr.pos[0], fr.pos[1], -4.999, 0, () => {
    for (const s of [-1, 1]) b.box(0.025, fh, fd, mats.satinBlack, s * (fw / 2 - 0.0125), 0, fd / 2);
    for (const yy of [-fh / 2 + 0.02, 0]) b.box(fw, 0.02, fd, mats.birchLaminate, 0, yy, fd / 2);
    for (const [r, yy] of [[0, -fh / 2 + 0.02 + 0.11], [1, 0.11]] as const) {
      b.add(cylGeo(0.008, 0.008, fw - 0.05, 10), mats.chrome, xf(0, yy, fd / 2, 0, 0, Math.PI / 2), 'none');
      for (let i = 0; i < 4; i++) {
        const c = spoolCols[r * 4 + i]!;
        const m = ctx.engine.materials.get(`lab.filament.${c}`, () => new MeshStandardMaterial({ color: c, roughness: 0.5 }));
        b.within(xf(-fw / 2 + 0.17 + i * 0.32, yy, fd / 2), () => spool(ctx, b, m));
      }
    }
    for (const s of [-1, 1]) for (const yy of [-fh / 2 + 0.05, fh / 2 - 0.05]) screwAt(ctx, b, s * (fw / 2 - 0.0125), yy, fd + 0.0005);
  });

  /* ── parts bin + spare cradle, drybox ── */
  const pb = getProp('fab.parts-bin');
  const [pw, pd, ph] = pb.size!;
  b.at(pb.pos[0], pb.pos[1], pb.pos[2], 0, () => {
    b.box(pw, 0.004, pd, mats.drawerClear, 0, 0.002, 0, 0, 'none');
    for (const s of [-1, 1]) {
      b.box(0.004, ph, pd, mats.drawerClear, s * pw / 2, ph / 2, 0, 0, 'none');
      b.box(pw, ph, 0.004, mats.drawerClear, 0, ph / 2, s * pd / 2, 0, 'none');
    }
    // a jumble of black printed fixtures
    for (let i = 0; i < 7; i++) b.add(rboxGeo(0.05 + (i % 3) * 0.02, 0.02, 0.04 + (i % 2) * 0.03, 0.004, 1), mats.blackPla, xf(-0.1 + (i % 4) * 0.06, 0.012 + Math.floor(i / 4) * 0.02, -0.05 + (i % 3) * 0.04, 0.2 * i, 0.7 * i, 0.1 * i), 'none');
    addTape(ctx, b, 'PRINTED FIXTURES', 5, xf(0, ph * 0.6, pd / 2 + 0.003));
  });
  const sc = getProp('fab.spare-cradle');
  const cradle = new Group();
  cradle.position.set(sc.pos[0] + 0.07, sc.pos[1] + 0.02, sc.pos[2]);
  cradle.rotation.set(0, 0.3, 0.12);
  {
    const cb = new StaticBatch('spare-cradle');
    cb.add(rboxGeo(0.1, 0.012, 0.23, 0.003, 1), mats.blackPla, xf(0, 0, 0));
    for (const s of [-1, 1]) cb.add(rboxGeo(0.012, 0.035, 0.22, 0.003, 1), mats.blackPla, xf(s * 0.045, 0.02, 0));
    cb.add(rboxGeo(0.1, 0.03, 0.012, 0.003, 1), mats.blackPla, xf(0, 0.015, 0.11));
    ctx.statics.flushInto(cb, cradle);
  }
  ctx.root.add(cradle);
  const db = getProp('fab.drybox');
  b.at(db.pos[0], db.pos[1], db.pos[2], 0, () => {
    b.add(rboxGeo(0.4, 0.25, 0.25, 0.015, 2), mats.offWhitePlastic, xf(0, 0.125, 0));
    b.add(boxGeo(0.3, 0.16, 0.003), mats.glassClear, xf(0, 0.13, 0.126), 'none');
    b.within(xf(0, 0.12, 0, 0, 0, 0), () => spool(ctx, b, mats.satinBlack));
    b.box(0.06, 0.03, 0.002, ctx.engine.materials.get('lab.lcd', () => new MeshStandardMaterial({ color: '#9fae8f', roughness: 0.3 })), 0.14, 0.21, 0.126, 0, 'none');
  });

  /* ── Lab Safety Card holder (west wall) ── */
  const sfc = getProp('wall.safety-card');
  b.at(-6.999, sfc.pos[1], sfc.pos[2], Math.PI / 2, () => {
    b.box(0.12, 0.17, 0.004, mats.glassClear, 0, 0, 0.026, 0, 'none');
    b.box(0.12, 0.012, 0.03, mats.glassClear, 0, -0.085, 0.015, 0, 'none');
    for (const s of [-1, 1]) b.box(0.004, 0.17, 0.03, mats.glassClear, s * 0.06, 0, 0.015, 0, 'none');
    for (let k = 0; k < 3; k++) addPrint(ctx.prints, b, 0.105, 0.148, 210, 296, drawSafetyCard, xf(0, -0.005 + k * 0.001, 0.008 + k * 0.004));
  });
  const cardProxy = ctx.ia.proxy(ctx.root, 0.03, 0.17, 0.12, xf(-6.985, sfc.pos[1], sfc.pos[2]), 'safety-card');

  ctx.statics.add(b);

  /* ── interactions ── */
  const startOrCheck = (k: PrinterKey) => () => {
    const L = store.getState().lab;
    const st = printerState(L, k);
    if (st.busy) {
      const left = st.endsPhysMs != null ? Math.max(0, Math.round((st.endsPhysMs - (L.time?.physMs ?? 0)) / 1000)) : null;
      toast('info', k === 'prusa' ? 'Prusa MK4' : 'Bambu Lab', `Printing ${st.job ?? 'a part'}${left != null ? ` — ${left} s left` : ''}.`);
      return;
    }
    const out = L?.printer3d?.output ?? [];
    if (out.length) toast('info', 'Print tray', `Finished: ${out.join(', ')} — pick it up from the parts bin.`);
    // the sim prints `.3mf` files exported to the CAD PC (~/CAD/, Sim §3 printer3d)
    const r = simCall<{ endsPhysMs: number }>('Start print', () => sim.printer3d.start(k, 'cradle_flex_gen3.3mf', 'player'));
    if (r?.ok) {
      engine.audio.play('ui-click');
      const secs = r.value ? Math.max(1, Math.round((r.value.endsPhysMs - (store.getState().lab.time?.physMs ?? 0)) / 1000)) : 90;
      toast('success', 'Print started', `cradle_flex_gen3.3mf — replacement cradle (black PLA), about ${secs} s.`);
    }
  };
  ctx.ia.register('fab.printer-prusa', prusaProxy, () => pickVerbs([{ key: 'E', label: printerState(store.getState().lab, 'prusa').busy ? 'Check print' : 'Start print', run: startOrCheck('prusa') }]));
  ctx.ia.register('fab.printer-bambu', bambuProxy, () => pickVerbs([{ key: 'E', label: printerState(store.getState().lab, 'bambu').busy ? 'Check print' : 'Start print', run: startOrCheck('bambu') }]));
  const lapFace: V3 = [lp.pos[0], lp.pos[1] + 0.12, lp.pos[2] - 0.09];
  const lapN = [Math.sin(rad(lp.rotY)), 0.25, Math.cos(rad(lp.rotY))] as V3;
  ctx.ia.register('fab.laptop-cad', lapProxy, () =>
    pickVerbs([
      {
        key: 'E',
        label: 'Look',
        run: () => {
          engine.exitPointerLock();
          void engine.focus(uprightFocusPose(lapFace, lapN), 500);
          mutate((s) => void (s.ui.overlay = { kind: 'inspect', propId: 'fab.laptop-cad' }));
        },
      },
    ]),
  );
  ctx.ia.register('fab.spare-cradle', cradle, () => pickVerbs([{ key: 'E', label: 'Pick up', run: () => void carry('cradle-new', 'Printed cradle', 'cradle_flex_gen3', 'fab.spare-cradle') }]));
  // One card per activity: once it is in your pocket the holder offers a re-read, not another card
  // (a new lesson / shift / Free Play run starts with the card back in the holder).
  let cardTaken = false;
  bus.on('session.started', () => {
    cardTaken = false;
  });
  const cardLines = ['LAB SAFETY CARD', '1. Never touch a robot while a test is running.', '2. If you move an arm by hand, Park All before you walk away.', '3. Terminals & Collis probes: AC strips only — never the DC rails.'];
  ctx.ia.register('wall.safety-card', cardProxy, () =>
    pickVerbs([
      cardTaken
        ? {
            key: 'E',
            label: 'Read card',
            run: () => {
              engine.audio.play('ui-click');
              showCallouts('wall.safety-card', cardLines);
            },
          }
        : {
            key: 'E',
            label: 'Take card',
            run: () => {
              cardTaken = true;
              engine.audio.play('ui-click');
              showCallouts('wall.safety-card', cardLines);
              emit('app.action', { app: 'world', action: 'safetyCard.taken' });
              emit('item.pickedUp', { itemId: 'safety-card', ref: null, from: 'wall.safety-card' });
            },
          },
    ]),
  );

  /* ── per-frame: printers ── */
  const lcdShown: Record<string, string> = {};
  const lcdTick = throttle(1);
  const centre = LOCATION_BY_ID['loc.print-corner']?.center ?? [-5.75, 0, -3.75];
  const prusaBaseZ = prusaBed.position.z;
  const headBaseX = pr.pos[0];
  let printLoop: ReturnType<typeof engine.audio.loop> | null = null;
  ctx.hooks.push((_dt, t, lab) => {
    const pBusy = printerState(lab, 'prusa').busy;
    const bBusy = printerState(lab, 'bambu').busy;
    // motion while printing: bed slings in Y, head sweeps in X
    if (pBusy) {
      prusaBed.position.z = prusaBaseZ + Math.sin(t * 2.3) * 0.06;
      const ex = prusaHead.getObjectByName('extruder');
      if (ex) ex.position.x = Math.sin(t * 3.1) * 0.1;
    }
    if (bBusy) bambuHead.position.set(bm.pos[0] + Math.sin(t * 4.2) * 0.12, bm.pos[1] + 0.36, bm.pos[2] + Math.cos(t * 3.3) * 0.1);
    const busy = pBusy || bBusy;
    if (busy && !printLoop) printLoop = engine.audio.loop('stepper', { position: [pBusy ? pr.pos[0] : bm.pos[0], 1.1, -4.65], volume: 0.08, rate: 0.7 });
    if (!busy && printLoop) {
      printLoop.stop();
      printLoop = null;
    }
    // LCDs at 1 Hz when the player is within 4 m
    if (!lcdTick(t)) return;
    const pp = store.getState().session.player.position;
    if (Math.hypot(pp[0] - centre[0], pp[2] - centre[2]) > 4.5) return;
    const now = lab?.time?.physMs ?? 0;
    for (const [k, slot] of [['prusa', prusaSlot], ['bambu', bambuSlot]] as const) {
      const st = printerState(lab, k);
      const pct = st.busy && st.endsPhysMs ? Math.max(0, Math.min(99, Math.round(100 - ((st.endsPhysMs - now) / 90000) * 100))) : 0;
      // only when the readout changes: a redraw re-uploads the whole screens atlas page
      const key = `${pct}|${st.busy}`;
      if (lcdShown[k] === key) continue;
      lcdShown[k] = key;
      redrawSlot(slot, (g, w, h) => drawPrinterLcd(g, w, h, k, pct, st.busy));
    }
    cradle.visible = store.getState().session.items.carried?.id !== 'cradle-new';
  });
  void Mesh;
  void torusGeo;
  void latheGeo;
}
