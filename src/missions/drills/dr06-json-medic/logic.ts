/**
 * DR06 JSON Medic ("Comma Hunt", GP §2.4.3, Cur M15): 5 Pigeon payloads (25–60 lines) in the Pigeon shape
 * (`name`, `connectionType`, `platforms`, `actions[{action, params, store}]`). One syntax error each:
 * missing comma between objects 40 %, between fields 20 %, missing `]`/`}` 15 %, trailing comma 10 %,
 * unquoted key 10 %, single quotes 5 %. Some items show the LSTR console line, which points at the line
 * *after* a missing comma — the lesson is to look at the end of the previous line. Click the line (exact 100,
 * ±1 50), then pick the fix. No error highlighting (Pigeon has no linter, F208). Hint (−50): paste a
 * known-good block from `tests/_templates/known_good_actions.json` (F209).
 * Scoring (custom): line points + 150 for the right fix − 50 per hint; a perfect item adds a speed bonus
 * (8 pts per second under 35 s) and the streak multiplier.
 */
import type { RootState } from '@/core/state';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { chance, nextInt, pick, shuffle, weightedPick, type RngState } from '../common/rng';
import { lineClickPoints, streakMultiplier } from '../common/scoring';
import { teach } from '../common/teach';

export type JsonErr = 'comma-objects' | 'comma-fields' | 'missing-bracket' | 'trailing-comma' | 'unquoted-key' | 'single-quotes';

export const ERR_WEIGHTS: Record<JsonErr, number> = { 'comma-objects': 40, 'comma-fields': 20, 'missing-bracket': 15, 'trailing-comma': 10, 'unquoted-key': 10, 'single-quotes': 5 };

export const FIX_TEXT: Record<JsonErr, string> = {
  'comma-objects': 'Add a comma after the closing } of the previous action',
  'comma-fields': 'Add a comma at the end of the line',
  'missing-bracket': 'Add the missing closing bracket ] / }',
  'trailing-comma': 'Remove the trailing comma before the closing bracket',
  'unquoted-key': 'Wrap the key in double quotes',
  'single-quotes': 'Replace the single quotes with double quotes',
};

const FIX_WHY: Record<JsonErr, string> = {
  'comma-objects': 'Objects in the actions array need a comma between them; the parser only notices at the next "{" — so the error line is one too far: look at the end of the previous line.',
  'comma-fields': 'Fields inside an object are separated by commas; the parser complains at the next key, one line below the real mistake.',
  'missing-bracket': 'Every [ and { needs its partner. Strict JSON has no recovery — the parse fails at the next token.',
  'trailing-comma': 'Strict JSON forbids a comma after the last element of an array or object.',
  'unquoted-key': 'JSON keys must be double-quoted strings — JavaScript-style bare keys don\'t parse.',
  'single-quotes': 'JSON strings use double quotes only.',
};

export interface MedicData {
  file: string;
  lines: string[];
  err: JsonErr;
  /** 1-based line holding the mistake (the line to click). */
  errLine: number;
  /** LSTR console line, or null. */
  console: string | null;
  /** Fix options (the correct one included), shuffled. */
  fixes: JsonErr[];
}


/* ── a tiny strict JSON parser that reports where parsing fails (what LSTR prints) ── */

export interface ParseFail {
  line: number;
  column: number;
  token: string;
}

