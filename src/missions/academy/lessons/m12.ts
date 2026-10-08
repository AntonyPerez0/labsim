/**
 * M12 — ADB on Port 5444 (Cur §2 M12). Mentor {{morgan}}.
 * Setup (`academy:M12` = factory): TARS (FLEX_4, `10.42.30.32`) on HomeScreen; Terminal has `adb`
 * (Sim §3.15.1: `adb connect` without a port defaults to 5555 → refused by lab devices).
 */
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { ran } from './helpers';

const T = '10.42.30.32:5444';
const tarsCmd = (re: RegExp) => ran(new RegExp(`^adb -s 10\\.42\\.30\\.32:5444 ${re.source}$`));

export const M12: LessonDef = {
  moduleId: 'M12',
  mentor: 'morgan',
  setup: { preset: 'academy:M12', spawn: 'loc.workstation', apps: { unlock: ['terminal', 'camera', 'chat'] } },
  deck: 'deck.M12',
  manualChapters: ['Tools'],
  realLabChecklist: [
    'Lab devices listen for ADB on port 5444: always connect with the port, e.g. adb connect 10.42.30.32:5444.',
    'Read a screen without touching it: uiautomator dump, pull the XML, grep for the element and its bounds.',
    'The centre of bounds [x1,y1][x2,y2] is ((x1+x2)/2, (y1+y2)/2): that is what you pass to input tap.',
    'Port 5555 is the ADB default. In the lab it is refused, and in the office it reaches coworkers\' desk devices.',
  ],
  steps: [
    {
      id: 'M12.01',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "ADB, the Android Debug Bridge, is the command-line tool we use to talk to a LabSim without touching it. Read the screen's XML hierarchy, find elements, send taps.",
      factIds: ['F024', 'F025'],
    },
    {
      id: 'M12.02',
      kind: 'computer-task',
      hud: 'Connect to TARS',
      app: 'terminal',
      success: c.happened(on('adb.connected', { target: T })),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'TARS is 10.42.30.32. Lab devices use ADB port 5444.' },
        { afterS: 120, idle: true, effect: 'text', text: 'adb connect 10.42.30.32:5444' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'adb connect 10.42.30.32:5444' }],
      factIds: ['F026'],
    },
    {
      id: 'M12.03',
      kind: 'computer-task',
      hud: 'List devices',
      app: 'terminal',
      success: c.all(ran(/^adb devices( -l)?$/), c.contains(p.adbConnections, T)),
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'adb devices' }],
      factIds: ['F024'],
    },
    {
      id: 'M12.04',
      kind: 'computer-task',
      hud: 'Dump the UI hierarchy',
      app: 'terminal',
      success: c.any(c.happened(on('adb.command', { target: T }, (pl) => pl.ok && pl.command.includes('uiautomator dump'))), tarsCmd(/shell uiautomator dump( \/sdcard\/window_dump\.xml)?/)),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'With -s you pick the device; shell runs a command on it.' },
        { afterS: 120, idle: true, effect: 'text', text: 'adb -s 10.42.30.32:5444 shell uiautomator dump' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'adb -s 10.42.30.32:5444 shell uiautomator dump' }],
      factIds: ['F024'],
    },
    {
      id: 'M12.05',
      kind: 'computer-task',
      hud: 'Pull it and find the Register icon',
      app: 'terminal',
      success: c.all(
        c.any(c.happened(on('adb.command', { target: T }, (pl) => pl.ok && pl.command.includes('pull'))), tarsCmd(/pull \/sdcard\/window_dump\.xml( \S+)?/)),
        ran(/^grep .*Register.* window_dump\.xml$/),
      ),
      objectives: [
        { id: 'M12.05.pull', text: 'adb -s 10.42.30.32:5444 pull /sdcard/window_dump.xml', done: c.any(c.happened(on('adb.command', { target: T }, (pl) => pl.ok && pl.command.includes('pull'))), tarsCmd(/pull \/sdcard\/window_dump\.xml( \S+)?/)) },
        { id: 'M12.05.grep', text: "grep -o 'text=\"Register\"[^>]*' window_dump.xml", done: ran(/^grep .*Register.* window_dump\.xml$/) },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: "grep -o 'text=\"Register\"[^>]*' window_dump.xml" }],
      factIds: ['F024'],
    },
    {
      id: 'M12.05a',
      kind: 'dialogue',
      speaker: 'morgan',
      text: 'The Register icon has bounds="[96,412][288,604]". Where do you tap: what is its centre point?',
      choices: [
        { id: 'centre', text: '192 508', correct: true, response: [{ speaker: 'morgan', text: 'Right: (96+288)/2 and (412+604)/2. Centre of the box.' }] },
        { id: 'top-left', text: '96 412', correct: false, response: [{ speaker: 'morgan', text: "That's the top-left corner. Average the two corners: x1 plus x2 over two, y1 plus y2 over two." }] },
        { id: 'bottom-right', text: '288 604', correct: false, response: [{ speaker: 'morgan', text: "That's the bottom-right corner. Average the two corners." }] },
        { id: 'size', text: '192 192', correct: false, response: [{ speaker: 'morgan', text: "That's the width and height of the box, not a position." }] },
      ],
      factIds: ['F024', 'F025'],
    },
    {
      id: 'M12.06',
      kind: 'computer-task',
      hud: 'Tap it',
      app: 'terminal',
      success: c.any(
        c.happened(on('device.touched', { deviceId: 'dev-tars-flex4', source: 'adb', hitButton: 'Register' })),
        c.eq(p.hwDevice('dev-tars-flex4').screen, 'register'),
      ),
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'adb -s 10.42.30.32:5444 shell input tap 192 508' }],
      factIds: ['F025'],
    },
    {
      id: 'M12.07',
      kind: 'dialogue',
      speaker: 'morgan',
      text: 'Notice the port. Our lab runs ADB on 5444. Out of the box, ADB uses 5555. Try leaving the port off and see what happens.',
      factIds: ['F026', 'F199'],
    },
    {
      id: 'M12.08',
      kind: 'computer-task',
      hud: 'Connect to TARS again, without a port',
      app: 'terminal',
      success: ran(/^adb connect 10\.42\.30\.32(:5555)?$/),
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'adb connect 10.42.30.32', caption: "failed to connect to '10.42.30.32:5555': Connection refused" }],
      factIds: ['F199', 'F026'],
    },
    {
      id: 'M12.09',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "Lab devices only listen on 5444. Remember that, because 5555 has a story, and you're about to live it.",
      factIds: ['F026', 'F200'],
    },
    { id: 'M12.10', kind: 'quiz-checkpoint', checkpointId: 'CP-M12.1', title: 'ADB', questionIds: ['Q225', 'Q226', 'Q227', 'Q228', 'Q231'] },
  ],
};
