/**
 * The VS Code text editor: a transparent <textarea> over a syntax-coloured <pre> (JSON tokens, bracket-pair
 * colours, `${VAR}` tint), line numbers, current-line highlight, red/yellow squiggles with hover messages and
 * the editing keys Parrot work relies on (Shift+Alt+↓ duplicate line, Alt+↑/↓ move line, Ctrl+Shift+K delete
 * line, Tab indent, auto-indent, auto-closing brackets/quotes, Shift+Alt+F format, Ctrl+F find).
 * Programmatic edits go through `execCommand('insertText')` so the browser's own undo stack keeps working.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { emitAppAction, getWindowManager } from '@/computer/apps';
import { formatDocument, saveBuffer } from './actions';
import { offsetToLineCol, stringTokenAt, tokenizeLine, type Diagnostic, type Span } from './jsonLang';
import type { Buffer, VsModel } from './model';

const LH = 19;
/** Text of the last whole-line copy (VS Code pastes it above the cursor line when nothing is selected). */
let lineClip: string | null = null;

function writeClipboard(text: string): void {
  try {
    getWindowManager()?.clipboard.write(text, 'vscode');
  } catch {
    /* desktop not mounted */
  }
  try {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
  } catch {
    /* no permission */
  }
}
const PAD_LEFT = 4;
const CLOSERS: Record<string, string> = { '{': '}', '[': ']', '"': '"' };

interface Props {
  model: VsModel;
  buffer: Buffer;
  repoLabel: string;
  diagnostics: Diagnostic[];
  focused: boolean;
}

function lineStart(text: string, pos: number): number {
  return text.lastIndexOf('\n', pos - 1) + 1;
}
function lineEnd(text: string, pos: number): number {
  const i = text.indexOf('\n', pos);
  return i < 0 ? text.length : i;
}

/** Replace [from, to) with `text` keeping native undo; falls back to a direct value write. */
function replaceRange(ta: HTMLTextAreaElement, from: number, to: number, text: string, selStart?: number, selEnd?: number): void {
  ta.focus({ preventScroll: true });
  ta.setSelectionRange(from, to);
  let ok = false;
  try {
    ok = document.execCommand('insertText', false, text);
  } catch {
    ok = false;
  }
  if (!ok) {
    ta.setRangeText(text, from, to, 'end');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (selStart !== undefined) ta.setSelectionRange(selStart, selEnd ?? selStart);
}

function HighlightedLine({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((s, i) => (
        <span key={i} className={s.kind === 'bracket' ? `vsc-tk-br${s.depth}` : `vsc-tk-${s.kind}`}>
          {s.text}
        </span>
      ))}
    </>
  );
}

