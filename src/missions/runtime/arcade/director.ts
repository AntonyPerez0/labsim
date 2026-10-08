/**
 * Arcade Shift director (GP §2.3): shift setup, real-time clock at 5× game time, heat ramp, ticket
 * spawning (heat spawner or pre-drawn plan), planned work, shift events, Jared's lunch, strikes / early
 * end, end-of-shift handover, grade, XP, records, leaderboard and debrief.
 */
import type { TxContext } from '@/core/store';
import { chance, hashString, nextFloat, pick } from '@/core/rng';
import type { HeatLevel, PlannedSpawn, RootState, ShiftKind, ShiftState } from '@/core/state';
import { articlesForTags, personText, XP_REWARDS } from '@/content';
import type { IncidentDef, ShiftConfig, ShiftStartOptions } from '../../types';
import { RT } from '../rt';
import { realNowMs, todayKey } from '../clock';
import { barkById, removeBanner, setBanner, toast } from '../feedback';
import { beginActivity, endActivity, finaliseResultRank, healthCheckInS, newResult } from '../session';
import { grantXp, rankDifficultyCap } from '../progression/xp';
import { shiftBoardId, submitScore } from '../progression/leaderboards';
import { allDrills, allIncidents, getIncident } from '../registry';
import { HEAT_TABLE, SHIFT_BY_ID, SHIFT_EVENTS, heatFor } from './config';
import { candidateRigs, incidentCategory } from './binding';
import { buildCertPlan, buildDailyPlan, buildMicroPlan, dailySeedString, microLength, unlockedIncident } from './plans';
import { pickIncident, type WeightedItem } from './selection';
import { busyRigs, checkReveals, injectIncident } from './spawn';
import { closeUnresolved, releaseQueuedEscalations, tickTickets } from './tickets';
import { createPipelines, setActivePipelines, tickPipelines, uptimeOf } from './pipelines';
import { addScore, openTickets, shiftOf } from './shiftCore';
import { HANDOVER_DEBT, shiftGrade, shiftXp, uptimeBonus } from './scoring';
import { penaltyHooks } from './penalties';
import { TR } from './ticketRuntime';
import { modeUnlocked } from '../academy/catalog';
import { rankDef } from '../progression/xp';

/** Mastery before/after for tags touched during the shift ("Review these"). */
const masteryTrack = new Map<string, { before: number; after: number }>();

/** Hooks for modes built on a shift (certification, Weak Spot). Return true when the hook produced the result. */
export const directorHooks = {
  ended: [] as ((d: RootState, ctx: TxContext, reason: NonNullable<ShiftState['endReason']>) => boolean)[],
};

export interface ShiftExtras {
  mode?: 'arcade-shift' | 'arcade-weakspot' | 'certification';
  plan?: PlannedSpawn[];
  durationS?: number;
  seed?: number;
  seedText?: string;
  /** Keep the current activity (Weak Spot drills → micro-shift). */
  keepSession?: boolean;
  preset?: string;
}

export function shiftUnlock(d: RootState, cfg: ShiftConfig): { unlocked: boolean; reason: string | null } {
  const p = d.progress;
  if (cfg.kind === 'certification' || cfg.id === 'micro') return { unlocked: true, reason: null };
  if (cfg.id === 'daily') return modeUnlocked(p, 'daily') ? { unlocked: true, reason: null } : { unlocked: false, reason: 'Complete M14' };
  if (cfg.unlock.module && !modeUnlocked(p, cfg.id === 'weak-spot' ? 'weak-spot' : cfg.id)) return { unlocked: false, reason: `Complete ${cfg.unlock.module}` };
  if (cfg.unlock.rank) {
    const need = rankDef(cfg.unlock.rank);
    if ((need.index ?? 0) > (rankDef(p.rank).index ?? 0)) return { unlocked: false, reason: `Reach ${need.title}` };
  }
  return { unlocked: true, reason: null };
}

