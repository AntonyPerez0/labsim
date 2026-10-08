/**
 * `ssh [user@]host [command]` from the workstation (Apps §5.4, Sim §2.5.1): key auth (passwords only
 * echoed in Academy, Cur M05 s7), banners, the exact connection errors, remote prompts, and closing on
 * `exit` / reboot / host loss. Commands inside the session are run by `./remote.ts`.
 */
import type { Host, LabState } from '../types';
import { core } from '../devops/coreRef';
import { gameDate, pad2 } from '../devops/util';
import { linuxCommand, windowsCommand, windowsPrompt, WINDOWS_HOME } from './remote';
import type { CmdResult, Line, RemoteSession, Sh } from './session';
import { E, L, fail, ok, registerJob, session } from './session';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Last login per host (UI-session memory; the first login reports the factory 07:58:12 login). */
const lastLogin = new Map<string, number>();

export function resetSshSession(): void {
  lastLogin.clear();
}

function loginStamp(lab: LabState, ms: number): string {
  const t = gameDate(lab, ms);
  return `${WEEKDAYS[t.wd]} ${MONTHS[t.mo - 1]} ${String(t.d).padStart(2, ' ')} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)} ${t.y}`;
}

const isWindows = (h: Host): boolean => h.kind === 'minix' || h.kind === 'nuc';
const userFor = (h: Host): string | null => (h.kind === 'pi' ? 'pi' : isWindows(h) || h.kind === 'vm' ? 'automation' : h.kind === 'blade' ? 'root' : null);

function banner(lab: LabState, h: Host, user: string): Line[] {
  const dayStart = Math.floor(lab.time.nowMs / 86_400_000) * 86_400_000;
  const seen = lastLogin.get(h.id);
  const prev = seen !== undefined && seen <= lab.time.nowMs ? seen : dayStart + (7 * 3600 + 58 * 60 + 12) * 1000;
  lastLogin.set(h.id, lab.time.nowMs);
  const last = L(`Last login: ${loginStamp(lab, prev)} from 10.42.50.17`);
  if (h.kind === 'pi') {
    return [
      L(`Linux ${h.hostname} 6.6.31-v8+ #1 SMP PREEMPT Debian 1:6.6.31-1+rpt1 (2024-05-29) aarch64`),
      L(''),
      L('The programs included with the Debian GNU/Linux system are free software;'),
      L('the exact distribution terms for each program are described in the'),
      L('individual files in /usr/share/doc/*/copyright.'),
      L(''),
      L('Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent'),
      L('permitted by applicable law.'),
      last,
    ];
  }
  if (isWindows(h)) return [L('Microsoft Windows [Version 10.0.19044.5011]'), L('(c) Microsoft Corporation. All rights reserved.'), L('')];
  if (h.kind === 'blade') return [L(`Linux ${h.hostname} 6.8.12-1-pve #1 SMP PREEMPT_DYNAMIC PMX 6.8.12-1 (2024-08-05T16:17Z) x86_64`), L(''), L('The programs included with the Debian GNU/Linux system are free software;'), L('Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY, to the extent'), L('permitted by applicable law.'), last];
  void user;
  return [
    L('Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-119-generic x86_64)'),
    L(''),
    L(' * Documentation:  https://help.ubuntu.com'),
    L(' * Management:     https://landscape.canonical.com'),
    L(' * Support:        https://ubuntu.com/pro'),
    L(''),
    L(`  System load:  0.21               Processes:             164`),
    L(`  Usage of /:   ${h.diskUsedPct.toFixed(1)}% of ${h.diskTotalGb}GB   Users logged in:       0`),
    L(`  Memory usage: 38%                IPv4 address for ens18: ${h.ip}`),
    L(''),
    last,
  ];
}

/** Prompt of a remote session. */
export function remotePrompt(lab: LabState, rs: RemoteSession): string {
  const h = lab.hosts[rs.hostId];
  if (h && isWindows(h)) return windowsPrompt(rs, h);
  const home = rs.user === 'root' ? '/root' : `/home/${rs.user}`;
  const show = rs.cwd === home ? '~' : rs.cwd.startsWith(`${home}/`) ? `~/${rs.cwd.slice(home.length + 1)}` : rs.cwd;
  const host = h?.hostname ?? rs.hostId;
  if (h?.kind === 'pi') return `${rs.user}@${host}:${show} $ `;
  return `${rs.user}@${host}:${show}${rs.user === 'root' ? '#' : '$'} `;
}

/** Run one remote command line (argv) in the current ssh session. */
export function remoteExec(sh: Sh, rs: RemoteSession, argv: string[], stdin: string[] | null): CmdResult {
  const h = sh.lab.hosts[rs.hostId];
  if (h && isWindows(h)) return windowsCommand(sh, rs, argv, stdin);
  return linuxCommand(sh, rs, argv, stdin);
}

