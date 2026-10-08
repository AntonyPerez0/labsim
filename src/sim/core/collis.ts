/**
 * Collis probes, SmartStripe probes and Callus (Sim §3.6, §3.16): probe LED/state, Orca card actions
 * (`/api/card/{swipe|dip|tap}`) through Callus → probe → device, pre-loaded (armed) swipes for the Tax
 * test, Callus `/status`.
 */
import type { CardEntry, CollisProbe, LabState } from '../types';
import type { Actor, CardActionResult, Result } from '../api';
import type { Ctx, SubStep } from './util';
import { addTimer, cancelTimers, log, takeDue } from './util';
import { reach } from './network';
import { cardEvent, customerSide, dispOf } from './devices';
import { enqueueRig } from './rigs';
import { gortFileText } from '../seed';
import { rigOf } from './orca/entities';
import { ro, roAt } from './ro';

const ARM_TIMEOUT_MS = 60_000;

export type ProbeState = 'READY' | 'OFFLINE' | 'NO_LINK' | 'FAULT';

function probePowered(lab: LabState, probe: CollisProbe): boolean {
  const c = ro(probe);
  const L = ro(lab);
  if (c.kind === 'smartstripe') {
    const tid = ro(c.supply).targetId;
    const host = tid ? roAt(L.hosts, tid) : undefined;
    return !!host && host.os !== 'OFF' && ro(host.usb).includes(`smartstripe:${c.rigId}`);
  }
  const loads = ro(ro(L.power).loads);
  const load = Object.prototype.hasOwnProperty.call(loads, `psu-collis-${c.rigId}`) ? ro(loads[`psu-collis-${c.rigId}`]) : undefined;
  if (load && load.collisId === c.id) return load.powered && !load.damaged;
  return ro(c.supply).kind !== 'none';
}

export function probeState(c: CollisProbe): ProbeState {
  if (c.state === 'FRIED') return 'FAULT';
  if (!c.powered) return 'OFFLINE';
  if (!c.ribbonConnected) return 'NO_LINK';
  return 'READY';
}

function callusLog(lab: LabState, box: string, line: string): void {
  const l = lab.callus.log[box] ?? [];
  l.push(line);
  if (l.length > 50) l.splice(0, l.length - 50);
  lab.callus.log[box] = l;
}

export function collisStep(lab: LabState, ctx: Ctx, sub: SubStep): void {
  const phys = lab.time.physMs;
  for (const t of takeDue(lab, ['callus.'])) {
    const p = t.payload;
    const c = lab.collis[String(p.probe)];
    if (!c) continue;
    if (t.kind === 'callus.armFire') fireArmed(lab, ctx, c);
    else if (t.kind === 'callus.present') presentSwipe(lab, ctx, c, Number(p.profile), String(p.device), String(p.disp) as 'primary' | 'secondary', false);
  }
  const L = ro(lab);
  const probes = ro(L.collis);
  const hosts = ro(L.hosts);
  for (const id of Object.keys(probes).sort()) {
    const c = ro(probes[id]!);
    const powered = c.state !== 'FRIED' && probePowered(lab, c);
    if (c.powered !== powered) lab.collis[id]!.powered = powered;
    let ribbon = c.ribbonConnected;
    if (c.kind === 'smartstripe') {
      const tid = ro(c.supply).targetId;
      const host = tid ? ro(hosts[tid]) : undefined;
      ribbon = !!host && ro(host.usb).includes(`smartstripe:${c.rigId}`);
      if (c.ribbonConnected !== ribbon) lab.collis[id]!.ribbonConnected = ribbon;
    }
    const led: CollisProbe['ledColor'] = c.state === 'FRIED' || !powered ? 'off' : !ribbon ? 'amber' : 'green';
    if (c.ledColor !== led) {
      const w = lab.collis[id]!;
      w.ledColor = led;
      ctx.emit('collis.stateChanged', { collisId: id, led, state: probeState(w) });
    }
    const armed = ro(c.armed);
    if (armed && armed.expiresPhysMs <= phys) {
      const prof = lab.orca.cardProfiles[armed.profileId];
      const deviceId = armed.deviceId;
      lab.collis[id]!.armed = null;
      callusLog(lab, c.callusHostId, `[callus] ${prof?.entry.toLowerCase() ?? 'swipe'} ${prof?.name ?? '?'} on ${id} → ARM_TIMEOUT`);
      ctx.emit('callus.armExpired', { collisId: id, profile: prof?.name ?? '', deviceId });
    }
  }
  void sub;
}

