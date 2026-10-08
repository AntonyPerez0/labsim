/**
 * GP §3.5 INC59–INC65: the cracked 3D-printed cradle, Orca's MySQL, two judgement tickets (AI tools,
 * Orca's platform), the Human Readable Name typo, the ADB-blind Duo CFD and a blank Tap URL.
 */
import type { IncidentBinding, IncidentDef } from '../../types';
import { c, on, p } from '../../types';
import {
  F,
  OP,
  dc,
  deviceIp,
  gw,
  hrn,
  orcaSave,
  piIp,
  reply,
  rig,
  sym,
  teach,
  wm,
} from './helpers';

const FLEX_JOB = 'Java/uia-remote-regression-flex';

export const INC59: IncidentDef = {
  id: 'INC59',
  name: 'Cracked 3D-printed cradle',
  difficulty: 3,
  base: 400,
  parS: 360,
  severity: 'P2',
  rigs: { candidates: ['eve', 'wall-e'], default: 'eve', scope: 'rig', describe: 'touch rigs (default EVE)' },
  escalatable: false,
  unlockedBy: 'M04',
  plannedWork: true,
  tags: ['hw.print3d', 'hw.rigbom', 'orca.status.offline', 'hw.motion'],
  factIds: ['F072', 'F073', 'F093', 'F105', 'F242'],
  processBonuses: ['PB01', 'PB07', 'PB02'],
  ticket: { title: (b) => `${hrn(b)}'s taps drift on the right side of the screen`, reporter: 'morgan' },
  setup: () => ({ scenario: [F('rig.cradleCracked', { rig: '$R' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Camera', 'Taps on the right half land progressively low (unlike a uniform Offsets error).'),
    sym('World', 'A crack is visible on inspection; the device rocks when touched (E).'),
  ],
  diagnosisPath: ['The error grows across the screen ⇒ the device is tilted, not a coordinate problem.', 'Inspect the cradle: cracked.', 'Take the rig Offline, print a new cradle, swap it, re-home, return it.'],
  hints: [
    'Is the miss the same everywhere, or does it grow towards one side?',
    (b) => `Inspect ${hrn(b)}'s black cradle and press on the device (E).`,
    (b) => `${hrn(b)} → Offline → print corner: Prusa or Bambu Lab → cradle_flex_gen3.3mf [illus.] → Print (90 s) → MOTOR off → 4 × 2.5 mm bolts → swap → MOTOR on → Park All → Available → build.`,
  ],
  fix: {
    handsOn: (b) =>
      `${hrn(b)} Offline (PB01) → loc.print-corner: Prusa or Bambu Lab → load cradle_flex_gen3.3mf [illus.] → Print (90 real s; work other tickets meanwhile) → MOTOR off → lift the device → screwdriver: 4 × 2.5 mm bolts → swap the cradle → re-seat → MOTOR on → Park All → Available → build.`,
  },
  success: (b) => c.all(c.eq(p.rig(rig(b)).cradle, 'NEW'), c.truthy(p.rig(rig(b)).homed), c.status(rig(b), 'AVAILABLE'), c.nextBuild({ robots: [rig(b)] })),
  diagnosisCall: dc(
    'Cracked cradle tilts the device',
    ['Offsets', 'Offsets shift every tap by the same amount. These misses grow across the screen.'],
    ['Screen Locations', 'Stale locations break one screen; this drift is on every screen\'s right side.'],
    ['Solenoid loose', 'A loose solenoid never taps at all. These taps land — low.'],
  ),
  wrongButTempting: [
    wm('tape', 'Tape the crack', 50, undefined, teach('The drift persists.', 'The black modular fixtures are 3D-printed on the Prusa and Bambu Lab printers — print a new one. (Ref §1)', 'Print and swap the cradle.')),
    gw('offsets', 'GW18', 'Use Offsets'),
    wm('bolts-5mm', '5 mm bolts', 25, undefined, teach("They don't fit.", 'The rigs use 2.5 mm and 5 mm hardware; the cradle clamps take 2.5 mm. [illus.]', 'Use the 2.5 mm bit.')),
  ],
  teaches: 'Ref §1: black modular fixtures are 3D-printed on Prusa and Bambu Lab printers from simple CAD shapes; 2.5/5 mm hardware. Ref §3: Offline while rebuilding.',
};

export const INC60: IncidentDef = {
  id: 'INC60',
  name: "Orca's MySQL is down",
  difficulty: 4,
  base: 500,
  parS: 240,
  severity: 'P1',
  rigs: { default: null, scope: 'none', describe: 'all' },
  escalatable: false,
  unlockedBy: 'M06',
  tags: ['arch.stack', 'arch.infra', 'tools.terminal', 'arch.flow'],
  factIds: ['F013', 'F014', 'F002', 'F003', 'F004', 'F023', 'F037'],
  ticket: { title: 'Every pipeline fails checkout; Orca shows an error page', reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('orca.mysqlDown')] }),
  reveal: 'immediate',
  symptoms: [
    sym('Orca', '500 Internal Server Error — Could not open JPA EntityManager for transaction; nested exception is org.hibernate.exception.JDBCConnectionException: Unable to acquire JDBC Connection / Communications link failure'),
    sym('Jenkins', 'Every pipeline: [orca] checkout request … → 500'),
    sym('Terminal', 'curl -s -o /dev/null -w "%{http_code}" http://orca.lab.local:8080/management/health → 503 [illus. JHipster health path]'),
    sym('Terminal', 'ssh automation@orca.lab.local → systemctl status mysql → inactive (dead)'),
  ],
  diagnosisPath: ['Orca answers but cannot reach its database.', 'ssh to the Orca VM: MySQL is stopped.', 'Start MySQL; Orca reconnects.'],
  hints: [
    'Orca itself answered with a 500. What is it failing to connect to?',
    'ssh automation@orca.lab.local → systemctl status mysql.',
    'sudo systemctl start mysql → Orca reconnects within 15 s → /management/health 200.',
  ],
  fix: { handsOn: 'sudo systemctl start mysql → Orca reconnects within 15 s → health 200.' },
  success: () =>
    c.all(
      c.eq(p.svc('orca-vm', 'mysql'), 'UP'),
      c.eq(p.orcaHttp, 200),
      c.label(c.verify({ kind: 'event', match: on('robot.checkedOut', {}) }), 'Next checkout OK'),
    ),
  diagnosisCall: dc(
    "Orca's MySQL database is down",
    ['Jenkins misconfigured', 'Orca returns the 500 on its own error page. Read the exception.'],
    ['All Pis down', 'Orca cannot even read its robot table. What does the exception say?'],
    ['GPU blade off', 'Orca and Jenkins answer — they run on the blade.'],
  ),
  wrongButTempting: [gw('restart-vm', 'GW13', 'Restart the Orca VM (works after 45 s but kills running builds)'), gw('reboot-blade', 'GW13', 'Reboot the GPU blade')],
  teaches: 'Ref §1/§3: Orca is an on-premise Spring Boot monolith scaffolded by JHipster and backed by MySQL, running on a lab VM; Docker/GCP are only planned.',
};

const AI_PAIRS = [
  { left: 'Ollama', right: 'Local LLM runner on the 4-GPU blade; proof-of-concept vision checks of receipt layouts and tip math' },
  { left: 'Claude', right: 'Evaluated in corporate AI initiatives for repository optimisation and automated test generation' },
  { left: 'Tesseract', right: 'OCR on cropped webcam screenshots for ADB-blind displays (Duo CFD)' },
] as const;

export const INC61: IncidentDef = {
  id: 'INC61',
  name: '"Which AI tool does what?" (judgement)',
  difficulty: 1,
  base: 150,
  parS: 120,
  severity: 'P3',
  rigs: { default: null, scope: 'none', describe: '—' },
  escalatable: false,
  unlockedBy: 'M17',
  tags: ['tools.claude', 'vision.ollama', 'vision.tesseract'],
  factIds: ['F029', 'F031', 'F032', 'F033'],
  ticket: { title: 'Leadership wants one line per AI/vision tool for the AI-initiative slide', reporter: 'tate' },
  setup: () => ({}),
  reveal: 'immediate',
  symptoms: [],
  diagnosisPath: ['Match each tool to its role, then pick the status line.'],
  hints: [
    'One runs models locally, one was evaluated, one reads text off screenshots.',
    'Ollama → the GPU blade PoC; Claude → evaluated; Tesseract → OCR.',
    'Match all three, then choose "Ollama checks are proof-of-concept, not release gates."',
  ],
  fix: { handsOn: 'Match tool → role, then choose the status line "Ollama checks are proof-of-concept, not release gates."' },
  task: {
    kind: 'match',
    prompt: 'Match each tool to its role in the lab.',
    pairs: AI_PAIRS,
    distractors: ['Runs the Orchestrator backend', 'Drives the Collis probes'],
    statusLine: {
      prompt: 'Status line for the slide',
      options: [
        { id: 'S1', text: 'Ollama checks are proof-of-concept, not release gates.', correct: true },
        { id: 'S2', text: 'Ollama checks gate every release.', correct: false },
        { id: 'S3', text: 'Claude generates all our tests today.', correct: false },
      ],
    },
    wrongPenalty: 30,
  },
  success: () => c.all(...AI_PAIRS.map((x) => c.eq(p.ticket.match(x.left), x.right)), c.eq(p.ticket.match('__status'), 'S1')),
  diagnosisCall: 'none',
  wrongButTempting: [],
  teaches: 'Ref §1 Developer Utilities, Computer Vision & AI.',
};

export const INC62: IncidentDef = {
  id: 'INC62',
  name: '"Where does Orca run?" (judgement)',
  difficulty: 1,
  base: 150,
  parS: 90,
  severity: 'P3',
  rigs: { default: null, scope: 'none', describe: '—' },
  escalatable: false,
  unlockedBy: 'M06',
  tags: ['arch.stack', 'arch.infra', 'arch.roles'],
  factIds: ['F098', 'F037', 'F003', 'F023', 'F022', 'F078'],
  ticket: { title: "Explain Orca's platform to the new hire", reporter: 'alex' },
  setup: () => ({}),
  reveal: 'immediate',
  symptoms: [],
  diagnosisPath: ['Controller vs Executor; the stack; where it runs today; what is only planned.'],
  hints: ['Which one is the Controller?', 'Spring Boot + JHipster + MySQL, on a lab VM on the GPU blade.', 'Reply R1.'],
  fix: { handsOn: 'Reply R1.' },
  replies: {
    wrongPenalty: 50,
    retryAtHalfPoints: true,
    options: [
      reply(
        'R1',
        'Orca is the Controller and Jenkins the Executor. Orca is an on-premise Spring Boot monolith in Java, scaffolded with JHipster (UI, REST endpoints, MySQL schemas), running on a lab VM on the 4-GPU blade; Docker and GCP are planned migration targets.',
        true,
      ),
      reply('R2', 'It runs in Docker on GCP today.', false, { teach: teach('Not yet.', 'Docker and GCP are planned migration targets; Orca runs on an on-premise lab VM today. (Ref §1)', 'Reply R1.') }),
      reply('R3', 'Jenkins is the Controller, Orca the Executor.', false, { teach: teach('Reversed.', 'Orchestrator is the Controller and Jenkins is the Executor. (Ref §3)', 'Reply R1.') }),
      reply('R4', 'Orca is a Go service on the Raspberry Pis.', false, { teach: teach('No.', 'Orca is a Java Spring Boot monolith on a lab VM; the Pis run the Robot Controllers. (Ref §1)', 'Reply R1.') }),
    ],
  },
  success: () => c.eq(p.ticket.reply, 'R1'),
  diagnosisCall: 'none',
  wrongButTempting: [],
  teaches: 'Ref §1, §2, §3 (Cur M17 roadmap: on-prem VM = today; Docker/GCP = planned).',
};

/** A plausible typo of a Human Readable Name (JOHNNY-5 → JONNY-5, Cur M07 seed). */
function hrnTypo(name: string): string {
  if (name === 'JOHNNY-5') return 'JONNY-5';
  const i = name.length > 2 ? 1 : 0;
  return name.slice(0, i) + name.charAt(i + 1) + name.charAt(i) + name.slice(i + 2);
}

export const INC63: IncidentDef = {
  id: 'INC63',
  name: 'Tablet shows the wrong name (Human Readable Name typo)',
  difficulty: 1,
  base: 150,
  parS: 120,
  severity: 'P3',
  rigs: { candidates: ['johnny-5', 'wall-e', 'eve', 'bumblebee', 'baymax', 'seti'], default: 'johnny-5', scope: 'rig', describe: 'any touch rig (default JOHNNY-5)' },
  escalatable: false,
  unlockedBy: 'M07',
  tags: ['orca.names', 'hw.tablet'],
  factIds: ['F117', 'F118'],
  ticket: { title: (b) => `${hrn(b)}'s tablet says ${hrnTypo(hrn(b))} — can someone fix the robot's name?`, reporter: 'riley' },
  setup: (b: IncidentBinding) => ({ scenario: [F('orca.hrnTypo', { robot: '$R', hrn: hrnTypo(hrn(b)) })] }),
  reveal: 'immediate',
  symptoms: [
    sym('Tablet', (b) => `Header ${hrnTypo(hrn(b))}`),
    sym('Orca', (b) => `Name ${rig(b)}, Human Readable Name ${hrnTypo(hrn(b))}`),
  ],
  diagnosisPath: ['The tablet shows the Human Readable Name.', 'Fix that field — not the Name.'],
  hints: ['Which Orca field is pushed to the tablet?', (b) => `Orca → ${hrn(b)} → Human Readable Name.`, (b) => `Human Readable Name → ${hrn(b)}; leave Name (${rig(b)}) alone; check the tablet.`],
  fix: { handsOn: (b) => `Edit Human Readable Name → ${hrn(b)}; leave Name alone; check the tablet.` },
  success: (b) =>
    c.all(
      c.eq(p.robot(rig(b)).hrn, hrn(b)),
      c.eq(p.robot(rig(b)).name, rig(b)),
      c.label(c.happened(orcaSave('robot', { fields: ['humanReadableName'] })), 'Human Readable Name saved'),
    ),
  diagnosisCall: dc(
    'Human Readable Name typo (pushed to the tablet)',
    ['Name typo', 'The Name is the system identifier pipelines use — and it is spelled right. Which field feeds the tablet?'],
    ['Tablet firmware', 'The tablet shows exactly what Orca pushes. Check Orca.'],
    ['Device row wrong', 'The Device row describes the hardware, not the display name.'],
  ),
  wrongButTempting: [gw('edit-name', 'GW22', 'Edit the robot Name')],
  teaches: 'Ref §3 Name & Human Readable Name: the system identifier vs the display string pushed to the status tablet.',
};

export const INC64: IncidentDef = {
  id: 'INC64',
  name: '"Write me an ADB tap for the Duo\'s customer screen" (ADB-blind display)',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P3',
  rigs: { roles: ['duo'], default: 'r2-d2', scope: 'rig', describe: '`duo` (R2-D2)' },
  escalatable: false,
  unlockedBy: 'M16',
  tags: ['bots.types', 'uia.v23', 'orca.xytouch', 'adb.usage'],
  factIds: ['F151', 'F152', 'F221', 'F007', 'F143', 'F144'],
  ticket: { title: (b) => `Need an adb shell input tap for 'Done' on ${hrn(b)}'s CFD receipt screen`, reporter: 'riley' },
  setup: () => ({ scenario: [OP('device.stage', { device: '$DEV', stage: 'receipt-done' })] }),
  reveal: 'immediate',
  symptoms: [
    sym('Terminal', (b) => `adb -s ${deviceIp(b)}:5444 shell uiautomator dump → the dump only contains MFD elements (grep -c "Done" window_dump.xml → 0)`),
    sym('World', (b) => `${hrn(b)}'s CFD shows a receipt prompt with "Done".`),
  ],
  diagnosisPath: ['ADB only sees the MFD on a Station Duo.', 'Tap the CFD physically through Orca\'s xy_touch.', 'Reply with the right approach.'],
  hints: [
    'Is "Done" anywhere in the UI dump?',
    'Orca has a screen CFD_RECEIPT_DONE for STATION_DUO — call xy_touch on the touch robot.',
    (b) => `curl -X POST http://orca.lab.local:8080/api/xy_touch -H "Content-Type: application/json" -d '{"robot":"${rig(b)}","screen":"CFD_RECEIPT_DONE","button":"Done"}' → "mode":"PHYSICAL_TAP"; reply R_DUO_BLIND.`,
  ],
  fix: {
    handsOn: (b) =>
      `curl -X POST http://orca.lab.local:8080/api/xy_touch -H "Content-Type: application/json" -d '{"robot":"${rig(b)}","screen":"CFD_RECEIPT_DONE","button":"Done"}' → "mode":"PHYSICAL_TAP"; reply R_DUO_BLIND.`,
  },
  replies: {
    wrongPenalty: 100,
    to: 'riley',
    options: [
      reply('R_DUO_BLIND', "ADB can't see the Duo's CFD. Tap it physically through Orca's xy_touch on R2-D2, or use a UIA 2.3 dual-screen locator in the test.", true),
      reply('R_ADB_TAP', 'Use adb shell input tap with the CFD coordinates.', false, { teach: teach('That taps the MFD.', 'On the Station Duo only the primary MFD is exposed to ADB. (Ref §3)', 'Use a physical tap via xy_touch, or a UIA 2.3 dual-screen locator.') }),
    ],
  },
  success: (b) =>
    c.all(
      c.label(c.happened(on('orca.xyTouch', { robotName: rig(b), screen: 'CFD_RECEIPT_DONE', button: 'Done', ok: true }, (pl) => pl.mode === 'probe' || pl.orcaMode === 'PHYSICAL_TAP')), 'Physical tap on the CFD'),
      c.eq(p.ticket.reply, 'R_DUO_BLIND'),
    ),
  diagnosisCall: dc(
    'The Duo CFD is blind to ADB; use a physical tap or UIA 2.3',
    ['Wrong port', 'ADB connected and dumped the UI — of the MFD only.'],
    ['Device asleep', 'The CFD is showing the prompt. Is it in the dump?'],
    ['Wrong IP', 'MFD and CFD share one IP on a Duo. The dump lacks the CFD.'],
  ),
  wrongButTempting: [
    wm('adb-tap', 'adb … input tap <x> <y> with CFD coordinates', 100, on('adb.command', {}, (pl) => /input\s+tap/.test(pl.command) && /10\.42\.30\.14/.test(pl.target ?? '')), teach('It tapped the MFD instead.', 'On the Station Duo only the MFD is exposed to ADB; physical bots are required for ADB-blind displays. (Ref §3, §6)', "Use Orca's xy_touch on the touch robot.")),
  ],
  teaches: 'Ref §3: the dual-screen problem (only the MFD is exposed to ADB). Ref §6: physical bots for ADB-blind displays. UI Automator 2.3 dual-screen tracking.',
};

export const INC65: IncidentDef = {
  id: 'INC65',
  name: 'Tap tests fail: blank Tap URL',
  difficulty: 1,
  base: 200,
  parS: 120,
  severity: 'P1',
  rigs: { candidates: ['johnny-5', 'wall-e', 'eve'], default: 'johnny-5', scope: 'rig', describe: 'touch + collis rigs (default JOHNNY-5)' },
  escalatable: false,
  unlockedBy: 'M07',
  tags: ['orca.urls', 'cards.diptap'],
  factIds: ['F125', 'F123', 'F071'],
  ticket: { title: (b) => `${hrn(b)} contactless taps fail instantly`, reporter: 'jenkins-bot' },
  setup: () => ({
    scenario: [
      F('orca.urlWrong', { robot: '$R', field: 'tap', value: '' }),
      OP('jenkins.startBuild', { job: FLEX_JOB, params: { ROBOT_NAME: '$R', DEVICE_TYPE: '$T', CARD_PROFILE: 'VISA_STD_TAP' } }),
    ],
  }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', (b) => `POST /api/card/tap {"robot":"${rig(b)}","profile":"VISA_STD_TAP"} → [orca] 400 Bad Request: robot ${rig(b)} has no Tap URL [illus.]`),
    sym('Orca', (b) => `URL Mappings: ADB http://${piIp(b)}:8000/adb, Dip …/dip, Swipe …/swipe, Tap (blank)`),
  ],
  diagnosisPath: ['Orca refused the tap before any hardware moved.', 'URL Mappings: the Tap URL is blank.', 'Fill it in the same pattern as the others.'],
  hints: [
    'Orca answered 400 — it had nowhere to send the tap.',
    (b) => `Orca → ${hrn(b)} → URL Mappings.`,
    (b) => `Tap URL = http://${piIp(b)}:8000/tap → tablet Tap In/Out to verify → rebuild.`,
  ],
  fix: { handsOn: (b) => `Tap URL = http://${piIp(b)}:8000/tap → tablet Tap → In/Out to verify → rebuild.` },
  success: (b) => c.all(c.eq(p.robot(rig(b)).url('tap'), `http://${piIp(b)}:8000/tap`), c.nextBuild({ robots: [rig(b)], params: { CARD_PROFILE: 'VISA_STD_TAP' } })),
  diagnosisCall: dc(
    "The rig's Tap URL mapping is missing",
    ['Collis offline', 'Orca refused with a 400 before the probe was involved.'],
    ['VISA_STD_TAP path wrong', 'A wrong path fails in Callus with FileNotFoundException. This failed in Orca.'],
    ['Pi crashed', 'Dip and swipe work on the same Pi.'],
  ),
  wrongButTempting: [
    wm('tap-to-callus', 'Point Tap at the Callus box', 50, orcaSave('robot', { fields: ['tapUrl'], test: (pl, s) => /10\.42\.20\./.test(s.lab.orca.robots[pl.id as number]?.tapUrl ?? '') }), teach('Wrong host.', 'URL Mappings store hardware-specific Dip, Tap and Swipe URLs that route to the rig\'s Pi. (Ref §3)', 'Use the Pi\'s /tap endpoint.')),
    wm('edit-profile', 'Edit the card profile', 50, orcaSave('cardProfile'), teach('The profile was fine.', 'Orca had no Tap URL to call. (Ref §3)', 'Fill the Tap URL.')),
  ],
  teaches: 'Ref §3 URL Mappings: hardware-specific Dip, Tap and Swipe URLs per robot.',
};