/** Is the host behind an open session still answering? (reboot / power loss / cable → session dies) */
export function sessionAlive(lab: LabState, rs: RemoteSession): boolean {
  const h = lab.hosts[rs.hostId];
  if (!h) return false;
  return h.os === 'RUNNING' && h.eth !== 'UNPLUGGED';
}

export function ssh(sh: Sh, argv: string[], runRemote: (rs: RemoteSession, line: string) => CmdResult): CmdResult {
  const lab = sh.lab;
  let port = 22;
  let dest: string | null = null;
  const cmdWords: string[] = [];
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (dest) {
      cmdWords.push(a);
      continue;
    }
    if (a === '-p') port = Number(argv[++i]);
    else if (a === '-i' || a === '-l' || a === '-o' || a === '-F') i++;
    else if (a.startsWith('-')) continue;
    else dest = a;
  }
  if (!dest) {
    return fail(255, ...['usage: ssh [-46AaCfGgKkMNnqsTtVvXxYy] [-B bind_interface]', '           [-b bind_address] [-c cipher_spec] [-D [bind_address:]port]', '           [-E log_file] [-e escape_char] [-F configfile] [-I pkcs11]', '           [-i identity_file] [-J [user@]host[:port]] [-L address]', '           [-l login_name] [-m mac_spec] [-O ctl_cmd] [-o option] [-p port]', '           [-Q query_option] [-R address] [-S ctl_path] [-W host:port]', '           [-w local_tun[:remote_tun]] destination [command [argument ...]]'].map(E));
  }
  const at = dest.lastIndexOf('@');
  const user = at >= 0 ? dest.slice(0, at) : 'engineer';
  const hostPart = at >= 0 ? dest.slice(at + 1) : dest;
  const r = core().resolve(lab, hostPart);
  if (!r.ip) return fail(255, E(`ssh: Could not resolve hostname ${hostPart}: Name or service not known`));
  const reach = core().reach(lab, sh.ctx, 'ws-17', r.ip, port);
  const pre: Line[] = [];
  const h = r.hostId ? lab.hosts[r.hostId] : undefined;
  if (!reach.ok) {
    const why = reach.kind === 'timeout' ? 'Connection timed out' : reach.kind === 'refused' ? 'Connection refused' : 'No route to host';
    const line = E(`ssh: connect to host ${hostPart} port ${port}: ${why}`);
    if (reach.kind === 'timeout') {
      const until = lab.time.physMs + 10_000;
      const job = registerJob({
        step(_s, phys) {
          return phys >= until ? { lines: [line], done: true, exitCode: 255 } : { lines: [], done: false, exitCode: null };
        },
      });
      return { lines: [], code: 0, stream: job };
    }
    return fail(255, line);
  }
  if (!h || r.hostId === 'ws-17') {
    // Something answered on 22 that is not a lab host we model (or ourselves).
    if (r.hostId === 'ws-17') return fail(255, E(`${user}@${hostPart}: Permission denied (publickey).`));
    return fail(255, E(`ssh: connect to host ${hostPart} port ${port}: Connection refused`));
  }
  const expected = userFor(h);
  if (lab.config.mode === 'academy' && h.kind === 'pi') pre.push(L(`${user}@${hostPart}'s password: `, 'muted'));
  if (!expected || user !== expected) return fail(255, ...pre, E(`${user}@${hostPart}: Permission denied (publickey).`));
  const rs: RemoteSession = {
    hostId: h.id,
    user,
    cwd: isWindows(h) ? WINDOWS_HOME : user === 'root' ? '/root' : `/home/${user}`,
    shell: isWindows(h) ? 'cmd' : 'bash',
    target: hostPart,
  };
  if (cmdWords.length) {
    // One-shot remote command: run it, then the connection closes (no banner).
    const res = runRemote(rs, cmdWords.join(' '));
    return { ...res, lines: [...pre, ...res.lines] };
  }
  session.remote = rs;
  lab.workstation.sshHostId = h.id;
  sh.ctx.emit('ssh.connected', { hostId: h.id });
  return ok(...pre, ...banner(lab, h, user));
}

/** Close a dead session (host rebooted, lost power or network while connected). */
export function dropDeadSession(sh: Sh): Line[] {
  const rs = session.remote;
  if (!rs) return [];
  session.remote = null;
  sh.lab.workstation.sshHostId = null;
  sh.ctx.emit('ssh.disconnected', { hostId: rs.hostId });
  return [E('client_loop: send disconnect: Broken pipe')];
}

export { ok as _ok };
