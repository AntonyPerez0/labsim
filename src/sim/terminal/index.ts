/**
 * The workstation terminal interpreter (`sim.terminal`, Apps §5, Sim §0.5 / §3.15): a bash-like shell
 * (`engineer@ws-17`) with cwd, history, pipes, `&&`/`||`/`;`, redirection, `VAR=value` prefixes, tab
 * completion, streaming jobs (ping, journalctl -f, logcat, curl timeouts, ollama, local test runs), and
 * ssh sessions into Pis (`pi@wall-e:~ $`), Windows boxes (cmd/PowerShell) and VMs.
 *
 * Sessions: each terminal tab passes a `sessionId` (Apps D7). The first session is the primary one: its
 * cwd and ssh host live in `lab.workstation.cwd` / `sshHostId` (saved with the lab); other tabs keep their
 * own cwd in memory. Streaming jobs and remote-shell details are UI-session state (not saved).
 */
import { getState, transact } from '@/core/store';
import type { TxContext } from '@/core/store';
import type { LabState } from '../types';
import type { SimApi, TerminalLine, TerminalResult } from '../api';
import { core } from '../devops/coreRef';
import { HOME, tildify } from '../devops/util';
import { adb } from './adb';
import { gitCmd } from './gitcli';
import { curl, ipAddr, macFor, nc, nslookup, ping } from './net';
import { ParseError, parse } from './parse';
import type { SimpleCommand } from './parse';
import { linuxFs } from './remote';
import type { CmdResult, Line, RemoteSession, Session, Sh, StreamJob } from './session';
import { E, L, dropJob, fail, freshSession, getJob, ok, registerJob, resolvePath, session } from './session';
import { dropDeadSession, remoteExec, remotePrompt, resetSshSession, sessionAlive, ssh } from './ssh';
import { catText } from './text';
import { gradlew, jq, mvn, ollamaCli, tesseract } from './tools';
import { WS_COMMANDS, binaryNoise, cwdAbs, resetWsSession, wsBasic, wsFs, wsWrite } from './ws';

export type TerminalApi = SimApi['terminal'];

/* ────────────────────────────── sessions ────────────────────────────── */

const sessions = new Map<string, Session>();
let primaryKey: string | null = null;
/** Key of the session that last wrote `workstation.sshHostId`. */
let mirrorKey: string | null = null;

interface JobMeta {
  key: string;
  line: string;
  host: string;
  cwd: string;
  final: Line[] | null;
}
const jobMeta = new Map<string, JobMeta>();

function enter(id: string | undefined): string {
  const key = id ?? primaryKey ?? 'primary';
  primaryKey ??= key;
  const s = sessions.get(key) ?? freshSession(key === primaryKey);
  Object.assign(session, s);
  return key;
}

function leave(key: string): void {
  sessions.set(key, { remote: session.remote, oldpwd: session.oldpwd, lastExit: session.lastExit, wsCwd: session.wsCwd, vars: session.vars });
}

/** Primary session follows the saved lab state (reset / restore / load / setup ops). */
function reconcile(lab: LabState, key: string): void {
  if (key !== primaryKey || (mirrorKey !== null && mirrorKey !== key)) return;
  const want = lab.workstation.sshHostId;
  if (!want) {
    session.remote = null;
    return;
  }
  if (session.remote?.hostId === want) return;
  const h = lab.hosts[want];
  if (!h) {
    session.remote = null;
    return;
  }
  const win = h.kind === 'minix' || h.kind === 'nuc';
  const user = h.kind === 'pi' ? 'pi' : h.kind === 'blade' ? 'root' : 'automation';
  session.remote = { hostId: h.id, user, cwd: win ? 'C:\\Users\\automation' : user === 'root' ? '/root' : `/home/${user}`, shell: win ? 'cmd' : 'bash', target: h.ip };
}

function mirror(lab: LabState, key: string): void {
  if (lab.workstation.sshHostId !== (session.remote?.hostId ?? null)) lab.workstation.sshHostId = session.remote?.hostId ?? null;
  mirrorKey = key;
}

