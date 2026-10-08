/**
 * The fault catalogue (Sim §4.3): every core row injects, is not resolved right after injection, and
 * becomes resolved after its documented fix performed through the public API (the same thing a player
 * does); API-only rows resolve through `faults.clear`. Also the engine semantics (Sim §4.1).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { device, fresh, host, lab, robot, run, runUntil, sim } from './testkit';
import { transact } from '@/core/store';
import type { FaultSpec } from '../api';
import { DEBUG_LOG } from './hosts';
import { firmwareTruth } from './faults/defsData';
import { adbShell } from './adb';

vi.setConfig({ testTimeout: 120_000 });

interface Case {
  spec: FaultSpec;
  /** The documented fix (player actions through the SimApi). Omitted = API only. */
  fix?: () => void;
  /** Physical ms to let systems run after the fix. */
  waitMs?: number;
}

const ok = (r: { ok: boolean; error?: string }) => expect(r, (r as { error?: string }).error).toMatchObject({ ok: true });
const replaceYaml = (h: string, from: RegExp, to: string) => ok(sim.host.writeFile(h, '/etc/robot-controller/controller.yaml', host(h).files['/etc/robot-controller/controller.yaml']!.replace(from, to), 'player'));
const park = (r: string) => ok(sim.rig.command(r, 'park.all', 'player'));

