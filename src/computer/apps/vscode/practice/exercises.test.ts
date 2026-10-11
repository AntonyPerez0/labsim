import { describe, expect, it } from 'vitest';
import { diagnoseJson } from '../jsonLang';
import { checkExercise, EXERCISES, EXERCISES_BY_ID } from './exercises';
import { dryRun, type ProfileInfo } from './lstrCheck';

const PROFILES: ProfileInfo[] = [
  { name: 'VISA_STD_SWIPE', entry: 'SWIPE' },
  { name: 'VISA_STD_DIP', entry: 'DIP' },
  { name: 'VISA_STD_TAP', entry: 'TAP' },
  { name: 'INTERAC_CA_DIP', entry: 'DIP', requiresPin: true },
  { name: 'INTERAC_CA_TAP', entry: 'TAP', requiresPin: true },
];

/** Hand-written fixes for the exercises whose answer is not the untouched original. */
function solve(id: string, text: string, ctx: Record<string, unknown>): string {
  switch (id) {
    case 'receipt-map':
      return text.replaceAll('"RECEIPT_OPTIONS_4"', '"${RECEIPT_SCREEN}"');
    case 'dip-clone':
      return text.replace('"card swipe"', '"card dip"').replace('VISA_STD_SWIPE', 'VISA_STD_DIP').replace(/"name": "[^"]*"/, '"name": "Dip sale with printed receipt"');
    case 'interac': {
      const e = String(ctx['entry']).toUpperCase();
      return text.replace(`VISA_STD_${e}`, `INTERAC_CA_${e}`).replace(/"name": "[^"]*"/, '"name": "Interac sale (CA)"');
    }
    case 'platforms':
      return text.replace('"platforms": ["ANDROID"]', '"platforms": ["REST", "ANDROID", "WINDOWS", "IOS"]');
    case 'screen-compare':
      return text.replace('"x": 0, "y": 0, "w": 0, "h": 0, "expected": "TODO"', `"x": ${ctx['x']}, "y": ${ctx['y']}, "w": ${ctx['w']}, "h": ${ctx['h']}, "expected": "${ctx['expected']}"`);
    case 'build-tip-sale':
      return text.replace(
        '"actions": [\n\n  ]',
        `"actions": [
    { "action": "create order", "params": { "item": "Tax Item 5" }, "store": "orderId" },
    { "action": "card swipe", "params": { "profile": "VISA_STD_SWIPE", "orderId": "\${orderId}" }, "store": "paymentId" },
    { "action": "add tip", "params": { "paymentId": "\${paymentId}", "percent": ${ctx['pct']} }, "store": "tipId" },
    { "action": "select print", "params": { "robot": "\${ROBOT_NAME}", "screen": "\${RECEIPT_SCREEN}" } },
    { "action": "assert home", "params": {} }
  ]`,
      );
    default:
      return String(ctx['solution']);
  }
}

describe('Pigeon Practice exercises', () => {
  for (const ex of EXERCISES) {
    it(`${ex.id}: every variant starts failing and the fix passes`, () => {
      for (let i = 0; i < 40; i++) {
        const v = ex.make();
        const start = checkExercise(ex, v.text, v.ctx, PROFILES);
        expect(start.passed, `${ex.id} variant should start unsolved:\n${v.text}`).toBe(false);
        const fixed = solve(ex.id, v.text, v.ctx);
        const end = checkExercise(ex, fixed, v.ctx, PROFILES);
        expect(end.passed, `${ex.id} fix should pass:\n${fixed}\n${JSON.stringify(end.items)}\n${end.lines.join('\n')}`).toBe(true);
        expect(diagnoseJson(fixed).filter((d) => d.severity === 'error')).toEqual([]);
      }
    });
  }

  it('syntax exercises show a VS Code problem; semantic ones do not', () => {
    for (const id of ['comma-hunt', 'field-comma', 'bracket-balance', 'strict-json']) {
      for (let i = 0; i < 20; i++) expect(diagnoseJson(EXERCISES_BY_ID[id]!.make().text).some((d) => d.severity === 'error')).toBe(true);
    }
    for (const id of ['variable-plumbing', 'unknown-action', 'receipt-map']) {
      for (let i = 0; i < 20; i++) expect(diagnoseJson(EXERCISES_BY_ID[id]!.make().text)).toEqual([]);
    }
  });
});

describe('VS Code JSON diagnostics', () => {
  it('reports a missing comma at the next token, like VS Code', () => {
    const text = '{\n  "a": 1\n  "b": 2\n}';
    const d = diagnoseJson(text);
    expect(d).toHaveLength(1);
    expect(d[0]!.message).toBe('Expected comma');
    expect(d[0]!.code).toBe(514);
    expect(text.slice(d[0]!.from, d[0]!.to)).toBe('"b"');
  });
  it('trailing comma, unquoted key, duplicate key', () => {
    expect(diagnoseJson('[1, 2,]')[0]!.message).toBe('Trailing comma');
    expect(diagnoseJson('{ a: 1 }')[0]!.message).toBe('Property keys must be doublequoted');
    const dup = diagnoseJson('{ "a": 1, "a": 2 }');
    expect(dup.every((x) => x.severity === 'warning' && x.message === 'Duplicate object key')).toBe(true);
  });
  it('missing closing bracket', () => {
    expect(diagnoseJson('{ "a": [1, 2 }')[0]!.message).toBe('Expected comma or closing bracket');
    expect(diagnoseJson('{ "a": 1')[0]!.message).toBe('Expected comma or closing brace');
  });
});

describe('LSTR dry run', () => {
  it('matches the runner wording for parse errors and unknown actions', () => {
    expect(dryRun('{ "name": "x" "connectionType": "USB" }', PROFILES).lines[0]).toMatch(/^LSTR ParseError: /);
    const t = '{ "name": "t", "connectionType": "USB", "platforms": ["ANDROID"], "actions": [ { "action": "select prnt", "params": {} } ] }';
    const r = dryRun(t, PROFILES);
    expect(r.code).toBe('UNKNOWN_ACTION');
    expect(r.lines).toContain('LSTR UnknownAction: "select prnt"');
  });
  it('flags a profile that does not match the entry mode', () => {
    const t = '{ "name": "t", "connectionType": "USB", "platforms": ["ANDROID"], "actions": [ { "action": "card dip", "params": { "profile": "VISA_STD_SWIPE" } } ] }';
    expect(dryRun(t, PROFILES).code).toBe('PROFILE');
  });
});
