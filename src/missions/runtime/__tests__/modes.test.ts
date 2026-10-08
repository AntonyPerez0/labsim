import { beforeEach, describe, expect, it } from 'vitest';
import { mutate } from '@/core/store';
import { EXAMS_BY_ID, questionById } from '@/content';
import { missions } from '../api';
import { drawWrittenExam } from '../cert/draw';
import { registerIncidents, resetRegistries } from '../registry';
import { advance, correctAnswer, fire, resetWorld, state, testIncident } from './helpers';

function completeModules(...ids: string[]): void {
  mutate((s) => {
    for (const id of ids) s.progress.modules[id] = { completed: true, bestScore: 100, completedAtDay: 1, status: 'complete', stars: 3, bestCheckpoint: 1, replays: 0, starBonusesPaid: { two: true, three: true } };
  });
}

beforeEach(() => {
  resetWorld();
  resetRegistries({ keepAuthored: false });
});

describe('certification written exam (Cur §5.2)', () => {
  it('draws module quotas with every critical fact, every type and MC ≤ 65 %', () => {
    for (const id of ['CERT-R1', 'CERT-R2', 'CERT-R3']) {
      const exam = EXAMS_BY_ID[id]!;
      const draw = drawWrittenExam(exam, 42);
      const qs = draw.questionIds.map((q) => questionById(q)!);
      expect(qs.length).toBe(exam.written.items);
      expect(new Set(draw.questionIds).size).toBe(qs.length);
      for (const [mod, quota] of Object.entries(exam.written.moduleQuotas)) expect(qs.filter((q) => q.moduleId === mod).length).toBe(quota);
      for (const f of exam.written.criticalFactIds) expect(draw.criticalQuestionIds.some((q) => questionById(q)!.factIds.includes(f))).toBe(true);
      expect(qs.some((q) => q.illustrative)).toBe(false);
      expect(qs.filter((q) => q.type === 'mc').length / qs.length).toBeLessThanOrEqual(0.65 + 1e-9);
      expect(drawWrittenExam(exam, 42)).toEqual(draw);
    }
  });

  it('checks eligibility, passes the written part and opens the practical', () => {
    expect(missions.certView('CERT-R1')!.eligible).toBe(false);
    completeModules('M01', 'M02', 'M03', 'M04', 'M05');
    expect(missions.certView('CERT-R1')!.eligible).toBe(true);
    expect(missions.startCertification('CERT-R1').ok).toBe(true);
    const c = state().session.cert!;
    expect(c.written.questionIds).toHaveLength(30);
    for (const id of c.written.questionIds) missions.answerQuiz(id, correctAnswer(questionById(id)!), 'cert');
    const w = missions.submitWritten();
    expect(w.passed).toBe(true);
    expect(w.pct).toBe(100);
    expect(state().session.cert!.part).toBe('practical');
  });

  it('fails the written part when a critical item is missed and gates the retake', () => {
    completeModules('M01', 'M02', 'M03', 'M04', 'M05');
    missions.startCertification('CERT-R1');
    const c = state().session.cert!;
    const crit = c.written.criticalQuestionIds[0]!;
    for (const id of c.written.questionIds) if (id !== crit) missions.answerQuiz(id, correctAnswer(questionById(id)!), 'cert');
    const w = missions.submitWritten();
    expect(w.correct).toBe(29);
    expect(w.passed).toBe(false);
    expect(w.criticalMissed).toEqual([crit]);
    const s = state();
    expect(s.session.result?.cert?.writtenPassed).toBe(false);
    expect(s.progress.certs['CERT-R1']?.retakeNeedsReviewOf.length).toBeGreaterThan(0);
    expect(missions.certView('CERT-R1')!.eligible).toBe(false);
  });
});

describe('Free Play fault injector (GP §2.5)', () => {
  it('injects with a ticket, verifies the fix by its success condition and pays 30 XP', () => {
    registerIncidents([testIncident('INC95')]);
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startFreeplay({ fresh: true });
    expect(state().session.mode).toBe('freeplay');
    const entries = missions.faultInjectorEntries();
    expect(entries.find((e) => e.incidentId === 'INC95')?.fiId).toBe('FI95');
    const r = missions.injectFault('INC95', { createTicket: true });
    expect(r.ok).toBe(true);
    expect(state().session.tickets).toHaveLength(1);
    expect(state().session.tickets[0]!.binding.rig).toBe('wall-e');
    mutate((s) => {
      s.session.vars['fixed:INC95'] = true;
    });
    advance(0.5);
    fire('orca.healthCheckRan', { atMs: state().lab.time.nowMs, checked: 12, failedRobotIds: [], recoveredRobotIds: [] });
    const fp = state().session.freeplay!;
    expect(fp.injected[0]!.fixedAtMs).not.toBeNull();
    expect(state().progress.freeplay.fixesTotal).toBe(1);
    expect(state().progress.xp).toBeGreaterThanOrEqual(30);
  });

  it('disables XP once Inspect truth is used', () => {
    registerIncidents([testIncident('INC96')]);
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startFreeplay({ fresh: true });
    missions.setSandbox({ inspectTruth: true });
    missions.injectFault('INC96');
    mutate((s) => {
      s.session.vars['fixed:INC96'] = true;
    });
    advance(0.5);
    fire('orca.healthCheckRan', { atMs: state().lab.time.nowMs, checked: 12, failedRobotIds: [], recoveredRobotIds: [] });
    expect(state().progress.freeplay.fixesTotal).toBe(1);
    expect(state().progress.xp).toBe(0);
  });
});

describe('tools and pockets (GP §6.4)', () => {
  it('holds three spare fuses and cycles tool modes', () => {
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startFreeplay({ fresh: true });
    expect(missions.takeItem({ kind: 'fuse', rating: 10 }, 2).ok).toBe(true);
    expect(missions.takeItem({ kind: 'fuse', rating: 5 }, 2).ok).toBe(false);
    expect(missions.takeItem({ kind: 'fuse', rating: 5 }, 1).ok).toBe(true);
    missions.selectHotbar(3);
    expect(state().session.activeTool).toBe('spare-fuse-5v');
    missions.cycleToolMode();
    expect(state().session.toolModes.fuseRating).toBe(7.5);
    missions.selectHotbar(2);
    missions.cycleToolMode();
    expect(state().session.toolModes.multimeter).toBe('V_AC');
    expect(missions.useItem({ kind: 'fuse', rating: 10 }).ok).toBe(true);
    expect(state().session.items.fuses['10']).toBe(1);
  });
});
