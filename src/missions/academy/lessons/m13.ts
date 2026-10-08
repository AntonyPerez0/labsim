/**
 * M13 — uia-remote: Structure & the Page Object Model (Cur §2 M13). Mentor {{morgan}}.
 * Setup (`academy:M13`, Sim §4.4.2): `uia.scrollSwapped` (HomeScreen.open() Flex branch scrolls
 * horizontally) and `uia.missingScreenMethods { class: 'ReceiptScreen' }`; the player clones uia-remote
 * in step 3 and gets both bugs. Code facts are evaluated on the working tree (`local:<Class>`, Sim §3.19.6).
 */
import { c, on, p } from '../../types';
import type { Condition, LessonDef, ScriptAction } from '../../types';
import { inject, localFilesNamed, zoneClick, say } from './helpers';

const REPO = 'uia-remote';
const PO = 'app/src/androidTest/java/com/labsim/uia/pageobjects';

/** Where each file belongs (folder segments its path must contain). */
const PLACEMENT: readonly { file: string; under: string; pkg?: string; label: string }[] = [
  { file: 'DbHelper.java', under: 'app/src/androidTest/', pkg: '/databases/', label: 'DbHelper.java → androidTest/…/databases' },
  { file: 'HomeScreen.java', under: 'app/src/androidTest/', pkg: '/pageobjects/', label: 'HomeScreen.java → androidTest/…/pageobjects' },
  { file: 'LockScreen.java', under: 'app/src/androidTest/', pkg: '/pageobjects/', label: 'LockScreen.java → androidTest/…/pageobjects' },
  { file: 'TaxTest.java', under: 'app/src/androidTest/', pkg: '/testactions/', label: 'TaxTest.java → androidTest/…/testactions' },
  { file: 'MultiDeviceRunner.java', under: 'app/src/test/', label: 'MultiDeviceRunner.java → test' },
  { file: 'AppRegistration.java', under: 'app/src/main/', label: 'AppRegistration.java → main' },
];

const placed = (f: (typeof PLACEMENT)[number]): Condition =>
  c.custom(`m13-place-${f.file}`, f.label, (s) => {
    const hits = localFilesNamed(s, REPO, f.file);
    return hits.length > 0 && hits.every(([path]) => path.startsWith(f.under) && (!f.pkg || path.includes(f.pkg)));
  });

/** Cur M13 step 11 order of the runner's calls. */
const RUNNER_ORDER = [
  'mfd.run(registerHome::addTaxItem5)',
  'mfd.run(registerHome::reviewOrder)',
  'cfd.run(cfdTotals::assertTotals)',
  'mfd.run(registerHome::payAndCharge)',
  'cfd.run(cfdPayment::finalisePayment)',
] as const;

const runnerOrdered = c.custom('m13-runner-order', 'MultiDeviceRunner calls in tethered-sale order', (s) => {
  const [hit] = localFilesNamed(s, REPO, 'MultiDeviceRunner.java');
  if (!hit) return false;
  const text = hit[1].replace(/[ \t]+/g, '');
  let at = -1;
  for (const call of RUNNER_ORDER) {
    const i = text.indexOf(call.replace(/\s+/g, ''), at + 1);
    if (i <= at) return false;
    at = i;
  }
  return true;
});

/** Staging folder for the step-5 placement puzzle (repo root, outside app/src). */
const STAGING = 'unsorted';

/**
 * Step 5 puzzle (Cur M13 s5): the cloned repo already has every file in place, so the lesson moves the
 * five test-side files into `unsorted/` for the player to drag back (`intellij.file.moved` rewrites the
 * package). AppRegistration stays in main — QA never touches it; the player only has to find it.
 */
const stageFiles: ScriptAction = {
  do: 'sim',
  run: (sim, ctx) => {
    const files = (ctx.lab.repos as unknown as Record<string, { local?: { files?: Record<string, string> } }>)[REPO]?.local?.files ?? {};
    for (const f of PLACEMENT) {
      if (f.file === 'AppRegistration.java') continue;
      const from = Object.keys(files).find((path) => path.startsWith(f.under) && path.endsWith(`/${f.file}`));
      if (from) sim.git.moveFile(REPO, from, `${STAGING}/${f.file}`);
    }
  },
};

