/**
 * XP (GP §4.2), daily streaks (GP §4.7) and career-rank promotion (GP §4.3).
 * Promotion = certification passed AND `RankDef.minXp` AND the extra gate (`RANK_GATES`) met; otherwise
 * `progress.pendingRank` lists what is missing ("Promotion pending: 640 XP to go").
 */
import type { TxContext } from '@/core/store';
import type { CareerRankId, ProgressState, RootState } from '@/core/state';
import { RANKS, RANKS_BY_ID } from '@/content';
import type { RankDef } from '@/content/schema';
import type { RankGateRule, XpSource } from '../../types';
import { dateKey, today } from '../clock';
import { toast } from '../feedback';

/** Sources that get the Strict realism ×1.25 multiplier (GP §1.4). Shift XP applies it in its own formula. */
const STRICT_SOURCES: ReadonlySet<XpSource> = new Set(['academy-step', 'academy-module', 'drill', 'freeplay']);

export interface GrantOptions {
  /** No toast (batched sources such as flashcards). */
  quiet?: boolean;
  /** Already includes realism multipliers. */
  final?: boolean;
}

/** Award XP; returns the amount granted. Updates the streak and checks promotion. */
export function grantXp(d: RootState, ctx: TxContext, amount: number, source: XpSource, detail: string, opts: GrantOptions = {}): number {
  let xp = Math.max(0, Math.round(amount));
  if (!opts.final && d.session.realism === 'strict' && STRICT_SOURCES.has(source)) xp = Math.round(xp * 1.25);
  if (xp <= 0) return 0;
  const p = d.progress;
  p.xp += xp;
  ctx.emit('xp.gained', { amount: xp, source, detail, total: p.xp });
  if (!opts.quiet) toast(d, 'xp', `+${xp} XP`, detail);
  if (d.session.result) {
    d.session.result.xp += xp;
    d.session.result.xpBreakdown.push({ label: detail, xp });
  }
  bumpStreak(d, ctx, xp);
  checkPromotion(d, ctx);
  return xp;
}

/* ───────────────────────────── streak ───────────────────────────── */

export const STREAK_DAY_XP = 300;

function bumpStreak(d: RootState, ctx: TxContext, xp: number): void {
  const st = d.progress.streak;
  const t = today();
  if (st.xpTodayDay !== t) {
    st.xpTodayDay = t;
    st.xpToday = 0;
  }
  st.xpToday += xp;
  st.lastPlayedDay = t;
  if (st.xpToday < STREAK_DAY_XP || st.lastCountedDay === t) return;
  let freezeUsed = false;
  const gap = st.lastCountedDay ? t - st.lastCountedDay - 1 : 0;
  if (!st.lastCountedDay || st.current === 0) st.current = 1;
  else if (gap <= 0) st.current += 1;
  else if (gap <= st.freezes) {
    st.freezes -= gap;
    st.current += 1;
    freezeUsed = true;
  } else st.current = 1;
  st.lastCountedDay = t;
  st.lastCountedDateKey = dateKey(t);
  st.best = Math.max(st.best, st.current);
  if (st.current > 0 && st.current % 7 === 0) st.freezes = Math.min(2, st.freezes + 1);
  ctx.emit('streak.updated', { current: st.current, best: st.best, freezeUsed });
  toast(d, 'streak', `Streak: ${st.current} day${st.current === 1 ? '' : 's'}`, freezeUsed ? 'A streak freeze covered a missed day.' : undefined);
}

/** Current streak as seen today (a missed day beyond the freezes shows 0). */
export function liveStreak(p: ProgressState, t: number = today()): number {
  const st = p.streak;
  if (!st.lastCountedDay) return 0;
  const gap = t - st.lastCountedDay - 1;
  return gap <= st.freezes ? st.current : 0;
}

/* ───────────────────────────── ranks ───────────────────────────── */

export function rankIndex(id: string): number {
  const i = RANKS.findIndex((r) => r.id === id);
  return i < 0 ? 0 : i;
}

export function rankDef(id: string): RankDef {
  return RANKS_BY_ID[id] ?? RANKS[0]!;
}

function aGradeShiftsOf10Plus(s: RootState): number {
  return s.progress.shifts.history.filter((h) => !h.abandoned && h.length >= 10 && (h.grade === 'A' || h.grade === 'S')).length;
}

