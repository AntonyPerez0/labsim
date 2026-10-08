/**
 * Scenario tests for the actionable behaviours of docs/reference/REMOVED-internal-reference.md that no
 * incident suite already pins down: the GPU blade hosting the VMs, every config.properties validation
 * rule (Ref §4), Pigeon's platform list (Ref §5), HomeScreen.open() on Mini/Station (Ref §4 Zone 2),
 * Morgan's review of a QA edit under `main` (Ref §4), the 12 V NUC line (Ref §6) and the ADB-bot
 * merchant rule (Ref §6). Everything goes through the public SimApi.
 */
import { describe, expect, it, vi } from 'vitest';
import { UIA_PATHS } from '../seed/repos/uiaRemote';
import { build, lab, resolved, robot, run, runUntil, scenario, sh, sim, start } from './kit';

vi.setConfig({ testTimeout: 300_000 });

function local(test: string): { lines: string[]; passed: boolean | null } {
  const r = sim.runner.runLocal('uia-remote', UIA_PATHS.test(test), 'player');
  if (!r.ok) throw new Error(r.error);
  runUntil(() => sim.runner.output(r.value.runId).done, 200_000);
  return sim.runner.output(r.value.runId);
}
const cfg = (): string => lab().repos['uia-remote'].local!.files['config.properties']!;
const setCfg = (key: string, value: string | null): void => {
  const text = value === null ? cfg().replace(new RegExp(`^${key}=.*\\n?`, 'm'), '') : cfg().replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${value}`);
  expect(sim.git.writeFile('uia-remote', 'config.properties', text).ok).toBe(true);
};

describe('Ref §1/§6 GPU blade hosts the VMs (Orca, Jenkins, Ollama)', () => {
  it('a blade power cycle takes every VM down (running builds die JENKINS_RESTART); blade 90 s + VMs 45 s brings them back', () => {
    start();
    const r = sim.jenkins.build('Java/uia-remote-regression-flex', { ROBOT_NAME: 'wall-e' }, 'player');
    if (!r.ok) throw new Error(r.error);
    run(8_000);
    expect(sim.host.powerCycle('gpu-blade', 'player').ok).toBe(true);
    run(2_000);
    for (const vm of ['orca-vm', 'jenkins-vm', 'ollama-vm']) expect(lab().hosts[vm]!.os, vm).not.toBe('RUNNING');
    expect(sh('curl -s -o /dev/null -w "%{http_code}" http://orca.lab.local:8080/management/health')).not.toEqual(['200']);
    runUntil(() => lab().jenkins.builds[r.value.buildId]!.state === 'finished' && lab().hosts['ollama-vm']!.services['ollama']?.running === true && lab().orca.app.up, 400_000);
    const b = lab().jenkins.builds[r.value.buildId]!;
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('JENKINS_RESTART');
    expect(b.console).toContain('Jenkins is restarting — build interrupted');
    run(20_000);
    expect(sh('curl -s -o /dev/null -w "%{http_code}" http://orca.lab.local:8080/management/health')).toEqual(['200']);
    expect(sh('curl -s http://10.42.1.12:11434/api/tags').join('\n')).toContain('llava:latest');
    expect(build('Java/uia-remote-regression-flex', { ROBOT_NAME: 'wall-e' }).result).toBe('SUCCESS');
  });
});

describe('Ref §4 config.properties (local runs; Jenkins injects the same keys in CI)', () => {
  it('validates every key in order with the exact messages; portNumber=5555 is valid (the danger)', () => {
    start();
    scenario({ op: 'repo.clone', params: { repo: 'uia-remote' } }, { op: 'config.write', params: { fixture: 'target', robot: 'megatron' } });
    expect(cfg()).toMatch(/^runType=tethered$/m);
    expect(cfg()).toMatch(/^merchantFacingDeviceIp=10\.42\.30\.21$/m);
    expect(cfg()).toMatch(/^customerFacingDeviceIp=10\.42\.30\.22$/m);
    expect(cfg()).toMatch(/^deviceType=Station$/m);
    expect(cfg()).toMatch(/^theme=avocado$/m);
    expect(cfg()).toMatch(/^kernelType=CPA$/m);
    expect(cfg()).toMatch(/^portNumber=5444$/m);
    sim.orca.reserveRobot(robot('megatron').id, 'player');
    const good = cfg();
    const cases: [string, string | null, string][] = [
      ['customerFacingDeviceIp', null, "java.lang.IllegalStateException: config.properties missing key 'customerFacingDeviceIp'"],
      ['theme', 'classic', 'java.lang.IllegalStateException: Unsupported theme "classic" — only "avocado" is supported'],
      ['kernelType', 'SPA', 'java.lang.IllegalStateException: Unsupported kernelType "SPA" — use "CPA"'],
      ['deviceType', 'FLEX_4', 'java.lang.IllegalArgumentException: unknown deviceType "FLEX_4" (expected Mini, Flex or Station)'],
      ['runType', 'duo', 'java.lang.IllegalStateException: Unsupported runType "duo"'],
      ['portNumber', 'five', 'java.lang.IllegalStateException: Invalid portNumber "five"'],
    ];
    for (const [k, v, msg] of cases) {
      expect(sim.git.writeFile('uia-remote', 'config.properties', good).ok).toBe(true);
      setCfg(k, v);
      const r = local('TaxTest');
      expect(r.passed, k).toBe(false);
      expect(r.lines, k).toContain(msg);
    }
    expect(sim.git.writeFile('uia-remote', 'config.properties', good).ok).toBe(true);
    expect(local('TaxTest').passed).toBe(true);
    // A missing file.
    sim.git.deleteFile('uia-remote', 'config.properties');
    expect(local('TaxTest').lines).toContain('java.lang.IllegalStateException: config.properties not found — copy config.properties.example');
  });

  it('Station Duo: MFD and CFD IPs are the same; tethered runType drives both displays of R2-D2', () => {
    start();
    scenario({ op: 'orca.setStatus', params: { robot: 'r2-d2', status: 'RESERVED', by: 'player' } }, { op: 'repo.clone', params: { repo: 'uia-remote' } }, { op: 'config.write', params: { fixture: 'target', robot: 'r2-d2' } });
    expect(cfg()).toMatch(/^merchantFacingDeviceIp=10\.42\.30\.14$/m);
    expect(cfg()).toMatch(/^customerFacingDeviceIp=10\.42\.30\.14$/m);
    expect(cfg()).toMatch(/^runType=tethered$/m);
    const r = local('TaxTestDuo');
    expect(r.passed).toBe(true);
    expect(r.lines).toContain('[runner] MFD handle 10.42.30.14:5444 connected');
    expect(r.lines).toContain('[runner] CFD handle 10.42.30.14:5444 connected');
  });
});

describe('Ref §4 Zone 2 abstraction: open(appName) is vertical on Flex, horizontal on Mini/Station', () => {
  it('HomeScreenTest passes on a Mini (horizontal) and a Station; swapping the branches breaks both families', () => {
    start();
    expect(build('Java/uia-remote-regression-mini', { ROBOT_NAME: 'bumblebee' }).result).toBe('SUCCESS');
    const ids = scenario({ faultId: 'uia.scrollSwapped', params: { mode: 'swapped' } });
    const mini = build('Java/uia-remote-regression-mini', { ROBOT_NAME: 'bumblebee' });
    expect(mini.result).toBe('FAILURE');
    expect(mini.console).toContain('[HomeScreen] open("Register"): scrolling vertically (Flex)…');
    const flex = build('Java/uia-remote-regression-flex', { ROBOT_NAME: 'wall-e' });
    expect(flex.console).toContain('[HomeScreen] open("Register"): scrolling horizontally (Mini/Station)…');
    expect(flex.console).toContain("AssertionError: App 'Register' not found on HomeScreen");
    expect(resolved(ids)).toBe(false);
  });
});

describe('Ref §4 repository rules: QA never modifies main; port 5444', () => {
  it("Morgan's scripted review flags a change under app/src/main and a committed portNumber=5555", () => {
    start();
    sim.setConfig({ npcAutoMerge: true });
    sim.git.clone('uia-remote', 'player');
    sim.git.checkout('uia-remote', 'feat/touch-main', true);
    const reg = lab().repos['uia-remote'].local!.files[UIA_PATHS.appReg]!;
    sim.git.writeFile('uia-remote', UIA_PATHS.appReg, `${reg}// registration tweak\n`);
    sim.git.stage('uia-remote', [UIA_PATHS.appReg]);
    sim.git.commit('uia-remote', 'Tweak app registration', 'player');
    expect(sim.git.push('uia-remote').ok).toBe(true);
    const pr = sim.git.createPullRequest('uia-remote', 'Tweak app registration', '', 'feat/touch-main', 'player');
    if (!pr.ok) throw new Error(pr.error);
    run(22_000);
    const p = lab().repos['uia-remote'].pullRequests.find((x) => x.number === pr.value.number)!;
    expect(p.state).toBe('open');
    expect(p.verdict).toBe('CHANGES_REQUESTED');
    expect(p.comments.map((c) => c.body)).toContain('QA never modifies main');
  });
});

