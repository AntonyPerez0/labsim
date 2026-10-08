/**
 * Workstations along the south wall (World §1.4 "Workstations", §3.6, §9.2 "Entrance & desks"):
 * your desk (dual monitors with the live desktop mirror, PC tower, keyboard, mouse, IP phone, mug,
 * sticky notes, USB card reader, steel ruler, chair that slides in when you sit), Morgan's desk,
 * the two coworker desks with their ADB-5555 desk devices, bins, the wall clock and `poster.lab`.
 */
import { Group, Mesh, MeshStandardMaterial, type Material } from 'three';
import { emit, mutate, store } from '@/core/store';
import { redrawSlot } from './kit/atlas';
import { sim } from '@/sim';
import { render2d, screenCanvasSize } from '@/render2d';
import type { TerminalDevice, DeviceTypeCode, LabState } from '@/sim/types';
import { DEVICE_MODELS, SEATED_POSE, getProp, localToWorld, uprightFocusPose, type Vec3 } from '../layout';
import { StaticBatch, xf } from './kit/batch';
import { boxGeo, cylGeo, latheGeo, planeGeo, profileGeo, rboxGeo, sphereGeo, torusGeo, tubeGeo, uvPlane } from './kit/shapes';
import { addPrint, addTape, type LabCtx } from './kit/context';
import { drawSticky, FONT, fitText } from './kit/draw';
import { DynScreen, clockHHMM, crosshairScreenMm, gameSeconds, throttle } from './kit/bind';
import { hintGroup_, mugState, rad, wpos } from './kit/shared';
import { pickVerbs, simCall, toast } from './kit/runtime';
import { carry, carriedId } from './kit/inventory';
import { bin, desk, keyboard, laptop, monitor24, mouseAndPad, mug, officeChair, pcTower } from './props/furniture';
import { displayDevice, deviceFaceLocal } from './props/devices';
import { drawDesktopMirror, drawOfficeScreen, drawPhone, type MirrorState } from './props/screenArt';
import { drawPosterLab } from './props/posters';

const DESK_TOP = 0.74;

export function buildDesks(ctx: LabCtx): void {
  const b = new StaticBatch('desks');
  for (const id of ['desk.player', 'desk.morgan', 'desk.coworker-1', 'desk.coworker-2']) {
    const p = getProp(id);
    b.at(p.pos[0], 0, p.pos[2], rad(p.rotY), () => desk(ctx, b));
  }
  // static chairs (the player's chair is its own group so it can slide)
  for (const [id, sw] of [['desk.morgan.chair', 0.25], ['desk.coworker-1.chair', -0.35], ['desk.coworker-2.chair', 0.15]] as const) {
    const p = getProp(id);
    b.at(p.pos[0], 0, p.pos[2], rad(p.rotY), () => officeChair(ctx, b, sw));
  }
  for (const [id, mat] of [['bin.trash', ctx.mats.midGreyPlastic], ['bin.recycle', ctx.mats.binBlue]] as const) {
    const p = getProp(id);
    b.at(p.pos[0], 0, p.pos[2], 0, () => bin(ctx, b, mat));
  }
  // recycling arrows decal on the blue bin
  addTape(ctx, b, '♻ RECYCLE', 8, xf(2.5, 0.25, 4.78 - 0.146, 0, Math.PI, 0), { bg: '#1f4fb3', fg: '#ffffff' });

  const player = buildPlayerDesk(ctx, b);
  buildMorganDesk(ctx, b);
  const coworkers = buildCoworkerDesks(ctx, b);
  buildClock(ctx);

  // poster.lab on the south wall (faces north)
  const pl = getProp('poster.lab');
  addPrint(ctx.prints, b, 0.91, 0.61, 1092, 732, drawPosterLab, xf(pl.pos[0], pl.pos[1], 4.9955, 0, Math.PI, 0));
  b.box(0.93, 0.63, 0.003, ctx.mats.blackPlastic, pl.pos[0], pl.pos[1], 4.9985, 0, 'none');
  ctx.ia.register('poster.lab', ctx.ia.proxy(ctx.root, 0.93, 0.63, 0.02, xf(pl.pos[0], pl.pos[1], 4.99), 'poster.lab'), () => []);

  ctx.statics.add(b);
  wirePlayerDesk(ctx, player);
  for (const c of coworkers) wireCoworkerDevice(ctx, c);
}

/* ───────────────────────────── your desk ───────────────────────────── */

interface PlayerDesk {
  chair: Group;
  mirror: DynScreen;
  monitorProxy: Mesh[];
  phoneSlot: ReturnType<LabCtx['screens']['draw']>;
  coffee: Mesh;
  ruler: Group;
  proxies: Record<string, Mesh>;
  pcLed: number;
  monLeds: number[];
}

