/**
 * Remote shells over ssh (Apps §5.4): Robot Pis (Raspberry Pi OS, `pi@<rig>:~ $`), Windows / Minix boxes
 * (cmd.exe over OpenSSH, `automation@MINIX-01 C:\Users\automation>`, plus `powershell`) and the VMs
 * (Ubuntu 22.04, `automation@orca:~$`). Physical effects go through CoreServices.
 */
import type { Host, LabState, ServiceState } from '../types';
import { core } from '../devops/coreRef';
import { fmtAgo, fmtJournal, fmtSystemd, fmtWinDir, gameDate, pad2, fmtDateCmd } from '../devops/util';
import { curl, ipAddr, macFor, nc, nslookup, ping } from './net';
import type { CmdResult, Line, Sh } from './session';
import { E, L, fail, ok, registerJob, remoteDirs, session } from './session';
import type { RemoteSession } from './session';
import type { Fs, FsEntry } from './text';
import { TEXT, sizeOf } from './text';

/* ────────────────────────────── service catalogue ────────────────────────────── */

interface SvcInfo {
  desc: string;
  pid: number;
  exec: string;
  proc: string;
  unit?: string;
}
const SVC: Record<string, SvcInfo> = {
  'robot-controller': { desc: 'LabSim Robot Controller (REST :8000)', pid: 812, exec: '/usr/bin/python3 -m robot_controller --config /etc/robot-controller/controller.yaml', proc: 'python3' },
  'camera-stream': { desc: 'Webcam MJPEG stream (:8081)', pid: 640, exec: '/usr/local/bin/mjpg_streamer -i "input_uvc.so -d /dev/video0 -r 1280x720 -f 10" -o "output_http.so -p 8081"', proc: 'mjpg_streamer' },
  'adb-service': { desc: 'ADB routing service (USB → TCP 5444)', pid: 701, exec: '/usr/bin/adb -a -P 5037 server nodaemon', proc: 'adb' },
  cardprog: { desc: 'Card programmer (Wine)', pid: 903, exec: '/usr/bin/wine C:\\CardProg\\CardProgrammer.exe', proc: 'wine' },
  sshd: { desc: 'OpenBSD Secure Shell server', pid: 588, exec: '/usr/sbin/sshd -D', proc: 'sshd', unit: 'ssh' },
  orca: { desc: 'Orca (Spring Boot)', pid: 1204, exec: '/usr/bin/java -Xmx2g -jar /opt/orca/orca.jar --spring.profiles.active=prod', proc: 'java' },
  mysql: { desc: 'MySQL Community Server', pid: 987, exec: '/usr/sbin/mysqld', proc: 'mysqld' },
  jenkins: { desc: 'Jenkins Continuous Integration Server', pid: 1102, exec: '/usr/bin/java -Djava.awt.headless=true -jar /usr/share/java/jenkins.war --webroot=/var/cache/jenkins/war --httpPort=8080', proc: 'java' },
  ollama: { desc: 'Ollama Service', pid: 1311, exec: '/usr/local/bin/ollama serve', proc: 'ollama' },
};

function svcKey(h: Host, name: string): string | null {
  const n = name.replace(/\.service$/, '');
  if (h.services[n]) return n;
  if (n === 'ssh' && h.services['sshd']) return 'sshd';
  if (n === 'sshd' && h.services['ssh']) return 'ssh';
  return null;
}

