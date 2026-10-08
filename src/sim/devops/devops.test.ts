/**
 * sim-devops: repo seeds (Sim §2.12), Jenkins (§2.13, §3.18), runners (§3.19–§3.21), git/GitHub (§3.22).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bus } from '@/core/bus';
import { getState, transact } from '@/core/store';
import { sim } from '@/sim';
import type { LabState } from '../types';
import { parseStrictJson, lstrParseError } from './json';
import { parseProperties } from './util';
import { computeEnv } from './jenkins/engine';
import { commitRemote } from './git';
import { treeAt } from './gitCore';
import { methodBody, openDirection, stripJava } from './codefacts';
import { UIA_PATHS } from '../seed/repos/uiaRemote';
import { CONFIG_KEYS } from './config';

const lab = (): LabState => getState().lab;

function runBuild(jobId: string, params: Record<string, string> = {}, maxS = 600): { result: string | null; failureCode: string | null; console: string[] } {
  const r = sim.jenkins.build(jobId, params, 'player');
  if (!r.ok) throw new Error(r.error);
  for (let t = 0; t < maxS * 4; t++) {
    sim.tick(250);
    if (lab().jenkins.builds[r.value.buildId]!.state === 'finished') break;
  }
  const b = lab().jenkins.builds[r.value.buildId]!;
  return { result: b.result, failureCode: b.failureCode, console: [...b.console] };
}

beforeEach(() => {
  sim.reset({ preset: 'test' });
});

describe('repository seeds (Sim §2.12)', () => {
  it('every JSON file on every branch head parses as strict JSON', () => {
    const bad: string[] = [];
    for (const repo of Object.values(lab().repos)) {
      for (const [branch, sha] of Object.entries(repo.branches)) {
        for (const [path, text] of Object.entries(treeAt(repo, sha))) {
          if (!path.endsWith('.json') && !path.endsWith('.jh') && !path.startsWith('.jhipster/')) continue;
          if (!path.endsWith('.json')) continue;
          const r = parseStrictJson(text);
          if (!r.ok) bad.push(`${repo.id}@${branch}:${path}: ${r.error}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it('has the structures a trainee recognises', () => {
    const uia = lab().repos['uia-remote'].files;
    for (const p of [UIA_PATHS.base, UIA_PATHS.po('HomeScreen'), UIA_PATHS.po('LockScreen'), UIA_PATHS.po('NavigationBar'), UIA_PATHS.po('RegisterHomeScreen'), UIA_PATHS.test('TaxTest'), UIA_PATHS.runner, 'pom.xml', 'build.gradle', 'gradlew', 'config.properties.example']) {
      expect(uia[p], p).toBeTypeOf('string');
    }
    expect(Object.keys(uia).some((p) => p.includes('/databases/'))).toBe(true);
    const tax = uia[UIA_PATHS.test('TaxTest')]!;
    for (const s of ['MFD_O1', 'CFD_O1', 'MFD_O2']) expect(tax).toContain(s);
    const home = uia[UIA_PATHS.po('HomeScreen')]!;
    expect(home).toContain('Zone 1');
    expect(home).toContain('Zone 2');
    expect(openDirection(home)).toBe('correct');
    const gort = lab().repos['gort'].files;
    expect(Object.keys(gort).filter((p) => p.startsWith('cards/emv/')).length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(gort).filter((p) => p.startsWith('cards/nfc/')).length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(gort).some((p) => /^config\/screen-locations\/FLEX_3\/RECEIPT_OPTIONS_5\.json$/.test(p))).toBe(true);
    const pigeon = lab().repos['pigeon'].files;
    expect(pigeon['tests/_templates/known_good_actions.json']).toBeTypeOf('string');
    for (const p of ['runners/rest/rest_runner.py', 'runners/android/AndroidLstrRunner.java', 'runners/windows/WindowsLstrRunner.cs', 'runners/ios/IosLstrRunner.swift']) expect(pigeon[p], p).toBeTypeOf('string');
    const orch = lab().repos['orchestrator'].files;
    expect(Object.keys(orch).some((p) => p.startsWith('.jhipster/') && p.endsWith('.json'))).toBe(true);
    expect(Object.keys(orch).some((p) => p.includes('liquibase'))).toBe(true);
  });

  it('config.properties.example carries every key with the lab defaults (Sim §3.19.1)', () => {
    const p = parseProperties(lab().repos['uia-remote'].files['config.properties.example']!);
    for (const k of CONFIG_KEYS) expect(p.values, k).toHaveProperty(k);
    expect(p.values['theme']).toBe('avocado');
    expect(p.values['kernelType']).toBe('CPA');
    expect(p.values['portNumber']).toBe('5444');
  });

  it("carries Jared's coordinate PRs after the receipt QR regression (Sim §2.12 gort row)", () => {
    const prs = lab().repos['gort'].pullRequests;
    const n = (k: number) => prs.find((p) => p.number === k)!;
    expect(n(418)).toMatchObject({ state: 'merged', author: 'jared' });
    expect(n(418).files.some((f) => f.path.startsWith('config/screen-locations/MINI_3/'))).toBe(true);
    expect(n(417)).toMatchObject({ state: 'merged', author: 'jared' });
    expect(n(417).files.some((f) => /RECEIPT_OPTIONS_5\.json$/.test(f.path))).toBe(true);
    expect(n(415).state).toBe('closed');
    expect(n(415).comments.some((c) => c.body.includes('No offsets. Fix the maps.'))).toBe(true);
    const log = Object.values(lab().repos['gort'].commits).map((c) => c.message);
    expect(log).toContain('Add INTERAC_CA_TAP card definition');
  });
});

describe('code facts (Sim §3.19.6)', () => {
  it('stripJava keeps offsets so method bodies are exact', () => {
    const src = 'class A {\n  // comment {\n  void open(String a) { /* x } */ if (deviceType == DeviceType.FLEX) { scrollVerticallyTo(a); } else { scrollHorizontallyTo(a); } }\n}';
    expect(stripJava(src).length).toBe(src.length);
    expect(methodBody(src, 'open')!.body).toContain('scrollHorizontallyTo');
    expect(openDirection(src)).toBe('correct');
  });
});