/** First syntax error in strict JSON (1-based line/column), or null when the text parses. */
export function jsonErrorAt(text: string): ParseFail | null {
  let i = 0;
  const fail = (): never => {
    throw i;
  };
  const ws = () => {
    while (i < text.length && ' \t\r\n'.includes(text[i]!)) i++;
  };
  const str = () => {
    if (text[i] !== '"') fail();
    i++;
    while (i < text.length && text[i] !== '"') {
      if (text[i] === '\\') i++;
      if (text[i] === '\n') fail();
      i++;
    }
    if (i >= text.length) fail();
    i++;
  };
  const value = (): void => {
    ws();
    const c = text[i];
    if (c === '{') {
      i++;
      ws();
      if (text[i] === '}') {
        i++;
        return;
      }
      for (;;) {
        ws();
        str();
        ws();
        if (text[i] !== ':') fail();
        i++;
        value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return;
        }
        fail();
      }
    }
    if (c === '[') {
      i++;
      ws();
      if (text[i] === ']') {
        i++;
        return;
      }
      for (;;) {
        value();
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return;
        }
        fail();
      }
    }
    if (c === '"') return str();
    const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?|^true|^false|^null/.exec(text.slice(i));
    if (!m) fail();
    i += m![0].length;
  };
  try {
    value();
    ws();
    if (i < text.length) fail();
    return null;
  } catch (e) {
    if (typeof e !== 'number') throw e;
    const before = text.slice(0, e);
    const line = before.split('\n').length;
    const column = e - before.lastIndexOf('\n');
    return { line, column, token: e < text.length ? text[e]! : 'end of input' };
  }
}

/** The LSTR console line for a broken payload (S-level illustrative wording, true position). */
export function lstrMessage(lines: readonly string[]): string | null {
  const f = jsonErrorAt(lines.join('\n'));
  if (!f) return null;
  const tok = f.token === '"' ? 'string' : `token ${f.token}`;
  return `LSTR ParseError: Unexpected ${tok} in JSON at line ${f.line} column ${f.column}`;
}

/* ── payload generation ── */

interface Act {
  action: string;
  params: Record<string, string | number>;
  store?: string;
}

const ACTIONS: (() => Act)[] = [
  () => ({ action: 'create order', params: { item: 'Tax Item 5' }, store: 'orderId' }),
  () => ({ action: 'add item', params: { orderId: '${orderId}', item: 'Coffee' } }),
  () => ({ action: 'card swipe', params: { profile: 'VISA_STD_SWIPE', orderId: '${orderId}' }, store: 'paymentId' }),
  () => ({ action: 'card dip', params: { profile: 'VISA_STD_DIP', orderId: '${orderId}' }, store: 'paymentId' }),
  () => ({ action: 'card tap', params: { profile: 'VISA_STD_TAP', orderId: '${orderId}' }, store: 'paymentId' }),
  () => ({ action: 'select tip', params: { robot: '${ROBOT_NAME}', screen: 'TIP', button: '18%' } }),
  () => ({ action: 'select print', params: { robot: '${ROBOT_NAME}', screen: 'RECEIPT_OPTIONS_5' } }),
  () => ({ action: 'verify payment', params: { paymentId: '${paymentId}', status: 'APPROVED' } }),
  () => ({ action: 'screenCompare', params: { x: 412, y: 288, w: 236, h: 44, expected: 'TOTAL $10.83' } }),
  () => ({ action: 'xy_touch', params: { robot: '${ROBOT_NAME}', screen: 'TENDER_CASH_DISCOUNT', button: 'Card' } }),
  () => ({ action: 'refund payment', params: { paymentId: '${paymentId}' }, store: 'refundId' }),
];

const NAMES = [
  ['Swipe sale with printed receipt', 'sale/swipe_sale_print.json'],
  ['Dip sale with tip', 'sale/dip_sale_tip.json'],
  ['Tap sale and refund', 'refund/tap_sale_refund.json'],
  ['Cash discount tender', 'sale/cash_discount_card.json'],
  ['CFD total check (Station Duo)', 'duo/cfd_total_compare.json'],
  ['Go SDK sale smoke', 'gosdk/sale_smoke.json'],
] as const;

const q = (s: string) => `"${s}"`;
const val = (v: string | number) => (typeof v === 'number' ? String(v) : q(v));

