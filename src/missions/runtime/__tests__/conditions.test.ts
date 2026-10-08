import { beforeEach, describe, expect, it } from 'vitest';
import { mutate } from '@/core/store';
import { c, on, p } from '../../types';
import { createScope, evaluate, feedTrigger, sampleScope, scopeStatus } from '../conditions/evaluate';
import { RT, entriesSince } from '../rt';
import { compareValues } from '../conditions/evaluate';
import { advance, fire, resetWorld, state } from './helpers';

beforeEach(() => {
  resetWorld();
  mutate((s) => {
    s.session.mode = 'freeplay';
  });
});

describe('condition evaluator', () => {
  it('compares probe values with every comparator', () => {
    expect(compareValues(3, 'lt', 4)).toBe(true);
    expect(compareValues(3, 'gte', 4)).toBe(false);
    expect(compareValues(10.2, 'approx', 10, 0.5)).toBe(true);
    expect(compareValues(10.6, 'approx', 10, 0.5)).toBe(false);
    expect(compareValues('FLEX_3', 'in', ['FLEX_3', 'FLEX_4'])).toBe(true);
    expect(compareValues(['a', 'b'], 'contains', 'b')).toBe(true);
    expect(compareValues('portNumber=5444', 'matches', '5444$')).toBe(true);
    expect(compareValues(null, 'gt', 0)).toBe(false);
    expect(compareValues([], 'truthy', undefined)).toBe(false);
  });

  it('evaluates logic over session vars, flags and the RootState escape hatch', () => {
    mutate((s) => {
      s.session.vars.answer = '200';
    });
    const cond = c.all(c.eq(p.v('answer'), '200'), c.not(c.eq(p.flag('softwarePinBypass'), true)), c.any(c.eq(p.path('session.mode'), 'freeplay'), c.eq(p.overlay, 'quiz')));
    expect(evaluate(cond, state())).toBe(true);
    mutate((s) => {
      s.lab.flags.softwarePinBypass = true;
    });
    expect(evaluate(cond, state())).toBe(false);
  });

  it('matches event history with happened / sequence in the owner scope', () => {
    const scope = createScope({ id: 't1', kind: 'step', ownerId: 'x', cond: null, state: state() });
    const seq = c.sequence(on('orca.checkoutRejected', { jobId: 'Java/uia-remote-regression-flex' }), on('robot.checkedOut', { name: 'wall-e' }));
    expect(evaluate(seq, state(), scope)).toBe(false);
    fire('robot.checkedOut', { robotId: 1, name: 'wall-e', buildId: 'b1', byName: false });
    expect(evaluate(seq, state(), scope)).toBe(false); // wrong order
    fire('orca.checkoutRejected', { buildId: 'b2', jobId: 'Java/uia-remote-regression-flex', reason: 'Reserved' });
    fire('robot.checkedOut', { robotId: 1, name: 'wall-e', buildId: 'b2', byName: false });
    expect(evaluate(seq, state(), scope)).toBe(true);
    expect(evaluate(c.happened(on('robot.checkedOut', { name: 'wall-e' }), { min: 2 }), state(), scope)).toBe(true);
    expect(entriesSince(RT.activityStartSeq).length).toBeGreaterThanOrEqual(3);
  });

  it('samples held / wasTrue / never invariants every tick', () => {
    const cond = c.all(c.held(c.eq(p.v('door'), 'closed'), 2), c.never(c.eq(p.v('door'), 'smashed')));
    const scope = createScope({ id: 't2', kind: 'step', ownerId: 'x', cond, state: state() });
    mutate((s) => {
      s.session.vars.door = 'closed';
    });
    for (let i = 0; i < 4; i++) {
      advance(0.75);
      sampleScope(scope, state());
    }
    expect(scopeStatus(scope, state()).full).toBe(true);
    const latched = createScope({ id: 't3', kind: 'step', ownerId: 'y', cond: c.wasTrue(c.eq(p.v('door'), 'open')), state: state() });
    sampleScope(latched, state());
    expect(scopeStatus(latched, state()).full).toBe(false);
    mutate((s) => {
      s.session.vars.door = 'open';
    });
    sampleScope(latched, state());
    mutate((s) => {
      s.session.vars.door = 'closed';
    });
    sampleScope(latched, state());
    expect(scopeStatus(latched, state()).full).toBe(true);
  });

  it('defers verify nodes to the next health check after the fix', () => {
    const cond = c.all(c.eq(p.v('fixed'), true), c.nextHealthCheck());
    const scope = createScope({ id: 't4', kind: 'ticket', ownerId: 'LAB-1', cond, state: state() });
    // A health check before the fix fails the verification.
    fire('orca.healthCheckRan', { atMs: 0, checked: 12, failedRobotIds: [], recoveredRobotIds: [] });
    expect(feedTrigger(scope, RT.log[RT.log.length - 1]!, state())).toBe('failed');
    mutate((s) => {
      s.session.vars.fixed = true;
    });
    sampleScope(scope, state());
    const st = scopeStatus(scope, state());
    expect(st.immediate).toBe(true);
    expect(st.full).toBe(false);
    fire('orca.healthCheckRan', { atMs: 1, checked: 12, failedRobotIds: [], recoveredRobotIds: [] });
    expect(feedTrigger(scope, RT.log[RT.log.length - 1]!, state())).toBe('satisfied');
    expect(scopeStatus(scope, state()).full).toBe(true);
  });

  it('counts builds for nextBuild triggers with params and distinct robots', () => {
    const cond = c.all(c.eq(p.v('fixed'), true), c.nextBuild({ jobs: ['Java/x'], count: 2 }));
    const scope = createScope({ id: 't5', kind: 'ticket', ownerId: 'LAB-2', cond, state: state() });
    mutate((s) => {
      s.session.vars.fixed = true;
    });
    sampleScope(scope, state());
    fire('jenkins.buildFinished', { buildId: 'Java/x#1', jobId: 'Java/x', result: 'SUCCESS', failureCode: null, robotId: null });
    expect(feedTrigger(scope, RT.log[RT.log.length - 1]!, state())).toBe('progress');
    fire('jenkins.buildFinished', { buildId: 'Java/y#1', jobId: 'Java/y', result: 'SUCCESS', failureCode: null, robotId: null });
    expect(feedTrigger(scope, RT.log[RT.log.length - 1]!, state())).toBe(null);
    fire('jenkins.buildFinished', { buildId: 'Java/x#2', jobId: 'Java/x', result: 'SUCCESS', failureCode: null, robotId: null });
    expect(feedTrigger(scope, RT.log[RT.log.length - 1]!, state())).toBe('satisfied');
  });
});
