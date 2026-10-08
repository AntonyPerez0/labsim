import { beforeEach, describe, expect, it } from 'vitest';
import { mutate, transact } from '@/core/store';
import { FLASHCARDS, QUIZ_BANK, flashcardsForDeck } from '@/content';
import { missions } from '../api';
import { BOX_INTERVAL_DAYS, demoteFacts, dueCardIds, unlockDeck } from '../progression/leitner';
import { addEvidence, effectiveMastery } from '../progression/mastery';
import { grantXp } from '../progression/xp';
import { gradeAnswer } from '../progression/quiz';
import { standardPoints } from '../drills/host';
import { registerDrills, resetRegistries } from '../registry';
import { setRealClock } from '../clock';
import { FIXED_DAY, correctAnswer, resetWorld, state, wrongAnswer, advance } from './helpers';
import type { DrillDef } from '../../types';

beforeEach(() => resetWorld());

describe('Leitner flashcards (Cur §4.0)', () => {
  it('promotes on Got it, drops to box 1 on Missed it and schedules due days', () => {
    transact((d) => unlockDeck(d, 'deck.M01'));
    const cards = flashcardsForDeck('M01');
    expect(cards.length).toBeGreaterThan(0);
    const id = cards[0]!.id;
    expect(missions.dueFlashcards()).toContain(id);
    missions.startFlashcards({ deck: 'deck.M01' });
    missions.reviewFlashcard(id, true);
    let lc = state().progress.leitner[id]!;
    expect(lc.box).toBe(2);
    expect(lc.dueDay).toBe(FIXED_DAY + BOX_INTERVAL_DAYS[2]!);
    expect(missions.dueFlashcards()).not.toContain(id);
    // Three days later it is due again; Got it → box 3 (+3 days).
    setRealClock({ epochMs: () => (FIXED_DAY + 1) * 86_400_000 + 1, day: () => FIXED_DAY + 1 });
    expect(missions.dueFlashcards()).toContain(id);
    missions.reviewFlashcard(id, true);
    lc = state().progress.leitner[id]!;
    expect(lc.box).toBe(3);
    expect(lc.dueDay).toBe(FIXED_DAY + 1 + 3);
    missions.reviewFlashcard(id, false);
    lc = state().progress.leitner[id]!;
    expect(lc.box).toBe(1);
    expect(lc.dueDay).toBe(FIXED_DAY + 1);
    missions.endFlashcards();
    expect(state().progress.flashcards.lastSessionCardIds).toContain(id);
    // XP: 2 per card, +3 for Got it.
    expect(state().progress.xp).toBe(5 + 5 + 2);
  });

  it('caps new cards at 20 per day and demotes cards sharing a missed fact', () => {
    transact((d) => {
      for (const m of ['M01', 'M02', 'M03', 'M04']) unlockDeck(d, `deck.${m}`);
    });
    const unlocked = Object.keys(state().progress.leitner).length;
    expect(unlocked).toBeGreaterThan(20);
    expect(dueCardIds(state().progress)).toHaveLength(20);
    const card = FLASHCARDS.find((c) => state().progress.leitner[c.id])!;
    mutate((s) => {
      s.progress.leitner[card.id]!.box = 4;
      s.progress.leitner[card.id]!.dueDay = FIXED_DAY + 7;
    });
    transact((d) => demoteFacts(d, card.factIds));
    expect(state().progress.leitner[card.id]!.box).toBe(1);
    expect(state().progress.leitner[card.id]!.dueDay).toBe(FIXED_DAY);
  });

  it('a wrong quiz answer anywhere demotes the cards of its facts', () => {
    transact((d) => unlockDeck(d, 'deck.M01'));
    const q = QUIZ_BANK.find((x) => x.moduleId === 'M01' && FLASHCARDS.some((c) => c.moduleId === 'M01' && c.factIds.some((f) => x.factIds.includes(f))))!;
    const card = FLASHCARDS.find((c) => c.moduleId === 'M01' && c.factIds.some((f) => q.factIds.includes(f)))!;
    mutate((s) => {
      s.progress.leitner[card.id]!.box = 5;
    });
    const r = missions.answerQuiz(q.id, wrongAnswer(q), 'review');
    expect(r.correct).toBe(false);
    expect(r.teach?.why).toBe(q.explanation);
    expect(state().progress.leitner[card.id]!.box).toBe(1);
  });
});

describe('quiz grading (Cur §3.0)', () => {
  it('grades every question type by value', () => {
    for (const type of ['mc', 'tf', 'order', 'match', 'fill'] as const) {
      const q = QUIZ_BANK.find((x) => x.type === type)!;
      expect(gradeAnswer(q, correctAnswer(q))).toBe(true);
      expect(gradeAnswer(q, wrongAnswer(q))).toBe(false);
    }
    const fill = QUIZ_BANK.find((x) => x.type === 'fill' && x.caseInsensitive)!;
    expect(gradeAnswer(fill, `  ${fill.accepted![0]!.toUpperCase()}  `)).toBe(true);
  });
});

