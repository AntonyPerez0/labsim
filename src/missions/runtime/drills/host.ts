/**
 * Drill host (GP §2.4.1): round clock or fixed item count, item draw (GP §4.8.4: 70 % weighted toward weak
 * tags / 30 % uniform, filtered to unlocked tags), standard scoring (+100, speed +50 at ≤ 2 s → 0 at 8 s,
 * streak ×(1 + 0.1·streak) max ×2.0, wrong −50 with an inline Teach Card), medals, personal bests, XP,
 * mastery evidence (w = 0.5) and Leitner cross-mode demotion for curriculum quiz items.
 * Speed Quiz (DR10) and drills without their own bank draw from the curriculum quiz bank.
 */
import type { TxContext } from '@/core/store';
import type { RngState } from '@/core/rng';
import { createRngState, hashString } from '@/core/rng';
import type { DrillRunState, DrillSummary, Medal, RootState, TeachCard } from '@/core/state';
import { correctAnswerText, QUIZ_BANK, questionById, XP_REWARDS } from '@/content';
import type { DrillDef, DrillFeedback, DrillItem, DrillVerdict } from '../../types';
import { onActivityReset } from '../rt';
import { beginActivity, endActivity, finaliseResultRank, newResult } from '../session';
import { grantXp } from '../progression/xp';
import { addEvidenceAll } from '../progression/mastery';
import { demoteFacts } from '../progression/leitner';
import { submitScore } from '../progression/leaderboards';
import { realNowMs, todayKey } from '../clock';
import { allDrills, getDrill, mixedDrillComponent } from '../registry';
import { isComplete } from '../academy/catalog';
import { pickIncident, type WeightedItem } from '../arcade/selection';
import { toast } from '../feedback';
import { dailyInfo } from '../arcade/plans';

/** Items drawn this round (generated ones only exist here). */
const items = new Map<string, DrillItem>();
/** Wrong-answer Teach Cards of the round (debrief). */
const roundTeach: TeachCard[] = [];
let rng: RngState = createRngState(1);
let virtualDef: DrillDef | null = null;
onActivityReset(() => {
  items.clear();
  roundTeach.length = 0;
  virtualDef = null;
});

/** Hooks for modes that embed a drill round (Weak Spot). Return true when handled. */
export const drillHooks = {
  finished: [] as ((d: RootState, ctx: TxContext) => boolean)[],
};

export function drillUnlocked(d: RootState, def: DrillDef): boolean {
  return !def.unlockedBy.length || def.unlockedBy.some((m) => isComplete(d.progress, m));
}

/** Tags unlocked by completed modules (filters drill banks). */
function unlockedTagFilter(d: RootState, def: DrillDef): ((tags: readonly string[]) => boolean) | null {
  if (!def.tagUnlocks) return null;
  const allowed = new Set<string>();
  for (const [mod, tags] of Object.entries(def.tagUnlocks)) if (isComplete(d.progress, mod)) tags.forEach((t) => allowed.add(t));
  return (tags) => tags.some((t) => allowed.has(t));
}

/** Curriculum quiz items as drill items (DR10 Speed Quiz: non-† items of completed modules). */
function quizItems(d: RootState, tags: readonly string[] | null): DrillItem[] {
  const done = new Set(Object.keys(d.progress.modules).filter((m) => isComplete(d.progress, m)));
  return QUIZ_BANK.filter((q) => !q.illustrative && !q.retired && (done.has(q.moduleId) || done.size === 0) && (q.type === 'mc' || q.type === 'tf'))
    .filter((q) => !tags?.length || q.tags.some((t) => tags.includes(t)))
    .map((q) => ({
      id: `q:${q.id}`,
      tags: q.tags,
      factIds: q.factIds,
      questionId: q.id,
      teach: { whatHappened: `Correct answer: ${correctAnswerText(q)}`, why: q.explanation, doInstead: 'Review the fact in the Field Manual.', factIds: q.factIds },
      data: { questionId: q.id },
    }));
}

