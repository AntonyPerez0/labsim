/**
 * Server shelf (World §1.4 "Server shelf", §3.7 sim `gpu-blade`, §9.2): black wire shelving, the
 * open-top 4-GPU blade (GPUs 1–2 standing on top, 3–4 hanging under the 1.10 tier through a cutout,
 * front fan wall, status LEDs, NIC activity), the 24-port switch with blinking port LEDs and patch
 * cords up to the tray, the UPS, the retired tower with its hang tag and `poster.network`.
 */
import { Group, MeshStandardMaterial, DoubleSide, type Material } from 'three';
import { emit, store } from '@/core/store';
import { sim } from '@/sim';
import type { Host, LabState } from '@/sim/types';
import { getProp } from '../layout';
import { StaticBatch, xf } from './kit/batch';
import { boxGeo, cylGeo, planeGeo, rboxGeo, torusGeo, tubeGeo, type V3 } from './kit/shapes';
import { addPrint, addTape, type LabCtx } from './kit/context';
import { drawPlate, FONT } from './kit/draw';
import { wireGridAlpha } from './kit/procTex';
import { pickVerbs, simCall, toast } from './kit/runtime';
import { hintGroup_, screwAt } from './kit/shared';
import { seeded } from './kit/procTex';
import { drawPosterNetwork } from './props/posters';

const mm = (v: number) => v / 1000;

function blade(lab: LabState): Host | undefined {
  return lab?.hosts?.['gpu-blade'] ?? Object.values(lab?.hosts ?? {}).find((h) => h.kind === 'blade');
}

/** Wire-shelving unit (W × D × H) with tiers at `tiers` (top surfaces). Origin = floor centre. */
export function wireShelving(ctx: LabCtx, b: StaticBatch, W: number, D: number, H: number, tiers: number[], gridMat: Material, cutout?: { x0: number; x1: number; tier: number }): void {
  const { mats } = ctx;
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      b.add(cylGeo(0.0127, 0.0127, H, 12), mats.satinBlack, xf(sx * (W / 2 - 0.0127), H / 2, sz * (D / 2 - 0.0127)));
      b.add(cylGeo(0.016, 0.018, 0.02, 12), mats.rubberTip, xf(sx * (W / 2 - 0.0127), 0.01, sz * (D / 2 - 0.0127)), 'none');
    }
  for (const y of tiers) {
    const segs = cutout && cutout.tier === y ? [[-W / 2, cutout.x0], [cutout.x1, W / 2]] : [[-W / 2, W / 2]];
    for (const [a, c] of segs) {
      const w = c! - a!;
      const g = planeGeo(w - 0.01, D - 0.01);
      const uv = g.getAttribute('uv');
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / 0.05), uv.getY(i) * (D / 0.025));
      b.add(g, gridMat, xf((a! + c!) / 2, y - 0.002, 0, -Math.PI / 2, 0, 0), 'both');
    }
    // perimeter frame + truss ribs + post collars
    for (const sz of [-1, 1]) b.rod([-W / 2, y - 0.003, sz * (D / 2 - 0.003)], [W / 2, y - 0.003, sz * (D / 2 - 0.003)], 0.004, mats.satinBlack, 6);
    for (const sx of [-1, 1]) b.rod([sx * (W / 2 - 0.003), y - 0.003, -D / 2], [sx * (W / 2 - 0.003), y - 0.003, D / 2], 0.004, mats.satinBlack, 6);
    for (let x = -W / 2 + 0.2; x < W / 2 - 0.1; x += 0.3) b.rod([x, y - 0.02, -D / 2 + 0.01], [x, y - 0.02, D / 2 - 0.01], 0.003, mats.satinBlack, 5, 'none');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(cylGeo(0.02, 0.016, 0.04, 10), mats.satinBlack, xf(sx * (W / 2 - 0.0127), y - 0.02, sz * (D / 2 - 0.0127)), 'none');
  }
}

