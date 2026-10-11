/**
 * Fault catalogue §4.3.6 (merchants, cards, Ubo) and §4.3.7 (Orka data, OCR) — core, edit-style
 * (Sim §4.1.8): applied as an NPC edit through the same Orka code path a player edit uses, so the CONFIG /
 * STATUS notes and audit rows are the real record of who changed what (`by`, backdated by `atMs`).
 */
import type { DeviceTypeCode, LabState, MerchantConfig, OrkaRobot, OrkaScreen, RobotStatus } from '../../types';
import { DEVICE_TYPE_CODES } from '../../types';
import type { CoreFaultDef, Params, Record_ } from './helpers';
import { getPath, info, list, nothing, num, ok, p, str, undoPatches } from './helpers';
import type { FaultParamInfo } from '../../api';
import { deepEqual, clone } from '../util';
import { LAYOUTS, CFD_ORKA_SCREENS } from '../../seed/layouts';
import { layoutIdFor } from '../../seed/deviceTypes';
import { FACTORY_MERCHANTS } from '../../seed/merchants';
import { factoryRobot } from '../../seed/factory';
import { gorthFileText } from '../../seed';
import { round1 } from '../../text/time';
import { audit, robotByName, setRobotStatus, STATUSES } from '../orka/status';
import { saveCardProfile, saveMerchant, saveRobot, saveScreenCompareImage } from '../orka/entities';
import { provisionDevice } from '../devices';
import { trackDataValid } from '../devices';
import { canonicalCompareMatch } from '../ocr';
import { commitRemote } from '../../devops/git';
import { screenLocationFile, screenLocationPath, truthFor } from '../../seed/repos/screenTruth';

const invalid = (id: string, name: string, v: string, reason: string) => ({ ok: false as const, error: `fault ${id}: invalid param ${name}='${v}' (${reason})` });
const byP = (d: string): FaultParamInfo => p('by', 'string', 'Who made the edit (Notes / audit)', { default: d });
const atP = (d?: number): FaultParamInfo => p('atMs', 'number', 'Game ms of the edit (default now; negative = yesterday)', d === undefined ? {} : { default: d });
const at = (lab: LabState, params: Params): number => (params.atMs === undefined || params.atMs === '' ? lab.time.nowMs : num(params.atMs, lab.time.nowMs));

/** Record a leaf the edit path already wrote (before captured by the caller). */
function rec(record: Record_, path: (string | number)[], before: unknown, after: unknown): void {
  record(path, before === undefined ? null : clone(before), after === undefined ? null : clone(after));
}

/** Run an Orka save as an edit, recording the listed robot/merchant/… fields it changed. */
function editFields<T extends object>(lab: LabState, record: Record_, base: (string | number)[], fields: (keyof T)[], save: () => void): void {
  const before = fields.map((f) => clone(getPath(lab, [...base, f as string])));
  save();
  fields.forEach((f, i) => {
    const after = getPath(lab, [...base, f as string]);
    if (!deepEqual(before[i], after)) rec(record, [...base, f as string], before[i], after);
  });
}

/**
 * Gorth is the sync source of Screen Locations (Sim §3.22.3): stale / missing Orka rows came from stale /
 * missing `config/screen-locations/<TYPE>/<SCREEN>.json` files, so the same edit lands on gorth `main` as
 * one commit (no Orka re-sync — Orka already holds it). This is what makes GP INC20/INC21's fix a real
 * coordinate PR for Jaden. Recorded as undo patches (branch pointer + file texts).
 */
function gorthScreenCommit(lab: LabState, record: Record_, changes: Record<string, string | null>, by: string, message: string, atMs: number): void {
  const repo = lab.repos['gorth'];
  if (!repo || !Object.keys(changes).length) return;
  const branch = repo.defaultBranch;
  const beforeSha = repo.branches[branch] ?? null;
  const beforeFiles = Object.fromEntries(Object.keys(changes).map((k) => [k, repo.files[k] ?? null]));
  const sha = commitRemote(lab, 'gorth', branch, changes, message, by, atMs);
  record(['repos', 'gorth', 'branches', branch], beforeSha, sha);
  for (const k of Object.keys(changes)) record(['repos', 'gorth', 'files', k], beforeFiles[k], changes[k]);
}

/** Gorth file text for an Orka screen row as it now stands (truth's button order). */
function gorthFileFromOrka(lab: LabState, type: string, screen: string): string | null {
  const scr = Object.values(lab.orka.screens).find((s) => s.deviceType === type && s.name === screen);
  const truth = truthFor(type, screen);
  if (!scr || !truth) return null;
  const locs = Object.values(lab.orka.screenLocations).filter((l) => l.screenId === scr.id);
  const buttons: Record<string, { x: number; y: number }> = {};
  for (const name of Object.keys(truth)) {
    const l = locs.find((x) => x.button === name);
    if (l) buttons[name] = { x: l.xMm, y: l.yMm };
  }
  return screenLocationFile(type, screen, buttons);
}

const merchantByName = (lab: LabState, name: string): MerchantConfig | undefined => Object.values(lab.orka.merchants).find((m) => m.name === name);
const factoryMerchantByName = (name: string): MerchantConfig | undefined => Object.values(FACTORY_MERCHANTS).find((m) => m.name === name);

/* ────────────────────────────── firmware truth (Sim §2.10.2) ────────────────────────────── */

/** Firmware button centres of an Orka screen for a Device Type (the truth Jaden reviews against). */
export function firmwareTruth(type: DeviceTypeCode, screen: string): { button: string; x: number; y: number }[] | null {
  const secondary = screen.startsWith('CFD_');
  const table = secondary ? CFD_ORKA_SCREENS[screen] : screen;
  if (!table) return null;
  const els = LAYOUTS[layoutIdFor(type, secondary ? 'secondary' : 'primary')].screens[table];
  if (!els) return null;
  const out: { button: string; x: number; y: number }[] = [];
  for (const e of els) {
    if (e.kind !== 'button') continue;
    out.push({ button: e.id, x: e.x, y: e.y });
    if (screen === 'HOME' && e.id === 'App Market') out.push({ button: 'LabSim Dining', x: e.x, y: e.y });
  }
  return out;
}

