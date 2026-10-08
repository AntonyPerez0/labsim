/**
 * The workstation shell (`engineer@ws-17`, Ubuntu 22.04, bash) — Apps §5.4 "Workstation": the file-system
 * adapter over `~/IdeaProjects/<repo>` clones (`GitRepo.local.files`), `workstation.files` (~/Downloads,
 * ~/Pictures, pulled dumps, screencaps) and a few static dotfiles, plus the plain GNU commands.
 * Tool commands (adb, git, ssh, curl, …) live in their own files and are dispatched from `./index.ts`.
 */
import type { LabState, RepoId } from '../types';
import * as git from '../devops/git';
import { fmtDateCmd, HOME, tildify } from '../devops/util';
import type { CmdResult, Line, Sh } from './session';
import { E, L, fail, ok, repoAt, resolvePath, session, wsDirs, wsFiles } from './session';
import type { Fs, FsEntry } from './text';
import { TEXT, catText, sizeOf } from './text';

/** Empty directories created with `mkdir` (git does not track them; UI-session state). */
const emptyDirs = new Set<string>();

/** Forget UI-session file-system state (tests / a fresh terminal). */
export function resetWsSession(): void {
  emptyDirs.clear();
}

/** Writable roots on the workstation. */
const writable = (abs: string): boolean => abs === HOME || abs.startsWith(`${HOME}/`) || abs.startsWith('/tmp/');

/** Write a workstation file (repo clone → `git.writeFile`; elsewhere → `workstation.files`). */
export function wsWrite(sh: Sh, abs: string, text: string, append = false): string | null {
  if (!writable(abs)) return 'Permission denied';
  const lab = sh.lab;
  const at = repoAt(lab, abs);
  if (at && at.rel) {
    const before = lab.repos[at.repo].local?.files[at.rel] ?? '';
    const r = git.writeFile(lab, sh.ctx, at.repo, at.rel, append ? before + text : text);
    return r.ok ? null : (r.error ?? 'error');
  }
  if (at && !at.rel) return 'Is a directory';
  const key = tildify(abs);
  const prev = lab.workstation.files[key];
  lab.workstation.files[key] = append && prev !== undefined && !prev.startsWith('img:') ? prev + text : text;
  return null;
}

function wsRemove(sh: Sh, abs: string): string | null {
  const lab = sh.lab;
  if (!writable(abs) || abs === HOME) return 'Permission denied';
  for (const d of [...emptyDirs]) if (d === abs || d.startsWith(`${abs}/`)) emptyDirs.delete(d);
  const at = repoAt(lab, abs);
  if (at) {
    if (!at.rel) {
      // rm -rf of the whole clone: the project is gone from disk (clone again to get it back).
      lab.repos[at.repo].local = null;
      if (at.repo === 'uia-remote') git.mirrorConfig(lab);
      return null;
    }
    const r = git.deleteFile(lab, sh.ctx, at.repo, at.rel);
    return r.ok ? null : null;
  }
  const prefix = `${tildify(abs)}/`;
  for (const k of Object.keys(lab.workstation.files)) if (k === tildify(abs) || k.startsWith(prefix)) delete lab.workstation.files[k];
  return null;
}

