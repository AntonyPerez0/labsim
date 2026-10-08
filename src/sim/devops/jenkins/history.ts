/**
 * Seeded / historical builds (Sim §2.13 "last 5 builds", §4.4.1 `jenkins.seedBuild`): finished builds
 * whose consoles come from the same line formats the live engine prints for that outcome.
 */
import { isDraft, original } from 'immer';
import type { BuildResult, JenkinsBuild, JenkinsJob, LabState } from '../../types';
import { JOB_SEEDS } from '../../seed/jenkins';
import { familyOf } from '../config';
import { parseStrictJson } from '../json';
import { newRunner } from '../runners/engine';
import { testsFromScript } from '../runners/uia';
import { stampToMs } from '../util';
import { ORCA_URL, repoForJob, stagesFor, startedByLine } from './engine';
import { parseScript, scriptVar } from './script';
import { receiptVerdict } from '../ollama';

/** Fallback roster facts for history consoles when Orca rows are not seeded yet. */
const ROSTER: Record<string, { type: string; ip: string; cfdIp?: string; env: string; status: string }> = {
  'wall-e': { type: 'FLEX_3', ip: '10.42.30.11', env: 'DEV1', status: 'Available' },
  eve: { type: 'FLEX_4', ip: '10.42.30.12', env: 'DEV1', status: 'Available' },
  bumblebee: { type: 'MINI_3', ip: '10.42.30.13', env: 'DEV1', status: 'Available' },
  'r2-d2': { type: 'STATION_DUO', ip: '10.42.30.14', cfdIp: '10.42.30.14', env: 'DEV1', status: 'Available' },
  'johnny-5': { type: 'FLEX_1', ip: '10.42.30.15', env: 'DEV1', status: 'Available' },
  baymax: { type: 'STATION_2018', ip: '10.42.30.16', env: 'DEV1', status: 'Available' },
  seti: { type: 'COMPACT', ip: '10.42.30.17', env: 'DEV1', status: 'Available' },
  rosie: { type: 'FLEX_POCKET', ip: '10.42.30.18', env: 'DEV1', status: 'Unavailable' },
  megatron: { type: 'STATION_2', ip: '10.42.30.21', cfdIp: '10.42.30.22', env: 'DEV1', status: 'Available' },
  optimus: { type: 'MINI_3', ip: '10.42.30.23', cfdIp: '10.42.30.24', env: 'STG', status: 'Available' },
  data: { type: 'MINI_3', ip: '10.42.30.31', env: 'DEV1', status: 'Available' },
  tars: { type: 'FLEX_4', ip: '10.42.30.32', env: 'DEV1', status: 'Available' },
  'k-9': { type: 'STATION_DUO_2', ip: '10.42.30.51', env: 'DEV1', status: 'Available' },
  astro: { type: 'FLEX_4', ip: '10.42.30.78', env: 'QA', status: 'Available' },
};

function robotFacts(lab: LabState, name: string): { id: number | null; type: string; ip: string; cfdIp: string; env: string; status: string } {
  const r = Object.values(lab.orca.robots).find((x) => x.name === name);
  if (r) {
    const mfd = r.mfdDeviceId != null ? lab.orca.devices[r.mfdDeviceId] : null;
    const dev = mfd ?? (r.deviceId != null ? lab.orca.devices[r.deviceId] : null);
    const cfd = r.cfdDeviceId != null ? lab.orca.devices[r.cfdDeviceId] : null;
    const st = r.status === 'UNAVAILABLE' ? 'Unavailable' : 'Available';
    return { id: r.id, type: dev?.deviceType ?? '', ip: dev?.ip ?? '', cfdIp: mfd ? (cfd?.ip ?? '') : '', env: r.environment, status: st };
  }
  const f = ROSTER[name] ?? { type: 'FLEX_3', ip: '10.42.30.11', env: 'DEV1', status: 'Available' };
  return { id: null, type: f.type, ip: f.ip, cfdIp: f.cfdIp ?? '', env: f.env, status: f.status };
}

