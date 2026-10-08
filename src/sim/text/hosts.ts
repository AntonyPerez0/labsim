/** Exact host/service strings (Sim §3.14, §4.3.11). */
import type { Host, LabState } from '../types';
import { fmtJournal } from './time';

/** Fixed PIDs per service [illus.] (Sim §4.3.11). */
export const SERVICE_PIDS: Record<string, number> = { 'robot-controller': 812, 'camera-stream': 640, 'adb-service': 701, cardprog: 903 };

/** systemd unit descriptions (`systemctl status`, `Stopped <desc>.`). */
export const UNIT_DESCRIPTIONS: Record<string, string> = {
  'robot-controller': 'LabSim Robot Controller (REST :8000)',
  'camera-stream': 'MJPEG camera stream (:8081)',
  'adb-service': 'ADB bridge for LabSim devices',
  cardprog: 'Wine card programmer (CardProgrammer.exe)',
  sshd: 'OpenBSD Secure Shell server',
  mysql: 'MySQL Community Server',
  orca: 'Orca (Spring Boot)',
  jenkins: 'Jenkins Continuous Integration Server',
  ollama: 'Ollama Service',
  callus: 'Callus',
  'corporate-agent': 'corporate Security Agent',
  motion: 'Motion (legacy NUC motor control :9100)',
  hypervisor: 'Proxmox VE hypervisor',
};

/** Cause line written when a service crashes (Sim §4.3.11), without the timestamp prefix. */
export const CRASH_CAUSE: Record<string, string> = {
  'robot-controller': 'python3[812]: robot_controller: fatal: watchdog timeout in motion loop',
  'camera-stream': 'camera-stream[640]: VIDIOC_DQBUF: No such device',
  'adb-service': "adb-service[701]: adb server version (41) doesn't match this client (39); killing...",
  cardprog: 'cardprog[903]: CardProgrammer.exe: unhandled exception c0000005 (access violation)',
};
export const NO_VIDEO0 = "camera-stream[640]: Cannot open '/dev/video0': No such file or directory";
export const WINE_BROKEN = 'cardprog[903]: wine: could not load kernel32.dll, status c0000135';

/** `Oct 05 08:11:42 <h> <rest>` journal line. */
export function journalLine(lab: LabState, host: Host, rest: string): string {
  return `${fmtJournal(lab.time, lab.time.nowMs)} ${host.hostname} ${rest}`;
}

/** The cause line + the two systemd failure lines (Sim §4.3.11). */
export function crashLines(lab: LabState, host: Host, service: string, cause: string): string[] {
  return [
    journalLine(lab, host, cause),
    journalLine(lab, host, `systemd[1]: ${service}.service: Main process exited, code=exited, status=1/FAILURE`),
    journalLine(lab, host, `systemd[1]: ${service}.service: Failed with result 'exit-code'.`),
  ];
}

/** `Stopped <unit description>.` (a stop is not a crash). */
export function stoppedLine(lab: LabState, host: Host, service: string): string {
  return journalLine(lab, host, `systemd[1]: Stopped ${UNIT_DESCRIPTIONS[service] ?? service}.`);
}

export function startedLine(lab: LabState, host: Host, service: string): string {
  return journalLine(lab, host, `systemd[1]: Started ${UNIT_DESCRIPTIONS[service] ?? service}.`);
}