/** Every location of Orka screen (type, screen) is within ±0.5 mm of firmware truth. */
function locationsTrue(lab: LabState, type: string, screen: string, requireRow: boolean): boolean {
  const scr = Object.values(lab.orka.screens).find((s) => s.deviceType === type && s.name === screen);
  if (!scr) return !requireRow;
  const truth = firmwareTruth(type as DeviceTypeCode, screen) ?? [];
  const locs = Object.values(lab.orka.screenLocations).filter((l) => l.screenId === scr.id);
  for (const l of locs) {
    const t = truth.find((b) => b.button === l.button);
    if (t && (Math.abs(l.xMm - t.x) > 0.5 + 1e-9 || Math.abs(l.yMm - t.y) > 0.5 + 1e-9)) return false;
  }
  if (requireRow) for (const t of truth) if (!locs.some((l) => l.button === t.button)) return false;
  return true;
}

/** OCR predicate shared by ocr.* (Sim §4.3.7): every compare row of the robot matches on the canonical frame. */
function robotComparesMatch(lab: LabState, robotId: number): boolean {
  return Object.values(lab.orka.screenCompareImages)
    .filter((c) => c.robotId === robotId)
    .every((c) => canonicalCompareMatch(lab, c));
}

/** Orka robot owning a runtime device (by row `simDeviceId`). */
function robotOfDevice(lab: LabState, deviceId: string): OrkaRobot | undefined {
  const rowIds = Object.values(lab.orka.devices).filter((d) => d.simDeviceId === deviceId).map((d) => d.id);
  return Object.values(lab.orka.robots).find((r) => rowIds.includes(r.deviceId ?? -1) || rowIds.includes(r.mfdDeviceId ?? -1) || rowIds.includes(r.cfdDeviceId ?? -1));
}

const URL_FIELDS: Record<string, 'adbServiceUrl' | 'cameraStreamUrl' | 'dipUrl' | 'tapUrl' | 'swipeUrl'> = { adb: 'adbServiceUrl', camera: 'cameraStreamUrl', dip: 'dipUrl', tap: 'tapUrl', swipe: 'swipeUrl' };

/* ────────────────────────────── §4.3.6 merchants, cards, Ubo ────────────────────────────── */