/** Canonical failure lines per code (the engine's own formats). */
function failureLines(code: string, ctx: { robot: string; type: string; deviceType: string; job: JenkinsJob; params: Record<string, string> }): { stage: string; lines: string[] } {
  switch (code) {
    case 'ENUM_CASE':
      return { stage: 'Checkout robot', lines: [`[orca] checkout request deviceType=${ctx.deviceType}`, `java.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.${ctx.deviceType}`] };
    case 'JSON_PARSE':
      return { stage: 'Run tests', lines: ['LSTR ParseError: Unexpected token { in JSON at line 9 column 5'] };
    case 'PRINTER_TIMEOUT':
      return { stage: 'Run tests', lines: ['LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s', 'FAILED at "select print"'] };
    case 'PRINTER_NOT_AVAILABLE':
      return { stage: 'Run tests', lines: ['[go-sdk] PrintReceipt → PRINTER_NOT_AVAILABLE'] };
    case 'MISSING_CREDENTIAL':
      return { stage: 'Run tests', lines: ['panic: Terminal SDK: missing credential API_KEY (env var empty)'] };
    case 'ROBOT_BLOCKED':
      return { stage: 'Checkout robot', lines: [`[orca] 409 Conflict: robot ${ctx.robot} is Connection Failed`] };
    case 'ROBOT_NOT_FOUND':
      return { stage: 'Checkout robot', lines: [`[orca] 404 Not Found: no robot named '${ctx.params['ROBOT_NAME'] ?? ''}'`] };
    case 'TETHER_REQUIRED':
      return { stage: 'Run tests', lines: ['[runner] MFD relation empty → standalone', 'AssertionError: TaxTest requires a tethered rig (MFD/CFD)'] };
    case 'UI_NOT_FOUND':
      return { stage: 'Run tests', lines: ['androidx.test.uiautomator.UiObjectNotFoundException: UiSelector[TEXT=Review Order]', '\tat com.labsim.uia.pageobjects.RegisterHomeScreen.reviewOrder(RegisterHomeScreen.java:21)'] };
    case 'ASSERTION':
      return { stage: 'Run tests', lines: ['AssertionError: HomeScreen.isScreenPresent() == false — current screen: RegisterOrderScreen'] };
    case 'OCR_MISMATCH':
      return { stage: 'Run tests', lines: ['[ocr] capture webcam → crop 236x44@412,288 → tesseract → "TOTAI $10.B3" → match=false', 'AssertionError: screenCompare CFD_TOTAL returned false'] };
    case 'ADB_CONNECT':
      return { stage: 'Run tests', lines: [`[runner] adb connect ${ctx.type}`, `adb: failed to connect to '${ctx.type}': Connection refused`] };
    case 'XY_TOUCH_ERROR':
      return { stage: 'Run tests', lines: [`[orca] xy_touch ${ctx.robot} REGISTER_HOME/Register → 409 Conflict: LOCK_RELEASED (park required)`] };
    case 'MERCHANT_MISMATCH':
      return { stage: 'Merchant', lines: [`[paycore] merchant mismatch: expected ${ctx.params['MERCHANT'] ?? ''}, got AUTO-US-NOPIN-01`] };
    case 'EVIDENCE_CAPTURE':
      return { stage: 'Run tests', lines: ['[vision] GET http://10.42.10.40:8081/stream.mjpg → Connection refused'] };
    default:
      return { stage: 'Run tests', lines: [`ERROR: ${code}`] };
  }
}

const STAGE_MS: Record<string, number> = {
  'Checkout SCM': 4_000,
  'Resolve capabilities': 1_000,
  'Checkout robot': 1_000,
  'Verify robot': 1_000,
  Merchant: 0,
  'Inject environment': 1_000,
  'Run tests': 46_000,
  'Release robot': 1_000,
  'Publish results': 2_000,
  'Laz OOBE': 53_000,
  'Trigger Java jobs': 2_000,
};