describe('Pigeon LSTR (Sim §3.20)', () => {
  it('reports the token after a missing comma — the unhelpful message', () => {
    const text = lab().repos['pigeon'].files['tests/sale/tip_sale_print.json']!;
    const lines = text.split('\n');
    lines[7] = lines[7]!.replace(/,\s*$/, '');
    expect(lstrParseError(lines.join('\n'))).toBe('LSTR ParseError: Unexpected token { in JSON at line 9 column 5');
    expect(lstrParseError('{\n  "name": "x"\n  "actions": []\n}')).toBe('LSTR ParseError: Unexpected string in JSON at line 3 column 3');
    expect(lstrParseError('{ "a": 1, }')).toMatch(/^LSTR ParseError: Unexpected token } in JSON at line 1 column/);
    expect(lstrParseError('{ "a": [1, 2')).toBe('LSTR ParseError: Unexpected end of JSON input');
  });

  it('a broken test on main fails the Jenkins build with JSON_PARSE', { timeout: 60_000 }, () => {
    transact((root) => {
      const l = root.lab;
      const text = l.repos['pigeon'].files['tests/sale/tip_sale_print.json']!;
      const lines = text.split('\n');
      lines[7] = lines[7]!.replace(/,\s*$/, '');
      commitRemote(l, 'pigeon', 'main', { 'tests/sale/tip_sale_print.json': lines.join('\n') }, 'Add tip step', 'alex');
    });
    const b = runBuild('Java/pigeon-android-tip-sale');
    expect(b.result).toBe('FAILURE');
    expect(b.failureCode).toBe('JSON_PARSE');
    expect(b.console).toContain('LSTR ParseError: Unexpected token { in JSON at line 9 column 5');
    expect(b.console[b.console.length - 1]).toBe('Finished: FAILURE');
  });
});

describe('INC25 end to end: missing comma → red build → PR → Morgan merges → fault clears', () => {
  it('runs the whole loop through the fault engine, git and the scripted reviewer', { timeout: 60_000 }, () => {
    transact((root) => {
      root.lab.config.npcAutoMerge = true;
    });
    const f = sim.faults.inject({ faultId: 'pigeon.missingComma', params: {} });
    if (!f.ok) throw new Error(f.error);
    const red = runBuild('Java/pigeon-android-tip-sale');
    expect(red.failureCode).toBe('JSON_PARSE');
    expect(red.console).toContain('LSTR ParseError: Unexpected token { in JSON at line 9 column 5');
    expect(sim.faults.isResolved(f.value.instanceId)).toBe(false);
    sim.git.clone('pigeon', 'player');
    sim.git.checkout('pigeon', 'fix/tip-sale-comma', true);
    const path = 'tests/sale/tip_sale_print.json';
    const lines = lab().repos['pigeon'].local!.files[path]!.split('\n');
    lines[7] = `${lines[7]},`;
    sim.git.writeFile('pigeon', path, lines.join('\n'));
    sim.git.stage('pigeon', [path]);
    expect(sim.git.commit('pigeon', 'Restore missing comma in tip_sale_print.json', 'player').ok).toBe(true);
    expect(sim.git.push('pigeon').ok).toBe(true);
    const pr = sim.git.createPullRequest('pigeon', 'Fix tip_sale_print.json', '', 'fix/tip-sale-comma', 'player');
    if (!pr.ok) throw new Error(pr.error);
    for (let i = 0; i < 160; i++) sim.tick(250);
    expect(lab().repos['pigeon'].pullRequests.find((p) => p.number === pr.value.number)!.state).toBe('merged');
    expect(lstrParseError(lab().repos['pigeon'].files[path]!)).toBeNull();
    expect(sim.faults.isResolved(f.value.instanceId)).toBe(true);
  });
});

