/**
 * M18 — Teams, History & the Capstone Shift (Cur §2 M18). Mentor {{morgan}}, cameos {{jared}}, {{tate}}.
 * Capstone (no hints), injected during the lesson (Sim §4.4.2):
 *  - step 8: `callus.down { host: 'minix-01', mode: 'box-off' }` → every Rack A rig fails its health check
 *    with `502 … callus upstream 10.42.20.1:9000 unreachable`; the lesson points at BUMBLEBEE;
 *  - step 9: `rig.lockReleased { rig: 'seti' }` (a coworker bumps SETI's arm);
 *  - step 10: `jenkins.envCase` on `Java/uia-remote-regression-mini` (`mini_3`) + a build of that job.
 */
import { c, on, p } from '../../types';
import type { HintDef, LessonDef } from '../../types';
import { JOB, bark, clearFaults, finished, inject, minigameDone, queued, say } from './helpers';

const NO_HINTS: readonly HintDef[] = [];

export const M18: LessonDef = {
  moduleId: 'M18',
  mentor: 'morgan',
  setup: { preset: 'academy:M18', spawn: 'loc.workstation', apps: { unlock: 'all', forceHealthCheck: true } },
  deck: 'deck.M18',
  manualChapters: ['Teams & History', 'Troubleshooting'],
  realLabChecklist: [
    'Know who built what: the Semi Team made POS SDKs and the USB / Secure Network Pay Display apps; the Sedi QA Team tested them with Lester; uia-remote came next, now used with IPX and adopted by PayCore (LabSim Dining).',
    'Prove pipelines with one reliable Visa profile plus Interac for Canada; PayCore runs the full Visa / Discover / AmEx matrix.',
    'Connection Failed: read the Notes. A 502 from the Pi naming the Callus upstream means the Minix box is down, not the Pi. Escalate to {{jared}} with the evidence; never override the status.',
    'Yellow banner: walk to the rig and press Park All. Lower-case enum in a job: fix it to ALL CAPS and rebuild.',
  ],
  steps: [
    { id: 'M18.01', kind: 'walk-to', hud: 'Meet {{morgan}} at the team history wall', location: 'loc.history-wall' },
    {
      id: 'M18.02',
      kind: 'inspect',
      hud: 'Read the SEMI TEAM frame',
      prop: 'prop.history.semi',
      callouts: ['SEMI TEAM: third-party POS SDKs · USB Pay Display · Secure Network Pay Display (link MFDs and CFDs over USB or the local network)'],
      manualEntryIds: ['teams-and-history'],
      factIds: ['F157', 'F052', 'F053'],
    },
    {
      id: 'M18.02a',
      kind: 'inspect',
      hud: 'Read the SEDI frame',
      prop: 'prop.history.sedi',
      callouts: ["SEDI (QA) TEAM: tested Semi's apps with the Lester framework"],
      factIds: ['F158', 'F043'],
    },
    {
      id: 'M18.03',
      kind: 'dialogue',
      speaker: 'morgan',
      text: 'Once upon a time the Semi Team built third-party POS SDKs and the remote pay display apps, and the Sedi QA Team tested them with Lester. Lester became Pigeon. But nothing could automate native tethered setups, so I built uia-remote.',
      factIds: ['F157', 'F158', 'F043', 'F159'],
    },
    {
      id: 'M18.04',
      kind: 'inspect',
      hud: 'Read the IPX frame',
      prop: 'prop.history.ipx',
      callouts: ['IPX: Integrated Payment Experience. uia-remote tests standalone + tethered across Register, Orders, Authorizations, Sale, Transactions, Setup'],
      factIds: ['F160', 'F161'],
    },
    {
      id: 'M18.05',
      kind: 'inspect',
      hud: 'Read the PAYCORE frame',
      prop: 'prop.history.paycore',
      callouts: ['PAYCORE: adopted uia-remote for LabSim Dining · back-to-back card matrices (Visa, Discover, AmEx) · standalone rigs kept Unavailable'],
      factIds: ['F162', 'F226', 'F103'],
    },
    {
      id: 'M18.06',
      kind: 'interact',
      hud: 'Match each team to what it does',
      target: 'prop.history.match',
      success: minigameDone('history-match', 5),
      factIds: ['F157', 'F158', 'F161', 'F162', 'F222'],
    },
    {
      id: 'M18.07',
      kind: 'dialogue',
      speaker: 'morgan',
      text: 'And remember the card philosophy: we prove pipelines with one reliable Visa profile, plus Interac for Canada. PayCore runs the whole matrix. Different jobs, different needs. Ready for your capstone? Three things will break in the next fifteen minutes. No hints.',
      factIds: ['F224', 'F225', 'F226'],
    },
    {
      id: 'M18.08',
      kind: 'computer-task',
      hud: 'Capstone 1: something is wrong with BUMBLEBEE',
      app: 'orca',
      route: '/robot',
      hints: NO_HINTS,
      offerFastForward: true,
      onEnter: [inject({ faultId: 'callus.down', params: { host: 'minix-01', mode: 'box-off' } })],
      success: c.all(c.status('bumblebee', 'CONNECTION_FAILED'), c.appAction('orca', 'orca.robot.notesViewed', (d) => d.name === 'bumblebee')),
      objectives: [
        { id: 'M18.08.cf', text: 'BUMBLEBEE: Connection Failed', done: c.status('bumblebee', 'CONNECTION_FAILED') },
        { id: 'M18.08.notes', text: "Read BUMBLEBEE's Notes", done: c.appAction('orca', 'orca.robot.notesViewed', (d) => d.name === 'bumblebee') },
      ],
      wrongActions: [
        {
          id: 'override',
          on: on('robot.statusChanged', { name: 'bumblebee', to: 'AVAILABLE' }, (pl) => pl.actor === 'player'),
          say: 'Never paper over a failed ping. Read the Notes and escalate.',
          speaker: 'tate',
          gw: 'GW24',
        },
      ],
      factIds: ['F107', 'F109', 'F110'],
    },
    {
      id: 'M18.08a',
      kind: 'interact',
      hud: 'Escalate BUMBLEBEE',
      target: 'npc.jared',
      hints: NO_HINTS,
      prompt: 'Notes: GET http://10.42.10.13:8000/health → 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"}',
      success: c.all(c.happened(on('dialogue.choiceMade', { choiceId: 'callus', correct: true })), c.not(c.happened(on('robot.statusChanged', { name: 'bumblebee' }, (pl) => pl.actor === 'player')))),
      choices: [
        {
          id: 'callus',
          text: 'BUMBLEBEE is Connection Failed: the Pi answers 502 because the Minix box running Callus at 10.42.20.1 is unreachable.',
          correct: true,
          response: [{ speaker: 'jared', text: 'Good read. The Pi is fine, MINIX-01 is off. Powering it back up now.' }],
        },
        {
          id: 'pi',
          text: "BUMBLEBEE's Pi crashed.",
          correct: false,
          response: [{ speaker: 'jared', text: 'A crashed Pi does not answer at all. This one answered with a 502. Read what it says is unreachable.' }],
        },
        {
          id: 'override',
          text: 'Set BUMBLEBEE to Available.',
          correct: false,
          response: [{ speaker: 'tate', text: 'Never paper over a failed ping. Hardware goes to {{jared}}.' }],
        },
      ],
      onComplete: [{ do: 'npc', npc: 'jared', action: 'fix', target: 'prop.minix-01' }, clearFaults('callus.down'), { do: 'npc', npc: 'jared', action: 'idle' }],
      factIds: ['F110', 'F111', 'F049'],
    },
    {
      id: 'M18.09',
      kind: 'interact',
      hud: "Capstone 2: SETI's banner just turned yellow",
      target: 'prop.seti.tablet',
      hints: NO_HINTS,
      onEnter: [inject({ faultId: 'rig.lockReleased', params: { rig: 'seti' } }), bark('sam', "Oops, sorry! I bumped SETI's arm on my way past.")],
      success: c.all(c.eq(p.rig('seti').banner, 'GREEN'), c.eq(p.rig('seti').homed, true)),
      wrongActions: [
        {
          id: 'partial-park',
          on: on('rig.command', { rigId: 'seti' }, (pl) => pl.command === 'park.x' || pl.command === 'park.y' || pl.command === 'park.xy'),
          say: 'Only Park All clears it.',
          speaker: 'jared',
        },
      ],
      factIds: ['F231', 'F232'],
    },
    {
      id: 'M18.10',
      kind: 'computer-task',
      hud: 'Capstone 3: Java/uia-remote-regression-mini just failed',
      app: 'jenkins',
      hints: NO_HINTS,
      onEnter: [
        inject({ faultId: 'jenkins.envCase', params: { job: JOB.regressionMini, value: 'mini_3' } }),
        inject({ op: 'jenkins.startBuild', params: { job: JOB.regressionMini, by: 'jenkins' } }),
      ],
      success: c.sequence(queued(JOB.regressionMini, { DEVICE_TYPE: 'MINI_3' }), finished(JOB.regressionMini, 'SUCCESS')),
      factIds: ['F122', 'F121'],
    },
    {
      id: 'M18.10a',
      kind: 'script',
      actions: [say('tate', 'Three for three. Read the evidence, escalate hardware, Park All, fix the enum. That is a normal Tuesday here.')],
    },
    { id: 'M18.11', kind: 'quiz-checkpoint', checkpointId: 'CP-M18.1', title: 'Teams & History', questionIds: ['Q369', 'Q370', 'Q373', 'Q375', 'Q377'] },
    {
      id: 'M18.12',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "That's the Academy. You can walk into the real lab tomorrow and not break anything, which is more than I could say on my first day. Certification exams are unlocked on your desk.",
    },
  ],
};
