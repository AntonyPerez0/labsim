/**
 * Pre-drawn spawn plans: Daily Challenge (GP §4.6, fixed draw order per content version), certification
 * practical shifts (GP §2.3.12, Cur §5.3), Weak Spot micro-shifts (GP §4.8.5) and Academy "Play now"
 * micro-shifts.
 */
import type { RngState } from '@/core/rng';
import { chance, createRngState, hashString, nextFloat, pick, shuffle } from '@/core/rng';
import type { HeatLevel, PlannedSpawn, ProgressState } from '@/core/state';
import { CONTENT_VERSION } from '@/core/state';
import type { DailyChallengeInfo, IncidentDef } from '../../types';
import { allDrills, allIncidents } from '../registry';
import { dateKey, today } from '../clock';
import { candidateRigs, eligibleVariants, incidentCategory } from './binding';
import { HEAT_TABLE } from './config';
import { topByWeight, type WeightedItem } from './selection';
import { isComplete, modeUnlocked } from '../academy/catalog';

/* ───────────────────────────── Daily Challenge ───────────────────────────── */

export function dailySeedString(key: string): string {
  return `labsim-daily-${CONTENT_VERSION}:${key}`;
}

export function dailyInfo(p: ProgressState, day: number = today()): DailyChallengeInfo {
  const key = dateKey(day);
  const seedString = dailySeedString(key);
  const seed = hashString(seedString);
  const drills = allDrills();
  const drillNo = (seed % 19) + 1;
  const drillId = `DR${String(drillNo).padStart(2, '0')}`;
  const best = p.daily.history.filter((h) => h.dateKey === key).reduce<number | null>((m, h) => (m === null || h.score > m ? h.score : m), null);
  return {
    dateKey: key,
    seedString,
    seed,
    rankedAvailable: p.daily.lastRankedDateKey !== key,
    drillId: drills.some((d) => d.id === drillId) || !drills.length ? drillId : drills[drillNo % drills.length]!.id,
    bestToday: best,
    unlocked: modeUnlocked(p, 'daily'),
  };
}

const SLOT_MAX_DIFF = (slot: number): number => (slot <= 3 ? 2 : slot <= 7 ? 3 : 4);
const SLOT_HEAT = (slot: number): HeatLevel => (slot <= 3 ? 1 : slot <= 7 ? 2 : slot <= 10 ? 3 : 4);

/** GP §4.6 draw: incidents, variants, rigs, misleading flags, arrivals, compound pairing — in that order. */
export function buildDailyPlan(seed: number, incidents: readonly IncidentDef[] = allIncidents(), durationS = 600): PlannedSpawn[] {
  const rng = createRngState(seed);
  const pool = incidents.filter((i) => i.difficulty <= 4 && i.parS <= 360 && !i.plannedWorkOnly).sort((a, b) => a.id.localeCompare(b.id));
  const chosen: IncidentDef[] = [];
  for (let slot = 1; slot <= 12; slot++) {
    const cands = pool.filter((i) => i.difficulty <= SLOT_MAX_DIFF(slot) && !chosen.includes(i));
    if (!cands.length) break;
    chosen.push(pick(rng, cands));
  }
  const variants = chosen.map((i) => pick(rng, eligibleVariants(i, null)).id);
  const rigs = chosen.map((i) => {
    const c = candidateRigs(i);
    return c.length ? pick(rng, c) : null;
  });
  const misleading = chosen.map((i, k) => !!i.ticket.misleading && chance(rng, HEAT_TABLE[SLOT_HEAT(k + 1)].misleadingChance));
  const arrivals: number[] = [];
  let t = 8;
  for (let k = 0; k < chosen.length; k++) {
    arrivals.push(Math.round(t * 10) / 10);
    t += HEAT_TABLE[SLOT_HEAT(k + 2)].meanInterArrivalS * (0.75 + 0.5 * nextFloat(rng));
  }
  const plan: PlannedSpawn[] = chosen.map((inc, k) => ({
    slot: k + 1,
    incidentId: inc.id,
    variantId: variants[k]!,
    rig: rigs[k]!,
    misleading: misleading[k]!,
    arrivalS: Math.min(arrivals[k]!, durationS - inc.parS > 8 ? durationS - inc.parS : arrivals[k]!),
    compoundWith: null,
    ticketId: null,
  }));
  for (let k = 0; k < plan.length - 1; k++) {
    const cp = HEAT_TABLE[SLOT_HEAT(k + 1)].compoundChance;
    if (!cp || plan[k]!.compoundWith) continue;
    if (!chance(rng, cp)) continue;
    const a = chosen[k]!;
    const partner = plan.slice(k + 1).find((p) => !p.compoundWith && (a.compoundWith ?? []).includes(p.incidentId));
    if (partner) {
      partner.compoundWith = a.id;
      plan[k]!.compoundWith = partner.incidentId;
      partner.rig = plan[k]!.rig;
    }
  }
  return plan;
}