/* ────────────────────────────── environment & prompt ────────────────────────────── */

function envFor(lab: LabState): Record<string, string> {
  const rs = session.remote;
  const base: Record<string, string> = rs
    ? { HOME: rs.user === 'root' ? '/root' : `/home/${rs.user}`, USER: rs.user, SHELL: '/bin/bash', PATH: '/usr/local/bin:/usr/bin:/bin', PWD: rs.cwd, HOSTNAME: lab.hosts[rs.hostId]?.hostname ?? rs.hostId }
    : {
        HOME,
        USER: 'engineer',
        LOGNAME: 'engineer',
        SHELL: '/bin/bash',
        LANG: 'en_US.UTF-8',
        PATH: `${HOME}/bin:${HOME}/Android/Sdk/platform-tools:/usr/local/bin:/usr/bin:/bin`,
        ANDROID_HOME: `${HOME}/Android/Sdk`,
        JAVA_HOME: '/usr/lib/jvm/java-17-openjdk-amd64',
        PWD: cwdAbs(lab),
        HOSTNAME: 'ws-17',
      };
  return { ...base, ...session.vars, '?': String(session.lastExit) };
}

function promptOf(lab: LabState): string {
  const rs = session.remote;
  if (rs) return remotePrompt(lab, rs);
  return `engineer@ws-17:${tildify(cwdAbs(lab))}$ `;
}

/* ────────────────────────────── command dispatch ────────────────────────────── */

const levenshtein = (a: string, b: string): number => {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Optimal string alignment: a transposition ("gti" → "git") costs 1.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) dp[i]![j] = Math.min(dp[i]![j]!, dp[i - 2]![j - 2]! + 1);
    }
  }
  return dp[a.length]![b.length]!;
};

const DEB: Record<string, string> = { git: 'git (1:2.34.1-1ubuntu1.11)', adb: 'adb (1:10.0.0+r36-9)', ssh: 'openssh-client (1:8.9p1-3ubuntu0.10)', curl: 'curl (7.81.0-1ubuntu1.18)', ping: 'iputils-ping (3:20211215-1)', grep: 'grep (3.7-1build1)', ls: 'coreutils (8.32-4.1ubuntu1.2)', cat: 'coreutils (8.32-4.1ubuntu1.2)', mvn: 'maven (3.6.3-5)', jq: 'jq (1.6-2.1ubuntu3)', nano: 'nano (6.2-1ubuntu0.1)' };

function notFound(cmd: string): CmdResult {
  if (cmd.includes('/')) return fail(127, E(`bash: ${cmd}: No such file or directory`));
  const near = (WS_COMMANDS as readonly string[]).filter((c) => c.length > 1 && levenshtein(cmd, c) === 1);
  if (near.length && cmd.length > 1) {
    const lines: Line[] = [E(`Command '${cmd}' not found, did you mean:`)];
    for (const n of near) lines.push(E(`  command '${n}' from deb ${DEB[n] ?? `${n}`}`));
    lines.push(E('Try: sudo apt install <deb name>'));
    return { lines, code: 127 };
  }
  return fail(127, E(`${cmd}: command not found`));
}

/** One remote line in a given session (ssh one-shot `ssh host cmd`). */
function runRemoteLine(sh: Sh, rs: RemoteSession, line: string): CmdResult {
  const save = session.remote;
  session.remote = rs;
  try {
    const r = runLine(sh, line, false);
    return r;
  } finally {
    session.remote = save;
  }
}

function wsReader(sh: Sh): (p: string) => string | 'DIR' | null {
  const fs = wsFs(sh);
  return (p) => fs.read(fs.resolve(p));
}
function wsWriterFromCwd(sh: Sh): (p: string, contents: string) => string | null {
  return (p, contents) => wsWrite(sh, resolvePath(cwdAbs(sh.lab), p), contents, false);
}

