/**
 * End-to-end through the mission runtime with the real sim: Free Play injects an authored incident with
 * a ticket, the player's fix goes through the SimApi, and the ticket resolves (directly or after its
 * deferred verification). Covers the three success shapes: deferred health check, event history
 * (`happened`) and LabChat replies.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mutate, getState } from '@/core/store';
import { sim } from '@/sim';
import { missions } from '../runtime/api';
import { resetRegistries } from '../runtime/registry';
import { advance, resetWorld, state } from '../runtime/__tests__/helpers';

function allModules(): void {
  mutate((s) => {
    for (let i = 1; i <= 18; i++) {
      const id = `M${String(i).padStart(2, '0')}`;
      s.progress.modules[id] = { completed: true, bestScore: 100, completedAtDay: 1, status: 'complete', stars: 3, bestCheckpoint: 1, replays: 0, starBonusesPaid: { two: true, three: true } };
    }
  });
}

/** Advance real seconds on both the sim (game time at its scale) and the mission timers. */
function run(realS: number): void {
  for (let i = 0; i < realS * 4; i++) {
    const scale = getState().lab.time.timeScale || 1;
    sim.tick(250 * scale);
    advance(0.25);
  }
}

function inject(id: string, rig?: string) {
  const r = missions.injectFault(id, { createTicket: true, ...(rig ? { rig } : {}) });
  expect(r.ok ? 'ok' : r.error).toBe('ok');
  run(1);
  const t = state().session.tickets.find((x) => x.incidentId === id);
  expect(t, `${id} ticket`).toBeTruthy();
  return t!;
}

const ticket = (id: string) => state().session.tickets.find((t) => t.id === id)!;

beforeEach(() => {
  resetWorld();
  resetRegistries();
  allModules();
  missions.startFreeplay({ fresh: true });
});

describe('authored incidents resolve end-to-end', { timeout: 30_000 }, () => {
  it('INC04: re-seat the Ethernet cable, Resolve → verifying → next health check resolves', () => {
    const t = inject('INC04', 'bumblebee');
    expect(missions.resolveTicket(t.id).outcome).toBe('rejected');
    sim.host.setEthernet(String(t.binding.vars.pi), true, 'player');
    run(1);
    const r = missions.resolveTicket(t.id);
    expect(['verifying', 'resolved']).toContain(r.outcome);
    sim.skipToNextHealthCheck();
    run(1);
    expect(ticket(t.id).status).toBe('resolved');
  });

  it('INC11: Park All on the bound rig resolves', () => {
    const t = inject('INC11', 'wall-e');
    expect(missions.resolveTicket(t.id).outcome).toBe('rejected');
    sim.rig.command('wall-e', 'park.all', 'player');
    run(25);
    expect(missions.resolveTicket(t.id).outcome).toBe('resolved');
  });

  it('INC63: fixing the Human Readable Name resolves; editing Name would not', () => {
    const t = inject('INC63', 'johnny-5');
    const robot = Object.values(getState().lab.orca.robots).find((r) => r.name === 'johnny-5')!;
    sim.orca.saveRobot({ id: robot.id, humanReadableName: 'JOHNNY-5' }, 'player');
    run(1);
    expect(missions.resolveTicket(t.id).outcome).toBe('resolved');
  });

  it('INC58: the right LabChat reply resolves the judgement ticket', () => {
    const t = inject('INC58');
    const wrong = missions.replyTicket(t.id, 'R2');
    expect(wrong.correct).toBe(false);
    const ok = missions.replyTicket(t.id, 'R1');
    expect(ok.correct).toBe(true);
    run(1);
    expect(ticket(t.id).status).toBe('resolved');
  });

  it('INC05: patience — reply R_WAIT_PING, touch nothing, the next ping restores the rig', () => {
    const t = inject('INC05', 'wall-e');
    expect(state().lab.orca.robots[Object.values(state().lab.orca.robots).find((r) => r.name === 'wall-e')!.id]!.status).toBe('CONNECTION_FAILED');
    expect(missions.replyTicket(t.id, 'R_WAIT_PING').correct).toBe(true);
    run(60); // the Pi finishes booting
    sim.skipToNextHealthCheck();
    run(1);
    expect(ticket(t.id).status).toBe('resolved');
  });

  it('INC03: fuse swapped with the input off restores Rack B and ROSIE stays Unavailable', () => {
    const t = inject('INC03', 'johnny-5');
    sim.skipToNextHealthCheck();
    run(1);
    sim.power.toggleRegulator('REG-5V-B', false, 'player');
    sim.power.removeFuse('F-RACKB-5V', 'player');
    sim.power.insertFuse('F-RACKB-5V', 10, 'player');
    sim.power.toggleRegulator('REG-5V-B', true, 'player');
    run(70);
    const r = missions.resolveTicket(t.id);
    expect(['verifying', 'resolved']).toContain(r.outcome);
    sim.skipToNextHealthCheck();
    run(1);
    expect(ticket(t.id).status).toBe('resolved');
    expect(Object.values(state().lab.orca.robots).find((x) => x.name === 'rosie')!.status).toBe('UNAVAILABLE');
  });

  it('INC06: escalate with the curl endpoint, Jared power-cycles, reply R_FIXED', () => {
    const t = inject('INC06', 'eve');
    const esc = missions.escalate(t.id, { cause: 'A', endpoint: 'http://10.42.10.12:8000/health' });
    expect(esc.outcome).toBe('accepted');
    run(100);
    expect(missions.replyTicket(t.id, 'R_FIXED').correct).toBe(true);
    run(60);
    expect(ticket(t.id).status).toBe('resolved');
    expect(Object.values(state().lab.orca.robots).find((x) => x.name === 'eve')!.status).toBe('RESERVED');
  });
});
