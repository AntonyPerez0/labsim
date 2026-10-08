/** Orca's 5-minute health check (Sim §3.3) and status machine (Sim §3.2). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, fresh, healthCheck, host, lab, robot, run, runUntil, sim } from './testkit';
import { noteDisplayText } from './orca/status';

const H = 3_600_000;
vi.setConfig({ testTimeout: 60_000 });

describe('health check schedule (Sim §3.3.1)', () => {
  beforeEach(() => fresh());

  it('runs exactly when the game clock crosses a multiple of 5 minutes, once per crossed boundary', () => {
    expect(lab().orca.healthCheck.runCount).toBe(1); // factory run #1 at 09:00 (Sim §6.5)
    expect(lab().orca.healthCheck.nextRunMs).toBe(9 * H + 300_000);
    sim.setTimeScale(30); // 1 500 game ms per physical sub-step
    const early = collect('orca.healthCheckRan', () => sim.tick(298_500));
    expect(early).toEqual([]);
    expect(lab().time.nowMs).toBe(9 * H + 298_500);
    const runs = collect('orca.healthCheckRan', () => sim.tick(1_500));
    expect(runs.map((r) => r.atMs)).toEqual([9 * H + 300_000]);
    expect(runs[0]!.run).toBe(2);
    // A game-clock jump over three boundaries runs three checks, in order.
    const jumped = collect('orca.healthCheckRan', () => sim.fastForward(900_000));
    expect(jumped.map((r) => r.atMs)).toEqual([9 * H + 600_000, 9 * H + 900_000, 9 * H + 1_200_000]);
    expect(lab().orca.healthCheck.nextRunMs).toBe(9 * H + 1_500_000);
  });

  it('at 5× (Arcade) the check fires every 60 physical seconds', () => {
    sim.reset({ preset: 'arcade' });
    const runs = collect('orca.healthCheckRan', () => run(120_000));
    expect(runs.map((r) => r.atMs)).toEqual([8 * H + 300_000, 8 * H + 600_000]);
  });

  it('writes the exact health-log block (Sim §3.3.4)', () => {
    const lines = healthCheck();
    expect(lines[0]).toBe('2026-10-05 09:00:00  health-check run #2 — 40 pinged, 2 skipped, 1 failed, 0 recovered');
    expect(lines).toContain('robby  SKIPPED (Offline)');
    expect(lines).toContain('dalek  SKIPPED (Offline)');
    expect(lines).toContain('mother  RESERVED — not overridden');
    expect(lines).toContain('sonny  FAIL connect timed out after 10000 ms → CONNECTION_FAILED');
    expect(lines.some((l) => /^wall-e {2}200 OK \(\d+ ms\)$/.test(l))).toBe(true);
  });

  it('collapses identical repeated failures into one note "(×N, last hh:mm:ss)"', () => {
    const sonny = robot('sonny');
    const n = sonny.notes.find((x) => x.kind === 'HEALTH')!;
    expect(n.repeat).toBe(2); // 07:55 + the factory run at 09:00
    expect(noteDisplayText(lab(), n)).toBe('2026-10-05 07:55:00 GET http://10.42.10.74:8000/health → connect timed out after 10000 ms (×2, last 09:00:00)');
  });
});

describe('statuses vs the health check (Sim §3.2)', () => {
  beforeEach(() => fresh());

  it('skips Offline robots entirely (no ping, no note, no status change)', () => {
    const before = robot('robby').notes.length;
    sim.faults.inject({ faultId: 'pi.hung', params: { host: 'pi-marvin' } }); // robby shares MARVIN's Pi
    healthCheck();
    expect(robot('robby').status).toBe('OFFLINE');
    expect(robot('robby').notes.length).toBe(before);
    expect(robot('marvin').status).toBe('CONNECTION_FAILED');
  });

  it('never overrides Reserved, even when the ping fails', () => {
    sim.faults.inject({ faultId: 'pi.hung', params: { host: 'pi-mother' } });
    const before = robot('mother').notes.length;
    const lines = healthCheck();
    expect(lines).toContain('mother  RESERVED — not overridden');
    expect(robot('mother').status).toBe('RESERVED');
    expect(robot('mother').notes.length).toBe(before);
    expect(robot('mother').lastHealth).toBeNull();
  });

  it("flips a shared Pi's rigs together and restores each to its pre-failure status (Unavailable ROSIE)", () => {
    const r = sim.faults.inject({ faultId: 'fuse.blown', params: { fuse: 'F-RACKB-5V' } });
    expect(r.ok).toBe(true);
    run(1_000);
    expect(host('pi-rosie').os).toBe('OFF');
    sim.skipToNextHealthCheck(); // 09:05 check
    const ids = ['johnny-5', 'baymax', 'seti', 'rosie'];
    for (const n of ids) expect(robot(n).status).toBe('CONNECTION_FAILED');
    expect(robot('rosie').preFailureStatus).toBe('UNAVAILABLE');
    expect(robot('rosie').notes[0]!.text).toBe('2026-10-05 09:05:00 GET http://10.42.10.18:8000/health → connect timed out after 10000 ms');
    expect(lab().chat.messages.some((m) => m.channel === '#orca-alerts' && m.text === ':red_circle: rosie → Connection Failed (GET http://10.42.10.18:8000/health → connect timed out after 10000 ms)')).toBe(true);
    // The fix: replace the fuse with one of the holder's rating; Pis boot (40 s), robot-controller ready.
    expect(sim.power.replaceFuse('F-RACKB-5V', 'player').ok).toBe(true);
    expect(runUntil(() => host('pi-rosie').services['robot-controller']!.running, 60_000)).toBeGreaterThan(30_000);
    sim.skipToNextHealthCheck();
    expect(robot('rosie').status).toBe('UNAVAILABLE');
    expect(robot('johnny-5').status).toBe('AVAILABLE');
    expect(robot('rosie').preFailureStatus).toBeNull();
    expect(robot('rosie').notes[0]!.text).toMatch(/^2026-10-05 09:\d\d:00 GET http:\/\/10\.42\.10\.18:8000\/health → 200 OK · status restored to Unavailable$/);
    expect(lab().chat.messages.some((m) => m.text === ':large_green_circle: rosie recovered → Unavailable')).toBe(true);
    run(20_000);
    expect(lab().faults[0]!.cleared).toBe(true); // fuse.blown auto-clears after holding 20 s
  });

  it('reports the exact /health failure rows: Callus box down → 502 for every rig on the box, same timestamp', () => {
    sim.faults.inject({ faultId: 'callus.down', params: { host: 'minix-01', mode: 'box-off' } });
    healthCheck();
    for (const n of ['wall-e', 'eve', 'bumblebee', 'r2-d2']) {
      expect(robot(n).status).toBe('CONNECTION_FAILED');
      expect(robot(n).notes[0]!.text).toBe(`2026-10-05 09:00:00 GET http://10.42.10.${{ 'wall-e': 11, eve: 12, bumblebee: 13, 'r2-d2': 14 }[n]}:8000/health → 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"}`);
    }
    expect(robot('johnny-5').status).toBe('AVAILABLE');
  });

  it('rejects manual Connection Failed and validates statuses (Sim §3.2.1)', () => {
    const id = robot('wall-e').id;
    expect(sim.orca.setRobotStatus(id, 'CONNECTION_FAILED', 'player')).toEqual({ ok: false, error: '400 Bad Request: Connection Failed is set by the health check only' });
    expect(sim.orca.setRobotStatus(id, 'BROKEN' as never, 'player')).toEqual({ ok: false, error: "400 Bad Request: Invalid value for status: 'BROKEN'" });
    expect(sim.orca.setRobotStatus(999, 'OFFLINE', 'player')).toEqual({ ok: false, error: '404 Not Found' });
    expect(sim.orca.setRobotStatus(id, 'RESERVED', 'riley').ok).toBe(true);
    expect(robot('wall-e').reservedBy).toBe('riley');
    expect(robot('wall-e').notes[0]!.text).toBe('2026-10-05 09:00:00 STATUS Available → Reserved (riley)');
  });

  it('the health check is aborted while Orca has no DB connection, and frozen while the app is down', () => {
    sim.faults.inject({ faultId: 'orca.mysqlDown' });
    sim.tick(50);
    expect(lab().orca.app.dbConnected).toBe(false);
    const aborted = collect('orca.healthCheckAborted', () => sim.orca.runHealthCheckNow());
    expect(aborted.length).toBe(1);
    const last = lab().orca.healthCheck.log[lab().orca.healthCheck.log.length - 1]!;
    expect(last.lines[0]).toBe(`2026-10-05 09:00:00  health-check run #${last.run} aborted: JDBCConnectionException: Communications link failure`);
    sim.host.startService('orca-vm', 'mysql', 'player');
    run(5_000 + 15_000 + 100);
    expect(lab().orca.app.dbConnected).toBe(true);
  });
});
