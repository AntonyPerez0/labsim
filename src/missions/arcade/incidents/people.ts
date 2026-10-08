/**
 * Resolve `{{jared}}`-style people tokens (names live only in `src/content/team.ts`) across an incident
 * definition: plain strings everywhere, and the output of templated text functions / script-action
 * factories. Conditions, setups and binders are left untouched (they carry no people text).
 */
import { personText } from '@/content';
import type { IncidentDef } from '../../types';

/** Keys whose function values produce display text (Templated). */
const TEXT_FN_KEYS = new Set(['title', 'summary', 'text', 'wrongCallHint', 'endpointHint', 'byTheBook', 'handsOn', 'hints', 'verifyLabel']);
/** Keys whose function values produce ScriptAction lists (resolved deeply). */
const ACTION_FN_KEYS = new Set(['onSpawn', 'jaredFix']);
/** Keys never walked (executable logic / data the runtime interprets). */
const SKIP_KEYS = new Set(['success', 'setup', 'bind', 'truth', 'counters', 'walkthrough', 'marker', 'detect', 'when', 'endpoints']);

function deep(value: unknown): unknown {
  if (typeof value === 'string') return personText(value);
  if (Array.isArray(value)) return value.map(deep);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = deep(v);
    return out;
  }
  return value;
}

function walk(value: unknown, key: string | null): unknown {
  if (key !== null && SKIP_KEYS.has(key)) return value;
  if (typeof value === 'string') return personText(value);
  if (typeof value === 'function') {
    const fn = value as (...a: unknown[]) => unknown;
    if (key !== null && TEXT_FN_KEYS.has(key)) return (...a: unknown[]) => {
      const r = fn(...a);
      return typeof r === 'string' ? personText(r) : r;
    };
    if (key !== null && ACTION_FN_KEYS.has(key)) return (...a: unknown[]) => deep(fn(...a));
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => walk(v, key === 'hints' ? 'hints' : null));
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = walk(v, k);
    return out;
  }
  return value;
}

/** A copy of the incident with every people token resolved. */
export function withPeople(def: IncidentDef): IncidentDef {
  return walk(def, null) as IncidentDef;
}