/** GPU card standing on its edge (length along X, height along Y, thickness along Z). Origin = PCIe edge centre. */
function gpuCard(ctx: LabCtx, b: StaticBatch, n: number, hanging: boolean): void {
  const { mats } = ctx;
  const L = mm(267);
  const Hh = mm(111);
  const T = mm(38);
  const s = hanging ? -1 : 1;
  b.within(xf(0, s * Hh / 2, 0), () => {
    b.add(rboxGeo(L, Hh, T, mm(4), 2), mats.satinBlack, xf(0, 0, 0));
    b.box(L - mm(10), mm(6), T + mm(1), mats.lightGreyMetal, 0, s * (Hh / 2 - mm(8)), 0, 0, 'none'); // silver shroud accent
    // two blower fans on the face
    for (const x of [-L * 0.25, L * 0.18]) {
      b.add(cylGeo(mm(40), mm(40), mm(2), 24), mats.darkGreyPlastic, xf(x, 0, T / 2 + mm(0.5), Math.PI / 2, 0, 0), 'none');
      b.add(torusGeo(mm(41), mm(1.5), 4, 28), mats.lightGreyMetal, xf(x, 0, T / 2 + mm(1)), 'none');
      b.add(cylGeo(mm(12), mm(12), mm(3), 14), mats.blackPlastic, xf(x, 0, T / 2 + mm(1.5), Math.PI / 2, 0, 0), 'none');
    }
    // bracket + PCIe power plugs
    b.box(mm(2), Hh + mm(10), T, mats.lightGreyMetal, -L / 2 - mm(1), 0, 0, 0, 'none');
    for (const dx of [mm(40), mm(60)]) b.box(mm(16), mm(9), mm(10), mats.blackPlastic, L / 2 - dx, -s * (Hh / 2 + mm(4)), 0, 0, 'none');
    addTape(ctx, b, `GPU ${n}`, 6, xf(L / 2 - mm(40), s * mm(16), T / 2 + mm(0.4)), { bg: '#76b900', fg: '#0b1a00' });
  });
}

