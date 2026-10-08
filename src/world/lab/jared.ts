/**
 * Jared's bench (World §1.4 "Jared's bench…", §3.6, §9.2): butcher-block bench with the grey-blue
 * ESD mat and two drawers, soldering station (7-seg `350`, iron in its coil stand, brass sponge),
 * articulated magnifier lamp, half-soldered motor PCB in a third-hand, bench oscilloscope with a live
 * trace, bench PSU `24.0V 0.35A`, bench DMM, bolt bins + magnetic tray, label maker, wire-spool
 * dispenser and the warm LED bench light. The parts wall / Husky / storage cabinet are in
 * `partsWall.ts`.
 */
import { Mesh, MeshStandardMaterial, Color } from 'three';
import { emit, store } from '@/core/store';
import { getProp, LOCATION_BY_ID } from '../layout';
import { StaticBatch, xf } from './kit/batch';
import { boxGeo, cylGeo, planeGeo, rboxGeo, sphereGeo, torusGeo, tubeGeo, type V3 } from './kit/shapes';
import { addPrint, addTape, type LabCtx } from './kit/context';
import { redrawSlot } from './kit/atlas';
import { DynScreen, throttle } from './kit/bind';
import { pickVerbs, toast } from './kit/runtime';
import { rad, screwAt } from './kit/shared';
import { drawReadout, drawScope } from './props/screenArt';
import { seeded } from './kit/procTex';

const mm = (v: number) => v / 1000;

