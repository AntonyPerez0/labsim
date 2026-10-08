/**
 * GP §3.5 INC36–INC42: brittle Duo CFD OCR (10 px shift, case/typo), the UI Automator 2.3 migration,
 * Jenkins env-var case, the PayCore rig overwrite, named jobs on Unavailable rigs, and the Flex 1 →
 * Flex 2 upgrade through a new Device entity.
 */
import type { IncidentDef } from '../../types';
import { c, on, p } from '../../types';
import {
  F,
  OP,
  P,
  buildWith,
  dc,
  deviceIp,
  gw,
  hrn,
  orcaSave,
  rig,
  statusTo,
  sym,
  teach,
  wm,
} from './helpers';

const CMP = 'CFD_TOTAL';
const PO_PATH = 'app/src/androidTest/java/com/labsim/uia/pageobjects/CfdThankYouScreen.java';
const FLEX_JOB = 'Java/uia-remote-regression-flex';

export const INC36: IncidentDef = {
  id: 'INC36',
  name: 'Duo CFD OCR broken by a 10-pixel shift',
  difficulty: 3,
  base: 400,
  parS: 240,
  severity: 'P1',
  rigs: { roles: ['duo'], default: 'r2-d2', scope: 'rig', describe: '`duo` (R2-D2)' },
  escalatable: false,
  unlockedBy: 'M16',
  tags: ['orca.screencompare', 'vision.tesseract', 'pigeon.gimp'],
  factIds: ['F153', 'F154', 'F155', 'F156', 'F212'],
  ticket: { title: 'Duo CFD suite red after the app update', reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('ocr.labelShift', { device: '$DEV', px: 10 })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', 'PL7: [ocr] capture webcam → crop 236x44@412,288 → tesseract → "TOTAI $10.B3" → match=false'),
    sym('Orca', 'Screen Compare CFD_TOTAL (x 412, y 288, w 236, h 44, expected "TOTAL $10.83") → Test panel: the crop clips the bottom of the glyphs.'),
  ],
  diagnosisPath: ['OCR returned the right words, mangled at the bottom edge.', 'Orca Screen Compare → Test: the crop clips the glyphs.', 'Re-measure the label (camera Snapshot → GIMP) and move the box.'],
  hints: [
    'Tesseract read almost the right text. What would clip the bottom of every letter?',
    `Orca → Screen Compare Images → ${CMP} → Test, then Camera → Snapshot → GIMP.`,
    `Set ${CMP} y to 298 (±3 px) — the label moved 10 px down — then Test → match=true and rebuild PL7.`,
  ],
  fix: { handsOn: `Re-measure (camera Snapshot → GIMP) and set y = 298 (±3); Test → match=true.` },
  success: () => c.all(c.approx(p.screenCompare(CMP).y, 298, 3), c.approx(p.screenCompare(CMP).x, 412, 3), c.nextBuild({ pipeline: 'PL7' })),
  diagnosisCall: dc(
    'Label shifted ~10 px; the box is stale',
    ['Copy changed', 'The text is the same words, damaged at the bottom. Look at the crop in the Test panel.'],
    ['Camera URL wrong', 'A wrong camera reads a different screen entirely. This is the right text, clipped.'],
    ['Tesseract crashed', 'Tesseract returned text. What image did it get?'],
  ),
  wrongButTempting: [
    wm('whole-screen', 'Widen the box to the whole screen', 100, orcaSave('screenCompareImage'), teach('OCR returns all the text — still false.', 'The workaround compares the crop against one expected string; it is brittle by design. (Ref §3)', 'Re-measure the label and move the box.'), { when: c.gt(p.screenCompare(CMP).w, 400) }),
    wm('expected-garbage', 'Set expected = "TOTAI $10.B3"', 150, orcaSave('screenCompareImage'), teach('You taught the check to accept garbage.', 'A 10-pixel shift breaks the OCR workaround; the fix is the box, not the expected text. (Ref §3)', 'Restore TOTAL $10.83; move the box.'), { when: c.eq(p.screenCompare(CMP).expected, 'TOTAI $10.B3') }),
    wm('disable', 'Disable the check', 150, orcaSave('screenCompareImage'), teach('You switched off the assertion.', 'OCR checks are being phased out by migrating them to UI Automator 2.3 — not by disabling them. (Ref §3)', 'Fix the box now; migrate as planned work.'), { when: c.truthy(p.screenCompare(CMP).deprecated) }),
  ],
  teaches: 'Ref §3 Screen Compare Image: the OCR workaround is brittle (a 10-pixel shift breaks it) and is being phased out for UI Automator 2.3 (Full Shifts offer INC38 as follow-up planned work).',
};

