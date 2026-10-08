/**
 * DR08 POM Builder / POM Doctor (GP §2.4.3, Cur M13 / §6 "POM Doctor"): 3 classes, 120 s.
 *
 * Build: sort cards into a page-object skeleton — Zone 1 (Element Locators), Zone 2 (Helper / Action
 * Methods) or the bin — and set the package and the superclass. Pass = both mandatory methods
 * (`waitForScreen()`, `isScreenPresent()`), locators in Zone 1, helpers in Zone 2, package `pageobjects`,
 * extends `BaseTest`, no distractors (`portNumber = 5555`, a `@Test` method → testactions, a DB query →
 * databases, a method from `app/src/main`).
 * Doctor: a broken class (swapped scroll branches, missing mandatory method, locator in Zone 2, wrong package,
 * missing `extends BaseTest`) → tick every repair it needs.
 * Facts: F168, F172–F180, F167, F169, F164 (Ref §4.2, §4.3).
 */
import type { RootState } from '@/core/state';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { chance, pick, recentKeys, shuffle, type RngState } from '../common/rng';
import { streakMultiplier } from '../common/scoring';
import { teach } from '../common/teach';

export type CardKind = 'locator' | 'mandatory' | 'helper' | 'distractor';
export type Zone = 'z1' | 'z2' | 'bin';

export interface PomCard {
  id: string;
  code: string;
  kind: CardKind;
  /** Why it goes where it goes (reveal). */
  why: string;
}

interface ScreenDef {
  cls: string;
  locators: [string, string][];
  helpers: { name: string; code: string; why: string }[];
}

const SCREENS: ScreenDef[] = [
  {
    cls: 'HomeScreen',
    locators: [
      ['registerIcon', 'By.text("Register")'],
      ['ordersIcon', 'By.text("Orders")'],
      ['clock', 'By.res("com.labsim.launcher:id/clock")'],
    ],
    helpers: [{ name: 'open', code: 'public void open(String appName) { waitForScreen(); if (deviceType == DeviceType.FLEX) scrollVerticallyTo(appName); else scrollHorizontallyTo(appName); … }', why: 'open(appName) is a helper: vertical scrolling on Flex, horizontal on Mini/Station.' }],
  },
  {
    cls: 'RegisterHomeScreen',
    locators: [
      ['reviewOrderBtn', 'By.text("Review Order")'],
      ['taxItem5', 'By.text("Tax Item 5")'],
      ['clearBtn', 'By.text("Clear")'],
    ],
    helpers: [
      { name: 'addTaxItem5', code: 'public void addTaxItem5() { waitForScreen(); device.findObject(taxItem5).click(); }', why: 'An action method driving this screen.' },
      { name: 'reviewOrder', code: 'public void reviewOrder() { device.findObject(reviewOrderBtn).click(); }', why: 'An action method driving this screen.' },
    ],
  },
  {
    cls: 'LockScreen',
    locators: [
      ['pinPad', 'By.res("com.labsim.lockscreen:id/pin_pad")'],
      ['unlockBtn', 'By.text("Unlock")'],
    ],
    helpers: [{ name: 'unlock', code: 'public void unlock(String passcode) { waitForScreen(); enterPin(passcode); device.findObject(unlockBtn).click(); }', why: 'An action method: enter the passcode and unlock.' }],
  },
  {
    cls: 'ReceiptScreen',
    locators: [
      ['printBtn', 'By.text("Print")'],
      ['noReceiptBtn', 'By.text("No Receipt")'],
      ['scanForReceipt', 'By.text("Scan for receipt")'],
    ],
    helpers: [{ name: 'selectPrint', code: 'public void selectPrint() { waitForScreen(); device.findObject(printBtn).click(); }', why: 'An action method on the receipt screen.' }],
  },
  {
    cls: 'NavigationBar',
    locators: [
      ['homeBtn', 'By.desc("Home")'],
      ['backBtn', 'By.desc("Back")'],
    ],
    helpers: [{ name: 'goHome', code: 'public void goHome() { device.findObject(homeBtn).click(); }', why: 'A helper used by teardown to force the device back to HomeScreen.' }],
  },
];