function randomSeedText(d: RootState): string {
  const h = hashString(`${realNowMs()}:${d.session.runId}:${d.progress.stats.shiftsCompleted}:${d.progress.xp}`);
  return h.toString(16).padStart(8, '0').slice(0, 8);
}

/** Start a shift. Returns false when locked or unknown. */
export function startShift(d: RootState, ctx: TxContext, o: ShiftStartOptions, x: ShiftExtras = {}): boolean {
  const cfg = SHIFT_BY_ID[o.configId];
  if (!cfg) return false;
  if (!x.mode && !shiftUnlock(d, cfg).unlocked) return false;
  const realism = o.realism ?? d.progress.realism;
  let seedText: string;
  let seedMode: ShiftState['seedMode'] = o.seedMode ?? 'random';
  if (cfg.id === 'daily') seedMode = 'daily';
  if (x.seedText) seedText = x.seedText;
  else if (seedMode === 'daily') seedText = dailySeedString(todayKey());
  else if (seedMode === 'custom' && o.customSeed) seedText = o.customSeed;
  else {
    seedMode = 'random';
    seedText = randomSeedText(d);
  }
  const rngSeed = x.seed ?? hashString(seedText);
  const mode = x.mode ?? 'arcade-shift';
  if (!x.keepSession) {
    beginActivity(d, ctx, {
      mode,
      activityId: cfg.id,
      seed: rngSeed,
      realism,
      preset: x.preset ?? (cfg.kind === 'certification' ? 'cert' : 'arcade'),
      timeScale: cfg.timeScale,
      startHour: 8,
      simConfig: { pipelinesEnabled: cfg.pipelines, forceHealthCheckAllowed: false },
    });
  }
  const planIds = o.incidentIds ?? [];
  const durationS = x.durationS ?? cfg.realSeconds ?? microLength(planIds);
  const wildcard = cfg.wildcard === 'forced' ? true : cfg.wildcard === 'never' ? false : !!o.wildcard;
  const ranked = cfg.id === 'daily' && !o.practice && d.progress.daily.lastRankedDateKey !== todayKey();
  let plan: PlannedSpawn[] | null = x.plan ?? null;
  if (!plan && cfg.id === 'daily') plan = buildDailyPlan(rngSeed, allIncidents(), durationS);
  if (!plan && cfg.id === 'micro') plan = buildMicroPlan(planIds);
  if (!plan && cfg.kind === 'certification')
    plan = buildCertPlan(rngSeed, cfg.incidents?.count ?? 5, { durationS, ...(cfg.incidents?.requireCategories ? { requireCategories: cfg.incidents.requireCategories } : {}), ...(cfg.incidents?.simultaneousAtS !== undefined ? { simultaneousAtS: cfg.incidents.simultaneousAtS } : {}) });
  const heat0: HeatLevel = cfg.fixedHeat ?? 1;
  const sh: ShiftState = {
    configId: cfg.id,
    kind: cfg.kind as ShiftKind,
    lengthMinutes: cfg.lengthMinutes ?? Math.round(durationS / 60),
    seed: seedText,
    seedMode,
    rngSeed,
    wildcard,
    realism,
    startPosition: o.startPosition ?? 'desk',
    ranked,
    practice: cfg.id === 'daily' && !ranked,
    phase: 'running',
    durationS,
    elapsedS: 0,
    heat: heat0,
    heatCap: cfg.heatCap,
    difficultyCap: cfg.rankCaps ? Math.min(HEAT_TABLE[heat0].maxDifficulty, rankDifficultyCap(d.progress.rank)) : HEAT_TABLE[heat0].maxDifficulty,
    nextSpawnAtS: plan ? null : cfg.firstTicketAtS,
    spawnHoldUntilS: null,
    score: 0,
    target: 0,
    combo: 0,
    maxCombo: 0,
    multiplier: 1,
    strikes: 0,
    strikeLog: [],
    penalties: [],
    bonuses: [],
    pipelines: createPipelines(),
    pipelinePoints: 0,
    uptime: { attempts: 0, gotRig: 0 },
    event: null,
    jaredAwayUntilS: null,
    queuedEscalations: [],
    plannedWorkTicketId: null,
    plan,
    pickHistory: [],
    stats: { spawned: 0, resolved: 0, breaches: 0, fastDiagnoses: 0, calls: 0, wrongCalls: 0, escalationsCorrect: 0, escalationsBounced: 0, hintsUsed: 0, penaltyEvents: 0 },
    greenWallS: 0,
    nextHealthCheckInS: healthCheckInS(d),
    rules: {
      scoring: cfg.scoring,
      hintsMaxTier: !cfg.hints ? 0 : realism === 'strict' ? 1 : 3,
      diagnosisCall: cfg.diagnosisCall,
      hudObjectives: cfg.hudObjectives,
      pipelines: cfg.pipelines,
      strikesToEnd: cfg.strikesToEnd,
      forceHealthCheck: false,
    },
    grade: null,
    ratio: null,
    endReason: null,
  };
  if (cfg.shiftEvents && chance(RT.rng, 0.3)) {
    const ev = pick(RT.rng, SHIFT_EVENTS);
    sh.event = { id: ev.id, firesAtS: Math.round(durationS * (0.3 + 0.2 * nextFloat(RT.rng))), fired: false, activeUntilS: null, remaining: ev.misleadingTickets?.count ?? 0 };
  }
  setActivePipelines(sh.pipelines, sh.heat);
  d.session.shift = sh;
  d.session.timerSeconds = durationS;
  d.session.computer.forceHealthCheckButton = false;
  d.session.computer.tabCompletion = realism !== 'strict';
  masteryTrack.clear();
  if (ranked) {
    d.progress.daily.lastRankedDateKey = todayKey();
    d.progress.daily.rankedCount++;
  }
  ctx.emit('mission.teleportRequested', { locationId: sh.startPosition === 'rack' ? 'loc.rack-a' : 'loc.workstation' });
  ctx.emit('shift.started', { configId: cfg.id, kind: cfg.kind, seed: seedText, lengthMinutes: sh.lengthMinutes, realism, ranked, wildcard });
  const dayFlag = `firstShift:${todayKey()}`;
  if (!d.progress.flags[dayFlag] && cfg.kind !== 'certification') {
    d.progress.flags[dayFlag] = true;
    barkById(d, ctx, 'BARK_JARED_08', 'flavour');
  }
  if (cfg.kind === 'certification') setBanner(d, 'cert', 'info', `${cfg.title}: no hints, no score — resolve every incident.`, 8);
  return true;
}

