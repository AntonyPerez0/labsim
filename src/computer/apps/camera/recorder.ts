/**
 * Camera recorder (Apps §8.6): while a Jenkins build or a local IntelliJ run drives a robot that has a Camera
 * Stream URL, record 2 fps 480×270 JPEG frames plus the rig/device/runner events (stamped with the frame
 * index). Keeps the last 8 recordings in memory. Runs while the desktop is closed (started by initComputer).
 * UI-level timers are fine here: nothing a lesson observes depends on them (the recorded events carry sim data).
 */
import { bus } from '@/core/bus';
import { getState } from '@/core/store';
import type { LabState, OrcaRobot } from '@/sim/types';
import { getWindowManager } from '@/computer/apps';
import { drawStreamFrame, cameraDefForUrl } from './frames';

export type RecEventKind = 'tap' | 'solenoid' | 'touch' | 'screen' | 'step';

export interface RecEvent {
  kind: RecEventKind;
  frame: number;
  physMs: number;
  /** tap: commanded screen/button, ok, hitButton, x/y mm, mode. */
  screen?: string;
  button?: string;
  xMm?: number;
  yMm?: number;
  mode?: string;
  ok?: boolean;
  hitButton?: string | null;
  /** screen change: from → to. */
  from?: string;
  to?: string;
  /** device + display for the Tap analysis render. */
  deviceId?: string | null;
  display?: 'primary' | 'secondary';
  /** runner step label / detail. */
  label?: string;
  /** Raw line (`xy_touch eve RECEIPT_OPTIONS_5/Print → PHYSICAL_TAP (34.0, 71.0) · hit: none`). */
  line?: string;
  /** Device display state at the event (Tap analysis renders this screen). */
  disp?: { screen: string; params: Record<string, string | number | boolean>; receiptOptions?: 4 | 5 } | null;
}

export interface RecFrame {
  dataUrl: string;
  physMs: number;
}

export interface Recording {
  id: string;
  buildId: string | null;
  runId: string | null;
  label: string;
  robotName: string;
  url: string;
  cameraId: string | null;
  startedMs: number;
  startedPhysMs: number;
  endedMs: number | null;
  result: string | null;
  frames: RecFrame[];
  events: RecEvent[];
  recording: boolean;
}

const MAX_RECORDINGS = 8;
const MAX_FRAMES = 150;
const FRAME_W = 480;
const FRAME_H = 270;

let recordings: Recording[] = [];
let version = 0;
const listeners = new Set<() => void>();
let seq = 0;

function changed(): void {
  version++;
  recordings = [...recordings];
  for (const fn of [...listeners]) fn();
}

export function getRecordings(): Recording[] {
  return recordings;
}

export function recordingsVersion(): number {
  return version;
}

