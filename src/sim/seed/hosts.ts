/**
 * Hosts (Sim §2.5): robot Pis, Callus Windows boxes, VMs on the GPU blade, the workstation and the
 * lab switch, with their services, files, journals, scheduled tasks and USB devices.
 */
import type { Host, HostKind, PowerHookup, SchedTask, ServiceState } from '../types';
import { createHost } from '../builders';
import { ROSTER, piDefs, CALLUS_BOXES } from './robots';
import type { PiDef } from './robots';

export const PI_OS = 'Raspberry Pi OS (Debian 12, Linux 6.6.31-v8+ aarch64)';
export const WIN_OS = 'Windows 10 IoT Enterprise';
export const VM_OS = 'Ubuntu 22.04 LTS';

/** Boot-time readiness from power-on, physical ms (Sim §2.5.2). */
export const BOOT_DELAYS: Record<string, number> = {
  sshd: 25_000,
  'robot-controller': 35_000,
  'adb-service': 36_000,
  cardprog: 36_000,
  'camera-stream': 40_000,
};
export const WIN_DELAYS: Record<string, number> = { sshd: 40_000, callus: 50_000, 'corporate-agent': 30_000, motion: 50_000 };
export const VM_DELAYS: Record<string, number> = { sshd: 20_000, mysql: 30_000, orca: 45_000, jenkins: 45_000, ollama: 40_000 };
/** `systemctl restart` / `sc start` readiness (Sim §2.5.2). */
export const RESTART_DELAYS: Record<string, number> = {
  'robot-controller': 3_000,
  'camera-stream': 2_000,
  cardprog: 4_000,
  'adb-service': 2_000,
  sshd: 1_000,
  callus: 5_000,
  'corporate-agent': 2_000,
  motion: 5_000,
  mysql: 5_000,
  orca: 20_000,
  ollama: 10_000,
  jenkins: 30_000,
  hypervisor: 5_000,
};
/** Network link / ICMP readiness after power-on (Pi 12 s, Windows 20 s, VM 10 s [illus.]). */
export const NET_READY_MS: Partial<Record<HostKind, number>> = { pi: 12_000, nuc: 20_000, minix: 20_000, vm: 10_000, blade: 30_000 };

const HOUR = 3_600_000;
/** Pis last booted at 07:02:13 (healthy `systemctl status`, Sim §3.14.1). */
export const PI_BOOT_GAME_MS = 7 * HOUR + 2 * 60_000 + 13_000;

function svc(name: string, port: number | null, delay: number, enabled = true): ServiceState {
  return { name, running: enabled, port, failure: null, enabled, startedPhysMs: enabled ? 0 : null, startDelayMs: delay, loadedConfig: null };
}

const serialOf = (type: string, octet: number, prefix: string) => `SIM-${prefix}-0000${String(octet).padStart(2, '0')}`;

/** `/etc/robot-controller/controller.yaml` (Sim §2.5.3) for a Pi. */
export function controllerYaml(pi: PiDef, serials: string[], callusIp: string | null, motionLocal: boolean, cardprog: boolean): string {
  const lines: string[] = [];
  if (pi.robots.length === 1) lines.push(`robot: ${pi.robots[0]}`);
  else lines.push(`robots: [${pi.robots.join(', ')}]`);
  lines.push('listen: 0.0.0.0:8000');
  if (callusIp) lines.push(`callus: http://${callusIp}:9000      # upstream checked by /health`);
  if (motionLocal) lines.push('motion: local                        # "local" = 25-pin motor PCB on this Pi\'s USB; legacy form: nuc://10.42.20.3:9100');
  if (pi.camera) lines.push('camera: /dev/video0');
  lines.push('adb:', '  port: 5444', `  devices: [${serials.join(', ')}]`);
  if (cardprog) lines.push('cardprog:', '  wineprefix: /home/pi/.wine-cardprog', "  exe: 'C:\\CardProg\\CardProgrammer.exe'");
  return lines.join('\n') + '\n';
}

const CALLUS_IP: Record<string, string> = Object.fromEntries(CALLUS_BOXES.map((b) => [b.id, b.ip]));