/* ───────────────────────────── spawning ───────────────────────────── */

function remainingS(sh: ShiftState): number {
  return sh.durationS - sh.elapsedS;
}

interface Cand extends WeightedItem {
  inc: IncidentDef;
  taught: boolean;
}

function candidates(d: RootState, sh: ShiftState): Cand[] {
  const busy = new Set(busyRigs(d));
  return allIncidents()
    .filter((i) => !i.plannedWorkOnly)
    .map((inc) => {
      const taught = unlockedIncident(d.progress, inc);
      const rigs = candidateRigs(inc);
      const bindable = inc.rigs.scope === 'none' || !!inc.bind || rigs.some((r) => !busy.has(r));
      const fit = (taught || sh.wildcard) && inc.difficulty <= sh.difficultyCap && inc.parS <= remainingS(sh) && bindable;
      return { id: inc.id, tags: inc.tags, fit, inc, taught };
    });
}

function spawnOne(d: RootState, ctx: TxContext, inc: IncidentDef, o: { rig?: string | null; variantId?: string; misleading?: boolean; reporter?: string | null; planned?: boolean; slot?: number | null; compound?: string | null; allowBusy?: boolean; uniform?: boolean; opening?: boolean }): boolean {
  const sh = shiftOf(d)!;
  const res = injectIncident(d, ctx, inc, {
    ...(o.variantId ? { variantId: o.variantId } : {}),
    rig: o.rig ?? null,
    heat: sh.heat,
    misleading: !!o.misleading,
    reporterOverride: o.reporter ?? null,
    source: sh.kind === 'certification' ? 'cert' : sh.kind === 'weak-spot' ? 'weak-spot' : 'shift',
    plannedWork: !!o.planned,
    notYetTaught: !unlockedIncident(d.progress, inc),
    planSlot: o.slot ?? null,
    compoundKey: o.compound ?? null,
    uniformVariant: !!o.uniform,
    allowBusy: !!o.allowBusy,
    ...(o.opening ? { pipelineRevealWithinS: OPENING_PIPELINE_REVEAL_S } : {}),
  });
  if (!res) return false;
  sh.pickHistory.push(inc.id);
  if (sh.pickHistory.length > 10) sh.pickHistory.splice(0, sh.pickHistory.length - 10);
  return true;
}

