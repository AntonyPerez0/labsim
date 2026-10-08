/**
 * Jenkinsfile reading (Sim §3.18.2): only the capability lines are interpreted; everything else is
 * display text. `params.NAME` resolves to the build parameter **as typed** (so `flex_3` reaches Orca).
 */

export interface ScriptCaps {
  /** NON_DYNAMIC map from `def capabilities = [...]`, null if absent. */
  nonDynamic: Record<string, string | boolean> | null;
  /** Repo path of `readJSON(file: '…').capabilities`, null if absent. */
  dynamicFile: string | null;
  /** Keys whose value came from `params.DEVICE_TYPE` (raw DEVICE_TYPE param in the request). */
  fromParams: Record<string, string>;
}

export type ScriptParse = { ok: true; caps: ScriptCaps } | { ok: false; line: number; error: string };

const SYNTAX = (line: number): ScriptParse => ({
  ok: false,
  line,
  error: `org.codehaus.groovy.control.MultipleCompilationErrorsException: startup failed: WorkflowScript: ${line}: unexpected token`,
});

/** Split a Groovy map body on top-level commas (quotes respected). Null on unbalanced quotes. */
function splitTop(body: string): string[] | null {
  const out: string[] = [];
  let cur = '';
  let q: string | null = null;
  let depth = 0;
  for (const ch of body) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      q = ch;
      cur += ch;
      continue;
    }
    if (ch === '[' || ch === '(') depth++;
    if (ch === ']' || ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur);
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (q || depth !== 0) return null;
  if (cur.trim()) out.push(cur);
  return out;
}

export function parseScript(script: string, params: Record<string, string>): ScriptParse {
  const lines = script.split('\n');
  const caps: ScriptCaps = { nonDynamic: null, dynamicFile: null, fromParams: {} };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!.replace(/\/\/.*$/, '').trim();
    const ln = i + 1;
    const rj = /^def\s+(capabilities|dynamicCaps)\s*=\s*readJSON\s*\(\s*file\s*:\s*(['"])([^'"]+)\2\s*\)\s*\.\s*capabilities\s*$/.exec(raw);
    if (rj) {
      caps.dynamicFile = rj[3]!;
      continue;
    }
    if (/^def\s+(capabilities|dynamicCaps)\b/.test(raw)) {
      const m = /^def\s+capabilities\s*=\s*\[(.*)\]\s*$/.exec(raw);
      if (!m) return SYNTAX(ln);
      const body = m[1]!.trim();
      const map: Record<string, string | boolean> = {};
      if (body !== ':') {
        const parts = splitTop(body);
        if (!parts) return SYNTAX(ln);
        for (const part of parts) {
          const kv = /^\s*(?:([A-Za-z_]\w*)|'([^']*)'|"([^"]*)")\s*:\s*(.+?)\s*$/.exec(part);
          if (!kv) return SYNTAX(ln);
          const key = kv[1] ?? kv[2] ?? kv[3]!;
          const v = kv[4]!;
          let val: string | boolean;
          let pm: RegExpExecArray | null;
          if ((pm = /^'([^']*)'$/.exec(v)) || (pm = /^"([^"]*)"$/.exec(v))) val = pm[1]!;
          else if (v === 'true' || v === 'false') val = v === 'true';
          else if (/^-?\d+(\.\d+)?$/.test(v)) val = v;
          else if ((pm = /^params\.([A-Za-z_]\w*)$/.exec(v))) {
            val = params[pm[1]!] ?? '';
            caps.fromParams[key] = pm[1]!;
          } else return SYNTAX(ln);
          map[key] = val;
        }
      }
      caps.nonDynamic = map;
    }
  }
  return { ok: true, caps };
}

/** `def tests = [...]` / `def testFile = '…'` helpers. */
export function scriptVar(script: string, name: string): string | null {
  const m = new RegExp(`^\\s*def\\s+${name}\\s*=\\s*(['"])([^'"]*)\\1`, 'm').exec(script);
  return m ? m[2]! : null;
}
