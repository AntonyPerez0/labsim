/** Touch-robot rigs (Sim §3.7) and the power network (Sim §3.13). */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { collect, device, fresh, host, lab, rig, run, runUntil, sim } from './testkit';

vi.setConfig({ testTimeout: 60_000 });

describe('rigs: lock, Park All, banner (Sim §3.7)', () => {
  beforeEach(() => fresh());

  it('a ≥ 20 mm hand push breaks the lock (yellow); Park All homes to the limit switches and turns the banner green', () => {
    expect(rig('wall-e').banner).toBe('green');
    expect(sim.rig.dragCarriage('wall-e', 15, 0, 'player')).toEqual({ ok: false, error: 'Open the enclosure door first' });
    sim.rig.setDoor('wall-e', true, 'player');
    expect(sim.rig.dragCarriage('wall-e', 12, 0, 'player')).toEqual({ ok: true, value: { lockBroken: false, accumMm: 12 } });
    expect(rig('wall-e').magneticLock.engaged).toBe(true);
    expect(sim.rig.dragCarriage('wall-e', 10, 5, 'player')).toMatchObject({ ok: true, value: { lockBroken: true } });
    sim.tick(50);
    expect(rig('wall-e')).toMatchObject({ banner: 'yellow', bannerText: 'Status: LOCK RELEASED — PARK REQUIRED' });
    expect(rig('wall-e').tablet.statusText).toBe('Status: LOCK RELEASED — PARK REQUIRED');
    // Park XY homes but does not re-engage the lock (Cur S13).
    sim.rig.command('wall-e', 'park.xy', 'player');
    run(2_000);
    expect(rig('wall-e').gantry).toMatchObject({ xMm: 0, yMm: 0, homed: true });
    expect(rig('wall-e').banner).toBe('yellow');
    const parked = collect('rig.parkCompleted', () => {
      sim.rig.command('wall-e', 'park.all', 'player');
      run(2_000);
    });
    expect(parked).toEqual([{ rigId: 'wall-e', axes: 'all', homed: true, lockEngaged: true }]);
    expect(rig('wall-e')).toMatchObject({ banner: 'green', bannerText: 'Status: OK', magneticLock: { engaged: true, brokenAtMs: null } });
  });

  it('rig.lockReleased clears only through Park All; Park duration = max(x,y)/60 mm/s + 0.3 s', () => {
    const f = sim.faults.inject({ faultId: 'rig.lockReleased', params: { rig: 'eve' } });
    expect(f.ok).toBe(true);
    const id = f.ok ? f.value.instanceId : '';
    expect(rig('eve').gantry).toMatchObject({ xMm: 25, yMm: 8, homed: false });
    expect(sim.faults.isResolved(id)).toBe(false);
    sim.rig.command('eve', 'park.all', 'player');
    run(25 / 60 * 1000 + 250);
    expect(rig('eve').gantry.homed).toBe(false); // still homing
    run(100);
    expect(rig('eve').gantry).toMatchObject({ xMm: 0, yMm: 0, homed: true, limitXHit: true, limitYHit: true });
    expect(sim.faults.isResolved(id)).toBe(true);
    sim.tick(50);
    expect(lab().faults[0]).toMatchObject({ cleared: true, clearedBy: 'condition' });
  });

  it('steppers disabled: green while disabled, yellow when re-enabled, motion buttons toast "Steppers disabled"', () => {
    sim.rig.command('bumblebee', 'steppers.disable', 'player');
    sim.tick(50);
    expect(rig('bumblebee').banner).toBe('green');
    expect(sim.rig.command('bumblebee', 'park.all', 'player')).toEqual({ ok: false, error: 'Steppers disabled' });
    expect(sim.orca.xyTouch('bumblebee', 'HOME', 'Register', 'player')).toEqual({ ok: false, error: '503 Service Unavailable: STEPPERS_DISABLED' });
    sim.rig.command('bumblebee', 'steppers.enable', 'player');
    sim.tick(50);
    expect(rig('bumblebee').banner).toBe('yellow');
    sim.rig.command('bumblebee', 'park.all', 'player');
    run(1_000);
    expect(rig('bumblebee').banner).toBe('green');
  });

  it('MOTOR off: taps fail MOTOR_POWER_LOST, banner stays green until MOTOR returns, then yellow', () => {
    sim.rig.setSwitch('seti', 'motor', false, 'player');
    sim.tick(50);
    expect(lab().power.terminals['MOTOR-seti']!.energised).toBe(false);
    expect(rig('seti').banner).toBe('green');
    expect(sim.orca.xyTouch('seti', 'HOME', 'Register', 'player')).toEqual({ ok: false, error: '503 Service Unavailable: MOTOR_POWER_LOST' });
    sim.rig.setSwitch('seti', 'motor', true, 'player');
    sim.tick(50);
    expect(rig('seti').banner).toBe('yellow');
  });

  it('broken limit switch: Park All stalls at −10 mm and the banner turns red; reseat + Park All recovers', () => {
    sim.faults.inject({ faultId: 'rig.limitSwitchBroken', params: { rig: 'baymax', axis: 'x' } });
    sim.rig.command('baymax', 'park.all', 'player');
    run(6_000);
    expect(rig('baymax')).toMatchObject({ banner: 'red', bannerText: 'Status: MOTION FAULT — HOMING FAILED (X limit not found)', motionFault: 'HOMING FAILED (X limit not found)' });
    expect(rig('baymax').gantry.xMm).toBe(-10);
    expect(sim.orca.xyTouch('baymax', 'HOME', 'Register', 'player')).toEqual({ ok: false, error: '409 Conflict: MOTION_FAULT (HOMING FAILED (X limit not found))' });
    sim.rig.reseat('baymax', 'limitSwitchX', 'player');
    sim.rig.command('baymax', 'park.all', 'player');
    run(2_000);
    expect(rig('baymax').banner).toBe('green');
    expect(lab().faults[0]!.cleared).toBe(true);
  });

  it('MAIN off: the Pi loses power and the tablet goes grey (CONTROLLER UNREACHABLE)', () => {
    sim.rig.setSwitch('johnny-5', 'main', false, 'player');
    sim.tick(100);
    expect(host('pi-johnny-5').os).toBe('OFF');
    expect(rig('johnny-5')).toMatchObject({ banner: 'grey', bannerText: 'Status: CONTROLLER UNREACHABLE' });
    expect(rig('johnny-5').magneticLock.engaged).toBe(false); // controller restarts with the lock released
  });

  it('gantry moves at 120 mm/s on both axes simultaneously (time = max of the two)', () => {
    sim.rig.command('wall-e', 'move.to', 'player', { xMm: 60, yMm: 30 });
    run(450);
    expect(rig('wall-e').gantry.moving).toBe(true);
    run(100);
    expect(rig('wall-e').gantry).toMatchObject({ xMm: 60, yMm: 30, moving: false });
  });
});

