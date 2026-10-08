/**
 * Jenkins engine (Sim §3.18): scheduler (8 executors, FIFO, game-clock triggers), the stage machine,
 * environment injection (ALL CAPS keys, masked secrets), console formatting and failure codes.
 * A build that waits for a robot keeps its executor. Runner execution lives in ../runners.
 */
import type { TxContext } from '@/core/store';
import { isDraft, original } from 'immer';
import { ro } from '../../core/ro';
import type { BuildResult, BuildStage, JenkinsBuild, JenkinsJob, LabState, OrcaRobot, RepoId, RunnerKind } from '../../types';
import { TRIGGER_JOBS } from '../../seed/jenkins';
import { core } from '../coreRef';
import { deviceRow } from '../config';
import { familyOf } from '../config';
import { treeView } from '../gitCore';
import { parseStrictJson } from '../json';
import { draw, fmtSec } from '../util';
import { advanceRunner, newRunner, runnerDone, runnerPassed, runnerUnstable, stopRunner } from '../runners/engine';
import type { RC, RunnerHost } from '../runners/engine';
import { compileGoSdkPlan, compileIosPlan, compileVisionPlan } from '../runners/other';
import { compilePigeonPlan } from '../runners/pigeon';
import { compileUiaPlan, testNeedsPin, testsFromScript } from '../runners/uia';
import { parseScript, scriptVar } from './script';

export const ORCA_URL = 'http://orca.lab.local:8080';
const HISTORY_CAP = 20;

/* ────────────────────────────── helpers ────────────────────────────── */

export function jenkinsUp(lab: LabState): boolean {
  // Read-only (no drafts on the per-tick path, see core/ro).
  const L = ro(lab);
  const h = ro(ro(L.hosts)['jenkins-vm']);
  if (!h) return ro(L.jenkins).up;
  const svc = ro(ro(h.services)['jenkins']);
  if (h.os !== 'RUNNING') return false;
  return svc ? svc.running && (svc.startedPhysMs === null || svc.startedPhysMs <= ro(L.time).physMs) : ro(L.jenkins).up;
}

export function startedByLine(triggeredBy: string): string {
  if (triggeredBy === 'player') return 'Started by user Engineer';
  if (triggeredBy === 'timer' || triggeredBy === 'jenkins' || triggeredBy === 'pipeline') return 'Started by timer';
  const up = /^upstream:(.+)#(\d+)$/.exec(triggeredBy);
  if (up) return `Started by upstream project "${up[1]}" build number ${up[2]}`;
  return `Started by user ${triggeredBy.charAt(0).toUpperCase()}${triggeredBy.slice(1)}`;
}

type StageName = 'Checkout SCM' | 'Resolve capabilities' | 'Checkout robot' | 'Verify robot' | 'Merchant' | 'Inject environment' | 'Run tests' | 'Release robot' | 'Publish results' | 'Laz OOBE' | 'Trigger Java jobs';