describe('Ref §5 Pigeon: one JSON test targets several platforms; the job platform must be listed', () => {
  it('LSTR platform ANDROID not in test platforms → LSTR_PLATFORM; the swipe test lists 4 platforms', () => {
    start();
    const main = (p: string) => lab().repos['pigeon'].files[p]!;
    expect(JSON.parse(main('tests/sale/swipe_sale_print.json')).platforms).toEqual(['REST', 'ANDROID', 'WINDOWS', 'IOS']);
    sim.git.clone('pigeon', 'player');
    const path = 'tests/sale/swipe_sale_print.json';
    const text = lab().repos['pigeon'].local!.files[path]!.replace('"platforms": ["REST", "ANDROID", "WINDOWS", "IOS"]', '"platforms": ["REST", "IOS"]');
    sim.git.checkout('pigeon', 'rest-only', true);
    sim.git.writeFile('pigeon', path, text);
    sim.git.stage('pigeon', [path]);
    sim.git.commit('pigeon', 'REST and iOS only', 'player');
    sim.git.push('pigeon');
    const pr = sim.git.createPullRequest('pigeon', 'REST and iOS only', '', 'rest-only', 'player');
    if (!pr.ok) throw new Error(pr.error);
    expect(sim.git.mergePullRequest('pigeon', pr.value.number, 'morgan').ok).toBe(true);
    const b = build('Java/pigeon-android-sale-swipe', { ROBOT_NAME: 'wall-e' });
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('LSTR_PLATFORM');
    expect(b.console).toContain('LSTR platform ANDROID not in test platforms [REST, IOS]');
  });
});

