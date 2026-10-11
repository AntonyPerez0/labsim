/**
 * "LSTR dry run" for the Pigeon Practice panel: everything the Android LSTR runner would reject before or
 * while it runs, without a robot — strict JSON parse (same message as the runner), schema, platforms,
 * known actions, `${variable}` plumbing, card profile vs entry, receipt-screen maps. The checks mirror
 * `src/sim/devops/runners/pigeon.ts`; the output is styled like the runner's console.
 */
import { parseStrictJson, type JsonValue } from '@/sim/devops/json';

export const LSTR_ACTIONS = [
  'create order',
  'review order',
  'pay',
  'card swipe',
  'card dip',
  'card tap',
  'select tip',
  'add tip',
  'assert approved',
  'select print',
  'select email',
  'select text',
  'select no receipt',
  'select scan',
  'verify receipt',
  'screenCompare',
  'assert screen',
  'tap',
  'wait',
  'assert home',
] as const;

export const PLATFORMS = ['REST', 'ANDROID', 'WINDOWS', 'IOS', 'GO'] as const;

/** Variables the runner / Jenkins provide without a "store" (Android runner + job env). */
export const RUNNER_VARS = ['ROBOT_NAME', 'RECEIPT_SCREEN', 'MFD_IP', 'PORT_NUMBER', 'BACKEND_ENV', 'UNLOCK_PASSCODE', 'API_KEY'];

export interface ProfileInfo {
  name: string;
  entry: 'SWIPE' | 'DIP' | 'TAP' | string;
  requiresPin?: boolean;
}

export interface LstrActionRow {
  action: string;
  params: Record<string, JsonValue>;
  store: string | null;
}

export interface DryRun {
  ok: boolean;
  /** Console lines ("LSTR ParseError: …", "LSTR step 3/9 …"). */
  lines: string[];
  /** Parsed test when the JSON parsed (even if a later check failed). */
  test: { name: string; connectionType: string; platforms: string[]; actions: LstrActionRow[] } | null;
  /** First failure code, e.g. JSON_PARSE, UNKNOWN_ACTION, VARIABLE, PROFILE. */
  code: string | null;
  /** Non-fatal warnings (hard-coded receipt map …). */
  warnings: string[];
}

const RECEIPT_ACTIONS = new Set(['select print', 'select email', 'select text', 'select no receipt']);

function str(v: JsonValue | undefined): string {
  return typeof v === 'string' ? v : v === undefined || v === null ? '' : JSON.stringify(v);
}

export function dryRun(text: string, profiles: ProfileInfo[], platform = 'ANDROID'): DryRun {
  const warnings: string[] = [];
  const fail = (code: string, lines: string[], test: DryRun['test'] = null): DryRun => ({ ok: false, code, lines, test, warnings });
  const r = parseStrictJson(text);
  if (!r.ok) return fail('JSON_PARSE', [`LSTR ParseError: ${r.error}`]);
  const v = r.value;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return fail('SCHEMA', ['LSTR SchemaError: missing "name"']);
  for (const k of ['name', 'connectionType', 'platforms', 'actions']) if (!(k in v)) return fail('SCHEMA', [`LSTR SchemaError: missing "${k}"`]);
  if (!Array.isArray(v['platforms'])) return fail('SCHEMA', ['LSTR SchemaError: "platforms" must be an array']);
  if (!Array.isArray(v['actions'])) return fail('SCHEMA', ['LSTR SchemaError: missing "actions"']);
  const platforms = (v['platforms'] as JsonValue[]).map(String);
  const actions: LstrActionRow[] = (v['actions'] as JsonValue[]).map((a) => {
    const o = (a && typeof a === 'object' && !Array.isArray(a) ? a : {}) as Record<string, JsonValue>;
    const params = o['params'] && typeof o['params'] === 'object' && !Array.isArray(o['params']) ? (o['params'] as Record<string, JsonValue>) : {};
    return { action: str(o['action']), params, store: typeof o['store'] === 'string' ? o['store'] : null };
  });
  const test = { name: str(v['name']), connectionType: str(v['connectionType']), platforms, actions };
  const bad = platforms.find((p) => !(PLATFORMS as readonly string[]).includes(p));
  if (bad) return fail('SCHEMA', [`LSTR SchemaError: unknown platform "${bad}" (expected one of ${PLATFORMS.join(', ')})`], test);
  if (!platforms.includes(platform)) return fail('LSTR_PLATFORM', [`LSTR platform ${platform} not in test platforms [${platforms.join(', ')}]`], test);

  const lines = [`LSTR 2.8.1 · dry run · platform ${platform} · ${actions.length} actions`];
  const stored = new Set<string>();
  const n = actions.length;
  for (let i = 0; i < n; i++) {
    const a = actions[i]!;
    const head = `LSTR step ${i + 1}/${n} "${a.action}" …`;
    const stepFail = (code: string, why: string) => fail(code, [...lines, `${head} ${why}`, `FAILED at "${a.action}"`], test);
    if (!(LSTR_ACTIONS as readonly string[]).includes(a.action)) return fail('UNKNOWN_ACTION', [...lines, `${head}`, `LSTR UnknownAction: "${a.action}"`, `FAILED at "${a.action}"`], test);
    for (const [k, raw] of Object.entries(a.params)) {
      for (const m of str(raw).matchAll(/\$\{(\w*)\}/g)) {
        const name = m[1]!;
        if (!stored.has(name) && !RUNNER_VARS.includes(name)) {
          const have = [...stored];
          return stepFail('VARIABLE', `unresolved variable \${${name}} in params.${k}${have.length ? ` (stored so far: ${have.join(', ')})` : ' (nothing stored yet)'}`);
        }
      }
    }
    if (a.action.startsWith('card ')) {
      const entry = a.action.slice(5).toUpperCase();
      const profName = str(a.params['profile']);
      const prof = profiles.find((p) => p.name === profName);
      if (!prof) return stepFail('PROFILE', `[callus] card profile "${profName}" not found`);
      if (prof.entry !== entry) return stepFail('PROFILE', `[callus] ${profName} is a ${prof.entry} profile — cannot ${entry.toLowerCase()}`);
      if (prof.requiresPin) warnings.push(`${profName} needs PIN entry: only a physical touch robot can type the PIN (an ADB bot cannot).`);
    }
    if (RECEIPT_ACTIONS.has(a.action)) {
      const screen = str(a.params['screen']);
      if (screen && screen !== '${RECEIPT_SCREEN}' && !/^RECEIPT_OPTIONS_[45]$/.test(screen)) return stepFail('SCREEN', `[orca] xy_touch: unknown screen "${screen}"`);
      if (/^RECEIPT_OPTIONS_[45]$/.test(screen)) warnings.push(`Step ${i + 1} hard-codes ${screen}: devices that show the other receipt layout will be tapped on the wrong map. Use \${RECEIPT_SCREEN}.`);
    }
    if (a.action === 'screenCompare') {
      for (const k of ['x', 'y', 'w', 'h']) if (typeof a.params[k] !== 'number') return stepFail('SCREEN_COMPARE', `params.${k} must be a number (copy Position/Size from GIMP)`);
      if (!str(a.params['expected'])) return stepFail('SCREEN_COMPARE', 'params.expected is empty');
    }
    if (a.store) stored.add(a.store);
    lines.push(`${head} OK`);
  }
  lines.push(`LSTR PASSED (${n}/${n} actions) — ${test.name}`);
  return { ok: true, code: null, lines, test, warnings };
}
