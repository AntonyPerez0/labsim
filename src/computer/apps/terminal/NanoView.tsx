/**
 * GNU nano 7.2 full-tab view (Apps §5.5). Renders a `NanoModel`; key handling lives in the model and is routed
 * here by `TermView` (nano consumes every key, including Esc).
 */
import { useLayoutEffect, useRef, useState } from 'react';
import type { NanoModel } from './nano';

interface Metrics {
  rows: number;
  cols: number;
}

function useCellMetrics(ref: React.RefObject<HTMLDivElement | null>, probe: React.RefObject<HTMLSpanElement | null>): Metrics {
  const [m, setM] = useState<Metrics>({ rows: 24, cols: 80 });
  useLayoutEffect(() => {
    const el = ref.current;
    const pr = probe.current;
    if (!el || !pr) return;
    const measure = () => {
      const cw = pr.getBoundingClientRect().width / 10 || 8;
      const ch = pr.getBoundingClientRect().height || 17;
      const r = el.getBoundingClientRect();
      const rows = Math.max(1, Math.floor(r.height / ch));
      const cols = Math.max(20, Math.floor((r.width - 4) / cw));
      setM((old) => (old.rows === rows && old.cols === cols ? old : { rows, cols }));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, probe]);
  return m;
}

const EDIT_KEYS: [string, string][][] = [
  [
    ['^G', 'Help'],
    ['^O', 'Write Out'],
    ['^W', 'Where Is'],
    ['^K', 'Cut'],
    ['^T', 'Execute'],
    ['^C', 'Location'],
  ],
  [
    ['^X', 'Exit'],
    ['^R', 'Read File'],
    ['^\\', 'Replace'],
    ['^U', 'Paste'],
    ['^J', 'Justify'],
    ['^/', 'Go To Line'],
  ],
];

const PROMPT_KEYS: [string, string][][] = [
  [
    ['^G', 'Help'],
    ['M-D', 'DOS Format'],
    ['M-A', 'Append'],
    ['M-B', 'Backup File'],
    ['', ''],
    ['', ''],
  ],
  [
    ['^C', 'Cancel'],
    ['M-M', 'Mac Format'],
    ['M-P', 'Prepend'],
    ['^T', 'Browse'],
    ['', ''],
    ['', ''],
  ],
];

const SEARCH_KEYS: [string, string][][] = [
  [
    ['^G', 'Help'],
    ['M-C', 'Case Sens'],
    ['M-B', 'Backwards'],
    ['M-J', 'Justify'],
    ['^R', 'Replace'],
    ['^T', 'Go To Line'],
  ],
  [
    ['^C', 'Cancel'],
    ['M-R', 'Reg.exp.'],
    ['^P', 'Older'],
    ['^N', 'Newer'],
    ['', ''],
    ['', ''],
  ],
];

function KeyRow({ row }: { row: [string, string][] }) {
  return (
    <div className="term-nano-row term-nano-keys">
      {row.map(([k, label], i) => (
        <span key={i}>
          {k ? <b>{k}</b> : null}
          {k ? ` ${label}` : ''}
        </span>
      ))}
    </div>
  );
}

function sliceForCursor(line: string, col: number, cols: number): { text: string; offset: number } {
  if (line.length < cols && col < cols) return { text: line, offset: 0 };
  const page = Math.max(1, cols - 8);
  const offset = col < cols - 1 ? 0 : Math.floor((col - (cols - 1)) / page + 1) * page;
  return { text: line.slice(offset, offset + cols), offset };
}

export function NanoView({ nano, version }: { nano: NanoModel; version: number }) {
  const bufRef = useRef<HTMLDivElement | null>(null);
  const probeRef = useRef<HTMLSpanElement | null>(null);
  const { rows, cols } = useCellMetrics(bufRef, probeRef);
  if (nano.viewRows !== rows) {
    nano.viewRows = rows;
  }
  void version;
  const top = Math.max(0, Math.min(nano.top, Math.max(0, nano.lines.length - 1)));
  const visible = nano.lines.slice(top, top + rows);
  const mode = nano.mode;
  const title = nano.path || 'New Buffer';
  const titleCols = Math.max(cols, 40);
  const head = '  GNU nano 7.2';
  const right = nano.modified ? 'Modified  ' : '';
  const centredStart = Math.max(head.length + 2, Math.floor((titleCols - title.length) / 2));
  const titleLine = (head.padEnd(centredStart) + title).padEnd(titleCols - right.length) + right;

  let promptLabel = '';
  let promptInput = '';
  let promptCursor = 0;
  if (mode.kind === 'writeOut') {
    promptLabel = 'File Name to Write: ';
    promptInput = mode.input;
    promptCursor = mode.cursor;
  } else if (mode.kind === 'search') {
    promptLabel = 'Search: ';
    promptInput = mode.input;
    promptCursor = mode.cursor;
  } else if (mode.kind === 'gotoLine') {
    promptLabel = 'Enter line number, column number: ';
    promptInput = mode.input;
    promptCursor = mode.cursor;
  }

  return (
    <div className="term-nano" role="application" aria-label={`GNU nano 7.2 ${title}`}>
      <span ref={probeRef} className="term-hiddeninput" aria-hidden="true" style={{ position: 'absolute', left: -9999, opacity: 0, width: 'auto', height: 'auto' }}>
        MMMMMMMMMM
      </span>
      <div className="term-nano-row term-nano-inv">{titleLine.slice(0, titleCols)}</div>
      <div className="term-nano-row">{' '}</div>
      <div className="term-nano-buf" ref={bufRef}>
        {visible.map((line, i) => {
          const r = top + i;
          if (r !== nano.row || mode.kind !== 'edit') {
            const s = sliceForCursor(line, 0, cols);
            return (
              <div className="term-nano-row" key={r}>
                {s.text.length > cols - 1 && line.length > cols ? `${s.text.slice(0, cols - 1)}>` : s.text || ' '}
              </div>
            );
          }
          const s = sliceForCursor(line, nano.col, cols);
          const c = nano.col - s.offset;
          return (
            <div className="term-nano-row" key={r}>
              {s.offset > 0 ? '<' : ''}
              {s.text.slice(s.offset > 0 ? 1 : 0, c)}
              <span className="term-nano-cursor">{s.text[c] ?? ' '}</span>
              {s.text.slice(c + 1)}
            </div>
          );
        })}
      </div>
      {mode.kind === 'confirmExit' ? (
        <>
          <div className="term-nano-row term-nano-prompt">{'Save modified buffer? '.padEnd(cols)}</div>
          <div className="term-nano-row">
            {' '}
            <b className="term-nano-inv"> Y</b> Yes
          </div>
          <div className="term-nano-row">
            {' '}
            <b className="term-nano-inv"> N</b> No{'           '}
            <b className="term-nano-inv">^C</b> Cancel
          </div>
        </>
      ) : promptLabel ? (
        <>
          <div className="term-nano-row term-nano-prompt">
            {promptLabel}
            {promptInput.slice(0, promptCursor)}
            <span className="term-nano-cursor">{promptInput[promptCursor] ?? ' '}</span>
            {promptInput.slice(promptCursor + 1)}
          </div>
          <KeyRow row={(mode.kind === 'search' ? SEARCH_KEYS : PROMPT_KEYS)[0]} />
          <KeyRow row={(mode.kind === 'search' ? SEARCH_KEYS : PROMPT_KEYS)[1]} />
        </>
      ) : (
        <>
          <div className="term-nano-row term-nano-status" aria-live="polite">
            {nano.status ? <span>{nano.status}</span> : ' '}
          </div>
          <KeyRow row={EDIT_KEYS[0]} />
          <KeyRow row={EDIT_KEYS[1]} />
        </>
      )}
    </div>
  );
}
