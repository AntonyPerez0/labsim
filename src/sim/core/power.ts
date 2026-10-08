/**
 * Power (Sim §3.13): the per-sub-step solver (outlets → strips / Mean Well → regulators → fuses →
 * terminals → loads), fuse stress, wrong-plug damage by `config.damageModel`, Pi under-voltage, and the
 * player-facing power actions (plug, fuses, switches, multimeter).
 */
import type { AcStrip, DcTerminal, LabState, PowerHookup, PowerLoad, Regulator } from '../types';
import type { MultimeterReading, Result } from '../api';
import type { Ctx, SubStep } from './util';
import { log } from './util';
import { HOST_EXTRA_A, mainAccessoryA } from '../seed/power';
import { ro, roAt } from './ro';

const OK: Result = { ok: true, value: undefined };
const err = (e: string): Result => ({ ok: false, error: e });

const PSU_V = 24.1;
const AC_V = 119.6;
const HICCUP_MS = 2_000;

/* ────────────────────────────── voltage helpers (read-only: `ro`) ────────────────────────────── */

function psuOut(lab: LabState): number {
  const p = ro(ro(lab).power);
  const psu = roAt(p.psus, 'MW-1');
  if (!psu || !psu.on || !psu.outletId) return 0;
  const o = roAt(p.outlets, psu.outletId);
  if (!o || !o.live || o.plugged !== psu.id) return 0;
  if (psu.hiccupUntilPhysMs != null && psu.hiccupUntilPhysMs > ro(ro(lab).time).physMs) return 0;
  return PSU_V;
}

/** 24 V as seen by the rail's consumers: outside the `full` damage model regulator hold-up rides through a hiccup [sim]. */
function rail24Effective(lab: LabState): number {
  const L = ro(lab);
  const p = ro(L.power);
  const psu = roAt(p.psus, 'MW-1');
  const hiccup = psu?.hiccupUntilPhysMs != null && psu.hiccupUntilPhysMs > ro(L.time).physMs;
  if (hiccup && ro(L.config).damageModel !== 'full' && psu!.on) {
    const o = psu!.outletId ? roAt(p.outlets, psu!.outletId) : undefined;
    if (o?.live) return PSU_V;
  }
  return psuOut(lab);
}

export function stripLive(lab: LabState, strip: AcStrip): boolean {
  const s = ro(strip);
  if (!s.switchOn || s.breakerTripped || !s.outletId) return false;
  const o = roAt(ro(ro(lab).power).outlets, s.outletId);
  return !!o && o.live && o.plugged === s.id;
}

/** Regulator output voltage (line side of its fuse) for its current output current. */
export function regulatorOutput(lab: LabState, regulator: Regulator, currentA?: number): number {
  const reg = ro(regulator);
  if (!reg.inputSwitch || rail24Effective(lab) < 20) return 0;
  const rail = roAt(ro(ro(lab).power).rails, reg.outRail);
  const i = currentA ?? rail?.currentA ?? 0;
  if (reg.nominalV === 12) return i > reg.maxA ? 10.5 : 12.02;
  if (i > reg.maxA) return 4.4;
  return Math.round((5.08 - 0.02 * Math.max(0, i - 5)) * 1000) / 1000;
}

/** Voltage at a terminal (after the rig MAIN/MOTOR switch). */
export function terminalVolts(lab: LabState, terminal: DcTerminal): number {
  const t = ro(terminal);
  const L = ro(lab);
  const rail = roAt(ro(L.power).rails, t.railId);
  if (!rail) return 0;
  const v = t.railId === 'rail-24v' ? rail24Effective(lab) : rail.voltage;
  if (t.via === 'rig-main' || t.via === 'rig-motor') {
    const rig = t.rigId ? roAt(L.rigs, t.rigId) : undefined;
    if (!rig) return 0;
    if (t.via === 'rig-main' && !rig.mainSwitch) return 0;
    if (t.via === 'rig-motor' && !rig.motorSwitch) return 0;
  }
  return v;
}