/** Step 11 puzzle: scramble the five `run(...)` lines of MultiDeviceRunner for the player to reorder. */
const SCRAMBLE = [2, 3, 0, 4, 1] as const;
const scrambleRunner: ScriptAction = {
  do: 'sim',
  run: (sim, ctx) => {
    const files = (ctx.lab.repos as unknown as Record<string, { local?: { files?: Record<string, string> } }>)[REPO]?.local?.files ?? {};
    const path = Object.keys(files).find((x) => x.endsWith('/MultiDeviceRunner.java'));
    if (!path) return;
    const lines = files[path]!.split('\n');
    const idx = RUNNER_ORDER.map((call) => lines.findIndex((l) => l.includes(call)));
    if (idx.some((i) => i < 0)) return;
    const original = idx.map((i) => lines[i]!);
    idx.forEach((i, k) => (lines[i] = original[SCRAMBLE[k]!]!));
    sim.git.writeFile(REPO, path, lines.join('\n'));
  },
};

/**
 * ReceiptScreen's action helpers wait for the screen before clicking (the runner races the render otherwise,
 * Sim §3.19.5): `waitForScreen();` appears before `.click()` in both noReceipt() and print().
 */
const receiptWaitsBeforeClick: Condition = c.custom('m13-receipt-wait-call', 'noReceipt() / print() call waitForScreen() first', (s) => {
  const [hit] = localFilesNamed(s, REPO, 'ReceiptScreen.java');
  if (!hit) return false;
  const text = hit[1].replace(/\/\/[^\n]*/g, '');
  return ['noReceipt', 'print'].every((m) => {
    const start = text.search(new RegExp(`void\\s+${m}\\s*\\(\\s*\\)\\s*\\{`));
    if (start < 0) return false;
    const body = text.slice(start, text.indexOf('}', start));
    const call = body.search(/\bwaitForScreen\(\)/);
    const click = body.indexOf('.click()');
    return call >= 0 && (click < 0 || call < click);
  });
});

const appRegistrationFound: Condition = c.appAction('intellij', 'intellij.tree.nodeClicked', (d) => String(d.path ?? '').startsWith('app/src/main/') && String(d.path ?? '').endsWith('AppRegistration.java'));
const PUZZLE = PLACEMENT.filter((f) => f.file !== 'AppRegistration.java');

