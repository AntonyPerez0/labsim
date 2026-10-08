/**
 * Touch-rig interactables (World §9.2 "Touch rigs"): tablet (focus + tablet overlay), MAIN/MOTOR,
 * side door, gantry head (LMB-drag push / E nudge → magnetic lock), solenoid connector, limit
 * switches, dip-arm alignment (screwdriver + tooth steps), motor PCB (EVE MOTION cable), cradle,
 * device (look / tap at the crosshair / power key), device brick, Pi (power-cycle), Pi power lead,
 * Pi Ethernet, bay fuse (open / pull / insert / measure), webcam (re-aim / re-seat USB), plus the
 * inspect-only parts (power panel, side panel, steppers, tap paddle, phone sled).
 */
import type { Object3D } from 'three';
import type { Engine } from '@/engine/types';
import { mutate, store } from '@/core/store';
import { sim } from '@/sim';
import type { PowerHookup } from '@/sim/types';
import { DEVICE_MODELS, rigDevice, rigPartId, tabletFocusPose, findSimObject, findSimId, touchRigPartList, type TouchRigDef } from '../layout';
import { hitBox } from './kit/moving';
import { MM } from './kit/geom';
import { FASCIA_HITS } from './fascia';
import { activeTool, cardVerbs, crosshairScreenMm, focusWithOverlay, notImplemented, pick, reg, reseatAction, simCall, verb, type Verb } from './interactCommon';
import type { TouchRigView } from './touchRig';
import type { TouchRigBinder } from './rigView';
import type { ScreenManager } from './screens';
import { deviceBayPlace } from './touchRig';
import { probe, meterMode } from '../lab/kit/meter';
import { useFuse } from '../lab/kit/inventory';
import { toast } from '../lab/kit/runtime';

/** Hide `obj` until the inspect overlay for `propId` closes. */
function hideWhileInspecting(obj: Object3D, propId: string): void {
  if (!obj.visible) return;
  obj.visible = false;
  const off = store.subscribe((st) => {
    const o = st.ui.overlay;
    if (o.kind === 'inspect' && (o as { propId?: string }).propId === propId) return;
    obj.visible = true;
    off();
  });
}

const toastWarn = (title: string, body: string) => toast('warning', title, body);
const toastInfo = (title: string, body: string) => toast('info', title, body);

let mouseDown = false;
let mouseHooked = false;
function hookMouse(): void {
  if (mouseHooked || typeof window === 'undefined') return;
  mouseHooked = true;
  window.addEventListener('mousedown', (e) => {
    if (e.button === 0) mouseDown = true;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) mouseDown = false;
  });
}

interface RigLocal {
  holderOpen: boolean;
  dipLoose: boolean;
  boltsOut: boolean;
  lastPiHookup: PowerHookup | null;
  lastDevHookup: PowerHookup | null;
  dragging: boolean;
  doorOverride: boolean | null;
}

