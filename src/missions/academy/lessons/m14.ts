/**
 * M14 — config.properties & the Tethered Tax Test (Cur §2 M14). Mentor {{morgan}}, cameo the office
 * coworker ({{riley}}, `npc.coworker`, desk Flex `10.42.60.4` on the default ADB port 5555).
 * Setup (`academy:M14`, Sim §4.4.2): uia-remote cloned with the broken `config.properties` of Cur M14
 * (`m14-broken`); the coworker's desk Flex is already known to the workstation's ADB server; MEGATRON
 * (STATION_2 MFD `10.42.30.21` + MINI_2 CFD `10.42.30.22`, DEV1) is Available. How 5555 reaches the
 * coworker's device is illustrative (Cur S19): the refused lab connect falls back to the first known device.
 */
import { c, on, p } from '../../types';
import type { Condition, LessonDef, ScriptAction } from '../../types';
import { inject, say } from './helpers';

/** Cur M14 "Required end state (validator target)". */
export const M14_TARGET: Readonly<Record<string, string>> = {
  runType: 'tethered',
  merchantFacingDeviceIp: '10.42.30.21',
  customerFacingDeviceIp: '10.42.30.22',
  serial: 'SIM-S2-000021',
  deviceType: 'Station',
  theme: 'avocado',
  kernelType: 'CPA',
  portNumber: '5444',
  unlockPasscode: '0000',
  backendEnv: 'DEV1',
  robotName: 'megatron',
};

const cfg = (key: string): Condition => c.eq(p.prop('config', key), M14_TARGET[key]!);
const configValid: Condition = c.any(
  c.forAll(Object.keys(M14_TARGET), cfg),
  c.appAction('intellij', 'intellij.configValidator.ran', (d) => d.passed === 11 && d.total === 11),
);
const taxRunning = (pl: { testName: string }) => pl.testName === 'TaxTest';

/**
 * The step-1 config (Cur S19 collision). The sim's runner validates theme/kernelType before it connects
 * and TaxTest needs a tethered config whose deviceType matches the device it lands on, so the curriculum's
 * start file (theme=classic, standalone, Mini) would die on the theme and never reach the coworker's desk
 * Flex. Step 1 therefore runs MEGATRON's config with the two values that cause the collision —
 * portNumber=5555 (the lab connect is refused → fallback to the desk Flex) and deviceType=Flex (Register
 * really opens there); the stale theme/kernelType of the start file arrive at M14.04, before the player
 * opens the file. Written with `sim.git.writeFile` (draft-safe at activity start, unlike scenario items).
 */
const COLLISION_CONFIG = Object.entries({ ...M14_TARGET, portNumber: '5555', deviceType: 'Flex' })
  .map(([k, v]) => `${k}=${v}`)
  .join('\n')
  .concat('\n');
const writeCollisionConfig: ScriptAction = {
  do: 'sim',
  run: (sim) => {
    sim.git.writeFile('uia-remote', 'config.properties', COLLISION_CONFIG);
  },
};

/** No local run or build is driving a coworker desk device (10.42.60.x) right now. */
const noRunOnCoworker: Condition = c.custom('m14-no-run-on-coworker', 'Nothing drives the desk device', (s) => {
  const onDesk = (h: { mfd: string | null; cfd: string | null } | undefined) => !!h && [h.mfd, h.cfd].some((x) => !!x && x.startsWith('10.42.60.'));
  const runs = Object.values((s.lab.local?.runs ?? {}) as Record<string, { state: string; runner?: { handles?: { mfd: string | null; cfd: string | null } } }>);
  return !runs.some((r) => r.state === 'running' && onDesk(r.runner?.handles));
});