let compoundSeq = 0;

/**
 * The shift's opening ticket (GP §2.3.2 "first ticket t = 8 s"): the first spawn lands at 8 s, but a
 * health-check-revealed incident only surfaces at the next ping (up to a minute later) and a
 * pipeline-revealed one when a build on its rig fails (up to the 90 s fallback). So the opening pick
 * prefers incidents that do not wait for the health check, and a pipeline reveal falls back after this.
 */
const OPENING_PIPELINE_REVEAL_S = 12;

function heatSpawn(d: RootState, ctx: TxContext, sh: ShiftState): void {
  const row = HEAT_TABLE[sh.heat];
  // Forced incident from a shift event.
  const ev = sh.event;
  const evDef = ev && ev.fired ? SHIFT_EVENTS.find((e) => e.id === ev.id) : null;
  if (evDef?.forcesIncident && ev && ev.remaining >= 0 && !ev.activeUntilS) {
    const inc = getIncident(evDef.forcesIncident);
    ev.activeUntilS = sh.elapsedS;
    if (inc && inc.parS <= remainingS(sh) && spawnOne(d, ctx, inc, {})) return;
  }
  const opening = d.session.tickets.length === 0 && TR.pending.length === 0;
  let cands = candidates(d, sh);
  if (opening && cands.some((c) => c.fit && c.inc.reveal !== 'healthCheck')) cands = cands.map((c) => (c.inc.reveal === 'healthCheck' ? { ...c, fit: false } : c));
  const seen = (id: string) => (d.progress.incidents[id]?.attempts ?? 0) > 0;
  const choice = pickIncident(RT.rng, d.progress, cands, { recent: sh.pickHistory, seen, mode: sh.kind === 'daily' ? 'uniform' : 'shift' });
  if (!choice) return;
  let misleading = chance(RT.rng, row.misleadingChance);
  let reporter: string | null = null;
  if (ev?.id === 'onboarding-day' && ev.fired && ev.remaining > 0) {
    ev.remaining--;
    misleading = true;
    reporter = 'alex';
  }
  const compound = row.compoundChance > 0 && !!choice.inc.compoundWith?.length && chance(RT.rng, row.compoundChance) ? `cmp${++compoundSeq}` : null;
  const ok = spawnOne(d, ctx, choice.inc, { misleading, reporter, compound, opening });
  if (ok && compound) {
    const partnerId = choice.inc.compoundWith!.find((id) => cands.some((c) => c.id === id && (c.taught || sh.wildcard)));
    const partner = partnerId ? getIncident(partnerId) : null;
    const rig = d.session.tickets[d.session.tickets.length - 1]?.binding.rig ?? TR.pending[TR.pending.length - 1]?.binding.rig ?? null;
    if (partner && rig) spawnOne(d, ctx, partner, { rig, compound, allowBusy: true });
  }
}

