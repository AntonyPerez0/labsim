/**
 * Kollis probes, SmartStripe probes and Kallus (Sim §3.6, §3.16): probe LED/state, Orka card actions
 * (`/api/card/{swipe|dip|tap}`) through Kallus → probe → device, pre-loaded (armed) swipes for the Tax
 * test, Kallus `/status`.
 */
import type { CardEntry, KollisProbe, LabState } from '../types';
import type { Actor, CardActionResult, Result } from '../api';
import type { Ctx, SubStep } from './util';
import { addTimer, cancelTimers, log, takeDue } from './util';
import { reach } from './network';
import { cardEvent, customerSide, dispOf } from './devices';
import { enqueueRig } from './rigs';
import { gorthFileText } from '../seed';
import { rigOf } from './orka/entities';
import { ro, roAt } from './ro';

const ARM_TIMEOUT_MS = 60_000;

export type ProbeState = 'READY' | 'OFFLINE' | 'NO_LINK' | 'FAULT';

function probePowered(lab: LabState, probe: KollisProbe): boolean {
  const c = ro(probe);
  const L = ro(lab);
  if (c.kind === 'smartstripe') {
    const tid = ro(c.supply).targetId;
    const host = tid ? roAt(L.hosts, tid) : undefined;
    return !!host && host.os !== 'OFF' && ro(host.usb).includes(`smartstripe:${c.rigId}`);
  }
  const loads = ro(ro(L.power).loads);
  const load = Object.prototype.hasOwnProperty.call(loads, `psu-kollis-${c.rigId}`) ? ro(loads[`psu-kollis-${c.rigId}`]) : undefined;
  if (load && load.kollisId === c.id) return load.powered && !load.damaged;
  return ro(c.supply).kind !== 'none';
}

export function probeState(c: KollisProbe): ProbeState {
  if (c.state === 'FRIED') return 'FAULT';
  if (!c.powered) return 'OFFLINE';
  if (!c.ribbonConnected) return 'NO_LINK';
  return 'READY';
}

function kallusLog(lab: LabState, box: string, line: string): void {
  const l = lab.kallus.log[box] ?? [];
  l.push(line);
  if (l.length > 50) l.splice(0, l.length - 50);
  lab.kallus.log[box] = l;
}

export function kollisStep(lab: LabState, ctx: Ctx, sub: SubStep): void {
  const phys = lab.time.physMs;
  for (const t of takeDue(lab, ['kallus.'])) {
    const p = t.payload;
    const c = lab.kollis[String(p.probe)];
    if (!c) continue;
    if (t.kind === 'kallus.armFire') fireArmed(lab, ctx, c);
    else if (t.kind === 'kallus.present') presentSwipe(lab, ctx, c, Number(p.profile), String(p.device), String(p.disp) as 'primary' | 'secondary', false);
  }
  const L = ro(lab);
  const probes = ro(L.kollis);
  const hosts = ro(L.hosts);
  for (const id of Object.keys(probes).sort()) {
    const c = ro(probes[id]!);
    const powered = c.state !== 'FRIED' && probePowered(lab, c);
    if (c.powered !== powered) lab.kollis[id]!.powered = powered;
    let ribbon = c.ribbonConnected;
    if (c.kind === 'smartstripe') {
      const tid = ro(c.supply).targetId;
      const host = tid ? ro(hosts[tid]) : undefined;
      ribbon = !!host && ro(host.usb).includes(`smartstripe:${c.rigId}`);
      if (c.ribbonConnected !== ribbon) lab.kollis[id]!.ribbonConnected = ribbon;
    }
    const led: KollisProbe['ledColor'] = c.state === 'FRIED' || !powered ? 'off' : !ribbon ? 'amber' : 'green';
    if (c.ledColor !== led) {
      const w = lab.kollis[id]!;
      w.ledColor = led;
      ctx.emit('kollis.stateChanged', { kollisId: id, led, state: probeState(w) });
    }
    const armed = ro(c.armed);
    if (armed && armed.expiresPhysMs <= phys) {
      const prof = lab.orka.cardProfiles[armed.profileId];
      const deviceId = armed.deviceId;
      lab.kollis[id]!.armed = null;
      kallusLog(lab, c.kallusHostId, `[kallus] ${prof?.entry.toLowerCase() ?? 'swipe'} ${prof?.name ?? '?'} on ${id} → ARM_TIMEOUT`);
      ctx.emit('kallus.armExpired', { kollisId: id, profile: prof?.name ?? '', deviceId });
    }
  }
  void sub;
}