export const INC37: IncidentDef = {
  id: 'INC37',
  name: 'Duo CFD OCR broken by capitalisation or a typo',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P1',
  rigs: { roles: ['duo'], default: 'r2-d2', scope: 'rig', describe: '`duo`' },
  escalatable: false,
  unlockedBy: 'M16',
  tags: ['orca.screencompare', 'vision.tesseract'],
  factIds: ['F155', 'F153'],
  ticket: { title: 'Duo CFD suite red: OCR mismatch', reporter: 'jenkins-bot' },
  setup: () => ({ scenario: [F('ocr.capitalisation', { device: '$DEV' })] }),
  reveal: 'pipeline',
  onSpawn: () => [{ do: 'chat', author: 'morgan', text: 'Heads-up: the CFD "layout v2" copy change (Total instead of TOTAL) is intended.', delayS: 30 }],
  symptoms: [
    sym('Jenkins', '[ocr] capture webcam → crop 236x44@412,288 → tesseract → "Total $10.83" → match=false (expected TOTAL $10.83)'),
    sym('LabChat', P('{{morgan}} confirms the copy change is intended.')),
  ],
  diagnosisPath: ['OCR read clean text — it just differs from the expected string.', 'Compare character by character.', 'Set the expected text to exactly what the CFD shows.'],
  hints: [
    'Put the OCR result next to the expected text. What differs?',
    `Orca → Screen Compare Images → ${CMP} → expected text.`,
    `Set ${CMP}'s expected text to exactly what the CFD shows ("Total $10.83") and rebuild PL7.`,
  ],
  fix: { handsOn: 'Set expected to exactly what the CFD shows ("Total $10.83").' },
  success: () => c.all(c.eq(p.screenCompare(CMP).expected, 'Total $10.83'), c.nextBuild({ pipeline: 'PL7' })),
  diagnosisCall: dc(
    'Expected string no longer matches (case/typo)',
    ['Box shifted', 'A shifted box mangles glyphs. These letters are clean.'],
    ['Camera dark', 'A dark camera gives no text at all.'],
    ['CFD not tethered', 'The Duo is one terminal with two displays — and the OCR read its CFD fine.'],
  ),
  wrongButTempting: [
    wm('move-box', 'Move the box', 0, orcaSave('screenCompareImage', { fields: ['bbox', 'x', 'y', 'w', 'h'] }), teach('No effect.', 'The crop is fine; the string differs. A capitalisation change or a typo breaks the suite. (Ref §3)', 'Fix the expected text.')),
    wm('lowercase', 'Lower-case both strings', 0, orcaSave('screenCompareImage'), teach('Still false — the compare is exact [illus.].', 'The OCR workaround compares the exact expected string. (Ref §3)', 'Set the expected text to exactly what the CFD shows.', { illustrative: true }), { when: c.eq(p.screenCompare(CMP).expected, 'total $10.83') }),
  ],
  teaches: 'Ref §3: a capitalisation change or a typo breaks the OCR suite.',
  variants: [
    {
      id: 'B',
      label: 'Typo in the expected text',
      overrides: {
        setup: () => ({ scenario: [F('ocr.typo', { compare: CMP })] }),
        onSpawn: () => [],
        symptoms: [
          sym('Jenkins', '[ocr] capture webcam → crop 236x44@412,288 → tesseract → "TOTAL $10.83" → match=false (expected TOTAL $10.38)'),
          sym('Orca', P('CFD_TOTAL row history shows an edit of the expected text ({{alex}}).')),
        ],
        hints: [
          'Put the OCR result next to the expected text. What differs?',
          `Orca → Screen Compare Images → ${CMP} → expected text and history.`,
          `Set ${CMP}'s expected text back to "TOTAL $10.83" and rebuild PL7.`,
        ],
        fix: { handsOn: 'Set expected to "TOTAL $10.83".' },
        success: () => c.all(c.eq(p.screenCompare(CMP).expected, 'TOTAL $10.83'), c.nextBuild({ pipeline: 'PL7' })),
      },
    },
  ],
};