function openCount(d: RootState): number {
  return openTickets(d).filter((t) => !t.plannedWork).length + TR.pending.filter((p) => !p.plannedWork).length;
}

function tickSpawner(d: RootState, ctx: TxContext, sh: ShiftState): void {
  if (sh.plan) {
    for (const ps of sh.plan) {
      if (ps.ticketId || (ps as PlannedSpawn & { spawned?: boolean }).spawned || sh.elapsedS < ps.arrivalS) continue;
      const inc = getIncident(ps.incidentId);
      if (!inc) {
        (ps as PlannedSpawn & { spawned?: boolean }).spawned = true;
        continue;
      }
      const ok = spawnOne(d, ctx, inc, { rig: ps.rig, variantId: ps.variantId, misleading: ps.misleading, slot: ps.slot, compound: ps.compoundWith ? `plan-${[ps.incidentId, ps.compoundWith].sort().join('+')}` : null, allowBusy: !!ps.compoundWith, uniform: true });
      // Every player of a seeded plan must get every ticket: when the incident cannot bind yet (its rigs
      // are held by an open ticket, a build holds the rig) try again shortly instead of dropping it.
      if (ok) (ps as PlannedSpawn & { spawned?: boolean }).spawned = true;
      else ps.arrivalS = sh.elapsedS + 10;
    }
    return;
  }
  const max = HEAT_TABLE[sh.heat].maxOpenTickets;
  const scheduleNext = () => {
    sh.nextSpawnAtS = sh.elapsedS + HEAT_TABLE[sh.heat].meanInterArrivalS * (0.75 + 0.5 * nextFloat(RT.rng));
  };
  if (sh.nextSpawnAtS !== null && sh.elapsedS >= sh.nextSpawnAtS) {
    if (openCount(d) < max) {
      heatSpawn(d, ctx, sh);
      scheduleNext();
    } else {
      sh.nextSpawnAtS = null;
      sh.spawnHoldUntilS = null;
    }
  } else if (sh.nextSpawnAtS === null && sh.spawnHoldUntilS !== null && sh.elapsedS >= sh.spawnHoldUntilS && openCount(d) < max) {
    sh.spawnHoldUntilS = null;
    heatSpawn(d, ctx, sh);
    scheduleNext();
  }
  // Full Shift planned work at t = 30 s (GP §2.3.11).
  const cfg = SHIFT_BY_ID[sh.configId];
  if (cfg?.plannedWork && sh.plannedWorkTicketId === null && sh.elapsedS >= 30 && !TR.pending.some((p) => p.plannedWork)) {
    const pool = allIncidents().filter((i) => (i.plannedWork || i.plannedWorkOnly) && i.difficulty <= rankDifficultyCap(d.progress.rank) && (unlockedIncident(d.progress, i) || sh.wildcard));
    const items = pool.map((inc) => ({ id: inc.id, tags: inc.tags, fit: true, inc }));
    const choice = pickIncident(RT.rng, d.progress, items, { recent: sh.pickHistory, seen: () => true, mode: 'shift' });
    sh.plannedWorkTicketId = '';
    if (choice) spawnOne(d, ctx, choice.inc, { planned: true });
  }
}