/** Workstation (local) command. */
function localCommand(sh: Sh, argv: string[], stdin: string[] | null): CmdResult {
  const lab = sh.lab;
  const cmd = argv[0]!;
  switch (cmd) {
    case 'clear':
      return { lines: [], code: 0, clear: true };
    case 'exit':
    case 'logout':
      return ok(L('exit'));
    case 'sudo': {
      if (argv.length === 1) return fail(1, E('usage: sudo -h | -K | -k | -V'), E('usage: sudo -v [-AknS] [-g group] [-h host] [-p prompt] [-u user]'));
      if (argv[1] === '-i' || argv[1] === 'su' || argv[1] === '-s') return fail(1, E('sudo: a root shell on ws-17 is not needed for lab work — run the single command with sudo instead'));
      return localCommand(sh, argv.slice(1), stdin);
    }
    case 'adb':
      return adb(sh, argv, wsWriterFromCwd(sh));
    case 'git':
      return gitCmd(sh, argv);
    case 'ssh':
      return ssh(sh, argv, (rs, line) => runRemoteLine(sh, rs, line));
    case 'ping':
      return ping(sh, argv, 'ws-17');
    case 'curl':
      return curl(sh, argv, 'ws-17');
    case 'nc':
    case 'netcat':
      return nc(sh, argv, 'ws-17');
    case 'nslookup':
    case 'host':
      return nslookup(sh, argv);
    case 'ip':
      if (!argv[1] || ['a', 'addr', 'address'].includes(argv[1]!)) return ipAddr(lab.hosts['ws-17']?.ip ?? '10.42.50.17', 'enp3s0', '3c:7c:3f:1e:50:17');
      if (argv[1] === 'r' || argv[1] === 'route') return ok(L('default via 10.42.0.1 dev enp3s0 proto dhcp metric 100'), L(`10.42.0.0/16 dev enp3s0 proto kernel scope link src ${lab.hosts['ws-17']?.ip ?? '10.42.50.17'} metric 100`));
      return fail(255, E(`Object "${argv[1]}" is unknown, try "ip help".`));
    case 'ifconfig':
      return fail(127, E("Command 'ifconfig' not found, but can be installed with:"), E('sudo apt install net-tools'), L('hint: use ip addr', 'muted'));
    case 'mvn':
      return mvn(sh, argv);
    case './gradlew':
    case 'gradlew':
      return gradlew(sh, argv);
    case 'sh':
    case 'bash':
      if (argv[1] === 'gradlew' || argv[1] === './gradlew') return gradlew(sh, argv.slice(1));
      return fail(1, E(`bash: ${argv[1] ?? ''}: running scripts is not supported in this terminal`));
    case 'tesseract':
      return tesseract(sh, argv, wsReader(sh), wsWriterFromCwd(sh));
    case 'ollama':
      return ollamaCli(sh, argv, wsReader(sh));
    case 'jq':
      return jq(argv, stdin, wsReader(sh));
    case 'nano':
    case 'vi':
    case 'vim':
    case 'code':
    case 'idea':
      return ok(L(`(${cmd} opens in the editor view)`, 'muted'));
    default: {
      const r = wsBasic(sh, argv, stdin);
      if (r) return r;
      if (cmd.startsWith('./') || cmd.startsWith('/') || cmd.startsWith('~/')) {
        const t = wsFs(sh).read(resolvePath(cwdAbs(lab), cmd));
        if (t === 'DIR') return fail(126, E(`bash: ${cmd}: Is a directory`));
        if (t !== null) return fail(126, E(`bash: ${cmd}: Permission denied`));
      }
      return notFound(cmd);
    }
  }
}

function runSimple(sh: Sh, c: SimpleCommand, stdin: string[] | null): CmdResult {
  if (!c.argv.length) {
    for (const [k, v] of Object.entries(c.assigns)) session.vars[k] = v;
    return ok();
  }
  const sh2: Sh = Object.keys(c.assigns).length ? { ...sh, env: { ...sh.env, ...c.assigns } } : sh;
  const rs = session.remote;
  if (rs) return remoteExec(sh2, rs, c.argv, stdin);
  return localCommand(sh2, c.argv, stdin);
}

