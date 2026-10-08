/**
 * The sim as a whole (review task 5): boot the factory lab from `createInitialLabState`, run a Jenkins job
 * for every runner type, force a health check, inject five faults from different systems, watch the
 * symptoms appear, fix every one through the SimApi the way a player would, and check that the lab is back
 * to its factory "all green" signature. Also checks that no API result leaks an immer draft.
 */
import { describe, expect, it, vi } from 'vitest';
import { createInitialLabState } from '../initialState';
import { DEFAULT_SEED } from '../types';
import type { LabState } from '../types';
import { build, healthNow, lab, nextHealthCheck, resolved, robot, run, runUntil, scenario, sh, sim } from './kit';
import { resetTerminalSessions } from '../terminal';

vi.setConfig({ testTimeout: 600_000 });

/** What "all green" means: every observable health fact of the lab. */
function signature(l: LabState): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of Object.values(l.orca.robots)) out[`robot:${r.name}`] = r.status;
  for (const g of Object.values(l.rigs)) out[`banner:${g.id}`] = g.banner;
  for (const h of Object.values(l.hosts)) out[`host:${h.id}`] = h.os;
  for (const f of Object.values(l.power.fuses)) out[`fuse:${f.id}`] = f.blown ? 'BLOWN' : 'OK';
  for (const d of Object.values(l.devices)) out[`device:${d.id}`] = d.power;
  return out;
}

describe('end to end: factory → every runner → health check → five faults → fixes → all green', () => {
  it('returns to the factory signature after the documented fixes', () => {
    // Boot exactly what the store boots.
    const factory = createInitialLabState(DEFAULT_SEED, 'factory');
    expect(sim.load(factory).ok).toBe(true);
    sim.setConfig({ mode: 'test', npcAutoMerge: false });
    resetTerminalSessions();
    const green = signature(lab());
    expect(lab().faults.filter((f) => !f.cleared)).toEqual([]);
    expect(green['robot:rosie']).toBe('UNAVAILABLE');
    expect(green['robot:wall-e']).toBe('AVAILABLE');
    for (const r of ['wall-e', 'eve', 'bumblebee', 'r2-d2', 'johnny-5', 'baymax', 'seti']) expect(green[`banner:${r}`]).toBe('green');

    // 1. One job per runner type, all green at factory.
    const jobs: [string, Record<string, string>, string][] = [
      ['Java/uia-remote-regression-flex', { ROBOT_NAME: 'wall-e' }, 'uia-remote (standalone, physical taps)'],
      ['Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' }, 'uia-remote (tethered MFD/CFD)'],
      ['Java/uia-remote-duo-cfd', {}, 'uia-remote (Duo, OCR + UIA 2.3)'],
      ['Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'bumblebee' }, 'pigeon (Android LSTR)'],
      ['Java/pigeon-windows-tender', {}, 'pigeon (Windows LSTR)'],
      ['Java/go-sdk-sale-smoke', {}, 'go-sdk'],
      ['Java/laz-oobe-merchant-swap', { ROBOT_NAME: 'data', MERCHANT: 'AUTO-US-NOPIN-02' }, 'laz'],
      ['Java/vision-poc-receipt-check', {}, 'vision (Ollama)'],
      ['iOS/pigeon-ios-go-sdk-smoke', {}, 'ios'],
    ];
    for (const [job, params, what] of jobs) {
      const b = build(job, params);
      expect(b.result, `${what}: ${b.console.slice(-8).join(' / ')}`).toBe('SUCCESS');
      expect(b.console.at(-1)).toBe('Finished: SUCCESS');
    }
    // Swap DATA back so the merchant matches the factory again.
    expect(build('Java/laz-oobe-merchant-swap', { ROBOT_NAME: 'data', MERCHANT: 'AUTO-US-NOPIN-01' }).result).toBe('SUCCESS');

    // 2. A forced health check: every pinged rig answers as it did at factory.
    const block = healthNow();
    expect(block.filter((l) => / FAIL /.test(l)).map((l) => l.split(' ')[0])).toEqual(['sonny']);
    expect(signature(lab())).toEqual(green);

    // 3. Five faults from five systems.
    const ids = scenario(
      { faultId: 'pi.hung', params: { host: 'pi-eve' } },
      { faultId: 'fuse.blown', params: { fuse: 'F-RACKB-5V' } },
      { faultId: 'rig.lockReleased', params: { rig: 'bumblebee' } },
      { faultId: 'card.trackDataCorrupt', params: { profile: 'VISA_STD_SWIPE' } },
      { faultId: 'jenkins.envCase', params: { job: 'Java/uia-remote-regression-flex', value: 'flex_3' } },
    );
    expect(ids).toHaveLength(5);
    run(1_000);
    nextHealthCheck();
    for (const r of ['eve', 'johnny-5', 'baymax', 'seti', 'rosie']) expect(robot(r).status, r).toBe('CONNECTION_FAILED');
    expect(lab().rigs['bumblebee']!.banner).toBe('yellow');
    expect(build('Java/uia-remote-regression-flex').failureCode).toBe('ENUM_CASE');
    const swipe = build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'wall-e' });
    expect(swipe.console).toContain('LSTR step 4/9 "card swipe" … [device] SWIPE_ERROR: invalid track data');
    expect(build('Java/uia-remote-regression-mini', { ROBOT_NAME: 'bumblebee' }).console).toContain('[orca] xy_touch bumblebee HOME/Register → 409 Conflict: LOCK_RELEASED (park required)');
    expect(ids.map((id) => sim.faults.isResolved(id))).toEqual([false, false, false, false, false]);

    // 4. Fix each through the SimApi, as a player would.
    sim.rig.setSwitch('eve', 'main', false, 'player'); // power-cycle the hung Pi
    run(2_000);
    sim.rig.setSwitch('eve', 'main', true, 'player');
    sim.power.toggleRegulator('REG-5V-B', false, 'player'); // PB07, then a red 10 A fuse
    sim.power.removeFuse('F-RACKB-5V', 'player');
    sim.power.insertFuse('F-RACKB-5V', 10, 'player');
    sim.power.toggleRegulator('REG-5V-B', true, 'player');
    sim.rig.command('bumblebee', 'park.all', 'player');
    const swipeProfile = Object.values(lab().orca.cardProfiles).find((c) => c.name === 'VISA_STD_SWIPE')!;
    sim.orca.saveCardProfile({ id: swipeProfile.id, trackData: '%B4111111111111111^SIM/VISA^30121010000000000000?;4111111111111111=3012101000000000?' }, 'player');
    const job = sim.jenkins.job('Java/uia-remote-regression-flex')!;
    sim.jenkins.saveJob(job.id, { savedParams: { ...job.savedParams, DEVICE_TYPE: 'FLEX_3' } }, 'player');
    expect(runUntil(() => ['pi-eve', 'pi-johnny-5', 'pi-baymax', 'pi-seti', 'pi-rosie', 'pi-cam-rackb'].every((h) => lab().hosts[h]!.os === 'RUNNING'), 90_000)).toBeGreaterThan(0);
    run(21_000); // the fuse predicate holds 20 s
    for (const id of ids) expect(resolved([id]), id).toBe(true);
    run(1_000);
    expect(lab().faults.filter((f) => !f.cleared)).toEqual([]);

    // 5. Recovery happens at the next scheduled check (never by hand); then everything is green again.
    nextHealthCheck();
    expect(robot('rosie').status).toBe('UNAVAILABLE'); // restored to its pre-failure status
    for (const d of ['dev-wall-e-flex3', 'dev-bumblebee-mini3', 'dev-eve-flex4']) sim.device.pressKey(d, 'HOME', 'player');
    run(2_000);
    expect(signature(lab())).toEqual(green);
    expect(build('Java/uia-remote-regression-flex').result).toBe('SUCCESS');
    expect(build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'wall-e' }).result).toBe('SUCCESS');
    expect(build('Java/uia-remote-regression-mini', { ROBOT_NAME: 'bumblebee' }).result).toBe('SUCCESS');
    expect(signature(lab())).toEqual(green);
  });
});

