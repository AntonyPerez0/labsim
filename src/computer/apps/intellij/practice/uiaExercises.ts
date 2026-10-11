/**
 * UIA Practice — repeatable UI Automator (uia-relay) exercises for the IntelliJ tool window. Each start writes a
 * fresh variant into the uia-relay project's `practice/` folder (git-ignored; the runner only compiles
 * androidTest/ and src/test/, so a half-finished exercise never breaks a real run). `Check` grades the Java
 * statically — signatures, the order of handle calls, locators — and config exercises go through the
 * config.properties validator against Orka. UI-level randomness (Math.random) is fine here.
 */
import type { OrkaDb } from '@/sim';
import { validateConfigProperties } from '../configValidator';

export interface UiaGoal {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface UiaVariant {
  /** Repo-relative path inside uia-relay. */
  path: string;
  text: string;
  brief: string[];
  ctx: Record<string, unknown>;
}

export interface UiaCheckEnv {
  orka: Pick<OrkaDb, 'robots' | 'devices'> | null;
}

export interface UiaExercise {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  topic: string;
  lesson: string;
  hints: string[];
  make(): UiaVariant;
  goals(text: string, ctx: Record<string, unknown>, env: UiaCheckEnv): UiaGoal[];
}

export const PRACTICE_DIR = 'practice';

function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)]!;
}

/* ───────────────────────────── Java helpers ───────────────────────────── */

/** Remove // and /* *\/ comments (keeps string literals). */
export function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    const n = src[i + 1];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
      out += src.slice(i, j + 1);
      i = j + 1;
    } else if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
    } else if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

/** Braces/parentheses balance (ignoring strings and comments). */
export function balanced(src: string): boolean {
  const s = stripComments(src).replace(/"(?:[^"\\]|\\.)*"/g, '""');
  let b = 0;
  let p = 0;
  for (const ch of s) {
    if (ch === '{') b++;
    else if (ch === '}') b--;
    else if (ch === '(') p++;
    else if (ch === ')') p--;
    if (b < 0 || p < 0) return false;
  }
  return b === 0 && p === 0;
}

/** Body (between the braces) of the first method named `name`, or null. */
export function methodBody(src: string, name: string): { signature: string; body: string } | null {
  const s = stripComments(src);
  const re = new RegExp(`((?:public|protected|private)?\\s*(?:static\\s+)?[\\w<>\\[\\]]+\\s+${name}\\s*\\([^)]*\\))\\s*\\{`);
  const m = re.exec(s);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < s.length && depth > 0) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') depth--;
    i++;
  }
  if (depth !== 0) return null;
  return { signature: m[1]!.trim().replace(/\s+/g, ' '), body: s.slice(start, i - 1) };
}

/** Names of `BySelector` fields declared in the class. */
export function locatorFields(src: string): string[] {
  return [...stripComments(src).matchAll(/BySelector\s+(\w+)\s*=/g)].map((m) => m[1]!);
}

const IMPORTS = `import androidx.test.uiautomator.By;
import androidx.test.uiautomator.BySelector;
import androidx.test.uiautomator.Until;
import com.labsim.uia.BaseTest;`;

function screenClass(cls: string, doc: string, zone1: string, zone2: string): string {
  return `package com.labsim.uia.pageobjects;

${IMPORTS}

/** ${doc} */
public class ${cls} extends BaseTest {

    // ===== Zone 1: Element Locators =====
${zone1}

    // ===== Zone 2: Helper / Action Methods =====
${zone2}
}
`;
}

/** Index of the first match of each regex in `s` (−1 when missing). */
function order(s: string, res: RegExp[]): number[] {
  return res.map((r) => {
    const m = r.exec(s);
    return m ? m.index : -1;
  });
}
const ascending = (xs: number[]) => xs.every((v) => v >= 0) && xs.every((v, i) => i === 0 || v > xs[i - 1]!);

const syntaxGoal = (text: string): UiaGoal => ({ label: 'Braces and parentheses balance', ok: balanced(text) });

/* ───────────────────────────── exercises ───────────────────────────── */

