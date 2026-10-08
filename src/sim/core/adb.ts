/**
 * Workstation ADB server state and device-side ADB behaviour (Sim §3.15): `adb connect` (5444 vs the
 * 5555 default, coworker desk devices), `adb -s … shell|exec-out|pull|logcat|tcpip`, UI Automator
 * hierarchy dumps (Sim §3.11: 2.2 sees the MFD only; 2.3 `displayId` reaches a Duo CFD).
 * The terminal parsing is sim-devops'; these functions own the state transitions (CoreServices).
 */
import type { TerminalDevice, LabState } from '../types';
import type { AdbShellResult } from '../devops';
import type { Ctx } from './util';
import { reach, resolve } from './network';
import { DEVICE_TYPES, screenOf } from '../seed/deviceTypes';
import { deviceStroke, deviceTouch, dispOf, liveElements, pressKey, enterText, press } from './devices';
import { captureScreencap } from './ocr';
import { addTimer } from './util';

const COWORKER_NET = '10.42.60.';

/** `adb connect <target>` from the workstation (port defaults to 5555). */
export function adbConnect(lab: LabState, ctx: Ctx, target: string): { line: string; ok: boolean } {
  const ws = lab.workstation;
  ws.adbServerRunning = true;
  const t = /:\d+$/.test(target.trim()) ? target.trim() : `${target.trim()}:5555`;
  if (ws.adbConnections.some((c) => c.target === t)) return { line: `already connected to ${t}`, ok: true };
  const [ip, portStr] = [t.slice(0, t.lastIndexOf(':')), t.slice(t.lastIndexOf(':') + 1)];
  const r = reach(lab, 'ws-17', ip, Number(portStr));
  if (!r.ok) {
    const why = r.kind === 'no-route' ? 'No route to host' : r.kind === 'timeout' ? 'Connection timed out' : 'Connection refused';
    ctx.emit('adb.command', { target: t, command: `connect ${t}`, ok: false });
    return { line: `failed to connect to '${t}': ${why}`, ok: false };
  }
  if (!r.deviceId) {
    ctx.emit('adb.command', { target: t, command: `connect ${t}`, ok: false });
    return { line: `failed to connect to '${t}': Connection refused`, ok: false };
  }
  const coworker = ip.startsWith(COWORKER_NET);
  ws.adbConnections.push({ target: t, hostId: null, deviceId: r.deviceId, state: 'device', coworker });
  ctx.emit('adb.connected', { target: t, deviceId: r.deviceId, coworker });
  return { line: `connected to ${t}`, ok: true };
}

export function adbDisconnect(lab: LabState, ctx: Ctx, target: string | null): string[] {
  const ws = lab.workstation;
  if (!target) {
    const all = ws.adbConnections.map((c) => c.target);
    ws.adbConnections = [];
    for (const t of all) ctx.emit('adb.disconnected', { target: t });
    return ['disconnected everything'];
  }
  const t = /:\d+$/.test(target) ? target : `${target}:5555`;
  if (!ws.adbConnections.some((c) => c.target === t)) return [`error: no such device '${t}'`];
  ws.adbConnections = ws.adbConnections.filter((c) => c.target !== t);
  ctx.emit('adb.disconnected', { target: t });
  return [`disconnected ${t}`];
}

/** `adb kill-server`: connections are not remembered (Sim §3.15.1). */
export function adbKillServer(lab: LabState, ctx: Ctx): void {
  for (const c of lab.workstation.adbConnections) ctx.emit('adb.disconnected', { target: c.target });
  lab.workstation.adbConnections = [];
  lab.workstation.adbServerRunning = false;
}

/** `adb devices` lines; offline connections (device went dark) print `offline`. */
export function adbDevicesLines(lab: LabState): string[] {
  const out = ['List of devices attached'];
  for (const c of lab.workstation.adbConnections) {
    const d = c.deviceId ? lab.devices[c.deviceId] : undefined;
    const state = d && d.power === 'on' && d.adbTcpPort === Number(c.target.split(':')[1]) ? 'device' : 'offline';
    out.push(`${c.target}\t${state}`);
  }
  return out;
}

function deviceForTarget(lab: LabState, target: string): TerminalDevice | null {
  const conn = lab.workstation.adbConnections.find((c) => c.target === target || (c.deviceId && lab.devices[c.deviceId]?.serial === target));
  if (conn?.deviceId) return lab.devices[conn.deviceId] ?? null;
  const bySerial = Object.values(lab.devices).find((d) => d.serial === target);
  return bySerial ?? null;
}

const KEYCODES: Record<string, 'HOME' | 'WAKEUP' | 'ENTER' | 'BACK'> = {
  KEYCODE_HOME: 'HOME',
  '3': 'HOME',
  KEYCODE_WAKEUP: 'WAKEUP',
  '224': 'WAKEUP',
  KEYCODE_ENTER: 'ENTER',
  '66': 'ENTER',
  KEYCODE_BACK: 'BACK',
  '4': 'BACK',
};

