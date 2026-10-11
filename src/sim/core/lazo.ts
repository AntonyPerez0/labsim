/**
 * Lazo Automation zero-touch OOBE merchant swap and Ubo routing (Sim §3.17), plus the 3D printers
 * (Sim §3.24). Step durations are physical; console lines are exact (Cur M08).
 */
import type { LabState, LazoRun, LazoStep } from '../types';
import type { Actor, Result } from '../api';
import type { Ctx, SubStep } from './util';
import { log } from './util';
import { BASE_APPS } from '../seed/merchants';
import { provisionDevice, setScreen } from './devices';
import { reach } from './network';
import { ro } from './ro';

const STEP_MS: Record<string, number> = { 'ubo-route': 2_000, deprovision: 8_000, 'wipe-cache': 6_000, 'setup-wizard': 5_000, 'assign-merchant': 3_000, 'restore-adb': 2_000, verify: 2_000 };
const ORDER: LazoStep[] = ['ubo-route', 'deprovision', 'wipe-cache', 'setup-wizard', 'assign-merchant', 'restore-adb', 'verify', 'done'];
const WIZARD = ['oobe-welcome', 'oobe-network', 'oobe-merchant', 'oobe-employee', 'oobe-payments', 'oobe-complete'] as const;

function rigPiOf(lab: LabState, deviceId: string): string | null {
  const d = lab.devices[deviceId];
  const rig = d?.rigId ? lab.rigs[d.rigId] : undefined;
  return rig?.piHostId ?? null;
}

/** Is the device reachable from its rig Pi (ADB over TCP 5444, or USB on the ADB shelf)? */
function reachableFromPi(lab: LabState, deviceId: string): boolean {
  const d = lab.devices[deviceId];
  if (!d || d.power !== 'on') return false;
  const piId = rigPiOf(lab, deviceId);
  const pi = piId ? lab.hosts[piId] : undefined;
  if (!pi || pi.os !== 'RUNNING') return false;
  if (pi.usb.includes(`adb:${d.serial}`)) return true;
  return reach(lab, pi.id, d.ip, 5444, { noLatency: true }).ok;
}

function line(run: LazoRun, text: string): void {
  run.log.push(text);
}

function finish(lab: LabState, ctx: Ctx, run: LazoRun, ok: boolean, error: string | null): void {
  run.step = ok ? 'done' : 'failed';
  run.error = error;
  run.stepEndsPhysMs = null;
  run.progress = ok ? 1 : run.progress;
  ctx.emit('lazo.stepChanged', { runId: run.id, step: run.step });
  ctx.emit('lazo.runFinished', error ? { runId: run.id, deviceId: run.deviceId, ok, error } : { runId: run.id, deviceId: run.deviceId, ok });
}

export function startLazo(lab: LabState, ctx: Ctx, deviceId: string, toMerchantId: number, opts: { buildId: string | null; actor: Actor }): Result<{ runId: string }> {
  const d = lab.devices[deviceId];
  if (!d) return { ok: false, error: `unknown device '${deviceId}'` };
  const m = lab.orka.merchants[toMerchantId];
  if (!m) return { ok: false, error: `unknown merchant ${toMerchantId}` };
  const id = `lazo-${++lab.seq.lazo}`;
  // Fault lazo.skipAdbRestore (INC28): the first Lazo run on the device after injection skips restore-adb.
  const skip = lab.faults.some((f) => !f.cleared && f.faultId === 'lazo.skipAdbRestore' && f.target === deviceId && !Object.values(lab.lazo.runs).some((r) => r.deviceId === deviceId && r.startedMs >= f.injectedMs && r.skipAdbRestore));
  const run: LazoRun = { id, deviceId, fromMerchantId: d.merchantConfigId, toMerchantId, step: 'queued', wizardPage: 0, progress: 0, startedMs: lab.time.nowMs, stepEndsPhysMs: lab.time.physMs, log: [], error: null, buildId: opts.buildId, skipAdbRestore: skip };
  lab.lazo.runs[id] = run;
  ctx.emit('lazo.runStarted', { runId: id, deviceId, toMerchantId });
  log(lab, 'lazo', 'info', `${id}: ${deviceId} → ${m.name} (${opts.actor})`);
  if (d.merchantConfigId === toMerchantId && d.provisioned) {
    line(run, `lazo: merchant already active (${m.name}) — skipped`);
    finish(lab, ctx, run, true, null);
    return { ok: true, value: { runId: id } };
  }
  if (!reachableFromPi(lab, deviceId)) {
    line(run, `lazo: ERROR device ${d.serial} not reachable`);
    finish(lab, ctx, run, false, `device ${d.serial} not reachable`);
    return { ok: true, value: { runId: id } };
  }
  enterStep(lab, ctx, run, 'ubo-route');
  return { ok: true, value: { runId: id } };
}

