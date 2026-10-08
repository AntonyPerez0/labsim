/**
 * Leitner flashcards (Cur §4.0, GP §4.8.2): boxes 1–5 with review intervals session / 1 / 3 / 7 / 14
 * days, "Got it" promotes one box, "Missed it" drops to box 1 and re-queues the card at the end of the
 * session; 20 new cards/day, 60 reviews/session; any wrong quiz item (or, in Arcade, a wrong Diagnosis
 * Call / bounced escalation / GW penalty) sends every card sharing a fact to box 1. Mastery = share of
 * unlocked cards in box ≥ 4.
 */
import type { TxContext } from '@/core/store';
import type { LeitnerCard, ProgressState, RootState } from '@/core/state';
import { FLASHCARDS, flashcardById, flashcardsForDeck } from '@/content';
import { XP_REWARDS } from '@/content';
import { dayStartEpochMs, realNowMs, today } from '../clock';
import { onActivityReset } from '../rt';
import { addEvidenceAll } from './mastery';
import { grantXp } from './xp';

export const BOX_INTERVAL_DAYS: Readonly<Record<number, number>> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 14 };
export const NEW_PER_DAY = 20;
export const REVIEWS_PER_SESSION = 60;

/** Live review session (queue in order; missed box-1 cards are re-queued at the end). */
const session = { active: false, queue: [] as string[], reviewed: [] as string[], reviews: 0 };
onActivityReset(() => {
  /* Flashcard sessions are independent of activities; keep them. */
});

function card(p: ProgressState, id: string): LeitnerCard | undefined {
  return p.leitner[id];
}

function normalise(c: Partial<LeitnerCard>, todayDay: number): LeitnerCard {
  const box = Math.max(1, Math.min(5, c.box ?? 1));
  const dueDay = c.dueDay ?? todayDay;
  return {
    box,
    dueDay,
    due: c.due ?? dayStartEpochMs(dueDay),
    lastReviewed: c.lastReviewed ?? 0,
    streak: c.streak ?? 0,
    introducedDay: c.introducedDay ?? todayDay,
  };
}

/** Unlock a deck (`deck.M04` or `M04`): its cards enter box 1, due now. Returns the number added. */
export function unlockDeck(d: RootState, deck: string): number {
  const t = today();
  let added = 0;
  for (const c of flashcardsForDeck(deck)) {
    if (d.progress.leitner[c.id]) continue;
    d.progress.leitner[c.id] = normalise({ box: 1, dueDay: t, due: dayStartEpochMs(t), lastReviewed: 0, streak: 0, introducedDay: t }, t);
    added++;
  }
  return added;
}

/** Cross-mode demotion: every unlocked card sharing a fact goes to box 1 (due now). Returns ids demoted. */
export function demoteFacts(d: RootState, factIds: readonly string[]): string[] {
  if (!factIds.length) return [];
  const want = new Set(factIds);
  const t = today();
  const out: string[] = [];
  for (const c of FLASHCARDS) {
    if (!c.factIds.some((f) => want.has(f))) continue;
    const lc = d.progress.leitner[c.id];
    if (!lc) continue;
    if (lc.box !== 1 || lc.dueDay > t) out.push(c.id);
    lc.box = 1;
    lc.dueDay = t;
    lc.due = dayStartEpochMs(t);
    lc.streak = 0;
  }
  return out;
}

function isNew(c: LeitnerCard): boolean {
  return !c.lastReviewed;
}

/** Card ids due today (oldest due first), new cards capped by the daily allowance. */
export function dueCardIds(p: ProgressState, opts: { deck?: string; tags?: string[] } = {}, todayDay: number = today()): string[] {
  const newLeft = Math.max(0, NEW_PER_DAY - (p.flashcards.newCardsDay === todayDay ? p.flashcards.newCardsToday : 0));
  const deckIds = opts.deck ? new Set(flashcardsForDeck(opts.deck).map((c) => c.id)) : null;
  const tags = opts.tags?.length ? new Set(opts.tags) : null;
  const due = Object.entries(p.leitner)
    .map(([id, c]) => ({ id, c: normalise(c, todayDay) }))
    .filter(({ id, c }) => c.dueDay <= todayDay && (!deckIds || deckIds.has(id)))
    .filter(({ id }) => !tags || (flashcardById(id)?.tags ?? []).some((t) => tags.has(t)))
    .sort((a, b) => a.c.dueDay - b.c.dueDay || a.c.box - b.c.box || a.id.localeCompare(b.id));
  const out: string[] = [];
  let newUsed = 0;
  for (const { id, c } of due) {
    if (isNew(c)) {
      if (newUsed >= newLeft) continue;
      newUsed++;
    }
    out.push(id);
  }
  return out;
}

