/**
 * `config.properties` validator — the "uia-relay Config Assistant" plugin [illus.] (Apps §4.8, Cur M14 target,
 * Sim §3.19.1). Pure: (file text, Orka tables) → 11 rule results. Contract delta D8 (`sim.runner.validateConfig`)
 * replaces it when the sim provides one.
 */
import type { DeviceTypeCode, OrkaDb, OrkaDevice, OrkaRobot } from '@/sim';

export const CONFIG_KEYS = [
  'robotName',
  'runType',
  'merchantFacingDeviceIp',
  'customerFacingDeviceIp',
  'serial',
  'deviceType',
  'theme',
  'kernelType',
  'portNumber',
  'unlockPasscode',
  'backendEnv',
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

export interface ConfigRuleResult {
  key: ConfigKey;
  value: string | null;
  ok: boolean;
  /** Failure text (after `— `), null when ok. */
  message: string | null;
}

export interface ConfigValidation {
  passed: number;
  total: number;
  rules: ConfigRuleResult[];
  /** `portNumber = 5555 — must be 5444: …` lines for the failures (action payload). */
  failures: string[];
}

export function parseProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const m = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

export function deviceFamily(t: DeviceTypeCode | string): 'Micro' | 'Flux' | 'Stand' | 'Compass' {
  if (t.startsWith('MICRO')) return 'Micro';
  if (t.startsWith('FLUX')) return 'Flux';
  if (t === 'COMPASS') return 'Compass';
  return 'Stand';
}

const isDuet = (t: string | undefined) => !!t && t.startsWith('STAND_DUET');

export function validateConfigProperties(text: string, orka: Pick<OrkaDb, 'robots' | 'devices'> | null | undefined, devicePasscode = '0000'): ConfigValidation {
  const kv = parseProperties(text);
  const robots: OrkaRobot[] = Object.values(orka?.robots ?? {});
  const devices: Record<number, OrkaDevice> = (orka?.devices ?? {}) as Record<number, OrkaDevice>;
  const name = kv.robotName ?? null;
  const robot = name ? (robots.find((r) => r.name === name) ?? null) : null;
  const mfd = robot?.mfdDeviceId != null ? devices[robot.mfdDeviceId] : undefined;
  const cfd = robot?.cfdDeviceId != null ? devices[robot.cfdDeviceId] : undefined;
  const robotDev = robot?.deviceId != null ? devices[robot.deviceId] : undefined;
  const primary = mfd ?? robotDev;
  const duo = isDuet(primary?.deviceType) || isDuet(robotDev?.deviceType);
  const tethered = !!mfd || duo;
  const noRobot = `no robot named '${name ?? ''}' in Orka`;

  const rule = (key: ConfigKey, ok: boolean, message: string): ConfigRuleResult => ({ key, value: kv[key] ?? null, ok, message: ok ? null : message });
  const needRobot = (key: ConfigKey, check: () => [boolean, string]): ConfigRuleResult => {
    if (!robot) return rule(key, false, `cannot be checked — ${noRobot}`);
    const [ok, msg] = check();
    return rule(key, ok, msg);
  };

  const rules: ConfigRuleResult[] = [
    rule('robotName', !!robot, noRobot),
    needRobot('runType', () => {
      const want = tethered ? 'tethered' : 'standalone';
      return [kv.runType === want, tethered ? `must be "tethered" for ${robot!.name} (${duo && !mfd ? 'Stand Duet' : 'MFD populated'})` : 'must be "standalone"'];
    }),
    needRobot('merchantFacingDeviceIp', () => {
      if (!primary) return [false, `${robot!.name} has no Robot Device in Orka`];
      return [kv.merchantFacingDeviceIp === primary.ip, `expected ${primary.ip} (${primary.name})`];
    }),
    needRobot('customerFacingDeviceIp', () => {
      const v = kv.customerFacingDeviceIp ?? '';
      if (duo) {
        const ip = primary?.ip ?? '';
        return [v === ip && kv.merchantFacingDeviceIp === ip, `On a Stand Duet both IPs are the same address (${ip})`];
      }
      if (tethered && cfd) return [v === cfd.ip, `expected ${cfd.ip} (${cfd.name})`];
      return [v === '' || v === (primary?.ip ?? ''), 'must be empty (or the MFD address) for a standalone rig'];
    }),
    needRobot('serial', () => {
      if (!primary) return [false, `${robot!.name} has no Robot Device in Orka`];
      return [kv.serial === primary.serial, `expected ${primary.serial}`];
    }),
    needRobot('deviceType', () => {
      const fam = primary ? deviceFamily(primary.deviceType) : 'Stand';
      return [kv.deviceType === fam, `deviceType is the family (Micro, Flux or Stand) — expected "${fam}"`];
    }),
    rule('theme', kv.theme === 'avocado', 'only "avocado" is supported (legacy theme toggles are deprecated)'),
    rule('kernelType', kv.kernelType === 'CPA', 'use "CPA" (Core Payments Application); SPA is legacy'),
    rule('portNumber', kv.portNumber === '5444', 'must be 5444: lab devices listen on 5444; 5555 is the ADB default'),
    rule('unlockPasscode', kv.unlockPasscode === devicePasscode, 'expected the device passcode'),
    needRobot('backendEnv', () => [kv.backendEnv === robot!.environment, `expected ${robot!.environment} (${robot!.name}'s environment)`]),
  ];
  const passed = rules.filter((r) => r.ok).length;
  return {
    passed,
    total: rules.length,
    rules,
    failures: rules.filter((r) => !r.ok).map((r) => `${r.key} = ${r.value ?? ''} — ${r.message}`),
  };
}
