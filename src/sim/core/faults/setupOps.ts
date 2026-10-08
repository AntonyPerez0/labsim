/**
 * Core setup operations (Sim §4.4.1 "core" rows): world states that are not faults (a reservation, a
 * staged screen, a swapped device, a known ADB device …). Each goes through the same code path as the
 * corresponding API call, so it writes the same Notes / audit rows / events.
 */
import type { TerminalDevice, DeviceTypeCode, LabFlags, LabState, PowerHookup, PowerLoad, RobotStatus, SimConfig } from '../../types';
import { DEVICE_TYPE_CODES } from '../../types';
import type { FaultParamInfo, Result, SetupOpInfo } from '../../api';
import type { SetupOpDef } from '../../devops';
import type { Ctx } from '../util';
import { addTimer, postChat } from '../util';
import { p } from './helpers';
import { applyFlag } from '../flags';
import { robotByName, setRobotStatus, STATUSES } from '../orca/status';
import { deleteEntity, saveDevice, saveRobot } from '../orca/entities';
import type { EntityName } from '../orca/entities';
import { syncAllFromGort } from '../orca/sync';
import { customerSide, dispOf, pressKey, press, provisionDevice, setScreen, stageApproved, swapHardware, autoAdvanceNow } from '../devices';
import { plug } from '../power';
import { reach } from '../network';

type P = Record<string, unknown>;
const OK: Result = { ok: true, value: undefined };
const err = (e: string): Result => ({ ok: false, error: e });
const s = (v: unknown, d = ''): string => (v === undefined || v === null ? d : String(v));
const sop = (op: string, description: string, params: FaultParamInfo[], presetOnly = false): SetupOpInfo => ({ op, description, params, owner: 'core', presetOnly });
const R = (name: string, kind: FaultParamInfo['kind'], description: string, example: string): FaultParamInfo => p(name, kind, description, { required: true, example });
const bad = (op: string, name: string, v: unknown, reason: string): Result => err(`setup ${op}: invalid param ${name}='${s(v)}' (${reason})`);
function need(op: string, params: P, ...keys: string[]): Result | null {
  for (const k of keys) if (params[k] === undefined || params[k] === null || params[k] === '') return bad(op, k, '', 'missing');
  return null;
}
const bool = (v: unknown): boolean => v === true || v === 'true';

/* ────────────────────────────── device.stage ────────────────────────────── */

export const STAGES = ['home', 'register-order', 'review-order', 'payment-prompt', 'approved', 'receipt-options', 'receipt-done', 'thank-you'] as const;

/** Mark every display of a device rendered now (Sim §4.4.1: render timers completed instantly [sim]). */
function settle(lab: LabState, ...devices: TerminalDevice[]): void {
  for (const d of devices) for (const ds of [d.display, d.secondaryDisplay]) if (ds) ds.renderDoneMs = lab.time.physMs;
}