/** When a service last changed state, from its journal (failures) or its start time. */
function svcSince(lab: LabState, h: Host, key: string, s: ServiceState): number {
  const j = h.journal[key] ?? [];
  const last = j[j.length - 1];
  if (!s.running && last) {
    const m = /^(\w{3}) (\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(last);
    if (m) {
      const day = Number(m[2]) - gameDate(lab, lab.time.nowMs).d;
      return day * 86_400_000 + (Number(m[3]) * 3600 + Number(m[4]) * 60 + Number(m[5])) * 1000 + Math.floor(lab.time.nowMs / 86_400_000) * 86_400_000;
    }
  }
  if (s.running && s.startedPhysMs !== null && s.startedPhysMs > 0) return lab.time.nowMs - Math.max(0, lab.time.physMs - s.startedPhysMs) * lab.time.timeScale;
  return h.uptimeMs > 0 ? lab.time.nowMs - h.uptimeMs : 7 * 3_600_000 + 2 * 60_000 + 13_000;
}

function systemctlStatus(lab: LabState, h: Host, name: string): CmdResult {
  const key = svcKey(h, name);
  if (!key) return fail(4, E(`Unit ${name.replace(/\.service$/, '')}.service could not be found.`));
  const s = h.services[key]!;
  const info = SVC[key] ?? { desc: key, pid: 1400, exec: `/usr/bin/${key}`, proc: key };
  const unit = info.unit ?? key;
  const since = svcSince(lab, h, key, s);
  const ago = fmtAgo(Math.max(0, lab.time.nowMs - since));
  const pending = s.running && s.startedPhysMs !== null && s.startedPhysMs > lab.time.physMs;
  const dot = s.running && !pending ? '●' : s.failure ? '×' : '○';
  const lines: Line[] = [L(`${dot} ${unit}.service - ${info.desc}`), L(`     Loaded: loaded (/etc/systemd/system/${unit}.service; ${s.enabled ? 'enabled' : 'disabled'}; vendor preset: enabled)`)];
  let code = 0;
  if (pending) {
    lines.push(L(`     Active: activating (start) since ${fmtSystemd(lab, lab.time.nowMs)}; 1s ago`), L(`   Main PID: ${info.pid} (${info.proc})`));
    code = 3;
  } else if (s.running) {
    lines.push(
      L(`     Active: active (running) since ${fmtSystemd(lab, since)}; ${ago} ago`),
      L(`   Main PID: ${info.pid} (${info.proc})`),
      L(`      Tasks: ${key === 'robot-controller' ? 6 : 3} (limit: 4915)`),
      L(`     Memory: ${key === 'robot-controller' ? '41.2M' : key === 'cardprog' ? '96.8M' : '18.4M'}`),
      L(`     CGroup: /system.slice/${unit}.service`),
      L(`             └─${info.pid} ${info.exec}`),
    );
  } else if (s.failure) {
    lines.push(
      L(`     Active: failed (Result: ${s.failure}) since ${fmtSystemd(lab, since)}; ${ago} ago`),
      L(`    Process: ${info.pid} ExecStart=${info.exec} (code=exited, status=1/FAILURE)`),
      L(`   Main PID: ${info.pid} (code=exited, status=1/FAILURE)`),
    );
    code = 3;
  } else {
    lines.push(L(`     Active: inactive (dead) since ${fmtSystemd(lab, since)}; ${ago} ago`));
    code = 3;
  }
  const j = (h.journal[key] ?? []).slice(-10);
  if (j.length) lines.push(L(''), ...j.map((x) => L(x)));
  return { lines, code };
}

/* ────────────────────────────── Linux file system adapter ────────────────────────────── */

export function linuxFs(lab: LabState, h: Host, rs: RemoteSession): Fs {
  const home = rs.user === 'pi' ? '/home/pi' : `/home/${rs.user}`;
  const resolve = (p: string): string => {
    let path = p === '~' ? home : p.startsWith('~/') ? `${home}/${p.slice(2)}` : p;
    if (!path.startsWith('/')) path = `${rs.cwd === '/' ? '' : rs.cwd}/${path}`;
    const parts: string[] = [];
    for (const seg of path.split('/')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop();
      else parts.push(seg);
    }
    return `/${parts.join('/')}`;
  };
  const dirs = (): Set<string> => {
    const d = remoteDirs(h);
    for (const x of ['/home', home, '/etc', '/opt', '/var', '/var/log', '/tmp', '/usr', '/usr/bin']) d.add(x);
    return d;
  };
  return {
    cwd: rs.cwd,
    owner: rs.user,
    show: (abs) => (abs === home ? '~' : abs.startsWith(`${home}/`) ? `~/${abs.slice(home.length + 1)}` : abs),
    resolve,
    read(abs) {
      const f = h.files[abs];
      if (f !== undefined && !abs.endsWith('/')) return f;
      if (h.files[`${abs}/`] !== undefined || dirs().has(abs)) return 'DIR';
      return null;
    },
    dirMarker(abs) {
      const m = h.files[`${abs.replace(/\/$/, '')}/`];
      return m === undefined ? null : m;
    },
    list(abs) {
      const prefix = abs === '/' ? '/' : `${abs}/`;
      const names = new Map<string, FsEntry>();
      for (const [p, v] of Object.entries(h.files)) {
        if (!p.startsWith(prefix) || p === prefix) continue;
        const rest = p.slice(prefix.length);
        const first = rest.split('/')[0]!;
        if (!first) continue;
        const isDir = rest.includes('/');
        if (!names.has(first)) names.set(first, { name: first, dir: isDir, size: isDir ? 4096 : sizeOf(v) });
      }
      for (const d of dirs()) if (d.startsWith(prefix) && d !== abs && !d.slice(prefix.length).includes('/') && d.slice(prefix.length)) names.set(d.slice(prefix.length), { name: d.slice(prefix.length), dir: true, size: 4096 });
      return [...names.values()].sort((a, b) => a.name.localeCompare(b.name, 'en-US'));
    },
    write(abs, text) {
      if (rs.user !== 'root' && !abs.startsWith(home) && !abs.startsWith('/tmp')) return 'Permission denied';
      const r = core().hostWriteFile(lab, getCtx(), h.id, abs, text, 'player');
      return r.ok ? null : r.error;
    },
    remove(abs) {
      if (!abs.startsWith(home) && !abs.startsWith('/tmp') && rs.user !== 'root') return 'Permission denied';
      const r = core().hostDeletePath(lab, getCtx(), h.id, abs, 'player');
      return r.ok ? null : r.error;
    },
    setCwd(abs) {
      rs.cwd = abs;
    },
  };
}

let currentSh: Sh | null = null;
const getCtx = (): Sh['ctx'] => currentSh!.ctx;

/* ────────────────────────────── exit / reboot ────────────────────────────── */

function closeSession(sh: Sh, lines: Line[]): CmdResult {
  const rs = session.remote;
  if (rs) {
    sh.ctx.emit('ssh.disconnected', { hostId: rs.hostId });
    session.remote = null;
    sh.lab.workstation.sshHostId = null;
  }
  return ok(...lines);
}

/* ────────────────────────────── Linux shell ────────────────────────────── */

export function linuxCommand(sh: Sh, rs: RemoteSession, argv0: string[], stdin: string[] | null): CmdResult {
  currentSh = sh;
  const lab = sh.lab;
  const h = lab.hosts[rs.hostId];
  if (!h) return closeSession(sh, [L(`Connection to ${rs.target} closed.`)]);
  let argv = argv0;
  let sudo = rs.user === 'root';
  if (argv[0] === 'sudo') {
    sudo = true;
    argv = argv.slice(1);
    if (!argv.length) return fail(1, E('usage: sudo -h | -K | -k | -V'));
  }
  const cmd = argv[0]!;
  const fs = linuxFs(lab, h, sudo ? { ...rs, user: 'root' } : rs);
  fs.setCwd = (abs) => {
    rs.cwd = abs;
  };
  const isPi = h.kind === 'pi';
  if (cmd in TEXT && cmd !== 'echo') return TEXT[cmd]!(fs, argv, stdin, cmd);
  switch (cmd) {
    case 'echo':
      return TEXT['echo']!(fs, argv, stdin, cmd);
    case 'less':
    case 'more':
      return TEXT['cat']!(fs, argv, stdin, cmd);
    case 'exit':
    case 'logout':
      return closeSession(sh, [L('logout'), L(`Connection to ${rs.target} closed.`)]);
    case 'reboot':
    case 'shutdown':
    case 'poweroff': {
      if (!sudo) return fail(1, E(`Failed to ${cmd === 'reboot' ? 'set wall message' : cmd}: Interactive authentication required.`), E(`Failed to ${cmd} system via logind: Interactive authentication required.`));
      const r = core().hostReboot(lab, sh.ctx, h.id, 'player');
      if (!r.ok) return fail(1, E(r.error));
      return closeSession(sh, [L(`Connection to ${rs.target} closed by remote host.`), L(`Connection to ${rs.target} closed.`)]);
    }
    case 'whoami':
      return ok(L(sudo ? 'root' : rs.user));
    case 'hostname':
      return argv[1] === '-I' ? ok(L(`${h.ip} `)) : ok(L(h.hostname));
    case 'date':
      return ok(L(fmtDateCmd(lab, lab.time.nowMs)));
    case 'uname':
      return isPi
        ? ok(L(argv.includes('-a') ? `Linux ${h.hostname} 6.6.31-v8+ #1 SMP PREEMPT Debian 1:6.6.31-1+rpt1 (2024-05-29) aarch64 GNU/Linux` : 'Linux'))
        : ok(L(argv.includes('-a') ? `Linux ${h.hostname} 5.15.0-119-generic #129-Ubuntu SMP Fri Aug 2 19:25:20 UTC 2024 x86_64 x86_64 x86_64 GNU/Linux` : 'Linux'));
    case 'uptime': {
      const t = gameDate(lab, lab.time.nowMs);
      const m = Math.floor(h.uptimeMs / 60_000);
      const up = m >= 60 ? `${Math.floor(m / 60)}:${pad2(m % 60)}` : `${m} min`;
      return ok(L(` ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)} up ${up.padStart(5)},  1 user,  load average: 0.08, 0.12, 0.09`));
    }
    case 'df': {
      const total = h.diskTotalGb;
      const used = h.diskUsedGb;
      // ext4 keeps a root reserve, so Size ≠ Used + Avail; Use% = ceil(used / (used + avail)) — Cur M05 s9: 29G 6.1G 22G 22%.
      const avail = Math.max(0, total - used - 0.5);
      const pct = used + avail > 0 ? Math.ceil((100 * used) / (used + avail)) : 0;
      const g = (n: number): string => (n >= 10 ? `${Math.floor(n)}G` : `${n.toFixed(1)}G`);
      const dev = isPi ? '/dev/mmcblk0p2' : '/dev/sda2';
      const root = L(`${dev.padEnd(15)} ${g(total).padStart(4)} ${g(used).padStart(5)} ${g(avail).padStart(5)} ${String(pct).padStart(3)}% /`);
      const header = L('Filesystem      Size  Used Avail Use% Mounted on');
      if (argv.includes('/')) return ok(header, root);
      return ok(header, root, L('devtmpfs        1.7G     0  1.7G   0% /dev'), L('tmpfs           1.9G     0  1.9G   0% /dev/shm'), L('tmpfs           759M  1.2M  758M   1% /run'), ...(isPi ? [L('/dev/mmcblk0p1  510M   61M  450M  12% /boot/firmware')] : []));
    }
    case 'du': {
      const target = argv.slice(1).find((a) => !a.startsWith('-')) ?? '.';
      const abs = fs.resolve(target);
      const size = Object.entries(h.files)
        .filter(([p]) => p === abs || p.startsWith(`${abs}/`))
        .reduce((s2, [, v]) => s2 + sizeOf(v), 0);
      return ok(L(`${argv.some((a) => a.includes('h')) ? humanSize(size) : Math.ceil(size / 1024)}\t${target}`));
    }
    case 'free':
      return ok(L('               total        used        free      shared  buff/cache   available'), L('Mem:           3.7Gi       612Mi       2.4Gi        21Mi       814Mi       3.1Gi'), L('Swap:           99Mi          0B        99Mi'));
    case 'vcgencmd':
      if (!isPi) return fail(127, E('bash: vcgencmd: command not found'));
      if (argv[1] === 'measure_temp') return ok(L(`temp=${h.cpuTempC.toFixed(1)}'C`));
      if (argv[1] === 'get_throttled') return ok(L(`throttled=${h.underVoltage ? '0x50005' : '0x0'}`));
      return fail(1, E(`Command not registered`));
    case 'dmesg': {
      const lines = [L('[    0.000000] Booting Linux on physical CPU 0x0000000000 [0x410fd083]'), L('[    2.114072] usbcore: registered new interface driver uvcvideo')];
      if (h.usb.some((u) => u === 'webcam')) lines.push(L('[    2.341990] uvcvideo: Found UVC 1.00 device HD Webcam C270 (046d:0825)'));
      if (h.underVoltage) lines.push(L('[  412.331208] hwmon hwmon1: Undervoltage detected!'), L('[  418.371095] hwmon hwmon1: Voltage normalised'));
      return ok(...lines);
    }
    case 'ps': {
      const rows: Line[] = [L('USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND'), L('root           1  0.0  0.2 168880 11264 ?        Ss   07:02   0:02 /sbin/init')];
      for (const [k, s] of Object.entries(h.services)) {
        if (!s.running) continue;
        const info = SVC[k];
        if (!info) continue;
        const user = k === 'sshd' || k === 'mysql' ? (k === 'mysql' ? 'mysql' : 'root') : isPi ? 'pi' : k;
        const cmdline = k === 'cardprog' ? 'wine C:\\CardProg\\CardProgrammer.exe' : info.exec.replace(/^\/usr\/(local\/)?bin\//, '');
        rows.push(L(`${user.padEnd(10)} ${String(info.pid).padStart(5)}  ${k === 'cardprog' ? '2.1  3.4 284112 32408' : '0.4  1.1  98112 41220'} ?        Sl   07:02   2:41 ${cmdline}`));
      }
      rows.push(L(`${rs.user.padEnd(10)}  2287  0.0  0.1   8064  3996 pts/0    R+   ${pad2(gameDate(lab, lab.time.nowMs).h)}:${pad2(gameDate(lab, lab.time.nowMs).mi)}   0:00 ps aux`));
      return ok(...rows);
    }
    case 'wine':
      return argv[1] === '--version' ? ok(L('wine-8.0~repack-4')) : fail(1, E('Usage: wine PROGRAM [ARGUMENTS...]   Run the specified program'));
    case 'ip':
    case 'ifconfig':
      return ipAddr(h.ip, isPi ? 'eth0' : 'ens18', macFor(h.ip), isPi ? 16 : 16);
    case 'ping':
      return ping(sh, argv, h.id);
    case 'curl':
      return curl(sh, argv, h.id);
    case 'nc':
      return nc(sh, argv, h.id);
    case 'nslookup':
      return nslookup(sh, argv);
    case 'systemctl':
      return systemctl(sh, h, argv, sudo);
    case 'service': {
      const [, name, action] = argv;
      if (!name || !action) return fail(1, E('Usage: service < option > | --status-all | [ service_name [ command | --full-restart ] ]'));
      return systemctl(sh, h, ['systemctl', action, name], sudo);
    }
    case 'journalctl':
      return journalctl(sh, h, argv);
    case 'adb':
      return piAdb(sh, h, argv);
    case 'nano':
    case 'vi':
    case 'vim':
      return ok(L(`(${cmd} opens in the editor view)`, 'muted'));
    case 'ollama': {
      if (h.id !== 'ollama-vm') return fail(127, E('bash: ollama: command not found'));
      if (argv[1] === 'list') return ok(L('NAME            ID              SIZE      MODIFIED    '), ...lab.ollama.models.map((m) => L(`${m.padEnd(16)}8dd30f6b0cb1    4.7 GB    3 weeks ago    `)));
      return fail(1, E('Error: unknown command'));
    }
    case 'clear':
      return { lines: [], code: 0, clear: true };
    case 'history':
      return ok();
    case 'cd':
      return TEXT['cd']!(fs, argv, stdin, cmd);
    default:
      return fail(127, E(`bash: ${cmd}: command not found`));
  }
}

function humanSize(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)}G`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)}M`;
  if (n >= 1024) return `${Math.ceil(n / 1024)}K`;
  return `${n}`;
}