const MERCHANT_FAULTS: CoreFaultDef[] = [
  {
    info: info('merchant.credentialBlank', 'Go SDK credential blank', 'merchants', [p('merchant', 'merchant', 'Merchant Config name', { target: true, default: 'GO-SDK-US-01' }), p('field', 'string', 'Credential field blanked', { default: 'apiKey', values: ['appId', 'appSecret', 'apiKey'] }), byP('nate'), atP()], {
      tags: ['go.sdk', 'orka.merchant', 'jenkins.envvars'],
      clears: '<field> equals its factory value (§2.8)',
      symptoms: ['[env] APP_ID=app_sim_7f3a APP_SECRET=**** API_KEY=', 'panic: Terminal SDK: missing credential API_KEY (env var empty) → MISSING_CREDENTIAL', 'Edit dialog shows the field blank'],
      usedBy: ['INC51', 'M08'],
    }),
    validate(lab, params) {
      const m = merchantByName(lab, str(params.merchant));
      if (!m) return invalid('merchant.credentialBlank', 'merchant', str(params.merchant), 'no such merchant');
      const f = str(params.field) || 'apiKey';
      if (!['appId', 'appSecret', 'apiKey'].includes(f)) return invalid('merchant.credentialBlank', 'field', f, 'not one of appId, appSecret, apiKey');
      if (!m[f as 'apiKey']) return nothing('merchant.credentialBlank', `${m.name} ${f} is already blank`);
      return ok(m.name);
    },
    apply(lab, ctx, params, record) {
      const m = merchantByName(lab, str(params.merchant))!;
      const f = (str(params.field) || 'apiKey') as 'appId' | 'appSecret' | 'apiKey';
      editFields<MerchantConfig>(lab, record, ['orka', 'merchants', m.id], [f], () => saveMerchant(lab, ctx, { id: m.id, [f]: null }, str(params.by) || 'nate', { atMs: at(lab, params), force: true }));
    },
    isResolved(lab, fault) {
      const m = merchantByName(lab, fault.target);
      const fm = factoryMerchantByName(fault.target);
      const f = (str(fault.params.field) || 'apiKey') as 'appId' | 'appSecret' | 'apiKey';
      return !!m && !!fm && m[f] === fm[f];
    },
  },
  {
    info: info('merchant.uboRouteWrong', 'Wrong Ubo route', 'merchants', [p('merchant', 'merchant', 'Merchant Config name', { target: true, default: 'WESTERLY-CA-02' }), p('route', 'string', 'Ubo route written', { default: 'us-east', values: ['us-east', 'ca-central'] }), byP('alex'), atP()], {
      tags: ['lazo.oobe', 'ubo.routing', 'orka.merchant'],
      clears: 'uboRoute equals factory',
      symptoms: ['ubo: routing merchant switch → WESTERLY-CA-02', 'ubo: ERROR route us-east cannot resolve merchant WESTERLY-CA-02 → FAILURE, Lazo never de-provisions'],
      usedBy: ['INC50'],
    }),
    validate(lab, params) {
      const m = merchantByName(lab, str(params.merchant));
      if (!m) return invalid('merchant.uboRouteWrong', 'merchant', str(params.merchant), 'no such merchant');
      const r = str(params.route) || 'us-east';
      if (!lab.ubo.routes[r]) return invalid('merchant.uboRouteWrong', 'route', r, `not one of ${Object.keys(lab.ubo.routes).sort().join(', ')}`);
      if (m.uboRoute === r) return nothing('merchant.uboRouteWrong', `${m.name} already routes via ${r}`);
      return ok(m.name);
    },
    apply(lab, ctx, params, record) {
      const m = merchantByName(lab, str(params.merchant))!;
      editFields<MerchantConfig>(lab, record, ['orka', 'merchants', m.id], ['uboRoute'], () => saveMerchant(lab, ctx, { id: m.id, uboRoute: str(params.route) || 'us-east' }, str(params.by) || 'alex', { atMs: at(lab, params), force: true }));
    },
    isResolved: (lab, f) => merchantByName(lab, f.target)?.uboRoute === factoryMerchantByName(f.target)?.uboRoute,
  },
  {
    info: info('merchant.overwritten', "Specialised rig's merchant overwritten", 'merchants', [p('robot', 'robot', 'Robot whose device(s) were swapped', { required: true, target: true, example: 'rosie' }), p('merchant', 'merchant', 'Merchant the device(s) now hold', { default: 'AUTO-US-NOPIN-01' })], {
      tags: ['orka.status.unavailable', 'lazo.oobe', 'orka.merchant'],
      clears: 'device merchant == robot.merchantConfigId',
      symptoms: ['[paycrest] merchant mismatch: expected PAYCREST-STANDALONE-01, got AUTO-US-NOPIN-01 → MERCHANT_MISMATCH', 'camera shows the generic Register app'],
      usedBy: ['INC40'],
    }),
    validate(lab, params) {
      const robot = robotByName(lab, str(params.robot));
      if (!robot) return invalid('merchant.overwritten', 'robot', str(params.robot), 'no such robot');
      const m = merchantByName(lab, str(params.merchant) || 'AUTO-US-NOPIN-01');
      if (!m) return invalid('merchant.overwritten', 'merchant', str(params.merchant), 'no such merchant');
      const devs = robotDevices(lab, robot);
      if (!devs.length) return invalid('merchant.overwritten', 'robot', robot.name, 'no runtime device');
      if (devs.every((d) => lab.devices[d]!.merchantConfigId === m.id)) return nothing('merchant.overwritten', `${robot.name} already holds ${m.name}`);
      return ok(robot.name);
    },
    apply(lab, ctx, params, record) {
      const robot = robotByName(lab, str(params.robot))!;
      const m = merchantByName(lab, str(params.merchant) || 'AUTO-US-NOPIN-01')!;
      for (const id of robotDevices(lab, robot)) {
        const d = lab.devices[id]!;
        const fields = ['merchantConfigId', 'provisioned', 'apps', 'launcher', 'adbTcpPort'] as const;
        const before = fields.map((f) => clone(d[f]));
        provisionDevice(lab, ctx, d, m.id, false);
        if (d.adbTcpPort !== 5444) d.adbTcpPort = 5444;
        fields.forEach((f, i) => {
          if (!deepEqual(before[i], d[f])) rec(record, ['devices', id, f], before[i], d[f]);
        });
      }
    },
    isResolved(lab, f) {
      const robot = robotByName(lab, f.target);
      if (!robot) return false;
      const devs = robotDevices(lab, robot);
      return devs.length > 0 && devs.every((d) => lab.devices[d]!.merchantConfigId === robot.merchantConfigId);
    },
  },
  {
    info: info('ubo.routeDown', 'Ubo route outage', 'merchants', [p('route', 'string', 'Ubo route', { required: true, target: true, example: 'ca-central', values: ['us-east', 'ca-central'] })], {
      tags: ['ubo.routing'],
      clears: 'API only (platform outage)',
      symptoms: ['ubo: ERROR route ca-central unavailable (503)'],
      usedBy: ['FP'],
      apiOnly: true,
    }),
    validate(lab, params) {
      const r = lab.ubo.routes[str(params.route)];
      if (!r) return invalid('ubo.routeDown', 'route', str(params.route), `not one of ${Object.keys(lab.ubo.routes).sort().join(', ')}`);
      if (!r.up) return nothing('ubo.routeDown', `${str(params.route)} is already down`);
      return ok(str(params.route));
    },
    apply(lab, _ctx, params, record) {
      rec(record, ['ubo', 'routes', str(params.route), 'up'], true, false);
      lab.ubo.routes[str(params.route)]!.up = false;
    },
    isResolved: () => false,
  },
  {
    info: info('card.gorthPathWrong', 'Card profile points at an old path', 'cards', [p('profile', 'cardProfile', 'Card Profile name (DIP/TAP)', { target: true, default: 'VISA_STD_DIP' }), p('path', 'repoPath', 'Gorth path written', { default: 'cards/visa/visa_std_dip.json' }), byP('riley'), atP()], {
      tags: ['cards.diptap', 'cards.kallus', 'tools.github', 'arch.repos'],
      clears: 'gorthPath names a file present on gorth main whose "profile" equals the profile\'s name',
      symptoms: ['[kallus] map cards/visa/visa_std_dip.json → C:\\gorth\\cards\\visa\\visa_std_dip.json · FileNotFoundException (The system cannot find the path specified)'],
      usedBy: ['INC53'],
    }),
    validate(lab, params) {
      const c = Object.values(lab.orka.cardProfiles).find((x) => x.name === str(params.profile));
      if (!c) return invalid('card.gorthPathWrong', 'profile', str(params.profile), 'no such cardProfile');
      if (c.entry === 'SWIPE') return invalid('card.gorthPathWrong', 'profile', c.name, 'a SWIPE profile stores Track Data');
      const path = str(params.path) || 'cards/visa/visa_std_dip.json';
      if (c.gorthPath === path) return nothing('card.gorthPathWrong', `${c.name} already points at ${path}`);
      return ok(c.name);
    },
    apply(lab, ctx, params, record) {
      const c = Object.values(lab.orka.cardProfiles).find((x) => x.name === str(params.profile))!;
      editFields(lab, record, ['orka', 'cardProfiles', c.id], ['gorthPath'], () => saveCardProfile(lab, ctx, { id: c.id, gorthPath: str(params.path) || 'cards/visa/visa_std_dip.json' }, str(params.by) || 'riley', { atMs: at(lab, params), force: true }));
    },
    isResolved(lab, f) {
      const c = Object.values(lab.orka.cardProfiles).find((x) => x.name === f.target);
      if (!c?.gorthPath) return false;
      const text = lab.repos?.gorth?.files ? lab.repos.gorth.files[c.gorthPath] : gorthFileText(lab, c.gorthPath);
      if (typeof text !== 'string') return false;
      try {
        return (JSON.parse(text) as { profile?: unknown }).profile === c.name;
      } catch {
        return false;
      }
    },
  },
  {
    info: info('card.trackDataCorrupt', 'Swipe Track Data corrupted', 'cards', [p('profile', 'cardProfile', 'Card Profile name (SWIPE)', { target: true, default: 'VISA_STD_SWIPE' }), p('trackData', 'string', 'Track Data written', { default: '%B4111111111111111^SIM/VISA^301210' }), byP('riley'), atP()], {
      tags: ['cards.swipe', 'cards.philosophy'],
      clears: "trackData passes the §3.6 validation with the profile's pan",
      symptoms: ['Kallus swipe OK, then [device] SWIPE_ERROR: invalid track data', 'probe LED green'],
      usedBy: ['INC55'],
    }),
    validate(lab, params) {
      const c = Object.values(lab.orka.cardProfiles).find((x) => x.name === str(params.profile));
      if (!c) return invalid('card.trackDataCorrupt', 'profile', str(params.profile), 'no such cardProfile');
      if (c.entry !== 'SWIPE') return invalid('card.trackDataCorrupt', 'profile', c.name, 'not a SWIPE profile');
      if (!trackValidFor(c.trackData, c.pan)) return nothing('card.trackDataCorrupt', `${c.name} Track Data is already invalid`);
      return ok(c.name);
    },
    apply(lab, ctx, params, record) {
      const c = Object.values(lab.orka.cardProfiles).find((x) => x.name === str(params.profile))!;
      const t = params.trackData === undefined ? '%B4111111111111111^SIM/VISA^301210' : str(params.trackData);
      editFields(lab, record, ['orka', 'cardProfiles', c.id], ['trackData'], () => saveCardProfile(lab, ctx, { id: c.id, trackData: t }, str(params.by) || 'riley', { atMs: at(lab, params), force: true }));
    },
    isResolved(lab, f) {
      const c = Object.values(lab.orka.cardProfiles).find((x) => x.name === f.target);
      return !!c && trackValidFor(c.trackData, c.pan);
    },
  },
];

