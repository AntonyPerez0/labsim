/**
 * Play-throughs of the hands-on Academy steps against the real simulation and the mission runtime:
 * the lesson's success conditions must be reachable through the same sim calls the world / apps make
 * (power, rigs, Orca, terminal, git) plus the UI `app.action`s the apps emit.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { transact } from '@/core/store';
import { sim } from '@/sim';
import { missions } from '../../runtime/api';
import { getLesson } from '../../runtime/registry';
import { startAcademy } from '../../runtime/academy/start';
import { enterStep } from '../../runtime/academy/runner';
import { advance, fire, resetWorld, state } from '../../runtime/__tests__/helpers';
import { M14_TARGET } from './m14';

beforeEach(() => resetWorld());

const stepId = () => state().session.academy?.stepId ?? '';
const lab = () => state().lab;

function start(moduleId: string, stepIdAt: string): void {
  const lesson = getLesson(moduleId)!;
  const idx = lesson.steps.findIndex((s) => s.id === stepIdAt);
  expect(idx).toBeGreaterThanOrEqual(0);
  transact((d, ctx) => startAcademy(d, ctx, moduleId, { force: true, startIndex: idx }));
  expect(stepId()).toBe(stepIdAt);
}

function jump(moduleId: string, id: string): void {
  const idx = getLesson(moduleId)!.steps.findIndex((s) => s.id === id);
  transact((d, ctx) => enterStep(d, ctx, idx));
  expect(stepId()).toBe(id);
}

/** Acknowledge every pending line (step dialogue, onComplete lines). */
function ackAll(max = 6): void {
  for (let i = 0; i < max && state().session.dialogue; i++) {
    advance(1.6);
    missions.acknowledgeDialogue();
  }
}

function simTicks(n: number, dtMs = 100): void {
  for (let i = 0; i < n; i++) sim.tick(dtMs);
  advance(0.05);
}

/** What the world's multimeter does: read the sim (the runtime's shim reports `power.measured`). */
function measure(pointId: string): void {
  sim.power.measure(pointId, 'OHM');
  advance(0.1);
}

function action(app: string, act: string, data: Record<string, unknown>): void {
  fire('app.action', { app, action: act, data });
}

