/**
 * GP §3.5 INC43–INC50: Flex 1 rollback, the Mini 3 hot-swap for a dead Duo 2, tethered MFD/CFD
 * relations (missing / cloned / link down), a stale reservation, the Westers capability conflict and the
 * Laz/Ubi merchant switch.
 */
import type { IncidentDef } from '../../types';
import { c, on, p } from '../../types';
import {
  F,
  OP,
  P,
  buildWith,
  dc,
  dev,
  gw,
  hrn,
  orcaSave,
  reply,
  rig,
  statusTo,
  sym,
  teach,
  wm,
} from './helpers';

const SMOKE_JOB = 'Java/uia-remote-printerless-smoke';
const TAX_JOB = 'Java/uia-remote-tethered-tax';
const PIN_JOB = 'Java/contact-canada-pin-sale';
const LAZ_JOB = 'Java/laz-oobe-merchant-swap';

export const INC43: IncidentDef = {
  id: 'INC43',
  name: 'Roll back to Flex 1',
  difficulty: 2,
  base: 300,
  parS: 150,
  severity: 'P1',
  rigs: { roles: ['flex-legacy'], default: 'johnny-5', scope: 'rig', describe: 'JOHNNY-5 after INC42 (or seeded)' },
  escalatable: false,
  unlockedBy: 'M07',
  tags: ['orca.device'],
  factIds: ['F119', 'F120'],
  ticket: { title: (b) => P(`The Flex 2 build has a regression — roll ${hrn(b)} back to the Flex 1 now`), reporter: 'jared' },
  setup: () => ({
    scenario: [
      OP('device.swap', { rig: '$R', deviceId: 'dev-spare-flex2' }),
      OP('orca.createDevice', { name: '$R-flex2', deviceType: 'FLEX_2', serial: 'SIM-F2-000015', ip: '10.42.30.15' }),
      OP('orca.linkDevice', { robot: '$R', device: '$R-flex2' }),
    ],
  }),
  reveal: 'immediate',
  symptoms: [
    sym('Orca', (b) => `${hrn(b)} → Robot Device ${rig(b)}-flex2 (FLEX_2); the legacy row ${String(b.vars.device)} (FLEX_1) is still there.`),
    sym('World', (b) => `${hrn(b)} holds the Flex 2; the Flex 1 sits on the storage shelf.`),
  ],
  diagnosisPath: ['The legacy Device row still exists — that is what it is for.', 'Swap the Flex 1 back into the cradle.', 'Robot Device = the Flex 1 row; confirm with a build.'],
  hints: [
    'You kept the old Device row for exactly this moment.',
    (b) => `Orca → ${hrn(b)} → Robot Device dropdown; the Flex 1 is on the storage shelf.`,
    (b) => `Swap the Flex 1 back (MOTOR off, cradle bolts, PSU on the AC strip), set Robot Device = ${String(b.vars.device)}, Park All, Available, build.`,
  ],
  fix: { handsOn: (b) => `Swap the Flex 1 back (INC42 steps 2–3) and set Robot Device = ${String(b.vars.device)} ("rolling back is one dropdown").` },
  success: (b) => c.all(c.eq(p.robot(rig(b)).deviceId, String(b.vars.device)), c.status(rig(b), 'AVAILABLE'), c.nextBuild({ robots: [rig(b)] })),
  diagnosisCall: 'none',
  wrongButTempting: [
    wm(
      'new-flex1-row',
      'Create a new FLEX_1 row',
      50,
      orcaSave('device', { action: 'create', test: (pl, s) => s.lab.orca.devices[pl.id as number]?.deviceType === 'FLEX_1' }),
      teach('The legacy row exists for exactly this.', 'Decoupling the Device from the Robot keeps legacy configurations intact for quick rollbacks. (Ref §3)', 'Pick the existing Flex 1 row in Robot Device.'),
    ),
  ],
  teaches: 'Ref §3: decoupling the Device entity enables quick rollbacks.',
};

