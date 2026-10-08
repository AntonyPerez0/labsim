import { beforeEach, describe, expect, it } from 'vitest';
import { mutate } from '@/core/store';
import { comboMultiplier, hintFactor, shiftGrade, shiftXp, ticketScore, timeFactor, uptimeBonus } from '../arcade/scoring';
import { registerIncidents, resetRegistries } from '../registry';
import { missions } from '../api';
import { buildDailyPlan } from '../arcade/plans';
import { advance, fire, resetWorld, state, testIncident } from './helpers';
import type { IncidentDef } from '../../types';
import { XP_REWARDS } from '@/content';

function completeModules(...ids: string[]): void {
  mutate((s) => {
    for (const id of ids) s.progress.modules[id] = { completed: true, bestScore: 100, completedAtDay: 1, status: 'complete', stars: 3, bestCheckpoint: 1, replays: 0, starBonusesPaid: { two: true, three: true } };
  });
}

beforeEach(() => {
  resetWorld();
  resetRegistries({ keepAuthored: false });
});

describe('shift scoring formula (GP §2.3.8)', () => {
  it('scales by time, hints and combo', () => {
    expect(timeFactor(30, 120, 180)).toBe(1.5);
    expect(timeFactor(90, 120, 180)).toBeCloseTo(1.25);
    expect(timeFactor(120, 120, 180)).toBeCloseTo(1.0);
    expect(timeFactor(150, 120, 180)).toBeCloseTo(0.75);
    expect(timeFactor(181, 120, 180)).toBe(0.25);
    expect([0, 1, 2, 3].map(hintFactor)).toEqual([1, 0.9, 0.75, 0.5]);
    expect(comboMultiplier(3)).toBe(1.75);
    expect(comboMultiplier(12)).toBe(3);
    // 400 × 1.5 × 0.9 × 1.25 = 675, + 100 diagnosis + 10 ack + 25 PB07 − 50 penalty
    expect(ticketScore({ base: 400, rS: 100, parS: 270, slaS: 405, hintTier: 1, comboAfter: 1, diagnosisBonus: 100, ackBonus: 10, processBonus: 25, penalties: 50 })).toBe(760);
  });

  it('grades the ratio, caps strikes at D and pays shift XP', () => {
    expect(shiftGrade(1.6, 0, 0)).toBe('S');
    expect(shiftGrade(1.6, 1, 0)).toBe('A');
    expect(shiftGrade(0.9, 0, 2)).toBe('B');
    expect(shiftGrade(0.6, 0, 0)).toBe('C');
    expect(shiftGrade(2, 0, 0, true)).toBe('D');
    expect(uptimeBonus(0.96)).toBe(500);
    expect(uptimeBonus(0.9)).toBe(250);
    expect(shiftXp(2345, 'A', false, XP_REWARDS.shiftGradeBonus)).toBe(234 + 200);
    expect(shiftXp(2345, 'A', true, XP_REWARDS.shiftGradeBonus)).toBe(Math.round(434 * 1.25));
  });
});

describe('ticket lifecycle', () => {
  it('acks, calls, rejects a premature resolve (GW16), verifies at the next health check and scores', () => {
    registerIncidents([testIncident('INC90')]);
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startShift({ configId: 'shift-5', customSeed: 'abc', seedMode: 'custom' });
    expect(state().session.mode).toBe('arcade-shift');
    advance(8.5);
    const t0 = state().session.tickets[0]!;
    expect(t0).toBeDefined();
    expect(t0.incidentId).toBe('INC90');
    missions.ackTicket(t0.id);
    const scoreAfterAck = state().session.shift!.score;
    expect(scoreAfterAck).toBeGreaterThanOrEqual(10 - 30); // +10 ack (pipelines may have charged a blocked attempt)
    const call = missions.callRootCause(t0.id, 'A');
    expect(call.correct).toBe(true);
    expect(call.fast).toBe(true);
    expect(call.points).toBe(50);

    const r1 = missions.resolveTicket(t0.id);
    expect(r1.outcome).toBe('rejected');
    expect(state().session.shift!.penalties.some((p) => p.gwId === 'GW16' && p.points === -100)).toBe(true);

    mutate((s) => {
      s.session.vars['fixed:INC90'] = true;
    });
    advance(0.5);
    const r2 = missions.resolveTicket(t0.id);
    expect(r2.outcome).toBe('verifying');
    expect(r2.message).toMatch(/^Verifying… waiting for \d\d:\d\d health check$/);
    fire('orca.healthCheckRan', { atMs: state().lab.time.nowMs, checked: 12, failedRobotIds: [], recoveredRobotIds: [] });
    const t = state().session.tickets.find((x) => x.id === t0.id)!;
    expect(t.status).toBe('resolved');
    expect(t.score?.fastDiagnosis).toBe(true);
    // Penalty on the ticket (GW16) blocks the combo.
    expect(t.score?.comboAfter).toBe(0);
    expect(t.score!.total).toBe(t.score!.diagnosisBonus + t.score!.ackBonus + Math.round(200 * t.score!.timeFactor * t.score!.hintFactor * t.score!.comboFactor) + t.score!.processBonus - t.score!.penalties);
  });

  it('escalates with the right cause and endpoint, Jared fixes it and the ticket auto-resolves', () => {
    registerIncidents([testIncident('INC91')]);
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startShift({ configId: 'shift-5', customSeed: 'esc', seedMode: 'custom' });
    advance(8.5);
    const t0 = state().session.tickets[0]!;
    const view = missions.ticketView(t0.id)!;
    expect(view.callOptions?.map((o) => o.id).sort()).toEqual(['A', 'B', 'C', 'D']);
    const bad = missions.escalate(t0.id, { cause: 'B', endpoint: 'http://nowhere' });
    expect(bad.outcome).toBe('pending');
    advance(21);
    expect(state().session.tickets[0]!.status).toBe('in-progress');
    expect(state().session.tickets[0]!.escalationsBounced).toBe(1);
    // Second escalation counts the call already made; endpoint must match the Notes URL.
    const endpoint = `http://${t0.binding.vars.piIp}:8000/health`;
    const ok = missions.escalate(t0.id, { cause: 'A', endpoint });
    expect(ok.outcome).toBe('accepted');
    advance(95);
    fire('orca.healthCheckRan', { atMs: state().lab.time.nowMs, checked: 12, failedRobotIds: [], recoveredRobotIds: [] });
    expect(state().session.tickets[0]!.status).toBe('resolved');
  });
});