function systemctl(sh: Sh, h: Host, argv: string[], sudo: boolean): CmdResult {
  const action = argv[1];
  const name = (argv[2] ?? '').replace(/\.service$/, '');
  if (!action) return systemctlList(h);
  if (action === 'list-units' || action === '--failed') return systemctlList(h);
  if (!name) return fail(1, E(`Too few arguments.`));
  const key = svcKey(h, name);
  if (action === 'status') return systemctlStatus(sh.lab, h, name);
  if (action === 'is-active') {
    if (!key) return fail(4, L('inactive'));
    const s = h.services[key]!;
    return s.running ? ok(L('active')) : fail(3, L(s.failure ? 'failed' : 'inactive'));
  }
  if (action === 'is-enabled') return key ? ok(L(h.services[key]!.enabled ? 'enabled' : 'disabled')) : fail(1, E(`Failed to get unit file state for ${name}.service: No such file or directory`));
  if (['start', 'stop', 'restart', 'reload'].includes(action)) {
    if (!sudo) return fail(1, E(`Failed to ${action} ${name}.service: Interactive authentication required.`), E(`See system logs and 'systemctl status ${name}.service' for details.`));
    if (!key) return fail(5, E(`Failed to ${action} ${name}.service: Unit ${name}.service not found.`));
    const r = core().hostService(sh.lab, sh.ctx, h.id, key, action === 'reload' ? 'restart' : (action as 'start' | 'stop' | 'restart'), 'player');
    if (!r.ok) return fail(1, E(r.error));
    return ok();
  }
  if (action === 'enable' || action === 'disable') return sudo ? ok() : fail(1, E(`Failed to ${action} unit: Interactive authentication required.`));
  return fail(1, E(`Unknown command verb ${action}.`));
}

