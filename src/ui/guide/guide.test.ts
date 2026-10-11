/**
 * Guide logic (node, no DOM): curriculum states and totals, the Start-here pick, coach tip selection and
 * taper, bubble placement on small screens, and the practice summaries.
 */
import { describe, expect, it } from 'vitest';
import { createDefaultProgress } from '@/core/state';
import { MODULES } from '@/content';
import { setMissionsRuntimeEnabled } from '@/ui/services/missions';
import { drillRows } from '@/ui/data/views';
import { curriculumRows, curriculumTotals, drillsForModule, hoursLabel, LEARN_LINE, MODULE_PRACTICE, startHere, TRACKS } from './curriculum';
import { APP_TIPS, COACH_TIPS, coachCandidates, isTapered, type CoachCtx } from './coach/tips';
import { placeBubble } from './coach/place';
import { codePracticeSummary, drillSummary } from './practiceData';

setMissionsRuntimeEnabled(false);

function complete(p: ReturnType<typeof createDefaultProgress>, ...ids: string[]) {
  for (const id of ids) p.modules[id] = { completed: true, bestScore: 100, completedAtDay: 1, status: 'complete', stars: 2, bestCheckpoint: 1, replays: 0, starBonusesPaid: { two: true, three: false } };
}

const ctx = (o: Partial<CoachCtx> = {}): CoachCtx => ({
  overlay: 'main-menu',
  menuScreen: 'home',
  mode: 'menu',
  dialogue: false,
  pointerLocked: false,
  prompt: false,
  focusedApp: null,
  openWindows: 0,
  modulesDone: 0,
  m04Done: false,
  touch: false,
  ...o,
});

describe('curriculum', () => {
  it('covers every module once, in order, with a one-line "you will learn"', () => {
    const ids = TRACKS.flatMap((t) => t.ids);
    expect(ids).toEqual(MODULES.map((m) => m.id));
    for (const m of MODULES) expect(LEARN_LINE[m.id], m.id).toBeTruthy();
  });

  it('marks done / next / available / locked from prerequisites', () => {
    const p = createDefaultProgress();
    let rows = curriculumRows(p);
    expect(rows[0]!.state).toBe('next');
    expect(rows.find((r) => r.meta.id === 'M04')!.state).toBe('locked');
    expect(rows.find((r) => r.meta.id === 'M04')!.missing).toEqual(['M02', 'M03']);
    complete(p, 'M01');
    rows = curriculumRows(p);
    expect(rows[0]!.state).toBe('done');
    expect(rows.find((r) => r.meta.id === 'M02')!.state).toBe('next');
    expect(rows.find((r) => r.meta.id === 'M03')!.state).toBe('available');
    expect(rows.find((r) => r.meta.id === 'M04')!.unlockModes).toEqual(expect.arrayContaining(['Free Play', '5-minute Shift']));
  });

  it('totals time remaining', () => {
    const p = createDefaultProgress();
    const t0 = curriculumTotals(curriculumRows(p));
    expect(t0.done).toBe(0);
    expect(t0.minutesLeft).toBe(t0.minutesTotal);
    expect(t0.minutesTotal).toBeGreaterThan(200);
    complete(p, 'M01');
    const t1 = curriculumTotals(curriculumRows(p));
    expect(t0.minutesLeft - t1.minutesLeft).toBe(12);
    expect(hoursLabel(45)).toBe('45 min');
    expect(hoursLabel(120)).toBe('2 h');
    expect(hoursLabel(185)).toBe('3 h 5 min');
  });

  it('start here: the first module for a new player, the checkpoint when resuming', () => {
    const p = createDefaultProgress();
    expect(startHere(p)).toMatchObject({ moduleId: 'M01', firstTime: true, resume: false });
    complete(p, 'M01');
    p.academyCheckpoint = { moduleId: 'M03', stepIndex: 4 } as typeof p.academyCheckpoint;
    expect(startHere(p)).toMatchObject({ moduleId: 'M03', firstTime: false, resume: true });
    complete(p, ...MODULES.map((m) => m.id));
    p.academyCheckpoint = null;
    expect(startHere(p)).toBeNull();
  });

  it('maps code practice to the modules that teach it', () => {
    expect(MODULE_PRACTICE.M15).toEqual(['parrot']);
    expect(MODULE_PRACTICE.M16).toEqual(expect.arrayContaining(['parrot', 'uia']));
    for (const m of ['M12', 'M13', 'M14', 'M16']) expect(MODULE_PRACTICE[m], m).toContain('uia');
    expect(drillsForModule('M15')).toEqual(expect.arrayContaining(['DR06', 'DR18']));
    expect(drillsForModule('M02')).toEqual([]);
  });
});