const CASES: Record<string, Case> = {
  'pi.hung': { spec: { faultId: 'pi.hung', params: { host: 'pi-wall-e' } }, fix: () => ok(sim.host.powerCycle('pi-wall-e', 'player')), waitMs: 50_000 },
  'pi.off': { spec: { faultId: 'pi.off', params: { host: 'pi-eve' } }, fix: () => ok(sim.power.plug('pi-eve', { kind: 'dc-rail', targetId: 'MAIN-eve' }, 'player')), waitMs: 45_000 },
  'pi.serviceDown': { spec: { faultId: 'pi.serviceDown', params: { host: 'pi-wall-e', service: 'robot-controller' } }, fix: () => ok(sim.host.restartService('pi-wall-e', 'robot-controller', 'player')), waitMs: 4_000 },
  'camera.sharedHostDown': { spec: { faultId: 'camera.sharedHostDown' }, fix: () => ok(sim.host.restartService('pi-cam-rackb', 'camera-stream', 'player')), waitMs: 3_000 },
  'camera.usbUnplugged': {
    spec: { faultId: 'camera.usbUnplugged', params: { host: 'pi-wall-e' } },
    fix: () => {
      ok(sim.host.plugUsb('pi-wall-e', 'webcam', true, 'player'));
      ok(sim.host.restartService('pi-wall-e', 'camera-stream', 'player'));
    },
    waitMs: 3_000,
  },
  'pi.diskFull': { spec: { faultId: 'pi.diskFull', params: { host: 'pi-bumblebee' } }, fix: () => ok(sim.host.deletePath('pi-bumblebee', DEBUG_LOG, 'player')) },
  'pi.wineBroken': {
    spec: { faultId: 'pi.wineBroken', params: { host: 'pi-seti' } },
    fix: () => {
      ok(sim.host.deletePath('pi-seti', '/home/pi/.wine-cardprog/', 'player'));
      ok(sim.host.writeFile('pi-seti', '/home/pi/.wine-cardprog/', 'ok', 'player')); // cp -a wineprefix-golden
      ok(sim.host.restartService('pi-seti', 'cardprog', 'player'));
    },
    waitMs: 5_000,
  },
  'eth.unplugged': { spec: { faultId: 'eth.unplugged', params: { host: 'pi-johnny-5' } }, fix: () => ok(sim.host.setEthernet('pi-johnny-5', true, 'player')) },
  'eth.damaged': { spec: { faultId: 'eth.damaged', params: { host: 'pi-baymax' } }, fix: () => ok(sim.host.replaceEthernet('pi-baymax', 'player')) },
  'callus.down': { spec: { faultId: 'callus.down', params: { host: 'minix-01', mode: 'box-off' } }, fix: () => ok(sim.host.pressPowerButton('minix-01', false, 'player')), waitMs: 55_000 },
  'nuc.diskFull': { spec: { faultId: 'nuc.diskFull', params: { host: 'minix-03' } } },
  'vm.serviceDown': { spec: { faultId: 'vm.serviceDown', params: { host: 'jenkins-vm', service: 'jenkins' } }, fix: () => ok(sim.host.startService('jenkins-vm', 'jenkins', 'player')), waitMs: 31_000 },
  'orca.mysqlDown': { spec: { faultId: 'orca.mysqlDown' }, fix: () => ok(sim.host.startService('orca-vm', 'mysql', 'player')), waitMs: 21_000 },
  'orca.appDown': { spec: { faultId: 'orca.appDown' }, fix: () => ok(sim.host.startService('orca-vm', 'orca', 'player')), waitMs: 21_000 },
  'jenkins.down': { spec: { faultId: 'jenkins.down' }, fix: () => ok(sim.host.startService('jenkins-vm', 'jenkins', 'player')), waitMs: 31_000 },
  'ollama.down': { spec: { faultId: 'ollama.down' }, fix: () => ok(sim.host.startService('ollama-vm', 'ollama', 'player')), waitMs: 11_000 },
  'net.switchDown': { spec: { faultId: 'net.switchDown' } },
  'fuse.blown': { spec: { faultId: 'fuse.blown', params: { fuse: 'F-RACKB-5V' } }, fix: () => ok(sim.power.replaceFuse('F-RACKB-5V', 'player')), waitMs: 21_000 },
  'fuse.underRated': {
    spec: { faultId: 'fuse.underRated', params: { fuse: 'F-RACKB-5V', ratingA: 5 } },
    fix: () => {
      ok(sim.power.removeFuse('F-RACKB-5V', 'player'));
      ok(sim.power.insertFuse('F-RACKB-5V', 10, 'player'));
    },
    waitMs: 21_000,
  },
  'power.regulatorOff': { spec: { faultId: 'power.regulatorOff', params: { regulator: 'REG-12V' } }, fix: () => ok(sim.power.toggleRegulator('REG-12V', true, 'player')) },
  // The fix (moving the strip to a live outlet) is not a player action in the sim — API clear.
  'power.outletDead': { spec: { faultId: 'power.outletDead', params: { outlet: 'WALL-6' } } },
  'rig.lockReleased': { spec: { faultId: 'rig.lockReleased', params: { rig: 'wall-e' } }, fix: () => park('wall-e'), waitMs: 2_000 },
  'rig.steppersDisabled': {
    spec: { faultId: 'rig.steppersDisabled', params: { rig: 'eve' } },
    fix: () => {
      ok(sim.rig.command('eve', 'steppers.enable', 'player'));
      park('eve');
    },
    waitMs: 2_000,
  },
  'rig.motorOff': {
    spec: { faultId: 'rig.motorOff', params: { rig: 'bumblebee' } },
    fix: () => {
      ok(sim.rig.setSwitch('bumblebee', 'motor', true, 'player'));
      sim.tick(50);
      park('bumblebee');
    },
    waitMs: 2_000,
  },
  'rig.mainOff': { spec: { faultId: 'rig.mainOff', params: { rig: 'r2-d2' } }, fix: () => ok(sim.rig.setSwitch('r2-d2', 'main', true, 'player')), waitMs: 45_000 },
  'rig.solenoidLoose': {
    spec: { faultId: 'rig.solenoidLoose', params: { rig: 'johnny-5' } },
    fix: () => {
      ok(sim.rig.setDoor('johnny-5', true, 'player'));
      ok(sim.rig.reseat('johnny-5', 'solenoidConnector', 'player'));
      ok(sim.rig.setDoor('johnny-5', false, 'player'));
    },
  },
  'rig.dipArmMisaligned': {
    spec: { faultId: 'rig.dipArmMisaligned', params: { rig: 'wall-e', teeth: 1 } },
    fix: () => {
      expect(sim.rig.alignDipArm('wall-e', -1, 'player')).toEqual({ ok: false, error: 'The arm is held by its stepper' });
      ok(sim.rig.command('wall-e', 'steppers.disable', 'player'));
      expect(sim.rig.alignDipArm('wall-e', -1, 'player')).toEqual({ ok: true, value: { toothOffset: 0 } });
    },
  },
  'rig.cradleCracked': {
    spec: { faultId: 'rig.cradleCracked', params: { rig: 'eve' } },
    fix: () => {
      expect(sim.rig.replaceCradle('eve', 'player')).toEqual({ ok: false, error: 'No printed cradle_flex_gen3 on the printer tray — print cradle_flex_gen3.3mf first' });
      ok(sim.printer3d.start('prusa', 'cradle_flex_gen3.3mf', 'player'));
      run(90_100);
      ok(sim.rig.replaceCradle('eve', 'player'));
    },
  },
  'rig.limitSwitchBroken': { spec: { faultId: 'rig.limitSwitchBroken', params: { rig: 'seti', axis: 'y' } }, fix: () => ok(sim.rig.reseat('seti', 'limitSwitchY', 'player')) },
  'rig.webcamMisaimed': { spec: { faultId: 'rig.webcamMisaimed', params: { rig: 'wall-e' } }, fix: () => expect(sim.rig.aimWebcam('wall-e', -5.5, -3.5, 'player')).toEqual({ ok: true, value: { aimedOk: true } }) },
  'rig.motionOnNuc': {
    spec: { faultId: 'rig.motionOnNuc', params: { rig: 'bumblebee' } },
    fix: () => {
      ok(sim.rig.moveMotorUsb('bumblebee', 'PI', 'player'));
      replaceYaml('pi-bumblebee', /^motion: nuc:\/\/.*$/m, 'motion: local');
      ok(sim.host.restartService('pi-bumblebee', 'robot-controller', 'player'));
    },
    waitMs: 4_000,
  },
  'rig.rebuild': { spec: { faultId: 'rig.rebuild', params: { rig: 'baymax' } } },
  'device.unpowered': { spec: { faultId: 'device.unpowered', params: { device: 'dev-eve-flex4' } }, fix: () => ok(sim.power.plug('psu-eve-flex4', { kind: 'ac-strip', targetId: 'STRIP-A', socket: 6 }, 'player')), waitMs: 31_000 },
  'device.dead': { spec: { faultId: 'device.dead', params: { device: 'dev-k-9-duo2' } }, fix: () => ok(sim.device.swapHardware('k-9', 'MINI_3', 'player', { deviceId: 'dev-spare-mini3' })) },
  'device.adbTcpReset': { spec: { faultId: 'device.adbTcpReset', params: { device: 'dev-data-mini3' } }, fix: () => transact((r, ctx) => adbShell(r.lab, ctx, 'SIM-M3-000031', ['tcpip', '5444'], 'terminal')), waitMs: 1_100 },
  'device.printerNoPaper': { spec: { faultId: 'device.printerNoPaper', params: { device: 'dev-wall-e-flex3' } }, fix: () => ok(sim.device.loadPaper('dev-wall-e-flex3', 'player')) },
  'laz.skipAdbRestore': {
    spec: { faultId: 'laz.skipAdbRestore' },
    fix: () => {
      ok(sim.laz.start('dev-data-mini3', 2, 'player'));
      run(60_000);
      transact((r, ctx) => adbShell(r.lab, ctx, 'SIM-M3-000031', ['tcpip', '5444'], 'terminal'));
    },
    waitMs: 1_100,
  },
  'receipt.qrRollout': { spec: { faultId: 'receipt.qrRollout', params: { deviceTypes: ['FLEX_4'], on: false } } },
  'tether.linkDown': { spec: { faultId: 'tether.linkDown', params: { robot: 'megatron', cable: 'usb' } }, fix: () => expect(sim.device.reseatHub('dev-megatron-mfd', 'usb', 'player')).toEqual({ ok: true, value: { seated: true } }), waitMs: 2_000 },
  'collis.unpowered': { spec: { faultId: 'collis.unpowered', params: { probe: 'collis-wall-e' } }, fix: () => ok(sim.power.plug('psu-collis-wall-e', { kind: 'ac-strip', targetId: 'STRIP-C', socket: 1 }, 'player')), waitMs: 100 },
  'collis.ribbonUnseated': { spec: { faultId: 'collis.ribbonUnseated', params: { probe: 'collis-eve' } }, fix: () => ok(sim.collis.reseatRibbon('collis-eve', 'player')), waitMs: 100 },
  'callus.syncStale': { spec: { faultId: 'callus.syncStale' }, fix: () => ok(sim.host.runSchedTask('minix-02', 'GortCardSync', 'player')), waitMs: 21_000 },
  'merchant.credentialBlank': { spec: { faultId: 'merchant.credentialBlank' }, fix: () => ok(sim.orca.saveMerchant({ id: 3, apiKey: 'key_sim_19c0e2' }, 'player')) },
  'merchant.ubiRouteWrong': { spec: { faultId: 'merchant.ubiRouteWrong' }, fix: () => ok(sim.orca.saveMerchant({ id: 7, ubiRoute: 'ca-central' }, 'player')) },
  'merchant.overwritten': { spec: { faultId: 'merchant.overwritten', params: { robot: 'rosie' } }, fix: () => ok(sim.laz.start('dev-rosie-pocket', 4, 'player')), waitMs: 60_000 },
  'ubi.routeDown': { spec: { faultId: 'ubi.routeDown', params: { route: 'ca-central' } } },
  'card.gortPathWrong': { spec: { faultId: 'card.gortPathWrong' }, fix: () => ok(sim.orca.saveCardProfile({ id: 2, gortPath: 'cards/emv/visa_std_dip.json' }, 'player')) },
  'card.trackDataCorrupt': { spec: { faultId: 'card.trackDataCorrupt' }, fix: () => ok(sim.orca.saveCardProfile({ id: 1, trackData: '%B4111111111111111^SIM/VISA^30121010000000000000?;4111111111111111=3012101000000000?' }, 'player')) },
  'orca.offsets': { spec: { faultId: 'orca.offsets', params: { robot: 'bumblebee' } }, fix: () => ok(sim.orca.saveRobot({ id: 3, offsetXMm: 0, offsetYMm: 0 }, 'player')) },
  'orca.hrnTypo': { spec: { faultId: 'orca.hrnTypo', params: { robot: 'johnny-5' } }, fix: () => ok(sim.orca.saveRobot({ id: 5, humanReadableName: 'JOHNNY-5' }, 'player')) },
  'orca.urlWrong': { spec: { faultId: 'orca.urlWrong', params: { robot: 'johnny-5' } }, fix: () => ok(sim.orca.saveRobot({ id: 5, tapUrl: 'http://10.42.10.15:8000/tap' }, 'player')) },
  'orca.tetherCleared': {
    spec: { faultId: 'orca.tetherCleared' },
    fix: () => {
      const rows = Object.values(lab().orca.devices);
      ok(sim.orca.saveRobot({ id: 10, mfdDeviceId: rows.find((d) => d.name === 'optimus-mfd')!.id, cfdDeviceId: rows.find((d) => d.name === 'optimus-cfd')!.id }, 'player'));
    },
  },
  'orca.tetherCloned': { spec: { faultId: 'orca.tetherCloned' }, fix: () => ok(sim.orca.saveRobot({ id: 12, mfdDeviceId: null, cfdDeviceId: null }, 'player')) },
  'orca.screenLocationShift': {
    spec: { faultId: 'orca.screenLocationShift', params: { deviceTypes: ['MINI_3'] } },
    fix: () => {
      const scr = Object.values(lab().orca.screens).find((s) => s.deviceType === 'MINI_3' && s.name === 'RECEIPT_OPTIONS_5')!;
      for (const l of Object.values(lab().orca.screenLocations).filter((x) => x.screenId === scr.id)) ok(sim.orca.saveScreenLocation({ id: l.id, yMm: l.yMm + 3 }, 'player'));
    },
  },
  'orca.screenLocationTypo': {
    spec: { faultId: 'orca.screenLocationTypo' },
    fix: () => {
      const scr = Object.values(lab().orca.screens).find((s) => s.deviceType === 'FLEX_1' && s.name === 'RECEIPT_OPTIONS_4')!;
      const l = Object.values(lab().orca.screenLocations).find((x) => x.screenId === scr.id && x.button === 'Print')!;
      ok(sim.orca.saveScreenLocation({ id: l.id, yMm: 66.5 }, 'player'));
    },
  },
  'orca.missingReceiptMap': {
    spec: { faultId: 'orca.missingReceiptMap', params: { deviceType: 'STATION_2018' } },
    fix: () => {
      const id = sim.orca.saveScreen({ name: 'RECEIPT_OPTIONS_5', deviceType: 'STATION_2018', description: 'Receipt options — 5 options' }, 'player');
      ok(id);
      for (const b of firmwareTruth('STATION_2018', 'RECEIPT_OPTIONS_5')!) ok(sim.orca.saveScreenLocation({ screenId: id.ok ? id.value : 0, button: b.button, xMm: b.x, yMm: b.y }, 'player'));
    },
  },
  'orca.statusOverride': { spec: { faultId: 'orca.statusOverride', params: { robot: 'rosie', status: 'AVAILABLE' } }, fix: () => ok(sim.orca.setRobotStatus(8, 'UNAVAILABLE', 'player')) },
  'orca.staleReservation': { spec: { faultId: 'orca.staleReservation' }, fix: () => ok(sim.orca.setRobotStatus(2, 'AVAILABLE', 'player')) },
  'ocr.labelShift': { spec: { faultId: 'ocr.labelShift' }, fix: () => ok(sim.orca.saveScreenCompareImage({ id: 1, bbox: { x: 412, y: 298, w: 236, h: 44 } }, 'player')) },
  'ocr.capitalisation': { spec: { faultId: 'ocr.capitalisation' }, fix: () => ok(sim.orca.saveScreenCompareImage({ id: 1, expectedText: 'Total $10.83' }, 'player')) },
  'ocr.typo': { spec: { faultId: 'ocr.typo' }, fix: () => ok(sim.orca.saveScreenCompareImage({ id: 1, expectedText: 'TOTAL $10.83' }, 'player')) },
};