describe('API results never leak immer drafts', () => {
  it('every object an API call returns stays readable after its transaction', () => {
    sim.reset({ preset: 'test' });
    resetTerminalSessions();
    const results: unknown[] = [
      sim.orca.checkout({ buildId: 'manual-1', jobId: 'manual', robotName: 'tars', environment: 'DEV1', kind: 'manual' }),
      sim.orca.release(robot('tars').id, 'manual-1'),
      sim.orca.matchPreview('{"deviceType":"FLEX_3"}'),
      sim.orca.capabilityDocument(robot('wall-e').id),
      sim.orca.xyTouch('tars', 'HOME', 'Register', 'player'),
      sim.orca.card('wall-e', 'DIP', 'VISA_STD_DIP', 'player'),
      sim.orca.rest('GET', '/api/robots', null, 'player'),
      sim.rig.dragCarriage('wall-e', 25, 0, 'player'),
      sim.device.layout('dev-wall-e-flex3', 'primary'),
      sim.device.swapHardware('johnny-5', 'FLEX_2', 'player', { deviceId: 'dev-spare-flex2' }),
      sim.power.measure('MW-1.out'),
      sim.camera.probe('http://10.42.10.11:8081/stream.mjpg'),
      sim.ocr.compare(1),
      sim.faults.catalogue(),
      sim.faults.setupCatalogue(),
      sim.faults.inject({ faultId: 'pi.hung', params: { host: 'pi-wall-e' } }),
      sim.jenkins.build('Java/uia-remote-regression-flex', {}, 'player'),
      sim.jenkins.recentBuilds('Java/uia-remote-regression-flex', 5),
      sim.terminal.exec('adb devices'),
      sim.git.clone('uia-remote', 'player'),
      sim.ollama.ask('llava', 'hi', null, 'player'),
    ];
    run(2_000);
    for (const r of results) expect(() => JSON.stringify(r)).not.toThrow();
    expect(sh('git -C ~/IdeaProjects/uia-remote status').length).toBeGreaterThan(0);
  });
});
