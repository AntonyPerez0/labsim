/**
 * M11 — Jenkins: The Executor (Cur §2 M11). Mentor {{tate}}.
 * Setup (`academy:M11`, Sim §4.4.2): job `Java/uia-remote-regression-flex` has the saved parameter
 * `DEVICE_TYPE=flex_3` (lower case) → checkout fails with `No enum constant …DeviceType.flex_3`.
 */
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { JOB, consoleOpened, finished, jobRoute, queued, say } from './helpers';

const checkedOutNow = (robot: string) => (_: unknown, s: { lab: { orca?: { robots?: Record<number, { name: string; checkout: unknown }> } } }) =>
  Object.values(s.lab.orca?.robots ?? {}).some((r) => r.name === robot && r.checkout !== null && r.checkout !== undefined);

/**
 * The release was seen in Orca: the player refreshed / used Orca after WALL-E was released, or was sitting at
 * the workstation when it happened (the Robots list is live, so watching it update counts too).
 */
const releasedSeen = c.any(
  c.sequence(on('robot.released', { name: 'wall-e' }), on('app.navigated', { app: 'orca' })),
  c.sequence(on('robot.released', { name: 'wall-e' }), on('app.action', { app: 'orca' })),
  c.all(c.happened(on('robot.released', { name: 'wall-e' })), c.eq(p.overlay, 'computer')),
);