export const INC38: IncidentDef = {
  id: 'INC38',
  name: 'Migrate the last Duo OCR check to UI Automator 2.3',
  difficulty: 5,
  base: 900,
  parS: 600,
  severity: 'P2',
  rigs: { roles: ['duo'], default: 'r2-d2', scope: 'rig', describe: '`duo` (R2-D2)' },
  escalatable: false,
  unlockedBy: 'M16',
  plannedWork: true,
  tags: ['uia.v23', 'orca.screencompare', 'uia.pom', 'uia.sync', 'uia.packages', 'uia.config', 'orca.status.reserved', 'tools.github'],
  factIds: ['F006', 'F007', 'F156', 'F168', 'F178', 'F179', 'F180', 'F193', 'F112'],
  ticket: { title: 'Kill the CFD_THANK_YOU OCR check — move it to UIA 2.3 like we did for CFD_TOTAL', reporter: 'morgan' },
  setup: () => ({ scenario: [OP('repo.clone', { repo: 'uia-remote' })] }),
  reveal: 'immediate',
  symptoms: [
    sym('IDE', 'testactions/DuoCheckoutTest.java: assertTrue(orca.screenCompare("CFD_THANK_YOU")); with a TODO to migrate it like CFD_TOTAL.'),
    sym('Orca', 'Screen Compare Images: CFD_THANK_YOU still active (used by DuoCheckoutTest).'),
  ],
  diagnosisPath: [
    'Orca → R2-D2 → Reserved.',
    'IntelliJ → uia-remote → branch feat/duo-cfd-thank-you-uia23.',
    'Create pageobjects/CfdThankYouScreen.java (extends BaseTest; Zone 1 locator on the CFD display; waitForScreen() and isScreenPresent()).',
    'DuoCheckoutTest: replace the screenCompare assertion with cfdThankYou.waitForScreen(); assertTrue(cfdThankYou.isScreenPresent());',
    'config.properties: runType=tethered, both IPs 10.42.30.14, deviceType=Station, portNumber=5444.',
    'Run DuoCheckoutTest locally → PASS.',
    'Push, open a PR → {{morgan}} merges if checks pass.',
    'Orca → Screen Compare Images → CFD_THANK_YOU → mark Deprecated (do not delete).',
    'Orca → R2-D2 → Available.',
  ].map(P),
  hints: [
    'This is a project: reserve the rig, write the page object, swap the assertion, test, merge, deprecate, release.',
    `IntelliJ → new class in pageobjects: CfdThankYouScreen with a By.text("Thank you").displayId(cfdDisplayId) locator, waitForScreen() and isScreenPresent().`,
    P('Reserve R2-D2 → page object → replace the assertion in DuoCheckoutTest → run it locally (PASS) → push + PR ({{morgan}} merges) → deprecate CFD_THANK_YOU → R2-D2 Available.'),
  ],
  walkthrough: (b) => [
    { text: `Orca → ${hrn(b)} → Reserved`, doneWhen: c.status(rig(b), 'RESERVED') },
    { text: `Create ${PO_PATH}`, doneWhen: c.truthy(p.codeFact('isScreenPresent', 'local:CfdThankYouScreen')) },
    { text: 'DuoCheckoutTest: replace the screenCompare assertion', doneWhen: c.falsy(p.codeFact('screenCompare', 'local:DuoCheckoutTest')) },
    { text: 'Run DuoCheckoutTest locally', doneWhen: c.eq(p.localRun('DuoCheckoutTest').result, 'PASS') },
    { text: 'Push and open a PR', doneWhen: c.eq(p.pr('uia-remote').state, 'MERGED') },
    { text: 'Orca → Screen Compare Images → CFD_THANK_YOU → Deprecated', doneWhen: c.truthy(p.screenCompare('CFD_THANK_YOU').deprecated) },
    { text: `Orca → ${hrn(b)} → Available`, doneWhen: c.status(rig(b), 'AVAILABLE') },
  ],
  fix: {
    handsOn: P(
      'Reserved → branch → CfdThankYouScreen (Zone 1: private final BySelector thankYou = By.text("Thank you").displayId(cfdDisplayId); Zone 2: waitForScreen() { device.wait(Until.hasObject(thankYou), TIMEOUT_MS); } and isScreenPresent()) → DuoCheckoutTest uses cfdThankYou.waitForScreen(); assertTrue(cfdThankYou.isScreenPresent()); → local PASS → PR ({{morgan}} merges) → CFD_THANK_YOU Deprecated → Available. (Selector style is illustrative; the fact taught is that UI Automator 2.3 natively locates elements on both screens.)',
    ),
  },
  success: (b) =>
    c.all(
      c.truthy(p.gitFile('uia-remote', PO_PATH).exists),
      c.truthy(p.codeFact('waitForScreen', 'CfdThankYouScreen')),
      c.truthy(p.codeFact('isScreenPresent', 'CfdThankYouScreen')),
      c.falsy(p.codeFact('screenCompare', 'DuoCheckoutTest')),
      c.eq(p.localRun('DuoCheckoutTest').result, 'PASS'),
      c.label(c.wasTrue(c.all(c.status(rig(b), 'RESERVED'), c.eq(p.localRun('DuoCheckoutTest').result, 'RUNNING'))), 'Ran locally while Reserved'),
      c.truthy(p.screenCompare('CFD_THANK_YOU').exists),
      c.truthy(p.screenCompare('CFD_THANK_YOU').deprecated),
      c.status(rig(b), 'AVAILABLE'),
      c.nextBuild({ pipeline: 'PL7' }),
    ),
  diagnosisCall: 'none',
  wrongButTempting: [
    wm('delete-compare', 'Delete the Screen Compare row before the merge', 100, orcaSave('screenCompareImage', { action: 'delete' }), teach('Another suite still referenced it.', 'Deprecate OCR checks as they are migrated; UI Automator 2.3 replaces them. (Ref §3)', 'Mark it Deprecated instead.')),
    wm('po-in-testactions', 'Put the page object in testactions', 50, on('git.fileEdited', { repo: 'uia-remote' }, (pl) => /testactions\/CfdThankYouScreen\.java$/.test(pl.path)), teach('Wrong package.', 'pageobjects holds screen classes; testactions holds tests. (Ref §4)', 'Move it to pageobjects.')),
    wm('skip-reserved', 'Skip Reserved', 200, on('test.localRunStarted', { testName: 'DuoCheckoutTest' }, (pl, s) => Object.values(s.lab.orca.robots).find((r) => r.name === pl.robotName)?.status !== 'RESERVED'), teach('Your run collided with Jenkins.', 'Reserve the rig before running locally. (Ref §3)', 'Orca → Reserved first.')),
    wm('ip-mismatch', 'CFD IP ≠ MFD IP', 0, undefined, teach('The run fails to find the CFD.', 'On a Station Duo both IPs are the same. (Ref §4)', 'Set both to 10.42.30.14.')),
  ],
  teaches: 'Ref §3: OCR Screen Compare is being deprecated. Ref §1: UI Automator v2.3 adds native dual-screen element tracking. Ref §4: project structure, mandatory methods, config.',
};