/** Write `>`/`>>` output for the current shell (workstation or remote Linux). */
function redirectWrite(sh: Sh, path: string, text: string, append: boolean): string | null {
  if (path === '/dev/null') return null;
  const rs = session.remote;
  if (!rs) return wsWrite(sh, resolvePath(cwdAbs(sh.lab), path), text, append);
  const h = sh.lab.hosts[rs.hostId];
  if (!h) return 'No such host';
  if (h.kind === 'minix' || h.kind === 'nuc') return 'Access is denied.';
  const fs = linuxFs(sh.lab, h, rs);
  const abs = fs.resolve(path);
  const home = rs.user === 'root' ? '/root' : `/home/${rs.user}`;
  if (rs.user !== 'root' && !abs.startsWith(`${home}/`) && !abs.startsWith('/tmp/')) return 'Permission denied';
  const prev = append ? (h.files[abs] ?? '') : '';
  const r = core().hostWriteFile(sh.lab, sh.ctx, h.id, abs, prev + text, 'player');
  return r.ok ? null : r.error;
}

const textOf = (lines: Line[]): string[] => lines.map((l) => l.text);

/** Windows cmd tokenizer: whitespace + double quotes, no escapes (backslashes are path separators). */
function winSplit(line: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] ?? m[2]!);
  return out;
}

interface RunOut {
  lines: Line[];
  code: number;
  clear: boolean;
  stream: StreamJob | null;
}

/** Run a full command line in the current session. */
function runLine(sh: Sh, line: string, _top: boolean): CmdResult {
  void _top;
  const rs = session.remote;
  const h = rs ? sh.lab.hosts[rs.hostId] : undefined;
  if (rs && h && (h.kind === 'minix' || h.kind === 'nuc')) {
    const argv = winSplit(line);
    if (!argv.length) return ok();
    return remoteExec(sh, rs, argv, null);
  }
  let list;
  try {
    list = parse(line, sh.env);
  } catch (e) {
    const msg = e instanceof ParseError ? e.message : 'syntax error';
    return fail(2, E(`bash: ${msg}`));
  }
  const out: RunOut = { lines: [], code: 0, clear: false, stream: null };
  let last = 0;
  let skip = false;
  for (const item of list.items) {
    if (!skip) {
      const r = runPipeline(sh, item.pipeline.commands);
      if (r.clear) {
        out.clear = true;
        out.lines = [];
      }
      out.lines.push(...r.lines);
      last = r.code;
      session.lastExit = last;
      sh.env['?'] = String(last);
      if (r.stream) {
        out.stream = r.stream;
        break;
      }
    }
    skip = item.op === '&&' ? last !== 0 : item.op === '||' ? last === 0 : false;
  }
  out.code = last;
  return { lines: out.lines, code: out.code, ...(out.clear ? { clear: true } : {}), ...(out.stream ? { stream: out.stream } : {}) };
}

