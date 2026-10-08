/**
 * GP §3.5 INC22–INC28: the misleading "select print" log, a printer test matched to a Flex Pocket,
 * GIMP coordinates for a Pigeon screen compare, a missing JSON comma, the misfiled iOS job, the port
 * 5555 coworker collision and ADB-over-TCP lost after a Laz OOBE.
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
  deviceIp,
  gw,
  hrn,
  orcaSave,
  rig,
  statusTo,
  sym,
  teach,
  truthMm,
  wm,
} from './helpers';

const COMPARE_FILE = 'tests/sale/payment_success_compare.json';
/** APPROVED label rectangle on the FLEX_GEN3 screencap (Sim §2.10.2; supersedes GP's 388/512 example). */
const COMPARE_TRUTH = { x: 208, y: 512, w: 304, h: 40 } as const;
const TIP_FILE = 'tests/sale/tip_sale_print.json';

export const INC22: IncidentDef = {
  id: 'INC22',
  name: 'The misleading "select print" log',
  difficulty: 3,
  base: 450,
  parS: 270,
  severity: 'P1',
  rigs: { candidates: ['johnny-5'], default: 'johnny-5', scope: 'rig', describe: 'printer rigs (default JOHNNY-5, FLEX_1)' },
  escalatable: false,
  unlockedBy: 'M15',
  tags: ['jenkins.logs', 'pigeon.lstr', 'orca.screens'],
  factIds: ['F210', 'F211', 'F142'],
  ticket: { title: (b) => `${hrn(b)}: Pigeon fails at 'select print'`, reporter: 'jenkins-bot', misleading: { title: (b) => `${hrn(b)}'s printer is out of paper?`, reporter: 'alex' } },
  setup: () => ({ scenario: [F('orca.screenLocationTypo', { deviceType: '$T', screen: 'RECEIPT_OPTIONS_4', button: 'Print', yMm: 62.5 })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', 'LSTR step 7/9 "select print" … waiting for printer payload … TIMEOUT after 60 s → FAILED at "select print"'),
    sym('Camera', 'Recorded playback for the build: the plunger hits the gap above "Print".'),
    sym('World', 'The printer has paper and a settings test-print works.'),
    sym('Orca', 'The Print row shows "modified by bulk-import, yesterday".'),
  ],
  diagnosisPath: ['"select print" is only the last step attempted before the payload timeout.', 'The printer works.', 'The camera playback shows a miss.', 'The Orca row was edited by a bulk import — call it and fix it.'],
  hints: [
    'The log names the last step attempted, not necessarily what broke. Does the printer work?',
    (b) => `Camera → ${hrn(b)} → recorded playback of the failed build. Then Orca → Screens → ${String(b.vars.deviceType)} → RECEIPT_OPTIONS_4 → Print.`,
    (b) => {
      const t = truthMm(String(b.vars.deviceType), 'RECEIPT_OPTIONS_4', 'Print');
      return `Measure Print and set its Y to ${t ? t.y.toFixed(1) : 'the measured value'} mm (±0.5); Test tap; rebuild PL3 on ${hrn(b)}.`;
    },
  ],
  fix: { handsOn: (b) => `Measure; set Print's Y to ${truthMm(String(b.vars.deviceType), 'RECEIPT_OPTIONS_4', 'Print')?.y.toFixed(1) ?? '66.5'} mm (±0.5); Test tap.` },
  success: (b) => {
    const t = truthMm(String(b.vars.deviceType), 'RECEIPT_OPTIONS_4', 'Print') ?? { x: 31.2, y: 66.5 };
    const loc = p.screenLocation(String(b.vars.deviceType) as never, 'RECEIPT_OPTIONS_4', 'Print');
    return c.all(c.approx(loc.y, t.y, 0.5), c.approx(loc.x, t.x, 0.5), c.nextBuild({ pipeline: 'PL3', robots: [rig(b)] }));
  },
  diagnosisCall: dc(
    'Stale/incorrect coordinates made the arm miss Print, so no payload arrived',
    ['Printer out of paper', 'The printer prints its own test page. Watch the build playback.'],
    ['The "select print" JSON is invalid', 'Invalid JSON fails at parse time, before any step runs. This run reached step 7.'],
    ['Timeout too short', 'No payload ever arrived — a longer wait changes nothing. Where did the plunger land?'],
  ),
  wrongButTempting: [
    wm('replace-paper', 'Replace the paper', 0, undefined, teach('The printer had paper.', 'A "select print" failure is the last step attempted before the runner timed out waiting for a printer payload — usually outdated coordinates. (Ref §5)', 'Watch where the plunger lands.')),
    wm('raise-timeout', 'Raise the timeout in the JSON', 100, undefined, teach('Still fails.', 'The payload never comes because the print button was never pressed. (Ref §5)', 'Fix the Print coordinates.')),
    gw('offsets', 'GW18', 'Use Offsets'),
  ],
  teaches: 'Ref §5 Misleading Failure Logs: a failure at "select print" was the last step attempted before the runner timed out waiting for a printer payload — typically because outdated coordinates made the arm miss the print button.',
};

export const INC23: IncidentDef = {
  id: 'INC23',
  name: 'Printer test matched to a Flex Pocket',
  difficulty: 3,
  base: 400,
  parS: 210,
  severity: 'P1',
  rigs: { candidates: ['vision'], default: 'vision', scope: 'rig', describe: 'PL6 (gets VISION, Flex Pocket)' },
  escalatable: false,
  unlockedBy: 'M08',
  tags: ['orca.capabilities', 'hw.devices', 'go.sdk'],
  factIds: ['F059', 'F060', 'F131', 'F132', 'F133'],
  processBonuses: ['PB02'],
  ticket: { title: 'go-sdk-sale-smoke red: printer not available', reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('gort.capabilityDropped', { key: 'printer' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', '[orca] checkout → vision (FLEX_POCKET) OK … [go-sdk] PrintReceipt → PRINTER_NOT_AVAILABLE → Finished: FAILURE'),
    sym('Orca', 'Robot Capabilities for vision: {"deviceType":"FLEX_POCKET","printer":false,…}; Match preview for the test lists vision, tars, data.'),
    sym('GitHub', 'The commit diff of go-sdk/tests/sale_receipt.json shows the removed "printer": true line.'),
  ],
  diagnosisPath: ['The checkout picked a Flex Pocket — which has no printer.', 'Robot Capabilities / Match preview: why does the Pocket match?', 'The test\'s dynamic JSON lost its printer requirement (GitHub history).', 'Call it and restore the capability.'],
  hints: [
    'Which robot did the build check out, and does that device have a printer?',
    'Orca → Robot Capabilities → Match preview with the test\'s capabilities; then GitHub → gort → go-sdk/tests/sale_receipt.json history.',
    'Add "printer": true back to the test\'s "capabilities" object, push, and rebuild go-sdk-sale-smoke.',
  ],
  fix: { handsOn: 'IntelliJ or GitHub: add "printer": true back to the test\'s "capabilities" object → Match preview drops vision → rebuild.' },
  success: () =>
    c.all(
      c.eq(p.gitFile('gort', 'go-sdk/tests/sale_receipt.json').json('/capabilities/printer'), true),
      c.nextBuild({ pipeline: 'PL6', robots: ['data', 'tars'] }),
    ),
  diagnosisCall: dc(
    'The test\'s dynamic capabilities no longer require a printer, so it matched the Pocket',
    ["TARS's printer broke", 'The build never ran on TARS. Which robot did it check out?'],
    ['Receipt coordinates stale', 'Stale coordinates time out at "select print"; this device has no printer at all.'],
    ['DEVICE_TYPE case', 'A case error fails checkout with No enum constant. This checkout succeeded.'],
  ),
  wrongButTempting: [
    wm('vision-offline', 'Set VISION Offline', 100, statusTo('vision', 'OFFLINE'), teach('You hid a valid printerless rig.', 'Flex 3, 4 and Pocket share one testing profile; the Pocket simply has no printer. The test must ask for one. (Ref §1, §3)', 'Restore "printer": true in the test\'s capabilities.')),
    wm('vision-unavailable', 'Set VISION Unavailable', 100, statusTo('vision', 'UNAVAILABLE'), teach('You hid a valid printerless rig.', 'Unavailable is for specialised rigs used by named jobs. (Ref §3)', 'Restore "printer": true in the test\'s capabilities.')),
    wm('pin-tars', 'Hardcode ROBOT_NAME=tars', 50, buildWith('Java/go-sdk-sale-smoke', (pp) => pp.ROBOT_NAME === 'tars'), teach('You bypassed capability matching.', 'Dynamic JSON lookups define capabilities inside the test and are parsed at runtime. (Ref §3)', 'Fix the capability in the test definition.')),
  ],
  teaches: P('Ref §1: Flex 3, 4 and Pocket share one testing profile and the Pocket has no printer. Ref §3: dynamic JSON lookups live in the test definition and are parsed at runtime (SDK frameworks, {{david}}). The JSON key is "printer"; Orca matches it against the profile\'s hasPrinter.'),
};

export const INC24: IncidentDef = {
  id: 'INC24',
  name: 'Extract coordinates with GIMP for a Pigeon screen compare',
  difficulty: 3,
  base: 400,
  parS: 300,
  severity: 'P2',
  rigs: { candidates: ['eve'], default: 'eve', scope: 'rig', describe: 'ADB-visible rigs (default EVE)' },
  escalatable: false,
  unlockedBy: 'M16',
  tags: ['pigeon.gimp', 'pigeon.json', 'adb.usage'],
  factIds: ['F212', 'F030', 'F024', 'F205'],
  ticket: { title: "New Pigeon test tests/sale/payment_success_compare.json needs its screenCompare block filled for 'Payment Successful'", reporter: 'morgan' },
  setup: () => ({ scenario: [F('pigeon.screenCompareEmpty'), OP('device.stage', { device: '$DEV', stage: 'approved' })] }),
  reveal: 'immediate',
  symptoms: [
    sym('Jenkins', 'Java/pigeon-android-payment-compare [illus.]: LSTR screenCompare: empty region (0x0) → FAILURE'),
    sym('IDE', '{ "action": "screenCompare", "params": { "x": 0, "y": 0, "w": 0, "h": 0, "expected": "Payment Successful" } }'),
    sym('World', (b) => `${hrn(b)} shows the Payment Successful screen.`),
  ],
  diagnosisPath: ['The region is 0×0 — nothing to compare.', 'Take an ADB screencap of the device.', 'Open it in GIMP and select the text.', 'Copy Position and Size into the JSON; commit, push, rebuild.'],
  hints: [
    'The compare block has no region yet. Where do Pigeon engineers get coordinates from?',
    (b) => `adb -s ${deviceIp(b)}:5444 exec-out screencap -p > payment_success.png, then GIMP → File → Open → Rectangle Select.`,
    'Read Tool Options Position and Size around "Payment Successful", write them into the screenCompare params, commit, push and rebuild Java/pigeon-android-payment-compare.',
  ],
  fix: {
    handsOn: (b) =>
      `adb -s ${deviceIp(b)}:5444 exec-out screencap -p > payment_success.png → GIMP File → Open → Rectangle Select around the text → Tool Options Position ${COMPARE_TRUTH.x}, ${COMPARE_TRUTH.y}, Size ${COMPARE_TRUTH.w} × ${COMPARE_TRUTH.h} → write { "x": ${COMPARE_TRUTH.x}, "y": ${COMPARE_TRUTH.y}, "w": ${COMPARE_TRUTH.w}, "h": ${COMPARE_TRUTH.h} } → commit, push, rebuild.`,
  },
  success: () => {
    const f = p.gitFile('pigeon', COMPARE_FILE);
    return c.all(
      c.approx(f.json('/actions/6/params/x') as never, COMPARE_TRUTH.x, 3),
      c.approx(f.json('/actions/6/params/y') as never, COMPARE_TRUTH.y, 3),
      c.approx(f.json('/actions/6/params/w') as never, COMPARE_TRUTH.w, 3),
      c.approx(f.json('/actions/6/params/h') as never, COMPARE_TRUTH.h, 3),
      c.nextBuild({ jobs: ['Java/pigeon-android-payment-compare'] }),
    );
  },
  diagnosisCall: dc(
    'Screen-compare region undefined — extract it in GIMP',
    ['Tesseract down', 'The runner never got as far as OCR: the region is 0×0.'],
    ['Wrong screen', 'The device shows Payment Successful. What region does the JSON ask for?'],
    ['JSON syntax', 'The file parsed — the runner read the block and found an empty region.'],
  ),
  wrongButTempting: [
    wm('guess', 'Guess the numbers', 50, on('jenkins.buildFinished', { jobId: 'Java/pigeon-android-payment-compare' }, (pl) => pl.result !== 'SUCCESS'), teach('The compare failed again.', 'Engineers open a screenshot in GIMP, draw a bounding box and copy its coordinates into the JSON. (Ref §5)', 'Screencap → GIMP → Rectangle Select → Tool Options.'), { repeatable: true }),
    wm('webcam-snapshot', 'Use a webcam snapshot of an ADB-visible screen', 50, on('camera.snapshot', {}, (pl) => /eve/.test(pl.cameraId)), teach('Perspective and scale differ.', 'For an ADB-visible screen, the device screencap gives exact pixels. (Ref §1, §5)', 'adb exec-out screencap, then GIMP.')),
  ],
  teaches: 'Ref §5 GIMP coordinate extraction; Ref §1 GIMP and ADB.',
};

export const INC25: IncidentDef = {
  id: 'INC25',
  name: 'Pigeon JSON missing comma',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P2',
  rigs: { default: null, scope: 'none', describe: '— (repo pigeon)' },
  escalatable: false,
  unlockedBy: 'M15',
  tags: ['pigeon.json', 'pigeon.nolint', 'tools.github', 'pigeon.abstraction', 'arch.repos'],
  factIds: ['F205', 'F206', 'F207', 'F208', 'F209', 'F204'],
  processBonuses: ['PB04'],
  ticket: { title: P("Tip-sale Pigeon test dies instantly since {{alex}}'s 'add tip step' commit"), reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('pigeon.missingComma', { path: TIP_FILE, line: 8 }), OP('jenkins.startBuild', { job: 'Java/pigeon-android-tip-sale', by: 'jenkins' })] }),
  reveal: 'immediate',
  symptoms: [
    sym('Jenkins', 'Java/pigeon-android-tip-sale [illus.]: LSTR ParseError: Unexpected token { in JSON at line 9 column 5 → FAILURE'),
    sym('IDE', 'No error highlighting — the Pigeon project has no JSON inspections.'),
    sym('Terminal', P("git log -1 --stat → {{alex}}'s commit; git diff HEAD~1 shows the new add tip block.")),
  ],
  diagnosisPath: ['The error points at line 9 — the break is the missing comma at the end of line 8.', 'Fix it (or paste a known-good action).', 'Commit, push, rebuild.'],
  hints: [
    'Parsers report where they gave up, not where you went wrong. Look just before that line.',
    `Open pigeon/${TIP_FILE}: what ends line 8?`,
    'Add the comma after the add tip action (or paste it from tests/_templates/known_good_actions.json), commit, push, rebuild Java/pigeon-android-tip-sale.',
  ],
  fix: { handsOn: 'Add the comma, or paste the action from tests/_templates/known_good_actions.json (PB04); commit; push; rebuild.' },
  success: () => {
    const f = p.gitFile('pigeon', TIP_FILE);
    return c.all(c.truthy(f.parsesJson), c.contains(f.contents, '"add tip"'), c.nextBuild({ jobs: ['Java/pigeon-android-tip-sale'] }));
  },
  diagnosisCall: dc(
    'Malformed JSON (missing comma) — nothing lints it',
    ['VISA_STD_SWIPE track data bad', 'The runner failed parsing the file — no card was ever swiped.'],
    ['Wrong platform list', 'A platform list problem would not stop the parser. Read the ParseError.'],
    ['Runner crashed', 'The runner reported a precise ParseError with a line and column.'],
  ),
  wrongButTempting: [
    wm('revert', 'git revert the commit', 0, on('git.committed', { repo: 'pigeon' }, (pl) => /^Revert/i.test(pl.message)), teach('Green, but the tip step is gone.', 'The ticket needs the tip test working, not removed.', 'Fix the comma and keep the add tip action.')),
    wm('retype', 'Retype the file from scratch', 0, undefined, teach('Allowed, but slow.', 'Engineers survive the missing linter by copy-pasting working JSON blocks. (Ref §5)', 'Paste from tests/_templates/known_good_actions.json.')),
  ],
  teaches: 'Ref §5: JSON payload anatomy (name, connection type, 4–5 platforms, actions with parameters and stored outputs); no JSON linter; copy-paste survival; "card swipe" is abstracted per platform into an SDK request or a physical robot action.',
};

export const INC26: IncidentDef = {
  id: 'INC26',
  name: 'The job that "disappeared" (legacy Java vs iOS)',
  difficulty: 2,
  base: 250,
  parS: 150,
  severity: 'P2',
  rigs: { default: null, scope: 'none', describe: '—' },
  escalatable: false,
  unlockedBy: 'M11',
  tags: ['jenkins.folders', 'pigeon.lstr', 'go.sdk'],
  factIds: ['F017', 'F203', 'F202'],
  ticket: { title: 'Nightly Java run is missing pigeon-windows-tender — did someone delete it?', reporter: 'riley' },
  setup: () => ({ scenario: [F('jenkins.jobMoved', { job: 'Java/pigeon-windows-tender', toFolder: 'iOS' })] }),
  reveal: 'immediate',
  symptoms: [
    sym('Jenkins', 'The Java view lacks it; search finds iOS/pigeon-windows-tender.'),
    sym('Jenkins', 'The iOS view otherwise holds iOS/pigeon-ios-go-sdk-smoke (ran today) and iOS/pigeon-ios-lstr-legacy [illus.] (last run 7 months ago).'),
  ],
  diagnosisPath: ['Search Jenkins for the job name.', 'It lives under the iOS folder.', 'Move it back to Java.'],
  hints: ['Search before you recreate anything.', 'Jenkins search: pigeon-windows-tender. Which folder is it in?', 'Job ▸ Move ▸ Java.'],
  fix: { handsOn: 'Job ▸ Move ▸ Java.' },
  success: () =>
    c.all(
      c.truthy(p.job('Java/pigeon-windows-tender').exists),
      c.falsy(p.job('iOS/pigeon-windows-tender').exists),
      c.label(c.happened(on('jenkins.jobMoved', { toJobId: 'Java/pigeon-windows-tender' })), 'Moved back to Java'),
    ),
  diagnosisCall: dc(
    'Filed under iOS; legacy jobs are split Java vs iOS',
    ['Deleted', 'Search finds it — it still exists. Where?'],
    ['Trigger broken', 'The nightly trigger ran every other Java job. Which folder does it cover?'],
    ['Permissions', 'You can see and open the job. Look at its folder.'],
  ),
  wrongButTempting: [
    wm('recreate', 'Recreate it', 50, on('jenkins.jobCreated', { jobId: 'Java/pigeon-windows-tender' }), teach('Now there are duplicates.', 'Jenkins separates legacy Java jobs from iOS jobs; this one was filed in the wrong folder. (Ref §1)', 'Move the existing job to Java.')),
    wm('delete-ios', 'Delete the iOS copy first', 100, on('jenkins.jobDeleted', { jobId: 'iOS/pigeon-windows-tender' }), teach('Build history lost.', 'Moving keeps the history and numbers.', 'Job ▸ Move ▸ Java.')),
  ],
  teaches: 'Ref §1: Jenkins separates legacy Java jobs from iOS jobs. Ref §5: the iOS runner is rarely touched while iOS Go testing is active.',
};

export const INC27: IncidentDef = {
  id: 'INC27',
  name: 'Port 5555: "Something is tapping my desk Flex!"',
  difficulty: 2,
  base: 350,
  parS: 180,
  severity: 'P1',
  rigs: { candidates: ['bumblebee'], default: 'bumblebee', scope: 'rig', describe: "workstation + {{riley}}'s desk Flex (default target BUMBLEBEE)" },
  escalatable: false,
  unlockedBy: 'M14',
  tags: ['adb.port', 'uia.config', 'adb.usage'],
  factIds: ['F198', 'F199', 'F200', 'F026'],
  ticket: { title: 'SOMETHING IS TAPPING MY DESK FLEX BY ITSELF', reporter: 'riley' },
  setup: () => ({
    scenario: [OP('repo.clone', { repo: 'uia-remote' }), OP('config.write', { fixture: 'target', robot: '$R' }), F('config.port5555'), OP('runner.startLocal', { test: 'SaleTest' })],
  }),
  reveal: 'immediate',
  symptoms: [
    sym('IDE', (b) => `connect ${deviceIp(b)}:5555 … refused · falling back to first known device: 10.42.60.4:5555 · [runner] open Register`),
    sym('World', P("{{riley}}'s desk Flex shows Register with \"Tax Item 5\" in the cart.")),
    sym('Terminal', 'adb devices → 10.42.60.4:5555\tdevice'),
  ],
  diagnosisPath: ['adb devices: a coworker IP on 5555.', 'Check config.properties: portNumber=5555.', 'Call it, stop the run, fix the port.'],
  hints: [
    "Your own local run is the only thing driving devices from this desk. What is it connected to?",
    'Terminal: adb devices. Then IntelliJ → config.properties → portNumber.',
    (b) => `Stop the run → adb disconnect 10.42.60.4:5555 → portNumber=5444 → adb connect ${deviceIp(b)}:5444 → re-run.`,
  ],
  fix: { handsOn: (b) => P(`Stop the run → adb disconnect 10.42.60.4:5555 → portNumber=5444 → adb connect ${deviceIp(b)}:5444 → re-run; apologise in LabChat (optional, {{riley}}: "Ha. Welcome to the club.").`) },
  success: () =>
    c.all(
      c.eq(p.prop('config', 'portNumber'), '5444'),
      c.custom('no-5555', 'No workstation ADB connection on :5555', (s) => !(s.lab.workstation?.adbConnections ?? []).some((x) => x.target.endsWith(':5555') && x.state === 'device')),
      c.truthy(p.coworkerIdle('riley')),
    ),
  diagnosisCall: dc(
    'portNumber 5555 — the runner fell back to a coworker\'s device',
    [P("{{riley}}'s Flex has malware"), 'The taps match your test\'s steps exactly. What is your runner connected to?'],
    ['Orca routed to the wrong rig', 'Orca never chose this device — it is not a lab rig. Run adb devices.'],
    ['Wrong deviceType', 'deviceType changes scrolling, not which device you connect to. Check portNumber.'],
  ),
  wrongButTempting: [
    gw('unplug-riley', 'GW23', P("Unplug {{riley}}'s Flex")),
    wm('kill-server', 'adb kill-server only', 0, undefined, teach('It recurs on the next run.', 'portNumber is locked to 5444; 5555 is the ADB default that let scripts drive coworkers\' desk devices. (Ref §4)', 'Set portNumber=5444.')),
    wm('port-5556', 'Use 5556 instead', 100, undefined, teach('The lab standard is 5444.', 'portNumber is locked to 5444. (Ref §4)', 'portNumber=5444.')),
    wm('riley-driven', P("{{riley}}'s Flex keeps getting driven"), 20, on('adb.coworkerDriven', {}), teach('A coworker\'s device was driven by your run.', 'Using 5555 caused office collisions where scripts controlled coworkers\' desk devices. (Ref §4)', 'Stop the run first.')),
  ],
  teaches: "Ref §4: portNumber is locked to 5444; 5555 (the ADB default) let automated scripts connect to and control coworkers' desk devices.",
};

export const INC28: IncidentDef = {
  id: 'INC28',
  name: 'ADB refused after a Laz OOBE',
  difficulty: 3,
  base: 400,
  parS: 210,
  severity: 'P1',
  rigs: { candidates: ['data'], default: 'data', scope: 'rig', describe: 'any rig after a merchant swap (default DATA)' },
  escalatable: false,
  unlockedBy: 'M08',
  tags: ['adb.port', 'adb.usage', 'laz.oobe', 'hw.pi'],
  factIds: ['F026', 'F065', 'F046', 'F047'],
  ticket: { title: (b) => `${hrn(b)} red after the merchant swap: adb connect refused`, reporter: 'jenkins-bot' },
  setup: () => ({
    scenario: [OP('device.provision', { device: '$DEV', merchant: 'AUTO-US-NOPIN-02' }), F('device.adbTcpReset', { device: '$DEV' })],
  }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', (b) => `[runner] adb connect ${deviceIp(b)}:5444 → failed to connect to '${deviceIp(b)}:5444': Connection refused`),
    sym('World', 'DATA already runs the new merchant (AUTO-US-NOPIN-02) after the OOBE.'),
    sym('Orca', (b) => `${hrn(b)} Available (the shelf Pi is healthy).`),
    sym('World', (b) => `${hrn(b)} shows the new merchant's home screen.`),
  ],
  diagnosisPath: ['Refused (not timeout) ⇒ the device is up but nothing listens on 5444.', 'A recent OOBE wiped the device.', 'Call it and re-enable ADB over TCP from the shelf Pi.'],
  hints: [
    '"Refused" and "timed out" mean different things. Which is it?',
    'ssh pi@10.42.10.30 → adb devices: the device is still on USB.',
    (b) => `On the Pi: adb -s <serial> tcpip 5444 → then from your desk adb connect ${deviceIp(b)}:5444 → rebuild.`,
  ],
  fix: { handsOn: (b) => `ssh pi@10.42.10.30 → adb devices → adb -s <${hrn(b)} serial> tcpip 5444 → "restarting in TCP mode port: 5444" → workstation adb connect ${deviceIp(b)}:5444 → rebuild.` },
  success: (b) =>
    c.all(c.eq(p.hwDevice(dev(b)).adbTcpPort, 5444), c.label(c.happened(on('device.adbTcpChanged', { deviceId: dev(b), port: 5444 })), 'ADB over TCP re-enabled'), c.nextBuild({ robots: [rig(b)] })),
  diagnosisCall: dc(
    'The OOBE wipe reset ADB-over-TCP — re-enable it on 5444',
    ['Shelf Pi crashed', 'A crashed Pi fails its health check; Orca shows the rig Available.'],
    ['Port collision', '"Connection refused" on the lab port means nothing is listening there. What reset the device?'],
    ['Ethernet unplugged', 'An unplugged device times out. This one refuses — it is on the network.'],
  ),
  wrongButTempting: [
    gw('tcpip-5555', 'GW08', 'adb tcpip 5555'),
    wm('orca-port', "Change Orca's ADB Service URL port", 100, orcaSave('robot', { fields: ['adbServiceUrl'] }), teach('Orca\'s URL was fine.', 'ADB in the lab runs over port 5444; the device simply stopped listening after the wipe. (Ref §1)', 'Re-enable ADB over TCP on 5444 from the Pi.')),
  ],
  teaches: 'Ref §1: ADB on port 5444; the Pi handles ADB routing; Laz wipes and re-provisions the device.',
  variants: [
    {
      id: 'B',
      label: 'Real Laz run forgets to restore ADB',
      overrides: {
        setup: () => ({
          scenario: [
            F('laz.skipAdbRestore', { device: '$DEV' }),
            OP('jenkins.startBuild', { job: 'Java/laz-oobe-merchant-swap', params: { ROBOT_NAME: '$R', MERCHANT: 'AUTO-US-NOPIN-02' }, by: 'riley' }),
          ],
        }),
        symptoms: [
          sym('Jenkins', 'Java/laz-oobe-merchant-swap: laz: de-provision · laz: wipe caches · laz: setup wizard 1/6…6/6 · laz: merchant active'),
          sym('Jenkins', (b) => `Next build: [runner] adb connect ${deviceIp(b)}:5444 → failed to connect to '${deviceIp(b)}:5444': Connection refused`),
          sym('Orca', (b) => `${hrn(b)} Available (the shelf Pi is healthy).`),
        ],
      },
    },
  ],
};
