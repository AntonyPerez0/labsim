/**
 * M06 — Orka Architecture & the Five Robot Statuses (Cur §2 M06). Mentor {{nate}}, cameo {{jaden}}.
 * Setup (`academy:M06`): roster as factory; Orka (Robots page) and Jenkins (only
 * `Java/uia-relay-regression-flux`) unlocked; the tutorial **Force health check** button is shown.
 * During the lesson: step 7's unplug is the player's own action; at step 10 the runner re-plugs EVE's
 * Pi as {{jaden}} (`power.plug { load: 'pi-eve', kind: 'dc-rail', target: 'MAIN-eve' }`, Sim §4.4.2).
 */
import { c, on, p } from '../../types';
import type { LessonDef } from '../../types';
import { JOB, healthLogLine, inject, jobRoute, minigameDone, say } from './helpers';

const playerSet = (robot: string, to?: string) =>
  on('robot.statusChanged', { name: robot }, (pl) => pl.actor === 'player' && (to === undefined || pl.to === to));

export const M06: LessonDef = {
  moduleId: 'M06',
  mentor: 'nate',
  setup: {
    preset: 'academy:M06',
    spawn: 'loc.workstation',
    apps: { unlock: ['orka', 'jenkins', 'terminal', 'chat'], restrictions: { jenkins: { visibleJobs: [JOB.regressionFlux] } }, forceHealthCheck: true },
  },
  deck: 'deck.M06',
  manualChapters: ['Orchestrator'],
  realLabChecklist: [
    'Orka is the Controller and Jenkins the Executor: Jenkins triggers the pipeline, injects env vars and checks a robot out of Orka; the runner calls Orka over REST.',
    'Know the five statuses and who sets them: Available, Unavailable (named jobs only, auto-reset), Offline (manual, skips health checks), Connection Failed (automatic) and Reserved (manual, local runs).',
    'A Connection Failed rig: open its Notes for the endpoint and error, escalate the hardware to {{jaden}}, then verify at the next 5-minute health check. Never set it back to Available yourself.',
    'Mark a rig Offline while it is being built; Reserve it while you test locally and set it back to Available when you are done.',
    'To run on an Unavailable rig (e.g. a PayCrest standalone), pass its exact Name in ROBOT_NAME. Never flip it to Available.',
  ],
  steps: [
    { id: 'M06.01', kind: 'walk-to', hud: 'Meet {{nate}} at the architecture whiteboard', location: 'loc.whiteboard' },
    {
      id: 'M06.02',
      kind: 'dialogue',
      speaker: 'nate',
      text: "Hi, I'm {{nate}}, I work on Orka. Orka is short for Orchestrator. Rule one: Orka is the Controller and Jenkins is the Executor. Jenkins triggers the pipeline, injects environment variables into the test runner and checks out a robot from Orka. The runner then calls Orka over REST for taps and card actions.",
      factIds: ['F036', 'F038', 'F098', 'F094', 'F095', 'F096'],
    },
    {
      id: 'M06.03',
      kind: 'interact',
      hud: 'Rebuild the architecture diagram',
      target: 'prop.whiteboard',
      success: minigameDone('architecture-diagram'),
      hints: [
        { afterS: 60, effect: 'text', text: 'Jenkins (Executor) triggers the test runner and checks a robot out of Orka (Controller). Orka pings the Pi every 5 minutes.' },
        { afterS: 120, effect: 'text', text: 'The Pi reaches the LabSim over ADB on 5444. The Kallus box drives the Kollis probe over a ribbon cable.' },
      ],
      factIds: ['F094', 'F095', 'F096', 'F097', 'F099', 'F026'],
    },
    {
      id: 'M06.04',
      kind: 'dialogue',
      speaker: 'nate',
      text: 'Orka is an on-premise Spring Boot monolith, written in Java. We scaffolded it with JHipster: you answer its setup questionnaire and it generates the UI, the REST endpoints and the MySQL schemas. Today it lives on a VM here in the lab.',
      factIds: ['F037', 'F001', 'F002', 'F003', 'F004', 'F013', 'F023'],
    },
    {
      id: 'M06.05',
      kind: 'computer-task',
      hud: "Open Orka's Robots page and filter to Available robots",
      app: 'orka',
      route: '/robot',
      success: c.appAction('orka', 'orka.robots.filtered', (d) => {
        const st = d.status as unknown[] | undefined;
        return Array.isArray(st) && st.length === 1 && st[0] === 'AVAILABLE' && !d.deviceType && !d.rigKind && !d.environment && !d.name;
      }),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: "Use the Status filter above the Robots list ({{nate}}'s filter UI)." },
        { afterS: 120, idle: true, effect: 'text', text: 'Select only Available, with every other filter cleared.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'orka', route: '/robot', target: 'orka.robots.filter.status:AVAILABLE', action: 'click', caption: "{{nate}}'s status filter" }],
      factIds: ['F116', 'F101'],
    },
    {
      id: 'M06.06',
      kind: 'dialogue',
      speaker: 'nate',
      text: "There are exactly five statuses: Available, Unavailable, Offline, Connection Failed and Reserved. Every five minutes a synchronized background thread pings the Robot Controller on every Pi. Let's break one on purpose.",
      factIds: ['F100', 'F099'],
    },
    {
      id: 'M06.07',
      kind: 'interact',
      hud: 'Go to EVE and unplug its Pi power lead',
      target: 'prop.eve.pi-power',
      success: c.eq(p.pi('pi-eve').power, 'OFF'),
      factIds: ['F107'],
    },
    {
      id: 'M06.08',
      kind: 'computer-task',
      hud: 'Force a health check (or wait for the 5-minute ping)',
      app: 'orka',
      route: '/robot',
      offerFastForward: true,
      success: c.status('eve', 'CONNECTION_FAILED'),
      showMe: [{ app: 'orka', target: 'orka.header.forceHealthCheck', action: 'click', caption: 'Tutorial only: Force health check' }],
      factIds: ['F107', 'F108', 'F099'],
    },
    {
      id: 'M06.09',
      kind: 'computer-task',
      hud: 'Open EVE and read the Notes',
      app: 'orka',
      success: c.all(
        c.appAction('orka', 'orka.robot.notesViewed', (d) => d.name === 'eve'),
        c.appAction('orka', 'orka.robot.checkoutAttempted', (d) => d.name === 'eve' && d.ok === false),
      ),
      objectives: [
        { id: 'M06.09.notes', text: "Read EVE's Notes (endpoint + error)", done: c.appAction('orka', 'orka.robot.notesViewed', (d) => d.name === 'eve') },
        { id: 'M06.09.checkout', text: 'Try Check out on EVE', done: c.appAction('orka', 'orka.robot.checkoutAttempted', (d) => d.name === 'eve' && d.ok === false) },
      ],
      factIds: ['F109', 'F108'],
    },
    {
      id: 'M06.10',
      kind: 'interact',
      hud: 'Escalate EVE',
      target: 'npc.jaden',
      prompt: 'What do you tell {{jaden}}?',
      success: c.happened(on('dialogue.choiceMade', { choiceId: 'escalate', correct: true })),
      choices: [
        {
          id: 'escalate',
          text: 'EVE is Connection Failed: health ping timed out on 10.42.10.12:8000. Can you take a look?',
          correct: true,
          response: [{ speaker: 'jaden', text: 'On it. Probably the Pi, or a Minix box running Kallus. Same symptom.' }],
        },
        {
          id: 'paper-over',
          text: "I'll just set EVE back to Available.",
          correct: false,
          response: [{ speaker: 'nate', text: 'Never paper over a failed ping. Hardware goes to {{jaden}}.' }],
        },
        {
          id: 'reboot-orka',
          text: "I'll reboot Orka.",
          correct: false,
          response: [{ speaker: 'nate', text: "Orka is fine: it did its job and caught a dead ping. Rebooting it kills everyone's builds. Escalate the hardware to {{jaden}}." }],
        },
      ],
      wrongActions: [{ id: 'override', on: playerSet('eve', 'AVAILABLE'), say: 'Never paper over a failed ping. Hardware goes to {{jaden}}.', speaker: 'nate', gw: 'GW24' }],
      onComplete: [
        { do: 'npc', npc: 'jaden', action: 'fix', target: 'prop.eve.pi-power' },
        inject({ op: 'power.plug', params: { load: 'pi-eve', kind: 'dc-rail', target: 'MAIN-eve' } }),
        { do: 'npc', npc: 'jaden', action: 'idle' },
      ],
      factIds: ['F111', 'F110'],
    },
    {
      id: 'M06.10a',
      kind: 'computer-task',
      hud: 'Verify EVE recovers at the next health check',
      app: 'orka',
      route: '/robot',
      offerFastForward: true,
      success: c.status('eve', 'AVAILABLE'),
      wrongActions: [{ id: 'override', on: playerSet('eve', 'AVAILABLE'), say: "Let the ping do it. When the Pi answers 200, Orka flips EVE back on its own.", speaker: 'nate', gw: 'GW24' }],
      onComplete: [say('nate', 'Pi answered 200, so Orka moved EVE back to Available by itself. That is how you verify a hardware fix.')],
      factIds: ['F107', 'F099'],
    },
    {
      id: 'M06.11',
      kind: 'computer-task',
      hud: '{{jaden}} is rebuilding BAYMAX. Mark it Offline, then force a health check.',
      app: 'orka',
      offerFastForward: true,
      success: c.all(c.status('baymax', 'OFFLINE'), healthLogLine(/baymax\s+SKIPPED \(Offline\)/), c.appAction('orka', 'orka.healthLog.viewed')),
      objectives: [
        { id: 'M06.11.offline', text: 'BAYMAX → Offline', done: c.status('baymax', 'OFFLINE') },
        { id: 'M06.11.check', text: 'Run a health check', done: healthLogLine(/baymax\s+SKIPPED \(Offline\)/) },
        { id: 'M06.11.log', text: 'Read the health log: baymax SKIPPED (Offline)', done: c.appAction('orka', 'orka.healthLog.viewed') },
      ],
      wrongActions: [
        {
          id: 'wrong-status',
          on: on('robot.statusChanged', { name: 'baymax' }, (pl) => pl.actor === 'player' && (pl.to === 'UNAVAILABLE' || pl.to === 'RESERVED')),
          say: 'A rig on the bench is Offline. Unavailable is for special rigs that run named jobs only; Reserved is for your own local runs.',
          speaker: 'nate',
        },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: "Edit BAYMAX's Status, then use Force health check in the header." },
        { afterS: 120, idle: true, effect: 'text', text: 'Administration › Health-check log shows the SKIPPED (Offline) line.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'orka', route: '/admin/health-check-log', target: 'orka.nav.healthCheckLog', action: 'click' }],
      factIds: ['F105', 'F106'],
    },
    {
      id: 'M06.12',
      kind: 'computer-task',
      hud: "You're going to test WALL-E locally. Reserve it, then build Java/uia-relay-regression-flux with DEVICE_TYPE=FLUX_3 and ROBOT_NAME blank.",
      app: ['orka', 'jenkins'],
      success: c.sequence(
        on('robot.statusChanged', { name: 'wall-e', to: 'RESERVED' }),
        on('robot.checkoutWaiting', { jobId: JOB.regressionFlux }),
        on('robot.statusChanged', { name: 'wall-e', to: 'AVAILABLE' }),
        on('robot.checkedOut', { name: 'wall-e' }),
      ),
      objectives: [
        { id: 'M06.12.reserve', text: 'WALL-E → Reserved', done: c.happened(on('robot.statusChanged', { name: 'wall-e', to: 'RESERVED' })) },
        { id: 'M06.12.build', text: 'Build with DEVICE_TYPE=FLUX_3, ROBOT_NAME blank: watch it wait', done: c.happened(on('robot.checkoutWaiting', { jobId: JOB.regressionFlux })) },
        { id: 'M06.12.release', text: 'Done locally? Set WALL-E back to Available', done: c.sequence(on('robot.checkoutWaiting', { jobId: JOB.regressionFlux }), on('robot.statusChanged', { name: 'wall-e', to: 'AVAILABLE' })) },
        { id: 'M06.12.checkout', text: 'The waiting build checks out WALL-E', done: c.happened(on('robot.checkedOut', { name: 'wall-e' })) },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: "Reserve WALL-E in Orka first, then Build with Parameters in Jenkins and read the console's [orka] lines." },
        { afterS: 120, idle: true, effect: 'text', text: 'DEVICE_TYPE=FLUX_3, ROBOT_NAME empty. Then set WALL-E back to Available and watch the queued build grab it.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'jenkins', route: jobRoute(JOB.regressionFlux, 'build'), target: 'jenkins.param:DEVICE_TYPE', action: 'type', text: 'FLUX_3' }],
      factIds: ['F112', 'F113', 'F095'],
    },
    {
      id: 'M06.13',
      kind: 'computer-task',
      hud: 'ROSIE is Unavailable (PayCrest standalone). Build Java/uia-relay-regression-flux with DEVICE_TYPE=FLUX_POCKET and ROBOT_NAME blank.',
      app: 'jenkins',
      route: jobRoute(JOB.regressionFlux, 'build'),
      success: c.all(
        c.happened(on('robot.checkedOut', { name: 'rosie', byName: true })),
        c.happened(on('robot.released', { name: 'rosie', statusAfter: 'UNAVAILABLE' })),
        c.status('rosie', 'UNAVAILABLE'),
        c.not(c.happened(playerSet('rosie'))),
      ),
      objectives: [
        {
          id: 'M06.13.blank',
          text: 'Blank ROBOT_NAME: no Available FLUX_POCKET robot',
          done: c.any(c.happened(on('orka.checkoutRejected', { jobId: JOB.regressionFlux })), c.happened(on('robot.checkoutWaiting', { jobId: JOB.regressionFlux }, (pl) => pl.label.includes('FLUX_POCKET') || pl.reasons.some((r) => r.includes('rosie'))))),
        },
        { id: 'M06.13.named', text: 'Rebuild with ROBOT_NAME=rosie', done: c.happened(on('robot.checkedOut', { name: 'rosie', byName: true })) },
        { id: 'M06.13.reset', text: 'After the build, Orka puts ROSIE back to Unavailable by itself', done: c.happened(on('robot.released', { name: 'rosie', statusAfter: 'UNAVAILABLE' })) },
      ],
      wrongActions: [
        {
          id: 'open-rosie',
          on: playerSet('rosie', 'AVAILABLE'),
          say: "Don't open ROSIE to general pipelines. Name it in ROBOT_NAME instead; Orka resets it to Unavailable when the job ends.",
          speaker: 'nate',
          gw: 'GW05',
        },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'Read the console: general jobs never check out an Unavailable robot.' },
        { afterS: 120, idle: true, effect: 'text', text: "Build again with ROBOT_NAME=rosie, the robot's exact unique Name." },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'jenkins', route: jobRoute(JOB.regressionFlux, 'build'), target: 'jenkins.param:ROBOT_NAME', action: 'type', text: 'rosie' }],
      factIds: ['F102', 'F103', 'F104'],
    },
    {
      id: 'M06.14',
      kind: 'dialogue',
      speaker: 'nate',
      text: 'Unavailable keeps general jobs off special rigs like PayCrest\'s standalone setups, so nobody overwrites their merchant profiles. Name the robot exactly and you get it; when your job ends, Orka flips it back to Unavailable for you. Offline skips health checks. Reserved blocks Jenkins and health-check overrides while you work locally.',
      factIds: ['F102', 'F103', 'F104', 'F106', 'F113'],
    },
    { id: 'M06.15', kind: 'quiz-checkpoint', checkpointId: 'CP-M06.1', title: 'Orka & Statuses', questionIds: ['Q078', 'Q079', 'Q084', 'Q086', 'Q088', 'Q091', 'Q101'] },
  ],
};
