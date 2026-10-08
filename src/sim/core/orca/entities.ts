/**
 * Orca entity CRUD with JHipster-style validation (Sim §1.3, §3.23): CONFIG notes per changed robot
 * field (Sim §3.3.4), audit rows with diffs, `orca.entitySaved` events, serial binding of Device rows
 * (Sim §1.15), the ADB-bot merchant rule (Sim §2.8) and Card Profile validation (Sim §2.9).
 */
import type { CardProfile, LabState, MerchantConfig, OrcaDevice, OrcaRobot, OrcaScreen, RigState, RobotCapability, ScreenCompareImage, ScreenLocation } from '../../types';
import type { OrcaEntityName } from '../../events';
import type { Result } from '../../api';
import type { Ctx } from '../util';
import { deepEqual } from '../util';
import { DEVICE_TYPES } from '../../seed/deviceTypes';
import { round1, fmtStamp } from '../../text/time';
import { addNote, audit, orcaDown, setRobotStatus } from './status';
import { isDeviceTypeConstant } from './checkout';
import { scheduleHrnPush } from '../rigs';

type Diff = Record<string, [unknown, unknown]>;
const bad = (t: string): Result<number> => ({ ok: false, error: `400 Bad Request: ${t}` });

export interface SaveOpts {
  /** Edit-style faults may backdate the change (history, not symptoms; Sim §4.1.8). */
  atMs?: number;
  /** Edit-style faults: an NPC's earlier edit — applied even while Orca is down right now. */
  force?: boolean;
}

/** CONFIG note field names (Sim §3.3.4). */
const ROBOT_NOTE_FIELD: Partial<Record<keyof OrcaRobot, string>> = {
  name: 'name',
  humanReadableName: 'humanReadableName',
  deviceId: 'deviceId',
  mfdDeviceId: 'mfdDeviceId',
  cfdDeviceId: 'cfdDeviceId',
  adbServiceUrl: 'urls.adb',
  cameraStreamUrl: 'urls.camera',
  dipUrl: 'urls.dip',
  tapUrl: 'urls.tap',
  swipeUrl: 'urls.swipe',
  offsetXMm: 'offsets.x',
  offsetYMm: 'offsets.y',
  merchantConfigId: 'merchant',
  capabilityIds: 'capabilities',
};
const ROBOT_EDITABLE: (keyof OrcaRobot)[] = ['name', 'humanReadableName', 'rigKind', 'environment', 'deviceId', 'mfdDeviceId', 'cfdDeviceId', 'adbServiceUrl', 'cameraStreamUrl', 'dipUrl', 'tapUrl', 'swipeUrl', 'offsetXMm', 'offsetYMm', 'capabilityIds', 'merchantConfigId', 'location', 'description', 'physical'];

/** The physical rig of an Orca robot (by row id — renaming the robot does not move the hardware). */
export function rigOf(lab: LabState, robot: OrcaRobot): RigState | undefined {
  const byName = lab.rigs[robot.name];
  if (byName && byName.orcaRobotId === robot.id) return byName;
  return Object.values(lab.rigs).find((r) => r.orcaRobotId === robot.id);
}

function emitSaved(ctx: Ctx, entity: OrcaEntityName, id: number, action: 'create' | 'update' | 'delete', diff: Diff, actor: string): void {
  ctx.emit('orca.entitySaved', { entity, id, action, fields: Object.keys(diff), actor, diff });
}

