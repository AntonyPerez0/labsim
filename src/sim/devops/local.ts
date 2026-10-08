/**
 * Local IntelliJ ▶ runs (Sim §1.12 LocalRunState, §3.19.1): the runner reads the local clone's
 * `config.properties` (or a Code With Me copy), drives devices from the workstation's ADB server
 * (5555 fallback, §3.15.3) and collides with Jenkins when the rig is not Reserved (§3.4.4, INC31).
 */
import type { TxContext } from '@/core/store';
import type { LabState, LocalRun } from '../types';
import { UIA_PATHS } from '../seed/repos/uiaRemote';
import { parseRunConfig, robotByName, deviceRow } from './config';
import { advanceRunner, newRunner, runnerDone, runnerPassed, stopRunner } from './runners/engine';
import type { RC, RunnerHost } from './runners/engine';
import { compilePigeonPlan } from './runners/pigeon';
import { compileUiaPlan } from './runners/uia';
import { HOME, tildify } from './util';

const CWM = /^~\/CodeWithMe\/([^/]+)\/uia-remote\/(.+)$/;

/** Read a file the run uses: the local clone (by repo path) or a workstation path (Code With Me). */
function readConfig(lab: LabState, configPath: string): string | null {
  const local = lab.repos['uia-remote'].local;
  const p = tildify(configPath.replace(/^\/home\/engineer/, HOME));
  if (local && (p === `${local.path}/config.properties` || p === 'config.properties')) return local.files['config.properties'] ?? null;
  const ws = lab.workstation.files[p];
  return ws === undefined ? null : ws;
}

function codeTree(lab: LabState, configPath: string): Record<string, string> {
  const local = lab.repos['uia-remote'].local;
  const base: Record<string, string> = { ...(local?.files ?? lab.repos['uia-remote'].files) };
  const m = CWM.exec(configPath);
  if (m) {
    const prefix = `~/CodeWithMe/${m[1]}/uia-remote/`;
    for (const [k, v] of Object.entries(lab.workstation.files)) if (k.startsWith(prefix)) base[k.slice(prefix.length)] = v;
  }
  return base;
}

function envFromConfig(lab: LabState, values: Record<string, string>): Record<string, string> {
  return {
    RUN_TYPE: values['runType'] ?? '',
    MFD_IP: values['merchantFacingDeviceIp'] ?? '',
    CFD_IP: values['customerFacingDeviceIp'] ?? '',
    SERIAL: values['serial'] ?? '',
    DEVICE_FAMILY: values['deviceType'] ?? '',
    THEME: values['theme'] ?? '',
    KERNEL_TYPE: values['kernelType'] ?? '',
    PORT_NUMBER: values['portNumber'] ?? '',
    UNLOCK_PASSCODE: values['unlockPasscode'] ?? '0000',
    BACKEND_ENV: values['backendEnv'] ?? 'DEV1',
    ROBOT_NAME: values['robotName'] ?? '',
    CARD_PROFILE: 'VISA_STD_SWIPE',
    MERCHANT: '',
  };
}

