/**
 * DR02 config.properties Speed-Build (GP §2.4.3, Cur M14): a rig card (rig, device(s), IPs, serial, env,
 * passcode) → type the full `config.properties` as `key=value` lines. 3 files, 120 s.
 *
 * Graded keys = the curriculum validator's 11 keys (Cur M14). Targets follow the sim's `targetConfig`
 * (Sim §4.4.4) built from the same roster, so the drill agrees with the in-game Config Assistant:
 * tethered when the MFD is populated or the device is a Station Duo (MFD IP = CFD IP, F193); `deviceType` is
 * the family (Mini, Flex, Station — F195); theme `avocado`, kernelType `CPA`, portNumber `5444` are locked
 * (F196–F198). Standalone rigs use `runType=standalone` [illus., Cur M11] with an empty CFD IP.
 *
 * Required traps per round: a tethered card, a Flex card, then a Station Duo card (R2-D2 `10.42.30.14`) or an
 * "old wiki" card that starts pre-filled with `theme=classic`, `kernelType=SPA`, `portNumber=5555`.
 *
 * Scoring (custom): +40 per correct key, +100 for all 11 (GP §2.4.3); a perfect file also earns a speed bonus
 * (5 pts per second under 60 s) and the streak multiplier, which keeps the GP medal thresholds reachable.
 */
import type { RootState } from '@/core/state';
import type { DeviceTypeCode } from '@/sim/types';
import { ROSTER, type RosterRow } from '@/sim/seed/robots';
import { DEVICE_TYPES } from '@/sim/seed/deviceTypes';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { chance, pick, recentKeys, type RngState } from '../common/rng';
import { configPoints, streakMultiplier } from '../common/scoring';
import { teach } from '../common/teach';

export const CONFIG_KEYS = ['runType', 'merchantFacingDeviceIp', 'customerFacingDeviceIp', 'serial', 'deviceType', 'theme', 'kernelType', 'portNumber', 'unlockPasscode', 'backendEnv', 'robotName'] as const;
export type ConfigKey = (typeof CONFIG_KEYS)[number];

export interface RigDevice {
  role: 'MFD' | 'CFD' | 'Device' | 'MFD + CFD';
  type: DeviceTypeCode;
  model: string;
  ip: string;
  serial: string;
}

export interface ConfigData {
  rig: string;
  hrn: string;
  kind: RosterRow['kind'];
  env: string;
  location: string;
  devices: RigDevice[];
  passcode: string;
  /** Card flavour. */
  variant: 'tethered' | 'flex' | 'duo' | 'wiki' | 'standalone';
  /** Pre-filled lines (old wiki card), else []. */
  start: string[];
  target: Record<ConfigKey, string>;
}

const familyOf = (t: DeviceTypeCode): string => (t.startsWith('STATION') ? 'Station' : t.startsWith('MINI') ? 'Mini' : t.startsWith('FLEX') ? 'Flex' : 'Compact');
const ip = (octet: number): string => `10.42.30.${octet}`;
/** `SIM-<model>-0000<octet>` (Sim §2.4). */
const serialOf = (type: DeviceTypeCode, octet: number): string => `SIM-${DEVICE_TYPES[type].serialPrefix}-0000${String(octet).padStart(2, '0')}`;
const isDuo = (t: DeviceTypeCode): boolean => t.startsWith('STATION_DUO');

/** Rig cards eligible for DR02: rigs you could run locally (Available, or Unavailable by name) — Compact rigs skipped (config.properties deviceType is Mini, Flex or Station). */
const ELIGIBLE = ROSTER.filter((r) => familyOf(r.device.type) !== 'Compact' && (r.status === 'AVAILABLE' || r.status === 'UNAVAILABLE'));
export const TETHERED_RIGS = ELIGIBLE.filter((r) => !!r.cfd);
export const FLEX_RIGS = ELIGIBLE.filter((r) => !r.cfd && familyOf(r.device.type) === 'Flex');
export const DUO_RIGS = ELIGIBLE.filter((r) => isDuo(r.device.type));
export const OTHER_RIGS = ELIGIBLE.filter((r) => !r.cfd && !isDuo(r.device.type) && familyOf(r.device.type) !== 'Flex');