/** Voltage a load sees through its hookup (AC: 119.6; USB: 5.0 from a running host). */
export function hookupVolts(lab: LabState, hookup: PowerHookup): number {
  const h = ro(hookup);
  const L = ro(lab);
  const p = ro(L.power);
  switch (h.kind) {
    case 'ac-strip': {
      const s = h.targetId ? roAt(p.strips, h.targetId) : undefined;
      if (!s) return h.targetId === 'offscreen' ? AC_V : 0;
      return stripLive(lab, s) ? AC_V : 0;
    }
    case 'dc-rail': {
      const t = h.targetId ? roAt(p.terminals, h.targetId) : undefined;
      if (!t) return h.targetId === 'offscreen' ? 5.1 : 0;
      return terminalVolts(lab, t);
    }
    case 'usb': {
      const host = h.targetId ? roAt(L.hosts, h.targetId) : undefined;
      return host && (host.os === 'RUNNING' || host.os === 'BOOTING') ? 5.0 : 0;
    }
    default:
      return 0;
  }
}

/** What a load needs; returns 'ok' | 'none' (no power) | 'fry' | 'nofit'. */
export function compatibility(load: PowerLoad, kind: 'ac' | 'dc', volts: number): 'ok' | 'none' | 'fry' | 'nofit' {
  const minixBrick = load.id.startsWith('brick-minix');
  if (kind === 'ac') {
    if (load.expects === 'AC' || load.expects === 'AC-BRICK-18V') return 'ok';
    return 'nofit';
  }
  // DC terminal of nominal `volts`
  switch (load.expects) {
    case 'AC-BRICK-18V':
      return 'fry';
    case 'AC':
      if (minixBrick) return volts >= 20 ? 'fry' : volts >= 10 ? 'ok' : 'none';
      return 'nofit';
    case '5V':
      return volts >= 10 ? 'fry' : 'ok';
    case '12V':
      return volts >= 20 ? 'fry' : volts >= 10 ? 'ok' : 'none';
    case '24V':
      return volts >= 20 ? 'ok' : 'none';
  }
}

function nominalOfTerminal(lab: LabState, t: DcTerminal): number {
  return roAt(ro(ro(lab).power).rails, ro(t).railId)?.nominalVoltage ?? 0;
}

/* ────────────────────────────── load currents ────────────────────────────── */

function loadCurrent(lab: LabState, loadNode: PowerLoad): number {
  const load = ro(loadNode);
  if (!load.powered || load.damaged) return 0;
  const L = ro(lab);
  if (load.hostId) {
    const h = roAt(L.hosts, load.hostId);
    if (!h) return 0;
    if (h.kind === 'pi') {
      const base = h.os === 'BOOTING' ? 1.0 : h.os === 'OFF' ? 0 : 0.9;
      return base + (HOST_EXTRA_A[h.id] ?? 0);
    }
    if (h.kind === 'nuc') return h.os === 'OFF' ? 0.2 : load.drawA;
    return load.drawA;
  }
  if (load.id.startsWith('motor-') && load.rigId) {
    const rig = roAt(L.rigs, load.rigId);
    if (!rig) return 0;
    const g = ro(rig.gantry);
    let i = !rig.steppersEnabled ? 0.05 : g.moving ? 1.6 : 0.8;
    const k = ro(rig.current)?.kind;
    if (k === 'tap' || k === 'solenoidDown' || k === 'solenoidLower' || k === 'stroke' || ro(rig.solenoid).down) i += 1.2;
    return i;
  }
  if (load.deviceId) {
    const d = roAt(L.devices, load.deviceId);
    return d && (d.power === 'on' || d.power === 'booting') ? load.drawA : 0.05;
  }
  return load.drawA;
}

/* ────────────────────────────── the solver ────────────────────────────── */

function spark(lab: LabState, ctx: Ctx, at: string, cause: string, live = true): void {
  lab.power.sparks.push({ atPhysMs: lab.time.physMs, at, cause });
  ctx.emit('power.spark', { at, cause, live });
}

function blowFuse(lab: LabState, ctx: Ctx, fuseId: string, currentA: number): void {
  const f = lab.power.fuses[fuseId];
  if (!f || f.blown) return;
  f.blown = true;
  f.stress = 5;
  log(lab, 'power', 'warn', `fuse ${fuseId} blew at ${currentA.toFixed(2)} A (rating ${f.ratingA} A)`);
  ctx.emit('power.fuseBlown', { fuseId, railId: f.railId, currentA: Math.round(currentA * 100) / 100 });
}

function startHiccup(lab: LabState, ctx: Ctx): void {
  const psuR = roAt(ro(ro(lab).power).psus, 'MW-1');
  if (!psuR) return;
  const phys = ro(ro(lab).time).physMs;
  if (psuR.hiccupUntilPhysMs != null && psuR.hiccupUntilPhysMs > phys) return;
  const until = phys + HICCUP_MS;
  lab.power.psus['MW-1']!.hiccupUntilPhysMs = until;
  ctx.emit('power.psuHiccup', { psuId: psuR.id, untilPhysMs: until });
}

