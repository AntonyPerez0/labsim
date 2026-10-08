/**
 * DR19 ADB Speedrun (GP §2.4.3, Cur M12): a live terminal on a random ADB-visible device — `adb connect
 * <ip>:5444` → `adb -s <ip>:5444 shell uiautomator dump` → `adb -s <ip>:5444 pull /sdcard/window_dump.xml` →
 * `grep -o 'text="Orders"[^>]*' window_dump.xml` → compute the bounds centre → `adb -s <ip>:5444 shell input
 * tap <x> <y>`. 120 s. Score per target = 300 − 10 × seconds (min 50); any `:5555` = −100 and a
 * Teach Card (F026, F199, F200).
 *
 * Round length: GP lists "3 targets, 120 s", but its medals (gold 1600) exceed 3 × 300, so targets keep
 * coming for the whole 120 s (the first three are the core round) and the per-target score takes the
 * in-drill streak multiplier — the formula and the medal thresholds then agree.
 *
 * The terminal is a local, deterministic model of the workstation shell: its output strings and the UI
 * Automator XML mirror the sim's (`src/sim/terminal/adb.ts`, `src/sim/core/adb.ts`), and the launcher bounds
 * come from the sim's firmware layout tables, so TARS' Register sits at [96,412][288,604] → tap 192 508.
 */
import type { RootState } from '@/core/state';
import type { DeviceTypeCode } from '@/sim/types';
import { primaryLayoutId, screenOf } from '@/sim/seed/deviceTypes';
import { LAYOUTS } from '@/sim/seed/layouts/tables';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { pick, recentKeys, type RngState } from '../common/rng';
import { speedrunPoints, streakMultiplier } from '../common/scoring';
import { teach } from '../common/teach';

export interface AdbDevice {
  name: string;
  hrn: string;
  ip: string;
  type: DeviceTypeCode;
}

/** GP §2.4.3: TARS, DATA, BUMBLEBEE, WALL-E (Cur §0.4 IPs). */
export const SPEEDRUN_DEVICES: readonly AdbDevice[] = [
  { name: 'tars', hrn: 'TARS', ip: '10.42.30.32', type: 'FLEX_4' },
  { name: 'data', hrn: 'DATA', ip: '10.42.30.31', type: 'MINI_3' },
  { name: 'bumblebee', hrn: 'BUMBLEBEE', ip: '10.42.30.13', type: 'MINI_3' },
  { name: 'wall-e', hrn: 'WALL-E', ip: '10.42.30.11', type: 'FLEX_3' },
];

export interface AppNode {
  text: string;
  l: number;
  t: number;
  r: number;
  b: number;
}

/** Launcher page-0 icons in device px (Sim §2.10.2 HOME table × px/mm). */
export function launcher(type: DeviceTypeCode): { w: number; h: number; apps: AppNode[] } {
  const s = screenOf(type, 'primary');
  const els = LAYOUTS[primaryLayoutId(type)].screens.HOME ?? [];
  return {
    w: s.wPx,
    h: s.hPx,
    apps: els.map((e) => ({ text: e.id, l: Math.round((e.x - e.w / 2) * s.px.x), t: Math.round((e.y - e.h / 2) * s.px.y), r: Math.round((e.x + e.w / 2) * s.px.x), b: Math.round((e.y + e.h / 2) * s.px.y) })),
  };
}

const resId = (id: string) => `com.labsim.launcher:id/${id.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;

/** UI Automator XML of the launcher (same node format as the sim). */
export function launcherXml(type: DeviceTypeCode, openApp: string | null): string {
  const L = launcher(type);
  const head = "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>";
  const node = (i: number, text: string, id: string, pkg: string, cls: string, b: [number, number, number, number], click: boolean) =>
    `<node index="${i}" text="${text}" resource-id="${id}" class="${cls}" package="${pkg}" content-desc="" checkable="false" checked="false" clickable="${click}" enabled="true" focusable="${click}" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[${b[0]},${b[1]}][${b[2]},${b[3]}]" />`;
  if (openApp) {
    const pkg = `com.labsim.${openApp.toLowerCase().replace(/[^a-z]+/g, '')}`;
    return `${head}<hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="${pkg}" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][${L.w},${L.h}]">${node(0, openApp, `${pkg}:id/title`, pkg, 'android.widget.TextView', [0, 0, L.w, Math.round(L.h * 0.08)], false)}</node></hierarchy>`;
  }
  const nodes = L.apps.map((a, i) => node(i, a.text, resId(a.text), 'com.labsim.launcher', 'android.widget.Button', [a.l, a.t, a.r, a.b], true)).join('');
  return `${head}<hierarchy rotation="0"><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="com.labsim.launcher" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][${L.w},${L.h}]">${nodes}</node></hierarchy>`;
}