function tickEvent(d: RootState, ctx: TxContext, sh: ShiftState): void {
  const ev = sh.event;
  if (!ev) return;
  if (!ev.fired && sh.elapsedS >= ev.firesAtS) {
    const def = SHIFT_EVENTS.find((e) => e.id === ev.id)!;
    const forced = def.forcesIncident ? getIncident(def.forcesIncident) : null;
    if (def.forcesIncident && (!forced || forced.parS > remainingS(sh))) {
      // A forced incident needs remaining time ≥ its par: draw another event.
      const others = SHIFT_EVENTS.filter((e) => !e.forcesIncident || ((getIncident(e.forcesIncident)?.parS ?? Infinity) <= remainingS(sh)));
      const alt = others.length ? pick(RT.rng, others) : null;
      if (!alt || alt.id === ev.id) {
        sh.event = null;
        return;
      }
      ev.id = alt.id;
      ev.remaining = alt.misleadingTickets?.count ?? 0;
      return;
    }
    ev.fired = true;
    if (def.banner) setBanner(d, 'shift-event', 'info', personText(def.banner), def.jaredAwayS ? d.session.clockS + def.jaredAwayS : d.session.clockS + 10);
    if (def.jaredAwayS) {
      sh.jaredAwayUntilS = sh.elapsedS + def.jaredAwayS;
      ev.activeUntilS = sh.jaredAwayUntilS;
    }
    if (def.forcesIncident) {
      sh.nextSpawnAtS = sh.elapsedS;
      sh.spawnHoldUntilS = null;
    }
    ctx.emit('shift.eventStarted', { eventId: ev.id });
    toast(d, 'info', def.title, def.banner ? personText(def.banner) : undefined);
  }
  if (ev.fired && sh.jaredAwayUntilS !== null && sh.elapsedS >= sh.jaredAwayUntilS) {
    sh.jaredAwayUntilS = null;
    removeBanner(d, 'shift-event');
    ctx.emit('shift.eventEnded', { eventId: ev.id });
    releaseQueuedEscalations(d, ctx);
  }
}

/* ───────────────────────────── tick ───────────────────────────── */

export function tickShift(d: RootState, ctx: TxContext, dtS: number): void {
  const sh = shiftOf(d);
  if (!sh) return;
  sh.elapsedS += dtS;
  d.session.timerSeconds = Math.max(0, sh.durationS - sh.elapsedS);
  const cfg = SHIFT_BY_ID[sh.configId];
  const heat = cfg?.fixedHeat ?? heatFor(sh.elapsedS / sh.durationS, sh.heatCap);
  if (heat !== sh.heat) {
    sh.heat = heat;
    sh.difficultyCap = cfg?.rankCaps ? Math.min(HEAT_TABLE[heat].maxDifficulty, rankDifficultyCap(d.progress.rank)) : HEAT_TABLE[heat].maxDifficulty;
    ctx.emit('shift.heatChanged', { heat });
  }
  sh.nextHealthCheckInS = healthCheckInS(d);
  tickEvent(d, ctx, sh);
  tickSpawner(d, ctx, sh);
  checkReveals(d, ctx, null);
  tickTickets(d, ctx);
  if (sh.rules.pipelines) tickPipelines(d, ctx, dtS);
  if (!shiftOf(d)) return; // ended on strikes inside the tick
  if (sh.elapsedS >= sh.durationS) {
    endShift(d, ctx, 'time');
    return;
  }
  // Plan-driven shifts end early once every planned ticket is closed.
  if (sh.plan && sh.plan.length && sh.plan.every((p) => p.ticketId && !openTickets(d).some((t) => t.id === p.ticketId)) && !TR.pending.length) endShift(d, ctx, 'early');
}

export function trackMastery(tag: string, before: number, after: number): void {
  const m = masteryTrack.get(tag);
  if (m) m.after = after;
  else masteryTrack.set(tag, { before, after });
}

/* ───────────────────────────── end ───────────────────────────── */

