/**
 * DR03 Port Patrol (GP §2.4.3): terminal / config / runner lines slide past — flag each **Lab-safe**
 * (`Space`) or **Collision risk** (`X`) before it scrolls away. In the last 15 s risky lines come back as
 * "fix it" cards: type the fix (e.g. `adb disconnect 10.42.60.4:5555`).
 *
 * Rules (Ref §1.3, §4.5 — F026, F198, F199, F200): lab devices listen for ADB on **5444**; standard ADB
 * defaults to **5555**, which caused office collisions with coworkers' desk devices. Collision risk = any
 * `:5555`, any `10.42.60.*` target (coworker desk devices, S02), `adb connect` without a port (defaults to
 * 5555), `portNumber=5555`, `adb tcpip 5555`, the runner fallback line (S19). Lab-safe = `10.42.30.*:5444`,
 * `portNumber=5444`.
 */
import type { RootState } from '@/core/state';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { chance, nextInt, pick, recentKeys, type RngState } from '../common/rng';
import { teach } from '../common/teach';

export type PortSource = 'terminal' | 'output' | 'config' | 'runner';

export interface PortData {
  line: string;
  source: PortSource;
  risk: boolean;
  /** Why (shown on the reveal / Teach Card). */
  reason: string;
  /** Last-15-s bonus: type the fix. */
  fix: { prompt: string; accept: string[] } | null;
  mode: 'classify' | 'fix';
}

/** Lab devices (Cur §0.4 / Sim roster): `10.42.30.*` on ADB 5444. */
const LAB_IPS = ['10.42.30.11', '10.42.30.12', '10.42.30.13', '10.42.30.14', '10.42.30.21', '10.42.30.22', '10.42.30.31', '10.42.30.32'];
/** Coworker desk devices (S02): `10.42.60.*` on the ADB default 5555. */
const DESK_IPS = ['10.42.60.4', '10.42.60.5'];

interface Tpl {
  key: string;
  source: PortSource;
  risk: boolean;
  make: (lab: string, desk: string, rng: RngState) => string;
  reason: string;
  facts: string[];
  fix?: (lab: string, desk: string) => { prompt: string; accept: string[] };
  illustrative?: boolean;
}

const norm = (s: string): string => s.trim().replace(/\s+/g, ' ');
const tapXY = (rng: RngState): string => `${nextInt(rng, 60, 680)} ${nextInt(rng, 120, 1180)}`;