/** Pretty-print the payload in the house style (params inline). */
export function renderPayload(name: string, conn: string, platforms: string[], acts: Act[]): string[] {
  const L: string[] = ['{', `  "name": ${q(name)},`, `  "connectionType": ${q(conn)},`, `  "platforms": [${platforms.map(q).join(', ')}],`, '  "actions": ['];
  acts.forEach((a, i) => {
    L.push('    {');
    L.push(`      "action": ${q(a.action)},`);
    const params = `{ ${Object.entries(a.params)
      .map(([k, v]) => `${q(k)}: ${val(v)}`)
      .join(', ')} }`;
    L.push(`      "params": ${params}${a.store ? ',' : ''}`);
    if (a.store) L.push(`      "store": ${q(a.store)}`);
    L.push(i < acts.length - 1 ? '    },' : '    }');
  });
  L.push('  ]', '}');
  return L;
}

const col = (line: string) => line.length - line.trimStart().length + 1;

/** Inject one error; returns the new lines, the 1-based error line and a console message. */
export function injectError(lines: string[], err: JsonErr, rng: RngState): { lines: string[]; errLine: number; console: string } {
  const out = [...lines];
  const idx = (pred: (l: string, i: number) => boolean) => out.map((l, i) => (pred(l, i) ? i : -1)).filter((i) => i >= 0);
  switch (err) {
    case 'comma-objects': {
      const cands = idx((l) => l === '    },');
      const i = pick(rng, cands);
      out[i] = '    }';
      return { lines: out, errLine: i + 1, console: `LSTR ParseError: Unexpected token { in JSON at line ${i + 2} column ${col(out[i + 1]!)}` };
    }
    case 'comma-fields': {
      const cands = idx((l) => /^ {6}"action": .*,$/.test(l) || /^ {6}"params": .*\},$/.test(l) || /^ {2}"(name|connectionType)": .*,$/.test(l));
      const i = pick(rng, cands);
      out[i] = out[i]!.replace(/,$/, '');
      return { lines: out, errLine: i + 1, console: `LSTR ParseError: Unexpected string in JSON at line ${i + 2} column ${col(out[i + 1]!)}` };
    }
    case 'missing-bracket': {
      if (chance(rng, 0.5)) {
        const i = idx((l) => l.startsWith('  "platforms": ['))[0]!;
        out[i] = out[i]!.replace('],', ',');
        return { lines: out, errLine: i + 1, console: `LSTR ParseError: Unexpected token : in JSON at line ${i + 2} column ${col(out[i + 1]!) + 9}` };
      }
      const cands = idx((l) => /^ {6}"params": \{.*\},?$/.test(l));
      const i = pick(rng, cands);
      out[i] = out[i]!.replace(/ \}(,?)$/, '$1');
      return { lines: out, errLine: i + 1, console: `LSTR ParseError: Unexpected ${out[i]!.endsWith(',') ? 'string' : 'token }'} in JSON at line ${i + 2} column ${col(out[i + 1]!)}` };
    }
    case 'trailing-comma': {
      if (chance(rng, 0.5)) {
        const i = idx((l) => l === '    }').pop()!;
        out[i] = '    },';
        return { lines: out, errLine: i + 1, console: `LSTR ParseError: Unexpected token ] in JSON at line ${i + 2} column ${col(out[i + 1]!)}` };
      }
      const cands = idx((l) => /^ {6}"store": /.test(l));
      const i = cands.length ? pick(rng, cands) : idx((l) => /^ {6}"params": .*\}$/.test(l))[0]!;
      out[i] = `${out[i]},`;
      return { lines: out, errLine: i + 1, console: `LSTR ParseError: Unexpected token } in JSON at line ${i + 2} column ${col(out[i + 1]!)}` };
    }
    case 'unquoted-key': {
      const cands = idx((l) => /^ {6}"(action|store)": /.test(l) || /^ {2}"connectionType": /.test(l));
      const i = pick(rng, cands);
      out[i] = out[i]!.replace(/"(\w+)":/, '$1:');
      return { lines: out, errLine: i + 1, console: `LSTR ParseError: Unexpected token ${out[i]!.trim()[0]} in JSON at line ${i + 1} column ${col(out[i]!)}` };
    }
    case 'single-quotes': {
      const cands = idx((l) => /^ {6}"action": /.test(l));
      const i = pick(rng, cands);
      out[i] = out[i]!.replace(/"/g, "'");
      return { lines: out, errLine: i + 1, console: `LSTR ParseError: Unexpected token ' in JSON at line ${i + 1} column ${col(out[i]!)}` };
    }
  }
}