/** INC39 variant table: saved wrong value → the exact enum. */
const ENV_CASES: readonly { id: string; label: string; value: string; correct: string; job: string }[] = [
  { id: 'A', label: 'flex_3', value: 'flex_3', correct: 'FLEX_3', job: FLEX_JOB },
  { id: 'B', label: 'Flex_3', value: 'Flex_3', correct: 'FLEX_3', job: FLEX_JOB },
  { id: 'C', label: 'flex_4', value: 'flex_4', correct: 'FLEX_4', job: FLEX_JOB },
  { id: 'D', label: 'FLEX3', value: 'FLEX3', correct: 'FLEX_3', job: FLEX_JOB },
  { id: 'E', label: 'PL4 mini_3', value: 'mini_3', correct: 'MINI_3', job: 'Java/uia-remote-regression-mini' },
];

function envCase(id: string) {
  const e = ENV_CASES.find((x) => x.id === id)!;
  return {
    ticket: { title: `${e.job.split('/')[1]} fails at checkout`, reporter: 'jenkins-bot' as const, misleading: { title: e.correct.startsWith('MINI') ? 'No Mini rigs are available?' : 'No Flex rigs are available?' } },
    setup: () => ({ scenario: [F('jenkins.envCase', { job: e.job, value: e.value }), OP('jenkins.startBuild', { job: e.job, by: 'jenkins' })] }),
    symptoms: [
      sym('Jenkins', `[orca] checkout request deviceType=${e.value}\njava.lang.IllegalArgumentException: No enum constant com.labsim.orca.domain.enumeration.DeviceType.${e.value}\nFAILURE`),
      sym('Orca', e.correct.startsWith('MINI') ? 'BUMBLEBEE is Available (capacity is fine).' : 'WALL-E and EVE are Available (capacity is fine).'),
    ],
    hints: [
      'Orca has free robots. Read exactly what the checkout asked for.',
      `Jenkins → ${e.job} → Configure (or Build with Parameters) → DEVICE_TYPE.`,
      `DEVICE_TYPE=${e.correct} (the exact ALL-CAPS enum) and rebuild.`,
    ] as const,
    fix: { handsOn: `Job ▸ Configure (or Build with Parameters) → DEVICE_TYPE=${e.correct} → console [orca] checkout → … (${e.correct}) OK.` },
    success: () => c.nextBuild({ jobs: [e.job], params: { DEVICE_TYPE: e.correct } }),
  };
}

