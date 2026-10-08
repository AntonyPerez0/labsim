/**
 * Board minigames + steel ruler: the boards grade per the reference, and what the UI emits completes
 * the Academy steps that wait for it (M04.14, M06.03, M09.10, M17.10, M18.06) in the real runtime.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { transact } from '@/core/store';
import { LAYOUTS } from '@/sim/seed/layouts/tables';
import { primaryLayoutId } from '@/sim/seed/deviceTypes';
import { getLesson } from '@/missions/runtime/registry';
import { startAcademy } from '@/missions/runtime/academy/start';
import { advance, fire, resetWorld, state } from '@/missions/runtime/__tests__/helpers';
import { ARCHITECTURE_DIAGRAM, BOARDS, BOLT_SORT, HISTORY_MATCH, ROADMAP_SORT, boardForProp, gradeDiagram, gradeSort, type SortBoardDef } from './boards';
import { reportMinigame } from './MinigamePanel';
import { receiptScreenFor, rulerMeasurement } from './RulerPanel';

const solvedSort = (def: SortBoardDef) => Object.fromEntries(def.items.map((it) => [it.id, it.answer]));
const solvedDiagram = () => ({
  cards: Object.fromEntries(ARCHITECTURE_DIAGRAM.slots.map((s) => [s.id, s.answer])),
  labels: Object.fromEntries(ARCHITECTURE_DIAGRAM.edges.filter((e) => e.answer).map((e) => [e.id, e.answer!])),
});

describe('board data (reference-checked)', () => {
  it('sizes match the curriculum: 10 bolts, 8 roadmap cards, 5 teams, 8 cards + 6 arrows', () => {
    expect(BOLT_SORT.items).toHaveLength(10);
    expect(ROADMAP_SORT.items).toHaveLength(8);
    expect(HISTORY_MATCH.items).toHaveLength(5);
    const d = solvedDiagram();
    expect(gradeDiagram(ARCHITECTURE_DIAGRAM, d.cards, d.labels)).toMatchObject({ correct: 14, total: 14, wrong: [] });
  });

  it('bolts are only 2.5 mm and 5 mm', () => {
    expect(new Set(BOLT_SORT.items.map((b) => b.diameterMm))).toEqual(new Set([2.5, 5]));
  });

  it('a solved board grades total/total and a swapped one does not', () => {
    for (const def of [BOLT_SORT, ROADMAP_SORT, HISTORY_MATCH]) {
      const ok = solvedSort(def);
      expect(gradeSort(def, ok)).toMatchObject({ correct: def.items.length, total: def.items.length });
      const [a, b] = def.items.filter((x, i, arr) => arr.findIndex((y) => y.answer !== x.answer) >= 0).slice(0, 2);
      const bad = { ...ok, [a!.id]: def.bins.find((bin) => bin.id !== a!.answer)!.id };
      expect(gradeSort(def, bad).wrong).toContain(a!.id);
      void b;
    }
  });

  it('roadmap answers follow the reference', () => {
    const ans = Object.fromEntries(ROADMAP_SORT.items.map((i) => [i.id, i.answer]));
    expect(ans).toEqual({ 'orca-vm': 'today', 'orca-gcp': 'planned', 'pi-control': 'today', 'nuc-control': 'retired', 'ollama-poc': 'progress', 'pin-bypass': 'progress', 'duo-ocr': 'retired', github: 'today' });
  });

  it('the ADB arrow names port 5444 and the ping is every 5 minutes', () => {
    const t = ARCHITECTURE_DIAGRAM.labels.map((l) => l.text).join(' | ');
    expect(t).toContain('5444');
    expect(t).toContain('5-minute');
    expect(t).not.toContain('5555');
  });

  it('every board prop resolves (world ids and curriculum aliases)', () => {
    for (const id of ['wall.whiteboard', 'prop.whiteboard', 'wall.roadmap', 'prop.roadmap-board', 'wall.history.match', 'prop.history.match', 'jared.bolt-bins', 'prop.bolt-bins']) expect(boardForProp(id), id).not.toBeNull();
    expect(Object.keys(BOARDS).sort()).toEqual(['architecture-diagram', 'bolt-sort', 'history-match', 'roadmap-sort']);
  });
});

describe('UI → lesson runtime', () => {
  beforeEach(() => resetWorld());

  function startAt(moduleId: string, stepId: string): void {
    const idx = getLesson(moduleId)!.steps.findIndex((s) => s.id === stepId);
    expect(idx).toBeGreaterThanOrEqual(0);
    transact((d, ctx) => startAcademy(d, ctx, moduleId, { force: true, startIndex: idx }));
    expect(state().session.academy?.stepId).toBe(stepId);
  }

  const cases: [string, string, () => void][] = [
    ['M04', 'M04.14', () => reportMinigame('bolt-sort', gradeSort(BOLT_SORT, solvedSort(BOLT_SORT)), 0)],
    [
      'M06',
      'M06.03',
      () => {
        const d = solvedDiagram();
        reportMinigame('architecture-diagram', gradeDiagram(ARCHITECTURE_DIAGRAM, d.cards, d.labels), 1);
      },
    ],
    ['M17', 'M17.10', () => reportMinigame('roadmap-sort', gradeSort(ROADMAP_SORT, solvedSort(ROADMAP_SORT)), 0)],
    ['M18', 'M18.06', () => reportMinigame('history-match', gradeSort(HISTORY_MATCH, solvedSort(HISTORY_MATCH)), 0)],
  ];

  for (const [mod, step, solve] of cases) {
    it(`${step} completes from the board`, () => {
      startAt(mod, step);
      advance(0.5);
      solve();
      advance(0.5);
      expect(state().session.academy?.stepsDone).toContain(step);
    });
  }

  it('an incomplete board does not complete the step', () => {
    startAt('M04', 'M04.14');
    advance(0.5);
    reportMinigame('bolt-sort', { correct: 9, total: 10, wrong: ['b1'], missing: [] }, 1);
    advance(0.5);
    expect(state().session.academy?.stepsDone).not.toContain('M04.14');
  });

  it('M09.10: ruler readings of EVE\'s 5-option receipt screen complete the step', () => {
    startAt('M09', 'M09.10');
    advance(0.5);
    const lab = state().lab;
    const screen = receiptScreenFor(lab, 'rig.eve.device');
    expect(screen).toBe('RECEIPT_OPTIONS_5');
    const table = LAYOUTS[primaryLayoutId(lab.devices[lab.rigs['eve']!.deviceIds[0]!]!.type)].screens[screen!]!;
    const buttons = table.filter((e) => e.kind === 'button').map((e) => e.id);
    expect(buttons).toEqual(['Print', 'Email', 'Text', 'No Receipt', 'Scan for receipt']);
    for (const b of buttons) {
      const data = rulerMeasurement(lab, 'rig.eve.device', screen!, b)!;
      if (b === 'Print') expect(data.yMm).toBe(74);
      fire('app.action', { app: 'world', action: 'ruler.measured', data });
      advance(0.2);
    }
    advance(0.5);
    expect(state().session.academy?.stepsDone).toContain('M09.10');
  });
});