function systemctlList(h: Host): CmdResult {
  const rows = Object.entries(h.services).map(([k, s]) => {
    const info = SVC[k];
    const unit = `${info?.unit ?? k}.service`;
    return L(`  ${unit.padEnd(28)} loaded ${s.running ? 'active   running' : s.failure ? 'failed   failed ' : 'inactive dead   '} ${info?.desc ?? k}`);
  });
  return ok(L('  UNIT                         LOAD   ACTIVE   SUB     DESCRIPTION'), ...rows, L(''), L(`${rows.length} loaded units listed.`));
}

function journalctl(sh: Sh, h: Host, argv: string[]): CmdResult {
  let unit: string | null = null;
  let n: number | null = null;
  let follow = false;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-u') unit = argv[++i] ?? null;
    else if (a.startsWith('--unit=')) unit = a.slice(7);
    else if (a === '-n' || a === '--lines') n = Number(argv[++i]);
    else if (/^-n\d+$/.test(a)) n = Number(a.slice(2));
    else if (a === '-f' || a === '--follow') follow = true;
    else if (a === '-fu') {
      follow = true;
      unit = argv[++i] ?? null;
    }
  }
  const lab = sh.lab;
  const key = unit ? svcKey(h, unit) : null;
  let all = key ? (h.journal[key] ?? []) : Object.values(h.journal).flat();
  if (key && !all.length && h.services[key]?.running) {
    // A clean boot: the only journal entry is systemd starting the unit.
    const since = svcSince(lab, h, key, h.services[key]!);
    all = [`${fmtJournal(lab, since)} ${h.hostname} systemd[1]: Started ${SVC[key]?.desc ?? key}.`];
  }
  const header = L(`-- Journal begins at Mon 2026-09-28 06:12:01 EDT, ends at ${fmtSystemd(lab, lab.time.nowMs)}. --`);
  if (unit && !key) return ok(header, L('-- No entries --'));
  const take = n ?? (follow ? 10 : all.length);
  const first = all.slice(Math.max(0, all.length - take));
  if (!follow) return ok(header, ...(first.length ? first.map((x) => L(x)) : [L('-- No entries --')]));
  let seen = all.length;
  let started = false;
  const hostId = h.id;
  const job = registerJob({
    step(s) {
      const host = s.lab.hosts[hostId];
      const lines: Line[] = [];
      if (!started) {
        lines.push(header, ...first.map((x) => L(x)));
        started = true;
      }
      const cur = key ? (host?.journal[key] ?? []) : Object.values(host?.journal ?? {}).flat();
      if (cur.length < seen) seen = Math.max(0, cur.length - 1);
      if (cur.length > seen) {
        lines.push(...cur.slice(seen).map((x) => L(x)));
        seen = cur.length;
      }
      return { lines, done: false, exitCode: null };
    },
  });
  return { lines: [], code: 0, stream: job };
}