const RISKY: Tpl[] = [
  {
    key: 'connect-5555',
    source: 'terminal',
    risk: true,
    make: (l) => `adb connect ${l}:5555`,
    reason: ':5555 is the out-of-the-box ADB port — lab devices only listen on 5444.',
    facts: ['F026', 'F199'],
    fix: (l) => ({ prompt: 'Connect to the same device the lab way', accept: [`adb connect ${l}:5444`] }),
  },
  {
    key: 'connect-noport',
    source: 'terminal',
    risk: true,
    make: (l) => `adb connect ${l}`,
    reason: 'No port given → ADB uses its default 5555, not the lab\'s 5444.',
    facts: ['F026', 'F199'],
    fix: (l) => ({ prompt: 'Add the lab port', accept: [`adb connect ${l}:5444`] }),
  },
  {
    key: 'refused-5555',
    source: 'output',
    risk: true,
    make: (l) => `failed to connect to '${l}:5555': Connection refused`,
    reason: 'A connect attempt on 5555 — lab devices refuse it, and a runner may then grab another device it already knows.',
    facts: ['F026', 'F199', 'F200'],
    fix: (l) => ({ prompt: 'Retry on the lab port', accept: [`adb connect ${l}:5444`] }),
  },
  {
    key: 'desk-tap',
    source: 'terminal',
    risk: true,
    make: (_l, d, rng) => `adb -s ${d}:5555 shell input tap ${tapXY(rng)}`,
    reason: '10.42.60.* is a coworker\'s desk device on 5555 — this tap lands on their screen.',
    facts: ['F200', 'F199'],
    fix: (_l, d) => ({ prompt: 'Drop the coworker\'s device', accept: [`adb disconnect ${d}:5555`] }),
  },
  {
    key: 'desk-any',
    source: 'terminal',
    risk: true,
    make: (_l, d) => `adb connect ${d}:5444`,
    reason: '10.42.60.* are coworkers\' desk devices — never a target for lab scripts, whatever the port.',
    facts: ['F200'],
    illustrative: true,
  },
  {
    key: 'devices-desk',
    source: 'output',
    risk: true,
    make: (_l, d) => `${d}:5555\tdevice`,
    reason: '`adb devices` still lists a coworker\'s desk device on 5555 — a runner could fall back to it.',
    facts: ['F199', 'F200'],
    fix: (_l, d) => ({ prompt: 'Remove it from your ADB server', accept: [`adb disconnect ${d}:5555`] }),
    illustrative: true,
  },
  {
    key: 'config-5555',
    source: 'config',
    risk: true,
    make: () => 'portNumber=5555',
    reason: 'portNumber is locked to 5444 — 5555 is exactly what caused the office collisions.',
    facts: ['F198', 'F200'],
    fix: () => ({ prompt: 'Fix the config line', accept: ['portNumber=5444'] }),
  },
  {
    key: 'tcpip',
    source: 'terminal',
    risk: true,
    make: () => 'adb tcpip 5555',
    reason: 'Puts a device\'s ADB on the default 5555 — the port that collides with coworkers\' desk devices.',
    facts: ['F199', 'F200'],
  },
  {
    key: 'fallback',
    source: 'runner',
    risk: true,
    make: (_l, d) => `[runner] falling back to first known device: ${d}:5555`,
    reason: 'The runner gave up on the lab device and is about to drive a coworker\'s desk device.',
    facts: ['F200', 'F198'],
    fix: (_l, d) => ({ prompt: 'Disconnect the coworker\'s device, then fix portNumber', accept: [`adb disconnect ${d}:5555`] }),
    illustrative: true,
  },
  {
    key: 'runner-5555',
    source: 'runner',
    risk: true,
    make: (l) => `[runner] connect ${l}:5555 … refused`,
    reason: 'The runner is reading portNumber=5555 from config.properties.',
    facts: ['F198', 'F199'],
    fix: () => ({ prompt: 'Fix config.properties', accept: ['portNumber=5444'] }),
    illustrative: true,
  },
  {
    key: 'shell-5555',
    source: 'terminal',
    risk: true,
    make: (l) => `adb -s ${l}:5555 shell uiautomator dump`,
    reason: 'Same lab device, wrong port: lab devices only answer on 5444.',
    facts: ['F026', 'F199'],
    fix: (l) => ({ prompt: 'Retarget on the lab port', accept: [`adb -s ${l}:5444 shell uiautomator dump`] }),
  },
];

const SAFE: Tpl[] = [
  { key: 'connect-5444', source: 'terminal', risk: false, make: (l) => `adb connect ${l}:5444`, reason: 'A lab device (10.42.30.*) on the lab ADB port 5444.', facts: ['F026'] },
  { key: 'connected-5444', source: 'output', risk: false, make: (l) => `connected to ${l}:5444`, reason: 'Connected to a lab device on 5444.', facts: ['F026'] },
  { key: 'dump-5444', source: 'terminal', risk: false, make: (l) => `adb -s ${l}:5444 shell uiautomator dump`, reason: 'Dumping the UI hierarchy of a lab device on 5444.', facts: ['F024', 'F026'] },
  { key: 'pull-5444', source: 'terminal', risk: false, make: (l) => `adb -s ${l}:5444 pull /sdcard/window_dump.xml`, reason: 'Pulling the dump from a lab device on 5444.', facts: ['F024', 'F026'] },
  { key: 'tap-5444', source: 'terminal', risk: false, make: (l, _d, rng) => `adb -s ${l}:5444 shell input tap ${tapXY(rng)}`, reason: 'A programmatic tap on a lab device over 5444.', facts: ['F025', 'F026'] },
  { key: 'devices-5444', source: 'output', risk: false, make: (l) => `${l}:5444\tdevice`, reason: '`adb devices` lists only a lab device on 5444.', facts: ['F026'] },
  { key: 'config-5444', source: 'config', risk: false, make: () => 'portNumber=5444', reason: 'portNumber is locked to 5444.', facts: ['F198'] },
  { key: 'runner-5444', source: 'runner', risk: false, make: (l) => `[runner] connect ${l}:5444 … connected`, reason: 'The runner reached the lab device on 5444.', facts: ['F026', 'F198'], illustrative: true },
  { key: 'disconnect-5444', source: 'terminal', risk: false, make: (l) => `adb disconnect ${l}:5444`, reason: 'Disconnecting a lab device on 5444 is harmless.', facts: ['F026'] },
];