/** The workstation file-system adapter for the GNU text commands. */
export function wsFs(sh: Sh): Fs {
  const lab = sh.lab;
  let files: Record<string, string> | null = null;
  let dirs: Set<string> | null = null;
  const load = (): { files: Record<string, string>; dirs: Set<string> } => {
    files ??= wsFiles(lab);
    if (!dirs) {
      dirs = wsDirs(lab, files);
      for (const d of emptyDirs) {
        const parts = d.split('/');
        for (let i = 2; i <= parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
      }
    }
    return { files, dirs };
  };
  const invalidate = (): void => {
    files = null;
    dirs = null;
  };
  return {
    cwd: cwdAbs(lab),
    show: (abs) => tildify(abs),
    resolve: (p) => resolvePath(cwdAbs(lab), p),
    read(abs) {
      const { files: f, dirs: d } = load();
      if (f[abs] !== undefined) return f[abs]!;
      if (d.has(abs)) return 'DIR';
      return null;
    },
    list(abs) {
      const { files: f, dirs: d } = load();
      if (!d.has(abs)) return null;
      const prefix = abs === '/' ? '/' : `${abs}/`;
      const out = new Map<string, FsEntry>();
      for (const [p, v] of Object.entries(f)) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const first = rest.split('/')[0]!;
        if (!first || first === '.keep') continue;
        const isDir = rest.includes('/');
        if (!out.has(first)) out.set(first, { name: first, dir: isDir, size: isDir ? 4096 : sizeOf(v) });
      }
      for (const x of d) {
        if (!x.startsWith(prefix) || x === abs) continue;
        const rest = x.slice(prefix.length);
        if (rest && !rest.includes('/')) out.set(rest, { name: rest, dir: true, size: 4096 });
      }
      return [...out.values()].sort((a, b) => a.name.replace(/^\./, '').localeCompare(b.name.replace(/^\./, ''), 'en-US'));
    },
    write(abs, text, append) {
      if (abs.endsWith('/.keep')) {
        const dir = abs.slice(0, -6);
        if (!writable(dir)) return 'Permission denied';
        emptyDirs.add(dir);
        invalidate();
        return null;
      }
      const e = wsWrite(sh, abs, text, append);
      invalidate();
      return e;
    },
    remove(abs) {
      const e = wsRemove(sh, abs);
      invalidate();
      return e;
    },
    setCwd(abs) {
      setCwd(lab, abs);
    },
  };
}

/** Current workstation cwd (absolute). */
export function cwdAbs(lab: LabState): string {
  return resolvePath(HOME, session.wsCwd ?? lab.workstation.cwd ?? '~');
}

export function setCwd(lab: LabState, abs: string): void {
  const prev = cwdAbs(lab);
  if (prev !== abs) session.oldpwd = prev;
  if (session.wsCwd !== null) session.wsCwd = tildify(abs);
  else lab.workstation.cwd = tildify(abs);
}

/** Repo of the cwd (and the cwd relative to the repo root). */
export function cwdRepo(lab: LabState): { repo: RepoId; rel: string } | null {
  return repoAt(lab, cwdAbs(lab));
}

/* ────────────────────────────── commands ────────────────────────────── */

/** Every command the workstation shell knows (for `help`, `which` and tab completion). */
export const WS_COMMANDS = [
  'adb', 'cat', 'cd', 'clear', 'cp', 'curl', 'date', 'echo', 'env', 'exit', 'export', 'git', 'grep', 'head', 'help', 'history', 'hostname', 'ifconfig', 'ip', 'java', 'jq', 'less', 'ls', 'mkdir', 'more', 'mv', 'mvn', 'nano', 'nc', 'nslookup', 'ollama', 'ping', 'pwd', 'rm', 'sort', 'ssh', 'sudo', 'tail', 'tesseract', 'touch', 'uname', 'uniq', 'uptime', 'wc', 'which', 'whoami',
] as const;

const WHICH: Record<string, string> = {
  adb: `${HOME}/Android/Sdk/platform-tools/adb`,
  mvn: '/usr/bin/mvn',
  java: '/usr/bin/java',
  ollama: '/usr/local/bin/ollama',
  tesseract: '/usr/bin/tesseract',
  jq: '/usr/bin/jq',
  git: '/usr/bin/git',
  ssh: '/usr/bin/ssh',
  curl: '/usr/bin/curl',
  nano: '/usr/bin/nano',
  nc: '/usr/bin/nc',
};

const HELP: string[] = [
  'GNU bash, version 5.1.16(1)-release (x86_64-pc-linux-gnu)',
  'Commands available on ws-17 (type a command for its usage):',
  '',
  ' files       ls [-la] · cd [dir|~|..|-] · pwd · cat · less · head/tail [-n N] · grep [-oicnvEr] · wc -l · sort · uniq',
  '             echo · touch · mkdir · rm [-rf] · cp · mv · nano <file>',
  ' network     ping [-c N] host · curl [-i -s -v -X M -H h -d body] URL · nc -zv host port · nslookup host · ip addr',
  ' remote      ssh pi@10.42.10.n · ssh automation@10.42.20.n · ssh automation@orca.lab.local',
  ' android     adb connect <ip>:5444 · adb devices [-l] · adb -s <target> shell uiautomator dump · adb -s <target> pull <file>',
  '             adb -s <target> shell input tap X Y · adb -s <target> exec-out screencap -p > shot.png · adb kill-server',
  ' code        git clone|status|log|diff|checkout|branch|add|commit|push|pull · mvn test [-Dtest=Class] · ./gradlew connectedAndroidTest',
  ' tools       tesseract <image> stdout [--psm 7] · OLLAMA_HOST=10.42.1.12:11434 ollama list|run llava "<prompt>" <image> · jq <filter>',
  ' shell       history · clear · whoami · hostname [-I] · date · uname -a · which <cmd> · env · exit',
  '',
  'Pipes (|), &&, ||, ; and > / >> redirection work as in bash.',
];