/** `adb` on the shelf Pi (USB devices, Sim §3.15.1 last row; INC28). */
function piAdb(sh: Sh, h: Host, argv: string[]): CmdResult {
  if (!h.services['adb-service'] && !h.usb.some((u) => u.startsWith('adb:'))) return fail(127, E('bash: adb: command not found'));
  const usb = h.usb.filter((u) => u.startsWith('adb:')).map((u) => u.slice(4));
  if (argv[1] === 'devices') return ok(L('List of devices attached'), ...usb.map((s) => L(`${s}\tdevice`)), L(''));
  if (argv[1] === '-s' && argv[2]) {
    const serial = argv[2];
    if (!usb.includes(serial)) return fail(1, E(`adb: device '${serial}' not found`));
    const r = core().adbShell(sh.lab, sh.ctx, serial, argv.slice(3), 'terminal');
    return { lines: r.lines.map((x) => (r.ok ? L(x) : E(x))), code: r.ok ? 0 : 1 };
  }
  if (argv[1] === 'version') return ok(L('Android Debug Bridge version 1.0.41'), L('Version 34.0.5-debian'), L('Installed as /usr/lib/android-sdk/platform-tools/adb'));
  if (usb.length > 1 && argv[1] !== 'connect') return fail(1, E('adb: more than one device/emulator'));
  if (usb.length === 1 && argv[1]) {
    const r = core().adbShell(sh.lab, sh.ctx, usb[0]!, argv.slice(1), 'terminal');
    return { lines: r.lines.map((x) => (r.ok ? L(x) : E(x))), code: r.ok ? 0 : 1 };
  }
  return fail(1, E('adb: no devices/emulators found'));
}

/* ────────────────────────────── Windows (cmd.exe / PowerShell) ────────────────────────────── */

const WIN_HOME = 'C:\\Users\\automation';

function winResolve(cwd: string, p: string): string {
  let path = p.replace(/\//g, '\\');
  if (/^[A-Za-z]:/.test(path)) path = path[0]!.toUpperCase() + path.slice(1);
  else if (path.startsWith('\\')) path = `C:${path}`;
  else path = `${cwd}\\${path}`;
  const parts: string[] = [];
  for (const seg of path.split('\\')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      if (parts.length > 1) parts.pop();
    } else parts.push(seg);
  }
  return parts.length === 1 ? `${parts[0]}\\` : parts.join('\\');
}