export const INC44: IncidentDef = {
  id: 'INC44',
  name: 'Hot-swap equivalent: Mini 3 for a dead printerless Duo 2',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P2',
  rigs: { candidates: ['k-9'], default: 'k-9', scope: 'rig', describe: 'K-9 (off-screen STATION_DUO_2) → DATA/BUMBLEBEE' },
  escalatable: false,
  unlockedBy: 'M11',
  plannedWork: true,
  tags: ['hw.devices', 'orca.devicetype', 'jenkins.envvars', 'orca.status.offline'],
  factIds: ['F057', 'F122', 'F105', 'F055'],
  processBonuses: ['PB01'],
  ticket: { title: P("K-9's Duo 2 died (RMA). Keep printerless-smoke running today."), reporter: 'jared' },
  setup: () => ({ scenario: [F('device.dead', { device: '$DEV' }), OP('jenkins.startBuild', { job: SMOKE_JOB, by: 'jenkins' })] }),
  reveal: 'immediate',
  onSpawn: () => [{ do: 'chat', author: 'jared', text: 'Mini 3 is our hot-swap for the printerless Duo 2.', delayS: 15 }],
  symptoms: [
    sym('Jenkins', "Red on k-9: adb: failed to connect to '10.42.30.51:5444': No route to host"),
    sym('Orca', 'K-9 Available (its Pi is fine).'),
    sym('LabChat', P('{{jared}}: "Mini 3 is our hot-swap for the printerless Duo 2."')),
  ],
  diagnosisPath: ['The device behind K-9 is dead and goes for RMA.', 'Take K-9 out of the pool: Offline.', 'Run the job on the hot-swap equivalent: DEVICE_TYPE=MINI_3.'],
  hints: [
    'Which device family stands in for a printerless Duo 2?',
    'Orca → K-9 → Offline; Jenkins → Java/uia-remote-printerless-smoke → Build with Parameters → DEVICE_TYPE.',
    'K-9 → Offline, then rebuild with DEVICE_TYPE=MINI_3 (exact ALL-CAPS enum) → [orca] checkout → data (MINI_3) OK.',
  ],
  fix: { handsOn: 'K-9 → Offline (PB01, pending RMA) → rebuild with DEVICE_TYPE=MINI_3 → [orca] checkout → data (MINI_3) OK (or BUMBLEBEE).' },
  success: () => c.all(c.status('k-9', 'OFFLINE'), c.nextBuild({ jobs: [SMOKE_JOB], robots: ['data', 'bumblebee'] })),
  diagnosisCall: dc(
    'Duo 2 dead; run on its hot-swap equivalent, a Mini 3',
    ["K-9's Pi crashed", 'Orca shows K-9 Available — its Pi answers. "No route to host" is the device.'],
    ['Port', 'Nothing answered at that IP at all.'],
    ['Merchant', 'The build never reached the merchant — it could not reach the device.'],
  ),
  wrongButTempting: [
    wm('pocket', 'DEVICE_TYPE=FLEX_POCKET', 50, buildWith(SMOKE_JOB, (pp) => pp.DEVICE_TYPE === 'FLEX_POCKET'), teach('Printerless but not the equivalent — layout failures.', 'The Mini 3 is the hot-swap equivalent for the printerless Duo 2. (Ref §1)', 'DEVICE_TYPE=MINI_3.')),
    wm('mini2', 'DEVICE_TYPE=MINI_2', 50, buildWith(SMOKE_JOB, (pp) => pp.DEVICE_TYPE === 'MINI_2'), teach('Not the hot-swap equivalent.', 'The Mini 3 stands in for the printerless Duo 2. (Ref §1)', 'DEVICE_TYPE=MINI_3.')),
    gw('retype-row', 'GW10', "Change K-9's Device row to MINI_3"),
    wm('lowercase', 'DEVICE_TYPE=mini_3', 0, buildWith(SMOKE_JOB, (pp) => pp.DEVICE_TYPE === 'mini_3'), teach('No enum constant … DeviceType.mini_3', 'Device Type is an enum — Jenkins env vars must be ALL CAPS. (Ref §3)', 'DEVICE_TYPE=MINI_3.')),
  ],
  teaches: 'Ref §1: the Mini 3 is the hot-swap equivalent for the printerless Duo 2; enum values are ALL CAPS; Offline for rigs out of service.',
};

