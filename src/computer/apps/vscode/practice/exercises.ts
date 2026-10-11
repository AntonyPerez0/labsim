/**
 * Pigeon Practice — repeatable JSON exercises for the VS Code app. Each `start()` generates a fresh variant
 * (random test, random mistake), written to `~/pigeon-practice/<id>.json`. `Check` = the LSTR dry run
 * (`lstrCheck.ts`) plus the exercise's own goals. UI-level randomness (Math.random) is fine here: nothing
 * in the simulation depends on it.
 */
import type { JsonValue } from '@/sim/devops/json';
import { dryRun, PLATFORMS, type DryRun, type LstrActionRow, type ProfileInfo } from './lstrCheck';

export interface Goal {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface ExerciseVariant {
  text: string;
  /** Task text shown in the panel (variant-specific numbers filled in). */
  brief: string[];
  ctx: Record<string, unknown>;
}

export interface Exercise {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  /** Short topic chip ("Syntax", "Receipt map" …). */
  topic: string;
  /** Why this matters in the real lab (one line, shown after solving). */
  lesson: string;
  hints: string[];
  make(): ExerciseVariant;
  goals(dr: DryRun, text: string, ctx: Record<string, unknown>): Goal[];
}

/* ───────────────────────────── rendering helpers ───────────────────────────── */

interface Act {
  action: string;
  params: Record<string, string | number>;
  store?: string;
}

function rnd(n: number): number {
  return Math.floor(Math.random() * n);
}
function pick<T>(a: readonly T[]): T {
  return a[rnd(a.length)]!;
}

function renderAction(a: Act): string {
  const params = Object.entries(a.params)
    .map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(', ');
  return `{ "action": ${JSON.stringify(a.action)}, "params": ${params ? `{ ${params} }` : '{}'}${a.store ? `, "store": ${JSON.stringify(a.store)}` : ''} }`;
}

/** Pigeon house style: header fields one per line, one action per line. */
export function renderTest(t: { name: string; connectionType: string; platforms: string[]; actions: Act[] }): string {
  const acts = t.actions.map((a, i) => `    ${renderAction(a)}${i < t.actions.length - 1 ? ',' : ''}`);
  return [
    '{',
    `  "name": ${JSON.stringify(t.name)},`,
    `  "connectionType": ${JSON.stringify(t.connectionType)},`,
    `  "platforms": [${t.platforms.map((p) => JSON.stringify(p)).join(', ')}],`,
    '  "actions": [',
    ...acts,
    '  ]',
    '}',
    '',
  ].join('\n');
}

const ITEMS = ['Tax Item 5', 'Coffee', 'Bagel', 'Tax Item 2', 'Gift Card Reload'];
const R = '${ROBOT_NAME}';

function saleActions(opts: { entry?: 'swipe' | 'dip' | 'tap'; profile?: string; tip?: 'none' | number; receipt?: string; item?: string } = {}): Act[] {
  const entry = opts.entry ?? 'swipe';
  const profile = opts.profile ?? `VISA_STD_${entry.toUpperCase()}`;
  const a: Act[] = [
    { action: 'create order', params: { item: opts.item ?? pick(ITEMS) }, store: 'orderId' },
    { action: 'review order', params: { orderId: '${orderId}' } },
    { action: 'pay', params: { orderId: '${orderId}' } },
    { action: `card ${entry}`, params: { profile, orderId: '${orderId}' }, store: 'paymentId' },
  ];
  if (opts.tip === undefined || opts.tip === 'none') a.push({ action: 'select tip', params: { robot: R, screen: 'TIP', button: 'No Tip' } });
  else a.push({ action: 'add tip', params: { paymentId: '${paymentId}', percent: opts.tip }, store: 'tipId' });
  a.push({ action: 'assert approved', params: { paymentId: '${paymentId}' } });
  a.push({ action: 'select print', params: { robot: R, screen: opts.receipt ?? '${RECEIPT_SCREEN}' } });
  a.push({ action: 'assert home', params: {} });
  return a;
}

function baseTest(name: string, actions: Act[], platforms: string[] = ['REST', 'ANDROID', 'WINDOWS', 'IOS']) {
  return { name, connectionType: pick(['USB', 'NETWORK']), platforms, actions };
}

const lines = (text: string) => text.split('\n');

/** Line index of the n-th action line (0-based in the file). */
function actionLine(text: string, n: number): number {
  const ls = lines(text);
  let seen = -1;
  for (let i = 0; i < ls.length; i++) if (/^\s*\{ "action"/.test(ls[i]!)) if (++seen === n) return i;
  return -1;
}

function replaceLine(text: string, i: number, fn: (l: string) => string): string {
  const ls = lines(text);
  ls[i] = fn(ls[i]!);
  return ls.join('\n');
}

function actionsOf(dr: DryRun): LstrActionRow[] {
  return dr.test?.actions ?? [];
}
function s(v: JsonValue | undefined): string {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : JSON.stringify(v);
}

const passes = (dr: DryRun): Goal => ({ label: 'LSTR dry run passes', ok: dr.ok, detail: dr.ok ? undefined : dr.lines[dr.lines.length - 1] });
const sameCount = (dr: DryRun, ctx: Record<string, unknown>): Goal => ({
  label: `All ${ctx['count']} actions are still there`,
  ok: actionsOf(dr).length === ctx['count'],
  detail: dr.test ? `${actionsOf(dr).length} actions now` : undefined,
});

/* ───────────────────────────── exercises ───────────────────────────── */

export const EXERCISES: Exercise[] = [
  {
    id: 'comma-hunt',
    title: 'Comma Hunt',
    level: 1,
    topic: 'Syntax',
    lesson: 'Missing commas are the #1 Pigeon time sink. The parser (and VS Code) complain at the token AFTER the gap — the fix is at the end of the previous line.',
    hints: ['Open the Problems panel (Ctrl+Shift+M) and click the error.', 'The red squiggle sits on the line AFTER the mistake. Look at the end of the line above it.', 'Each action object except the last ends with "},".'],
    make() {
      const t = baseTest('Swipe sale with printed receipt', saleActions());
      let text = renderTest(t);
      const k = 1 + rnd(t.actions.length - 2);
      text = replaceLine(text, actionLine(text, k), (l) => l.replace(/\},\s*$/, '}'));
      return { text, brief: ['This test was edited by hand and now fails with `LSTR ParseError`.', 'Find the missing comma between two actions and fix it — do not delete any action.', 'Then press **Check**.'], ctx: { solution: renderTest(t), count: t.actions.length } };
    },
    goals: (dr, _t, ctx) => [passes(dr), sameCount(dr, ctx)],
  },
  {
    id: 'field-comma',
    title: 'Header Comma',
    level: 1,
    topic: 'Syntax',
    lesson: 'Fields inside an object are separated by commas too — "name", "connectionType", "platforms" and "actions" each need one except the last.',
    hints: ['VS Code reports "Expected comma" on the next key.', 'Check the end of the header line just above the squiggle.'],
    make() {
      const t = baseTest(pick(['Dip sale (DEV1)', 'Tap sale, no tip', 'Swipe refund smoke']), saleActions({ entry: pick(['swipe', 'dip', 'tap'] as const) }));
      let text = renderTest(t);
      const which = pick([1, 2, 3]);
      text = replaceLine(text, which, (l) => l.replace(/,\s*$/, ''));
      return { text, brief: ['One of the header fields lost its trailing comma.', 'Fix it so the file parses again, then **Check**.'], ctx: { solution: renderTest(t), count: t.actions.length } };
    },
    goals: (dr, _t, ctx) => [passes(dr), sameCount(dr, ctx)],
  },
  {
    id: 'bracket-balance',
    title: 'Bracket Balance',
    level: 2,
    topic: 'Syntax',
    lesson: 'Every [ and { needs its partner. Bracket-pair colours (gold → purple → blue) show which ones belong together.',
    hints: ['Look for "Expected comma or closing brace/bracket".', 'Bracket colours: the same colour opens and closes a pair. Which pair has no partner?', 'The actions array closes with "  ]" on its own line, the file with "}".'],
    make() {
      const t = baseTest('Swipe sale, no tip', saleActions());
      let text = renderTest(t);
      const variant = pick(['array', 'params', 'object']);
      if (variant === 'array') text = text.replace('\n  ]\n', '\n');
      else if (variant === 'params') {
        const k = rnd(t.actions.length - 1);
        text = replaceLine(text, actionLine(text, k), (l) => l.replace(/ \}(, "store"| \})/, '$1'));
      } else {
        const k = rnd(t.actions.length - 1);
        text = replaceLine(text, actionLine(text, k), (l) => l.replace(/ \},\s*$/, ','));
      }
      return { text, brief: ['A bracket or brace went missing while copy-pasting.', 'Put it back (exactly one), keep every action, then **Check**.'], ctx: { solution: renderTest(t), count: t.actions.length } };
    },
    goals: (dr, _t, ctx) => [passes(dr), sameCount(dr, ctx)],
  },
  {
    id: 'strict-json',
    title: 'Strict JSON',
    level: 2,
    topic: 'Syntax',
    lesson: 'LSTR parses strict JSON: double quotes only, quoted keys, no trailing commas, no comments.',
    hints: ['JSON is not JavaScript: keys need "double quotes".', 'A comma before ] or } is a "Trailing comma".'],
    make() {
      const t = baseTest('Tip sale 18%', saleActions({ tip: 18 }));
      let text = renderTest(t);
      const kinds = ['trailing', 'single', 'unquoted'] as const;
      const kind = pick(kinds);
      if (kind === 'trailing') text = replaceLine(text, actionLine(text, t.actions.length - 1), (l) => `${l},`);
      else if (kind === 'single') text = replaceLine(text, actionLine(text, rnd(t.actions.length)), (l) => l.replace(/"action": "([^"]+)"/, "\"action\": '$1'"));
      else text = replaceLine(text, actionLine(text, rnd(t.actions.length)), (l) => l.replace('"params":', 'params:'));
      return { text, brief: ['Someone typed this test like JavaScript.', 'Make it strict JSON again, then **Check**.'], ctx: { solution: renderTest(t), count: t.actions.length, kind } };
    },
    goals: (dr, _t, ctx) => [passes(dr), sameCount(dr, ctx)],
  },
  {
    id: 'receipt-map',
    title: 'The QR Shift',
    level: 2,
    topic: 'Receipt map',
    lesson: 'The QR "scan" option moved the receipt buttons and only appears on some layouts, so Orca keeps RECEIPT_OPTIONS_4 and _5 maps. Let the runner pick: ${RECEIPT_SCREEN}.',
    hints: ['Search the file (Ctrl+F) for RECEIPT_OPTIONS.', 'The Android runner sets ${RECEIPT_SCREEN} after counting the options on screen.', '"select scan" really is 5-option only — leave that one alone if it is there.'],
    make() {
      const t = baseTest('Swipe sale with printed receipt', saleActions({ receipt: 'RECEIPT_OPTIONS_4' }));
      return {
        text: renderTest(t),
        brief: ['Since the QR-code receipt update, this test misses **Print** on devices that show 5 receipt options — the job then dies "at select print" waiting for a printer payload.', 'Stop hard-coding the receipt map: make every receipt action use the runner variable instead.', '**Check** when done.'],
        ctx: { count: t.actions.length },
      };
    },
    goals: (dr, _t, ctx) => {
      const receipt = actionsOf(dr).filter((a) => ['select print', 'select email', 'select text', 'select no receipt'].includes(a.action));
      return [passes(dr), sameCount(dr, ctx), { label: 'Receipt actions use ${RECEIPT_SCREEN}', ok: receipt.length > 0 && receipt.every((a) => s(a.params['screen']) === '${RECEIPT_SCREEN}') }];
    },
  },
  {
    id: 'variable-plumbing',
    title: 'Variable Plumbing',
    level: 2,
    topic: 'Variables',
    lesson: '"store" saves an action\'s output under a name; later actions read it as ${name}. A typo is NOT a syntax error — VS Code shows nothing; only the run fails.',
    hints: ['VS Code has no Pigeon schema: Problems will be empty. Press Check to see the runner error.', 'Compare the "store" names with every ${...} used later — spelling and capitals matter.'],
    make() {
      const t = baseTest('Swipe sale with printed receipt', saleActions());
      let text = renderTest(t);
      const bug = pick(['typo', 'missing-store', 'used-early'] as const);
      if (bug === 'typo') {
        const wrong = pick(['${paymentID}', '${payment}', '${paymentid}']);
        text = text.replace('"paymentId": "${paymentId}" } },\n    { "action": "select print"', `"paymentId": "${wrong}" } },\n    { "action": "select print"`);
        if (!text.includes(wrong)) text = text.replace(/("assert approved", "params": \{ "paymentId": )"\$\{paymentId\}"/, `$1"${wrong}"`);
      } else if (bug === 'missing-store') text = text.replace(/("action": "card \w+".*?\}), "store": "paymentId" \}/, '$1 }');
      else text = text.replace(/("create order", "params": \{ "item": "[^"]+" \}), "store": "orderId"/, '$1, "store": "order"');
      return { text, brief: ['The JSON is valid — VS Code shows **no problems** — but the run fails.', 'Find the broken variable hand-off and fix it, then **Check**.'], ctx: { solution: renderTest(t), count: t.actions.length, bug } };
    },
    goals: (dr, _t, ctx) => [passes(dr), sameCount(dr, ctx)],
  },
  {
    id: 'unknown-action',
    title: 'Typo in an Action',
    level: 1,
    topic: 'Actions',
    lesson: 'LSTR only knows its own action names. Copy action lines from tests/_templates/known_good_actions.json instead of typing them.',
    hints: ['Problems is empty: it is valid JSON. Press Check.', 'Compare with tests/_templates/known_good_actions.json in the PIGEON folder (or the list in this panel).'],
    make() {
      const t = baseTest('Swipe sale with printed receipt', saleActions());
      const typos: Record<string, string[]> = { 'select print': ['select prnt', 'Select Print', 'select_print'], 'assert approved': ['asert approved', 'assert aproved'], 'review order': ['review  order', 'reveiw order'], pay: ['Pay', 'pay '] };
      const target = pick(Object.keys(typos));
      const typo = pick(typos[target]!);
      const text = renderTest(t).replace(`"action": "${target}"`, `"action": "${typo}"`);
      return { text, brief: ['The nightly job failed with `LSTR UnknownAction`.', 'Fix the action name (do not remove the step), then **Check**.'], ctx: { solution: renderTest(t), count: t.actions.length, target } };
    },
    goals: (dr, _t, ctx) => [passes(dr), sameCount(dr, ctx), { label: `"${ctx['target']}" step restored`, ok: actionsOf(dr).some((a) => a.action === ctx['target']) }],
  },
  {
    id: 'dip-clone',
    title: 'Make a Dip Version',
    level: 2,
    topic: 'Cards',
    lesson: 'Chip suites need a dip-capable robot and a DIP card profile. The team standardises on one baseline Visa profile per entry mode.',
    hints: ['Change both the action ("card swipe" → "card dip") and the profile.', 'DIP profiles in Orca: VISA_STD_DIP, INTERAC_CA_DIP …', 'Rename the test so the Jenkins log tells the two apart.'],
    make() {
      const t = baseTest('Swipe sale with printed receipt', saleActions({ entry: 'swipe' }));
      return { text: renderTest(t), brief: ['Copy of the swipe sale. Turn it into a **chip (dip)** sale with the baseline Visa dip profile.', 'Rename it so the name mentions **dip**.', 'No swipe may remain. **Check** when done.'], ctx: { solution: renderTest(t), count: t.actions.length } };
    },
    goals: (dr) => {
      const cards = actionsOf(dr).filter((a) => a.action.startsWith('card '));
      return [
        passes(dr),
        { label: 'Uses "card dip" with VISA_STD_DIP', ok: cards.some((a) => a.action === 'card dip' && s(a.params['profile']) === 'VISA_STD_DIP') },
        { label: 'No "card swipe" left', ok: !cards.some((a) => a.action === 'card swipe') },
        { label: 'Test name mentions dip', ok: /dip/i.test(dr.test?.name ?? '') && !/swipe/i.test(dr.test?.name ?? '') },
      ];
    },
  },
  {
    id: 'interac',
    title: 'Canada: Interac',
    level: 2,
    topic: 'Cards',
    lesson: 'Interac needs PIN entry. ADB bots cannot touch the glass or type a PIN, so Canadian flows run on physical touch robots.',
    hints: ['The Interac profiles are INTERAC_CA_DIP and INTERAC_CA_TAP.', 'Entry mode and profile must agree: card dip ↔ *_DIP.'],
    make() {
      const entry = pick(['dip', 'tap'] as const);
      const t = baseTest('US Visa sale', saleActions({ entry }));
      return { text: renderTest(t), brief: [`Regional check for Canada: switch this ${entry} sale to the **Interac ${entry}** profile.`, 'Rename the test so it says **Interac**.', '**Check** — and read the warning about which robots can run it.'], ctx: { entry } };
    },
    goals: (dr, _t, ctx) => {
      const want = `INTERAC_CA_${String(ctx['entry']).toUpperCase()}`;
      return [passes(dr), { label: `card ${ctx['entry']} uses ${want}`, ok: actionsOf(dr).some((a) => a.action === `card ${ctx['entry']}` && s(a.params['profile']) === want) }, { label: 'Name mentions Interac', ok: /interac/i.test(dr.test?.name ?? '') }];
    },
  },
  {
    id: 'platforms',
    title: 'Run It Everywhere',
    level: 1,
    topic: 'Platforms',
    lesson: 'Versatile Pigeon tests list 4–5 platforms; each LSTR runner (REST, Android, Windows, iOS) abstracts the same actions its own way.',
    hints: ['"platforms" is an array of strings: ["REST", "ANDROID", …].', `Valid values: ${PLATFORMS.join(', ')}.`],
    make() {
      const t = baseTest('Tap sale, no tip', saleActions({ entry: 'tap' }), ['ANDROID']);
      return { text: renderTest(t), brief: ['This sale only runs on the Android runner.', 'Make it a versatile test: at least **4 platforms**, including ANDROID and REST, no duplicates.', '**Check** when done.'], ctx: {} };
    },
    goals: (dr) => {
      const p = dr.test?.platforms ?? [];
      return [passes(dr), { label: 'At least 4 platforms incl. ANDROID and REST', ok: p.length >= 4 && p.includes('ANDROID') && p.includes('REST') }, { label: 'No duplicates', ok: new Set(p).size === p.length }];
    },
  },
  {
    id: 'screen-compare',
    title: 'GIMP Box → screenCompare',
    level: 3,
    topic: 'Screen compare',
    lesson: 'When a screen comparison is unavoidable, the box comes from GIMP: rectangle-select the text on a screenshot and copy Position and Size into the JSON.',
    hints: ['x/y = GIMP Position, w/h = GIMP Size. Numbers, not strings.', '"expected" is the exact text inside the box.'],
    make() {
      const x = 120 + rnd(200);
      const y = 300 + rnd(320);
      const w = 180 + rnd(220);
      const h = 28 + rnd(30);
      const expected = pick(['Payment Successful', 'Approved', 'Thank you', 'Remove card']);
      const acts = saleActions();
      acts.splice(acts.length - 2, 0, { action: 'screenCompare', params: { x: 0, y: 0, w: 0, h: 0, expected: 'TODO' } });
      const t = baseTest('Payment Successful screen compare', acts, ['ANDROID']);
      return {
        text: renderTest(t),
        brief: [`In GIMP you rectangle-selected the text **"${expected}"** on the CFD screenshot.`, `Tool Options show **Position ${x}, ${y}** and **Size ${w} × ${h}**.`, 'Fill in the screenCompare step, then **Check**.'],
        ctx: { x, y, w, h, expected },
      };
    },
    goals: (dr, _t, ctx) => {
      const sc = actionsOf(dr).find((a) => a.action === 'screenCompare');
      const p = sc?.params ?? {};
      return [
        passes(dr),
        { label: `Box = ${ctx['x']}, ${ctx['y']}, ${ctx['w']} × ${ctx['h']}`, ok: p['x'] === ctx['x'] && p['y'] === ctx['y'] && p['w'] === ctx['w'] && p['h'] === ctx['h'] },
        { label: `expected = "${ctx['expected']}"`, ok: s(p['expected']) === ctx['expected'] },
      ];
    },
  },
  {
    id: 'copy-paste-twice',
    title: 'Pasted Twice',
    level: 1,
    topic: 'Copy-paste',
    lesson: 'Copy-pasting known-good blocks is the team\'s survival trick — but check what you pasted. VS Code flags duplicate keys as warnings; duplicate steps it cannot see.',
    hints: ['Read the actions top to bottom: which step happens twice?', 'Shift+Alt+Down duplicates a line in VS Code — handy, and easy to do by accident.'],
    make() {
      const t = baseTest('Swipe sale with printed receipt', saleActions());
      const dupe = pick([0, 3]);
      const ls = lines(renderTest(t));
      const i = actionLine(ls.join('\n'), dupe);
      ls.splice(i + 1, 0, ls[i]!);
      return { text: ls.join('\n'), brief: ['After a hurried copy-paste, this test would create two orders or swipe twice — and the payment ids stop matching.', 'Remove the duplicated step, then **Check**.'], ctx: { solution: renderTest(t), count: t.actions.length } };
    },
    goals: (dr, _t, ctx) => {
      const names = actionsOf(dr).map((a) => a.action);
      return [passes(dr), sameCount(dr, ctx), { label: 'Every step appears once', ok: new Set(names).size === names.length }];
    },
  },
  {
    id: 'build-tip-sale',
    title: 'Build a Tip Sale',
    level: 3,
    topic: 'Write a test',
    lesson: 'Real Pigeon work: assemble a new test from known-good lines, store outputs, pass them on, and let the runner choose the receipt map.',
    hints: ['Open PIGEON › tests › _templates › known_good_actions.json, copy whole lines (Shift+Alt+Down duplicates, Alt+↑/↓ moves).', 'Order: create order → card swipe → add tip → select print → assert home.', 'Separate actions with commas; no comma after the last one.'],
    make() {
      const pct = pick([15, 18, 20, 25]);
      const text = renderTest({ name: `Swipe sale with ${pct}% tip`, connectionType: 'USB', platforms: ['REST', 'ANDROID', 'WINDOWS', 'IOS'], actions: [] }).replace('  "actions": [\n  ]', '  "actions": [\n\n  ]');
      return {
        text,
        brief: [
          `Write the actions for a **${pct}% tip** swipe sale, in this order:`,
          '1. create order (store **orderId**)',
          '2. card swipe with VISA_STD_SWIPE (store **paymentId**)',
          `3. add tip **${pct}** percent for that payment`,
          '4. select print using **${RECEIPT_SCREEN}**',
          '5. assert home',
        ],
        ctx: { pct },
      };
    },
    goals: (dr, _t, ctx) => {
      const a = actionsOf(dr);
      const idx = (name: string) => a.findIndex((x) => x.action === name);
      const order = ['create order', 'card swipe', 'add tip', 'select print', 'assert home'].map(idx);
      const tip = a.find((x) => x.action === 'add tip');
      return [
        passes(dr),
        { label: 'Steps in the right order', ok: order.every((v) => v >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]!) },
        { label: 'Swipe uses VISA_STD_SWIPE and stores paymentId', ok: a.some((x) => x.action === 'card swipe' && s(x.params['profile']) === 'VISA_STD_SWIPE' && x.store === 'paymentId') },
        { label: `Tip is ${ctx['pct']}% of \${paymentId}`, ok: !!tip && Number(tip.params['percent']) === ctx['pct'] && s(tip.params['paymentId']) === '${paymentId}' },
        { label: 'Print uses ${RECEIPT_SCREEN}', ok: a.some((x) => x.action === 'select print' && s(x.params['screen']) === '${RECEIPT_SCREEN}') },
      ];
    },
  },
];

export const EXERCISES_BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function practiceFile(id: string): string {
  return `${id}.json`;
}

export interface CheckResult {
  passed: boolean;
  items: Goal[];
  lines: string[];
  warnings: string[];
}

export function checkExercise(ex: Exercise, text: string, ctx: Record<string, unknown>, profiles: ProfileInfo[]): CheckResult {
  const dr = dryRun(text, profiles);
  const items = ex.goals(dr, text, ctx);
  return { passed: items.every((g) => g.ok), items, lines: dr.lines, warnings: dr.warnings };
}