const SCREENS = [
  { cls: 'CompassTipScreen', doc: 'CompassTipScreen: tip selection on the Compass (Canada).', title: 'Add a tip', fields: [['title', 'By.text("Add a tip")'], ['noTip', 'By.text("No Tip")'], ['customTip', 'By.text("Custom")']] },
  { cls: 'InteracReceiptScreen', doc: 'InteracReceiptScreen: receipt options after an Interac sale.', title: 'How would you like your receipt?', fields: [['header', 'By.textStartsWith("How would you like")'], ['printBtn', 'By.text("Print")'], ['noReceiptBtn', 'By.text("No receipt")']] },
  { cls: 'CashDiscountScreen', doc: 'CashDiscountScreen: the new cash-discount tender prompt.', title: 'Cash discount', fields: [['banner', 'By.res("com.labsim.payments:id/cash_discount_banner")'], ['payCash', 'By.text("Pay with cash")'], ['payCard', 'By.text("Pay with card")']] },
  { cls: 'AuthorizationsListScreen', doc: 'AuthorizationsListScreen: open pre-auths in the Authorizations app.', title: 'Authorizations', fields: [['list', 'By.res("com.labsim.auths:id/auth_list")'], ['searchBox', 'By.res("com.labsim.auths:id/search")'], ['closeBtn', 'By.desc("Close")']] },
] as const;