function enterStep(lab: LabState, ctx: Ctx, run: LazoRun, step: LazoStep): void {
  const d = lab.devices[run.deviceId]!;
  const m = lab.orka.merchants[run.toMerchantId]!;
  run.step = step;
  run.progress = Math.round((ORDER.indexOf(step) / (ORDER.length - 1)) * 100) / 100;
  ctx.emit('lazo.stepChanged', { runId: run.id, step });
  if (step === 'done') {
    finish(lab, ctx, run, true, null);
    return;
  }
  run.stepEndsPhysMs = lab.time.physMs + (STEP_MS[step] ?? 2_000);
  switch (step) {
    case 'ubo-route':
      line(run, `ubo: routing merchant switch → ${m.name}`);
      lab.ubo.log.push(`ubo: routing merchant switch → ${m.name}`);
      break;
    case 'deprovision':
      line(run, 'lazo: de-provision');
      if (d.power === 'on') setScreen(lab, ctx, d, 'primary', 'deprovisioning');
      d.provisioned = false;
      d.merchantConfigId = null;
      d.order = null;
      ctx.emit('device.provisioned', { deviceId: d.id, merchantConfigId: null });
      break;
    case 'wipe-cache':
      line(run, 'lazo: wipe caches');
      d.order = null;
      d.apps = [...BASE_APPS];
      d.launcher = { page: 0, apps: [...BASE_APPS] };
      if (d.adbTcpPort !== null) {
        d.adbTcpPort = null;
        ctx.emit('device.adbTcpChanged', { deviceId: d.id, port: null });
      }
      break;
    case 'setup-wizard':
      run.wizardPage = 1;
      line(run, 'lazo: setup wizard 1/6');
      if (d.power === 'on') setScreen(lab, ctx, d, 'primary', WIZARD[0], { params: { mid: m.merchantId } });
      break;
    case 'assign-merchant':
      line(run, 'lazo: merchant active');
      provisionDevice(lab, ctx, d, m.id, false);
      break;
    case 'restore-adb': {
      if (run.skipAdbRestore) break;
      const piId = rigPiOf(lab, d.id);
      const pi = piId ? lab.hosts[piId] : undefined;
      const name = pi?.hostname ?? 'robot-pi';
      if (pi && pi.os === 'RUNNING' && pi.services['adb-service']?.running && d.power === 'on') {
        line(run, `lazo: adb tcpip 5444 via ${name} → OK`);
        d.adbTcpPort = 5444;
        ctx.emit('device.adbTcpChanged', { deviceId: d.id, port: 5444 });
      } else line(run, `lazo: WARN could not restore ADB over TCP (${name} unreachable)`);
      break;
    }
    case 'verify':
      break;
  }
}

