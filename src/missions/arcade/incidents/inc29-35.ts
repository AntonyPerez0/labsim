/**
 * GP §3.5 INC29–INC35: uia-remote config locks (theme/kernelType, Duo IPs), reserving before a local
 * run, waitForScreen(), open() scroll direction, a PR review and the missing teardown.
 */
import type { IncidentDef } from '../../types';
import { c, on, p } from '../../types';
import {
  F,
  OP,
  P,
  configEdited,
  dc,
  deviceIp,
  gw,
  hrn,
  rig,
  boundTo,
  sym,
  teach,
  uiaPushed,
  wm,
} from './helpers';

const ALEX_CFG = '~/CodeWithMe/alex/uia-remote/config.properties';

export const INC29: IncidentDef = {
  id: 'INC29',
  name: 'Stale wiki config (theme / kernelType)',
  difficulty: 1,
  base: 200,
  parS: 120,
  severity: 'P3',
  rigs: { default: null, scope: 'none', describe: "{{alex}}'s local run" },
  escalatable: false,
  unlockedBy: 'M14',
  tags: ['uia.config'],
  factIds: ['F196', 'F197', 'F188'],
  ticket: { title: 'My first local run crashes at setup', reporter: 'alex' },
  setup: () => ({ scenario: [OP('config.write', { path: ALEX_CFG, fixture: 'target', robot: 'data' }), F('config.themeKernel', { path: ALEX_CFG })] }),
  reveal: 'immediate',
  symptoms: [
    sym('IDE', P('({{alex}}\'s screen-share) java.lang.IllegalStateException: Unsupported theme "classic" — only "avocado" is supported')),
    sym('IDE', 'After fixing that: Unsupported kernelType "SPA" — use "CPA"'),
    sym('IDE', 'config.properties shows theme=classic, kernelType=SPA.'),
  ],
  diagnosisPath: ['Read the setup exception.', 'Open the config: two locked keys hold legacy values.', 'Fix both and re-run.'],
  hints: [
    'Two of the config keys are locked to one value each. Which ones?',
    P("Open {{alex}}'s config.properties (Code With Me): theme and kernelType."),
    'theme=avocado, kernelType=CPA, then re-run the test.',
  ],
  fix: { handsOn: 'theme=avocado, kernelType=CPA; re-run.' },
  success: () =>
    c.all(
      c.eq(p.prop('alexConfig', 'theme'), 'avocado'),
      c.eq(p.prop('alexConfig', 'kernelType'), 'CPA'),
      c.label(c.verify({ kind: 'local-run', passed: true }), 'A local run passes'),
    ),
  diagnosisCall: dc(
    'Deprecated theme/kernel values',
    ['Wrong IP', 'The run crashed at setup before connecting to anything. Read the exception.'],
    ['Port', 'A port problem fails to connect; this fails validating the config.'],
    ['Missing passcode', 'The exception names theme and then kernelType.'],
  ),
  wrongButTempting: [
    wm('theme-only', 'Fix only theme', 0, undefined, teach('The run still fails.', 'kernelType is locked to CPA (Core Payments Application), which replaces the legacy SPA. (Ref §4)', 'Set kernelType=CPA too.')),
    gw('kernel-spa', 'GW15', 'kernelType=SPA "because the device is old"'),
  ],
  teaches: 'Ref §4: theme is locked to avocado; kernelType is locked to CPA (Core Payments Application), replacing SPA (Secure Processor Application).',
};