export const INC45: IncidentDef = {
  id: 'INC45',
  name: 'Tethered rig treated as standalone (MFD empty)',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P1',
  rigs: { roles: ['tethered'], default: 'optimus', scope: 'rig', describe: '`tethered` (default OPTIMUS)' },
  escalatable: false,
  unlockedBy: 'M07',
  tags: ['orca.tethered', 'uia.multidevice'],
  factIds: ['F126', 'F127', 'F128', 'F190'],
  ticket: { title: (b) => `tethered-tax on ${hrn(b)}: 'TaxTest requires a tethered rig'`, reporter: 'jenkins-bot' },
  setup: (b) => ({
    scenario: [F('orca.tetherCleared', { robot: '$R' }), OP('jenkins.startBuild', { job: TAX_JOB, params: { ROBOT_NAME: '$R', BACKEND_ENV: rig(b) === 'megatron' ? 'DEV1' : 'STG' } })],
  }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', 'env RUN_TYPE=standalone · [runner] MFD relation empty → standalone · AssertionError: TaxTest requires a tethered rig (MFD/CFD)'),
    sym('Orca', 'USB Tethered Device Configuration shows MFD and CFD blank.'),
  ],
  diagnosisPath: ['The runner decided "standalone" from Orca\'s data.', 'Orca → USB Tethered Device Configuration: MFD and CFD are blank.', 'Populate both and rebuild.'],
  hints: [
    'How does a pipeline decide a rig is tethered?',
    (b) => `Orca → ${hrn(b)} → USB Tethered Device Configuration.`,
    (b) => `MFD = ${rig(b)}-mfd, CFD = ${rig(b)}-cfd → Save ("Tethered: MFD populated") → rebuild tethered-tax.`,
  ],
  fix: { handsOn: (b) => `MFD = ${rig(b)}-mfd, CFD = ${rig(b)}-cfd → banner "Tethered: MFD populated".` },
  success: (b) =>
    c.all(c.eq(p.robot(rig(b)).mfdDeviceId, `${rig(b)}-mfd`), c.eq(p.robot(rig(b)).cfdDeviceId, `${rig(b)}-cfd`), c.nextBuild({ pipeline: 'PL2', robots: [rig(b)] })),
  diagnosisCall: dc(
    'MFD relation missing, so the pipeline treated the rig as standalone',
    ['CFD unplugged', 'The runner never tried the CFD — it decided standalone first. Why?'],
    ['Port', 'Nothing failed to connect. Read the RUN_TYPE line.'],
    ['Runner bug', 'The runner followed Orca\'s data: MFD empty ⇒ standalone.'],
  ),
  wrongButTempting: [
    wm('runtype-param', 'Look for a runType field in Orca / force RUN_TYPE=tethered as a job param', 100, undefined, teach('There is no runType field in Orca; forcing it still fails.', 'If MFD is populated, the pipeline treats the rig as tethered. (Ref §3)', 'Populate MFD and CFD.')),
    wm('swap-mfd-cfd', 'Swap MFD and CFD', 0, undefined, teach('Red — the roles are reversed.', 'MFD = Merchant Facing Device, CFD = Customer Facing Device. (Ref §3)', 'MFD = the -mfd row, CFD = the -cfd row.')),
  ],
  teaches: 'Ref §3: if MFD is populated, the pipeline treats the rig as tethered (Station 2 + Mini 2 on MEGATRON, nested Mini 3s on OPTIMUS).',
};