function endStep(lab: LabState, ctx: Ctx, run: LazoRun): void {
  const d = lab.devices[run.deviceId]!;
  const m = lab.orka.merchants[run.toMerchantId]!;
  switch (run.step) {
    case 'ubo-route': {
      const route = m.uboRoute;
      const r = route ? lab.ubo.routes[route] : undefined;
      let error: string | null = null;
      if (!route || !r) error = `ubo: ERROR merchant ${m.name} not found`;
      else if (!r.up) error = `ubo: ERROR route ${route} unavailable (503)`;
      else if (r.region !== m.region) error = `ubo: ERROR route ${route} cannot resolve merchant ${m.name}`;
      if (error) {
        line(run, error);
        lab.ubo.log.push(error);
        ctx.emit('ubo.routed', { runId: run.id, merchant: m.name, route: route ?? null, ok: false, error });
        finish(lab, ctx, run, false, error);
        return;
      }
      const ok = `ubo: route ${route} → ${r!.region} OK`;
      line(run, ok);
      lab.ubo.log.push(ok);
      ctx.emit('ubo.routed', { runId: run.id, merchant: m.name, route: route!, ok: true });
      enterStep(lab, ctx, run, 'deprovision');
      return;
    }
    case 'setup-wizard': {
      if (run.wizardPage < 6) {
        run.wizardPage += 1;
        line(run, `lazo: setup wizard ${run.wizardPage}/6`);
        if (d.power === 'on') setScreen(lab, ctx, d, 'primary', WIZARD[run.wizardPage - 1]!, { params: { mid: m.merchantId } });
        run.stepEndsPhysMs = lab.time.physMs + STEP_MS['setup-wizard']!;
        return;
      }
      enterStep(lab, ctx, run, 'assign-merchant');
      return;
    }
    case 'verify': {
      if (d.power !== 'on') {
        line(run, `lazo: ERROR device ${d.serial} not reachable`);
        finish(lab, ctx, run, false, `device ${d.serial} not reachable`);
        return;
      }
      line(run, `lazo: verify OK (${d.serial} on ${m.name})`);
      enterStep(lab, ctx, run, 'done');
      return;
    }
    default: {
      const next = ORDER[ORDER.indexOf(run.step) + 1] ?? 'done';
      enterStep(lab, ctx, run, next);
    }
  }
}

export function lazoStep(lab: LabState, ctx: Ctx, sub: SubStep): void {
  const phys = ro(ro(lab).time).physMs;
  const runsR = ro(ro(ro(lab).lazo).runs);
  for (const id of Object.keys(runsR).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))) {
    const r = ro(runsR[id]!);
    if (r.stepEndsPhysMs == null || r.stepEndsPhysMs > phys || r.step === 'done' || r.step === 'failed') continue;
    const run = lab.lazo.runs[id]!;
    let guard = 0;
    while (run.stepEndsPhysMs != null && run.stepEndsPhysMs <= phys && run.step !== 'done' && run.step !== 'failed' && guard++ < 20) endStep(lab, ctx, run);
  }
  if (ro(ro(lab).ubo).log.length > 50) lab.ubo.log.splice(0, lab.ubo.log.length - 50);
  // Keep the newest 30 runs (finished ones pruned first).
  const ids = Object.keys(runsR);
  if (ids.length <= 30) return;
  if (ids.length > 30) {
    const done = ids.filter((i) => ['done', 'failed'].includes(lab.lazo.runs[i]!.step)).sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)));
    for (const i of done.slice(0, ids.length - 30)) delete lab.lazo.runs[i];
  }
  void sub;
}

/* ────────────────────────────── 3D printers (Sim §3.24) ────────────────────────────── */

const PRINT_MS = 90_000;

export function printerStart(lab: LabState, ctx: Ctx, printer: 'prusa' | 'bambu', file: string): Result<{ endsPhysMs: number }> {
  const p = lab.printer3d.printers[printer];
  if (!p) return { ok: false, error: `unknown printer '${printer}'` };
  if (p.busy) return { ok: false, error: `${printer === 'prusa' ? 'Prusa' : 'Bambu Lab'} is busy printing ${p.job}` };
  const name = file.replace(/^.*[\\/]/, '');
  if (!/\.3mf$/.test(name) || !(`~/CAD/${name}` in lab.workstation.files)) return { ok: false, error: `${name}: file not found on the CAD PC` };
  const ends = lab.time.physMs + PRINT_MS;
  p.busy = true;
  p.job = name;
  p.endsPhysMs = ends;
  ctx.emit('printer3d.started', { printer, file: name, endsPhysMs: ends });
  return { ok: true, value: { endsPhysMs: ends } };
}

export function printer3dStep(lab: LabState, ctx: Ctx): void {
  for (const id of ['prusa', 'bambu'] as const) {
    const pr = ro(ro(ro(ro(lab).printer3d).printers)[id]);
    if (!pr?.busy || pr.endsPhysMs == null || pr.endsPhysMs > ro(ro(lab).time).physMs) continue;
    const p = lab.printer3d.printers[id];
    if (!p?.busy || p.endsPhysMs == null || p.endsPhysMs > lab.time.physMs) continue;
    const part = (p.job ?? '').replace(/\.3mf$/, '');
    p.busy = false;
    p.job = null;
    p.endsPhysMs = null;
    lab.printer3d.output.push(part);
    ctx.emit('printer3d.done', { printer: id, part });
  }
}
