/**
 * `adb` on the workstation (Sim §3.15.1, Apps §5.4): server start lines, connect (port defaults to 5555),
 * devices [-l], disconnect, kill-server, start-server, version, and `-s <target> …` / single-device
 * commands. Device-side effects (taps, dumps, screencaps, getprop, logcat, tcpip) go through
 * `CoreServices.adbShell`; the server/connection list is `workstation.adbServerRunning/adbConnections`.
 */
import type { TerminalDevice, LabState } from '../types';
import { core } from '../devops/coreRef';
import { DEVICE_TYPES } from '../seed/deviceTypes';
import type { CmdResult, Line, Sh } from './session';
import { E, L, fail, ok, registerJob } from './session';

const ADB_PATH = '/home/engineer/Android/Sdk/platform-tools/adb';
const START_LINES = (): Line[] => [L('* daemon not running; starting now at tcp:5037'), L('* daemon started successfully')];

const USAGE: Line[] = [
  L('Android Debug Bridge version 1.0.41'),
  L('Version 35.0.1-11580240'),
  L(`Installed as ${ADB_PATH}`),
  L('Running on Linux 6.5.0-45-generic (x86_64)'),
  L(''),
  L('global options:'),
  L(' -s SERIAL  use device with given serial (overrides $ANDROID_SERIAL)'),
  L(''),
  L('general commands:'),
  L(' devices [-l]             list connected devices (-l for long output)'),
  L(''),
  L('networking:'),
  L(' connect HOST[:PORT]      connect to a device via TCP/IP [default port=5555]'),
  L(' disconnect [HOST[:PORT]] disconnect from given TCP/IP device [default port=5555], or all'),
  L(''),
  L('file transfer:'),
  L(' pull REMOTE... LOCAL     copy files/dirs from device'),
  L(''),
  L('shell:'),
  L(' shell [COMMAND...]       run remote shell command'),
  L(' exec-out COMMAND         run command on device, with stdout written to the host'),
  L(''),
  L('debugging:'),
  L(' logcat                   show device log (logcat --help for more)'),
  L(''),
  L('internal debugging:'),
  L(' start-server             ensure that there is a server running'),
  L(' kill-server              kill the server if it is running'),
];

function deviceOf(lab: LabState, target: string): TerminalDevice | null {
  const c = lab.workstation.adbConnections.find((x) => x.target === target);
  return c?.deviceId ? (lab.devices[c.deviceId] ?? null) : null;
}

function connState(lab: LabState, target: string): 'device' | 'offline' {
  const d = deviceOf(lab, target);
  const port = Number(target.slice(target.lastIndexOf(':') + 1));
  return d && d.power === 'on' && d.adbTcpPort === port ? 'device' : 'offline';
}

/** `adb devices [-l]` lines (adb prints a trailing blank line). */
export function devicesLines(lab: LabState, long: boolean): Line[] {
  const out: Line[] = [L('List of devices attached')];
  lab.workstation.adbConnections.forEach((c, i) => {
    const state = connState(lab, c.target);
    if (!long) {
      out.push(L(`${c.target}\t${state}`));
      return;
    }
    const d = deviceOf(lab, c.target);
    const info = d ? DEVICE_TYPES[d.type] : null;
    const product = d ? d.type.toLowerCase().replace(/_/g, '') : 'unknown';
    const model = (info?.modelString ?? 'unknown').replace(/\s+/g, '_');
    out.push(L(`${c.target.padEnd(22)} ${state} product:${product} model:${model} device:${product} transport_id:${i + 1}`));
  });
  out.push(L(''));
  return out;
}

function disconnect(sh: Sh, target: string | null): CmdResult {
  const ws = sh.lab.workstation;
  if (!target) {
    const all = ws.adbConnections.map((c) => c.target);
    ws.adbConnections = [];
    for (const t of all) sh.ctx.emit('adb.disconnected', { target: t });
    return ok(L('disconnected everything'));
  }
  const t = /:\d+$/.test(target) ? target : `${target}:5555`;
  if (!ws.adbConnections.some((c) => c.target === t)) return fail(1, E(`error: no such device '${t}'`));
  ws.adbConnections = ws.adbConnections.filter((c) => c.target !== t);
  sh.ctx.emit('adb.disconnected', { target: t });
  return ok(L(`disconnected ${t}`));
}