export function subscribeRecordings(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function findRecording(idOrBuild: string): Recording | null {
  return recordings.find((r) => r.id === idOrBuild || r.buildId === idOrBuild || r.runId === idOrBuild) ?? null;
}

/** True while `url` is being recorded (● REC overlay). */
export function isRecording(url: string): boolean {
  const u = url.toLowerCase();
  return recordings.some((r) => r.recording && r.url.toLowerCase() === u);
}

const timers = new Map<string, number>();
let scratch: HTMLCanvasElement | null = null;

function lowQualityHeadless(): boolean {
  const q = getState().progress?.settings?.quality;
  const camOpen = getWindowManager()?.windows().some((w) => w.app === 'camera' && !w.minimized) ?? false;
  return q === 'low' && !camOpen;
}

function grab(rec: Recording, lab: LabState): void {
  if (typeof document === 'undefined') return;
  try {
    scratch ??= document.createElement('canvas');
    scratch.width = FRAME_W;
    scratch.height = FRAME_H;
    const ctx = scratch.getContext('2d');
    if (!ctx) return;
    // Background recording runs during every build: the cheap frame-model render, not an extra 3D pass.
    drawStreamFrame(ctx, lab, rec.url, rec.cameraId, false);
    const dataUrl = scratch.toDataURL('image/jpeg', 0.6);
    rec.frames.push({ dataUrl, physMs: lab.time.physMs });
    if (rec.frames.length > MAX_FRAMES) {
      // thin the older half to 1 fps
      const half = Math.floor(rec.frames.length / 2);
      rec.frames = rec.frames.slice(0, half).filter((_, i) => i % 2 === 0).concat(rec.frames.slice(half));
      const remap = rec.frames.length;
      for (const e of rec.events) e.frame = Math.min(e.frame, remap - 1);
    }
  } catch (err) {
    console.warn('[camera] recorder frame failed', err);
  }
}

function start(robot: OrcaRobot, buildId: string | null, runId: string | null, label: string): void {
  const url = (robot.cameraStreamUrl ?? '').trim();
  if (!url) return;
  if (recordings.some((r) => r.recording && ((buildId && r.buildId === buildId) || (runId && r.runId === runId)))) return;
  const lab = getState().lab;
  const rec: Recording = {
    id: `rec-${++seq}`,
    buildId,
    runId,
    label,
    robotName: robot.name,
    url,
    cameraId: cameraDefForUrl(url)?.id ?? null,
    startedMs: lab.time.nowMs,
    startedPhysMs: lab.time.physMs,
    endedMs: null,
    result: null,
    frames: [],
    events: [],
    recording: true,
  };
  recordings = [rec, ...recordings].slice(0, MAX_RECORDINGS);
  grab(rec, lab);
  if (typeof window !== 'undefined') {
    const t = window.setInterval(() => {
      if (!rec.recording) return;
      if (lowQualityHeadless()) return;
      grab(rec, getState().lab);
      changed();
    }, 500);
    timers.set(rec.id, t);
  }
  changed();
}

function stop(match: (r: Recording) => boolean, result: string | null): void {
  for (const rec of recordings) {
    if (!rec.recording || !match(rec)) continue;
    rec.result = result;
    const finish = () => {
      rec.recording = false;
      rec.endedMs = getState().lab.time.nowMs;
      const t = timers.get(rec.id);
      if (t != null && typeof window !== 'undefined') window.clearInterval(t);
      timers.delete(rec.id);
      grab(rec, getState().lab);
      changed();
    };
    if (typeof window !== 'undefined') window.setTimeout(finish, 2000);
    else finish();
  }
}

function addEvent(match: (r: Recording) => boolean, e: Omit<RecEvent, 'frame' | 'physMs'>): void {
  const lab = getState().lab;
  if (e.deviceId && e.disp === undefined) {
    const d = lab.devices[e.deviceId]?.[e.display === 'secondary' ? 'secondaryDisplay' : 'display'] as { screen: string; params: Record<string, string | number | boolean>; receiptOptions?: 4 | 5 } | null | undefined;
    e = { ...e, disp: d ? { screen: d.screen, params: { ...d.params }, receiptOptions: d.receiptOptions } : null };
  }
  let any = false;
  for (const rec of recordings) {
    if (!rec.recording || !match(rec)) continue;
    if (lowQualityHeadless()) grab(rec, lab);
    rec.events.push({ ...e, frame: Math.max(0, rec.frames.length - 1), physMs: lab.time.physMs });
    any = true;
  }
  if (any) changed();
}

function robotByName(name: string): OrcaRobot | null {
  return Object.values(getState().lab.orca.robots).find((r) => r.name === name) ?? null;
}

let stopAll: (() => void) | null = null;

/** Idempotent; returns a disposer. */
export function startRecorder(): () => void {
  if (stopAll) return stopAll;
  const offs: (() => void)[] = [];
  offs.push(
    // A new lesson / shift / Free Play run re-seeds the lab: the last activity's recordings refer to
    // builds and runs that no longer exist, so the list starts empty.
    bus.on('session.started', () => {
      for (const t of timers.values()) if (typeof window !== 'undefined') window.clearInterval(t);
      timers.clear();
      if (recordings.length) {
        recordings = [];
        changed();
      }
    }),
    bus.on('jenkins.buildStarted', (e) => {
      if (e.robotId == null) return;
      const r = getState().lab.orca.robots[e.robotId];
      if (r) start(r, e.buildId, null, buildLabel(e.buildId));
    }),
    bus.on('robot.checkedOut', (e) => {
      if (e.kind === 'manual') return;
      const r = getState().lab.orca.robots[e.robotId];
      if (!r) return;
      if (e.kind === 'local' || e.buildId.startsWith('run-')) start(r, null, e.buildId, `Local run · ${e.buildId}`);
      else start(r, e.buildId, null, buildLabel(e.buildId));
    }),
    bus.on('test.localRunStarted', (e) => {
      if (!e.robotName) return;
      const r = robotByName(e.robotName);
      if (r) start(r, null, e.runId, `${e.testName} (local run)`);
    }),
    bus.on('jenkins.buildFinished', (e) => stop((r) => r.buildId === e.buildId, e.result)),
    bus.on('test.localRunFinished', (e) => stop((r) => r.runId === e.runId, e.passed ? 'PASSED' : 'FAILED')),
    bus.on('orca.xyTouch', (e) => {
      const hit = e.hitButton;
      const mode = e.orcaMode ?? (e.mode === 'adb' ? 'ADB_TOUCH' : 'PHYSICAL_TAP');
      const rig = getState().lab.rigs[e.robotName];
      const deviceId = rig?.deviceIds?.[e.target === 'CFD' ? 1 : 0] ?? null;
      addEvent((r) => r.robotName === e.robotName, {
        kind: 'tap',
        screen: e.screen,
        button: e.button,
        xMm: e.xMm,
        yMm: e.yMm,
        mode,
        ok: e.ok,
        hitButton: hit,
        deviceId,
        display: 'primary',
        line: `xy_touch ${e.robotName} ${e.screen}/${e.button} → ${mode} (${e.xMm.toFixed(1)}, ${e.yMm.toFixed(1)}) · hit: ${hit ?? 'none'}`,
      });
    }),
    bus.on('rig.solenoidTap', (e) =>
      addEvent((r) => r.robotName === e.rigId, { kind: 'solenoid', xMm: e.xMm, yMm: e.yMm, hitButton: e.hitButton ?? null, deviceId: e.deviceId ?? null, label: e.result ?? 'TAP' }),
    ),
    bus.on('device.touched', (e) => {
      const rigId = getState().lab.devices[e.deviceId]?.rigId ?? null;
      if (!rigId) return;
      addEvent((r) => r.robotName === rigId, { kind: 'touch', xMm: e.xMm, yMm: e.yMm, hitButton: e.hitButton, deviceId: e.deviceId, display: e.display, screen: e.screen, mode: e.source });
    }),
    bus.on('device.screenChanged', (e) => {
      const rigId = getState().lab.devices[e.deviceId]?.rigId ?? null;
      if (!rigId) return;
      addEvent((r) => r.robotName === rigId, { kind: 'screen', from: e.from, to: e.to, deviceId: e.deviceId, display: e.display });
    }),
    bus.on('runner.step', (e) => {
      if (!e.buildId && !e.runId) return;
      addEvent((r) => (!!e.buildId && r.buildId === e.buildId) || r.runId === e.runId, { kind: 'step', label: e.step, ok: e.ok, line: e.detail });
    }),
  );
  stopAll = () => {
    for (const off of offs) off();
    for (const t of timers.values()) if (typeof window !== 'undefined') window.clearInterval(t);
    timers.clear();
    stopAll = null;
  };
  return stopAll;
}

function buildLabel(buildId: string): string {
  const [job, n] = buildId.split('#');
  return `#${n} · ${job}`;
}

/** Test helper. */
export function _resetRecordings(): void {
  recordings = [];
  changed();
}