export const INC39: IncidentDef = {
  id: 'INC39',
  name: 'Jenkins env var case (flex_3)',
  difficulty: 1,
  base: 200,
  parS: 120,
  severity: 'P1',
  rigs: { default: null, scope: 'none', describe: 'any pipeline (default PL1)' },
  escalatable: false,
  unlockedBy: 'M11',
  tags: ['jenkins.envvars', 'orca.devicetype'],
  factIds: ['F121', 'F122', 'F016', 'F004'],
  ...envCase('A'),
  reveal: 'immediate',
  diagnosisPath: ['Orca has capacity; the checkout itself threw.', 'Read the exception: the enum constant does not exist.', 'Set the exact ALL-CAPS value and rebuild.'],
  diagnosisCall: dc(
    "The env var value isn't the exact ALL-CAPS enum",
    ['No Flex rigs available', 'Orca shows matching rigs Available. Read the exception.'],
    ['Orca down', 'Orca answered with an IllegalArgumentException — it is up.'],
    ['Wrong folder', 'The job ran; it failed at checkout. Read what it asked for.'],
  ),
  wrongButTempting: [
    wm('fix-enum', 'Change the enum in Orca', 150, undefined, teach('The enum is the source of truth.', 'Device Type is an enum; that is why Jenkins env vars must be ALL CAPS. (Ref §3)', 'Fix the job parameter.')),
    wm('gen3', 'DEVICE_TYPE=FLEX_GEN3', 0, buildWith(FLEX_JOB, (pp) => pp.DEVICE_TYPE === 'FLEX_GEN3'), teach('Same exception.', 'FLEX_GEN3 is a testing profile, not a DeviceType constant.', 'Use FLEX_3 or FLEX_4.')),
    wm('available-again', 'Set WALL-E Available again', 0, undefined, teach('It already is.', 'Capacity was never the problem.', 'Read the checkout exception.')),
  ],
  teaches: 'Ref §3: the Device Type enum is why Jenkins env vars must be ALL CAPS. Ref §1: Jenkins injects runtime env vars. JHipster generates the enums.',
  variants: ENV_CASES.filter((e) => e.id !== 'A').map((e) => ({ id: e.id, label: e.label, overrides: envCase(e.id) })),
};