function winExists(h: Host, abs: string): 'file' | 'dir' | null {
  const a = abs.replace(/\\$/, '');
  const lower = a.toLowerCase();
  if (/^c:$/i.test(a)) return 'dir';
  for (const p of Object.keys(h.files)) {
    const pl = p.toLowerCase().replace(/\\$/, '');
    if (pl === lower) return p.endsWith('\\') ? 'dir' : 'file';
    if (pl.startsWith(`${lower}\\`)) return 'dir';
  }
  if (['c:\\users', 'c:\\users\\automation', 'c:\\windows', 'c:\\windows\\temp', 'c:\\programdata', 'c:\\gort', 'c:\\program files'].includes(lower)) return 'dir';
  return null;
}

function cardMtime(lab: LabState, h: Host): number {
  return lab.callus.localCardFiles[h.id]?.syncedAtMs ?? h.schedTasks['GortCardSync']?.lastRunMs ?? -31_180_000;
}

function winDir(lab: LabState, h: Host, abs: string): CmdResult {
  const a = abs.replace(/\\$/, '');
  if (winExists(h, a) === null) return fail(1, L(' Volume in drive C has no label.'), L(' Volume Serial Number is 6A2E-11F0'), L(''), E('File Not Found'));
  const prefix = `${a}\\`.toLowerCase();
  const entries = new Map<string, { dir: boolean; size: number }>();
  for (const [p, v] of Object.entries(h.files)) {
    if (!p.toLowerCase().startsWith(prefix)) continue;
    const rest = p.slice(prefix.length);
    const first = rest.split('\\')[0]!;
    if (!first) continue;
    entries.set(first, { dir: rest.includes('\\'), size: rest.includes('\\') ? 0 : sizeOf(v) });
  }
  const when = fmtWinDir(lab, cardMtime(lab, h));
  const lines: Line[] = [L(' Volume in drive C has no label.'), L(' Volume Serial Number is 6A2E-11F0'), L(''), L(` Directory of ${a}`), L(''), L(`${when}    <DIR>          .`), L(`${when}    <DIR>          ..`)];
  let files = 0;
  let bytes = 0;
  for (const [name, e] of [...entries.entries()].sort((x, y) => x[0].localeCompare(y[0], 'en-US'))) {
    if (e.dir) lines.push(L(`${when}    <DIR>          ${name}`));
    else {
      files++;
      bytes += e.size;
      lines.push(L(`${when}    ${e.size.toLocaleString('en-US').padStart(14)} ${name}`));
    }
  }
  const free = Math.max(0, (h.diskTotalGb - h.diskUsedGb) * 1024 ** 3);
  lines.push(L(`${String(files).padStart(16)} File(s) ${bytes.toLocaleString('en-US').padStart(14)} bytes`), L(`${String(entries.size - files + 2).padStart(16)} Dir(s) ${Math.round(free).toLocaleString('en-US').padStart(15)} bytes free`));
  return ok(...lines);
}

function scQuery(h: Host, name: string): CmdResult {
  const key = Object.keys(h.services).find((k) => k.toLowerCase() === name.toLowerCase() || (name.toLowerCase() === 'SecAgent' && k === 'corporate-agent'));
  if (!key) return fail(1060, L('[SC] EnumQueryServicesStatus:OpenService FAILED 1060:'), L(''), L('The specified service does not exist as an installed service.'), L(''));
  const s = h.services[key]!;
  const pending = s.running && s.startedPhysMs !== null && s.startedPhysMs > 0 && false;
  const state = s.running ? (pending ? '2  START_PENDING' : '4  RUNNING') : '1  STOPPED';
  const svcName = key === 'callus' ? 'Callus' : key === 'corporate-agent' ? 'SecAgent' : key;
  return ok(
    L(`SERVICE_NAME: ${svcName}`),
    L('        TYPE               : 10  WIN32_OWN_PROCESS'),
    L(`        STATE              : ${state}`),
    L(`                                (${s.running ? 'STOPPABLE, NOT_PAUSABLE, ACCEPTS_SHUTDOWN' : 'NOT_STOPPABLE, NOT_PAUSABLE, IGNORES_SHUTDOWN'})`),
    L(`        WIN32_EXIT_CODE    : ${s.failure ? '1067  (0x42b)' : '0  (0x0)'}`),
    L('        SERVICE_EXIT_CODE  : 0  (0x0)'),
    L('        CHECKPOINT         : 0x0'),
    L('        WAIT_HINT          : 0x0'),
  );
}

function schtasks(sh: Sh, h: Host, argv: string[]): CmdResult {
  const lower = argv.map((a) => a.toLowerCase());
  const tn = argv[lower.indexOf('/tn') + 1] ?? '';
  const task = h.schedTasks[tn] ?? Object.values(h.schedTasks).find((t) => t.name.toLowerCase() === tn.toLowerCase());
  if (lower.includes('/query')) {
    if (tn && !task) return fail(1, E('ERROR: The system cannot find the file specified.'));
    const tasks = task ? [task] : Object.values(h.schedTasks);
    const next = (): string => {
      const day = 86_400_000;
      const base = Math.floor(sh.lab.time.nowMs / day) * day + 10 * 3_600_000;
      const at = base > sh.lab.time.nowMs ? base : base + day;
      const t = gameDate(sh.lab, at);
      return `${pad2(t.mo)}/${pad2(t.d)}/${t.y} ${pad2(t.h)}:${pad2(t.mi)}:${pad2(t.s)}`;
    };
    return ok(L(''), L('Folder: \\'), L('TaskName                                 Next Run Time          Status'), L('======================================== ====================== ==============='), ...tasks.map((t) => L(`${t.name.padEnd(40)} ${next().padEnd(22)} ${t.running ? 'Running' : 'Ready'}`)));
  }
  if (lower.includes('/run')) {
    if (!task) return fail(1, E('ERROR: The system cannot find the file specified.'));
    const r = core().runSchedTask(sh.lab, sh.ctx, h.id, 'GortCardSync', 'player');
    if (!r.ok) return fail(1, E(`ERROR: ${r.error}`));
    return ok(L(`SUCCESS: Attempted to run the scheduled task "${task.name}".`));
  }
  return fail(1, E('ERROR: Invalid syntax.'), E('Type "SCHTASKS /?" for usage.'));
}

