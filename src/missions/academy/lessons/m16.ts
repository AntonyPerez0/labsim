/**
 * M16 — Seeing the Second Screen: Station Duo, OCR, GIMP & UIA 2.3 (Cur §2 M16). Mentor {{morgan}}.
 * Setup (`academy:M16`, Sim §4.4.2): R2-D2 (STATION_DUO, `10.42.30.14`) mid-sale — MFD on Review Order,
 * CFD showing `TOTAL $10.83`; R2-D2's webcam is aimed at the CFD; the `CFD_TOTAL` Screen Compare row is
 * deleted; uia-remote is cloned with MEGATRON's valid config; Pigeon's `swipe_sale_print.json` has an
 * empty `screenCompare` block. Step 8: the player's "CFD layout v2" toggle = `flag.set cfdLayoutV2Toggle`.
 */
import { c, on, p } from '../../types';
import type { Condition, LessonDef } from '../../types';
import { inject, localFile, localFilesNamed, ran, say } from './helpers';

/** Cur §0.6 `CFD_TOTAL` (R2-D2): x 412, y 288, w 236, h 44 px, expected `TOTAL $10.83`. */
const BOX = { x: 412, y: 288, w: 236, h: 44 } as const;
const EXPECTED = 'TOTAL $10.83';
const DUO = '10.42.30.14:5444';
const PIGEON_FILE = 'tests/sale/swipe_sale_print.json';
const near = (a: unknown, b: number, tol = 3) => typeof a === 'number' && Math.abs(a - b) <= tol;

const compareRowOk: Condition = c.all(
  c.approx(p.screenCompare('CFD_TOTAL').x, BOX.x, 3),
  c.approx(p.screenCompare('CFD_TOTAL').y, BOX.y, 3),
  c.approx(p.screenCompare('CFD_TOTAL').w, BOX.w, 3),
  c.approx(p.screenCompare('CFD_TOTAL').h, BOX.h, 3),
  c.eq(p.screenCompare('CFD_TOTAL').expected, EXPECTED),
);

const pigeonBlockOk: Condition = c.custom('m16-pigeon-compare', 'Pigeon screenCompare block = the GIMP box', (s) => {
  const text = localFile(s, 'pigeon', PIGEON_FILE);
  if (!text) return false;
  try {
    const doc = JSON.parse(text) as { actions?: { action?: string; params?: Record<string, unknown> }[] };
    const a = doc.actions?.find((x) => x.action === 'screenCompare');
    const pr = a?.params ?? {};
    return near(pr.x, BOX.x) && near(pr.y, BOX.y) && near(pr.w, BOX.w) && near(pr.h, BOX.h) && pr.expected === EXPECTED;
  } catch {
    return false;
  }
});

const duoIps: Condition = c.all(c.eq(p.prop('config', 'merchantFacingDeviceIp'), '10.42.30.14'), c.eq(p.prop('config', 'customerFacingDeviceIp'), '10.42.30.14'));

/**
 * CfdTotalsScreen's locators are scoped to the customer display (UIA 2.3 `displayId`): on a Station Duo
 * the CFD is display 1 of the same terminal, and the runner only finds TOTAL there with displayId locators
 * (Sim §3.11; the M16 preset un-merges #398, which made that change).
 */