/** Track data valid (Sim §3.6) and carrying the profile's PAN. */
function trackValidFor(track: string | null, pan: string): boolean {
  if (!trackDataValid(track)) return false;
  const m = /^%B(\d{12,19})\^/.exec(track ?? '');
  return !!m && m[1] === pan;
}

/** Runtime device ids of a robot's Robot Device / MFD / CFD rows. */
function robotDevices(lab: LabState, robot: OrkaRobot): string[] {
  const out: string[] = [];
  for (const id of [robot.deviceId, robot.mfdDeviceId, robot.cfdDeviceId]) {
    const sim = id != null ? lab.orka.devices[id]?.simDeviceId : null;
    if (sim && lab.devices[sim] && !out.includes(sim)) out.push(sim);
  }
  return out;
}

/* ────────────────────────────── §4.3.7 Orka data ────────────────────────────── */

/** A robot edit fault: validate the robot, write `fields` through saveRobot as `by`. */
function robotEdit(
  id: string,
  title: string,
  params: FaultParamInfo[],
  meta: { tags: string[]; usedBy: string[]; symptoms: string[]; clears: string; by: string },
  check: (lab: LabState, robot: OrkaRobot, params: Params) => string | null,
  patch: (lab: LabState, robot: OrkaRobot, params: Params) => Partial<OrkaRobot>,
  resolved: (lab: LabState, robot: OrkaRobot, factory: OrkaRobot | undefined) => boolean,
): CoreFaultDef {
  return {
    info: info(id, title, 'orka', [...params, byP(meta.by), atP()], { tags: meta.tags, usedBy: meta.usedBy, symptoms: meta.symptoms, clears: meta.clears }),
    validate(lab, ps) {
      const robot = robotByName(lab, str(ps.robot));
      if (!robot) return invalid(id, 'robot', str(ps.robot), 'no such robot');
      const why = check(lab, robot, ps);
      if (why?.startsWith('invalid:')) return { ok: false, error: `fault ${id}: ${why.slice(8)}` };
      if (why) return nothing(id, why);
      return ok(robot.name);
    },
    apply(lab, ctx, ps, record) {
      const robot = robotByName(lab, str(ps.robot))!;
      const change = patch(lab, robot, ps);
      editFields<OrkaRobot>(lab, record, ['orka', 'robots', robot.id], Object.keys(change) as (keyof OrkaRobot)[], () => saveRobot(lab, ctx, { id: robot.id, ...change }, str(ps.by) || meta.by, { atMs: at(lab, ps), force: true }));
    },
    isResolved(lab, f) {
      const robot = robotByName(lab, f.target) ?? Object.values(lab.orka.robots).find((r) => factoryRobot(r.id)?.name === f.target);
      return !!robot && resolved(lab, robot, factoryRobot(robot.id));
    },
  };
}

const robotP = (example: string, def?: string): FaultParamInfo => p('robot', 'robot', 'Robot Name', def ? { target: true, default: def } : { required: true, target: true, example });