describe('Academy play-throughs (sim + runtime)', () => {
  it('lessons are registered from src/missions/academy/lessons', () => {
    for (let i = 1; i <= 18; i++) expect(getLesson(`M${String(i).padStart(2, '0')}`)?.steps.length).toBeGreaterThanOrEqual(8);
    expect(getLesson('M01')?.steps.some((s) => s.id === 'M01.07a')).toBe(true);
  });

  it('M03: de-energise, measure OL, fit a 10 A fuse, re-power Rack B, then AC strips only', () => {
    start('M03', 'M03.08');
    // Ω on the live fuse → ERR (wrong action GW21) but no progress. The world's multimeter emits power.measured.
    measure('F-RACKB-5V');
    expect(state().session.academy?.wrongActions).toBe(1);
    expect(stepId()).toBe('M03.08');
    sim.power.toggleRegulator('REG-5V-B', false, 'player');
    sim.power.removeFuse('F-RACKB-5V', 'player');
    measure('F-RACKB-5V');
    ackAll();
    expect(stepId()).toBe('M03.09');
    sim.power.insertFuse('F-RACKB-5V', 10, 'player');
    sim.power.toggleRegulator('REG-5V-B', true, 'player');
    simTicks(300);
    expect(lab().power.fuses['F-RACKB-5V']?.blown).toBe(false);
    ackAll(); // Jared's line, then the 18V-exception dialogue (M03.10)
    expect(stepId()).toBe('M03.11');
    sim.power.plug('psu-flex4-new', { kind: 'dc-rail', targetId: 'T-24V-SPARE' }, 'player');
    advance(0.1);
    expect(state().session.academy?.wrongActions).toBeGreaterThanOrEqual(1);
    sim.power.plug('psu-flex4-new', { kind: 'ac-strip', targetId: 'STRIP-W', socket: 3 }, 'player');
    sim.power.plug('psu-collis-spare', { kind: 'ac-strip', targetId: 'STRIP-W', socket: 4 }, 'player');
    simTicks(5);
    expect(stepId()).toBe('M03.12');
  });

  it('M04: push the carriage (yellow), partial parks stay yellow, Park All → green at (0,0)', () => {
    start('M04', 'M04.11');
    sim.rig.setDoor('wall-e', true, 'player');
    sim.rig.dragCarriage('wall-e', 30, 0, 'player');
    simTicks(20);
    ackAll();
    expect(stepId()).toBe('M04.12');
    sim.rig.command('wall-e', 'park.x', 'player');
    simTicks(100);
    expect(stepId()).toBe('M04.12');
    expect(state().session.academy?.wrongActions).toBe(1);
    sim.rig.command('wall-e', 'park.all', 'player');
    simTicks(300);
    expect(stepId()).toBe('M04.13');
  });

  it('M06: EVE goes Connection Failed after the forced check, then BAYMAX Offline is skipped', () => {
    start('M06', 'M06.07');
    sim.power.unplug('pi-eve', 'player');
    simTicks(5);
    expect(stepId()).toBe('M06.08');
    sim.orca.forceHealthCheck('player');
    simTicks(5);
    expect(stepId()).toBe('M06.09');
    jump('M06', 'M06.11');
    const baymax = Object.values(lab().orca.robots).find((r) => r.name === 'baymax')!;
    sim.orca.setRobotStatus(baymax.id, 'OFFLINE', 'player');
    sim.orca.forceHealthCheck('player');
    simTicks(2);
    expect(stepId()).toBe('M06.11');
    action('orca', 'orca.healthLog.viewed', { newestRun: 1 });
    advance(0.1);
    expect(stepId()).toBe('M06.12');
  });

  it('M01: the tablet is locked during build #4120 (Park All rejected), then free after the build', () => {
    start('M01', 'M01.06');
    simTicks(40, 250); // build #4120 is running and holds WALL-E
    const r = sim.rig.command('wall-e', 'park.all', 'player');
    simTicks(2);
    // Sim §3.7.6: rejected with LOCKED while a test is active. The tablet overlay also emits tablet.lockout.shown.
    if (r.ok) action('tablet', 'tablet.lockout.shown', { robot: 'wall-e', holder: 'Java/uia-remote-regression-flex #4120', blockedClick: true });
    expect(stepId()).toBe('M01.07');
    ackAll();
    // Clearing the fault only ends the loop: the build finishes its pass and releases WALL-E first.
    expect(stepId()).toBe('M01.07w');
    expect(lab().faults.some((f) => f.faultId === 'rig.testRunning' && !f.cleared)).toBe(false);
    expect(lab().rigs['wall-e']?.dashboardLocked).toBe(true);
    for (let i = 0; i < 400 && stepId() === 'M01.07w'; i++) simTicks(4, 250);
    expect(lab().rigs['wall-e']?.dashboardLocked).toBe(false);
    ackAll();
    expect(stepId()).toBe('M01.07a');
    sim.rig.command('wall-e', 'park.all', 'player');
    simTicks(5);
    ackAll(1);
    expect(stepId()).toBe('M01.08');
  }, 20_000);

  it('M07: HRN typo fixed without touching Name; new FLEX_2 device linked; Tap URL; tethering; offsets', () => {
    start('M07', 'M07.03');
    const robot = (n: string) => Object.values(lab().orca.robots).find((r) => r.name === n)!;
    sim.orca.saveRobot({ id: robot('johnny-5').id, humanReadableName: 'JOHNNY-5' }, 'player');
    simTicks(1);
    expect(stepId()).toBe('M07.04');
    jump('M07', 'M07.06');
    const created = sim.orca.saveDevice({ name: 'johnny-5-flex2', deviceType: 'FLEX_2', serial: 'SIM-F2-000015', ip: '10.42.30.15' }, 'player');
    expect(created.ok).toBe(true);
    if (created.ok) sim.orca.saveRobot({ id: robot('johnny-5').id, deviceId: created.value }, 'player');
    simTicks(1);
    expect(stepId()).toBe('M07.07');
    jump('M07', 'M07.08');
    sim.orca.saveRobot({ id: robot('johnny-5').id, tapUrl: 'http://10.42.10.15:8000/tap' }, 'player');
    simTicks(1);
    ackAll(1);
    expect(stepId()).toBe('M07.09');
    const dev = (n: string) => Object.values(lab().orca.devices).find((d) => d.name === n)!.id;
    sim.orca.saveRobot({ id: robot('optimus').id, mfdDeviceId: dev('optimus-mfd'), cfdDeviceId: dev('optimus-cfd') }, 'player');
    simTicks(1);
    expect(stepId()).toBe('M07.10');
    jump('M07', 'M07.11');
    action('camera', 'camera.stream.opened', { url: 'http://10.42.10.13:8081/stream.mjpg', host: '10.42.10.13', robotName: 'bumblebee', cameraId: null, ok: true, error: null });
    // A tap with the legacy offset still in place does not count.
    sim.orca.xyTouch('bumblebee', 'TENDER_CASH_DISCOUNT', 'Cash', 'player');
    simTicks(80);
    expect(stepId()).toBe('M07.11');
    sim.orca.saveRobot({ id: robot('bumblebee').id, offsetYMm: 0 }, 'player');
    sim.orca.xyTouch('bumblebee', 'TENDER_CASH_DISCOUNT', 'Cash', 'player');
    simTicks(80);
    expect(stepId()).toBe('M07.12');
  });

  it('M09: the 5-option FLEX_4 map is created next to the untouched 4-option map', () => {
    start('M09', 'M09.11');
    const created = sim.orca.saveScreen({ name: 'RECEIPT_OPTIONS_5', deviceType: 'FLEX_4', optionCount: 5, description: 'Receipt options with Scan for receipt' }, 'player');
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const pts: [string, number][] = [['Print', 74], ['Email', 86], ['Text', 98], ['No Receipt', 110], ['Scan for receipt', 122]];
    for (const [button, y] of pts) sim.orca.saveScreenLocation({ screenId: created.value, button, xMm: 34, yMm: y }, 'player');
    simTicks(1);
    expect(stepId()).toBe('M09.12');
  });

  it('M11: the saved lower-case DEVICE_TYPE fails the checkout with ENUM_CASE; FLEX_3 checks out WALL-E', () => {
    start('M11', 'M11.04');
    const b = sim.jenkins.build('Java/uia-remote-regression-flex', {}, 'player');
    expect(b.ok).toBe(true);
    simTicks(400);
    const last = sim.jenkins.recentBuilds('Java/uia-remote-regression-flex', 1)[0];
    expect(last?.result).toBe('FAILURE');
    expect(last?.failureCode).toBe('ENUM_CASE');
    action('jenkins', 'jenkins.console.opened', { buildId: last!.id, jobId: 'Java/uia-remote-regression-flex', number: last!.number, state: 'finished', result: 'FAILURE' });
    expect(stepId()).toBe('M11.05');
    ackAll(1);
    expect(stepId()).toBe('M11.06');
    sim.jenkins.build('Java/uia-remote-regression-flex', { DEVICE_TYPE: 'FLEX_3' }, 'player');
    simTicks(100);
    expect(stepId()).toBe('M11.07');
  });

  it('M05: ssh into the Pi and check Linux, the controller, disk, Wine and /health', () => {
    start('M05', 'M05.07');
    const run = (line: string) => {
      sim.terminal.exec(line);
      simTicks(20);
    };
    run('ssh pi@10.42.10.11');
    expect(stepId()).toBe('M05.08');
    run('uname -a');
    run('systemctl status robot-controller');
    expect(stepId()).toBe('M05.09');
    run('df -h /');
    ackAll(1);
    expect(stepId()).toBe('M05.10');
    run('ps aux | grep -i wine');
    ackAll(1);
    expect(stepId()).toBe('M05.11');
    run('curl -i http://10.42.10.11:8000/health');
    expect(stepId()).toBe('M05.12');
  });

  it('M08: the Go SDK receipt test gains "printer": true in the gort clone', () => {
    // Start one step earlier and enter M08.05 normally: the sim's scenario injection reads the committed
    // state, so injecting in the same transaction as the preset reset (resume at M08.05) loses the preset
    // (reported to the sim owners).
    start('M08', 'M08.04');
    jump('M08', 'M08.05');
    const path = 'go-sdk/tests/sale_receipt.json';
    const text = lab().repos['gort']?.local?.files?.[path];
    expect(text, 'gort cloned by the step').toBeTruthy();
    const doc = JSON.parse(text!) as { capabilities: Record<string, unknown> };
    doc.capabilities.printer = true;
    sim.git.writeFile('gort', path, JSON.stringify(doc, null, 2));
    simTicks(1);
    ackAll();
    expect(stepId()).toBe('M08.06');
    // The reviewed change is on gort's main, which the M08.09 Jenkins build checks out.
    const main = JSON.parse(lab().repos['gort']!.files[path]!) as { capabilities: Record<string, unknown> };
    expect(main.capabilities.printer).toBe(true);
  });

  it('M16: the CFD_TOTAL compare row matches, then fails after the layout-v2 shift', () => {
    start('M16', 'M16.07');
    const r2 = Object.values(lab().orca.robots).find((r) => r.name === 'r2-d2')!;
    const saved = sim.orca.saveScreenCompareImage({ name: 'CFD_TOTAL', robotId: r2.id, screenName: 'CFD_CART', bbox: { x: 412, y: 288, w: 236, h: 44 }, expectedText: 'TOTAL $10.83' }, 'player');
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const res = sim.ocr.compare(saved.value);
    expect(res.ok && res.value.match).toBe(true);
    action('orca', 'orca.screenCompare.tested', { compareId: saved.value, name: 'CFD_TOTAL', text: res.ok ? res.value.text : '', expected: 'TOTAL $10.83', match: true, ok: true, error: null });
    simTicks(1);
    ackAll(1);
    expect(stepId()).toBe('M16.08');
  });

  it('M12: ADB on 5444, dump, find Register, tap it, then the refused 5555 connect', () => {
    start('M12', 'M12.02');
    const run = (line: string) => {
      sim.terminal.exec(line);
      simTicks(20);
    };
    run('adb connect 10.42.30.32:5444');
    expect(stepId()).toBe('M12.03');
    run('adb devices');
    expect(stepId()).toBe('M12.04');
    run('adb -s 10.42.30.32:5444 shell uiautomator dump');
    expect(stepId()).toBe('M12.05');
    run('adb -s 10.42.30.32:5444 pull /sdcard/window_dump.xml');
    run("grep -o 'text=\"Register\"[^>]*' window_dump.xml");
    expect(stepId()).toBe('M12.05a');
    advance(1.6);
    missions.chooseDialogue('top-left');
    ackAll(1);
    expect(stepId()).toBe('M12.05a');
    missions.chooseDialogue('centre');
    ackAll(1);
    expect(stepId()).toBe('M12.06');
    run('adb -s 10.42.30.32:5444 shell input tap 192 508');
    expect(stepId()).toBe('M12.07');
    ackAll();
    run('adb connect 10.42.30.32');
    expect(stepId()).toBe('M12.09');
  });

  it('M13: clone, staged placement puzzle, and the scrambled runner', () => {
    start('M13', 'M13.03');
    sim.git.clone('uia-remote', 'player');
    simTicks(2);
    ackAll(); // Morgan: a WALL-E config.properties now sits in the clone (local runs need it)
    expect(stepId()).toBe('M13.04');
    expect(lab().repos['uia-remote']!.local!.files['config.properties']).toMatch(/robotName=wall-e/);
    action('intellij', 'intellij.tree.nodeClicked', { repo: 'uia-remote', path: 'app/src/test', kind: 'dir' });
    expect(state().session.academy?.wrongActions).toBe(1);
    action('intellij', 'intellij.tree.nodeClicked', { repo: 'uia-remote', path: 'app/src/main', kind: 'dir' });
    ackAll();
    expect(stepId()).toBe('M13.05');
    const files = () => Object.keys(lab().repos['uia-remote']!.local!.files);
    expect(files()).toContain('unsorted/HomeScreen.java');
    expect(files().some((f) => f.startsWith('app/src/androidTest/') && f.endsWith('/HomeScreen.java'))).toBe(false);
    const back: Record<string, string> = {
      'DbHelper.java': 'app/src/androidTest/java/com/labsim/uia/databases/DbHelper.java',
      'HomeScreen.java': 'app/src/androidTest/java/com/labsim/uia/pageobjects/HomeScreen.java',
      'LockScreen.java': 'app/src/androidTest/java/com/labsim/uia/pageobjects/LockScreen.java',
      'TaxTest.java': 'app/src/androidTest/java/com/labsim/uia/testactions/TaxTest.java',
      'MultiDeviceRunner.java': 'app/src/test/java/com/labsim/uia/runner/MultiDeviceRunner.java',
    };
    for (const [f, to] of Object.entries(back)) sim.git.moveFile('uia-remote', `unsorted/${f}`, to);
    simTicks(1);
    expect(stepId()).toBe('M13.05');
    action('intellij', 'intellij.tree.nodeClicked', { repo: 'uia-remote', path: 'app/src/main/java/com/labsim/uia/AppRegistration.java', kind: 'file' });
    expect(stepId()).toBe('M13.06');
    const home = lab().repos['uia-remote']!.local!.files[back['HomeScreen.java']!]!.split('\n');
    const z1 = home.findIndex((l) => l.includes('Zone 1')) + 2;
    const z2 = home.findIndex((l) => l.includes('Zone 2')) + 2;
    action('intellij', 'intellij.editor.clicked', { repo: 'uia-remote', path: back['HomeScreen.java'], line: z2, column: 1, lineText: home[z2 - 1], token: null });
    action('intellij', 'intellij.editor.clicked', { repo: 'uia-remote', path: back['HomeScreen.java'], line: z1, column: 1, lineText: home[z1 - 1], token: null });
    expect(stepId()).toBe('M13.06');
    action('intellij', 'intellij.editor.clicked', { repo: 'uia-remote', path: back['HomeScreen.java'], line: z2, column: 1, lineText: home[z2 - 1], token: null });
    expect(stepId()).toBe('M13.07');

    jump('M13', 'M13.11');
    const path = back['MultiDeviceRunner.java']!;
    const scrambled = lab().repos['uia-remote']!.local!.files[path]!;
    expect(scrambled.indexOf('cfd.run(cfdTotals::assertTotals)')).toBeLessThan(scrambled.indexOf('mfd.run(registerHome::addTaxItem5)'));
    advance(0.1);
    expect(stepId()).toBe('M13.11');
    const order = ['mfd.run(registerHome::addTaxItem5);', 'mfd.run(registerHome::reviewOrder);', 'cfd.run(cfdTotals::assertTotals);', 'mfd.run(registerHome::payAndCharge);', 'cfd.run(cfdPayment::finalisePayment);'];
    const lines = scrambled.split('\n');
    const idx = lines.map((l, i) => (order.some((o) => l.includes(o.slice(0, -1))) ? i : -1)).filter((i) => i >= 0);
    idx.forEach((i, k) => (lines[i] = `        ${order[k]}`));
    sim.git.writeFile('uia-remote', path, lines.join('\n'));
    simTicks(1);
    expect(stepId()).toBe('M13.12');
  });

  it('M14: the broken config is fixed to the 11/11 validator target', () => {
    start('M14', 'M14.05');
    expect(stepId()).toBe('M14.05');
    const text = Object.entries(M14_TARGET)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    sim.git.writeFile('uia-remote', 'config.properties', `${text}\n`);
    simTicks(2);
    expect(stepId()).toBe('M14.06');
  });

  it('M18 capstone 2: the bumped SETI arm is recovered with Park All', () => {
    start('M18', 'M18.09');
    simTicks(20);
    expect(lab().rigs['seti']?.banner).toBe('yellow');
    sim.rig.command('seti', 'park.all', 'player');
    simTicks(300);
    expect(stepId()).toBe('M18.10');
  });
});