/** Wrong-plug damage (Sim §3.13.3) for arcade/full models. */
function damage(lab: LabState, ctx: Ctx, loadId: string, terminal: DcTerminal): void {
  const load = lab.power.loads[loadId]!;
  if (load.damaged) return;
  const nominal = nominalOfTerminal(lab, terminal);
  const cause = `${load.label} on ${nominal} V DC (${terminal.id})`;
  load.damaged = true;
  load.powered = false;
  spark(lab, ctx, terminal.id, cause);
  ctx.emit('power.loadDamaged', { loadId: load.id, cause });
  if (load.deviceId) {
    const d = lab.devices[load.deviceId];
    if (d && d.power !== 'fried') {
      const from = d.power;
      d.power = 'fried';
      d.state = 'FRIED';
      d.display.screen = 'off';
      d.display.brightness = 0;
      d.display.rev++;
      if (d.secondaryDisplay) {
        d.secondaryDisplay.screen = 'off';
        d.secondaryDisplay.rev++;
      }
      ctx.emit('device.powerChanged', { deviceId: d.id, from, to: 'fried' });
      ctx.emit('device.fried', { deviceId: d.id, cause });
    }
  }
  if (load.collisId) {
    const c = lab.collis[load.collisId];
    if (c) {
      c.state = 'FRIED';
      c.damaged = true;
    }
  }
  if (nominal === 24) startHiccup(lab, ctx);
  else {
    const rail = roAt(ro(ro(lab).power).rails, ro(terminal).railId);
    if (rail?.fuseId) blowFuse(lab, ctx, rail.fuseId, (rail.currentA || 1) * 3);
  }
}