export function stagesFor(job: JenkinsJob): StageName[] {
  if (TRIGGER_JOBS.has(job.id)) return ['Trigger Java jobs'];
  if (job.runner === 'laz') return ['Checkout robot', 'Laz OOBE', 'Release robot'];
  const hasRobot = /orca\.checkout\(/.test(job.script);
  if (!hasRobot) return ['Checkout SCM', 'Run tests', 'Publish results'];
  const s: StageName[] = ['Checkout SCM', 'Resolve capabilities', 'Checkout robot', 'Verify robot'];
  if (job.merchantPolicy !== 'none') s.push('Merchant');
  s.push('Inject environment', 'Run tests', 'Release robot', 'Publish results');
  return s;
}

export function repoForJob(job: JenkinsJob): RepoId {
  if (job.testRef) return job.testRef.repo;
  const m = /git url:\s*'git@github\.com:labsim-lab\/([\w-]+)\.git'/.exec(job.script);
  return (m?.[1] as RepoId | undefined) ?? (job.runner === 'go-sdk' ? 'gort' : 'uia-remote');
}

const v = (b: JenkinsBuild, k: string): string | undefined => b.runner.vars[`j.${k}`];
const setv = (b: JenkinsBuild, k: string, val: string | number): void => {
  b.runner.vars[`j.${k}`] = String(val);
};

function say(b: JenkinsBuild, ...lines: string[]): void {
  b.console.push(...lines);
}

function robotOf(lab: LabState, b: JenkinsBuild): OrcaRobot | null {
  return b.robotId != null ? (lab.orca.robots[b.robotId] ?? null) : null;
}

/* ────────────────────────────── build creation ────────────────────────────── */

export function queueBuild(lab: LabState, ctx: TxContext, jobId: string, params: Record<string, string>, triggeredBy: string): { ok: true; buildId: string } | { ok: false; error: string } {
  const job = lab.jenkins.jobs[jobId];
  if (!job || !job.exists) return { ok: false, error: `No such job: ${jobId}` };
  if (!jenkinsUp(lab)) return { ok: false, error: `Failed to connect to ${lab.jenkins.url}: Connection refused` };
  if (job.disabled) return { ok: false, error: 'This project is currently disabled' };
  const number = lab.jenkins.nextBuildNumber[jobId] ?? 1;
  lab.jenkins.nextBuildNumber[jobId] = number + 1;
  const merged: Record<string, string> = {};
  for (const p of job.params) merged[p.name] = job.savedParams[p.name] ?? p.default;
  for (const [k, val] of Object.entries(params)) merged[k] = val;
  for (const k of Object.keys(merged)) if (k === 'ROBOT_NAME') merged[k] = merged[k]!.trim();
  const id = `${jobId}#${number}`;
  lab.seq.build++;
  const build: JenkinsBuild = {
    id,
    jobId,
    number,
    params: merged,
    env: {},
    envMasked: {},
    state: 'queued',
    result: null,
    queuedMs: lab.time.nowMs,
    startedMs: null,
    finishedMs: null,
    stages: stagesFor(job).map((name) => ({ name, status: 'pending', startedMs: null, durationMs: null })),
    console: [startedByLine(triggeredBy)],
    robotId: null,
    failureCode: null,
    triggeredBy,
    cursor: 0,
    waitUntilMs: null,
    runner: newRunner(job.runner === 'gort-sync' ? 'uia-remote' : job.runner, []),
    local: false,
  };
  lab.jenkins.builds[id] = build;
  job.buildIds.push(id);
  lab.jenkins.queue.push(id);
  pruneHistory(lab, job);
  ctx.emit('jenkins.buildQueued', { buildId: id, jobId, params: { ...merged } });
  return { ok: true, buildId: id };
}

function pruneHistory(lab: LabState, job: JenkinsJob): void {
  const finished = job.buildIds.filter((x) => lab.jenkins.builds[x]?.state === 'finished');
  if (job.buildIds.length <= HISTORY_CAP || !finished.length) return;
  const drop = new Set(finished.sort((a, b) => (lab.jenkins.builds[a]?.number ?? 0) - (lab.jenkins.builds[b]?.number ?? 0)).slice(0, job.buildIds.length - HISTORY_CAP));
  job.buildIds = job.buildIds.filter((x) => !drop.has(x));
  for (const x of drop) delete lab.jenkins.builds[x];
}

/* ────────────────────────────── stage machine ────────────────────────────── */

interface SC {
  lab: LabState;
  ctx: TxContext;
  b: JenkinsBuild;
  job: JenkinsJob;
}
type StageOutcome = 'done' | 'poll' | { wait: number } | { fail: string; lines: string[] } | 'skip';

function startStage(sc: SC, stage: BuildStage): void {
  stage.status = 'running';
  stage.startedMs = sc.lab.time.nowMs;
  setv(sc.b, 'stageStart', sc.lab.time.physMs);
  say(sc.b, `[Pipeline] stage (${stage.name})`);
  sc.ctx.emit('jenkins.stageChanged', { buildId: sc.b.id, stage: stage.name, status: 'running' });
}

function endStage(sc: SC, stage: BuildStage, status: BuildStage['status']): void {
  stage.status = status;
  stage.durationMs = Math.max(0, sc.lab.time.physMs - Number(v(sc.b, 'stageStart') ?? sc.lab.time.physMs));
  for (const k of Object.keys(sc.b.runner.vars)) if (k.startsWith('j.s.')) delete sc.b.runner.vars[k];
  sc.ctx.emit('jenkins.stageChanged', { buildId: sc.b.id, stage: stage.name, status });
}

/** Timed phase helper: first call starts a timer of `ms`, later calls return 'poll' until it elapses. */
function timed(sc: SC, key: string, ms: number): boolean {
  const k = `s.t.${key}`;
  const at = v(sc.b, k);
  if (at === undefined) {
    setv(sc.b, k, sc.lab.time.physMs + ms);
    return false;
  }
  return sc.lab.time.physMs >= Number(at);
}

function capsSummary(r: Record<string, string | boolean>): string {
  return Object.entries(r)
    .map(([k, val]) => `${k}=${val}`)
    .join(', ');
}

function stageCheckoutScm(sc: SC): StageOutcome {
  const { lab, b, job } = sc;
  if (v(b, 's.done') === undefined) {
    const repoId = repoForJob(job);
    const repo = lab.repos[repoId];
    const branch = b.params['BRANCH'] || 'main';
    const sha = repo?.branches[branch];
    say(b, ` > git fetch --tags --force --progress -- ${repo?.remoteUrl ?? ''} +refs/heads/*:refs/remotes/origin/*`);
    if (!sha) return { fail: 'SCM', lines: [`ERROR: Couldn't find any revision to build. Verify the repository and branch configuration for this job.`] };
    const c = repo.commits[sha];
    say(b, `Checking out Revision ${sha} (refs/remotes/origin/${branch})`, `Commit message: "${c?.message.split('\n')[0] ?? ''}"`);
    setv(b, 'scmRepo', repoId);
    setv(b, 'scmSha', sha);
    setv(b, 's.done', 1);
  }
  return timed(sc, 'scm', 4_000) ? 'done' : 'poll';
}

/** The test definition / dynamic capability file from the checked-out tree (or gort main). */
function readRepoFile(sc: SC, path: string): string | undefined {
  const { lab, b } = sc;
  const repoId = (v(b, 'scmRepo') ?? 'uia-remote') as RepoId;
  const tree = treeView(lab.repos[repoId], v(b, 'scmSha') ?? null);
  if (tree[path] !== undefined) return tree[path];
  return lab.repos['gort']?.files[path];
}

function stageResolveCaps(sc: SC): StageOutcome {
  const { b, job } = sc;
  if (v(b, 's.done') === undefined) {
    const parsed = parseScript(job.script, b.params);
    if (!parsed.ok) return { fail: 'SCRIPT', lines: [parsed.error] };
    const caps = parsed.caps;
    let dynamicJson: string | null = null;
    if (caps.dynamicFile) {
      say(b, '[Pipeline] readJSON');
      const text = readRepoFile(sc, caps.dynamicFile);
      if (text === undefined) return { fail: 'JSON_PARSE', lines: [`java.io.FileNotFoundException: ${caps.dynamicFile} (No such file or directory)`] };
      const r = parseStrictJson(text);
      if (!r.ok) return { fail: 'JSON_PARSE', lines: [`readJSON: ${r.error}`] };
      const capsObj = (r.value as Record<string, unknown>)?.['capabilities'];
      dynamicJson = JSON.stringify(capsObj && typeof capsObj === 'object' ? capsObj : {});
    }
    b.runner.vars['j.caps'] = JSON.stringify(caps.nonDynamic);
    b.runner.vars['j.dyn'] = dynamicJson ?? '';
    b.runner.vars['j.dynFile'] = caps.dynamicFile ?? '';
    b.runner.vars['j.capFromParams'] = JSON.stringify(caps.fromParams);
    setv(b, 's.done', 1);
  }
  return timed(sc, 'caps', 1_000) ? 'done' : 'poll';
}

function stageCheckoutRobot(sc: SC): StageOutcome {
  const { lab, ctx, b, job } = sc;
  if (job.runner === 'laz' && v(b, 's.lazcheck') === undefined) {
    if (!b.params['ROBOT_NAME']) return { fail: 'LAZ_FAILED', lines: ['ERROR: ROBOT_NAME is required for Laz merchant swaps'] };
    if (!b.params['MERCHANT']) return { fail: 'LAZ_FAILED', lines: ['ERROR: MERCHANT is required for Laz merchant swaps'] };
    setv(b, 's.lazcheck', 1);
  }
  if (b.robotId != null) return timed(sc, 'co', 1_000) ? 'done' : 'poll';
  const pollAt = v(b, 's.pollAt');
  if (pollAt !== undefined && lab.time.physMs < Number(pollAt)) {
    const since = Number(v(b, 's.waitSince'));
    const lastPrint = Number(v(b, 's.lastStill') ?? since);
    if (lab.time.physMs - lastPrint >= 60_000) {
      say(b, `[orca] still waiting (${Math.round((lab.time.physMs - since) / 1000)} s)…`);
      setv(b, 's.lastStill', lab.time.physMs);
    }
    return 'poll';
  }
  const capsRaw = b.runner.vars['j.caps'];
  const caps = capsRaw && capsRaw !== 'null' ? (JSON.parse(capsRaw) as Record<string, string | boolean>) : undefined;
  const fromParams = JSON.parse(b.runner.vars['j.capFromParams'] ?? '{}') as Record<string, string>;
  const dyn = b.runner.vars['j.dyn'] || undefined;
  const deviceType = caps && typeof caps['deviceType'] === 'string' ? (caps['deviceType'] as string) : undefined;
  const outcome = core().checkout(lab, ctx, {
    buildId: b.id,
    jobId: job.id,
    robotName: b.params['ROBOT_NAME'] ?? '',
    ...(deviceType !== undefined ? { deviceType } : {}),
    ...(caps ? { capabilities: caps } : {}),
    ...(dyn ? { dynamicCapabilitiesJson: dyn, dynamicSource: b.runner.vars['j.dynFile'] ?? '' } : {}),
    environment: b.params['BACKEND_ENV'] || 'DEV1',
    kind: 'jenkins',
  });
  void fromParams;
  if (outcome.kind === 'ok') {
    say(b, ...outcome.lines);
    b.robotId = outcome.robotId;
    return { wait: 1_000 };
  }
  if (outcome.kind === 'fail') return { fail: outcome.code, lines: outcome.lines };
  // wait: print skip lines only when the set of reasons changes
  const key = JSON.stringify(outcome.reasons);
  if (v(b, 's.reasons') !== key) {
    say(b, ...outcome.lines);
    setv(b, 's.reasons', key);
  }
  if (v(b, 's.waitSince') === undefined) {
    setv(b, 's.waitSince', lab.time.physMs);
    setv(b, 's.lastStill', lab.time.physMs);
  }
  setv(b, 's.pollAt', lab.time.physMs + 10_000);
  return 'poll';
}

const PREFLIGHT_ORDER = ['physicalTouch', 'deviceType', 'printer', 'duo'];

function stageVerifyRobot(sc: SC): StageOutcome {
  const { lab, b, job } = sc;
  if (v(b, 's.done') === undefined) {
    const robot = robotOf(lab, b);
    if (!robot) return 'done';
    const doc = core().capabilityDocument(lab, robot.id) ?? {};
    const capsRaw = b.runner.vars['j.caps'];
    const R: Record<string, string | boolean> = { ...(capsRaw && capsRaw !== 'null' ? (JSON.parse(capsRaw) as Record<string, string | boolean>) : {}), ...(b.runner.vars['j.dyn'] ? (JSON.parse(b.runner.vars['j.dyn']) as Record<string, string | boolean>) : {}) };
    const tests = testsFromScript(job.script, job.testRef?.path ?? null);
    const pinJob = testNeedsPin(tests);
    if (pinJob && doc['physicalTouch'] !== true) return { fail: 'PIN_NEEDS_PHYSICAL', lines: ['PIN entry requires physical touch'] };
    const keys = [...PREFLIGHT_ORDER.filter((k) => k in R), ...Object.keys(R).filter((k) => !PREFLIGHT_ORDER.includes(k))].filter((k) => k !== 'tethered');
    for (const k of keys) {
      const want = R[k]!;
      const have = doc[k] ?? false;
      if (String(have) !== String(want)) return { fail: 'CAPABILITY_MISMATCH', lines: [`capability mismatch: ${k} ${want} required`] };
    }
    setv(b, 's.done', 1);
  }
  return timed(sc, 'vr', 1_000) ? 'done' : 'poll';
}

/** Devices of the checked-out robot, MFD first (Sim §3.17.1). */
function robotDevices(lab: LabState, robot: OrcaRobot): string[] {
  const ids: string[] = [];
  const add = (rowId: number | null): void => {
    const row = deviceRow(lab, rowId);
    if (row?.simDeviceId && !ids.includes(row.simDeviceId)) ids.push(row.simDeviceId);
  };
  if (robot.mfdDeviceId != null) {
    add(robot.mfdDeviceId);
    add(robot.cfdDeviceId);
  } else add(robot.deviceId);
  return ids;
}

/** Merchant stage / Laz OOBE stage (Sim §3.17.1). */
function stageMerchant(sc: SC, force: boolean): StageOutcome {
  const { lab, ctx, b, job } = sc;
  const robot = robotOf(lab, b);
  const merchantName = b.params['MERCHANT'] ?? '';
  if (!robot || (!merchantName && !force)) return 'done';
  const merchant = Object.values(lab.orca.merchants).find((m) => m.name === merchantName) ?? null;
  const devices = robotDevices(lab, robot);
  if (job.merchantPolicy === 'assert' && !force) {
    for (const d of devices) {
      const dev = lab.devices[d];
      const has = dev?.merchantConfigId != null ? (lab.orca.merchants[dev.merchantConfigId]?.name ?? '') : '';
      if (has !== merchantName) return { fail: 'MERCHANT_MISMATCH', lines: [`[paycore] merchant mismatch: expected ${merchantName}, got ${has || '(none)'}`] };
    }
    return 'done';
  }
  if (!merchant) return { fail: 'UBI_ROUTE', lines: [`ubi: ERROR merchant ${merchantName} not found`] };
  let i = Number(v(b, 's.dev') ?? 0);
  while (i < devices.length) {
    const deviceId = devices[i]!;
    const runId = v(b, `s.run${i}`);
    if (runId === undefined) {
      const dev = lab.devices[deviceId];
      if (dev && dev.merchantConfigId === merchant.id) {
        // One line per rig (a tethered pair shares the merchant).
        if (v(b, 's.skipSaid') === undefined) say(b, `laz: merchant already active (${merchant.name}) — skipped`);
        setv(b, 's.skipSaid', 1);
        setv(b, 's.dev', ++i);
        continue;
      }
      const r = core().startLaz(lab, ctx, deviceId, merchant.id, { buildId: b.id, actor: 'jenkins' });
      if (!r.ok) return { fail: r.error.startsWith('ubi:') ? 'UBI_ROUTE' : 'LAZ_FAILED', lines: [r.error] };
      setv(b, `s.run${i}`, r.value.runId);
      setv(b, `s.log${i}`, 0);
      return 'poll';
    }
    const run = lab.laz.runs[runId];
    if (!run) return { fail: 'LAZ_FAILED', lines: ['laz: ERROR run lost'] };
    const printed = Number(v(b, `s.log${i}`) ?? 0);
    if (run.log.length > printed) {
      say(b, ...run.log.slice(printed));
      setv(b, `s.log${i}`, run.log.length);
    }
    if (run.step === 'failed') {
      const err = run.error ?? run.log[run.log.length - 1] ?? 'laz: ERROR';
      return { fail: /^ubi:/.test(err) || run.log.some((l) => /^ubi: ERROR/.test(l)) ? 'UBI_ROUTE' : 'LAZ_FAILED', lines: run.log.length > printed ? [] : [] };
    }
    if (run.step !== 'done') return 'poll';
    setv(b, 's.dev', ++i);
  }
  return 'done';
}

/** Environment injection (Sim §3.18.4). */
export function computeEnv(lab: LabState, b: JenkinsBuild): { env: Record<string, string>; masked: Record<string, string> } {
  const robot = robotOf(lab, b);
  const env: Record<string, string> = {};
  env['BUILD_TAG'] = `jenkins-${b.jobId.replace(/\//g, '-')}-${b.number}`;
  if (robot) {
    const mfd = deviceRow(lab, robot.mfdDeviceId);
    const dev = mfd ?? deviceRow(lab, robot.deviceId);
    const cfd = deviceRow(lab, robot.cfdDeviceId);
    env['RUN_TYPE'] = mfd ? 'tethered' : 'standalone';
    env['DEVICE_TYPE'] = dev?.deviceType ?? '';
    env['DEVICE_FAMILY'] = dev ? familyOf(dev.deviceType) : '';
    env['ROBOT_NAME'] = robot.name;
    env['MFD_IP'] = dev?.ip ?? '';
    env['CFD_IP'] = mfd ? (cfd?.ip ?? '') : '';
    env['SERIAL'] = dev?.serial ?? '';
    env['PORT_NUMBER'] = '5444';
    env['THEME'] = 'avocado';
    env['KERNEL_TYPE'] = 'CPA';
    env['UNLOCK_PASSCODE'] = '0000';
    env['BACKEND_ENV'] = robot.environment;
  }
  env['MERCHANT'] = b.params['MERCHANT'] ?? '';
  env['CARD_PROFILE'] = b.params['CARD_PROFILE'] ?? '';
  const m = Object.values(lab.orca.merchants).find((x) => x.name === env['MERCHANT']);
  env['APP_ID'] = m?.appId ?? '';
  env['APP_SECRET'] = m?.appSecret ?? '';
  env['API_KEY'] = m?.apiKey ?? '';
  env['ORCA_URL'] = ORCA_URL;
  const masked = { ...env };
  for (const k of ['APP_SECRET', 'API_KEY', 'UNLOCK_PASSCODE']) if (masked[k]) masked[k] = '****';
  return { env, masked };
}

function stageInjectEnv(sc: SC): StageOutcome {
  const { lab, b } = sc;
  if (v(b, 's.done') === undefined) {
    const { env, masked } = computeEnv(lab, b);
    b.env = env;
    b.envMasked = masked;
    if (env['RUN_TYPE'] !== undefined) {
      for (const k of ['RUN_TYPE', 'DEVICE_TYPE', 'ROBOT_NAME', 'PORT_NUMBER', 'THEME', 'KERNEL_TYPE']) say(b, `[env] ${k}=${env[k]}`);
    }
    const m = Object.values(lab.orca.merchants).find((x) => x.name === env['MERCHANT']);
    if (m && (m.appId || m.appSecret || m.apiKey)) say(b, `[env] APP_ID=${masked['APP_ID']} APP_SECRET=${masked['APP_SECRET']} API_KEY=${masked['API_KEY']}`);
    setv(b, 's.done', 1);
  }
  return timed(sc, 'env', 1_000) ? 'done' : 'poll';
}

/* ── Run tests ── */

function runnerHost(sc: SC): RunnerHost {
  const { lab, b, job } = sc;
  const repoId = (v(b, 'scmRepo') ?? repoForJob(job)) as RepoId;
  return {
    kind: 'build',
    id: b.id,
    out: (lines) => b.console.push(...lines),
    fromHost: 'jenkins-vm',
    robot: robotOf(lab, b),
    env: { ...b.params, ...b.env },
    tree: treeView(lab.repos[repoId], v(b, 'scmSha') ?? lab.repos[repoId]?.branches['main'] ?? null) as Record<string, string>,
    actor: 'jenkins',
  };
}

function compileRun(sc: SC, host: RunnerHost): void {
  const { b, job } = sc;
  const kind: RunnerKind = job.runner;
  let steps;
  if (kind === 'uia-remote') {
    const tests = testsFromScript(job.script, job.testRef?.path ?? null);
    say(b, `+ ./gradlew connectedAndroidTest -Pclasses=${tests.join(',')}`, 'Starting a Gradle Daemon (subsequent builds will be faster)');
    steps = compileUiaPlan({ tests, env: host.env, tree: host.tree, local: false });
    b.runner.vars['j.tests'] = String(tests.length);
  } else if (kind === 'pigeon') {
    const file = scriptVar(job.script, 'testFile') ?? job.testRef?.path ?? '';
    const platform = job.platform === 'windows' ? 'WINDOWS' : job.platform === 'rest' ? 'REST' : job.platform === 'ios' ? 'IOS' : 'ANDROID';
    say(b, `+ lstr run --platform ${platform} ${file}`);
    const text = host.tree[file];
    steps = text === undefined ? compilePigeonPlan('', file, platform, host.env, false).slice(0, 0).concat([{ id: 'nf', label: 'load', role: 'DEVICE', op: 'lstrFail', args: { code: 'JSON_PARSE', lines: `LSTR ParseError: file not found ${file}` } }]) : compilePigeonPlan(text, file, platform, host.env, false);
  } else if (kind === 'go-sdk') {
    const file = job.testRef?.path ?? 'go-sdk/tests/sale_receipt.json';
    say(b, `+ go run ./go-sdk/cmd/gosdk-run ${file}`);
    steps = compileGoSdkPlan(host.tree[file], file, host.env);
  } else if (kind === 'vision') {
    say(b, "+ ./vision/receipt_check.sh --model llava:latest --ollama http://10.42.1.12:11434");
    steps = compileVisionPlan(host.env);
  } else {
    const file = scriptVar(job.script, 'testFile') ?? job.testRef?.path ?? 'tests/go/ios_go_smoke.json';
    say(b, `+ lstr run --platform IOS ${file}`);
    steps = compileIosPlan(host.tree[file], file);
  }
  const keep = Object.fromEntries(Object.entries(b.runner.vars).filter(([k]) => k.startsWith('j.')));
  b.runner = newRunner(kind === 'gort-sync' ? 'uia-remote' : kind, steps, keep);
}

function stageRunTests(sc: SC): StageOutcome {
  const { lab, ctx, b, job } = sc;
  const host = runnerHost(sc);
  if (v(b, 's.compiled') === undefined) {
    compileRun(sc, host);
    setv(b, 's.compiled', 1);
    setv(b, 'ranTests', 1);
    if (job.runner === 'uia-remote') return { wait: 10_000 };
  }
  if (job.runner === 'uia-remote' && v(b, 's.banner') === undefined) {
    say(b, '> Task :app:connectedDebugAndroidTest');
    setv(b, 's.banner', 1);
  }
  const rc: RC = { lab, ctx, host, rs: b.runner };
  advanceRunner(rc, b.id);
  if (!runnerDone(b.runner)) return 'poll';
  // rig.testRunning loop (Sim §4.3.10): rerun the plan until the fault ends or its duration elapses.
  const loopFault = v(b, 'loopFault');
  if (loopFault && runnerPassed(b.runner)) {
    const f = lab.faults.find((x) => x.id === loopFault);
    const until = v(b, 'loopUntil');
    const active = f && !f.cleared && v(b, 'loopStop') === undefined && (until === undefined || lab.time.physMs < Number(until));
    if (active) {
      for (const k of Object.keys(b.runner.vars)) if (k.startsWith('_')) delete b.runner.vars[k];
      b.runner.pc = 0;
      b.runner.passedSteps = 0;
      return 'poll';
    }
  }
  if (job.runner === 'uia-remote') {
    if (runnerPassed(b.runner)) say(b, `BUILD SUCCESSFUL in ${Math.round((lab.time.physMs - Number(v(b, 'stageStart'))) / 1000)}s`);
    else say(b, '> Task :app:connectedDebugAndroidTest FAILED', `BUILD FAILED in ${Math.round((lab.time.physMs - Number(v(b, 'stageStart'))) / 1000)}s`);
  }
  if (!runnerPassed(b.runner)) return { fail: b.runner.vars['_failCode'] ?? 'ASSERTION', lines: [] };
  if (runnerUnstable(b.runner)) setv(b, 'unstable', 1);
  return 'done';
}

function stageRelease(sc: SC): StageOutcome {
  const { lab, ctx, b } = sc;
  if (v(b, 's.done') === undefined) {
    if (b.robotId != null) {
      const r = core().release(lab, ctx, b.robotId, b.id);
      say(b, ...r.lines);
    }
    setv(b, 's.done', 1);
  }
  return timed(sc, 'rel', 1_000) ? 'done' : 'poll';
}

function stagePublish(sc: SC): StageOutcome {
  const { b, job } = sc;
  if (v(b, 'ranTests') === undefined) return 'skip';
  if (v(b, 's.done') === undefined) {
    const total = job.runner === 'uia-remote' ? Number(b.runner.vars['_tests'] ?? v(b, 'tests') ?? 1) : 1;
    const failed = job.runner === 'uia-remote' ? Number(b.runner.vars['_testsFailed'] ?? (v(b, 'testsFailed') ? 1 : 0)) : v(b, 'testsFailed') ? 1 : 0;
    say(b, `Tests: ${Math.max(total, failed)}, Failures: ${failed}, Errors: 0, Skipped: 0`);
    setv(b, 's.done', 1);
  }
  return timed(sc, 'pub', 2_000) ? 'done' : 'poll';
}

function stageTrigger(sc: SC): StageOutcome {
  const { lab, ctx, b } = sc;
  if (v(b, 's.done') === undefined) {
    const jobs = Object.values(lab.jenkins.jobs)
      .filter((j) => j.exists && !j.disabled && j.folder === 'Java' && !TRIGGER_JOBS.has(j.id))
      .sort((a, c) => a.id.localeCompare(c.id, 'en-US'));
    for (const j of jobs) {
      say(b, `Scheduling project: Java » ${j.name}`);
      queueBuild(lab, ctx, j.id, {}, `upstream:${b.jobId}#${b.number}`);
    }
    setv(b, 's.done', 1);
  }
  return timed(sc, 'trig', 2_000) ? 'done' : 'poll';
}

function runStage(sc: SC, name: StageName): StageOutcome {
  switch (name) {
    case 'Checkout SCM':
      return stageCheckoutScm(sc);
    case 'Resolve capabilities':
      return stageResolveCaps(sc);
    case 'Checkout robot':
      return stageCheckoutRobot(sc);
    case 'Verify robot':
      return stageVerifyRobot(sc);
    case 'Merchant':
      return stageMerchant(sc, false);
    case 'Laz OOBE':
      return stageMerchant(sc, true);
    case 'Inject environment':
      return stageInjectEnv(sc);
    case 'Run tests':
      return stageRunTests(sc);
    case 'Release robot':
      return stageRelease(sc);
    case 'Publish results':
      return stagePublish(sc);
    case 'Trigger Java jobs':
      return stageTrigger(sc);
  }
}

function finishBuild(sc: SC, result: BuildResult): void {
  const { lab, ctx, b, job } = sc;
  b.state = 'finished';
  b.result = result;
  b.finishedMs = lab.time.nowMs;
  b.waitUntilMs = null;
  for (const s of b.stages) if (s.status === 'pending') s.status = 'skipped';
  say(b, '[Pipeline] End of Pipeline', `Finished: ${result}`);
  if (result === 'SUCCESS') b.failureCode = null;
  if (result === 'UNSTABLE') b.failureCode = b.failureCode ?? 'VISION_FAIL';
  if (result === 'ABORTED') b.failureCode = 'ABORTED';
  ctx.emit('jenkins.buildFinished', { buildId: b.id, jobId: b.jobId, result, failureCode: b.failureCode, robotId: b.robotId });
  if (result === 'FAILURE' || result === 'UNSTABLE') core().postChat(lab, ctx, '#jenkins', 'jenkins-bot', `Build #${b.number} ${result} — ${job.id}${b.failureCode ? ` (${b.failureCode})` : ''}`);
}

/** Advance one running build as far as possible at this instant. */
function stepBuild(lab: LabState, ctx: TxContext, b: JenkinsBuild): void {
  const job = lab.jenkins.jobs[b.jobId] ?? Object.values(lab.jenkins.jobs).find((j) => j.buildIds.includes(b.id));
  if (!job) return;
  const sc: SC = { lab, ctx, b, job };
  for (let guard = 0; guard < 32 && b.state === 'running'; guard++) {
    if (b.waitUntilMs !== null && lab.time.physMs < b.waitUntilMs) return;
    b.waitUntilMs = null;
    const aborting = v(b, 'abort') !== undefined;
    if (b.cursor >= b.stages.length) {
      const failed = v(b, 'failed') !== undefined;
      finishBuild(sc, aborting ? 'ABORTED' : failed ? 'FAILURE' : v(b, 'unstable') ? 'UNSTABLE' : 'SUCCESS');
      return;
    }
    const stage = b.stages[b.cursor]!;
    const name = stage.name as StageName;
    const failedAlready = v(b, 'failed') !== undefined || aborting;
    if (failedAlready && name !== 'Release robot') {
      if (stage.status === 'running') endStage(sc, stage, 'failed');
      else if (stage.status === 'pending') stage.status = 'skipped';
      b.cursor++;
      continue;
    }
    if (stage.status === 'pending') startStage(sc, stage);
    const r = runStage(sc, name);
    if (r === 'poll') return;
    if (r === 'skip') {
      endStage(sc, stage, 'skipped');
      b.cursor++;
      continue;
    }
    if (typeof r === 'object' && 'wait' in r) {
      b.waitUntilMs = lab.time.physMs + r.wait;
      return;
    }
    if (r === 'done') {
      endStage(sc, stage, 'success');
      b.cursor++;
      continue;
    }
    say(b, ...r.lines);
    b.failureCode ??= r.fail;
    setv(b, 'failed', 1);
    if (name === 'Run tests') setv(b, 'testsFailed', 1);
    endStage(sc, stage, 'failed');
    b.cursor++;
  }
}

/** `jenkins.abort` (Sim §3.18.3). */
export function abortBuild(lab: LabState, ctx: TxContext, buildId: string, actor: string): { ok: true } | { ok: false; error: string } {
  const b = lab.jenkins.builds[buildId];
  if (!b) return { ok: false, error: `No such build: ${buildId}` };
  if (b.state === 'finished') return { ok: false, error: `${buildId} is not running` };
  const who = actor === 'player' ? 'Engineer' : actor;
  if (b.state === 'queued') {
    lab.jenkins.queue = lab.jenkins.queue.filter((x) => x !== buildId);
    b.console.push(`Cancelled by ${who}`);
    const job = lab.jenkins.jobs[b.jobId]!;
    finishBuild({ lab, ctx, b, job }, 'ABORTED');
    return { ok: true };
  }
  b.console.push(`Aborted by ${who}`);
  setv(b, 'abort', 1);
  stopRunner(b.runner, 'ABORTED');
  b.failureCode = 'ABORTED';
  b.waitUntilMs = null;
  const stage = b.stages[b.cursor];
  if (stage && stage.status === 'running') {
    const job = lab.jenkins.jobs[b.jobId]!;
    endStage({ lab, ctx, b, job }, stage, 'failed');
    b.cursor++;
  }
  return { ok: true };
}

/* ────────────────────────────── scheduler tick (Sim §3.1.1 step 9) ────────────────────────────── */

export function nextDailyMs(fromMs: number, hour: number): number {
  const day = 86_400_000;
  const base = Math.floor(fromMs / day) * day + hour * 3_600_000;
  return base > fromMs ? base : base + day;
}

/**
 * Ids of running builds without walking every build through the immer draft (history builds are many
 * and idle): the transaction's base state plus the builds started inside this transaction.
 */
const startedInTx = new WeakMap<object, Set<string>>();
function runningIds(J: LabState['jenkins']): string[] {
  const base = isDraft(J.builds) ? (original(J.builds) as LabState['jenkins']['builds']) : J.builds;
  const ids = new Set<string>();
  for (const [id, b] of Object.entries(base)) if (b.state === 'running') ids.add(id);
  for (const id of startedInTx.get(J.builds) ?? []) ids.add(id);
  return [...ids].filter((id) => J.builds[id]?.state === 'running').sort((a, b) => (J.builds[a]!.startedMs ?? 0) - (J.builds[b]!.startedMs ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
}

export function tickJenkins(lab: LabState, ctx: TxContext): void {
  const J = lab.jenkins;
  const up = jenkinsUp(lab);
  if (J.up !== up) J.up = up;
  if (!up) {
    // Builds in flight die with the restart (Sim §3.14.4).
    for (const id of runningIds(J)) {
      const b = J.builds[id]!;
      const job = J.jobs[b.jobId];
      stopRunner(b.runner, 'JENKINS_RESTART');
      b.console.push('Jenkins is restarting — build interrupted');
      b.failureCode = 'JENKINS_RESTART';
      if (b.robotId != null) {
        const r = core().release(lab, ctx, b.robotId, b.id);
        b.console.push(...r.lines);
      }
      if (job) finishBuild({ lab, ctx, b, job }, 'FAILURE');
    }
    return;
  }
  // Scheduled triggers (game clock). Read-only scan; draft only a job that is due.
  const nowMs = ro(ro(lab).time).nowMs;
  const jobsR = ro(J.jobs);
  for (const jid of Object.keys(jobsR)) {
    const jr = ro(jobsR[jid]!);
    if (!jr.exists || jr.disabled || jr.nextScheduledMs === null || jr.nextScheduledMs > nowMs) continue;
    const job = J.jobs[jid]!;
    let guard = 0;
    while (job.nextScheduledMs !== null && job.nextScheduledMs <= lab.time.nowMs && guard++ < 3) {
      queueBuild(lab, ctx, job.id, {}, 'timer');
      job.nextScheduledMs += job.scheduleEveryMs ?? 86_400_000;
    }
  }
  // Executors.
  const running = runningIds(J).length;
  let free = J.executors - running;
  while (free > 0 && ro(J.queue).length) {
    const id = J.queue.shift()!;
    const b = J.builds[id];
    if (!b || b.state !== 'queued') continue;
    const job = J.jobs[b.jobId];
    b.state = 'running';
    b.startedMs = lab.time.nowMs;
    if (!startedInTx.has(J.builds)) startedInTx.set(J.builds, new Set());
    startedInTx.get(J.builds)!.add(id);
    const jitter = Math.floor(400 * draw(lab, 'jenkins'));
    b.waitUntilMs = lab.time.physMs + jitter;
    b.console.push('[Pipeline] Start of Pipeline', '[Pipeline] node', `Running on lab-executor in /var/lib/jenkins/workspace/${b.jobId}`);
    // A syntax error in the capability map line fails before any stage (Sim §3.18.2).
    if (job) {
      const parsed = parseScript(job.script, b.params);
      if (!parsed.ok) {
        b.console.push(parsed.error);
        b.failureCode = 'SCRIPT';
        b.runner.vars['j.failed'] = '1';
      }
    }
    ctx.emit('jenkins.buildStarted', { buildId: id, jobId: b.jobId, robotId: null });
    free--;
  }
  for (const id of runningIds(J)) {
    const b = J.builds[id]!;
    if (b.state === 'running') stepBuild(lab, ctx, b);
  }
}

/* ────────────────────────────── seeded history (Sim §2.13) ────────────────────────────── */

export { fmtSec };
