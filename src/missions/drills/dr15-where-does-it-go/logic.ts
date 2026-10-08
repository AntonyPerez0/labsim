/**
 * DR15 Where Does It Go? (GP §2.4.3, Cur M13): files rain down → drop each into `main` / `test` /
 * `androidTest/databases` / `androidTest/pageobjects` / `androidTest/testactions` (Ref §4.2, F163–F171).
 * Dropping anything a QA engineer writes into `main` is wrong (F164).
 */
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { teach } from '../common/teach';

export const BINS = ['main', 'test', 'databases', 'pageobjects', 'testactions'] as const;
export type Bin = (typeof BINS)[number];

export const BIN_PATH: Record<Bin, string> = {
  main: 'app/src/main',
  test: 'app/src/test',
  databases: 'app/src/androidTest/…/databases',
  pageobjects: 'app/src/androidTest/…/pageobjects',
  testactions: 'app/src/androidTest/…/testactions',
};

export const BIN_ROLE: Record<Bin, string> = {
  main: 'production / app registration — QA never edits',
  test: 'local unit tests + multi-device runner',
  databases: 'DB connection + query logic',
  pageobjects: 'one class per screen (POM)',
  testactions: 'tests + assertions',
};

export interface FileData {
  file: string;
  /** One-line peek at the file's content. */
  peek: string;
  bin: Bin;
}

const WHY: Record<Bin, { why: string; facts: string[] }> = {
  main: { why: 'app/src/main is reserved for production/application registration code — QA engineers never modify it.', facts: ['F164'] },
  test: { why: 'app/src/test houses local unit tests and the multi-device execution runner scripts.', facts: ['F165', 'F171'] },
  databases: { why: 'The androidTest package databases holds database connection and query logic.', facts: ['F166', 'F167'] },
  pageobjects: { why: 'The androidTest package pageobjects holds the Page Object Model classes — one per screen, pop-up or window.', facts: ['F168', 'F172'] },
  testactions: { why: 'The androidTest package testactions holds test classes and assertions that string page-object methods together.', facts: ['F169'] },
};

let n = 0;
function f(file: string, bin: Bin, peek: string, extraTags: string[] = []): DrillItem<FileData> {
  n++;
  const w = WHY[bin];
  return {
    id: `DR15-${String(n).padStart(2, '0')}`,
    tags: ['uia.layout', ...(bin === 'test' ? ['uia.multidevice'] : bin === 'main' ? [] : ['uia.packages']), ...extraTags],
    factIds: w.facts,
    teach: teach(`${file} → ${BIN_PATH[bin]}`, w.why, { ref: 'Ref §4.2', factIds: w.facts, doInstead: `Drop it in ${bin} (${BINS.indexOf(bin) + 1}).` }),
    data: { file, peek, bin },
  };
}

export const WHERE_ITEMS: readonly DrillItem<FileData>[] = [
  f('DbHelper.java', 'databases', 'Connection getConnection() … executeQuery("SELECT …")'),
  f('OrdersQuery.java', 'databases', 'List<Order> recentOrders(String merchantId) { … SQL … }'),
  f('MerchantDb.java', 'databases', 'opens the merchant database and runs lookups'),
  f('HomeScreen.java', 'pageobjects', 'public class HomeScreen extends BaseTest { // Zone 1 … // Zone 2 … }', ['uia.pom']),
  f('LockScreen.java', 'pageobjects', 'public class LockScreen extends BaseTest { waitForScreen() … }', ['uia.pom']),
  f('NavigationBar.java', 'pageobjects', 'public class NavigationBar extends BaseTest { backBtn, homeBtn … }', ['uia.pom']),
  f('RegisterHomeScreen.java', 'pageobjects', 'private final BySelector reviewOrderBtn = By.text("Review Order");', ['uia.pom']),
  f('ReceiptScreen.java', 'pageobjects', 'isScreenPresent() { return device.hasObject(printBtn); }', ['uia.pom']),
  f('CfdTotalsScreen.java', 'pageobjects', 'customer-display totals screen: assertTotal(String)', ['uia.pom']),
  f('TaxTest.java', 'testactions', '/* TaxTest — tethered (MFD + CFD) … */ @Test public void taxItem5()', ['uia.taxtest']),
  f('TaxTestDuo.java', 'testactions', '@Test … cfdTotals.assertTotal("$10.83")', ['uia.taxtest']),
  f('HomeScreenTest.java', 'testactions', '@Test public void opensRegister() { home.open("Register"); … }'),
  f('RefundFlowTest.java', 'testactions', '@Test strings page-object methods + asserts the refund'),
  f('MultiDeviceRunner.java', 'test', 'mfd.run(registerHome::addTaxItem5); cfd.run(cfdTotals::assertTotals);'),
  f('ConfigParserTest.java', 'test', 'local unit test — parses config.properties, no device needed'),
  f('DeviceHandleTest.java', 'test', 'local unit test for the runner\'s device-handle switching'),
  f('AppRegistration.java', 'main', 'production application registration code'),
];

export const DR15: DrillDef<FileData> = {
  id: 'DR15',
  name: 'Where Does It Go?',
  format: 'Files rain down → drop into main / test / androidTest/databases / pageobjects / testactions',
  tags: ['uia.layout', 'uia.packages', 'uia.multidevice'],
  unlockedBy: ['M13'],
  durationS: 60,
  itemCount: null,
  medals: { bronze: 800, silver: 1400, gold: 2000 },
  scoring: 'standard',
  items: WHERE_ITEMS,
  component: lazyDrill(() => import('./View'), '#a48bfa'),
};