export const INC40: IncidentDef = {
  id: 'INC40',
  name: 'PayCore rig overwritten (must stay Unavailable)',
  difficulty: 3,
  base: 450,
  parS: 300,
  severity: 'P1',
  rigs: { roles: ['paycore'], default: 'rosie', scope: 'rig', describe: '`paycore` (ROSIE)' },
  escalatable: false,
  unlockedBy: 'M06',
  tags: ['orca.status.unavailable', 'laz.oobe', 'orca.merchant', 'cards.philosophy', 'orca.status', 'uia.history'],
  factIds: ['F102', 'F103', 'F104', 'F046', 'F047', 'F162', 'F226'],
  ticket: { title: P('PayCore matrix failing on ROSIE — wrong merchant!'), reporter: 'sam' },
  setup: () => ({ scenario: [F('orca.statusOverride', { robot: '$R', status: 'AVAILABLE', by: 'alex' }), F('merchant.overwritten', { robot: '$R' })] }),
  reveal: 'pipeline',
  symptoms: [
    sym('Jenkins', 'PL8: [paycore] merchant mismatch: expected PAYCORE-STANDALONE-01, got AUTO-US-NOPIN-01'),
    sym('Notes', P('STATUS Unavailable → Available ({{alex}})')),
    sym('Camera', 'Rack B camera: ROSIE shows the generic Register app.'),
  ],
  diagnosisPath: ['The Notes history shows a manual Unavailable → Available change.', 'A general job used the PayCore rig and Laz swapped its merchant.', 'Lock it back to Unavailable and restore the merchant with a named Laz job.'],
  hints: [
    "ROSIE's merchant changed. Read its Notes history.",
    'Orca → ROSIE → Status; Jenkins → Java/laz-oobe-merchant-swap with parameters.',
    'ROSIE → Unavailable, then Build with Parameters on Java/laz-oobe-merchant-swap: ROBOT_NAME=rosie, MERCHANT=PAYCORE-STANDALONE-01; wait for PL8 green.',
  ],
  fix: { handsOn: '1) ROSIE → Unavailable. 2) Java/laz-oobe-merchant-swap with ROBOT_NAME=rosie, MERCHANT=PAYCORE-STANDALONE-01 (a named job may use an Unavailable rig) → laz: merchant active. 3) Wait for PL8 green; ROSIE returns to Unavailable on release.' },
  success: (b) => c.all(c.status(rig(b), 'UNAVAILABLE'), c.eq(p.hwDevice(String(b.vars.dev)).activeMerchant, 'PAYCORE-STANDALONE-01'), c.nextBuild({ pipeline: 'PL8' })),
  diagnosisCall: dc(
    'The PayCore rig was opened to general pipelines and one overwrote its merchant',
    ['PayCore merchant expired', 'The merchant exists; the device runs a different one. Who changed ROSIE?'],
    ['Callus card matrix broken', 'The failure is a merchant mismatch before any card is used.'],
    ['Ubi down', 'Ubi routed the switch successfully — that is the problem. Read the Notes.'],
  ),
  wrongButTempting: [
    gw('leave-available', 'GW05', 'Leave it Available and re-run Laz (overwritten again within 60 s)'),
    wm('offline', 'Set it Offline', 100, statusTo('rosie', 'OFFLINE'), teach('Offline is for builds.', 'Unavailable isolates specialised rigs; named jobs can use them [illus.: not Offline ones]. (Ref §3)', 'Set it Unavailable.')),
    wm('reserved', 'Set it Reserved', 100, statusTo('rosie', 'RESERVED'), teach("That blocks PayCore's named job.", 'Reserved blocks Jenkins entirely — including named jobs. (Ref §3)', 'Set it Unavailable.')),
  ],
  teaches: 'Ref §3: Unavailable isolates specialised rigs such as PayCore standalone setups so general tests do not overwrite their merchant profiles. Ref §4: PayCore adopted uia-remote (e.g. LabSim Dining).',
  variants: [
    {
      id: 'B',
      label: "Real run: a general job takes ROSIE",
      overrides: {
        setup: () => ({ scenario: [F('orca.statusOverride', { robot: '$R', status: 'AVAILABLE', by: 'alex' }), OP('jenkins.startBuild', { job: FLEX_JOB, params: { DEVICE_TYPE: 'FLEX_POCKET' }, by: 'riley' })] }),
        symptoms: [
          sym('Jenkins', P("{{riley}}'s build: [orca] checkout → rosie (FLEX_POCKET) OK · ubi: routing merchant switch → AUTO-US-NOPIN-01 · laz: merchant active")),
          sym('Jenkins', 'PL8: [paycore] merchant mismatch: expected PAYCORE-STANDALONE-01, got AUTO-US-NOPIN-01'),
          sym('Notes', P('STATUS Unavailable → Available ({{alex}})')),
        ],
      },
    },
  ],
};