/** Drive `deviceId` through §3.9 with the normal inputs to `stage` (Sim §4.4.1 device.stage). */
export function stageDevice(lab: LabState, ctx: Ctx, deviceId: string, stage: string, items: string[]): Result {
  const given = lab.devices[deviceId];
  if (!given) return err(`unknown device '${deviceId}'`);
  const owner = given.role === 'cfd' && given.tetheredTo ? lab.devices[given.tetheredTo]! : given;
  if (owner.power !== 'on') return err(`${owner.id} is not on`);
  const side = customerSide(lab, owner);
  const all = side.dev.id === owner.id ? [owner] : [owner, side.dev];
  // Start from a clean Home: unlock, Home key (clears any order).
  if (owner.display.screen === 'lock' || owner.locked) setScreen(lab, ctx, owner, 'primary', 'home', { instant: true });
  pressKey(lab, ctx, owner, 'HOME', 'player');
  if (side.dev.id !== owner.id && side.dev.power === 'on' && side.dev.role === 'cfd') setScreen(lab, ctx, side.dev, 'primary', owner.payDisplayLink === 'DOWN' ? 'waiting-for-merchant' : 'customer-idle', { instant: true });
  settle(lab, ...all);
  if (stage === 'home') return OK;
  press(lab, ctx, owner, 'primary', 'Register');
  for (const it of items) press(lab, ctx, owner, 'primary', it);
  settle(lab, ...all);
  if (stage === 'register-order') return OK;
  press(lab, ctx, owner, 'primary', 'Review Order');
  settle(lab, ...all);
  if (owner.display.screen !== 'review-order') return err(`${owner.id}: Review Order needs at least one item`);
  if (stage === 'review-order') return OK;
  if (stage === 'payment-prompt') {
    press(lab, ctx, owner, 'primary', 'Pay');
    press(lab, ctx, owner, 'primary', 'Charge');
    const cs = dispOf(side.dev, side.disp);
    if (cs?.screen === 'cash-discount-tender') press(lab, ctx, side.dev, side.disp, 'Card');
    settle(lab, ...all);
    return dispOf(side.dev, side.disp)?.screen === 'payment-prompt' ? OK : err(`${owner.id}: payment prompt not reached (pay-display link ${owner.payDisplayLink ?? 'n/a'})`);
  }
  // approved / receipt-options / receipt-done / thank-you: a synthetic swipe straight to approved.
  if (owner.role === 'mfd' && owner.payDisplayLink !== 'UP') return err(`${owner.id}: pay-display link is down`);
  if (side.dev.id !== owner.id || side.disp !== 'primary') setScreen(lab, ctx, owner, 'primary', 'waiting-for-customer', { instant: true });
  stageApproved(lab, ctx, owner, stage === 'approved');
  settle(lab, ...all);
  if (stage === 'approved') return OK;
  autoAdvanceNow(lab, ctx, side.dev, side.disp); // approved → receipt-options
  settle(lab, ...all);
  if (stage === 'receipt-options') return OK;
  if (stage === 'receipt-done' && side.disp !== 'secondary') return err(`${owner.id}: receipt-done exists only on a Duo CFD`);
  press(lab, ctx, side.dev, side.disp, 'No Receipt');
  settle(lab, ...all);
  if (stage === 'receipt-done') return OK;
  if (dispOf(side.dev, side.disp)?.screen === 'receipt-done') press(lab, ctx, side.dev, side.disp, 'Done');
  settle(lab, ...all);
  return OK;
}

/* ────────────────────────────── entity names for orca.deleteEntity ────────────────────────────── */

const ENTITIES: EntityName[] = ['robot', 'device', 'capability', 'merchant', 'screen', 'screenLocation', 'cardProfile', 'screenCompareImage'];

function entityIdByName(lab: LabState, entity: EntityName, name: string): number | null {
  const o = lab.orca;
  const byName = <T extends { id: number; name: string }>(t: Record<number, T>) => Object.values(t).find((r) => r.name === name)?.id ?? null;
  switch (entity) {
    case 'robot':
      return byName(o.robots);
    case 'device':
      return byName(o.devices);
    case 'capability':
      return byName(o.capabilities);
    case 'merchant':
      return byName(o.merchants);
    case 'cardProfile':
      return byName(o.cardProfiles);
    case 'screenCompareImage':
      return byName(o.screenCompareImages);
    case 'screen': {
      const [type, scr] = name.split('/');
      return Object.values(o.screens).find((x) => x.deviceType === type && x.name === scr)?.id ?? null;
    }
    case 'screenLocation': {
      const [type, scr, button] = name.split('/');
      const sc = Object.values(o.screens).find((x) => x.deviceType === type && x.name === scr);
      return sc ? (Object.values(o.screenLocations).find((l) => l.screenId === sc.id && l.button === button)?.id ?? null) : null;
    }
  }
}

/* ────────────────────────────── the catalogue ────────────────────────────── */