export function targetFor(r: RosterRow): Record<ConfigKey, string> {
  const duo = isDuo(r.device.type);
  const tethered = !!r.cfd || duo;
  const mfdIp = ip(r.device.ip);
  return {
    runType: tethered ? 'tethered' : 'standalone',
    merchantFacingDeviceIp: mfdIp,
    customerFacingDeviceIp: duo ? mfdIp : r.cfd ? ip(r.cfd.ip) : '',
    serial: serialOf(r.device.type, r.device.ip),
    deviceType: familyOf(r.device.type),
    theme: 'avocado',
    kernelType: 'CPA',
    portNumber: '5444',
    unlockPasscode: '0000',
    backendEnv: r.env,
    robotName: r.name,
  };
}

function devicesOf(r: RosterRow): RigDevice[] {
  const d = (role: RigDevice['role'], type: DeviceTypeCode, octet: number): RigDevice => ({ role, type, model: DEVICE_TYPES[type].displayName, ip: ip(octet), serial: serialOf(type, octet) });
  if (r.cfd) return [d('MFD', r.device.type, r.device.ip), d('CFD', r.cfd.type, r.cfd.ip)];
  if (isDuo(r.device.type)) return [d('MFD + CFD', r.device.type, r.device.ip)];
  return [d('Device', r.device.type, r.device.ip)];
}

/** The "old wiki" start text (Sim §4.4.4 `broken` flavour): stale locks + one or two other slips. */
export function wikiStart(t: Record<ConfigKey, string>): string[] {
  return CONFIG_KEYS.map((k) => {
    if (k === 'theme') return 'theme=classic';
    if (k === 'kernelType') return 'kernelType=SPA';
    if (k === 'portNumber') return 'portNumber=5555';
    return `${k}=${t[k]}`;
  });
}

export function configItem(r: RosterRow, variant: ConfigData['variant']): DrillItem<ConfigData> {
  const target = targetFor(r);
  const facts = ['F190', 'F191', 'F192', 'F195', 'F196', 'F197', 'F198'];
  if (variant === 'duo') facts.push('F193');
  return {
    id: `DR02:${variant}:${r.name}`,
    tags: ['uia.config', 'adb.port', 'orca.tethered'],
    factIds: facts,
    teach: teach(
      `${r.name}: ${CONFIG_KEYS.map((k) => `${k}=${target[k]}`).filter((_, i) => i < 5).join(' · ')} …`,
      variant === 'duo'
        ? 'Station Duo: one terminal, two displays — merchantFacingDeviceIp and customerFacingDeviceIp are the exact same IP; deviceType is the family (Station).'
        : variant === 'wiki'
          ? 'The old wiki is stale: theme is locked to avocado, kernelType to CPA (SPA is legacy) and portNumber to 5444 (5555 is the ADB default that hit coworkers\' desk devices).'
          : variant === 'tethered'
            ? 'MFD populated → runType=tethered with both IPs; serial = the primary terminal (MFD); deviceType = the MFD\'s family.'
            : 'deviceType is the family (Mini, Flex or Station), not the Device Type enum; theme=avocado, kernelType=CPA, portNumber=5444 are locked.',
      { ref: 'Ref §4.5', factIds: facts, illustrative: true, tag: 'uia.config', doInstead: 'Read the rig card top to bottom: runType, IPs, serial, family, then the three locks.' },
    ),
    data: {
      rig: r.name,
      hrn: r.hrn,
      kind: r.kind,
      env: r.env,
      location: r.location,
      devices: devicesOf(r),
      passcode: '0000',
      variant,
      start: variant === 'wiki' ? wikiStart(target) : [],
      target,
    },
  };
}