/** Plain workstation commands; returns null when the command is not one of these. */
export function wsBasic(sh: Sh, argv: string[], stdin: string[] | null): CmdResult | null {
  const lab = sh.lab;
  const cmd = argv[0]!;
  const fs = wsFs(sh);
  switch (cmd) {
    case 'cd': {
      const target = argv[1];
      if (argv.length > 2) return fail(1, E('bash: cd: too many arguments'));
      if (target === '-') {
        const back = session.oldpwd;
        const r = TEXT['cd']!(fs, ['cd', back], stdin, 'cd');
        return r.code === 0 ? ok(L(tildify(back))) : r;
      }
      return TEXT['cd']!(fs, ['cd', target ?? '~'], stdin, 'cd');
    }
    case 'less':
    case 'more':
      return TEXT['cat']!(fs, argv, stdin, cmd);
    case 'mv':
      return mv(sh, fs, argv);
    case 'help':
      return ok(...HELP.map((h) => L(h)));
    case 'whoami':
      return ok(L('engineer'));
    case 'hostname':
      return argv[1] === '-I' ? ok(L(`${lab.hosts['ws-17']?.ip ?? '10.42.50.17'} `)) : ok(L('ws-17'));
    case 'date':
      return ok(L(fmtDateCmd(lab, lab.time.nowMs)));
    case 'uname':
      if (argv.includes('-a')) return ok(L('Linux ws-17 6.5.0-45-generic #45~22.04.1-Ubuntu SMP PREEMPT_DYNAMIC Mon Jul 15 16:40:02 UTC 2 x86_64 x86_64 x86_64 GNU/Linux'));
      if (argv.includes('-r')) return ok(L('6.5.0-45-generic'));
      return ok(L('Linux'));
    case 'uptime': {
      const up = lab.hosts['ws-17']?.uptimeMs ?? 3 * 3_600_000;
      const t = fmtDateCmd(lab, lab.time.nowMs).split(' ').filter(Boolean)[3] ?? '09:41:07';
      const m = Math.floor(up / 60_000);
      return ok(L(` ${t} up ${m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : `${m} min`},  1 user,  load average: 0.41, 0.37, 0.30`));
    }
    case 'history': {
      if (argv[1] === '-c') {
        lab.workstation.shellHistory = [];
        return ok();
      }
      const h = lab.workstation.shellHistory;
      const n = argv[1] && /^\d+$/.test(argv[1]) ? Number(argv[1]) : h.length;
      const start = Math.max(0, h.length - n);
      return ok(...h.slice(start).map((x, i) => L(`${String(start + i + 1).padStart(5)}  ${x}`)));
    }
    case 'which': {
      const out: Line[] = [];
      let code = 0;
      for (const a of argv.slice(1).filter((x) => !x.startsWith('-'))) {
        if (WHICH[a]) out.push(L(WHICH[a]!));
        else if ((WS_COMMANDS as readonly string[]).includes(a) && !['cd', 'help', 'history', 'exit', 'export'].includes(a)) out.push(L(`/usr/bin/${a}`));
        else code = 1;
      }
      return { lines: out, code };
    }
    case 'env':
    case 'printenv': {
      const names = Object.keys(sh.env).filter((k) => /^[A-Z_][A-Z0-9_]*$/.test(k)).sort();
      if (cmd === 'printenv' && argv[1]) return sh.env[argv[1]] !== undefined ? ok(L(sh.env[argv[1]]!)) : fail(1);
      return ok(...names.map((k) => L(`${k}=${sh.env[k]}`)));
    }
    case 'export': {
      for (const a of argv.slice(1)) {
        const m = /^([A-Za-z_]\w*)=(.*)$/.exec(a);
        if (m) session.vars[m[1]!] = m[2]!;
        else if (!/^[A-Za-z_]\w*$/.test(a)) return fail(1, E(`bash: export: \`${a}': not a valid identifier`));
      }
      return ok();
    }
    case 'unset':
      for (const a of argv.slice(1)) delete session.vars[a];
      return ok();
    case 'java':
      if (argv[1] === '-version' || argv[1] === '--version') return ok(E('openjdk version "17.0.12" 2024-07-16'), E('OpenJDK Runtime Environment (build 17.0.12+7-Ubuntu-1ubuntu222.04)'), E('OpenJDK 64-Bit Server VM (build 17.0.12+7-Ubuntu-1ubuntu222.04, mixed mode, sharing)'));
      return fail(1, E('Error: Could not find or load main class ' + (argv[1] ?? '')), E(`Caused by: java.lang.ClassNotFoundException: ${argv[1] ?? ''}`));
    case 'true':
      return ok();
    case 'false':
      return fail(1);
    case 'sleep':
      return ok();
    case 'file': {
      const out: Line[] = [];
      for (const a of argv.slice(1)) {
        const t = fs.read(fs.resolve(a));
        if (t === null) out.push(L(`${a}: cannot open \`${a}' (No such file or directory)`));
        else if (t === 'DIR') out.push(L(`${a}: directory`));
        else if (t.startsWith('img:')) out.push(L(`${a}: ${a.endsWith('.jpg') ? 'JPEG image data, JFIF standard 1.01, resolution (DPI), density 72x72, segment length 16, baseline, precision 8, 1280x720, components 3' : 'PNG image data, 1280 x 800, 8-bit/color RGBA, non-interlaced'}`));
        else if (t.trimStart().startsWith('<?xml')) out.push(L(`${a}: XML 1.0 document, ASCII text, with very long lines (${Math.max(80, t.length)}), with no line terminators`));
        else out.push(L(`${a}: ASCII text`));
      }
      return ok(...out);
    }
    default:
      if (cmd in TEXT) return TEXT[cmd]!(fs, argv, stdin, cmd);
      return null;
  }
}