export function windowsCommand(sh: Sh, rs: RemoteSession, argv: string[], stdin: string[] | null): CmdResult {
  currentSh = sh;
  const lab = sh.lab;
  const h = lab.hosts[rs.hostId];
  if (!h) return closeSession(sh, [L(`Connection to ${rs.target} closed.`)]);
  const cmd = argv[0]!.toLowerCase();
  const ps = rs.shell === 'powershell';
  if (ps) return powershell(sh, rs, h, argv);
  void stdin;
  switch (cmd) {
    case 'exit':
      return closeSession(sh, [L(`Connection to ${rs.target} closed.`)]);
    case 'hostname':
      return ok(L(h.hostname));
    case 'whoami':
      return ok(L(`${h.hostname.toLowerCase()}\\automation`));
    case 'cls':
      return { lines: [], code: 0, clear: true };
    case 'echo':
      return ok(L(argv.slice(1).join(' ')));
    case 'ver':
      return ok(L(''), L('Microsoft Windows [Version 10.0.19044.5011]'));
    case 'cd':
    case 'chdir': {
      if (!argv[1]) return ok(L(rs.cwd));
      const abs = winResolve(rs.cwd, argv.slice(1).join(' '));
      if (winExists(h, abs) !== 'dir') return fail(1, E('The system cannot find the path specified.'));
      rs.cwd = abs.replace(/\\$/, '') || 'C:\\';
      return ok();
    }
    case 'dir':
      return winDir(lab, h, winResolve(rs.cwd, argv.slice(1).filter((a) => !a.startsWith('/')).join(' ') || '.'));
    case 'type': {
      const abs = winResolve(rs.cwd, argv[1] ?? '');
      const key = Object.keys(h.files).find((p) => p.toLowerCase() === abs.toLowerCase());
      if (!key) return fail(1, E('The system cannot find the file specified.'));
      return ok(...h.files[key]!.split('\n').filter((l, i, a) => i < a.length - 1 || l).map((l) => L(l)));
    }
    case 'ipconfig':
      return ok(L(''), L('Windows IP Configuration'), L(''), L(''), L('Ethernet adapter Ethernet:'), L(''), L('   Connection-specific DNS Suffix  . : lab.local'), L(`   IPv4 Address. . . . . . . . . . . : ${h.ip}`), L('   Subnet Mask . . . . . . . . . . . : 255.255.0.0'), L('   Default Gateway . . . . . . . . . : 10.42.0.1'));
    case 'ping':
      return ping(sh, argv, h.id);
    case 'curl':
      return curl(sh, argv, h.id);
    case 'sc': {
      const verb = (argv[1] ?? '').toLowerCase();
      const name = argv[2] ?? '';
      if (/^corp/i.test(name) && (verb === 'stop' || verb === 'delete' || verb === 'config')) {
        sh.ctx.emit('host.securityTamper', { hostId: h.id, action: `sc ${verb} ${name}`, actor: 'player' });
        return fail(5, E('[SC] OpenService FAILED 5:'), E(''), E('Access is denied.'), E(''));
      }
      if (verb === 'query' || verb === 'queryex') return scQuery(h, name);
      if (verb === 'start' || verb === 'stop') {
        const key = Object.keys(h.services).find((k) => k.toLowerCase() === name.toLowerCase());
        if (!key) return fail(1060, L('[SC] OpenService FAILED 1060:'), L(''), L('The specified service does not exist as an installed service.'), L(''));
        const s = h.services[key]!;
        if (verb === 'start' && s.running) return fail(1056, L('[SC] StartService FAILED 1056:'), L(''), L('An instance of the service is already running.'), L(''));
        if (verb === 'stop' && !s.running) return fail(1062, L('[SC] ControlService FAILED 1062:'), L(''), L('The service has not been started.'), L(''));
        const r = core().hostService(lab, sh.ctx, h.id, key, verb, 'player');
        if (!r.ok) return fail(1, E(r.error));
        const svcName = key === 'callus' ? 'Callus' : key;
        return ok(L(''), L(`SERVICE_NAME: ${svcName}`), L('        TYPE               : 10  WIN32_OWN_PROCESS'), L(`        STATE              : ${verb === 'start' ? '2  START_PENDING' : '3  STOP_PENDING'}`), L('                                (NOT_STOPPABLE, NOT_PAUSABLE, IGNORES_SHUTDOWN)'), L('        WIN32_EXIT_CODE    : 0  (0x0)'), L('        SERVICE_EXIT_CODE  : 0  (0x0)'), L('        CHECKPOINT         : 0x0'), L('        WAIT_HINT          : 0x7d0'));
      }
      return fail(1, E('DESCRIPTION:'), E('        SC is a command line program used for communicating with the'), E('        Service Control Manager and services.'));
    }
    case 'schtasks':
      return schtasks(sh, h, argv);
    case 'del':
    case 'erase':
    case 'rmdir':
    case 'rd': {
      const target = argv.slice(1).filter((a) => !a.startsWith('/')).join(' ');
      if (!target) return fail(1, E('The syntax of the command is incorrect.'));
      const abs = winResolve(rs.cwd, target.replace(/\\\*$/, '').replace(/\*$/, ''));
      if (/programdata\\SecAgent/i.test(abs)) sh.ctx.emit('host.securityTamper', { hostId: h.id, action: `${cmd} ${abs}`, actor: 'player' });
      const r = core().hostDeletePath(lab, sh.ctx, h.id, abs, 'player');
      if (!r.ok) return fail(1, E(r.error));
      return ok();
    }
    case 'powershell':
    case 'pwsh':
      // One-shot form: `powershell [-Command] Get-PSDrive C` runs the cmdlet and returns to cmd.
      if (argv.length > 1) {
        const rest = argv.slice(1).filter((a, i) => !(i === 0 && /^-(c|command)$/i.test(a)));
        if (rest.length) return powershell(sh, rs, h, rest);
      }
      rs.shell = 'powershell';
      return ok(L('Windows PowerShell'), L('Copyright (C) Microsoft Corporation. All rights reserved.'), L(''), L('Install the latest PowerShell for new features and improvements! https://aka.ms/PSWindows'), L(''));
    case 'shutdown': {
      const r = core().hostReboot(lab, sh.ctx, h.id, 'player');
      if (!r.ok) return fail(1, E(r.error));
      return closeSession(sh, [L(`Connection to ${rs.target} closed by remote host.`), L(`Connection to ${rs.target} closed.`)]);
    }
    case 'nslookup':
      return nslookup(sh, argv);
    default:
      return fail(1, E(`'${argv[0]}' is not recognized as an internal or external command,`), E('operable program or batch file.'));
  }
}

