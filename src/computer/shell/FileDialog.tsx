/**
 * Modal file dialog rendered inside the requesting window (Apps §1.6): GTK-like for GIMP, Windows-like elsewhere.
 * Opened through `wm.pickFile(opts)`; resolves with a `~/…` path or null.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/core/store';
import type { LabState } from '@/sim/types';
import { getWindow, resolveFileDialog, useShell } from './wmStore';
import { Glyph } from './icons';
import { fileKind, fileSize, isImagePath, listDir, normPath } from './files';

const PLACES: { label: string; path: string }[] = [
  { label: 'Home', path: '~' },
  { label: 'Desktop', path: '~/Desktop' },
  { label: 'Downloads', path: '~/Downloads' },
  { label: 'Pictures', path: '~/Pictures' },
  { label: 'Documents', path: '~/Documents' },
  { label: 'IdeaProjects', path: '~/IdeaProjects' },
];

export function FileDialog() {
  const fd = useShell((s) => s.fileDialog);
  const sessionFiles = useShell((s) => s.sessionFiles);
  const wsFiles = useGame((s) => s.lab.workstation?.files);
  const repos = useGame((s) => s.lab.repos);
  const opts = fd?.opts ?? {};
  const mode = opts.mode ?? 'open';
  const gtk = fd?.windowId ? getWindow(fd.windowId)?.app === 'gimp' : false;
  const [dir, setDir] = useState(() => normPath(opts.startDir ?? (opts.filter === 'images' ? '~/Pictures' : '~')));
  const [filter, setFilter] = useState<'images' | 'any'>(opts.filter ?? 'any');
  const [name, setName] = useState(opts.suggestedName ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const entries = useMemo(() => {
    const lab = { workstation: { files: wsFiles ?? {} }, repos: repos ?? {} } as unknown as LabState;
    const all = listDir(lab, sessionFiles, dir);
    const q = mode === 'open' ? name.trim().toLowerCase() : '';
    return all.filter((e) => (e.dir || filter === 'any' || isImagePath(e.name)) && (!q || e.dir || e.name.toLowerCase().includes(q)));
  }, [wsFiles, repos, sessionFiles, dir, filter, name, mode]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        resolveFileDialog(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  if (!fd) return null;

  const open = (path: string, isDir: boolean) => {
    if (isDir) {
      setDir(path);
      setSelected(null);
      return;
    }
    resolveFileDialog(path);
  };

  const confirm = () => {
    if (mode === 'save') {
      const n = name.trim();
      if (!n) return;
      resolveFileDialog(n.includes('/') ? normPath(n) : `${dir}/${n}`);
      return;
    }
    if (selected) {
      const e = entries.find((x) => x.path === selected);
      if (e) open(e.path, e.dir);
      return;
    }
    const typed = name.trim();
    if (typed) {
      const exact = entries.find((x) => x.name === typed) ?? entries.find((x) => !x.dir);
      if (exact) open(exact.path, exact.dir);
      else if (typed.startsWith('~') || typed.startsWith('/')) resolveFileDialog(normPath(typed));
    }
  };

  const crumbs = dir.split('/').map((seg, i, arr) => ({ seg: seg === '~' ? 'Home' : seg, path: arr.slice(0, i + 1).join('/') }));
  const title = opts.title ?? (mode === 'save' ? 'Save As' : gtk ? 'Open Image' : 'Open');

  return (
    <div className="ws-modalveil" onPointerDown={(e) => e.stopPropagation()}>
      <div className={`ws-fd${gtk ? ' ws-fd-gtk' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="ws-fd-title">{title}</div>
        <div className="ws-fd-path">
          {crumbs.map((c, i) => (
            <span key={c.path} style={{ display: 'contents' }}>
              {i > 0 ? <Glyph.chevronRight size={12} /> : null}
              <button type="button" className="ws-fd-crumb" onClick={() => setDir(c.path)}>
                {c.seg}
              </button>
            </span>
          ))}
        </div>
        <div className="ws-fd-main">
          <div className="ws-fd-places" role="list" aria-label="Places">
            {PLACES.map((p) => (
              <button
                key={p.path}
                type="button"
                role="listitem"
                className={`ws-fd-place${dir === p.path ? ' ws-fd-place-active' : ''}`}
                onClick={() => setDir(p.path)}
              >
                <Glyph.folder size={16} />
                {p.label}
              </button>
            ))}
          </div>
          <div className="ws-fd-table">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Size</th>
                  <th>{gtk ? 'Modified' : 'Type'}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr
                    key={e.path}
                    className={`ws-fd-row${selected === e.path ? ' ws-fd-sel' : ''}`}
                    onClick={() => {
                      setSelected(e.path);
                      if (!e.dir) setName(e.name);
                    }}
                    onDoubleClick={() => open(e.path, e.dir)}
                  >
                    <td>
                      <span className="ws-fd-name">
                        {e.dir ? <Glyph.folder size={16} /> : isImagePath(e.name) ? <Glyph.image size={16} /> : <Glyph.file size={16} />}
                        {e.name}
                      </span>
                    </td>
                    <td>{e.dir ? '' : fileSize(e.content)}</td>
                    <td>{e.dir ? (gtk ? '' : 'File folder') : gtk ? 'Today' : fileKind(e.name)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {entries.length === 0 ? <div className="ws-fd-empty">This folder is empty.</div> : null}
          </div>
        </div>
        <div className="ws-fd-foot">
          <span>{mode === 'save' ? 'File name:' : 'Name:'}</span>
          <input
            ref={nameRef}
            value={name}
            spellCheck={false}
            onChange={(e) => {
              setName(e.target.value);
              setSelected(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                confirm();
              }
            }}
          />
          <select value={filter} onChange={(e) => setFilter(e.target.value as 'images' | 'any')} aria-label="File type">
            <option value="images">All images</option>
            <option value="any">All files</option>
          </select>
          <button type="button" className="ws-btn" onClick={() => resolveFileDialog(null)}>
            Cancel
          </button>
          <button type="button" className="ws-btn ws-btn-primary" onClick={confirm} disabled={mode === 'open' ? !selected && !name.trim() : !name.trim()}>
            {mode === 'save' ? 'Save' : 'Open'}
          </button>
        </div>
      </div>
    </div>
  );
}