describe('coach tips', () => {
  const none = () => false;
  it('have unique ids and a tip for every workstation app', () => {
    expect(new Set(COACH_TIPS.map((t) => t.id)).size).toBe(COACH_TIPS.length);
    for (const app of ['orka', 'jenkins', 'github', 'intellij', 'vscode', 'terminal', 'gimp', 'camera', 'dashboard', 'chat', 'ollama', 'cardreader', 'files']) {
      expect(APP_TIPS[app], app).toBeTruthy();
      expect(COACH_TIPS.some((t) => t.id === `app:${app}`)).toBe(true);
    }
  });

  it('never use gendered pronouns', () => {
    for (const t of COACH_TIPS) {
      const text = `${t.title} ${t.text(ctx())} ${t.text(ctx({ touch: true }))}`;
      expect(text, t.id).not.toMatch(/\b(he|she|him|her|his|hers)\b/i);
    }
  });

  it('walk a new player through the main menu in order', () => {
    const ids = coachCandidates(ctx(), none).map((t) => t.id);
    expect(ids.slice(0, 5)).toEqual(['menu.start', 'menu.map', 'menu.practice', 'menu.manual', 'menu.settings']);
    const seen = new Set(['menu.start', 'menu.map']);
    expect(coachCandidates(ctx(), (id) => seen.has(id))[0]!.id).toBe('menu.practice');
  });

  it('show the focused app first at the workstation', () => {
    const ids = coachCandidates(ctx({ overlay: 'computer', menuScreen: null, mode: 'academy', focusedApp: 'orka', openWindows: 1 }), none).map((t) => t.id);
    expect(ids[0]).toBe('app:orka');
    expect(ids).toContain('ws.standup');
    expect(ids).not.toContain('ws.desktop');
  });

  it('cover first quiz, drill, shift and Free Play', () => {
    expect(coachCandidates(ctx({ overlay: 'quiz', menuScreen: null }), none)[0]!.id).toBe('quiz');
    expect(coachCandidates(ctx({ overlay: 'drill', menuScreen: null }), none)[0]!.id).toBe('drill');
    expect(coachCandidates(ctx({ overlay: 'none', menuScreen: null, mode: 'arcade-shift' }), none)[0]!.id).toBe('shift');
    expect(coachCandidates(ctx({ overlay: 'none', menuScreen: null, mode: 'freeplay' }), none)[0]!.id).toBe('freeplay');
    // In-world tips wait while someone is talking.
    expect(coachCandidates(ctx({ overlay: 'none', menuScreen: null, mode: 'academy', dialogue: true }), none)).toEqual([]);
  });

  it('taper off after M04 or four modules: only first-visit tips remain', () => {
    expect(isTapered({ modulesDone: 3, m04Done: false })).toBe(false);
    expect(isTapered({ modulesDone: 4, m04Done: false })).toBe(true);
    expect(isTapered({ modulesDone: 2, m04Done: true })).toBe(true);
    expect(coachCandidates(ctx({ modulesDone: 4 }), none)).toEqual([]);
    const desk = coachCandidates(ctx({ overlay: 'computer', menuScreen: null, mode: 'freeplay', focusedApp: 'gimp', openWindows: 1, m04Done: true }), none).map((t) => t.id);
    expect(desk).toEqual(['app:gimp']);
  });
});

describe('coach bubble placement', () => {
  const vp = { w: 1280, h: 800 };
  const b = { w: 320, h: 140 };
  it('prefers the requested side and falls back when it does not fit', () => {
    expect(placeBubble({ left: 20, top: 200, width: 240, height: 40 }, b, vp, 'right').side).toBe('right');
    expect(placeBubble({ left: 1100, top: 200, width: 160, height: 40 }, b, vp, 'right').side).toBe('below');
    expect(placeBubble({ left: 400, top: 700, width: 200, height: 60 }, b, vp, 'below').side).toBe('above');
  });
  it('stays on a 360 px screen', () => {
    const small = { w: 360, h: 640 };
    const bb = { w: 344, h: 170 };
    for (const a of [
      { left: 0, top: 0, width: 360, height: 640 },
      { left: 300, top: 20, width: 50, height: 30 },
      { left: 10, top: 600, width: 80, height: 30 },
    ]) {
      const p = placeBubble(a, bb, small, 'right');
      expect(p.x).toBeGreaterThanOrEqual(8);
      expect(p.x + bb.w).toBeLessThanOrEqual(small.w - 8 + 0.001);
      expect(p.y).toBeGreaterThanOrEqual(8);
      expect(p.y + bb.h).toBeLessThanOrEqual(small.h - 8 + 0.001);
    }
  });
  it('floats at the top centre without an anchor', () => {
    const p = placeBubble(null, b, vp);
    expect(p.side).toBe('float');
    expect(p.x).toBe((vp.w - b.w) / 2);
  });
});

describe('practice summaries', () => {
  it('counts solved code exercises and the next one to try', () => {
    const p = createDefaultProgress();
    const list = [
      { id: 'a', title: 'A', level: 1, topic: 't' },
      { id: 'b', title: 'B', level: 1, topic: 't' },
      { id: 'c', title: 'C', level: 2, topic: 't' },
    ];
    const s = codePracticeSummary(p, { a: { solved: 3, bestS: 20, lastDay: 1 } }, list, 'M15');
    expect(s).toMatchObject({ total: 3, solved: 1, solves: 3, nextId: 'b', taughtIn: 'M15', taught: false });
    complete(p, 'M15');
    expect(codePracticeSummary(p, {}, list, 'M15').taught).toBe(true);
  });

  it('suggests an unlocked drill without a medal', () => {
    const p = createDefaultProgress();
    complete(p, 'M01');
    p.drills.DR10 = { best: 3200, medal: 'gold', rounds: 2 } as (typeof p.drills)[string];
    const s = drillSummary(drillRows(p));
    expect(s.total).toBe(19);
    expect(s.unlocked).toBeGreaterThanOrEqual(3);
    expect(s.suggestion?.id).not.toBe('DR10');
    expect(s.suggestion?.unlock.unlocked).toBe(true);
  });
});
