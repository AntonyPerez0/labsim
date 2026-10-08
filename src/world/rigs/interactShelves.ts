/**
 * Interactables of the racks, Callus shelf, tethered bench, ADB shelf and build table (World §9.2):
 * rail units (U1–U42 left/right, inspect `U<n>`), rack distribution (measure), Rack B camera Pi,
 * AC strips + sockets (switch / unplug / plug / measure), Collis probes (re-seat ribbon, PSU),
 * Windows boxes (power button, Ethernet), KVM console, tethered faces (look / tap), hubs (re-seat
 * USB / Ethernet / power), SmartStripe probes, shelf Pis and webcams, DATA / TARS, build table.
 */
import { Group, type Object3D } from 'three';
import type { Engine } from '@/engine/types';
import { store } from '@/core/store';
import { sim } from '@/sim';
import type { PowerHookup } from '@/sim/types';
import {
  AC_STRIPS,
  CALLUS_BOXES,
  RACKS,
  RACK_DISTRIBUTION,
  RACK_FRAME,
  SHELF_IDS,
  TETHERED_RIGS,
  ADB_RIGS,
  findSimId,
  findSimObject,
  railUnitId,
  railUnitLabelPos,
  rigDevice,
  stripSocketId,
  uprightFocusPose,
} from '../layout';
import { MM } from './kit/geom';
import { hitBox } from './kit/moving';
import { activeTool, cardVerbs, crosshairScreenMm, focusWithOverlay, reg, reseatAction, simCall, verb, type Verb } from './interactCommon';
import type { RackHandles } from './rack';
import type { CallusHandles } from './callusShelf';
import type { TetheredHandles } from './tethered';
import type { AdbHandles } from './adbShelf';
import type { BuildTableHandles } from './buildTable';
import type { ScreenManager } from './screens';
import { B, type V3 } from './parts';

const lab = () => store.getState().lab;

function worldHit(hits: Object3D, b: B, p: V3, s: V3, name: string): Object3D {
  return hitBox(hits, s[0], s[1], s[2], b.mat({ p }), name);
}

function measureVerb(pointId: string): Verb {
  return verb('E', 'Measure', () => {
    try {
      sim.power.measure(pointId);
    } catch {
      /* sim pending */
    }
  }, { requiresTool: 'multimeter' });
}

/** Strip on/off + six socket targets (unplug the load / plug the last unplugged load back). */
function registerStrip(engine: Engine, offs: (() => void)[], hits: Object3D, b: B, stripId: string, socketsLocal: V3[], body: { p: V3; s: V3 }): void {
  const def = AC_STRIPS.find((s) => s.id === stripId)!;
  const simId = () => findSimId(lab(), def.sim) ?? def.sim.ids[0]!;
  reg(engine, offs, stripId, worldHit(hits, b, body.p, body.s, `hit:${stripId}`), {
    verbs: () => {
      const s = findSimObject<{ switchOn: boolean; breakerTripped?: boolean }>(lab(), def.sim);
      const on = s?.switchOn ?? true;
      const out = [verb('E', on ? 'Switch off' : 'Switch on', () => simCall(engine, def.name, () => sim.power.toggleStrip(simId(), !on, 'player')))];
      if (s?.breakerTripped) out.push(verb('R', 'Reset breaker', () => simCall(engine, def.name, () => sim.power.resetBreaker(simId(), 'player'))));
      return out;
    },
  });
  socketsLocal.forEach((p, i) => {
    const n = i + 1;
    let lastLoad: string | null = null;
    reg(engine, offs, stripSocketId(stripId, n), worldHit(hits, b, p, [34, 40, 30], `hit:${stripId}.s${n}`), {
      label: () => `${def.name} · socket ${n}`,
      verbs: () => {
        if (activeTool() === 'multimeter') return [measureVerb(simId())];
        const s = findSimObject<{ loads: (string | null)[] }>(lab(), def.sim);
        const load = s?.loads?.[i] ?? null;
        if (load) return [verb('E', 'Unplug', () => {
          lastLoad = load;
          simCall(engine, 'Unplug', () => sim.power.unplug(load, 'player'));
        })];
        return [verb('E', lastLoad ? 'Plug back in' : 'Plug (nothing in hand)', () => {
          if (!lastLoad) return;
          const hk: PowerHookup = { kind: 'ac-strip', targetId: simId(), socket: n };
          simCall(engine, 'Plug', () => sim.power.plug(lastLoad!, hk, 'player'));
        }, { disabled: !lastLoad })];
      },
    });
  });
}