function runPipeline(sh: Sh, cmds: SimpleCommand[]): CmdResult {
  let stdin: string[] | null = null;
  const tty: Line[] = [];
  let code = 0;
  let clear = false;
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i]!;
    const r = runSimple(sh, c, stdin);
    code = r.code;
    if (r.clear) clear = true;
    const errs = r.lines.filter((l) => l.stderr);
    let outs = r.lines.filter((l) => !l.stderr);
    if (c.stderr === 'stdout') outs = r.lines;
    else if (c.stderr === 'tty') tty.push(...errs);
    if (r.stream) {
      // Downstream pipeline stages filter each streamed chunk; a redirect captures the whole stream.
      const rest = cmds.slice(i + 1);
      const inner = r.stream;
      const redirect = c.redirect;
      if (redirect && redirect.path !== '/dev/null' && !redirect.append) redirectWrite(sh, redirect.path, '', false);
      const job = registerJob({
        step(s, phys) {
          const x = inner.step(s, phys);
          return { ...x, lines: filterChunk(s, x.lines, rest, redirect) };
        },
        interrupt(s) {
          return filterChunk(s, inner.interrupt?.(s) ?? [], rest, redirect);
        },
      });
      dropJob(inner.id);
      const firstOut = filterChunk(sh, outs, rest, redirect);
      return { lines: [...tty, ...firstOut], code: 0, stream: job };
    }
    if (c.redirect) {
      const text = r.binary ?? (outs.length ? `${textOf(outs).join('\n')}\n` : '');
      const e = redirectWrite(sh, c.redirect.path, text, c.redirect.append);
      if (e) {
        tty.push(E(`bash: ${c.redirect.path}: ${e}`));
        code = 1;
      }
      outs = [];
      stdin = [];
      continue;
    }
    const bin = r.binary ? binaryNoise(r.binary) : [];
    if (i < cmds.length - 1) {
      stdin = [...textOf(outs), ...(r.binary ? catText(r.binary) : [])];
      continue;
    }
    // Last stage: keep the command's own stdout/stderr interleaving.
    const own = c.stderr === 'null' ? r.lines.filter((l) => !l.stderr) : r.lines;
    const earlier = tty.slice(0, tty.length - (c.stderr === 'tty' ? errs.length : 0));
    return { lines: [...earlier, ...own, ...bin], code, ...(clear ? { clear: true } : {}) };
  }
  return { lines: tty, code, ...(clear ? { clear: true } : {}) };
}

function filterChunk(sh: Sh, lines: Line[], rest: SimpleCommand[], redirect: SimpleCommand['redirect']): Line[] {
  let cur = lines;
  const errs: Line[] = [];
  if (!rest.length && redirect) {
    if (cur.length) redirectWrite(sh, redirect.path, `${textOf(cur.filter((l) => !l.stderr)).join('\n')}\n`, true);
    return cur.filter((l) => l.stderr);
  }
  for (const c of rest) {
    if (!cur.length) return errs;
    const r = runSimple(sh, c, textOf(cur.filter((l) => !l.stderr)));
    errs.push(...cur.filter((l) => l.stderr));
    cur = r.lines;
    if (c.redirect) {
      redirectWrite(sh, c.redirect.path, `${textOf(cur.filter((l) => !l.stderr)).join('\n')}\n`, true);
      cur = cur.filter((l) => l.stderr);
    }
  }
  return [...errs, ...cur];
}

/* ────────────────────────────── tab completion ────────────────────────────── */

const GIT_SUBS = ['add', 'branch', 'checkout', 'clone', 'commit', 'config', 'diff', 'fetch', 'log', 'mv', 'pull', 'push', 'remote', 'restore', 'revert', 'rm', 'show', 'status', 'switch'];
const ADB_SUBS = ['connect', 'devices', 'disconnect', 'exec-out', 'kill-server', 'logcat', 'pull', 'shell', 'start-server', 'tcpip', 'version'];
const SYSTEMCTL_SUBS = ['is-active', 'list-units', 'restart', 'start', 'status', 'stop'];
const PI_COMMANDS = ['adb', 'cat', 'cd', 'clear', 'cp', 'curl', 'date', 'df', 'dmesg', 'du', 'echo', 'exit', 'free', 'grep', 'head', 'hostname', 'ip', 'journalctl', 'logout', 'ls', 'mkdir', 'nano', 'ping', 'ps', 'pwd', 'reboot', 'rm', 'sudo', 'systemctl', 'tail', 'uname', 'uptime', 'vcgencmd', 'whoami', 'wine'];
const WIN_COMMANDS = ['cd', 'cls', 'curl', 'del', 'dir', 'echo', 'exit', 'hostname', 'ipconfig', 'ping', 'powershell', 'rmdir', 'sc', 'schtasks', 'type', 'whoami'];