export function Editor({ model, buffer: b, repoLabel, diagnostics, focused }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [charW, setCharW] = useState(7.7);
  const [hover, setHover] = useState<{ x: number; y: number; d: Diagnostic } | null>(null);
  const [find, setFind] = useState<{ open: boolean; q: string; idx: number }>({ open: false, q: '', idx: 0 });
  const findRef = useRef<HTMLInputElement>(null);

  const lines = useMemo(() => b.text.split('\n'), [b.text]);
  const highlighted = useMemo(() => {
    let depth = 0;
    return lines.map((l) => {
      const r = tokenizeLine(l, depth);
      depth = r.depth;
      return r.spans;
    });
  }, [lines]);
  const cur = offsetToLineCol(b.text, b.selStart);
  const width = Math.max(...lines.map((l) => l.length), 40) * charW + 80;

  useLayoutEffect(() => {
    const w = measureRef.current?.getBoundingClientRect().width;
    if (w && w > 0) setCharW(w / 20);
  }, []);

  // Restore scroll / selection when the tab becomes active.
  useLayoutEffect(() => {
    const ta = taRef.current;
    const sc = scrollRef.current;
    if (sc) sc.scrollTop = b.scrollTop;
    if (ta) ta.setSelectionRange(Math.min(b.selStart, b.text.length), Math.min(b.selEnd, b.text.length));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.id]);

  // Focus requests (open file, palette closed …).
  useEffect(() => {
    if (focused && !model.palette) taRef.current?.focus({ preventScroll: true });
  }, [model.focusSeq, focused, model.palette]);

  // Reveal requests (go to line, problem click, find).
  useEffect(() => {
    const ta = taRef.current;
    const sc = scrollRef.current;
    if (!ta || !sc || !model.revealSeq) return;
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(b.selStart, b.selEnd);
    const line = offsetToLineCol(b.text, b.selStart).line;
    const top = (line - 1) * LH;
    if (top < sc.scrollTop || top > sc.scrollTop + sc.clientHeight - LH * 2) sc.scrollTop = Math.max(0, top - sc.clientHeight / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model.revealSeq]);

  const sync = (ta: HTMLTextAreaElement) => {
    if (b.selStart === ta.selectionStart && b.selEnd === ta.selectionEnd) return;
    b.selStart = ta.selectionStart;
    b.selEnd = ta.selectionEnd;
    model.changed();
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    b.text = e.target.value;
    b.selStart = e.target.selectionStart;
    b.selEnd = e.target.selectionEnd;
    model.changed();
  };

  const selectedLines = (ta: HTMLTextAreaElement) => {
    const t = ta.value;
    const s = lineStart(t, ta.selectionStart);
    const endPos = ta.selectionEnd > ta.selectionStart && t[ta.selectionEnd - 1] === '\n' ? ta.selectionEnd - 1 : ta.selectionEnd;
    const e = lineEnd(t, endPos);
    return { s, e, block: t.slice(s, e) };
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const t = ta.value;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key;
    if (mod && !e.shiftKey && (k === 's' || k === 'S')) {
      e.preventDefault();
      saveBuffer(model, b);
      return;
    }
    // Ctrl+C / Ctrl+X with no selection copy / cut the whole line (VS Code default).
    if (mod && !e.shiftKey && !e.altKey && (k === 'c' || k === 'C' || k === 'x' || k === 'X') && ta.selectionStart === ta.selectionEnd) {
      e.preventDefault();
      const s0 = lineStart(t, ta.selectionStart);
      const e0 = lineEnd(t, ta.selectionStart);
      const line = `${t.slice(s0, e0)}\n`;
      lineClip = line;
      writeClipboard(line);
      if (k === 'x' || k === 'X') replaceRange(ta, s0, Math.min(t.length, e0 + 1), '', s0);
      return;
    }
    if (mod && !e.shiftKey && (k === 'f' || k === 'F')) {
      e.preventDefault();
      const sel = t.slice(ta.selectionStart, ta.selectionEnd);
      setFind((f) => ({ open: true, q: sel && !sel.includes('\n') ? sel : f.q, idx: 0 }));
      setTimeout(() => findRef.current?.select(), 0);
      return;
    }
    if (e.shiftKey && e.altKey && (k === 'f' || k === 'F' || e.code === 'KeyF')) {
      e.preventDefault();
      formatDocument(model);
      return;
    }
    if (k === 'Escape' && find.open) {
      e.preventDefault();
      setFind((f) => ({ ...f, open: false }));
      return;
    }
    // Duplicate line(s): Shift+Alt+↓ / ↑
    if (e.shiftKey && e.altKey && (k === 'ArrowDown' || k === 'ArrowUp')) {
      e.preventDefault();
      const { s, e: en, block } = selectedLines(ta);
      const off = ta.selectionStart - s;
      const len = ta.selectionEnd - ta.selectionStart;
      if (k === 'ArrowDown') replaceRange(ta, en, en, `\n${block}`, en + 1 + off, en + 1 + off + len);
      else replaceRange(ta, s, s, `${block}\n`, s + off, s + off + len);
      return;
    }
    // Move line(s): Alt+↑ / ↓
    if (e.altKey && !e.shiftKey && (k === 'ArrowDown' || k === 'ArrowUp')) {
      e.preventDefault();
      const { s, e: en, block } = selectedLines(ta);
      const off = ta.selectionStart - s;
      const len = ta.selectionEnd - ta.selectionStart;
      if (k === 'ArrowUp' && s > 0) {
        const ps = lineStart(t, s - 1);
        const prev = t.slice(ps, s - 1);
        replaceRange(ta, ps, en, `${block}\n${prev}`, ps + off, ps + off + len);
      } else if (k === 'ArrowDown' && en < t.length) {
        const ne = lineEnd(t, en + 1);
        const next = t.slice(en + 1, ne);
        const ns = s + next.length + 1;
        replaceRange(ta, s, ne, `${next}\n${block}`, ns + off, ns + off + len);
      }
      return;
    }
    // Delete line: Ctrl+Shift+K
    if (mod && e.shiftKey && (k === 'k' || k === 'K')) {
      e.preventDefault();
      const { s, e: en } = selectedLines(ta);
      const to = en < t.length ? en + 1 : en;
      const from = en >= t.length && s > 0 ? s - 1 : s;
      replaceRange(ta, from, to, '', from, from);
      return;
    }
    if (k === 'Tab' && !mod && !e.altKey) {
      e.preventDefault();
      if (ta.selectionStart === ta.selectionEnd && !e.shiftKey) {
        replaceRange(ta, ta.selectionStart, ta.selectionEnd, '  ');
        return;
      }
      const { s, e: en, block } = selectedLines(ta);
      const ls = block.split('\n');
      const out = e.shiftKey ? ls.map((l) => l.replace(/^ {1,2}/, '')) : ls.map((l) => `  ${l}`);
      const next = out.join('\n');
      replaceRange(ta, s, en, next, s, s + next.length);
      return;
    }
    if (k === 'Enter' && !mod && !e.altKey) {
      e.preventDefault();
      const pos = ta.selectionStart;
      const ls = lineStart(t, pos);
      const indent = /^[ \t]*/.exec(t.slice(ls, pos))![0];
      const before = t.slice(ls, pos).trimEnd().slice(-1);
      const after = t[ta.selectionEnd];
      if ((before === '{' && after === '}') || (before === '[' && after === ']')) {
        replaceRange(ta, pos, ta.selectionEnd, `\n${indent}  \n${indent}`, pos + indent.length + 3);
      } else {
        const extra = before === '{' || before === '[' ? '  ' : '';
        replaceRange(ta, pos, ta.selectionEnd, `\n${indent}${extra}`);
      }
      return;
    }
    // Auto-close / over-type brackets and quotes.
    if (!mod && !e.altKey && k.length === 1) {
      const pos = ta.selectionStart;
      const next = t[ta.selectionEnd] ?? '';
      if ((k === '}' || k === ']' || k === '"') && ta.selectionStart === ta.selectionEnd && next === k) {
        const prev = t[pos - 1] ?? '';
        if (k !== '"' || prev !== '\\') {
          e.preventDefault();
          ta.setSelectionRange(pos + 1, pos + 1);
          sync(ta);
          return;
        }
      }
      if (CLOSERS[k] && ta.selectionStart === ta.selectionEnd && (next === '' || /[\s,}\]:]/.test(next))) {
        const prev = t[pos - 1] ?? '';
        if (k !== '"' || !/[\w"]/.test(prev)) {
          e.preventDefault();
          replaceRange(ta, pos, pos, `${k}${CLOSERS[k]}`, pos + 1);
          return;
        }
      }
    }
    if (k === 'Backspace' && !mod && ta.selectionStart === ta.selectionEnd) {
      const pos = ta.selectionStart;
      const pair = t.slice(pos - 1, pos + 1);
      if (pair === '{}' || pair === '[]' || pair === '""') {
        e.preventDefault();
        replaceRange(ta, pos - 1, pos + 1, '', pos - 1);
      }
    }
  };

  const onCopy = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel) {
      lineClip = null;
      try {
        getWindowManager()?.clipboard.write(sel, 'vscode');
      } catch {
        /* ignore */
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    e.preventDefault();
    const ta = e.currentTarget;
    let text = e.clipboardData.getData('text/plain');
    if (!text) {
      try {
        text = getWindowManager()?.clipboard.read() ?? '';
      } catch {
        text = '';
      }
    }
    if (!text) return;
    text = text.replace(/\r\n/g, '\n');
    if (lineClip !== null && text === lineClip && ta.selectionStart === ta.selectionEnd) {
      const s0 = lineStart(ta.value, ta.selectionStart);
      replaceRange(ta, s0, s0, text, ta.selectionStart + text.length);
      return;
    }
    replaceRange(ta, ta.selectionStart, ta.selectionEnd, text);
  };

  const onClick = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    sync(ta);
    const { line, col } = offsetToLineCol(ta.value, ta.selectionStart);
    const lineText = lines[line - 1] ?? '';
    emitAppAction('vscode', 'vscode.editor.clicked', { repo: repoLabel, path: b.path, line, column: col, lineText, token: stringTokenAt(lineText, col - 1) });
  };

  const onMouseMove = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    if (!diagnostics.length) return;
    const r = e.currentTarget.getBoundingClientRect();
    const line = Math.floor((e.clientY - r.top) / LH);
    const col = Math.floor((e.clientX - r.left - PAD_LEFT) / charW);
    let off = 0;
    for (let i = 0; i < line && i < lines.length; i++) off += lines[i]!.length + 1;
    const pos = off + col;
    const d = diagnostics.find((x) => pos >= x.from && pos < Math.max(x.to, x.from + 1) && line < lines.length && col <= (lines[line]?.length ?? 0));
    if (d) setHover({ x: e.clientX - r.left, y: (line + 1) * LH + 2, d });
    else if (hover) setHover(null);
  };

  // Find: occurrences of the query.
  const matches = useMemo(() => {
    if (!find.open || !find.q) return [] as number[];
    const out: number[] = [];
    const q = find.q.toLowerCase();
    const t = b.text.toLowerCase();
    for (let i = t.indexOf(q); i >= 0 && out.length < 999; i = t.indexOf(q, i + Math.max(1, q.length))) out.push(i);
    return out;
  }, [find.open, find.q, b.text]);

  const gotoMatch = (dir: 1 | -1) => {
    if (!matches.length) return;
    const after = matches.findIndex((m) => m >= b.selEnd);
    let idx = dir === 1 ? (after < 0 ? 0 : after) : (matches.findIndex((m) => m >= b.selStart) - 1 + matches.length) % matches.length;
    if (idx < 0) idx = matches.length - 1;
    const at = matches[idx]!;
    b.selStart = at;
    b.selEnd = at + find.q.length;
    setFind((f) => ({ ...f, idx }));
    model.revealSeq++;
    model.changed();
    setTimeout(() => findRef.current?.focus(), 0);
  };

  // Squiggle boxes (one per line segment).
  const squiggles = useMemo(() => {
    const out: { top: number; left: number; w: number; sev: string; key: string }[] = [];
    for (const d of diagnostics) {
      const a = offsetToLineCol(b.text, d.from);
      const z = offsetToLineCol(b.text, Math.max(d.to, d.from + 1));
      const lineLen = lines[a.line - 1]?.length ?? 0;
      const endCol = z.line === a.line ? z.col : lineLen + 1;
      const startCol = a.col > lineLen ? Math.max(1, lineLen) : a.col;
      out.push({ top: a.line * LH - 4, left: PAD_LEFT + (startCol - 1) * charW, w: Math.max(charW, (endCol - startCol) * charW), sev: d.severity, key: `${d.from}-${d.message}` });
    }
    return out;
  }, [diagnostics, b.text, lines, charW]);

  return (
    <div className="vsc-ed">
      <span ref={measureRef} className="vsc-ed__measure" aria-hidden="true">
        MMMMMMMMMMMMMMMMMMMM
      </span>
      {find.open ? (
        <div className="vsc-find">
          <input
            ref={findRef}
            value={find.q}
            placeholder="Find"
            onChange={(e) => setFind({ open: true, q: e.target.value, idx: 0 })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                gotoMatch(e.shiftKey ? -1 : 1);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setFind((f) => ({ ...f, open: false }));
                taRef.current?.focus();
              }
            }}
          />
          <span className="vsc-find__count">{find.q ? (matches.length ? `${Math.min(find.idx + 1, matches.length)} of ${matches.length}` : 'No results') : ''}</span>
          <button type="button" title="Previous Match (Shift+Enter)" onClick={() => gotoMatch(-1)}>
            ↑
          </button>
          <button type="button" title="Next Match (Enter)" onClick={() => gotoMatch(1)}>
            ↓
          </button>
          <button type="button" title="Close (Escape)" onClick={() => setFind((f) => ({ ...f, open: false }))}>
            ✕
          </button>
        </div>
      ) : null}
      <div
        className="vsc-ed__scroll"
        ref={scrollRef}
        onScroll={(e) => {
          b.scrollTop = e.currentTarget.scrollTop;
          if (hover) setHover(null);
        }}
      >
        <div className="vsc-ed__gutter" style={{ height: lines.length * LH + 200 }}>
          {lines.map((_, i) => (
            <div key={i} className={`vsc-ed__ln${i + 1 === cur.line ? ' is-cur' : ''}`}>
              {i + 1}
            </div>
          ))}
        </div>
        <div className="vsc-ed__code" style={{ height: lines.length * LH + 200, width }}>
          <div className="vsc-ed__curline" style={{ top: (cur.line - 1) * LH }} />
          <pre className="vsc-ed__hl" aria-hidden="true">
            {highlighted.map((spans, i) => (
              <div key={i} className="vsc-ed__line">
                <HighlightedLine spans={spans} />
                {'​'}
              </div>
            ))}
          </pre>
          {squiggles.map((s) => (
            <div key={s.key} className={`vsc-squiggle vsc-squiggle--${s.sev}`} style={{ top: s.top, left: s.left, width: s.w }} />
          ))}
          <textarea
            ref={taRef}
            className="vsc-ed__ta"
            value={b.text}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
            data-hint={`vscode.editor:${b.path}`}
            aria-label={`${b.path} — editor`}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onKeyUp={(e) => sync(e.currentTarget)}
            onSelect={(e) => sync(e.currentTarget)}
            onClick={onClick}
            onCopy={onCopy}
            onCut={onCopy}
            onPaste={onPaste}
            onMouseMove={onMouseMove}
            onMouseLeave={() => setHover(null)}
            style={{ height: lines.length * LH + 200 }}
          />
          {hover ? (
            <div className="vsc-hover" style={{ left: Math.max(0, hover.x - 20), top: hover.y }}>
              <span className={`vsc-hover__sev vsc-hover__sev--${hover.d.severity}`}>{hover.d.severity === 'error' ? '⊗' : '⚠'}</span> {hover.d.message} <span className="vsc-dim">json({hover.d.code})</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
