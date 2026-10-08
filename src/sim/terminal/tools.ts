/**
 * Developer tools on the workstation (Apps §5.4): `mvn test` / `./gradlew connectedAndroidTest`
 * (illustrative wrappers around a local uia-remote run, Sim §1.12 — same engine as IntelliJ, so RESERVED
 * and Jenkins-collision rules apply), `tesseract <image> stdout` (Sim §3.12.2), the `ollama` CLI
 * (Sim §3.21.2) and a small `jq`.
 */
import type { LabState } from '../types';
import { core } from '../devops/coreRef';
import { runLocal, stopLocal } from '../devops/local';
import { ask, OLLAMA_IP, OLLAMA_PORT, ollamaUp } from '../devops/ollama';
import { gameDate, pad2 } from '../devops/util';
import { UIA_PATHS } from '../seed/repos/uiaRemote';
import type { CmdResult, Line, Sh } from './session';
import { E, L, fail, ok, registerJob, resolvePath } from './session';
import { cwdAbs, cwdRepo } from './ws';

/* ────────────────────────────── mvn / gradlew ────────────────────────────── */

const MVN_HEAD = (): Line[] =>
  [
    '[INFO] Scanning for projects...',
    '[INFO] ',
    '[INFO] ------------------< com.labsim.automation:uia-remote >------------------',
    '[INFO] Building uia-remote 4.2.0',
    '[INFO] --------------------------------[ pom ]---------------------------------',
    '[INFO] ',
    '[INFO] --- maven-surefire-plugin:3.2.5:test (default-test) @ uia-remote ---',
    '[INFO] ',
    '[INFO] -------------------------------------------------------',
    '[INFO]  T E S T S',
    '[INFO] -------------------------------------------------------',
  ].map((t) => L(t));

function isoStamp(lab: LabState): string {
  const t = gameDate(lab, lab.time.nowMs);
  return `${t.y}-${pad2(t.mo)}-${pad2(t.d)}T${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)}-04:00`;
}

/** Stream a local run's output (shared by mvn and gradlew), with a tool-specific footer. */
function streamRun(sh: Sh, runId: string, tool: 'mvn' | 'gradle', testName: string): CmdResult {
  let shown = 0;
  const startPhys = sh.lab.time.physMs;
  const job = registerJob({
    step(s) {
      const run = s.lab.local.runs[runId];
      if (!run) return { lines: [E('process exited')], done: true, exitCode: 1 };
      const lines: Line[] = run.output.slice(shown).map((t) => (/FAIL|Exception|ERROR|Error/.test(t) ? L(t, 'err') : L(t)));
      shown = run.output.length;
      if (run.state !== 'finished') return { lines, done: false, exitCode: null };
      const secs = Math.max(0.1, (s.lab.time.physMs - startPhys) / 1000);
      const passed = run.passed === true;
      if (tool === 'mvn') {
        lines.push(
          passed
            ? L(`[INFO] Tests run: 1, Failures: 0, Errors: 0, Skipped: 0, Time elapsed: ${secs.toFixed(1)} s - in com.labsim.uia.testactions.${testName}`)
            : L(`[ERROR] Tests run: 1, Failures: 1, Errors: 0, Skipped: 0, Time elapsed: ${secs.toFixed(1)} s <<< FAILURE! - in com.labsim.uia.testactions.${testName}`, 'err'),
          L('[INFO] '),
          L('[INFO] ------------------------------------------------------------------------'),
          passed ? L('[INFO] BUILD SUCCESS', 'success') : L('[INFO] BUILD FAILURE', 'err'),
          L('[INFO] ------------------------------------------------------------------------'),
          L(`[INFO] Total time:  ${secs >= 60 ? `${pad2(Math.floor(secs / 60))}:${pad2(Math.round(secs % 60))} min` : `${secs.toFixed(3)} s`}`),
          L(`[INFO] Finished at: ${isoStamp(s.lab)}`),
          L('[INFO] ------------------------------------------------------------------------'),
        );
        if (!passed) lines.push(L(`[ERROR] Failed to execute goal org.apache.maven.plugins:maven-surefire-plugin:3.2.5:test (default-test) on project uia-remote: There are test failures.`, 'err'));
      } else {
        lines.push(
          passed ? L('') : L(`> Task :app:connectedDebugAndroidTest FAILED`, 'err'),
          passed ? L('BUILD SUCCESSFUL in ' + `${Math.round(secs)}s`, 'success') : L(`BUILD FAILED in ${Math.round(secs)}s`, 'err'),
          L('42 actionable tasks: 3 executed, 39 up-to-date'),
        );
      }
      return { lines, done: true, exitCode: passed ? 0 : 1 };
    },
    interrupt(s) {
      const run = s.lab.local.runs[runId];
      if (run && run.state !== 'finished') stopLocal(s.lab, s.ctx, runId);
      return [];
    },
  });
  return { lines: [], code: 0, stream: job };
}