/** Sim §3.1.1 #2 — solve the graph for this sub-step (reads via `ro`, writes only changed values). */
export function powerStep(lab: LabState, ctx: Ctx, sub: SubStep): void {
  const L = ro(lab);
  const p = ro(L.power);
  const phys = ro(L.time).physMs;
  const dtS = sub.dtPhysMs / 1000;
  const psu = roAt(p.psus, 'MW-1');
  if (psu?.hiccupUntilPhysMs != null && psu.hiccupUntilPhysMs <= phys) lab.power.psus['MW-1']!.hiccupUntilPhysMs = null;
  const strips = ro(p.strips);
  const loads = ro(p.loads);
  const terminals = ro(p.terminals);
  const regulators = ro(p.regulators);
  const rails = ro(p.rails);
  const fuses = ro(p.fuses);

  // 2 — AC strips: current and breaker.
  for (const sid of Object.keys(strips).sort()) {
    const s = ro(strips[sid]!);
    if (!stripLive(lab, s)) continue;
    let amps = 0;
    for (const lid of ro(s.loads)) if (lid && loads[lid]) amps += loadCurrent(lab, loads[lid]!);
    if (amps > 15) {
      lab.power.strips[sid]!.breakerTripped = true;
      ctx.emit('power.breakerTripped', { stripId: s.id, currentA: Math.round(amps * 100) / 100 });
      log(lab, 'power', 'warn', `${s.id} breaker tripped at ${amps.toFixed(1)} A`);
    }
  }

  // Terminal currents (from load states of the previous sub-step).
  const termIds = Object.keys(terminals);
  const termAmps: Record<string, number> = {};
  const termByRail: Record<string, string[]> = {};
  for (const tid of termIds) {
    const t = ro(terminals[tid]!);
    let a = 0;
    if (t.plugged) {
      const l = loads[t.plugged];
      if (l) a += loadCurrent(lab, l);
    }
    if (t.via === 'rig-main' && t.rigId && terminalVolts(lab, t) >= 4.75) a += mainAccessoryA(t.rigId);
    termAmps[tid] = a;
    (termByRail[t.railId] ??= []).push(tid);
  }

  // 4–5 — regulators, fuses, branch rails.
  let rail24Load = 0;
  for (const rid of Object.keys(regulators).sort()) {
    const reg = ro(regulators[rid]!);
    const rail = ro(rails[reg.outRail]);
    if (!rail) continue;
    let i = 0;
    for (const tid of termByRail[rail.id] ?? []) i += termAmps[tid]!;
    const fuse = rail.fuseId ? ro(fuses[rail.fuseId]) : undefined;
    const fuseOpen = !!fuse && (fuse.blown || !!fuse.removed);
    const vReg = regulatorOutput(lab, reg, fuseOpen ? 0 : i);
    let v = fuseOpen ? 0 : vReg;
    if (v === 0) i = 0;
    if (fuse && !fuseOpen) {
      const rating = fuse.ratingA;
      const prev = fuse.stress ?? 0;
      let stress = prev;
      if (i >= 3 * rating) stress = 5;
      else if (i > rating) stress += dtS * ((i / rating) ** 2 - 1);
      else stress = Math.max(0, stress - 0.5 * dtS);
      stress = Math.round(stress * 10000) / 10000;
      if (stress !== prev) lab.power.fuses[fuse.id]!.stress = stress;
      if (stress >= 5) {
        blowFuse(lab, ctx, fuse.id, i);
        v = 0;
        i = 0;
      }
    }
    setRail(lab, ctx, rail.id, v, i);
    if (vReg > 0) rail24Load += (i * reg.nominalV) / 24;
  }

  // 24 V rail.
  const v24 = rail24Effective(lab);
  for (const tid of termByRail['rail-24v'] ?? []) rail24Load += termAmps[tid]!;
  if (rail24Load > 25 && v24 > 0) startHiccup(lab, ctx);
  setRail(lab, ctx, 'rail-24v', psuOut(lab) > 0 ? PSU_V : v24, v24 > 0 ? rail24Load : 0);

  // 6 — terminals energised.
  for (const tid of termIds) {
    const t = ro(terminals[tid]!);
    const v = terminalVolts(lab, t);
    const nominal = nominalOfTerminal(lab, t);
    const on = nominal === 24 ? v >= 20 : nominal === 12 ? v >= 10 : v >= 4.75;
    if (t.energised !== on) lab.power.terminals[tid]!.energised = on;
  }

  // 7–8 — loads.
  const damageModel = ro(L.config).damageModel;
  for (const lid of Object.keys(loads).sort()) {
    const l = ro(loads[lid]!);
    const sup = ro(l.supply);
    const v = l.damaged ? 0 : hookupVolts(lab, sup);
    const vr = Math.round(v * 100) / 100;
    if ((l.volts ?? -1) !== vr) lab.power.loads[lid]!.volts = vr;
    let powered = false;
    if (!l.damaged && v > 0) {
      if (sup.kind === 'ac-strip') powered = compatibility(l, 'ac', v) === 'ok';
      else if (sup.kind === 'dc-rail') {
        const t = sup.targetId ? ro(terminals[sup.targetId]) : undefined;
        const nominal = t ? nominalOfTerminal(lab, t) : 5;
        const c = compatibility(l, 'dc', nominal);
        if (c === 'fry' && t) {
          if (damageModel === 'academy') powered = false;
          else damage(lab, ctx, lid, t);
        } else powered = c === 'ok' && (l.expects !== '5V' || v >= 4.0);
      } else if (sup.kind === 'usb') powered = v > 0;
    }
    const cur = ro(loads[lid]!);
    if (cur.powered !== powered) lab.power.loads[lid]!.powered = powered;
    // Pi under-voltage (Sim §3.13.1 #8).
    if (l.hostId && l.expects === '5V') {
      const low = powered && v < 4.63;
      if (low) {
        if (cur.lowSincePhysMs == null) lab.power.loads[lid]!.lowSincePhysMs = phys;
      } else if (cur.lowSincePhysMs != null) lab.power.loads[lid]!.lowSincePhysMs = null;
    }
  }
}

function setRail(lab: LabState, ctx: Ctx, railId: string, volts: number, amps: number): void {
  const rail = roAt(ro(ro(lab).power).rails, railId);
  if (!rail) return;
  const v = Math.round(volts * 1000) / 1000;
  const a = Math.round(amps * 100) / 100;
  const wasOn = rail.voltage > 0;
  if (rail.voltage === v && rail.currentA === a) return;
  const w = lab.power.rails[railId]!;
  if (rail.voltage !== v) w.voltage = v;
  if (rail.currentA !== a) w.currentA = a;
  if (wasOn !== v > 0) ctx.emit('power.railChanged', { railId, voltage: v });
}

/* ────────────────────────────── actions ────────────────────────────── */