/** Build a finished build record (not inserted). */
export function synthBuild(
  lab: LabState,
  job: JenkinsJob,
  number: number,
  params: Record<string, string>,
  robotName: string | null,
  result: BuildResult,
  failureCode: string | null,
  atMs: number,
  triggeredBy: string,
): JenkinsBuild {
  const L: string[] = [startedByLine(triggeredBy), '[Pipeline] Start of Pipeline', '[Pipeline] node', `Running on lab-executor in /var/lib/jenkins/workspace/${job.id}`];
  const stages = stagesFor(job).map((name) => ({ name, status: 'pending' as const as 'pending' | 'success' | 'failed' | 'skipped' | 'running', startedMs: null as number | null, durationMs: null as number | null }));
  const facts = robotName ? robotFacts(lab, robotName) : null;
  const parsed = parseScript(job.script, params);
  const caps = parsed.ok ? parsed.caps : null;
  const fail = failureCode && result !== 'SUCCESS' ? failureLines(failureCode, { robot: robotName ?? '', type: facts?.ip ? `${facts.ip}:5444` : '', deviceType: params['DEVICE_TYPE'] ?? '', job, params }) : null;
  let t = atMs;
  let failed = false;
  const env: Record<string, string> = {};
  for (const st of stages) {
    if (failed && st.name !== 'Release robot') {
      st.status = 'skipped';
      continue;
    }
    st.startedMs = t;
    L.push(`[Pipeline] stage (${st.name})`);
    if (fail && fail.stage === st.name) {
      L.push(...fail.lines);
      st.status = 'failed';
      st.durationMs = Math.min(STAGE_MS[st.name] ?? 1000, 3_000);
      t += st.durationMs;
      failed = true;
      continue;
    }
    switch (st.name) {
      case 'Checkout SCM': {
        const repo = lab.repos[repoForJob(job)];
        const sha = repo?.branches['main'] ?? '';
        L.push(` > git fetch --tags --force --progress -- ${repo?.remoteUrl ?? ''} +refs/heads/*:refs/remotes/origin/*`, `Checking out Revision ${sha} (refs/remotes/origin/main)`, `Commit message: "${repo?.commits[sha]?.message.split('\n')[0] ?? ''}"`);
        break;
      }
      case 'Resolve capabilities':
        if (caps?.dynamicFile) L.push('[Pipeline] readJSON');
        break;
      case 'Checkout robot': {
        const named = !!params['ROBOT_NAME'];
        const dt = caps?.nonDynamic?.['deviceType'];
        if (typeof dt === 'string' && dt) L.push(`[orca] checkout request deviceType=${dt}`);
        const R = { ...(caps?.nonDynamic ?? {}) };
        if (caps?.dynamicFile) {
          const text = lab.repos[caps.dynamicFile.startsWith('go-sdk') || caps.dynamicFile.startsWith('suites') ? 'gort' : repoForJob(job)]?.files[caps.dynamicFile];
          const r = text ? parseStrictJson(text) : null;
          if (r?.ok) Object.assign(R, (r.value as { capabilities?: Record<string, string | boolean> }).capabilities ?? {});
        }
        if (Object.keys(R).length) L.push(`[orca] capabilities: ${Object.entries(R).map(([k, x]) => `${k}=${x}`).join(', ')} (${caps?.nonDynamic && caps.dynamicFile ? `non-dynamic + dynamic: ${caps.dynamicFile}` : caps?.dynamicFile ? `dynamic: ${caps.dynamicFile}` : 'non-dynamic'})`);
        if (robotName) L.push(named ? `Checked out robot ${robotName} (named)` : `[orca] checkout → ${robotName} (${facts?.type}) OK`);
        break;
      }
      case 'Merchant':
      case 'Laz OOBE':
        if (params['MERCHANT']) L.push(...lazHistoryLines(lab, job, robotName, params['MERCHANT']));
        break;
      case 'Inject environment': {
        if (facts) {
          env['RUN_TYPE'] = facts.cfdIp ? 'tethered' : 'standalone';
          env['DEVICE_TYPE'] = facts.type;
          env['ROBOT_NAME'] = robotName!;
          env['PORT_NUMBER'] = '5444';
          env['THEME'] = 'avocado';
          env['KERNEL_TYPE'] = 'CPA';
          for (const k of ['RUN_TYPE', 'DEVICE_TYPE', 'ROBOT_NAME', 'PORT_NUMBER', 'THEME', 'KERNEL_TYPE']) L.push(`[env] ${k}=${env[k]}`);
        }
        const m = Object.values(lab.orca.merchants).find((x) => x.name === params['MERCHANT']);
        if (m && (m.appId || m.appSecret || m.apiKey)) L.push(`[env] APP_ID=${m.appId ?? ''} APP_SECRET=${m.appSecret ? '****' : ''} API_KEY=${m.apiKey ? '****' : ''}`);
        else if (params['MERCHANT'] === 'GO-SDK-US-01' && !Object.keys(lab.orca.merchants).length) L.push('[env] APP_ID=app_sim_7f3a APP_SECRET=**** API_KEY=****');
        break;
      }
      case 'Run tests':
        L.push(...runLines(lab, job, facts, robotName, result));
        break;
      case 'Release robot':
        if (robotName) L.push(`[orca] released ${robotName} → ${facts?.status ?? 'Available'}`);
        break;
      case 'Publish results': {
        const n = job.runner === 'uia-remote' ? testsFromScript(job.script, job.testRef?.path ?? null).length : 1;
        L.push(`Tests: ${n}, Failures: 0, Errors: 0, Skipped: 0`);
        break;
      }
      case 'Trigger Java jobs':
        for (const j of Object.values(lab.jenkins.jobs).filter((x) => x.folder === 'Java' && x.id !== job.id).sort((a, b) => a.id.localeCompare(b.id, 'en-US'))) L.push(`Scheduling project: Java » ${j.name}`);
        break;
    }
    st.status = 'success';
    st.durationMs = STAGE_MS[st.name] ?? 1000;
    t += st.durationMs;
  }
  if (failed && fail?.stage === 'Run tests') {
    const pub = stages.find((s) => s.name === 'Publish results');
    if (pub) pub.status = 'skipped';
  }
  L.push('[Pipeline] End of Pipeline', `Finished: ${result}`);
  const id = `${job.id}#${number}`;
  const runner = newRunner(job.runner === 'gort-sync' ? 'uia-remote' : job.runner, []);
  if (robotName) runner.vars['j.robotName'] = robotName;
  runner.vars['_result'] = result === 'SUCCESS' ? 'pass' : 'fail';
  return {
    id,
    jobId: job.id,
    number,
    params: { ...params },
    env: facts ? { ...env, MERCHANT: params['MERCHANT'] ?? '', CARD_PROFILE: params['CARD_PROFILE'] ?? '', BACKEND_ENV: facts.env, ORCA_URL } : {},
    envMasked: facts ? { ...env } : {},
    state: 'finished',
    result,
    queuedMs: atMs,
    startedMs: atMs,
    finishedMs: t,
    stages,
    console: L,
    robotId: facts?.id ?? null,
    failureCode: result === 'SUCCESS' ? null : (failureCode ?? (result === 'UNSTABLE' && job.runner === 'vision' ? 'VISION_FAIL' : null)),
    triggeredBy,
    cursor: stages.length,
    waitUntilMs: null,
    runner,
    local: false,
  };
}