export const INC30: IncidentDef = {
  id: 'INC30',
  name: 'Station Duo local run: MFD and CFD IPs',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P2',
  rigs: { roles: ['duo'], default: 'r2-d2', scope: 'rig', describe: '`duo` (R2-D2, already Reserved by you)' },
  escalatable: false,
  unlockedBy: 'M14',
  tags: ['uia.config', 'orca.tethered', 'uia.multidevice'],
  factIds: ['F193', 'F190', 'F191', 'F192', 'F151'],
  ticket: { title: (b) => `Run TaxTestDuo locally on ${hrn(b)} — it can't find the customer display`, reporter: 'morgan' },
  setup: () => ({
    scenario: [
      OP('orca.setStatus', { robot: '$R', status: 'RESERVED', by: 'player' }),
      OP('repo.clone', { repo: 'uia-remote' }),
      OP('config.write', { fixture: 'target', robot: '$R' }),
      F('config.value', { key: 'customerFacingDeviceIp', value: '10.42.30.19' }),
    ],
  }),
  reveal: 'immediate',
  symptoms: [
    sym('IDE', (b) => `[runner] MFD handle ${deviceIp(b)}:5444 connected · [runner] CFD handle 10.42.30.19:5444 → No route to host`),
    sym('World', (b) => `${hrn(b)} is one terminal with two screens.`),
  ],
  diagnosisPath: ['The CFD handle points at an address with nothing behind it.', 'A Station Duo is one terminal driving two displays.', 'Set both IPs to the Duo\'s IP and re-run.'],
  hints: [
    'How many devices — and IP addresses — does a Station Duo have?',
    'IntelliJ → config.properties → merchantFacingDeviceIp and customerFacingDeviceIp.',
    (b) => `customerFacingDeviceIp=${deviceIp(b)} (the same as the MFD), keep runType=tethered, re-run TaxTestDuo.`,
  ],
  fix: { handsOn: (b) => `customerFacingDeviceIp=${deviceIp(b)}; re-run.` },
  success: (b) =>
    c.all(
      c.eq(p.prop('config', 'merchantFacingDeviceIp'), deviceIp(b)),
      c.eq(p.prop('config', 'customerFacingDeviceIp'), deviceIp(b)),
      c.eq(p.prop('config', 'runType'), 'tethered'),
      c.label(c.verify({ kind: 'local-run', tests: ['TaxTestDuo'], passed: true }), 'TaxTestDuo passes locally'),
    ),
  diagnosisCall: dc(
    'On a Station Duo both IPs are the same',
    ['CFD unplugged', 'The Duo\'s second screen is part of the same terminal. Which IP did the runner try?'],
    ['Port wrong', 'The MFD handle connected on the same port. Compare the two IPs.'],
    ['Runner bug', 'The runner did exactly what the config said. Read the config.'],
  ),
  wrongButTempting: [
    wm('cfd-pi', 'CFD IP = the Pi', 100, configEdited, teach('That is the Robot Controller, not a display.', 'On a Station Duo, merchantFacingDeviceIp and customerFacingDeviceIp are the exact same IP. (Ref §4)', 'Use the Duo\'s device IP for both.'), { when: c.matches(p.prop('config', 'customerFacingDeviceIp'), '^10\\.42\\.10\\.') }),
    wm('standalone', 'runType=standalone', 0, configEdited, teach('The CFD steps are skipped and the assertions fail.', 'runType is tethered for multi-device setups. (Ref §4)', 'Keep runType=tethered.'), { when: c.eq(p.prop('config', 'runType'), 'standalone') }),
    wm('other-rig', "JOHNNY-5's IP", 200, configEdited, teach('You just drove another rig.', 'Each config targets one rig; a Duo uses its own IP twice. (Ref §4)', 'Use the Duo\'s device IP for both.'), { when: c.eq(p.prop('config', 'customerFacingDeviceIp'), '10.42.30.15') }),
  ],
  teaches: 'Ref §4: on a Station Duo, merchantFacingDeviceIp and customerFacingDeviceIp are identical; runType is tethered.',
};