/** Parse typed lines (`key=value`, `#` comments, whitespace around `=` tolerated like java.util.Properties). */
export function parseLines(lines: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const m = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

export interface KeyGrade {
  key: ConfigKey;
  value: string | null;
  expected: string;
  ok: boolean;
  why: string;
}

const KEY_WHY: Record<ConfigKey, (t: Record<ConfigKey, string>, d: ConfigData) => string> = {
  runType: (t) => (t.runType === 'tethered' ? 'tethered for multi-device setups (MFD populated, or a Station Duo)' : 'standalone single device (Jenkins env block uses the same word)'),
  merchantFacingDeviceIp: () => 'the MFD terminal\'s local IP',
  customerFacingDeviceIp: (t, d) => (d.variant === 'duo' ? 'Station Duo: the exact same IP as the MFD' : t.customerFacingDeviceIp ? 'the CFD terminal\'s local IP' : 'standalone: leave it empty'),
  serial: () => 'hardware serial of the primary terminal (the MFD)',
  deviceType: () => 'the family — Mini, Flex or Station — not the ALL-CAPS enum',
  theme: () => 'locked to avocado (legacy theme toggles are deprecated)',
  kernelType: () => 'locked to CPA (Core Payments Application; SPA is legacy)',
  portNumber: () => 'locked to 5444 — 5555 is the ADB default that collided with coworkers\' desk devices',
  unlockPasscode: () => 'the device unlock passcode from the rig card',
  backendEnv: () => 'the rig\'s backend environment',
  robotName: () => 'the robot\'s registration Name (lower-case system identifier)',
};

export function gradeConfig(data: ConfigData, lines: readonly string[]): { rows: KeyGrade[]; correct: number } {
  const v = parseLines(lines);
  const rows = CONFIG_KEYS.map((k): KeyGrade => {
    const val = k in v ? v[k]! : null;
    const exp = data.target[k];
    // Standalone: an absent or empty CFD key, or one equal to the MFD IP, is accepted (as the sim's validator does).
    const ok = k === 'customerFacingDeviceIp' && data.target.runType === 'standalone' ? val === null || val === '' || val === data.target.merchantFacingDeviceIp : val === exp;
    return { key: k, value: val, expected: exp, ok, why: KEY_WHY[k](data.target, data) };
  });
  return { rows, correct: rows.filter((r) => r.ok).length };
}

/** Points for one file. */
export function filePoints(correct: number, seconds: number, streakBefore: number): number {
  const base = configPoints(correct, CONFIG_KEYS.length);
  if (correct < CONFIG_KEYS.length) return base;
  const speed = Math.max(0, Math.round(5 * (60 - seconds)));
  return Math.round((base + speed) * streakMultiplier(streakBefore));
}

/** Autocomplete (Standard realism): the first unused key starting with the typed prefix (≥ 3 chars). */
export function completeKey(prefix: string, used: readonly string[]): string | null {
  if (prefix.length < 3 || prefix.includes('=')) return null;
  const p = prefix.toLowerCase();
  return CONFIG_KEYS.find((k) => k.toLowerCase().startsWith(p) && k !== prefix && !used.includes(k)) ?? CONFIG_KEYS.find((k) => k.toLowerCase().startsWith(p) && k !== prefix) ?? null;
}

export function generateConfig(rng: RngState, state: RootState | null, index: number): DrillItem<ConfigData> {
  const recent = recentKeys(state, 3).map((k) => k.split(':')[2]);
  const fresh = (pool: readonly RosterRow[]) => {
    const f = pool.filter((r) => !recent.includes(r.name));
    return f.length ? f : pool;
  };
  const slot = index % 3;
  if (slot === 0) {
    const r = index === 0 && chance(rng, 0.5) ? ROSTER.find((x) => x.name === 'megatron')! : pick(rng, fresh(TETHERED_RIGS));
    return configItem(r, 'tethered');
  }
  if (slot === 1) return configItem(pick(rng, fresh(FLEX_RIGS)), 'flex');
  if (chance(rng, 0.5)) {
    const r = chance(rng, 0.6) ? ROSTER.find((x) => x.name === 'r2-d2')! : pick(rng, fresh(DUO_RIGS));
    return configItem(r, 'duo');
  }
  return configItem(pick(rng, fresh([...OTHER_RIGS, ...FLEX_RIGS, ...TETHERED_RIGS])), 'wiki');
}

export const DR02: DrillDef<ConfigData> = {
  id: 'DR02',
  name: 'config.properties Speed-Build',
  format: 'Build a full config.properties for a rig card; 3 files, 120 s',
  tags: ['uia.config', 'adb.port', 'orca.tethered'],
  unlockedBy: ['M14'],
  durationS: 120,
  itemCount: 3,
  medals: { bronze: 900, silver: 1600, gold: 2300 },
  scoring: 'custom',
  generate: (rng, state, index) => generateConfig(rng, state, index),
  component: lazyDrill(() => import('./View'), '#7c3aed'),
};