export interface SpeedData {
  device: AdbDevice;
  target: string;
  /** Answer: the target's bounds and centre (reveal / tests). */
  bounds: [number, number, number, number];
  centre: [number, number];
}

export function speedItem(dev: AdbDevice, target: string): DrillItem<SpeedData> {
  const a = launcher(dev.type).apps.find((x) => x.text === target)!;
  const centre: [number, number] = [Math.round((a.l + a.r) / 2), Math.round((a.t + a.b) / 2)];
  const facts = ['F024', 'F025', 'F026', 'F199'];
  return {
    id: `DR19:${dev.name}:${target}`,
    tags: ['adb.usage', 'adb.port'],
    factIds: facts,
    teach: teach(`adb connect ${dev.ip}:5444 → dump → pull → grep → input tap ${centre[0]} ${centre[1]}`, 'ADB inspects the XML UI hierarchy to locate elements and dispatches programmatic touch events — over port 5444 in the lab. Centre = ((left + right) / 2, (top + bottom) / 2).', {
      ref: 'Ref §1.3',
      factIds: facts,
      illustrative: true,
      tag: 'adb.usage',
    }),
    data: { device: dev, target, bounds: [a.l, a.t, a.r, a.b], centre },
  };
}

export function generateSpeedrun(rng: RngState, state: RootState | null, _index: number): DrillItem<SpeedData> {
  const recent = recentKeys(state, 2).map((k) => k.split(':')[1]);
  const devs = SPEEDRUN_DEVICES.filter((d) => !recent.includes(d.name));
  const dev = pick(rng, devs.length ? devs : SPEEDRUN_DEVICES);
  const target = pick(rng, launcher(dev.type).apps.map((a) => a.text));
  return speedItem(dev, target);
}

/* ── the terminal model ── */

export interface TermState {
  /** Connected targets `ip:port`. */
  connected: string[];
  /** Devices (ip) with a fresh /sdcard/window_dump.xml, and what it showed. */
  dumps: Record<string, string>;
  /** Local ~/window_dump.xml contents (null = no file). */
  local: string | null;
  /** App open per device ip (null = HomeScreen). */
  open: Record<string, string | null>;
  /** Progress of the current target. */
  steps: { connect: boolean; dump: boolean; pull: boolean; bounds: boolean; tap: boolean };
  /** `:5555` uses this target. */
  port5555: number;
  done: boolean;
}

export const newTerm = (prev?: TermState): TermState => ({
  connected: prev?.connected ?? [],
  dumps: {},
  local: null,
  open: {},
  steps: { connect: false, dump: false, pull: false, bounds: false, tap: false },
  port5555: 0,
  done: false,
});

export interface TermOut {
  lines: { text: string; tone?: 'err' | 'ok' | 'warn' | 'muted' }[];
  state: TermState;
  /** A `:5555` (or port-less connect) was used. */
  collision: boolean;
  clear?: boolean;
  /** Tap landed on (px). */
  tap?: { x: number; y: number; hit: string | null };
}

const LAB = new Map(SPEEDRUN_DEVICES.map((d) => [d.ip, d]));

/** Shell-ish argv split honouring single and double quotes. */
export function argv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  let has = false;
  for (const ch of line) {
    if (q) {
      if (ch === q) q = null;
      else cur += ch;
    } else if (ch === "'" || ch === '"') {
      q = ch;
      has = true;
    } else if (/\s/.test(ch)) {
      if (cur || has) out.push(cur);
      cur = '';
      has = false;
    } else cur += ch;
  }
  if (cur || has) out.push(cur);
  return out;
}