/** Deliver a swipe to the customer display (the SmartStripe / Kollis emulates the stripe in place). */
function presentSwipe(lab: LabState, ctx: Ctx, c: KollisProbe, profileId: number, deviceId: string, disp: 'primary' | 'secondary', fired: boolean): string | null {
  const prof = lab.orka.cardProfiles[profileId];
  const d = lab.devices[deviceId];
  if (!prof || !d) return 'no device';
  const e = cardEvent(lab, ctx, d, disp, prof, 'SWIPE');
  c.lastAction = { entry: 'SWIPE', atMs: lab.time.nowMs, ok: !e, error: e };
  ctx.emit('kollis.action', e ? { kollisId: c.id, entry: 'SWIPE', ok: false, error: e } : { kollisId: c.id, entry: 'SWIPE', ok: true });
  if (fired) kallusLog(lab, c.kallusHostId, `[kallus] swipe ${prof.name} fired → ${e ?? 'OK'}`);
  return e;
}

function fireArmed(lab: LabState, ctx: Ctx, c: KollisProbe): void {
  const a = c.armed;
  if (!a) return;
  const d = lab.devices[a.deviceId];
  if (!d) return;
  const owner = d.role === 'cfd' && d.tetheredTo ? lab.devices[d.tetheredTo]! : d;
  const side = customerSide(lab, owner);
  const ds = dispOf(side.dev, side.disp);
  if (!ds || ds.screen !== a.fireOnScreen) return; // left the prompt before the fire — stays armed
  const prof = lab.orka.cardProfiles[a.profileId];
  c.armed = null;
  if (!prof) return;
  if (a.entry === 'SWIPE') {
    const e = presentSwipe(lab, ctx, c, a.profileId, side.dev.id, side.disp, true);
    ctx.emit('kallus.armFired', { kollisId: c.id, profile: prof.name, deviceId: a.deviceId, ok: !e });
  } else {
    enqueueRig(lab, c.rigId, { kind: a.entry === 'DIP' ? 'dipIn' : 'tapIn', source: 'orka', ref: JSON.stringify({ card: a.profileId, entry: a.entry, probe: c.id }) });
    kallusLog(lab, c.kallusHostId, `[kallus] ${a.entry.toLowerCase()} ${prof.name} fired → OK`);
    ctx.emit('kallus.armFired', { kollisId: c.id, profile: prof.name, deviceId: a.deviceId, ok: true });
  }
}

/** Kallus `GET /status` body (Sim §3.14.2). */
export function kallusStatusBody(lab: LabState, boxId: string): string {
  const probes = Object.values(lab.kollis)
    .filter((c) => c.kallusHostId === boxId)
    .sort((a, b) => (lab.rigs[a.rigId]?.orkaRobotId ?? 0) - (lab.rigs[b.rigId]?.orkaRobotId ?? 0))
    .map((c) => `{"id":"${c.id}","state":"${probeState(c)}"}`);
  return `{"kallus":"UP","probes":[${probes.join(',')}]}`;
}

