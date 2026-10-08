/**
 * GP §3.5 incidents INC13–INC25 (motion, devices, probes, NUC, coordinates, capabilities, Pigeon) run end
 * to end through Sim Appendix A's scenarios.
 */
import { describe, expect, it, vi } from 'vitest';
import { build, consoleOf, lab, nextHealthCheck, notes, resolved, robot, run, runUntil, scenario, sh, sim, start } from './kit';
import { collect } from '../core/testkit';
import { screenLocationFile, screenLocationPath, truthFor } from '../seed/repos/screenTruth';
import { treeAt } from '../devops/gitCore';

vi.setConfig({ testTimeout: 300_000 });

const loc = (type: string, screen: string, button: string) => {
  const s = Object.values(lab().orca.screens).find((x) => x.deviceType === type && x.name === screen);
  return s ? Object.values(lab().orca.screenLocations).find((l) => l.screenId === s.id && l.button === button) : undefined;
};

describe('INC13–INC16 motion and actuators', () => {
  it('INC13-A steppers disabled: 503 STEPPERS_DISABLED, green while disabled; Enable → yellow → Park All → green', () => {
    start();
    const ids = scenario({ faultId: 'rig.steppersDisabled', params: { rig: 'bumblebee' } });
    run(200);
    expect(lab().rigs['bumblebee']!.banner).toBe('green');
    const b = build('Java/uia-remote-regression-mini');
    expect(b.result).toBe('FAILURE');
    expect(consoleOf(b)).toContain('→ 503 Service Unavailable: STEPPERS_DISABLED');
    sim.rig.command('bumblebee', 'steppers.enable', 'player');
    run(300);
    expect(lab().rigs['bumblebee']!.banner).toBe('yellow');
    sim.rig.command('bumblebee', 'park.all', 'player');
    run(4_000);
    expect(lab().rigs['bumblebee']!.banner).toBe('green');
    expect(resolved(ids)).toBe(true);
    expect(build('Java/uia-remote-regression-mini').result).toBe('SUCCESS');
  });

  it('INC13-B MOTOR off: MOTOR_POWER_LOST, banner green until MOTOR returns, then yellow → Park All', () => {
    start();
    const ids = scenario({ faultId: 'rig.motorOff', params: { rig: 'bumblebee' } });
    run(200);
    expect(lab().rigs['bumblebee']!.banner).toBe('green');
    expect(lab().power.terminals['MOTOR-bumblebee']!.energised).toBe(false);
    expect(lab().power.terminals['MAIN-bumblebee']!.energised).toBe(true);
    const b = build('Java/uia-remote-regression-mini');
    expect(consoleOf(b)).toContain('→ 503 Service Unavailable: MOTOR_POWER_LOST');
    sim.rig.setSwitch('bumblebee', 'motor', true, 'player');
    run(300);
    expect(lab().rigs['bumblebee']!.banner).toBe('yellow');
    sim.rig.command('bumblebee', 'park.all', 'player');
    run(4_000);
    expect(lab().rigs['bumblebee']!.banner).toBe('green');
    expect(resolved(ids)).toBe(true);
  });

  it('INC14 legacy Offsets on BUMBLEBEE: icons hit, Charge misses; offsets shown in the xy_touch line; zero them → green', () => {
    start();
    const ids = scenario({ faultId: 'orca.offsets', params: { robot: 'bumblebee', yMm: 1.5 } });
    expect(notes('bumblebee').some((n) => n.includes('CONFIG offsets.y changed'))).toBe(true);
    const b = build('Java/uia-remote-regression-mini');
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('[orca] xy_touch bumblebee PAYMENT/Charge → PHYSICAL_TAP (31.0, 90.5) (offsets +0.0/+1.5)');
    expect(consoleOf(b)).toContain('[orca] xy_touch bumblebee HOME/Register → PHYSICAL_TAP');
    const r = robot('bumblebee');
    sim.orca.saveRobot({ id: r.id, offsetYMm: 0 }, 'player');
    expect(resolved(ids)).toBe(true);
    // Orca "Test tap" lands on the centre (PHYSICAL_TAP without offsets).
    const t = sim.orca.xyTouch('bumblebee', 'PAYMENT', 'Charge', 'player');
    expect(t.ok && t.value.yMm).toBe(89.0);
    run(3_000);
    expect(build('Java/uia-remote-regression-mini').result).toBe('SUCCESS');
  });

  it('INC15 loose solenoid: Orca answers 200 PHYSICAL_TAP but nothing is pressed; re-seat → green', () => {
    start();
    const ids = scenario({ faultId: 'rig.solenoidLoose', params: { rig: 'eve' } });
    const b = build('Java/uia-remote-regression-flex', { DEVICE_TYPE: 'FLEX_4' });
    expect(b.result).toBe('FAILURE');
    expect(b.robotId).toBe(robot('eve').id);
    expect(consoleOf(b)).toMatch(/\[orca\] xy_touch eve HOME\/Register → PHYSICAL_TAP/);
    expect(consoleOf(b)).toMatch(/waitForScreen\(\) timed out|waitForScreen timed out/);
    sim.rig.setSwitch('eve', 'motor', false, 'player');
    sim.rig.setDoor('eve', true, 'player');
    sim.rig.reseat('eve', 'solenoidConnector', 'player');
    sim.rig.setDoor('eve', false, 'player');
    sim.rig.setSwitch('eve', 'motor', true, 'player');
    run(300);
    sim.rig.command('eve', 'park.all', 'player');
    run(4_000);
    expect(lab().rigs['eve']!.banner).toBe('green');
    expect(resolved(ids)).toBe(true);
    expect(build('Java/uia-remote-regression-flex', { DEVICE_TYPE: 'FLEX_4' }).result).toBe('SUCCESS');
  });

  it('INC16 dip arm one tooth off: Callus loads OK then CHIP_READ_ERROR; align with steppers off → PL5 green', () => {
    start();
    const ids = scenario({ faultId: 'rig.dipArmMisaligned', params: { rig: 'seti' } });
    const b = build('Java/contact-canada-pin-sale');
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('[callus] map cards/emv/interac_ca_dip.json → C:\\gort\\cards\\emv\\interac_ca_dip.json · load virtual card OK · probe seti: DIP');
    expect(consoleOf(b)).toContain('[device] CHIP_READ_ERROR');
    expect(sim.rig.alignDipArm('seti', -1, 'player').ok).toBe(false); // held by its stepper
    sim.rig.setSwitch('seti', 'motor', false, 'player');
    expect(sim.rig.alignDipArm('seti', -1, 'player')).toMatchObject({ ok: true, value: { toothOffset: 0 } });
    sim.rig.setSwitch('seti', 'motor', true, 'player');
    run(300);
    sim.rig.command('seti', 'park.all', 'player');
    run(4_000);
    expect(lab().rigs['seti']!.banner).toBe('green');
    expect(resolved(ids)).toBe(true);
    expect(build('Java/contact-canada-pin-sale').result).toBe('SUCCESS');
  });
});