export function runCommand(stIn: TermState, line: string, item: SpeedData): TermOut {
  const st: TermState = { ...stIn, connected: [...stIn.connected], dumps: { ...stIn.dumps }, open: { ...stIn.open }, steps: { ...stIn.steps } };
  const out: TermOut['lines'] = [];
  const say = (text: string, tone?: 'err' | 'ok' | 'warn' | 'muted') => out.push({ text, tone });
  const a = argv(line.trim());
  let collision = /:5555\b/.test(line);
  const ip = item.device.ip;
  const res = (): TermOut => {
    if (collision) st.port5555++;
    return { lines: out, state: st, collision };
  };
  if (!a.length) return res();
  const cmd = a[0]!;
  if (cmd === 'clear') return { lines: [], state: st, collision: false, clear: true };
  if (cmd === 'help') {
    say('adb connect <ip>:5444 · adb devices · adb -s <ip>:5444 shell uiautomator dump', 'muted');
    say('adb -s <ip>:5444 pull /sdcard/window_dump.xml · grep -o \'text="Orders"[^>]*\' window_dump.xml', 'muted');
    say('adb -s <ip>:5444 shell input tap <x> <y> · adb -s <ip>:5444 shell input keyevent KEYCODE_HOME', 'muted');
    return res();
  }
  if (cmd === 'grep') {
    const file = a[a.length - 1]!;
    const pat = a.filter((x, i) => i > 0 && i < a.length - 1 && !x.startsWith('-')).pop();
    const only = a.includes('-o');
    if (!pat) {
      say('Usage: grep [OPTION]... PATTERNS [FILE]...', 'err');
      return res();
    }
    if (!/(^|\/)window_dump\.xml$/.test(file) || st.local === null) {
      say(`grep: ${file}: No such file or directory`, 'err');
      return res();
    }
    let re: RegExp;
    try {
      re = new RegExp(pat, 'g');
    } catch {
      say(`grep: Unmatched ( or \\(`, 'err');
      return res();
    }
    // The dump is one long line: a real terminal prints all of it, so show the stretch around the first
    // match (not the file's head, where the match is never visible).
    const window400 = (text: string): string => {
      if (text.length <= 400) return text;
      const m = text.search(new RegExp(pat));
      const from = Math.max(0, m - 120);
      return `${from > 0 ? '…' : ''}${text.slice(from, from + 400)}${from + 400 < text.length ? '…' : ''}`;
    };
    const hits = only ? (st.local.match(re) ?? []) : re.test(st.local) ? [window400(st.local)] : [];
    for (const h of hits) say(h);
    if (hits.some((h) => h.includes(`text="${item.target}"`) && h.includes(`[${item.bounds[0]},${item.bounds[1]}][${item.bounds[2]},${item.bounds[3]}]`))) st.steps.bounds = true;
    return res();
  }
  if (cmd !== 'adb') {
    say(`${cmd}: command not found`, 'err');
    return res();
  }
  let i = 1;
  let target: string | null = null;
  if (a[i] === '-s') {
    target = a[i + 1] ?? null;
    i += 2;
  }
  const sub = a[i];
  const rest = a.slice(i + 1);
  if (sub === 'devices') {
    say('List of devices attached');
    for (const c of st.connected) say(`${c}\tdevice`);
    say('');
    return res();
  }
  if (sub === 'connect') {
    const hp = rest[0] ?? '';
    const [host, port = '5555'] = hp.split(':');
    if (!hp.includes(':')) collision = true;
    const t = `${host}:${port}`;
    if (port === '5444' && LAB.has(host!)) {
      if (st.connected.includes(t)) say(`already connected to ${t}`);
      else {
        st.connected.push(t);
        say(`connected to ${t}`, 'ok');
      }
      if (host === ip) st.steps.connect = true;
    } else if (host!.startsWith('10.42.60.') && port === '5555') {
      if (!st.connected.includes(t)) st.connected.push(t);
      say(`connected to ${t}`, 'warn');
    } else say(`failed to connect to '${t}': Connection refused`, 'err');
    return res();
  }
  if (sub === 'disconnect') {
    const t = rest[0];
    if (!t) {
      st.connected = [];
      say('disconnected everything');
    } else if (st.connected.includes(t)) {
      st.connected = st.connected.filter((c) => c !== t);
      say(`disconnected ${t}`);
    } else say(`error: no such device '${t}'`, 'err');
    return res();
  }
  // Commands that need a device.
  let tgt: string;
  if (target) {
    if (!st.connected.includes(target)) {
      say(`adb: device '${target}' not found`, 'err');
      return res();
    }
    tgt = target;
  } else if (!st.connected.length) {
    say('adb: no devices/emulators found', 'err');
    return res();
  } else if (st.connected.length > 1) {
    say('adb: more than one device/emulator', 'err');
    return res();
  } else tgt = st.connected[0]!;
  const devIp = tgt.split(':')[0]!;
  const dev = LAB.get(devIp);
  if (!dev) {
    // A coworker's desk device: the command would drive *their* screen.
    say(`(this is a coworker's desk device — ${tgt} — your command just ran on their screen)`, 'warn');
    collision = true;
    return res();
  }
  if (sub === 'pull') {
    const remote = rest[0] ?? '';
    if (remote !== '/sdcard/window_dump.xml' || st.dumps[devIp] === undefined) {
      say(`adb: error: failed to stat remote object '${remote}': No such file or directory`, 'err');
      return res();
    }
    st.local = st.dumps[devIp]!;
    say(`/sdcard/window_dump.xml: 1 file pulled. 0.4 MB/s (${st.local.length} bytes in 0.017s)`, 'ok');
    if (devIp === ip) st.steps.pull = true;
    return res();
  }
  if (sub === 'shell') {
    const s0 = rest[0];
    if (s0 === 'uiautomator' && rest[1] === 'dump') {
      st.dumps[devIp] = launcherXml(dev.type, st.open[devIp] ?? null);
      say('UI hierchary dumped to: /sdcard/window_dump.xml', 'ok');
      if (devIp === ip) st.steps.dump = true;
      return res();
    }
    if (s0 === 'cat' && rest[1] === '/sdcard/window_dump.xml') {
      const x = st.dumps[devIp];
      if (x === undefined) say('cat: /sdcard/window_dump.xml: No such file or directory', 'err');
      else say(x.length > 600 ? `${x.slice(0, 600)}…` : x);
      return res();
    }
    if (s0 === 'input' && rest[1] === 'keyevent') {
      if (['KEYCODE_HOME', '3'].includes(rest[2] ?? '')) st.open[devIp] = null;
      return res();
    }
    if (s0 === 'input' && rest[1] === 'tap') {
      const x = Number(rest[2]);
      const y = Number(rest[3]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        say('usage: input tap <x> <y>', 'err');
        return res();
      }
      if (st.open[devIp]) return { ...res(), tap: { x, y, hit: null } };
      const hit = launcher(dev.type).apps.find((p) => x >= p.l && x <= p.r && y >= p.t && y <= p.b) ?? null;
      if (hit) st.open[devIp] = hit.text;
      if (hit && devIp === ip && hit.text === item.target) {
        st.steps.tap = true;
        st.done = true;
      }
      const o = res();
      return { ...o, tap: { x, y, hit: hit?.text ?? null } };
    }
    say(`/system/bin/sh: ${s0 ?? ''}: inaccessible or not found`, 'err');
    return res();
  }
  say(`adb: unknown command ${sub ?? ''}`, 'err');
  return res();
}

/** Per target: (300 − 10 × seconds, min 50) × streak multiplier − 100 per `:5555`. */
export function targetPoints(seconds: number, port5555: number, streakBefore: number): number {
  const base = speedrunPoints(seconds, 0);
  return Math.round(base * streakMultiplier(streakBefore)) - 100 * port5555;
}

export const DR19: DrillDef<SpeedData> = {
  id: 'DR19',
  name: 'ADB Speedrun',
  format: 'Live terminal: adb connect :5444 → uiautomator dump → pull → find bounds → input tap; targets back-to-back, 120 s',
  tags: ['adb.usage', 'adb.port'],
  unlockedBy: ['M12'],
  durationS: 120,
  itemCount: null,
  medals: { bronze: 600, silver: 1100, gold: 1600 },
  scoring: 'custom',
  generate: (rng, state, index) => generateSpeedrun(rng, state, index),
  component: lazyDrill(() => import('./View'), '#63d443'),
};