export const M13: LessonDef = {
  moduleId: 'M13',
  mentor: 'morgan',
  setup: { preset: 'academy:M13', spawn: 'loc.morgan-desk', apps: { unlock: ['github', 'intellij', 'terminal', 'camera', 'chat'] } },
  deck: 'deck.M13',
  manualChapters: ['Test Frameworks'],
  realLabChecklist: [
    'Clone uia-remote from GitHub into IntelliJ IDEA (Get from Version Control) and learn its Maven-style app/src layout.',
    'Never modify app/src/main. Page objects go in androidTest/…/pageobjects, tests in …/testactions, DB code in …/databases, runners in test.',
    'Every screen class extends BaseTest, declares its locators in Zone 1 and its helpers in Zone 2, and implements waitForScreen() and isScreenPresent().',
    'Device quirks live in Zone 2 helpers: open(appName) scrolls vertically on a Flex and horizontally on a Mini or Station.',
    'UI Automator talks to one device at a time: the runner in test hops between MFD and CFD handles method by method.',
  ],
  steps: [
    {
      id: 'M13.01',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "uia-remote is mine. I built it because no framework could automate native tethered setups: Station-to-Mini, Mini-to-Mini, Station Duo. It's Java on Google's Android UI Automator, version 2.3, and it drives standalone and tethered devices across native LabSim apps.",
      factIds: ['F159', 'F039', 'F040', 'F005', 'F006', 'F001'],
    },
    {
      id: 'M13.02',
      kind: 'computer-task',
      hud: 'Copy the uia-remote clone URL',
      app: 'github',
      route: '/labsim-lab/uia-remote',
      success: c.appAction('github', 'github.cloneUrl.copied', (d) => d.repo === REPO),
      showMe: [{ app: 'github', route: '/labsim-lab/uia-remote', target: 'github.codeButton', action: 'click', caption: 'Code → copy the SSH URL' }],
      factIds: ['F018'],
    },
    {
      id: 'M13.03',
      kind: 'computer-task',
      hud: 'Clone it into IntelliJ IDEA',
      app: 'intellij',
      route: '/welcome',
      success: c.any(c.happened(on('git.cloned', { repo: REPO })), c.appAction('intellij', 'intellij.project.cloned', (d) => d.repo === REPO && d.ok === true)),
      showMe: [{ app: 'intellij', route: '/welcome', target: 'intellij.getFromVcs', action: 'click', caption: 'File → New → Project from Version Control…' }],
      // A fresh clone has only config.properties.example, and the M13.08/M13.09 local runs refuse to start
      // without config.properties (config is M14's topic): {{morgan}} drops a WALL-E config in.
      onComplete: [
        inject({ op: 'config.write', params: { fixture: 'target', robot: 'wall-e' } }),
        say('morgan', "Cloned. I've dropped a config.properties for WALL-E into your project so local runs work. It's git-ignored; we'll dig into it later."),
      ],
      factIds: ['F027', 'F028'],
    },
    {
      id: 'M13.04',
      kind: 'computer-task',
      hud: 'Expand app/src and click the folder QA engineers never modify',
      app: 'intellij',
      route: '/project/uia-remote',
      success: c.appAction('intellij', 'intellij.tree.nodeClicked', (d) => d.repo === REPO && d.path === 'app/src/main' && d.kind === 'dir'),
      wrongActions: [
        {
          id: 'fair-game',
          on: on('app.action', { app: 'intellij', action: 'intellij.tree.nodeClicked' }, (pl) => {
            const path = String((pl.data as { path?: string } | undefined)?.path ?? '');
            return path === 'app/src/test' || path === 'app/src/androidTest';
          }),
          say: "That one's fair game. Try again.",
        },
      ],
      onComplete: [say('morgan', 'main is production and app registration code. QA engineers never touch it. Everything we write lives in test and androidTest.')],
      factIds: ['F163', 'F164', 'F010'],
    },
    {
      id: 'M13.05',
      kind: 'computer-task',
      hud: 'Put these files where they belong',
      app: 'intellij',
      route: '/project/uia-remote',
      onEnter: [stageFiles],
      success: c.all(c.forAll(PUZZLE, placed), appRegistrationFound),
      objectives: [
        ...PUZZLE.map((f) => ({ id: `M13.05.${f.file.replace('.java', '')}`, text: `unsorted/${f.label}`, done: placed(f) })),
        { id: 'M13.05.AppRegistration', text: 'AppRegistration.java: find it in main (it stays there)', done: appRegistrationFound },
      ],
      wrongActions: [
        {
          id: 'into-main',
          on: on('app.action', { app: 'intellij', action: 'intellij.file.moved' }, (pl) => String((pl.data as { to?: string } | undefined)?.to ?? '').startsWith('app/src/main/')),
          say: 'Not in main. Tests and page objects live in androidTest; runners live in test.',
          gw: 'GW14',
        },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'androidTest has three packages: databases, pageobjects, testactions. Drag each file from unsorted/ (or F6 → Move).' },
        { afterS: 120, idle: true, effect: 'text', text: 'DbHelper → databases · HomeScreen, LockScreen → pageobjects · TaxTest → testactions · MultiDeviceRunner → test/…/runner.' },
      ],
      factIds: ['F165', 'F166', 'F167', 'F168', 'F169', 'F164'],
    },
    {
      id: 'M13.06',
      kind: 'computer-task',
      hud: 'Open HomeScreen.java and click Zone 1, then Zone 2',
      app: 'intellij',
      route: `/project/uia-remote/file/${PO}/HomeScreen.java`,
      success: c.sequence(zoneClick('HomeScreen.java', 1), zoneClick('HomeScreen.java', 2)),
      objectives: [
        { id: 'M13.06.z1', text: 'Zone 1: Element Locators', done: c.happened(zoneClick('HomeScreen.java', 1)) },
        { id: 'M13.06.z2', text: 'Zone 2: Helper / Action Methods', done: c.sequence(zoneClick('HomeScreen.java', 1), zoneClick('HomeScreen.java', 2)) },
      ],
      factIds: ['F175', 'F176', 'F172'],
    },
    {
      id: 'M13.07',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "Every screen, pop-up or window gets its own class extending BaseTest, which gives you global setup, teardown and instance variables. Zone 1 declares the elements. Zone 2 holds the helpers, and that's where device quirks hide. For example, open(appName) scrolls vertically on a Flex and horizontally on a Mini or a Station.",
      factIds: ['F172', 'F173', 'F174', 'F175', 'F176', 'F177'],
    },
    {
      id: 'M13.08',
      kind: 'computer-task',
      hud: 'HomeScreenTest fails on WALL-E (Flex 3). Fix open()',
      app: 'intellij',
      route: `/project/uia-remote/file/${PO}/HomeScreen.java`,
      success: c.all(c.eq(p.codeFact('openScroll', 'local:HomeScreen'), true), c.eq(p.localRun('HomeScreenTest').result, 'PASS')),
      objectives: [
        { id: 'M13.08.fix', text: 'FLEX → scrollVerticallyTo, Mini/Station → scrollHorizontallyTo', done: c.eq(p.codeFact('openScroll', 'local:HomeScreen'), true) },
        { id: 'M13.08.run', text: 'Run HomeScreenTest on WALL-E: green', done: c.eq(p.localRun('HomeScreenTest').result, 'PASS') },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'Read the run log: it scrolls horizontally on a Flex.' },
        { afterS: 120, idle: true, effect: 'text', text: 'In open(): the FLEX branch must call scrollVerticallyTo(appName); the else branch scrollHorizontallyTo(appName).' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'intellij', route: `/project/uia-remote/file/${PO}/HomeScreen.java`, target: 'intellij.runButton', action: 'click' }],
      factIds: ['F177', 'F176'],
    },
    {
      id: 'M13.09',
      kind: 'computer-task',
      hud: 'ReceiptScreenTest is flaky. Find out why',
      app: ['intellij', 'camera'],
      route: `/project/uia-remote/file/${PO}/ReceiptScreen.java`,
      success: c.all(
        c.eq(p.codeFact('waitForScreen', 'local:ReceiptScreen'), true),
        c.eq(p.codeFact('isScreenPresent', 'local:ReceiptScreen'), true),
        c.gte(p.localRun('ReceiptScreenTest').streak, 3),
      ),
      objectives: [
        { id: 'M13.09.wait', text: 'waitForScreen(): wait until a Zone 1 element is rendered', done: c.eq(p.codeFact('waitForScreen', 'local:ReceiptScreen'), true) },
        { id: 'M13.09.present', text: 'isScreenPresent(): return whether the screen is in focus', done: c.eq(p.codeFact('isScreenPresent', 'local:ReceiptScreen'), true) },
        { id: 'M13.09.call', text: 'noReceipt() / print(): call waitForScreen() before the click', done: receiptWaitsBeforeClick },
        { id: 'M13.09.runs', text: 'Run ReceiptScreenTest ×3: green ×3', done: c.gte(p.localRun('ReceiptScreenTest').streak, 3) },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'UiObjectNotFoundException: the tap lands before the receipt screen finished rendering.' },
        { afterS: 120, idle: true, effect: 'text', text: 'Alt+Enter on the class → Implement mandatory screen methods. Then make noReceipt() and print() call waitForScreen(); before their click.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'intellij', route: `/project/uia-remote/file/${PO}/ReceiptScreen.java`, target: 'intellij.runButton', action: 'click' }],
      factIds: ['F178', 'F179', 'F180'],
    },
    {
      id: 'M13.10',
      kind: 'dialogue',
      speaker: 'morgan',
      text: 'Google built UI Automator to talk to one Android device at a time. My trick: screen definitions live in androidTest, the runner lives in test, and the runner hops between device handles. MFD runs method X, focus shifts to the CFD for method Y, then back.',
      factIds: ['F170', 'F171'],
    },
    {
      id: 'M13.11',
      kind: 'computer-task',
      hud: "Order the runner's calls for a tethered sale",
      app: 'intellij',
      route: '/project/uia-remote/file/app/src/test/java/com/labsim/uia/runner/MultiDeviceRunner.java',
      onEnter: [scrambleRunner],
      success: runnerOrdered,
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'Merchant first: add the item and review the order. Then the customer checks the totals.' },
        { afterS: 120, idle: true, effect: 'text', text: 'MFD add Tax Item 5 → MFD Review Order → CFD assert totals → MFD Pay & Charge → CFD finalise payment. (Alt+Shift+↑/↓ moves a line.)' },
      ],
      factIds: ['F171', 'F183', 'F185', 'F186', 'F187'],
    },
    { id: 'M13.12', kind: 'quiz-checkpoint', checkpointId: 'CP-M13.1', title: 'uia-remote & POM', questionIds: ['Q233', 'Q234', 'Q240', 'Q241', 'Q243', 'Q248', 'Q257', 'Q261'] },
  ],
};