export function buildJaredCorner(ctx: LabCtx): void {
  const { mats, engine } = ctx;
  const b = new StaticBatch('jared');
  const bench = getProp('bench.jared');
  const [W, D, H] = bench.size!;
  const top = H;
  b.at(bench.pos[0], 0, bench.pos[2], 0, () => {
    b.add(rboxGeo(W, 0.04, D, 0.004, 1), mats.butcherBlock, xf(0, top - 0.02, 0));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(0.05, top - 0.04, 0.05, mats.satinBlack, sx * (W / 2 - 0.05), (top - 0.04) / 2, sz * (D / 2 - 0.05));
    for (const sz of [-1, 1]) b.box(W - 0.1, 0.06, 0.03, mats.satinBlack, 0, top - 0.07, sz * (D / 2 - 0.05));
    b.box(W - 0.1, 0.03, 0.03, mats.satinBlack, 0, 0.15, -(D / 2 - 0.05));
    // two under-bench drawers (right half)
    for (const x of [0.45, 1.0]) {
      b.box(0.5, 0.12, D - 0.1, mats.satinBlack, x, top - 0.1, 0);
      b.box(0.48, 0.1, 0.004, mats.darkGreyPlastic, x, top - 0.1, D / 2 - 0.048, 0, 'none');
      b.add(rboxGeo(0.18, 0.014, 0.02, 0.005, 1), mats.steelChrome, xf(x, top - 0.1, D / 2 - 0.035), 'none');
    }
    // ESD mat (left), grounding snap + cord
    b.box(1.2, 0.002, 0.6, mats.esdMat, -W / 2 + 0.65, top + 0.001, 0.02, 0, 'receive');
    b.add(cylGeo(0.006, 0.006, 0.003, 10), mats.chrome, xf(-W / 2 + 0.1, top + 0.003, -0.25), 'none');
    b.add(tubeGeo([[-W / 2 + 0.1, top + 0.004, -0.25], [-W / 2 + 0.05, top + 0.0, -0.33], [-W / 2 + 0.06, top - 0.3, -0.36]], 0.002, 5, 40), mats.wireGreen, null, 'none');
  });

  /* ── warm LED bench light along the back edge ── */
  const bl = getProp('jared.bench-light');
  const lightMat = ctx.engine.materials.get('lab.benchLightBar', () => new MeshStandardMaterial({ color: '#ffffff', emissive: new Color('#ffd9a8'), emissiveIntensity: 2.0, roughness: 0.8 }));
  b.box(bl.size![0], 0.02, 0.03, mats.lightGreyMetal, bl.pos[0], bl.pos[1] + 0.01, bl.pos[2], 0, 'none');
  b.add(planeGeo(bl.size![0] - 0.02, 0.012), lightMat, xf(bl.pos[0], bl.pos[1] - 0.0005, bl.pos[2] + 0.002, Math.PI / 2, 0, 0), 'none');
  for (const x of [bl.pos[0] - 1.3, bl.pos[0] + 1.3]) b.box(0.01, 0.04, 0.03, mats.lightGreyMetal, x, bl.pos[1] + 0.03, -4.985, 0, 'none');

  /* ── soldering station ── */
  const so = getProp('jared.solder');
  const solderSlot = ctx.screens.draw(96, 48, (g, w, h) => drawReadout(g, w, h, '---', '#ff3b2a'));
  const tipMat = new MeshStandardMaterial({ color: '#8a8d90', metalness: 0.9, roughness: 0.35, emissive: new Color('#ff5a1a'), emissiveIntensity: 0 });
  tipMat.name = 'lab.solderTip';
  b.at(so.pos[0], so.pos[1], so.pos[2], 0, () => {
    b.add(rboxGeo(0.16, 0.1, 0.13, 0.01, 2), mats.red, xf(0, 0.05, 0));
    b.add(rboxGeo(0.152, 0.05, 0.004, 0.004, 1), mats.satinBlack, xf(0, 0.055, 0.065), 'none');
    b.add(ctx.screens.quad(0.05, 0.024, solderSlot), solderSlot.page.material, xf(-0.03, 0.062, 0.0675), 'none');
    for (const dx of [0.03, 0.055]) b.add(rboxGeo(0.016, 0.01, 0.004, 0.002, 1), mats.darkGreyPlastic, xf(dx, 0.062, 0.068), 'none');
    b.add(cylGeo(0.008, 0.008, 0.006, 12), mats.blackPlastic, xf(0.05, 0.03, 0.068, Math.PI / 2, 0, 0), 'none');
    addTape(ctx, b, 'SOLDER STATION', 3.5, xf(0, 0.088, 0.066));
    // iron cord + coil stand + brass sponge (to the right)
    b.within(xf(0.17, 0, 0.02, 0, -0.4, 0), () => {
      b.add(rboxGeo(0.09, 0.015, 0.11, 0.008, 1), mats.satinBlack, xf(0, 0.0075, 0));
      b.add(cylGeo(0.025, 0.025, 0.02, 16), mats.brass, xf(0.02, 0.025, 0.03), 'none');
      for (let i = 0; i < 9; i++) b.add(torusGeo(0.012 - i * 0.0006, 0.0012, 4, 14), mats.chrome, xf(-0.02, 0.05 + i * 0.008, -0.02 + i * 0.006, Math.PI / 2 - 0.6, 0, 0), 'none');
      b.add(cylGeo(0.009, 0.007, 0.1, 12), mats.satinBlack, xf(-0.02, 0.1, -0.005, -0.6 + Math.PI, 0, 0), 'none');
      b.add(cylGeo(0.0025, 0.0012, 0.05, 8), tipMat, xf(-0.02, 0.07, 0.035, Math.PI - 0.6, 0, 0), 'none');
    });
    b.add(tubeGeo([[0.0, 0.03, 0.068], [0.08, 0.0, 0.1], [0.15, 0.04, 0.05], [0.15, 0.15, 0.0]], 0.0025, 5, 40), mats.cableBlack, null, 'none');
  });
  const solderProxy = ctx.ia.proxy(ctx.root, 0.36, 0.2, 0.18, xf(so.pos[0] + 0.08, so.pos[1] + 0.08, so.pos[2]), 'solder');

  /* ── magnifier lamp (clamp, two arms, ring head with LED ring) ── */
  const ml = getProp('jared.magnifier-lamp');
  const ringMat = ctx.engine.materials.get('lab.lampRing', () => new MeshStandardMaterial({ color: '#ffffff', emissive: new Color('#fff1e0'), emissiveIntensity: 2.2 }));
  b.at(ml.pos[0], ml.pos[1], ml.pos[2], 0, () => {
    b.add(cylGeo(0.06, 0.07, 0.025, 20), mats.whiteEnamel, xf(0, 0.0125, 0));
    const p0: V3 = [0, 0.025, 0];
    const p1: V3 = [0.05, 0.36, 0.12];
    const p2: V3 = [0.12, 0.42, 0.42];
    b.rod(p0, p1, 0.007, mats.whiteEnamel, 8);
    b.rod([0.015, 0.025, 0], [0.065, 0.36, 0.12], 0.0025, mats.chrome, 6, 'none'); // spring
    b.rod(p1, p2, 0.006, mats.whiteEnamel, 8);
    b.add(sphereGeo(0.012, 10, 8), mats.whiteEnamel, xf(...p1), 'none');
    b.within(xf(p2[0], p2[1] - 0.04, p2[2] + 0.04, 0.4, 0, 0), () => {
      b.add(cylGeo(0.075, 0.08, 0.04, 28, true), mats.whiteEnamel, xf(0, 0, 0));
      b.add(torusGeo(0.062, 0.008, 6, 28), ringMat, xf(0, -0.021, 0, Math.PI / 2, 0, 0), 'none');
      b.add(cylGeo(0.055, 0.055, 0.006, 28), mats.glassClear, xf(0, -0.01, 0), 'none');
    });
  });

  /* ── third hand with the half-soldered motor PCB ── */
  const hp = getProp('jared.half-pcb');
  b.at(hp.pos[0], hp.pos[1], hp.pos[2], 0.3, () => {
    b.add(rboxGeo(0.12, 0.018, 0.08, 0.006, 1), mats.satinBlack, xf(0, 0.009, 0));
    b.add(cylGeo(0.004, 0.004, 0.12, 8), mats.chrome, xf(0, 0.075, 0), 'none');
    for (const s of [-1, 1]) {
      b.add(tubeGeo([[0, 0.12, 0], [s * 0.04, 0.15, 0.01], [s * 0.06, 0.13, 0.02]], 0.003, 6, 60), mats.satinBlack, null, 'none');
      b.add(boxGeo(0.018, 0.006, 0.008), mats.chrome, xf(s * 0.065, 0.128, 0.02), 'none');
    }
    b.within(xf(0, 0.125, 0.02, -0.3, 0, 0), () => {
      b.add(boxGeo(0.1, 0.0016, 0.07), mats.pcbGreen, xf(0, 0, 0));
      const r = seeded(12);
      for (let i = 0; i < 9; i++) b.add(boxGeo(0.008, 0.005, 0.005), i % 3 ? mats.blackPlastic : mats.lightGreyMetal, xf(-0.04 + r() * 0.08, 0.003, -0.025 + r() * 0.05), 'none');
      b.box(0.055, 0.009, 0.012, mats.chrome, 0, 0.005, 0.027, 0, 'none'); // DB-25 header
    });
  });

  /* ── oscilloscope (live trace on its own small canvas) ── */
  const sc = getProp('jared.scope');
  const [sw, sd, shh] = sc.size!;
  const scope = new DynScreen(256, 160, 'jared.scope.screen');
  scope.draw((g, w, h) => drawScope(g, w, h, 0));
  b.at(sc.pos[0], sc.pos[1], sc.pos[2], 0, () => {
    b.add(rboxGeo(sw, shh, sd, 0.008, 2), ctx.engine.materials.get('lab.scopeGrey', () => new MeshStandardMaterial({ color: '#4c5056', roughness: 0.5 })), xf(0, shh / 2 + 0.01, 0));
    b.add(rboxGeo(sw - 0.01, shh - 0.01, 0.006, 0.006, 1), mats.satinBlack, xf(0, shh / 2 + 0.01, sd / 2));
    b.add(planeGeo(0.155, 0.097), scope.material, xf(-0.06, shh / 2 + 0.015, sd / 2 + 0.0035), 'none');
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) b.add(cylGeo(0.0055, 0.0055, 0.008, 12), mats.darkGreyPlastic, xf(0.05 + c * 0.022, shh - 0.02 - r * 0.026, sd / 2 + 0.006, Math.PI / 2, 0, 0), 'none');
    for (let i = 0; i < 4; i++) b.add(cylGeo(0.006, 0.006, 0.01, 12), [mats.yellowPlastic, mats.cableBlue, mats.red, mats.wireGreen][i]!, xf(-0.12 + i * 0.035, 0.022, sd / 2 + 0.006, Math.PI / 2, 0, 0), 'none');
    for (const s of [-1, 1]) b.add(boxGeo(0.02, 0.012, 0.03), mats.blackPlastic, xf(s * (sw / 2 - 0.03), 0.006, sd / 2 - 0.01), 'none');
    addTape(ctx, b, 'DSO · 4CH 100MHz', 3.5, xf(-0.06, shh + 0.004, sd / 2 + 0.0035));
    b.add(tubeGeo([[-0.12, 0.022, sd / 2 + 0.012], [-0.14, 0.0, sd / 2 + 0.08], [-0.2, -0.0, 0.12], [-0.4, 0.0, 0.14]], 0.002, 5, 40), mats.cableBlack, null, 'none');
  });

  /* ── bench PSU + bench DMM readouts ── */
  const bp = getProp('jared.bench-psu');
  const psuSlot = ctx.screens.draw(160, 56, (g, w, h) => drawReadout(g, w, h, '24.0V 0.35A', '#3bff7a', '#06120a'));
  b.at(bp.pos[0], bp.pos[1], bp.pos[2], 0, () => {
    const [w, d, h] = bp.size!;
    b.add(rboxGeo(w, h, d, 0.006, 2), mats.lightGreyMetal, xf(0, h / 2, 0));
    b.box(w - 0.01, h - 0.01, 0.004, mats.satinBlack, 0, h / 2, d / 2, 0, 'none');
    b.add(ctx.screens.quad(0.1, 0.035, psuSlot), psuSlot.page.material, xf(0, h - 0.04, d / 2 + 0.0025), 'none');
    for (const x of [-0.03, 0.03]) b.add(cylGeo(0.011, 0.011, 0.012, 16), mats.darkGreyPlastic, xf(x, 0.07, d / 2 + 0.008, Math.PI / 2, 0, 0), 'none');
    for (const [x, m] of [[-0.035, mats.red], [0.0, mats.satinBlack], [0.035, mats.wireGreen]] as const) b.add(cylGeo(0.005, 0.005, 0.01, 10), m, xf(x, 0.025, d / 2 + 0.006, Math.PI / 2, 0, 0), 'none');
    b.add(tubeGeo([[-0.035, 0.025, d / 2 + 0.012], [-0.06, 0.0, d / 2 + 0.08], [-0.25, -0.01, 0.2], [-0.62, 0.004, 0.25]], 0.0018, 5, 30), mats.wireRed, null, 'none');
  });
  const dm = getProp('jared.bench-dmm');
  const dmmSlot = ctx.screens.draw(160, 56, (g, w, h) => drawReadout(g, w, h, '5.081 VDC', '#e8f0ff', '#0d1218'));
  b.at(dm.pos[0], dm.pos[1], dm.pos[2], 0, () => {
    const [w, d, h] = dm.size!;
    b.add(rboxGeo(w, h, d, 0.006, 2), mats.offWhitePlastic, xf(0, h / 2, 0));
    b.box(w - 0.01, h - 0.01, 0.004, mats.darkGreyPlastic, 0, h / 2, d / 2, 0, 'none');
    b.add(ctx.screens.quad(0.09, 0.03, dmmSlot), dmmSlot.page.material, xf(-0.04, h / 2 + 0.01, d / 2 + 0.0025), 'none');
    for (let i = 0; i < 6; i++) b.add(rboxGeo(0.014, 0.01, 0.004, 0.002, 1), mats.midGreyPlastic, xf(0.03 + (i % 3) * 0.02, h / 2 + 0.015 - Math.floor(i / 3) * 0.02, d / 2 + 0.003), 'none');
  });

  /* ── bolt bins + magnetic tray ── */
  const bb = getProp('jared.bolt-bins');
  const boltBins: V3[] = [];
  b.at(bb.pos[0], bb.pos[1], bb.pos[2], 0, () => {
    for (const [x, label] of [[-0.09, '2.5 mm'], [0.0, '5 mm']] as const) {
      b.box(0.08, 0.004, 0.09, mats.blackPlastic, x, 0.002, 0);
      for (const s of [-1, 1]) {
        b.box(0.004, 0.05, 0.09, mats.blackPlastic, x + s * 0.04, 0.025, 0);
        b.box(0.08, 0.05, 0.004, mats.blackPlastic, x, 0.025, s * 0.045);
      }
      addTape(ctx, b, label, 6, xf(x, 0.03, 0.0475));
      const r = seeded(label.length);
      for (let i = 0; i < 12; i++) b.add(cylGeo(label === '5 mm' ? 0.0025 : 0.00125, label === '5 mm' ? 0.0025 : 0.00125, 0.014, 6), mats.steelChrome, xf(x - 0.03 + r() * 0.06, 0.007 + r() * 0.01, -0.035 + r() * 0.07, Math.PI / 2, r() * 3, 0), 'none');
      boltBins.push([bb.pos[0] + x, bb.pos[1], bb.pos[2]]);
    }
    // magnetic tray with 10 mixed bolts
    b.add(cylGeo(0.05, 0.045, 0.015, 24), mats.chrome, xf(0.11, 0.0075, 0));
    const r = seeded(10);
    for (let i = 0; i < 10; i++) {
      const big = i % 2 === 0;
      b.add(cylGeo(big ? 0.0025 : 0.00125, big ? 0.0025 : 0.00125, big ? 0.016 : 0.01, 6), mats.steelChrome, xf(0.11 - 0.03 + r() * 0.06, 0.017, -0.03 + r() * 0.06, Math.PI / 2, r() * 6, 0), 'none');
      b.add(cylGeo(big ? 0.0042 : 0.0024, big ? 0.0042 : 0.0024, 0.002, 6), mats.steelChrome, xf(0.11 - 0.03 + r() * 0.06, 0.017, -0.03 + r() * 0.06), 'none');
    }
  });
  const boltProxy = ctx.ia.proxy(ctx.root, 0.32, 0.06, 0.11, xf(bb.pos[0] + 0.01, bb.pos[1] + 0.03, bb.pos[2]), 'bolts');

  /* ── label maker ── */
  const lm = getProp('jared.label-maker');
  b.at(lm.pos[0], lm.pos[1], lm.pos[2], rad(lm.rotY), () => {
    b.add(rboxGeo(0.07, 0.05, 0.2, 0.015, 3), mats.offWhitePlastic, xf(0, 0.025, 0));
    b.box(0.05, 0.002, 0.07, mats.keycap, 0, 0.051, 0.02, 0, 'none');
    b.box(0.04, 0.001, 0.022, ctx.engine.materials.get('lab.lcd', () => new MeshStandardMaterial({ color: '#9fae8f', roughness: 0.3 })), 0, 0.051, -0.045, 0, 'none');
    b.box(0.012, 0.0004, 0.05, mats.paperWhite, 0, 0.04, -0.12, 0, 'none'); // tape coming out
  });
  const lmProxy = ctx.ia.proxy(ctx.root, 0.1, 0.06, 0.22, xf(lm.pos[0], lm.pos[1] + 0.03, lm.pos[2]), 'labelmaker');

  /* ── wire-spool dispenser ── */
  const ws = getProp('jared.wire-spools');
  b.at(ws.pos[0], ws.pos[1], ws.pos[2], 0, () => {
    for (const s of [-1, 1]) b.box(0.01, 0.12, 0.08, mats.satinBlack, s * 0.15, 0.06, 0);
    b.add(cylGeo(0.004, 0.004, 0.3, 8), mats.chrome, xf(0, 0.07, 0, 0, 0, Math.PI / 2), 'none');
    [mats.wireRed, mats.wireBlue, mats.wireGreen, mats.wireWhite].forEach((m, i) => {
      const x = -0.105 + i * 0.07;
      b.add(cylGeo(0.035, 0.035, 0.05, 20), m, xf(x, 0.07, 0, 0, 0, Math.PI / 2));
      for (const s of [-1, 1]) b.add(cylGeo(0.045, 0.045, 0.004, 20), mats.blackPlastic, xf(x + s * 0.027, 0.07, 0, 0, 0, Math.PI / 2), 'none');
      b.add(tubeGeo([[x, 0.035, 0.03], [x + 0.01, 0.0, 0.08], [x + 0.02, -0.0, 0.13]], 0.0008, 4, 80), m, null, 'none');
    });
  });

  /* ── odds and ends: tweezers, flux pen, desoldering pump, spool of solder ── */
  b.at(2.0, 0.9, -4.45, 0.2, () => {
    b.add(cylGeo(0.009, 0.009, 0.17, 10), mats.cableBlue, xf(0, 0.009, 0, 0, 0, Math.PI / 2), 'none');
    b.add(cylGeo(0.004, 0.004, 0.13, 8), mats.chrome, xf(0, 0.004, 0.04, 0, 0.1, Math.PI / 2), 'none');
    b.add(cylGeo(0.022, 0.022, 0.02, 16), mats.lightGreyMetal, xf(0.12, 0.01, -0.03), 'none');
  });

  ctx.statics.add(b);

  /* ── interactions ── */
  let ironOn = false;
  let ironTemp = 25;
  ctx.ia.register('jared.solder', solderProxy, () =>
    pickVerbs([
      {
        key: 'E',
        label: ironOn ? 'Iron off' : 'Iron on',
        run: () => {
          ironOn = !ironOn;
          engine.audio.play('switch-toggle', { position: [so.pos[0], so.pos[1] + 0.05, so.pos[2]], volume: 0.6 });
        },
      },
    ]),
  );
  ctx.ia.register('jared.bolt-bins', boltProxy, () =>
    pickVerbs([
      {
        key: 'E',
        label: 'Sort bolts',
        run: () => {
          emit('app.action', { app: 'world', action: 'minigame.open', data: { id: 'bolt-sort', propId: 'jared.bolt-bins', bins: ['2.5 mm', '5 mm'], bolts: 10 } });
          toast('info', 'Bolt sorter', 'Drop each of the 10 bolts into the 2.5 mm or 5 mm bin.');
        },
      },
    ]),
  );
  ctx.ia.register('jared.label-maker', lmProxy, () =>
    pickVerbs([
      {
        key: 'E',
        label: 'Print label',
        run: () => {
          engine.audio.play('printer', { position: [lm.pos[0], lm.pos[1] + 0.03, lm.pos[2]], volume: 0.4, rate: 1.6 });
          emit('app.action', { app: 'world', action: 'labelMaker.print' });
        },
      },
    ]),
  );
  void boltBins;

  /* ── per-frame: scope trace (10 Hz within 4 m), solder readout + tip glow ── */
  const scopeTick = throttle(10);
  const solderTick = throttle(4);
  const centre = LOCATION_BY_ID['loc.jared-bench']?.center ?? [2.7, 0, -3.75];
  let lastShown = '';
  ctx.hooks.push((dt, t) => {
    const target = ironOn ? 350 : 25;
    ironTemp += (target - ironTemp) * Math.min(1, dt * (ironOn ? 0.35 : 0.12));
    tipMat.emissiveIntensity = Math.max(0, (ironTemp - 150) / 200) * 1.6;
    if (solderTick(t)) {
      const txt = ironOn || ironTemp > 60 ? String(Math.round(ironTemp)) : '---';
      if (txt !== lastShown) {
        lastShown = txt;
        redrawSlot(solderSlot, (g, w, h) => drawReadout(g, w, h, txt, '#ff3b2a'));
      }
    }
    if (!scopeTick(t)) return;
    const p = store.getState().session.player.position;
    if (Math.hypot(p[0] - centre[0], p[2] - centre[2]) > 4) return;
    scope.draw((g, w, h) => drawScope(g, w, h, t));
  });
  void Mesh;
  void screwAt;
}