function bank(d: RootState, def: DrillDef, tags: readonly string[] | null): DrillItem[] {
  if (def.items?.length) {
    const tagOk = unlockedTagFilter(d, def);
    return def.items.filter((i) => (!tags?.length || i.tags.some((t) => tags.includes(t))) && (!tagOk || tagOk(i.tags))) as DrillItem[];
  }
  if (!def.generate) return quizItems(d, tags);
  return [];
}

function drawNext(d: RootState, def: DrillDef, run: DrillRunState): string | null {
  if (def.generate && !def.items?.length) {
    const it = def.generate(rng, d, run.queue.length) as DrillItem;
    const id = items.has(it.id) ? `${it.id}#${run.queue.length}` : it.id;
    items.set(id, { ...it, id });
    return id;
  }
  const pool = bank(d, def, run.tags);
  if (!pool.length) return null;
  const recent = run.queue.slice(-Math.min(run.queue.length, Math.max(3, Math.floor(pool.length / 2))));
  const cands: (WeightedItem & { item: DrillItem })[] = pool.map((it) => ({ id: it.id, tags: it.tags, fit: !recent.includes(it.id) || pool.length <= 1, item: it }));
  const pick = pickIncident(rng, d.progress, cands, { recent: run.queue, seen: () => true, mode: run.daily ? 'uniform' : 'drill' });
  if (!pick) return null;
  items.set(pick.id, pick.item);
  return pick.id;
}

export interface StartDrillOptions {
  mode?: string;
  daily?: boolean;
  tags?: string[];
  /** Embedded round (Weak Spot): keep the current activity. */
  embedded?: { def: DrillDef };
}

export function startDrill(d: RootState, ctx: TxContext, drillId: string, o: StartDrillOptions = {}): boolean {
  const def = o.embedded?.def ?? getDrill(drillId);
  if (!def) return false;
  if (!o.embedded && !o.daily && !drillUnlocked(d, def)) return false;
  const daily = !!o.daily;
  const seed = daily ? dailyInfo(d.progress).seed : hashString(`${drillId}:${realNowMs()}:${d.session.runId}`);
  if (!o.embedded) beginActivity(d, ctx, { mode: 'arcade-drill', activityId: def.id, seed, preset: def.generate ? 'factory' : null, overlay: { kind: 'drill', drillId: def.id } });
  else d.ui.overlay = { kind: 'drill', drillId: def.id };
  virtualDef = o.embedded?.def ?? null;
  rng = createRngState(seed);
  items.clear();
  roundTeach.length = 0;
  const run: DrillRunState = {
    drillId: def.id,
    mode: o.mode ?? def.modes?.[0]?.id ?? null,
    daily,
    seed,
    tags: o.tags?.length ? [...o.tags] : null,
    phase: 'running',
    durationS: def.durationS,
    timeLeftS: def.durationS,
    itemTarget: def.itemCount,
    queue: [],
    index: 0,
    currentItemId: null,
    itemShownAtS: d.session.clockS,
    score: 0,
    streak: 0,
    bestStreak: 0,
    multiplier: 1,
    correct: 0,
    wrong: 0,
    answers: [],
    teach: null,
    medal: null,
    newBest: false,
  };
  d.session.drill = run;
  const first = drawNext(d, def, run);
  if (first) run.queue.push(first);
  run.currentItemId = first;
  d.session.timerSeconds = def.durationS;
  ctx.emit('drill.started', { drillId: def.id, mode: run.mode, daily });
  return true;
}

function currentDef(d: RootState): DrillDef | null {
  const run = d.session.drill;
  if (!run) return null;
  return virtualDef && virtualDef.id === run.drillId ? virtualDef : getDrill(run.drillId);
}

export function drillItem(itemId: string): DrillItem | null {
  return items.get(itemId) ?? null;
}

/** Standard points: +100 (+50 at ≤ 2 s → 0 at 8 s) × streak multiplier; wrong −50. */
export function standardPoints(correct: boolean, ms: number, streakBefore: number): { points: number; multiplier: number } {
  const multiplier = Math.min(2, 1 + 0.1 * streakBefore);
  if (!correct) return { points: -50, multiplier: 1 };
  const s = ms / 1000;
  const speed = s <= 2 ? 50 : s >= 8 ? 0 : 50 * (1 - (s - 2) / 6);
  return { points: Math.round((100 + speed) * multiplier), multiplier };
}

