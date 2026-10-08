import { beforeEach, describe, expect, it } from 'vitest';
import { questionById } from '@/content';
import { resolvePropId } from '@/world/layout';
import { SAMPLE_M01 } from '../../academy/sample';
import { registerLessons } from '../registry';
import { missions } from '../api';
import { advance, correctAnswer, fire, resetWorld, state, wrongAnswer } from './helpers';
import type { LessonDef } from '../../types';
import { c, on, p } from '../../types';

beforeEach(() => {
  resetWorld();
  registerLessons({ M01: SAMPLE_M01 });
});

function ack(): void {
  advance(1.6);
  missions.acknowledgeDialogue();
}

function stepId(): string {
  return state().session.academy?.stepId ?? '';
}

function passCheckpoint(): void {
  const q = state().session.quiz!;
  for (const id of q.questionIds) missions.answerQuiz(id, correctAnswer(questionById(id)!), 'lesson');
  missions.finishQuiz();
}

describe('Academy lesson runner', () => {
  it('runs M01 end to end from player events and completes with three stars', () => {
    missions.startAcademy('M01');
    expect(state().session.mode).toBe('academy');
    expect(stepId()).toBe('M01.01');
    expect(state().session.dialogue?.speaker).toBe('morgan');

    // Dialogue lines can't be skipped before 1.5 s.
    missions.acknowledgeDialogue();
    expect(stepId()).toBe('M01.01');
    ack();
    expect(stepId()).toBe('M01.02');
    expect(state().session.objectives[0]?.text).toBe('Walk to Touch Rack A');
    expect(state().ui.marker).toEqual({ kind: 'location', id: 'loc.rack-a' });

    fire('player.enteredLocation', { locationId: 'loc.rack-a' });
    expect(stepId()).toBe('M01.03');
    ack();
    expect(stepId()).toBe('M01.04');
    fire('player.inspected', { interactableId: resolvePropId('prop.walle.tablet') });
    expect(state().ui.callouts?.lines).toEqual(['WALL-E', 'Status: OK', 'Brainbox v6', 'Robot / Robot Control / Motion Control']);
    expect(stepId()).toBe('M01.05');
    ack();
    expect(stepId()).toBe('M01.06');
    fire('rig.command', { rigId: 'wall-e', command: 'park.all', actor: 'player', ok: false, error: 'TEST IN PROGRESS — CONTROLS LOCKED' });
    expect(stepId()).toBe('M01.07');
    ack();
    fire('player.inspected', { interactableId: resolvePropId('prop.walle.power-panel') });
    expect(stepId()).toBe('M01.09');
    fire('player.inspected', { interactableId: 'rack.a.rails.u32-left' });
    expect(stepId()).toBe('M01.09');
    fire('player.inspected', { interactableId: 'rack.a.rails.u33-left' });
    expect(stepId()).toBe('M01.10');
    fire('player.inspected', { interactableId: resolvePropId('prop.seti-panel') });
    expect(stepId()).toBe('M01.11');
    fire('player.enteredLocation', { locationId: 'loc.print-corner' });
    ack();
    expect(stepId()).toBe('M01.13');
    fire('item.pickedUp', { itemId: 'safety-card', ref: null, from: 'wall.safety-card' });
    expect(stepId()).toBe('M01.14');
    expect(state().ui.overlay.kind).toBe('quiz');
    passCheckpoint();
    expect(stepId()).toBe('M01.15');
    ack();

    const s = state();
    expect(s.session.result?.kind).toBe('academy');
    expect(s.session.result?.academy?.stars).toBe(3);
    expect(s.ui.overlay.kind).toBe('debrief');
    expect(s.progress.modules.M01?.status).toBe('complete');
    expect(s.progress.modules.M01?.stars).toBe(3);
    // 15 steps: 10 × 10 XP + 2 interact × 15 … + module 100 + first ★★ 50 + first ★★★ 100 + ACH01 100.
    expect(s.progress.xp).toBeGreaterThan(400);
    expect(s.progress.achievements.ACH01).toBeDefined();
    expect(s.session.result?.takeaways.length).toBeGreaterThanOrEqual(3);
    expect(s.session.result?.academy?.unlocked.drills).toEqual(['DR10', 'DR14', 'DR17']);
    expect(Object.keys(s.progress.leitner).length).toBeGreaterThan(0);
    expect(s.progress.academyCheckpoint).toBeNull();
  });

  it('re-runs a failed checkpoint with the missed items plus two from the module and costs the third star', () => {
    const lesson: LessonDef = {
      moduleId: 'M01',
      mentor: 'morgan',
      setup: { preset: 'academy:M01' },
      realLabChecklist: ['Read the tablet header first.'],
      steps: [{ id: 'T.01', kind: 'quiz-checkpoint', checkpointId: 'CP-M01.1', title: 'Lab Basics', questionIds: ['Q001', 'Q002', 'Q003', 'Q004', 'Q005'] }],
    };
    registerLessons({ M01: lesson });
    missions.startAcademy('M01');
    const ids = state().session.quiz!.questionIds;
    missions.answerQuiz(ids[0]!, wrongAnswer(questionById(ids[0]!)!), 'lesson');
    missions.answerQuiz(ids[1]!, wrongAnswer(questionById(ids[1]!)!), 'lesson');
    for (const id of ids.slice(2)) missions.answerQuiz(id, correctAnswer(questionById(id)!), 'lesson');
    const r = missions.finishQuiz();
    expect(r.passed).toBe(false); // 3/5 < ceil(0.8 × 5)
    expect(r.retryQuestionIds?.slice(0, 2)).toEqual([ids[0], ids[1]]);
    expect(r.retryQuestionIds).toHaveLength(4);
    expect(state().session.quiz?.attempt).toBe(2);
    passCheckpoint();
    const res = state().session.result!;
    expect(res.academy?.stars).toBe(2);
    expect(res.academy?.checkpoint?.firstTryPerfect).toBe(false);
  });

  it('reveals the walk-to hint ladder on time and counts hints against stars', () => {
    const lesson: LessonDef = {
      moduleId: 'M01',
      mentor: 'morgan',
      setup: { preset: 'academy:M01' },
      realLabChecklist: ['x'],
      steps: [{ id: 'H.01', kind: 'walk-to', hud: 'Walk to Touch Rack A', location: 'loc.rack-a' }],
    };
    registerLessons({ M01: lesson });
    missions.startAcademy('M01');
    advance(46);
    expect(state().session.academy?.hintTier).toBe(1);
    advance(45);
    expect(state().session.academy?.hintTier).toBe(2);
    expect(state().session.academy?.breadcrumb).toBe(true);
    fire('player.enteredLocation', { locationId: 'loc.rack-a' });
    expect(state().session.result?.academy?.stars).toBe(2);
  });

  it('plays the mentor correction on a wrong action and highlights the control after 3', () => {
    const lesson: LessonDef = {
      moduleId: 'M01',
      mentor: 'tate',
      setup: { preset: 'academy:M01' },
      realLabChecklist: ['x'],
      steps: [
        {
          id: 'W.01',
          kind: 'interact',
          hud: 'Fix the Human Readable Name',
          target: 'app.orca',
          success: c.eq(p.v('hrnFixed'), true),
          wrongActions: [{ id: 'name', on: on('orca.entitySaved', { entity: 'robot' }), say: 'Name is the system identifier. Pipelines use it. Leave it.', speaker: 'tate' }],
        },
      ],
    };
    registerLessons({ M01: lesson });
    missions.startAcademy('M01');
    for (let i = 0; i < 3; i++) fire('orca.entitySaved', { entity: 'robot', id: 5, action: 'update', fields: ['name'], actor: 'player' });
    const ac = state().session.academy!;
    expect(ac.wrongActions).toBe(3);
    expect(ac.highlight).toEqual({ kind: 'prop', id: 'app.orca' });
    expect(state().ui.toasts.some((t) => t.body === 'Name is the system identifier. Pipelines use it. Leave it.')).toBe(true);
  });

  it('restarts a step from its checkpoint snapshot', () => {
    missions.startAcademy('M01');
    ack();
    expect(stepId()).toBe('M01.02');
    missions.restartStep();
    expect(stepId()).toBe('M01.02');
    expect(state().progress.academyCheckpoint?.stepId).toBe('M01.02');
  });
});
