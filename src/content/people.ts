/**
 * People tokens. Content strings never spell real names: they write `{{jared}}`, `{{tate}}`, `{{david}}`,
 * `{{morgan}}`, `{{riley}}`, `{{sam}}`, `{{alex}}` and every exported data array is passed through
 * `resolvePeople()` once at module load, which substitutes the display name from team.ts. Renaming (or
 * anonymising) a person in team.ts therefore renames them everywhere.
 */
import { TEAM } from './team';

const TOKEN = /\{\{([a-z][a-z0-9-]*)\}\}/g;

/** Replace `{{key}}` tokens with team display names (unknown keys are left as-is). */
export function personText(text: string): string {
  return text.replace(TOKEN, (whole, key: string) => TEAM[key]?.name ?? whole);
}

/** Deep-copy a JSON-like value, resolving people tokens in every string. */
export function resolvePeople<T>(value: T): T {
  if (typeof value === 'string') return personText(value) as T;
  if (Array.isArray(value)) return value.map((v) => resolvePeople(v)) as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = resolvePeople(v);
    return out as T;
  }
  return value;
}

/** True if a string still contains an unresolved people token. */
export function hasPeopleToken(text: string): boolean {
  TOKEN.lastIndex = 0;
  return TOKEN.test(text);
}