const MANDATORY = (cls: string): PomCard[] => [
  { id: 'waitForScreen', code: 'public void waitForScreen() { device.wait(Until.hasObject(…), TIMEOUT_MS); }', kind: 'mandatory', why: `Mandatory on every screen class: pauses until the UI finishes rendering so UI Automator never clicks unrendered buttons (${cls}).` },
  { id: 'isScreenPresent', code: 'public boolean isScreenPresent() { return device.hasObject(…); }', kind: 'mandatory', why: 'Mandatory on every screen class: returns whether this screen is in focus.' },
];

const DISTRACTORS: PomCard[] = [
  { id: 'port', code: 'private final int portNumber = 5555;', kind: 'distractor', why: 'Ports belong in config.properties (and it is 5444) — never in a page object.' },
  { id: 'test', code: '@Test public void taxTotalsMatch() { … assertEquals("$10.83", total); }', kind: 'distractor', why: 'A @Test method with assertions belongs in androidTest/…/testactions.' },
  { id: 'db', code: 'public ResultSet merchantRows() { return db.query("SELECT * FROM merchant"); }', kind: 'distractor', why: 'Database connection and query logic belongs in androidTest/…/databases.' },
  { id: 'main', code: 'public static void registerApp(Application app) { … }', kind: 'distractor', why: 'Application registration code lives in app/src/main — QA never edits it.' },
  { id: 'runner', code: 'mfd.run(registerHome::addTaxItem5); cfd.run(cfdTotals::assertTotals);', kind: 'distractor', why: 'Hopping between device handles is the multi-device runner\'s job, in app/src/test.' },
];

export const PACKAGES = ['pageobjects', 'testactions', 'databases'] as const;
export const SUPERS = ['BaseTest', 'MultiDeviceRunner', 'Activity'] as const;

export interface BuildData {
  mode: 'build';
  cls: string;
  cards: PomCard[];
  /** Starting skeleton values (deliberately wrong sometimes). */
  pkg: (typeof PACKAGES)[number];
  sup: (typeof SUPERS)[number];
}

export type RepairId = 'swap-scroll' | 'add-wait' | 'add-present' | 'move-locator' | 'fix-package' | 'add-extends' | 'move-test' | 'rename-class';

export const REPAIR_TEXT: Record<RepairId, string> = {
  'swap-scroll': 'Swap the scroll branches in open(): Flex → vertical, Mini/Station → horizontal',
  'add-wait': 'Add the mandatory waitForScreen()',
  'add-present': 'Add the mandatory isScreenPresent()',
  'move-locator': 'Move the locator out of Zone 2 into Zone 1',
  'fix-package': 'Change the package to com.labsim.uia.pageobjects',
  'add-extends': 'Make the class extend BaseTest',
  'move-test': 'Move the @Test method to testactions',
  'rename-class': 'Rename the class to match the file name',
};

const REPAIR_WHY: Record<RepairId, string> = {
  'swap-scroll': 'open(appName) scrolls vertically on Flex and horizontally on Mini or Station.',
  'add-wait': 'waitForScreen() is mandatory on every screen class.',
  'add-present': 'isScreenPresent() is mandatory on every screen class.',
  'move-locator': 'Zone 1 holds the element locators; Zone 2 holds helper/action methods.',
  'fix-package': 'Screen classes live in androidTest/…/pageobjects.',
  'add-extends': 'Every screen class extends BaseTest (global setup, teardown, instance variables).',
  'move-test': '@Test methods and assertions belong in testactions.',
  'rename-class': '(The name was fine.)',
};

export interface DoctorData {
  mode: 'doctor';
  cls: string;
  /** Java source lines of the broken class. */
  lines: string[];
  /** Repairs offered (shuffled). */
  options: RepairId[];
  /** The repairs actually needed. */
  needed: RepairId[];
}

export type PomData = BuildData | DoctorData;

/* ── build mode ── */