const cfdLocatorsOnCfd: Condition = c.custom('m16-cfd-display-id', 'CfdTotalsScreen uses displayId locators', (s) => {
  const [hit] = localFilesNamed(s, 'uia-remote', 'CfdTotalsScreen.java');
  return !!hit && /\.displayId\(/.test(hit[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, ''));
});

export const M16: LessonDef = {
  moduleId: 'M16',
  mentor: 'morgan',
  setup: { preset: 'academy:M16', spawn: 'loc.workstation', apps: { unlock: ['terminal', 'camera', 'gimp', 'orca', 'intellij', 'github', 'chat'] } },
  deck: 'deck.M16',
  realLabChecklist: [
    'On a Station Duo one terminal drives two displays, but only the primary MFD is exposed to ADB: legacy UI Automator is blind to the CFD.',
    'The legacy workaround is a Screen Compare Image: a bounding box measured in GIMP plus the expected text; the Pi crops a webcam screenshot, runs Tesseract OCR and returns true or false.',
    'OCR checks are brittle: a 10-pixel shift, a capital letter or a typo breaks them. They are being phased out.',
    'New CFD checks use UI Automator 2.3, which tracks elements on both screens natively.',
    'Configure a Station Duo with the same IP for merchantFacingDeviceIp and customerFacingDeviceIp.',
  ],
  steps: [
    { id: 'M16.01', kind: 'walk-to', hud: 'Go to R2-D2 (Station Duo)', location: 'loc.rack-a' },
    {
      id: 'M16.02',
      kind: 'inspect',
      hud: "Look at both of R2-D2's screens: first the merchant one",
      prop: 'prop.r2d2.mfd',
      callouts: ['Primary MFD — ADB sees this'],
      factIds: ['F151'],
    },
    {
      id: 'M16.02a',
      kind: 'inspect',
      hud: 'Now the customer screen',
      prop: 'prop.r2d2.cfd',
      callouts: ["Secondary CFD — ADB can't"],
      manualEntryIds: ['station-duo-dual-screen'],
      factIds: ['F151', 'F152', 'F221'],
    },
    {
      id: 'M16.03',
      kind: 'dialogue',
      speaker: 'morgan',
      text: 'Station Duo: one terminal, two displays, but only the primary MFD is exposed to ADB. Legacy UI Automator was completely blind to the customer screen.',
      factIds: ['F151', 'F152'],
    },
    {
      id: 'M16.04',
      kind: 'computer-task',
      hud: 'Prove it',
      app: 'terminal',
      success: ran(/^grep -c "?TOTAL"? window_dump\.xml$/),
      objectives: [
        { id: 'M16.04.connect', text: 'adb connect 10.42.30.14:5444 · adb devices (one entry)', done: c.contains(p.adbConnections, DUO) },
        { id: 'M16.04.dump', text: 'uiautomator dump, then pull window_dump.xml', done: ran(/^adb -s 10\.42\.30\.14:5444 pull \/sdcard\/window_dump\.xml( \S+)?$/) },
        { id: 'M16.04.grep', text: 'grep -c "TOTAL" window_dump.xml → 0', done: ran(/^grep -c "?TOTAL"? window_dump\.xml$/) },
      ],
      showMe: [{ app: 'terminal', target: 'terminal.input', action: 'type', text: 'adb -s 10.42.30.14:5444 shell uiautomator dump' }],
      onComplete: [say('morgan', 'Zero. "Review Order" from the MFD is in that dump; the CFD\'s total is not. ADB simply cannot see the second screen.')],
      factIds: ['F151', 'F152', 'F024'],
    },
    {
      id: 'M16.05',
      kind: 'computer-task',
      hud: "Snapshot R2-D2's CFD from the webcam",
      app: 'camera',
      route: '/stream/10.42.10.14?robot=r2-d2',
      success: c.appAction('camera', 'camera.snapshot.saved', (d) => String(d.path ?? '').endsWith('r2d2_cfd.png')),
      showMe: [{ app: 'camera', route: '/stream/10.42.10.14?robot=r2-d2', target: 'camera.snapshot', action: 'click' }],
      factIds: ['F088', 'F154'],
    },
    {
      id: 'M16.06',
      kind: 'computer-task',
      hud: 'Draw a box around the total and read its coordinates',
      app: 'gimp',
      route: '/image/~/Pictures/r2d2_cfd.png',
      success: c.appAction('gimp', 'gimp.selection.changed', (d) => near(d.x, BOX.x) && near(d.y, BOX.y) && near(d.w, BOX.w) && near(d.h, BOX.h)),
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'File → Open ~/Pictures/r2d2_cfd.png, then the Rectangle Select tool (R).' },
        { afterS: 120, idle: true, effect: 'text', text: 'Tool Options show Position and Size: aim for 412, 288 and 236 × 44.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'gimp', route: '/image/~/Pictures/r2d2_cfd.png', target: 'gimp.tool:rectSelect', action: 'click' }],
      factIds: ['F030', 'F153'],
    },
    {
      id: 'M16.07',
      kind: 'computer-task',
      hud: 'Create a Screen Compare Image and test it',
      app: 'orca',
      route: '/screen-compare-image/new',
      success: c.all(compareRowOk, c.appAction('orca', 'orca.screenCompare.tested', (d) => d.name === 'CFD_TOTAL' && d.match === true)),
      objectives: [
        { id: 'M16.07.row', text: 'CFD_TOTAL · r2-d2 · X 412 · Y 288 · W 236 · H 44 · "TOTAL $10.83"', done: compareRowOk },
        { id: 'M16.07.test', text: 'Test → match=true', done: c.appAction('orca', 'orca.screenCompare.tested', (d) => d.name === 'CFD_TOTAL' && d.match === true) },
      ],
      showMe: [{ app: 'orca', route: '/screen-compare-image/new', target: 'orca.screenCompare.test', action: 'click' }],
      onComplete: [say('morgan', 'capture webcam → crop 236x44@412,288 → tesseract → "TOTAL $10.83" → match=true. That is the whole OCR workaround.')],
      factIds: ['F150', 'F153', 'F154', 'F029'],
    },
    {
      id: 'M16.08',
      kind: 'computer-task',
      hud: "Now flip 'CFD layout v2' and test again",
      app: 'orca',
      success: c.sequence(
        on('app.action', { app: 'orca', action: 'orca.screenCompare.layoutV2Toggled' }, (pl) => pl.data?.on === true),
        on('app.action', { app: 'orca', action: 'orca.screenCompare.tested' }, (pl) => pl.data?.match === false),
      ),
      showMe: [{ app: 'orca', target: 'orca.screenCompare.layoutV2', action: 'click' }],
      factIds: ['F155'],
    },
    {
      id: 'M16.09',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "Ten pixels. Or a capital letter. Or a typo. That's all it takes to break the suite. Pigeon's screen comparisons work the same way: GIMP box, copy the coordinates into the JSON block.",
      factIds: ['F155', 'F212'],
    },
    {
      id: 'M16.10',
      kind: 'computer-task',
      hud: "Paste your GIMP coordinates into Pigeon's screenCompare block",
      app: 'intellij',
      route: `/project/pigeon/file/${PIGEON_FILE}`,
      onEnter: [inject({ op: 'repo.clone', params: { repo: 'pigeon' } })],
      success: pigeonBlockOk,
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'Find the screenCompare action at the end of swipe_sale_print.json.' },
        { afterS: 120, idle: true, effect: 'text', text: '"x": 412, "y": 288, "w": 236, "h": 44, "expected": "TOTAL $10.83" — keep the commas.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'gimp', target: 'gimp.toolOptions.position', action: 'click', caption: 'Copy the Position and Size' }],
      factIds: ['F212', 'F030'],
    },
    {
      id: 'M16.11',
      kind: 'dialogue',
      speaker: 'morgan',
      text: "Here's the good news. UI Automator 2.3 natively tracks elements on both screens. That's why uia-remote uses 2.3, and why Screen Compare and OCR are being phased out.",
      factIds: ['F006', 'F007', 'F156'],
    },
    {
      id: 'M16.12',
      kind: 'computer-task',
      hud: 'Replace the OCR check in TaxTestDuo with a UIA 2.3 assertion',
      app: 'intellij',
      route: '/project/uia-remote',
      success: c.all(c.eq(p.codeFact('usesScreenCompare', 'local:TaxTestDuo'), false), cfdLocatorsOnCfd, duoIps, c.eq(p.localRun('TaxTestDuo').result, 'PASS')),
      objectives: [
        { id: 'M16.12.code', text: 'TaxTestDuo: replace orca.screenCompare("CFD_TOTAL") with a UIA assertion, e.g. cfdTotals.assertTotals()', done: c.eq(p.codeFact('usesScreenCompare', 'local:TaxTestDuo'), false) },
        { id: 'M16.12.display', text: 'CfdTotalsScreen: scope the locators to the CFD with .displayId(cfdDisplayId)', done: cfdLocatorsOnCfd },
        { id: 'M16.12.ips', text: 'config.properties: both IPs = 10.42.30.14 (Station Duo)', done: duoIps },
        { id: 'M16.12.run', text: 'Run TaxTestDuo on R2-D2 with layout v2 still on: green', done: c.eq(p.localRun('TaxTestDuo').result, 'PASS') },
      ],
      hints: [
        { afterS: 60, idle: true, effect: 'text', text: 'UIA 2.3 sees the second screen through displayId: in CfdTotalsScreen write By.textStartsWith("TOTAL").displayId(cfdDisplayId) (same for Subtotal and Tax). {{morgan}}\'s open PR #398 on GitHub shows the whole migration.' },
        { afterS: 120, idle: true, effect: 'text', text: 'On a Station Duo merchantFacingDeviceIp and customerFacingDeviceIp are the same: 10.42.30.14. Point robotName at r2-d2.' },
        { afterS: 180, idle: true, effect: 'show-me-button' },
      ],
      showMe: [{ app: 'intellij', route: '/project/uia-remote/file/config.properties', target: 'intellij.configValidator', action: 'click' }],
      onComplete: [say('morgan', 'Layout v2 is still on, and the UIA 2.3 assertion does not care. That is why OCR is on its way out.')],
      factIds: ['F007', 'F156', 'F193'],
    },
    { id: 'M16.13', kind: 'quiz-checkpoint', checkpointId: 'CP-M16.1', title: 'Second Screen', questionIds: ['Q331', 'Q333', 'Q335', 'Q337', 'Q339', 'Q343'] },
  ],
};