export function runLocal(lab: LabState, ctx: TxContext, repo: 'uia-remote' | 'pigeon', testPath: string, actor: string, configPath?: string): { ok: true; runId: string } | { ok: false; error: string } {
  const r = lab.repos[repo];
  const local = r?.local;
  if (!local) return { ok: false, error: `Project '${repo}' is not open — clone it first` };
  const path = testPath.replace(/^\.?\//, '');
  if (Object.values(lab.local.runs).some((x) => x.state === 'running' && x.testPath === path && x.repo === repo)) return { ok: false, error: `'${path}' is already running` };
  const id = `run-${++lab.seq.run}`;
  const cfgPath = configPath ?? `${local.path}/config.properties`;
  let testName = path.slice(path.lastIndexOf('/') + 1).replace(/\.(java|json)$/, '');
  const run: LocalRun = {
    id,
    repo,
    testName,
    testPath: path,
    robotName: null,
    startedMs: lab.time.nowMs,
    finishedMs: null,
    state: 'running',
    passed: null,
    failureCode: null,
    output: [],
    runner: newRunner(repo === 'pigeon' ? 'pigeon' : 'uia-remote', []),
    overlappedJenkins: false,
    configPath: cfgPath,
  };
  lab.local.runs[id] = run;
  const finishNow = (code: string, lines: string[]): void => {
    run.output.push(...lines);
    run.state = 'finished';
    run.passed = false;
    run.failureCode = code;
    run.finishedMs = lab.time.nowMs;
  };
  const tree = repo === 'uia-remote' ? codeTree(lab, cfgPath) : { ...local.files };
  if (tree[path] === undefined) {
    ctx.emit('test.localRunStarted', { runId: id, testName, robotName: null });
    finishNow('SCRIPT', [repo === 'uia-remote' ? `No tests found for given includes: [com.labsim.uia.testactions.${testName}]` : `LSTR ParseError: file not found ${path}`]);
    ctx.emit('test.localRunFinished', { runId: id, testName, passed: false, failureCode: run.failureCode, robotName: null, overlappedJenkins: false });
    return { ok: true, runId: id };
  }
  let env: Record<string, string>;
  if (repo === 'uia-remote') {
    const cfg = parseRunConfig(readConfig(lab, cfgPath));
    const robotName = cfg.ok ? cfg.config.robotName : null;
    run.robotName = robotName || null;
    ctx.emit('test.localRunStarted', { runId: id, testName, robotName: run.robotName });
    if (!cfg.ok) {
      finishNow('CONFIG_INVALID', [cfg.error]);
      ctx.emit('test.localRunFinished', { runId: id, testName, passed: false, failureCode: run.failureCode, robotName: run.robotName, overlappedJenkins: false });
      return { ok: true, runId: id };
    }
    env = envFromConfig(lab, cfg.values);
    run.runner = newRunner('uia-remote', compileUiaPlan({ tests: [testName], env, tree, local: true }), { 'l.env': JSON.stringify(env) });
  } else {
    const robotName = lab.workstation.configProperties['robotName'] || '';
    const robot = robotByName(lab, robotName);
    const dev = robot ? (deviceRow(lab, robot.mfdDeviceId) ?? deviceRow(lab, robot.deviceId)) : null;
    run.robotName = robot?.name ?? null;
    env = { ROBOT_NAME: robot?.name ?? '', MFD_IP: dev?.ip ?? '', PORT_NUMBER: lab.workstation.configProperties['portNumber'] || '5444', BACKEND_ENV: robot?.environment ?? 'DEV1', UNLOCK_PASSCODE: '0000' };
    testName = `LSTR: ${path.slice(path.lastIndexOf('/') + 1)}`;
    run.testName = testName;
    ctx.emit('test.localRunStarted', { runId: id, testName, robotName: run.robotName });
    run.runner = newRunner('pigeon', compilePigeonPlan(local.files[path]!, path, 'ANDROID', env, true), { 'l.env': JSON.stringify(env) });
  }
  const robot = run.robotName ? robotByName(lab, run.robotName) : null;
  lab.workstation.locallyRunningTest = { robotId: robot?.id ?? null, testName, startedMs: lab.time.nowMs };
  void actor;
  return { ok: true, runId: id };
}

function host(lab: LabState, run: LocalRun): RunnerHost {
  const env = JSON.parse(run.runner.vars['l.env'] ?? '{}') as Record<string, string>;
  return {
    kind: 'local',
    id: run.id,
    out: (lines) => run.output.push(...lines),
    fromHost: 'ws-17',
    robot: run.robotName ? robotByName(lab, run.robotName) : null,
    env,
    tree: run.repo === 'uia-remote' ? codeTree(lab, run.configPath) : { ...(lab.repos['pigeon'].local?.files ?? {}) },
    actor: 'player',
  };
}

function finish(lab: LabState, ctx: TxContext, run: LocalRun): void {
  run.state = 'finished';
  run.finishedMs = lab.time.nowMs;
  run.passed = runnerPassed(run.runner);
  run.failureCode = run.passed ? null : (run.runner.vars['_failCode'] ?? 'ASSERTION');
  if (run.runner.vars['_overlap']) run.overlappedJenkins = true;
  const lrt = lab.workstation.locallyRunningTest;
  if (lrt && lrt.testName === run.testName && !Object.values(lab.local.runs).some((x) => x.state === 'running')) lab.workstation.locallyRunningTest = null;
  ctx.emit('test.localRunFinished', { runId: run.id, testName: run.testName, passed: run.passed, failureCode: run.failureCode, robotName: run.robotName, overlappedJenkins: run.overlappedJenkins });
}

export function stopLocal(lab: LabState, ctx: TxContext, runId: string): { ok: true } | { ok: false; error: string } {
  const run = lab.local.runs[runId];
  if (!run) return { ok: false, error: `No run '${runId}'` };
  if (run.state === 'finished') return { ok: false, error: 'Process already finished' };
  stopRunner(run.runner, 'ABORTED');
  run.output.push('Tests stopped');
  finish(lab, ctx, run);
  return { ok: true };
}

/** Sim §3.1.1 step 10. */
export function tickLocal(lab: LabState, ctx: TxContext): void {
  for (const run of Object.values(lab.local.runs)) {
    if (run.state !== 'running') continue;
    const h = host(lab, run);
    if (h.robot?.checkout?.kind === 'jenkins') run.overlappedJenkins = true;
    const rc: RC = { lab, ctx, host: h, rs: run.runner };
    advanceRunner(rc, null);
    if (runnerDone(run.runner)) finish(lab, ctx, run);
  }
}

export const LOCAL_TEST_DIR = UIA_PATHS.test('');
