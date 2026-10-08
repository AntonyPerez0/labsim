/**
 * M09 — Screens, Screen Locations & xy_touch (ADB Bots vs Physical Bots) (Cur §2 M09). Mentor {{jared}}.
 * Setup (`academy:M09`, Sim §4.4.2): EVE (FLEX_4) has the "scan for receipt" QR feature: 5 receipt
 * options, every button 3.0 mm lower; Orca has no FLEX_4 `RECEIPT_OPTIONS_5` map and gort's file for it
 * was removed. During the lesson (step 9) the runner starts `Java/pigeon-android-tip-sale` on EVE: the
 * literal `RECEIPT_OPTIONS_4` taps Print at 71.0 on a screen whose Print is at 74.0 → miss (camera clip).
 */
import { c, on, p } from '../../types';
import type { Condition, LessonDef } from '../../types';
import { JOB, inject, queued, say } from './helpers';

/** FLEX_4 (`FLEX_GEN3`) firmware truth, Sim §2.10.2 = Cur §0.6. */
const RECEIPT_5: readonly { button: string; x: number; y: number }[] = [
  { button: 'Print', x: 34.0, y: 74.0 },
  { button: 'Email', x: 34.0, y: 86.0 },
  { button: 'Text', x: 34.0, y: 98.0 },
  { button: 'No Receipt', x: 34.0, y: 110.0 },
  { button: 'Scan for receipt', x: 34.0, y: 122.0 },
];
const RECEIPT_4: readonly { button: string; x: number; y: number }[] = [
  { button: 'Print', x: 34.0, y: 71.0 },
  { button: 'Email', x: 34.0, y: 83.0 },
  { button: 'Text', x: 34.0, y: 95.0 },
  { button: 'No Receipt', x: 34.0, y: 107.0 },
];

const map5Ok: Condition = c.forAll(RECEIPT_5, (b) =>
  c.all(c.approx(p.screenLocation('FLEX_4', 'RECEIPT_OPTIONS_5', b.button).x, b.x, 0.5), c.approx(p.screenLocation('FLEX_4', 'RECEIPT_OPTIONS_5', b.button).y, b.y, 0.5)),
);
const map4Kept: Condition = c.forAll(RECEIPT_4, (b) =>
  c.all(c.approx(p.screenLocation('FLEX_4', 'RECEIPT_OPTIONS_4', b.button).x, b.x, 0.05), c.approx(p.screenLocation('FLEX_4', 'RECEIPT_OPTIONS_4', b.button).y, b.y, 0.05)),
);

/** Ruler readings (world `ruler.measured { deviceId, button, xMm, yMm }`) of every 5-option button on EVE, ±0.5 mm. */
const measuredAll: Condition = c.custom('m09-ruler', 'All five buttons measured on EVE', (_s, ctx) => {
  const got = new Set<string>();
  for (const e of ctx.events) {
    if (e.type !== 'app.action') continue;
    const pl = e.payload as { app?: string; action?: string; data?: { deviceId?: string; button?: string; xMm?: number; yMm?: number } };
    if (pl.app !== 'world' || pl.action !== 'ruler.measured' || !pl.data) continue;
    const d = pl.data;
    if (d.deviceId && !/eve/.test(d.deviceId)) continue;
    const truth = RECEIPT_5.find((b) => b.button === d.button);
    if (truth && typeof d.yMm === 'number' && Math.abs(d.yMm - truth.y) <= 0.5) got.add(truth.button);
  }
  return got.size >= RECEIPT_5.length;
});

