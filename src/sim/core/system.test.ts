/**
 * Whole-sim checks: presets (Sim §6.5), determinism (§6.4), performance (§6.2 budget) and the
 * core ↔ devops end-to-end path (a Jenkins tethered Tax build on MEGATRON drives MFD + CFD, goes green).
 */
import { describe, expect, it, vi } from 'vitest';
import { collect, device, fresh, lab, robot, run, runUntil, sim } from './testkit';
import { ACADEMY_SCENARIOS } from './presets';

vi.setConfig({ testTimeout: 180_000 });

describe('presets (Sim §6.5, §4.4.2)', () => {
  it('every preset builds; every Academy scenario applies without an error', () => {
    for (const p of sim.presets()) {
      sim.reset({ preset: p });
      const errors = lab().log.filter((l) => l.level === 'error').map((l) => l.text);
      expect(errors, p).toEqual([]);
      const mod = p.startsWith('academy:') ? p.slice(8) : null;
      if (mod) {
        const faults = (ACADEMY_SCENARIOS[mod] ?? []).filter((i) => 'faultId' in i).length;
        expect(lab().faults.length, p).toBe(faults);
        expect(lab().config).toMatchObject({ mode: 'academy', damageModel: 'academy', forceHealthCheckAllowed: true });
      }
    }
    sim.reset({ preset: 'arcade', seed: 4242 });
    expect(lab().time).toMatchObject({ startHour: 8, nowMs: 8 * 3_600_000, timeScale: 5 });
    expect(lab().orca.healthCheck.log[0]!.lines[0]).toMatch(/^2026-10-05 08:00:00 {2}health-check run #1 — /);
  });

  it('academy:M07 sets up the Orca editing lesson (HRN typo, swapped Flex 2, blank Tap URL, cleared tether, offsets)', () => {
    sim.reset({ preset: 'academy:M07' });
    expect(robot('johnny-5').humanReadableName).toBe('JONNY-5');
    expect(robot('johnny-5').tapUrl).toBe('');
    expect(robot('optimus').mfdDeviceId).toBeNull();
    expect(robot('bumblebee').offsetYMm).toBe(1.5);
    expect(lab().rigs['johnny-5']!.deviceIds).toEqual(['dev-spare-flex2']);
    expect(device('dev-spare-flex2')).toMatchObject({ ip: '10.42.30.15', orcaDeviceName: '', rigId: 'johnny-5', supply: { kind: 'ac-strip', targetId: 'STRIP-B', socket: 1 } });
    sim.tick(50);
    expect(device('dev-spare-flex2').power).toBe('booting');
    expect(device('dev-johnny-5-flex1')).toMatchObject({ power: 'off', rigId: 'storage-shelf', ip: '' });
    // The player creates the Device row (serial binding, Sim §1.15) and relinks Robot Device.
    const id = sim.orca.saveDevice({ name: 'johnny-5-flex2', deviceType: 'FLEX_2', serial: 'SIM-F2-000015', ip: '10.42.30.15', label: 'Flex 2 (JOHNNY-5)' }, 'player');
    expect(id.ok).toBe(true);
    expect(device('dev-spare-flex2').orcaDeviceName).toBe('johnny-5-flex2');
    expect(lab().orca.devices[id.ok ? id.value : 0]!.simDeviceId).toBe('dev-spare-flex2');
  });

  it('academy:M16 stages R2-D2 on Review Order with the CFD showing TOTAL $10.83 and CFD_TOTAL deleted', () => {
    sim.reset({ preset: 'academy:M16' });
    expect(device('dev-r2-d2-duo').display.screen).toBe('review-order');
    expect(device('dev-r2-d2-duo').secondaryDisplay!.screen).toBe('customer-cart');
    expect(Object.values(lab().orca.screenCompareImages).some((c) => c.name === 'CFD_TOTAL')).toBe(false);
  });
});

describe('determinism (Sim §6.4, §6.6)', () => {
  const script = () => {
    fresh('test', 1234);
    sim.faults.inject({ faultId: 'fuse.blown', params: { fuse: '@random' } });
    sim.faults.applySetup({ op: 'device.stage', params: { device: 'dev-wall-e-flex3', stage: 'payment-prompt' } });
    sim.orca.card('wall-e', 'SWIPE', 'VISA_STD_SWIPE', 'player');
    sim.jenkins.build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' }, 'player');
    run(30_000);
    sim.skipToNextHealthCheck();
    run(15_000);
    return sim.snapshot();
  };

  it('same seed + same actions ⇒ identical snapshots and identical event streams', () => {
    let evA: unknown[] = [];
    let a: unknown;
    evA = collect('device.screenChanged', () => {
      a = script();
    });
    let b: unknown;
    const evB = collect('device.screenChanged', () => {
      b = script();
    });
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(evB).toEqual(evA);
  });

  it('restore(snapshot()) then the same inputs reproduce the same state', () => {
    fresh('test', 99);
    run(5_000);
    const snap = sim.snapshot();
    run(20_000);
    sim.faults.inject({ faultId: 'pi.hung', params: { host: 'pi-wall-e' } });
    run(1_000);
    const first = JSON.stringify(sim.snapshot());
    sim.restore(snap);
    run(20_000);
    sim.faults.inject({ faultId: 'pi.hung', params: { host: 'pi-wall-e' } });
    run(1_000);
    expect(JSON.stringify(sim.snapshot())).toBe(first);
  });
});

describe('performance (Sim §6.2)', () => {
  it('a 50 ms tick of the full 42-rig lab averages under 2 ms in node', () => {
    fresh();
    for (let i = 0; i < 200; i++) sim.tick(50); // warm-up (JIT)
    // CPU time of this worker (process.cpuUsage) — wall time is unreliable while other suites run in parallel.
    const cpuMs = () => {
      const u = process.cpuUsage();
      return (u.user + u.system) / 1000;
    };
    const samples: number[] = [];
    for (let rep = 0; rep < 5; rep++) {
      const t0 = cpuMs();
      for (let i = 0; i < 400; i++) sim.tick(50);
      samples.push((cpuMs() - t0) / 400);
    }
    samples.sort((x, y) => x - y);
    const median = samples[2]!;
    // eslint-disable-next-line no-console
    console.log(`tick avg CPU (median of 5 × 400): ${median.toFixed(3)} ms; all: ${samples.map((s) => s.toFixed(3)).join(', ')}`);
    expect(median).toBeLessThan(2);
  });
});

describe('end-to-end: Jenkins ↔ Orca ↔ rigs (Sim §3.18, §3.19.4)', () => {
  it('Java/uia-remote-tethered-tax on MEGATRON checks out the rig, drives MFD + CFD and finishes SUCCESS', () => {
    fresh();
    const screens = new Set<string>();
    const r = sim.jenkins.build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' }, 'player');
    expect(r.ok).toBe(true);
    const id = r.ok ? r.value.buildId : '';
    const ev = collect('device.screenChanged', () => {
      expect(runUntil(() => lab().jenkins.builds[id]?.state === 'finished', 150_000)).toBeGreaterThan(0);
    });
    for (const e of ev) screens.add(`${e.deviceId}:${e.to}`);
    const b = lab().jenkins.builds[id]!;
    expect(b.result).toBe('SUCCESS');
    expect(b.console).toContain('Checked out robot megatron (named)');
    expect(b.console).toContain('[CFD_O1] total $10.83 ✓');
    expect(b.console).toContain('[orca] released megatron → Available');
    expect(b.console.at(-1)).toBe('Finished: SUCCESS');
    for (const s of ['dev-megatron-mfd:register', 'dev-megatron-mfd:review-order', 'dev-megatron-cfd:customer-cart', 'dev-megatron-cfd:payment-prompt', 'dev-megatron-cfd:approved', 'dev-megatron-cfd:thank-you']) expect(screens.has(s), s).toBe(true);
    expect(robot('megatron').checkout).toBeNull();
    expect(lab().rigs['megatron']!.dashboardLocked).toBe(false);
  });

  it('the same build fails while the USB Pay Display cable is unseated: the CFD keeps waiting for the merchant (INC47-A)', () => {
    fresh();
    sim.faults.inject({ faultId: 'tether.linkDown', params: { robot: 'megatron' } });
    const r = sim.jenkins.build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' }, 'player');
    const id = r.ok ? r.value.buildId : '';
    runUntil(() => lab().jenkins.builds[id]?.state === 'finished', 200_000);
    const b = lab().jenkins.builds[id]!;
    expect(b.result).toBe('FAILURE');
    expect(device('dev-megatron-cfd').display.screen).toBe('waiting-for-merchant');
    expect(device('dev-megatron-mfd').payDisplayLink).toBe('DOWN');
    // Re-seating the cable recovers the link within 2 s and the next run passes (Sim §3.8.6).
    sim.device.reseatHub('dev-megatron-mfd', 'usb', 'player');
    run(2_000);
    expect(device('dev-megatron-cfd').display.screen).toBe('customer-idle');
    const r2 = sim.jenkins.build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' }, 'player');
    const id2 = r2.ok ? r2.value.buildId : '';
    runUntil(() => lab().jenkins.builds[id2]?.state === 'finished', 150_000);
    expect(lab().jenkins.builds[id2]!.result).toBe('SUCCESS');
  });
});