describe('mastery (GP §4.8.3)', () => {
  it('moves m toward q with the evidence weight and forgets with the half-life', () => {
    transact((d, ctx) => {
      addEvidence(d, ctx, 'power.18v', 1, 'incident', 'test');
    });
    const tm = state().progress.tagMastery['power.18v']!;
    expect(tm.m).toBeCloseTo(0.45); // 0 + 0.3 × 1.5 × (1 − 0)
    expect(tm.level).toBe(1);
    const now = FIXED_DAY * 86_400_000 + 12 * 3_600_000;
    expect(effectiveMastery(tm, now + 2 * 86_400_000)).toBeCloseTo(0.45 * 0.5); // level 1 half-life = 2 days
    transact((d, ctx) => {
      addEvidence(d, ctx, 'power.18v', 0, 'penalty', 'test');
    });
    expect(state().progress.tagMastery['power.18v']!.m).toBeCloseTo(0.45 - 0.3 * 2 * 0.45);
    expect(state().progress.tagMastery['power.18v']!.level).toBe(0);
  });
});

describe('XP and ranks (GP §4.2–§4.3)', () => {
  it('maps XP thresholds and waits for the exam before promoting', () => {
    expect(missions.rankFor(0).id).toBe('intern');
    expect(missions.rankFor(799).id).toBe('intern');
    expect(missions.rankFor(800).id).toBe('lab-technician');
    expect(missions.rankFor(2500).id).toBe('automation-engineer-1');
    expect(missions.rankFor(18000).nextXp).toBeNull();
    transact((d, ctx) => grantXp(d, ctx, 900, 'drill', 'test', { final: true }));
    expect(state().progress.rank).toBe('intern');
    expect(missions.careerRank().pending).toContain('CERT-R1');
    mutate((s) => {
      s.progress.certs['CERT-R1'] = { attempts: 1, passed: true, passedAt: 1, distinction: false, bestWrittenPct: 90, bestPracticalMs: 1, lastAttemptAt: 1, retakeAvailableAt: 0, retakeNeedsReviewOf: [], lastWrittenQuestionIds: [] };
    });
    transact((d, ctx) => grantXp(d, ctx, 1, 'drill', 'test', { final: true }));
    expect(state().progress.rank).toBe('lab-technician');
    expect(state().progress.cosmetics.lanyard).toBe('blue');
    // Strict realism ×1.25 on Academy / drill XP.
    mutate((s) => {
      s.session.realism = 'strict';
    });
    const before = state().progress.xp;
    transact((d, ctx) => grantXp(d, ctx, 100, 'drill', 'strict test'));
    expect(state().progress.xp - before).toBe(125);
  });

  it('counts a streak day at 300 XP', () => {
    transact((d, ctx) => grantXp(d, ctx, 299, 'drill', 'a', { final: true }));
    expect(state().progress.streak.current).toBe(0);
    transact((d, ctx) => grantXp(d, ctx, 1, 'drill', 'b', { final: true }));
    expect(state().progress.streak.current).toBe(1);
  });
});

describe('drill host (GP §2.4.1)', () => {
  const drill: DrillDef = {
    id: 'DR90',
    name: 'Test Triage',
    format: 'press 1–5',
    tags: ['orca.status'],
    unlockedBy: [],
    durationS: 60,
    itemCount: 3,
    medals: { bronze: 100, silver: 200, gold: 400 },
    scoring: 'standard',
    items: ['a', 'b', 'c', 'd'].map((x) => ({ id: `it-${x}`, tags: ['orca.status'], teach: { whatHappened: `Item ${x}`, why: 'Because.' }, data: { x } })),
  };

  it('scores speed and streak, shows the inline Teach Card, awards medals and XP', () => {
    expect(standardPoints(true, 1000, 0).points).toBe(150);
    expect(standardPoints(true, 5000, 0).points).toBe(125);
    expect(standardPoints(true, 9000, 0).points).toBe(100);
    expect(standardPoints(true, 1000, 3).points).toBe(Math.round(150 * 1.3));
    expect(standardPoints(false, 1000, 3).points).toBe(-50);
    resetRegistries({ keepAuthored: false });
    registerDrills([drill]);
    missions.startDrill('DR90');
    const run = () => state().session.drill!;
    expect(state().ui.overlay).toEqual({ kind: 'drill', drillId: 'DR90' });
    const first = run().currentItemId!;
    let fb = missions.answerDrill(first, { correct: true, elapsedMs: 1000 });
    expect(fb.points).toBe(150);
    fb = missions.answerDrill(fb.nextItemId!, { correct: false, elapsedMs: 1000 });
    expect(fb.points).toBe(-50);
    expect(fb.teach?.why).toBe('Because.');
    advance(3);
    expect(run().teach).toBeNull();
    fb = missions.answerDrill(fb.nextItemId!, { correct: true, elapsedMs: 1000 });
    expect(fb.nextItemId).toBeNull();
    const s = state();
    expect(s.session.drill!.phase).toBe('finished');
    expect(s.session.result?.drill?.score).toBe(250);
    expect(s.session.result?.drill?.medal).toBe('silver');
    expect(s.progress.drills.DR90?.best).toBe(250);
    // floor(250 / 20) = 12 + first Bronze 50 + first Silver 100.
    expect(s.progress.xp).toBe(162);
    expect(s.progress.leaderboards['drill:DR90']?.[0]?.score).toBe(250);
  });
});