export const UIA_EXERCISES: UiaExercise[] = [
  {
    id: 'screen-methods',
    title: 'Screen Basics',
    level: 1,
    topic: 'Page objects',
    lesson: 'Every page object must implement waitForScreen() (UI Automator is faster than the screen renders) and isScreenPresent(). Wait on an element that only exists on THIS screen.',
    hints: [
      'Copy the pattern from pageobjects/HomeScreen.java.',
      'waitForScreen: device.wait(Until.hasObject(<locator>), TIMEOUT_MS);',
      'isScreenPresent: return device.hasObject(<locator>);  (Alt+Enter on the class name can also generate stubs.)',
    ],
    make() {
      const sc = pick(SCREENS);
      const zone1 = sc.fields.map(([f, sel]) => `    private final BySelector ${f} = ${sel};`).join('\n');
      const text = screenClass(sc.cls, sc.doc, zone1, `    // TODO: waitForScreen() and isScreenPresent()\n`);
      return {
        path: `${PRACTICE_DIR}/pageobjects/${sc.cls}.java`,
        text,
        brief: [`**${sc.cls}** has its locators but no mandatory methods.`, 'Add **public void waitForScreen()** and **public boolean isScreenPresent()**, both using a Zone 1 locator.', 'Then press **Check**.'],
        ctx: { cls: sc.cls },
      };
    },
    goals(text) {
      const w = methodBody(text, 'waitForScreen');
      const p = methodBody(text, 'isScreenPresent');
      const fields = locatorFields(text);
      const usesField = (b: string) => fields.some((f) => new RegExp(`\\b${f}\\b`).test(b));
      return [
        syntaxGoal(text),
        { label: 'public void waitForScreen()', ok: !!w && /^public void waitForScreen\(\)$/.test(w.signature) },
        { label: 'waitForScreen waits: device.wait(Until.hasObject(locator), TIMEOUT_MS)', ok: !!w && /device\.wait\(\s*Until\.hasObject\(\s*\w+\s*\)\s*,\s*TIMEOUT_MS\s*\)/.test(w.body) && usesField(w.body) },
        { label: 'public boolean isScreenPresent()', ok: !!p && /^public boolean isScreenPresent\(\)$/.test(p.signature) },
        { label: 'isScreenPresent returns device.hasObject(locator)', ok: !!p && /return\s+device\.hasObject\(\s*\w+\s*\)\s*;/.test(p.body) && usesField(p.body) },
      ];
    },
  },
  {
    id: 'scroll-direction',
    title: 'Which Way Does It Scroll',
    level: 2,
    topic: 'Device families',
    lesson: 'The launcher scrolls vertically on Flux and on the Compass, horizontally on Micro and Stand. HomeScreen.open() has to branch on deviceType or "App not found" follows on half the rigs.',
    hints: ['Look at the deviceType enum: DeviceType.FLUX, DeviceType.COMPASS, DeviceType.MICRO, DeviceType.STAND.', 'One if/else is enough: (FLUX or COMPASS) → scrollVerticallyTo, else → scrollHorizontallyTo.'],
    make() {
      const bug = pick(['all-horizontal', 'swapped', 'no-compass'] as const);
      const branch =
        bug === 'all-horizontal'
          ? '        scrollHorizontallyTo(appName);\n'
          : bug === 'swapped'
            ? '        if (deviceType == DeviceType.FLUX || deviceType == DeviceType.COMPASS) {\n            scrollHorizontallyTo(appName);\n        } else {\n            scrollVerticallyTo(appName);\n        }\n'
            : '        if (deviceType == DeviceType.FLUX) {\n            scrollVerticallyTo(appName);\n        } else {\n            scrollHorizontallyTo(appName);\n        }\n';
      const zone1 = '    private final BySelector clock = By.res("com.labsim.launcher:id/clock");';
      const zone2 = `    public void waitForScreen() {
        device.wait(Until.hasObject(clock), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(clock);
    }

    public void open(String appName) {
        waitForScreen();
${branch}        device.findObject(By.text(appName)).click();
    }`;
      const failing = bug === 'no-compass' ? 'the new **Compass** rigs (SETI, GERTY)' : bug === 'swapped' ? 'every family' : 'every **Flux** and **Compass** rig';
      return {
        path: `${PRACTICE_DIR}/pageobjects/HomeScreen.java`,
        text: screenClass('HomeScreen', 'HomeScreen (practice copy): LabSim launcher.', zone1, zone2),
        brief: [`Regression runs fail with \`AssertionError: App 'Register' not found\` on ${failing}.`, 'Fix **open()** so Flux and Compass scroll **vertically** and Micro / Stand scroll **horizontally**.', '**Check** when done.'],
        ctx: { bug },
      };
    },
    goals(text) {
      const b = methodBody(text, 'open');
      const body = b?.body ?? '';
      const m = /if\s*\(([^)]*)\)\s*\{([^}]*)\}\s*else\s*\{([^}]*)\}/.exec(body);
      let ok = false;
      let compass = false;
      if (m) {
        const cond = m[1]!;
        const neg = /!=|!\s*\(/.test(cond);
        const thenV = /scrollVerticallyTo/.test(m[2]!) && !/scrollHorizontallyTo/.test(m[2]!);
        const elseH = /scrollHorizontallyTo/.test(m[3]!) && !/scrollVerticallyTo/.test(m[3]!);
        const thenH = /scrollHorizontallyTo/.test(m[2]!) && !/scrollVerticallyTo/.test(m[2]!);
        const elseV = /scrollVerticallyTo/.test(m[3]!) && !/scrollHorizontallyTo/.test(m[3]!);
        if (!neg && /FLUX/.test(cond) && /COMPASS/.test(cond)) {
          ok = thenV && elseH;
          compass = true;
        } else if (!neg && /MICRO/.test(cond) && /STAND/.test(cond)) {
          ok = thenH && elseV;
          compass = true;
        } else {
          ok = !neg && /FLUX/.test(cond) && thenV && elseH;
          compass = false;
        }
      }
      return [
        syntaxGoal(text),
        { label: 'Flux scrolls vertically, Micro / Stand horizontally', ok },
        { label: 'Compass is handled (vertical launcher)', ok: ok && compass },
        { label: 'Still clicks the app after scrolling', ok: /device\.findObject\(\s*By\.text\(\s*appName\s*\)\s*\)\.click\(\)/.test(body) },
      ];
    },
  },
  {
    id: 'config-compass',
    title: 'Config for SETI',
    level: 2,
    topic: 'config.properties',
    lesson: 'Running from your laptop means filling config.properties yourself (Jenkins injects it in CI): robot, IPs and serial from Orka, port 5444 (never 5555), theme avocado, kernel CPA, the family name as deviceType.',
    hints: [
      'Look SETI up in Orka (Robots → seti → its Device): IP and serial.',
      'SETI is standalone: runType=standalone and customerFacingDeviceIp stays empty.',
      'deviceType is the FAMILY (Compass), not the Device Type code (COMPASS).',
    ],
    make() {
      const wrong = [
        'runType=tethered',
        'merchantFacingDeviceIp=10.42.30.71',
        'customerFacingDeviceIp=10.42.30.72',
        `serial=${pick(['SIM-CP-000000', 'CHANGE_ME'])}`,
        `deviceType=${pick(['COMPASS', 'Flux', 'Micro'])}`,
        `theme=${pick(['legacy', 'avocado'])}`,
        `kernelType=${pick(['SPA', 'CPA'])}`,
        `portNumber=${pick(['5555', '5444'])}`,
        'unlockPasscode=0000',
        'backendEnv=DEV1',
        'robotName=seti',
      ].join('\n');
      return {
        path: `${PRACTICE_DIR}/config.seti.properties`,
        text: `# Local run config for SETI (Compass, Canada) — copied from a Stand Duet rig and half-edited.\n${wrong}\n`,
        brief: ['You want to run the Compass Canada workflow locally on **SETI**.', 'This config was copied from a tethered Stand Duet rig. Make **every rule** pass for SETI (check Orka for the IP and serial).', '**Check** runs the config.properties validator against Orka.'],
        ctx: {},
      };
    },
    goals(text, _ctx, env) {
      const v = validateConfigProperties(text, env.orka);
      return v.rules.map((r) => ({ label: `${r.key}${r.value !== null ? ` = ${r.value || '(empty)'}` : ''}`, ok: r.ok, detail: r.message ?? undefined }));
    },
  },
  {
    id: 'tethered-order',
    title: 'Tethered Step Order',
    level: 2,
    topic: 'Tethered tests',
    lesson: 'A tethered test hops between device handles: MFD_O1 on the merchant device, CFD_O1 on the customer device, MFD_O2 back on the merchant. UI Automator talks to one device at a time — the runner switches handles.',
    hints: ['Merchant actions run in mfd.run(...), customer checks in cfd.run(...).', 'Order: open Register → add item → review order → load swipe card → CFD totals → pay & charge → CFD finalise.'],
    make() {
      const bug = pick(['wrong-handle', 'cfd-too-early', 'pay-before-totals'] as const);
      const L = {
        open: '        mfd.run(() -> homeScreen.open("Register"));',
        add: '        mfd.run(registerHome::addTaxItem5);',
        review: '        mfd.run(registerHome::reviewOrder);',
        card: '        orka.loadSwipeCard(config.getString("robotName"), "VISA_STD_SWIPE");',
        totals: '        cfd.run(cfdTotals::assertTotals);',
        pay: '        mfd.run(registerHome::payAndCharge);',
        fin: '        cfd.run(cfdPayment::finalisePayment);',
      };
      let steps = [L.open, L.add, L.review, L.card, L.totals, L.pay, L.fin];
      if (bug === 'wrong-handle') steps = [L.open, L.add, L.review, L.card, L.totals.replace('cfd.run', 'mfd.run'), L.pay, L.fin.replace('cfd.run', 'mfd.run')];
      else if (bug === 'cfd-too-early') steps = [L.open, L.totals, L.add, L.review, L.card, L.pay, L.fin];
      else steps = [L.open, L.add, L.review, L.card, L.pay, L.totals, L.fin];
      const text = `package com.labsim.uia.testactions;

import com.labsim.uia.BaseTest;
import com.labsim.uia.pageobjects.CfdPaymentScreen;
import com.labsim.uia.pageobjects.CfdTotalsScreen;
import com.labsim.uia.pageobjects.HomeScreen;
import com.labsim.uia.pageobjects.RegisterHomeScreen;
import org.junit.After;
import org.junit.Test;

/* TaxTest (practice copy) — tethered MFD + CFD. Steps: MFD_O1 → CFD_O1 → MFD_O2 → CFD finalise. */
public class TaxTestPractice extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();
    private final CfdTotalsScreen cfdTotals = new CfdTotalsScreen();
    private final CfdPaymentScreen cfdPayment = new CfdPaymentScreen();

    @Test
    public void testTax() {
${steps.join('\n')}
    }

    @After
    public void tearDown() {
        mfd.run(homeScreen::goHome);
        cfd.run(homeScreen::goHome);
    }
}
`;
      return {
        path: `${PRACTICE_DIR}/testactions/TaxTestPractice.java`,
        text,
        brief: ['This tethered Tax test fails on OPTIMUS: the steps run on the wrong device or in the wrong order.', 'Put every step on the right handle (**mfd** / **cfd**) and in the **MFD_O1 → CFD_O1 → MFD_O2 → finalise** order.', '**Check** when done.'],
        ctx: { bug },
      };
    },
    goals(text) {
      const b = methodBody(text, 'testTax')?.body ?? '';
      const pos = order(b, [
        /mfd\.run\(\s*\(\)\s*->\s*homeScreen\.open\("Register"\)\s*\)/,
        /mfd\.run\(\s*registerHome::addTaxItem5\s*\)/,
        /mfd\.run\(\s*registerHome::reviewOrder\s*\)/,
        /orka\.loadSwipeCard\(/,
        /cfd\.run\(\s*cfdTotals::assertTotals\s*\)/,
        /mfd\.run\(\s*registerHome::payAndCharge\s*\)/,
        /cfd\.run\(\s*cfdPayment::finalisePayment\s*\)/,
      ]);
      return [
        syntaxGoal(text),
        { label: 'Merchant steps on mfd, customer checks on cfd', ok: pos.every((p) => p >= 0) },
        { label: 'MFD_O1 (open, add, review, card) → CFD_O1 totals → MFD_O2 pay → CFD finalise', ok: ascending(pos) },
        { label: 'No customer check on the merchant handle', ok: !/mfd\.run\(\s*cfd/.test(b) },
      ];
    },
  },
  {
    id: 'teardown',
    title: 'Leave It at Home',
    level: 1,
    topic: 'Safe state',
    lesson: 'Every test starts from HomeScreen and its teardown forces the device(s) back home — so the next test never inherits an unknown or locked state.',
    hints: ['JUnit runs a method annotated @After after every test.', 'Tethered: send BOTH handles home: mfd.run(homeScreen::goHome); cfd.run(homeScreen::goHome);'],
    make() {
      const text = `package com.labsim.uia.testactions;

import com.labsim.uia.BaseTest;
import com.labsim.uia.pageobjects.CfdTotalsScreen;
import com.labsim.uia.pageobjects.HomeScreen;
import com.labsim.uia.pageobjects.RegisterHomeScreen;
import org.junit.After;
import org.junit.Test;

/* RefundTest (practice copy) — tethered. Safe state: starts on HomeScreen; teardown forces BOTH devices home. */
public class RefundTestPractice extends BaseTest {

    private final HomeScreen homeScreen = new HomeScreen();
    private final RegisterHomeScreen registerHome = new RegisterHomeScreen();
    private final CfdTotalsScreen cfdTotals = new CfdTotalsScreen();

    @Test
    public void testRefund() {
        mfd.run(() -> homeScreen.open("Register"));
        mfd.run(registerHome::addTaxItem5);
        mfd.run(registerHome::reviewOrder);
        cfd.run(cfdTotals::assertTotals);
    }

    // TODO: teardown
}
`;
      return {
        path: `${PRACTICE_DIR}/testactions/RefundTestPractice.java`,
        text,
        brief: ['The next test in the suite keeps starting on the Review Order screen.', 'Add the **@After tearDown()** that returns **both** devices to HomeScreen.', '**Check** when done.'],
        ctx: {},
      };
    },
    goals(text) {
      const s = stripComments(text);
      const t = methodBody(text, 'tearDown');
      return [
        syntaxGoal(text),
        { label: '@After public void tearDown()', ok: /@After\s+public\s+void\s+tearDown\s*\(\s*\)/.test(s) },
        { label: 'Merchant device goes home', ok: !!t && /mfd\.run\(\s*(homeScreen::goHome|\(\)\s*->\s*homeScreen\.goHome\(\))\s*\)/.test(t.body) },
        { label: 'Customer device goes home', ok: !!t && /cfd\.run\(\s*(homeScreen::goHome|\(\)\s*->\s*homeScreen\.goHome\(\))\s*\)/.test(t.body) },
      ];
    },
  },
  {
    id: 'wait-first',
    title: 'Too Fast',
    level: 1,
    topic: 'Synchronisation',
    lesson: 'UI Automator executes faster than Android renders. Call waitForScreen() before touching anything, or the test clicks buttons that are not drawn yet.',
    hints: ['Each action method should begin with waitForScreen();', 'Look at reviewOrder() and payAndCharge(): what happens before the first click?'],
    make() {
      const missing = pick(['reviewOrder', 'payAndCharge', 'both'] as const);
      const wait = (m: string) => (missing === m || missing === 'both' ? '' : '        waitForScreen();\n');
      const zone1 = `    private final BySelector registerTitle = By.res("com.labsim.register:id/title");
    private final BySelector reviewBtn = By.text("Review Order");
    private final BySelector payBtn = By.text("Pay");
    private final BySelector chargeBtn = By.text("Charge");`;
      const zone2 = `    public void waitForScreen() {
        device.wait(Until.hasObject(registerTitle), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(registerTitle);
    }

    public void reviewOrder() {
${wait('reviewOrder')}        device.findObject(reviewBtn).click();
    }

    public void payAndCharge() {
${wait('payAndCharge')}        device.findObject(payBtn).click();
        device.wait(Until.hasObject(chargeBtn), TIMEOUT_MS);
        device.findObject(chargeBtn).click();
    }`;
      return {
        path: `${PRACTICE_DIR}/pageobjects/RegisterHomeScreen.java`,
        text: screenClass('RegisterHomeScreen', 'RegisterHomeScreen (practice copy): the Register app main view.', zone1, zone2),
        brief: ['The test passes on your laptop but fails ~1 run in 5 on the rig with `NullPointerException` at **.click()**.', 'Make every action method **wait for the screen** before its first click.', '**Check** when done.'],
        ctx: { missing },
      };
    },
    goals(text) {
      const ok = (name: string) => {
        const b = methodBody(text, name)?.body ?? '';
        const w = b.search(/waitForScreen\(\)\s*;/);
        const c = b.search(/\.click\(\)/);
        return w >= 0 && c >= 0 && w < c;
      };
      return [syntaxGoal(text), { label: 'reviewOrder() waits before clicking', ok: ok('reviewOrder') }, { label: 'payAndCharge() waits before clicking', ok: ok('payAndCharge') }];
    },
  },
  {
    id: 'cfd-display-id',
    title: 'Retire the OCR Check',
    level: 3,
    topic: 'UIA 2.3 / Duet',
    lesson: 'On a Stand Duet the customer display is invisible to plain ADB queries, which is why the team once used screenshots + Tesseract OCR. UI Automator 2.3 can scope a locator to a display: .displayId(cfdDisplayId) — so OCR screen compares are being retired.',
    hints: ['Every locator in Zone 1 needs .displayId(cfdDisplayId) at the end.', 'Then assertTotals() can use device.findObject(...) like any other screen — delete the orka.screenCompare(...) call.'],
    make() {
      const zone1 = `    private final BySelector subtotal = By.textStartsWith("Subtotal");
    private final BySelector tax = By.textStartsWith("Tax");
    private final BySelector total = By.textStartsWith("Total");`;
      const zone2 = `    public void waitForScreen() {
        device.wait(Until.hasObject(total), TIMEOUT_MS);
    }

    public boolean isScreenPresent() {
        return device.hasObject(total);
    }

    public void assertTotals() {
        waitForScreen();
        assertTrue("CFD totals (OCR)", orka.screenCompare("CFD_TOTAL"));   // brittle: 10 px or a capital letter breaks it
    }`;
      const text = screenClass('CfdTotalsScreen', 'CfdTotalsScreen (practice copy): customer display totals on a Stand Duet (cfdDisplayId = 1).', zone1, zone2).replace(
        'import com.labsim.uia.BaseTest;',
        'import com.labsim.uia.BaseTest;\nimport static org.junit.Assert.assertTrue;',
      );
      return {
        path: `${PRACTICE_DIR}/pageobjects/CfdTotalsScreen.java`,
        text,
        brief: ['R2-D2 (Stand Duet) keeps failing the CFD totals check after a 10-pixel layout change: it still uses an **OCR screen compare**.', 'Scope **every locator** to the customer display with UI Automator 2.3 **.displayId(cfdDisplayId)**, and assert the total with a locator instead of **orka.screenCompare**.', '**Check** when done.'],
        ctx: {},
      };
    },
    goals(text) {
      const s = stripComments(text);
      const decls = [...s.matchAll(/BySelector\s+\w+\s*=\s*([^;]+);/g)].map((m) => m[1]!);
      const a = methodBody(text, 'assertTotals')?.body ?? '';
      return [
        syntaxGoal(text),
        { label: 'Every locator ends with .displayId(cfdDisplayId)', ok: decls.length >= 3 && decls.every((d) => /\.displayId\(\s*cfdDisplayId\s*\)\s*$/.test(d.trim())) },
        { label: 'No orka.screenCompare(...) left', ok: !/screenCompare\s*\(/.test(s) },
        { label: 'assertTotals() checks the total with a locator', ok: /device\.(hasObject|findObject|wait)\([^;]*\btotal\b/.test(a) },
      ];
    },
  },
  {
    id: 'pin-pad',
    title: 'PIN Pad Page Object',
    level: 3,
    topic: 'Compass / Canada',
    lesson: 'Interac PIN entry happens on the secure PIN pad, which ADB cannot touch — so ADB bots cannot run PIN flows. The page object waits for the pad with UI Automator, but types each digit with a physical robot tap through Orka (xy_touch).',
    hints: [
      'Zone 1: locators for the "Enter PIN" title and the OK button.',
      'enterPin(String pin): waitForScreen(), then for each digit orka.xyTouch(robot, "PIN_PAD", digit), then the same for "OK".',
      'robot name: config.getString("robotName"). Digits: String.valueOf(pin.charAt(i)) or pin.split("").',
    ],
    make() {
      const text = `package com.labsim.uia.pageobjects;

${IMPORTS}

/** CompassPinScreen: Interac PIN entry on the Compass (secure PIN pad — not reachable over ADB). */
public class CompassPinScreen extends BaseTest {

    // ===== Zone 1: Element Locators =====
    // TODO: title ("Enter PIN") and OK button

    // ===== Zone 2: Helper / Action Methods =====
    // TODO: waitForScreen(), isScreenPresent(), enterPin(String pin)
}
`;
      return {
        path: `${PRACTICE_DIR}/pageobjects/CompassPinScreen.java`,
        text,
        brief: [
          'Write the page object for the **Compass PIN pad** (Interac, Canada):',
          '• locators for the **"Enter PIN"** title and the **OK** button',
          '• **waitForScreen()** and **isScreenPresent()**',
          '• **enterPin(String pin)** that taps each digit, then OK, with **physical** taps: **orka.xyTouch(robot, "PIN_PAD", …)**',
        ],
        ctx: {},
      };
    },
    goals(text) {
      const s = stripComments(text);
      const w = methodBody(text, 'waitForScreen');
      const p = methodBody(text, 'isScreenPresent');
      const e = methodBody(text, 'enterPin');
      const eb = e?.body ?? '';
      return [
        syntaxGoal(text),
        { label: 'Locators for "Enter PIN" and OK', ok: /BySelector\s+\w+\s*=\s*By\.(text|textStartsWith|textContains)\("Enter PIN"\)/.test(s) && /BySelector\s+\w+\s*=\s*By\.(text|desc)\("OK"\)/.test(s) },
        { label: 'waitForScreen() / isScreenPresent()', ok: !!w && /Until\.hasObject/.test(w.body) && !!p && /return\s+device\.hasObject/.test(p.body) },
        { label: 'public void enterPin(String pin)', ok: !!e && /^public void enterPin\(String \w+\)$/.test(e.signature) },
        { label: 'Waits for the pad first', ok: /waitForScreen\(\)/.test(eb) && eb.search(/waitForScreen\(\)/) < Math.max(0, eb.search(/xyTouch/)) },
        { label: 'Each digit is a physical tap: orka.xyTouch(…, "PIN_PAD", digit) in a loop', ok: /(for\s*\(|forEach|while\s*\()/.test(eb) && /orka\.xyTouch\([^;]*"PIN_PAD"/.test(eb) },
        { label: 'OK is tapped through Orka too', ok: /orka\.xyTouch\([^;]*"PIN_PAD"\s*,\s*"OK"\s*\)/.test(eb) },
        { label: 'No device.findObject(...).click() on the secure pad', ok: !/\.click\(\)/.test(eb) },
      ];
    },
  },
];

export const UIA_EXERCISES_BY_ID: Record<string, UiaExercise> = Object.fromEntries(UIA_EXERCISES.map((e) => [e.id, e]));

export function checkUia(ex: UiaExercise, text: string, ctx: Record<string, unknown>, env: UiaCheckEnv): { passed: boolean; items: UiaGoal[] } {
  const items = ex.goals(text, ctx, env);
  return { passed: items.length > 0 && items.every((g) => g.ok), items };
}