export const INC31: IncidentDef = {
  id: 'INC31',
  name: 'Running locally? Reserve first',
  difficulty: 2,
  base: 300,
  parS: 240,
  severity: 'P2',
  rigs: { roles: ['tethered'], default: 'megatron', scope: 'rig', describe: 'tethered/any (default MEGATRON)' },
  escalatable: false,
  unlockedBy: 'M06',
  tags: ['orca.status.reserved', 'tools.intellij', 'uia.taxtest'],
  factIds: ['F112', 'F113', 'F028', 'F183', 'F185', 'F186', 'F187'],
  ticket: { title: (b) => `Please run TaxTest locally on ${hrn(b)} to verify my fix`, reporter: 'morgan' },
  setup: () => ({ scenario: [OP('repo.clone', { repo: 'uia-remote' }), OP('config.write', { fixture: 'target', robot: '$R' })] }),
  reveal: 'immediate',
  symptoms: [
    sym('Orca', (b) => `${hrn(b)} is Available; PL2 checks out a tethered rig every 30 s.`),
    sym('Jenkins', (b) => `While you hold it: [orca] candidate ${rig(b)}: Reserved — skipped`),
    sym('IDE', 'TaxTest PASSED (4/4 steps) — MFD_O1 / CFD_O1 / MFD_O2 / Step 4.'),
  ],
  diagnosisPath: ['Before running locally, take the rig away from Jenkins: Reserved.', 'Run TaxTest from IntelliJ and watch the four steps.', 'Release the rig back to Available.'],
  hints: [
    'Jenkins will happily check this rig out in the middle of your run. How do you stop that?',
    (b) => `Orca → ${hrn(b)} → Status = Reserved, then IntelliJ ▶ TaxTest.`,
    (b) => `Reserved → run TaxTest (≈ 25 s) → PASS → Orca → ${hrn(b)} → Available.`,
  ],
  fix: { handsOn: (b) => `Orca → ${hrn(b)} → Reserved → IntelliJ ▶ TaxTest (≈ 25 s; log TaxTest PASSED (4/4 steps)) → Orca → Available.` },
  success: (b) =>
    c.all(
      c.eq(p.localRun('TaxTest').result, 'PASS'),
      c.eq(p.localRun('TaxTest').robot, rig(b)),
      c.falsy(p.localRun('TaxTest').overlappedJenkins),
      c.label(c.wasTrue(c.all(c.status(rig(b), 'RESERVED'), c.eq(p.localRun('TaxTest').result, 'RUNNING'))), 'Reserved during the run'),
      c.status(rig(b), 'AVAILABLE'),
    ),
  diagnosisCall: dc(
    (b) => `Set ${hrn(b)} to Reserved`,
    ['Unavailable', 'Unavailable still lets named jobs take the rig, and Orca resets it afterwards. Which status is for local runs?'],
    ['Offline', 'Offline is the placeholder while a rig is being built.'],
    ['Nothing', 'PL2 checks out an Available tethered rig every 30 s. What happens mid-run?'],
  ),
  wrongButTempting: [
    wm('unavailable', 'Set it Unavailable', 100, on('robot.statusChanged', { to: 'UNAVAILABLE' }, (pl, s) => boundTo(s, 'INC31', pl.name)), teach('Named jobs can still take it.', 'Reserved is set manually for local runs and blocks Jenkins. (Ref §3)', 'Use Reserved.')),
    wm('offline', 'Set it Offline', 100, on('robot.statusChanged', { to: 'OFFLINE' }, (pl, s) => boundTo(s, 'INC31', pl.name)), teach('Offline is for builds.', 'Reserved is the status for running tests locally. (Ref §3)', 'Use Reserved.')),
    wm(
      'no-reserve',
      'Run without reserving',
      200,
      on('test.localRunStarted', { testName: 'TaxTest' }, (pl, s) => boundTo(s, 'INC31', pl.robotName) && Object.values(s.lab.orca.robots).find((r) => r.name === pl.robotName)?.status !== 'RESERVED'),
      teach('PL2 checked the rig out mid-run.', 'Reserved blocks Jenkins pipelines while you run locally. (Ref §3)', 'Reserve first, then run.'),
    ),
    wm('no-release', 'Forget to release', 0, undefined, teach('PL2 stays blocked.', 'Reserved blocks Jenkins until you release it.', 'Set the rig back to Available after the run.')),
  ],
  teaches: 'Ref §3 Reserved: locked manually by an engineer running tests locally; blocks Jenkins.',
};