describe('INC17–INC19 power, probes, NUC', () => {
  it('INC17 18 V trap: Flex 4 dark, PL1 No route to host; the 24 V tap fries it; the strip socket (fan out) fixes it', () => {
    start();
    const ids = scenario(
      { faultId: 'device.unpowered', params: { device: 'dev-eve-flex4' } },
      { op: 'power.plug', params: { load: 'desk-fan', kind: 'ac-strip', target: 'STRIP-A', socket: 6 } },
    );
    run(500);
    expect(lab().devices['dev-eve-flex4']!.power).toBe('off');
    const b = build('Java/uia-remote-regression-flex', { DEVICE_TYPE: 'FLEX_4' });
    expect(b.result).toBe('FAILURE');
    expect(consoleOf(b)).toContain("adb: failed to connect to '10.42.30.12:5444': No route to host");
    nextHealthCheck();
    expect(robot('eve').status).toBe('AVAILABLE');
    // Fix: fan out, brick in; 30 s boot.
    expect(sim.power.unplug('desk-fan', 'player').ok).toBe(true);
    expect(sim.power.plug('psu-eve-flex4', { kind: 'ac-strip', targetId: 'STRIP-A', socket: 6 }, 'player').ok).toBe(true);
    expect(runUntil(() => lab().devices['dev-eve-flex4']!.power === 'on', 40_000)).toBeGreaterThan(25_000);
    expect(resolved(ids)).toBe(true);
    expect(build('Java/uia-remote-regression-flex', { DEVICE_TYPE: 'FLEX_4' }).result).toBe('SUCCESS');
  });

  it('INC17 wrong move (full damage model): the brick on the spare 24 V tap fries the device', () => {
    start();
    scenario({ faultId: 'device.unpowered', params: { device: 'dev-eve-flex4' } });
    sim.power.plug('psu-eve-flex4', { kind: 'dc-rail', targetId: 'T-24V-SPARE' }, 'player');
    run(500);
    expect(lab().devices['dev-eve-flex4']!.power).toBe('fried');
  });

  it('INC18-A probe unpowered: PROBE_OFFLINE, Callus /status OFFLINE; plug the PSU → PL3 green', () => {
    start();
    const ids = scenario({ faultId: 'collis.unpowered', params: { probe: 'collis-wall-e' } });
    run(200);
    expect(sh('curl http://10.42.20.1:9000/status')).toContain('{"callus":"UP","probes":[{"id":"collis-wall-e","state":"OFFLINE"},{"id":"collis-eve","state":"READY"},{"id":"collis-bumblebee","state":"READY"},{"id":"collis-r2-d2","state":"READY"}]}');
    const b = build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'wall-e' });
    expect(b.result).toBe('FAILURE');
    expect(consoleOf(b)).toContain('[callus] probe collis-wall-e: PROBE_OFFLINE');
    sim.power.plug('psu-collis-wall-e', { kind: 'ac-strip', targetId: 'STRIP-C', socket: 1 }, 'player');
    run(500);
    expect(resolved(ids)).toBe(true);
    expect(build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'wall-e' }).result).toBe('SUCCESS');
  });

  it('INC18-B ribbon unseated: NO_LINK / PROBE_NO_LINK; re-seat → READY', () => {
    start();
    const ids = scenario({ faultId: 'collis.ribbonUnseated', params: { probe: 'collis-wall-e' } });
    run(200);
    expect(sh('curl http://10.42.20.1:9000/status').join('')).toContain('{"id":"collis-wall-e","state":"NO_LINK"}');
    const c = sim.orca.card('wall-e', 'SWIPE', 'VISA_STD_SWIPE', 'player');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.error).toContain('PROBE_NO_LINK');
    sim.collis.reseatRibbon('collis-wall-e', 'player');
    run(200);
    expect(resolved(ids)).toBe(true);
  });

  it('INC19 motion on the full NUC: 502 motion upstream; move the USB back, motion: local, restart → 200, Park All, Available', () => {
    start();
    const ids = scenario({ faultId: 'rig.motionOnNuc', params: { rig: 'bumblebee', host: 'nuc-03' } });
    nextHealthCheck();
    expect(robot('bumblebee').status).toBe('CONNECTION_FAILED');
    expect(notes('bumblebee')[0]).toMatch(/GET http:\/\/10\.42\.10\.13:8000\/health → 502 Bad Gateway \{"error":"motion upstream 10\.42\.20\.3:9100 error: No space left on device"\}$/);
    const ps = sh('ssh automation@10.42.20.3 powershell Get-PSDrive C').join('\n');
    expect(ps).toMatch(/C\s+237\.9\s+0\.0/);
    const t = sim.orca.xyTouch('bumblebee', 'HOME', 'Register', 'player');
    expect(t.ok).toBe(false);
    if (!t.ok) expect(t.error).toContain('502 Bad Gateway: motion upstream 10.42.20.3:9100 error: No space left on device');
    // Ordered fix.
    sim.orca.setRobotStatus(robot('bumblebee').id, 'OFFLINE', 'player');
    sim.rig.setSwitch('bumblebee', 'motor', false, 'player');
    expect(sim.rig.moveMotorUsb('bumblebee', 'PI', 'player').ok).toBe(true);
    const path = '/etc/robot-controller/controller.yaml';
    const yaml = lab().hosts['pi-bumblebee']!.files[path]!;
    expect(yaml).toContain('motion: nuc://10.42.20.3:9100');
    sim.host.writeFile('pi-bumblebee', path, yaml.replace('motion: nuc://10.42.20.3:9100', 'motion: local'), 'player');
    expect(resolved(ids)).toBe(false); // not restarted yet
    sh('ssh pi@10.42.10.13 sudo systemctl restart robot-controller');
    run(8_000);
    const curl = sh('curl -i http://10.42.10.13:8000/health');
    expect(curl[0]).toBe('HTTP/1.1 200 OK');
    sim.rig.setSwitch('bumblebee', 'motor', true, 'player');
    run(300);
    sim.rig.command('bumblebee', 'park.all', 'player');
    run(4_000);
    sim.orca.setRobotStatus(robot('bumblebee').id, 'AVAILABLE', 'player');
    nextHealthCheck();
    expect(lab().rigs['bumblebee']!).toMatchObject({ motionHost: 'PI', banner: 'green', gantry: { homed: true } });
    expect(robot('bumblebee')).toMatchObject({ status: 'AVAILABLE', lastHealth: { http: 200 } });
    expect(resolved(ids)).toBe(true);
  });

  it('INC19 GW11: deleting the corporate logs is recorded as tampering and policy restores them 30 s later', () => {
    start();
    const ev = collect('host.securityTamper', () => {
      expect(sim.host.deletePath('nuc-03', 'C:\\ProgramData\\SecAgent\\logs', 'player').ok).toBe(true);
    });
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ hostId: 'nuc-03', actor: 'player' });
    run(31_000);
    expect(Object.keys(lab().hosts['nuc-03']!.files).some((p) => p.startsWith('C:\\ProgramData\\SecAgent\\logs'))).toBe(true);
    expect(lab().hosts['nuc-03']!.diskUsedGb).toBeCloseTo(lab().hosts['nuc-03']!.diskTotalGb, 1);
  });
});

