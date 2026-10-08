/**
 * uia-remote `config.properties`: the runner's validation (Sim §3.19.1, exact messages), the Cur M14
 * validator target generator (Sim §4.4.4 `target`/`broken`) and the IntelliJ "Config Assistant" 11-key
 * check (Apps §4.8 — contract delta D8, exported as `validateConfigProperties`).
 */
import type { DeviceFamily, DeviceTypeCode, LabState, OrcaDevice, OrcaRobot } from '../types';
import { parseProperties } from './util';

export const CONFIG_KEYS = ['runType', 'merchantFacingDeviceIp', 'customerFacingDeviceIp', 'serial', 'deviceType', 'theme', 'kernelType', 'portNumber', 'unlockPasscode', 'backendEnv', 'robotName'] as const;

export function familyOf(type: DeviceTypeCode | string): DeviceFamily {
  if (type.startsWith('STATION')) return 'Station';
  if (type.startsWith('MINI')) return 'Mini';
  if (type.startsWith('FLEX')) return 'Flex';
  return 'Compact';
}
const isDuo = (type: string): boolean => type.startsWith('STATION_DUO');

export interface RunConfig {
  runType: 'tethered' | 'standalone';
  merchantFacingDeviceIp: string;
  customerFacingDeviceIp: string;
  serial: string;
  deviceType: DeviceFamily;
  theme: string;
  kernelType: string;
  portNumber: number;
  unlockPasscode: string;
  backendEnv: string;
  robotName: string;
}

/** Runner-side validation, in order (Sim §3.19.1). `text === null` = file missing. */
export function parseRunConfig(text: string | null): { ok: true; config: RunConfig; values: Record<string, string> } | { ok: false; error: string } {
  if (text === null) return { ok: false, error: 'java.lang.IllegalStateException: config.properties not found — copy config.properties.example' };
  const { values } = parseProperties(text);
  const get = (k: string): string => values[k] ?? '';
  const runType = get('runType');
  if (runType === 'tethered' && !('customerFacingDeviceIp' in values)) return { ok: false, error: "java.lang.IllegalStateException: config.properties missing key 'customerFacingDeviceIp'" };
  if (get('theme') !== 'avocado') return { ok: false, error: `java.lang.IllegalStateException: Unsupported theme "${get('theme')}" — only "avocado" is supported` };
  if (get('kernelType') !== 'CPA') return { ok: false, error: `java.lang.IllegalStateException: Unsupported kernelType "${get('kernelType')}" — use "CPA"` };
  if (!['Mini', 'Flex', 'Station', 'Compact'].includes(get('deviceType'))) return { ok: false, error: `java.lang.IllegalArgumentException: unknown deviceType "${get('deviceType')}" (expected Mini, Flex or Station)` };
  if (runType !== 'tethered' && runType !== 'standalone') return { ok: false, error: `java.lang.IllegalStateException: Unsupported runType "${runType}"` };
  if (!/^-?\d+$/.test(get('portNumber'))) return { ok: false, error: `java.lang.IllegalStateException: Invalid portNumber "${get('portNumber')}"` };
  return {
    ok: true,
    values,
    config: {
      runType,
      merchantFacingDeviceIp: get('merchantFacingDeviceIp'),
      customerFacingDeviceIp: get('customerFacingDeviceIp'),
      serial: get('serial'),
      deviceType: get('deviceType') as DeviceFamily,
      theme: get('theme'),
      kernelType: get('kernelType'),
      portNumber: Number(get('portNumber')),
      unlockPasscode: get('unlockPasscode') || '0000',
      backendEnv: get('backendEnv') || 'DEV1',
      robotName: get('robotName'),
    },
  };
}

export function robotByName(lab: LabState, name: string): OrcaRobot | null {
  return Object.values(lab.orca.robots).find((r) => r.name === name) ?? null;
}
export function deviceRow(lab: LabState, id: number | null): OrcaDevice | null {
  return id == null ? null : (lab.orca.devices[id] ?? null);
}

/** Cur M14 validator target for robot `r` (Sim §4.4.4 `target`). */
export function targetConfig(lab: LabState, robotName: string): Record<(typeof CONFIG_KEYS)[number], string> | null {
  const r = robotByName(lab, robotName);
  if (!r) return null;
  const mfd = deviceRow(lab, r.mfdDeviceId);
  const dev = mfd ?? deviceRow(lab, r.deviceId);
  const cfd = deviceRow(lab, r.cfdDeviceId);
  const duo = !!dev && isDuo(dev.deviceType);
  const tethered = !!mfd || duo;
  return {
    runType: tethered ? 'tethered' : 'standalone',
    merchantFacingDeviceIp: dev?.ip ?? '',
    customerFacingDeviceIp: duo ? (dev?.ip ?? '') : tethered ? (cfd?.ip ?? '') : '',
    serial: dev?.serial ?? '',
    deviceType: dev ? familyOf(dev.deviceType) : '',
    theme: 'avocado',
    kernelType: 'CPA',
    portNumber: '5444',
    unlockPasscode: '0000',
    backendEnv: r.environment,
    robotName: r.name,
  };
}

