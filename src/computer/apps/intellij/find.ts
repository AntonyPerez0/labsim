/** Find / Find in Files matching (Apps §4.5): match case, whole words, regex. */
import type { FindState } from './ideModel';

export interface Match {
  start: number;
  end: number;
}

export function buildFindRegex(f: Pick<FindState, 'query' | 'matchCase' | 'words' | 'regex'>): RegExp | null {
  if (!f.query) return null;
  let src = f.regex ? f.query : f.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (f.words) src = `\\b${src}\\b`;
  try {
    return new RegExp(src, f.matchCase ? 'g' : 'gi');
  } catch {
    return null;
  }
}

export function findMatches(text: string, f: Pick<FindState, 'query' | 'matchCase' | 'words' | 'regex'>, limit = 5000): Match[] {
  const re = buildFindRegex(f);
  if (!re) return [];
  const out: Match[] = [];
  for (let m = re.exec(text); m && out.length < limit; m = re.exec(text)) {
    if (m[0].length === 0) {
      re.lastIndex++;
      continue;
    }
    out.push({ start: m.index, end: m.index + m[0].length });
  }
  return out;
}

export interface FileHit {
  path: string;
  line: number;
  col: number;
  text: string;
}

export function findInFiles(files: Record<string, string>, f: Pick<FindState, 'query' | 'matchCase' | 'words' | 'regex'>, limit = 300): FileHit[] {
  const re = buildFindRegex(f);
  if (!re) return [];
  const out: FileHit[] = [];
  for (const path of Object.keys(files).sort()) {
    const lines = files[path].split('\n');
    for (let i = 0; i < lines.length && out.length < limit; i++) {
      re.lastIndex = 0;
      const m = re.exec(lines[i]);
      if (m) out.push({ path, line: i + 1, col: m.index + 1, text: lines[i].trim() });
    }
  }
  return out;
}