function whereLoad(lab: LabState, loadId: string): { strip?: AcStrip; socket?: number; terminal?: DcTerminal } {
  for (const s of Object.values(lab.power.strips)) {
    const i = s.loads.indexOf(loadId);
    if (i >= 0) return { strip: s, socket: i + 1 };
  }
  for (const t of Object.values(lab.power.terminals)) if (t.plugged === loadId) return { terminal: t };
  return {};
}

function mirrorSupply(lab: LabState, load: PowerLoad): void {
  const sup = { ...load.supply };
  if (load.hostId && lab.hosts[load.hostId]) lab.hosts[load.hostId]!.supply = sup;
  if (load.deviceId && lab.devices[load.deviceId]) lab.devices[load.deviceId]!.supply = { ...sup };
  if (load.collisId && lab.collis[load.collisId]) lab.collis[load.collisId]!.supply = { ...sup };
}

function detach(lab: LabState, loadId: string): void {
  const w = whereLoad(lab, loadId);
  if (w.strip && w.socket) w.strip.loads[w.socket - 1] = null;
  if (w.terminal) w.terminal.plugged = null;
}

/**
 * Move an AC strip's or a PSU's plug to another wall outlet (the fix for a dead outlet, fault
 * `power.outletDead`). The target outlet must exist and be free.
 */
export function moveToOutlet(lab: LabState, ctx: Ctx, itemId: string, outletId: string, actor: string): Result {
  const p = lab.power;
  const strip = p.strips[itemId];
  const psu = p.psus[itemId];
  if (!strip && !psu) return err(`'${itemId}' is not a power strip or PSU`);
  const target = p.outlets[outletId];
  if (!target) return err(`unknown outlet '${outletId}'`);
  const from = strip ? strip.outletId : psu!.outletId;
  if (from === outletId) return OK;
  if (target.plugged && target.plugged !== itemId) return err(`${outletId} is occupied (${target.plugged})`);
  if (from && p.outlets[from]?.plugged === itemId) p.outlets[from]!.plugged = null;
  target.plugged = itemId;
  if (strip) strip.outletId = outletId;
  else psu!.outletId = outletId;
  log(lab, 'power', 'info', `${itemId} moved ${from ?? '(unplugged)'} → ${outletId} (${actor})`);
  ctx.emit('power.replugged', { itemId, fromOutletId: from ?? null, toOutletId: outletId });
  return OK;
}

export function unplug(lab: LabState, ctx: Ctx, loadId: string): Result {
  const load = lab.power.loads[loadId];
  if (!load) return err(`unknown load '${loadId}'`);
  if (load.supply.kind === 'none') return err(`${load.label} is not plugged in`);
  detach(lab, loadId);
  load.supply = { kind: 'none', targetId: null };
  mirrorSupply(lab, load);
  ctx.emit('power.unplugged', { loadId });
  return OK;
}

export function plug(lab: LabState, ctx: Ctx, loadId: string, hookup: PowerHookup, actor: string): Result {
  const load = lab.power.loads[loadId];
  if (!load) return err(`unknown load '${loadId}'`);
  if (hookup.kind === 'none') return unplug(lab, ctx, loadId);
  if (hookup.kind === 'usb') return err(`${load.label} is not a USB device`);
  let target: PowerHookup = { ...hookup };
  if (hookup.kind === 'ac-strip') {
    const s = hookup.targetId ? lab.power.strips[hookup.targetId] : undefined;
    if (!s) return err(`unknown strip '${hookup.targetId}'`);
    if (compatibility(load, 'ac', AC_V) === 'nofit') return err(`The ${load.label} lead doesn't fit an AC socket`);
    let socket = hookup.socket ?? s.loads.findIndex((x) => x == null) + 1;
    if (!(socket >= 1 && socket <= s.sockets)) return err(`${s.id} has no free socket`);
    const occ = s.loads[socket - 1];
    if (occ && occ !== loadId) return err(`socket ${socket} on ${s.id} is occupied (${lab.power.loads[occ]?.label ?? occ})`);
    target = { kind: 'ac-strip', targetId: s.id, socket };
  } else {
    let t = hookup.targetId ? lab.power.terminals[hookup.targetId] : undefined;
    if (!t && hookup.targetId && lab.power.rails[hookup.targetId]) {
      t = Object.values(lab.power.terminals).find((x) => x.railId === hookup.targetId && x.via === 'spare' && !x.plugged);
      if (!t) return err(`no free terminal on ${hookup.targetId}`);
    }
    if (!t) return err(`unknown DC terminal '${hookup.targetId}'`);
    if (t.plugged && t.plugged !== loadId) return err(`${t.id} is occupied (${lab.power.loads[t.plugged]?.label ?? t.plugged})`);
    const nominal = nominalOfTerminal(lab, t);
    const c = compatibility(load, 'dc', nominal);
    if (c === 'nofit') return err(`The ${load.label} lead doesn't fit a DC terminal`);
    if (c === 'fry' && lab.config.damageModel === 'academy') {
      spark(lab, ctx, t.id, `${load.label} on ${nominal} V DC (${t.id})`);
      log(lab, 'power', 'warn', `academy: ${actor} touched ${load.label} to ${t.id} — spark, lead popped out`);
      return err(`Spark! ${load.label} on ${nominal} V DC (${t.id}) — the lead popped out. LabSim devices and Collis probes draw an irregular 18 V and use their own bricks on AC power strips.`);
    }
    target = { kind: 'dc-rail', targetId: t.id };
  }
  detach(lab, loadId);
  load.supply = target;
  if (target.kind === 'ac-strip') lab.power.strips[target.targetId!]!.loads[target.socket! - 1] = loadId;
  else lab.power.terminals[target.targetId!]!.plugged = loadId;
  mirrorSupply(lab, load);
  ctx.emit('power.plugged', { loadId, hookup: { ...target } });
  return OK;
}