export function saveRobot(lab: LabState, ctx: Ctx, input: Partial<OrcaRobot> & { id?: number }, actor: string, opts: SaveOpts = {}): Result<number> {
  const down = opts.force ? null : orcaDown(lab);
  if (down) return { ok: false, error: down };
  const at = opts.atMs ?? lab.time.nowMs;
  const existing = input.id != null ? lab.orca.robots[input.id] : undefined;
  if (input.id != null && !existing) return { ok: false, error: '404 Not Found' };
  const name = input.name ?? existing?.name ?? '';
  if (!name.trim()) return bad('name must not be blank');
  if (Object.values(lab.orca.robots).some((r) => r.name === name && r.id !== existing?.id)) return bad(`name '${name}' already exists`);
  for (const k of ['deviceId', 'mfdDeviceId', 'cfdDeviceId'] as const) {
    const v = input[k];
    if (v != null && !lab.orca.devices[v]) return bad(`${k}: device ${v} not found`);
  }
  for (const c of input.capabilityIds ?? []) if (!lab.orca.capabilities[c]) return bad(`capabilityIds: capability ${c} not found`);
  const merchantId = input.merchantConfigId !== undefined ? input.merchantConfigId : existing?.merchantConfigId ?? null;
  if (merchantId != null && !lab.orca.merchants[merchantId]) return bad(`merchantConfigId: merchant ${merchantId} not found`);
  const kind = input.rigKind ?? existing?.rigKind ?? 'touch';
  if (kind === 'adb' && merchantId != null && !lab.orca.merchants[merchantId]!.pinBypass) return bad('ADB-only robots require a PIN-bypass merchant');
  if (input.status !== undefined && input.status === 'CONNECTION_FAILED' && existing?.status !== 'CONNECTION_FAILED') return bad('Connection Failed is set by the health check only');
  if (input.offsetXMm !== undefined && !Number.isFinite(input.offsetXMm)) return bad('offsetXMm must be a number');
  if (input.offsetYMm !== undefined && !Number.isFinite(input.offsetYMm)) return bad('offsetYMm must be a number');

  let robot: OrcaRobot;
  let action: 'create' | 'update' = 'update';
  const diff: Diff = {};
  if (!existing) {
    action = 'create';
    const id = Math.max(lab.orca.seq.robots, ...Object.keys(lab.orca.robots).map((k) => Number(k) + 1));
    lab.orca.seq.robots = id + 1;
    robot = {
      id,
      name,
      humanReadableName: input.humanReadableName ?? name.toUpperCase(),
      status: 'OFFLINE',
      preFailureStatus: null,
      statusChangedMs: at,
      statusHistory: [],
      rigKind: kind,
      environment: input.environment ?? 'DEV1',
      deviceId: null,
      mfdDeviceId: null,
      cfdDeviceId: null,
      adbServiceUrl: '',
      cameraStreamUrl: '',
      dipUrl: null,
      tapUrl: null,
      swipeUrl: null,
      offsetXMm: 0,
      offsetYMm: 0,
      capabilityIds: [],
      merchantConfigId: null,
      reservedBy: null,
      reservedAtMs: null,
      checkout: null,
      lastReleasedMs: null,
      lastHealthCheckMs: null,
      lastHealthCheckOk: null,
      lastHealth: null,
      notes: [],
      physical: false,
      location: '',
      description: '',
    };
    lab.orca.robots[id] = robot;
  } else robot = existing;

  for (const k of ROBOT_EDITABLE) {
    if (input[k] === undefined) continue;
    let v = input[k] as unknown;
    if (k === 'offsetXMm' || k === 'offsetYMm') v = round1(Number(v));
    if ((k === 'dipUrl' || k === 'tapUrl' || k === 'swipeUrl') && v === '') v = '';
    const before = robot[k] as unknown;
    if (deepEqual(before, v)) continue;
    diff[k] = [before, v];
    (robot as unknown as Record<string, unknown>)[k] = Array.isArray(v) ? [...(v as unknown[])] : v;
  }
  if (action === 'update') {
    for (const k of Object.keys(diff) as (keyof OrcaRobot)[]) {
      const f = ROBOT_NOTE_FIELD[k];
      if (f) addNote(lab, ctx, robot, 'CONFIG', actor, `${fmtStamp(lab.time, at)} CONFIG ${f} changed (${actor})`, undefined, at);
    }
  }
  if ('humanReadableName' in diff) scheduleHrnPush(lab, robot.id);
  audit(lab, actor, action === 'create' ? 'CREATE' : 'UPDATE', 'robot', robot.id, Object.keys(diff).length ? diff : undefined, at);
  emitSaved(ctx, 'robot', robot.id, action, diff, actor);
  if (input.status !== undefined && input.status !== robot.status) {
    const r = setRobotStatus(lab, ctx, robot.id, input.status, actor, undefined, at, opts.force === true);
    if (!r.ok) return { ok: false, error: r.error };
  }
  return { ok: true, value: robot.id };
}

/** Serial binding (Sim §1.15): row.simDeviceId ↔ runtime device with the same serial. */
export function bindSerial(lab: LabState, row: OrcaDevice): void {
  const dev = Object.values(lab.devices)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .find((d) => d.serial === row.serial);
  row.simDeviceId = dev ? dev.id : null;
  if (dev) dev.orcaDeviceName = row.name;
}