function killServer(sh: Sh): CmdResult {
  const ws = sh.lab.workstation;
  for (const c of ws.adbConnections) sh.ctx.emit('adb.disconnected', { target: c.target });
  ws.adbConnections = [];
  ws.adbServerRunning = false;
  return ok();
}

/** Write a pulled/captured file to the workstation (relative paths from the cwd). */
export type WsWriter = (pathFromCwd: string, contents: string) => string | null;

export function adb(sh: Sh, argv: string[], writeFile: WsWriter): CmdResult {
  const lab = sh.lab;
  const ws = lab.workstation;
  let args = argv.slice(1);
  if (!args.length || args[0] === 'help' || args[0] === '--help') return { lines: USAGE, code: args.length ? 0 : 1 };
  if (args[0] === 'version' || args[0] === '--version') return ok(...USAGE.slice(0, 4));
  if (args[0] === 'kill-server') return killServer(sh);
  const pre: Line[] = [];
  if (!ws.adbServerRunning) {
    pre.push(...START_LINES());
    ws.adbServerRunning = true;
  }
  const withPre = (r: CmdResult): CmdResult => ({ ...r, lines: [...pre, ...r.lines] });
  let target: string | null = null;
  while (args[0] === '-s' || args[0] === '-d' || args[0] === '-e' || args[0] === '-t') {
    if (args[0] === '-s') {
      if (!args[1]) return withPre(fail(1, E('adb: -s requires an argument')));
      target = args[1];
      args = args.slice(2);
    } else if (args[0] === '-t') args = args.slice(2);
    else {
      if (args[0] === '-d') return withPre(fail(1, E('adb: no devices/emulators found')));
      args = args.slice(1);
    }
  }
  const sub = args[0];
  if (!sub) return withPre({ lines: USAGE, code: 1 });
  switch (sub) {
    case 'start-server':
      return withPre(ok());
    case 'devices':
      return withPre(ok(...devicesLines(lab, args.includes('-l'))));
    case 'connect': {
      const t = args[1];
      if (!t) return withPre(fail(1, E('adb: usage: adb connect HOST[:PORT]')));
      const r = core().adbConnect(lab, sh.ctx, t);
      return withPre(r.ok ? ok(L(r.line)) : fail(1, L(r.line)));
    }
    case 'disconnect':
      return withPre(disconnect(sh, args[1] ?? null));
    case 'reconnect':
      return withPre(ok(...ws.adbConnections.map((c) => L(`reconnecting ${c.target} [${connState(lab, c.target)}]`))));
    case 'get-state':
    case 'get-serialno': {
      const tt = pickTarget(lab, target);
      if (typeof tt !== 'string') return withPre(tt);
      if (sub === 'get-state') return withPre(connState(lab, tt) === 'device' ? ok(L('device')) : fail(1, E(`error: device offline`)));
      return withPre(ok(L(tt)));
    }
    default:
      break;
  }
  if (!['shell', 'exec-out', 'pull', 'logcat', 'tcpip', 'push', 'install', 'reboot', 'usb', 'root', 'bugreport'].includes(sub)) {
    return withPre(fail(1, E(`adb: unknown command ${sub}`)));
  }
  const tt = pickTarget(lab, target);
  if (typeof tt !== 'string') return withPre(tt);
  if (connState(lab, tt) === 'offline') return withPre(fail(1, E('adb: device offline')));
  const rest = args;
  // Interactive shell: not available inside the simulated terminal — real adb would open `$`.
  if (sub === 'shell' && rest.length === 1) return withPre(fail(1, E('adb: interactive shells are not supported here — pass the command, e.g. adb -s <target> shell uiautomator dump')));
  if (sub === 'shell' && (rest[1] === 'cat' || rest[1] === 'ls')) return withPre(sdcardCmd(sh, tt, rest.slice(1)));
  if (sub === 'logcat' && !rest.includes('-d') && !rest.includes('-c')) return withPre(streamLogcat(sh, tt));
  if (sub === 'pull') {
    const r = core().adbShell(lab, sh.ctx, tt, rest, 'terminal');
    if (!r.ok) return withPre(fail(1, ...r.lines.map(E)));
    if (r.file) {
      const e = writeFile(rest[2] ?? r.file.path, r.file.contents);
      if (e) return withPre(fail(1, E(`adb: error: cannot create '${rest[2] ?? r.file.path}': ${e}`)));
    }
    return withPre(ok(...r.lines.map((x) => L(x))));
  }
  const r = core().adbShell(lab, sh.ctx, tt, rest, 'terminal');
  if (!r.ok) return withPre({ lines: r.lines.map(E), code: 1 });
  const out: CmdResult = { lines: r.lines.map((x) => L(x)), code: 0 };
  if (r.file) {
    if (sub === 'exec-out') out.binary = r.file.contents;
    else if (sub === 'shell') {
      // `adb shell screencap /sdcard/x.png` stores the image on the device for a later `adb pull`.
      const d = deviceOf(lab, tt);
      if (d) d.sdcard = { ...(d.sdcard ?? {}), [r.file.path]: r.file.contents };
    }
  }
  return withPre(out);
}