export const M09: LessonDef = {
  moduleId: 'M09',
  mentor: 'jared',
  setup: { preset: 'academy:M09', spawn: 'loc.workstation', apps: { unlock: ['orca', 'terminal', 'jenkins', 'camera', 'github', 'chat'] } },
  deck: 'deck.M09',
  realLabChecklist: [
    'Robots never see buttons: Screens are the layouts of a transaction flow per device architecture, Screen Locations store each button\'s X/Y in mm from (0,0).',
    'Tests call Orca\'s xy_touch with a screen name and a button string; Orca looks up the mm coordinates and the Pi fires an ADB touch (ADB bot) or a physical probe tap (touch robot).',
    'ADB bots cannot touch a screen or type a PIN: they only get merchants that bypass PIN security. Canadian PIN entry and ADB-blind displays need physical bots.',
    'When a firmware change moves buttons, measure the new positions, add a separate map (e.g. RECEIPT_OPTIONS_5) without touching the old one, and land the coordinate PR.',
  ],
  steps: [
    {
      id: 'M09.01',
      kind: 'dialogue',
      speaker: 'jared',
      text: "Robots don't see buttons. They know where buttons are, in millimetres, because Orca tells them. Screens are the layouts in a transaction flow for each device architecture. Screen Locations are the button positions, X and Y in millimetres from the zero-zero my limit switches give us.",
      factIds: ['F141', 'F142', 'F082'],
    },
    {
      id: 'M09.02',
      kind: 'computer-task',
      hud: 'Open Screens → FLEX_3 → TENDER_CASH_DISCOUNT',
      app: 'orca',
      route: '/screen?deviceType.equals=FLEX_3',
      success: c.appAction('orca', 'orca.screenLocations.viewed', (d) => d.deviceType === 'FLEX_3' && d.screen === 'TENDER_CASH_DISCOUNT'),
      showMe: [{ app: 'orca', route: '/screen?deviceType.equals=FLEX_3', target: 'orca.screens.row:TENDER_CASH_DISCOUNT', action: 'click', caption: 'Cash X 22.0 Y 58.5 · Card X 62.0 Y 58.5' }],
      factIds: ['F141', 'F142'],
    },
    {
      id: 'M09.03',
      kind: 'computer-task',
      hud: 'Tap Cash on WALL-E through Orca',
      app: 'terminal',
      success: c.happened(on('orca.xyTouch', { robotName: 'wall-e', mode: 'probe', ok: true })),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'POST to Orca\'s /api/xy_touch with a robot, a screen name and a button string.' },
        {
          afterS: 120,
          idle: true,
          effect: 'text',
          text: 'curl -X POST http://orca.lab.local:8080/api/xy_touch -H "Content-Type: application/json" -d \'{"robot":"wall-e","screen":"TENDER_CASH_DISCOUNT","button":"Cash"}\'',
        },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'curl -X POST http://orca.lab.local:8080/api/xy_touch -H "Content-Type: application/json" -d \'{"robot":"wall-e","screen":"TENDER_CASH_DISCOUNT","button":"Cash"}\'' }],
      onComplete: [say('jared', '"mode": "PHYSICAL_TAP". The gantry drove to 22, 58.5 and the solenoid dropped. Real metal on real glass.')],
      factIds: ['F143', 'F144', 'F096'],
    },
    {
      id: 'M09.04',
      kind: 'computer-task',
      hud: 'Same call, but robot TARS',
      app: 'terminal',
      success: c.happened(on('orca.xyTouch', { robotName: 'tars', mode: 'adb' })),
      hints: [{ afterS: 90, idle: true, effect: 'text', text: 'Press ↑ to recall the last command and change "wall-e" to "tars".' }],
      factIds: ['F144', 'F217'],
    },
    {
      id: 'M09.05',
      kind: 'dialogue',
      speaker: 'jared',
      text: "Same endpoint, two outcomes. TARS is an ADB bot, purely programmatic. It can't physically touch a screen or type a PIN, so ADB bots only get merchant configs that bypass PIN security. Touch robots have mechanical probes.",
      factIds: ['F217', 'F218', 'F219'],
    },
    {
      id: 'M09.06',
      kind: 'computer-task',
      hud: 'A Canadian Interac test needs PIN entry. Pick the robot.',
      app: 'jenkins',
      route: '/job/Java/job/contact-canada-pin-sale/build',
      success: c.happened(queued(JOB.canadaPin, { ROBOT_NAME: 'seti' })),
      wrongActions: [
        {
          id: 'adb-bot',
          on: on('jenkins.buildQueued', { jobId: JOB.canadaPin }, (pl) => pl.params.ROBOT_NAME === 'tars' || pl.params.ROBOT_NAME === 'data'),
          say: 'Read the console: PIN entry requires physical touch. TARS and DATA are ADB bots.',
        },
        {
          id: 'wrong-device',
          on: on('jenkins.buildQueued', { jobId: JOB.canadaPin }, (pl) => pl.params.ROBOT_NAME === 'wall-e'),
          say: 'Capability mismatch: WALL-E is a Flex 3. The Canadian flow needs the Compact, and the Compact in this room is on SETI.',
        },
      ],
      factIds: ['F220', 'F061', 'F217'],
    },
    { id: 'M09.06a', kind: 'walk-to', hud: 'Go to Touch Rack B', location: 'loc.rack-b' },
    {
      id: 'M09.07',
      kind: 'inspect',
      hud: 'Watch SETI enter the PIN',
      prop: 'prop.seti.device',
      dwellS: 2,
      callouts: ['PIN_ENTRY · 4 physical taps + Enter'],
      factIds: ['F220', 'F219'],
    },
    {
      id: 'M09.08',
      kind: 'dialogue',
      speaker: 'jared',
      text: "Canada mandates physical PIN entry, and some displays are blind to ADB. Those two cases are why physical bots exist. Now, a war story: the day we added a 'scan for receipt' QR code.",
      factIds: ['F220', 'F221', 'F213'],
    },
    {
      id: 'M09.09',
      kind: 'computer-task',
      hud: "EVE's receipt test is failing. Watch the stream.",
      app: 'camera',
      route: '/recordings',
      onEnter: [inject({ op: 'jenkins.startBuild', params: { job: JOB.pigeonTip, params: { ROBOT_NAME: 'eve' } } })],
      success: c.appAction('camera', 'camera.recording.finished', (d) => d.robotName === 'eve'),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: "Open the newest recording of EVE's build in Recordings, once the build finishes." },
        { afterS: 120, idle: true, effect: 'text', text: 'Watch where the solenoid lands relative to Print.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'camera', route: '/recordings', target: 'camera.recording:', action: 'click' }],
      onComplete: [say('jared', 'See it? About 3 mm above Print, right in the gap. And there is a fifth option now: Scan for receipt.')],
      factIds: ['F213', 'F215', 'F211'],
    },
    { id: 'M09.09a', kind: 'walk-to', hud: 'Take the ruler from your desk to EVE (Touch Rack A)', location: 'loc.rack-a' },
    {
      id: 'M09.10',
      kind: 'interact',
      hud: 'Measure the new Print button position with the ruler',
      target: 'prop.eve.device',
      onEnter: [{ do: 'grant', tools: ['ruler'] }],
      success: c.any(measuredAll, c.appAction('world', 'minigame.completed', (d) => d.id === 'ruler-receipt5')),
      objectives: RECEIPT_5.map((b) => ({
        id: `M09.10.${b.button.toLowerCase().replace(/ /g, '-')}`,
        text: `${b.button}`,
        done: c.appAction('world', 'ruler.measured', (d) => d.button === b.button && typeof d.yMm === 'number' && Math.abs(d.yMm - b.y) <= 0.5),
      })),
      hints: [
        { afterS: 60, effect: 'text', text: 'With the ruler in hand, press E on EVE\'s screen: it snaps to the top-left (0,0). Click each button to read its centre.' },
        { afterS: 120, effect: 'text', text: "EVE's Flex 4 lies flat under the gantry: crouch (C) beside the rack and look in under the dip arm to aim at the screen." },
      ],
      onComplete: [say('jared', 'Print at 74. It used to be 71. Everything moved down 3 mm.')],
      factIds: ['F213', 'F142', 'F082'],
    },
    {
      id: 'M09.11',
      kind: 'computer-task',
      hud: 'Create the 5-option receipt map for FLEX_4 and keep the 4-option one.',
      app: 'orca',
      route: '/screen/new',
      success: c.all(map5Ok, map4Kept),
      objectives: [
        { id: 'M09.11.screen', text: 'Screens → New: RECEIPT_OPTIONS_5 (FLEX_4)', done: c.eq(p.screenLocation('FLEX_4', 'RECEIPT_OPTIONS_5', 'Print').exists, true) },
        { id: 'M09.11.locs', text: 'Five Screen Locations from your measurements (±0.5 mm)', done: map5Ok },
        { id: 'M09.11.keep', text: 'RECEIPT_OPTIONS_4 unchanged', done: map4Kept },
      ],
      wrongActions: [
        {
          id: 'edit-4',
          on: on('app.action', { app: 'orca', action: 'orca.screenLocation.saved' }, (pl) => {
            const d = (pl.data ?? {}) as { screen?: string; deviceType?: string; created?: boolean };
            return d.screen === 'RECEIPT_OPTIONS_4' && d.deviceType === 'FLEX_4' && d.created === false;
          }),
          say: "Don't touch the 4-option map. The QR option is conditional, so Orca keeps both maps.",
        },
      ],
      showMe: [{ app: 'orca', route: '/screen/new', target: 'orca.screen.addLocation', action: 'click' }],
      factIds: ['F215', 'F216', 'F142'],
    },
    {
      id: 'M09.12',
      kind: 'computer-task',
      hud: "Open a PR with the coordinate change and request {{jared}}'s review",
      app: 'github',
      route: '/labsim-lab/gort',
      success: c.happened(on('github.prMerged', { repo: 'gort' })),
      objectives: [
        { id: 'M09.12.branch', text: 'Branch fix/flex4-receipt-qr with config/screen-locations/FLEX_4/RECEIPT_OPTIONS_5.json', done: c.appAction('github', 'github.file.committed', (d) => d.repo === 'gort') },
        { id: 'M09.12.pr', text: 'PR: "Add 5-option receipt coordinates for FLEX_4"', done: c.happened(on('github.prCreated', { repo: 'gort' })) },
        { id: 'M09.12.merge', text: '{{jared}} approves and merges', done: c.happened(on('github.prMerged', { repo: 'gort' })) },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'gort main is protected: commit on a new branch, then open a pull request.' },
        { afterS: 120, idle: true, effect: 'text', text: 'Add config/screen-locations/FLEX_4/RECEIPT_OPTIONS_5.json on branch fix/flex4-receipt-qr; title "Add 5-option receipt coordinates for FLEX_4".' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'github', route: '/labsim-lab/gort', target: 'github.newPullRequest', action: 'click' }],
      factIds: ['F214', 'F018', 'F034'],
    },
    {
      id: 'M09.13',
      kind: 'dialogue',
      speaker: 'jared',
      text: "When the QR button first shipped, it pushed everything down a few millimetres and broke every ruler-measured coordinate in the lab for 48 hours, until I merged the coordinate PR. And it's conditional, so Orca keeps separate maps for 4-option and 5-option receipt screens on every device profile. You just did it in five minutes.",
      factIds: ['F213', 'F214', 'F215', 'F216'],
    },
    { id: 'M09.14', kind: 'quiz-checkpoint', checkpointId: 'CP-M09.1', title: 'Coordinates & Bots', questionIds: ['Q167', 'Q168', 'Q170', 'Q172', 'Q174', 'Q180', 'Q184'] },
  ],
};