/** Deliver a swipe to the customer display (the SmartStripe / Collis emulates the stripe in place). */
function presentSwipe(lab: LabState, ctx: Ctx, c: CollisProbe, profileId: number, deviceId: string, disp: 'primary' | 'secondary', fired: boolean): string | null {
  const prof = lab.orca.cardProfiles[profileId];
  const d = lab.devices[deviceId];
  if (!prof || !d) return 'no device';
  const e = cardEvent(lab, ctx, d, disp, prof, 'SWIPE');
  c.lastAction = { entry: 'SWIPE', atMs: lab.time.nowMs, ok: !e, error: e };
  ctx.emit('collis.action', e ? { collisId: c.id, entry: 'SWIPE', ok: false, error: e } : { collisId: c.id, entry: 'SWIPE', ok: true });
  if (fired) callusLog(lab, c.callusHostId, `[callus] swipe ${prof.name} fired → ${e ?? 'OK'}`);
  return e;
}

function fireArmed(lab: LabState, ctx: Ctx, c: CollisProbe): void {
  const a = c.armed;
  if (!a) return;
  const d = lab.devices[a.deviceId];
  if (!d) return;
  const owner = d.role === 'cfd' && d.tetheredTo ? lab.devices[d.tetheredTo]! : d;
  const side = customerSide(lab, owner);
  const ds = dispOf(side.dev, side.disp);
  if (!ds || ds.screen !== a.fireOnScreen) return; // left the prompt before the fire — stays armed
  const prof = lab.orca.cardProfiles[a.profileId];
  c.armed = null;
  if (!prof) return;
  if (a.entry === 'SWIPE') {
    const e = presentSwipe(lab, ctx, c, a.profileId, side.dev.id, side.disp, true);
    ctx.emit('callus.armFired', { collisId: c.id, profile: prof.name, deviceId: a.deviceId, ok: !e });
  } else {
    enqueueRig(lab, c.rigId, { kind: a.entry === 'DIP' ? 'dipIn' : 'tapIn', source: 'orca', ref: JSON.stringify({ card: a.profileId, entry: a.entry, probe: c.id }) });
    callusLog(lab, c.callusHostId, `[callus] ${a.entry.toLowerCase()} ${prof.name} fired → OK`);
    ctx.emit('callus.armFired', { collisId: c.id, profile: prof.name, deviceId: a.deviceId, ok: true });
  }
}

/** Callus `GET /status` body (Sim §3.14.2). */
export function callusStatusBody(lab: LabState, boxId: string): string {
  const probes = Object.values(lab.collis)
    .filter((c) => c.callusHostId === boxId)
    .sort((a, b) => (lab.rigs[a.rigId]?.orcaRobotId ?? 0) - (lab.rigs[b.rigId]?.orcaRobotId ?? 0))
    .map((c) => `{"id":"${c.id}","state":"${probeState(c)}"}`);
  return `{"callus":"UP","probes":[${probes.join(',')}]}`;
}