export function endShift(d: RootState, ctx: TxContext, reason: NonNullable<ShiftState['endReason']>): void {
  const sh = d.session.shift;
  if (!sh || sh.phase === 'ended') return;
  // Handover debt for open tickets (GP §2.3.10).
  for (const t of openTickets(d)) {
    if (sh.rules.scoring) addScore(d, ctx, -HANDOVER_DEBT, `Handover ${t.id}`, t.id);
    closeUnresolved(d, ctx, t, 'handover');
  }
  TR.pending = [];
  if (sh.rules.pipelines && sh.rules.scoring) {
    const bonus = uptimeBonus(uptimeOf(d));
    if (bonus) addScore(d, ctx, bonus, `Pipeline uptime ${Math.round(uptimeOf(d) * 100)} %`, null);
  }
  sh.phase = 'ended';
  sh.endReason = reason;
  sh.ratio = sh.target > 0 ? sh.score / sh.target : 0;
  sh.grade = shiftGrade(sh.ratio, sh.strikes, sh.stats.breaches, reason === 'strikes');
  d.session.timerSeconds = null;
  if (reason === 'strikes') barkLine(d, ctx);
  ctx.emit('shift.ended', { configId: sh.configId, score: sh.score, grade: sh.grade, ratio: sh.ratio, reason });
  for (const h of directorHooks.ended) if (h(d, ctx, reason)) return;
  writeShiftResult(d, ctx, sh, reason);
}

function barkLine(d: RootState, ctx: TxContext): void {
  ctx.emit('mission.bark', { speaker: 'jared', text: "Let's call it for today — read the Field Manual page on what went wrong before tomorrow.", barkId: null, priority: 'safety' });
  toast(d, 'warning', 'Shift ended: 3 strikes', 'Grade capped at D.');
}