describe('global wrong actions', () => {
  it('charges GW01 (18 V device on a DC rail) with a strike and a Teach Card', () => {
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startShift({ configId: 'shift-5', customSeed: 'gw', seedMode: 'custom' });
    const before = state().session.shift!.score;
    fire('power.plugged', { loadId: 'dev-wall-e-flex3', hookup: { kind: 'dc-rail', targetId: 'T-24V-1' } });
    const sh = state().session.shift!;
    const pen = sh.penalties.find((p) => p.gwId === 'GW01')!;
    expect(pen).toBeDefined();
    expect(pen.points).toBe(-500);
    expect(pen.strike).toBe(true);
    expect(sh.strikes).toBe(1);
    expect(sh.score).toBe(before - 500);
    const card = state().ui.teachCards.find((c) => c.id === pen.teachCardId)!;
    expect(card.whatHappened).toBe('The Flex fried on the 24 V tap.');
    expect(card.practiceDrillId).toBe('DR04');
    expect(state().progress.tagMastery['power.18v']?.evidence).toBe(1);
    expect(state().progress.achievements.ACH08).toBeDefined();
  });

  it('charges GW08 for port 5555 and strikes when it reaches a coworker device', () => {
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startShift({ configId: 'shift-5', customSeed: 'gw8', seedMode: 'custom' });
    fire('terminal.command', { line: 'adb connect 10.42.30.11:5555', host: 'ws-17', cwd: '~', exitCode: 0 });
    let sh = state().session.shift!;
    expect(sh.penalties.filter((p) => p.gwId === 'GW08')).toHaveLength(1);
    expect(sh.penalties[0]!.points).toBe(-300);
    expect(sh.strikes).toBe(0);
    advance(25);
    fire('terminal.command', { line: 'adb connect 10.42.60.4:5555', host: 'ws-17', cwd: '~', exitCode: 0 });
    sh = state().session.shift!;
    expect(sh.penalties.filter((p) => p.gwId === 'GW08')).toHaveLength(2);
    expect(sh.strikes).toBe(1);
  });

  it('ignores runtime-driven events and gives Academy only the Teach Card (no points)', () => {
    missions.startAcademy('M01');
    fire('power.plugged', { loadId: 'dev-wall-e-flex3', hookup: { kind: 'dc-rail', targetId: 'T-24V-1' } });
    expect(state().ui.teachCards.some((c) => c.trigger.ref === 'GW01')).toBe(true);
    expect(state().session.shift).toBeNull();
    expect(state().progress.penalties.GW01).toBe(1);
  });

  it('ends the shift on three strikes with grade D', () => {
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startShift({ configId: 'shift-5', customSeed: 'strikes', seedMode: 'custom' });
    fire('power.plugged', { loadId: 'dev-wall-e-flex3', hookup: { kind: 'dc-rail', targetId: 'T-24V-1' } });
    advance(6);
    fire('power.plugged', { loadId: 'dev-eve-flex4', hookup: { kind: 'dc-rail', targetId: 'T-24V-1' } });
    fire('host.securityTamper', { hostId: 'nuc-03', action: 'uninstall', actor: 'player' });
    const s = state();
    expect(s.session.shift!.phase).toBe('ended');
    expect(s.session.shift!.grade).toBe('D');
    expect(s.session.result?.shift?.endReason).toBe('strikes');
  });
});

describe('deterministic spawning', () => {
  const incidents: IncidentDef[] = ['INC90', 'INC91', 'INC92', 'INC93', 'INC94'].map((id, i) =>
    testIncident(id, { difficulty: ((i % 2) + 1) as 1 | 2, rigs: { roles: ['touch'], default: null, scope: 'rig', describe: 'any touch rig' } }),
  );

  function runShift(seed: string): string[] {
    resetWorld();
    resetRegistries({ keepAuthored: false });
    registerIncidents(incidents);
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startShift({ configId: 'shift-5', customSeed: seed, seedMode: 'custom' });
    advance(180, 0.5);
    return state().session.tickets.map((t) => `${t.id}:${t.incidentId}:${t.variantId}:${t.binding.rig}:${t.misleading}`);
  }

  it('spawns the same tickets for the same seed', () => {
    const a = runShift('seed-1');
    const b = runShift('seed-1');
    expect(a.length).toBeGreaterThan(1);
    expect(a).toEqual(b);
    const c = runShift('seed-2');
    expect(c).not.toEqual(a);
  });

  it('builds the same Daily plan for a date seed', () => {
    const p1 = buildDailyPlan(1234, incidents);
    const p2 = buildDailyPlan(1234, incidents);
    expect(p1).toEqual(p2);
    expect(p1.length).toBe(5);
    expect(new Set(p1.map((x) => x.incidentId)).size).toBe(p1.length);
    expect(p1[0]!.arrivalS).toBe(8);
  });
});
