/** File Explorer preview pane: read-only text (monospace) or the materialized image. */
import { useEffect, useState } from 'react';
import { getImage, peekImage, type ImageEntry } from '../../apps';
import type { FsEntry } from '../../shell/files';
import { isImagePath } from '../../shell/files';

const MAX_CHARS = 60_000;

export function Preview(props: { entry: FsEntry; onClose(): void }) {
  const { entry } = props;
  const isImg = isImagePath(entry.name) || entry.content.startsWith('img:');
  const [img, setImg] = useState<ImageEntry | null>(() => (isImg ? peekImage(entry.content) : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isImg) return;
    let alive = true;
    setFailed(false);
    setImg(peekImage(entry.content));
    void getImage(entry.content)
      .then((e) => {
        if (!alive) return;
        setImg(e);
        if (!e) setFailed(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [entry.content, isImg]);

  const text = entry.content.length > MAX_CHARS ? `${entry.content.slice(0, MAX_CHARS)}\n…` : entry.content;
  return (
    <aside className="fx-preview" aria-label="Preview pane">
      <div className="fx-preview-head">
        <span className="fx-preview-name" title={entry.path}>
          {entry.name}
        </span>
        <button type="button" className="fx-icon-btn" onClick={props.onClose} aria-label="Close preview" title="Close preview">
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      {isImg ? (
        <div className="fx-preview-img">
          {img ? <img src={img.dataUrl} alt={entry.name} /> : <span className="fx-dim">{failed ? 'No preview available.' : 'Loading preview…'}</span>}
        </div>
      ) : (
        <pre className="fx-preview-text">{text || ' '}</pre>
      )}
    </aside>
  );
}
