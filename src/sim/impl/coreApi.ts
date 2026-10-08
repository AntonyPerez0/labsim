/**
 * sim-core SimApi namespaces (orca, rig, device, power, host, collis, camera, laz, ocr, printer3d, chat,
 * faults): each method runs one `transact()` on the store, delegates to `src/sim/core`, and returns the
 * exact result/error texts of Sim §3/§4. Pure reads read the committed lab.
 */
import { emit as emitEvent, getState, transact } from '@/core/store';
import type { TxContext } from '@/core/store';
import type { TerminalDevice, LabState } from '../types';
import type { Actor, FaultInfo, Result, ScenarioItem, SimApi } from '../api';
import * as C from '../core';
import { DEVICE_TYPES } from '../seed/deviceTypes';
import { clone } from '../core/util';

type CoreNamespaces = Pick<SimApi, 'orca' | 'rig' | 'device' | 'power' | 'host' | 'collis' | 'camera' | 'laz' | 'ocr' | 'printer3d' | 'chat' | 'faults'>;

const OK: Result = { ok: true, value: undefined };
const lab = (): LabState => getState().lab;
const actorKey = (a: Actor): string => String(a);

/** One API transaction on the lab (rngStreams.core mirrors lab.rng afterwards, Sim §6.1). */
export function tx<T>(fn: (lab: LabState, ctx: TxContext) => T): T {
  return transact((root, ctx) => {
    const r = fn(root.lab, ctx);
    const l = root.lab;
    if (l.rngStreams.core.state !== l.rng.state) l.rngStreams.core = { ...l.rng };
    return r;
  });
}

/** Run `fn` against a scratch copy of the committed lab; commit (and replay its events) only on success. */
function atomically<T>(fn: (lab: LabState, ctx: TxContext) => Result<T>): Result<T> {
  // Start from the lab as the enclosing transaction currently has it (a nested `transact` runs on the
  // open draft): reading the committed state here would drop every earlier change of the same
  // transaction — a preset reset at activity start, or a fault cleared just before (`clear` + `injectAll`).
  const scratch = transact((root) => clone(root.lab));
  const events: { type: string; payload: unknown }[] = [];
  const ctx: TxContext = {
    emit(type, payload) {
      events.push({ type, payload });
    },
    get now() {
      return scratch.time.nowMs;
    },
    random() {
      throw new Error('ctx.random is not available inside a scenario');
    },
    get rng() {
      return scratch.rng;
    },
  };
  const r = fn(scratch, ctx);
  if (!r.ok) return r;
  scratch.rngStreams.core = { ...scratch.rng };
  transact((root, c) => {
    root.lab = scratch;
    for (const e of events) c.emit(e.type as never, e.payload as never);
  });
  return r;
}

function device(l: LabState, id: string): TerminalDevice | undefined {
  return l.devices[id];
}

