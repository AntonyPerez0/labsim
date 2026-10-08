/**
 * GP §3.5 incidents INC26–INC46 (Jenkins folders, local config, ADB, uia-remote code, OCR, statuses,
 * hardware swaps, tethering) run end to end through Sim Appendix A's scenarios.
 */
import { describe, expect, it, vi } from 'vitest';
import { build, consoleOf, finish, lab, lastBuild, nextHealthCheck, notes, resolved, robot, run, runUntil, scenario, sh, sim, start } from './kit';
import { UIA_PATHS } from '../seed/repos/uiaRemote';
import { treeAt } from '../devops/gitCore';
import { collect } from '../core/testkit';

vi.setConfig({ testTimeout: 300_000 });

const LOCAL_CFG = 'config.properties';

/** Run a local IntelliJ test (uia-remote) to completion. */
function local(test: string, configPath?: string): { lines: string[]; passed: boolean | null; runId: string } {
  const r = sim.runner.runLocal('uia-remote', UIA_PATHS.test(test), 'player', configPath ? { configPath } : undefined);
  if (!r.ok) throw new Error(r.error);
  runUntil(() => sim.runner.output(r.value.runId).done, 200_000);
  const o = sim.runner.output(r.value.runId);
  return { lines: o.lines, passed: o.passed, runId: r.value.runId };
}

const cfg = (): string => lab().repos['uia-remote'].local!.files[LOCAL_CFG]!;
const setCfg = (key: string, value: string): void => {
  const text = cfg().replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  expect(sim.git.writeFile('uia-remote', LOCAL_CFG, text).ok).toBe(true);
};
const mainFile = (repo: 'uia-remote' | 'gort' | 'pigeon', path: string): string => treeAt(lab().repos[repo], lab().repos[repo].branches['main']!)[path]!;