function complete(lab: LabState, ctx: TxContext, partial: string): string[] {
  const sh: Sh = { lab, ctx, env: envFor(lab) };
  const segs = partial.split(/\|\||&&|[|;]/);
  const seg = segs[segs.length - 1] ?? '';
  const words = seg.replace(/^\s+/, '').split(/\s+/);
  const token = words[words.length - 1] ?? '';
  const prev = words.slice(0, -1).filter((w) => !/^[A-Z_]+=/.test(w));
  const rs = session.remote;
  const h = rs ? lab.hosts[rs.hostId] : undefined;
  const win = !!h && (h.kind === 'minix' || h.kind === 'nuc');
  const startsWith = (xs: readonly string[]): string[] => xs.filter((x) => x.startsWith(token)).sort();
  if (!prev.length || (prev.length === 1 && prev[0] === 'sudo')) {
    if (!token.includes('/')) return startsWith(rs ? (win ? WIN_COMMANDS : PI_COMMANDS) : [...WS_COMMANDS, ...(lab.repos['uia-remote'].local ? ['./gradlew'] : [])]);
  }
  const head = prev[0] === 'sudo' ? prev[1] : prev[0];
  const argIdx = prev.length - (prev[0] === 'sudo' ? 1 : 0);
  if (head === 'git' && argIdx === 1) return startsWith(GIT_SUBS);
  if (head === 'git' && (prev[1] === 'checkout' || prev[1] === 'switch')) {
    const at = repoOfCwd(lab);
    if (at) {
      const local = lab.repos[at].local;
      const names = new Set<string>([...Object.keys((local as unknown as { branches?: Record<string, string> })?.branches ?? {}), ...Object.keys(lab.repos[at].branches)]);
      const hits = startsWith([...names]);
      if (hits.length) return hits;
    }
  }
  if (head === 'adb' && argIdx === 1) return startsWith(ADB_SUBS);
  if (head === 'adb' && prev[prev.length - 1] === '-s') return startsWith(lab.workstation.adbConnections.map((c) => c.target));
  if (head === 'systemctl' && argIdx === 1) return startsWith(SYSTEMCTL_SUBS);
  if ((head === 'systemctl' && argIdx === 2) || (head === 'journalctl' && prev[prev.length - 1] === '-u')) return h ? startsWith(Object.keys(h.services).map((s) => (s === 'sshd' ? 'ssh' : s))) : [];
  if (win) return [];
  // Paths.
  const fs = rs && h ? linuxFs(lab, h, rs) : wsFs(sh);
  const slash = token.lastIndexOf('/');
  const dirPart = slash >= 0 ? token.slice(0, slash + 1) : '';
  const base = slash >= 0 ? token.slice(slash + 1) : token;
  const dirAbs = fs.resolve(dirPart || '.');
  const entries = fs.list(dirAbs) ?? [];
  return entries
    .filter((e) => e.name.startsWith(base) && (base.startsWith('.') || !e.name.startsWith('.')))
    .map((e) => `${dirPart}${e.name}${e.dir ? '/' : ''}`)
    .sort();
}

function repoOfCwd(lab: LabState): keyof LabState['repos'] | null {
  const abs = cwdAbs(lab);
  for (const r of Object.values(lab.repos)) {
    if (!r.local) continue;
    const root = resolvePath(HOME, r.local.path);
    if (abs === root || abs.startsWith(`${root}/`)) return r.id;
  }
  return null;
}

/* ────────────────────────────── the API ────────────────────────────── */

const toTerminalLines = (lines: Line[]): TerminalLine[] => lines.map((l) => ({ text: l.text, ...(l.kind ? { kind: l.kind } : {}) }));


const NO_CTX: TxContext = {
  emit() {},
  get now() {
    return getState().lab.time.nowMs;
  },
  random() {
    return 0;
  },
  get rng() {
    return getState().lab.rng;
  },
};