export function reseatRibbon(lab: LabState, ctx: Ctx, kollisId: string): Result {
  const c = lab.kollis[kollisId];
  if (!c) return { ok: false, error: `unknown probe '${kollisId}'` };
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
 * Orka `/api/card/{entry}` (Sim §3.6). On failure the Result error is the console lines joined by "\n"
 * (last line = the failing check); on success `lines` hold the Kallus / cardprog lines.
 */
export function cardAction(lab: LabState, ctx: Ctx, robotName: string, entry: CardEntry, profileRef: number | string, actor: Actor): Result<CardActionResult> {
  const lines: string[] = [];
  const profileName = typeof profileRef === 'number' ? (lab.orka.cardProfiles[profileRef]?.name ?? String(profileRef)) : profileRef;
  const fail = (line: string): Result<CardActionResult> => {
    lines.push(line);
    ctx.emit('orka.cardAction', { robotName, entry, profile: profileName, ok: false, armed: false, error: line, actor });
    return { ok: false, error: lines.join('\n') };
  };
  const orkaVm = lab.hosts['orka-vm'];
  if (!orkaVm || orkaVm.os !== 'RUNNING' || !orkaVm.services.orka?.running) return fail(`[orka] POST /api/card/${entry.toLowerCase()} → ${orkaVm?.os === 'RUNNING' ? 'Connection refused' : 'connect timed out'}`);
  if (!lab.orka.app.dbConnected) return fail('[orka] 500 Internal Server Error');
  const robot = Object.values(lab.orka.robots).find((r) => r.name === robotName);
  if (!robot) return fail(`[orka] 404 Not Found: no robot named '${robotName}'`);
  const prof = typeof profileRef === 'number' ? lab.orka.cardProfiles[profileRef] : Object.values(lab.orka.cardProfiles).find((c) => c.name === profileRef);
  if (!prof) return fail(`[orka] 404 Not Found: no card profile '${profileRef}'`);
  if (prof.entry !== entry) return fail(`[orka] 400 Bad Request: profile ${prof.name} is a ${prof.entry} profile; use /api/card/${prof.entry.toLowerCase()}`);
  const url = robot[ENTRY_URL[entry]];
  if (!url) return fail(`[orka] 400 Bad Request: robot ${robot.name} has no ${ENTRY_LABEL[entry]} URL`);
  const rig = rigOf(lab, robot);
  const probe = rig?.kollisId ? lab.kollis[rig.kollisId] : undefined;
  const box = probe?.kallusHostId ?? rig?.kallusHostId ?? null;
  const boxHost = box ? lab.hosts[box] : undefined;
  if (!rig || !probe || !boxHost) return fail(`[orka] 400 Bad Request: robot ${robot.name} has no ${ENTRY_LABEL[entry]} URL`);
  const kallus = `${boxHost.ip}:9000`;
  const r = reach(lab, 'orka-vm', boxHost.ip, 9000);
  if (!r.ok) return fail(r.kind === 'refused' ? `[kallus] ${kallus} error: Connection refused` : `[kallus] ${kallus} unreachable`);
  if (boxHost.diskUsedGb >= boxHost.diskTotalGb - 0.001) return fail(`[kallus] ${kallus} error: No space left on device`);
  const st = probeState(probe);
  if (st === 'OFFLINE') return fail(`[kallus] probe ${probe.id}: PROBE_OFFLINE`);
  if (st === 'FAULT') return fail(`[kallus] probe ${probe.id}: PROBE_FAULT`);
  if (st === 'NO_LINK') return fail(`[kallus] probe ${probe.id}: PROBE_NO_LINK`);

  let cardFile: string | null = null;
  if (entry === 'SWIPE') {
    lines.push(`[kallus] swipe ${prof.name} → probe ${probe.id} OK`);
  } else {
    const path = prof.gorthPath ?? '';
    const win = `C:\\gorth\\${path.replace(/\//g, '\\')}`;
    const local = lab.kallus.localCardFiles[box!];
    if (!local || !local.files.includes(path)) {
      kallusLog(lab, box!, `[kallus] map ${path} → ${win} · FileNotFoundException (The system cannot find the path specified)`);
      ctx.emit('kallus.cardLoaded', { kollisId: probe.id, profileId: prof.id, ok: false, error: 'FileNotFoundException' });
      return fail(`[kallus] map ${path} → ${win} · FileNotFoundException (The system cannot find the path specified)`);
    }
    cardFile = boxHost.files[win] ?? gorthFileText(lab, path);
    lines.push(`[kallus] map ${path} → ${win} · load virtual card OK · probe ${rig.id}: ${entry}`);
    const pi = rig.piHostId ? lab.hosts[rig.piHostId] : undefined;
    if (!pi || pi.os !== 'RUNNING' || !pi.services.cardprog?.running) {
      kallusLog(lab, box!, lines[lines.length - 1]!);
      return fail(`[pi] cardprog: program ${prof.name} → 503 CARDPROG_UNAVAILABLE`);
    }
    lines.push(`[pi] cardprog: program ${prof.name} → OK`);
  }
  probe.loadedProfileId = prof.id;
  ctx.emit('kallus.cardLoaded', { kollisId: probe.id, profileId: prof.id, ok: true });

  // Presentation (or arming) on the customer-facing display.
  const owner = rig.deviceIds[0] ? lab.devices[rig.deviceIds[0]] : undefined;
  let armed = false;
  if (owner) {
    const side = customerSide(lab, owner);
    const ds = dispOf(side.dev, side.disp);
    if (ds && side.dev.power === 'on' && ds.screen === 'payment-prompt') {
      if (entry === 'SWIPE') addTimer(lab, 'kallus.present', 'phys', 400, { probe: probe.id, profile: prof.id, device: side.dev.id, disp: side.disp });
      else enqueueRig(lab, rig.id, { kind: entry === 'DIP' ? 'dipIn' : 'tapIn', source: 'orka', ref: JSON.stringify({ card: prof.id, entry, probe: probe.id, file: cardFile }) });
    } else {
      armed = true;
      cancelTimers(lab, (t) => t.kind === 'kallus.armFire' && t.payload.probe === probe.id);
      probe.armed = { profileId: prof.id, entry, deviceId: side.dev.id, fireOnScreen: 'payment-prompt', expiresPhysMs: lab.time.physMs + ARM_TIMEOUT_MS };
      lines.push(`[kallus] ${entry.toLowerCase()} ${prof.name} armed on ${probe.id} (fires at payment prompt)`);
      ctx.emit('kallus.armed', { kollisId: probe.id, profile: prof.name, deviceId: side.dev.id });
    }
  }
  for (const l of lines) if (l.startsWith('[kallus]')) kallusLog(lab, box!, l);
  const body = `{"result":"OK","entry":"${entry}","probe":"${probe.id}","kallus":"${kallus}"}`;
  ctx.emit('orka.cardAction', { robotName, entry, profile: prof.name, ok: true, armed, actor });
  log(lab, 'orka', 'info', `card ${entry} ${prof.name} on ${robot.name} (${actor})${armed ? ' armed' : ''}`);
  return { ok: true, value: { entry, profile: prof.name, probe: probe.id, kallus, lines, armed, respondsAfterMs: entry === 'SWIPE' ? 200 : 500, body } };
}