function buildPlayerDesk(ctx: LabCtx, b: StaticBatch): PlayerDesk {
  const { mats } = ctx;
  const proxies: Record<string, Mesh> = {};
  const mirror = new DynScreen(1024, 288, 'desk.player.mirror');
  const monLeds: number[] = [];
  const monitorProxy: Mesh[] = [];
  // dual monitors share one canvas (left half / right half)
  for (const [id, half] of [['desk.player.monitor-l', 0], ['desk.player.monitor-r', 1]] as const) {
    const p = getProp(id);
    b.at(p.pos[0], p.pos[1], p.pos[2], rad(p.rotY), () => {
      monitor24(ctx, b, 1.08 - DESK_TOP, { geo: (w, h) => uvPlane(w, h, { u0: half * 0.5, u1: half * 0.5 + 0.5, v0: 0, v1: 1 }), mat: mirror.material }, {
        ledIndexOut: (lp) => monLeds.push(ctx.leds.add({ pos: wpos(b, ...lp), normal: wposDir(b), color: '#2f6bff', size: 0.003 })),
      });
      // brand chin print
      addTape(ctx, b, 'DELL', 4, xf(0, 1.08 - DESK_TOP - 0.153, 0.0725), { bg: '#0d0d0e', fg: '#8a8c90' });
      proxies[id] = ctx.ia.proxy(ctx.root, 0.56, 0.36, 0.08, b.matrix.clone().multiply(xf(0, 1.08 - DESK_TOP, 0.05)), id);
      monitorProxy.push(proxies[id]!);
    });
  }
  // two sticky notes on the left monitor's lower bezel + one on the desk (hidden in Strict)
  const hb = new StaticBatch('desk-hints');
  const ml = getProp('desk.player.monitor-l');
  hb.at(ml.pos[0], ml.pos[1], ml.pos[2], rad(ml.rotY), () => {
    addPrint(ctx.prints, hb, 0.076, 0.076, 192, 192, (g, w, h) => drawSticky(g, w, h, 'ADB → :5444 (NOT 5555!)', 3), xf(-0.17, 1.08 - DESK_TOP - 0.165, 0.0735, 0, 0, 0.05));
    addPrint(ctx.prints, hb, 0.076, 0.076, 192, 192, (g, w, h) => drawSticky(g, w, h, 'orca.lab.local:8080 · jenkins.lab.local:8080', 4), xf(0.19, 1.08 - DESK_TOP - 0.168, 0.0735, 0, 0, -0.04));
  });
  const sn = getProp('desk.player.sticky-notes');
  addPrint(ctx.prints, hb, 0.076, 0.076, 192, 192, (g, w, h) => drawSticky(g, w, h, 'theme=avocado · kernelType=CPA', 5), xf(sn.pos[0], DESK_TOP + 0.0012, sn.pos[2], -Math.PI / 2, 0, 0.2 + Math.PI));
  ctx.statics.flushInto(hb, hintGroup_(ctx));
  proxies['desk.player.sticky-notes'] = ctx.ia.proxy(ctx.root, 0.09, 0.01, 0.09, xf(sn.pos[0], DESK_TOP + 0.005, sn.pos[2]), 'sticky');

  // PC tower under the right end
  const pc = getProp('desk.player.computer');
  let pcLed = -1;
  b.at(pc.pos[0], 0, pc.pos[2], rad(pc.rotY), () => {
    const lp = pcTower(ctx, b);
    pcLed = ctx.leds.add({ pos: wpos(b, ...lp), normal: wposDir(b), color: '#2f6bff', size: 0.005 });
    addTape(ctx, b, 'WS · 10.42.50.17', 6, xf(0, 0.36, 0.2112));
    proxies['desk.player.computer'] = ctx.ia.proxy(ctx.root, 0.22, 0.47, 0.44, b.matrix.clone().multiply(xf(0, 0.235, 0)), 'pc');
  });
  // keyboard + mouse
  const kb = getProp('desk.player.keyboard');
  b.at(kb.pos[0], DESK_TOP, kb.pos[2], rad(kb.rotY), () => keyboard(ctx, b));
  proxies['desk.player.keyboard'] = ctx.ia.proxy(ctx.root, 0.46, 0.04, 0.15, xf(kb.pos[0], DESK_TOP + 0.02, kb.pos[2]), 'kb');
  const ms = getProp('desk.player.mouse');
  b.at(ms.pos[0], DESK_TOP, ms.pos[2], rad(ms.rotY), () => mouseAndPad(ctx, b));
  // card reader (USB magstripe)
  const cr = getProp('desk.player.card-reader');
  b.at(cr.pos[0], DESK_TOP, cr.pos[2], rad(cr.rotY), () => {
    b.add(rboxGeo(0.1, 0.035, 0.04, 0.006, 2), mats.satinBlack, xf(0, 0.0175, 0));
    b.box(0.096, 0.03, 0.003, mats.blackPlastic, 0, 0.022, 0, 0, 'none'); // swipe slot
    b.add(tubeGeo([[0.05, 0.01, 0], [0.09, 0.006, -0.02], [0.15, 0.004, -0.12], [0.2, 0.004, -0.2]], 0.002, 6, 20), mats.cableBlack, null, 'none');
    ctx.leds.add({ pos: wpos(b, -0.04, 0.0352, 0.012), normal: [0, 1, 0], color: '#2bff6a', size: 0.0025 });
  });
  proxies['desk.player.card-reader'] = ctx.ia.proxy(ctx.root, 0.12, 0.05, 0.06, xf(cr.pos[0], DESK_TOP + 0.02, cr.pos[2]), 'cardreader');

  // desk phone (wedge) with its small LCD from the screens atlas
  const ph = getProp('desk.player.phone');
  const phoneSlot = ctx.screens.draw(128, 96, (g, w, h) => drawPhone(g, w, h, '09:00', true));
  b.at(ph.pos[0], DESK_TOP, ph.pos[2], rad(ph.rotY), () => {
    b.add(profileGeo([[0.1, 0], [0.1, 0.028], [-0.085, 0.085], [-0.1, 0.08], [-0.1, 0]], 0.21, 0.004), mats.satinBlack);
    const slope = Math.atan2(0.057, 0.185);
    b.within(xf(0.035, 0.057 + 0.0045 * Math.cos(slope), 0.005 + 0.0045 * Math.sin(slope), -(Math.PI / 2 - slope), 0, 0), () => {
      b.add(ctx.screens.quad(0.06, 0.045, phoneSlot), phoneSlot.page.material, xf(0, 0.045, 0.0012), 'none');
      b.box(0.066, 0.051, 0.001, mats.blackPlastic, 0, 0.045, 0.0006, 0, 'none');
      // 12-key keypad + function keys
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b.add(rboxGeo(0.014, 0.01, 0.004, 0.0015, 1), mats.darkGreyPlastic, xf(-0.018 + c * 0.018, -0.008 - r * 0.014, 0.002), 'none');
      for (let r = 0; r < 4; r++) b.add(rboxGeo(0.02, 0.008, 0.004, 0.0015, 1), mats.midGreyPlastic, xf(0.05, 0.05 - r * 0.014, 0.002), 'none');
      ctx.leds.add({ pos: wpos(b, 0.07, 0.085, 0.0035), normal: wposDir(b), color: '#ff2614', size: 0.004 });
    });
    // handset in its cradle (left side) + coiled cord
    b.add(rboxGeo(0.05, 0.03, 0.2, 0.012, 2), mats.satinBlack, xf(-0.075, 0.075, -0.005, Math.atan2(0.057, 0.185), 0, 0));
    b.add(tubeGeo(Array.from({ length: 18 }, (_, i) => [-0.105 - 0.008 * Math.cos(i * 1.4), 0.03 + 0.008 * Math.sin(i * 1.4), 0.06 - i * 0.008] as Vec3), 0.0016, 5, 120), mats.satinBlack, null, 'none');
  });
  proxies['desk.player.phone'] = ctx.ia.proxy(ctx.root, 0.22, 0.1, 0.21, xf(ph.pos[0], DESK_TOP + 0.05, ph.pos[2]), 'phone');

  // mug + coffee surface
  const mg = getProp('desk.player.mug');
  b.at(mg.pos[0], DESK_TOP, mg.pos[2], rad(-60), () => {
    mug(ctx, b);
    addPrint(ctx.labels, b, 0.03, 0.03, 64, 64, (g, w, h) => {
      g.fillStyle = '#f1f1ee';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#43b02a';
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.beginPath();
        g.arc(w / 2 + dx * w * 0.18, h / 2 + dy * h * 0.18, w * 0.17, 0, Math.PI * 2);
        g.fill();
      }
    }, xf(0, 0.05, 0.0428));
  });
  const coffee = new Mesh(cylGeo(0.0388, 0.0388, 0.002, 24), mats.coffee);
  coffee.position.set(mg.pos[0], DESK_TOP + 0.01, mg.pos[2]);
  coffee.name = 'desk.player.mug.coffee';
  ctx.root.add(coffee);
  proxies['desk.player.mug'] = ctx.ia.proxy(ctx.root, 0.1, 0.11, 0.1, xf(mg.pos[0], DESK_TOP + 0.05, mg.pos[2]), 'mug');

  // steel ruler (pickup)
  const rl = getProp('tool.ruler');
  const ruler = new Group();
  ruler.name = 'tool.ruler';
  ruler.position.set(rl.pos[0], rl.pos[1] - 0.004, rl.pos[2]);
  ruler.rotation.y = rad(rl.rotY);
  const rb = new StaticBatch('ruler');
  rb.add(boxGeo(0.15, 0.0008, 0.018), mats.chrome, xf(0, 0.0004, 0), 'none');
  addPrint(ctx.labels, rb, 0.148, 0.016, 740, 80, (g, w, h) => {
    g.fillStyle = '#c9cbcd';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#1b1b1b';
    g.fillStyle = '#1b1b1b';
    g.font = `600 ${h * 0.32}px ${FONT.UI_SANS}`;
    for (let i = 0; i <= 148; i++) {
      const x = (i / 148) * w;
      const len = i % 10 === 0 ? 0.5 : i % 5 === 0 ? 0.35 : 0.22;
      g.fillRect(x, 0, 1.2, h * len);
      if (i % 10 === 0 && i > 0) g.fillText(String(i / 10), x + 2, h * 0.85);
    }
  }, xf(0, 0.00085, 0, -Math.PI / 2, 0, 0));
  ctx.statics.flushInto(rb, ruler);
  ctx.root.add(ruler);
  ctx.ia.proxy(ruler, 0.16, 0.012, 0.03, xf(0, 0.004, 0), 'ruler-proxy');

  // the player's chair (slides 0.25 m toward the desk when seated)
  const cp = getProp('desk.player.chair');
  const chair = new Group();
  chair.name = 'desk.player.chair';
  chair.position.set(cp.pos[0], 0, cp.pos[2]);
  const cb = new StaticBatch('player-chair');
  officeChair(ctx, cb, 0);
  ctx.statics.flushInto(cb, chair, true);
  ctx.root.add(chair);
  // seat + armrests, plus a separate backrest box: one 1.05 m cube over the whole chair hid the
  // desk-top sticky note (and the keyboard edge) from anyone standing behind the chair
  const chairProxy = ctx.ia.proxy(chair, 0.6, 0.7, 0.6, xf(0, 0.35, 0), 'chair');
  ctx.ia.proxy(chairProxy, 0.5, 0.6, 0.12, xf(0, 0.51, -0.27), 'chair-back');
  proxies['desk.player.chair'] = chairProxy;

  return { chair, mirror, monitorProxy, phoneSlot, coffee, ruler, proxies, pcLed, monLeds };
}