function pickTarget(lab: LabState, target: string | null): string | CmdResult {
  const conns = lab.workstation.adbConnections;
  if (target) {
    if (conns.some((c) => c.target === target)) return target;
    const bySerial = conns.find((c) => c.deviceId && lab.devices[c.deviceId]?.serial === target);
    if (bySerial) return bySerial.target;
    return fail(1, E(`adb: device '${target}' not found`));
  }
  if (!conns.length) return fail(1, E('adb: no devices/emulators found'));
  if (conns.length > 1) return fail(1, E('adb: more than one device/emulator'));
  return conns[0]!.target;
}

/** `adb shell cat|ls` over the device's `/sdcard` (UI Automator dumps, screenshots). */
function sdcardCmd(sh: Sh, target: string, argv: string[]): CmdResult {
  const d = deviceOf(sh.lab, target);
  if (!d) return fail(1, E(`adb: device '${target}' not found`));
  const card = d.sdcard ?? {};
  sh.ctx.emit('adb.command', { target, command: `shell ${argv.join(' ')}`, ok: true });
  if (argv[0] === 'ls') {
    const dir = (argv.slice(1).find((a) => !a.startsWith('-')) ?? '/sdcard').replace(/\/$/, '');
    const names = Object.keys(card).filter((p) => p.startsWith(`${dir}/`)).map((p) => p.slice(dir.length + 1)).filter((p) => !p.includes('/'));
    const std = dir === '/sdcard' ? ['Alarms', 'DCIM', 'Download', 'Movies', 'Music', 'Notifications', 'Pictures', 'Podcasts', 'Ringtones'] : [];
    if (!std.length && !names.length) return fail(1, E(`ls: ${dir}: No such file or directory`));
    return ok(...[...std, ...names].sort().map((n) => L(n)));
  }
  const files = argv.slice(1);
  if (!files.length) return ok();
  const out: Line[] = [];
  let code = 0;
  for (const f of files) {
    const t = card[f];
    if (t === undefined) {
      out.push(E(`cat: ${f}: No such file or directory`));
      code = 1;
    } else if (t.startsWith('img:')) out.push(L('\u0089PNG'), L('\u001a'));
    else out.push(...t.split('\n').filter((l, i, a) => l || i < a.length - 1).map((l) => L(l)));
  }
  return { lines: out, code };
}

function streamLogcat(sh: Sh, target: string): CmdResult {
  const first = core().adbShell(sh.lab, sh.ctx, target, ['logcat', '-d'], 'terminal');
  let seen = first.lines.length;
  const deviceId = deviceOf(sh.lab, target)?.id ?? null;
  const job = registerJob({
    step(s) {
      if (!deviceId) return { lines: [], done: true, exitCode: 1 };
      const d = s.lab.devices[deviceId];
      if (!d || d.power !== 'on') return { lines: [E('- waiting for device -')], done: true, exitCode: 1 };
      const all = d.logcat;
      if (all.length < seen) seen = 0;
      const lines = all.slice(seen).map((x) => L(x));
      seen = all.length;
      return { lines, done: false, exitCode: null };
    },
  });
  return { lines: first.lines.map((x) => L(x)), code: 0, stream: job };
}