export function reseatRibbon(lab: LabState, ctx: Ctx, collisId: string): Result {
  const c = lab.collis[collisId];
  if (!c) return { ok: false, error: `unknown probe '${collisId}'` };
  if (c.kind === 'smartstripe') {
    const host = c.supply.targetId ? lab.hosts[c.supply.targetId] : undefined;
    if (!host) return { ok: false, error: 'probe host missing' };
    const id = `smartstripe:${c.rigId}`;
    const plugged = !host.usb.includes(id);
    host.usb = plugged ? [...host.usb, id] : host.usb.filter((u) => u !== id);
    c.ribbonConnected = plugged;
    ctx.emit('host.usbChanged', { hostId: host.id, usbId: id, attached: plugged });
  } else c.ribbonConnected = !c.ribbonConnected;
  return { ok: true, value: undefined };
}

const ENTRY_URL: Record<CardEntry, 'dipUrl' | 'tapUrl' | 'swipeUrl'> = { DIP: 'dipUrl', TAP: 'tapUrl', SWIPE: 'swipeUrl' };
const ENTRY_LABEL: Record<CardEntry, string> = { DIP: 'Dip', TAP: 'Tap', SWIPE: 'Swipe' };

/**
 * Orca `/api/card/{entry}` (Sim §3.6). On failure the Result error is the console lines joined by "\n"
 * (last line = the failing check); on success `lines` hold the Callus / cardprog lines.
 */