/** Records, XP, leaderboard and the debrief for a scored shift. */
export function writeShiftResult(d: RootState, ctx: TxContext, sh: ShiftState, reason: NonNullable<ShiftState['endReason']>, opts: { abandoned?: boolean; noDebrief?: boolean } = {}): void {
  const p = d.progress;
  const cfg = SHIFT_BY_ID[sh.configId];
  const result = newResult(d, 'shift', cfg?.title ?? sh.configId);
  d.session.result = result;
  const grade = sh.grade ?? 'D';
  const ratio = sh.ratio ?? 0;
  const uptime = uptimeOf(d);
  const daily = sh.configId === 'daily';
  const dateKey = todayKey();
  const record = {
    at: realNowMs(),
    configId: sh.configId,
    length: sh.lengthMinutes,
    seed: sh.seed,
    realism: sh.realism,
    score: sh.score,
    grade,
    ratio,
    ticketsSpawned: sh.stats.spawned,
    ticketsResolved: sh.stats.resolved,
    breaches: sh.stats.breaches,
    penalties: sh.penalties.map((x) => x.gwId),
    strikes: sh.strikes,
    maxCombo: sh.maxCombo,
    uptime,
    fastDiagnoses: sh.stats.fastDiagnoses,
    escalations: { correct: sh.stats.escalationsCorrect, bounced: sh.stats.escalationsBounced },
    abandoned: !!opts.abandoned,
    dailyDateKey: daily ? dateKey : null,
    ranked: sh.ranked,
    wildcard: sh.wildcard,
  };
  p.shifts.history.push(record);
  if (p.shifts.history.length > 50) p.shifts.history.splice(0, p.shifts.history.length - 50);
  if (!opts.abandoned) {
    p.shifts.gradeCounts[grade] = (p.shifts.gradeCounts[grade] ?? 0) + 1;
    p.shifts.byLength[String(sh.lengthMinutes)] = (p.shifts.byLength[String(sh.lengthMinutes)] ?? 0) + 1;
    p.stats.shiftsCompleted++;
    // CERT-R5 counts the ratio of a *full* 20-minute shift: "Call it a day" after two quick tickets would
    // otherwise post an inflated ratio over a tiny target.
    if (sh.configId === 'shift-20' && reason === 'time') p.shifts.bestFullShiftRatio = Math.max(p.shifts.bestFullShiftRatio, ratio);
  }
  p.bestShiftScores[sh.configId] = Math.max(p.bestShiftScores[sh.configId] ?? 0, sh.score);
  if (daily) {
    p.daily.history.push({ dateKey, score: sh.score, grade, realism: sh.realism, ranked: sh.ranked });
    if (p.daily.history.length > 30) p.daily.history.splice(0, p.daily.history.length - 30);
  }

  // Leaderboards (standard shifts and the ranked Daily attempt).
  let board: { boardId: string; rank: number | null; deltaVsBest: number | null } | null = null;
  const boardId = daily ? (sh.ranked ? `daily:${dateKey}:${sh.realism}` : null) : sh.kind === 'standard' || sh.kind === 'full' ? shiftBoardId(sh.lengthMinutes, sh.realism) : null;
  if (boardId && sh.rules.scoring) {
    const r = submitScore(d, boardId, { score: sh.score, grade, seed: sh.seed, maxCombo: sh.maxCombo, fastDiagnoses: sh.stats.fastDiagnoses, at: realNowMs() });
    board = { boardId, ...r };
  }

  // XP (GP §4.2).
  if (sh.rules.scoring) {
    let xp = shiftXp(sh.score, grade, sh.realism === 'strict', XP_REWARDS.shiftGradeBonus);
    if (daily && !sh.ranked) xp = Math.floor(xp / 2);
    grantXp(d, ctx, xp, 'shift', `${cfg?.title ?? sh.configId}: ${sh.score} pts, grade ${grade}`, { final: true });
    if (daily && sh.ranked && !opts.abandoned) grantXp(d, ctx, XP_REWARDS.dailyRanked, 'daily', 'Daily Challenge ranked attempt', { final: true });
  }

  const review = [...masteryTrack.entries()]
    .filter(([, m]) => m.after < m.before - 1e-6)
    .sort((a, b) => b[1].before - b[1].after - (a[1].before - a[1].after))
    .slice(0, 5)
    .map(([tag, m]) => ({ tag, before: m.before, after: m.after, drillId: drillForTag(tag), articleId: articlesForTags([tag])[0]?.id ?? null }));

  result.passed = reason !== 'strikes';
  result.points = sh.score;
  result.accuracy = sh.stats.calls ? (sh.stats.calls - sh.stats.wrongCalls) / sh.stats.calls : 1;
  result.takeaways = sh.penalties.slice(0, 5).map((x) => `${x.gwId}: ${x.detail}`);
  result.shift = {
    configId: sh.configId,
    score: sh.score,
    grade,
    ratio,
    target: sh.target,
    ticketsSpawned: sh.stats.spawned,
    ticketsResolved: sh.stats.resolved,
    breaches: sh.stats.breaches,
    strikes: sh.strikes,
    penalties: sh.penalties.map((x) => ({ ...x })),
    bonuses: sh.bonuses.map((x) => ({ ...x })),
    maxCombo: sh.maxCombo,
    uptime,
    fastDiagnoses: sh.stats.fastDiagnoses,
    escalations: { correct: sh.stats.escalationsCorrect, bounced: sh.stats.escalationsBounced },
    handoverTickets: d.session.tickets.filter((t) => t.status === 'handover').length,
    reviewTags: review,
    leaderboard: board,
    endReason: reason,
  };
  if (!opts.abandoned && !opts.noDebrief) endActivity(d, ctx, result);
  finaliseResultRank(d);
}

function drillForTag(tag: string): string | null {
  const drills = allDrills();
  const exact = drills.find((dr) => dr.tags.includes(tag));
  if (exact) return exact.id;
  const prefix = tag.split('.')[0]!;
  return drills.find((dr) => dr.tags.some((t) => t.startsWith(`${prefix}.`) || t.replace('*', '') === `${prefix}.`))?.id ?? null;
}

/** Practical shift categories present (cert summaries). */
export function categoriesOf(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => getIncident(id)).filter((x): x is IncidentDef => !!x).map(incidentCategory))];
}

penaltyHooks.endShift = (d, ctx, reason) => endShift(d, ctx, reason);
