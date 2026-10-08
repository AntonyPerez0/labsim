/**
 * Achievement rules ACH01–ACH46 (GP §4.5; texts/xp/icons in content `ACHIEVEMENTS_BY_ID`) and their
 * evaluation after matching events (and once at load for state-only rules). Unlocks grant the content XP,
 * toast, emit `achievement.unlocked` and appear in the current debrief.
 */
import type { TxContext } from '@/core/store';
import type { AchievementProgress, RootState, TicketState } from '@/core/state';
import { ACHIEVEMENTS, ACHIEVEMENTS_BY_ID, MANUAL_ARTICLES, MODULE_ORDER, QUIPS, TOPIC_TAGS } from '@/content';
import type { AchievementEvent, AchievementRule, AnyEventMatcher } from '../../types';
import { on } from '../../types';
import { matchesEvent } from '../conditions/evaluate';
import { effectiveMastery } from './mastery';
import { grantXp } from './xp';
import { realNowMs, today } from '../clock';
import { toast } from '../feedback';
import { isComplete } from '../academy/catalog';
import type { LogEntry } from '../rt';

type P = Record<string, unknown>;
const pl = (ev: AchievementEvent | null): P => ((ev?.payload ?? {}) as P);

function ticketOf(s: RootState, ev: AchievementEvent | null): TicketState | null {
  const id = pl(ev).ticketId;
  return typeof id === 'string' ? (s.session.tickets.find((t) => t.id === id) ?? null) : null;
}

function resolvedTicket(incidentId: string): AnyEventMatcher {
  return on('ticket.resolved', { incidentId });
}

function hasBonus(s: RootState, t: TicketState | null, pbId: string): boolean {
  return !!t && !!s.session.shift?.bonuses.some((b) => b.ticketId === t.id && b.pbId === pbId);
}

function ticketPenaltyIds(s: RootState, t: TicketState | null): string[] {
  if (!t) return [];
  return (s.session.shift?.penalties ?? []).filter((p) => p.ticketId === t.id).map((p) => p.gwId);
}

const listAdd = (prev: AchievementProgress | undefined, key: string, value: string): AchievementProgress => {
  const list = Array.isArray(prev?.[key]) ? [...(prev![key] as string[])] : [];
  if (!list.includes(value)) list.push(value);
  return { ...(prev ?? {}), [key]: list };
};
const listLen = (prog: AchievementProgress | undefined, key: string): number => (Array.isArray(prog?.[key]) ? (prog![key] as string[]).length : 0);
const num = (prog: AchievementProgress | undefined, key: string): number => (typeof prog?.[key] === 'number' ? (prog![key] as number) : 0);

const MODELLED = ['wall-e', 'eve', 'bumblebee', 'r2-d2', 'johnny-5', 'baymax', 'seti', 'rosie', 'megatron', 'optimus', 'data', 'tars'];

function inspectedPart(id: string): string | null {
  for (const rig of MODELLED) {
    if (!id.includes(rig)) continue;
    if (/\bpi\b|\.pi(\.|$)|-pi/.test(id)) return `${rig}:pi`;
    if (/tablet|screen|mfd|cfd/.test(id)) return `${rig}:tablet`;
    if (/device|flex|mini|station|compact|duo|pocket|cradle/.test(id)) return `${rig}:device`;
  }
  return null;
}

const shiftEnded = on('shift.ended');
const missionDone = on('mission.completed');
const drillDone = on('drill.finished');