export const PORT_TEMPLATES = { risky: RISKY, safe: SAFE } as const;

const TAGS = ['adb.port', 'adb.usage'];

export function portItem(t: Tpl, rng: RngState, mode: 'classify' | 'fix'): DrillItem<PortData> {
  const lab = pick(rng, LAB_IPS);
  const desk = pick(rng, DESK_IPS);
  const line = t.make(lab, desk, rng);
  const fix = t.fix ? t.fix(lab, desk) : null;
  const what = mode === 'fix' && fix ? `Fix: ${fix.accept[0]}` : `${t.risk ? 'Collision risk' : 'Lab-safe'}: ${line.replace('\t', ' ')}`;
  return {
    id: `DR03:${mode}:${t.key}:${line}`,
    tags: t.key.startsWith('config') || t.key.startsWith('runner') ? ['adb.port', 'uia.config'] : TAGS,
    factIds: t.facts,
    teach: teach(what, t.reason, {
      ref: 'Ref §1.3, §4.5',
      factIds: t.facts,
      illustrative: t.illustrative,
      doInstead: t.risk ? 'Lab devices: 10.42.30.*:5444. Anything on 5555 or 10.42.60.* → X.' : 'A 10.42.30.* device on 5444 → Space.',
      tag: 'adb.port',
    }),
    data: { line, source: t.source, risk: t.risk, reason: t.reason, fix: mode === 'fix' ? fix : null, mode },
  };
}

/** Normalised check of a typed fix. */
export function fixMatches(typed: string, accept: readonly string[]): boolean {
  const n = norm(typed);
  return accept.some((a) => norm(a) === n);
}

/** Lines scroll faster as the round goes on (s on screen). */
export function scrollSeconds(index: number): number {
  return Math.max(2.8, 6 - 0.18 * index);
}

export function generatePort(rng: RngState, state: RootState | null, index: number): DrillItem<PortData> {
  const left = state?.session?.drill?.timeLeftS ?? null;
  const recent = recentKeys(state, 4).map((k) => k.split(':').slice(0, 3).join(':'));
  const fixable = RISKY.filter((t) => t.fix);
  if (left !== null && left <= 15 && chance(rng, 0.6)) {
    const t = pick(rng, fixable);
    return portItem(t, rng, 'fix');
  }
  // ~50/50, a little riskier later (traps such as `adb connect` without a port).
  for (let tries = 0; tries < 6; tries++) {
    const risky = chance(rng, index < 3 ? 0.45 : 0.55);
    const pool = risky ? RISKY.filter((t) => index >= 4 || !['desk-any', 'devices-desk', 'tcpip'].includes(t.key)) : SAFE;
    const t = pick(rng, pool);
    if (!recent.includes(`DR03:classify:${t.key}`) || tries === 5) return portItem(t, rng, 'classify');
  }
  return portItem(pick(rng, SAFE), rng, 'classify');
}

export const DR03: DrillDef<PortData> = {
  id: 'DR03',
  name: 'Port Patrol',
  format: 'Terminal/config lines scroll: flag Lab-safe or Collision risk; last 15 s type the fix',
  tags: ['adb.port', 'adb.usage'],
  unlockedBy: ['M12'],
  durationS: 60,
  itemCount: null,
  medals: { bronze: 900, silver: 1600, gold: 2400 },
  scoring: 'standard',
  generate: (rng, state, index) => generatePort(rng, state, index),
  component: lazyDrill(() => import('./View'), '#ef4b3f'),
};