/** Start a head drag (LMB held): mouse delta → bay X/Z mm; release commits the push to the sim. */
function startDrag(engine: Engine, binder: TouchRigBinder, local: RigLocal, rigId: string): void {
  if (local.dragging) return;
  local.dragging = true;
  engine.setControlsEnabled(false);
  const acc = { dx: 0, dy: 0 };
  let broke = false;
  binder.dragMm = { dx: 0, dy: 0 };
  const cfg = binder.config;
  const lab = store.getState().lab;
  const g = binder.rig(lab).gantry;
  const move = (e: MouseEvent) => {
    acc.dx += e.movementX * 0.25;
    acc.dy += e.movementY * 0.25;
    // clamp to the mechanical range (World §2.5)
    const x = Math.max(-10, Math.min(cfg.maxMm[0] + 10, g.xMm + acc.dx));
    const y = Math.max(-10, Math.min(cfg.maxMm[1] + 10, g.yMm + acc.dy));
    binder.dragMm = { dx: x - g.xMm, dy: y - g.yMm };
    if (!broke && Math.hypot(binder.dragMm.dx, binder.dragMm.dy) > 3) {
      broke = true;
      try {
        engine.audio.play('unplug', { position: binder.view.frame.point([0, 300, -60]).toArray() as [number, number, number], rate: 0.6 });
      } catch {
        /* ignore */
      }
    }
  };
  const up = (e: MouseEvent) => {
    if (e.button !== 0) return;
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    const d = binder.dragMm ?? { dx: 0, dy: 0 };
    if (Math.hypot(d.dx, d.dy) > 0.2) {
      const r = simCall(engine, 'Push head', () => sim.rig.dragCarriage(rigId, d.dx, d.dy, 'player'));
      if (notImplemented(r)) simCall(engine, 'Push head', () => sim.rig.pushHead(rigId, d.dx, d.dy, 'player'));
    }
    binder.dragMm = null;
    local.dragging = false;
    engine.setControlsEnabled(true);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

function hookupOf(lab: ReturnType<typeof store.getState>['lab'], loadId: string | null): PowerHookup | null {
  if (!loadId) return null;
  const l = findSimObject<{ supply?: PowerHookup }>(lab, { collection: 'power.loads', ids: [loadId] });
  return l?.supply ?? null;
}

export function registerTouchRig(engine: Engine, offs: (() => void)[], view: TouchRigView, binder: TouchRigBinder, screens: ScreenManager, hits: Object3D): void {
  hookMouse();
  const def: TouchRigDef = view.def;
  const id = def.id;
  const S = def.sim;
  const local: RigLocal = { holderOpen: false, dipLoose: false, boltsOut: false, lastPiHookup: null, lastDevHookup: null, dragging: false, doorOverride: null };
  const lab = () => store.getState().lab;
  const rig = () => binder.rig(lab());
  const bayHit = (part: string, p: [number, number, number], s: [number, number, number], parent?: Object3D) => {
    if (parent) return hitBox(parent, s[0], s[1], s[2], { p }, `hit:${id}.${part}`);
    const m = view.frame.matrix({ p });
    const mesh = hitBox(hits, s[0], s[1], s[2], m, `hit:${id}.${part}`);
    mesh.scale.set(s[0] * MM, s[1] * MM, s[2] * MM);
    return mesh;
  };
  const doorOpen = () => binder.doorOverride ?? rig().door === 'open';
  const P = (part: Parameters<typeof rigPartId>[1]) => rigPartId(id, part);

  for (const part of touchRigPartList(def)) {
    switch (part) {
      case 'tablet':
        reg(engine, offs, P('tablet'), bayHit('tablet', FASCIA_HITS.tablet!.p, FASCIA_HITS.tablet!.s), {
          label: () => `Status tablet — ${rig().tablet?.hrnShown || def.hrn}`,
          verbs: () => [verb('E', 'Use tablet', () => focusWithOverlay(engine, tabletFocusPose(def), { kind: 'tablet', robotId: id }))],
        });
        break;
      case 'power-panel':
        reg(engine, offs, P('power-panel'), bayHit(part, FASCIA_HITS['power-panel']!.p, FASCIA_HITS['power-panel']!.s), { verbs: () => [] });
        break;
      case 'side-panel':
        reg(engine, offs, P('side-panel'), bayHit(part, FASCIA_HITS['side-panel']!.p, FASCIA_HITS['side-panel']!.s), { verbs: () => [] });
        break;
      case 'switch-main':
      case 'switch-motor': {
        const which = part === 'switch-main' ? 'main' : 'motor';
        reg(engine, offs, P(part), bayHit(part, FASCIA_HITS[part]!.p, FASCIA_HITS[part]!.s), {
          verbs: () => {
            const on = which === 'main' ? rig().mainSwitch : rig().motorSwitch;
            return [verb('E', on ? 'Turn off' : 'Turn on', () => simCall(engine, `${which.toUpperCase()} switch`, () => sim.rig.setSwitch(id, which, !on, 'player')))];
          },
        });
        break;
      }
      case 'door': {
        const doorHit = hitBox(view.door.group, 30, 440, 900, { p: [0, 220, 450] }, `hit:${id}.door`);
        reg(engine, offs, P('door'), doorHit, {
          verbs: () => [verb('E', doorOpen() ? 'Close' : 'Open', () => {
            const open = !doorOpen();
            const r = simCall(engine, 'Side door', () => sim.rig.setDoor(id, open, 'player'));
            if (notImplemented(r)) binder.doorOverride = open;
          })],
        });
        break;
      }
      case 'carriage': {
        const h = hitBox(view.gantry.arm.group, 50, 70, 80, { p: [12, 350, 0] }, `hit:${id}.carriage`);
        reg(engine, offs, P('carriage'), h, {
          verbs: () => {
            if (!doorOpen()) return [verb('E', 'Push head — open the side door first', () => {}, { disabled: true })];
            return [
              verb('E', 'Push head (hold LMB and drag) / nudge 20 mm', () => {
                if (mouseDown) startDrag(engine, binder, local, id);
                else {
                  const r = simCall(engine, 'Push head', () => sim.rig.dragCarriage(id, 20, 0, 'player'));
                  if (notImplemented(r)) simCall(engine, 'Push head', () => sim.rig.pushHead(id, 20, 0, 'player'));
                }
              }),
              verb('R', 'Nudge 20 mm toward you', () => {
                const r = simCall(engine, 'Push head', () => sim.rig.dragCarriage(id, 0, 20, 'player'));
                if (notImplemented(r)) simCall(engine, 'Push head', () => sim.rig.pushHead(id, 0, 20, 'player'));
              }),
            ];
          },
        });
        break;
      }
      case 'solenoid': {
        const h = hitBox(view.gantry.arm.group, 30, 70, 30, { p: [26, 140, 0] }, `hit:${id}.solenoid`);
        reg(engine, offs, P('solenoid'), h, {
          verbs: () => {
            const loose = rig().solenoidConnector === 'LOOSE';
            return [verb('R', loose ? 'Re-seat connector' : 'Re-seat connector (seated)', () => simCall(engine, 'Solenoid connector', () => sim.rig.reseat(id, 'solenoidConnector', 'player')), { disabled: !loose })];
          },
        });
        break;
      }
      case 'stepper-x':
        reg(engine, offs, P(part), hitBox(view.gantry.motorX, 46, 46, 46, {}, `hit:${id}.${part}`), { verbs: () => [] });
        break;
      case 'stepper-y':
        reg(engine, offs, P(part), hitBox(view.gantry.motorY, 46, 46, 46, {}, `hit:${id}.${part}`), { verbs: () => [] });
        break;
      case 'limit-x':
      case 'limit-y': {
        const anchor = part === 'limit-x' ? view.gantry.limitX : view.gantry.limitY;
        reg(engine, offs, P(part), hitBox(anchor, 30, 20, 16, { p: [3, 5, 0] }, `hit:${id}.${part}`), {
          verbs: () => [verb('E', 'Press lever', () => {
            const w = anchor.getWorldPosition(anchor.position.clone());
            try {
              engine.audio.play('relay', { position: [w.x, w.y, w.z], rate: 1.8, volume: 0.6 });
            } catch {
              /* ignore */
            }
          })],
        });
        break;
      }
      case 'dip-arm': {
        reg(engine, offs, P(part), hitBox(view.act.dip.group, 30, 80, 150, { p: [0, 0, -60] }, `hit:${id}.dip-arm`), {
          verbs: () => {
            const tool = activeTool();
            const out: Verb[] = [];
            if (tool === 'screwdriver') {
              out.push(verb('E', local.dipLoose ? 'Tighten hub bolts' : 'Loosen hub bolts', () => {
                local.dipLoose = !local.dipLoose;
                try {
                  engine.audio.play('switch-toggle', { position: view.frame.point([10, binder.view.act.pivotY, -48]).toArray() as [number, number, number], rate: 2.2, volume: 0.4 });
                } catch {
                  /* ignore */
                }
              }));
            } else out.push(verb('E', 'Loosen hub bolts', () => {}, { requiresTool: 'screwdriver' }));
            out.push(verb('R', 'Rotate one tooth down', () => simCall(engine, 'Dip arm', () => sim.rig.alignDipArm(id, -1, 'player')), { disabled: !local.dipLoose }));
            out.push(verb('G', 'Rotate one tooth up', () => simCall(engine, 'Dip arm', () => sim.rig.alignDipArm(id, 1, 'player')), { disabled: !local.dipLoose }));
            return out;
          },
        });
        break;
      }
      case 'tap-paddle':
        reg(engine, offs, P(part), hitBox(view.act.tap.group, 70, 80, 50, { p: [100, -30, 0] }, `hit:${id}.tap-paddle`), { verbs: () => [] });
        break;
      case 'phone-sled':
        reg(engine, offs, P(part), hitBox(view.act.sled.group, 40, 70, 80, { p: [0, 40, 0] }, `hit:${id}.phone-sled`), { verbs: () => [] });
        break;
      case 'motor-pcb': {
        const s = def.doorSide;
        reg(engine, offs, P(part), bayHit(part, [-110 * s, 205, -888], [104, 74, 20]), {
          verbs: () => {
            const host = rig().motionHost;
            if (!host || host === 'PI') return [];
            return [verb('E', `Move ${def.hrn} MOTION cable to the Pi`, () => simCall(engine, 'Motor USB', () => sim.rig.moveMotorUsb(id, 'PI', 'player')))];
          },
        });
        break;
      }
      case 'cradle': {
        const cfg = binder.config;
        const pl = deviceBayPlace(cfg);
        // at least 25 mm wider than the device body all round, so the rim stays targetable
        // when the device proxy covers the middle (steep views into the bottom bays)
        const body = DEVICE_MODELS[cfg.type]?.bodyMm ?? [0, 0, 0];
        const cw = Math.max(cfg.primaryScreenMm[0] + 60, body[0] + 50);
        const ch = Math.max(cfg.primaryScreenMm[1] + 60, body[1] + 50);
        reg(engine, offs, P(part), bayHit(part, [pl.p[0], 40, pl.p[2]], [cw, 80, ch]), {
          verbs: () => {
            const out: Verb[] = [];
            if (activeTool() === 'screwdriver') out.push(verb('E', local.boltsOut ? 'Fit clamp bolts' : 'Remove clamp bolts', () => (local.boltsOut = !local.boltsOut)));
            else out.push(verb('E', 'Remove / fit clamp bolts', () => {}, { requiresTool: 'screwdriver' }));
            if (rig().cradle === 'CRACKED') out.push(verb('R', 'Replace cradle', () => simCall(engine, 'Cradle', () => sim.rig.replaceCradle(id, 'player'))));
            // swap the device (JOHNNY-5: Flex 1 ↔ Flex 2 per INC42; others: a fresh unit of the same type)
            const cur = binder.config.type;
            const next = def.deviceConfigs.find((c) => c.type !== cur)?.type ?? cur;
            out.push(verb('G', next === cur ? `Swap in a spare ${DEVICE_MODELS[cur].displayName}` : `Install ${DEVICE_MODELS[next].displayName}`, () => {
              const r = simCall(engine, 'Swap device', () => sim.device.swapHardware(id, next, 'player'));
              if (r.ok) local.boltsOut = false;
            }, { disabled: !local.boltsOut }));
            return out;
          },
        });
        break;
      }
      case 'device':
      case 'mfd':
      case 'cfd': {
        const display: 'primary' | 'secondary' = part === 'cfd' ? 'secondary' : 'primary';
        for (const vr of binder.view.variants) {
          const scr = vr.handle.screens.find((x) => x.display === display);
          if (!scr) continue;
          const sc = scr.mesh.getWorldPosition(scr.mesh.position.clone());
          const proxy = hitBox(hits, scr.wMm + 6, 8, scr.hMm + 6, { p: [sc.x / MM, sc.y / MM - 2, sc.z / MM] }, `hit:${id}.${part}`);
          const active = () => !vr.group || vr.group.visible;
          // the inactive configuration's proxy must not steal the crosshair (JOHNNY-5 Flex 1 / Flex 2)
          (vr.hitProxies ??= []).push(proxy);
          proxy.visible = active();
          reg(engine, offs, P(part), proxy, {
            label: () => `${DEVICE_MODELS[vr.cfg.type].displayName}${part === 'device' ? '' : ` ${part.toUpperCase()}`} — ${def.hrn}`,
            verbs: () => {
              if (!active()) return [];
              const r = rigDevice(lab(), id, display);
              const locked = !!rig().dashboardLocked;
              const key = `${id}:${display}:${vr.cfg.type}`;
              const cards = cardVerbs(engine, () => r?.device.id ?? null, (devId, entry, profile) => sim.device.presentCard(devId, entry, profile, 'player'));
              if (cards) return cards;
              return [
                verb('E', 'Look at screen', () => {
                  const c = sc;
                  screens.setFocused(key);
                  focusWithOverlay(engine, { position: [c.x, c.y + 0.2, c.z + 0.035], lookAt: [c.x, c.y, c.z], fov: 45 }, { kind: 'inspect', propId: P(part) });
                }),
                verb('R', locked ? 'Tap screen — locked, test in progress' : 'Tap screen', () => {
                  if (!r) return;
                  const mm = crosshairScreenMm(engine, scr.mesh, scr.wMm, scr.hMm);
                  if (!mm) return;
                  simCall(engine, 'Tap screen', () => sim.device.touch(r.device.id, r.display, mm.x, mm.y, 'player'));
                }, { disabled: locked || !r }),
                verb('G', 'Power key', () => r && simCall(engine, 'Power key', () => sim.device.pressPower(r.device.id, false, 'player')), { disabled: !r }),
              ];
            },
          });
          void active;
        }
        break;
      }
      case 'device-psu': {
        const p = binder.view.def.doorSide * 150;
        const load = S.deviceLoadIds[0] ?? null;
        reg(engine, offs, P(part), bayHit(part, [p, 18, -640], [70, 40, 120]), {
          verbs: () => {
            const hk = hookupOf(lab(), load);
            const plugged = hk ? hk.kind !== 'none' : true;
            return [verb('E', plugged ? 'Unplug' : 'Plug', () => {
              if (!load) return;
              if (plugged) {
                local.lastDevHookup = hk;
                simCall(engine, 'Device power', () => sim.power.unplug(load, 'player'));
              } else {
                // Never unplugged in this session: use the rack strip's bay socket, or its first free one
                // when that socket is taken (e.g. a brick back from repair onto a strip with one free outlet).
                const stripId = def.rackId === 'rack.a' ? 'STRIP-A' : 'STRIP-B';
                const strip = (lab().power?.strips as Record<string, { loads?: (string | null)[] }> | undefined)?.[stripId];
                const taken = strip?.loads?.[def.bay - 1];
                const free = strip?.loads ? strip.loads.indexOf(null) : -1;
                const socket = taken && free >= 0 ? free + 1 : def.bay;
                const back = local.lastDevHookup ?? { kind: 'ac-strip', targetId: stripId, socket };
                simCall(engine, 'Device power', () => sim.power.plug(load, back, 'player'));
              }
            })];
          },
        });
        break;
      }
      case 'pi': {
        const s = def.doorSide;
        // Case 94 × 63 × 30 at [165·s, 0, −790] (x along 94; rotated 180° on the s < 0 side).
        // Slightly smaller than the case so the USB-C and RJ45 hit boxes stick out of it.
        reg(engine, offs, P(part), bayHit(part, [165 * s, 16, -790], [86, 32, 56]), {
          label: () => `Raspberry Pi — ${def.hrn}`,
          verbs: () => [
            verb('E', 'Power-cycle', () => simCall(engine, 'Raspberry Pi', () => sim.host.powerCycle(findSimId(lab(), { collection: 'hosts', ids: [S.piHostId] }) ?? S.piHostId, 'player'))),
            // close look at the PWR / ACT light pipes and the RJ45 jack LEDs (gameplay §3.2 evidence)
            verb('R', 'Inspect LEDs', () => {
              // the PWR/ACT light pipes and jack LEDs sit on the case's door-side end (bay x ≈ 212·s,
              // z −816…−767); look at them from just outside the door plane
              const eye = view.frame.point([s * 290, 90, -735]);
              const at = view.frame.point([s * 212, 20, -790]);
              focusWithOverlay(engine, { position: [eye.x, eye.y, eye.z], lookAt: [at.x, at.y, at.z], fov: 40 }, { kind: 'inspect', propId: P('pi') });
              // a closed hex-mesh door 50 mm in front of the lens would fill the view: hide the leaf
              // while this inspect is open (you look through the mesh in reality)
              hideWhileInspecting(view.door.group, P('pi'));
            }),
          ],
        });
        break;
      }
      case 'pi-power': {
        const s = def.doorSide;
        // USB-C on the case's local −Z side (`buildPi` usbc [−30, 8, −33]) → bay [135·s, 8, −790 − 33·s];
        // the box protrudes ~30 mm out of that face so it can be targeted past the Pi body.
        reg(engine, offs, P(part), bayHit(part, [135 * s, 10, -790 - 48 * s], [44, 28, 36]), {
          verbs: () => {
            // a pulled (decorative) bay fuse leaves the lead in place but dead
            if (binder.bayFuseOut) return [verb('E', 'Unplug — no power while the bay fuse is out', () => {}, { disabled: true })];
            const hk = hookupOf(lab(), S.piLoadId);
            const plugged = hk ? hk.kind !== 'none' : true;
            return [verb('E', plugged ? 'Unplug' : 'Plug', () => {
              const loadId = S.piLoadId;
              if (!loadId) return;
              if (plugged) {
                local.lastPiHookup = hk;
                simCall(engine, 'Pi power', () => sim.power.unplug(loadId, 'player'));
              } else simCall(engine, 'Pi power', () => sim.power.plug(loadId, local.lastPiHookup ?? { kind: 'dc-rail', targetId: S.mainTerminalId }, 'player'));
            })];
          },
        });
        break;
      }
      case 'pi-ethernet': {
        const s = def.doorSide;
        // RJ45 on the case's +X end (`buildPi` jack [49, 11, 18]) → bay [214·s, 11, −790 + 18·s].
        reg(engine, offs, P(part), bayHit(part, [222 * s, 16, -790 + 18 * s], [30, 34, 34]), {
          verbs: () => {
            const host = findSimObject<{ eth?: string; ethernet?: boolean }>(lab(), { collection: 'hosts', ids: [S.piHostId] });
            const seated = host ? (host.eth ? host.eth !== 'UNPLUGGED' : host.ethernet !== false) : true;
            const hostId = findSimId(lab(), { collection: 'hosts', ids: [S.piHostId] }) ?? S.piHostId;
            const out: Verb[] = [verb('E', pick('Unplug / Re-seat', !seated), () => simCall(engine, 'Ethernet', () => sim.host.setEthernet(hostId, !seated, 'player')))];
            out.push(verb('R', 'Replace cable', () => simCall(engine, 'Ethernet', () => sim.host.replaceEthernet(hostId, 'player')), { requiresTool: 'ethernet-cable' }));
            return out;
          },
        });
        break;
      }
      case 'fuse': {
        const s = def.doorSide;
        const fuseId = S.bayFuseId ?? '';
        const tape = `F-${def.hrn}-5V`;
        const where = () => view.frame.point([205 * s, 78, -850]).toArray() as [number, number, number];
        const piLoad = () => S.piLoadId ?? '';
        // Per-bay fuses are not in the sim power graph yet (Sim App. C: "decorative until the sim adds
        // them") — `sim.power.removeFuse('F-WALL-E-5V')` answers "unknown fuse". Pulling one cuts the
        // Pi exactly like unplugging its lead, so a decorative fuse drives the Pi load instead.
        const simFuse = () => findSimObject<{ removed?: boolean; blown: boolean; ratingA: number }>(lab(), { collection: 'power.fuses', ids: [fuseId] });
        const pull = () => {
          const f = simFuse();
          if (f) {
            const r = simCall(engine, 'Fuse', () => sim.power.removeFuse(fuseId, 'player'));
            if (r.ok) mutate((st) => void (st.session.items.removedFuse = { fuseId, rating: f.ratingA, blown: f.blown }));
            return;
          }
          const hk = hookupOf(lab(), piLoad());
          if (hk && hk.kind !== 'none') {
            local.lastPiHookup = hk;
            const r = simCall(engine, 'Fuse', () => sim.power.unplug(piLoad(), 'player'));
            if (!r.ok) return;
          }
          binder.bayFuseOut = true;
          mutate((st) => void (st.session.items.removedFuse = { fuseId, rating: 10, blown: false }));
          try {
            engine.audio.play('unplug', { position: where(), volume: 0.5 });
          } catch {
            /* ignore */
          }
        };
        const insert = (rating: number) => {
          const have = store.getState().session.items.fuses[String(rating)] ?? 0;
          if (have <= 0) return void toastWarn(`No ${rating} A fuse in your pocket`, 'Take one from the fuse tray on the power bench (R cycles the rating).');
          if (simFuse()) {
            const r = simCall(engine, 'Fuse', () => sim.power.insertFuse(fuseId, rating, 'player'));
            if (notImplemented(r)) simCall(engine, 'Fuse', () => sim.power.replaceFuse(fuseId, 'player'));
            if (r.ok) useFuse(rating);
            return;
          }
          // the lead stays plugged in while the fuse is out: restore the Pi's supply through it
          const hk = hookupOf(lab(), piLoad());
          if (!hk || hk.kind === 'none') {
            const r = simCall(engine, 'Fuse', () => sim.power.plug(piLoad(), local.lastPiHookup ?? { kind: 'dc-rail', targetId: S.mainTerminalId ?? '' }, 'player'));
            if (!r.ok) return;
          }
          binder.bayFuseOut = false;
          useFuse(rating);
          try {
            engine.audio.play('plug-in', { position: where(), volume: 0.6 });
          } catch {
            /* ignore */
          }
        };
        const reading = (side: 'in' | 'out') => {
          const f = simFuse();
          if (f) return void probe(engine, where(), `${tape} ${side}`, `${fuseId}.${side === 'in' ? 'line' : 'load'}`);
          // supply side = the MAIN-switched 5 V; load side = the same unless the fuse is out
          if (side === 'out' && binder.bayFuseOut) {
            const ohm = meterMode() === 'OHM';
            return void toastInfo(`Multimeter · ${tape} out`, ohm ? 'OL  (Ω mode)' : '0.00 V DC');
          }
          probe(engine, where(), `${tape} ${side}`, S.mainTerminalId ?? '');
        };
        reg(engine, offs, P(part), bayHit(part, [205 * s, 78, -850], [30, 40, 70]), {
          label: () => `Inline fuse ${tape}`,
          verbs: () => {
            const tool = activeTool();
            const f = simFuse();
            const removed = f ? (f.removed ?? false) : binder.bayFuseOut;
            if (tool === 'multimeter') return [verb('E', 'Measure (load side)', () => reading('out')), verb('G', 'Measure (supply side)', () => reading('in'))];
            if (tool === 'spare-fuse-5v' || tool === 'spare-fuse-12v') {
              const rating = store.getState().session.toolModes.fuseRating;
              return [verb('E', `Insert ${rating} A fuse`, () => insert(rating), { disabled: !local.holderOpen || !removed })];
            }
            return [
              verb('E', local.holderOpen ? 'Close holder' : 'Open holder', () => {
                local.holderOpen = !local.holderOpen;
                try {
                  engine.audio.play('unplug', { position: where(), rate: 1.6, volume: 0.4 });
                } catch {
                  /* ignore */
                }
              }),
              verb('R', 'Pull fuse', pull, { disabled: !local.holderOpen || removed }),
            ];
          },
        });
        break;
      }
      case 'webcam': {
        reg(engine, offs, P(part), bayHit(part, [-150, 410, -120], [80, 40, 40]), {
          verbs: () => {
            const w = rig().webcam;
            return [
              verb('E', 'Adjust aim', () => simCall(engine, 'Webcam', () => sim.rig.aimWebcam(id, -(w?.aimOffsetDeg?.yaw ?? 0), -(w?.aimOffsetDeg?.pitch ?? 0), 'player'))),
              ((a) => verb('R', a.label, a.run))(reseatAction(engine, 'webcam USB', w?.connected !== false, () => sim.rig.reseatWebcam(id, 'player'))),
            ];
          },
        });
        break;
      }
      default:
        break;
    }
  }
}