export const INC41: IncidentDef = {
  id: 'INC41',
  name: 'Named job on an Unavailable rig',
  difficulty: 2,
  base: 300,
  parS: 180,
  severity: 'P2',
  rigs: { roles: ['paycore'], default: 'rosie', scope: 'rig', describe: '`paycore` (ROSIE)' },
  escalatable: false,
  unlockedBy: 'M06',
  tags: ['orca.status.unavailable', 'orca.names', 'jenkins.checkout', 'cards.philosophy'],
  factIds: ['F102', 'F104', 'F117', 'F226'],
  ticket: { title: 'I need a Visa/Discover/AmEx matrix run on ROSIE now — Jenkins says no robot', reporter: 'sam' },
  setup: () => ({ scenario: [OP('jenkins.startBuild', { job: 'Java/paycore-standalone-matrix', params: { ROBOT_NAME: '' }, by: 'sam' })] }),
  reveal: 'immediate',
  symptoms: [sym('Jenkins', 'No Available robot matches FLEX_POCKET (rosie is Unavailable)')],
  diagnosisPath: ['The only matching rig is Unavailable — on purpose.', 'Unavailable rigs are checked out only by their exact unique Name.', 'Build with ROBOT_NAME=rosie; leave the status alone.'],
  hints: [
    'ROSIE is Unavailable on purpose. How does a job get an Unavailable rig?',
    'Jenkins → Java/paycore-standalone-matrix → Build with Parameters → ROBOT_NAME.',
    'ROBOT_NAME=rosie (the system Name, not the Human Readable Name) → Checked out robot rosie (named). Do not touch the status.',
  ],
  fix: { handsOn: 'Build with Parameters ROBOT_NAME=rosie (system Name) → Checked out robot rosie (named); afterwards [orca] released rosie → Unavailable.' },
  success: (b) =>
    c.all(
      c.label(c.never(c.status(rig(b), 'AVAILABLE')), 'ROSIE never set Available'),
      c.status(rig(b), 'UNAVAILABLE'),
      c.nextBuild({ jobs: ['Java/paycore-standalone-matrix'], params: { ROBOT_NAME: 'rosie' } }),
    ),
  diagnosisCall: dc(
    "Unavailable rigs need the robot's exact unique Name in the job",
    ['ROSIE broken', 'ROSIE passes its health checks. Read the checkout message.'],
    ['Must set it Available first', 'Setting a PayCore rig Available invites general pipelines to overwrite its merchant.'],
    ['Wrong device type', 'The checkout matched FLEX_POCKET correctly — and found only an Unavailable rig.'],
  ),
  wrongButTempting: [
    gw('set-available', 'GW05', 'Set ROSIE Available'),
    wm('hrn', 'Use ROBOT_NAME=ROSIE', 50, buildWith('Java/paycore-standalone-matrix', (pp) => pp.ROBOT_NAME === 'ROSIE'), teach("[orca] 404 Not Found: no robot named 'ROSIE'", 'Jobs pass the robot\'s exact unique Name; ROSIE is the Human Readable Name on the tablet. (Ref §3)', 'ROBOT_NAME=rosie.')),
  ],
  teaches: 'Ref §3 Unavailable: blocked unless the exact unique Name is passed; Orca resets it to Unavailable after the named job; Name vs Human Readable Name. Ref §6: PayCore runs exhaustive card matrices.',
  variants: [
    {
      id: 'B',
      label: 'Human Readable Name used',
      overrides: {
        setup: () => ({ scenario: [OP('jenkins.startBuild', { job: 'Java/paycore-standalone-matrix', params: { ROBOT_NAME: 'ROSIE' }, by: 'sam' })] }),
        symptoms: [sym('Jenkins', "[orca] 404 Not Found: no robot named 'ROSIE' [illus.]")],
      },
    },
  ],
};

