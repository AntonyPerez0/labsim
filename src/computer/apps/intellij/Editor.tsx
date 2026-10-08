/**
 * The IDE code editor (Apps §4.5): a transparent `<textarea>` over a highlighted layer, gutter with line numbers,
 * run ▶ and intention bulb, current-line highlight, matched braces, find matches, problem underlines, right
 * margin, breadcrumbs. Editing keys live here; window-level shortcuts bubble to the IDE root.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import { emitAppAction, getWindowManager } from '@/computer/apps';
import {
  backspacePair,
  deleteLines,
  duplicate,
  indentLines,
  lineAt,
  matchBracket,
  moveLines,
  moveStatement,
  outdentLines,
  posToLineCol,
  reformat,
  smartEnter,
  toggleLineComment,
  typeChar,
  type EdState,
} from './editorOps';
import type { Match } from './find';
import { IcBulb, IcBulbRed, IcRun } from './icons';
import type { Buffer, IdeModel } from './ideModel';
import type { Problem } from './inspections';
import { highlight, indentUnit, lineCommentPrefix, stripJavaNoise, tokenAt, type JavaContext, type Lang, type Tok } from './lang';
import type { RunConfig } from './projectModel';

export const LINE_H = 18;

export type EditorCmd =
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
  | 'duplicate'
  | 'deleteLine'
  | 'comment'
  | 'moveLineUp'
  | 'moveLineDown'
  | 'moveStatementUp'
  | 'moveStatementDown'
  | 'reformat';

export interface EditorProps {
  model: IdeModel;
  buffer: Buffer;
  repo: string;
  lang: Lang;
  javaCtx: JavaContext | null;
  problems: Problem[];
  gutterRun: { line: number; config: RunConfig } | null;
  hasIntention: boolean;
  focused: boolean;
  matches: Match[];
  currentMatch: number;
  onRun(cfg: RunConfig): void;
  /** Ctrl+B / Ctrl+click on an identifier. */
  onGotoDeclaration(word: string): void;
  onContextActions(): void;
  /** Debounced "buffer changed" for other panels. */
  onEdited(): void;
}

const Line = memo(
  function Line({ toks }: { toks: Tok[]; sig: string }) {
    return (
      <div className="ij-line">
        {toks.length ? toks.map((t, i) => (t.c ? <span key={i} className={`ij-t-${t.c}`}>{t.t}</span> : t.t)) : '​'}
      </div>
    );
  },
  (a, b) => a.sig === b.sig,
);

function breadcrumbs(text: string, pos: number, lang: Lang): string[] {
  if (lang !== 'java') return [];
  const clean = stripJavaNoise(text.slice(0, pos));
  const stack: string[] = [];
  let header = '';
  for (const ch of clean) {
    if (ch === '{') {
      const cls = /\b(?:class|interface|enum|record)\s+(\w+)[^;{}]*$/.exec(header);
      const fn = /(\w+)\s*\([^;{}]*\)\s*(?:throws[\w\s,.]*)?$/.exec(header.trim());
      stack.push(cls ? cls[1] : fn && !/^(if|for|while|switch|catch|synchronized)$/.test(fn[1]) ? `${fn[1]}()` : '');
      header = '';
    } else if (ch === '}') {
      stack.pop();
      header = '';
    } else if (ch === ';') header = '';
    else header += ch;
  }
  return stack.filter(Boolean);
}