describe('core fault catalogue (Sim §4.3.1–§4.3.7)', () => {
  beforeEach(() => fresh());

  it('covers every core row', () => {
    const core = sim.faults.catalogue().filter((f) => f.owner === 'core').map((f) => f.id);
    expect(core.length).toBe(61);
    expect(core.filter((id) => !CASES[id])).toEqual([]);
    expect(sim.faults.catalogue().length).toBe(77);
  });

  for (const [id, c] of Object.entries(CASES)) {
    it(`${id}: injects, then ${c.fix ? 'the documented fix resolves it' : 'API clear resolves it'}`, () => {
      const r = sim.faults.inject(c.spec);
      expect(r, (r as { error?: string }).error).toMatchObject({ ok: true });
      const fid = r.ok ? r.value.instanceId : '';
      sim.tick(100);
      expect(sim.faults.isResolved(fid)).toBe(false);
      expect(lab().faults.find((f) => f.id === fid)!.cleared).toBe(false);
      if (c.fix) {
        c.fix();
        run(c.waitMs ?? 100);
        expect(sim.faults.isResolved(fid)).toBe(true);
      } else {
        expect(sim.faults.catalogue().find((f) => f.id === id)!.apiOnly || id === 'power.outletDead').toBe(true);
        expect(sim.faults.clear(fid, 'mission')).toEqual({ ok: true, value: undefined });
        expect(sim.faults.isResolved(fid)).toBe(true);
        expect(lab().faults.find((f) => f.id === fid)).toMatchObject({ cleared: true, clearedBy: 'api', clearedByActor: 'mission' });
      }
    });
  }
});