const FLAG_KEYS: (keyof LabFlags)[] = ['receiptQrFeature', 'uiaVersion', 'softwarePinBypass', 'showTouchTargets', 'cfdLayoutV2Toggle'];
const CONFIG_KEYS: (keyof SimConfig)[] = ['mode', 'damageModel', 'pipelinesEnabled', 'npcAutoMerge', 'forceHealthCheckAllowed', 'logCap'];

function flagValue(flag: keyof LabFlags, v: unknown): LabFlags[keyof LabFlags] | null {
  if (flag === 'uiaVersion') return v === '2.2' || v === '2.3' ? v : null;
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return null;
}

function configValue(key: keyof SimConfig, v: unknown): SimConfig[keyof SimConfig] | null {
  switch (key) {
    case 'mode':
      return ['academy', 'arcade', 'freeplay', 'cert', 'test'].includes(s(v)) ? (s(v) as SimConfig['mode']) : null;
    case 'damageModel':
      return ['academy', 'arcade', 'full'].includes(s(v)) ? (s(v) as SimConfig['damageModel']) : null;
    case 'logCap':
      return Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null;
    default:
      return v === true || v === 'true' ? true : v === false || v === 'false' ? false : null;
  }
}

export const CORE_SETUP_OP_DEFS: SetupOpDef[] = [
  {
    info: sop('flag.set', 'sim.setFlag(flag, value) including its rollout effects (§3.10; cfdLayoutV2Toggle → R2-D2 cfdLayout/labelShiftPx)', [R('flag', 'string', 'Lab flag', 'receiptQrFeature'), R('value', 'string', 'Value (boolean, or 2.2/2.3 for uiaVersion)', 'false')]),
    validate(_lab, ps) {
      const e = need('flag.set', ps, 'flag', 'value');
      if (e) return e;
      const flag = s(ps.flag) as keyof LabFlags;
      if (!FLAG_KEYS.includes(flag)) return bad('flag.set', 'flag', ps.flag, `not one of ${FLAG_KEYS.join(', ')}`);
      return flagValue(flag, ps.value) === null ? bad('flag.set', 'value', ps.value, flag === 'uiaVersion' ? 'not one of 2.2, 2.3' : 'not one of true, false') : OK;
    },
    apply(lab, ctx, ps) {
      const flag = s(ps.flag) as keyof LabFlags;
      applyFlag(lab, ctx, flag, flagValue(flag, ps.value) as never);
    },
  },
  {
    info: sop('config.patch', 'sim.setConfig({ [key]: value })', [R('key', 'string', 'SimConfig key', 'pipelinesEnabled'), R('value', 'string', 'Value', 'true')]),
    validate(_lab, ps) {
      const e = need('config.patch', ps, 'key', 'value');
      if (e) return e;
      const key = s(ps.key) as keyof SimConfig;
      if (!CONFIG_KEYS.includes(key)) return bad('config.patch', 'key', ps.key, `not one of ${CONFIG_KEYS.join(', ')}`);
      return configValue(key, ps.value) === null ? bad('config.patch', 'value', ps.value, 'wrong type') : OK;
    },
    apply(lab, ctx, ps) {
      const key = s(ps.key) as keyof SimConfig;
      const v = configValue(key, ps.value);
      if (lab.config[key] === v) return;
      lab.config = { ...lab.config, [key]: v };
      ctx.emit('config.changed', { keys: [key] });
    },
  },
  {
    info: sop('orca.setStatus', 'The §3.2.1 manual status transition at atMs (STATUS note, reservation fields). CONNECTION_FAILED is rejected.', [R('robot', 'robot', 'Robot Name', 'baymax'), R('status', 'string', 'Status', 'OFFLINE'), p('by', 'string', 'Who', { default: 'jared' }), p('atMs', 'number', 'Game ms (default now)')]),
    validate(lab, ps) {
      const e = need('orca.setStatus', ps, 'robot', 'status');
      if (e) return e;
      if (!robotByName(lab, s(ps.robot))) return bad('orca.setStatus', 'robot', ps.robot, 'no such robot');
      if (s(ps.status) === 'CONNECTION_FAILED') return err('400 Bad Request: Connection Failed is set by the health check only');
      if (!STATUSES.includes(s(ps.status) as RobotStatus)) return err(`400 Bad Request: Invalid value for status: '${s(ps.status)}'`);
      return OK;
    },
    apply(lab, ctx, ps) {
      const robot = robotByName(lab, s(ps.robot))!;
      const when = ps.atMs === undefined || ps.atMs === '' ? lab.time.nowMs : Number(ps.atMs);
      setRobotStatus(lab, ctx, robot.id, s(ps.status), s(ps.by, 'jared'), undefined, when, true);
    },
  },
  {
    info: sop('orca.createDevice', 'orca.saveDevice (binds simDeviceId by serial, §1.15)', [R('name', 'string', 'Device row name', 'johnny-5-flex2'), R('deviceType', 'deviceType', 'Device Type', 'FLEX_2'), R('serial', 'string', 'Serial', 'SIM-F2-000015'), R('ip', 'string', 'IP', '10.42.30.15'), p('label', 'string', 'Label', { default: '' }), p('by', 'string', 'Who', { default: 'jared' })]),
    validate(lab, ps) {
      const e = need('orca.createDevice', ps, 'name', 'deviceType', 'serial', 'ip');
      if (e) return e;
      if (!(DEVICE_TYPE_CODES as readonly string[]).includes(s(ps.deviceType))) return bad('orca.createDevice', 'deviceType', ps.deviceType, `not one of ${DEVICE_TYPE_CODES.join(', ')}`);
      if (Object.values(lab.orca.devices).some((d) => d.name === s(ps.name))) return err(`400 Bad Request: name '${s(ps.name)}' already exists`);
      return OK;
    },
    apply(lab, ctx, ps) {
      saveDevice(lab, ctx, { name: s(ps.name), deviceType: s(ps.deviceType) as DeviceTypeCode, serial: s(ps.serial), ip: s(ps.ip), label: s(ps.label) }, s(ps.by, 'jared'), { force: true });
    },
  },
  {
    info: sop('orca.linkDevice', 'orca.saveRobot with that relation (CONFIG note)', [R('robot', 'robot', 'Robot Name', 'johnny-5'), p('field', 'string', 'Relation', { default: 'deviceId', values: ['deviceId', 'mfdDeviceId', 'cfdDeviceId'] }), R('device', 'string', "Device row name or ''", 'johnny-5-flex2'), p('by', 'string', 'Who', { default: 'jared' })]),
    validate(lab, ps) {
      const e = need('orca.linkDevice', ps, 'robot');
      if (e) return e;
      if (ps.device === undefined) return bad('orca.linkDevice', 'device', '', 'missing');
      if (!robotByName(lab, s(ps.robot))) return bad('orca.linkDevice', 'robot', ps.robot, 'no such robot');
      const f = s(ps.field, 'deviceId');
      if (!['deviceId', 'mfdDeviceId', 'cfdDeviceId'].includes(f)) return bad('orca.linkDevice', 'field', f, 'not one of deviceId, mfdDeviceId, cfdDeviceId');
      if (s(ps.device) && !Object.values(lab.orca.devices).some((d) => d.name === s(ps.device))) return bad('orca.linkDevice', 'device', ps.device, 'no such device');
      return OK;
    },
    apply(lab, ctx, ps) {
      const robot = robotByName(lab, s(ps.robot))!;
      const row = s(ps.device) ? Object.values(lab.orca.devices).find((d) => d.name === s(ps.device))! : null;
      saveRobot(lab, ctx, { id: robot.id, [s(ps.field, 'deviceId')]: row ? row.id : null }, s(ps.by, 'jared'), { force: true });
    },
  },
  {
    info: sop('orca.deleteEntity', 'orca.deleteEntity (audit DELETE); screens as TYPE/SCREEN, locations as TYPE/SCREEN/BUTTON', [R('entity', 'string', 'Entity', 'screenCompareImage'), R('name', 'string', 'Row name', 'CFD_TOTAL'), p('by', 'string', 'Who', { default: 'jared' })]),
    validate(lab, ps) {
      const e = need('orca.deleteEntity', ps, 'entity', 'name');
      if (e) return e;
      const ent = s(ps.entity) as EntityName;
      if (!ENTITIES.includes(ent)) return bad('orca.deleteEntity', 'entity', ps.entity, `not one of ${ENTITIES.join(', ')}`);
      return entityIdByName(lab, ent, s(ps.name)) == null ? bad('orca.deleteEntity', 'name', ps.name, `no such ${ent}`) : OK;
    },
    apply(lab, ctx, ps) {
      const ent = s(ps.entity) as EntityName;
      deleteEntity(lab, ctx, ent, entityIdByName(lab, ent, s(ps.name))!, s(ps.by, 'jared'), { force: true });
    },
  },
  {
    info: sop('orca.syncFromGort', 'Upsert every config/screen-locations/** file on gort main into Orca now (§3.22.3 without the 10 s delay)', []),
    validate: () => OK,
    apply(lab, ctx) {
      syncAllFromGort(lab, ctx);
    },
  },
  {
    info: sop('device.stage', 'Drive the device through §3.9 with the normal inputs to a stage; render/auto-advance timers complete instantly [sim]; approved is held', [R('device', 'device', 'Runtime device', 'dev-r2-d2-duo'), R('stage', 'string', `One of ${STAGES.join(', ')}`, 'review-order'), p('items', 'list', 'Items added', { default: ['Tax Item 5'] })]),
    validate(lab, ps) {
      const e = need('device.stage', ps, 'device', 'stage');
      if (e) return e;
      const d = lab.devices[s(ps.device)];
      if (!d) return bad('device.stage', 'device', ps.device, 'no such device');
      if (!(STAGES as readonly string[]).includes(s(ps.stage))) return bad('device.stage', 'stage', ps.stage, `not one of ${STAGES.join(', ')}`);
      const owner = d.role === 'cfd' && d.tetheredTo ? lab.devices[d.tetheredTo]! : d;
      if (owner.power !== 'on') return err(`setup device.stage: ${owner.id} is not on`);
      return OK;
    },
    apply(lab, ctx, ps) {
      const items = Array.isArray(ps.items) ? (ps.items as string[]) : ps.items === undefined ? ['Tax Item 5'] : s(ps.items).split(',').map((x) => x.trim()).filter(Boolean);
      stageDevice(lab, ctx, s(ps.device), s(ps.stage), items);
    },
  },
  {
    info: sop('device.swap', 'device.swapHardware path: old device → storage (unplugged), new device seated, hub connected, PSU on the rig strip socket, boots 30 s; Orca untouched', [R('rig', 'rig', 'Rig', 'johnny-5'), R('deviceId', 'device', 'Stored device to install', 'dev-spare-flex2'), p('storeAt', 'string', 'Where the old device goes', { default: 'storage-shelf' })]),
    validate(lab, ps) {
      const e = need('device.swap', ps, 'rig', 'deviceId');
      if (e) return e;
      if (!lab.rigs[s(ps.rig)]) return bad('device.swap', 'rig', ps.rig, 'no such rig');
      const d = lab.devices[s(ps.deviceId)];
      if (!d) return bad('device.swap', 'deviceId', ps.deviceId, 'no such device');
      if (d.rigId && lab.rigs[d.rigId]) return err(`${d.id} is installed on ${d.rigId}`);
      return OK;
    },
    apply(lab, ctx, ps) {
      const d = lab.devices[s(ps.deviceId)]!;
      swapHardware(lab, ctx, s(ps.rig), d.type, { deviceId: d.id, storeAt: s(ps.storeAt, 'storage-shelf') });
    },
  },
  {
    info: sop('device.provision', 'The end state of a completed Laz swap (§3.17.2) without running it; resetAdb leaves adbTcpPort = null', [R('device', 'device', 'Runtime device', 'dev-data-mini3'), R('merchant', 'merchant', 'Merchant Config name', 'AUTO-US-NOPIN-02'), p('resetAdb', 'boolean', 'Leave ADB over TCP off', { default: false })]),
    validate(lab, ps) {
      const e = need('device.provision', ps, 'device', 'merchant');
      if (e) return e;
      if (!lab.devices[s(ps.device)]) return bad('device.provision', 'device', ps.device, 'no such device');
      return Object.values(lab.orca.merchants).some((m) => m.name === s(ps.merchant)) ? OK : bad('device.provision', 'merchant', ps.merchant, 'no such merchant');
    },
    apply(lab, ctx, ps) {
      const m = Object.values(lab.orca.merchants).find((x) => x.name === s(ps.merchant))!;
      const d = lab.devices[s(ps.device)]!;
      provisionDevice(lab, ctx, d, m.id, bool(ps.resetAdb));
      if (!bool(ps.resetAdb) && d.adbTcpPort == null) {
        d.adbTcpPort = d.ip.startsWith('10.42.60.') ? 5555 : 5444;
        ctx.emit('device.adbTcpChanged', { deviceId: d.id, port: d.adbTcpPort });
      }
    },
  },
  {
    info: sop('power.plug', 'power.plug (may plug non-lab loads, e.g. the desk fan)', [R('load', 'string', 'Load id', 'desk-fan'), R('kind', 'string', 'ac-strip | dc-rail | none', 'ac-strip'), R('target', 'string', 'Strip / terminal id', 'STRIP-A'), p('socket', 'number', 'Strip socket 1–6')]),
    validate(lab, ps) {
      const e = need('power.plug', ps, 'load', 'kind');
      if (e) return e;
      if (!lab.power.loads[s(ps.load)]) return bad('power.plug', 'load', ps.load, 'no such load');
      if (!['ac-strip', 'dc-rail', 'none'].includes(s(ps.kind))) return bad('power.plug', 'kind', ps.kind, 'not one of ac-strip, dc-rail, none');
      if (s(ps.kind) === 'ac-strip') {
        const st = lab.power.strips[s(ps.target)];
        if (!st) return bad('power.plug', 'target', ps.target, 'no such strip');
        if (ps.socket !== undefined) {
          const n = Number(ps.socket);
          if (!(n >= 1 && n <= st.sockets)) return bad('power.plug', 'socket', ps.socket, 'not one of 1, 2, 3, 4, 5, 6');
          const occ = st.loads[n - 1];
          if (occ && occ !== s(ps.load)) return err(`socket ${n} on ${st.id} is occupied (${lab.power.loads[occ]?.label ?? occ})`);
        } else if (!st.loads.some((l) => l == null)) return err(`${st.id} has no free socket`);
      } else if (s(ps.kind) === 'dc-rail' && !lab.power.terminals[s(ps.target)] && !lab.power.rails[s(ps.target)]) return bad('power.plug', 'target', ps.target, 'no such terminal');
      return OK;
    },
    apply(lab, ctx, ps) {
      const hookup: PowerHookup = ps.socket !== undefined ? { kind: s(ps.kind) as PowerHookup['kind'], targetId: s(ps.target) || null, socket: Number(ps.socket) } : { kind: s(ps.kind) as PowerHookup['kind'], targetId: s(ps.target) || null };
      plug(lab, ctx, s(ps.load), hookup, 'setup');
    },
  },
  {
    info: sop('power.addLoad', 'Create an unplugged free-standing load (a spare brick / PSU on the bench)', [R('id', 'string', 'Load id', 'psu-flex4-new'), R('label', 'string', 'Label', 'New Flex 4 power brick'), R('expects', 'string', '5V | 12V | 24V | AC-BRICK-18V | AC', 'AC-BRICK-18V'), p('drawA', 'number', 'Nominal draw (A)', { default: 0.5 }), p('deviceId', 'device', 'Device it powers')]),
    validate(lab, ps) {
      const e = need('power.addLoad', ps, 'id', 'label', 'expects');
      if (e) return e;
      if (lab.power.loads[s(ps.id)]) return err(`setup power.addLoad: load '${s(ps.id)}' already exists`);
      if (!['5V', '12V', '24V', 'AC-BRICK-18V', 'AC'].includes(s(ps.expects))) return bad('power.addLoad', 'expects', ps.expects, 'not one of 5V, 12V, 24V, AC-BRICK-18V, AC');
      if (ps.drawA !== undefined && Number.isNaN(Number(ps.drawA))) return bad('power.addLoad', 'drawA', ps.drawA, 'not a number');
      if (ps.deviceId !== undefined && !lab.devices[s(ps.deviceId)]) return bad('power.addLoad', 'deviceId', ps.deviceId, 'no such device');
      return OK;
    },
    apply(lab, _ctx, ps) {
      const load: PowerLoad = { id: s(ps.id), label: s(ps.label), expects: s(ps.expects) as PowerLoad['expects'], drawA: ps.drawA === undefined ? 0.5 : Number(ps.drawA), supply: { kind: 'none', targetId: null }, powered: false, damaged: false };
      if (ps.deviceId !== undefined) load.deviceId = s(ps.deviceId);
      lab.power.loads[load.id] = load;
    },
  },
  {
    info: sop('ws.adbKnows', 'Workstation ADB server running; append { target, state: device, coworker } to adbConnections if reachable on that port (§2.14)', [R('target', 'string', 'ip:port', '10.42.60.4:5555')]),
    validate(_lab, ps) {
      const e = need('ws.adbKnows', ps, 'target');
      if (e) return e;
      return /^\d+\.\d+\.\d+\.\d+:\d+$/.test(s(ps.target)) ? OK : bad('ws.adbKnows', 'target', ps.target, 'not ip:port');
    },
    apply(lab, ctx, ps) {
      const t = s(ps.target);
      lab.workstation.adbServerRunning = true;
      if (lab.workstation.adbConnections.some((c) => c.target === t)) return;
      const [ip, port] = [t.slice(0, t.lastIndexOf(':')), Number(t.slice(t.lastIndexOf(':') + 1))];
      const r = reach(lab, 'ws-17', ip, port, { noLatency: true });
      if (!r.ok || !r.deviceId) return;
      const coworker = ip.startsWith('10.42.60.');
      lab.workstation.adbConnections.push({ target: t, hostId: null, deviceId: r.deviceId, state: 'device', coworker });
      ctx.emit('adb.connected', { target: t, deviceId: r.deviceId, coworker });
    },
  },
  {
    info: sop('chat.post', 'chat.post / chat.schedule', [R('channel', 'string', 'Channel', '#lab-automation'), R('author', 'string', 'Author key', 'jared'), R('text', 'string', 'Text', 'Morning — Rack B is dark.'), p('delayMs', 'number', 'Delay (physical ms; 0 = now)', { default: 0 })]),
    validate(_lab, ps) {
      const e = need('chat.post', ps, 'channel', 'author', 'text');
      if (e) return e;
      return ps.delayMs !== undefined && Number.isNaN(Number(ps.delayMs)) ? bad('chat.post', 'delayMs', ps.delayMs, 'not a number') : OK;
    },
    apply(lab, ctx, ps) {
      const delay = ps.delayMs === undefined ? 0 : Number(ps.delayMs);
      if (delay > 0) addTimer(lab, 'chat.deliver', 'phys', delay, { channel: s(ps.channel), author: s(ps.author), text: s(ps.text), ticketId: null });
      else postChat(lab, ctx, s(ps.channel), s(ps.author), s(ps.text));
    },
  },
];

export const CORE_SETUP_OP_IDS = CORE_SETUP_OP_DEFS.map((d) => d.info.op);