describe('INC26–INC31 Jenkins folders, local config, ADB', () => {
  it('INC26 job filed under iOS: Java view lacks it, nightly skips it; Move → Java', () => {
    start();
    const ids = scenario({ faultId: 'jenkins.jobMoved', params: { job: 'Java/pigeon-windows-tender', toFolder: 'iOS' } });
    expect(sim.jenkins.job('Java/pigeon-windows-tender')).toBeNull();
    expect(sim.jenkins.job('iOS/pigeon-windows-tender')?.exists).toBe(true);
    const r = sim.jenkins.moveJob('iOS/pigeon-windows-tender', 'Java', 'player');
    expect(r.ok).toBe(true);
    expect(sim.jenkins.job('Java/pigeon-windows-tender')?.exists).toBe(true);
    expect(sim.jenkins.job('iOS/pigeon-windows-tender')?.exists ?? false).toBe(false);
    expect(resolved(ids)).toBe(true);
  });

  it('INC27 port 5555: falls back to Riley\'s desk Flex; stop, disconnect, 5444, reconnect → clean run', () => {
    start();
    let ev: unknown[] = [];
    let ids: string[] = [];
    ev = collect('adb.coworkerDriven', () => {
      ids = scenario(
        { op: 'repo.clone', params: { repo: 'uia-remote' } },
        { op: 'config.write', params: { fixture: 'target', robot: 'bumblebee' } },
        { faultId: 'config.port5555', params: {} },
        { op: 'runner.startLocal', params: { test: 'SaleTest' } },
      );
      run(20_000);
    });
    const runId = Object.keys(lab().local.runs).at(-1)!;
    const out = lab().local.runs[runId]!.output;
    expect(out).toContain('connect 10.42.30.13:5555 … refused');
    expect(out).toContain('falling back to first known device: 10.42.60.4:5555');
    expect(ev.length).toBeGreaterThan(0);
    expect(lab().workstation.coworkerDevicesDisturbed).toBeGreaterThan(0);
    expect(sh('adb devices')).toContain('10.42.60.4:5555\tdevice');
    // Fix.
    sim.runner.stopLocal(runId);
    expect(sh('adb disconnect 10.42.60.4:5555')).toEqual(['disconnected 10.42.60.4:5555']);
    setCfg('portNumber', '5444');
    expect(sh('adb connect 10.42.30.13:5444')).toEqual(['connected to 10.42.30.13:5444']);
    expect(resolved(ids)).toBe(true);
    run(100);
    expect(lab().faults.find((f) => f.id === ids[0])!.cleared).toBe(true);
    const r = local('SaleTest');
    expect(r.passed).toBe(true);
    expect(r.lines.join('\n')).not.toContain('10.42.60.4');
  });

  it('INC28 ADB refused after an OOBE: refused (not timeout); adb tcpip 5444 over the shelf Pi\'s USB fixes it', () => {
    start();
    const ids = scenario(
      { op: 'device.provision', params: { device: 'dev-data-mini3', merchant: 'AUTO-US-NOPIN-02' } },
      { faultId: 'device.adbTcpReset', params: { device: 'dev-data-mini3' } },
      { op: 'jenkins.seedBuild', params: { job: 'Java/laz-oobe-merchant-swap', params: { ROBOT_NAME: 'data', MERCHANT: 'AUTO-US-NOPIN-02' }, result: 'SUCCESS', robot: 'data', atMs: lab().time.nowMs - 120_000, by: 'riley' } },
    );
    expect(consoleOf(lastBuild('Java/laz-oobe-merchant-swap')!)).toContain('laz: merchant active');
    // First adb command of the session starts the workstation's ADB server (two daemon lines first).
    expect(sh('adb connect 10.42.30.31:5444')).toEqual(['* daemon not running; starting now at tcp:5037', '* daemon started successfully', "failed to connect to '10.42.30.31:5444': Connection refused"]);
    const b = build('Java/uia-remote-printerless-smoke', { ROBOT_NAME: 'data', DEVICE_TYPE: 'MINI_3' });
    expect(b.result).toBe('FAILURE');
    expect(consoleOf(b)).toContain("failed to connect to '10.42.30.31:5444': Connection refused");
    nextHealthCheck();
    expect(robot('data').status).toBe('AVAILABLE');
    const usb = sh('ssh pi@10.42.10.30 adb devices');
    expect(usb).toContain('SIM-M3-000031\tdevice');
    expect(usb).toContain('SIM-F4-000032\tdevice');
    expect(sh('ssh pi@10.42.10.30 adb -s SIM-M3-000031 tcpip 5444')).toContain('restarting in TCP mode port: 5444');
    run(1_500);
    expect(sh('adb connect 10.42.30.31:5444')).toEqual(['connected to 10.42.30.31:5444']);
    expect(resolved(ids)).toBe(true);
    expect(build('Java/uia-remote-printerless-smoke', { ROBOT_NAME: 'data', DEVICE_TYPE: 'MINI_3' }).result).toBe('SUCCESS');
  });

  it('INC28 real-run variant: Laz skips restore-adb silently; the swap still ends "laz: merchant active"', () => {
    start();
    scenario({ faultId: 'laz.skipAdbRestore', params: { device: 'dev-data-mini3' } });
    const b = build('Java/laz-oobe-merchant-swap', { ROBOT_NAME: 'data', MERCHANT: 'AUTO-US-NOPIN-02' });
    expect(b.result).toBe('SUCCESS');
    expect(b.console).toContain('laz: merchant active');
    expect(consoleOf(b)).not.toContain('laz: adb tcpip 5444');
    expect(lab().devices['dev-data-mini3']!.adbTcpPort).toBeNull();
  });

  it('INC29 stale wiki config: theme first, then kernelType; fixing both passes', () => {
    start();
    const path = '~/CodeWithMe/alex/uia-remote/config.properties';
    const ids = scenario(
      { op: 'repo.clone', params: { repo: 'uia-remote' } },
      { op: 'config.write', params: { path, fixture: 'target', robot: 'data' } },
      { faultId: 'config.themeKernel', params: { path } },
    );
    expect(local('HomeScreenTest', path).lines).toEqual(['java.lang.IllegalStateException: Unsupported theme "classic" — only "avocado" is supported']);
    // Alex's Code With Me file is edited in the IDE (a workstation file write).
    const fix = (k: string, v: string) => {
      const text = lab().workstation.files[path]!.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`);
      expect(sim.host.writeFile('ws-17', path, text, 'player').ok).toBe(true);
    };
    fix('theme', 'avocado');
    expect(local('HomeScreenTest', path).lines).toEqual(['java.lang.IllegalStateException: Unsupported kernelType "SPA" — use "CPA"']);
    fix('kernelType', 'CPA');
    expect(resolved(ids)).toBe(true);
    const last = local('HomeScreenTest', path);
    expect(last.passed, last.lines.join('\n')).toBe(true);
  });

  it('INC30 Duo local run: CFD handle at a guessed IP → No route to host; same IP for MFD and CFD passes TaxTestDuo', () => {
    start();
    const ids = scenario(
      { op: 'orca.setStatus', params: { robot: 'r2-d2', status: 'RESERVED', by: 'player' } },
      { op: 'repo.clone', params: { repo: 'uia-remote' } },
      { op: 'config.write', params: { fixture: 'target', robot: 'r2-d2' } },
      { faultId: 'config.value', params: { key: 'customerFacingDeviceIp', value: '10.42.30.19' } },
    );
    const r1 = local('TaxTestDuo');
    expect(r1.passed).toBe(false);
    expect(r1.lines).toContain('[runner] MFD handle 10.42.30.14:5444 connected');
    expect(r1.lines).toContain('[runner] CFD handle 10.42.30.19:5444 → No route to host');
    setCfg('customerFacingDeviceIp', '10.42.30.14');
    expect(resolved(ids)).toBe(true);
    const r2 = local('TaxTestDuo');
    expect(r2.passed).toBe(true);
    expect(cfg()).toMatch(/^runType=tethered$/m);
  });

  it('INC31 local run collides with a Jenkins build when MEGATRON is not Reserved; Reserve first → clean', () => {
    start();
    scenario({ op: 'repo.clone', params: { repo: 'uia-remote' } }, { op: 'config.write', params: { fixture: 'target', robot: 'megatron' } });
    const lr = sim.runner.runLocal('uia-remote', UIA_PATHS.test('TaxTest'), 'player');
    if (!lr.ok) throw new Error(lr.error);
    run(3_000);
    const jb = sim.jenkins.build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' }, 'player');
    runUntil(() => sim.runner.output(lr.value.runId).done, 200_000);
    const b = finish(jb.ok ? jb.value.buildId : '');
    const runState = lab().local.runs[lr.value.runId]!;
    expect(runState.overlappedJenkins || b.result !== 'SUCCESS').toBe(true);
    run(5_000);
    // Reserve, run, release.
    sim.orca.reserveRobot(robot('megatron').id, 'player');
    const jb2 = sim.jenkins.build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' }, 'player');
    const r = local('TaxTest');
    expect(r.passed).toBe(true);
    expect(lab().local.runs[r.runId]!.overlappedJenkins).toBe(false);
    const b2 = finish(jb2.ok ? jb2.value.buildId : '');
    expect(b2.failureCode).toBe('ROBOT_BLOCKED');
    expect(b2.console).toContain('[orca] 409 Conflict: robot megatron is Reserved (player)');
    sim.orca.setRobotStatus(robot('megatron').id, 'AVAILABLE', 'player');
    expect(robot('megatron').statusHistory.some((h) => h.to === 'RESERVED' && h.by === 'player')).toBe(true);
  });
});

describe('INC32–INC38 uia-remote code and OCR', () => {
  it('INC32 empty waitForScreen(): some PL2 runs fail with the exact UiObjectNotFoundException; implementing it makes 3 in a row green', () => {
    start();
    const ids = scenario({ faultId: 'uia.waitForScreenStub', params: { class: 'RegisterHomeScreen' } });
    const results: string[] = [];
    let seen = '';
    // p(fail) ≈ 0.55 per run (Sim §3.19.5); run until the first red one (12 runs max).
    for (let i = 0; i < 12 && !seen; i++) {
      const b = build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' });
      results.push(String(b.result));
      if (b.result !== 'SUCCESS') seen = consoleOf(b);
    }
    expect(results).toContain('FAILURE');
    expect(seen).toContain('androidx.test.uiautomator.UiObjectNotFoundException: UiSelector[TEXT=Review Order]');
    expect(seen).toContain('at com.labsim.uia.pageobjects.RegisterHomeScreen.reviewOrder(RegisterHomeScreen.java:21)');
    // Fix: restore the real waitForScreen (revert the cleanup commit) and push to main (uia-remote accepts pushes).
    const head = lab().repos['uia-remote'].branches['main']!;
    sim.git.clone('uia-remote', 'player');
    expect(sim.git.revert('uia-remote', head, 'player').ok).toBe(true);
    expect(sim.git.push('uia-remote').ok).toBe(true);
    expect(resolved(ids)).toBe(true);
    for (let i = 0; i < 3; i++) expect(build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' }).result).toBe('SUCCESS');
  });

  it('INC33 deviceType=Mini on TARS: scrolls horizontally ×5, App not found; Flex passes', () => {
    start();
    const ids = scenario(
      { op: 'orca.setStatus', params: { robot: 'tars', status: 'RESERVED', by: 'alex' } },
      { op: 'repo.clone', params: { repo: 'uia-remote' } },
      { op: 'config.write', params: { fixture: 'target', robot: 'tars' } },
      { faultId: 'config.value', params: { key: 'deviceType', value: 'Mini' } },
    );
    const r1 = local('HomeScreenTest');
    expect(r1.passed).toBe(false);
    expect(r1.lines.filter((l) => l === '[HomeScreen] open("Register"): scrolling horizontally (Mini/Station)…')).toHaveLength(5);
    expect(r1.lines).toContain("AssertionError: App 'Register' not found on HomeScreen");
    setCfg('deviceType', 'Flex');
    expect(resolved(ids)).toBe(true);
    expect(local('HomeScreenTest').passed).toBe(true);
  });

  it('INC34 PR #431: three review reasons + Request changes are recorded on the PR', () => {
    start();
    scenario({ op: 'github.seedPr', params: { repo: 'uia-remote', number: 431, fixture: 'uia-431-lockscreen', author: 'alex', title: 'Add LockScreen page object' } });
    const pr = () => lab().repos['uia-remote'].pullRequests.find((p) => p.number === 431)!;
    expect(pr().state).toBe('open');
    const paths = pr().files.map((f) => f.path);
    expect(paths.some((p) => p.startsWith('app/src/main/'))).toBe(true);
    for (const [reason, body] of [['main-edit', 'QA never modifies main'], ['missing-isScreenPresent', 'Missing mandatory isScreenPresent()'], ['port-5555', 'portNumber must be 5444']] as const) {
      expect(sim.git.comment('uia-remote', 431, { body, reason, path: null, line: null } as never, 'player').ok).toBe(true);
    }
    expect(sim.git.requestChanges('uia-remote', 431, 'player').ok).toBe(true);
    expect(pr().verdict).toBe('CHANGES_REQUESTED');
    expect(new Set(pr().comments.map((c) => c.reason))).toEqual(new Set(['main-edit', 'missing-isScreenPresent', 'port-5555']));
  });

  it('INC35 teardown missing: next test sees RegisterOrderScreen; KEYCODE_HOME + restored teardown → green', () => {
    start();
    const ids = scenario({ faultId: 'uia.teardownMissing', params: { test: 'TaxTest' } }, { op: 'device.stage', params: { device: 'dev-megatron-mfd', stage: 'register-order' } });
    const b = build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' });
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('AssertionError: HomeScreen.isScreenPresent() == false — current screen: RegisterOrderScreen');
    expect(sh('adb connect 10.42.30.21:5444')).toEqual(['* daemon not running; starting now at tcp:5037', '* daemon started successfully', 'connected to 10.42.30.21:5444']);
    sh('adb -s 10.42.30.21:5444 shell input keyevent KEYCODE_HOME');
    run(1_500);
    const head = lab().repos['uia-remote'].branches['main']!;
    sim.git.clone('uia-remote', 'player');
    sim.git.revert('uia-remote', head, 'player');
    sim.git.push('uia-remote');
    expect(resolved(ids)).toBe(true);
    expect(build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'megatron' }).result).toBe('SUCCESS');
  });

  it('INC36 label 10 px down: "TOTAI $10.B3"; box re-measured to y 298 → match and PL7 green', () => {
    start();
    const ids = scenario({ faultId: 'ocr.labelShift', params: { device: 'dev-r2-d2-duo', px: 10 } });
    const b = build('Java/uia-remote-duo-cfd');
    expect(b.result).toBe('FAILURE');
    expect(b.console).toContain('[ocr] capture webcam → crop 236x44@412,288 → tesseract → "TOTAI $10.B3" → match=false');
    expect(b.failureCode).toBe('OCR_MISMATCH');
    const row = Object.values(lab().orca.screenCompareImages).find((c) => c.name === 'CFD_TOTAL')!;
    sim.orca.saveScreenCompareImage({ id: row.id, bbox: { ...row.bbox, y: 298 } }, 'player');
    expect(resolved(ids)).toBe(true);
    expect(build('Java/uia-remote-duo-cfd').result).toBe('SUCCESS');
  });

  it('INC37-A capitalisation: "Total $10.83" ≠ "TOTAL $10.83"; Expected = what the CFD shows', () => {
    start();
    const ids = scenario({ faultId: 'ocr.capitalisation', params: { device: 'dev-r2-d2-duo' } });
    const b = build('Java/uia-remote-duo-cfd');
    expect(b.console).toContain('[ocr] capture webcam → crop 236x44@412,288 → tesseract → "Total $10.83" → match=false');
    const row = Object.values(lab().orca.screenCompareImages).find((c) => c.name === 'CFD_TOTAL')!;
    sim.orca.saveScreenCompareImage({ id: row.id, expectedText: 'Total $10.83' } as never, 'player');
    expect(resolved(ids)).toBe(true);
    expect(build('Java/uia-remote-duo-cfd').result).toBe('SUCCESS');
  });

  it('INC37-B typo in Expected: OCR reads the right text, match=false until fixed', () => {
    start();
    const ids = scenario({ faultId: 'ocr.typo', params: { compare: 'CFD_TOTAL' } });
    const b = build('Java/uia-remote-duo-cfd');
    expect(b.console).toContain('[ocr] capture webcam → crop 236x44@412,288 → tesseract → "TOTAL $10.83" → match=false');
    const row = Object.values(lab().orca.screenCompareImages).find((c) => c.name === 'CFD_TOTAL')!;
    sim.orca.saveScreenCompareImage({ id: row.id, expectedText: 'TOTAL $10.83' } as never, 'player');
    expect(resolved(ids)).toBe(true);
  });

  it('INC38 migrate CFD_THANK_YOU to UIA 2.3: new page object + test change pass locally on a Reserved R2-D2; row deprecated', () => {
    start();
    const row = Object.values(lab().orca.screenCompareImages).find((c) => c.name === 'CFD_THANK_YOU')!;
    expect(row.usedBy ?? []).toContain('uia-remote:DuoCheckoutTest');
    sim.git.clone('uia-remote', 'player');
    const files = lab().repos['uia-remote'].local!.files;
    const totals = files[UIA_PATHS.po('CfdTotalsScreen')]!;
    expect(totals).toContain('displayId(');
    const po = `package com.labsim.uia.pageobjects;

import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.Until;

/** CfdThankYouScreen: the Duo customer display "Thank you" (UIA 2.3 display 1). */
public class CfdThankYouScreen extends BaseTest {

    // Zone 1 — element locators
    private final BySelector thankYou = By.text("Thank you").displayId(CFD_DISPLAY_ID);

    // Zone 2 — helper / action methods
    public void waitForScreen() {
        device.wait(Until.hasObject(thankYou), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(thankYou);
    }
}
`;
    sim.git.writeFile('uia-remote', UIA_PATHS.po('CfdThankYouScreen'), po);
    const testPath = UIA_PATHS.test('DuoCheckoutTest');
    const t = files[testPath]!
      .replace('import com.labsim.uia.pageobjects.HomeScreen;', 'import com.labsim.uia.pageobjects.CfdThankYouScreen;\nimport com.labsim.uia.pageobjects.HomeScreen;')
      .replace('        assertTrue(orca.screenCompare("CFD_THANK_YOU"));', '        CfdThankYouScreen cfdThankYou = new CfdThankYouScreen();\n        cfd.run(cfdThankYou::waitForScreen);\n        cfd.run(() -> assertTrue(cfdThankYou.isScreenPresent()));');
    expect(t).not.toContain('screenCompare("CFD_THANK_YOU")');
    sim.git.writeFile('uia-remote', testPath, t);
    sim.faults.applySetup({ op: 'config.write', params: { fixture: 'target', robot: 'r2-d2' } });
    sim.orca.reserveRobot(robot('r2-d2').id, 'player');
    const r = local('DuoCheckoutTest');
    expect(r.lines).toContain('[CFD] Thank you ✓ (UIA 2.3)');
    expect(r.passed).toBe(true);
    sim.orca.saveScreenCompareImage({ id: row.id, deprecated: true } as never, 'player');
    expect(Object.values(lab().orca.screenCompareImages).find((c) => c.name === 'CFD_THANK_YOU')!.deprecated).toBe(true);
    sim.orca.setRobotStatus(robot('r2-d2').id, 'AVAILABLE', 'player');
    sim.git.checkout('uia-remote', 'migrate-cfd-thank-you', true);
    sim.git.stage('uia-remote', [UIA_PATHS.po('CfdThankYouScreen'), testPath]);
    sim.git.commit('uia-remote', 'Migrate CFD_THANK_YOU to UIA 2.3', 'player');
    expect(sim.git.push('uia-remote').ok).toBe(true);
    const pr = sim.git.createPullRequest('uia-remote', 'Migrate CFD_THANK_YOU to UIA 2.3', '', 'migrate-cfd-thank-you', 'player');
    expect(pr.ok).toBe(true);
    sim.setConfig({ npcAutoMerge: true });
    run(25_000);
    const p = lab().repos['uia-remote'].pullRequests.find((x) => x.number === (pr.ok ? pr.value.number : -1))!;
    expect(p.comments.map((c) => c.body)).toEqual([]);
  });
});

describe('INC39–INC46 Jenkins parameters, statuses, swaps, tethering', () => {
  it('INC39 DEVICE_TYPE=flex_3: exact enum exception, WALL-E/EVE stay Available; FLEX_3 → green', () => {
    start();
    const ids = scenario({ faultId: 'jenkins.envCase', params: { job: 'Java/uia-remote-regression-flex', value: 'flex_3' } });
    const b = build('Java/uia-remote-regression-flex');
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('ENUM_CASE');
    expect(b.console).toContain('[orca] checkout request deviceType=flex_3');
    expect(b.console).toContain('java.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.flex_3');
    expect(b.console.at(-1)).toBe('Finished: FAILURE');
    expect(robot('wall-e').status).toBe('AVAILABLE');
    const job = sim.jenkins.job('Java/uia-remote-regression-flex')!;
    sim.jenkins.saveJob(job.id, { savedParams: { ...job.savedParams, DEVICE_TYPE: 'FLEX_3' } }, 'player');
    expect(resolved(ids)).toBe(true);
    const b2 = build('Java/uia-remote-regression-flex');
    expect(b2.console).toContain('[orca] checkout → wall-e (FLEX_3) OK');
    expect(b2.result).toBe('SUCCESS');
    expect(b2.params['DEVICE_TYPE']).toBe('FLEX_3');
  });

  it('INC40 PayCore rig overwritten: merchant mismatch; Unavailable + named Laz swap back → PL8 green, ROSIE Unavailable', () => {
    start();
    const ids = scenario(
      { faultId: 'orca.statusOverride', params: { robot: 'rosie', status: 'AVAILABLE', by: 'alex' } },
      { faultId: 'merchant.overwritten', params: { robot: 'rosie' } },
      { op: 'jenkins.seedBuild', params: { job: 'Java/uia-remote-regression-flex', params: { DEVICE_TYPE: 'FLEX_POCKET' }, result: 'SUCCESS', robot: 'rosie', by: 'riley', atMs: lab().time.nowMs - 300_000 } },
    );
    expect(notes('rosie')[0]).toMatch(/STATUS Unavailable → Available \(alex\)$/);
    // Riley's seeded build (GP INC40 evidence) shows the overwrite.
    const riley = lastBuild('Java/uia-remote-regression-flex')!;
    expect(riley.triggeredBy).toBe('riley');
    expect(riley.console).toContain('[orca] checkout → rosie (FLEX_POCKET) OK');
    expect(riley.console).toContain('ubi: routing merchant switch → AUTO-US-NOPIN-01');
    expect(riley.console).toContain('laz: merchant active');
    const b = build('Java/paycore-standalone-matrix');
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('MERCHANT_MISMATCH');
    expect(b.console).toContain('[paycore] merchant mismatch: expected PAYCORE-STANDALONE-01, got AUTO-US-NOPIN-01');
    sim.orca.setRobotStatus(robot('rosie').id, 'UNAVAILABLE', 'player');
    const laz = build('Java/laz-oobe-merchant-swap', { ROBOT_NAME: 'rosie', MERCHANT: 'PAYCORE-STANDALONE-01' });
    expect(laz.result).toBe('SUCCESS');
    expect(laz.console).toContain('laz: merchant active');
    expect(laz.console).toContain('[orca] released rosie → Unavailable');
    expect(resolved(ids)).toBe(true);
    const b2 = build('Java/paycore-standalone-matrix');
    expect(b2.result).toBe('SUCCESS');
    expect(robot('rosie').status).toBe('UNAVAILABLE');
  });

  it('INC41 named job: blank → ONLY_UNAVAILABLE, HRN → 404; system name → success and auto-reset to Unavailable', () => {
    start();
    const a = build('Java/paycore-standalone-matrix', { ROBOT_NAME: '' });
    expect(a.failureCode).toBe('ONLY_UNAVAILABLE');
    expect(consoleOf(a)).toContain('No Available robot matches FLEX_POCKET (rosie is Unavailable)');
    const b = build('Java/paycore-standalone-matrix', { ROBOT_NAME: 'ROSIE' });
    expect(b.failureCode).toBe('ROBOT_NOT_FOUND');
    expect(b.console).toContain("[orca] 404 Not Found: no robot named 'ROSIE'");
    const statuses: string[] = [];
    const r = sim.jenkins.build('Java/paycore-standalone-matrix', { ROBOT_NAME: 'rosie' }, 'player');
    runUntil(() => {
      statuses.push(robot('rosie').status);
      return lab().jenkins.builds[r.ok ? r.value.buildId : '']?.state === 'finished';
    }, 300_000);
    const c = lab().jenkins.builds[r.ok ? r.value.buildId : '']!;
    expect(c.result).toBe('SUCCESS');
    expect(c.console).toContain('Checked out robot rosie (named)');
    expect(c.console).toContain('[orca] released rosie → Unavailable');
    expect(statuses.includes('AVAILABLE')).toBe(false);
  });

  it('INC41 auto-reset: someone flips ROSIE Available mid-run; release resets it to Unavailable with the orca note', () => {
    start();
    const r = sim.jenkins.build('Java/paycore-standalone-matrix', { ROBOT_NAME: 'rosie' }, 'player');
    runUntil(() => robot('rosie').checkout != null, 60_000);
    sim.orca.setRobotStatus(robot('rosie').id, 'AVAILABLE', 'alex');
    const b = finish(r.ok ? r.value.buildId : '');
    expect(robot('rosie').status).toBe('UNAVAILABLE');
    expect(notes('rosie')[0]).toMatch(new RegExp(`STATUS Available → Unavailable \\(orca: named job Java/paycore-standalone-matrix#${b.number} finished\\)$`));
  });

  it('INC42/43 Flex 1 → Flex 2 with a new Device row (legacy row kept), confirmation build; rollback is one dropdown', () => {
    start();
    const j5 = robot('johnny-5');
    const legacy = j5.deviceId!;
    sim.orca.setRobotStatus(j5.id, 'OFFLINE', 'player');
    expect(sim.device.swapHardware('johnny-5', 'FLEX_2', 'player', { deviceId: 'dev-spare-flex2' }).ok).toBe(true);
    const id = sim.orca.saveDevice({ name: 'johnny-5-flex2', deviceType: 'FLEX_2', serial: 'SIM-F2-000015', ip: '10.42.30.15', label: 'Flex 2 (JOHNNY-5)' }, 'player');
    expect(id.ok).toBe(true);
    sim.orca.saveRobot({ id: j5.id, deviceId: id.ok ? id.value : 0 }, 'player');
    runUntil(() => lab().devices['dev-spare-flex2']!.power === 'on', 40_000);
    sim.orca.setRobotStatus(j5.id, 'AVAILABLE', 'player');
    expect(lab().orca.devices[legacy]?.deviceType).toBe('FLEX_1');
    const doc = sim.orca.capabilityDocument(j5.id)!;
    expect(doc['deviceType']).toBe('FLEX_2');
    const b = build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'johnny-5' });
    expect(b.result).toBe('SUCCESS');
    // INC43 rollback.
    sim.orca.setRobotStatus(j5.id, 'OFFLINE', 'player');
    expect(sim.device.swapHardware('johnny-5', 'FLEX_1', 'player', { deviceId: 'dev-johnny-5-flex1' }).ok).toBe(true);
    sim.orca.saveRobot({ id: j5.id, deviceId: legacy }, 'player');
    runUntil(() => lab().devices['dev-johnny-5-flex1']!.power === 'on', 40_000);
    sim.orca.setRobotStatus(j5.id, 'AVAILABLE', 'player');
    expect(build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'johnny-5' }).result).toBe('SUCCESS');
  });

  it('INC44 dead Duo 2: No route to host on k-9; K-9 Offline + DEVICE_TYPE=MINI_3 lands on data/bumblebee and passes', () => {
    start();
    scenario({ faultId: 'device.dead', params: { device: 'dev-k-9-duo2' } });
    const b = build('Java/uia-remote-printerless-smoke');
    expect(b.result).toBe('FAILURE');
    expect(consoleOf(b)).toContain("adb: failed to connect to '10.42.30.51:5444': No route to host");
    nextHealthCheck();
    expect(robot('k-9').status).toBe('AVAILABLE');
    sim.orca.setRobotStatus(robot('k-9').id, 'OFFLINE', 'player');
    const b2 = build('Java/uia-remote-printerless-smoke', { DEVICE_TYPE: 'MINI_3' });
    expect(b2.result).toBe('SUCCESS');
    expect(['data', 'bumblebee']).toContain(lab().orca.robots[b2.robotId!]!.name);
  });

  it('INC45 MFD/CFD cleared on OPTIMUS: RUN_TYPE=standalone → TETHER_REQUIRED; relink → PL2 on optimus green', () => {
    start();
    const ids = scenario({ faultId: 'orca.tetherCleared', params: { robot: 'optimus' } });
    const b = build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'optimus', BACKEND_ENV: 'STG' });
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('TETHER_REQUIRED');
    expect(b.console).toContain('[env] RUN_TYPE=standalone');
    expect(b.console).toContain('[runner] MFD relation empty → standalone');
    expect(consoleOf(b)).toContain('AssertionError: TaxTest requires a tethered rig (MFD/CFD)');
    const dev = (name: string) => Object.values(lab().orca.devices).find((d) => d.name === name)!.id;
    sim.orca.saveRobot({ id: robot('optimus').id, mfdDeviceId: dev('optimus-mfd'), cfdDeviceId: dev('optimus-cfd') }, 'player');
    expect(resolved(ids)).toBe(true);
    expect(build('Java/uia-remote-tethered-tax', { ROBOT_NAME: 'optimus', BACKEND_ENV: 'STG' }).result).toBe('SUCCESS');
  });

  it('INC46 TARS cloned as tethered: drives OPTIMUS\'s devices; clearing MFD/CFD → PL6 on tars green', () => {
    start();
    const ids = scenario({ faultId: 'orca.tetherCloned', params: { robot: 'tars', from: 'optimus' } });
    const b = build('Java/go-sdk-sale-smoke', { ROBOT_NAME: 'tars' });
    expect(b.console).toContain('[runner] Tethered rig detected (MFD populated) → MFD 10.42.30.23:5444, CFD 10.42.30.24:5444');
    sim.orca.saveRobot({ id: robot('tars').id, mfdDeviceId: null, cfdDeviceId: null }, 'player');
    expect(resolved(ids)).toBe(true);
    const b2 = build('Java/go-sdk-sale-smoke', { ROBOT_NAME: 'tars' });
    expect(b2.result).toBe('SUCCESS');
    expect(consoleOf(b2)).not.toContain('Tethered rig detected');
  });
});