export function createTerminal(): TerminalApi & {
  exec(line: string, sessionId?: string): TerminalResult;
  poll(jobId: string, sessionId?: string): { lines: TerminalLine[]; done: boolean; exitCode: number | null };
  interrupt(jobId: string, sessionId?: string): void;
  complete(partial: string, sessionId?: string): string[];
  prompt(sessionId?: string): string;
} {
  return {
    exec(line: string, sessionId?: string): TerminalResult {
      return transact((root, ctx) => {
        const lab = root.lab;
        const key = enter(sessionId);
        try {
          reconcile(lab, key);
          const sh: Sh = { lab, ctx, env: envFor(lab) };
          const trimmed = line.trim();
          if (!trimmed) return { lines: [], exitCode: 0, prompt: promptOf(lab) };
          let res: CmdResult;
          const wasRemote = session.remote;
          if (wasRemote && !sessionAlive(lab, wasRemote)) res = { lines: dropDeadSession(sh), code: 255 };
          else {
            if (!wasRemote) {
              const hist = lab.workstation.shellHistory;
              if (hist[hist.length - 1] !== trimmed) hist.push(trimmed);
              if (hist.length > 1000) hist.splice(0, hist.length - 1000);
            }
            res = runLine(sh, trimmed, true);
          }
          session.lastExit = res.code;
          const host = wasRemote?.hostId ?? 'ws-17';
          const cwd = wasRemote ? wasRemote.cwd : tildify(cwdAbs(lab));
          let streamingJobId: string | undefined;
          if (res.stream) {
            res.stream.sessionId = key;
            jobMeta.set(res.stream.id, { key, line: trimmed, host, cwd, final: null });
            streamingJobId = res.stream.id;
          } else ctx.emit('terminal.command', { line: trimmed, host, cwd, exitCode: res.code });
          mirror(lab, key);
          return {
            lines: toTerminalLines(res.lines),
            exitCode: res.code,
            ...(res.clear ? { clear: true } : {}),
            prompt: promptOf(lab),
            ...(streamingJobId ? { streamingJobId } : {}),
          };
        } finally {
          leave(key);
        }
      });
    },

    poll(jobId: string, sessionId?: string) {
      const job = getJob(jobId);
      const meta = jobMeta.get(jobId);
      if (!job || !meta) return { lines: [], done: true, exitCode: null };
      return transact((root, ctx) => {
        const lab = root.lab;
        const key = enter(sessionId ?? meta.key);
        try {
          const sh: Sh = { lab, ctx, env: envFor(lab) };
          let r: { lines: Line[]; done: boolean; exitCode: number | null };
          if (meta.final) r = { lines: meta.final, done: true, exitCode: 130 };
          else r = job.step(sh, lab.time.physMs);
          if (r.done) {
            dropJob(jobId);
            jobMeta.delete(jobId);
            session.lastExit = r.exitCode ?? 0;
            ctx.emit('terminal.command', { line: meta.line, host: meta.host, cwd: meta.cwd, exitCode: r.exitCode ?? 0 });
            mirror(lab, key);
          }
          return { lines: toTerminalLines(r.lines), done: r.done, exitCode: r.exitCode };
        } finally {
          leave(key);
        }
      });
    },

    interrupt(jobId: string, sessionId?: string): void {
      const job = getJob(jobId);
      const meta = jobMeta.get(jobId);
      if (!job || !meta || meta.final) return;
      transact((root, ctx) => {
        const key = enter(sessionId ?? meta.key);
        try {
          const sh: Sh = { lab: root.lab, ctx, env: envFor(root.lab) };
          job.interrupted = true;
          meta.final = job.interrupt?.(sh) ?? [];
        } finally {
          leave(key);
        }
      });
    },

    complete(partial: string, sessionId?: string): string[] {
      const key = enter(sessionId);
      try {
        const lab = getState().lab;
        reconcile(lab, key);
        return complete(lab, NO_CTX, partial);
      } finally {
        leave(key);
      }
    },

    prompt(sessionId?: string): string {
      const key = enter(sessionId);
      try {
        const lab = getState().lab;
        reconcile(lab, key);
        return promptOf(lab);
      } finally {
        leave(key);
      }
    },
  };
}

/** Test hook: forget all terminal sessions and jobs (a fresh UI). */
export function resetTerminalSessions(): void {
  sessions.clear();
  jobMeta.clear();
  primaryKey = null;
  mirrorKey = null;
  Object.assign(session, freshSession(true));
  resetWsSession();
  resetSshSession();
}

export { macFor };