export const INC32: IncidentDef = {
  id: 'INC32',
  name: 'Flaky clicks: missing waitForScreen()',
  difficulty: 3,
  base: 400,
  parS: 300,
  severity: 'P2',
  rigs: { roles: ['tethered'], default: 'megatron', scope: 'rig', describe: 'tethered (PL2)' },
  escalatable: false,
  unlockedBy: 'M13',
  tags: ['uia.sync', 'uia.pom', 'tools.intellij'],
  factIds: ['F178', 'F179', 'F180', 'F175', 'F176', 'F173'],
  ticket: { title: 'tethered-tax flaky: 1 in 2 runs fail at Review Order', reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('uia.waitForScreenStub', { class: 'RegisterHomeScreen' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', 'androidx.test.uiautomator.UiObjectNotFoundException: UiSelector[TEXT=Review Order] at com.labsim.uia.pageobjects.RegisterHomeScreen.reviewOrder(RegisterHomeScreen.java:21)'),
    sym('Camera', 'Recorded playback: the tap lands before the screen finishes drawing.'),
    sym('IDE', 'RegisterHomeScreen.waitForScreen() { // TODO } — reviewOrder() clicks without waiting.'),
  ],
  diagnosisPath: ['Flaky, not broken: about half the runs fail at the same click.', 'The page object never waits for its screen.', 'Implement waitForScreen() on a Zone 1 locator and call it before clicking.'],
  hints: [
    'Half the runs pass. What could make the same click succeed only sometimes?',
    'IntelliJ → pageobjects/RegisterHomeScreen.java → waitForScreen().',
    'waitForScreen() { device.wait(Until.hasObject(reviewOrderBtn), TIMEOUT_MS); } and call it at the start of reviewOrder(); push; rebuild until three green runs.',
  ],
  fix: { handsOn: 'Implement waitForScreen() (device.wait(Until.hasObject(reviewOrderBtn), TIMEOUT_MS);) and call it before interacting; push; rebuild.' },
  success: () =>
    c.all(
      c.truthy(p.codeFact('waitForScreen', 'RegisterHomeScreen')),
      c.falsy(p.codeFact('sleepWait', 'RegisterHomeScreen')),
      c.label(c.any(c.nextBuild({ pipeline: 'PL2', count: 3 }), c.verify({ kind: 'local-run', tests: ['TaxTest'], passed: true, count: 3 })), 'Three green runs in a row'),
    ),
  diagnosisCall: dc(
    'Clicking before render — waitForScreen() missing',
    ['Coordinates', 'This is a UI Automator object lookup, not a robot tap. Look at the page object.'],
    ['Port', 'Half the runs pass on the same port. Look at the timing.'],
    ['Teardown missing', 'A missing teardown fails at the start of the next test. This fails mid-test.'],
  ),
  wrongButTempting: [
    wm('sleep', 'Thread.sleep(5000)', 100, uiaPushed, teach('Slower and still flaky.', 'waitForScreen() pauses until the UI finishes rendering so UI Automator never clicks unrendered buttons. (Ref §4)', 'Wait on a Zone 1 locator with device.wait(Until.hasObject(...)).'), { when: c.truthy(p.codeFact('sleepWait', 'RegisterHomeScreen')) }),
    wm('retry', 'try/catch-retry the click', 50, undefined, teach('Masks the race.', 'Every screen class must implement waitForScreen() and isScreenPresent(). (Ref §4)', 'Implement waitForScreen().')),
  ],
  teaches: 'Ref §4: the mandatory waitForScreen() stops UI Automator clicking unrendered buttons; Zone 1 locators / Zone 2 methods; screen classes extend BaseTest.',
};

export const INC33: IncidentDef = {
  id: 'INC33',
  name: 'open("Register") scrolls the wrong way',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P2',
  rigs: { candidates: ['tars'], default: 'tars', scope: 'rig', describe: 'Flex rigs, local run (default TARS, Reserved)' },
  escalatable: false,
  unlockedBy: 'M13',
  tags: ['uia.scroll', 'uia.config', 'orca.devicetype'],
  factIds: ['F177', 'F195', 'F176'],
  ticket: { title: (b) => `My local HomeScreenTest on ${hrn(b)} can't find the Register app`, reporter: 'alex' },
  setup: () => ({
    scenario: [
      OP('orca.setStatus', { robot: '$R', status: 'RESERVED', by: 'alex' }),
      OP('repo.clone', { repo: 'uia-remote' }),
      OP('config.write', { fixture: 'target', robot: '$R' }),
      F('config.value', { key: 'deviceType', value: 'Mini' }),
    ],
  }),
  reveal: 'immediate',
  symptoms: [
    sym('IDE', '[HomeScreen] open("Register"): scrolling horizontally (Mini/Station)… ×5 → AssertionError: App \'Register\' not found on HomeScreen'),
    sym('World', (b) => `${hrn(b)}'s launcher scrolls vertically.`),
    sym('IDE', 'config.properties: deviceType=Mini'),
  ],
  diagnosisPath: ['The runner scrolled horizontally; the Flex launcher scrolls vertically.', 'open() picks the direction from deviceType.', 'Fix deviceType and re-run.'],
  hints: [
    'Which way does a Flex launcher scroll, and which way did the test scroll?',
    'IntelliJ → config.properties → deviceType.',
    'deviceType=Flex (the family, not the enum), then re-run HomeScreenTest.',
  ],
  fix: { handsOn: 'deviceType=Flex; re-run.' },
  success: () => c.all(c.eq(p.prop('config', 'deviceType'), 'Flex'), c.label(c.verify({ kind: 'local-run', tests: ['HomeScreenTest'], passed: true }), 'HomeScreenTest passes locally')),
  diagnosisCall: dc(
    'deviceType wrong, so open() scrolled horizontally',
    ['App missing', 'The app is on the device. Which direction did open() scroll?'],
    ['waitForScreen missing', 'The screen rendered; the scroll went the wrong way.'],
    ['DEVICE_TYPE case', 'Enum case matters for Jenkins DEVICE_TYPE; config.properties takes the family name.'],
  ),
  wrongButTempting: [
    wm('always-vertical', 'Make open() always vertical', 150, uiaPushed, teach('Mini and Station now break.', 'open(appName) scrolls vertically on Flex and horizontally on Mini/Station — the abstraction belongs in Zone 2. (Ref §4)', 'Fix deviceType in the config instead.'), { when: c.falsy(p.codeFact('openScroll', 'HomeScreen')) }),
    wm('enum-in-config', 'deviceType=FLEX_4', 0, configEdited, teach('Run fails: unknown deviceType.', 'config.properties deviceType takes the family (Mini, Flex, Station). (Ref §4)', 'deviceType=Flex.'), { when: c.eq(p.prop('config', 'deviceType'), 'FLEX_4') }),
  ],
  teaches: 'Ref §4 Zone 2 abstraction: open(appName) scrolls vertically on Flex and horizontally on Mini/Station; config deviceType drives the layout/scroll logic.',
};

export const INC34: IncidentDef = {
  id: 'INC34',
  name: "PR review: the new hire's page object",
  difficulty: 3,
  base: 400,
  parS: 240,
  severity: 'P3',
  rigs: { default: null, scope: 'none', describe: '—' },
  escalatable: false,
  unlockedBy: 'M13',
  tags: ['uia.layout', 'uia.sync', 'adb.port', 'tools.github', 'uia.pom'],
  factIds: ['F164', 'F179', 'F180', 'F198', 'F173'],
  ticket: { title: "Review labsim-lab/uia-remote PR #431 'Add LockScreen page object'", reporter: 'alex' },
  setup: () => ({ scenario: [OP('github.seedPr', { repo: 'uia-remote', number: 431, fixture: 'uia-431-lockscreen', author: 'alex', title: 'Add LockScreen page object' })] }),
  reveal: 'immediate',
  symptoms: [
    sym('GitHub', 'app/src/main/java/com/labsim/uia/AppRegistration.java +2 lines'),
    sym('GitHub', 'app/src/androidTest/java/com/labsim/uia/pageobjects/LockScreen.java — extends BaseTest, Zone 1 + waitForScreen(), no isScreenPresent()'),
    sym('GitHub', 'A committed config.properties with portNumber=5555'),
  ],
  diagnosisPath: ['Read every file in the diff.', 'Comment each rule broken, with the team\'s review reasons.', 'Request changes.'],
  hints: [
    'Three things in this diff break team rules. One thing that looks unusual is correct.',
    'Check: which folder is QA never allowed to touch? Which two methods must every screen class have? Which port?',
    'Line comments: "QA never modifies main", "Missing mandatory isScreenPresent()", "portNumber must be 5444" → Request changes. Do not flag extends BaseTest.',
  ],
  fix: { handsOn: 'Line comments with the review reasons QA never modifies main, Missing mandatory isScreenPresent(), portNumber must be 5444 → Request changes.' },
  success: () =>
    c.all(
      c.contains(p.pr('uia-remote', 431).commentTags, 'main-edit'),
      c.contains(p.pr('uia-remote', 431).commentTags, 'missing-isScreenPresent'),
      c.contains(p.pr('uia-remote', 431).commentTags, 'port-5555'),
      c.notContains(p.pr('uia-remote', 431).commentTags, 'extends-BaseTest'),
      c.eq(p.pr('uia-remote', 431).verdict, 'REQUEST_CHANGES'),
    ),
  diagnosisCall: 'none',
  wrongButTempting: [
    wm('approve', 'Approve', 200, on('github.prReviewed', { repo: 'uia-remote', number: 431, verdict: 'APPROVED' }), teach('It merged — and its port 5555 config will bite later.', 'main is never modified by QA; every screen class needs waitForScreen() and isScreenPresent(); portNumber is 5444. (Ref §4)', 'Request changes with those three reasons.')),
    wm('flag-basetest', 'Flag "extends BaseTest"', 50, on('github.prCommented', { repo: 'uia-remote', number: 431, reason: 'extends-BaseTest' }), teach('False flag.', 'Every screen class extends BaseTest, which provides setup, teardown and instance variables. (Ref §4)', 'Remove that comment.')),
  ],
  teaches: 'Ref §4: app/src/main is never modified by QA; waitForScreen() and isScreenPresent() are mandatory; portNumber is 5444.',
};

export const INC35: IncidentDef = {
  id: 'INC35',
  name: 'Not starting from HomeScreen (missing teardown)',
  difficulty: 3,
  base: 350,
  parS: 240,
  severity: 'P2',
  rigs: { roles: ['tethered'], default: 'megatron', scope: 'rig', describe: 'tethered (PL2)' },
  escalatable: false,
  unlockedBy: 'M14',
  tags: ['uia.taxtest', 'uia.sync', 'adb.usage'],
  factIds: ['F182', 'F181', 'F174', 'F025'],
  ticket: { title: 'RefundTest fails immediately — always right after TaxTest', reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('uia.teardownMissing', { test: 'TaxTest' }), OP('device.stage', { device: '$DEV', stage: 'register-order' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', 'AssertionError: HomeScreen.isScreenPresent() == false — current screen: RegisterOrderScreen'),
    sym('Camera', (b) => `${hrn(b)}'s MFD is left on the Register order screen.`),
    sym('IDE', 'TaxTest.java\'s header says "teardown forces both devices back to HomeScreen", but no teardown method exists.'),
  ],
  diagnosisPath: ['The failing test never got a chance — it started on the wrong screen.', 'The previous test (TaxTest) did not clean up.', 'Add the teardown; recover the device now; rebuild.'],
  hints: [
    'RefundTest only fails right after TaxTest. What did TaxTest leave behind?',
    'IntelliJ → testactions/TaxTest.java: is there an @After teardown?',
    (b) => `Add @After tearDown() returning both devices to HomeScreen, push; recover now with adb -s ${deviceIp(b)}:5444 shell input keyevent KEYCODE_HOME; rebuild.`,
  ],
  fix: {
    handsOn: (b) =>
      `Add a teardown that returns both devices to HomeScreen (e.g. @After public void tearDown() { mfd.run(homeScreen::goHome); cfd.run(homeScreen::goHome); }), push; recover now with adb -s ${deviceIp(b)}:5444 shell input keyevent KEYCODE_HOME; rebuild.`,
  },
  success: (b) => c.all(c.truthy(p.codeFact('teardown', 'TaxTest')), c.nextBuild({ pipeline: 'PL2', robots: [rig(b)] })),
  diagnosisCall: dc(
    'The previous test left the device off HomeScreen — teardown missing',
    ['RefundTest locator broken', 'RefundTest asserted where it started. Which screen was the device on?'],
    ['Port', 'The runner reached the device and read its screen.'],
    ['Tethered config', 'Both devices were found. Why was the MFD not on HomeScreen?'],
  ),
  wrongButTempting: [
    wm('home-only', 'Press Home only', 0, undefined, teach('Fixed until the next run.', 'Every test starts from HomeScreen and a teardown forces the hardware back to HomeScreen. (Ref §4)', 'Add the teardown to TaxTest.')),
    wm('gohome-refund', 'Add goHome() at the start of RefundTest only', 50, undefined, teach('The next test after TaxTest breaks the same way.', 'The teardown belongs to the test that leaves the screen. (Ref §4)', 'Add the teardown to TaxTest.')),
  ],
  teaches: 'Ref §4 Tax test: every test starts from HomeScreen and runs a teardown back to HomeScreen.',
};