export const INC46: IncidentDef = {
  id: 'INC46',
  name: 'Standalone rig treated as tethered (MFD populated)',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P1',
  rigs: { candidates: ['tars', 'data'], default: 'tars', scope: 'rig', describe: 'standalone rigs (default TARS)' },
  escalatable: false,
  unlockedBy: 'M07',
  tags: ['orca.tethered'],
  factIds: ['F128', 'F126', 'F119'],
  ticket: { title: (b) => `${hrn(b)} hangs at start: 'waiting for CFD'`, reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('orca.tetherCloned', { robot: '$R', from: 'optimus' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', '[runner] Tethered rig detected (MFD populated) → MFD 10.42.30.23:5444, CFD 10.42.30.24:5444 — OPTIMUS\'s devices'),
    sym('Camera', "OPTIMUS's screens move during the job (cross-talk)."),
  ],
  diagnosisPath: ['The runner drove another rig\'s devices.', 'Orca: this standalone rig has MFD/CFD relations copied from OPTIMUS.', 'Clear them; keep its own Robot Device.'],
  hints: [
    'Whose devices did the runner connect to?',
    (b) => `Orca → ${hrn(b)} → USB Tethered Device Configuration.`,
    (b) => `Clear MFD and CFD on ${hrn(b)}; Robot Device stays ${String(b.vars.device)}; rebuild.`,
  ],
  fix: { handsOn: (b) => `Clear MFD and CFD; Robot Device stays ${String(b.vars.device)}.` },
  success: (b) =>
    c.all(
      c.eq(p.robot(rig(b)).mfdDeviceId, null),
      c.eq(p.robot(rig(b)).cfdDeviceId, null),
      c.eq(p.robot(rig(b)).deviceId, String(b.vars.device)),
      c.nextBuild({ robots: [rig(b)] }),
    ),
  diagnosisCall: dc(
    'MFD populated on a standalone rig',
    ['Shelf Pi crashed', 'The runner connected — to the wrong devices. Read the handle lines.'],
    ['Port 5555', 'The handles use 5444. Whose IPs are they?'],
    ['Shared camera', 'The camera only shows the cross-talk; the runner chose those devices from Orca\'s relations.'],
  ),
  wrongButTempting: [
    wm('optimus-unavailable', 'Set OPTIMUS Unavailable to stop the cross-talk', 100, statusTo('optimus', 'UNAVAILABLE'), teach('That treats the symptom.', 'If MFD is populated, the pipeline treats the rig as tethered. (Ref §3)', 'Clear the copied MFD/CFD relations.')),
  ],
  teaches: 'Ref §3: MFD populated ⇒ tethered.',
};

export const INC47: IncidentDef = {
  id: 'INC47',
  name: 'Tethered pair lost its link (Pay Display)',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P1',
  // Sim App. A deviation: OPTIMUS runs Secure Network Pay Display, so the USB variant binds MEGATRON.
  rigs: { candidates: ['megatron'], default: 'megatron', scope: 'rig', describe: '`tethered` (A: MEGATRON USB Pay Display; B: OPTIMUS Secure Network Pay Display)' },
  escalatable: false,
  unlockedBy: 'M14',
  tags: ['semi.paydisplay', 'orca.tethered', 'uia.taxtest'],
  factIds: ['F052', 'F053', 'F185', 'F239'],
  ticket: { title: (b) => `${hrn(b)} CFD stuck on 'Waiting for merchant device…'`, reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('tether.linkDown', { robot: '$R', cable: 'usb' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', '[CFD_O1] waitForScreen timed out (CustomerOrderScreen)'),
    sym('Camera', 'The CFD shows "Waiting for merchant device…" [illus.]'),
    sym('World', (b) => `Black 3D-printed docks labelled ${hrn(b)} MFD / ${hrn(b)} CFD; a white hub with a dangling USB cable.`),
  ],
  diagnosisPath: ['The CFD never received the order — it is waiting for its merchant device.', 'Orca relations are fine; look at the physical link.', 'Re-seat the cable on the labelled hub.'],
  hints: [
    'The CFD is waiting for its merchant device. What connects the two?',
    (b) => `Tethered rack → ${hrn(b)} MFD / CFD docks → the hubs' cables.`,
    'Re-seat the loose cable on the labelled hub, then rebuild tethered-tax.',
  ],
  fix: { handsOn: 'Re-seat the cable on the labelled hub.' },
  success: (b) => c.all(c.eq(p.link(`dev-${rig(b)}-mfd`, `dev-${rig(b)}-cfd`), 'UP'), c.nextBuild({ pipeline: 'PL2', robots: [rig(b)] })),
  diagnosisCall: dc(
    'MFD–CFD pay-display link down',
    ['MFD relation missing in Orca', 'Orca knows both devices — the runner reached the CFD. Read what the CFD says.'],
    ['Teardown missing', 'A missing teardown leaves the MFD off HomeScreen. Here the CFD is waiting for the MFD.'],
    ['CFD OCR', 'There is no OCR on this rig; the CFD is waiting for its merchant device.'],
  ),
  wrongButTempting: [
    wm('edit-relations', 'Edit the Orca relations', 50, orcaSave('robot', { fields: ['mfdDeviceId', 'cfdDeviceId'] }), teach('They were correct.', 'USB Pay Display / Secure Network Pay Display link the MFD and CFD over USB or the local network. (Ref §1)', 'Re-seat the link cable.')),
    gw('reboot-shelf-pi', 'GW17', 'Reboot the shelf Pi (also hits the other tethered rig)'),
  ],
  teaches: 'Ref §1: USB Pay Display and Secure Network Pay Display (Semi Team) link MFDs and CFDs over USB or the local network.',
  variants: [
    {
      id: 'B',
      label: 'Secure Network Pay Display: CFD hub Ethernet unplugged (OPTIMUS)',
      overrides: {
        rigs: { candidates: ['optimus'], default: 'optimus', scope: 'rig', describe: 'OPTIMUS (Secure Network Pay Display)' },
        setup: () => ({ scenario: [F('tether.linkDown', { robot: '$R', cable: 'ethernet' })] }),
        symptoms: [
          sym('Jenkins', '[CFD_O1] waitForScreen timed out (CustomerOrderScreen)'),
          sym('Camera', 'The CFD shows "Waiting for merchant device…" [illus.]'),
          sym('World', 'The CFD hub\'s Ethernet LEDs are dark.'),
        ],
        hints: [
          'The CFD is waiting for its merchant device. What connects the two on this rig?',
          'Tethered rack → OPTIMUS CFD hub → Ethernet LEDs.',
          'Re-seat the CFD hub\'s Ethernet cable, then rebuild tethered-tax.',
        ],
      },
    },
  ],
};

export const INC48: IncidentDef = {
  id: 'INC48',
  name: 'Stale Reserved blocking a pipeline',
  difficulty: 2,
  base: 250,
  parS: 150,
  severity: 'P1',
  rigs: { candidates: ['eve'], default: 'eve', scope: 'rig', describe: 'any (default EVE)' },
  escalatable: false,
  unlockedBy: 'M06',
  tags: ['orca.status.reserved', 'jenkins.checkout', 'orca.status'],
  factIds: ['F112', 'F113'],
  processBonuses: ['PB06'],
  ticket: { title: 'uia-remote-regression-flex (FLEX_4) waiting forever', reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('orca.staleReservation', { robot: '$R', by: 'riley' })] }),
  reveal: 'immediate',
  symptoms: [
    sym('Jenkins', (b) => `[orca] candidate ${rig(b)}: Reserved — skipped · [orca] no Available ${String(b.vars.deviceType)} robot — build waiting in queue`),
    sym('Orca', (b) => P(`${hrn(b)} Reserved ({{riley}}, 2026-10-04 17:42).`)),
  ],
  diagnosisPath: ['The rig has been Reserved since yesterday.', 'Reservations belong to their engineer: ask first.', 'Release only when the owner says so.'],
  hints: [
    'Who reserved the rig, and when?',
    P('LabChat: ask {{riley}} whether the run is still going.'),
    P('Ask {{riley}} first; if the run is finished, set the rig Available.'),
  ],
  fix: { handsOn: (b) => P(`LabChat {{riley}} "Still using ${hrn(b)}?" → "Oh no, forgot — release it." → set Available.`) },
  replies: {
    wrongPenalty: 50,
    to: 'riley',
    options: [
      reply('R_ASK', 'Still using the rig? Jenkins is waiting for it.', true, { response: { author: 'riley', text: 'Oh no, forgot — release it.', delayS: 12 } }),
      reply('R_RELEASED', "I've released your rig.", false, { teach: teach('You acted before asking.', 'Reserved rigs belong to the engineer running locally. (Ref §3)', 'Ask first, then release.') }),
    ],
  },
  success: (b) =>
    c.all(
      c.label(c.sequence(on('ticket.replied', { replyId: 'R_ASK' }), on('robot.statusChanged', { name: rig(b), to: 'AVAILABLE' })), 'Asked before releasing'),
      c.status(rig(b), 'AVAILABLE'),
    ),
  diagnosisCall: dc(
    'Leftover reservation from a finished local run',
    [(b) => `${hrn(b)} broken`, 'The rig was skipped, not failed: read the candidate line.'],
    ['Job misconfigured', 'The job found a matching rig and skipped it. Why?'],
    ['Orca down', 'Orca answered the checkout and explained the skip.'],
  ),
  wrongButTempting: [gw('release-unasked', 'GW20', 'Release without asking')],
  teaches: 'Ref §3: Reserved blocks Jenkins; ask the owner before touching it (PB06).',
  variants: [
    {
      id: 'B',
      label: 'Still in use — wait',
      overrides: {
        replies: {
          wrongPenalty: 50,
          to: 'riley',
          options: [
            reply('R_WAIT', 'The rig is reserved by an active local run; ETA 2 minutes.', true),
            reply('R_RELEASE_NOW', "I'll release it now.", false, { teach: teach('The run is still active.', 'Reserved blocks Jenkins while an engineer runs locally. (Ref §3)', 'Wait for the owner to release it.') }),
          ],
        },
        onSpawn: () => [{ do: 'chat', author: 'riley', text: 'Still running, 2 more minutes.', delayS: 20 }],
        success: (b) =>
          c.all(
            c.eq(p.ticket.reply, 'R_WAIT'),
            c.label(c.not(c.happened(on('robot.statusChanged', { name: rig(b) }, (pl) => pl.actor === 'player'))), 'Status left alone'),
            c.label(c.held(c.eq(p.ticket.reply, 'R_WAIT'), 120), 'Two minutes waited'),
          ),
      },
    },
  ],
};

export const INC49: IncidentDef = {
  id: 'INC49',
  name: 'Westers capability conflict (dynamic vs non-dynamic)',
  difficulty: 3,
  base: 400,
  parS: 240,
  severity: 'P1',
  rigs: { roles: ['canada'], default: 'seti', scope: 'rig', describe: '`canada` (SETI)' },
  escalatable: false,
  unlockedBy: 'M08',
  tags: ['orca.capabilities', 'hw.devices', 'jenkins.envvars'],
  factIds: ['F132', 'F134', 'F135', 'F061', 'F133'],
  ticket: { title: 'contact-canada-pin-sale checkout error', reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('jenkins.capsConflict', { job: PIN_JOB, value: 'MINI_3' }), OP('jenkins.startBuild', { job: PIN_JOB, by: 'jenkins' })] }),
  reveal: 'immediate',
  symptoms: [
    sym('Jenkins', '[orca] 409 Conflict: capability conflict (pipeline deviceType=MINI_3, test deviceType=COMPACT) [illus.]'),
    sym('IDE', "Pipeline script: def capabilities = [deviceType: 'MINI_3', physicalTouch: true] (copy-paste) vs the test's \"capabilities\": {\"deviceType\": \"COMPACT\", \"physicalTouch\": true}"),
  ],
  diagnosisPath: ['Orca received two capability sources that disagree.', 'The pipeline script hardcodes MINI_3; the test\'s dynamic JSON says COMPACT.', 'Fix the pipeline script: Westers beds run COMPACT.'],
  hints: [
    'The 409 lists two sources for deviceType. Which one is wrong for a Canadian test?',
    'Jenkins → Java/contact-canada-pin-sale → Configure → Pipeline script → def capabilities.',
    "Set deviceType: 'COMPACT' in the pipeline script and rebuild.",
  ],
  fix: { handsOn: "Pipeline script → deviceType: 'COMPACT'; rebuild." },
  success: () => c.all(c.contains(p.job(PIN_JOB).script, "deviceType: 'COMPACT'"), c.nextBuild({ pipeline: 'PL5', robots: ['seti'] })),
  diagnosisCall: dc(
    "The hardcoded pipeline capability contradicts the test's dynamic JSON",
    ['SETI offline', 'The checkout failed before Orca looked at any robot: a capability conflict.'],
    ['Interac card missing', 'No card was used — the build failed at checkout.'],
    ['Case error', 'Both values are proper ALL-CAPS enums; they simply disagree.'],
  ),
  wrongButTempting: [
    wm('delete-dynamic', "Delete the test's dynamic capabilities", 100, on('git.fileEdited', { repo: 'gort' }, (pl) => /contact-canada/.test(pl.path)), teach('Contact Canada scripts use both styles.', 'Both lookup methods are used interchangeably for Contact Canada automation on Westers test beds. (Ref §3)', 'Fix the hardcoded pipeline value.')),
  ],
  teaches: P('Ref §3 Robot Capabilities: dynamic JSON (SDK frameworks, {{david}}) vs non-dynamic (hardcoded in the pipeline script); both are used interchangeably for Contact Canada on Westers beds; COMPACT is the Canadian terminal.'),
};

