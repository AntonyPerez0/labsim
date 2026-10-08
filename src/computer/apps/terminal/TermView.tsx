/**
 * One terminal tab's view (Apps §5.2): scrollback, prompt + input line with a block cursor, reverse-i-search,
 * streaming, selection/copy/paste, scrollback navigation and the nano editor.
 */
import { memo, type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useGame } from '@/core/store';
import { resolveUrl, type WindowManagerApi } from '@/computer/apps';
import { NanoView } from './NanoView';
import { parsePrompt } from './prompt';
import type { TermLine, TermSession } from './session';

export interface TermViewProps {
  session: TermSession;
  embedded: boolean;
  focused: boolean;
  wm?: WindowManagerApi;
  /** Window-level shortcuts (tabs) — return true when handled. */
  onWindowKey?: (e: React.KeyboardEvent) => boolean;
}

function PromptText({ prompt }: { prompt: string }) {
  const p = parsePrompt(prompt);
  return (
    <>
      {p.segments.map((s, i) => (
        <span key={i} className={s.kind === 'userhost' ? 'term-p-userhost' : s.kind === 'path' ? 'term-p-path' : undefined}>
          {s.text}
        </span>
      ))}
    </>
  );
}

const Line = memo(function Line({ line }: { line: TermLine }) {
  if (line.kind === 'prompt') {
    return (
      <div className="term-line">
        <PromptText prompt={line.prompt ?? ''} />
        {line.text}
      </div>
    );
  }
  return <div className={`term-line${line.kind === 'out' ? '' : ` term-k-${line.kind}`}`}>{line.text ? linkify(line.text) : '​'}</div>;
});

const URL_RE = /https?:\/\/[^\s'"<>]+/g;

/** URLs in output are Ctrl+click links, like Windows Terminal (e.g. git push's "Create a pull request" URL). */
function linkify(text: string): ReactNode {
  if (!text.includes('://')) return text;
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:)\]]+$/, '');
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    out.push(
      <span key={at} className="term-link" data-url={url} title="Ctrl+click to follow link">
        {url}
      </span>,
    );
    last = at + url.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function readClipboard(wm?: WindowManagerApi): string {
  try {
    return wm?.clipboard.read() ?? '';
  } catch {
    return '';
  }
}

function isKeyboardLocked(): boolean {
  return typeof document !== 'undefined' && !!document.fullscreenElement && !!(navigator as Navigator & { keyboard?: unknown }).keyboard;
}