/**
 * The Laz lines a finished historical swap printed (Sim §3.17.2, same formats as `core/laz.ts`). A Laz
 * job always swapped (its history alternates merchants); another job's `Merchant` stage swapped when the
 * rig's Orca merchant (what it should hold) differs from `MERCHANT` — e.g. Riley's FLEX_POCKET run on ROSIE
 * (INC40). The restore-adb line is omitted when the device is now without ADB over TCP (INC28's seeded swap).
 */
function lazHistoryLines(lab: LabState, job: JenkinsJob, robotName: string | null, merchant: string): string[] {
  const robot = robotName ? Object.values(lab.orca.robots).find((r) => r.name === robotName) : undefined;
  const m = Object.values(lab.orca.merchants).find((x) => x.name === merchant);
  const should = robot?.merchantConfigId != null ? lab.orca.merchants[robot.merchantConfigId]?.name : undefined;
  const swapped = job.runner === 'laz' || (!!should && should !== merchant);
  if (!swapped || !m) return [`laz: merchant already active (${merchant}) — skipped`];
  const orcaDev = robot ? (robot.mfdDeviceId ?? robot.deviceId) : null;
  const row = orcaDev != null ? lab.orca.devices[orcaDev] : undefined;
  const dev = row ? Object.values(lab.devices).find((d) => d.serial === row.serial) : undefined;
  const rig = dev?.rigId ? lab.rigs[dev.rigId] : undefined;
  const pi = rig?.piHostId ? lab.hosts[rig.piHostId] : undefined;
  const route = m.ubiRoute ? lab.ubi.routes[m.ubiRoute] : undefined;
  const out = [`ubi: routing merchant switch → ${m.name}`, `ubi: route ${m.ubiRoute ?? ''} → ${route?.region ?? m.region} OK`, 'laz: de-provision', 'laz: wipe caches'];
  for (let i = 1; i <= 6; i++) out.push(`laz: setup wizard ${i}/6`);
  out.push('laz: merchant active');
  if (!dev || dev.adbTcpPort !== null) out.push(`laz: adb tcpip 5444 via ${pi?.hostname ?? 'robot-pi'} → OK`);
  out.push(`laz: verify OK (${dev?.serial ?? row?.serial ?? ''} on ${m.name})`);
  return out;
}