export function startFlashcardSession(p: ProgressState, opts: { deck?: string; tags?: string[] } = {}) {
  const t = today();
  const due = dueCardIds(p, opts, t);
  session.active = true;
  session.queue = due.slice(0, REVIEWS_PER_SESSION);
  session.reviewed = [];
  session.reviews = 0;
  const newToday = p.flashcards.newCardsDay === t ? p.flashcards.newCardsToday : 0;
  return { queue: [...session.queue], due: due.length, newToday, reviewsLeft: REVIEWS_PER_SESSION };
}

export function sessionQueue(): string[] {
  return [...session.queue];
}

/** Self-grade one card. */
export function reviewCard(d: RootState, ctx: TxContext, cardId: string, gotIt: boolean): void {
  const t = today();
  const now = realNowMs();
  const p = d.progress;
  const existing = card(p, cardId);
  if (!existing) {
    if (!flashcardById(cardId)) return;
    p.leitner[cardId] = normalise({ box: 1, dueDay: t }, t);
  }
  const lc = p.leitner[cardId]!;
  Object.assign(lc, normalise(lc, t));
  const wasNew = isNew(lc);
  const boxBefore = lc.box;
  if (gotIt) {
    lc.box = Math.min(5, lc.box + 1);
    lc.streak += 1;
  } else {
    lc.box = 1;
    lc.streak = 0;
  }
  lc.dueDay = t + (BOX_INTERVAL_DAYS[lc.box] ?? 0);
  lc.due = dayStartEpochMs(lc.dueDay);
  lc.lastReviewed = now;

  const fc = p.flashcards;
  if (wasNew) {
    if (fc.newCardsDay !== t) {
      fc.newCardsDay = t;
      fc.newCardsToday = 0;
    }
    fc.newCardsToday++;
  }
  fc.reviewsTotal++;
  p.stats.flashcardsReviewed++;
  ctx.emit('flashcard.reviewed', { cardId, gotIt, boxBefore, boxAfter: lc.box });

  // Session bookkeeping: drop from the queue; a miss is re-queued at the end of this session.
  if (session.active) {
    const i = session.queue.indexOf(cardId);
    if (i >= 0) session.queue.splice(i, 1);
    session.reviewed.push(cardId);
    session.reviews++;
    if (!gotIt && session.reviews < REVIEWS_PER_SESSION) session.queue.push(cardId);
  }

  // XP: 2 per card, +3 for "Got it", cap 200/day (GP §4.2).
  if (fc.xpTodayDay !== t) {
    fc.xpTodayDay = t;
    fc.xpToday = 0;
  }
  const want = XP_REWARDS.flashcardReview + (gotIt ? XP_REWARDS.flashcardGotIt : 0);
  const xp = Math.max(0, Math.min(want, XP_REWARDS.flashcardDailyCap - fc.xpToday));
  if (xp > 0) {
    fc.xpToday += xp;
    grantXp(d, ctx, xp, 'flashcard', cardId, { quiet: true });
  }

  // Mastery evidence (flashcard w = 0.5; Got it q = 0.9, Missed it q = 0).
  const def = flashcardById(cardId);
  if (def) addEvidenceAll(d, ctx, def.tags, gotIt ? 0.9 : 0, 'flashcard', `flashcard:${cardId}`);
}

/** End the session (records the last-session card list for the certification retake gate). */
export function endFlashcardSession(d: RootState): void {
  if (!session.active) return;
  d.progress.flashcards.lastSessionDay = today();
  d.progress.flashcards.lastSessionCardIds = [...new Set(session.reviewed)];
  session.active = false;
  session.queue = [];
}

export function leitnerSummary(p: ProgressState, todayDay: number = today()) {
  const ids = Object.keys(p.leitner);
  const perDeckCounts: Record<string, { n: number; hi: number }> = {};
  let hi = 0;
  for (const id of ids) {
    const lc = p.leitner[id]!;
    const deck = flashcardById(id)?.deck ?? `deck.${flashcardById(id)?.moduleId ?? '?'}`;
    perDeckCounts[deck] ??= { n: 0, hi: 0 };
    perDeckCounts[deck].n++;
    if (lc.box >= 4) {
      hi++;
      perDeckCounts[deck].hi++;
    }
  }
  const perDeck: Record<string, number> = {};
  for (const [k, v] of Object.entries(perDeckCounts)) perDeck[k] = v.n ? v.hi / v.n : 0;
  return {
    overall: ids.length ? hi / ids.length : 0,
    perDeck,
    dueNow: dueCardIds(p, {}, todayDay).length,
    unlocked: ids.length,
  };
}

/** Share of ALL cards (not only unlocked) in box ≥ 4 — CERT-R5 eligibility (Cur §5.1). */
export function leitnerMasteryOfAll(p: ProgressState): number {
  if (!FLASHCARDS.length) return 0;
  let hi = 0;
  for (const c of FLASHCARDS) if ((p.leitner[c.id]?.box ?? 0) >= 4) hi++;
  return hi / FLASHCARDS.length;
}