describe('Ref §6 power chain: 120 V → MW-1 24 V → 12 V (NUCs) and 5 V 10 A (Pis), inline fuses', () => {
  it('meter readings along the chain; the 12 V fuse darkens only NUC-03; the 5 V fuses only their Pis', () => {
    start();
    expect(sim.power.measure('MW-1.out').display).toBe('24.1 V DC');
    const v12 = sim.power.measure('REG-12V.out').display;
    expect(v12).toMatch(/^1[12]\.\d\d V DC$/);
    const v5 = sim.power.measure('REG-5V-B.out').display;
    expect(v5).toBe('5.08 V DC');
    scenario({ faultId: 'fuse.blown', params: { fuse: 'F-NUC-12V' } });
    run(200);
    expect(lab().hosts['nuc-03']!.os).toBe('OFF');
    expect(lab().hosts['pi-wall-e']!.os).toBe('RUNNING');
    expect(lab().hosts['minix-01']!.os).toBe('RUNNING'); // Minix boxes are on AC strips, not the 12 V line
  });
});

describe('Ref §6 ADB bots: purely programmatic, PIN-bypass merchants only', () => {
  it('Orca refuses to link a PIN merchant to an ADB-only robot', () => {
    start();
    const westers = Object.values(lab().orca.merchants).find((m) => m.name === 'WESTERS-CA-01')!;
    const r = sim.orca.saveRobot({ id: robot('data').id, merchantConfigId: westers.id }, 'player');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toBe('400 Bad Request: ADB-only robots require a PIN-bypass merchant');
  });
});

describe('Ref §4 directory structure: page objects live in androidTest/…/pageobjects', () => {
  it('a page object filed under testactions breaks the import (cannot find symbol) and Morgan flags it', () => {
    start();
    sim.setConfig({ npcAutoMerge: true });
    scenario({ op: 'orca.setStatus', params: { robot: 'r2-d2', status: 'RESERVED', by: 'player' } }, { op: 'repo.clone', params: { repo: 'uia-remote' } }, { op: 'config.write', params: { fixture: 'target', robot: 'r2-d2' } });
    sim.git.checkout('uia-remote', 'feat/thank-you-po', true);
    const wrongPath = UIA_PATHS.test('CfdThankYouScreen');
    const po = `package com.labsim.uia.testactions;

import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.Until;
import com.labsim.uia.BaseTest;

public class CfdThankYouScreen extends BaseTest {
    // ===== Zone 1: Element Locators =====
    private final BySelector thankYou = By.text("Thank you").displayId(cfdDisplayId);

    // ===== Zone 2: Helper / Action Methods =====
    public void waitForScreen() {
        device.wait(Until.hasObject(thankYou), TIMEOUT_MS);
    }
    public boolean isScreenPresent() {
        return device.hasObject(thankYou);
    }
}
`;
    sim.git.writeFile('uia-remote', wrongPath, po);
    const testPath = UIA_PATHS.test('DuoCheckoutTest');
    const src = lab().repos['uia-remote'].local!.files[testPath]!.replace('import com.labsim.uia.pageobjects.HomeScreen;', 'import com.labsim.uia.pageobjects.CfdThankYouScreen;\nimport com.labsim.uia.pageobjects.HomeScreen;');
    sim.git.writeFile('uia-remote', testPath, src);
    const r = local('DuoCheckoutTest');
    expect(r.passed).toBe(false);
    expect(r.lines.join('\n')).toContain('error: cannot find symbol');
    sim.git.stage('uia-remote', [wrongPath, testPath]);
    sim.git.commit('uia-remote', 'Add CfdThankYouScreen', 'player');
    sim.git.push('uia-remote');
    const pr = sim.git.createPullRequest('uia-remote', 'Add CfdThankYouScreen', '', 'feat/thank-you-po', 'player');
    if (!pr.ok) throw new Error(pr.error);
    run(22_000);
    const p = lab().repos['uia-remote'].pullRequests.find((x) => x.number === pr.value.number)!;
    expect(p.comments.map((c) => c.body)).toContain('Page objects belong in pageobjects');
  });
});