describe('fault engine semantics (Sim §4.1)', () => {
  beforeEach(() => fresh());

  it('validates params, refuses duplicates and healthy-state preconditions, and changes nothing on rejection', () => {
    expect(sim.faults.inject({ faultId: 'pi.hung' })).toEqual({ ok: false, error: "fault pi.hung: invalid param host='' (missing)" });
    expect(sim.faults.inject({ faultId: 'pi.hung', params: { host: 'pi-nope' } })).toEqual({ ok: false, error: "fault pi.hung: invalid param host='pi-nope' (no such pi)" });
    expect(sim.faults.inject({ faultId: 'fuse.underRated', params: { fuse: 'F-RACKA-5V', ratingA: 7 } })).toEqual({ ok: false, error: "fault fuse.underRated: invalid param ratingA='7' (not one of 5, 10, 15, 20)" });
    expect(sim.faults.inject({ faultId: 'fuse.blown', params: { fuse: 'F-RACKB-5V' } }).ok).toBe(true);
    expect(sim.faults.inject({ faultId: 'fuse.blown', params: { fuse: 'F-RACKB-5V' } })).toEqual({ ok: false, error: 'fault fuse.blown already active on F-RACKB-5V (#f1)' });
    expect(sim.faults.inject({ faultId: 'eth.unplugged', params: { host: 'pi-wall-e' } }).ok).toBe(true);
    expect(sim.faults.inject({ faultId: 'eth.damaged', params: { host: 'pi-wall-e' } })).toEqual({ ok: false, error: 'fault eth.damaged: nothing to break (pi-wall-e cable is already unplugged)' });
    expect(lab().log.filter((l) => l.source === 'faults').map((l) => l.text)).toEqual(['inject f1 fuse.blown target=F-RACKB-5V', 'inject f2 eth.unplugged target=pi-wall-e']);
  });

  it("'@random' draws from the faults stream only (deterministic per seed, independent of other draws)", () => {
    const pick = (extraCurl: boolean) => {
      fresh('test', 7);
      if (extraCurl) sim.orca.rest('GET', '/api/robots', null, 'player'); // devices-stream draws
      const r = sim.faults.inject({ faultId: 'fuse.blown', params: { fuse: '@random' } });
      return r.ok ? lab().faults[0]!.target : r.error;
    };
    const a = pick(false);
    expect(['F-RACKA-5V', 'F-RACKB-5V', 'F-BENCH-5V']).toContain(a);
    expect(pick(true)).toBe(a);
  });

  it('injectAll is all-or-nothing and names the failing item', () => {
    const before = JSON.stringify(sim.snapshot().faults);
    const r = sim.faults.injectAll([
      { faultId: 'pi.hung', params: { host: 'pi-wall-e' } },
      { op: 'orca.setStatus', params: { robot: 'baymax', status: 'OFFLINE' } },
      { faultId: 'fuse.blown', params: { fuse: 'F-NOPE' } },
    ]);
    expect(r).toEqual({ ok: false, error: "scenario item 3 (fuse.blown): fault fuse.blown: invalid param fuse='F-NOPE' (not one of F-RACKA-5V, F-RACKB-5V, F-BENCH-5V, F-NUC-12V)" });
    expect(JSON.stringify(sim.snapshot().faults)).toBe(before);
    expect(host('pi-wall-e').os).toBe('RUNNING');
    expect(robot('baymax').status).toBe('AVAILABLE');
    const ok2 = sim.faults.injectAll([{ faultId: 'pi.hung', params: { host: 'pi-wall-e' } }, { op: 'orca.setStatus', params: { robot: 'baymax', status: 'OFFLINE' } }]);
    expect(ok2).toEqual({ ok: true, value: { instanceIds: ['f1'] } });
    expect(robot('baymax').status).toBe('OFFLINE');
    expect(robot('baymax').notes[0]!.text).toBe('2026-10-05 09:00:00 STATUS Available → Offline (jared)');
  });

  it('an API clear reverts only values nobody changed since (never stomps player work)', () => {
    const r = sim.faults.inject({ faultId: 'orca.offsets', params: { robot: 'bumblebee', xMm: 0.5, yMm: 1.5 } });
    sim.orca.saveRobot({ id: 3, offsetXMm: 0.2 }, 'player'); // player edits X only
    sim.faults.clear(r.ok ? r.value.instanceId : '', 'mission');
    expect(robot('bumblebee')).toMatchObject({ offsetXMm: 0.2, offsetYMm: 0 });
  });

  it('pi.hung clears by power-cycling (never straight to RUNNING)', () => {
    const r = sim.faults.inject({ faultId: 'pi.hung', params: { host: 'pi-eve' } });
    expect(host('pi-eve').os).toBe('HUNG');
    sim.faults.clear(r.ok ? r.value.instanceId : '', 'mission');
    expect(host('pi-eve').os).toBe('BOOTING');
    expect(runUntil(() => host('pi-eve').os === 'RUNNING', 45_000)).toBeGreaterThan(39_000);
  });

  it('edit-style faults leave the real history (CONFIG note + audit by the NPC)', () => {
    sim.faults.inject({ faultId: 'orca.hrnTypo', params: { robot: 'johnny-5' } });
    expect(robot('johnny-5').notes[0]!.text).toBe('2026-10-05 09:00:00 CONFIG humanReadableName changed (alex)');
    expect(lab().orca.audit.at(-1)).toMatchObject({ who: 'alex', action: 'UPDATE', entity: 'robot', entityId: 5 });
    run(2_000);
    expect(lab().rigs['johnny-5']!.tablet.hrnShown).toBe('JONNY-5');
    sim.faults.inject({ faultId: 'orca.screenLocationTypo' });
    expect(lab().orca.audit.at(-1)).toMatchObject({ who: 'bulk-import', action: 'UPDATE', entity: 'screenLocation', atMs: -28_200_000 });
  });

  it('device faults: unpowered device goes dark; k-9 dead Duo 2 never boots', () => {
    sim.faults.inject({ faultId: 'device.unpowered', params: { device: 'dev-eve-flex4' } });
    sim.tick(100);
    expect(device('dev-eve-flex4')).toMatchObject({ power: 'off', battery: { pct: 0, charging: false } });
    sim.faults.inject({ faultId: 'device.dead', params: { device: 'dev-k-9-duo2' } });
    run(31_000);
    expect(device('dev-k-9-duo2')).toMatchObject({ power: 'off', state: 'DEAD' });
  });
});