/** Is a fuse's branch live (regulator input on and 24 V present)? Sim §3.13.2. */
export function fuseBranchLive(lab: LabState, fuseId: string): boolean {
  const f = lab.power.fuses[fuseId];
  if (!f) return false;
  const reg = Object.values(lab.power.regulators).find((r) => r.outRail === f.railId);
  return !!reg && regulatorOutput(lab, reg, 0) > 0;
}

export function removeFuse(lab: LabState, ctx: Ctx, fuseId: string): Result {
  const f = lab.power.fuses[fuseId];
  if (!f) return err(`unknown fuse '${fuseId}'`);
  if (f.removed) return err(`${fuseId} holder is already empty`);
  const live = fuseBranchLive(lab, fuseId);
  f.removed = true;
  if (live) spark(lab, ctx, fuseId, `fuse ${fuseId} pulled live`);
  ctx.emit('power.fuseRemoved', { fuseId, live });
  return OK;
}

export function insertFuse(lab: LabState, ctx: Ctx, fuseId: string, ratingA: number): Result {
  const f = lab.power.fuses[fuseId];
  if (!f) return err(`unknown fuse '${fuseId}'`);
  if (![5, 10, 15, 20].includes(ratingA)) return err(`no ${ratingA} A blade fuses (spares: 5, 10, 15, 20 A)`);
  if (!f.removed) return err(`${fuseId}: remove the fitted fuse first`);
  const key = String(ratingA);
  if ((lab.power.spareFuses[key] ?? 0) <= 0) return err(`No spare ${ratingA} A fuses left on the bench`);
  lab.power.spareFuses[key] = (lab.power.spareFuses[key] ?? 0) - 1;
  const live = fuseBranchLive(lab, fuseId);
  f.removed = false;
  f.blown = false;
  f.stress = 0;
  f.ratingA = ratingA;
  if (live) spark(lab, ctx, fuseId, `fuse ${fuseId} inserted live`);
  ctx.emit('power.fuseInserted', { fuseId, ratingA, labelA: f.labelA ?? ratingA, live });
  return OK;
}

export function replaceFuse(lab: LabState, ctx: Ctx, fuseId: string): Result {
  const f = lab.power.fuses[fuseId];
  if (!f) return err(`unknown fuse '${fuseId}'`);
  if (!f.removed) {
    const r = removeFuse(lab, ctx, fuseId);
    if (!r.ok) return r;
  }
  const r = insertFuse(lab, ctx, fuseId, f.labelA ?? 10);
  if (!r.ok) return r;
  ctx.emit('power.fuseReplaced', { fuseId });
  return OK;
}

export function toggleStrip(lab: LabState, ctx: Ctx, stripId: string, on: boolean): Result {
  const s = lab.power.strips[stripId];
  if (!s) return err(`unknown strip '${stripId}'`);
  if (s.switchOn === on) return OK;
  s.switchOn = on;
  ctx.emit('power.stripToggled', { stripId, on });
  return OK;
}