function pxToMm(d: TerminalDevice, x: number, y: number): { xMm: number; yMm: number } {
  const s = screenOf(d.type, 'primary');
  return { xMm: x / s.px.x, yMm: y / s.px.y };
}

/**
 * `adb -s <target> <argv…>` (argv after the target, e.g. ['shell','input','tap','192','508']).
 * Drives coworker devices too (counts + `adb.coworkerDriven`, Sim §3.15.1).
 */
export function adbShell(lab: LabState, ctx: Ctx, target: string, argv: string[], by: 'terminal' | 'runner'): AdbShellResult {
  const done = (ok: boolean, lines: string[], file?: { path: string; contents: string }): AdbShellResult => {
    ctx.emit('adb.command', { target, command: argv.join(' '), ok });
    return file ? { ok, lines, file } : { ok, lines };
  };
  const d = deviceForTarget(lab, target);
  if (!d) return done(false, [`adb: device '${target}' not found`]);
  if (d.power !== 'on') return done(false, ['error: device offline']);
  // USB targets (serial) are only reachable from a host with the device on USB; TCP targets need the port.
  const conn = lab.workstation.adbConnections.find((c) => c.target === target);
  if (conn) {
    const port = Number(conn.target.split(':')[1]);
    if (d.adbTcpPort !== port) return done(false, ['error: device offline']);
  }
  const drives = (cmd: string) => {
    if (d.ip.startsWith(COWORKER_NET)) {
      lab.workstation.coworkerDevicesDisturbed += 1;
      ctx.emit('adb.coworkerDriven', { target, deviceId: d.id, command: cmd, by });
    }
  };
  const [a0, a1, a2, ...rest] = argv;
  if (a0 === 'shell' && a1 === 'uiautomator' && a2 === 'dump') {
    const path = rest[0] ?? '/sdcard/window_dump.xml';
    d.sdcard = { ...(d.sdcard ?? {}), [path]: uiDump(lab, d.id, 'primary') };
    return done(true, [`UI hierchary dumped to: ${path}`]);
  }
  if (a0 === 'pull' && a1) {
    const content = d.sdcard?.[a1];
    if (content == null) return done(false, [`adb: error: failed to stat remote object '${a1}': No such file or directory`]);
    const local = a2 ?? a1.replace(/^.*\//, '');
    return done(true, [`${a1}: 1 file pulled. 0.4 MB/s (${content.length} bytes in 0.017s)`], { path: local, contents: content });
  }
  if (a0 === 'shell' && a1 === 'input') {
    const sub = a2;
    if (sub === 'tap' && rest.length >= 2) {
      const mm = pxToMm(d, Number(rest[0]), Number(rest[1]));
      drives(argv.join(' '));
      deviceTouch(lab, ctx, d.id, 'primary', mm.xMm, mm.yMm, 'adb');
      return done(true, []);
    }
    if (sub === 'swipe' && rest.length >= 4) {
      const p1 = pxToMm(d, Number(rest[0]), Number(rest[1]));
      const p2 = pxToMm(d, Number(rest[2]), Number(rest[3]));
      drives(argv.join(' '));
      deviceStroke(lab, ctx, d.id, 'primary', [p1, p2], 'adb');
      return done(true, []);
    }
    if (sub === 'keyevent' && rest[0]) {
      const k = KEYCODES[rest[0]];
      if (!k) return done(true, []);
      drives(argv.join(' '));
      pressKey(lab, ctx, d, k, 'adb');
      return done(true, []);
    }
    if (sub === 'text' && rest[0] != null) {
      drives(argv.join(' '));
      enterText(lab, ctx, d, rest.join(' '), 'adb');
      return done(true, []);
    }
    return done(false, ['Usage: input [<source>] <command> [<arg>...]']);
  }
  if ((a0 === 'exec-out' && a1 === 'screencap') || (a0 === 'shell' && a1 === 'screencap')) {
    const ref = captureScreencap(lab, d.id);
    return done(true, [], { path: a0 === 'shell' ? (rest.find((x) => x.startsWith('/')) ?? '/sdcard/screen.png') : 'screencap.png', contents: ref });
  }
  if (a0 === 'shell' && a1 === 'getprop') {
    const info = DEVICE_TYPES[d.type];
    const props: Record<string, string> = { 'ro.product.model': info.modelString ?? info.displayName, 'ro.serialno': d.serial, 'ro.build.version.release': '10', 'ro.product.manufacturer': 'LabSim' };
    if (!a2) return done(true, Object.entries(props).map(([k, v]) => `[${k}]: [${v}]`));
    return done(true, [props[a2] ?? '']);
  }
  if (a0 === 'logcat') {
    if (a1 === '-c') {
      d.logcat = [];
      return done(true, []);
    }
    return done(true, [...d.logcat]);
  }
  if (a0 === 'tcpip' && a1) {
    const port = Number(a1);
    if (!Number.isInteger(port)) return done(false, [`error: bad port number '${a1}'`]);
    addTimer(lab, 'device.adbTcp', 'phys', 1_000, { device: d.id, port });
    return done(true, [`restarting in TCP mode port: ${port}`]);
  }
  if (a0 === 'shell' && a1 === 'am' && a2 === 'start') {
    drives(argv.join(' '));
    if (/register/i.test(rest.join(' ')) && d.display.screen === 'home') press(lab, ctx, d, 'primary', 'Register');
    return done(true, [`Starting: Intent { cmp=${rest[rest.length - 1] ?? ''} }`]);
  }
  if (a0 === 'shell' && a1 === 'wm' && a2 === 'size') {
    const s = screenOf(d.type, 'primary');
    return done(true, [`Physical size: ${s.wPx}x${s.hPx}`]);
  }
  if (a0 === 'shell' && a1 === 'dumpsys' && a2 === 'display') {
    const lines = [`Display 0: ${DEVICE_TYPES[d.type].displayName} built-in screen (MFD)`];
    if (d.secondaryDisplay) lines.push('Display 1: customer display (CFD) — not exposed to UI Automator < 2.3');
    return done(true, lines);
  }
  if (a0 === 'shell' && a1) return done(false, [`/system/bin/sh: ${a1}: not found`]);
  return done(false, [`adb: unknown command ${a0 ?? ''}`]);
}

const xmlEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const resId = (pkg: string, id: string) => `${pkg}:id/${id.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'label'}`;

function packageOf(screen: string): string {
  if (screen === 'home' || screen === 'lock') return 'com.labsim.launcher';
  if (screen.startsWith('oobe-') || screen === 'deprovisioning') return 'com.labsim.setup';
  if (['register', 'review-order', 'tender-select'].includes(screen)) return 'com.labsim.register';
  if (screen.startsWith('app-')) return `com.labsim.${screen.slice(4)}`;
  return 'com.labsim.payment';
}

/**
 * UI Automator hierarchy XML of a display (Sim §3.11, §3.15.1): one `<node>` per visible button/label,
 * device-px bounds. A Duo's secondary display is visible only with `flags.uiaVersion == '2.3'`
 * (displayId 1); Secure Touch PIN keys are never in the hierarchy.
 */
export function uiDump(lab: LabState, deviceId: string, display: 'primary' | 'secondary'): string {
  const d = lab.devices[deviceId];
  const head = "<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>";
  if (!d || d.power !== 'on') return `${head}<hierarchy rotation="0"></hierarchy>`;
  if (display === 'secondary' && (lab.flags.uiaVersion !== '2.3' || !d.secondaryDisplay)) return `${head}<hierarchy rotation="0"></hierarchy>`;
  const ds = dispOf(d, display)!;
  const s = screenOf(d.type, display);
  const pkg = packageOf(ds.screen);
  const secure = ds.screen === 'pin-entry';
  const nodes: string[] = [];
  let i = 0;
  for (const e of liveElements(lab, d, display)) {
    if (e.kind === 'qr') continue;
    if (secure && e.kind === 'button') continue;
    const l = Math.round((e.x - e.w / 2) * s.px.x);
    const t = Math.round((e.y - e.h / 2) * s.px.y);
    const r = Math.round((e.x + e.w / 2) * s.px.x);
    const b = Math.round((e.y + e.h / 2) * s.px.y);
    const cls = e.kind === 'button' ? 'android.widget.Button' : e.kind === 'pad' ? 'android.view.View' : 'android.widget.TextView';
    const text = e.kind === 'pad' ? '' : e.text;
    nodes.push(`<node index="${i++}" text="${xmlEsc(text)}" resource-id="${resId(pkg, e.kind === 'label' ? `label_${i}` : e.id)}" class="${cls}" package="${pkg}" content-desc="" checkable="false" checked="false" clickable="${e.kind !== 'label'}" enabled="${e.enabled}" focusable="${e.kind !== 'label'}" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[${l},${t}][${r},${b}]" />`);
  }
  if (secure) nodes.push(`<node index="${i++}" text="" resource-id="com.labsim.payment:id/secure_pin_pad" class="android.view.SurfaceView" package="com.labsim.payment" content-desc="Secure input" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="true" selected="false" bounds="[0,0][${s.wPx},${s.hPx}]" />`);
  const disp = display === 'secondary' ? ' displayId="1"' : '';
  return `${head}<hierarchy rotation="0"${disp}><node index="0" text="" resource-id="" class="android.widget.FrameLayout" package="${pkg}" content-desc="" checkable="false" checked="false" clickable="false" enabled="true" focusable="false" focused="false" scrollable="false" long-clickable="false" password="false" selected="false" bounds="[0,0][${s.wPx},${s.hPx}]">${nodes.join('')}</node></hierarchy>`;
}

/** Who answers `ip:port` from the workstation (devops' 5555 fallback logic reads `adbConnections[0]`). */
export function adbTargetDevice(lab: LabState, target: string): string | null {
  return resolve(lab, target).deviceId;
}