export function buildItem(rng: RngState, s: ScreenDef): DrillItem<BuildData> {
  const locs: PomCard[] = s.locators.map(([n, by]) => ({ id: n, code: `private final BySelector ${n} = ${by};`, kind: 'locator', why: 'A locator: Zone 1 (Element Locators).' }));
  const helps: PomCard[] = s.helpers.map((h) => ({ id: h.name, code: h.code, kind: 'helper', why: `${h.why} Zone 2.` }));
  const dis = shuffle(rng, DISTRACTORS).slice(0, chance(rng, 0.5) ? 2 : 3);
  const cards = shuffle(rng, [...locs, ...MANDATORY(s.cls), ...helps, ...dis]);
  const facts = ['F168', 'F172', 'F173', 'F175', 'F176', 'F178', 'F179', 'F180'];
  return {
    id: `DR08:build:${s.cls}`,
    tags: ['uia.pom', 'uia.sync', 'uia.packages'],
    factIds: facts,
    teach: teach(`${s.cls}: package pageobjects, extends BaseTest; locators → Zone 1; waitForScreen(), isScreenPresent() + helpers → Zone 2; bin the rest`, 'Every screen class extends BaseTest and has two zones: Zone 1 declares the element locators, Zone 2 holds the helper/action methods — including the mandatory waitForScreen() and isScreenPresent().', {
      ref: 'Ref §4.3',
      factIds: facts,
      tag: 'uia.pom',
    }),
    data: { mode: 'build', cls: s.cls, cards, pkg: chance(rng, 0.5) ? 'pageobjects' : pick(rng, ['testactions', 'databases'] as const), sup: chance(rng, 0.5) ? 'BaseTest' : pick(rng, ['MultiDeviceRunner', 'Activity'] as const) },
  };
}

export const correctZone = (c: PomCard): Zone => (c.kind === 'locator' ? 'z1' : c.kind === 'distractor' ? 'bin' : 'z2');

export interface BuildGrade {
  cardsOk: number;
  cards: number;
  pkgOk: boolean;
  supOk: boolean;
  perfect: boolean;
}

export function gradeBuild(data: BuildData, zones: Readonly<Record<string, Zone | undefined>>, pkg: string, sup: string): BuildGrade {
  const cardsOk = data.cards.filter((c) => zones[c.id] === correctZone(c)).length;
  const pkgOk = pkg === 'pageobjects';
  const supOk = sup === 'BaseTest';
  return { cardsOk, cards: data.cards.length, pkgOk, supOk, perfect: cardsOk === data.cards.length && pkgOk && supOk };
}

export function buildPoints(g: BuildGrade, seconds: number, streakBefore: number): number {
  const base = 35 * g.cardsOk + (g.pkgOk ? 30 : 0) + (g.supOk ? 30 : 0);
  if (!g.perfect) return base;
  return Math.round((base + 120 + Math.max(0, Math.round(8 * (45 - seconds)))) * streakMultiplier(streakBefore));
}

/* ── doctor mode ── */

const BUGS: RepairId[] = ['swap-scroll', 'add-wait', 'add-present', 'move-locator', 'fix-package', 'add-extends', 'move-test'];

export function doctorSource(s: ScreenDef, bugs: readonly RepairId[]): string[] {
  const has = (b: RepairId) => bugs.includes(b);
  const L: string[] = [];
  L.push(`package com.labsim.uia.${has('fix-package') ? 'testactions' : 'pageobjects'};`, '');
  L.push(`public class ${s.cls}${has('add-extends') ? '' : ' extends BaseTest'} {`, '');
  L.push('    // ===== Zone 1: Element Locators =====');
  const locs = s.locators.map(([n, by]) => `    private final BySelector ${n} = ${by};`);
  const moved = has('move-locator') ? locs.pop()! : null;
  L.push(...locs, '');
  L.push('    // ===== Zone 2: Helper / Action Methods =====');
  if (moved) L.push(moved);
  if (!has('add-wait')) L.push('    public void waitForScreen() {', '        device.wait(Until.hasObject(' + s.locators[0]![0] + '), TIMEOUT_MS);', '    }', '');
  if (!has('add-present')) L.push('    public boolean isScreenPresent() {', '        return device.hasObject(' + s.locators[0]![0] + ');', '    }', '');
  if (s.cls === 'HomeScreen') {
    const flex = has('swap-scroll') ? 'scrollHorizontallyTo(appName);' : 'scrollVerticallyTo(appName);  ';
    const other = has('swap-scroll') ? 'scrollVerticallyTo(appName);  ' : 'scrollHorizontallyTo(appName);';
    L.push('    public void open(String appName) {', '        waitForScreen();', '        if (deviceType == DeviceType.FLEX) {', `            ${flex}  // Flex`, '        } else {', `            ${other}  // Mini, Station`, '        }', '        device.findObject(By.text(appName)).click();', '    }', '');
  }
  for (const h of s.helpers.filter((x) => x.name !== 'open')) L.push(`    ${h.code.replace(/ \{ /, ' {\n        ').replace(/ \}$/, '\n    }')}`, '');
  if (has('move-test')) L.push('    @Test', '    public void totalsMatch() {', '        assertEquals("$10.83", cfdTotals.total());', '    }', '');
  L.push('}');
  return L.join('\n').split('\n');
}

