/** Fault catalogue §4.3.3 — touch-robot rigs (core). */
import type { LabState, RigState } from '../../types';
import type { CoreFaultDef, Params, Record_ } from './helpers';
import { info, nothing, num, ok, p, str, TOUCH_RIGS, undoPatches, w } from './helpers';
import { parseControllerYaml } from '../hosts';

const YAML = '/etc/robot-controller/controller.yaml';
const invalid = (id: string, name: string, v: string, reason: string) => ({ ok: false as const, error: `fault ${id}: invalid param ${name}='${v}' (${reason})` });
const rigP = (desc = 'Touch / standalone rig (gantry)') => p('rig', 'rig', desc, { required: true, target: true, example: 'wall-e' });

function gantryRig(id: string, lab: LabState, params: Params): { rig: RigState } | { ok: false; error: string } {
  const rig = lab.rigs[str(params.rig)];
  if (!rig) return invalid(id, 'rig', str(params.rig), 'no such rig');
  if (!rig.hasGantry) return invalid(id, 'rig', rig.id, 'not a touch rig');
  return { rig };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Shared shape: validate a gantry rig + a healthy precondition, then write leaves. */
function rigFault(
  id: string,
  title: string,
  extra: { params?: ReturnType<typeof p>[]; tags: string[]; usedBy: string[]; symptoms: string[]; clears: string; pool?: string[]; apiOnly?: boolean },
  healthy: (rig: RigState, lab: LabState, params: Params) => string | null,
  apply: (lab: LabState, rig: RigState, params: Params, record: Record_) => void,
  resolved: (lab: LabState, rig: RigState) => boolean,
): CoreFaultDef {
  return {
    info: info(id, title, 'rigs', [rigP(), ...(extra.params ?? [])], { tags: extra.tags, usedBy: extra.usedBy, symptoms: extra.symptoms, clears: extra.clears, apiOnly: extra.apiOnly }),
    ...(extra.pool ? { randomPools: { rig: extra.pool } } : {}),
    validate(lab, params) {
      const g = gantryRig(id, lab, params);
      if (!('rig' in g)) return g;
      const why = healthy(g.rig, lab, params);
      if (why && why.startsWith('invalid:')) return { ok: false, error: `fault ${id}: ${why.slice(8)}` };
      if (why) return nothing(id, why);
      return ok(g.rig.id);
    },
    apply(lab, _ctx, params, record) {
      apply(lab, lab.rigs[str(params.rig)]!, params, record);
    },
    isResolved(lab, f) {
      const rig = lab.rigs[f.target];
      return !!rig && resolved(lab, rig);
    },
  };
}

export const RIG_FAULTS: CoreFaultDef[] = [
  {
    info: info('rig.lockReleased', 'Carriage pushed by hand', 'rigs', [rigP(), p('dxMm', 'number', 'Push distance X (mm)', { default: 25.0 }), p('dyMm', 'number', 'Push distance Y (mm)', { default: 8.0 })], {
      tags: ['hw.motion', 'hw.tablet'],
      clears: 'magneticLock.engaged && homed && motionFault == null (only Park All)',
      symptoms: ['banner yellow Status: LOCK RELEASED — PARK REQUIRED', 'every PHYSICAL_TAP 409 Conflict: LOCK_RELEASED (park required)', 'camera shows the carriage off to one side'],
      usedBy: ['INC11', 'M18', 'P1-1', 'DR16'],
    }),
    randomPools: { rig: TOUCH_RIGS },
    validate(lab, params) {
      const g = gantryRig('rig.lockReleased', lab, params);
      if (!('rig' in g)) return g;
      if (Number.isNaN(num(params.dxMm, 25))) return invalid('rig.lockReleased', 'dxMm', str(params.dxMm), 'not a number');
      if (Number.isNaN(num(params.dyMm, 8))) return invalid('rig.lockReleased', 'dyMm', str(params.dyMm), 'not a number');
      if (!g.rig.magneticLock.engaged) return nothing('rig.lockReleased', `${g.rig.id} lock is already released`);
      return ok(g.rig.id);
    },
    apply(lab, ctx, params, record) {
      const rig = lab.rigs[str(params.rig)]!;
      const g = rig.gantry;
      const x = r1(Math.min(g.maxXMm, Math.max(g.minXMm, g.xMm + num(params.dxMm, 25))));
      const y = r1(Math.min(g.maxYMm, Math.max(g.minYMm, g.yMm + num(params.dyMm, 8))));
      const base = ['rigs', rig.id, 'gantry'];
      w(lab, record, [...base, 'xMm'], x);
      w(lab, record, [...base, 'yMm'], y);
      w(lab, record, [...base, 'targetXMm'], x);
      w(lab, record, [...base, 'targetYMm'], y);
      w(lab, record, [...base, 'limitXHit'], false);
      w(lab, record, [...base, 'limitYHit'], false);
      w(lab, record, [...base, 'homed'], false);
      w(lab, record, ['rigs', rig.id, 'magneticLock'], { engaged: false, brokenAtMs: lab.time.nowMs });
      w(lab, record, ['rigs', rig.id, 'pushAccumMm'], 0);
      ctx.emit('rig.lockBroken', { rigId: rig.id, by: 'faults' });
    },
    isResolved(lab, f) {
      const rig = lab.rigs[f.target];
      return !!rig && rig.magneticLock.engaged && rig.gantry.homed && rig.motionFault == null;
    },
  },
  rigFault(
    'rig.steppersDisabled',
    'Steppers disabled',
    { tags: ['hw.motion', 'hw.tablet', 'hw.rigbom'], usedBy: ['INC13-A'], symptoms: ['503 Service Unavailable: STEPPERS_DISABLED', 'banner green while disabled', 'tablet Steppers group shows Disable active', 'motion buttons toast Steppers disabled'], clears: 'steppersEnabled && homed && magneticLock.engaged' },
    (rig) => (rig.steppersEnabled ? null : `${rig.id} steppers are already disabled`),
    (lab, rig, _p, rec) => {
      w(lab, rec, ['rigs', rig.id, 'steppersEnabled'], false);
      w(lab, rec, ['rigs', rig.id, 'gantry', 'homed'], false);
      w(lab, rec, ['rigs', rig.id, 'magneticLock', 'engaged'], false);
    },
    (_lab, rig) => rig.steppersEnabled && rig.gantry.homed && rig.magneticLock.engaged,
  ),
  rigFault(
    'rig.motorOff',
    'MOTOR switch off',
    { tags: ['hw.motion', 'hw.tablet', 'hw.rigbom'], usedBy: ['INC13-B'], symptoms: ['503 Service Unavailable: MOTOR_POWER_LOST', 'MOTOR LED off, MAIN on', 'banner green until MOTOR returns, then yellow'], clears: 'motorSwitch && homed && magneticLock.engaged' },
    (rig, lab) => (!lab.power.terminals[`MOTOR-${rig.id}`] ? `invalid:invalid param rig='${rig.id}' (no MOTOR switch on this rig)` : rig.motorSwitch ? null : `${rig.id} MOTOR is already off`),
    (lab, rig, _p, rec) => w(lab, rec, ['rigs', rig.id, 'motorSwitch'], false),
    (_lab, rig) => rig.motorSwitch && rig.gantry.homed && rig.magneticLock.engaged,
  ),
  rigFault(
    'rig.mainOff',
    'MAIN switch off',
    { tags: ['hw.pi', 'hw.tablet'], usedBy: ['FP'], symptoms: ['Pi OFF (dark), webcam dark, tablet grey on battery', 'timeouts at the next check'], clears: "mainSwitch && hosts[piHostId].os == 'RUNNING'" },
    (rig, lab) => (!lab.power.terminals[`MAIN-${rig.id}`] ? `invalid:invalid param rig='${rig.id}' (no MAIN switch on this rig)` : rig.mainSwitch ? null : `${rig.id} MAIN is already off`),
    (lab, rig, _p, rec) => w(lab, rec, ['rigs', rig.id, 'mainSwitch'], false),
    (lab, rig) => rig.mainSwitch && !!rig.piHostId && lab.hosts[rig.piHostId]?.os === 'RUNNING',
  ),
  rigFault(
    'rig.solenoidLoose',
    'Solenoid connector loose',
    { tags: ['hw.rigbom', 'hw.tablet', 'orca.xytouch', 'arch.flow'], usedBy: ['INC15'], symptoms: ['gantry moves, plunger never drops', 'Orca still answers 200 PHYSICAL_TAP', '[runner] waitForScreen timed out: PaymentScreen', 'connector visibly hanging'], clears: "solenoidConnector == 'SEATED'" },
    (rig) => (rig.solenoidConnector === 'SEATED' ? null : `${rig.id} solenoid connector is already loose`),
    (lab, rig, _p, rec) => w(lab, rec, ['rigs', rig.id, 'solenoidConnector'], 'LOOSE'),
    (_lab, rig) => rig.solenoidConnector === 'SEATED',
  ),
  rigFault(
    'rig.dipArmMisaligned',
    'Dip arm one tooth off',
    { params: [p('teeth', 'number', 'Tooth offset −3…3, ≠ 0', { default: 1 })], tags: ['hw.collis', 'hw.rigbom', 'hw.tablet', 'cards.diptap'], usedBy: ['INC16'], symptoms: ['Callus loads fine, then [device] CHIP_READ_ERROR', 'toast Card read error, try again', 'the card strikes the bezel', 'arm index mark one tooth off the "63" mark'], clears: 'dipArmToothOffset == 0' },
    (rig, _lab, params) => {
      const t = num(params.teeth, 1);
      if (!Number.isInteger(t) || t === 0 || Math.abs(t) > 3) return `invalid:invalid param teeth='${str(params.teeth)}' (not one of -3, -2, -1, 1, 2, 3)`;
      return rig.dipArmToothOffset === 0 ? null : `${rig.id} dip arm is already ${rig.dipArmToothOffset} teeth off`;
    },
    (lab, rig, params, rec) => {
      w(lab, rec, ['rigs', rig.id, 'dipArmToothOffset'], num(params.teeth, 1));
      w(lab, rec, ['rigs', rig.id, 'dipArmAligned'], false);
    },
    (_lab, rig) => rig.dipArmToothOffset === 0,
  ),
  rigFault(
    'rig.cradleCracked',
    'Cracked 3D-printed cradle',
    { params: [p('tiltDeg', 'number', 'Device tilt in the cracked cradle (°)', { default: 2.0 })], tags: ['hw.print3d', 'hw.rigbom', 'hw.motion'], usedBy: ['INC59'], symptoms: ['probe contact dy = x · tan(tilt): left targets hit, right-side targets land progressively low', 'EVE Review Order at x 56 misses'], clears: "cradle != 'CRACKED' (rig.replaceCradle)" },
    (rig) => (rig.cradle === 'CRACKED' ? `${rig.id} cradle is already cracked` : null),
    (lab, rig, params, rec) => {
      w(lab, rec, ['rigs', rig.id, 'cradle'], 'CRACKED');
      w(lab, rec, ['rigs', rig.id, 'cradleTiltDeg'], num(params.tiltDeg, 2.0));
    },
    (_lab, rig) => rig.cradle !== 'CRACKED',
  ),
  rigFault(
    'rig.limitSwitchBroken',
    'Limit switch lead unseated',
    { params: [p('axis', 'string', 'Axis whose limit switch lead is unseated', { default: 'x', values: ['x', 'y'] })], tags: ['hw.motion', 'hw.rigbom'], usedBy: ['FP'], symptoms: ['Park All / Park XY drive that axis to −10 mm, stall 4 s', 'banner red Status: MOTION FAULT — HOMING FAILED (X limit not found)'], clears: "limitSwitchOk[axis] (rig.reseat(rig, 'limitSwitchX'/'limitSwitchY'))" },
    (rig, _lab, params) => {
      const ax = str(params.axis) || 'x';
      if (ax !== 'x' && ax !== 'y') return `invalid:invalid param axis='${ax}' (not one of x, y)`;
      return rig.limitSwitchOk[ax] ? null : `${rig.id} ${ax.toUpperCase()} limit switch is already unseated`;
    },
    (lab, rig, params, rec) => w(lab, rec, ['rigs', rig.id, 'limitSwitchOk', str(params.axis) || 'x'], false),
    (lab, rig) => {
      const f = lab.faults.find((x) => !x.cleared && x.faultId === 'rig.limitSwitchBroken' && x.target === rig.id);
      const ax = (f ? str(f.params.axis) : 'x') || 'x';
      return rig.limitSwitchOk[ax as 'x' | 'y'];
    },
  ),
  {
    info: info('rig.webcamMisaimed', 'Webcam knocked off aim', 'rigs', [rigP('Rig with its own webcam'), p('yawDeg', 'number', 'Yaw error (°)', { default: 6.0 }), p('pitchDeg', 'number', 'Pitch error (°)', { default: 4.0 })], {
      tags: ['vision.camera', 'orca.screencompare'],
      clears: 'aimedOk (both offsets within ±1.5°, rig.aimWebcam)',
      symptoms: ['labels shift +6.67 px/° yaw and +6.25 px/° pitch (6°/4° = +40/+25 px)', 'Screen Compare crops clip'],
      usedBy: ['FP'],
    }),
    validate(lab, params) {
      const rig = lab.rigs[str(params.rig)];
      if (!rig) return invalid('rig.webcamMisaimed', 'rig', str(params.rig), 'no such rig');
      if (rig.webcam.cameraId !== `cam-${rig.id}`) return invalid('rig.webcamMisaimed', 'rig', rig.id, 'no own webcam');
      if (!rig.webcam.aimedOk) return nothing('rig.webcamMisaimed', `${rig.id} webcam is already off aim`);
      return ok(rig.id);
    },
    apply(lab, ctx, params, record) {
      const id = str(params.rig);
      const yaw = num(params.yawDeg, 6);
      const pitch = num(params.pitchDeg, 4);
      w(lab, record, ['rigs', id, 'webcam', 'aimOffsetDeg'], { yaw, pitch });
      w(lab, record, ['rigs', id, 'webcam', 'aimedOk'], Math.abs(yaw) <= 1.5 && Math.abs(pitch) <= 1.5);
      ctx.emit('rig.webcamAimed', { rigId: id, aimedOk: false });
    },
    isResolved: (lab, f) => !!lab.rigs[f.target]?.webcam.aimedOk,
  },
  {
    info: info('rig.motionOnNuc', 'Motion control moved to a Windows box', 'rigs', [p('rig', 'rig', 'Touch rig (bumblebee)', { required: true, target: true, default: 'bumblebee' }), p('host', 'host', 'Windows box that takes the motor PCB', { default: 'nuc-03' })], {
      tags: ['hw.nuc', 'hw.pi', 'orca.status.connfailed', 'orca.status.offline'],
      clears: "motionHost == 'PI' && controller.yaml says motion: local && robot-controller (re)started after that file's last write",
      symptoms: ['with NUC-03 full: /health → 502 Bad Gateway {"error":"motion upstream 10.42.20.3:9100 error: No space left on device"}', 'xy_touch 502 Bad Gateway: motion upstream …', 'a USB cable labelled BUMBLEBEE MOTION runs from the NUC to the motor PCB'],
      usedBy: ['INC19'],
    }),
    validate(lab, params) {
      const rig = lab.rigs[str(params.rig)];
      if (!rig || !rig.hasGantry || !rig.piHostId) return invalid('rig.motionOnNuc', 'rig', str(params.rig), 'no such rig');
      const h = lab.hosts[str(params.host)];
      if (!h || (h.kind !== 'nuc' && h.kind !== 'minix')) return invalid('rig.motionOnNuc', 'host', str(params.host), 'no such host');
      if (rig.motionHost !== 'PI') return nothing('rig.motionOnNuc', `${rig.id} motion already runs on ${rig.motionHost}`);
      const pi = lab.hosts[rig.piHostId];
      if (!pi?.files[YAML]?.match(/^motion: local/m)) return nothing('rig.motionOnNuc', `${rig.piHostId} controller.yaml has no motion: local line`);
      return ok(rig.id);
    },
    apply(lab, ctx, params, record) {
      const rig = lab.rigs[str(params.rig)]!;
      const h = lab.hosts[str(params.host)]!;
      const pi = lab.hosts[rig.piHostId!]!;
      const usb = `motor-pcb:${rig.id}`;
      w(lab, record, ['rigs', rig.id, 'motionHost'], h.id);
      w(lab, record, ['hosts', pi.id, 'usb'], pi.usb.filter((u) => u !== usb));
      if (!h.usb.includes(usb)) w(lab, record, ['hosts', h.id, 'usb'], [...h.usb, usb]);
      const yaml = pi.files[YAML]!.replace(/^motion: local.*$/m, `motion: nuc://${h.ip}:9100`);
      w(lab, record, ['hosts', pi.id, 'files', YAML], yaml);
      const parsed = parseControllerYaml(yaml);
      if (pi.services['robot-controller']?.running && parsed.ok) w(lab, record, ['hosts', pi.id, 'services', 'robot-controller', 'loadedConfig'], parsed.config);
      if (h.services.motion) {
        w(lab, record, ['hosts', h.id, 'services', 'motion', 'enabled'], true);
        w(lab, record, ['hosts', h.id, 'services', 'motion', 'running'], true);
        w(lab, record, ['hosts', h.id, 'services', 'motion', 'failure'], null);
        w(lab, record, ['hosts', h.id, 'services', 'motion', 'startedPhysMs'], lab.time.physMs);
      } else {
        w(lab, record, ['hosts', h.id, 'services', 'motion'], { name: 'motion', running: true, port: 9100, failure: null, enabled: true, startedPhysMs: lab.time.physMs, startDelayMs: 0, loadedConfig: null });
      }
      ctx.emit('rig.motorUsbMoved', { rigId: rig.id, host: h.id });
    },
    isResolved(lab, f) {
      const rig = lab.rigs[f.target];
      if (!rig || rig.motionHost !== 'PI' || !rig.piHostId) return false;
      const pi = lab.hosts[rig.piHostId];
      const s = pi?.services['robot-controller'];
      if (!pi || !s?.running) return false;
      const parsed = parseControllerYaml(pi.files[YAML] ?? '');
      if (!parsed.ok || (parsed.config.motion ?? 'local') !== 'local') return false;
      return (s.loadedConfig?.motion ?? 'local') === 'local';
    },
  },
  {
    info: info('rig.rebuild', 'Rig under rebuild (Jared)', 'rigs', [p('rig', 'rig', 'Touch rig being rebuilt', { required: true, target: true, default: 'baymax' })], {
      tags: ['orca.status.offline', 'hw.rigbom'],
      clears: 'API only (Jared finishes the rebuild; revert restores assembly, door, lead, ADB)',
      symptoms: ['if the rig is not Offline: next check connect timed out → Connection Failed', "adb: failed to connect to '10.42.30.16:5444': Connection refused", 'after the Pi boots taps get 409 Conflict: MOTION_FAULT (GANTRY INCOMPLETE (rebuild in progress))'],
      usedBy: ['INC07', 'INC05-B'],
      apiOnly: true,
    }),
    validate(lab, params) {
      const rig = lab.rigs[str(params.rig)];
      if (!rig || !rig.hasGantry) return invalid('rig.rebuild', 'rig', str(params.rig), 'no such rig');
      if (rig.assembly === 'rebuild') return nothing('rig.rebuild', `${rig.id} is already under rebuild`);
      return ok(rig.id);
    },
    apply(lab, _ctx, params, record) {
      const rig = lab.rigs[str(params.rig)]!;
      w(lab, record, ['rigs', rig.id, 'assembly'], 'rebuild');
      w(lab, record, ['rigs', rig.id, 'door'], 'open');
      const pi = rig.piHostId ? lab.hosts[rig.piHostId] : undefined;
      if (pi) {
        const load = lab.power.loads[pi.id];
        if (load && load.hostId === pi.id && load.supply.kind !== 'none') {
          const tid = load.supply.kind === 'dc-rail' ? load.supply.targetId : null;
          if (tid && lab.power.terminals[tid]?.plugged === load.id) w(lab, record, ['power', 'terminals', tid, 'plugged'], null);
          w(lab, record, ['power', 'loads', load.id, 'supply'], { kind: 'none', targetId: null });
        }
        w(lab, record, ['hosts', pi.id, 'supply'], { kind: 'none', targetId: null });
      }
      for (const did of rig.deviceIds) if (lab.devices[did]?.adbTcpPort != null) w(lab, record, ['devices', did, 'adbTcpPort'], null);
    },
    isResolved: () => false,
    revert(lab, _ctx, f) {
      // Jared finishes: restore the recorded leaves (door, lead, ADB) and complete the gantry.
      undoPatches(lab, f);
      const rig = lab.rigs[f.target];
      if (rig) {
        rig.assembly = 'complete';
        rig.door = 'closed';
        for (const did of rig.deviceIds) {
          const d = lab.devices[did];
          if (d && d.adbTcpPort == null) d.adbTcpPort = 5444;
        }
        const piId = rig.piHostId;
        const load = piId ? lab.power.loads[piId] : undefined;
        const term = lab.power.terminals[`MAIN-${rig.id}`];
        if (load && term && load.supply.kind === 'none' && !term.plugged) {
          load.supply = { kind: 'dc-rail', targetId: term.id };
          term.plugged = load.id;
          if (lab.hosts[piId!]) lab.hosts[piId!]!.supply = { kind: 'dc-rail', targetId: term.id };
        }
      }
    },
  },
];