export function buildServer(ctx: LabCtx): void {
  const { mats, engine } = ctx;
  const b = new StaticBatch('server');
  const gridMat = ctx.engine.materials.get('lab.blackWireGrid', () => new MeshStandardMaterial({ color: '#1b1c1e', roughness: 0.45, metalness: 0.3, alphaMap: wireGridAlpha(), alphaTest: 0.5, side: DoubleSide }));
  const sh = getProp('shelf.server');
  const [W, D, H] = sh.size!;
  const bl = getProp('server.blade');
  b.at(sh.pos[0], 0, sh.pos[2], 0, () => wireShelving(ctx, b, W, D, H, [0.12, 0.62, 1.1, 1.62], gridMat, { x0: -0.36, x1: 0.36, tier: 1.1 }));
  // cutout frame under the blade
  b.box(0.74, 0.02, D - 0.04, mats.satinBlack, sh.pos[0], 1.085, sh.pos[2], 0, 'none');

  /* ── GPU blade ── */
  const [bw, bd, bh] = bl.size!;
  const by = bl.pos[1];
  const bz = bl.pos[2];
  const bx = bl.pos[0];
  const leds: { power: number; status: number[]; nic: number[] } = { power: -1, status: [], nic: [] };
  b.at(bx, by, bz, 0, () => {
    // chassis tray: floor + side walls + front fan wall (open top)
    b.box(bw, 0.004, bd, mats.greySteel, 0, 0.002, 0);
    for (const sx of [-1, 1]) b.box(0.003, bh, bd, mats.greySteel, sx * (bw / 2 - 0.0015), bh / 2, 0);
    b.box(bw, bh, 0.003, mats.greySteel, 0, bh / 2, -bd / 2 + 0.0015);
    b.box(bw, bh, 0.04, mats.satinBlack, 0, bh / 2, bd / 2 - 0.02);
    // 4 × 80 mm fans in the front wall
    for (let i = 0; i < 4; i++) {
      const x = -bw / 2 + 0.12 + i * 0.13;
      b.add(cylGeo(mm(38), mm(38), mm(2), 24), mats.darkGreyPlastic, xf(x, bh / 2, bd / 2 + 0.0005, Math.PI / 2, 0, 0), 'none');
      for (const r of [14, 24, 34]) b.add(torusGeo(mm(r), mm(1), 4, 24), mats.lightGreyMetal, xf(x, bh / 2, bd / 2 + 0.002), 'none');
      b.add(cylGeo(mm(9), mm(9), mm(3), 12), mats.lightGreyMetal, xf(x, bh / 2, bd / 2 + 0.002, Math.PI / 2, 0, 0), 'none');
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) screwAt(ctx, b, x + sx * mm(36), bh / 2 + sy * mm(36), bd / 2 + 0.0005);
    }
    // front panel: power button + LEDs + label
    b.add(cylGeo(mm(6), mm(6), mm(4), 16), mats.chrome, xf(bw / 2 - 0.035, bh / 2 + 0.02, bd / 2 + 0.002, Math.PI / 2, 0, 0), 'none');
    leds.power = ctx.leds.add({ pos: [bx + bw / 2 - 0.035, by + bh / 2 + 0.02, bz + bd / 2 + 0.0045], normal: [0, 0, 1], color: '#2f6bff', size: 0.006 });
    for (let i = 0; i < 3; i++) leds.status.push(ctx.leds.add({ pos: [bx + bw / 2 - 0.035, by + bh / 2 - 0.005 - i * 0.012, bz + bd / 2 + 0.0005], normal: [0, 0, 1], color: i === 2 ? '#ffa516' : '#2bff6a', size: 0.003 }));
    addTape(ctx, b, 'GPU BLADE · 10.42.1.5 · VMs: ORCA / JENKINS / OLLAMA', 6, xf(-0.05, bh - 0.015, bd / 2 + 0.0005));
    // rear NICs + power
    for (let i = 0; i < 2; i++) {
      b.box(0.016, 0.013, 0.004, mats.blackPlastic, -0.2 + i * 0.03, 0.05, -bd / 2 - 0.002, 0, 'none');
      leds.nic.push(ctx.leds.add({ pos: [bx - 0.2 + i * 0.03 + 0.005, by + 0.06, bz - bd / 2 - 0.0045], normal: [0, 0, -1], color: '#2bff6a', size: 0.002 }));
    }
    // motherboard + DIMMs + heatsinks inside (seen from above)
    b.box(bw - 0.04, 0.002, bd - 0.1, mats.pcbGreen, 0, 0.006, -0.02, 0, 'none');
    for (const cx of [-0.25, -0.05]) {
      b.box(0.09, 0.05, 0.09, mats.aluminium, cx, 0.032, -0.08, 0, 'none');
      for (let k = 0; k < 8; k++) b.box(0.004, 0.035, 0.13, k % 2 ? mats.satinBlack : mats.darkGreyPlastic, cx + 0.06 + k * 0.008, 0.024, -0.08, 0, 'none');
    }
    // GPUs 1–2 on top (risers), 3–4 hanging under the tier
    for (const [n, x] of [[1, 0.12], [2, 0.26]] as const) {
      b.box(0.05, 0.03, 0.02, mats.satinBlack, x - 0.1, 0.02, 0, 0, 'none');
      b.within(xf(x, bh - 0.01, 0, 0, Math.PI / 2, 0), () => gpuCard(ctx, b, n, false));
    }
    for (const [n, x] of [[3, -0.12], [4, 0.12]] as const) b.within(xf(x, -0.012, 0, 0, Math.PI / 2, 0), () => gpuCard(ctx, b, n, true));
    // power cords to W7 and patch to the switch
    b.add(tubeGeo([[-bw / 2 + 0.05, 0.05, -bd / 2], [-0.35, 0.0, -bd / 2 - 0.05], [0, -0.7, -0.29], [0, -0.7, -0.27]], 0.0035, 6, 20), mats.cableBlack, null, 'none');
    b.add(tubeGeo([[-0.2, 0.05, -bd / 2 - 0.003], [-0.22, 0.25, -bd / 2 - 0.04], [-0.05, 0.5, -0.24], [0.0, 0.53, -0.2]], 0.0028, 6, 20), mats.cableBlue, null, 'none');
  });
  // GPU interactables (proxies)
  const gpuPos: [number, number, number][] = [
    [bx + 0.12, by + bh + mm(55), bz],
    [bx + 0.26, by + bh + mm(55), bz],
    [bx - 0.12, by - mm(70), bz],
    [bx + 0.12, by - mm(70), bz],
  ];
  const tagged = new Set<number>();
  const tagGroup = new Group();
  ctx.root.add(tagGroup);
  gpuPos.forEach((p, i) => {
    const n = (i + 1) as 1 | 2 | 3 | 4;
    const proxy = ctx.ia.proxy(ctx.root, 0.05, 0.12, 0.28, xf(...p), `gpu-${n}`);
    ctx.ia.register(`server.blade.gpu-${n}`, proxy, () =>
      pickVerbs([
        {
          key: 'E',
          label: tagged.has(n) ? 'Tagged ✓' : 'Tag',
          blocked: () => (n >= 3 && !store.getState().session.player.crouched ? 'Crouch (C) to reach under the shelf' : null),
          run: () => {
            tagged.add(n);
            engine.audio.play('ui-click');
            toast('success', `GPU ${n} tagged`, n <= 2 ? 'On top of the blade.' : 'Underneath the shelf — two GPUs hide below the 1.10 m tier.');
            emit('app.action', { app: 'world', action: 'server.gpuTagged', data: { gpu: n, tagged: [...tagged] } });
            const tb = new StaticBatch(`gpu-tag-${n}`);
            addPrint(ctx.labels, tb, 0.035, 0.05, 70, 100, (g, w, h) => drawPlate(g, w, h, `✓\nGPU ${n}`, { bg: '#fff7d6', fg: '#1b1b1b', border: '#d0211c' }), xf(p[0] + 0.022, p[1], p[2] + 0.12, 0, Math.PI / 2, 0));
            ctx.statics.flushInto(tb, tagGroup);
          },
        },
      ]),
    );
  });
  const bladeProxy = ctx.ia.proxy(ctx.root, bw, bh, 0.06, xf(bx, by + bh / 2, bz + bd / 2), 'blade-front');
  let confirmUntil = -1;
  let now = 0;
  ctx.ia.register('server.blade', bladeProxy, () =>
    pickVerbs([
      {
        key: 'E',
        label: now < confirmUntil ? 'Hold power button — CONFIRM hard power-off' : 'Power button (hold)',
        run: () => {
          if (now >= confirmUntil) {
            confirmUntil = now + 3;
            toast('warning', 'GPU blade', 'Holding the power button hard-powers the blade: Orca, Jenkins and Ollama all go down. Press E again to keep holding.');
            return;
          }
          confirmUntil = -1;
          engine.audio.play('switch-toggle', { position: [bx + 0.36, by + 0.08, bz + 0.23] });
          simCall('GPU blade power', () => sim.host.powerCycle('gpu-blade', 'player'));
        },
      },
    ]),
  );

  /* ── network switch (24 ports) ── */
  const sw = getProp('server.switch');
  const [sW, sD, sH] = sw.size!;
  const portLeds: number[] = [];
  b.at(sw.pos[0], sw.pos[1], sw.pos[2], 0, () => {
    b.add(rboxGeo(sW, sH, sD, 0.002, 1), mats.satinBlack, xf(0, sH / 2, 0));
    for (let i = 0; i < 24; i++) {
      const col = Math.floor(i / 2);
      const row = i % 2;
      const x = -sW / 2 + 0.06 + col * 0.0155;
      const y = sH / 2 + (row ? -0.009 : 0.009);
      b.box(0.0135, 0.0115, 0.004, mats.blackPlastic, x, y, sD / 2 + 0.0005, 0, 'none');
      portLeds.push(ctx.leds.add({ pos: [sw.pos[0] + x - 0.004, sw.pos[1] + y + (row ? -0.007 : 0.007), sw.pos[2] + sD / 2 + 0.0012], normal: [0, 0, 1], color: '#2bff6a', size: 0.0018 }));
    }
    addTape(ctx, b, '24-PORT GbE · LAB CORE', 4, xf(-sW / 2 + 0.03, sH / 2, sD / 2 + 0.001, 0, 0, Math.PI / 2));
    // patch cords: plugs in the first 14 ports, loose bundle up to the tray
    const r = seeded(91);
    for (let i = 0; i < 14; i++) {
      const col = Math.floor(i / 2);
      const row = i % 2;
      const x = -sW / 2 + 0.06 + col * 0.0155;
      const y = sH / 2 + (row ? -0.009 : 0.009);
      b.box(0.012, 0.01, 0.02, mats.cat6Yellow, x, y, sD / 2 + 0.012, 0, 'none');
      const end: V3 = [0.1 + r() * 0.1, 2.4 - sw.pos[1] + 0.05, 0.13];
      const mat = i % 4 === 3 ? mats.cableBlue : mats.cat6Yellow;
      b.add(tubeGeo([[x, y, sD / 2 + 0.022], [x + 0.01, y - 0.05 - r() * 0.03, sD / 2 + 0.05], [0.2, 0.0, sD / 2 + 0.06 + r() * 0.02], [0.25, 0.3, 0.08], end], 0.0025, 5, 25), mat, null, 'none');
    }
  });
  const swProxy = ctx.ia.proxy(ctx.root, sW, sH + 0.01, sD, xf(sw.pos[0], sw.pos[1] + sH / 2, sw.pos[2]), 'switch');
  ctx.ia.register('server.switch', swProxy, () =>
    pickVerbs([
      {
        key: 'R',
        label: 'Re-seat uplink',
        run: () => {
          engine.audio.play('unplug', { position: [sw.pos[0], sw.pos[1], sw.pos[2] + 0.1] });
          setTimeout(() => engine.audio.play('plug-in', { position: [sw.pos[0], sw.pos[1], sw.pos[2] + 0.1] }), 400);
          emit('app.action', { app: 'world', action: 'server.switch.reseatUplink' });
          toast('info', 'Network switch', 'Uplink re-seated — link light back on port 24.');
        },
      },
    ]),
  );

  /* ── UPS ── */
  const ups = getProp('server.ups');
  const [uW, uD, uH] = ups.size!;
  b.at(ups.pos[0], ups.pos[1], ups.pos[2], 0, () => {
    b.add(rboxGeo(uW, uH, uD, 0.01, 2), mats.satinBlack, xf(0, uH / 2, 0));
    b.box(uW - 0.02, 0.05, 0.002, mats.blackPlastic, 0, uH - 0.06, uD / 2 + 0.001, 0, 'none');
    b.box(0.04, 0.02, 0.001, ctx.engine.materials.get('lab.lcd', () => new MeshStandardMaterial({ color: '#9fae8f', roughness: 0.3 })), 0, uH - 0.06, uD / 2 + 0.0022, 0, 'none');
    ctx.leds.add({ pos: [ups.pos[0] - 0.045, ups.pos[1] + uH - 0.03, ups.pos[2] + uD / 2 + 0.002], normal: [0, 0, 1], color: '#2bff6a', size: 0.004 });
    addTape(ctx, b, 'UPS 1500VA', 4, xf(0, uH - 0.11, uD / 2 + 0.001));
  });

  /* ── retired tower + hang tag ── */
  const tw = getProp('server.tower');
  const [tW, tD, tH] = tw.size!;
  const beige = ctx.engine.materials.get('lab.towerBeige', () => new MeshStandardMaterial({ color: '#b9b4a6', roughness: 0.55 }));
  b.at(tw.pos[0], 0, tw.pos[2], 0, () => {
    b.add(rboxGeo(tW, tH, tD, 0.008, 2), beige, xf(0, tH / 2 + 0.01, 0));
    for (let i = 0; i < 3; i++) b.box(tW - 0.03, 0.04, 0.004, mats.beigePlastic, 0, tH - 0.05 - i * 0.05, tD / 2 + 0.001, 0, 'none');
    for (let i = 0; i < 12; i++) b.box(tW - 0.06, 0.004, 0.003, mats.darkGreyPlastic, 0, 0.08 + i * 0.012, tD / 2 + 0.001, 0, 'none');
    b.add(tubeGeo([[0.04, tH - 0.03, tD / 2], [0.07, tH - 0.07, tD / 2 + 0.01], [0.06, tH - 0.13, tD / 2 + 0.012]], 0.0008, 4, 100), mats.cableWhite, null, 'none');
    addPrint(ctx.labels, b, 0.07, 0.09, 140, 180, (g, w, h) => drawPlate(g, w, h, 'RETIRED —\nreplaced by\nGPU blade', { bg: '#fff3c4', fg: '#7a1410', border: '#d0211c' }), xf(0.06, tH - 0.18, tD / 2 + 0.014, 0, 0, 0.12));
  });
  const twProxy = ctx.ia.proxy(ctx.root, tW, tH, tD, xf(tw.pos[0], tH / 2, tw.pos[2]), 'tower');
  ctx.ia.register('server.tower', twProxy, () => []);

  /* ── poster.network (hidden in Strict) ── */
  const pn = getProp('poster.network');
  const hb = new StaticBatch('server-hints');
  addPrint(ctx.prints, hb, 0.61, 0.46, 732, 552, drawPosterNetwork, xf(pn.pos[0], pn.pos[1], -4.9955));
  hb.box(0.63, 0.48, 0.003, mats.satinBlack, pn.pos[0], pn.pos[1], -4.9985, 0, 'none');
  ctx.statics.flushInto(hb, hintGroup_(ctx));
  ctx.ia.register('poster.network', ctx.ia.proxy(ctx.root, 0.63, 0.48, 0.02, xf(pn.pos[0], pn.pos[1], -4.99), 'poster'), () => []);

  ctx.statics.add(b);

  /* ── binding: blade power/boot, NIC + switch port activity ── */
  const rnd = seeded(5);
  const act = new Float32Array(24).map(() => rnd());
  let acc = 0;
  ctx.hooks.push((dt, t, lab) => {
    now = t;
    acc += dt;
    if (acc < 0.08) return;
    acc = 0;
    const h = blade(lab);
    const running = !h || h.os === 'RUNNING';
    const booting = h?.os === 'BOOTING';
    const on = !h || h.power !== 'off';
    ctx.leds.set(leds.power, on && (running || (booting && Math.floor(t * 2) % 2 === 0)));
    ctx.leds.set(leds.status[0]!, on && running);
    ctx.leds.set(leds.status[1]!, on && running && Math.sin(t * 9.1) > 0.3);
    ctx.leds.set(leds.status[2]!, on && booting);
    leds.nic.forEach((l, i) => ctx.leds.set(l, on && (running ? Math.sin(t * (13 + i * 5)) > -0.2 : false)));
    // switch port LEDs: linked ports steady, activity flicker (pseudo-random per port)
    portLeds.forEach((l, i) => {
      const linked = i < 14 || i === 23;
      if (!linked) return ctx.leds.set(l, 0);
      const bladePort = i === 0 || i === 1;
      if (bladePort && !running) return ctx.leds.set(l, 0);
      act[i] = (act[i]! + rnd() * 0.6) % 1;
      ctx.leds.set(l, act[i]! > 0.35 ? 1 : 0.15);
    });
  });
  void FONT;
}
