/**
 * GitHub file diff (unified / split, Apps §7.1 diff colours) with hover "+" line comments, saved replies and
 * existing review threads (Apps §7.4 Files changed).
 */
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import type { PrComment } from '@/sim/types';
import { Avatar, Oct } from './icons';
import { diffLines, langOf, login, SAVED_REPLIES } from './model';
import { highlightLine } from './highlight';
import { Popover, Rel } from './Chrome';
import { useGh } from './ctx';

export interface PendingComment {
  path: string;
  line: number;
  body: string;
  reason: string | null;
}

interface Row {
  t: ' ' | '+' | '-' | '@';
  text: string;
  oldNo: number | null;
  newNo: number | null;
}

function buildRows(before: string, after: string): Row[] {
  const d = diffLines(before, after);
  const rows: Row[] = [];
  for (const h of d.hunks) {
    rows.push({ t: '@', text: `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`, oldNo: null, newNo: null });
    let o = h.oldStart;
    let n = h.newStart;
    // GitHub lists a change block's deletions before its additions.
    const lines: string[] = [];
    for (let i = 0; i < h.lines.length; ) {
      if (h.lines[i]![0] === ' ') {
        lines.push(h.lines[i++]!);
        continue;
      }
      const dels: string[] = [];
      const adds: string[] = [];
      while (i < h.lines.length && h.lines[i]![0] !== ' ') (h.lines[i]![0] === '-' ? dels : adds).push(h.lines[i++]!);
      lines.push(...dels, ...adds);
    }
    for (const l of lines) {
      const t = l[0] as ' ' | '+' | '-';
      const text = l.slice(1);
      if (t === ' ') rows.push({ t, text, oldNo: o++, newNo: n++ });
      else if (t === '-') rows.push({ t, text, oldNo: o++, newNo: null });
      else rows.push({ t, text, oldNo: null, newNo: n++ });
    }
  }
  return rows;
}

export function diffStats(before: string | null, after: string | null): { added: number; removed: number } {
  const d = diffLines(before ?? '', after ?? '');
  return { added: d.added, removed: d.removed };
}

export function StatBlocks(props: { added: number; removed: number }) {
  const total = props.added + props.removed || 1;
  const g = Math.round((props.added / total) * 5);
  const r = Math.min(5 - g, Math.round((props.removed / total) * 5));
  return (
    <span className="gh-diff-stat" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} style={{ background: i < g ? '#1f883d' : i < g + r ? '#d1242f' : '#d1d9e0' }} />
      ))}
    </span>
  );
}