export function createCoreApi(): CoreNamespaces {
  return {
    orca: {
      saveRobot: (robot, actor) => tx((l, ctx) => C.saveRobot(l, ctx, robot, actorKey(actor))),
      setRobotStatus: (robotId, status, actor, reason) => tx((l, ctx) => C.setRobotStatus(l, ctx, robotId, status, actorKey(actor), reason)),
      reserveRobot: (robotId, who) => tx((l, ctx) => C.setRobotStatus(l, ctx, robotId, 'RESERVED', who)),
      resolveNote: (robotId, noteId) => tx((l) => C.resolveNote(l, robotId, noteId)),
      addNote: (robotId, text, actor) => tx((l, ctx) => C.addManualNote(l, ctx, robotId, text, actorKey(actor))),
      saveDevice: (d, actor) => tx((l, ctx) => C.saveDevice(l, ctx, d, actorKey(actor))),
      saveCapability: (c, actor) => tx((l, ctx) => C.saveCapability(l, ctx, c, actorKey(actor))),
      saveMerchant: (m, actor) => tx((l, ctx) => C.saveMerchant(l, ctx, m, actorKey(actor))),
      saveScreen: (s, actor) => tx((l, ctx) => C.saveScreen(l, ctx, s, actorKey(actor))),
      saveScreenLocation: (s, actor) => tx((l, ctx) => C.saveScreenLocation(l, ctx, s, actorKey(actor))),
      saveCardProfile: (c, actor) => tx((l, ctx) => C.saveCardProfile(l, ctx, c, actorKey(actor))),
      saveScreenCompareImage: (c, actor) => tx((l, ctx) => C.saveScreenCompareImage(l, ctx, c, actorKey(actor))),
      deleteEntity: (entity, id, actor) => tx((l, ctx) => C.deleteEntity(l, ctx, entity, id, actorKey(actor))),
      runHealthCheckNow: () => tx((l, ctx) => C.runHealthCheck(l, ctx, { forced: true })),
      forceHealthCheck: (actor) =>
        tx((l, ctx): Result => {
          if (!l.config.forceHealthCheckAllowed) return { ok: false, error: '403 Force health check is disabled in this environment' };
          const down = C.orcaDown(l);
          if (down && !down.startsWith('500')) return { ok: false, error: down };
          C.runHealthCheck(l, ctx, { forced: true });
          C.log(l, 'orca', 'info', `forced health check (${actorKey(actor)})`);
          return OK;
        }),
      checkout: (req) =>
        tx((l, ctx): Result<{ robotId: number }> => {
          if (req.kind === 'manual' && req.robotName) {
            const robot = C.robotByName(l, req.robotName.trim());
            if (robot && !robot.checkout) {
              const toast = C.manualCheckoutToast(robot);
              if (toast) return { ok: false, error: toast };
            }
          }
          const out = C.checkout(l, ctx, { ...req, buildId: req.buildId || `manual-${++l.seq.request}`, jobId: req.jobId || 'orca-ui' });
          if (out.kind === 'ok') return { ok: true, value: { robotId: out.robotId } };
          if (out.kind === 'wait') return { ok: false, error: `waiting: ${out.label}` };
          return { ok: false, error: out.lines[out.lines.length - 1] ?? out.code };
        }),
      release: (robotId, buildId) =>
        tx((l, ctx): Result => {
          const robot = l.orca.robots[robotId];
          if (!robot) return { ok: false, error: '404 Not Found' };
          if (!robot.checkout) return { ok: false, error: `409 Conflict: robot ${robot.name} is not checked out` };
          C.release(l, ctx, robotId, buildId || robot.checkout.buildId);
          return OK;
        }),
      matchPreview: (capsJson, environment) => {
        const parsed = C.parseCapsJson(capsJson);
        if (!parsed.ok) return { ok: false, error: parsed.error };
        return { ok: true, value: C.matchPreview(lab(), parsed.caps, environment ?? 'DEV1') };
      },
      capabilityDocument: (robotId) => {
        const r = lab().orca.robots[robotId];
        return r ? C.capabilityDocument(lab(), r) : null;
      },
      xyTouch: (robotName, screen, button, actor, opts) => tx((l, ctx) => C.xyTouch(l, ctx, robotName, screen, button, actorKey(actor), opts ?? {})),
      card: (robotName, entry, profile, actor) => tx((l, ctx) => C.cardAction(l, ctx, robotName, entry, profile, actorKey(actor))),
      rest: (method, path, body, actor) => tx((l, ctx) => restCall(l, ctx, method, path, body, actorKey(actor))),
    },
    rig: {
      command: (rigId, command, actor, args) => tx((l, ctx) => C.rigCommand(l, ctx, rigId, command, actorKey(actor), args ?? {})),
      pushHead: (rigId, dx, dy, actor) =>
        tx((l, ctx): Result => {
          const r = C.dragCarriage(l, ctx, rigId, dx, dy, actorKey(actor));
          return r.ok ? OK : r;
        }),
      setSwitch: (rigId, which, on) => tx((l, ctx) => C.setSwitch(l, ctx, rigId, which, on)),
      reseatWebcam: (rigId, actor) =>
        tx((l, ctx): Result => {
          const r = C.reseat(l, ctx, rigId, 'webcam');
          void actor;
          return r.ok ? OK : r;
        }),
      dragCarriage: (rigId, dx, dy, actor) => tx((l, ctx) => C.dragCarriage(l, ctx, rigId, dx, dy, actorKey(actor))),
      setDoor: (rigId, open) => tx((l, ctx) => C.setDoor(l, ctx, rigId, open)),
      reseat: (rigId, part) => tx((l, ctx) => C.reseat(l, ctx, rigId, part)),
      replaceCradle: (rigId) => tx((l, ctx) => C.replaceCradle(l, ctx, rigId)),
      alignDipArm: (rigId, delta) => tx((l, ctx) => C.alignDipArm(l, ctx, rigId, delta)),
      moveMotorUsb: (rigId, target) => tx((l, ctx) => C.moveMotorUsb(l, ctx, rigId, target)),
      aimWebcam: (rigId, dYaw, dPitch) => tx((l, ctx) => C.aimWebcam(l, ctx, rigId, dYaw, dPitch)),
      setTabletTab: (rigId, tab) =>
        tx((l): Result => {
          const rig = l.rigs[rigId];
          if (!rig) return { ok: false, error: `unknown rig '${rigId}'` };
          if (rig.tablet.tab !== tab) rig.tablet.tab = tab;
          return OK;
        }),
    },
    device: {
      touch: (deviceId, display, x, y, source) =>
        tx((l, ctx): Result<{ hitButton: string | null }> => {
          const r = C.deviceTouch(l, ctx, deviceId, display, x, y, source);
          return r.ok ? { ok: true, value: { hitButton: r.value.result === 'HIT' ? r.value.hitButton : null } } : r;
        }),
      pressPower: (deviceId, longPress) => tx((l, ctx) => C.devicePressPower(l, ctx, deviceId, longPress)),
      presentCard: (deviceId, entry, profile) => tx((l, ctx) => C.presentCardByHand(l, ctx, deviceId, entry, profile)),
      swapHardware: (rigId, newType, _actor, opts) => tx((l, ctx) => C.swapHardware(l, ctx, rigId, newType, opts ?? {})),
      setDeviceField: (deviceId, key, value) =>
        tx((l): Result => {
          const d = device(l, deviceId);
          if (!d) return { ok: false, error: `unknown device '${deviceId}'` };
          (d as unknown as Record<string, unknown>)[key as string] = clone(value);
          return OK;
        }),
      signStroke: (deviceId, display, points, source) => tx((l, ctx) => C.deviceStroke(l, ctx, deviceId, display, points, source)),
      pressKey: (deviceId, key, source) =>
        tx((l, ctx): Result => {
          const d = device(l, deviceId);
          if (!d) return { ok: false, error: `unknown device '${deviceId}'` };
          C.pressKey(l, ctx, d, key, source);
          return OK;
        }),
      enterText: (deviceId, text, source) =>
        tx((l, ctx): Result => {
          const d = device(l, deviceId);
          if (!d) return { ok: false, error: `unknown device '${deviceId}'` };
          C.enterText(l, ctx, d, text, source);
          return OK;
        }),
      loadPaper: (deviceId) =>
        tx((l): Result => {
          const d = device(l, deviceId);
          if (!d) return { ok: false, error: `unknown device '${deviceId}'` };
          if (!DEVICE_TYPES[d.type].hasPrinter || !d.printer.present) return { ok: false, error: `${DEVICE_TYPES[d.type].displayName} has no printer` };
          if (!d.printer.paper) d.printer.paper = true;
          return OK;
        }),
      reseatHub: (deviceId, port) =>
        tx((l, ctx): Result<{ seated: boolean }> => {
          const d = device(l, deviceId);
          if (!d) return { ok: false, error: `unknown device '${deviceId}'` };
          if (port === 'usb') {
            d.hubUsbToPeer = !d.hubUsbToPeer;
            return { ok: true, value: { seated: d.hubUsbToPeer } };
          }
          if (port === 'ethernet') {
            d.hubEthernet = !d.hubEthernet;
            return { ok: true, value: { seated: d.hubEthernet } };
          }
          const load = Object.values(l.power.loads).find((x) => x.deviceId === d.id);
          if (!load) return { ok: false, error: `${d.id} power lead is not modelled` };
          if (load.supply.kind !== 'none') {
            const r = C.unplug(l, ctx, load.id);
            return r.ok ? { ok: true, value: { seated: false } } : r;
          }
          return { ok: false, error: 'Plug the power brick into an AC strip socket' };
        }),
      layout: (deviceId, display) => {
        const d = lab().devices[deviceId];
        return d ? C.layoutButtons(lab(), d, display) : [];
      },
    },
    power: {
      plug: (loadId, hookup, actor) => tx((l, ctx) => C.plug(l, ctx, loadId, hookup, actorKey(actor))),
      unplug: (loadId) => tx((l, ctx) => C.unplug(l, ctx, loadId)),
      replaceFuse: (fuseId) => tx((l, ctx) => C.replaceFuse(l, ctx, fuseId)),
      toggleStrip: (stripId, on) => tx((l, ctx) => C.toggleStrip(l, ctx, stripId, on)),
      togglePsu: (psuId, on) => tx((l, ctx) => C.togglePsu(l, ctx, psuId, on)),
      measure: (pointId, mode = 'V') => {
        // A pure read of the circuit; the reading is announced as `power.measured` (Sim §5.5 — the HUD
        // meter LCD and GW21 "Ω on a live circuit" listen for it).
        const r = C.measure(lab(), pointId, mode);
        emitEvent('power.measured', { pointId, mode, display: r.display, live: r.live });
        return r;
      },
      removeFuse: (fuseId) => tx((l, ctx) => C.removeFuse(l, ctx, fuseId)),
      insertFuse: (fuseId, ratingA) => tx((l, ctx) => C.insertFuse(l, ctx, fuseId, ratingA)),
      toggleRegulator: (regId, on) => tx((l, ctx) => C.toggleRegulator(l, ctx, regId, on)),
      resetBreaker: (stripId) => tx((l, ctx) => C.resetBreaker(l, ctx, stripId)),
      moveToOutlet: (itemId, outletId, actor) => tx((l, ctx) => C.moveToOutlet(l, ctx, itemId, outletId, actorKey(actor))),
    },
    host: {
      powerCycle: (hostId) => tx((l, ctx) => C.hostPowerCycle(l, ctx, hostId)),
      setEthernet: (hostId, connected) => tx((l, ctx) => C.hostSetEthernet(l, ctx, hostId, connected ? 'LINKED' : 'UNPLUGGED')),
      restartService: (hostId, service, actor) => tx((l, ctx) => C.hostService(l, ctx, hostId, service, 'restart', actorKey(actor))),
      stopService: (hostId, service, actor) => tx((l, ctx) => C.hostService(l, ctx, hostId, service, 'stop', actorKey(actor))),
      cleanDisk: (hostId) => tx((l, ctx) => C.hostCleanDisk(l, ctx, hostId)),
      pressPowerButton: (hostId, hold) => tx((l, ctx) => C.hostPowerButton(l, ctx, hostId, hold)),
      writeFile: (hostId, path, contents, actor) => tx((l, ctx) => C.hostWriteFile(l, ctx, hostId, path, contents, actorKey(actor))),
      deletePath: (hostId, path, actor) => tx((l, ctx) => C.hostDeletePath(l, ctx, hostId, path, actorKey(actor))),
      startService: (hostId, service, actor) => tx((l, ctx) => C.hostService(l, ctx, hostId, service, 'start', actorKey(actor))),
      replaceEthernet: (hostId) =>
        tx((l, ctx): Result => {
          const h = l.hosts[hostId];
          if (!h) return { ok: false, error: `unknown host '${hostId}'` };
          if (h.kind === 'vm' || h.kind === 'switch') return { ok: false, error: `${h.hostname} has no Ethernet jack in the lab` };
          return C.hostSetEthernet(l, ctx, hostId, 'LINKED');
        }),
      plugUsb: (hostId, usbId, attached) => tx((l, ctx) => C.hostPlugUsb(l, ctx, hostId, usbId, attached)),
      runSchedTask: (hostId, task) => tx((l, ctx) => C.hostRunSchedTask(l, ctx, hostId, task)),
    },
    collis: {
      reseatRibbon: (collisId) => tx((l, ctx) => C.reseatRibbon(l, ctx, collisId)),
    },
    camera: {
      probe: (url) => C.cameraProbe(lab(), url),
      snapshot: (url, fileName) => tx((l, ctx) => C.cameraSnapshot(l, ctx, url, fileName)),
    },
    laz: {
      start: (deviceId, toMerchantId, actor) => tx((l, ctx) => C.startLaz(l, ctx, deviceId, toMerchantId, { buildId: null, actor: actorKey(actor) })),
    },
    ocr: {
      tesseract: (imageRef, bbox) => {
        const f = C.frameOf(lab(), imageRef);
        return f ? C.tesseract(f.labels, bbox) : { text: '', confidence: 0 };
      },
      compare: (id) =>
        tx((l, ctx): Result<{ text: string; expected: string; match: boolean }> => {
          const r = C.screenCompare(l, ctx, id, 'player', 'orca');
          return r.ok ? { ok: true, value: { text: r.value.text, expected: r.value.expected, match: r.value.match } } : r;
        }),
      frame: (imageRef) => {
        const f = C.frameOf(lab(), imageRef);
        return f ? { ok: true, value: f } : { ok: false, error: `no image '${imageRef}'` };
      },
    },
    printer3d: {
      start: (printer, file) => tx((l, ctx) => C.printerStart(l, ctx, printer, file)),
    },
    chat: {
      post: (channel, author, text, ticketId) => tx((l, ctx) => C.postChat(l, ctx, channel, author, text, ticketId)),
      markRead: (channel) =>
        tx((l) => {
          if ((l.chat.unread[channel] ?? 0) !== 0) l.chat.unread[channel] = 0;
        }),
      schedule: (channel, author, text, delayMs, ticketId) =>
        tx((l) => {
          const delay = delayMs === '@npc' ? 10_000 + Math.floor(10_001 * C.rand(l, 'npc')) : delayMs;
          return C.addTimer(l, 'chat.deliver', 'phys', delay, { channel, author, text, ticketId: ticketId ?? null });
        }),
    },
    faults: {
      catalogue: (): FaultInfo[] => C.faultCatalogue(),
      inject: (spec) => tx((l, ctx) => C.injectFault(l, ctx, spec)),
      clear: (instanceId, by) => tx((l, ctx) => C.clearFault(l, ctx, instanceId, actorKey(by))),
      isResolved: (instanceId) => C.faultResolved(lab(), instanceId),
      injectAll: (items: ScenarioItem[]) => (items.length === 0 ? { ok: true, value: { instanceIds: [] } } : atomically((l, ctx) => C.applyScenario(l, ctx, items))),
      applySetup: (op) => tx((l, ctx) => C.applySetupOp(l, ctx, op)),
      setupCatalogue: () => C.setupCatalogue(),
    },
  };
}

/* ────────────────────────────── orca.rest: Orca + other lab URLs ────────────────────────────── */

/**
 * `sim.orca.rest(method, path, body, actor)`: a path (`/api/…`) goes to Orca
 * (`http://orca.lab.local:8080`); a full URL goes to that host (Pis, Callus, Ollama tags, Jenkins JSON)
 * from the workstation, through the same reachability rules as curl (Sim §1.9, §3.23).
 */
function restCall(l: LabState, ctx: TxContext, method: string, path: string, body: string | null, actor: string) {
  const url = /^https?:\/\//.test(path) ? path : `http://orca.lab.local:8080${path.startsWith('/') ? path : `/${path}`}`;
  return C.http(l, ctx, { method, url, body, fromHostId: 'ws-17', actor });
}