function mv(sh: Sh, fs: Fs, argv: string[]): CmdResult {
  const args = argv.slice(1).filter((a) => !a.startsWith('-'));
  if (args.length < 2) return fail(1, E(args.length ? `mv: missing destination file operand after '${args[0]}'` : 'mv: missing file operand'), E("Try 'mv --help' for more information."));
  const lab = sh.lab;
  let dst = fs.resolve(args[args.length - 1]!);
  for (const a of args.slice(0, -1)) {
    const src = fs.resolve(a);
    const t = fs.read(src);
    if (t === null) return fail(1, E(`mv: cannot stat '${a}': No such file or directory`));
    const target = fs.read(dst) === 'DIR' ? `${dst}/${src.slice(src.lastIndexOf('/') + 1)}` : dst;
    const ra = repoAt(lab, src);
    const rb = repoAt(lab, target);
    if (ra && rb && ra.repo === rb.repo && ra.rel && rb.rel) {
      const r = git.moveFile(lab, sh.ctx, ra.repo, ra.rel, rb.rel);
      if (!r.ok) return fail(1, E(`mv: cannot move '${a}': ${r.error}`));
      continue;
    }
    const copy = (from: string, to: string): void => {
      const x = fs.read(from);
      if (x === 'DIR') for (const e of fs.list(from) ?? []) copy(`${from}/${e.name}`, `${to}/${e.name}`);
      else if (x !== null) fs.write?.(to, x, false);
    };
    copy(src, target);
    const e = fs.remove?.(src, true);
    if (e) return fail(1, E(`mv: cannot remove '${a}': ${e}`));
    dst = fs.resolve(args[args.length - 1]!);
  }
  return ok();
}

/** What `cat` of an image does — exported for redirect-less binary output (`adb exec-out screencap -p`). */
export const binaryNoise = (ref: string): Line[] => catText(ref).map((t) => L(t));
