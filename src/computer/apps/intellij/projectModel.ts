/**
 * Project structure helpers (Apps §4.4, §4.9): the Project tree built from repo-relative paths (folders first,
 * case-insensitive, compacted packages inside Java source roots), run configurations, a line diff for the
 * diff viewer, and class lookup for Ctrl+B.
 */

export type NodeRole = 'source' | 'test' | 'resources' | 'package' | null;

export interface TreeNode {
  /** Repo-relative path ('' = project root). For compacted packages: the full folder path. */
  path: string;
  name: string;
  kind: 'dir' | 'file';
  role: NodeRole;
  children: TreeNode[];
}

interface RawDir {
  dirs: Map<string, RawDir>;
  files: string[];
}

const SOURCE_ROOT = /(^|\/)src\/(main|test|androidTest)\/(java|kotlin|groovy)$/;
const RESOURCES_ROOT = /(^|\/)src\/(main|test)\/resources$/;

export function rootRole(path: string): NodeRole {
  const m = SOURCE_ROOT.exec(path);
  if (m) return m[2] === 'main' ? 'source' : 'test';
  if (RESOURCES_ROOT.test(path)) return 'resources';
  return null;
}

const cmp = (a: string, b: string) => a.toLowerCase().localeCompare(b.toLowerCase());

export function buildTree(paths: string[]): TreeNode[] {
  const root: RawDir = { dirs: new Map(), files: [] };
  for (const p of paths) {
    const segs = p.split('/');
    let d = root;
    for (let i = 0; i < segs.length - 1; i++) {
      let next = d.dirs.get(segs[i]);
      if (!next) {
        next = { dirs: new Map(), files: [] };
        d.dirs.set(segs[i], next);
      }
      d = next;
    }
    if (segs[segs.length - 1]) d.files.push(segs[segs.length - 1]);
  }
  const convert = (dir: RawDir, base: string, inSource: boolean): TreeNode[] => {
    const out: TreeNode[] = [];
    for (const name of [...dir.dirs.keys()].sort(cmp)) {
      let path = base ? `${base}/${name}` : name;
      let label = name;
      let d = dir.dirs.get(name)!;
      const role = rootRole(path);
      if (inSource) {
        // Compact middle packages: a package with exactly one sub-package and no files merges with it.
        while (d.files.length === 0 && d.dirs.size === 1) {
          const [only, sub] = [...d.dirs.entries()][0];
          label += `.${only}`;
          path += `/${only}`;
          d = sub;
        }
      }
      out.push({ path, name: label, kind: 'dir', role: role ?? (inSource ? 'package' : null), children: convert(d, path, inSource || role === 'source' || role === 'test') });
    }
    for (const f of [...dir.files].sort(cmp)) out.push({ path: base ? `${base}/${f}` : f, name: f, kind: 'file', role: null, children: [] });
    return out;
  };
  return convert(root, '', false);
}

/** Flatten the visible (expanded) nodes for keyboard navigation. */
export function visibleNodes(nodes: TreeNode[], expanded: Set<string>, depth = 0, out: { node: TreeNode; depth: number }[] = []) {
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.kind === 'dir' && expanded.has(n.path)) visibleNodes(n.children, expanded, depth + 1, out);
  }
  return out;
}

/** Folders to expand so `path` is visible (includes compacted package paths when present in the tree). */
export function ancestorsOf(path: string, nodes: TreeNode[]): string[] {
  const out: string[] = [];
  const walk = (list: TreeNode[]): boolean => {
    for (const n of list) {
      if (n.kind === 'dir' && (path === n.path || path.startsWith(`${n.path}/`))) {
        out.push(n.path);
        walk(n.children);
        return true;
      }
    }
    return false;
  };
  walk(nodes);
  return out;
}

/** Java package of a file path inside a source root (`com.labsim.uia.pageobjects`), or null. */
export function javaPackageOf(path: string): string | null {
  const m = /(?:^|\/)src\/(?:main|test|androidTest)\/java\/(.+)\/[^/]+$/.exec(path);
  return m ? m[1].replace(/\//g, '.') : null;
}

export function sourceRootOf(path: string): string | null {
  const m = /^(.*?(?:^|\/)src\/(?:main|test|androidTest)\/java)(?:\/|$)/.exec(path);
  return m ? m[1] : null;
}

/* ───────────────────────────── Run configurations ───────────────────────────── */

export interface RunConfig {
  name: string;
  repo: 'uia-remote' | 'pigeon';
  testPath: string;
  kind: 'junit' | 'lstr';
}

export function runConfigsFor(repo: string, paths: string[]): RunConfig[] {
  if (repo === 'uia-remote') {
    return paths
      .filter((p) => /\/testactions\/[A-Za-z_$][\w$]*\.java$/.test(p))
      .map((p) => ({ name: p.split('/').pop()!.replace(/\.java$/, ''), repo: 'uia-remote' as const, testPath: p, kind: 'junit' as const }))
      .sort((a, b) => cmp(a.name, b.name));
  }
  if (repo === 'pigeon') {
    return paths
      .filter((p) => /^tests\/.+\.json$/.test(p) && !p.startsWith('tests/_templates/'))
      .map((p) => ({ name: `LSTR: ${p.split('/').pop()}`, repo: 'pigeon' as const, testPath: p, kind: 'lstr' as const }))
      .sort((a, b) => cmp(a.name, b.name));
  }
  return [];
}

/** The run configuration offered by a file's gutter ▶ (line number, 1-based) or null. */
export function gutterRun(repo: string, path: string, text: string, configs: RunConfig[]): { line: number; config: RunConfig } | null {
  const cfg = configs.find((c) => c.testPath === path);
  if (!cfg) return null;
  if (cfg.kind === 'lstr') return { line: 1, config: cfg };
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => new RegExp(`\\bclass\\s+${cfg.name}\\b`).test(l));
  return idx >= 0 ? { line: idx + 1, config: cfg } : null;
}

/** JUnit test method name shown in the Run tree [illus.]: `test` + class name without `Test`. */
export function testMethodName(config: RunConfig): string {
  if (config.kind === 'lstr') return config.testPath.split('/').pop()!.replace(/\.json$/, '');
  return `test${config.name.replace(/Test$/, '')}`;
}

/* ───────────────────────────── Diff ───────────────────────────── */

export type DiffRow =
  | { kind: 'same'; left: number; right: number; text: string }
  | { kind: 'del'; left: number; text: string }
  | { kind: 'add'; right: number; text: string };

/** Line diff (LCS); fine for files of a few hundred lines. */
export function diffLines(a: string, b: string): DiffRow[] {
  const A = a.split('\n');
  const B = b.split('\n');
  const n = A.length;
  const m = B.length;
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && A[i] === B[j]) {
      rows.push({ kind: 'same', left: i + 1, right: j + 1, text: A[i] });
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      rows.push({ kind: 'add', right: j + 1, text: B[j] });
      j++;
    } else {
      rows.push({ kind: 'del', left: i + 1, text: A[i] });
      i++;
    }
  }
  return rows;
}

/** Find a class file by simple name (Ctrl+B / stack-trace links). */
export function findClassFile(paths: string[], simpleName: string): string | null {
  const exact = paths.find((p) => p.endsWith(`/${simpleName}.java`) || p === `${simpleName}.java`);
  return exact ?? null;
}