describe('INC20–INC25 coordinates, capabilities, Pigeon', () => {
  it('INC20 QR regression: stale _5 rows → "select print" timeout; Jared merges a gort PR, Orca syncs, PL3 green on two rigs', () => {
    start();
    sim.setConfig({ npcAutoMerge: true });
    const ids = scenario({ faultId: 'orca.screenLocationShift', params: { deviceTypes: ['FLEX_3', 'MINI_3', 'STATION_2018'] } });
    const b = build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'wall-e' });
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('PRINTER_TIMEOUT');
    expect(b.console).toContain('LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s');
    expect(b.console).toContain('FAILED at "select print"');
    // Coordinate PR on gort (protected main).
    sim.git.clone('gort', 'player');
    sim.git.checkout('gort', 'fix/receipt-qr-5opt', true);
    const paths: string[] = [];
    for (const t of ['FLEX_3', 'MINI_3', 'STATION_2018']) {
      const p = screenLocationPath(t, 'RECEIPT_OPTIONS_5');
      sim.git.writeFile('gort', p, screenLocationFile(t, 'RECEIPT_OPTIONS_5', truthFor(t, 'RECEIPT_OPTIONS_5')!));
      paths.push(p);
    }
    sim.git.stage('gort', paths);
    expect(sim.git.commit('gort', 'Fix RECEIPT_OPTIONS_5 for the QR firmware', 'player').ok).toBe(true);
    expect(sim.git.push('gort').ok).toBe(true);
    const pr = sim.git.createPullRequest('gort', 'Fix RECEIPT_OPTIONS_5 coordinates', 'QR firmware moved every receipt button 3.0 mm down.', 'fix/receipt-qr-5opt', 'player');
    expect(pr.ok).toBe(true);
    expect(runUntil(() => resolved(ids), 60_000)).toBeGreaterThan(15_000);
    expect(lab().orca.audit.some((a) => /SYNC gort@\w+ config\/screen-locations\/FLEX_3\/RECEIPT_OPTIONS_5\.json/.test(JSON.stringify(a)))).toBe(true);
    expect(loc('FLEX_3', 'RECEIPT_OPTIONS_4', 'Print')).toBeDefined();
    expect(build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'wall-e' }).result).toBe('SUCCESS');
    expect(build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'bumblebee' }).result).toBe('SUCCESS');
  });

  it('INC20 Jared rejects a PR that is still off: "Print on MINI_3 is still 3.0 mm high"', () => {
    start();
    sim.setConfig({ npcAutoMerge: true });
    scenario({ faultId: 'orca.screenLocationShift', params: { deviceTypes: ['MINI_3'] } });
    sim.git.clone('gort', 'player');
    sim.git.checkout('gort', 'fix/qr', true);
    const t = truthFor('MINI_3', 'RECEIPT_OPTIONS_5')!;
    // Every row fixed except Print, which is still 3.0 mm high.
    const stale = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, { x: v.x, y: k === 'Print' ? Math.round((v.y - 3) * 10) / 10 : v.y }]));
    const p = screenLocationPath('MINI_3', 'RECEIPT_OPTIONS_5');
    sim.git.writeFile('gort', p, screenLocationFile('MINI_3', 'RECEIPT_OPTIONS_5', stale));
    sim.git.stage('gort', [p]);
    sim.git.commit('gort', 'touch MINI_3 receipt map', 'player');
    sim.git.push('gort');
    const pr = sim.git.createPullRequest('gort', 'MINI_3 receipt', '', 'fix/qr', 'player');
    run(25_000);
    expect(pr.ok).toBe(true);
    const p0 = lab().repos['gort']!.pullRequests.find((x) => x.number === (pr.ok ? pr.value.number : -1))!;
    expect(p0.state).toBe('open');
    expect(p0.verdict).toBe('CHANGES_REQUESTED');
    expect(p0.comments.map((c) => c.body).join('\n')).toContain('Print on MINI_3 is still 3.0 mm high');
  });

  it('INC21 missing STATION_2018 _5 map: 404 no Screen Location (deviation: Print first); new rows fix PL3 on baymax', () => {
    start();
    const ids = scenario({ faultId: 'orca.missingReceiptMap', params: { deviceType: 'STATION_2018' } });
    const b = build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'baymax' });
    expect(b.result).toBe('FAILURE');
    expect(consoleOf(b)).toContain('[orca] 404 Not Found: no Screen Location for (STATION_2018, RECEIPT_OPTIONS_5, "Print")');
    expect(b.console).toContain('FAILED at "select print"');
    const sid = sim.orca.saveScreen({ name: 'RECEIPT_OPTIONS_5', deviceType: 'STATION_2018', display: 'primary', optionCount: 5, description: '5-option receipt' }, 'player');
    expect(sid.ok).toBe(true);
    for (const [button, p] of Object.entries(truthFor('STATION_2018', 'RECEIPT_OPTIONS_5')!)) {
      expect(sim.orca.saveScreenLocation({ screenId: sid.ok ? sid.value : 0, button, xMm: p.x, yMm: p.y }, 'player').ok).toBe(true);
    }
    expect(resolved(ids)).toBe(true);
    expect(build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'baymax' }).result).toBe('SUCCESS');
  });

  it('INC22 FLEX_1 Print typo (62.5 vs 66.5): "select print" times out with a working printer; Y 66.5 fixes PL3 on johnny-5', () => {
    start();
    const ids = scenario({ faultId: 'orca.screenLocationTypo', params: { deviceType: 'FLEX_1', button: 'Print', yMm: 62.5 } });
    const b = build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'johnny-5' });
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s');
    expect(lab().devices['dev-johnny-5-flex1']!.printer.paper).toBe(true);
    const l = loc('FLEX_1', 'RECEIPT_OPTIONS_4', 'Print')!;
    sim.orca.saveScreenLocation({ id: l.id, yMm: 66.5 }, 'player');
    expect(resolved(ids)).toBe(true);
    expect(build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'johnny-5' }).result).toBe('SUCCESS');
  });

  it('INC23 capability dropped: LRU picks VISION (Pocket) → PRINTER_NOT_AVAILABLE; restore "printer": true → DATA/TARS green', () => {
    start();
    const ids = scenario({ faultId: 'gort.capabilityDropped', params: { key: 'printer' } });
    const pv = sim.orca.matchPreview('{"goSdk": true}');
    expect(pv.ok && pv.value.filter((r) => r.matches).map((r) => r.robot).sort()).toEqual(['data', 'tars', 'vision']);
    const pv2 = sim.orca.matchPreview('{"goSdk": true, "printer": true}');
    expect(pv2.ok && pv2.value.filter((r) => r.matches).map((r) => r.robot).sort()).toEqual(['data', 'tars']);
    const b = build('Java/go-sdk-sale-smoke');
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('[orca] checkout → vision (FLEX_POCKET) OK');
    expect(b.console).toContain('[go-sdk] PrintReceipt → PRINTER_NOT_AVAILABLE');
    // Fix: revert Alex's commit on a branch, PR on protected gort main, Jared (owner) merges after 20 s.
    sim.setConfig({ npcAutoMerge: true });
    const head = lab().repos['gort']!.branches['main']!;
    expect(sim.git.clone('gort', 'player').ok).toBe(true);
    expect(sim.git.checkout('gort', 'fix/sale-receipt-printer', true).ok).toBe(true);
    expect(sim.git.revert('gort', head, 'player').ok).toBe(true);
    expect(sim.git.push('gort').ok).toBe(true);
    expect(sim.git.createPullRequest('gort', 'Restore printer capability', 'printer: true is required for PrintReceipt', 'fix/sale-receipt-printer', 'player').ok).toBe(true);
    expect(runUntil(() => resolved(ids), 60_000)).toBeGreaterThan(15_000);
    const pv3 = sim.orca.matchPreview('{"goSdk": true, "printer": true}');
    expect(pv3.ok && pv3.value.some((r) => r.robot === 'vision' && r.matches)).toBe(false);
    const b2 = build('Java/go-sdk-sale-smoke');
    expect(b2.result).toBe('SUCCESS');
    expect(['data', 'tars']).toContain(Object.values(lab().orca.robots).find((r) => r.id === b2.robotId)!.name);
  });

  it('INC24 screenCompare region 0×0: empty region; GIMP values (208, 512, 304, 40) committed → green', () => {
    start();
    const ids = scenario({ faultId: 'pigeon.screenCompareEmpty', params: {} }, { op: 'device.stage', params: { device: 'dev-eve-flex4', stage: 'approved' } });
    const b = build('Java/pigeon-android-payment-compare');
    expect(b.result).toBe('FAILURE');
    expect(consoleOf(b)).toContain('LSTR screenCompare: empty region (0x0)');
    sim.git.clone('pigeon', 'player');
    const path = 'tests/sale/payment_success_compare.json';
    const repo = lab().repos['pigeon']!;
    const text = treeAt(repo, repo.branches['main']!)[path]!;
    const fixed = text.replace(/"x": 0, "y": 0, "w": 0, "h": 0/, '"x": 208, "y": 512, "w": 304, "h": 40');
    expect(fixed).not.toBe(text);
    sim.git.writeFile('pigeon', path, fixed);
    sim.git.stage('pigeon', [path]);
    sim.git.commit('pigeon', 'Fill screenCompare region from GIMP', 'player');
    expect(sim.git.push('pigeon').ok).toBe(true);
    expect(resolved(ids)).toBe(true);
    expect(build('Java/pigeon-android-payment-compare').result).toBe('SUCCESS');
  });
});