const ORKA_FAULTS: CoreFaultDef[] = [
  robotEdit(
    'orka.offsets',
    'Legacy offsets left on a robot',
    [robotP('bumblebee'), p('xMm', 'number', 'Offset X (mm)', { default: 0.0 }), p('yMm', 'number', 'Offset Y (mm)', { default: 1.5 })],
    { tags: ['orka.offsets', 'orka.screens', 'hw.motion'], usedBy: ['INC14', 'M07'], symptoms: ['every PHYSICAL_TAP lands at location + offsets', 'MICRO_3 icons still hit, PAYMENT/Charge (core 1.2) misses', '[orka] xy_touch bumblebee PAYMENT/Charge → PHYSICAL_TAP (31.0, 90.5) (offsets +0.0/+1.5)'], clears: 'offsetXMm == 0 && offsetYMm == 0', by: 'bulk-import' },
    (_lab, robot, ps) => {
      const x = num(ps.xMm, 0);
      const y = num(ps.yMm, 1.5);
      if (Number.isNaN(x)) return `invalid:invalid param xMm='${str(ps.xMm)}' (not a number)`;
      if (Number.isNaN(y)) return `invalid:invalid param yMm='${str(ps.yMm)}' (not a number)`;
      if (x === 0 && y === 0) return 'offsets of 0.0/0.0 break nothing';
      return robot.offsetXMm !== 0 || robot.offsetYMm !== 0 ? `${robot.name} already has offsets` : null;
    },
    (_lab, _r, ps) => ({ offsetXMm: round1(num(ps.xMm, 0)), offsetYMm: round1(num(ps.yMm, 1.5)) }),
    (_lab, r) => r.offsetXMm === 0 && r.offsetYMm === 0,
  ),
  robotEdit(
    'orka.hrnTypo',
    'Human Readable Name typo',
    [robotP('johnny-5'), p('hrn', 'string', 'HRN written', { default: 'JONNY-5' })],
    { tags: ['orka.names', 'hw.tablet'], usedBy: ['INC63', 'M07', 'P2-2'], symptoms: ['tablet header JONNY-5 (≤ 2 s after save when reachable)'], clears: 'humanReadableName equals the factory HRN', by: 'alex' },
    (_lab, robot, ps) => {
      const hrn = str(ps.hrn) || 'JONNY-5';
      return robot.humanReadableName === hrn ? `${robot.name} HRN is already ${hrn}` : null;
    },
    (_lab, _r, ps) => ({ humanReadableName: str(ps.hrn) || 'JONNY-5' }),
    (_lab, r, f) => !!f && r.humanReadableName === f.humanReadableName,
  ),
  robotEdit(
    'orka.urlWrong',
    'URL mapping wrong / blank',
    [robotP('johnny-5'), p('field', 'string', 'URL field', { default: 'tap', values: ['adb', 'camera', 'dip', 'tap', 'swipe'] }), p('value', 'string', 'URL written', { default: '' })],
    { tags: ['orka.urls', 'cards.diptap', 'vision.camera'], usedBy: ['INC65', 'INC09', 'M07'], symptoms: ['tap empty: [orka] 400 Bad Request: robot johnny-5 has no Tap URL', "camera = another rig's URL: OCR reads that rig's screen", 'adb wrong host: health check pings the wrong Pi'], clears: 'field equals factory value', by: 'alex' },
    (_lab, robot, ps) => {
      const f = str(ps.field) || 'tap';
      const key = URL_FIELDS[f];
      if (!key) return `invalid:invalid param field='${f}' (not one of adb, camera, dip, tap, swipe)`;
      const v = ps.value === undefined ? '' : str(ps.value);
      return (robot[key] ?? '') === v ? `${robot.name} ${f} URL is already '${v}'` : null;
    },
    (_lab, _r, ps) => ({ [URL_FIELDS[str(ps.field) || 'tap']!]: ps.value === undefined ? '' : str(ps.value) }),
    (_lab, r, f) => {
      if (!f) return false;
      return Object.values(URL_FIELDS).every((k) => (r[k] ?? '') === (f[k] ?? ''));
    },
  ),
  robotEdit(
    'orka.tetherCleared',
    'MFD/CFD relations cleared',
    [robotP('optimus', 'optimus')],
    { tags: ['orka.tethered', 'uia.multidevice'], usedBy: ['INC45', 'M07'], symptoms: ['[env] RUN_TYPE=standalone', '[runner] MFD relation empty → standalone', 'AssertionError: TaxTest requires a tethered rig (MFD/CFD) → TETHER_REQUIRED'], clears: 'both equal factory', by: 'alex' },
    (_lab, robot) => (robot.mfdDeviceId == null && robot.cfdDeviceId == null ? `${robot.name} has no MFD/CFD relations` : null),
    () => ({ mfdDeviceId: null, cfdDeviceId: null }),
    (_lab, r, f) => !!f && r.mfdDeviceId === f.mfdDeviceId && r.cfdDeviceId === f.cfdDeviceId,
  ),
  robotEdit(
    'orka.tetherCloned',
    'Relations copied from another rig',
    [robotP('tars', 'tars'), p('from', 'robot', 'Robot whose MFD/CFD were copied', { default: 'optimus' })],
    { tags: ['orka.tethered'], usedBy: ['INC46'], symptoms: ['[runner] Tethered rig detected (MFD populated) → MFD 10.42.30.23:5444, CFD 10.42.30.24:5444', "the other rig's devices move during the job"], clears: 'both equal factory (null for standalone rigs)', by: 'alex' },
    (lab, robot, ps) => {
      const from = robotByName(lab, str(ps.from) || 'optimus');
      if (!from) return `invalid:invalid param from='${str(ps.from)}' (no such robot)`;
      if (from.mfdDeviceId == null) return `invalid:invalid param from='${from.name}' (not a tethered robot)`;
      return robot.mfdDeviceId === from.mfdDeviceId && robot.cfdDeviceId === from.cfdDeviceId ? `${robot.name} already has ${from.name}'s relations` : null;
    },
    (lab, _r, ps) => {
      const from = robotByName(lab, str(ps.from) || 'optimus')!;
      return { mfdDeviceId: from.mfdDeviceId, cfdDeviceId: from.cfdDeviceId };
    },
    (_lab, r, f) => !!f && r.mfdDeviceId === f.mfdDeviceId && r.cfdDeviceId === f.cfdDeviceId,
  ),
  {
    info: info(
      'orka.screenLocationShift',
      'Stale coordinates for a screen',
      'orka',
      [p('deviceTypes', 'list', 'Device Types whose rows are stale', { required: true, target: true, default: ['FLUX_3', 'MICRO_3', 'STAND_2018'], values: [...DEVICE_TYPE_CODES] }), p('screen', 'string', 'Orka screen', { default: 'RECEIPT_OPTIONS_5' }), p('dxMm', 'number', 'Shift X (mm)', { default: 0.0 }), p('dyMm', 'number', 'Shift Y (mm)', { default: -3.0 }), byP('bulk-import'), atP()],
      {
        tags: ['receipt.qr', 'receipt.maps', 'orka.screens', 'jenkins.logs'],
        clears: 'every location of those rows within ±0.5 mm of firmware truth (§2.10.2)',
        symptoms: ['PHYSICAL_TAPs miss every row (error 3.0 > core 1.0)', 'LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s → FAILED at "select print"', 'camera: plunger ~3 mm above Print'],
        usedBy: ['INC20', 'P3-2'],
      },
    ),
    randomPools: { deviceTypes: ['FLUX_3', 'MICRO_3', 'STAND_2018'] },
    validate(lab, params) {
      const types = list(params.deviceTypes);
      const screen = str(params.screen) || 'RECEIPT_OPTIONS_5';
      if (!types.length) return invalid('orka.screenLocationShift', 'deviceTypes', '', 'missing');
      for (const t of types) {
        if (!(DEVICE_TYPE_CODES as readonly string[]).includes(t)) return invalid('orka.screenLocationShift', 'deviceTypes', t, `not one of ${DEVICE_TYPE_CODES.join(', ')}`);
        if (!screenRow(lab, t, screen)) return invalid('orka.screenLocationShift', 'screen', screen, `no such screen for ${t}`);
      }
      if (num(params.dxMm, 0) === 0 && num(params.dyMm, -3) === 0) return nothing('orka.screenLocationShift', 'a 0.0/0.0 shift moves nothing');
      if (types.every((t) => !locationsTrue(lab, t, screen, false))) return nothing('orka.screenLocationShift', `${types.join(', ')} ${screen} rows are already off`);
      return ok(types.join(','));
    },
    apply(lab, _ctx, params, record) {
      const screen = str(params.screen) || 'RECEIPT_OPTIONS_5';
      const dx = num(params.dxMm, 0);
      const dy = num(params.dyMm, -3);
      const by = str(params.by) || 'bulk-import';
      const when = at(lab, params);
      for (const t of list(params.deviceTypes)) {
        const scr = screenRow(lab, t, screen)!;
        for (const l of Object.values(lab.orka.screenLocations).filter((x) => x.screenId === scr.id).sort((a, b) => a.id - b.id)) {
          const x = round1(l.xMm + dx);
          const y = round1(l.yMm + dy);
          rec(record, ['orka', 'screenLocations', l.id, 'xMm'], l.xMm, x);
          rec(record, ['orka', 'screenLocations', l.id, 'yMm'], l.yMm, y);
          audit(lab, by, 'UPDATE', 'screenLocation', l.id, { xMm: [l.xMm, x], yMm: [l.yMm, y] }, when);
          l.xMm = x;
          l.yMm = y;
        }
      }
      const changes: Record<string, string> = {};
      for (const t of list(params.deviceTypes)) {
        const path = screenLocationPath(t, screen);
        const text = gorthFileFromOrka(lab, t, screen);
        if (text && lab.repos['gorth']?.files[path] !== undefined && lab.repos['gorth']!.files[path] !== text) changes[path] = text;
      }
      gorthScreenCommit(lab, record, changes, by, `Screen locations: ${screen} for ${list(params.deviceTypes).join(', ')} (measured on the pre-release build)`, when);
    },
    isResolved(lab, f) {
      const screen = str(f.params.screen) || 'RECEIPT_OPTIONS_5';
      return list(f.params.deviceTypes).every((t) => locationsTrue(lab, t, screen, false));
    },
  },
  {
    info: info('orka.screenLocationTypo', 'One wrong coordinate', 'orka', [p('deviceType', 'deviceType', 'Device Type', { target: true, default: 'FLUX_1', values: [...DEVICE_TYPE_CODES] }), p('screen', 'string', 'Orka screen', { default: 'RECEIPT_OPTIONS_4' }), p('button', 'string', 'Button', { default: 'Print' }), p('xMm', 'number', 'X written (default unchanged)'), p('yMm', 'number', 'Y written', { default: 62.5 }), byP('bulk-import'), atP(-28_200_000)], {
      tags: ['jenkins.logs', 'parrot.lstr', 'orka.screens'],
      clears: 'within ±0.5 mm of truth',
      symptoms: ['probe lands in the gap above Print → select print timeout', 'printer fine'],
      usedBy: ['INC22'],
    }),
    validate(lab, params) {
      const t = str(params.deviceType) || 'FLUX_1';
      const screen = str(params.screen) || 'RECEIPT_OPTIONS_4';
      const button = str(params.button) || 'Print';
      const scr = screenRow(lab, t, screen);
      if (!scr) return invalid('orka.screenLocationTypo', 'screen', screen, `no such screen for ${t}`);
      const l = Object.values(lab.orka.screenLocations).find((x) => x.screenId === scr.id && x.button === button);
      if (!l) return invalid('orka.screenLocationTypo', 'button', button, `no such location on ${t}/${screen}`);
      const x = params.xMm === undefined || params.xMm === '' ? l.xMm : num(params.xMm, l.xMm);
      const y = params.yMm === undefined || params.yMm === '' ? 62.5 : num(params.yMm, 62.5);
      if (Number.isNaN(x)) return invalid('orka.screenLocationTypo', 'xMm', str(params.xMm), 'not a number');
      if (Number.isNaN(y)) return invalid('orka.screenLocationTypo', 'yMm', str(params.yMm), 'not a number');
      if (round1(x) === l.xMm && round1(y) === l.yMm) return nothing('orka.screenLocationTypo', `${button} already at (${l.xMm}, ${l.yMm})`);
      return ok(t);
    },
    apply(lab, _ctx, params, record) {
      const t = str(params.deviceType) || 'FLUX_1';
      const scr = screenRow(lab, t, str(params.screen) || 'RECEIPT_OPTIONS_4')!;
      const l = Object.values(lab.orka.screenLocations).find((x) => x.screenId === scr.id && x.button === (str(params.button) || 'Print'))!;
      const x = round1(params.xMm === undefined || params.xMm === '' ? l.xMm : num(params.xMm, l.xMm));
      const y = round1(params.yMm === undefined || params.yMm === '' ? 62.5 : num(params.yMm, 62.5));
      rec(record, ['orka', 'screenLocations', l.id, 'xMm'], l.xMm, x);
      rec(record, ['orka', 'screenLocations', l.id, 'yMm'], l.yMm, y);
      audit(lab, str(params.by) || 'bulk-import', 'UPDATE', 'screenLocation', l.id, { xMm: [l.xMm, x], yMm: [l.yMm, y] }, at(lab, params));
      l.xMm = x;
      l.yMm = y;
    },
    isResolved: (lab, f) => locationsTrue(lab, f.target, str(f.params.screen) || 'RECEIPT_OPTIONS_4', false),
  },
  {
    info: info('orka.missingReceiptMap', 'Receipt map missing', 'orka', [p('deviceType', 'deviceType', 'Device Type', { required: true, target: true, example: 'STAND_2018', values: [...DEVICE_TYPE_CODES] }), p('screen', 'string', 'Orka screen', { default: 'RECEIPT_OPTIONS_5' }), byP('bulk-import'), atP()], {
      tags: ['receipt.maps', 'orka.screens', 'orka.devicetype'],
      clears: 'a row (type, screen) exists and every firmware button of that screen has a location within ±0.5 mm',
      symptoms: ['[orka] 404 Not Found: no Screen Location for (STAND_2018, RECEIPT_OPTIONS_5, "Email") → FAILED at "select email"', 'Orka Screens lists only _4 for the type'],
      usedBy: ['INC21', 'M09', 'P2-3'],
    }),
    randomPools: { deviceType: ['FLUX_3', 'FLUX_4', 'MICRO_3', 'STAND_2018'] },
    validate(lab, params) {
      const t = str(params.deviceType);
      if (!(DEVICE_TYPE_CODES as readonly string[]).includes(t)) return invalid('orka.missingReceiptMap', 'deviceType', t, `not one of ${DEVICE_TYPE_CODES.join(', ')}`);
      const screen = str(params.screen) || 'RECEIPT_OPTIONS_5';
      if (!screenRow(lab, t, screen)) return nothing('orka.missingReceiptMap', `no ${t} ${screen} row`);
      return ok(t);
    },
    apply(lab, _ctx, params, record) {
      const t = str(params.deviceType);
      const scr = screenRow(lab, t, str(params.screen) || 'RECEIPT_OPTIONS_5')!;
      const by = str(params.by) || 'bulk-import';
      const when = at(lab, params);
      for (const l of Object.values(lab.orka.screenLocations).filter((x) => x.screenId === scr.id).sort((a, b) => a.id - b.id)) {
        rec(record, ['orka', 'screenLocations', l.id], l, null);
        delete lab.orka.screenLocations[l.id];
        audit(lab, by, 'DELETE', 'screenLocation', l.id, undefined, when);
      }
      rec(record, ['orka', 'screens', scr.id], scr, null);
      delete lab.orka.screens[scr.id];
      audit(lab, by, 'DELETE', 'screen', scr.id, undefined, when);
      // Orka rows only (Sim §4.3.7). Scenarios that also want the gorth file gone add `repo.deleteFile`
      // (M09, P2-3); INC21 leaves gorth's file in place (the bulk import dropped only Orka's rows).
    },
    isResolved: (lab, f) => !!screenRow(lab, f.target, str(f.params.screen) || 'RECEIPT_OPTIONS_5') && locationsTrue(lab, f.target, str(f.params.screen) || 'RECEIPT_OPTIONS_5', true),
    revert(lab, _ctx, f) {
      // Restore the deleted rows only if nobody re-created (type, screen) meanwhile (e.g. a gorth sync).
      if (screenRow(lab, f.target, str(f.params.screen) || 'RECEIPT_OPTIONS_5')) return;
      undoPatches(lab, f);
    },
  },
  {
    info: info('orka.statusOverride', 'Someone changed a status', 'orka', [robotP('rosie'), p('status', 'string', 'Status set', { required: true, values: ['AVAILABLE', 'UNAVAILABLE', 'OFFLINE', 'RESERVED'] }), byP('alex'), atP()], {
      tags: ['orka.status', 'orka.status.unavailable', 'orka.status.offline'],
      clears: 'status equals the before recorded in undo',
      symptoms: ['a PayCrest rig set Available is taken by general pipelines and swapped by Lazo', 'a rig under rebuild set Available goes Connection Failed at the next check'],
      usedBy: ['INC07', 'INC40'],
    }),
    validate(lab, params) {
      const robot = robotByName(lab, str(params.robot));
      if (!robot) return invalid('orka.statusOverride', 'robot', str(params.robot), 'no such robot');
      const s = str(params.status);
      if (!s) return invalid('orka.statusOverride', 'status', '', 'missing');
      if (!STATUSES.includes(s as RobotStatus) || s === 'CONNECTION_FAILED') return invalid('orka.statusOverride', 'status', s, 'not one of AVAILABLE, UNAVAILABLE, OFFLINE, RESERVED');
      if (robot.status === s) return nothing('orka.statusOverride', `${robot.name} is already ${s}`);
      return ok(robot.name);
    },
    apply(lab, ctx, params, record) {
      const robot = robotByName(lab, str(params.robot))!;
      const fields = ['status', 'reservedBy', 'reservedAtMs', 'preFailureStatus'] as const;
      editFields<OrkaRobot>(lab, record, ['orka', 'robots', robot.id], [...fields], () => setRobotStatus(lab, ctx, robot.id, str(params.status), str(params.by) || 'alex', undefined, at(lab, params), true));
    },
    isResolved(lab, f) {
      const robot = robotByName(lab, f.target);
      const u = f.undo.find((x) => x.path[x.path.length - 1] === 'status');
      return !!robot && !!u && robot.status === u.before;
    },
  },
  {
    info: info('orka.staleReservation', 'Forgotten reservation', 'orka', [robotP('eve', 'eve'), byP('riley'), atP(-22_680_000)], {
      tags: ['orka.status.reserved', 'jenkins.checkout'],
      clears: "status != 'RESERVED'",
      symptoms: ['[orka] candidate eve: Reserved — skipped', '[orka] no Available FLUX_4 robot — build waiting in queue', 'health log eve  RESERVED — not overridden'],
      usedBy: ['INC48'],
    }),
    validate(lab, params) {
      const robot = robotByName(lab, str(params.robot) || 'eve');
      if (!robot) return invalid('orka.staleReservation', 'robot', str(params.robot), 'no such robot');
      if (robot.status === 'RESERVED') return nothing('orka.staleReservation', `${robot.name} is already Reserved (${robot.reservedBy ?? '?'})`);
      return ok(robot.name);
    },
    apply(lab, ctx, params, record) {
      const robot = robotByName(lab, str(params.robot) || 'eve')!;
      const when = params.atMs === undefined ? -22_680_000 : num(params.atMs, -22_680_000);
      const fields = ['status', 'reservedBy', 'reservedAtMs', 'preFailureStatus'] as const;
      editFields<OrkaRobot>(lab, record, ['orka', 'robots', robot.id], [...fields], () => setRobotStatus(lab, ctx, robot.id, 'RESERVED', str(params.by) || 'riley', undefined, when, true));
    },
    isResolved: (lab, f) => robotByName(lab, f.target)?.status !== 'RESERVED',
  },
  {
    info: info('ocr.labelShift', 'CFD label moved by an app update', 'orka', [p('device', 'device', 'Duet runtime device', { target: true, default: 'dev-r2-d2-duet' }), p('px', 'number', 'Downward label shift in webcam px', { default: 10 })], {
      tags: ['orka.screencompare', 'vision.tesseract', 'parrot.gimp'],
      clears: "every Screen Compare row of the device's robot reads match=true on the canonical cart frame",
      symptoms: ['[ocr] capture webcam → crop 236x44@412,288 → tesseract → "TOTAI $10.B3" → match=false', 'Orka Test panel shows the crop clipping the glyph bottoms'],
      usedBy: ['INC36', 'P3-3'],
    }),
    validate(lab, params) {
      const d = lab.devices[str(params.device) || 'dev-r2-d2-duet'];
      if (!d) return invalid('ocr.labelShift', 'device', str(params.device), 'no such device');
      const px = num(params.px, 10);
      if (Number.isNaN(px)) return invalid('ocr.labelShift', 'px', str(params.px), 'not a number');
      if (d.labelShiftPx === px) return nothing('ocr.labelShift', `${d.id} labels are already shifted ${px} px`);
      return ok(d.id);
    },
    apply(lab, _ctx, params, record) {
      const d = lab.devices[str(params.device) || 'dev-r2-d2-duet']!;
      const px = num(params.px, 10);
      rec(record, ['devices', d.id, 'labelShiftPx'], d.labelShiftPx, px);
      d.labelShiftPx = px;
      if (d.secondaryDisplay) d.secondaryDisplay.rev += 1;
    },
    isResolved(lab, f) {
      const r = robotOfDevice(lab, f.target);
      return !!r && robotComparesMatch(lab, r.id);
    },
  },
  {
    info: info('ocr.capitalisation', 'CFD copy changed case', 'orka', [p('device', 'device', 'Duet runtime device', { target: true, default: 'dev-r2-d2-duet' })], {
      tags: ['orka.screencompare', 'vision.tesseract'],
      clears: 'same as ocr.labelShift',
      symptoms: ['… tesseract → "Total $10.83" → match=false'],
      usedBy: ['INC37-A'],
    }),
    validate(lab, params) {
      const d = lab.devices[str(params.device) || 'dev-r2-d2-duet'];
      if (!d) return invalid('ocr.capitalisation', 'device', str(params.device), 'no such device');
      if (d.cfdLayout === 'v2') return nothing('ocr.capitalisation', `${d.id} already shows the v2 copy`);
      return ok(d.id);
    },
    apply(lab, _ctx, params, record) {
      const d = lab.devices[str(params.device) || 'dev-r2-d2-duet']!;
      rec(record, ['devices', d.id, 'cfdLayout'], d.cfdLayout, 'v2');
      d.cfdLayout = 'v2';
      if (d.secondaryDisplay) d.secondaryDisplay.rev += 1;
    },
    isResolved(lab, f) {
      const r = robotOfDevice(lab, f.target);
      return !!r && robotComparesMatch(lab, r.id);
    },
  },
  {
    info: info('ocr.typo', 'Expected text typo', 'orka', [p('compare', 'compare', 'Screen Compare Image name', { target: true, default: 'CFD_TOTAL' }), p('expected', 'string', 'Expected text written', { default: 'TOTAL $10.38' }), byP('alex'), atP()], {
      tags: ['orka.screencompare', 'vision.tesseract'],
      clears: 'same as ocr.labelShift',
      symptoms: ['… tesseract → "TOTAL $10.83" → match=false'],
      usedBy: ['INC37-B'],
    }),
    validate(lab, params) {
      const c = Object.values(lab.orka.screenCompareImages).find((x) => x.name === (str(params.compare) || 'CFD_TOTAL'));
      if (!c) return invalid('ocr.typo', 'compare', str(params.compare), 'no such compare');
      const e = params.expected === undefined ? 'TOTAL $10.38' : str(params.expected);
      if (c.expectedText === e) return nothing('ocr.typo', `${c.name} already expects "${e}"`);
      return ok(c.name);
    },
    apply(lab, ctx, params, record) {
      const c = Object.values(lab.orka.screenCompareImages).find((x) => x.name === (str(params.compare) || 'CFD_TOTAL'))!;
      const e = params.expected === undefined ? 'TOTAL $10.38' : str(params.expected);
      editFields(lab, record, ['orka', 'screenCompareImages', c.id], ['expectedText'], () => saveScreenCompareImage(lab, ctx, { id: c.id, expectedText: e }, str(params.by) || 'alex', { atMs: at(lab, params), force: true }));
    },
    isResolved(lab, f) {
      const c = Object.values(lab.orka.screenCompareImages).find((x) => x.name === f.target);
      return !!c && robotComparesMatch(lab, c.robotId);
    },
  },
];

function screenRow(lab: LabState, type: string, screen: string): OrkaScreen | undefined {
  return Object.values(lab.orka.screens).find((s) => s.deviceType === type && s.name === screen);
}

export const DATA_FAULTS: CoreFaultDef[] = [...MERCHANT_FAULTS, ...ORKA_FAULTS];