function runLines(lab: LabState, job: JenkinsJob, facts: ReturnType<typeof robotFacts> | null, robot: string | null, result: BuildResult = 'SUCCESS'): string[] {
  const out: string[] = [];
  if (job.runner === 'uia-remote') {
    const tests = testsFromScript(job.script, job.testRef?.path ?? null);
    const tethered = !!facts?.cfdIp;
    out.push(`+ ./gradlew connectedAndroidTest -Pclasses=${tests.join(',')}`, 'Starting a Gradle Daemon (subsequent builds will be faster)', '> Task :app:connectedDebugAndroidTest');
    out.push(`[runner] uia-remote 4.2.0 · UI Automator ${lab.flags.uiaVersion} · runType=${tethered ? 'tethered' : 'standalone'} · deviceType=${facts ? familyOf(facts.type) : ''}`);
    if (tethered) out.push(`[runner] MFD handle ${facts!.ip}:5444 connected`, `[runner] CFD handle ${facts!.cfdIp}:5444 connected`);
    else out.push(`[runner] DEVICE handle ${facts?.ip ?? ''}:5444 connected`);
    const counts: Record<string, number> = { HomeScreenTest: 4, SaleTest: 8, TaxTest: 4, TaxTestDuo: 4, RefundTest: 2, DuoCfdSuite: 5, DuoCheckoutTest: 5, PrinterlessSmokeTest: 8, ContactCanadaPinSaleTest: 9, ReceiptScreenTest: 8 };
    for (const t of tests) {
      out.push(`[runner] ${t}`, '[setup] wake + unlock (passcode ****) … OK', `[setup] HomeScreen.waitForScreen() … OK  (${tethered ? 'MFD, CFD' : 'DEVICE'})`);
      if (t === 'PaycoreMatrixTest') {
        const profiles = (job.savedParams['CARD_PROFILE'] || 'VISA_STD_DIP').split(',');
        profiles.forEach((p, i) => out.push(`[paycore] ${p.trim()} → APPROVED (SIM${String(100 + i * 37).padStart(3, '0')})`));
        out.push(`${t} PASSED (${profiles.length}/${profiles.length} steps)`);
      } else out.push(`${t} PASSED (${counts[t] ?? 1}/${counts[t] ?? 1} steps)`);
    }
    out.push('BUILD SUCCESSFUL in 48s');
  } else if (job.runner === 'pigeon' || job.runner === 'ios') {
    const file = scriptVar(job.script, 'testFile') ?? job.testRef?.path ?? '';
    const platform = job.runner === 'ios' ? 'IOS' : job.platform === 'windows' ? 'WINDOWS' : 'ANDROID';
    out.push(`+ lstr run --platform ${platform} ${file}`);
    if (job.runner === 'ios') out.push(robot ? `[ios] LSTR iOS runner · iPhone (Go SDK mobile runner) on ${robot} · Go SDK mobile build 1.14.2` : '[ios] LSTR iOS runner · iOS Simulator (iPhone 15, iOS 17.5)');
    const text = lab.repos['pigeon']?.files[file];
    const r = text ? parseStrictJson(text) : null;
    const actions = r?.ok ? ((r.value as { actions?: { action?: string }[] }).actions ?? []) : [];
    out.push(`LSTR 2.8.1 · platform ${platform} · ${file} · ${actions.length} actions`);
    actions.forEach((a, i) => out.push(`LSTR step ${i + 1}/${actions.length} "${a.action ?? ''}" … OK (${(2.1 + ((i * 7) % 5) * 0.6).toFixed(1)} s)`));
    out.push(`LSTR PASSED (${actions.length}/${actions.length} actions) — ${r?.ok ? String((r.value as { name?: string }).name ?? '') : file}`);
  } else if (job.runner === 'go-sdk') {
    out.push('+ go run ./go-sdk/cmd/gosdk-run go-sdk/tests/sale_receipt.json', '[go-sdk] terminal-sdk v1.14.2 · Go SDK sale with printed receipt', `[runner] DEVICE handle ${facts?.ip ?? ''}:5444 connected`, `[go-sdk] connect app=app_sim_7f3a device=${facts?.ip ?? ''}:5444 … OK`, '[go-sdk] Sale 1000 → APPROVED (SIM481)', '[go-sdk] PrintReceipt → OK');
  } else if (job.runner === 'vision') {
    out.push('+ ./vision/receipt_check.sh --model llava:latest --ollama http://10.42.1.12:11434', `[runner] DEVICE handle ${facts?.ip ?? ''}:5444 connected`);
    ['create order', 'review order', 'pay', 'card swipe', 'add tip', 'assert approved', 'select print'].forEach((a, i) => out.push(`[vision] step ${i + 1}/7 "${a}" … OK (${(2.4 + i * 0.3).toFixed(1)} s)`));
    out.push(`[vision] GET http://${facts?.ip.replace('10.42.30.', '10.42.10.') ?? ''}:8081/stream.mjpg → 200 (frame saved)`, '[vision] POST http://10.42.1.12:11434/api/generate (llava:latest) …');
    // UNSTABLE = the model said FAIL (Sim §3.21.2): the same two lines the live runner prints, for the
    // newest seeded receipt scenario (INC57 seeds it right before the build).
    const scen = result === 'UNSTABLE' ? Object.values(lab.ollama.receiptScenarios).at(-1) : undefined;
    const v = scen ? receiptVerdict(scen) : null;
    if (v && v.verdict === 'FAIL') out.push('[vision] llava verdict: FAIL', `[vision] ${v.text}`);
    else out.push('[vision] llava verdict: PASS');
  }
  return out;
}

