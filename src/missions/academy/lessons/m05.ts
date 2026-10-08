/**
 * M05 — The Robot Pi: Raspberry Pi, Linux & Wine (Cur §2 M05). Mentor {{jared}}, cameo {{morgan}}.
 * Setup (`academy:M05`): WALL-E's Pi `10.42.10.11` healthy; NUC-03 on the Callus shelf carries the
 * corporate sticky note; Terminal unlocked. Sim: `terminal.exec` (Apps §5.4, Sim §2.5 / §3.14.1 / §3.3.3).
 */
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { ran, say } from './helpers';

const PI = ['pi-wall-e', 'wall-e'] as const;

export const M05: LessonDef = {
  moduleId: 'M05',
  mentor: 'jared',
  setup: { preset: 'academy:M05', spawn: 'loc.rack-a', apps: { unlock: ['terminal', 'chat'] } },
  deck: 'deck.M05',
  manualChapters: ['Hardware'],
  realLabChecklist: [
    'Every shelf has a ~$50 Raspberry Pi as its Robot Controller: it routes ADB, serves the camera stream, drives the steppers and solenoid, and runs the card-programming software under Wine.',
    'The Pis run Linux to keep hardware control loops away from the corporate Windows machines.',
    'Hardware control moved off the Intel NUCs because corporate security-monitoring packages filled their disks. Never touch that agent.',
    'Health-check a Pi yourself: ssh in, check the controller service, the disk and Wine, then curl its health endpoint for a 200.',
  ],
  steps: [
    {
      id: 'M05.01',
      kind: 'inspect',
      hud: "Find WALL-E's Raspberry Pi",
      prop: 'prop.walle.pi',
      callouts: ['Robot Pi / Robot Controller · ~$50'],
      manualEntryIds: ['robot-pi'],
      factIds: ['F063', 'F064'],
    },
    {
      id: 'M05.02',
      kind: 'dialogue',
      speaker: 'jared',
      text: "This fifty-dollar Raspberry Pi is WALL-E's brain, the Robot Controller. One per shelf. It routes ADB, serves the camera stream, drives the steppers and the solenoid, and runs the card-programming software under Wine.",
      factIds: ['F063', 'F064', 'F065', 'F021'],
    },
    { id: 'M05.03', kind: 'walk-to', hud: 'Walk to the Callus shelf', location: 'loc.callus-shelf' },
    {
      id: 'M05.04',
      kind: 'inspect',
      hud: 'Read the note on the Intel NUC',
      prop: 'prop.nuc-03',
      callouts: ['DISK 100% — corporate AGENT. NO HARDWARE CONTROL ON THIS BOX. –J'],
      manualEntryIds: ['nuc-minix-history'],
      factIds: ['F066', 'F067'],
    },
    {
      id: 'M05.05',
      kind: 'dialogue',
      speaker: 'jared',
      text: "We used to drive hardware from Windows boxes: Intel NUCs and Minix boxes. Then corporate's security-monitoring packages ate every byte of disk on the NUCs. So hardware control moved onto Raspberry Pis running Linux, isolated from the corporate Windows machines.",
      factIds: ['F066', 'F067', 'F068', 'F019', 'F020'],
    },
    {
      id: 'M05.06',
      kind: 'wait-for-condition',
      hud: 'Sit at your workstation',
      marker: { kind: 'location', id: 'loc.workstation' },
      success: c.any(c.happened(on('player.seated', { seated: true })), c.eq(p.overlay, 'computer')),
      xp: 10,
    },
    {
      id: 'M05.07',
      kind: 'computer-task',
      hud: "SSH into WALL-E's Pi",
      app: 'terminal',
      success: c.any(c.happened(on('ssh.connected', { hostId: 'pi-wall-e' })), ran(/^ssh pi@10\.42\.10\.11$/, { ok: true })),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: "WALL-E's Pi is 10.42.10.11 and the user is pi." },
        { afterS: 120, idle: true, effect: 'text', text: 'Type: ssh pi@10.42.10.11' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'ssh pi@10.42.10.11', caption: 'The prompt becomes pi@wall-e:~ $' }],
      factIds: ['F019'],
    },
    {
      id: 'M05.08',
      kind: 'computer-task',
      hud: "Prove it's Linux and the controller is running",
      app: 'terminal',
      success: c.all(ran(/^uname -a$/, { hosts: PI }), ran(/^(sudo )?systemctl status robot-controller(\.service)?$/, { hosts: PI })),
      objectives: [
        { id: 'M05.08.uname', text: 'uname -a  → Linux wall-e …', done: ran(/^uname -a$/, { hosts: PI }) },
        { id: 'M05.08.svc', text: 'systemctl status robot-controller  → active (running)', done: ran(/^(sudo )?systemctl status robot-controller(\.service)?$/, { hosts: PI }) },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'Stay in the SSH session on the Pi.' },
        { afterS: 120, idle: true, effect: 'text', text: 'uname -a, then systemctl status robot-controller' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'systemctl status robot-controller' }],
      factIds: ['F019', 'F064'],
    },
    {
      id: 'M05.09',
      kind: 'computer-task',
      hud: "Check the Pi's disk",
      app: 'terminal',
      success: ran(/^df -h( \/)?$/, { hosts: PI }),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'df shows disk usage; -h makes it human readable.' },
        { afterS: 120, idle: true, effect: 'text', text: 'df -h /' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'df -h /' }],
      onComplete: [say('jared', 'Twenty-two percent used. Nothing like the NUCs. No corporate agent eating the disk here.')],
      factIds: ['F067', 'F068'],
    },
    {
      id: 'M05.10',
      kind: 'computer-task',
      hud: 'Find the Windows card-programming software',
      app: 'terminal',
      success: ran(/^ps (aux|-ef)( )?\|( )?grep (-i )?wine$/i, { hosts: PI }),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'List the running processes and filter for wine.' },
        { afterS: 120, idle: true, effect: 'text', text: 'ps aux | grep -i wine' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'ps aux | grep -i wine' }],
      onComplete: [say('morgan', 'Wine is the compatibility layer that lets a Linux Pi run Windows-only card-programming software.')],
      factIds: ['F021', 'F065'],
    },
    {
      id: 'M05.11',
      kind: 'computer-task',
      hud: "Hit the Robot Controller's health endpoint",
      app: 'terminal',
      success: ran(/^curl (-i |-s |-v )*(-i )?http:\/\/(10\.42\.10\.11|localhost|127\.0\.0\.1):8000\/health$/, { ok: true }),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'The controller listens on port 8000 and exposes /health. -i shows the status line.' },
        { afterS: 120, idle: true, effect: 'text', text: 'curl -i http://10.42.10.11:8000/health' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'curl -i http://10.42.10.11:8000/health', caption: 'HTTP/1.1 200 OK' }],
      factIds: ['F099', 'F107'],
    },
    {
      id: 'M05.12',
      kind: 'dialogue',
      speaker: 'jared',
      text: 'That 200 is exactly what Orca checks every five minutes. Anything else and the robot goes Connection Failed. {{tate}} will show you.',
      factIds: ['F099', 'F107'],
    },
    { id: 'M05.13', kind: 'quiz-checkpoint', checkpointId: 'CP-M05.1', title: 'Robot Pi', questionIds: ['Q063', 'Q065', 'Q067', 'Q069', 'Q071'] },
  ],
};