/** Front normal (+Z of the batch frame) in world space. */
function wposDir(b: StaticBatch): Vec3 {
  const a = wpos(b, 0, 0, 0);
  const c = wpos(b, 0, 0, 1);
  return [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
}

const STATUS_FALLBACK: [string, string][] = [
  ['wall-e', 'AVAILABLE'], ['eve', 'AVAILABLE'], ['r2-d2', 'AVAILABLE'], ['bumblebee', 'AVAILABLE'], ['johnny-5', 'AVAILABLE'],
  ['seti', 'AVAILABLE'], ['baymax', 'OFFLINE'], ['rosie', 'UNAVAILABLE'], ['megatron', 'AVAILABLE'], ['optimus', 'AVAILABLE'], ['data', 'AVAILABLE'],
];

function mirrorState(lab: LabState, t: number, seated: boolean): MirrorState {
  const robots = lab?.orca?.robots
    ? Object.values(lab.orca.robots)
        .slice(0, 11)
        .map((r) => [r.name, String(r.status), (r.deviceId != null ? lab.orca.devices?.[r.deviceId]?.deviceType : null) ?? ''] as [string, string, string])
    : [];
  const shellLines: string[] = [];
  return {
    clock: clockHHMM(lab),
    t,
    robots: robots.length ? robots : STATUS_FALLBACK,
    terminal: shellLines.length
      ? shellLines
      : ['$ adb connect 10.42.30.11:5444', 'connected to 10.42.30.11:5444', '$ curl -s http://10.42.10.11:8000/health', '{"status":"ok","brainbox":"v6"}', '$ git status', 'On branch main', 'nothing to commit, working tree clean', '$ '],
    seated,
  };
}

function wirePlayerDesk(ctx: LabCtx, d: PlayerDesk): void {
  const { engine } = ctx;
  let chairTarget = 0;
  let chairZ = 0;
  let seated = false;
  const sit = () => {
    if (engine.isFocused()) return;
    seated = true;
    chairTarget = 0.25;
    engine.audio.play('footstep', { position: [1.1, 0.4, 4.1], volume: 0.4, rate: 0.6 });
    engine.exitPointerLock();
    void engine.focus({ position: SEATED_POSE.position, lookAt: SEATED_POSE.lookAt, fov: SEATED_POSE.fov }, 600);
    mutate((s) => {
      s.ui.overlay = { kind: 'computer' };
    });
  };
  const sitVerbs = () => pickVerbs([{ key: 'E', label: 'Sit at workstation', run: sit }]);
  for (const id of ['desk.player.chair', 'desk.player.computer', 'desk.player.monitor-l', 'desk.player.monitor-r', 'desk.player.keyboard']) {
    ctx.ia.register(id, d.proxies[id]!, sitVerbs);
  }

  // phone: voicemail
  ctx.ia.register('desk.player.phone', d.proxies['desk.player.phone']!, () =>
    pickVerbs([
      {
        key: 'E',
        label: 'Play voicemail',
        run: () => {
          engine.audio.play('device-beep', { position: [0.48, 0.8, 4.62], volume: 0.6 });
          ctx.engine.audio.play('ui-click');
          mutate((s) => void (s.ui.callouts = { propId: 'desk.player.phone', lines: ['Voicemail (1): "Welcome to the lab! Grab the multimeter at the power wall when you get a minute."'], untilS: s.session.clockS + 6 }));
          missedCall = false;
        },
      },
    ]),
  );
  // mug
  ctx.ia.register('desk.player.mug', d.proxies['desk.player.mug']!, () =>
    pickVerbs([
      {
        key: 'E',
        label: 'Drink',
        blocked: () => (mugState.fill > 0.05 ? null : 'Empty — the coffee machine is by the door'),
        run: () => {
          mugState.fill = Math.max(0, mugState.fill - 0.2);
          toast('info', 'Coffee', mugState.fill > 0.05 ? 'Still warm.' : 'Empty.');
        },
      },
    ]),
  );
  // card reader: swipe the selected test card
  ctx.ia.register('desk.player.card-reader', d.proxies['desk.player.card-reader']!, () =>
    pickVerbs([
      {
        key: 'E',
        label: 'Swipe test card',
        tool: ['test-card-visa', 'test-card-interac'],
        run: () => {
          const tool = store.getState().session.activeTool === 'test-card-interac' ? 'test-card-interac' : 'test-card-visa';
          engine.audio.play('card-insert', { position: [0.62, 0.76, 4.44], volume: 0.7 });
          engine.audio.play('device-beep', { position: [0.62, 0.76, 4.44], volume: 0.5 });
          emit('workstation.cardSwiped', { card: tool });
          toast('info', 'Card reader', `Swiped the ${tool === 'test-card-interac' ? 'Interac' : 'Visa'} test card — open the Card Reader utility to see the tracks.`);
        },
      },
    ]),
  );
  ctx.ia.register('desk.player.sticky-notes', d.proxies['desk.player.sticky-notes']!, () => []);
  // ruler pickup
  ctx.ia.register('tool.ruler', d.ruler, () =>
    pickVerbs([
      {
        key: 'E',
        label: 'Pick up',
        run: () => {
          if (carry('ruler', 'Steel ruler', null, 'tool.ruler')) toast('success', 'Steel ruler', 'E on a device screen to measure from its (0,0).');
        },
      },
    ]),
  );

  let missedCall = true;
  let lastMinute = '';
  const mirrorTick = throttle(2);
  ctx.hooks.push((dt, t, lab) => {
    // seat slide + overlay watch
    const ov = store.getState().ui.overlay.kind;
    if (seated && ov !== 'computer') {
      seated = false;
      chairTarget = 0;
    }
    if (chairZ !== chairTarget) {
      const step = dt / 0.4 * 0.25;
      chairZ = chairTarget > chairZ ? Math.min(chairTarget, chairZ + step) : Math.max(chairTarget, chairZ - step);
      d.chair.position.z = getProp('desk.player.chair').pos[2] + chairZ;
    }
    // ruler visible unless carried
    const showRuler = carriedId() !== 'ruler';
    if (d.ruler.visible !== showRuler) d.ruler.visible = showRuler;
    // mug coffee level
    d.coffee.visible = mugState.fill > 0.02;
    d.coffee.position.y = DESK_TOP + 0.01 + mugState.fill * 0.075;
    // desktop mirror at 2 Hz (dark while seated: the React desktop covers the monitors anyway)
    if (mirrorTick(t)) d.mirror.draw((g, w, h) => drawDesktopMirror(g, w, h, mirrorState(lab, t, seated)));
    const hm = clockHHMM(lab);
    if (hm !== lastMinute) {
      lastMinute = hm;
      redrawSlot(d.phoneSlot, (g, w, h) => drawPhone(g, w, h, hm, missedCall));
    }
  });
}

/* ───────────────────────────── Morgan's desk ───────────────────────────── */

function buildMorganDesk(ctx: LabCtx, b: StaticBatch): void {
  const { mats } = ctx;
  const slotMon = ctx.screens.draw(256, 144, (g, w, h) => drawOfficeScreen(g, w, h, 'chat', 11));
  const slotLap = ctx.screens.draw(256, 160, (g, w, h) => drawOfficeScreen(g, w, h, 'laptop-code', 12));
  b.at(-0.9, DESK_TOP, 4.8, Math.PI, () => monitor24(ctx, b, 0.34, { geo: (w, h) => ctx.screens.quad(w, h, slotMon), mat: slotMon.page.material }));
  b.at(-0.45, DESK_TOP, 4.5, Math.PI + 0.35, () => laptop(ctx, b, slotLap.page.material, (w, h) => ctx.screens.quad(w, h, slotLap), 108, true));
  b.at(-0.95, DESK_TOP, 4.46, Math.PI, () => keyboard(ctx, b));
  b.at(-1.3, DESK_TOP, 4.47, Math.PI, () => mouseAndPad(ctx, b));
  b.at(-0.55, 0, 4.7, Math.PI, () => pcTower(ctx, b));
  // generic boxy toy robot
  b.at(-1.45, DESK_TOP, 4.75, Math.PI + 0.4, () => {
    b.add(rboxGeo(0.06, 0.07, 0.045, 0.006, 2), mats.lightGreyMetal, xf(0, 0.055, 0));
    b.add(rboxGeo(0.05, 0.04, 0.04, 0.006, 2), mats.lightGreyMetal, xf(0, 0.112, 0));
    b.box(0.036, 0.012, 0.002, mats.blackPlastic, 0, 0.115, 0.0205, 0, 'none');
    b.add(cylGeo(0.002, 0.002, 0.03, 6), mats.chrome, xf(0, 0.145, 0));
    b.add(sphereGeo(0.005, 8, 6), mats.red, xf(0, 0.16, 0));
    for (const s of [-1, 1]) {
      b.add(rboxGeo(0.016, 0.022, 0.03, 0.004, 1), mats.darkGreyPlastic, xf(s * 0.016, 0.011, 0));
      b.add(rboxGeo(0.012, 0.045, 0.014, 0.004, 1), mats.darkGreyPlastic, xf(s * 0.038, 0.06, 0, 0, 0, s * 0.15));
    }
    ctx.leds.add({ pos: wpos(b, -0.009, 0.116, 0.0215), normal: wposDir(b), color: '#2bff6a', size: 0.004 });
    ctx.leds.add({ pos: wpos(b, 0.009, 0.116, 0.0215), normal: wposDir(b), color: '#2bff6a', size: 0.004 });
  });
  // small plant
  b.at(-1.62, DESK_TOP, 4.52, 0, () => {
    b.add(latheGeo([[0.001, 0], [0.04, 0], [0.05, 0.09], [0.054, 0.095], [0.001, 0.095]], 18), mats.terracotta);
    b.add(cylGeo(0.047, 0.047, 0.004, 16), mats.soil, xf(0, 0.088, 0), 'none');
    for (let i = 0; i < 9; i++) {
      const a = i * 2.4;
      const g = sphereGeo(1, 8, 6);
      g.scale(0.012, 0.04, 0.03);
      b.add(g, mats.plant, xf(Math.cos(a) * 0.02, 0.12 + (i % 3) * 0.015, Math.sin(a) * 0.02, 0.5 * Math.cos(a), a, 0.5 * Math.sin(a)), 'none');
    }
  });
}

/* ───────────────────────────── coworker desks + desk devices ───────────────────────────── */

interface CoworkerDevice {
  id: string;
  type: DeviceTypeCode;
  family: 'FLEX' | 'MINI';
  screen: DynScreen;
  screenMesh: Mesh | null;
  group: Group;
  focus: { position: Vec3; lookAt: Vec3; fov: number };
}

function buildCoworkerDesks(ctx: LabCtx, b: StaticBatch): CoworkerDevice[] {
  const { mats } = ctx;
  // coworker-1: two monitors + headphones
  const s1 = ctx.screens.draw(256, 144, (g, w, h) => drawOfficeScreen(g, w, h, 'code', 21));
  const s2 = ctx.screens.draw(256, 144, (g, w, h) => drawOfficeScreen(g, w, h, 'chat', 22));
  const s3 = ctx.screens.draw(256, 144, (g, w, h) => drawOfficeScreen(g, w, h, 'sheet', 23));
  b.at(-6.38, DESK_TOP, 4.8, rad(168), () => monitor24(ctx, b, 0.34, { geo: (w, h) => ctx.screens.quad(w, h, s1), mat: s1.page.material }));
  b.at(-5.8, DESK_TOP, 4.8, rad(192), () => monitor24(ctx, b, 0.34, { geo: (w, h) => ctx.screens.quad(w, h, s2), mat: s2.page.material }));
  b.at(-6.1, DESK_TOP, 4.46, Math.PI, () => keyboard(ctx, b));
  b.at(-5.75, DESK_TOP, 4.47, Math.PI, () => mouseAndPad(ctx, b));
  b.at(-5.45, 0, 4.7, Math.PI, () => pcTower(ctx, b));
  // headphones on the desk
  b.at(-5.55, DESK_TOP, 4.62, 0.6, () => {
    b.add(torusGeo(0.085, 0.008, 6, 20, Math.PI), mats.satinBlack, xf(0, 0.012, 0, Math.PI / 2, 0, 0), 'none');
    for (const s of [-1, 1]) b.add(cylGeo(0.035, 0.035, 0.025, 18), mats.satinBlack, xf(s * 0.085, 0.013, 0, 0, 0, 0), 'none');
  });
  // coworker-2: one monitor + mug
  b.at(-4.3, DESK_TOP, 4.8, Math.PI, () => monitor24(ctx, b, 0.34, { geo: (w, h) => ctx.screens.quad(w, h, s3), mat: s3.page.material }));
  b.at(-4.3, DESK_TOP, 4.46, Math.PI, () => keyboard(ctx, b));
  b.at(-4.65, DESK_TOP, 4.47, Math.PI, () => mouseAndPad(ctx, b));
  b.at(-4.75, DESK_TOP, 4.55, 0.8, () => mug(ctx, b, mats.redPlastic));
  b.at(-3.65, 0, 4.7, Math.PI, () => pcTower(ctx, b));

  const out: CoworkerDevice[] = [];
  for (const [id, type, holder] of [['desk.coworker-1.device', 'FLEX_3', 'dock'], ['desk.coworker-2.device', 'MINI_3', 'stand']] as const) {
    const p = getProp(id);
    const model = DEVICE_MODELS[type];
    const sz = screenCanvasSize(model.screen!.mm[0], model.screen!.mm[1], 'medium');
    const screen = new DynScreen(sz.w, sz.h, `${id}.screen`);
    const group = new Group();
    group.name = id;
    group.position.set(p.pos[0], DESK_TOP, p.pos[2]);
    group.rotation.y = rad(p.rotY); // device front faces the chair (north)
    const db = new StaticBatch(id);
    displayDevice(ctx, db, type, { lit: { geo: (w, h) => planeGeo(w, h), mat: screen.material }, holder: holder as 'dock' | 'stand' });
    const meshes = ctx.statics.flushInto(db, group);
    ctx.root.add(group);
    const screenMesh = meshes.find((m) => m.material === screen.material) ?? null;
    const face = deviceFaceLocal(type, holder as 'dock' | 'stand');
    const rotDeg = p.rotY;
    const c = localToWorld([p.pos[0], DESK_TOP, p.pos[2]], rotDeg, face.centre);
    const nRot = localToWorld([0, 0, 0], rotDeg, face.normal);
    out.push({ id, type, family: type.startsWith('FLEX') ? 'FLEX' : 'MINI', screen, screenMesh, group, focus: uprightFocusPose(c, [nRot[0], face.normal[1], nRot[2]]) as CoworkerDevice['focus'] });
    ctx.ia.proxy(group, 0.22, 0.2, 0.2, xf(0, 0.1, 0), 'device-proxy');
  }
  return out;
}

/** The sim's desk device for this world prop (by propId, else by family on a `desk-*` spot). */
function deskDevice(lab: LabState, c: CoworkerDevice): TerminalDevice | undefined {
  const devs = lab?.devices ? Object.values(lab.devices) : [];
  const onDesk = devs.filter((d) => d.rigId?.startsWith('desk-'));
  return (
    devs.find((d) => (d as { propId?: string }).propId === c.id) ??
    // exact model first (seed: Riley's desk Flex 3, Sam's desk Mini 3), then the family
    onDesk.find((d) => d.type === c.type) ??
    onDesk.find((d) => d.type.startsWith(c.family)) ??
    undefined
  );
}

function fallbackRegister(g: CanvasRenderingContext2D, w: number, h: number, clock: string): void {
  g.fillStyle = '#f4f6f5';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#228b3b';
  g.fillRect(0, 0, w, h * 0.08);
  g.fillStyle = '#ffffff';
  g.font = `600 ${h * 0.035}px ${FONT.UI_SANS}`;
  g.textBaseline = 'middle';
  g.fillText('Register', w * 0.05, h * 0.04);
  g.textAlign = 'right';
  g.fillText(clock, w * 0.95, h * 0.04);
  g.textAlign = 'left';
  const cols = w > h ? 4 : 3;
  const tw = (w * 0.9) / cols;
  for (let i = 0; i < cols * 3; i++) {
    const x = w * 0.05 + (i % cols) * tw;
    const y = h * 0.12 + Math.floor(i / cols) * tw * 0.75;
    g.fillStyle = ['#e9efe9', '#dfe9f6', '#f6efe0'][i % 3]!;
    g.fillRect(x + 3, y + 3, tw - 6, tw * 0.75 - 6);
  }
  g.fillStyle = '#228b3b';
  g.fillRect(w * 0.05, h * 0.86, w * 0.9, h * 0.09);
  g.fillStyle = '#fff';
  g.save();
  g.translate(w * 0.05, h * 0.86);
  fitText(g, 'Charge $0.00', w * 0.9, h * 0.09, { color: '#fff', font: FONT.UI_SANS, weight: 700 });
  g.restore();
}

function wireCoworkerDevice(ctx: LabCtx, c: CoworkerDevice): void {
  const model = DEVICE_MODELS[c.type];
  const [wMm, hMm] = model.screen!.mm;
  let lastRev = -1;
  let lastMin = '';
  let lastDevice: TerminalDevice | undefined;
  const tick = throttle(4);
  ctx.hooks.push((_dt, t, lab) => {
    if (!tick(t)) return;
    const dev = deskDevice(lab, c);
    const rev = dev?.display?.rev ?? -1;
    const min = clockHHMM(lab);
    if (dev === lastDevice && rev === lastRev && (dev || min === lastMin)) return;
    lastDevice = dev;
    lastRev = rev;
    lastMin = min;
    const off = dev && (dev.power !== 'on' || (dev.display?.brightness ?? 1) <= 0);
    if (c.screenMesh) c.screenMesh.visible = !off;
    if (off) return;
    c.screen.draw((g, w, h) => {
      if (dev) {
        try {
          render2d.drawDeviceDisplay(g, lab, dev, 'primary', { pxPerMm: w / wMm, timeMs: lab.time?.physMs ?? 0 });
          return;
        } catch {
          /* renderer not ready for this state */
        }
      }
      fallbackRegister(g, w, h, min);
    });
  });
  ctx.ia.register(c.id, c.group, () =>
    pickVerbs([
      {
        key: 'E',
        label: 'Look at screen',
        run: () => {
          ctx.engine.exitPointerLock();
          void ctx.engine.focus(c.focus, 500);
          mutate((s) => void (s.ui.overlay = { kind: 'inspect', propId: c.id }));
        },
      },
      {
        key: 'R',
        label: 'Tap screen',
        run: () => {
          const lab = store.getState().lab;
          const dev = deskDevice(lab, c);
          if (!dev) return void toast('info', 'Desk device', 'Desk device — ADB on 5555. (Not simulated yet.)');
          const [x, y] = c.screenMesh ? crosshairScreenMm(ctx.engine.camera, c.screenMesh, wMm, hMm) : [wMm / 2, hMm / 2];
          simCall('Tap screen', () => sim.device.touch(dev.id, 'primary', x, y, 'player'));
        },
      },
    ]),
  );
}

/* ───────────────────────────── wall clock ───────────────────────────── */

function buildClock(ctx: LabCtx): void {
  const { mats } = ctx;
  const p = getProp('wall.clock');
  const g = new Group();
  g.name = 'wall.clock';
  g.position.set(p.pos[0], p.pos[1], 4.997);
  g.rotation.y = Math.PI;
  ctx.root.add(g);
  const b = new StaticBatch('clock');
  b.add(latheGeo([[0, 0], [0.15, 0], [0.155, 0.006], [0.152, 0.035], [0.14, 0.04], [0.135, 0.032], [0, 0.032]], 40), mats.satinBlack, xf(0, 0, 0, Math.PI / 2, 0, 0));
  addPrint(ctx.prints, b, 0.27, 0.27, 512, 512, (c, w, h) => {
    c.fillStyle = '#fbfbf8';
    c.beginPath();
    c.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#111';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      const long = i % 5 === 0;
      c.save();
      c.translate(w / 2, h / 2);
      c.rotate(a);
      c.fillRect(-(long ? 4 : 1.5), -w * 0.47, long ? 8 : 3, long ? w * 0.06 : w * 0.025);
      c.restore();
    }
    c.font = `600 ${w * 0.09}px ${FONT.UI_SANS}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let n = 1; n <= 12; n++) {
      const a = (n / 12) * Math.PI * 2;
      c.fillText(String(n), w / 2 + Math.sin(a) * w * 0.35, h / 2 - Math.cos(a) * w * 0.35);
    }
  }, xf(0, 0, 0.033));
  ctx.statics.flushInto(b, g);
  const hand = (len: number, wd: number, mat: Material, z: number) => {
    const geo = boxGeo(wd, len, 0.002);
    geo.translate(0, len / 2 - len * 0.15, 0);
    const m = new Mesh(geo, mat);
    m.position.z = z;
    g.add(m);
    return m;
  };
  const hh = hand(0.075, 0.008, mats.satinBlack, 0.036);
  const mh = hand(0.11, 0.005, mats.satinBlack, 0.038);
  const sh = hand(0.12, 0.0018, mats.red, 0.04);
  const cap = new Mesh(cylGeo(0.006, 0.006, 0.004, 12), mats.red);
  cap.rotation.x = Math.PI / 2;
  cap.position.z = 0.042;
  g.add(cap);
  ctx.hooks.push((_dt, _t, lab) => {
    const s = gameSeconds(lab);
    // clockwise when seen from the front (the group is rotated so +Z faces the room)
    sh.rotation.z = -((Math.floor(s) % 60) / 60) * Math.PI * 2;
    mh.rotation.z = -(((s / 60) % 60) / 60) * Math.PI * 2;
    hh.rotation.z = -(((s / 3600) % 12) / 12) * Math.PI * 2;
  });
}