/** Comment form with Write/Preview, Saved replies (Ctrl+.), Add single comment / Start a review. */
export function CommentForm(props: {
  onCancel?(): void;
  onSubmit(body: string, reason: string | null, mode: 'single' | 'review'): void;
  reviewMode: boolean;
  placeholder?: string;
  singleLabel?: string;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const ta = useRef<HTMLTextAreaElement>(null);
  const pick = (r: (typeof SAVED_REPLIES)[number]) => {
    setBody((b) => (b.trim() ? `${b.trimEnd()}\n${r.text}` : r.text));
    setReason(r.reason);
    setSaved(false);
    requestAnimationFrame(() => ta.current?.focus());
  };
  const submit = (mode: 'single' | 'review') => {
    if (!body.trim()) return;
    props.onSubmit(body.trim(), reason, mode);
    setBody('');
    setReason(null);
  };
  return (
    <div className="gh-comment-form">
      <div className="gh-flex" style={{ marginBottom: 8 }}>
        <div className="gh-seg">
          <button type="button" aria-pressed={tab === 'write'} onClick={() => setTab('write')}>
            Write
          </button>
          <button type="button" aria-pressed={tab === 'preview'} onClick={() => setTab('preview')}>
            Preview
          </button>
        </div>
        <span className="gh-spacer" />
        <Popover
          open={saved}
          onClose={() => setSaved(false)}
          align="right"
          button={
            <button type="button" className="gh-btn gh-btn-invisible gh-btn-sm" title="Saved replies (Ctrl+.)" aria-label="Saved replies" onClick={() => setSaved((s) => !s)}>
              <Oct name="reply" />
              <Oct name="caret" />
            </button>
          }
        >
          <div className="gh-overlay-head">Select a reply</div>
          {SAVED_REPLIES.map((r, i) => (
            <button key={r.reason} type="button" className="gh-menu-item" onClick={() => pick(r)}>
              <span className="gh-muted" style={{ width: 18 }}>
                {i + 1}
              </span>
              {r.text}
            </button>
          ))}
        </Popover>
      </div>
      {tab === 'write' ? (
        <textarea
          ref={ta}
          className="gh-textarea"
          autoFocus={props.autoFocus}
          placeholder={props.placeholder ?? 'Leave a comment'}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (!e.target.value.trim()) setReason(null);
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              submit(props.reviewMode ? 'review' : 'single');
            } else if ((e.ctrlKey || e.metaKey) && e.key === '.') {
              e.preventDefault();
              setSaved(true);
            } else if (e.key === 'Escape' && props.onCancel) {
              e.preventDefault();
              e.stopPropagation();
              props.onCancel();
            }
          }}
        />
      ) : (
        <div className="gh-markdown gh-markdown-sm" style={{ minHeight: 80, padding: 8 }}>
          {body.trim() ? body : <span className="gh-muted">Nothing to preview</span>}
        </div>
      )}
      <div className="gh-comment-form-foot">
        {props.onCancel ? (
          <button type="button" className="gh-btn" onClick={props.onCancel}>
            Cancel
          </button>
        ) : null}
        {props.reviewMode ? (
          <button type="button" className="gh-btn gh-btn-primary" disabled={!body.trim()} onClick={() => submit('review')}>
            Add review comment
          </button>
        ) : (
          <>
            <button type="button" className="gh-btn" disabled={!body.trim()} onClick={() => submit('single')}>
              {props.singleLabel ?? 'Add single comment'}
            </button>
            {props.onCancel ? (
              <button type="button" className="gh-btn gh-btn-primary" disabled={!body.trim()} onClick={() => submit('review')}>
                Start a review
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

function Thread(props: { comments: (PrComment | (PendingComment & { pending: true }))[] }) {
  const { playerInitials } = useGh();
  return (
    <>
      {props.comments.map((c, i) => (
        <div className="gh-inline-thread" key={i}>
          <div className="gh-flex" style={{ padding: '8px 12px', borderBottom: '1px solid var(--gh-border-muted)', fontSize: 14 }}>
            <Avatar who={'pending' in c ? 'player' : c.author} size={20} playerInitials={playerInitials} />
            <b>{login('pending' in c ? 'player' : c.author)}</b>
            {'pending' in c ? <span className="gh-label gh-label-attn">Pending</span> : <span className="gh-muted"><Rel ms={c.atMs} /></span>}
          </div>
          <div style={{ padding: '8px 12px', whiteSpace: 'pre-wrap' }}>{c.body}</div>
        </div>
      ))}
    </>
  );
}

export function DiffFile(props: {
  path: string;
  before: string | null;
  after: string | null;
  view: 'unified' | 'split';
  comments?: PrComment[];
  pending?: PendingComment[];
  reviewing?: boolean;
  onComment?(line: number, body: string, reason: string | null, mode: 'single' | 'review'): void;
  headerExtra?: ReactNode;
  anchorId?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [formAt, setFormAt] = useState<number | null>(null);
  const rows = useMemo(() => buildRows(props.before ?? '', props.after ?? ''), [props.before, props.after]);
  const stats = useMemo(() => diffStats(props.before, props.after), [props.before, props.after]);
  const lang = langOf(props.path);
  const st = { inBlock: false };
  const hl = rows.map((r) => (r.t === '@' ? [r.text] : highlightLine(r.text, lang, st)));
  const threadsAt = (line: number | null) => {
    if (line == null) return [];
    const c = (props.comments ?? []).filter((x) => x.path === props.path && x.line === line);
    const p = (props.pending ?? []).filter((x) => x.path === props.path && x.line === line).map((x) => ({ ...x, pending: true as const }));
    return [...c, ...p];
  };
  const lineKey = (r: Row) => r.newNo ?? r.oldNo;
  const addBtn = (r: Row) =>
    props.onComment && r.t !== '@' ? (
      <button type="button" className="gh-diff-add-comment" aria-label="Add line comment" onClick={() => setFormAt(lineKey(r))}>
        <Oct name="plus" size={12} />
      </button>
    ) : null;
  const extraRow = (r: Row, cols: number) => {
    const ln = lineKey(r);
    const threads = r.t === '@' ? [] : threadsAt(ln);
    const open = formAt != null && formAt === ln && r.t !== '@';
    if (!threads.length && !open) return null;
    return (
      <tr className="gh-inline-comment">
        <td colSpan={cols}>
          {threads.length ? <Thread comments={threads} /> : null}
          {open ? (
            <div style={{ marginTop: threads.length ? 8 : 0 }}>
              <CommentForm
                autoFocus
                reviewMode={!!props.reviewing}
                onCancel={() => setFormAt(null)}
                onSubmit={(body, reason, mode) => {
                  props.onComment?.(ln!, body, reason, mode);
                  setFormAt(null);
                }}
              />
            </div>
          ) : null}
        </td>
      </tr>
    );
  };
  const isNew = props.before === null;
  const isDel = props.after === null;
  return (
    <div className="gh-diff" id={props.anchorId}>
      <div className="gh-diff-head">
        <button type="button" className="gh-btn gh-btn-invisible gh-btn-sm" aria-label={collapsed ? 'Expand file' : 'Collapse file'} onClick={() => setCollapsed((c) => !c)} style={{ transform: collapsed ? 'rotate(-90deg)' : undefined }}>
          <Oct name="caret" />
        </button>
        <span style={{ fontWeight: 600 }}>{stats.added + stats.removed}</span>
        <StatBlocks {...stats} />
        <span style={{ fontWeight: 600, color: 'var(--gh-fg)' }}>{props.path}</span>
        {isNew ? <span className="gh-label gh-label-success">new file</span> : null}
        {isDel ? <span className="gh-label">deleted</span> : null}
        <span className="gh-spacer" />
        {props.headerExtra}
      </div>
      {collapsed ? null : (
        <table className="gh-diff-table">
          {props.view === 'split' ? (
            <colgroup>
              <col style={{ width: 50 }} />
              <col />
              <col style={{ width: 50 }} />
              <col />
            </colgroup>
          ) : (
            <colgroup>
              <col style={{ width: 50 }} />
              <col style={{ width: 50 }} />
              <col style={{ width: 20 }} />
              <col />
            </colgroup>
          )}
          <tbody>
            {props.view === 'unified'
              ? rows.map((r, i) => (
                  <Fragment key={i}>
                    <tr className={r.t === '+' ? 'gh-diff-add' : r.t === '-' ? 'gh-diff-del' : r.t === '@' ? 'gh-diff-hunk' : undefined} data-line={lineKey(r) ?? undefined}>
                      <td className="gh-dn">{r.oldNo ?? ''}</td>
                      <td className="gh-dn">
                        {r.newNo ?? ''}
                        {addBtn(r)}
                      </td>
                      <td className="gh-dsign">{r.t === '@' ? '' : r.t}</td>
                      <td>{hl[i]}</td>
                    </tr>
                    {extraRow(r, 4)}
                  </Fragment>
                ))
              : splitRows(rows, hl).map((p, i) => (
                  <Fragment key={i}>
                    <tr className={p.hunk ? 'gh-diff-hunk' : undefined}>
                      {p.hunk ? (
                        <>
                          <td className="gh-dn" />
                          <td colSpan={3}>{p.hunk}</td>
                        </>
                      ) : (
                        <>
                          <td className={`gh-dn ${p.l ? (p.l.r.t === '-' ? 'gh-dn-del' : '') : ''}`} style={p.l?.r.t === '-' ? { background: '#ffcecb' } : !p.l ? { background: '#f6f8fa' } : undefined}>
                            {p.l?.r.oldNo ?? ''}
                          </td>
                          <td style={p.l?.r.t === '-' ? { background: '#ffebe9' } : !p.l ? { background: '#f6f8fa' } : undefined}>{p.l?.node}</td>
                          <td className="gh-dn" style={p.r?.r.t === '+' ? { background: '#aceebb' } : !p.r ? { background: '#f6f8fa' } : undefined}>
                            {p.r?.r.newNo ?? ''}
                            {p.r ? addBtn(p.r.r) : null}
                          </td>
                          <td style={p.r?.r.t === '+' ? { background: '#dafbe1' } : !p.r ? { background: '#f6f8fa' } : undefined}>{p.r?.node}</td>
                        </>
                      )}
                    </tr>
                    {p.r ? extraRow(p.r.r, 4) : p.l ? extraRow(p.l.r, 4) : null}
                  </Fragment>
                ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function splitRows(rows: Row[], hl: ReactNode[][]): { hunk?: string; l?: { r: Row; node: ReactNode }; r?: { r: Row; node: ReactNode } }[] {
  const out: { hunk?: string; l?: { r: Row; node: ReactNode }; r?: { r: Row; node: ReactNode } }[] = [];
  let i = 0;
  while (i < rows.length) {
    const r = rows[i]!;
    if (r.t === '@') {
      out.push({ hunk: r.text });
      i++;
      continue;
    }
    if (r.t === ' ') {
      out.push({ l: { r, node: hl[i] }, r: { r, node: hl[i] } });
      i++;
      continue;
    }
    const dels: number[] = [];
    const adds: number[] = [];
    while (i < rows.length && rows[i]!.t === '-') dels.push(i++);
    while (i < rows.length && rows[i]!.t === '+') adds.push(i++);
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) {
      const d = dels[k];
      const a = adds[k];
      out.push({ l: d != null ? { r: rows[d]!, node: hl[d] } : undefined, r: a != null ? { r: rows[a]!, node: hl[a] } : undefined });
    }
  }
  return out;
}