export function cardAction(lab: LabState, ctx: Ctx, robotName: string, entry: CardEntry, profileRef: number | string, actor: Actor): Result<CardActionResult> {
  const lines: string[] = [];
  const profileName = typeof profileRef === 'number' ? (lab.orca.cardProfiles[profileRef]?.name ?? String(profileRef)) : profileRef;
  const fail = (line: string): Result<CardActionResult> => {
    lines.push(line);
    ctx.emit('orca.cardAction', { robotName, entry, profile: profileName, ok: false, armed: false, error: line, actor });
    return { ok: false, error: lines.join('\n') };
  };
  const orcaVm = lab.hosts['orca-vm'];
  if (!orcaVm || orcaVm.os !== 'RUNNING' || !orcaVm.services.orca?.running) return fail(`[orca] POST /api/card/${entry.toLowerCase()} → ${orcaVm?.os === 'RUNNING' ? 'Connection refused' : 'connect timed out'}`);
  if (!lab.orca.app.dbConnected) return fail('[orca] 500 Internal Server Error');
  const robot = Object.values(lab.orca.robots).find((r) => r.name === robotName);
  if (!robot) return fail(`[orca] 404 Not Found: no robot named '${robotName}'`);
  const prof = typeof profileRef === 'number' ? lab.orca.cardProfiles[profileRef] : Object.values(lab.orca.cardProfiles).find((c) => c.name === profileRef);
  if (!prof) return fail(`[orca] 404 Not Found: no card profile '${profileRef}'`);
  if (prof.entry !== entry) return fail(`[orca] 400 Bad Request: profile ${prof.name} is a ${prof.entry} profile; use /api/card/${prof.entry.toLowerCase()}`);
  const url = robot[ENTRY_URL[entry]];
  if (!url) return fail(`[orca] 400 Bad Request: robot ${robot.name} has no ${ENTRY_LABEL[entry]} URL`);
  const rig = rigOf(lab, robot);
  const probe = rig?.collisId ? lab.collis[rig.collisId] : undefined;
  const box = probe?.callusHostId ?? rig?.callusHostId ?? null;
  const boxHost = box ? lab.hosts[box] : undefined;
  if (!rig || !probe || !boxHost) return fail(`[orca] 400 Bad Request: robot ${robot.name} has no ${ENTRY_LABEL[entry]} URL`);
  const callus = `${boxHost.ip}:9000`;
  const r = reach(lab, 'orca-vm', boxHost.ip, 9000);
  if (!r.ok) return fail(r.kind === 'refused' ? `[callus] ${callus} error: Connection refused` : `[callus] ${callus} unreachable`);
  if (boxHost.diskUsedGb >= boxHost.diskTotalGb - 0.001) return fail(`[callus] ${callus} error: No space left on device`);
  const st = probeState(probe);
  if (st === 'OFFLINE') return fail(`[callus] probe ${probe.id}: PROBE_OFFLINE`);
  if (st === 'FAULT') return fail(`[callus] probe ${probe.id}: PROBE_FAULT`);
  if (st === 'NO_LINK') return fail(`[callus] probe ${probe.id}: PROBE_NO_LINK`);

  let cardFile: string | null = null;
  if (entry === 'SWIPE') {
    lines.push(`[callus] swipe ${prof.name} → probe ${probe.id} OK`);
  } else {
    const path = prof.gortPath ?? '';
    const win = `C:\\gort\\${path.replace(/\//g, '\\')}`;
    const local = lab.callus.localCardFiles[box!];
    if (!local || !local.files.includes(path)) {
      callusLog(lab, box!, `[callus] map ${path} → ${win} · FileNotFoundException (The system cannot find the path specified)`);
      ctx.emit('callus.cardLoaded', { collisId: probe.id, profileId: prof.id, ok: false, error: 'FileNotFoundException' });
      return fail(`[callus] map ${path} → ${win} · FileNotFoundException (The system cannot find the path specified)`);
    }
    cardFile = boxHost.files[win] ?? gortFileText(lab, path);
    lines.push(`[callus] map ${path} → ${win} · load virtual card OK · probe ${rig.id}: ${entry}`);
    const pi = rig.piHostId ? lab.hosts[rig.piHostId] : undefined;
    if (!pi || pi.os !== 'RUNNING' || !pi.services.cardprog?.running) {
      callusLog(lab, box!, lines[lines.length - 1]!);
      return fail(`[pi] cardprog: program ${prof.name} → 503 CARDPROG_UNAVAILABLE`);
    }
    lines.push(`[pi] cardprog: program ${prof.name} → OK`);
  }
  probe.loadedProfileId = prof.id;
  ctx.emit('callus.cardLoaded', { collisId: probe.id, profileId: prof.id, ok: true });

  // Presentation (or arming) on the customer-facing display.
  const owner = rig.deviceIds[0] ? lab.devices[rig.deviceIds[0]] : undefined;
  let armed = false;
  if (owner) {
    const side = customerSide(lab, owner);
    const ds = dispOf(side.dev, side.disp);
    if (ds && side.dev.power === 'on' && ds.screen === 'payment-prompt') {
      if (entry === 'SWIPE') addTimer(lab, 'callus.present', 'phys', 400, { probe: probe.id, profile: prof.id, device: side.dev.id, disp: side.disp });
      else enqueueRig(lab, rig.id, { kind: entry === 'DIP' ? 'dipIn' : 'tapIn', source: 'orca', ref: JSON.stringify({ card: prof.id, entry, probe: probe.id, file: cardFile }) });
    } else {
      armed = true;
      cancelTimers(lab, (t) => t.kind === 'callus.armFire' && t.payload.probe === probe.id);
      probe.armed = { profileId: prof.id, entry, deviceId: side.dev.id, fireOnScreen: 'payment-prompt', expiresPhysMs: lab.time.physMs + ARM_TIMEOUT_MS };
      lines.push(`[callus] ${entry.toLowerCase()} ${prof.name} armed on ${probe.id} (fires at payment prompt)`);
      ctx.emit('callus.armed', { collisId: probe.id, profile: prof.name, deviceId: side.dev.id });
    }
  }
  for (const l of lines) if (l.startsWith('[callus]')) callusLog(lab, box!, l);
  const body = `{"result":"OK","entry":"${entry}","probe":"${probe.id}","callus":"${callus}"}`;
  ctx.emit('orca.cardAction', { robotName, entry, profile: prof.name, ok: true, armed, actor });
  log(lab, 'orca', 'info', `card ${entry} ${prof.name} on ${robot.name} (${actor})${armed ? ' armed' : ''}`);
  return { ok: true, value: { entry, profile: prof.name, probe: probe.id, callus, lines, armed, respondsAfterMs: entry === 'SWIPE' ? 200 : 500, body } };
}