export const ACHIEVEMENT_RULES: readonly AchievementRule[] = [
  { id: 'ACH01', triggers: [missionDone], check: (s) => isComplete(s.progress, 'M01') },
  { id: 'ACH02', triggers: [missionDone], check: (s) => MODULE_ORDER.every((m) => isComplete(s.progress, m)), meter: (s) => [MODULE_ORDER.filter((m) => isComplete(s.progress, m)).length, 18] },
  { id: 'ACH03', triggers: [missionDone], check: (s) => MODULE_ORDER.every((m) => s.progress.modules[m]?.stars === 3), meter: (s) => [MODULE_ORDER.filter((m) => s.progress.modules[m]?.stars === 3).length, 18] },
  { id: 'ACH04', triggers: [on('rig.bannerChanged', { from: 'yellow', to: 'green' })], check: () => true },
  {
    id: 'ACH05',
    triggers: [on('drill.finished', { drillId: 'DR01' })],
    check: (s) => {
      const r = s.session.drill;
      return !!r && r.answers.length >= 15 && r.answers.every((a) => a.correct);
    },
  },
  {
    id: 'ACH06',
    triggers: [resolvedTicket('INC03')],
    check: (s, _p, ev) => {
      const t = ticketOf(s, ev);
      if (!t || t.escalation?.outcome === 'accepted') return false;
      const pens = ticketPenaltyIds(s, t);
      const fuse = String(t.binding.vars.fuse ?? 'F-RACKB-5V');
      return hasBonus(s, t, 'PB07') && !pens.includes('GW03') && !pens.includes('GW04') && s.lab.power?.fuses?.[fuse]?.ratingA === 10 && (s.progress.incidents.INC03?.solves ?? 0) === 1;
    },
  },
  {
    id: 'ACH07',
    triggers: [shiftEnded],
    check: (s) => {
      const done = s.progress.shifts.history.filter((h) => !h.abandoned);
      const last = done.slice(-10);
      return last.length >= 10 && last.every((h) => !h.penalties.includes('GW01') && !h.penalties.includes('GW02'));
    },
  },
  { id: 'ACH08', triggers: [on('gw.triggered', { gwId: 'GW01' }), on('gw.triggered', { gwId: 'GW02' })], check: () => true },
  {
    id: 'ACH09',
    triggers: [resolvedTicket('INC42'), resolvedTicket('INC43')],
    progress: (prev, ev, s) => (pl(ev).incidentId === 'INC42' && hasBonus(s, ticketOf(s, ev), 'PB05') ? { ...(prev ?? {}), keptLegacy: true } : (prev ?? {})),
    check: (_s, prog, ev) => pl(ev).incidentId === 'INC43' && prog?.keptLegacy === true,
  },
  {
    id: 'ACH10',
    triggers: [on('drill.finished', { drillId: 'DR05' })],
    check: (s) => {
      const r = s.session.drill;
      return !!r && r.answers.length >= 5 && r.answers.every((a) => a.correct && a.points >= 100);
    },
  },
  {
    id: 'ACH11',
    triggers: [on('drill.itemAnswered', { drillId: 'DR06' })],
    progress: (prev, ev) => ({ ...(prev ?? {}), streak: pl(ev).correct ? num(prev, 'streak') + 1 : 0 }),
    check: (_s, prog) => num(prog, 'streak') >= 10,
    meter: (_s, prog) => [Math.min(10, num(prog, 'streak')), 10],
  },
  { id: 'ACH12', triggers: [on('drill.finished', { drillId: 'DR07', medal: 'gold' })], check: () => true },
  { id: 'ACH13', triggers: [resolvedTicket('INC38')], check: () => true },
  { id: 'ACH14', triggers: [on('drill.finished', { drillId: 'DR11', medal: 'gold' })], check: () => true },
  {
    id: 'ACH15',
    triggers: [resolvedTicket('INC41')],
    check: (s, _p, ev) => {
      const t = ticketOf(s, ev);
      return !!t && !ticketPenaltyIds(s, t).includes('GW05') && !(s.session.shift?.penalties ?? []).some((p) => p.gwId === 'GW05' && p.atS >= t.arrivedAtS);
    },
  },
  {
    id: 'ACH16',
    triggers: [resolvedTicket('INC05')],
    check: (s, _p, ev) => {
      const t = ticketOf(s, ev);
      return !!t && (t.counters.powerCycles ?? 0) === 0 && !ticketPenaltyIds(s, t).includes('GW17');
    },
  },
  { id: 'ACH17', triggers: [on('shift.comboChanged', {}, (p) => p.combo >= 8)], check: () => true },
  {
    id: 'ACH18',
    triggers: [shiftEnded],
    check: (s, _p, ev) => {
      const sh = s.session.shift;
      return !!sh && sh.lengthMinutes >= 10 && sh.penalties.length === 0 && pl(ev).reason !== 'quit' && sh.kind !== 'certification';
    },
  },
  { id: 'ACH19', triggers: [on('shift.ended', { configId: 'shift-20', reason: 'time' })], check: (s) => (s.session.shift?.stats.breaches ?? 1) === 0 },
  { id: 'ACH20', triggers: [on('pipeline.finished'), on('pipeline.attempted')], check: (s) => (s.session.shift?.greenWallS ?? 0) >= 120 },
  { id: 'ACH21', triggers: [on('shift.ended', { grade: 'S' })], check: () => true },
  { id: 'ACH22', triggers: [shiftEnded], check: (s) => s.progress.daily.history.filter((h) => h.ranked).length >= 7, meter: (s) => [Math.min(7, s.progress.daily.history.filter((h) => h.ranked).length), 7] },
  { id: 'ACH23', triggers: [on('streak.updated')], check: (s) => s.progress.streak.current >= 30, meter: (s) => [Math.min(30, s.progress.streak.current), 30] },
  { id: 'ACH24', triggers: [on('ticket.resolved', { incidentId: 'INC52', fastDiagnosis: true })], check: () => true },
  {
    id: 'ACH25',
    triggers: [resolvedTicket('INC55')],
    check: (s, _p, ev) => {
      const t = ticketOf(s, ev);
      return !!t && ticketPenaltyIds(s, t).length === 0 && (s.progress.incidents.INC55?.attempts ?? 0) === 1;
    },
  },
  {
    id: 'ACH26',
    triggers: [resolvedTicket('INC53'), resolvedTicket('INC54')],
    check: (s) => ['INC53', 'INC54'].every((id) => s.session.tickets.some((t) => t.incidentId === id && t.status === 'resolved')),
  },
  { id: 'ACH27', triggers: [resolvedTicket('INC56')], check: () => true },
  {
    id: 'ACH28',
    triggers: [resolvedTicket('INC19')],
    check: (s, _p, ev) => {
      const t = ticketOf(s, ev);
      return hasBonus(s, t, 'PB01') && !(s.session.shift?.penalties ?? []).some((p) => p.gwId === 'GW11');
    },
  },
  {
    id: 'ACH29',
    triggers: [on('player.inspected')],
    progress: (prev, ev) => {
      const part = inspectedPart(String(pl(ev).interactableId ?? ''));
      return part ? listAdd(prev, 'seen', part) : (prev ?? {});
    },
    check: (_s, prog) => listLen(prog, 'seen') >= 36,
    meter: (_s, prog) => [Math.min(36, listLen(prog, 'seen')), 36],
  },
  {
    id: 'ACH30',
    triggers: [on('quip.collected')],
    progress: (prev, ev) => listAdd(prev, 'quips', String(pl(ev).quipId)),
    check: (_s, prog) => listLen(prog, 'quips') >= Math.max(1, QUIPS.length),
    meter: (_s, prog) => [listLen(prog, 'quips'), QUIPS.length],
  },
  {
    id: 'ACH31',
    triggers: [on('manual.entryUnlocked')],
    check: (s) => MANUAL_ARTICLES.every((a) => s.progress.fieldManual.unlocked.includes(a.id)),
    meter: (s) => [MANUAL_ARTICLES.filter((a) => s.progress.fieldManual.unlocked.includes(a.id)).length, MANUAL_ARTICLES.length],
  },
  { id: 'ACH32', triggers: [on('flashcard.reviewed')], check: (s) => s.progress.flashcards.reviewsTotal >= 500, meter: (s) => [Math.min(500, s.progress.flashcards.reviewsTotal), 500] },
  {
    id: 'ACH33',
    triggers: [on('mastery.changed')],
    check: (s, _p, ev) => {
      const tm = s.progress.tagMastery[String(pl(ev).tag)];
      return !!tm && tm.minSeen < 0.4 && Number(pl(ev).after) >= 0.85;
    },
  },
  {
    id: 'ACH34',
    triggers: [on('mastery.changed')],
    check: (s) => {
      const now = realNowMs();
      const fine = TOPIC_TAGS.filter((t) => (t as { kind?: string }).kind !== 'module');
      return fine.length > 0 && fine.every((t) => effectiveMastery(s.progress.tagMastery[t.id], now) >= 0.8);
    },
  },
  { id: 'ACH35', triggers: [on('rank.changed', { to: 'lab-lead' })], check: (s) => s.progress.rank === 'lab-lead' },
  {
    id: 'ACH36',
    triggers: [on('ticket.escalated', { outcome: 'accepted' })],
    check: (s) => s.progress.stats.escalationsCorrect >= 5 && (s.progress.penalties.GW12 ?? 0) === 0,
    meter: (s) => [Math.min(5, s.progress.stats.escalationsCorrect), 5],
  },
  {
    id: 'ACH37',
    triggers: [resolvedTicket('INC57')],
    progress: (prev) => ({ ...(prev ?? {}), verdicts: num(prev, 'verdicts') + 1 }),
    check: (_s, prog) => num(prog, 'verdicts') >= 5,
    meter: (_s, prog) => [Math.min(5, num(prog, 'verdicts')), 5],
  },
  { id: 'ACH38', triggers: [resolvedTicket('INC44')], check: () => true },
  {
    id: 'ACH39',
    triggers: [drillDone],
    check: (s) => Object.values(s.progress.drills).filter((x) => x.medal === 'gold').length >= 19,
    meter: (s) => [Object.values(s.progress.drills).filter((x) => x.medal === 'gold').length, 19],
  },
  { id: 'ACH40', triggers: [on('mission.completed', { moduleId: 'M18', stars: 3 })], check: () => true },
  { id: 'ACH41', triggers: [on('shift.ended', { configId: 'shift-20' })], check: (s, _p, ev) => s.session.shift?.realism === 'strict' && (pl(ev).grade === 'A' || pl(ev).grade === 'S') },
  { id: 'ACH42', triggers: [on('freeplay.faultFixed')], check: (s) => s.progress.freeplay.fixesTotal >= 10, meter: (s) => [Math.min(10, s.progress.freeplay.fixesTotal), 10] },
  {
    id: 'ACH43',
    triggers: [on('drill.finished', { drillId: 'DR03', medal: 'gold' }), resolvedTicket('INC27')],
    progress: (prev, ev) => {
      const p = pl(ev);
      if (p.drillId === 'DR03') return { ...(prev ?? {}), dr03: true };
      if (p.incidentId === 'INC27' && Number(p.rS) < 60) return { ...(prev ?? {}), inc27: true };
      return prev ?? {};
    },
    check: (_s, prog) => prog?.dr03 === true && prog?.inc27 === true,
  },
  {
    id: 'ACH44',
    triggers: [resolvedTicket('INC20')],
    check: (s, _p, ev) => {
      const t = ticketOf(s, ev);
      return !!t && hasBonus(s, t, 'PB03') && Number(pl(ev).rS) <= t.parS;
    },
  },
  { id: 'ACH45', triggers: [on('cert.finished', { passed: true })], check: () => true },
  { id: 'ACH46', triggers: [on('cert.finished', { passed: true, distinction: true })], check: () => true },
];