/** Last 5 builds per job (Sim §2.13). */
export function seedHistory(lab: LabState): void {
  const day = 86_400_000;
  JOB_SEEDS.forEach((s, k) => {
    const job = lab.jenkins.jobs[s.id];
    if (!job) return;
    const last = s.lastRun ? stampToMs(lab.time.epochDate, s.lastRun) : 7 * 3_600_000 + 3 * 60_000 * k;
    const spacing = s.id.startsWith('iOS/pigeon-ios-lstr') ? 21 * day : s.lastRun ? day : 47 * 60_000;
    for (let i = 5; i >= 1; i--) {
      const number = s.nextNumber - i;
      const idx = 5 - i;
      const robot = s.historyRobots.length ? s.historyRobots[idx % s.historyRobots.length]! : null;
      const params: Record<string, string> = { ...job.savedParams };
      if (s.historyEnvs) params['BACKEND_ENV'] = s.historyEnvs[idx % s.historyEnvs.length]!;
      if (s.id === 'Java/uia-remote-regression-flex') params['DEVICE_TYPE'] = idx % 2 === 0 ? 'FLEX_3' : 'FLEX_4';
      if (s.runner === 'laz') {
        params['ROBOT_NAME'] = 'data';
        params['MERCHANT'] = idx % 2 === 0 ? 'AUTO-US-NOPIN-02' : 'AUTO-US-NOPIN-01';
      }
      const at = last - (i - 1) * spacing;
      const trig = s.schedule || s.lastRun?.endsWith('02:07') ? 'timer' : s.id === 'Java/paycore-standalone-matrix' ? 'sam' : s.runner === 'laz' ? 'riley' : 'timer';
      const b = synthBuild(lab, job, number, params, robot, 'SUCCESS', null, at, trig);
      lab.jenkins.builds[b.id] = b;
      job.buildIds.push(b.id);
    }
  });
}

/** Link seeded builds to Orca robot ids once Orca rows exist (seed order independence). */
export function linkHistoryRobots(lab: LabState): void {
  // Scan the transaction's base (no draft proxies); touch the draft only for builds that need a link.
  const builds = isDraft(lab.jenkins.builds) ? (original(lab.jenkins.builds) as LabState['jenkins']['builds']) : lab.jenkins.builds;
  let byName: Map<string, number> | null = null;
  for (const [id, base] of Object.entries(builds)) {
    if (base.robotId !== null || base.state !== 'finished') continue;
    const name = base.runner.vars['j.robotName'];
    if (!name) continue;
    if (!byName) {
      const robots = isDraft(lab.orca.robots) ? (original(lab.orca.robots) as LabState['orca']['robots']) : lab.orca.robots;
      byName = new Map(Object.values(robots).map((r) => [r.name, r.id]));
    }
    const rid = byName.get(name);
    if (rid === undefined) continue;
    const b = lab.jenkins.builds[id];
    if (b && b.robotId === null) b.robotId = rid;
  }
}
