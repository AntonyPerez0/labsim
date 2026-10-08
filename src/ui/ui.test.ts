/**
 * UI logic tests (node environment, no DOM): formatting helpers, the safe mission-runtime wrappers,
 * menu view-model fallbacks and the display catalogues' consistency with content / GP.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import { createDefaultProgress } from '@/core/state';
import { store } from '@/core/store';
import { MODULES, RANKS } from '@/content';
import { estLabel, gameClock, hrn, mmss, pct, shortTitle, signed } from '@/ui/services/format';
import { hasMission, ma, mq, setMissionsOverride, setMissionsRuntimeEnabled } from '@/ui/services/missions';
import { isModuleComplete, leitnerBoxes, moduleViewFor, modeUnlock, nextModule, rankViewFor, shiftRows, drillRows } from '@/ui/data/views';
import { DRILL_CATALOG, SHIFT_CATALOG, RANK_DIFFICULTY_CAP } from '@/ui/data/catalog';

function complete(p: ReturnType<typeof createDefaultProgress>, ...ids: string[]) {
  for (const id of ids) p.modules[id] = { completed: true, bestScore: 100, completedAtDay: 1, status: 'complete', stars: 2, bestCheckpoint: 1, replays: 0, starBonusesPaid: { two: true, three: false } };
}

// These tests cover the UI's own fallbacks (used while the runtime is missing or failing).
setMissionsRuntimeEnabled(false);

describe('format helpers', () => {
  it('formats clocks and numbers', () => {
    expect(mmss(75)).toBe('1:15');
    expect(mmss(-5)).toBe('−0:05');
    expect(gameClock(8 * 3_600_000 + 15 * 60_000)).toBe('08:15');
    expect(signed(412)).toBe('+412');
    expect(signed(-300)).toBe('−300');
    expect(pct(0.8)).toBe('80%');
    expect(hrn('wall-e')).toBe('WALL-E');
    expect(shortTitle('Welcome to the Lab: Orientation & Safety')).toBe('Welcome to the Lab');
  });
  it('formats module durations', () => {
    expect(estLabel({ estMinutes: 12, estMinutesRange: [10, 12] })).toBe('10–12 min');
    expect(estLabel({ estMinutes: 20, estMinutesRange: [20, 20] })).toBe('20 min');
    expect(estLabel({ estMinutes: 15 })).toBe('15 min');
  });
});

describe('mission runtime wrappers', () => {
  beforeEach(() => setMissionsOverride({}));
  it('fall back instead of throwing while the runtime is a stub', () => {
    expect(hasMission('startAcademy')).toBe(false);
    expect(mq('moduleView', ['M01'], null)).toBeNull();
    expect(mq('modules', [], [])).toEqual([]);
    expect(() => ma('startAcademy', 'M01')).not.toThrow();
    expect(store.getState().ui.toasts.some((t) => t.title === 'Coming soon')).toBe(true);
  });
  it('use overrides when provided', () => {
    setMissionsOverride({ dueFlashcards: () => ['FC001'] });
    expect(hasMission('dueFlashcards')).toBe(true);
    expect(mq('dueFlashcards', [], [])).toEqual(['FC001']);
  });
});

describe('menu view fallbacks', () => {
  it('derive module states from prerequisites', () => {
    const p = createDefaultProgress();
    expect(moduleViewFor(p, 'M01')?.state).toBe('available');
    expect(moduleViewFor(p, 'M02')?.state).toBe('locked');
    expect(moduleViewFor(p, 'M02')?.missingPrereqs).toEqual(['M01']);
    expect(nextModule(p)).toBe('M01');
    complete(p, 'M01');
    expect(isModuleComplete(p, 'M01')).toBe(true);
    expect(moduleViewFor(p, 'M01')?.state).toBe('completed');
    expect(moduleViewFor(p, 'M02')?.state).toBe('available');
    expect(nextModule(p)).toBe('M02');
  });
  it('compute rank progress from content thresholds', () => {
    const p = createDefaultProgress();
    p.xp = 400;
    const rv = rankViewFor(p);
    expect(rv.rank.id).toBe('intern');
    expect(rv.next?.id).toBe(RANKS[1]!.id);
    expect(rv.xpToNext).toBe(RANKS[1]!.minXp - 400);
    expect(rv.progress).toBeCloseTo(400 / RANKS[1]!.minXp);
  });
  it('apply GP §2.1 unlock gates', () => {
    const p = createDefaultProgress();
    expect(modeUnlock(p, 'freeplay').unlocked).toBe(false);
    expect(shiftRows(p).every((s) => !s.unlock.unlocked)).toBe(true);
    complete(p, 'M01', 'M02', 'M03', 'M04');
    expect(modeUnlock(p, 'freeplay').unlocked).toBe(true);
    expect(shiftRows(p).find((s) => s.id === 'shift-5')?.unlock.unlocked).toBe(true);
    expect(shiftRows(p).find((s) => s.id === 'shift-10')?.unlock.unlocked).toBe(false);
    expect(drillRows(p).find((d) => d.id === 'DR16')?.unlock.unlocked).toBe(true);
    expect(drillRows(p).find((d) => d.id === 'DR19')?.unlock.unlocked).toBe(false);
  });
  it('bucket Leitner cards into five boxes', () => {
    const p = createDefaultProgress();
    p.leitner.FC001 = { box: 1, dueDay: 0, due: 0, lastReviewed: 0, streak: 0, introducedDay: 0 };
    p.leitner.FC002 = { box: 5, dueDay: 0, due: 0, lastReviewed: 0, streak: 0, introducedDay: 0 };
    expect(leitnerBoxes(p)).toEqual([1, 0, 0, 0, 1]);
  });
});

describe('display catalogues (GP §2.3–§2.4)', () => {
  it('list all 19 drills once, unlocked by real modules', () => {
    const ids = DRILL_CATALOG.map((d) => d.id);
    expect(new Set(ids).size).toBe(19);
    const moduleIds = new Set(MODULES.map((m) => m.id));
    for (const d of DRILL_CATALOG) {
      for (const m of d.unlockedBy) expect(moduleIds.has(m)).toBe(true);
      expect(d.medals.bronze).toBeLessThan(d.medals.silver);
      expect(d.medals.silver).toBeLessThan(d.medals.gold);
    }
  });
  it('match shift lengths, heat caps and unlocks', () => {
    expect(SHIFT_CATALOG.map((s) => [s.lengthMinutes, s.heatCap, s.unlockModule])).toEqual([
      [5, 3, 'M04'],
      [10, 4, 'M10'],
      [20, 5, 'M18'],
    ]);
  });
  it('cover every career rank with a difficulty cap', () => {
    for (const r of RANKS) expect(RANK_DIFFICULTY_CAP[r.id]).toBe(r.shiftDifficultyCap);
  });
});

describe('inspect overlay helpers', () => {
  it('finds a glossary entry for a prop id and titles it', async () => {
    const { glossaryForProp, propTitle } = await import('@/ui/overlays/InspectOverlay');
    expect(glossaryForProp('power.fuse-block.5v')?.term).toBeTruthy();
    expect(glossaryForProp('zz.qq')).toBeNull();
    expect(propTitle('rig.wall-e.tablet')).toBe('WALL-E · Tablet');
  });
});