const RULE_BY_ID: Readonly<Record<string, AchievementRule>> = Object.fromEntries(ACHIEVEMENT_RULES.map((r) => [r.id, r]));

export function unlockAchievement(d: RootState, ctx: TxContext, id: string): boolean {
  if (d.progress.achievements[id]) return false;
  const def = ACHIEVEMENTS_BY_ID[id];
  d.progress.achievements[id] = { unlockedAtDay: today(), unlockedAt: realNowMs() };
  const xp = def?.xp ?? 0;
  ctx.emit('achievement.unlocked', { achievementId: id, title: def?.title ?? id, xp });
  toast(d, 'achievement', def?.title ?? id, def?.description, def?.icon);
  d.session.result?.newAchievements.push(id);
  if (xp > 0) grantXp(d, ctx, xp, 'achievement', `${def?.title ?? id}`, { quiet: true, final: true });
  return true;
}

/** Evaluate every rule triggered by an event. */
export function onAchievementEvent(d: RootState, ctx: TxContext, e: LogEntry): void {
  if (e.type === 'achievement.unlocked' || e.type === 'xp.gained') return;
  const ev: AchievementEvent = { type: e.type, payload: e.payload, at: e.atMs };
  for (const rule of ACHIEVEMENT_RULES) {
    if (d.progress.achievements[rule.id]) continue;
    if (!rule.triggers.some((m) => matchesEvent(m, e.type, e.payload, d))) continue;
    try {
      if (rule.progress) d.progress.achievementProgress[rule.id] = rule.progress(d.progress.achievementProgress[rule.id], ev, d);
      if (rule.check(d, d.progress.achievementProgress[rule.id], ev)) unlockAchievement(d, ctx, rule.id);
    } catch (err) {
      console.warn(`[missions] achievement ${rule.id} threw`, err);
    }
  }
}

/** Load-time check of state-only rules (`ev = null`). */
export function checkAchievementsAtLoad(d: RootState, ctx: TxContext): void {
  for (const id of ['ACH01', 'ACH02', 'ACH03', 'ACH22', 'ACH23', 'ACH31', 'ACH32', 'ACH35', 'ACH39', 'ACH42']) {
    const rule = RULE_BY_ID[id];
    if (!rule || d.progress.achievements[id]) continue;
    try {
      if (rule.check(d, d.progress.achievementProgress[id], null)) unlockAchievement(d, ctx, id);
    } catch {
      /* state-only rules never throw on a fresh profile */
    }
  }
}

export function achievementMeter(d: RootState, id: string): [number, number] | null {
  const rule = RULE_BY_ID[id];
  return rule?.meter ? rule.meter(d, d.progress.achievementProgress[id]) : null;
}

export { ACHIEVEMENTS };