describe('power (Sim §3.13)', () => {
  beforeEach(() => fresh());

  it('a blown fuse darkens its branch; a correct replacement restores the Pis after their 40 s boot', () => {
    sim.faults.inject({ faultId: 'fuse.blown', params: { fuse: 'F-RACKA-5V' } });
    sim.tick(50);
    for (const p of ['pi-wall-e', 'pi-eve', 'pi-bumblebee', 'pi-r2-d2']) expect(host(p).os).toBe('OFF');
    expect(host('pi-johnny-5').os).toBe('RUNNING');
    expect(sim.power.measure('MW-1.out').display).toBe('24.1 V DC');
    expect(sim.power.measure('REG-5V-A.out').display).toBe('5.08 V DC');
    expect(sim.power.measure('F-RACKA-5V.load').display).toBe('0.00 V DC');
    expect(sim.power.measure('F-RACKA-5V', 'OHM').display).toBe('ERR'); // live branch (GW21)
    expect(sim.power.removeFuse('F-RACKA-5V', 'player').ok).toBe(true);
    expect(sim.power.measure('F-RACKA-5V', 'OHM').display).toBe('OL');
    const sparks = collect('power.spark', () => expect(sim.power.insertFuse('F-RACKA-5V', 10, 'player').ok).toBe(true));
    expect(sparks.length).toBe(1); // inserted live
    expect(lab().power.spareFuses['10']).toBe(3);
    sim.tick(50);
    expect(host('pi-wall-e').os).toBe('BOOTING');
    run(39_000);
    expect(host('pi-wall-e').os).toBe('BOOTING');
    run(1_100);
    expect(host('pi-wall-e').os).toBe('RUNNING');
    expect(host('pi-wall-e').services['robot-controller']!.running).toBe(true);
  });

  it('an under-rated 5 A fuse in Rack B blows within ≈ 6 s under load (GP SR10)', () => {
    sim.faults.inject({ faultId: 'fuse.underRated', params: { fuse: 'F-RACKB-5V', ratingA: 5 } });
    const t = runUntil(() => lab().power.fuses['F-RACKB-5V']!.blown, 20_000);
    expect(t).toBeGreaterThan(5_000);
    expect(t).toBeLessThan(8_000);
  });

  it('an 18 V device brick on a DC rail fries the device (full damage model) and a 24 V short browns out the Pis', () => {
    expect(sim.power.unplug('psu-eve-flex4', 'player').ok).toBe(true);
    const fried = collect('device.fried', () => {
      expect(sim.power.plug('psu-eve-flex4', { kind: 'dc-rail', targetId: 'T-24V-SPARE' }, 'player').ok).toBe(true);
      sim.tick(50);
    });
    expect(fried).toEqual([{ deviceId: 'dev-eve-flex4', cause: 'Flex 4 power brick (EVE) on 24 V DC (T-24V-SPARE)' }]);
    expect(device('dev-eve-flex4')).toMatchObject({ power: 'fried', state: 'FRIED' });
    expect(lab().power.psus['MW-1']!.hiccupUntilPhysMs).not.toBeNull();
    sim.tick(100);
    expect(host('pi-wall-e').os).toBe('OFF'); // full model: every regulator drops for 2 s
    run(2_500);
    expect(host('pi-wall-e').os).toBe('BOOTING');
    // Fried is forever: back on AC it stays dark.
    sim.power.plug('psu-eve-flex4', { kind: 'ac-strip', targetId: 'STRIP-A', socket: 6 }, 'player');
    run(31_000);
    expect(device('dev-eve-flex4').power).toBe('fried');
  });

  it('on a 5 V terminal the short blows the branch fuse; a Collis PSU there fries the probe', () => {
    sim.power.unplug('psu-collis-wall-e', 'player');
    sim.power.plug('psu-collis-wall-e', { kind: 'dc-rail', targetId: 'T-5V-SPARE' }, 'player');
    sim.tick(100);
    expect(lab().collis['collis-wall-e']!.state).toBe('FRIED');
    expect(lab().power.fuses['F-BENCH-5V']!.blown).toBe(true);
    expect(host('pi-tethered').os).toBe('OFF');
  });

  it('academy damage model: a spark and the lead pops out, nothing changes', () => {
    sim.reset({ preset: 'academy:M03' });
    sim.power.unplug('psu-flex4-new', 'player');
    const r = sim.power.plug('psu-flex4-new', { kind: 'dc-rail', targetId: 'T-24V-SPARE' }, 'player');
    expect(r.ok).toBe(false);
    expect(lab().power.loads['psu-flex4-new']!.supply.kind).toBe('none');
    expect(lab().power.sparks.length).toBe(1);
  });
});