export const M11: LessonDef = {
  moduleId: 'M11',
  mentor: 'tate',
  setup: { preset: 'academy:M11', spawn: 'loc.workstation', apps: { unlock: ['jenkins', 'orca', 'chat'] } },
  deck: 'deck.M11',
  manualChapters: ['Pipelines'],
  realLabChecklist: [
    'Jenkins is the Executor: it triggers the pipeline, checks a robot out of Orca and injects the runtime environment variables. In CI nobody hand-edits config.',
    'Legacy jobs are split by platform: Java jobs and iOS jobs. iOS Go SDK testing is active, so do not delete anything there.',
    'Enum parameters such as DEVICE_TYPE must match Orca exactly, in ALL CAPS (FLEX_3). A lower-case value fails the checkout.',
    "Read the console's environment block (RUN_TYPE, DEVICE_TYPE, ROBOT_NAME, PORT_NUMBER=5444, THEME=avocado, KERNEL_TYPE=CPA) when a run misbehaves.",
    'Run on an Unavailable rig by passing its exact unique Name in ROBOT_NAME.',
  ],
  steps: [
    {
      id: 'M11.01',
      kind: 'dialogue',
      speaker: 'tate',
      text: 'Jenkins is the Executor. It triggers the pipeline, checks a robot out of Orca, and injects the runtime environment variables the test runner needs. In CI, nobody hand-edits config: Jenkins injects it.',
      factIds: ['F015', 'F016', 'F094', 'F095', 'F189'],
    },
    {
      id: 'M11.02',
      kind: 'computer-task',
      hud: 'Open the legacy views',
      app: 'jenkins',
      route: '/',
      success: c.all(c.appAction('jenkins', 'jenkins.view.opened', (d) => d.view === 'Java'), c.appAction('jenkins', 'jenkins.view.opened', (d) => d.view === 'iOS')),
      objectives: [
        { id: 'M11.02.java', text: 'Java', done: c.appAction('jenkins', 'jenkins.view.opened', (d) => d.view === 'Java') },
        { id: 'M11.02.ios', text: 'iOS', done: c.appAction('jenkins', 'jenkins.view.opened', (d) => d.view === 'iOS') },
      ],
      showMe: [{ app: 'jenkins', route: '/', target: 'jenkins.viewTab:iOS', action: 'click' }],
      factIds: ['F017'],
    },
    {
      id: 'M11.03',
      kind: 'dialogue',
      speaker: 'tate',
      text: "Legacy jobs are organised by platform: Java jobs here, iOS jobs there. The iOS runner is rarely touched, but iOS Go SDK testing is active, so don't delete anything.",
      factIds: ['F017', 'F203'],
    },
    {
      id: 'M11.04',
      kind: 'computer-task',
      hud: 'Build Java/uia-remote-regression-flex with its saved parameters',
      app: 'jenkins',
      route: jobRoute(JOB.regressionFlex, 'build'),
      success: c.all(c.happened(finished(JOB.regressionFlex, 'FAILURE', 'ENUM_CASE')), consoleOpened(JOB.regressionFlex, 'FAILURE')),
      objectives: [
        { id: 'M11.04.build', text: 'Build with the saved parameters', done: c.happened(queued(JOB.regressionFlex)) },
        { id: 'M11.04.console', text: 'Read the failed console', done: consoleOpened(JOB.regressionFlex, 'FAILURE') },
      ],
      showMe: [{ app: 'jenkins', route: jobRoute(JOB.regressionFlex, 'build'), target: 'jenkins.buildButton', action: 'click' }],
      factIds: ['F121', 'F122'],
    },
    {
      id: 'M11.05',
      kind: 'dialogue',
      speaker: 'tate',
      text: "Device Type is an enum in Orca, so the string has to match exactly. That's why our Jenkins env vars are ALL CAPS.",
      factIds: ['F122'],
    },
    {
      id: 'M11.06',
      kind: 'computer-task',
      hud: 'Fix the parameter and rebuild',
      app: 'jenkins',
      route: jobRoute(JOB.regressionFlex, 'build'),
      success: c.sequence(queued(JOB.regressionFlex, { DEVICE_TYPE: 'FLEX_3' }), on('robot.checkedOut', { name: 'wall-e' })),
      wrongActions: [
        {
          id: 'still-lower',
          on: on('jenkins.buildQueued', { jobId: JOB.regressionFlex }, (pl) => (pl.params.DEVICE_TYPE ?? '') !== (pl.params.DEVICE_TYPE ?? '').toUpperCase()),
          say: 'Still lower case. Enum values are ALL CAPS: FLEX_3.',
        },
      ],
      showMe: [{ app: 'jenkins', route: jobRoute(JOB.regressionFlex, 'build'), target: 'jenkins.param:DEVICE_TYPE', action: 'type', text: 'FLEX_3' }],
      factIds: ['F122', 'F095'],
    },
    {
      id: 'M11.07',
      kind: 'computer-task',
      hud: 'Check WALL-E in Orca while the build runs',
      app: 'orca',
      route: '/robot',
      success: c.all(
        c.any(
          c.happened(on('app.navigated', { app: 'orca' }, checkedOutNow('wall-e'))),
          c.happened(on('app.action', { app: 'orca' }, checkedOutNow('wall-e'))),
          c.wasTrue(c.all(c.truthy(p.robot('wall-e').checkedOutBy), c.eq(p.overlay, 'computer'))),
        ),
        releasedSeen,
      ),
      objectives: [
        { id: 'M11.07.inuse', text: 'WALL-E: Available · in use by Jenkins', done: c.any(c.happened(on('app.navigated', { app: 'orca' }, checkedOutNow('wall-e'))), c.happened(on('app.action', { app: 'orca' }, checkedOutNow('wall-e')))) },
        { id: 'M11.07.free', text: 'After the build: no longer in use (refresh the list)', done: releasedSeen },
      ],
      onComplete: [say('tate', 'Still Available the whole time. A checkout is not a status: Orca just marks the robot as in use by that build until it is released.')],
      factIds: ['F095', 'F101'],
    },
    {
      id: 'M11.08',
      kind: 'computer-task',
      hud: "Find the injected port number in the console's environment block",
      app: 'jenkins',
      success: c.appAction('jenkins', 'jenkins.console.lineClicked', (d) => typeof d.text === 'string' && d.text.includes('PORT_NUMBER=5444')),
      showMe: [{ app: 'jenkins', target: 'jenkins.consoleOutput', action: 'click', caption: 'PORT_NUMBER=5444' }],
      onComplete: [say('tate', 'PORT_NUMBER=5444, THEME=avocado, KERNEL_TYPE=CPA. On your laptop those live in config.properties; in CI, Jenkins injects them. {{morgan}} will make you live the 5444 story.')],
      factIds: ['F016', 'F189', 'F198'],
    },
    {
      id: 'M11.09',
      kind: 'computer-task',
      hud: 'Run Java/uia-remote-regression-flex on ROSIE (Unavailable)',
      app: 'jenkins',
      route: jobRoute(JOB.regressionFlex, 'build'),
      success: c.happened(on('robot.checkedOut', { name: 'rosie', byName: true })),
      wrongActions: [
        {
          id: 'rosie-available',
          on: on('robot.statusChanged', { name: 'rosie', to: 'AVAILABLE' }, (pl) => pl.actor === 'player'),
          say: 'Leave ROSIE Unavailable. Put its exact Name in ROBOT_NAME instead.',
          gw: 'GW05',
        },
        {
          id: 'case',
          on: on('jenkins.buildQueued', { jobId: JOB.regressionFlex }, (pl) => /^rosie$/i.test(pl.params.ROBOT_NAME ?? '') && pl.params.ROBOT_NAME !== 'rosie'),
          say: 'Exact unique Name, exactly as Orca has it: rosie.',
        },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'General jobs never pick an Unavailable robot. Name it.' },
        { afterS: 120, idle: true, effect: 'text', text: 'ROBOT_NAME=rosie and DEVICE_TYPE=FLEX_POCKET (ROSIE is a Flex Pocket).' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'jenkins', route: jobRoute(JOB.regressionFlex, 'build'), target: 'jenkins.param:ROBOT_NAME', action: 'type', text: 'rosie' }],
      factIds: ['F102', 'F104'],
    },
    { id: 'M11.10', kind: 'quiz-checkpoint', checkpointId: 'CP-M11.1', title: 'Jenkins', questionIds: ['Q214', 'Q215', 'Q216', 'Q217', 'Q220'] },
  ],
};
