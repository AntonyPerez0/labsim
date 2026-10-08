/**
 * M10 — Card Profiles: Gort, Callus & Collis (Cur §2 M10). Mentor {{jared}}, cameo {{david}}.
 * Setup (`academy:M10` = factory): MINIX-01 (`10.42.20.1`, Callus on `:9000`) serves Rack A; the
 * scheduled task `GortCardSync` is configured (the lesson runs before 10:00, so `schtasks` shows
 * `10/05/2026 10:00:00  Ready`).
 */
import { c, on } from '../../types';
import type { LessonDef } from '../../types';
import { JOB, queued, ran, say } from './helpers';

const MINIX = ['minix-01', 'MINIX-01'] as const;
const PAYCORE_PROFILES = ['AMEX_MATRIX_DIP', 'DISCOVER_MATRIX_DIP'];

export const M10: LessonDef = {
  moduleId: 'M10',
  mentor: 'jared',
  setup: { preset: 'academy:M10', spawn: 'loc.workstation', apps: { unlock: ['orca', 'github', 'terminal', 'jenkins', 'chat'] } },
  deck: 'deck.M10',
  manualChapters: ['Cards & Payments'],
  realLabChecklist: [
    'Collis probes (UL Transaction Security) are expensive card emulators on rear ribbon cables: one probe does swipe, dip and tap. Treat them like gold, and power them from AC strips only.',
    'Callus (also said "Callers" or "Collos") runs on the Windows/Minix boxes, reads card-profile paths from Gort and drives the probes.',
    'Swipe profiles keep raw Track Data in MySQL (captured with a hardware card-reader utility); dip and tap profiles store a path into the Gort repo, cloned to the Windows boxes by a scheduled job.',
    'Prove pipelines with one reliable Visa profile, plus Interac for Canadian flows; the full Visa/Discover/AmEx matrix is PayCore\'s job.',
  ],
  steps: [
    { id: 'M10.01', kind: 'walk-to', hud: 'Meet {{jared}} at the Callus shelf', location: 'loc.callus-shelf' },
    {
      id: 'M10.02',
      kind: 'inspect',
      hud: 'Inspect the Collis probe',
      prop: 'prop.collis-probe-a',
      callouts: ['UL Transaction Security', "Rear ribbon cable → WALL-E's card reader", 'Power: AC strip'],
      manualEntryIds: ['collis-probes'],
      factIds: ['F069', 'F070', 'F229'],
    },
    {
      id: 'M10.03',
      kind: 'dialogue',
      speaker: 'jared',
      text: "Collis probes: high-cost, proprietary card emulators. One probe can fake a mag-stripe swipe, an EMV chip dip and a contactless NFC tap. The ribbon cable out the back runs to the device's card reader. Treat them like gold.",
      factIds: ['F069', 'F070', 'F071'],
    },
    {
      id: 'M10.04',
      kind: 'inspect',
      hud: "What's running on the Minix box?",
      prop: 'prop.minix-01',
      callouts: ['Callus service · listening on :9000 · probes: WALL-E, EVE, BUMBLEBEE, R2-D2'],
      manualEntryIds: ['callus'],
      factIds: ['F049'],
    },
    {
      id: 'M10.05',
      kind: 'dialogue',
      speaker: 'david',
      text: "That's Callus, a microservice on the local Windows and Minix boxes. You'll hear Callers or Collos. Same thing. It reads card profile paths from Gort and drives the Collis probes during virtual card transactions.",
      factIds: ['F048', 'F049', 'F050', 'F097'],
    },
    {
      id: 'M10.06',
      kind: 'computer-task',
      hud: 'Open Card Profiles → VISA_STD_SWIPE',
      app: 'orca',
      route: '/card-profile',
      success: c.appAction('orca', 'orca.cardProfile.viewed', (d) => d.name === 'VISA_STD_SWIPE'),
      showMe: [{ app: 'orca', route: '/card-profile', target: 'orca.cardProfiles.row:VISA_STD_SWIPE', action: 'click', caption: 'Swipe: Track Data inline' }],
      factIds: ['F145'],
    },
    {
      id: 'M10.07',
      kind: 'computer-task',
      hud: 'Now open VISA_STD_DIP and find where the card lives',
      app: 'orca',
      route: '/card-profile',
      success: c.appAction('orca', 'orca.cardProfile.fieldClicked', (d) => d.name === 'VISA_STD_DIP' && d.field === 'gortPath'),
      showMe: [{ app: 'orca', target: 'orca.cardProfile.field:gortPath', action: 'click', caption: 'cards/emv/visa_std_dip.json' }],
      factIds: ['F147'],
    },
    {
      id: 'M10.08',
      kind: 'dialogue',
      speaker: 'jared',
      text: 'Swipes are easy: raw Track Data text, pulled off a real card with a hardware card-reader utility, sits right in the MySQL table. Dip and tap are files: the profile just stores a path into Gort, our monorepo.',
      factIds: ['F145', 'F146', 'F147', 'F034', 'F035'],
    },
    {
      id: 'M10.09',
      kind: 'computer-task',
      hud: 'Find the dip card file in Gort',
      app: 'github',
      route: '/labsim-lab/gort',
      success: c.appAction('github', 'github.file.viewed', (d) => d.repo === 'gort' && d.path === 'cards/emv/visa_std_dip.json'),
      showMe: [{ app: 'github', route: '/labsim-lab/gort', target: 'github.fileRow:cards', action: 'click' }],
      factIds: ['F035', 'F034', 'F018'],
    },
    {
      id: 'M10.10',
      kind: 'computer-task',
      hud: 'Check the scheduled clone on MINIX-01',
      app: 'terminal',
      success: c.all(ran(/^schtasks \/query \/tn "?GortCardSync"?$/i, { hosts: MINIX }), ran(/^dir C:\\gort\\cards\\emv\\?$/i, { hosts: MINIX })),
      objectives: [
        { id: 'M10.10.ssh', text: 'ssh automation@10.42.20.1', done: c.any(c.happened(on('ssh.connected', { hostId: 'minix-01' })), ran(/^ssh automation@10\.42\.20\.1$/)) },
        { id: 'M10.10.task', text: 'schtasks /query /tn GortCardSync', done: ran(/^schtasks \/query \/tn "?GortCardSync"?$/i, { hosts: MINIX }) },
        { id: 'M10.10.dir', text: 'dir C:\\gort\\cards\\emv', done: ran(/^dir C:\\gort\\cards\\emv\\?$/i, { hosts: MINIX }) },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'schtasks /query /tn GortCardSync' }],
      onComplete: [say('jared', 'There it is: the Gort card files cloned onto the Windows box by the scheduled job. Callus loads them from here. Type exit to get back to your own shell.')],
      factIds: ['F148'],
    },
    {
      id: 'M10.11',
      kind: 'computer-task',
      hud: 'Dip the Visa card into WALL-E through Orca',
      app: 'terminal',
      success: c.happened(on('orca.cardAction', { robotName: 'wall-e', entry: 'DIP', ok: true })),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: "Type exit to leave MINIX-01 first (Windows cmd mangles the JSON quotes). Card actions go through Orca's REST API, just like xy_touch: /api/card/dip with a robot and a profile." },
        { afterS: 120, idle: true, effect: 'text', text: 'curl -X POST http://orca.lab.local:8080/api/card/dip -H "Content-Type: application/json" -d \'{"robot":"wall-e","profile":"VISA_STD_DIP"}\'' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'curl -X POST http://orca.lab.local:8080/api/card/dip -H "Content-Type: application/json" -d \'{"robot":"wall-e","profile":"VISA_STD_DIP"}\'' }],
      onComplete: [
        { do: 'callouts', prop: 'prop.minix-01', lines: ['map cards/emv/visa_std_dip.json → C:\\gort\\cards\\emv\\visa_std_dip.json', 'load virtual card OK', 'probe wall-e: DIP'] },
        say('jared', "Orca called Callus, Callus mapped the Gort path to the local file, loaded the virtual card, and WALL-E's dip arm put the ribbon card in the slot."),
      ],
      factIds: ['F149', 'F050', 'F096', 'F241'],
    },
    {
      id: 'M10.12',
      kind: 'dialogue',
      speaker: 'jared',
      text: 'Our team keeps it simple: one reliable Visa profile to prove the pipeline, plus Canadian Interac for regional flows. PayCore is the opposite. They run back-to-back card matrices: Visa, Discover, AmEx.',
      factIds: ['F224', 'F225', 'F226'],
    },
    {
      id: 'M10.13',
      kind: 'computer-task',
      hud: "Pick card profiles for tonight's runs",
      app: 'jenkins',
      success: c.all(c.happened(queued(JOB.goSdkSmoke, { CARD_PROFILE: 'VISA_STD_DIP' })), c.happened(queued(JOB.canadaPin, { CARD_PROFILE: 'INTERAC_CA_DIP' }))),
      objectives: [
        { id: 'M10.13.us', text: 'Java/go-sdk-sale-smoke → CARD_PROFILE', done: c.happened(queued(JOB.goSdkSmoke, { CARD_PROFILE: 'VISA_STD_DIP' })) },
        { id: 'M10.13.ca', text: 'Java/contact-canada-pin-sale → CARD_PROFILE', done: c.happened(queued(JOB.canadaPin, { CARD_PROFILE: 'INTERAC_CA_DIP' })) },
      ],
      wrongActions: [
        {
          id: 'paycore-matrix',
          on: on('jenkins.buildQueued', {}, (pl) => (pl.jobId === JOB.goSdkSmoke || pl.jobId === JOB.canadaPin) && PAYCORE_PROFILES.includes(pl.params.CARD_PROFILE ?? '')),
          say: "That's PayCore's matrix. We prove the pipeline with one reliable Visa, plus Interac for Canada.",
        },
        {
          id: 'swapped',
          on: on('jenkins.buildQueued', {}, (pl) => (pl.jobId === JOB.goSdkSmoke && pl.params.CARD_PROFILE === 'INTERAC_CA_DIP') || (pl.jobId === JOB.canadaPin && pl.params.CARD_PROFILE === 'VISA_STD_DIP')),
          say: 'Interac is for the Canadian flow. The US smoke runs on the standard Visa.',
        },
      ],
      factIds: ['F224', 'F225', 'F226'],
    },
    { id: 'M10.14', kind: 'quiz-checkpoint', checkpointId: 'CP-M10.1', title: 'Cards', questionIds: ['Q189', 'Q190', 'Q193', 'Q196', 'Q200', 'Q205', 'Q207'] },
  ],
};