export function seedHosts(nowMs: number): Record<string, Host> {
  const hosts: Record<string, Host> = {};
  const piUptime = Math.max(0, nowMs - PI_BOOT_GAME_MS);

  for (const pi of piDefs()) {
    const rows = ROSTER.filter((r) => pi.robots.includes(r.name));
    const touch = rows.filter((r) => r.kind === 'touch' || r.kind === 'standalone');
    const cardRigs = rows.filter((r) => r.cards === 'DTS');
    const tethered = rows.filter((r) => r.kind === 'tethered');
    const adbBots = rows.filter((r) => r.kind === 'adb');
    const services: Record<string, ServiceState> = { sshd: svc('sshd', 22, BOOT_DELAYS.sshd!) };
    if (rows.length) {
      services['robot-controller'] = svc('robot-controller', 8000, BOOT_DELAYS['robot-controller']!);
      services['adb-service'] = svc('adb-service', null, BOOT_DELAYS['adb-service']!);
    }
    if (cardRigs.length) services.cardprog = svc('cardprog', null, BOOT_DELAYS.cardprog!);
    if (pi.camera) services['camera-stream'] = svc('camera-stream', 8081, BOOT_DELAYS['camera-stream']!);

    const usb: string[] = [];
    if (pi.camera) usb.push('webcam');
    for (const r of touch) usb.push(`motor-pcb:${r.name}`);
    for (const r of tethered) usb.push(`smartstripe:${r.name}`);
    const serials: string[] = [];
    for (const r of rows) {
      serials.push(serialOf(r.device.type, r.device.ip, prefixOf(r.device.type)));
      if (r.cfd) serials.push(serialOf(r.cfd.type, r.cfd.ip, prefixOf(r.cfd.type)));
    }
    for (const r of adbBots) usb.push(`adb:${serialOf(r.device.type, r.device.ip, prefixOf(r.device.type))}`);

    const files: Record<string, string> = {};
    if (rows.length) {
      const callusHost = rows.find((r) => r.callus)?.callus ?? null;
      files['/etc/robot-controller/controller.yaml'] = controllerYaml(pi, serials, callusHost ? CALLUS_IP[callusHost]! : null, touch.length > 0, cardRigs.length > 0);
    }
    if (cardRigs.length) {
      files['/opt/cardprog/wineprefix-golden/'] = 'ok';
      files['/home/pi/.wine-cardprog/'] = 'ok';
    }
    files['/var/log/robot-controller/'] = '';
    const used = pi.octet === 20 ? 5.4 : pi.octet === 30 ? 5.2 : pi.octet === 40 ? 4.9 : pi.physical ? 6.1 : 5.0;
    const supply: PowerHookup = pi.physical ? physicalPiSupply(pi) : { kind: 'dc-rail', targetId: 'offscreen' };
    hosts[pi.id] = createHost(pi.id, 'pi', pi.hostname, `10.42.10.${pi.octet}`, {
      osName: PI_OS,
      aliases: [`pi-10.42.10.${pi.octet}`],
      services,
      diskTotalGb: 29,
      diskUsedGb: used,
      diskUsedPct: Math.round((used / 29) * 100),
      cpuTempC: 48,
      uptimeMs: piUptime,
      owner: pi.robots[0] ?? null,
      propId: pi.physical ? `prop.${pi.id}` : null,
      files,
      usb,
      supply,
      offscreen: !pi.physical,
      bootDurationMs: 40_000,
      hasPower: true,
    });
  }

  for (const box of CALLUS_BOXES) {
    const nuc = box.kind === 'nuc';
    const services: Record<string, ServiceState> = {
      sshd: svc('sshd', 22, WIN_DELAYS.sshd!),
      'corporate-agent': svc('corporate-agent', null, WIN_DELAYS['corporate-agent']!),
      callus: svc('callus', 9000, WIN_DELAYS.callus!, !nuc),
    };
    if (nuc) services.motion = svc('motion', 9100, WIN_DELAYS.motion!, false);
    const files: Record<string, string> = {
      'C:\\ProgramData\\SecAgent\\agent.cfg': nuc ? 'log.rotation=off' : 'log.rotation=on',
      'C:\\ProgramData\\SecAgent\\logs\\': nuc ? '<size:118.4G>' : '<size:2.1G>',
      'C:\\gort\\': '',
    };
    // C:\gort\cards\… mirrors callus.localCardFiles (filled by seed/index.ts from gort's file contents).
    const total = nuc ? 237.9 : 64;
    const used = nuc ? 237.9 : box.id === 'minix-01' ? 39.0 : box.id === 'minix-02' ? 38.6 : 38.4;
    const sched: Record<string, SchedTask> = nuc
      ? {}
      : { GortCardSync: { name: 'GortCardSync', dailyAt: '10:00', lastRunMs: -31_200_000, lastResult: 0, running: false, runEndsPhysMs: null } };
    const physical = box.id === 'minix-01' || box.id === 'minix-02' || nuc;
    hosts[box.id] = createHost(box.id, box.kind, box.hostname, box.ip, {
      osName: WIN_OS,
      services,
      diskTotalGb: total,
      diskUsedGb: used,
      diskUsedPct: Math.round((used / total) * 100),
      cpuTempC: 52,
      uptimeMs: 2 * 24 * HOUR,
      propId: physical ? `prop.${box.id}` : null,
      files,
      schedTasks: sched,
      supply: nuc ? { kind: 'dc-rail', targetId: 'T-12V-NUC' } : box.id === 'minix-01' ? { kind: 'ac-strip', targetId: 'STRIP-A', socket: 4 } : box.id === 'minix-02' ? { kind: 'ac-strip', targetId: 'STRIP-B', socket: 5 } : { kind: 'ac-strip', targetId: 'offscreen' },
      offscreen: !physical,
      bootDurationMs: 50_000,
      hasPower: true,
      usb: [],
    });
  }

  hosts['gpu-blade'] = createHost('gpu-blade', 'blade', 'gpu-blade', '10.42.1.5', {
    osName: 'Proxmox VE 8.2 · 4× NVIDIA GPU (slots 1–2 top, 3–4 underneath)',
    services: { hypervisor: svc('hypervisor', 8006, 60_000) },
    diskTotalGb: 2000,
    diskUsedGb: 900,
    diskUsedPct: 45,
    cpuTempC: 61,
    uptimeMs: 12 * 24 * HOUR,
    propId: 'prop.gpu-blade',
    supply: { kind: 'ac-strip', targetId: 'server-pdu' },
    bootDurationMs: 90_000,
    hasPower: true,
  });
  const vm = (id: string, hostname: string, ip: string, aliases: string[], services: Record<string, ServiceState>, total: number, pct: number, files: Record<string, string> = {}) =>
    createHost(id, 'vm', hostname, ip, {
      osName: VM_OS,
      aliases,
      services: { sshd: svc('sshd', 22, VM_DELAYS.sshd!), ...services },
      diskTotalGb: total,
      diskUsedGb: Math.round(total * pct) / 100,
      diskUsedPct: pct,
      cpuTempC: 55,
      uptimeMs: 12 * 24 * HOUR,
      files,
      supply: { kind: 'none', targetId: 'gpu-blade' },
      bootDurationMs: 45_000,
      hasPower: true,
    });
  hosts['orca-vm'] = vm('orca-vm', 'orca', '10.42.1.10', ['orca.lab.local'], { orca: svc('orca', 8080, VM_DELAYS.orca!), mysql: svc('mysql', 3306, VM_DELAYS.mysql!) }, 100, 41, {
    '/opt/orca/application-prod.yml':
      'spring:\n  datasource:\n    url: jdbc:mysql://localhost:3306/orca\n    username: orca\n  jpa:\n    open-in-view: false\nserver:\n  port: 8080\norca:\n  health-check:\n    interval: 300000\n    timeout: 10000\n',
  });
  hosts['jenkins-vm'] = vm('jenkins-vm', 'jenkins', '10.42.1.11', ['jenkins.lab.local'], { jenkins: svc('jenkins', 8080, VM_DELAYS.jenkins!) }, 250, 58);
  hosts['ollama-vm'] = vm('ollama-vm', 'ollama', '10.42.1.12', ['ollama.lab.local'], { ollama: svc('ollama', 11434, VM_DELAYS.ollama!) }, 500, 33);
  hosts['ws-17'] = createHost('ws-17', 'workstation', 'ws-17', '10.42.50.17', {
    osName: VM_OS,
    services: {},
    diskTotalGb: 512,
    diskUsedGb: 180,
    diskUsedPct: 35,
    uptimeMs: 3 * HOUR,
    propId: 'prop.workstation',
    supply: { kind: 'ac-strip', targetId: 'desk' },
    hasPower: true,
  });
  hosts['switch-lab'] = createHost('switch-lab', 'switch', 'switch-lab', '10.42.0.2', {
    osName: 'Lab core switch',
    supply: { kind: 'ac-strip', targetId: 'it-rack' },
    hasPower: true,
    offscreen: true,
  });
  return hosts;
}