describe('Jenkins (Sim §3.18)', () => {
  it('injects environment keys in ALL CAPS with enum values straight from Orca', { timeout: 60_000 }, () => {
    const b = runBuild('Java/uia-remote-regression-flex');
    const envLines = b.console.filter((l) => l.startsWith('[env] '));
    expect(envLines.length).toBeGreaterThan(3);
    for (const l of envLines) expect(l).toMatch(/^\[env\] [A-Z][A-Z0-9_]*=/);
    expect(envLines).toContain('[env] DEVICE_TYPE=FLEX_3');
    const build = Object.values(lab().jenkins.builds).find((x) => x.jobId === 'Java/uia-remote-regression-flex' && x.state === 'finished' && x.number >= 4120)!;
    const { env } = computeEnv(lab(), build);
    for (const k of Object.keys(env)) expect(k).toMatch(/^[A-Z][A-Z0-9_]*$/);
  });

  it('runs the tethered TaxTest: MFD_O1 → CFD_O1 → MFD_O2 → CFD (Sim §3.19.4)', { timeout: 60_000 }, () => {
    const steps: { step: string; role: string; ok: boolean }[] = [];
    const off = bus.on('runner.step', (p) => steps.push({ step: p.step, role: p.deviceRole, ok: p.ok }));
    const b = runBuild('Java/uia-remote-tethered-tax');
    off();
    expect(b.result).toBe('SUCCESS');
    const order = ['[MFD_O1] open Register', '[MFD_O1] add "Tax Item 5"', '[MFD_O1] Review Order', '[MFD_O1] orca → callus: load swipe card VISA_STD_SWIPE … OK', '[CFD_O1] subtotal $10.00 ✓', '[CFD_O1] tax $0.83 ✓', '[CFD_O1] total $10.83 ✓', '[MFD_O2] Pay', '[MFD_O2] Charge', '[CFD] payment prompt', '[callus] swipe VISA_STD_SWIPE fired → OK', '[CFD] receipt: No Receipt', '[teardown] MFD → HomeScreen · CFD → HomeScreen', 'TaxTest PASSED (4/4 steps)'];
    let at = -1;
    for (const line of order) {
      const i = b.console.findIndex((l, k) => k > at && l === line);
      expect(i, line).toBeGreaterThan(at);
      at = i;
    }
    // Sequential device-handle switching: MFD steps, then CFD, then MFD, then CFD.
    const tax = steps.filter((s) => /^(MFD_O1|CFD_O1|MFD_O2|Step 4)/.test(s.step));
    const phases = tax.map((s) => s.step.split(' ')[0]).filter((p, i, a) => p !== a[i - 1]);
    expect(phases).toEqual(['MFD_O1', 'CFD_O1', 'MFD_O2', 'Step']);
    expect(tax.every((s) => s.ok)).toBe(true);
    expect(tax.filter((s) => s.step.startsWith('CFD_O1') || s.step.startsWith('Step 4')).every((s) => s.role === 'CFD')).toBe(true);
    expect(lab().orca.robots[Object.values(lab().orca.robots).find((r) => r.name === 'megatron')!.id]!.status).toBe('AVAILABLE');
  });
});

describe('Go SDK and local config validation (Sim §3.21.1, §3.19.1)', () => {
  it('injects merchant credentials on one masked line and passes the SDK sale', { timeout: 60_000 }, () => {
    const b = runBuild('Java/go-sdk-sale-smoke');
    expect(b.console).toContain('[env] APP_ID=app_sim_7f3a APP_SECRET=**** API_KEY=****');
    expect(b.console.some((l) => /^\[go-sdk\] Sale 1000 → APPROVED \(SIM\d+\)$/.test(l))).toBe(true);
    expect(b.result).toBe('SUCCESS');
  });

  it('rejects an unsupported theme with the exact IllegalStateException', () => {
    sim.git.clone('uia-remote', 'player');
    const ex = lab().repos['uia-remote'].local!.files['config.properties.example']!;
    sim.git.writeFile('uia-remote', 'config.properties', ex.replace('theme=avocado', 'theme=classic').replace(/robotName=.*/, 'robotName=megatron'));
    const r = sim.runner.runLocal('uia-remote', UIA_PATHS.test('TaxTest'), 'player');
    if (!r.ok) throw new Error(r.error);
    sim.tick(250);
    expect(sim.runner.output(r.value.runId)).toEqual({ lines: ['java.lang.IllegalStateException: Unsupported theme "classic" — only "avocado" is supported'], done: true, passed: false });
  });
});

describe('determinism (Sim §6)', () => {
  it('the same build from the same seed produces the same console and state', { timeout: 60_000 }, () => {
    const once = (): string => {
      sim.reset({ preset: 'test', seed: 77 });
      const b = runBuild('Java/uia-remote-regression-flex');
      return JSON.stringify({ b, jenkins: lab().jenkins.builds, rng: lab().rngStreams });
    };
    expect(once()).toBe(once());
  });
});