export const INC50: IncidentDef = {
  id: 'INC50',
  name: 'Merchant switch via Laz OOBE / Ubi',
  difficulty: 3,
  base: 450,
  parS: 300,
  severity: 'P2',
  rigs: { roles: ['canada'], default: 'seti', scope: 'rig', describe: '`canada` (SETI)' },
  escalatable: false,
  unlockedBy: 'M08',
  tags: ['laz.oobe', 'ubi.routing', 'orca.merchant'],
  factIds: ['F046', 'F047', 'F051', 'F137', 'F140'],
  ticket: { title: (b) => `Mid-suite swap of ${hrn(b)} to WESTERS-CA-02 fails`, reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('merchant.ubiRouteWrong', { merchant: 'WESTERS-CA-02', route: 'us-east' }), OP('jenkins.startBuild', { job: LAZ_JOB, params: { ROBOT_NAME: '$R', MERCHANT: 'WESTERS-CA-02' } })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', (b) => `${LAZ_JOB} (ROBOT_NAME=${rig(b)}, MERCHANT=WESTERS-CA-02): ubi: routing merchant switch → WESTERS-CA-02 · ubi: ERROR route us-east cannot resolve merchant WESTERS-CA-02 · FAILURE (Laz never de-provisions)`),
    sym('Orca', 'The Merchant Config table shows Name, Region, PIN Bypass… only.'),
  ],
  diagnosisPath: ['Ubi could not route the merchant switch.', 'The route lives in Merchant Config — but the table hides it.', 'Click Edit, fix the route, rebuild the swap.'],
  hints: [
    'Ubi named the route it tried. Where is a merchant\'s route configured?',
    'Orca → Merchant Config → WESTERS-CA-02 → Edit (the table does not show every field).',
    'Edit → Ubi Route = ca-central → Save → rebuild Java/laz-oobe-merchant-swap → resume the suite.',
  ],
  fix: { handsOn: 'Merchant Config → WESTERS-CA-02 → Edit → Ubi Route = ca-central → Save → rebuild the swap → laz: de-provision · laz: wipe caches · laz: setup wizard 1/6…6/6 · laz: merchant active → resume the suite.' },
  success: (b) =>
    c.all(c.eq(p.merchant('WESTERS-CA-02').ubiRoute, 'ca-central'), c.eq(p.hwDevice(dev(b)).activeMerchant, 'WESTERS-CA-02'), c.nextBuild({ pipeline: 'PL5' })),
  diagnosisCall: dc(
    'Merchant routing config wrong (hidden field — click Edit)',
    ["Device can't be wiped", 'Laz never started de-provisioning: Ubi failed first.'],
    ['Callus offline', 'No card was involved — the routing step failed.'],
    ['SETI Reserved', 'The swap job checked SETI out. Read the ubi line.'],
  ),
  wrongButTempting: [
    wm('wizard-by-hand', 'Walk the device through the setup wizard by hand', 100, undefined, teach('That breaks zero-touch — and fails again at the next switch.', 'Laz runs a zero-touch OOBE: de-provision, wipe caches, setup wizard, swap merchants mid-suite. (Ref §1)', 'Fix the merchant config and rerun Laz.')),
    wm('dup-merchant', 'Create a duplicate merchant row', 50, orcaSave('merchant', { action: 'create' }), teach('Now there are two.', 'Merchant Config hides some fields in the table — click Edit on the row to see all of them. (Ref §3)', 'Edit the existing row.')),
  ],
  teaches: 'Ref §1: Laz zero-touch OOBE (de-provision, wipe caches, setup wizard, swap merchants mid-suite) and Ubi routing. Ref §3 Merchant Config: click Edit to see every field.',
};
