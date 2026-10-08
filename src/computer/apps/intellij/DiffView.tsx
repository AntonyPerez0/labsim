/** Side-by-side diff viewer (Apps §4.10): `HEAD (Read-only)` ↔ `Your version`, IntelliJ diff colours. */
import { useMemo } from 'react';
import type { DiffTab } from './ideModel';
import { diffLines } from './projectModel';

interface Row {
  kind: 'same' | 'add' | 'del' | 'mod';
  l: number | null;
  lt: string;
  r: number | null;
  rt: string;
}

export function DiffView({ diff }: { diff: DiffTab }) {
  const rows = useMemo(() => {
    const raw = diffLines(diff.left, diff.right);
    const out: Row[] = [];
    for (let i = 0; i < raw.length; i++) {
      const d = raw[i];
      if (d.kind === 'same') out.push({ kind: 'same', l: d.left, lt: d.text, r: d.right, rt: d.text });
      else if (d.kind === 'del') {
        const next = raw[i + 1];
        if (next && next.kind === 'add') {
          out.push({ kind: 'mod', l: d.left, lt: d.text, r: next.right, rt: next.text });
          i++;
        } else out.push({ kind: 'del', l: d.left, lt: d.text, r: null, rt: '' });
      } else {
        const next = raw[i + 1];
        if (next && next.kind === 'del') {
          out.push({ kind: 'mod', l: next.left, lt: next.text, r: d.right, rt: d.text });
          i++;
        } else out.push({ kind: 'add', l: null, lt: '', r: d.right, rt: d.text });
      }
    }
    return out;
  }, [diff.left, diff.right]);
  const changes = rows.filter((r) => r.kind !== 'same').length;
  return (
    <div className="ij-diff" role="region" aria-label={`Diff ${diff.title}`}>
      <div className="ij-diff-head">
        <div>{diff.leftTitle}</div>
        <div>
          {diff.rightTitle} <span className="ij-dim">· {changes ? `${changes} difference${changes === 1 ? '' : 's'}` : 'Contents are identical'}</span>
        </div>
      </div>
      <div className="ij-diff-body">
        {rows.map((r, i) => (
          <div key={i} className={`ij-diff-row${r.kind === 'same' ? '' : ` ij-diff-${r.kind}`}`}>
            <span>{r.l ?? ''}</span>
            <span>{r.lt}</span>
            <span>{r.r ?? ''}</span>
            <span>{r.rt}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