export function TermView({ session, embedded, focused, wm, onWindowKey }: TermViewProps) {
  const version = useSyncExternalStore(session.subscribe, session.getVersion, session.getVersion);
  const tabCompletion = useGame((s) => s.session.computer?.tabCompletion ?? true);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  const [newOutput, setNewOutput] = useState(false);
  const [typing, setTyping] = useState(false);
  const [pasteAsk, setPasteAsk] = useState<string | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus follows window focus.
  const lastSession = useRef<TermSession | null>(null);
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane || !focused || pasteAsk) return;
    const switched = lastSession.current !== session;
    lastSession.current = session;
    // Embedded in the IDE: do not steal focus from the editor/tree when the host window regains focus.
    const ae = document.activeElement as HTMLElement | null;
    const host = pane.closest('.ij-root');
    if (!switched && host && ae && ae !== document.body && host.contains(ae) && !pane.contains(ae)) return;
    pane.focus({ preventScroll: true });
  }, [focused, session, pasteAsk]);

  // Auto-scroll unless the user scrolled up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (pinnedRef.current) {
      el.scrollTop = el.scrollHeight;
      setNewOutput(false);
    } else setNewOutput(true);
  }, [version]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
    pinnedRef.current = atBottom;
    if (atBottom) setNewOutput(false);
  }, []);

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinnedRef.current = true;
    el.scrollTop = el.scrollHeight;
    setNewOutput(false);
    paneRef.current?.focus({ preventScroll: true });
  };

  const copySelection = (): boolean => {
    const sel = typeof window !== 'undefined' ? window.getSelection() : null;
    const text = sel ? sel.toString() : '';
    if (!text) return false;
    wm?.clipboard.write(text, 'terminal');
    sel?.removeAllRanges();
    return true;
  };

  const doPaste = (text: string) => {
    if (!text) return;
    const norm = text.replace(/\r\n?/g, '\n');
    const body = norm.endsWith('\n') ? norm.slice(0, -1) : norm;
    if (!session.nano && body.includes('\n')) {
      setPasteAsk(norm);
      return;
    }
    pinnedRef.current = true;
    session.pasteText(norm);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (pasteAsk) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const lower = e.key.toLowerCase();
    if (session.nano) {
      // nano consumes every key, Esc included (Apps §5.5) — but allow paste via the in-game clipboard.
      if (ctrl && e.shiftKey && lower === 'v') doPaste(readClipboard(wm));
      else session.handleKey({ key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey }, { tabCompletion, keyboardLocked: true });
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (onWindowKey?.(e)) {
      e.preventDefault();
      return;
    }
    // Copy / paste / interrupt (Windows Terminal semantics).
    if (ctrl && e.shiftKey && lower === 'c') {
      copySelection();
      e.preventDefault();
      return;
    }
    if (ctrl && !e.shiftKey && !e.altKey && lower === 'c') {
      if (!copySelection()) {
        pinnedRef.current = true;
        session.interrupt();
      }
      e.preventDefault();
      return;
    }
    if (ctrl && lower === 'v') {
      doPaste(readClipboard(wm));
      e.preventDefault();
      return;
    }
    // Scrollback.
    if (e.shiftKey && (e.key === 'PageUp' || e.key === 'PageDown')) {
      const el = scrollRef.current;
      if (el) {
        el.scrollTop += (e.key === 'PageUp' ? -1 : 1) * el.clientHeight * 0.9;
        onScroll();
      }
      e.preventDefault();
      return;
    }
    if (ctrl && e.shiftKey && (e.key === 'Home' || e.key === 'End')) {
      const el = scrollRef.current;
      if (el) el.scrollTop = e.key === 'Home' ? 0 : el.scrollHeight;
      onScroll();
      e.preventDefault();
      return;
    }
    const consumed = session.handleKey(
      { key: e.key, ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey },
      { tabCompletion, keyboardLocked: isKeyboardLocked() },
    );
    if (consumed) {
      e.preventDefault();
      pinnedRef.current = true;
      setTyping(true);
      if (typingTimer.current) clearTimeout(typingTimer.current);
      typingTimer.current = setTimeout(() => setTyping(false), 600);
      if (e.key === 'Tab' || e.key === 'Escape') e.stopPropagation();
    }
  };

  useEffect(() => () => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }, []);

  const onPaste = (e: React.ClipboardEvent) => {
    // Paste from the system clipboard (e.g. browser menu) — the in-game clipboard is the usual path.
    const text = e.clipboardData.getData('text/plain');
    if (text) {
      e.preventDefault();
      doPaste(text);
    }
  };

  const onContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!copySelection()) doPaste(readClipboard(wm));
    paneRef.current?.focus({ preventScroll: true });
  };

  const onClick = (e: React.MouseEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    const link = (e.target as HTMLElement).closest<HTMLElement>('.term-link');
    const url = link?.dataset.url;
    if (!url || !wm) return;
    e.preventDefault();
    const r = resolveUrl(url);
    wm.openApp(r.app, r.app === 'browser' ? { url: r.route } : { route: r.route });
  };

  const onMouseUp = () => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) paneRef.current?.focus({ preventScroll: true });
  };

  const s = session;
  const input = s.input;
  const cursorChar = input.text[input.cursor] ?? ' ';
  const search = s.search;

  return (
    <div
      className={`term-pane${focused ? '' : ' term-unfocused'}`}
      ref={paneRef}
      tabIndex={0}
      role="log"
      aria-label={embedded ? 'Terminal: Local' : `Terminal: ${s.title}`}
      data-hint="terminal.input"
      onKeyDown={onKeyDown}
      onPaste={onPaste}
      onContextMenu={onContextMenu}
    >
      {s.nano ? (
        <NanoView nano={s.nano} version={version} />
      ) : (
        <div className="term-scroll" ref={scrollRef} onScroll={onScroll} onMouseUp={onMouseUp} onClick={onClick} aria-live="polite">
          {s.lines.map((l) => (
            <Line key={l.id} line={l} />
          ))}
          {s.busy ? null : search ? (
            <div className="term-line">
              {search.failing ? '(failing reverse-i-search)' : '(reverse-i-search)'}`{search.query}&apos;: {renderWithCursor(s.searchMatch(), Math.max(0, s.searchMatch().indexOf(search.query)), typing)}
            </div>
          ) : (
            <div className="term-line term-inputline">
              <PromptText prompt={s.prompt} />
              {input.text.slice(0, input.cursor)}
              <span className={`term-cursor${typing ? ' term-cursor-solid' : ''}`}>{cursorChar}</span>
              {input.text.slice(input.cursor + 1)}
            </div>
          )}
        </div>
      )}
      {newOutput && !s.nano ? (
        <button type="button" className="term-newout" onClick={scrollToBottom}>
          ↓ New output
        </button>
      ) : null}
      {pasteAsk !== null ? (
        <div className="term-dialog-backdrop">
          <div className="term-dialog" role="alertdialog" aria-modal="true" aria-labelledby="term-paste-title">
            <h2 id="term-paste-title">Warning</h2>
            <div>
              You are about to paste text that contains multiple lines. If you paste this text into your shell, it may result in the
              unexpected execution of commands. Do you wish to continue?
            </div>
            <pre>{pasteAsk}</pre>
            <div className="term-dialog-buttons">
              <button
                type="button"
                className="term-btn term-btn-primary"
                autoFocus
                onClick={() => {
                  const t = pasteAsk;
                  setPasteAsk(null);
                  pinnedRef.current = true;
                  session.pasteText(t);
                  paneRef.current?.focus({ preventScroll: true });
                }}
              >
                Paste anyway
              </button>
              <button
                type="button"
                className="term-btn"
                onClick={() => {
                  setPasteAsk(null);
                  paneRef.current?.focus({ preventScroll: true });
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setPasteAsk(null);
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function renderWithCursor(text: string, at: number, solid: boolean) {
  return (
    <>
      {text.slice(0, at)}
      <span className={`term-cursor${solid ? ' term-cursor-solid' : ''}`}>{text[at] ?? ' '}</span>
      {text.slice(at + 1)}
    </>
  );
}
