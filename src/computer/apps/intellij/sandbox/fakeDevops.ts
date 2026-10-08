/**
 * SANDBOX ONLY — a small fake of sim-devops (git, runner, terminal, host.writeFile) plus a seeded lab, so the IDE
 * and the terminal can be exercised before the real sim lands. Installed by `sandbox-computer-ide.html` only;
 * never imported by app code. Every state change goes through `mutate()`.
 */
import { getState, mutate } from '@/core/store';
import { createOrcaRobot, sim } from '@/sim';
import type { GitRepo, LabState, OrcaDevice, RepoId, TerminalLine, TerminalResult } from '@/sim';
import { BROKEN_CONFIG, GORT_FILES, ORCA_FILES, PIGEON_FILES, SEED_HISTORY, UIA_FILES } from './seedRepos';

const DAY = 86_400_000;
const FILES: Record<RepoId, Record<string, string>> = { 'uia-remote': UIA_FILES, pigeon: PIGEON_FILES, gort: GORT_FILES, orchestrator: ORCA_FILES };
let shaSeq = 0x5a17;

function fakeSha(seed: string): string {
  let h = 0x811c9dc5;
  for (const c of `${seed}:${shaSeq++}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return (h.toString(16).padStart(8, '0') + (h ^ 0xdeadbeef).toString(16).padStart(8, '0')).repeat(3).slice(0, 40);
}

function seedRepo(lab: LabState, id: RepoId, cloned: boolean) {
  const files = FILES[id];
  const hist = SEED_HISTORY[id];
  const repo = lab.repos[id];
  repo.description = id === 'uia-remote' ? 'UI Automator 2.3 remote runner (POM)' : id === 'pigeon' ? 'Pigeon / LSTR legacy JSON tests' : id === 'gort' ? 'Cards, screen locations and suites' : 'Orca — the Orchestrator (JHipster)';
  repo.commits = {};
  let parent: string | null = null;
  hist.forEach((h, i) => {
    const [hh, mm] = h.hhmm.split(':').map(Number);
    const sha = (h.sha + fakeSha(h.sha)).slice(0, 40);
    const changes: Record<string, string | null> = {};
    if (i === 0) Object.assign(changes, files);
    else {
      const keys = Object.keys(files).filter((p) => !p.endsWith('.gitignore'));
      const p = keys[(i * 7) % keys.length];
      changes[p] = files[p];
    }
    repo.commits[sha] = { sha, message: h.message, author: h.author, atMs: h.day * DAY + (hh * 60 + mm) * 60_000, changes, parent };
    parent = sha;
  });
  repo.files = { ...files };
  repo.branches = { main: parent! };
  if (id === 'uia-remote') repo.branches['fix/flex4-receipt-qr'] = parent!;
  repo.local = cloned
    ? { path: `~/IdeaProjects/${id}`, branch: 'main', headSha: parent!, files: { ...files }, dirty: [], staged: [], ahead: 0, behind: 0 }
    : null;
  if (cloned && id === 'uia-remote') repo.local!.files['config.properties'] = BROKEN_CONFIG;
}

function seedOrca(lab: LabState) {
  const dev = (id: number, name: string, deviceType: OrcaDevice['deviceType'], serial: string, ip: string): OrcaDevice => ({ id, name, deviceType, serial, ip, label: name, simDeviceId: null, retired: false });
  lab.orca.devices[1] = dev(1, 'megatron-mfd', 'STATION_2', 'SIM-S2-000021', '10.42.30.21');
  lab.orca.devices[2] = dev(2, 'megatron-cfd', 'MINI_2', 'SIM-M2-000022', '10.42.30.22');
  lab.orca.devices[3] = dev(3, 'r2-d2-duo', 'STATION_DUO_2', 'SIM-D2-000014', '10.42.30.14');
  lab.orca.devices[4] = dev(4, 'wall-e-flex3', 'FLEX_3', 'SIM-F3-000011', '10.42.30.11');
  lab.orca.robots[7] = createOrcaRobot(7, 'megatron', 'tethered', { deviceId: 1, mfdDeviceId: 1, cfdDeviceId: 2, environment: 'DEV1' });
  lab.orca.robots[8] = createOrcaRobot(8, 'r2-d2', 'tethered', { deviceId: 3, mfdDeviceId: 3, cfdDeviceId: 3, environment: 'DEV2' });
  lab.orca.robots[1] = createOrcaRobot(1, 'wall-e', 'touch', { deviceId: 4, environment: 'DEV1' });
}

export function seedFakeLab(opts: { cloned?: RepoId[] } = {}) {
  const cloned = opts.cloned ?? ['pigeon', 'gort'];
  mutate((d) => {
    const lab = d.lab;
    for (const id of Object.keys(FILES) as RepoId[]) seedRepo(lab, id, cloned.includes(id));
    seedOrca(lab);
    lab.time.nowMs = 9 * 3_600_000 + 41 * 60_000;
    lab.workstation.cwd = '~';
    lab.workstation.shellHistory = ['ping -c 3 10.42.10.11', 'adb connect 10.42.30.32:5444', 'adb devices', 'cd ~/IdeaProjects/uia-remote'];
    lab.workstation.files['~/CodeWithMe/alex/uia-remote/config.properties'] = BROKEN_CONFIG.replace('robotName=megatron', 'robotName=r2-d2');
    lab.workstation.files['~/CodeWithMe/alex/uia-remote/app/src/androidTest/java/com/labsim/uia/testactions/TaxTestDuo.java'] = UIA_FILES['app/src/androidTest/java/com/labsim/uia/testactions/TaxTestDuo.java'];
  });
}

/* ───────────────────────────── git ───────────────────────────── */

const ok = <T>(value: T) => ({ ok: true as const, value });
const err = (error: string) => ({ ok: false as const, error });

function headTree(repo: GitRepo, sha: string | null): Record<string, string> {
  const chain: string[] = [];
  for (let s = sha; s && repo.commits[s]; s = repo.commits[s].parent) chain.unshift(s);
  const out: Record<string, string> = {};
  for (const s of chain) for (const [p, c] of Object.entries(repo.commits[s].changes)) c === null ? delete out[p] : (out[p] = c);
  return out;
}

function recomputeDirty(repo: GitRepo) {
  const l = repo.local!;
  const head = headTree(repo, l.headSha);
  const ignored = (p: string) => p === 'config.properties' || p.startsWith('target/');
  const all = new Set([...Object.keys(head), ...Object.keys(l.files)]);
  l.dirty = [...all].filter((p) => !ignored(p) && head[p] !== l.files[p]).sort();
  l.staged = l.staged.filter((p) => l.dirty.includes(p));
}

function gitMut<T>(id: RepoId, fn: (repo: GitRepo, lab: LabState) => { ok: true; value: T } | { ok: false; error: string }) {
  let res: { ok: true; value: T } | { ok: false; error: string } = err('not cloned');
  mutate((d) => {
    const repo = d.lab.repos[id];
    res = fn(repo, d.lab);
  });
  return res;
}

const fakeGit: Partial<typeof sim.git> = {
  clone: (id) =>
    gitMut(id, (repo) => {
      if (repo.local) return err(`fatal: destination path '${id}' already exists and is not an empty directory.`);
      const head = repo.branches[repo.defaultBranch];
      repo.local = { path: `~/IdeaProjects/${id}`, branch: repo.defaultBranch, headSha: head, files: headTree(repo, head), dirty: [], staged: [], ahead: 0, behind: 0 };
      return ok(undefined);
    }),
  writeFile: (id, path, contents) =>
    gitMut(id, (repo) => {
      if (!repo.local) return err('not cloned');
      repo.local.files[path] = contents;
      recomputeDirty(repo);
      return ok(undefined);
    }),
  deleteFile: (id, path) =>
    gitMut(id, (repo) => {
      if (!repo.local?.files[path] && repo.local?.files[path] !== '') return err(`pathspec '${path}' did not match any files`);
      delete repo.local.files[path];
      recomputeDirty(repo);
      return ok(undefined);
    }),
  moveFile: (id, from, to) =>
    gitMut(id, (repo) => {
      const l = repo.local;
      if (!l || l.files[from] === undefined) return err(`fatal: bad source, source=${from}, destination=${to}`);
      if (l.files[to] !== undefined) return err(`fatal: destination exists, source=${from}, destination=${to}`);
      l.files[to] = l.files[from];
      delete l.files[from];
      recomputeDirty(repo);
      return ok(undefined);
    }),
  discard: (id, path) =>
    gitMut(id, (repo) => {
      const l = repo.local!;
      const head = headTree(repo, l.headSha);
      if (head[path] === undefined) delete l.files[path];
      else l.files[path] = head[path];
      recomputeDirty(repo);
      return ok(undefined);
    }),
  stage: (id, paths) =>
    gitMut(id, (repo) => {
      const l = repo.local!;
      l.staged = [...new Set([...l.staged, ...paths.filter((p) => l.dirty.includes(p))])];
      return ok(undefined);
    }),
  commit: (id, message, actor) =>
    gitMut(id, (repo, lab) => {
      const l = repo.local!;
      if (!l.staged.length) return err('nothing added to commit but untracked files present (use "git add" to track)');
      const sha = fakeSha(message);
      const changes: Record<string, string | null> = {};
      for (const p of l.staged) changes[p] = l.files[p] ?? null;
      repo.commits[sha] = { sha, message, author: actor === 'player' ? 'player' : actor, atMs: lab.time.nowMs, changes, parent: l.headSha };
      l.headSha = sha;
      l.staged = [];
      l.ahead += 1;
      recomputeDirty(repo);
      return ok({ sha });
    }),
  push: (id) =>
    gitMut(id, (repo) => {
      const l = repo.local!;
      if (l.branch === 'main' && (id === 'gort' || id === 'uia-remote')) return err(`! [remote rejected] main -> main (protected branch hook declined)\nerror: failed to push some refs to 'github.com:labsim-lab/${id}.git'`);
      repo.branches[l.branch] = l.headSha;
      if (l.branch === repo.defaultBranch) repo.files = headTree(repo, l.headSha);
      l.ahead = 0;
      return ok(undefined);
    }),
  pull: (id) =>
    gitMut(id, (repo) => {
      repo.local!.behind = 0;
      return ok(undefined);
    }),
  checkout: (id, branch, create) =>
    gitMut(id, (repo) => {
      const l = repo.local!;
      if (create) {
        if (!/^[A-Za-z0-9._/-]+$/.test(branch)) return err(`fatal: '${branch}' is not a valid branch name.`);
      } else if (!repo.branches[branch] && branch !== l.branch) {
        return err(`error: pathspec '${branch}' did not match any file(s) known to git`);
      } else if (repo.branches[branch]) {
        l.headSha = repo.branches[branch];
        const tree = headTree(repo, l.headSha);
        const cfg = l.files['config.properties'];
        l.files = { ...tree };
        if (cfg !== undefined) l.files['config.properties'] = cfg;
      }
      l.branch = branch;
      recomputeDirty(repo);
      return ok(undefined);
    }),
};

/* ───────────────────────────── runner ───────────────────────────── */

const runs = new Map<string, { lines: string[]; done: boolean; passed: boolean | null; timer: ReturnType<typeof setInterval> | null }>();
let runSeq = 0;

function scriptFor(repo: 'uia-remote' | 'pigeon', testPath: string, lab: LabState): { lines: string[]; passed: boolean } {
  const name = testPath.split('/').pop()!.replace(/\.(java|json)$/, '');
  const files = lab.repos[repo].local?.files ?? {};
  if (repo === 'pigeon') {
    try {
      JSON.parse(files[testPath] ?? '');
    } catch (e) {
      return { lines: ['[LSTR] Loading test …', `LSTR ParseError: ${(e as Error).message.split(' in JSON')[0]}`, 'FAILED'], passed: false };
    }
    return { lines: ['[LSTR] Loading test …', '[ANDROID] adb connect 10.42.30.21:5444 … connected', 'step 1/9 create order … OK', 'step 9/9 assert home … OK', 'PASSED'], passed: true };
  }
  const cfg = Object.fromEntries((files['config.properties'] ?? '').split('\n').filter((l) => l.includes('=')).map((l) => [l.split('=')[0].trim(), l.slice(l.indexOf('=') + 1).trim()]));
  if (!files['config.properties']) return { lines: ['java.lang.IllegalStateException: config.properties not found — copy config.properties.example', '\tat com.labsim.uia.BaseTest.loadConfig(BaseTest.java:14)'], passed: false };
  if (cfg.theme !== 'avocado') return { lines: [`java.lang.IllegalStateException: Unsupported theme "${cfg.theme}" — only "avocado" is supported`, '\tat com.labsim.uia.BaseTest.loadConfig(BaseTest.java:14)'], passed: false };
  const home = files['app/src/androidTest/java/com/labsim/uia/pageobjects/HomeScreen.java'] ?? '';
  if (name === 'HomeScreenTest' && /FLEX\) \{\s*scrollHorizontally/.test(home)) {
    return {
      lines: [`[uia-remote] robot ${cfg.robotName} · deviceType=${cfg.deviceType}`, `connect ${cfg.merchantFacingDeviceIp}:${cfg.portNumber} … connected`, '[MFD] open Register', 'androidx.test.uiautomator.UiObjectNotFoundException: "Register" not found', '\tat com.labsim.uia.pageobjects.HomeScreen.open(HomeScreen.java:29)', '\tat com.labsim.uia.testactions.HomeScreenTest.testHomeScreen(HomeScreenTest.java:27)'],
      passed: false,
    };
  }
  return {
    lines: [
      `[uia-remote] robot ${cfg.robotName} · runType=${cfg.runType}`,
      `connect ${cfg.merchantFacingDeviceIp}:${cfg.portNumber} … ${cfg.portNumber === '5444' ? 'connected' : 'refused'}`,
      ...(cfg.portNumber === '5444' ? [] : ['falling back to first known device: 10.42.60.4:5555']),
      '[MFD_O1] open Register',
      '[MFD_O1] orca → callus: load swipe card VISA_STD_SWIPE … OK',
      '[CFD_O1] Subtotal $10.00 ✓  Tax $0.83 ✓  Total $10.83 ✓',
      '[MFD_O2] Pay → Charge',
      '[Step 4] CFD finalise payment',
      `${name} PASSED (4/4 steps)`,
    ],
    passed: true,
  };
}

const fakeRunner: Partial<typeof sim.runner> = {
  runLocal: (repo, testPath) => {
    const lab = getState().lab;
    if (!lab.repos[repo].local) return err('not cloned');
    const id = `run-${++runSeq}`;
    const script = scriptFor(repo, testPath, lab);
    const state = { lines: [] as string[], done: false, passed: null as boolean | null, timer: null as ReturnType<typeof setInterval> | null };
    runs.set(id, state);
    const startedMs = lab.time.nowMs;
    mutate((d) => {
      d.lab.local.runs[id] = { id, repo, testName: testPath.split('/').pop()!.replace(/\.(java|json)$/, ''), testPath, robotName: null, startedMs, finishedMs: null, state: 'running', passed: null, failureCode: null, output: [], runner: d.lab.local.runs[id]?.runner as never, overlappedJenkins: false, configPath: `~/IdeaProjects/${repo}/config.properties` };
    });
    let i = 0;
    state.timer = setInterval(() => {
      if (i < script.lines.length) state.lines.push(script.lines[i++]);
      else {
        state.done = true;
        state.passed = script.passed;
        clearInterval(state.timer!);
      }
      mutate((d) => {
        const r = d.lab.local.runs[id];
        d.lab.time.nowMs += 1700;
        if (!r) return;
        r.output = [...state.lines];
        if (state.done) {
          r.state = 'finished';
          r.passed = state.passed;
          r.finishedMs = d.lab.time.nowMs;
        }
      });
    }, 350);
    return ok({ runId: id });
  },
  stopLocal: (runId) => {
    const r = runs.get(runId);
    if (!r || r.done) return err('not running');
    clearInterval(r.timer!);
    r.done = true;
    r.passed = null;
    mutate((d) => {
      const run = d.lab.local.runs[runId];
      if (run) {
        run.state = 'finished';
        run.passed = null;
        run.finishedMs = d.lab.time.nowMs;
      }
    });
    return ok(undefined);
  },
  output: (runId) => {
    const r = runs.get(runId);
    return r ? { lines: [...r.lines], done: r.done, passed: r.passed } : { lines: [], done: true, passed: null };
  },
};

/* ───────────────────────────── terminal ───────────────────────────── */

const jobs = new Map<string, { queue: TerminalLine[]; done: boolean; seq: number; host: string }>();
let jobSeq = 0;
const prompt = () => {
  const cwd = getState().lab.workstation.cwd || '~';
  return `engineer@ws-17:${cwd}$ `;
};
const out = (text: string, kind: TerminalLine['kind'] = 'out'): TerminalLine => ({ text, kind });

function lsDir(dir: string): string[] {
  const lab = getState().lab;
  if (dir === '~') return ['Desktop', 'Downloads', 'IdeaProjects', 'Pictures'];
  if (dir === '~/IdeaProjects') return (Object.keys(lab.repos) as RepoId[]).filter((r) => lab.repos[r].local);
  const m = /^~\/IdeaProjects\/([^/]+)(?:\/(.*))?$/.exec(dir);
  if (m) {
    const files = lab.repos[m[1] as RepoId]?.local?.files ?? {};
    const pre = m[2] ? `${m[2]}/` : '';
    return [...new Set(Object.keys(files).filter((p) => p.startsWith(pre)).map((p) => p.slice(pre.length).split('/')[0]))].sort();
  }
  return [];
}

function resolve(cwd: string, arg: string): string {
  if (!arg || arg === '~') return '~';
  if (arg.startsWith('~')) return arg.replace(/\/$/, '');
  const parts = cwd === '~' ? ['~'] : cwd.split('/');
  for (const seg of arg.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 1) parts.pop();
    } else parts.push(seg);
  }
  return parts.join('/');
}

const fakeTerminal: Partial<typeof sim.terminal> = {
  prompt,
  exec: (line): TerminalResult => {
    const t = line.trim();
    const [cmd, ...args] = t.split(/\s+/);
    const cwd = getState().lab.workstation.cwd || '~';
    const res = (lines: TerminalLine[], exitCode = 0, extra: Partial<TerminalResult> = {}): TerminalResult => ({ lines, exitCode, prompt: prompt(), ...extra });
    if (!t) return res([]);
    switch (cmd) {
      case 'clear':
        return res([], 0, { clear: true });
      case 'pwd':
        return res([out(cwd.replace(/^~/, '/home/engineer'))]);
      case 'whoami':
        return res([out('engineer')]);
      case 'hostname':
        return res([out(args[0] === '-I' ? '10.42.50.17 ' : 'ws-17')]);
      case 'date':
        return res([out('Mon Oct  5 09:41:07 EDT 2026')]);
      case 'echo':
        return res([out(args.join(' ').replace(/^["']|["']$/g, ''))]);
      case 'help':
        return res(['GNU bash, version 5.1.16(1)-release (x86_64-pc-linux-gnu)', 'These shell commands are defined internally.  Type `help\' to see this list.', '', ' cd [dir]   pwd   ls   cat   echo   clear   ping   ssh   adb   git   curl   nano   grep'].map((x) => out(x)));
      case 'cd': {
        const next = resolve(cwd, args[0] ?? '~');
        if (next !== '~' && !lsDir(next).length && !lsDir(next.split('/').slice(0, -1).join('/') || '~').includes(next.split('/').pop()!)) return res([out(`bash: cd: ${args[0]}: No such file or directory`, 'err')], 1);
        mutate((d) => {
          d.lab.workstation.cwd = next;
        });
        return res([]);
      }
      case 'ls': {
        const dir = resolve(cwd, args.filter((a) => !a.startsWith('-'))[0] ?? '.');
        const items = lsDir(dir);
        return res(items.length ? [out(items.join('  '))] : []);
      }
      case 'cat': {
        const p = resolve(cwd, args[0] ?? '');
        const m = /^~\/IdeaProjects\/([^/]+)\/(.+)$/.exec(p);
        const text = m ? getState().lab.repos[m[1] as RepoId]?.local?.files[m[2]] : getState().lab.workstation.files[p];
        if (text === undefined) return res([out(`cat: ${args[0]}: No such file or directory`, 'err')], 1);
        return res(text.replace(/\n$/, '').split('\n').map((x) => out(x)));
      }
      case 'ping': {
        const host = args.filter((a) => !a.startsWith('-') && !/^\d+$/.test(a)).pop() ?? '';
        const count = args.includes('-c') ? Number(args[args.indexOf('-c') + 1]) : Infinity;
        const id = `job-${++jobSeq}`;
        jobs.set(id, { queue: [], done: false, seq: 0, host });
        const job = jobs.get(id)!;
        const timer = setInterval(() => {
          if (job.done) return clearInterval(timer);
          job.seq++;
          job.queue.push(out(`64 bytes from ${host}: icmp_seq=${job.seq} ttl=64 time=${(1.6 + (job.seq % 3) * 0.11).toFixed(2)} ms`));
          if (job.seq >= count) {
            job.queue.push(out(''), out(`--- ${host} ping statistics ---`), out(`${count} packets transmitted, ${count} received, 0% packet loss, time ${count * 1000 + 3}ms`));
            job.done = true;
            clearInterval(timer);
          }
        }, 600);
        return res([out(`PING ${host} (${host}) 56(84) bytes of data.`)], 0, { streamingJobId: id });
      }
      case 'git': {
        const m = /^~\/IdeaProjects\/([^/]+)/.exec(cwd);
        const repo = m ? getState().lab.repos[m[1] as RepoId] : null;
        if (!repo?.local) return res([out('fatal: not a git repository (or any of the parent directories): .git', 'err')], 128);
        if (args[0] === 'status') {
          const l = repo.local;
          return res([`On branch ${l.branch}`, `Your branch is up to date with 'origin/${l.branch}'.`, ...(l.dirty.length ? ['', 'Changes not staged for commit:', ...l.dirty.map((p) => `\tmodified:   ${p}`)] : ['', 'nothing to commit, working tree clean'])].map((x) => out(x)));
        }
        return res([out(`git: '${args[0] ?? ''}' is not a git command. See 'git --help'.`, 'err')], 1);
      }
      default:
        return res([out(`${cmd}: command not found`, 'err')], 127);
    }
  },
  poll: (jobId) => {
    const job = jobs.get(jobId);
    if (!job) return { lines: [], done: true, exitCode: 0 };
    const lines = job.queue.splice(0);
    return { lines, done: job.done && !job.queue.length, exitCode: job.done ? 0 : null };
  },
  interrupt: (jobId) => {
    const job = jobs.get(jobId);
    if (!job || job.done) return;
    job.queue.push(out(''), out(`--- ${job.host} ping statistics ---`), out(`${job.seq} packets transmitted, ${job.seq} received, 0% packet loss, time ${job.seq * 1000}ms`));
    job.done = true;
  },
  complete: (partial) => {
    const tok = partial.split(/\s+/).pop() ?? '';
    const cwd = getState().lab.workstation.cwd || '~';
    if (!partial.includes(' ')) return ['cat', 'cd', 'clear', 'curl', 'git', 'grep', 'ls', 'nano', 'ping', 'pwd', 'ssh', 'adb'].filter((c) => c.startsWith(tok));
    const dirPart = tok.includes('/') ? tok.slice(0, tok.lastIndexOf('/') + 1) : '';
    const base = resolve(cwd, dirPart || '.');
    return lsDir(base).filter((n) => n.startsWith(tok.slice(dirPart.length))).map((n) => dirPart + n + (lsDir(`${base}/${n}`).length ? '/' : ''));
  },
};

/** Patch the stubbed sim namespaces with the fakes (sandbox only). */
export function installFakeSim() {
  Object.assign(sim.git, fakeGit);
  Object.assign(sim.runner, fakeRunner);
  Object.assign(sim.terminal, fakeTerminal);
  Object.assign(sim.host, {
    writeFile: (_host: string, path: string, contents: string) => {
      mutate((d) => {
        d.lab.workstation.files[path] = contents;
      });
      return ok(undefined);
    },
  });
}
