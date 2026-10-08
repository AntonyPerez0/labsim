/**
 * GNU-style file and text commands shared by the workstation and Linux remote shells: ls, cd, pwd, cat,
 * head, tail, grep, wc, sort, uniq, echo, touch, mkdir, rm, cp, mv. They act on an `Fs` adapter.
 */
import type { CmdResult, Line } from './session';
import { E, L, fail, ok } from './session';

export interface FsEntry {
  name: string;
  dir: boolean;
  size: number;
}
export interface Fs {
  cwd: string;
  /** Display form of a path for prompts/errors. */
  show(abs: string): string;
  resolve(p: string): string;
  /** File text, 'DIR' for a directory, null when missing. */
  read(abs: string): string | 'DIR' | null;
  list(abs: string): FsEntry[] | null;
  write?(abs: string, text: string, append: boolean): string | null;
  remove?(abs: string, recursive: boolean): string | null;
  setCwd(abs: string): void;
  /** Contents stored on a directory itself (a host's `path/` key, e.g. the Wine prefix marker), else null. */
  dirMarker?(abs: string): string | null;
  /** Owner shown by `ls -l` (default `engineer`). */
  owner?: string;
}

export function sizeOf(text: string): number {
  const m = /^<size:([\d.]+)([KMG])>$/.exec(text);
  if (m) return Math.round(Number(m[1]) * { K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[m[2] as 'K' | 'M' | 'G']);
  if (text.startsWith('img:')) return 48_213 + (text.length * 977) % 90_000;
  return new TextEncoder().encode(text).length;
}
export function human(n: number): string {
  if (n < 1024) return `${n}`;
  const units = ['K', 'M', 'G', 'T'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return v < 10 ? `${v.toFixed(1)}${units[u]}` : `${Math.round(v)}${units[u]}`;
}

/** What `cat` prints for a file (binary images render as noise). */
export function catText(text: string): string[] {
  if (text.startsWith('img:')) return ['�PNG', '\u001a', '\u0000\u0000\u0000\rIHDR\u0000\u0000\u0005\u0000\u0000\u0000\u0002�\b\u0006\u0000\u0000\u0000��'];
  if (/^<size:/.test(text)) return [];
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function flags(argv: string[], known: string): { f: Set<string>; args: string[]; bad: string | null; n?: number } {
  const f = new Set<string>();
  const args: string[] = [];
  let bad: string | null = null;
  let n: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === '-n' && known.includes('N') && /^\d+$/.test(argv[i + 1] ?? '')) {
      n = Number(argv[++i]);
      continue;
    }
    if (/^-\d+$/.test(a) && known.includes('N')) {
      n = Number(a.slice(1));
      continue;
    }
    if (a.startsWith('--')) {
      f.add(a);
      continue;
    }
    if (a.startsWith('-') && a.length > 1) {
      for (const ch of a.slice(1)) {
        if (!known.includes(ch)) bad ??= ch;
        f.add(ch);
      }
      continue;
    }
    args.push(a);
  }
  return { f, args, bad, ...(n !== undefined ? { n } : {}) };
}

type T = (fs: Fs, argv: string[], stdin: string[] | null, prog: string) => CmdResult;

const inputs = (fs: Fs, files: string[], stdin: string[] | null, prog: string): { name: string; lines: string[] }[] | CmdResult => {
  if (!files.length) return [{ name: '(standard input)', lines: stdin ?? [] }];
  const out: { name: string; lines: string[] }[] = [];
  const errs: Line[] = [];
  for (const f of files) {
    const abs = fs.resolve(f);
    const t = fs.read(abs);
    if (t === null) errs.push(E(`${prog}: ${f}: No such file or directory`));
    else if (t === 'DIR') errs.push(E(`${prog}: ${f}: Is a directory`));
    else out.push({ name: f, lines: catText(t) });
  }
  if (errs.length && !out.length) return fail(1, ...errs);
  return out;
};

export const TEXT: Record<string, T> = {
  pwd(fs) {
    return ok(L(fs.cwd));
  },
  cd(fs, argv) {
    const target = argv[1] ?? '~';
    const abs = fs.resolve(target);
    const t = fs.read(abs);
    if (t === null) return fail(1, E(`bash: cd: ${target}: No such file or directory`));
    if (t !== 'DIR') return fail(1, E(`bash: cd: ${target}: Not a directory`));
    fs.setCwd(abs);
    return ok();
  },
  ls(fs, argv) {
    const { f, args, bad } = flags(argv.slice(1), 'lahR1tF');
    if (bad) return fail(2, E(`ls: invalid option -- '${bad}'`), E("Try 'ls --help' for more information."));
    const targets = args.length ? args : ['.'];
    const out: Line[] = [];
    let code = 0;
    for (const t of targets) {
      const abs = fs.resolve(t);
      const r = fs.read(abs);
      if (r === null) {
        out.push(E(`ls: cannot access '${t}': No such file or directory`));
        code = 2;
        continue;
      }
      let entries: FsEntry[];
      if (r !== 'DIR') entries = [{ name: t, dir: false, size: sizeOf(r) }];
      else entries = fs.list(abs) ?? [];
      if (!f.has('a')) entries = entries.filter((e) => !e.name.startsWith('.'));
      else entries = [{ name: '.', dir: true, size: 4096 }, { name: '..', dir: true, size: 4096 }, ...entries];
      if (targets.length > 1 && r === 'DIR') out.push(L(`${t}:`));
      if (f.has('l')) {
        out.push(L(`total ${Math.max(0, entries.reduce((s, e) => s + Math.ceil(e.size / 4096) * 4, 0))}`));
        for (const e of entries) {
          const size = f.has('h') ? human(e.size) : String(e.size);
          out.push(L(`${e.dir ? 'drwxr-xr-x' : '-rw-r--r--'} 1 ${fs.owner ?? 'engineer'} ${fs.owner ?? 'engineer'} ${size.padStart(6)} Oct  5 09:00 ${e.name}${e.dir && f.has('F') ? '/' : ''}`));
        }
      } else if (entries.length) {
        const names = entries.map((e) => e.name);
        if (f.has('1')) out.push(...names.map((nm) => L(nm)));
        else out.push(L(names.join('  ')));
      }
    }
    return { lines: out, code };
  },
  cat(fs, argv, stdin, prog) {
    const { args } = flags(argv.slice(1), 'nAvE');
    const ins = inputs(fs, args, stdin, prog);
    if (!Array.isArray(ins)) return ins;
    return ok(...ins.flatMap((i) => i.lines.map((l) => L(l))));
  },
  head(fs, argv, stdin, prog) {
    const { args, n } = flags(argv.slice(1), 'Nnq');
    const ins = inputs(fs, args, stdin, prog);
    if (!Array.isArray(ins)) return ins;
    const k = n ?? 10;
    return ok(...ins.flatMap((i) => i.lines.slice(0, k).map((l) => L(l))));
  },
  tail(fs, argv, stdin, prog) {
    const { args, n } = flags(argv.slice(1), 'Nnfq');
    const ins = inputs(fs, args, stdin, prog);
    if (!Array.isArray(ins)) return ins;
    const k = n ?? 10;
    return ok(...ins.flatMap((i) => i.lines.slice(Math.max(0, i.lines.length - k)).map((l) => L(l))));
  },
  grep(fs, argv, stdin) {
    const { f, args, bad } = flags(argv.slice(1), 'ocinvErlhHw');
    if (bad) return fail(2, E(`grep: invalid option -- '${bad}'`), E("Usage: grep [OPTION]... PATTERNS [FILE]..."));
    if (!args.length) return fail(2, E('Usage: grep [OPTION]... PATTERNS [FILE]...'), E("Try 'grep --help' for more information."));
    const pat = args[0]!;
    let src = f.has('E') ? pat : pat.replace(/\\([|+?(){}])/g, '\u0000$1').replace(/[|+?(){}]/g, '\\$&').replace(/\u0000(.)/g, '$1');
    if (f.has('w')) src = `\\b(?:${src})\\b`;
    let re: RegExp;
    try {
      re = new RegExp(src, f.has('i') ? 'gi' : 'g');
    } catch {
      return fail(2, E('grep: Unmatched [, [^, [:, [., or [='));
    }
    let files = args.slice(1);
    if (f.has('r') && files.length) {
      const all: string[] = [];
      const walk = (abs: string, shown: string): void => {
        const r = fs.read(abs);
        if (r === 'DIR') for (const e of fs.list(abs) ?? []) walk(`${abs === '/' ? '' : abs}/${e.name}`, `${shown}/${e.name}`);
        else if (r !== null) all.push(shown);
      };
      for (const x of files) walk(fs.resolve(x), x.replace(/\/$/, ''));
      files = all;
    }
    const ins = inputs(fs, files, stdin, 'grep');
    if (!Array.isArray(ins)) return ins;
    const multi = ins.length > 1 && !f.has('h');
    const out: Line[] = [];
    let total = 0;
    for (const i of ins) {
      let count = 0;
      i.lines.forEach((line, idx) => {
        re.lastIndex = 0;
        const hit = re.test(line);
        if (hit === f.has('v')) return;
        count++;
        if (f.has('c') || f.has('l')) return;
        const pre = `${multi ? `${i.name}:` : ''}${f.has('n') ? `${idx + 1}:` : ''}`;
        if (f.has('o') && !f.has('v')) {
          re.lastIndex = 0;
          let m: RegExpExecArray | null;
          while ((m = re.exec(line))) {
            if (!m[0]) {
              re.lastIndex++;
              continue;
            }
            out.push(L(`${pre}${m[0]}`));
          }
        } else out.push(L(`${pre}${line}`));
      });
      total += count;
      if (f.has('c')) out.push(L(`${multi ? `${i.name}:` : ''}${count}`));
      if (f.has('l') && count) out.push(L(i.name));
    }
    return { lines: out, code: total ? 0 : 1 };
  },
  wc(fs, argv, stdin) {
    const { f, args } = flags(argv.slice(1), 'lwc');
    const ins = inputs(fs, args, stdin, 'wc');
    if (!Array.isArray(ins)) return ins;
    return ok(
      ...ins.map((i) => {
        const l = i.lines.length;
        const w = i.lines.join(' ').split(/\s+/).filter(Boolean).length;
        const c = i.lines.reduce((s, x) => s + x.length + 1, 0);
        const parts = f.size ? [f.has('l') ? l : null, f.has('w') ? w : null, f.has('c') ? c : null].filter((x) => x !== null) : [l, w, c];
        return L(`${parts.join(' ')}${args.length ? ` ${i.name}` : ''}`);
      }),
    );
  },
  sort(fs, argv, stdin) {
    const { f, args } = flags(argv.slice(1), 'rnu');
    const ins = inputs(fs, args, stdin, 'sort');
    if (!Array.isArray(ins)) return ins;
    let lines = ins.flatMap((i) => i.lines);
    lines = [...lines].sort(f.has('n') ? (a, b) => parseFloat(a) - parseFloat(b) : (a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (f.has('r')) lines.reverse();
    if (f.has('u')) lines = lines.filter((l, i) => i === 0 || l !== lines[i - 1]);
    return ok(...lines.map((l) => L(l)));
  },
  uniq(fs, argv, stdin) {
    const { f, args } = flags(argv.slice(1), 'c');
    const ins = inputs(fs, args, stdin, 'uniq');
    if (!Array.isArray(ins)) return ins;
    const lines = ins.flatMap((i) => i.lines);
    const out: Line[] = [];
    for (let i = 0; i < lines.length; ) {
      let j = i;
      while (j < lines.length && lines[j] === lines[i]) j++;
      out.push(L(f.has('c') ? `${String(j - i).padStart(7)} ${lines[i]}` : lines[i]!));
      i = j;
    }
    return ok(...out);
  },
  echo(_fs, argv) {
    const args = argv.slice(1);
    const nl = args[0] === '-n' ? args.slice(1) : args;
    return ok(L(nl.join(' ')));
  },
  touch(fs, argv) {
    for (const a of argv.slice(1)) {
      const abs = fs.resolve(a);
      if (fs.read(abs) === null) {
        const e = fs.write?.(abs, '', false);
        if (e) return fail(1, E(`touch: cannot touch '${a}': ${e}`));
      }
    }
    return ok();
  },
  mkdir(fs, argv) {
    for (const a of argv.slice(1).filter((x) => !x.startsWith('-'))) {
      const abs = fs.resolve(a);
      if (fs.read(abs) !== null && !argv.includes('-p')) return fail(1, E(`mkdir: cannot create directory ‘${a}’: File exists`));
      fs.write?.(`${abs}/.keep`, '', false);
    }
    return ok();
  },
  rm(fs, argv) {
    const { f, args } = flags(argv.slice(1), 'rfRv');
    if (!args.length) return fail(1, E('rm: missing operand'), E("Try 'rm --help' for more information."));
    for (const a of args) {
      const abs = fs.resolve(a);
      const t = fs.read(abs);
      if (t === null) {
        if (f.has('f')) continue;
        return fail(1, E(`rm: cannot remove '${a}': No such file or directory`));
      }
      if (t === 'DIR' && !f.has('r') && !f.has('R')) return fail(1, E(`rm: cannot remove '${a}': Is a directory`));
      const e = fs.remove?.(abs, true);
      if (e) return fail(1, E(`rm: cannot remove '${a}': ${e}`));
    }
    return ok();
  },
  cp(fs, argv) {
    const { args } = flags(argv.slice(1), 'raf');
    if (args.length < 2) return fail(1, E('cp: missing destination file operand'));
    const dst = fs.resolve(args[args.length - 1]!);
    for (const a of args.slice(0, -1)) {
      const abs = fs.resolve(a);
      const t = fs.read(abs);
      if (t === null) return fail(1, E(`cp: cannot stat '${a}': No such file or directory`));
      const copyTree = (from: string, to: string): void => {
        const x = fs.read(from);
        if (x === 'DIR') {
          // The directory itself first (its stored marker, e.g. a Wine prefix's state), then its entries.
          const marker = fs.dirMarker?.(from) ?? null;
          if (marker !== null) fs.write?.(`${to}/`, marker, false);
          for (const e of fs.list(from) ?? []) copyTree(`${from}/${e.name}`, `${to}/${e.name}`);
        } else if (x !== null) fs.write?.(to, x, false);
      };
      const destIsDir = fs.read(dst) === 'DIR';
      copyTree(abs, destIsDir ? `${dst}/${abs.slice(abs.lastIndexOf('/') + 1)}` : dst);
    }
    return ok();
  },
};