export const INC42: IncidentDef = {
  id: 'INC42',
  name: 'Hardware upgrade: Flex 1 → Flex 2 (new Device entity)',
  difficulty: 4,
  base: 600,
  parS: 420,
  severity: 'P2',
  rigs: { roles: ['flex-legacy'], default: 'johnny-5', scope: 'rig', describe: '`flex-legacy` (JOHNNY-5)' },
  escalatable: false,
  unlockedBy: 'M07',
  plannedWork: true,
  tags: ['orca.device', 'orca.devicetype', 'power.18v', 'hw.devices', 'orca.status.offline'],
  factIds: ['F119', 'F120', 'F228', 'F229', 'F105', 'F058'],
  processBonuses: ['PB01', 'PB02', 'PB05', 'PB07'],
  ticket: { title: (b) => P(`Upgrade ${hrn(b)} from Flex 1 to Flex 2 (Husky chest, drawer 2)`), reporter: 'jared' },
  setup: () => ({}),
  reveal: 'immediate',
  symptoms: [
    sym('World', 'A spare Flex 2 (serial SIM-F2-000015) waits in the Husky chest, drawer 2.'),
    sym('Orca', (b) => `${hrn(b)} → Robot Device ${String(b.vars.device)} (FLEX_1).`),
  ],
  diagnosisPath: [
    'Orca → Offline (PB01).',
    'MOTOR off; remove the two 2.5 mm cradle-clamp bolts; unplug the Flex 1 PSU and hub cable; keep the Flex 1 for rollback.',
    'Seat the Flex 2, clamp, connect the hub, plug its PSU into the AC strip; boot (30 s).',
    'Read the serial SIM-F2-000015; the IP stays the same.',
    'Orca → Devices → Create FLEX_2 row; do not edit or delete the Flex 1 row.',
    'Robot → Robot Device → the new row → Save.',
    'adb connect …:5444; adb shell getprop ro.product.model.',
    'MOTOR on → Park All → Available → confirmation build.',
  ],
  hints: [
    'Upgrades keep the legacy configuration intact. Plan the Orca half before the hardware half.',
    'Orca → Devices → Create (new row) — then Robot → Robot Device. Never edit the old row.',
    (b) => `Offline → swap the hardware (PSU on the AC strip) → Create ${rig(b)}-flex2 (FLEX_2, SIM-F2-000015, ${deviceIp(b)}) → link it → Park All → Available → build.`,
  ],
  walkthrough: (b) => [
    { text: `Orca → ${hrn(b)} → Offline`, doneWhen: c.status(rig(b), 'OFFLINE') },
    { text: 'Swap the Flex 1 for the Flex 2 (PSU on the AC strip)', doneWhen: c.happened(on('device.swapped', { rigId: rig(b) })) },
    { text: `Orca → Devices → Create ${rig(b)}-flex2 (FLEX_2)`, doneWhen: c.eq(p.device(`${rig(b)}-flex2`).type, 'FLEX_2') },
    { text: `Robot Device → ${rig(b)}-flex2`, doneWhen: c.eq(p.robot(rig(b)).deviceId, `${rig(b)}-flex2`) },
    { text: 'MOTOR on → Park All → Available', doneWhen: c.status(rig(b), 'AVAILABLE') },
  ],
  fix: { handsOn: (b) => `Offline → hardware swap → Create ${rig(b)}-flex2 (FLEX_2, SIM-F2-000015, ${deviceIp(b)}) → Robot Device = ${rig(b)}-flex2 → Park All → Available → confirmation build. Keep ${String(b.vars.device)}.` },
  success: (b) =>
    c.all(
      c.eq(p.robot(rig(b)).deviceId, `${rig(b)}-flex2`),
      c.eq(p.device(`${rig(b)}-flex2`).type, 'FLEX_2'),
      c.truthy(p.device(String(b.vars.device)).exists),
      c.eq(p.device(String(b.vars.device)).type, 'FLEX_1'),
      c.status(rig(b), 'AVAILABLE'),
      c.label(c.nextBuild({ robots: [rig(b)] }), 'Confirmation build'),
    ),
  diagnosisCall: 'none',
  wrongButTempting: [
    gw('edit-in-place', 'GW10', 'Edit the Flex 1 Device row in place'),
    gw('delete-legacy', 'GW09', 'Delete the Flex 1 Device row'),
    gw('psu-dc', 'GW01', 'Flex 2 PSU on a DC rail'),
    wm('skip-link', 'Skip relinking Robot Device', 0, undefined, teach('Tests drive a Flex 2 with the Flex 1 layout → red builds.', 'The Robot Device field links to the Device entity; relink after the swap. (Ref §3)', 'Robot → Robot Device → the new row.')),
  ],
  teaches: 'Ref §3 Robot Device decoupling: a Flex 1 → Flex 2 upgrade keeps the legacy configuration for quick rollback (Cur M07 does the Orca half; here the player also does the hardware half).',
};