export function Editor(props: EditorProps) {
  const { model, buffer: b, lang, problems, matches, currentMatch, focused } = props;
  const [, force] = useReducer((x: number) => x + 1, 0);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const selSeq = useRef(0);
  const appliedSel = useRef(-1);
  const down = useRef<{ x: number; y: number; ctrl: boolean } | null>(null);
  const unit = indentUnit(lang);
  const readOnly = b.readOnly;

  const lines = useMemo(() => highlight(lang, b.text, props.javaCtx), [lang, b.text, props.javaCtx]);
  const sigs = useMemo(() => lines.map((l) => l.map((t) => `${t.c ?? ''}:${t.t}`).join('\u0001')), [lines]);
  const clean = useMemo(() => (lang === 'java' || lang === 'groovy' ? stripJavaNoise(b.text) : lang === 'json' ? b.text : null), [lang, b.text]);
  const caretPos = b.end;
  const caret = posToLineCol(b.text, caretPos);
  useEffect(() => {
    model.setCaret(caret.line, caret.col);
  });
  const braces = clean && b.start === b.end ? matchBracket(clean, caretPos) : null;

  /* ── programmatic edits ── */
  const apply = (next: EdState | null, kind: string) => {
    if (!next || readOnly) return;
    model.recordEdit(b, next, kind);
    selSeq.current++;
    force();
    props.onEdited();
  };

  // Push our selection into the textarea after programmatic changes.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    const external = ta.value !== b.text;
    if (!external && appliedSel.current === selSeq.current) return;
    appliedSel.current = selSeq.current;
    if (external) ta.value = b.text;
    ta.setSelectionRange(Math.min(b.start, b.text.length), Math.min(b.end, b.text.length));
    ensureCaretVisible();
  });

  // Restore scroll on mount / buffer switch.
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.scrollTop = b.scrollTop;
    ta.scrollLeft = b.scrollLeft;
    syncScroll();
    selSeq.current++;
    force();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b]);

  // Reveal requests (navigation, find, problems, stack-trace links).
  const reveal = model.reveal;
  useLayoutEffect(() => {
    if (!reveal || reveal.path !== b.path) return;
    b.start = reveal.start;
    b.end = reveal.end;
    model.reveal = null;
    selSeq.current++;
    const ta = taRef.current;
    if (ta) {
      const line = posToLineCol(b.text, reveal.start).line;
      ta.scrollTop = Math.max(0, (line - 1) * LINE_H - ta.clientHeight / 3);
      syncScroll();
    }
    force();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal?.seq, b.path]);

  // Focus requests.
  const focusSeq = model.editorFocusSeq;
  const appliedFocus = useRef(-1);
  useEffect(() => {
    const ta = taRef.current;
    if (!ta || !focused || model.dialog) return;
    const requested = appliedFocus.current !== focusSeq;
    appliedFocus.current = focusSeq;
    // Window (re)focus or a closed dialog: only take focus if nothing inside the IDE has it (a click in the tree wins).
    const ae = document.activeElement as HTMLElement | null;
    const root = ta.closest('.ij-root');
    if (!requested && ae && ae !== document.body && root?.contains(ae)) return;
    ta.focus({ preventScroll: true });
  }, [focusSeq, focused, b.path, model.dialog]);

  function syncScroll() {
    const ta = taRef.current;
    if (!ta) return;
    // The wrapper clips but can still be scrolled by the browser (caret reveal); only the textarea scrolls.
    const wrap = ta.parentElement;
    if (wrap && (wrap.scrollTop || wrap.scrollLeft)) wrap.scrollTop = wrap.scrollLeft = 0;
    if (layerRef.current) layerRef.current.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
    if (gutterRef.current) gutterRef.current.style.transform = `translateY(${-ta.scrollTop}px)`;
    b.scrollTop = ta.scrollTop;
    b.scrollLeft = ta.scrollLeft;
  }

  function ensureCaretVisible() {
    const ta = taRef.current;
    if (!ta) return;
    const line = posToLineCol(b.text, b.end).line;
    const top = (line - 1) * LINE_H;
    if (top < ta.scrollTop) ta.scrollTop = top;
    else if (top + LINE_H + 8 > ta.scrollTop + ta.clientHeight) ta.scrollTop = top + LINE_H + 8 - ta.clientHeight;
    syncScroll();
  }

  /** Caret pixel position (below the caret line) relative to the IDE root. */
  function caretAnchor(): { x: number; y: number } | null {
    const ta = taRef.current;
    const root = ta?.closest('.ij-root') as HTMLElement | null;
    if (!ta || !root) return null;
    const probe = document.createElement('span');
    probe.textContent = '0000000000';
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;font:inherit';
    layerRef.current?.appendChild(probe);
    const cw = probe.getBoundingClientRect().width / 10 || 7.8;
    probe.remove();
    const lc = posToLineCol(b.text, b.end);
    const r = ta.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    return { x: r.left - rr.left + 4 + (lc.col - 1) * cw - ta.scrollLeft, y: r.top - rr.top + 4 + lc.line * LINE_H - ta.scrollTop + 2 };
  }

  const readSel = () => {
    const ta = taRef.current;
    if (!ta) return;
    if (ta.selectionStart !== b.start || ta.selectionEnd !== b.end) {
      b.start = ta.selectionStart;
      b.end = ta.selectionEnd;
      force();
    }
  };

  const state = (): EdState => ({ text: b.text, start: b.start, end: b.end });

  const clipboard = () => getWindowManager()?.clipboard;

  /** Editor commands shared by keys and the main menu (Edit / Code menus). */
  const runCmd = (cmd: EditorCmd): boolean => {
    const java = lang === 'java';
    switch (cmd) {
      case 'undo':
      case 'redo':
        if (cmd === 'redo' ? model.redo(b) : model.undo(b)) {
          selSeq.current++;
          force();
          props.onEdited();
        }
        return true;
      case 'copy':
      case 'cut': {
        const cb = clipboard();
        if (!cb) return false;
        let text = b.text.slice(b.start, b.end);
        let cut: EdState | null = null;
        if (!text) {
          const l = lineAt(b.text, b.start);
          text = `${l.text}\n`;
          if (cmd === 'cut') cut = deleteLines(state());
        } else if (cmd === 'cut') cut = { text: b.text.slice(0, b.start) + b.text.slice(b.end), start: b.start, end: b.start };
        cb.write(text, 'intellij');
        if (cut) apply(cut, 'cut');
        return true;
      }
      case 'paste': {
        const text = clipboard()?.read() ?? '';
        if (!text) return false;
        if (readOnly) return true;
        if (b.start === b.end && text.endsWith('\n') && !text.slice(0, -1).includes('\n')) {
          // Whole-line paste (copied without selection) goes above the caret line, like IntelliJ.
          const l = lineAt(b.text, b.start);
          apply({ text: b.text.slice(0, l.start) + text + b.text.slice(l.start), start: b.start + text.length, end: b.start + text.length }, 'paste');
        } else apply({ text: b.text.slice(0, b.start) + text + b.text.slice(b.end), start: b.start + text.length, end: b.start + text.length }, 'paste');
        return true;
      }
      case 'selectAll':
        b.start = 0;
        b.end = b.text.length;
        selSeq.current++;
        force();
        return true;
      case 'duplicate':
        apply(duplicate(state()), 'dup');
        return true;
      case 'deleteLine':
        apply(deleteLines(state()), 'delline');
        return true;
      case 'comment': {
        const prefix = lineCommentPrefix(lang);
        if (prefix) apply(toggleLineComment(state(), prefix), 'comment');
        return true;
      }
      case 'moveLineUp':
      case 'moveLineDown':
        apply(moveLines(state(), cmd === 'moveLineUp' ? -1 : 1), 'move');
        return true;
      case 'moveStatementUp':
      case 'moveStatementDown':
        apply(moveStatement(state(), cmd === 'moveStatementUp' ? -1 : 1, java), 'move');
        return true;
      case 'reformat': {
        if (lang === 'java' || lang === 'groovy' || lang === 'json') {
          const text = reformat(b.text, unit, lang === 'json' ? (t) => t : stripJavaNoise);
          const l = posToLineCol(b.text, b.end);
          const rows = text.split('\n');
          let pos = 0;
          for (let i = 0; i < l.line - 1 && i < rows.length; i++) pos += rows[i].length + 1;
          pos += Math.min(rows[l.line - 1]?.length ?? 0, l.col - 1);
          apply({ text, start: pos, end: pos }, 'reformat');
        }
        return true;
      }
      default:
        return false;
    }
  };
  model.editorCmd = (cmd) => {
    const ta = taRef.current;
    if (ta) {
      b.start = ta.selectionStart;
      b.end = ta.selectionEnd;
    }
    const r = runCmd(cmd);
    ta?.focus({ preventScroll: true });
    return r;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    b.start = ta.selectionStart;
    b.end = ta.selectionEnd;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    const done = () => e.preventDefault();
    if (ctrl && !e.altKey && lower === 'z') return (runCmd(e.shiftKey ? 'redo' : 'undo'), done());
    if (ctrl && e.shiftKey && !e.altKey && lower === 'y') return done();
    // Clipboard (in-game; copy with no selection copies the line).
    if (ctrl && !e.altKey && !e.shiftKey && (lower === 'c' || lower === 'x')) return runCmd(lower === 'c' ? 'copy' : 'cut') ? done() : undefined;
    if (ctrl && !e.altKey && lower === 'v') return runCmd('paste') ? done() : undefined; // empty in-game clipboard → native paste
    if (ctrl && !e.altKey && lower === 'b') {
      const w = tokenAt(lineAt(b.text, b.end).text, b.end - lineAt(b.text, b.end).start);
      if (w) props.onGotoDeclaration(w);
      return done();
    }
    if (e.altKey && !ctrl && k === 'Enter') {
      model.popupAnchor = caretAnchor();
      props.onContextActions();
      return done();
    }
    if (e.key === 'Escape') {
      if (b.start !== b.end) {
        b.start = b.end;
        selSeq.current++;
        force();
        e.stopPropagation();
        return done();
      }
      return;
    }
    if (readOnly) {
      if ((k.length === 1 && !ctrl && !e.altKey) || k === 'Enter' || k === 'Backspace' || k === 'Delete' || k === 'Tab') done();
      return;
    }
    if (ctrl && !e.altKey && !e.shiftKey && lower === 'd') return (runCmd('duplicate'), done());
    if (ctrl && !e.altKey && !e.shiftKey && lower === 'y') return (runCmd('deleteLine'), done());
    if (ctrl && !e.altKey && (k === '/' || e.code === 'Slash' || e.code === 'NumpadDivide')) return (runCmd('comment'), done());
    if (e.altKey && e.shiftKey && !ctrl && (k === 'ArrowUp' || k === 'ArrowDown')) return (runCmd(k === 'ArrowUp' ? 'moveLineUp' : 'moveLineDown'), done());
    if (ctrl && e.shiftKey && !e.altKey && (k === 'ArrowUp' || k === 'ArrowDown')) return (runCmd(k === 'ArrowUp' ? 'moveStatementUp' : 'moveStatementDown'), done());
    if (ctrl && e.altKey && lower === 'l') return (runCmd('reformat'), done());
    if (k === 'Tab' && !ctrl && !e.altKey) {
      apply(e.shiftKey ? outdentLines(state(), unit) : indentLines(state(), unit), 'indent');
      e.stopPropagation();
      return done();
    }
    if (k === 'Enter' && !ctrl && !e.altKey) {
      apply(smartEnter(state(), unit), 'enter');
      return done();
    }
    if (k === 'Backspace' && !ctrl && !e.altKey) {
      const r = backspacePair(state());
      if (r) {
        apply(r, 'type');
        return done();
      }
      return;
    }
    if (k.length === 1 && !ctrl && !e.altKey && !e.metaKey && '([{"\')]}'.includes(k)) {
      const r = typeChar(state(), k);
      if (r) {
        apply(r, 'type');
        return done();
      }
    }
  };

  const onChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    if (readOnly) {
      ta.value = b.text;
      return;
    }
    model.recordEdit(b, { text: ta.value, start: ta.selectionStart, end: ta.selectionEnd }, 'type');
    appliedSel.current = selSeq.current; // the textarea already holds this selection
    force();
    props.onEdited();
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text/plain');
    e.preventDefault();
    if (!text || readOnly) return;
    const ta = e.currentTarget;
    b.start = ta.selectionStart;
    b.end = ta.selectionEnd;
    apply({ text: b.text.slice(0, b.start) + text + b.text.slice(b.end), start: b.start + text.length, end: b.start + text.length }, 'paste');
  };

  const onMouseDown = (e: React.MouseEvent) => {
    down.current = { x: e.clientX, y: e.clientY, ctrl: e.ctrlKey || e.metaKey };
  };

  const onMouseUp = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;
    const d = down.current;
    down.current = null;
    readSel();
    if (!d || e.button !== 0) return;
    if (Math.abs(e.clientX - d.x) > 3 || Math.abs(e.clientY - d.y) > 3 || ta.selectionStart !== ta.selectionEnd || e.detail > 1) return;
    const pos = ta.selectionStart;
    const l = lineAt(b.text, pos);
    const lc = posToLineCol(b.text, pos);
    const token = tokenAt(l.text, pos - l.start);
    model.pushNav(b.path, pos);
    emitAppAction('intellij', 'intellij.editor.clicked', { repo: props.repo, path: b.path, line: lc.line, column: lc.col, lineText: l.text, token });
    if (d.ctrl && token) props.onGotoDeclaration(token);
  };

  /* ── decorations ── */
  const lineCount = lines.length;
  const digits = String(lineCount).length;
  const gutterW = Math.max(2, digits) * 8 + 34;
  const deco: React.ReactNode[] = [];
  const decoAt = (pos: number, len: number, cls: string, key: string, text?: string) => {
    const lc = posToLineCol(b.text, pos);
    deco.push(
      <div key={key} className={cls} style={{ top: (lc.line - 1) * LINE_H, left: `calc(${lc.col - 1}ch + 4px)`, width: `${Math.max(1, len)}ch` }}>
        {text}
      </div>,
    );
  };
  if (braces) {
    decoAt(braces[0], 1, 'ij-deco ij-deco-brace', 'b0');
    decoAt(braces[1], 1, 'ij-deco ij-deco-brace', 'b1');
  }
  matches.slice(0, 2000).forEach((m, i) => decoAt(m.start, m.end - m.start, `ij-deco ${i === currentMatch ? 'ij-deco-cur' : 'ij-deco-find'}`, `f${i}`));
  const textLines = useMemo(() => b.text.split('\n'), [b.text]);
  problems.forEach((p, i) => {
    const lt = textLines[p.line - 1] ?? '';
    let col = p.col;
    let len = p.len;
    if (col > lt.length) {
      col = Math.max(1, lt.length);
      len = 1;
    }
    const starts = b.text.split('\n').slice(0, p.line - 1).reduce((a, l) => a + l.length + 1, 0);
    const seg = (lt.slice(col - 1, col - 1 + len) || ' ').padEnd(len, ' ');
    decoAt(starts + col - 1, len, `ij-deco ij-wave ${p.severity === 'error' ? 'ij-wave-err' : 'ij-wave-warn'}`, `p${i}`, seg);
  });

  const crumbs = breadcrumbs(b.text, b.end, lang);
  const caretProblems = problems.filter((p) => p.line === caret.line);

  return (
    <div className="ij-editor" data-path={b.path}>
      <div className="ij-editor-main">
        <div className="ij-gutter" style={{ width: gutterW }}>
          <div className="ij-gutter-inner" ref={gutterRef} style={{ height: lineCount * LINE_H + 400 }}>
            {lines.map((_, i) => (
              <div key={i} className={`ij-lnum${i + 1 === caret.line ? ' ij-lnum-cur' : ''}`} style={{ top: i * LINE_H }}>
                {i + 1}
              </div>
            ))}
            {props.gutterRun ? (
              <button
                type="button"
                className="ij-gutter-run"
                data-hint="intellij.runButton"
                style={{ top: (props.gutterRun.line - 1) * LINE_H }}
                title={`Run '${props.gutterRun.config.name}'`}
                aria-label={`Run '${props.gutterRun.config.name}'`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => props.onRun(props.gutterRun!.config)}
              >
                <IcRun size={14} />
              </button>
            ) : null}
            {props.hasIntention || caretProblems.some((p) => p.fix) ? (
              <button
                type="button"
                className="ij-gutter-bulb"
                style={{ top: (caret.line - 1) * LINE_H }}
                title="Show Context Actions (Alt+Enter)"
                aria-label="Show Context Actions"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  model.popupAnchor = caretAnchor();
                  props.onContextActions();
                }}
              >
                {caretProblems.some((p) => p.severity === 'error') ? <IcBulbRed size={14} /> : <IcBulb size={14} />}
              </button>
            ) : null}
          </div>
        </div>
        <div className="ij-code-wrap" onScroll={syncScroll}>
          <div className="ij-code-layer" ref={layerRef}>
            <div className="ij-caretline" style={{ top: (caret.line - 1) * LINE_H }} />
            <div className="ij-margin" />
            {deco}
            <div className="ij-code" aria-hidden="true">
              {lines.map((toks, i) => (
                <Line key={i} toks={toks} sig={sigs[i]} />
              ))}
            </div>
          </div>
          <textarea
            ref={taRef}
            className="ij-input"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            wrap="off"
            aria-label={`Editor for ${b.path.split('/').pop()}`}
            aria-readonly={readOnly}
            defaultValue={b.text}
            onChange={onChange}
            onKeyDown={onKeyDown}
            onKeyUp={readSel}
            onSelect={readSel}
            onScroll={syncScroll}
            onPaste={onPaste}
            onMouseDown={onMouseDown}
            onMouseUp={onMouseUp}
          />
        </div>
      </div>
      {crumbs.length ? (
        <div className="ij-crumbs">
          {crumbs.map((c, i) => (
            <span key={i}>
              {i ? <span className="ij-crumb-sep"> › </span> : null}
              {c}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