export const M14: LessonDef = {
  moduleId: 'M14',
  mentor: 'morgan',
  setup: { preset: 'academy:M14', spawn: 'loc.workstation', apps: { unlock: ['intellij', 'orca', 'terminal', 'camera', 'github', 'chat'] } },
  deck: 'deck.M14',
  realLabChecklist: [
    'Running locally? You fill in config.properties yourself; in CI Jenkins injects the same values.',
    'portNumber is locked to 5444. The ADB default 5555 once let scripts connect to and drive coworkers\' desk devices.',
    'theme is always avocado and kernelType is always CPA (Core Payments Application, which replaced SPA).',
    'Tethered rigs: runType=tethered, MFD and CFD IPs (the same IP on a Station Duo), the serial of the primary terminal, deviceType = Mini, Flex or Station.',
    'Reserve the rig in Orca before a local run and set it back to Available afterwards.',
    'The Tax test: MFD_O1 (Register, Tax Item 5, Review Order, Orca → Callus loads the swipe card) → CFD_O1 (assert subtotal, tax, total) → MFD_O2 (Pay, Charge) → CFD finalises payment; it starts and ends on HomeScreen.',
  ],
  steps: [
    {
      id: 'M14.01',
      kind: 'computer-task',
      hud: 'Run TaxTest against MEGATRON',
      app: 'intellij',
      route: '/project/uia-remote',
      onEnter: [writeCollisionConfig],
      success: c.any(c.happened(on('test.localRunStarted', {}, taxRunning)), c.appAction('intellij', 'intellij.run.started', (d) => d.config === 'TaxTest')),
      showMe: [{ app: 'intellij', route: '/project/uia-remote', target: 'intellij.runButton', action: 'click', caption: '▶ TaxTest' }],
      factIds: ['F028'],
    },
    {
      id: 'M14.02',
      kind: 'dialogue',
      speaker: 'riley',
      text: 'Hey! Something just opened Register on my desk Flex and added a Tax Item 5! Is that one of yours?!',
      factIds: ['F200'],
    },
    { id: 'M14.03', kind: 'walk-to', hud: "Go and look at the coworker's device", location: 'loc.coworker-desks', radiusM: 2 },
    {
      id: 'M14.03a',
      kind: 'inspect',
      hud: "Look at the coworker's screen",
      prop: 'prop.coworker-device',
      callouts: ['Your run opened Register and added Tax Item 5 here', 'Desk device — ADB on 5555'],
      factIds: ['F199', 'F200'],
    },
    {
      id: 'M14.03b',
      kind: 'computer-task',
      hud: 'Stop the run in IntelliJ',
      app: 'intellij',
      // `coworkerIdle` also counts the desk Flex that the workstation's ADB server merely *knows* (setup
      // `ws.adbKnows`), which only `adb disconnect` clears; this step asks for the run to stop driving it.
      success: c.all(c.any(c.appAction('intellij', 'intellij.run.stopped'), c.neq(p.localRun('TaxTest').result, 'RUNNING')), noRunOnCoworker),
      wrongActions: [
        {
          id: 'unplug-coworker',
          on: on('player.interacted', {}, (pl) => pl.interactableId.startsWith('desk.coworker') && /unplug|power/i.test(pl.verb)),
          say: "Don't touch their device. The problem is our port, not their desk. Stop the run.",
          gw: 'GW23',
        },
      ],
      showMe: [{ app: 'intellij', target: 'intellij.stopButton', action: 'click' }],
      factIds: ['F200'],
    },
    {
      id: 'M14.04',
      kind: 'dialogue',
      speaker: 'morgan',
      onComplete: [inject({ faultId: 'config.themeKernel', params: { path: '~/IdeaProjects/uia-remote/config.properties' } })],
      text: "Classic. Check your config.properties. I bet you're on 5555, the out-of-the-box ADB port. Lab devices only listen on 5444, so your connect was refused and the runner grabbed the first device ADB already knew: a coworker's desk device on the default port. That exact collision is why portNumber is locked to 5444.",
      factIds: ['F199', 'F200', 'F198', 'F026'],
    },
    {
      id: 'M14.05',
      kind: 'computer-task',
      hud: 'Fix config.properties for MEGATRON (tethered)',
      app: 'intellij',
      route: '/project/uia-remote/file/config.properties',
      success: configValid,
      objectives: [
        { id: 'M14.05.port', text: 'portNumber=5444', done: cfg('portNumber') },
        { id: 'M14.05.tether', text: 'runType=tethered, CFD IP 10.42.30.22', done: c.all(cfg('runType'), cfg('customerFacingDeviceIp')) },
        { id: 'M14.05.type', text: 'deviceType = the MFD family (Station)', done: cfg('deviceType') },
        { id: 'M14.05.locks', text: 'theme=avocado, kernelType=CPA', done: c.all(cfg('theme'), cfg('kernelType')) },
        { id: 'M14.05.valid', text: 'Validator: config.properties ✓ 11/11', done: configValid },
      ],
      wrongActions: [
        {
          id: 'still-5555',
          on: on('app.action', { app: 'intellij', action: 'intellij.file.saved' }, (pl) => String((pl.data as { path?: string } | undefined)?.path ?? '').endsWith('config.properties')),
          when: c.eq(p.prop('config', 'portNumber'), '5555'),
          say: 'Still 5555. Lab devices listen on 5444.',
          gw: 'GW08',
        },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'Open "Show details" on the validator bar: each red row says what it expects.' },
        { afterS: 120, idle: true, effect: 'text', text: 'MEGATRON = Station 2 MFD 10.42.30.21 tethered to Mini 2 CFD 10.42.30.22: runType=tethered, deviceType=Station, portNumber=5444, theme=avocado, kernelType=CPA.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'intellij', route: '/project/uia-remote/file/config.properties', target: 'intellij.configValidator', action: 'click' }],
      factIds: ['F188', 'F190', 'F191', 'F192', 'F194', 'F195', 'F196', 'F197', 'F198', 'F201'],
    },
    {
      id: 'M14.06',
      kind: 'dialogue',
      speaker: 'morgan',
      text: 'theme is locked to avocado; the old theme toggles are deprecated. kernelType is CPA, Core Payments Application, which replaced SPA, the Secure Processor Application. deviceType is the family: Mini, Flex or Station, and it drives layout and scroll logic. Extras: unlock passcode, backend environment, and the robot\'s registration name. On a Station Duo, both IPs are the same address. And in CI you never touch this file. Jenkins injects all of it.',
      factIds: ['F196', 'F197', 'F195', 'F201', 'F193', 'F189'],
    },
    {
      id: 'M14.07',
      kind: 'interact',
      hud: 'Apologise to your coworker',
      target: 'npc.riley',
      prompt: 'What do you say?',
      success: c.happened(on('dialogue.choiceMade', { choiceId: 'own-it', correct: true })),
      choices: [
        {
          id: 'own-it',
          text: "Sorry! My script was on 5555. It's 5444 now and it'll stay that way.",
          correct: true,
          response: [{ speaker: 'riley', text: 'Ha. Welcome to the club.' }],
        },
        {
          id: 'blame',
          text: 'Your device must have glitched.',
          correct: false,
          response: [{ speaker: 'morgan', text: 'Own it. It was our script on the default port, not their device.' }],
        },
      ],
      factIds: ['F200'],
    },
    {
      id: 'M14.08',
      kind: 'computer-task',
      hud: "You're running locally, so reserve MEGATRON",
      app: 'orca',
      route: '/robot',
      success: c.status('megatron', 'RESERVED'),
      showMe: [{ app: 'orca', route: '/robot', target: 'orca.robots.rowStatus:megatron', action: 'select', text: 'Reserved' }],
      factIds: ['F112', 'F113'],
    },
    {
      id: 'M14.09',
      kind: 'computer-task',
      hud: 'Open TaxTest.java, read the header, then run it',
      app: 'intellij',
      route: '/project/uia-remote/file/app/src/androidTest/java/com/labsim/uia/testactions/TaxTest.java',
      success: c.all(c.appAction('intellij', 'intellij.file.opened', (d) => String(d.path ?? '').endsWith('TaxTest.java')), c.happened(on('test.localRunStarted', {}, taxRunning)), configValid),
      objectives: [
        { id: 'M14.09.read', text: 'Open TaxTest.java and read the header', done: c.appAction('intellij', 'intellij.file.opened', (d) => String(d.path ?? '').endsWith('TaxTest.java')) },
        { id: 'M14.09.run', text: 'Run ▶ TaxTest', done: c.happened(on('test.localRunStarted', {}, taxRunning)) },
      ],
      onComplete: [say('morgan', 'Header first: intent, safe state, steps. Every test starts on HomeScreen and teardown puts both devices back there.')],
      factIds: ['F181', 'F182'],
    },
    {
      id: 'M14.10',
      kind: 'wait-for-condition',
      hud: 'Watch MEGATRON run the Tax test',
      marker: { kind: 'location', id: 'loc.rack-tethered' },
      success: c.any(c.eq(p.player.location, 'loc.rack-tethered'), c.appAction('camera', 'camera.stream.opened', (d) => d.robotName === 'megatron' || d.host === '10.42.10.20')),
      xp: 10,
    },
    {
      id: 'M14.11',
      kind: 'inspect',
      hud: 'MFD_O1: watch the merchant screen',
      prop: 'prop.megatron.mfd',
      callouts: ['[MFD_O1] open Register', '[MFD_O1] add "Tax Item 5"', '[MFD_O1] Review Order', '[MFD_O1] orca → callus: load swipe card VISA_STD_SWIPE … OK'],
      factIds: ['F183', 'F184'],
    },
    {
      id: 'M14.12',
      kind: 'inspect',
      hud: 'CFD_O1: watch the customer screen',
      prop: 'prop.megatron.cfd',
      callouts: ['Subtotal $10.00 ✓', 'Tax $0.83 ✓', 'Total $10.83 ✓'],
      factIds: ['F185'],
    },
    {
      id: 'M14.13',
      kind: 'inspect',
      hud: 'MFD_O2 and Step 4: Pay, Charge, then the customer finalises',
      prop: 'prop.megatron.mfd',
      callouts: ['[MFD_O2] Pay', '[MFD_O2] Charge', '[CFD] payment prompt → approved', '[teardown] MFD → HomeScreen · CFD → HomeScreen'],
      factIds: ['F186', 'F187', 'F182'],
    },
    {
      id: 'M14.13a',
      kind: 'wait-for-condition',
      hud: 'TaxTest PASSED (4/4 steps)',
      success: c.eq(p.localRun('TaxTest').result, 'PASS'),
      timeoutS: 120,
      hints: [{ afterS: 60, effect: 'text', text: 'If the run failed or was stopped, run TaxTest again from IntelliJ.' }],
      factIds: ['F182'],
    },
    {
      id: 'M14.14',
      kind: 'computer-task',
      hud: 'Done locally. Release MEGATRON',
      app: 'orca',
      route: '/robot',
      success: c.status('megatron', 'AVAILABLE'),
      factIds: ['F101', 'F112'],
    },
    { id: 'M14.15', kind: 'quiz-checkpoint', checkpointId: 'CP-M14.1', title: 'Config & Tax Test', questionIds: ['Q275', 'Q276', 'Q279', 'Q284', 'Q286', 'Q288', 'Q290', 'Q296'] },
  ],
};