export interface ShelfCtx {
  racks: RackHandles[];
  callus: CallusHandles;
  tethered: TetheredHandles;
  adb: AdbHandles;
  table: BuildTableHandles | null;
  screens: ScreenManager;
}

export function registerShelves(engine: Engine, offs: (() => void)[], hits: Object3D, c: ShelfCtx): void {
  // ── rack rails (U1–U42, both front rails) ──
  for (const rack of RACKS) {
    for (let n = 1; n <= RACK_FRAME.units; n++) {
      for (const side of ['left', 'right'] as const) {
        const p = railUnitLabelPos(rack, n, side);
        // 28 mm wide (the 15 mm number band plus the flange either side of it): a 16 mm box was
        // a ~0.6° target at arm's length, which made "find rack unit 33" (M01) fiddly to aim at.
        const proxy = hitBox(hits, 28, RACK_FRAME.uMm - 1, 6, { p: [p[0] / MM, p[1] / MM, p[2] / MM + 2] }, `hit:${railUnitId(rack.id, n, side)}`);
        reg(engine, offs, railUnitId(rack.id, n, side), proxy, { verbs: () => [] });
      }
    }
    // the rails as a whole (`rack.<x>.rails`, the unit ids' parent prop): the outer side faces of
    // both front posts, full height, so it never competes with the per-unit proxies on the front
    const lo = railUnitLabelPos(rack, 1, 'left');
    const hi = railUnitLabelPos(rack, RACK_FRAME.units, 'left');
    const ro = railUnitLabelPos(rack, 1, 'right');
    const hMm = (hi[1] - lo[1]) / MM + RACK_FRAME.uMm;
    const cyMm = (hi[1] + lo[1]) / 2 / MM;
    const railsHit = new Group();
    railsHit.name = `hit:${rack.id}.rails`;
    hits.add(railsHit);
    for (const [p, sx] of [[lo, -1], [ro, 1]] as const) {
      hitBox(railsHit, 6, hMm, 40, { p: [p[0] / MM + sx * 22, cyMm, p[2] / MM - 25] }, `hit:${rack.id}.rails.${sx < 0 ? 'left' : 'right'}`);
    }
    reg(engine, offs, `${rack.id}.rails`, railsHit, { verbs: () => [] });
  }
  // ── rack distribution, strips, camera Pi ──
  for (const r of c.racks) {
    const d = RACK_DISTRIBUTION.find((x) => x.rackId === r.rack.id)!;
    const L = r.rack.letter.toLowerCase();
    const b = new B(c.callus.b.kit, r.frame.m);
    reg(engine, offs, d.id, worldHit(hits, b, [0, 1910, (d.pos[2] - r.rack.pos[2]) * 1000], [300, 60, 70], `hit:${d.id}`), {
      verbs: () => [measureVerb(`rail-5v-${L}`)],
    });
    const sd = AC_STRIPS.find((s) => s.host === r.rack.id)!;
    const sl: V3 = [0, sd.pos[1] * 1000, (sd.pos[2] - r.rack.pos[2]) * 1000];
    // sockets face the rear (rotated 180°): mirror the local x/z
    registerStrip(engine, offs, hits, b, sd.id, r.strip.sockets.map(([x, y, z]) => [sl[0] - x, sl[1] + y, sl[2] - z] as V3), { p: [sl[0] + 200, sl[1], sl[2]], s: [80, 44, 60] });
    if (r.cameraPi) {
      reg(engine, offs, SHELF_IDS.rackBCameraPi, worldHit(hits, b, [130, 1900, 300], [100, 40, 70], 'hit:camera-pi'), {
        verbs: () => [verb('E', 'Power-cycle', () => simCall(engine, 'Camera Pi', () => sim.host.powerCycle(findSimId(lab(), { collection: 'hosts', ids: ['pi-cam-rackb', 'pi-rackb-cam'] }) ?? 'pi-cam-rackb', 'player')))],
      });
    }
  }
  // ── Callus shelf ──
  const cb = c.callus.b;
  for (const [stripId, h] of Object.entries(c.callus.strips)) {
    const sd = AC_STRIPS.find((s) => s.id === stripId)!;
    const sl: V3 = [(sd.pos[0] + 2.0) * 1000, sd.pos[1] * 1000, (sd.pos[2] + 2.1) * 1000];
    registerStrip(engine, offs, hits, cb, stripId, h.sockets.map(([x, y, z]) => [sl[0] + x, sl[1] + y, sl[2] + z] as V3), { p: [sl[0] - 100, sl[1], sl[2]], s: [50, 45, 50] });
  }
  for (const bx of CALLUS_BOXES) {
    const p: V3 = [bx.local[0] * 1000, bx.local[1] * 1000 + 25, bx.local[2] * 1000];
    reg(engine, offs, bx.id, worldHit(hits, cb, p, [120, 52, 120], `hit:${bx.id}`), {
      verbs: () => {
        const hostId = findSimId(lab(), bx.sim);
        if (!hostId && bx.kind === 'slot') return [];
        const id = hostId ?? bx.sim.ids[0]!;
        return [
          verb('E', 'Power button', () => simCall(engine, bx.label, () => sim.host.pressPowerButton(id, false, 'player'))),
          verb('R', 'Re-seat Ethernet', () => simCall(engine, bx.label, () => sim.host.setEthernet(id, true, 'player'))),
        ];
      },
    });
  }
  const mon = c.callus.monitor;
  reg(engine, offs, 'callus.monitor', hitBox(hits, 180, 120, 30, mon.mesh.matrix.clone(), 'hit:callus.monitor'), {
    verbs: () => [verb('E', `Switch KVM (→ ${CALLUS_BOXES[(mon.kvm + 1) % CALLUS_BOXES.length]!.label})`, () => (mon.kvm = (mon.kvm + 1) % CALLUS_BOXES.length))],
  });
  for (const col of Object.values(c.callus.collis)) {
    const p = col.local;
    // where the PSU was plugged before the player pulled it (re-plug goes back to the same socket)
    let lastSupply: PowerHookup | null = null;
    reg(engine, offs, col.worldId, worldHit(hits, cb, [p[0], p[1] + 24, p[2]], [130, 50, 130], `hit:${col.worldId}`), {
      verbs: () => {
        const simId = findSimId(lab(), { collection: 'collis', ids: [col.simId] }, col.worldId) ?? col.simId;
        const probe = findSimObject<{ supply?: PowerHookup; ribbonConnected?: boolean }>(lab(), { collection: 'collis', ids: [col.simId] }, col.worldId);
        const loadId = `psu-${col.simId}`;
        const plugged = probe?.supply ? probe.supply.kind !== 'none' : true;
        const seated = probe?.ribbonConnected !== false;
        // `collis.reseatRibbon` toggles the IDC header: a re-seat of a seated ribbon is out + back in
        const toggle = () => simCall(engine, 'Collis probe', () => sim.collis.reseatRibbon(simId, 'player'));
        const out: Verb[] = [
          verb('E', seated ? 'Re-seat rear ribbon' : 'Seat rear ribbon', () => {
            if (seated && !toggle().ok) return;
            toggle();
          }),
          verb('R', plugged ? 'Unplug PSU' : 'Plug PSU', () => {
            if (plugged) {
              lastSupply = probe?.supply ? { ...probe.supply } : null;
              simCall(engine, 'Collis PSU', () => sim.power.unplug(loadId, 'player'));
            } else {
              const to = lastSupply && lastSupply.kind !== 'none' ? lastSupply : { kind: 'ac-strip' as const, targetId: 'STRIP-C', socket: 1 };
              simCall(engine, 'Collis PSU', () => sim.power.plug(loadId, to, 'player'));
            }
          }),
        ];
        if (seated) out.push(verb('G', 'Pull rear ribbon', () => toggle()));
        return out;
      },
    });
  }
  // ── tethered bench ──
  const tb = c.tethered.b;
  for (const f of c.tethered.faces) {
    const scr = f.handle.screens[0]!;
    const centre = tb.point(f.centre);
    reg(engine, offs, f.def.id, worldHit(hits, tb, [f.centre[0], f.centre[1], 4], [f.def.faceM[0] * 1000, f.def.faceM[1] * 1000, 12], `hit:${f.def.id}`), {
      verbs: () => {
        const r = rigDevice(lab(), f.rigId, f.def.role === 'mfd' ? 'primary' : 'secondary');
        const locked = !!lab().rigs?.[f.rigId]?.dashboardLocked;
        const cards = cardVerbs(engine, () => r?.device.id ?? null, (devId, entry, profile) => sim.device.presentCard(devId, entry, profile, 'player'));
        if (cards) return cards;
        return [
          verb('E', 'Look at screen', () => {
            c.screens.setFocused(f.def.id);
            focusWithOverlay(engine, uprightFocusPose([centre.x, centre.y, centre.z], [0, 0, 1]), { kind: 'inspect', propId: f.def.id });
          }),
          verb('R', locked ? 'Tap screen — locked, test in progress' : 'Tap screen', () => {
            if (!r) return;
            const mm = crosshairScreenMm(engine, scr.mesh, scr.wMm, scr.hMm);
            if (mm) simCall(engine, 'Tap screen', () => sim.device.touch(r.device.id, r.display, mm.x, mm.y, 'player'));
          }, { disabled: locked || !r }),
        ];
      },
    });
  }
  for (const rig of TETHERED_RIGS) {
    for (const f of [rig.mfd, rig.cfd]) {
      const dx = (TETHERED_DOCK_X[f.dockId] ?? 0) * 1000;
      let lastPower: PowerHookup | null = null;
      reg(engine, offs, f.dockId, worldHit(hits, tb, [dx, 1020, 360], [70, 180, 150], `hit:${f.dockId}`), {
        verbs: () => {
          const r = rigDevice(lab(), rig.id, f.role === 'mfd' ? 'primary' : 'secondary');
          const id = r?.device.id;
          const dev = r?.device as { hubUsbToPeer?: boolean; hubEthernet?: boolean } | undefined;
          // the sim's hub calls toggle the cable: a re-seat of a seated cable is out + back in
          const toggle = (port: 'usb' | 'ethernet') => () => (id ? sim.device.reseatHub(id, port, 'player') : { ok: false, error: 'no device' });
          const usb = reseatAction(engine, 'hub USB', dev?.hubUsbToPeer !== false, toggle('usb'));
          const eth = reseatAction(engine, 'hub Ethernet', dev?.hubEthernet !== false, toggle('ethernet'));
          const load = id ? Object.values(lab().power?.loads ?? {}).find((x) => x.deviceId === id) : undefined;
          const powered = !load || load.supply.kind !== 'none';
          return [
            verb('E', usb.label, usb.run, { disabled: !id }),
            verb('R', eth.label, eth.run, { disabled: !id }),
            verb('G', powered ? 'Unplug hub power' : 'Plug in hub power', () => {
              if (!id || !load) return;
              if (powered) {
                lastPower = { ...load.supply };
                simCall(engine, 'Hub', () => sim.device.reseatHub(id, 'power', 'player'));
              } else if (lastPower) {
                const to = lastPower;
                simCall(engine, 'Hub', () => sim.power.plug(load.id, to, 'player'));
              }
            }, { disabled: !id || (!powered && !lastPower) }),
          ];
        },
      });
    }
    const ss = rig.smartstripe;
    reg(engine, offs, ss.id, worldHit(hits, tb, [(ss.dongleX + ss.clampX) * 500, 1225, 0], [Math.abs(ss.clampX - ss.dongleX) * 1000 + 90, 60, 40], `hit:${ss.id}`), {
      verbs: () => {
        const host = lab().hosts?.[lab().rigs?.[rig.id]?.piHostId ?? ''];
        const a = reseatAction(engine, 'probe', !host || host.usb.includes(`smartstripe:${rig.id}`), () => sim.rig.reseat(rig.id, 'smartstripe', 'player'));
        return [verb('E', a.label, a.run)];
      },
    });
  }
  reg(engine, offs, SHELF_IDS.tetheredPi, worldHit(hits, tb, [0, 980, 360], [40, 100, 70], 'hit:tethered-pi'), {
    verbs: () => [verb('E', 'Power-cycle', () => simCall(engine, 'Raspberry Pi', () => sim.host.powerCycle('pi-tethered', 'player')))],
  });
  reg(engine, offs, SHELF_IDS.tetheredWebcam, worldHit(hits, tb, [0, 1450, 380], [80, 40, 40], 'hit:tethered-webcam'), {
    verbs: () => [
      verb('E', 'Adjust aim', () => {
        const w = lab().rigs?.megatron?.webcam;
        simCall(engine, 'Webcam', () => sim.rig.aimWebcam('megatron', -(w?.aimOffsetDeg?.yaw ?? 0), -(w?.aimOffsetDeg?.pitch ?? 0), 'player'));
      }),
      ((a) => verb('R', a.label, a.run))(reseatAction(engine, 'webcam USB', lab().rigs?.['megatron']?.webcam?.connected !== false, () => sim.rig.reseatWebcam('megatron', 'player'))),
    ],
  });
  registerStrip(engine, offs, hits, tb, 'power.strip.t', c.tethered.strip.sockets.map(([x, y, z]) => [x, 122.5 + y, -350 + z] as V3), { p: [-200, 122.5, -350], s: [50, 45, 50] });
  // ── ADB shelf ──
  const ab = c.adb.b;
  for (const d of c.adb.devices) {
    const scr = d.handle.screens[0]!;
    const sc = scr.mesh.getWorldPosition(scr.mesh.position.clone());
    const proxy = hitBox(hits, scr.wMm + 20, scr.hMm + 20, 30, scr.mesh.matrix.clone(), `hit:${d.worldId}`);
    proxy.scale.set((scr.wMm + 20) * MM, (scr.hMm + 20) * MM, 30 * MM);
    const rigDef = ADB_RIGS.find((r) => r.id === d.rigId)!;
    reg(engine, offs, d.worldId, proxy, {
      label: () => rigDef.hrn,
      verbs: () => {
        const r = rigDevice(lab(), d.rigId, 'primary');
        const n = scr.mesh.getWorldDirection(scr.mesh.position.clone());
        const cards = cardVerbs(engine, () => r?.device.id ?? null, (devId, entry, profile) => sim.device.presentCard(devId, entry, profile, 'player'));
        if (cards) return cards;
        return [
          verb('E', 'Look at screen', () => {
            c.screens.setFocused(d.worldId);
            focusWithOverlay(engine, uprightFocusPose([sc.x, sc.y, sc.z], [n.x, n.y, n.z]), { kind: 'inspect', propId: d.worldId });
          }),
          verb('R', 'Tap screen', () => {
            if (!r) return;
            const mm = crosshairScreenMm(engine, scr.mesh, scr.wMm, scr.hMm);
            if (mm) simCall(engine, 'Tap screen', () => sim.device.touch(r.device.id, r.display, mm.x, mm.y, 'player'));
          }, { disabled: !r }),
          verb('G', 'Power key', () => r && simCall(engine, 'Power key', () => sim.device.pressPower(r.device.id, false, 'player')), { disabled: !r }),
        ];
      },
    });
  }
  reg(engine, offs, SHELF_IDS.adbPi, worldHit(hits, ab, [-300, 470, -100], [100, 40, 70], 'hit:adb-pi'), {
    verbs: () => [verb('E', 'Power-cycle', () => simCall(engine, 'Raspberry Pi', () => sim.host.powerCycle('pi-adb-shelf', 'player')))],
  });
  reg(engine, offs, SHELF_IDS.adbWebcam, worldHit(hits, ab, [450, 1350, -250], [80, 40, 40], 'hit:adb-webcam'), {
    verbs: () => [
      verb('E', 'Adjust aim', () => {
        const w = lab().rigs?.data?.webcam;
        simCall(engine, 'Webcam', () => sim.rig.aimWebcam('data', -(w?.aimOffsetDeg?.yaw ?? 0), -(w?.aimOffsetDeg?.pitch ?? 0), 'player'));
      }),
      ((a) => verb('R', a.label, a.run))(reseatAction(engine, 'webcam USB', lab().rigs?.['data']?.webcam?.connected !== false, () => sim.rig.reseatWebcam('data', 'player'))),
    ],
  });
  registerStrip(engine, offs, hits, ab, 'power.strip.d', c.adb.strip.sockets.map(([x, y, z]) => [x, 472.5 + y, -220 + z] as V3), { p: [-200, 472.5, -220], s: [50, 45, 50] });
  // ── build table (inspect only) ──
  if (c.table) {
    for (const [id, it] of Object.entries(c.table.items)) reg(engine, offs, id, worldHit(hits, c.table.b, it.p, it.s, `hit:${id}`), { verbs: () => [] });
  }
}

const TETHERED_DOCK_X: Record<string, number> = {
  'rig.megatron.dock-mfd': -0.19,
  'rig.megatron.dock-cfd': -0.08,
  'rig.optimus.dock-mfd': 0.08,
  'rig.optimus.dock-cfd': 0.19,
};