export function medicItem(rng: RngState, index: number): DrillItem<MedicData> {
  const [name, file] = pick(rng, NAMES);
  const nActs = nextInt(rng, 5, 10);
  const acts = Array.from({ length: nActs }, () => pick(rng, ACTIONS)());
  const all = ['REST', 'ANDROID', 'WINDOWS', 'IOS'];
  const platforms = shuffle(rng, all).slice(0, nextInt(rng, 2, 4));
  platforms.sort((a, b) => all.indexOf(a) - all.indexOf(b));
  const lines = renderPayload(name, pick(rng, ['USB', 'LAN']), platforms, acts);
  const err = index === 0 ? 'comma-objects' : weightedPick(rng, Object.keys(ERR_WEIGHTS) as JsonErr[], (e) => ERR_WEIGHTS[e]);
  const inj = injectError(lines, err, rng);
  const others = shuffle(
    rng,
    (Object.keys(FIX_TEXT) as JsonErr[]).filter((e) => e !== err),
  ).slice(0, 3);
  const showConsole = err === 'comma-objects' || err === 'comma-fields' ? chance(rng, 0.6) : chance(rng, 0.35);
  const facts = ['F208', 'F209', 'F205', 'F012'];
  return {
    id: `DR06:${file}:${err}:${inj.errLine}`,
    tags: ['pigeon.json', 'pigeon.nolint'],
    factIds: facts,
    teach: teach(`Line ${inj.errLine}: ${FIX_TEXT[err].toLowerCase()}`, FIX_WHY[err], { ref: 'Ref §5', factIds: facts, tag: 'pigeon.json', doInstead: 'Read the end of the line *before* the one the parser blames — or paste a known-good block.' }),
    data: { file: `pigeon/tests/${file}`, lines: inj.lines, err, errLine: inj.errLine, console: showConsole ? lstrMessage(inj.lines) : null, fixes: shuffle(rng, [err, ...others]) },
  };
}

/** The `known_good_actions.json` template (hint). */
export const KNOWN_GOOD = [
  '[',
  '  {',
  '    "action": "card swipe",',
  '    "params": { "profile": "VISA_STD_SWIPE", "orderId": "${orderId}" },',
  '    "store": "paymentId"',
  '  },',
  '  {',
  '    "action": "select print",',
  '    "params": { "robot": "${ROBOT_NAME}", "screen": "RECEIPT_OPTIONS_5" }',
  '  }',
  ']',
];

export function medicPoints(clickedLine: number, errLine: number, fixOk: boolean, hints: number, seconds: number, streakBefore: number): { points: number; correct: boolean } {
  const linePts = lineClickPoints(clickedLine, errLine);
  const correct = linePts === 100 && fixOk;
  let p = linePts + (fixOk ? 150 : 0) - 50 * hints;
  if (correct) p = Math.round((p + Math.max(0, Math.round(8 * (35 - seconds)))) * streakMultiplier(streakBefore));
  return { points: p, correct };
}

export function generateMedic(rng: RngState, _state: RootState | null, index: number): DrillItem<MedicData> {
  return medicItem(rng, index);
}

export const DR06: DrillDef<MedicData> = {
  id: 'DR06',
  name: 'JSON Medic',
  alias: 'Comma Hunt',
  format: 'Pigeon payload: click the error, pick the fix; 5 payloads, 90 s',
  tags: ['pigeon.json', 'pigeon.nolint'],
  unlockedBy: ['M15'],
  durationS: 90,
  itemCount: 5,
  medals: { bronze: 700, silver: 1300, gold: 2000 },
  scoring: 'custom',
  generate: (rng, state, index) => generateMedic(rng, state, index),
  component: lazyDrill(() => import('./View'), '#cf8e6d'),
};