export function saveDevice(lab: LabState, ctx: Ctx, input: Partial<OrcaDevice> & { id?: number }, actor: string, opts: SaveOpts = {}): Result<number> {
  const down = opts.force ? null : orcaDown(lab);
  if (down) return { ok: false, error: down };
  const at = opts.atMs ?? lab.time.nowMs;
  const existing = input.id != null ? lab.orca.devices[input.id] : undefined;
  if (input.id != null && !existing) return { ok: false, error: '404 Not Found' };
  const name = input.name ?? existing?.name ?? '';
  if (!name.trim()) return bad('name must not be blank');
  if (Object.values(lab.orca.devices).some((d) => d.name === name && d.id !== existing?.id)) return bad(`name '${name}' already exists`);
  const type = (input.deviceType ?? existing?.deviceType) as string | undefined;
  if (!type) return bad('deviceType must not be null');
  if (!isDeviceTypeConstant(type)) return bad(`Cannot deserialize value of type \`DeviceType\` from String "${type}": not one of the values accepted for Enum class`);
  const serial = input.serial ?? existing?.serial ?? '';
  if (!serial.trim()) return bad('serial must not be blank');
  const ip = input.ip ?? existing?.ip ?? '';
  if (ip && !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return bad(`ip '${ip}' is not a valid IPv4 address`);
  const diff: Diff = {};
  let row: OrcaDevice;
  let action: 'create' | 'update' = 'update';
  if (!existing) {
    action = 'create';
    const id = Math.max(lab.orca.seq.devices, ...Object.keys(lab.orca.devices).map((k) => Number(k) + 1));
    lab.orca.seq.devices = id + 1;
    row = { id, name, deviceType: type as OrcaDevice['deviceType'], serial, ip, label: input.label ?? '', simDeviceId: null, retired: input.retired ?? false };
    lab.orca.devices[id] = row;
    for (const k of ['name', 'deviceType', 'serial', 'ip', 'label'] as const) diff[k] = [null, row[k]];
  } else {
    row = existing;
    const next = { name, deviceType: type as OrcaDevice['deviceType'], serial, ip, label: input.label ?? row.label, retired: input.retired ?? row.retired };
    for (const k of Object.keys(next) as (keyof typeof next)[]) {
      if (row[k] !== next[k]) {
        diff[k] = [row[k], next[k]];
        (row as unknown as Record<string, unknown>)[k] = next[k];
      }
    }
  }
  const prevSim = row.simDeviceId;
  bindSerial(lab, row);
  if (prevSim && prevSim !== row.simDeviceId) {
    const old = lab.devices[prevSim];
    if (old && !Object.values(lab.orca.devices).some((d) => d.simDeviceId === prevSim)) old.orcaDeviceName = '';
  }
  audit(lab, actor, action === 'create' ? 'CREATE' : 'UPDATE', 'device', row.id, diff, at);
  emitSaved(ctx, 'device', row.id, action, diff, actor);
  return { ok: true, value: row.id };
}

/** Generic save for the simpler entities (capability, merchant, card profile, compare image). */
function genericSave<T extends { id: number }>(lab: LabState, ctx: Ctx, entity: OrcaEntityName, table: Record<number, T>, seqKey: keyof LabState['orca']['seq'], input: Partial<T> & { id?: number }, defaults: () => Omit<T, 'id'>, actor: string, at: number): Result<number> {
  const existing = input.id != null ? table[input.id] : undefined;
  if (input.id != null && !existing) return { ok: false, error: '404 Not Found' };
  const diff: Diff = {};
  let row: T;
  let action: 'create' | 'update' = 'update';
  if (!existing) {
    action = 'create';
    const id = Math.max(lab.orca.seq[seqKey], ...Object.keys(table).map((k) => Number(k) + 1));
    lab.orca.seq[seqKey] = id + 1;
    row = { ...defaults(), id } as T;
    table[id] = row;
  } else row = existing;
  for (const [k, v] of Object.entries(input)) {
    if (k === 'id' || v === undefined) continue;
    const before = (row as Record<string, unknown>)[k];
    if (deepEqual(before, v)) continue;
    diff[k] = [action === 'create' ? null : before, v];
    (row as Record<string, unknown>)[k] = Array.isArray(v) ? [...v] : typeof v === 'object' && v ? { ...(v as object) } : v;
  }
  audit(lab, actor, action === 'create' ? 'CREATE' : 'UPDATE', entity, row.id, diff, at);
  emitSaved(ctx, entity, row.id, action, diff, actor);
  return { ok: true, value: row.id };
}

export function saveCapability(lab: LabState, ctx: Ctx, input: Partial<RobotCapability> & { id?: number }, actor: string, opts: SaveOpts = {}): Result<number> {
  const down = opts.force ? null : orcaDown(lab);
  if (down) return { ok: false, error: down };
  const name = input.name ?? (input.id != null ? lab.orca.capabilities[input.id]?.name : undefined);
  if (!name) return bad('name must not be blank');
  if (Object.values(lab.orca.capabilities).some((c) => c.name === name && c.id !== input.id)) return bad(`name '${name}' already exists`);
  return genericSave<RobotCapability>(lab, ctx, 'capability', lab.orca.capabilities, 'capabilities', input, () => ({ name, key: name.toLowerCase().replace(/_(\w)/g, (_, c: string) => c.toUpperCase()), value: true, description: '', lookup: 'BOTH', json: null }), actor, opts.atMs ?? lab.time.nowMs);
}

export function saveMerchant(lab: LabState, ctx: Ctx, input: Partial<MerchantConfig> & { id?: number }, actor: string, opts: SaveOpts = {}): Result<number> {
  const down = opts.force ? null : orcaDown(lab);
  if (down) return { ok: false, error: down };
  const existing = input.id != null ? lab.orca.merchants[input.id] : undefined;
  const name = input.name ?? existing?.name;
  if (!name) return bad('name must not be blank');
  if (Object.values(lab.orca.merchants).some((m) => m.name === name && m.id !== input.id)) return bad(`name '${name}' already exists`);
  if (input.taxRateBp !== undefined) input = { ...input, taxRatePct: input.taxRateBp / 100 };
  else if (input.taxRatePct !== undefined) input = { ...input, taxRateBp: Math.round(input.taxRatePct * 100) };
  // An ADB-only robot linked to this merchant must keep PIN bypass.
  if (existing && input.pinBypass === false) {
    const adb = Object.values(lab.orca.robots).find((r) => r.rigKind === 'adb' && r.merchantConfigId === existing.id);
    if (adb) return bad('ADB-only robots require a PIN-bypass merchant');
  }
  const blank = (k: 'appId' | 'appSecret' | 'apiKey') => (input[k] === '' ? null : input[k]);
  const patch: Partial<MerchantConfig> & { id?: number } = { ...input };
  for (const k of ['appId', 'appSecret', 'apiKey'] as const) if (k in input) patch[k] = blank(k);
  return genericSave<MerchantConfig>(lab, ctx, 'merchant', lab.orca.merchants, 'merchants', patch, () => ({
    name,
    displayName: name,
    address: '100 Automation Way, Lab 4',
    merchantId: '',
    environment: 'dev1',
    region: 'US-EAST',
    country: 'US',
    currency: 'USD',
    taxRatePct: 0,
    taxRateBp: 0,
    tipsEnabled: false,
    tipPercents: [],
    pinBypass: false,
    cashDiscountEnabled: false,
    cardAdjustBp: 0,
    qrReceiptsEnabled: false,
    signatureThresholdCents: null,
    acceptedBrands: ['VISA'],
    apps: [],
    owner: 'Automation',
    appId: null,
    appSecret: null,
    apiKey: null,
    ubiRoute: null,
    notes: '',
  }), actor, opts.atMs ?? lab.time.nowMs);
}

export function saveScreen(lab: LabState, ctx: Ctx, input: Partial<OrcaScreen> & { id?: number }, actor: string, opts: SaveOpts = {}): Result<number> {
  const down = opts.force ? null : orcaDown(lab);
  if (down) return { ok: false, error: down };
  const existing = input.id != null ? lab.orca.screens[input.id] : undefined;
  const name = input.name ?? existing?.name;
  const type = (input.deviceType ?? existing?.deviceType) as string | undefined;
  if (!name) return bad('name must not be blank');
  if (!type || !isDeviceTypeConstant(type)) return bad(`Cannot deserialize value of type \`DeviceType\` from String "${type ?? ''}": not one of the values accepted for Enum class`);
  if (Object.values(lab.orca.screens).some((s) => s.name === name && s.deviceType === type && s.id !== input.id)) return bad(`screen (${type}, ${name}) already exists`);
  const info = DEVICE_TYPES[type as OrcaScreen['deviceType']];
  const patch = { ...input, testingProfile: info.testingProfile };
  return genericSave<OrcaScreen>(lab, ctx, 'screen', lab.orca.screens, 'screens', patch, () => ({
    name,
    deviceType: type as OrcaScreen['deviceType'],
    testingProfile: info.testingProfile,
    display: name.startsWith('CFD_') ? 'secondary' : 'primary',
    description: '',
    optionCount: /RECEIPT_OPTIONS_4$/.test(name) ? 4 : /RECEIPT_OPTIONS_5$/.test(name) ? 5 : null,
  }), actor, opts.atMs ?? lab.time.nowMs);
}

export function saveScreenLocation(lab: LabState, ctx: Ctx, input: Partial<ScreenLocation> & { id?: number }, actor: string, opts: SaveOpts = {}): Result<number> {
  const down = opts.force ? null : orcaDown(lab);
  if (down) return { ok: false, error: down };
  const existing = input.id != null ? lab.orca.screenLocations[input.id] : undefined;
  const screenId = input.screenId ?? existing?.screenId;
  const button = input.button ?? existing?.button;
  if (screenId == null || !lab.orca.screens[screenId]) return bad(`screenId: screen ${screenId ?? 'null'} not found`);
  if (!button) return bad('button must not be blank');
  if (Object.values(lab.orca.screenLocations).some((l) => l.screenId === screenId && l.button === button && l.id !== input.id)) return bad(`location (${screenId}, "${button}") already exists`);
  for (const k of ['xMm', 'yMm'] as const) if (input[k] !== undefined && !Number.isFinite(input[k])) return bad(`${k} must be a number`);
  const patch = { ...input };
  if (patch.xMm !== undefined) patch.xMm = round1(patch.xMm);
  if (patch.yMm !== undefined) patch.yMm = round1(patch.yMm);
  return genericSave<ScreenLocation>(lab, ctx, 'screenLocation', lab.orca.screenLocations, 'screenLocations', patch, () => ({ screenId, button, xMm: 0, yMm: 0 }), actor, opts.atMs ?? lab.time.nowMs);
}

export function saveCardProfile(lab: LabState, ctx: Ctx, input: Partial<CardProfile> & { id?: number }, actor: string, opts: SaveOpts = {}): Result<number> {
  const down = opts.force ? null : orcaDown(lab);
  if (down) return { ok: false, error: down };
  const existing = input.id != null ? lab.orca.cardProfiles[input.id] : undefined;
  const merged = { ...(existing ?? {}), ...input } as Partial<CardProfile>;
  if (!merged.name) return bad('name must not be blank');
  if (Object.values(lab.orca.cardProfiles).some((c) => c.name === merged.name && c.id !== input.id)) return bad(`name '${merged.name}' already exists`);
  const swipe = merged.entry === 'SWIPE';
  const okShape = swipe ? !!merged.trackData && merged.gortPath == null : !!merged.gortPath && merged.trackData == null;
  if (!okShape) return bad('Swipe profiles store Track Data; Dip/Tap profiles store a Gort path');
  return genericSave<CardProfile>(lab, ctx, 'cardProfile', lab.orca.cardProfiles, 'cardProfiles', input, () => ({ name: merged.name!, brand: 'VISA', entry: 'SWIPE', trackData: null, gortPath: null, country: 'US', requiresPin: false, owner: 'Automation', pin: null, pan: '', expiry: '3012' }), actor, opts.atMs ?? lab.time.nowMs);
}

export function saveScreenCompareImage(lab: LabState, ctx: Ctx, input: Partial<ScreenCompareImage> & { id?: number }, actor: string, opts: SaveOpts = {}): Result<number> {
  const down = opts.force ? null : orcaDown(lab);
  if (down) return { ok: false, error: down };
  const existing = input.id != null ? lab.orca.screenCompareImages[input.id] : undefined;
  const merged = { ...(existing ?? {}), ...input } as Partial<ScreenCompareImage>;
  if (!merged.name) return bad('name must not be blank');
  if (Object.values(lab.orca.screenCompareImages).some((c) => c.name === merged.name && c.id !== input.id)) return bad(`name '${merged.name}' already exists`);
  if (merged.robotId == null || !lab.orca.robots[merged.robotId]) return bad(`robotId: robot ${merged.robotId ?? 'null'} not found`);
  const b = merged.bbox;
  if (!b || ![b.x, b.y, b.w, b.h].every((v) => Number.isInteger(v) && v >= 0)) return bad('bbox: x, y, w, h must be non-negative integers');
  return genericSave<ScreenCompareImage>(lab, ctx, 'screenCompareImage', lab.orca.screenCompareImages, 'screenCompareImages', input, () => ({ name: merged.name!, robotId: merged.robotId!, screenName: '', bbox: { x: 0, y: 0, w: 0, h: 0 }, expectedText: '', deprecated: false, usedBy: [] }), actor, opts.atMs ?? lab.time.nowMs);
}

export type EntityName = 'robot' | 'device' | 'capability' | 'merchant' | 'screen' | 'screenLocation' | 'cardProfile' | 'screenCompareImage';

export function deleteEntity(lab: LabState, ctx: Ctx, entity: EntityName, id: number, actor: string, opts: SaveOpts = {}): Result {
  const down = opts.force ? null : orcaDown(lab);
  if (down) return { ok: false, error: down };
  const at = opts.atMs ?? lab.time.nowMs;
  const o = lab.orca;
  const tables: Record<EntityName, Record<number, { id: number }>> = {
    robot: o.robots,
    device: o.devices,
    capability: o.capabilities,
    merchant: o.merchants,
    screen: o.screens,
    screenLocation: o.screenLocations,
    cardProfile: o.cardProfiles,
    screenCompareImage: o.screenCompareImages,
  };
  const table = tables[entity];
  const row = table[id];
  if (!row) return { ok: false, error: '404 Not Found' };
  if (entity === 'device') {
    const r = Object.values(o.robots).find((x) => x.deviceId === id || x.mfdDeviceId === id || x.cfdDeviceId === id);
    if (r) return { ok: false, error: `400 Bad Request: device ${(row as OrcaDevice).name} is still linked to robot ${r.name}` };
    const sim = (row as OrcaDevice).simDeviceId;
    if (sim && lab.devices[sim]) lab.devices[sim]!.orcaDeviceName = '';
  }
  if (entity === 'merchant') {
    const r = Object.values(o.robots).find((x) => x.merchantConfigId === id);
    if (r) return { ok: false, error: `400 Bad Request: merchant ${(row as MerchantConfig).name} is referenced by robot ${r.name}` };
  }
  if (entity === 'capability') for (const r of Object.values(o.robots)) if (r.capabilityIds.includes(id)) r.capabilityIds = r.capabilityIds.filter((c) => c !== id);
  if (entity === 'screen') for (const l of Object.values(o.screenLocations)) if (l.screenId === id) delete o.screenLocations[l.id];
  if (entity === 'robot' && (row as OrcaRobot).checkout) return { ok: false, error: `409 Conflict: robot ${(row as OrcaRobot).name} is checked out` };
  delete table[id];
  audit(lab, actor, 'DELETE', entity, id, undefined, at);
  emitSaved(ctx, entity, id, 'delete', {}, actor);
  return { ok: true, value: undefined };
}

export function resolveNote(lab: LabState, robotId: number, noteId: number): Result {
  const r = lab.orca.robots[robotId];
  if (!r) return { ok: false, error: '404 Not Found' };
  const n = r.notes.find((x) => x.id === noteId);
  if (!n) return { ok: false, error: '404 Not Found' };
  n.resolved = true;
  return { ok: true, value: undefined };
}

/** Orca robot detail → Notes → Add note (MANUAL). */
export function addManualNote(lab: LabState, ctx: Ctx, robotId: number, text: string, actor: string): Result<number> {
  const down = orcaDown(lab);
  if (down) return { ok: false, error: down };
  const r = lab.orca.robots[robotId];
  if (!r) return { ok: false, error: '404 Not Found' };
  if (!text.trim()) return bad('text must not be blank');
  const n = addNote(lab, ctx, r, 'MANUAL', actor, `${fmtStamp(lab.time, lab.time.nowMs)} ${text.trim()} (${actor})`);
  return { ok: true, value: n.id };
}