export function answerDrill(d: RootState, ctx: TxContext, itemId: string, verdict: DrillVerdict): DrillFeedback {
  const run = d.session.drill;
  const def = currentDef(d);
  const empty: DrillFeedback = { points: 0, streak: 0, multiplier: 1, score: run?.score ?? 0, teach: null, nextItemId: run?.currentItemId ?? null };
  if (!run || !def || run.phase === 'finished') return empty;
  const item = items.get(itemId);
  if (!item) return empty;
  const ms = verdict.elapsedMs ?? Math.max(0, (d.session.clockS - run.itemShownAtS) * 1000);
  const std = standardPoints(verdict.correct, ms, run.streak);
  const points = verdict.pointsOverride ?? std.points;
  run.score = Math.max(0, run.score + points);
  let teach: TeachCard | null = null;
  if (verdict.correct) {
    run.streak++;
    run.correct++;
    run.bestStreak = Math.max(run.bestStreak, run.streak);
  } else {
    run.streak = 0;
    run.wrong++;
    teach = {
      ...item.teach,
      whatHappened: item.teach.whatHappened + (verdict.detail ? ` (${verdict.detail})` : ''),
      doInstead: item.teach.doInstead ?? '',
      id: `dt-${run.answers.length + 1}`,
      trigger: { kind: 'drill', ref: `${def.id}:${item.id}` },
      ticketId: null,
      masteryChange: null,
      createdAtS: d.session.clockS,
      collapsed: false,
    } as TeachCard;
  }
  run.multiplier = Math.min(2, 1 + 0.1 * run.streak);
  run.teach = teach;
  run.answers.push({ itemId, correct: verdict.correct, ms: Math.round(ms), points });
  const mc = addEvidenceAll(d, ctx, item.tags, verdict.correct ? (ms > 8000 ? 0.8 : 1) : 0, 'drill', `drill:${def.id}`);
  if (teach && mc) teach.masteryChange = { tag: mc.tag, before: mc.before, after: mc.after };
  if (teach && roundTeach.length < 10) roundTeach.push({ ...teach });
  if (item.questionId) {
    const q = questionById(item.questionId);
    const st = (d.progress.quiz[item.questionId] ??= { seen: 0, correct: 0, lastSeenDay: 0, lastCorrect: null });
    st.seen++;
    if (verdict.correct) st.correct++;
    st.lastCorrect = verdict.correct;
    if (!verdict.correct && q) demoteFacts(d, q.factIds);
  } else if (!verdict.correct && item.factIds?.length) demoteFacts(d, item.factIds);
  ctx.emit('drill.itemAnswered', { drillId: def.id, itemId, correct: verdict.correct, points, ms: Math.round(ms), streak: run.streak });

  run.index++;
  let next: string | null = null;
  if (run.itemTarget === null || run.index < run.itemTarget) {
    next = run.queue[run.index] ?? drawNext(d, def, run);
    if (next && !run.queue[run.index]) run.queue.push(next);
  }
  run.currentItemId = next;
  run.itemShownAtS = d.session.clockS;
  const fb: DrillFeedback = { points, streak: run.streak, multiplier: run.multiplier, score: run.score, teach, nextItemId: next };
  if (!next) finishDrill(d, ctx);
  return fb;
}

export function medalFor(def: DrillDef, score: number): Medal | null {
  if (score >= def.medals.gold) return 'gold';
  if (score >= def.medals.silver) return 'silver';
  if (score >= def.medals.bronze) return 'bronze';
  return null;
}

const MEDAL_ORDER: Medal[] = ['bronze', 'silver', 'gold'];

