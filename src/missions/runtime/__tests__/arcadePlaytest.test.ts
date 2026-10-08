/**
 * Regressions found while playing the integrated game (Arcade QA): verification that waits for "the next
 * build" in shifts without pipelines, GW17 / GW13 only for player-caused power cuts, and the micro-shift
 * length covering reveal and verification time.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mutate } from '@/core/store';
import { registerIncidents, resetRegistries } from '../registry';
import { missions } from '../api';
import { microLength } from '../arcade/plans';
import { advance, fire, resetWorld, state, testIncident } from './helpers';
import { c, p } from '../../types';

function completeModules(...ids: string[]): void {
  mutate((s) => {
    for (const id of ids) s.progress.modules[id] = { completed: true, bestScore: 100, completedAtDay: 1, status: 'complete', stars: 3, bestCheckpoint: 1, replays: 0, starBonusesPaid: { two: true, three: true } };
  });
}

beforeEach(() => {
  resetWorld();
  resetRegistries({ keepAuthored: false });
});

describe('verification in shifts without pipelines', () => {
  it('Jenkins Bot re-runs a job naming the rig so a "next build" ticket can verify (micro-shift)', () => {
    registerIncidents([testIncident('INC90', { rigs: { candidates: ['eve'], default: 'eve', scope: 'rig', describe: 'EVE' }, success: () => c.all(c.eq(p.v('fixed:INC90'), true), c.nextBuild({ robots: ['eve'] })) })]);
    missions.startShift({ configId: 'micro', incidentIds: ['INC90'] });
    advance(6);
    const t0 = state().session.tickets[0]!;
    expect(t0.binding.rig).toBe('eve');
    mutate((s) => {
      s.session.vars['fixed:INC90'] = true;
    });
    advance(0.5);
    expect(missions.resolveTicket(t0.id).outcome).toBe('verifying');
    const before = Object.keys(state().lab.jenkins.builds).length;
    advance(6);
    const builds = Object.values(state().lab.jenkins.builds);
    expect(builds.length).toBe(before + 1);
    const kicked = builds[builds.length - 1]!;
    expect(kicked.params.ROBOT_NAME).toBe('eve');
    expect(kicked.params.DEVICE_TYPE).toBe('FLEX_4');
    // No second kick while the first one is recent.
    advance(10);
    expect(Object.keys(state().lab.jenkins.builds).length).toBe(before + 1);
  });

  it('micro-shift length leaves room for the reveal and the verification', () => {
    registerIncidents([testIncident('INC90', { parS: 180, reveal: 'healthCheck' }), testIncident('INC91', { parS: 120 })]);
    // 180 × 1.2 + 5 (arrival) + 60 (health-check reveal) + 60 (verification)
    expect(microLength(['INC90'])).toBe(341);
    // (180 + 120) × 1.2 + 5 + 20 + 60 + 60
    expect(microLength(['INC90', 'INC91'])).toBe(505);
  });
});

describe('power-cut penalties need the player', () => {
  it('GW17 ignores a Pi going dark on its own (fault, rail loss) but charges a player re-cycle of a healthy Pi', () => {
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startShift({ configId: 'shift-5', customSeed: 'gw17', seedMode: 'custom' });
    advance(1);
    fire('host.powerChanged', { hostId: 'pi-wall-e', from: 'on', to: 'off' });
    fire('host.powerChanged', { hostId: 'pi-wall-e', from: 'booting', to: 'on' });
    expect(state().session.shift!.penalties.filter((x) => x.gwId === 'GW17')).toHaveLength(0);
    advance(1);
    fire('player.interacted', { interactableId: 'rig.eve.pi-power', verb: 'Unplug', tool: 'hand' });
    fire('host.powerChanged', { hostId: 'pi-eve', from: 'on', to: 'off' });
    expect(state().session.shift!.penalties.filter((x) => x.gwId === 'GW17')).toHaveLength(1);
  });

  it('GW17 ignores a booting Pi losing power to a fuse that just blew (a protection trip, not a re-cycle)', () => {
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startShift({ configId: 'shift-5', customSeed: 'gw17-fuse', seedMode: 'custom' });
    advance(1);
    // The player switches the regulator back on with an undersized fuse fitted: the fuse blows (power
    // step) and the booting Pi goes dark (hosts step) in the same tick.
    fire('player.interacted', { interactableId: 'power.regulator.rack-b-5v', verb: 'Switch on', tool: 'hand' });
    fire('power.fuseBlown', { fuseId: 'F-RACKB-5V', railId: 'rail-5v-b', currentA: 14 });
    fire('host.powerChanged', { hostId: 'pi-johnny-5', from: 'booting', to: 'off' });
    expect(state().session.shift!.penalties.filter((x) => x.gwId === 'GW17')).toHaveLength(0);
  });

  it('GW13 ignores shared infrastructure going down without a player action', () => {
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startShift({ configId: 'shift-5', customSeed: 'gw13', seedMode: 'custom' });
    advance(1);
    fire('host.powerChanged', { hostId: 'ollama-vm', from: 'on', to: 'off' });
    expect(state().session.shift!.penalties.filter((x) => x.gwId === 'GW13')).toHaveLength(0);
  });
});

describe('ADB / reservation etiquette is judged on the player, not the scenario', () => {
  it('GW08: `adb disconnect …:5555` is the fix, `adb connect …:5555` is the mistake', () => {
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startShift({ configId: 'shift-5', customSeed: 'gw8b', seedMode: 'custom' });
    fire('terminal.command', { line: 'adb disconnect 10.42.60.4:5555', host: 'ws-17', cwd: '~', exitCode: 0 });
    expect(state().session.shift!.penalties.filter((x) => x.gwId === 'GW08')).toHaveLength(0);
    fire('terminal.command', { line: 'adb connect 10.42.30.13:5555', host: 'ws-17', cwd: '~', exitCode: 0 });
    expect(state().session.shift!.penalties.filter((x) => x.gwId === 'GW08')).toHaveLength(1);
  });

  it('GW08: a coworker device driven by a local run the incident started is not charged to the player', async () => {
    const { asRuntime } = await import('../rt');
    completeModules('M01', 'M02', 'M03', 'M04');
    missions.startShift({ configId: 'shift-5', customSeed: 'gw8c', seedMode: 'custom' });
    asRuntime(() => fire('test.localRunStarted', { runId: 'run-1', testName: 'SaleTest', robotName: 'bumblebee' }));
    fire('adb.connected', { target: '10.42.60.4:5555', deviceId: 'dev-riley-desk-flex', coworker: true });
    fire('adb.coworkerDriven', { target: '10.42.60.4:5555', deviceId: 'dev-riley-desk-flex', command: 'input tap', by: 'runner' });
    expect(state().session.shift!.penalties.filter((x) => x.gwId === 'GW08')).toHaveLength(0);
    expect(state().session.shift!.strikes).toBe(0);
    fire('test.localRunFinished', { runId: 'run-1', testName: 'SaleTest', passed: false, failureCode: 'UI_NOT_FOUND' });
    // The player's own run on 5555 is charged.
    fire('test.localRunStarted', { runId: 'run-2', testName: 'SaleTest', robotName: 'bumblebee' });
    fire('adb.coworkerDriven', { target: '10.42.60.4:5555', deviceId: 'dev-riley-desk-flex', command: 'input tap', by: 'runner' });
    expect(state().session.shift!.penalties.filter((x) => x.gwId === 'GW08')).toHaveLength(1);
  });

  it('GW20: asking the owner through the ticket reply counts as asking before releasing the reservation', () => {
    registerIncidents([
      testIncident('INC90', {
        rigs: { candidates: ['eve'], default: 'eve', scope: 'rig', describe: 'EVE' },
        reveal: 'immediate',
        ticket: { title: 'waiting forever', reporter: 'jenkins-bot' },
        replies: { wrongPenalty: 50, to: 'riley', options: [{ id: 'R_ASK', text: 'Still using the rig?', correct: true }] },
        success: () => c.status('eve', 'AVAILABLE'),
      }),
    ]);
    missions.startShift({ configId: 'micro', incidentIds: ['INC90'] });
    mutate((s) => {
      const r = Object.values(s.lab.orca.robots).find((x) => x.name === 'eve')!;
      r.status = 'RESERVED';
      r.reservedBy = 'riley';
    });
    advance(6);
    const t0 = state().session.tickets[0]!;
    expect(missions.replyTicket(t0.id, 'R_ASK').correct).toBe(true);
    expect(state().lab.chat.messages.filter((m) => m.ticketId === t0.id && m.author === 'player')).toHaveLength(1);
    fire('robot.statusChanged', { robotId: 2, name: 'eve', from: 'RESERVED', to: 'AVAILABLE', actor: 'player' });
    expect(state().session.shift!.penalties.filter((x) => x.gwId === 'GW20')).toHaveLength(0);
  });
});

describe('Full Shift events', () => {
  it('queues escalations while Jared is at lunch and judges them when the banner ends', () => {
    registerIncidents([testIncident('INC90', { rigs: { roles: ['touch'], default: null, scope: 'rig', describe: 'any touch rig' } })]);
    completeModules(...Array.from({ length: 18 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`));
    mutate((s) => {
      s.progress.rank = 'automation-engineer-2';
    });
    missions.startShift({ configId: 'shift-20', customSeed: 'l', seedMode: 'custom' });
    const ev = state().session.shift!.event;
    expect(ev?.id).toBe('jared-lunch');
    advance(ev!.firesAtS + 1, 0.5);
    const sh = state().session.shift!;
    expect(sh.jaredAwayUntilS).not.toBeNull();
    expect(state().ui.banners.some((b) => b.id === 'shift-event')).toBe(true);
    const t = state().session.tickets.find((x) => x.status !== 'resolved' && x.status !== 'handover')!;
    expect(t).toBeDefined();
    const r = missions.escalate(t.id, { cause: 'A', endpoint: `http://${t.binding.vars.piIp}:8000/health` });
    expect(r.outcome).toBe('queued');
    expect(state().session.shift!.queuedEscalations).toContain(t.id);
    advance(125, 0.5);
    expect(state().session.shift!.jaredAwayUntilS).toBeNull();
    expect(state().session.tickets.find((x) => x.id === t.id)!.escalation?.outcome).toBe('accepted');
  });
});

describe('incident-local wrong moves', () => {
  it('only charge actions on the ticket’s own rigs', async () => {
    const { on } = await import('../../types');
    registerIncidents([
      testIncident('INC90', {
        rigs: { candidates: ['seti'], default: 'seti', scope: 'rig', describe: 'SETI' },
        wrongButTempting: [{ id: 'nudge', text: 'Send a motion command', penalty: 40, detect: on('rig.command', {}), repeatable: true }],
      }),
    ]);
    missions.startShift({ configId: 'micro', incidentIds: ['INC90'] });
    advance(6);
    const t0 = state().session.tickets[0]!;
    expect(t0.binding.rig).toBe('seti');
    fire('rig.command', { rigId: 'r2-d2', command: 'park.all', actor: 'player', ok: true });
    expect(state().session.shift!.penalties).toHaveLength(0);
    fire('rig.command', { rigId: 'seti', command: 'park.all', actor: 'player', ok: true });
    expect(state().session.shift!.penalties.map((p) => p.points)).toEqual([-40]);
  });
});

describe('planned shifts', () => {
  it('a planned ticket whose rig is busy arrives once the rig is free instead of being dropped', () => {
    const rig = { candidates: ['eve'], default: 'eve', scope: 'rig' as const, describe: 'EVE' };
    registerIncidents([testIncident('INC90', { rigs: rig }), testIncident('INC91', { rigs: rig })]);
    missions.startShift({ configId: 'micro', incidentIds: ['INC90', 'INC91'] });
    advance(30);
    // Both bind EVE: the second waits while the first holds the rig.
    expect(state().session.tickets.map((t) => t.incidentId)).toEqual(['INC90']);
    const t0 = state().session.tickets[0]!;
    expect(missions.escalate(t0.id, { cause: 'A', endpoint: `http://${t0.binding.vars.piIp}:8000/health` }).outcome).toBe('accepted');
    advance(95);
    fire('orca.healthCheckRan', { atMs: state().lab.time.nowMs, checked: 12, failedRobotIds: [], recoveredRobotIds: [] });
    expect(state().session.tickets.find((t) => t.id === t0.id)!.status).toBe('resolved');
    advance(12);
    expect(state().session.tickets.map((t) => t.incidentId)).toEqual(['INC90', 'INC91']);
  });
});

describe('shift opening', () => {
  it('the first ticket of a shift opens within seconds of its 8 s spawn, whatever the seed', () => {
    resetRegistries({ keepAuthored: true });
    for (const seed of ['open-1', 'open-2', 'open-3', 'open-4', 'open-5', 'open-6']) {
      resetWorld();
      completeModules('M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10');
      missions.startShift({ configId: 'shift-5', customSeed: seed, seedMode: 'custom' });
      advance(25);
      expect(state().session.tickets.length, `seed ${seed}`).toBeGreaterThan(0);
      missions.quit();
    }
  });
});
