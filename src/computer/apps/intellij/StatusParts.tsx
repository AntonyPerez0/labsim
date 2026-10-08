/** Small IDE chrome parts: caret position (status bar), notification balloons, the TODO tool window. */
import { useMemo, useSyncExternalStore } from 'react';
import { FileIcon, IcCheck, IcError, IcWarning } from './icons';
import type { IdeModel } from './ideModel';

export function CaretStatus({ model }: { model: IdeModel }) {
  const c = useSyncExternalStore(model.subscribeCaret, model.getCaret, model.getCaret);
  return <span className="ij-statusitem">{`${c.line}:${c.col}`}</span>;
}

export function Balloons({ model }: { model: IdeModel }) {
  if (!model.balloons.length) return null;
  return (
    <div className="ij-balloons" aria-live="polite">
      {model.balloons.map((b) => (
        <div key={b.id} className={`ij-balloon ij-balloon-${b.kind}`} role="status">
          <span className="ij-balloon-ico">{b.kind === 'error' ? <IcError size={14} /> : b.kind === 'warning' ? <IcWarning size={14} /> : <IcCheck size={14} />}</span>
          <div className="ij-balloon-title">{b.title}</div>
          {b.body ? <div className="ij-balloon-body">{b.body}</div> : null}
          {b.link ? (
            <button
              type="button"
              className="ij-link"
              onClick={() => {
                model.dismissBalloon(b.id);
                b.link!.action();
              }}
            >
              {b.link.label}
            </button>
          ) : null}
          <button type="button" className="ij-balloon-x" aria-label="Dismiss" onClick={() => model.dismissBalloon(b.id)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function TodoPanel({ files, onOpen }: { files: Record<string, string>; onOpen(path: string, line: number): void }) {
  const todos = useMemo(() => {
    const out: { path: string; line: number; text: string }[] = [];
    for (const [p, text] of Object.entries(files)) {
      text.split('\n').forEach((l, i) => {
        const m = /(?:\/\/|#|\/\*|\*)\s*(TODO\b.*)$/.exec(l);
        if (m) out.push({ path: p, line: i + 1, text: m[1].trim() });
      });
    }
    return out;
  }, [files]);
  return (
    <div className="ij-plist">
      {todos.length ? (
        todos.map((t) => (
          <div key={`${t.path}:${t.line}`} className="ij-prow" role="button" tabIndex={0} onClick={() => onOpen(t.path, t.line)} onKeyDown={(e) => e.key === 'Enter' && onOpen(t.path, t.line)}>
            <FileIcon path={t.path} /> {t.path.split('/').pop()} <span className="ij-dim">({t.line})</span> {t.text}
          </div>
        ))
      ) : (
        <div className="ij-prow ij-dim">No TODO items found</div>
      )}
    </div>
  );
}