export function finishDrill(d: RootState, ctx: TxContext): void {
  const run = d.session.drill;
  const def = currentDef(d);
  if (!run || !def || run.phase === 'finished') return;
  run.phase = 'finished';
  run.currentItemId = null;
  d.session.timerSeconds = null;
  const total = run.correct + run.wrong;
  const accuracy = total ? run.correct / total : 0;
  const medal = medalFor(def, run.score);
  run.medal = medal;
  ctx.emit('drill.finished', { drillId: def.id, score: run.score, accuracy, medal, newBest: false });
  for (const h of drillHooks.finished) if (h(d, ctx)) return;

  const p = d.progress;
  const st = (p.drills[def.id] ??= { best: 0, medal: null, rounds: 0, bestAccuracy: 0, medalsPaid: [], modesUnlocked: [] });
  run.newBest = run.score > st.best;
  st.best = Math.max(st.best, run.score);
  st.rounds++;
  st.bestAccuracy = Math.max(st.bestAccuracy, accuracy);
  if (medal && (!st.medal || MEDAL_ORDER.indexOf(medal) > MEDAL_ORDER.indexOf(st.medal))) st.medal = medal;
  if (run.mode && !st.modesUnlocked.includes(run.mode)) st.modesUnlocked.push(run.mode);
  if (medal === 'gold') for (const m of def.modes ?? []) if (m.unlock === 'first-gold' && !st.modesUnlocked.includes(m.id)) st.modesUnlocked.push(m.id);
  p.bestDrillScores[def.id] = st.best;
  p.stats.drillRounds++;

  const result = newResult(d, 'drill', def.name);
  d.session.result = result;
  result.passed = true;
  result.points = run.score;
  result.accuracy = accuracy;
  grantXp(d, ctx, Math.min(XP_REWARDS.drillRoundCap, Math.floor(run.score / XP_REWARDS.drillScoreDivisor)), 'drill', `${def.name}: ${run.score} pts`);
  if (medal) {
    for (const m of MEDAL_ORDER.slice(0, MEDAL_ORDER.indexOf(medal) + 1)) {
      if (st.medalsPaid.includes(m)) continue;
      st.medalsPaid.push(m);
      grantXp(d, ctx, XP_REWARDS.drillFirstMedal[m] ?? 0, 'drill-medal', `First ${m} in ${def.name}`, { final: true });
    }
  }
  const boardId = run.daily ? `dailyDrill:${todayKey()}` : `drill:${def.id}`;
  submitScore(d, boardId, { score: run.score, medal, accuracy, seed: String(run.seed), maxCombo: run.bestStreak, at: realNowMs() });
  result.drill = {
    drillId: def.id,
    score: run.score,
    accuracy,
    correct: run.correct,
    total,
    bestStreak: run.bestStreak,
    medal,
    newBest: run.newBest,
    teachCards: roundTeach.map((t) => ({ ...t })),
  } satisfies DrillSummary;
  if (run.newBest) toast(d, 'success', 'New personal best!', `${def.name}: ${run.score}`);
  endActivity(d, ctx, result);
  finaliseResultRank(d);
}

/** Per tick: round clock and inline Teach Card timeout (2.5 s). */
export function tickDrill(d: RootState, ctx: TxContext, dtS: number): void {
  const run = d.session.drill;
  if (!run || run.phase !== 'running') return;
  if (run.teach && d.session.clockS - run.teach.createdAtS >= 2.5) run.teach = null;
  if (run.timeLeftS !== null) {
    run.timeLeftS = Math.max(0, run.timeLeftS - dtS);
    d.session.timerSeconds = run.timeLeftS;
    if (run.timeLeftS <= 0) finishDrill(d, ctx);
  }
}

export function dismissDrillTeach(d: RootState): void {
  if (d.session.drill) d.session.drill.teach = null;
}

/** Mixed drill for Weak Spot: items touching the tags from every unlocked drill bank. */
export function mixedDrillDef(d: RootState, tags: readonly string[], count: number): DrillDef {
  const pool: DrillItem[] = [];
  for (const def of allDrills()) {
    if (!drillUnlocked(d, def)) continue;
    for (const it of def.items ?? []) if (it.tags.some((t) => tags.includes(t))) pool.push(it as DrillItem);
  }
  if (pool.length < count) pool.push(...quizItems(d, tags));
  const mixed = mixedDrillComponent();
  return {
    id: 'WEAKSPOT',
    name: 'Weak Spot warm-up',
    format: 'Mixed items for your weakest tags',
    tags: [...tags],
    unlockedBy: [],
    durationS: 90,
    itemCount: count,
    medals: { bronze: 300, silver: 500, gold: 700 },
    scoring: 'standard',
    items: pool,
    ...(mixed ? { component: mixed } : {}),
  };
}