export const renderConfig = (values: Record<string, string>, keys: readonly string[] = CONFIG_KEYS): string => `${keys.map((k) => `${k}=${values[k] ?? ''}`).join('\n')}\n`;

const NEXT_FAMILY: Record<string, string> = { Station: 'Mini', Mini: 'Flex', Flex: 'Compact', Compact: 'Station' };

/** `broken` generator (Sim §4.4.4). */
export function brokenConfig(lab: LabState, robotName: string): Record<string, string> | null {
  const t = targetConfig(lab, robotName);
  if (!t) return null;
  return { ...t, runType: 'standalone', customerFacingDeviceIp: '', deviceType: NEXT_FAMILY[t.deviceType] ?? 'Mini', theme: 'classic', kernelType: 'SPA', portNumber: '5555' };
}

export interface ConfigCheckRow {
  key: string;
  value: string;
  ok: boolean;
  /** Failure text (after "— "), null when ok. */
  message: string | null;
}

/** Apps §4.8 — the "uia-remote Config Assistant" 11-key check (D8). Pure. */
export function validateConfigProperties(lab: LabState, text: string): { passed: number; total: number; rows: ConfigCheckRow[]; banner: string } {
  const { values } = parseProperties(text);
  const v = (k: string): string => values[k] ?? '';
  const name = v('robotName');
  const r = robotByName(lab, name);
  const t = r ? targetConfig(lab, name) : null;
  const mfd = r ? deviceRow(lab, r.mfdDeviceId) : null;
  const dev = r ? (mfd ?? deviceRow(lab, r.deviceId)) : null;
  const cfd = r ? deviceRow(lab, r.cfdDeviceId) : null;
  const duo = !!dev && isDuo(dev.deviceType);
  const rows: ConfigCheckRow[] = [];
  const add = (key: string, ok: boolean, message: string): void => {
    rows.push({ key, value: v(key), ok, message: ok ? null : message });
  };
  add('robotName', !!r, `no robot named '${name}' in Orca`);
  add('runType', !!t && v('runType') === t.runType, t?.runType === 'tethered' ? `must be "tethered" for ${name} (${duo ? 'Station Duo' : 'MFD populated'})` : 'must be "standalone"');
  add('merchantFacingDeviceIp', !!t && v('merchantFacingDeviceIp') === t.merchantFacingDeviceIp, `expected ${t?.merchantFacingDeviceIp ?? '?'} (${dev?.name ?? '?'})`);
  const cfdOk = !!t && (duo ? v('customerFacingDeviceIp') === t.merchantFacingDeviceIp : t.runType === 'tethered' ? v('customerFacingDeviceIp') === t.customerFacingDeviceIp : v('customerFacingDeviceIp') === '' || v('customerFacingDeviceIp') === t.merchantFacingDeviceIp);
  add('customerFacingDeviceIp', cfdOk, duo ? `On a Station Duo both IPs are the same address (${t?.merchantFacingDeviceIp ?? ''})` : `expected ${t?.customerFacingDeviceIp ?? ''} (${cfd?.name ?? '?'})`);
  add('serial', !!t && v('serial') === t.serial, `expected ${t?.serial ?? '?'}`);
  add('deviceType', !!t && v('deviceType') === t.deviceType, `deviceType is the family (Mini, Flex or Station) — expected "${t?.deviceType ?? '?'}"`);
  add('theme', v('theme') === 'avocado', 'only "avocado" is supported (legacy theme toggles are deprecated)');
  add('kernelType', v('kernelType') === 'CPA', 'use "CPA" (Core Payments Application); SPA is legacy');
  add('portNumber', v('portNumber') === '5444', 'must be 5444: lab devices listen on 5444; 5555 is the ADB default');
  add('unlockPasscode', v('unlockPasscode') === '0000', 'expected the device passcode');
  add('backendEnv', !!r && v('backendEnv') === r.environment, `expected ${r?.environment ?? '?'} (${name}'s environment)`);
  const passed = rows.filter((x) => x.ok).length;
  return { passed, total: rows.length, rows, banner: passed === rows.length ? `config.properties ✓ ${passed}/${rows.length}` : `config.properties ✗ ${passed}/${rows.length}` };
}

/** Exact key equality against the target (fault `config.value` predicate). */
export function keyMatchesTarget(lab: LabState, text: string, key: string): boolean {
  const { values } = parseProperties(text);
  const t = targetConfig(lab, values['robotName'] ?? '');
  if (!t) return false;
  return (values[key] ?? '') === (t as Record<string, string>)[key];
}