function testClassFrom(args: string[], prefix: string): string | null {
  for (const a of args) {
    if (a.startsWith(prefix)) {
      const v = a.slice(prefix.length).replace(/^com\.labsim\.uia\.testactions\./, '');
      return v.split(/[#,]/)[0] ?? null;
    }
  }
  return null;
}

export function mvn(sh: Sh, argv: string[]): CmdResult {
  const lab = sh.lab;
  if (argv.includes('-v') || argv.includes('--version')) return ok(L('Apache Maven 3.6.3'), L('Maven home: /usr/share/maven'), L('Java version: 17.0.12, vendor: Ubuntu, runtime: /usr/lib/jvm/java-17-openjdk-amd64'), L('OS name: "linux", version: "6.5.0-45-generic", arch: "amd64", family: "unix"'));
  const at = cwdRepo(lab);
  const files = at ? lab.repos[at.repo].local?.files : undefined;
  if (!at || at.rel || !files?.['pom.xml']) {
    return fail(1, L('[INFO] Scanning for projects...'), L('[INFO] ------------------------------------------------------------------------'), L('[INFO] BUILD FAILURE', 'err'), L('[INFO] ------------------------------------------------------------------------'), E(`[ERROR] The goal you specified requires a project to execute but there is no POM in this directory (${cwdAbs(lab)}). Please verify you invoked Maven from the correct directory. -> [Help 1]`));
  }
  if (at.repo !== 'uia-remote') return fail(1, ...MVN_HEAD().slice(0, 1), E(`[ERROR] ${at.repo}: the lab's Maven test goal only drives uia-remote device tests.`));
  const goals = argv.slice(1).filter((a) => !a.startsWith('-'));
  if (!goals.length) return fail(1, L('[INFO] Scanning for projects...'), E('[ERROR] No goals have been specified for this build. You must specify a valid lifecycle phase or a goal. Available lifecycle phases are: validate, compile, test, package, install, deploy. -> [Help 1]'));
  if (goals.includes('clean') && goals.length === 1) return ok(...MVN_HEAD().slice(0, 6), L('[INFO] --- maven-clean-plugin:3.2.0:clean (default-clean) @ uia-remote ---'), L('[INFO] BUILD SUCCESS', 'success'));
  if (!goals.includes('test')) return fail(1, ...MVN_HEAD().slice(0, 6), E(`[ERROR] Unknown lifecycle phase "${goals[0]}".`));
  const test = testClassFrom(argv, '-Dtest=');
  if (!test) return fail(1, ...MVN_HEAD(), E('[ERROR] uia-remote device tests check out a robot each — run one class: mvn test -Dtest=<TestClass> (e.g. -Dtest=SaleTest)'));
  const r = runLocal(lab, sh.ctx, 'uia-remote', UIA_PATHS.test(test), 'player');
  if (!r.ok) return fail(1, ...MVN_HEAD(), E(`[ERROR] ${r.error}`));
  const s = streamRun(sh, r.runId, 'mvn', test);
  return { ...s, lines: [...MVN_HEAD(), L(`[INFO] Running com.labsim.uia.testactions.${test}`)] };
}

export function gradlew(sh: Sh, argv: string[]): CmdResult {
  const lab = sh.lab;
  const at = cwdRepo(lab);
  const files = at ? lab.repos[at.repo].local?.files : undefined;
  if (!at || at.rel || files?.['gradlew'] === undefined) return fail(127, E(`bash: ${argv[0]}: No such file or directory`));
  if (argv.includes('--version')) return ok(L(''), L('------------------------------------------------------------'), L('Gradle 8.7'), L('------------------------------------------------------------'), L(''), L('Kotlin:       1.9.22'), L('JVM:          17.0.12 (Ubuntu 17.0.12+7-Ubuntu-1ubuntu222.04)'), L('OS:           Linux 6.5.0-45-generic amd64'));
  const tasks = argv.slice(1).filter((a) => !a.startsWith('-'));
  if (!tasks.length) return ok(L(''), L('> Task :help'), L(''), L('Welcome to Gradle 8.7.'), L(''), L('To run a build, run gradlew <task> ...'), L(''), L('BUILD SUCCESSFUL in 1s'), L('1 actionable task: 1 executed'));
  if (!tasks.some((t) => /connected(Debug)?AndroidTest|connectedCheck/.test(t))) {
    if (tasks.includes('assembleDebug') || tasks.includes('build')) return ok(L('> Task :app:preBuild UP-TO-DATE'), L('> Task :app:compileDebugJavaWithJavac UP-TO-DATE'), L('> Task :app:assembleDebug UP-TO-DATE'), L(''), L('BUILD SUCCESSFUL in 4s', 'success'), L('31 actionable tasks: 31 up-to-date'));
    return fail(1, L(''), L('FAILURE: Build failed with an exception.', 'err'), L(''), L('* What went wrong:'), L(`Task '${tasks[0]}' not found in root project 'uia-remote'.`), L(''), L('BUILD FAILED in 1s', 'err'));
  }
  const arg = argv.find((a) => a.startsWith('-Pandroid.testInstrumentationRunnerArguments.class='));
  const test = arg ? (arg.split('=')[1] ?? '').replace(/^com\.labsim\.uia\.testactions\./, '').split('#')[0]! : null;
  if (!test) return fail(1, L('> Task :app:connectedDebugAndroidTest'), E('uia-remote: pass the test class: -Pandroid.testInstrumentationRunnerArguments.class=com.labsim.uia.testactions.<TestClass>'), L('BUILD FAILED in 2s', 'err'));
  const r = runLocal(lab, sh.ctx, 'uia-remote', UIA_PATHS.test(test), 'player');
  if (!r.ok) return fail(1, E(r.error), L('BUILD FAILED in 1s', 'err'));
  const s = streamRun(sh, r.runId, 'gradle', test);
  return { ...s, lines: ['> Task :app:preBuild UP-TO-DATE', '> Task :app:compileDebugAndroidTestJavaWithJavac UP-TO-DATE', '> Task :app:connectedDebugAndroidTest'].map((t) => L(t)) };
}

/* ────────────────────────────── tesseract ────────────────────────────── */

export type WsReader = (pathFromCwd: string) => string | 'DIR' | null;
export type WsWriterFn = (pathFromCwd: string, contents: string) => string | null;

export function tesseract(sh: Sh, argv: string[], read: WsReader, write: WsWriterFn): CmdResult {
  const args = argv.slice(1);
  if (!args.length || args[0] === '--help') return fail(1, L('Usage:'), L('  tesseract --help | --help-extra | --version'), L('  tesseract --list-langs'), L('  tesseract imagename outputbase [options...] [configfile...]'));
  if (args[0] === '--version' || args[0] === '-v') return ok(L('tesseract 4.1.1'), L(' leptonica-1.82.0'), L('  libgif 5.1.9 : libjpeg 8d (libjpeg-turbo 2.1.1) : libpng 1.6.37 : libtiff 4.3.0 : zlib 1.2.11 : libwebp 1.2.2 : libopenjp2 2.4.0'));
  const pos = args.filter((a, i) => !a.startsWith('-') && !['--psm', '--oem', '-l'].includes(args[i - 1] ?? ''));
  const [img, outBase] = pos;
  if (!img || !outBase) return fail(1, E('Error, missing outputbase command line argument'));
  const ref = read(img);
  if (ref === null || ref === 'DIR') return fail(1, E(`Error, cannot read input file ${img}: No such file or directory`), E(`Error during processing.`));
  if (!ref.startsWith('img:')) return fail(1, E(`Error in pixReadStream: Unknown format: no pix returned`), E(`Error in pixRead: pix not read`), E(`Error during processing.`));
  const r = core().tesseract(sh.lab, ref, { x: 0, y: 0, w: 100_000, h: 100_000 });
  const pre = [E('Estimating resolution as 144')];
  const text = r.text;
  if (outBase === 'stdout' || outBase === '-') return { lines: [...pre, ...(text ? text.split('\n').map((t) => L(t)) : []), L('\f')], code: 0 };
  const e = write(`${outBase}.txt`, `${text}\n\f`);
  if (e) return fail(1, E(`Can't open ${outBase}.txt for writing`));
  return { lines: pre, code: 0 };
}

/* ────────────────────────────── ollama CLI ────────────────────────────── */

function ollamaHost(sh: Sh): { ip: string; port: number } | null {
  const raw = sh.env['OLLAMA_HOST'];
  if (!raw) return null;
  const m = /^(?:https?:\/\/)?([^:/]+)(?::(\d+))?/.exec(raw);
  if (!m) return null;
  const r = core().resolve(sh.lab, m[1]!);
  return r.ip ? { ip: r.ip, port: m[2] ? Number(m[2]) : 11434 } : null;
}

export function ollamaCli(sh: Sh, argv: string[], read: WsReader): CmdResult {
  const sub = argv[1];
  if (!sub || sub === 'help' || sub === '--help') {
    return ok(...['Large language model runner', '', 'Usage:', '  ollama [flags]', '  ollama [command]', '', 'Available Commands:', '  serve       Start ollama', '  run         Run a model', '  list        List models', '  ps          List running models', '', 'Environment Variables:', '      OLLAMA_HOST                IP Address for the ollama server (default 127.0.0.1:11434)'].map((t) => L(t)));
  }
  if (sub === '--version' || sub === '-v') return ok(L('Warning: could not connect to a running Ollama instance'), L('Warning: client version is 0.3.12'));
  if (sub === 'serve') return fail(1, E('Error: listen tcp 127.0.0.1:11434: bind: the workstation does not run models — the lab server is 10.42.1.12 (OLLAMA_HOST=10.42.1.12:11434)'));
  const host = ollamaHost(sh);
  if (!host) return fail(1, E('Error: could not connect to ollama app, is it running?'));
  const lab = sh.lab;
  const reach = core().reach(lab, sh.ctx, 'ws-17', host.ip, host.port);
  if (!(host.ip === OLLAMA_IP && host.port === OLLAMA_PORT) || !reach.ok || !ollamaUp(lab)) {
    const why = reach.kind === 'timeout' ? 'i/o timeout' : reach.kind === 'no-route' ? 'connect: no route to host' : 'connect: connection refused';
    return fail(1, E(`Error: Head "http://${host.ip}:${host.port}/": dial tcp ${host.ip}:${host.port}: ${why}`));
  }
  if (sub === 'list' || sub === 'ls') return ok(L('NAME            ID              SIZE      MODIFIED    '), ...lab.ollama.models.map((m) => L(`${m.padEnd(16)}8dd30f6b0cb1    4.7 GB    3 weeks ago    `)));
  if (sub === 'ps') {
    const loaded = lab.ollama.requests.some((r) => r.state === 'done');
    return ok(L('NAME            ID              SIZE      PROCESSOR    UNTIL              '), ...(loaded ? [L('llava:latest    8dd30f6b0cb1    7.1 GB    100% GPU     4 minutes from now    ')] : []));
  }
  if (sub === 'pull') return ok(L('pulling manifest '), L('pulling 170370233dd5... 100% ▕████████████████▏ 4.1 GB'), L('verifying sha256 digest '), L('writing manifest '), L('success '));
  if (sub !== 'run') return fail(1, E(`Error: unknown command "${sub}" for "ollama"`), E("Run 'ollama --help' for usage."));
  const model = argv[2];
  if (!model) return fail(1, E('Error: requires at least 1 arg(s), only received 0'));
  const words = argv.slice(3);
  if (!words.length) return fail(1, E('Error: the lab terminal has no interactive chat — pass the prompt: ollama run llava "<prompt>" ./image.jpg'));
  // The CLI picks image paths out of the prompt text (multimodal models).
  let image: string | null = null;
  const promptParts: string[] = [];
  for (const w of words.join(' ').split(/\s+/)) {
    if (/\.(png|jpe?g)$/i.test(w)) {
      const ref = read(w);
      if (ref === null || ref === 'DIR') return fail(1, E(`Error: couldn't open image file ${w}: open ${resolvePath(cwdAbs(lab), w)}: no such file or directory`));
      image = ref;
      promptParts.push(w);
      continue;
    }
    promptParts.push(w);
  }
  const a = ask(lab, sh.ctx, model, promptParts.join(' '), image, 'player');
  if (!a.ok) return fail(1, E(`Error: ${a.error}`));
  const pre: Line[] = image ? [L(`Added image '${words.join(' ').split(/\s+/).find((w) => /\.(png|jpe?g)$/i.test(w))}'`, 'muted')] : [];
  const id = a.requestId;
  const job = registerJob({
    step(s) {
      const q = s.lab.ollama.requests.find((x) => x.id === id);
      if (!q) return { lines: [E('Error: request lost')], done: true, exitCode: 1 };
      if (q.state !== 'done') return { lines: [], done: false, exitCode: null };
      if (q.response === null) return { lines: [E(`Error: Post "http://${OLLAMA_IP}:${OLLAMA_PORT}/api/chat": EOF`)], done: true, exitCode: 1 };
      return { lines: [...q.response.split('\n').map((t) => L(t)), L('')], done: true, exitCode: 0 };
    },
  });
  return { lines: pre, code: 0, stream: job };
}

/* ────────────────────────────── jq ────────────────────────────── */

type J = unknown;

function jqPath(v: J, path: string): J[] {
  // path like .a.b[0].c[] — returns 0..n outputs
  let outs: J[] = [v];
  const re = /\.([A-Za-z_][\w-]*)|\.?\["([^"]+)"\]|\.?\[(-?\d+)\]|\.?\[\]|^\.$/g;
  if (path === '.' || path === '') return outs;
  let m: RegExpExecArray | null;
  let consumed = 0;
  while ((m = re.exec(path))) {
    if (m.index !== consumed) throw new Error(`syntax error, unexpected INVALID_CHARACTER`);
    consumed = re.lastIndex;
    const next: J[] = [];
    for (const o of outs) {
      if (m[1] !== undefined || m[2] !== undefined) {
        const k = (m[1] ?? m[2])!;
        if (o === null) next.push(null);
        else if (typeof o === 'object' && !Array.isArray(o)) next.push((o as Record<string, J>)[k] ?? null);
        else throw new Error(`Cannot index ${Array.isArray(o) ? 'array' : typeof o} with "${k}"`);
      } else if (m[3] !== undefined) {
        if (o === null) next.push(null);
        else if (Array.isArray(o)) {
          const i = Number(m[3]);
          next.push(o[i < 0 ? o.length + i : i] ?? null);
        } else throw new Error(`Cannot index ${typeof o} with number`);
      } else if (m[0].endsWith('[]')) {
        if (Array.isArray(o)) next.push(...o);
        else if (o && typeof o === 'object') next.push(...Object.values(o));
        else throw new Error(`Cannot iterate over ${o === null ? 'null' : typeof o}`);
      }
    }
    outs = next;
  }
  if (consumed !== path.length) throw new Error('syntax error, unexpected INVALID_CHARACTER');
  return outs;
}

function jqLiteral(s: string): J {
  const t = s.trim();
  if (/^".*"$/.test(t)) return t.slice(1, -1);
  if (t === 'null') return null;
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  throw new Error(`syntax error, unexpected IDENT`);
}

function jqStage(v: J, stage: string): J[] {
  const st = stage.trim();
  if (st === 'length') return [Array.isArray(v) ? v.length : typeof v === 'string' ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0];
  if (st === 'keys') return [v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort() : Array.isArray(v) ? v.map((_, i) => i) : []];
  const sel = /^select\((.+?)\s*(==|!=)\s*(.+)\)$/.exec(st);
  if (sel) {
    const left = jqPath(v, sel[1]!.trim())[0];
    const right = sel[3]!.trim().startsWith('.') ? jqPath(v, sel[3]!.trim())[0] : jqLiteral(sel[3]!);
    const eq = JSON.stringify(left) === JSON.stringify(right);
    return (sel[2] === '==' ? eq : !eq) ? [v] : [];
  }
  const map = /^map\((.+)\)$/.exec(st);
  if (map) {
    if (!Array.isArray(v)) throw new Error(`Cannot iterate over ${typeof v}`);
    return [v.flatMap((x) => jqPipeline(x, map[1]!))];
  }
  if (st.startsWith('.')) return jqPath(v, st);
  return [jqLiteral(st)];
}

function jqPipeline(v: J, filter: string): J[] {
  let outs: J[] = [v];
  for (const stage of filter.split('|')) outs = outs.flatMap((o) => jqStage(o, stage));
  return outs;
}

export function jq(argv: string[], stdin: string[] | null, read: WsReader): CmdResult {
  const opts = argv.slice(1).filter((a) => a.startsWith('-') && a.length > 1);
  const pos = argv.slice(1).filter((a) => !(a.startsWith('-') && a.length > 1));
  const filter = pos[0] ?? '.';
  const raw = opts.some((o) => o === '-r' || o === '--raw-output' || (o.startsWith('-') && !o.startsWith('--') && o.includes('r')));
  const compact = opts.some((o) => o === '-c' || o === '--compact-output' || (o.startsWith('-') && !o.startsWith('--') && o.includes('c')));
  let text: string;
  let src = '<stdin>';
  if (pos[1]) {
    const t = read(pos[1]);
    if (t === null || t === 'DIR') return fail(2, E(`jq: error: Could not open ${pos[1]}: ${t === 'DIR' ? 'Is a directory' : 'No such file or directory'}`));
    text = t;
    src = pos[1];
  } else text = (stdin ?? []).join('\n');
  if (!text.trim()) return ok();
  let value: J;
  try {
    value = JSON.parse(text);
  } catch {
    const lines = text.split('\n');
    return fail(2, E(`jq: error (at ${src}:${lines.length}): Cannot parse input: Invalid numeric literal at line 1, column ${Math.min(text.length, 10)}`), E(`parse error: Invalid numeric literal at line 1, column ${Math.min(text.length, 10)}`));
  }
  let outs: J[];
  try {
    outs = jqPipeline(value, filter);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.startsWith('syntax')) return fail(3, E(`jq: error: ${msg} at <top-level>, line 1:`), E(filter), E('jq: 1 compile error'));
    return fail(5, E(`jq: error (at ${src}:0): ${msg}`));
  }
  const lines: Line[] = [];
  for (const o of outs) {
    if (raw && typeof o === 'string') lines.push(...o.split('\n').map((t) => L(t)));
    else lines.push(...(compact ? JSON.stringify(o) : JSON.stringify(o, null, 2)).split('\n').map((t) => L(t)));
  }
  return ok(...lines);
}