function powershell(sh: Sh, rs: RemoteSession, h: Host, argv: string[]): CmdResult {
  const cmd = argv[0]!.toLowerCase();
  switch (cmd) {
    case 'exit':
      rs.shell = 'cmd';
      return ok();
    case 'get-psdrive': {
      const used = h.diskUsedGb;
      const free = Math.max(0, h.diskTotalGb - used);
      return ok(L(''), L('Name           Used (GB)     Free (GB) Provider      Root'), L('----           ---------     --------- --------      ----'), L(`C                  ${used.toFixed(1).padStart(5)} ${free.toFixed(1).padStart(13)} FileSystem    C:\\`), L(''));
    }
    case 'get-service': {
      const name = argv[1] ?? '';
      const key = Object.keys(h.services).find((k) => k.toLowerCase() === name.toLowerCase() || (name.toLowerCase() === 'SecAgent' && k === 'corporate-agent'));
      if (!key) return fail(1, E(`Get-Service : Cannot find any service with service name '${name}'.`));
      const s = h.services[key]!;
      const disp = key === 'callus' ? 'Callus' : key === 'corporate-agent' ? 'SecAgent' : key;
      return ok(L(''), L('Status   Name               DisplayName'), L('------   ----               -----------'), L(`${(s.running ? 'Running' : 'Stopped').padEnd(8)} ${disp.padEnd(18)} ${key === 'callus' ? 'Callus card emulation service' : key === 'corporate-agent' ? 'corporate Security Agent' : disp}`), L(''));
    }
    case 'get-childitem':
    case 'ls':
    case 'dir':
    case 'gci': {
      const r = windowsCommand(sh, { ...rs, shell: 'cmd' }, ['dir', ...argv.slice(1)], null);
      return r;
    }
    case 'cd':
    case 'set-location':
      return windowsCommand(sh, { ...rs, shell: 'cmd' }, ['cd', ...argv.slice(1)], null);
    case 'remove-item':
    case 'rm':
    case 'del':
      return windowsCommand(sh, { ...rs, shell: 'cmd' }, ['del', ...argv.slice(1).filter((a) => !a.startsWith('-'))], null);
    case 'stop-service': {
      if (/corp/i.test(argv.join(' '))) {
        sh.ctx.emit('host.securityTamper', { hostId: h.id, action: argv.join(' '), actor: 'player' });
        return fail(1, E("Stop-Service : Service 'SecAgent (SecAgent)' cannot be stopped due to the following error: Cannot open SecAgent service on computer '.'."));
      }
      const name = argv.slice(1).find((a) => !a.startsWith('-')) ?? '';
      return windowsCommand(sh, { ...rs, shell: 'cmd' }, ['sc', 'stop', name], null).code === 0 ? ok() : fail(1, E(`Stop-Service : Cannot find any service with service name '${name}'.`));
    }
    case 'start-service': {
      const name = argv.slice(1).find((a) => !a.startsWith('-')) ?? '';
      return windowsCommand(sh, { ...rs, shell: 'cmd' }, ['sc', 'start', name], null).code === 0 ? ok() : fail(1, E(`Start-Service : Cannot find any service with service name '${name}'.`));
    }
    case 'hostname':
      return ok(L(h.hostname));
    default:
      return fail(1, E(`${argv[0]} : The term '${argv[0]}' is not recognized as the name of a cmdlet, function, script file, or operable program.`), E('Check the spelling of the name, or if a path was included, verify that the path is correct and try again.'));
  }
}

export function windowsPrompt(rs: RemoteSession, h: Host | undefined): string {
  return rs.shell === 'powershell' ? `PS ${rs.cwd}> ` : `automation@${h?.hostname ?? 'WIN'} ${rs.cwd}>`;
}

export const WINDOWS_HOME = WIN_HOME;
export type { Fs };