function physicalPiSupply(pi: PiDef): PowerHookup {
  if (pi.octet === 20) return { kind: 'dc-rail', targetId: 'T-5V-BENCH-1' };
  if (pi.octet === 30) return { kind: 'dc-rail', targetId: 'T-5V-BENCH-2' };
  if (pi.octet === 40) return { kind: 'dc-rail', targetId: 'T-5V-B-CAM' };
  return { kind: 'dc-rail', targetId: `MAIN-${pi.robots[0]}` };
}

const PREFIX: Record<string, string> = {
  STATION_2018: 'S18',
  STATION_2: 'S2',
  STATION_DUO: 'SD',
  STATION_DUO_2: 'SD2',
  STATION_DUO_3: 'SD3',
  MINI_2: 'M2',
  MINI_3: 'M3',
  MINI_4: 'M4',
  FLEX_1: 'F1',
  FLEX_2: 'F2',
  FLEX_3: 'F3',
  FLEX_4: 'F4',
  FLEX_POCKET: 'FP',
  COMPACT: 'CP',
};
export function prefixOf(type: string): string {
  return PREFIX[type] ?? 'XX';
}
/** `SIM-<model>-0000<octet>` (Sim §2.4). */
export function serialFor(type: string, octet: number): string {
  return serialOf(type, octet, prefixOf(type));
}