export function totalStars(p: ProgressState): number {
  return Object.values(p.modules).reduce((a, m) => a + (m.stars ?? 0), 0);
}

/** GP §4.3 extra gates. */
export const RANK_GATES: readonly RankGateRule[] = [
  {
    rank: 'senior-automation-engineer',
    gate: (s) => {
      const n = aGradeShiftsOf10Plus(s);
      return n >= 5 ? [] : [`5 shifts of ≥ 10 min graded ≥ A: ${Math.min(n, 5)}/5`];
    },
  },
  {
    rank: 'lab-lead',
    gate: (s) => {
      const n = totalStars(s.progress);
      return n >= 45 ? [] : [`Academy stars: ${n}/45`];
    },
  },
];

/** What still blocks promotion to `rank` (empty = promotable). */
export function promotionMissing(s: RootState, rank: RankDef): string[] {
  const missing: string[] = [];
  const exam = rank.certExamId as keyof ProgressState['certs'] | null | undefined;
  if (exam && !s.progress.certs[exam]?.passed) missing.push(exam);
  if (s.progress.xp < rank.minXp) missing.push(`xp:${rank.minXp - s.progress.xp}`);
  const gate = RANK_GATES.find((g) => g.rank === rank.id);
  if (gate) missing.push(...gate.gate(s));
  return missing;
}

/** Promote as far as allowed; maintain `pendingRank`. */
export function checkPromotion(d: RootState, ctx: TxContext): void {
  const p = d.progress;
  for (let guard = 0; guard < RANKS.length; guard++) {
    const idx = rankIndex(p.rank);
    const next = RANKS[idx + 1];
    if (!next) {
      p.pendingRank = null;
      return;
    }
    const missing = promotionMissing(d, next);
    if (missing.length === 0) {
      const from = p.rank;
      p.rank = next.id as CareerRankId;
      p.pendingRank = null;
      const lanyard = LANYARDS[next.id];
      if (lanyard) {
        p.cosmetics.lanyard = lanyard;
        if (!p.cosmetics.unlocked.includes(`lanyard.${lanyard}`)) p.cosmetics.unlocked.push(`lanyard.${lanyard}`);
      }
      for (const c of COSMETICS[next.id] ?? []) if (!p.cosmetics.unlocked.includes(c)) p.cosmetics.unlocked.push(c);
      ctx.emit('rank.changed', { from, to: p.rank });
      toast(d, 'rank', `Promoted: ${next.title}`, next.cosmetic);
      if (d.ui.overlay.kind === 'none' || d.ui.overlay.kind === 'debrief' || d.ui.overlay.kind === 'main-menu') {
        // The ceremony is shown over the debrief/menu; the UI returns to the previous screen afterwards.
        d.ui.overlay = { kind: 'rank-up', rank: next.id };
      }
      continue;
    }
    // Pending only once the exam for the next rank is passed (otherwise it is just "next rank").
    const examPassed = !next.certExamId || !missing.includes(next.certExamId);
    const pending = examPassed ? { rank: next.id as CareerRankId, missing } : null;
    const changed = JSON.stringify(pending) !== JSON.stringify(p.pendingRank);
    p.pendingRank = pending;
    if (changed && pending) ctx.emit('rank.pending', { rank: pending.rank, missing: pending.missing });
    return;
  }
}

const LANYARDS: Record<string, string> = {
  intern: 'grey',
  'lab-technician': 'blue',
  'automation-engineer-1': 'green',
  'automation-engineer-2': 'green',
  'senior-automation-engineer': 'green',
  'lab-lead': 'gold',
};

const COSMETICS: Record<string, string[]> = {
  'lab-technician': ['tool.yellow-multimeter'],
  'automation-engineer-1': ['desk.plant'],
  'automation-engineer-2': ['chair.hoodie'],
  'senior-automation-engineer': ['rig.name-label'],
  'lab-lead': ['door.name-plate', 'tool.label-maker'],
};

/** Shift difficulty cap of a career rank (GP §2.3.3). */
export function rankDifficultyCap(rank: string): number {
  return rankDef(rank).shiftDifficultyCap ?? [2, 3, 4, 5, 5, 5][rankIndex(rank)] ?? 5;
}