describe('devops fault rows through the shared engine (Sim §4.3.8–§4.3.10)', () => {
  beforeEach(() => fresh());

  it('every devops row injects with its example params and clears through the API', () => {
    const rows = sim.faults.catalogue().filter((f) => f.owner === 'devops');
    expect(rows.length).toBe(16);
    for (const row of rows) {
      fresh();
      const params: Record<string, string | number | boolean | string[]> = {};
      for (const p of row.params) {
        const v = p.default ?? (p.example === '' ? undefined : p.example);
        if (v !== undefined) params[p.name] = p.kind === 'number' && typeof v === 'string' ? Number(v) : v;
      }
      if (row.id === 'config.port5555' || row.id === 'config.value') sim.faults.applySetup({ op: 'repo.clone', params: { repo: 'uia-remote' } });
      if (row.id === 'config.value') sim.faults.applySetup({ op: 'config.write', params: { fixture: 'target', robot: 'megatron' } });
      if (row.id === 'config.port5555') sim.faults.applySetup({ op: 'config.write', params: { fixture: 'target', robot: 'megatron' } });
      if (row.id === 'config.themeKernel') sim.faults.applySetup({ op: 'config.write', params: { fixture: 'target', robot: 'megatron', path: '~/CodeWithMe/alex/uia-remote/config.properties' } });
      if (row.id === 'pigeon.missingComma' || row.id === 'pigeon.missingBracket') params.path = 'tests/sale/tip_sale_print.json';
      const r = sim.faults.inject({ faultId: row.id, params });
      expect(r, `${row.id}: ${(r as { error?: string }).error}`).toMatchObject({ ok: true });
      const fid = r.ok ? r.value.instanceId : '';
      expect(sim.faults.isResolved(fid), row.id).toBe(false);
      expect(sim.faults.clear(fid, 'mission')).toEqual({ ok: true, value: undefined });
      expect(sim.faults.isResolved(fid), row.id).toBe(true);
    }
  });

  it('jenkins.envCase: the saved lower-case DEVICE_TYPE fails ENUM_CASE; fixing the saved param resolves it', () => {
    const r = sim.faults.inject({ faultId: 'jenkins.envCase' });
    const fid = r.ok ? r.value.instanceId : '';
    const job = sim.jenkins.job('Java/uia-remote-regression-flex')!;
    expect(job.savedParams.DEVICE_TYPE).toBe('flex_3');
    ok(sim.jenkins.saveJob(job.id, { savedParams: { ...job.savedParams, DEVICE_TYPE: 'FLEX_3' } }, 'player'));
    expect(sim.faults.isResolved(fid)).toBe(true);
  });

  it('rig.testRunning holds the rig (dashboard lockout) until the named build finishes', () => {
    const r = sim.faults.inject({ faultId: 'rig.testRunning', params: { rig: 'wall-e', durationMs: 20_000 } });
    const fid = r.ok ? r.value.instanceId : '';
    run(15_000);
    expect(lab().rigs['wall-e']!.dashboardLocked).toBe(true);
    expect(sim.rig.command('wall-e', 'park.all', 'player')).toEqual({ ok: false, error: 'LOCKED' });
    expect(runUntil(() => sim.faults.isResolved(fid), 120_000)).toBeGreaterThan(0);
    run(100);
    expect(lab().rigs['wall-e']!.dashboardLocked).toBe(false);
  });
});