export function resetBreaker(lab: LabState, ctx: Ctx, stripId: string): Result {
  const s = lab.power.strips[stripId];
  if (!s) return err(`unknown strip '${stripId}'`);
  if (!s.breakerTripped) return err(`${stripId} breaker is not tripped`);
  s.breakerTripped = false;
  ctx.emit('power.stripToggled', { stripId, on: s.switchOn });
  return OK;
}

export function togglePsu(lab: LabState, ctx: Ctx, psuId: string, on: boolean): Result {
  const psu = lab.power.psus[psuId];
  if (!psu) return err(`unknown PSU '${psuId}'`);
  if (psu.on === on) return OK;
  psu.on = on;
  log(lab, 'power', 'info', `${psuId} switched ${on ? 'on' : 'off'}`);
  return OK;
}

export function toggleRegulator(lab: LabState, ctx: Ctx, regId: string, on: boolean): Result {
  const r = lab.power.regulators[regId];
  if (!r) return err(`unknown regulator '${regId}'`);
  if (r.inputSwitch === on) return OK;
  r.inputSwitch = on;
  ctx.emit('power.regulatorToggled', { regulatorId: regId, on });
  return OK;
}

/* ────────────────────────────── multimeter (Sim §2.6) ────────────────────────────── */

const fmtDc = (v: number, nominal: number) => (nominal === 24 ? `${v.toFixed(1)} V DC` : `${v.toFixed(2)} V DC`);

export function measure(lab: LabState, pointId: string, mode: 'V' | 'OHM' = 'V'): MultimeterReading {
  const p = lab.power;
  const id = pointId.trim();
  const [base, suffix] = id.includes('.') && !/^rail-/.test(id) ? [id.slice(0, id.lastIndexOf('.')), id.slice(id.lastIndexOf('.') + 1)] : [id, ''];
  let volts = 0;
  let nominal = 5;
  let ac = false;
  let found = true;
  let fuseOhm: { blown: boolean; isolated: boolean } | null = null;

  if (/^WALL-\d+$/.test(base)) {
    ac = true;
    volts = p.outlets[base]?.live ? AC_V : 0;
    found = !!p.outlets[base];
  } else if (/^STRIP-/.test(base)) {
    ac = true;
    const s = p.strips[base];
    found = !!s;
    volts = s && stripLive(lab, s) ? AC_V : 0;
  } else if (base === 'MW-1') {
    nominal = 24;
    volts = psuOut(lab);
  } else if (p.rails[base]) {
    nominal = p.rails[base]!.nominalVoltage;
    volts = base === 'rail-24v' ? rail24Effective(lab) : p.rails[base]!.voltage;
  } else if (p.regulators[base]) {
    const reg = p.regulators[base]!;
    nominal = suffix === 'in' ? 24 : reg.nominalV;
    volts = suffix === 'in' ? rail24Effective(lab) : regulatorOutput(lab, reg);
  } else if (p.fuses[base]) {
    const f = p.fuses[base]!;
    const rail = p.rails[f.railId]!;
    const reg = Object.values(p.regulators).find((r) => r.outRail === f.railId);
    nominal = rail.nominalVoltage;
    const lineV = reg ? regulatorOutput(lab, reg) : 0;
    volts = suffix === 'line' ? lineV : f.removed ? 0 : rail.voltage;
    fuseOhm = { blown: f.blown, isolated: !!f.removed || lineV === 0 };
  } else if (p.terminals[base]) {
    const t = p.terminals[base]!;
    nominal = nominalOfTerminal(lab, t);
    volts = terminalVolts(lab, t);
  } else found = false;

  const live = volts > 0;
  let display: string;
  let ohms: number | null = null;
  if (!found) display = '---';
  else if (mode === 'OHM') {
    if (fuseOhm) {
      if (fuseOhm.isolated) {
        display = fuseOhm.blown ? 'OL' : '0.1 Ω';
        ohms = fuseOhm.blown ? null : 0.1;
      } else display = 'ERR';
    } else display = live ? 'ERR' : 'OL';
  } else display = ac ? `${volts.toFixed(1)} V AC` : fmtDc(volts, nominal);
  const isLive = fuseOhm ? !fuseOhm.isolated : live;
  return { volts: mode === 'OHM' ? 0 : Math.round(volts * 100) / 100, kind: mode === 'OHM' ? 'OHM' : ac ? 'AC' : 'DC', label: id, display, mode, ohms, live: isLive };
}