export function doctorItem(rng: RngState, s: ScreenDef, nBugs: number): DrillItem<DoctorData> {
  const pool = BUGS.filter((b) => (b !== 'move-locator' || s.locators.length >= 2) && (b !== 'swap-scroll' || s.cls === 'HomeScreen'));
  const needed = shuffle(rng, pool).slice(0, nBugs);
  const decoys = shuffle(
    rng,
    (Object.keys(REPAIR_TEXT) as RepairId[]).filter((r) => !needed.includes(r)),
  ).slice(0, 6 - needed.length);
  const options = shuffle(rng, [...needed, ...decoys]);
  const facts = ['F173', 'F175', 'F176', 'F177', 'F178', 'F179', 'F180', 'F168'];
  return {
    id: `DR08:doctor:${s.cls}:${needed.slice().sort().join('+')}`,
    tags: ['uia.pom', 'uia.sync', 'uia.scroll', 'uia.packages'],
    factIds: facts,
    teach: teach(`Repairs: ${needed.map((r) => REPAIR_TEXT[r]).join(' · ')}`, needed.map((r) => REPAIR_WHY[r]).join(' '), { ref: 'Ref §4.3', factIds: facts, tag: 'uia.pom' }),
    data: { mode: 'doctor', cls: s.cls, lines: doctorSource(s, needed), options, needed },
  };
}

export function gradeDoctor(data: DoctorData, ticked: readonly RepairId[]): { hits: number; false: number; perfect: boolean } {
  const hits = ticked.filter((t) => data.needed.includes(t)).length;
  const fp = ticked.filter((t) => !data.needed.includes(t)).length;
  return { hits, false: fp, perfect: hits === data.needed.length && fp === 0 };
}

export function doctorPoints(g: { hits: number; false: number; perfect: boolean }, seconds: number, streakBefore: number): number {
  const base = 120 * g.hits - 60 * g.false;
  if (!g.perfect) return base;
  return Math.round((base + 150 + Math.max(0, Math.round(8 * (40 - seconds)))) * streakMultiplier(streakBefore));
}

export function generatePom(rng: RngState, state: RootState | null, index: number): DrillItem<PomData> {
  const mode = state?.session?.drill?.mode === 'doctor' ? 'doctor' : 'build';
  const recent = recentKeys(state, 3).map((k) => k.split(':')[2]);
  const fresh = SCREENS.filter((s) => !recent.includes(s.cls));
  const s = pick(rng, fresh.length ? fresh : SCREENS);
  if (mode === 'doctor') return doctorItem(rng, s, index === 0 ? 1 : chance(rng, 0.5) ? 1 : 2);
  return buildItem(rng, s);
}

export const DR08: DrillDef<PomData> = {
  id: 'DR08',
  name: 'POM Builder',
  alias: 'POM Doctor',
  format: 'Build mode: sort lines into a page-object skeleton. Doctor mode: fix a broken class; 3 classes, 120 s',
  tags: ['uia.pom', 'uia.sync', 'uia.packages', 'uia.scroll'],
  unlockedBy: ['M13'],
  durationS: 120,
  itemCount: 3,
  medals: { bronze: 800, silver: 1400, gold: 2000 },
  scoring: 'custom',
  modes: [
    { id: 'build', title: 'POM Builder', unlock: 'always' },
    { id: 'doctor', title: 'POM Doctor', unlock: 'always' },
  ],
  generate: (rng, state, index) => generatePom(rng, state, index),
  component: lazyDrill(() => import('./View'), '#e76f00'),
};