/* ───────────────────────────── certification practical shifts ───────────────────────────── */

export function buildCertPlan(seed: number, count: number, opts: { requireCategories?: readonly string[]; simultaneousAtS?: number; durationS: number }): PlannedSpawn[] {
  const rng = createRngState(seed);
  const pool = allIncidents().filter((i) => !i.plannedWorkOnly && i.parS <= opts.durationS * 0.6);
  const chosen: IncidentDef[] = [];
  for (const cat of opts.requireCategories ?? []) {
    const c = pool.filter((i) => incidentCategory(i) === cat && !chosen.includes(i));
    if (c.length) chosen.push(pick(rng, c));
  }
  const rest = shuffle(rng, pool.filter((i) => !chosen.includes(i)));
  while (chosen.length < count && rest.length) chosen.push(rest.shift()!);
  const ordered = shuffle(rng, chosen);
  const span = opts.durationS * 0.55;
  return ordered.map((inc, k) => {
    let arrival = 8 + (span * k) / Math.max(1, ordered.length);
    if (opts.simultaneousAtS !== undefined && k >= 3 && k <= 4) arrival = opts.simultaneousAtS;
    const rigs = candidateRigs(inc);
    return {
      slot: k + 1,
      incidentId: inc.id,
      variantId: pick(rng, eligibleVariants(inc, null)).id,
      rig: rigs.length ? pick(rng, rigs) : null,
      misleading: false,
      arrivalS: Math.round(arrival),
      compoundWith: null,
      ticketId: null,
    };
  }).sort((a, b) => a.arrivalS - b.arrivalS);
}

/* ───────────────────────────── Weak Spot / micro ───────────────────────────── */

export function unlockedIncident(p: ProgressState, inc: IncidentDef): boolean {
  return !inc.unlockedBy || isComplete(p, inc.unlockedBy);
}

/** GP §4.8.5: the highest-w unlocked incidents for the weak tags. */
export function buildWeakSpotPlan(p: ProgressState, tags: readonly string[], rng: RngState): PlannedSpawn[] {
  const items: (WeightedItem & { inc: IncidentDef })[] = allIncidents()
    .filter((i) => !i.plannedWorkOnly)
    .map((inc) => ({ id: inc.id, tags: inc.tags, fit: unlockedIncident(p, inc) && inc.difficulty <= 4, inc }));
  const top = topByWeight(p, items, 3, tags);
  const arrivals = [6, 20, 40];
  return top.map((x, k) => ({
    slot: k + 1,
    incidentId: x.id,
    variantId: pick(rng, eligibleVariants(x.inc, 2)).id,
    rig: null,
    misleading: false,
    arrivalS: arrivals[k]!,
    compoundWith: null,
    ticketId: null,
  }));
}

export function buildMicroPlan(ids: readonly string[]): PlannedSpawn[] {
  return ids.map((id, k) => ({ slot: k + 1, incidentId: id, variantId: 'A', rig: null, misleading: false, arrivalS: 5 + k * 20, compoundWith: null, ticketId: null }));
}

/**
 * Σ par × 1.2 (GP §4.8.5 micro-shift length) of working time, plus the time the player cannot act on:
 * the staggered arrivals (`buildMicroPlan`), a health-check reveal (up to one 60 s cycle) and the
 * deferred verification of the last fix (next health check / next build). Plan shifts end as soon as
 * every ticket is closed, so the slack only matters for slow, correct solves.
 */
export function microLength(ids: readonly string[]): number {
  const incs = allIncidents();
  const defs = ids.map((id) => incs.find((i) => i.id === id));
  const sum = defs.reduce((a, inc) => a + (inc?.parS ?? 120), 0);
  const arrivals = 5 + 20 * Math.max(0, ids.length - 1);
  const reveal = defs.some((inc) => inc?.reveal === 'healthCheck') ? 60 : 0;
  const verify = 60;
  return Math.max(120, Math.round(sum * 1.2) + arrivals + reveal + verify);
}
