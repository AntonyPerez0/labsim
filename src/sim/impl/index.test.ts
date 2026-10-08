import { beforeEach, describe, expect, it } from 'vitest';
import { bus } from '@/core/bus';
import { getState } from '@/core/store';
import { sim, migrateLabState } from './index';
import { createTerminalDevice, createEmptyLabState, createInitialLabState, createRigState, createRngStreams } from '../initialState';
import { HEALTH_CHECK_INTERVAL_MS, LAB_STATE_VERSION } from '../types';

const lab = () => getState().lab;

describe('initial state (Sim §1, §2.1)', () => {
  it('is a complete v2 lab at 09:00 on MON, OCT 5', () => {
    const s = createInitialLabState();
    expect(s.version).toBe(LAB_STATE_VERSION);
    expect(s.time).toMatchObject({ nowMs: 9 * 3_600_000, physMs: 0, timeScale: 1, epochDate: '2026-10-05', dateLabel: 'MON, OCT 5', healthAnchorMs: 0 });
    expect(s.orca.healthCheck.nextRunMs).toBe(9 * 3_600_000 + HEALTH_CHECK_INTERVAL_MS);
    expect(Object.keys(s.repos).sort()).toEqual(['gort', 'orchestrator', 'pigeon', 'uia-remote']);
    expect(s.jenkins.executors).toBe(8);
    expect(s.flags.receiptQrFeature).toBe(true);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('derives independent RNG streams from the seed (Sim §6.1)', () => {
    const a = createRngStreams(20261005);
    const b = createRngStreams(20261005);
    expect(a).toEqual(b);
    const seeds = new Set(Object.values(a).map((r) => r.seed));
    expect(seeds.size).toBe(6);
    expect(createEmptyLabState(7).rng).toEqual(createEmptyLabState(7).rngStreams.core);
  });
});

describe('entity builders (Sim §2.3–§2.4 defaults)', () => {
  it('build factory-state rigs and devices', () => {
    const rig = createRigState('wall-e', 1, 'touch');
    expect(rig).toMatchObject({ banner: 'green', bannerText: 'Status: OK', probeDisplay: 'primary', motionHost: 'PI', assembly: 'complete' });
    expect(rig.gantry).toMatchObject({ homed: true, minXMm: -10, speedMmS: 120, homingSpeedMmS: 60 });
    expect(createRigState('data', 11, 'adb').probeDisplay).toBeNull();
    expect(createTerminalDevice('dev-johnny-5-flex1', 'FLEX_1').firmwareInfo).toEqual({ version: '2.19.4', receiptQr: false });
    expect(createTerminalDevice('dev-rosie-pocket', 'FLEX_POCKET').printer.present).toBe(false);
    expect(createTerminalDevice('dev-r2-d2-duo', 'STATION_DUO').secondaryDisplay?.screen).toBe('customer-idle');
  });
});

describe('sim lifecycle (Sim §6)', () => {
  beforeEach(() => sim.reset({ preset: 'test' }));

  it('reset applies the preset table and emits sim.reset', () => {
    const seen: string[] = [];
    const off = bus.on('sim.reset', (p) => seen.push(`${p.preset}:${p.seed}`));
    sim.reset({ preset: 'arcade', seed: 42 });
    off();
    expect(seen).toEqual(['arcade:42']);
    expect(lab().config).toMatchObject({ mode: 'arcade', damageModel: 'arcade', pipelinesEnabled: true, forceHealthCheckAllowed: false });
    expect(lab().time.nowMs).toBe(8 * 3_600_000);
    expect(lab().time.timeScale).toBe(5);
    expect(lab().orca.healthCheck.nextRunMs).toBe(8 * 3_600_000 + 300_000);
  });

  it('unknown presets fall back to factory with an error log', () => {
    sim.reset({ preset: 'nope' });
    expect(lab().config.mode).toBe('freeplay');
    expect(lab().log.some((l) => l.level === 'error' && l.text.includes("unknown preset 'nope'"))).toBe(true);
    expect(sim.presets()).toContain('academy:M18');
  });

  it('tick advances the game clock by dt and the physical clock by dt / timeScale', () => {
    const t0 = lab().time.nowMs;
    sim.tick(1000);
    expect(lab().time.nowMs).toBe(t0 + 1000);
    expect(lab().time.physMs).toBe(1000);
    sim.setTimeScale(5);
    sim.tick(250);
    expect(lab().time.nowMs).toBe(t0 + 1250);
    expect(lab().time.physMs).toBe(1050);
    sim.tick(0);
    sim.tick(-5);
    sim.tick(Number.NaN);
    expect(lab().time.nowMs).toBe(t0 + 1250);
  });

  it('setTimeScale snaps to the allowed scales', () => {
    sim.setTimeScale(7);
    expect(lab().time.timeScale).toBe(5);
    sim.setTimeScale(30);
    expect(lab().time.timeScale).toBe(30);
  });

  it('skipToNextHealthCheck jumps only the game clock, exactly onto the boundary', () => {
    sim.tick(1234);
    const phys = lab().time.physMs;
    const jumps: number[] = [];
    const off = bus.on('time.jumped', (p) => jumps.push(p.toMs));
    sim.skipToNextHealthCheck();
    off();
    expect(lab().time.nowMs % 300_000).toBe(0);
    expect(lab().time.nowMs).toBe(9 * 3_600_000 + 300_000);
    expect(lab().time.physMs).toBe(phys);
    expect(jumps).toEqual([lab().time.nowMs]);
  });

  it('snapshot → restore round-trips and is deterministic', () => {
    sim.tick(5000);
    const snap = sim.snapshot();
    sim.tick(60_000);
    sim.restore(snap);
    expect(sim.snapshot()).toEqual(snap);

    sim.reset({ preset: 'test', seed: 99 });
    sim.tick(10_000);
    const a = sim.snapshot();
    sim.reset({ preset: 'test', seed: 99 });
    sim.tick(10_000);
    expect(sim.snapshot()).toEqual(a);
  });

  it('load validates versions and migrates v1 stubs', () => {
    expect(sim.load('{oops')).toEqual({ ok: false, error: 'not a LabSim save' });
    expect(sim.load({ version: 3 })).toEqual({ ok: false, error: 'save is from a newer LabSim (v3) — update the game' });
    const partial = { ...sim.snapshot() } as Record<string, unknown>;
    delete partial.timers;
    expect(sim.load(partial)).toEqual({ ok: false, error: 'save is corrupted: missing timers' });

    const v1 = { version: 1, rng: { seed: 5, state: 5 }, time: { nowMs: 40_000_000, timeScale: 2, startHour: 9, dateLabel: 'WED, NOV 5' }, flags: { receiptQrFeature: false, uiaVersion: '2.3', softwarePinBypass: false, showTouchTargets: true } };
    const r = sim.load(v1);
    expect(r).toEqual({ ok: true, value: { migratedFrom: 1 } });
    expect(lab().version).toBe(2);
    expect(lab().time).toMatchObject({ nowMs: 40_000_000, timeScale: 2, dateLabel: 'MON, OCT 5' });
    expect(lab().flags).toMatchObject({ receiptQrFeature: false, showTouchTargets: true, cfdLayoutV2Toggle: false });
    expect(migrateLabState(sim.snapshot()).ok).toBe(true);
  });

  it('chat.schedule delivers through the tick (housekeeping slot)', () => {
    const got: string[] = [];
    const off = bus.on('chat.message', (m) => got.push(`${m.author}: ${m.text}`));
    sim.chat.schedule('#lab-automation', 'riley', 'Ha. Welcome to the club.', 2000);
    sim.tick(1000);
    expect(got).toEqual([]);
    sim.tick(1000);
    off();
    expect(got).toEqual(['riley: Ha. Welcome to the club.']);
    expect(lab().chat.unread['#lab-automation']).toBe(1);
    expect(lab().timers).toEqual([]);
  });

  it('faults reject unknown ids and inject catalogue rows', () => {
    expect(sim.faults.inject({ faultId: 'nope' })).toEqual({ ok: false, error: "unknown fault 'nope'" });
    const r = sim.faults.inject({ faultId: 'pi.hung', params: { host: 'pi-wall-e' } });
    expect(r.ok).toBe(true);
    expect(sim.faults.inject({ faultId: 'pi.hung', params: { host: 'pi-wall-e' } })).toEqual({ ok: false, error: 'fault pi.hung already active on pi-wall-e (#f1)' });
    expect(sim.faults.injectAll([])).toEqual({ ok: true, value: { instanceIds: [] } });
    expect(sim.faults.clear('f9', 'player')).toEqual({ ok: false, error: "no fault 'f9'" });
  });

  it('forceHealthCheck honours the tutorial gate', () => {
    sim.reset({ preset: 'arcade' });
    expect(sim.orca.forceHealthCheck('player')).toEqual({ ok: false, error: '403 Force health check is disabled in this environment' });
  });
});
