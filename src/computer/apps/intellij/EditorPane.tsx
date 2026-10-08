/**
 * Editor area (Apps §4.5–§4.8): tabs (VCS colours, close, context menu, overflow), notification bars (config
 * validator, missing config, read-only), find/replace bar, the problems chip and the active editor or diff.
 * Keeps open buffers in sync with the lab (reload when the file changes on disk and the buffer is clean).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getWindowManager } from '@/computer/apps';
import type { GitRepo } from '@/sim';
import { isConfigFile, openFile, validateConfig, writeProjectFile } from './actions';
import { DiffView } from './DiffView';
import { Editor } from './Editor';
import { findMatches } from './find';
import { FileIcon, IcCheck, IcChevronDown, IcClose, IcError, IcEye, IcWarning } from './icons';
import type { IdeModel } from './ideModel';
import { inspectFile, inspectionModeFor, screenClassInfo, type Problem } from './inspections';
import { javaDeclaredFields, langFor, type JavaContext } from './lang';
import { MenuCatcher, MenuList, type MenuItem } from './Menu';
import { findClassFile, gutterRun, type RunConfig } from './projectModel';
import { rootPoint, useIdeRoot } from './rootContext';
import { fileStatus } from './vcs';

export interface EditorPaneProps {
  model: IdeModel;
  repo: string;
  files: Record<string, string>;
  gitRepo: GitRepo | null;
  head: Record<string, string>;
  canGit: boolean;
  configs: RunConfig[];
  windowFocused: boolean;
  onRun(cfg: RunConfig): void;
  onContextActions(): void;
  onEdited(): void;
}

function FindBar({ model, matches, current, onNav }: { model: IdeModel; matches: number; current: number; onNav(dir: 1 | -1): void }) {
  const f = model.find;
  const ref = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, [f.focusSeq]);
  const set = (patch: Partial<typeof f>) => {
    model.find = { ...model.find, ...patch };
    model.changed();
  };
  const close = () => {
    set({ open: false });
    model.editorFocusSeq++;
    model.changed();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'Enter' || e.key === 'F3') onNav(e.shiftKey ? -1 : 1);
    else {
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };
  return (
    <div className="ij-findbar" onKeyDown={onKeyDown}>
      <div className="ij-findrow">
        <div className={`ij-findfield${f.query && !matches ? ' ij-nomatch' : ''}`}>
          <input ref={ref} aria-label="Find" value={f.query} spellCheck={false} onChange={(e) => set({ query: e.target.value })} />
          <button type="button" className={`ij-toggle${f.matchCase ? ' ij-on' : ''}`} title="Match Case" aria-pressed={f.matchCase} onClick={() => set({ matchCase: !f.matchCase })}>
            Cc
          </button>
          <button type="button" className={`ij-toggle${f.words ? ' ij-on' : ''}`} title="Words" aria-pressed={f.words} onClick={() => set({ words: !f.words })}>
            W
          </button>
          <button type="button" className={`ij-toggle${f.regex ? ' ij-on' : ''}`} title="Regex" aria-pressed={f.regex} onClick={() => set({ regex: !f.regex })}>
            .*
          </button>
        </div>
        <span className="ij-findcount">{f.query ? (matches ? `${current + 1}/${matches}` : '0 results') : ''}</span>
        <button type="button" className="ij-tbtn" title="Previous Occurrence (Shift+F3)" aria-label="Previous Occurrence" onClick={() => onNav(-1)}>
          ↑
        </button>
        <button type="button" className="ij-tbtn" title="Next Occurrence (F3)" aria-label="Next Occurrence" onClick={() => onNav(1)}>
          ↓
        </button>
        <button type="button" className="ij-tbtn" style={{ marginLeft: 'auto' }} title="Close (Escape)" aria-label="Close" onClick={close}>
          <IcClose />
        </button>
      </div>
      {f.replace ? (
        <div className="ij-findrow">
          <div className="ij-findfield">
            <input aria-label="Replace" value={f.replacement} spellCheck={false} onChange={(e) => set({ replacement: e.target.value })} />
          </div>
          <button type="button" className="ij-btn" onClick={() => model.findReplace?.(false)}>
            Replace
          </button>
          <button type="button" className="ij-btn" onClick={() => model.findReplace?.(true)}>
            Replace All
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ConfigBar({ text, onToggle, open }: { text: string; open: boolean; onToggle(): void }) {
  const v = useMemo(() => validateConfig(text), [text]);
  const ok = v.passed === v.total;
  return (
    <>
      <div className="ij-notif" data-hint="intellij.configValidator">
        {ok ? (
          <span className="ij-notif-ok">
            <IcCheck size={14} /> config.properties ✓ {v.passed}/{v.total}
          </span>
        ) : (
          <span className="ij-notif-bad">
            <IcWarning size={14} /> config.properties ✗ {v.passed}/{v.total}
          </span>
        )}
        <span className="ij-dim">uia-remote Config Assistant</span>
        <button type="button" className="ij-link" style={{ marginLeft: 'auto' }} onClick={onToggle}>
          {open ? 'Hide details ⌃' : 'Show details ⌄'}
        </button>
      </div>
      {open ? (
        <div className="ij-notif-details">
          {v.rules.map((r) => (
            <div key={r.key} className={r.ok ? 'ij-ok' : 'ij-bad'}>
              {r.ok ? '✓' : '✗'} {r.key} = {r.value ?? ''}
              {r.ok ? '' : ` — ${r.message}`}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

export function EditorPane(props: EditorPaneProps) {
  const { model, repo, files, gitRepo, head } = props;
  const root = useIdeRoot();
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [overflow, setOverflow] = useState<{ x: number; y: number } | null>(null);
  const [details, setDetails] = useState(false);
  const [curMatch, setCurMatch] = useState(0);

  // Sync buffers with the lab.
  for (const id of model.tabs) {
    const b = model.buffers.get(id);
    if (!b || b.readOnly) continue;
    const disk = files[id];
    if (disk === undefined) continue;
    if (disk !== b.base) {
      if (b.text === b.base) b.text = disk;
      b.base = disk;
    }
  }

  const activeId = model.active;
  const diff = activeId ? model.diffs.get(activeId) : undefined;
  const buffer = activeId && !diff ? model.buffers.get(activeId) : undefined;
  const lang = buffer ? langFor(buffer.path) : 'text';

  const superPath = useMemo(() => {
    if (!buffer || lang !== 'java') return null;
    const m = /\bextends\s+(\w+)/.exec(buffer.text);
    return m ? findClassFile(Object.keys(files), m[1]) : null;
  }, [buffer, buffer?.text, lang, files]);
  const superText = superPath ? files[superPath] : undefined;
  const javaCtx: JavaContext | null = useMemo(() => {
    if (!buffer || lang !== 'java') return null;
    const own = javaDeclaredFields(buffer.text);
    if (superText) {
      const sup = javaDeclaredFields(superText);
      sup.fields.forEach((f) => own.fields.add(f));
      sup.consts.forEach((c) => own.consts.add(c));
    }
    return own;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffer?.text, lang, superText]);

  const problems: Problem[] = useMemo(() => (buffer ? inspectFile(repo, buffer.path, buffer.text) : []), [repo, buffer, buffer?.text]);
  const mode = buffer ? inspectionModeFor(repo, buffer.path) : 'none';
  const matches = useMemo(() => (buffer && model.find.open ? findMatches(buffer.text, model.find) : []), [buffer, buffer?.text, model.find]);
  const run = buffer ? gutterRun(repo, buffer.path, buffer.text, props.configs) : null;
  const screen = buffer ? screenClassInfo(buffer.path, buffer.text) : null;

  // Find navigation: current match follows the caret.
  const nav = (dir: 1 | -1) => {
    if (!buffer || !matches.length) return;
    const caret = buffer.end;
    let idx = dir > 0 ? matches.findIndex((m) => m.start >= caret) : -1;
    if (dir < 0) for (let i = matches.length - 1; i >= 0; i--) if (matches[i].end <= buffer.start) {
      idx = i;
      break;
    }
    if (idx < 0) idx = dir > 0 ? 0 : matches.length - 1;
    setCurMatch(idx);
    model.requestReveal(buffer.path, matches[idx].start, matches[idx].end, !model.find.open);
    model.changed();
  };
  const replace = (all: boolean) => {
    if (!buffer || buffer.readOnly || !matches.length) return;
    const rep = model.find.replacement;
    let text = buffer.text;
    if (all) {
      for (const m of [...matches].reverse()) text = text.slice(0, m.start) + rep + text.slice(m.end);
      model.recordEdit(buffer, { text, start: buffer.start, end: buffer.start }, 'replace');
    } else {
      const m = matches[Math.min(curMatch, matches.length - 1)];
      text = text.slice(0, m.start) + rep + text.slice(m.end);
      model.recordEdit(buffer, { text, start: m.start + rep.length, end: m.start + rep.length }, 'replace');
    }
    model.changed();
    props.onEdited();
  };
  model.findNav = nav;
  model.findReplace = replace;

  const closeTab = (id: string) => model.closeTab(id);

  const tabMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const p = rootPoint(root, e.clientX, e.clientY);
    setMenu({
      x: p.x,
      y: p.y,
      items: [
        { label: 'Close', kbd: 'Alt+Shift+W', onClick: () => closeTab(id) },
        {
          label: 'Close Others',
          onClick: () => {
            for (const t of model.tabs.filter((t) => t !== id)) model.closeTab(t);
          },
        },
        {
          label: 'Close All',
          onClick: () => {
            for (const t of [...model.tabs]) model.closeTab(t);
          },
        },
        { separator: true },
        { label: 'Copy Path', disabled: !!model.diffs.get(id), onClick: () => getWindowManager()?.clipboard.write(id, 'intellij') },
      ],
    });
  };

  const tabStatus = (id: string) => (gitRepo && props.canGit && !model.diffs.has(id) && !model.buffers.get(id)?.readOnly ? fileStatus(gitRepo, id, head) : 'unchanged');
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.length - errors;
  const isExample = buffer && repo === 'uia-remote' && buffer.path === 'config.properties.example' && files['config.properties'] === undefined;

  return (
    <div className="ij-editorarea">
      {model.tabs.length ? (
        <div className="ij-tabs" role="tablist" aria-label="Editor tabs">
          <div className="ij-tabs-scroll">
            {model.tabs.map((id) => {
              const d = model.diffs.get(id);
              const st = tabStatus(id);
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={id === activeId}
                  className={`ij-tab${id === activeId ? ' ij-on' : ''}`}
                  title={d ? d.title : id}
                  onMouseDown={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      closeTab(id);
                    } else if (e.button === 0) {
                      if (d) {
                        model.active = id;
                        model.changed();
                      } else openFile(model, id, { emit: id !== activeId });
                    }
                  }}
                  onContextMenu={(e) => tabMenu(e, id)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/x-ij-tab', id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes('text/x-ij-tab')) e.preventDefault();
                  }}
                  onDrop={(e) => {
                    const from = e.dataTransfer.getData('text/x-ij-tab');
                    if (!from || from === id) return;
                    e.preventDefault();
                    const rest = model.tabs.filter((t) => t !== from);
                    rest.splice(rest.indexOf(id), 0, from);
                    model.tabs = rest;
                    model.changed();
                  }}
                >
                  <FileIcon path={d ? d.path : id} />
                  <span className={st === 'unchanged' ? '' : `ij-vcs-${st}`}>{d ? d.title : id.split('/').pop()}</span>
                  <span
                    className="ij-tab-x"
                    role="button"
                    aria-label="Close tab"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      closeTab(id);
                    }}
                  >
                    <IcClose size={12} />
                  </span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="ij-tab-overflow"
            aria-label="Show hidden tabs"
            onClick={(e) => {
              const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const p = rootPoint(root, r.left - 200, r.bottom);
              setOverflow(p);
            }}
          >
            <IcChevronDown size={14} />
          </button>
        </div>
      ) : null}
      {diff ? (
        <DiffView diff={diff} />
      ) : buffer ? (
        <div className="ij-editor-top" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {buffer.readOnly ? <div className="ij-notif ij-notif-yellow">This file is read-only</div> : null}
          {isConfigFile(repo, buffer.path) || (model.cwm && buffer.path === 'config.properties') ? <ConfigBar text={buffer.base} open={details} onToggle={() => setDetails(!details)} /> : null}
          {isExample ? (
            <div className="ij-notif">
              <IcWarning size={14} /> config.properties not found — copy config.properties.example
              <button
                type="button"
                className="ij-link"
                style={{ marginLeft: 'auto' }}
                onClick={() => {
                  const r = writeProjectFile(repo as never, model.cwm, 'config.properties', buffer.text);
                  if (r.ok) openFile(model, 'config.properties');
                  else model.balloon({ kind: 'error', title: 'Cannot create config.properties', body: r.error });
                }}
              >
                Create config.properties from example
              </button>
            </div>
          ) : null}
          {model.find.open ? <FindBar model={model} matches={matches.length} current={Math.min(curMatch, Math.max(0, matches.length - 1))} onNav={nav} /> : null}
          <div style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div
              className="ij-chip"
              title={mode === 'none' && repo === 'pigeon' && buffer.path.endsWith('.json') ? 'Highlighting level: None (pigeon/.idea/inspectionProfiles)' : `${errors} error${errors === 1 ? '' : 's'}, ${warnings} warning${warnings === 1 ? '' : 's'}`}
              role="button"
              tabIndex={-1}
              onClick={() => {
                model.bottomTool = 'problems';
                model.changed();
              }}
            >
              {mode === 'none' && repo === 'pigeon' && buffer.path.endsWith('.json') ? (
                <IcEye size={14} />
              ) : problems.length ? (
                <>
                  {errors ? (
                    <span>
                      <IcError size={13} /> {errors}
                    </span>
                  ) : null}
                  {warnings ? (
                    <span>
                      <IcWarning size={13} /> {warnings}
                    </span>
                  ) : null}
                </>
              ) : (
                <IcCheck size={14} />
              )}
            </div>
            <Editor
              key={buffer.path}
              model={model}
              buffer={buffer}
              repo={repo}
              lang={lang}
              javaCtx={javaCtx}
              problems={problems}
              gutterRun={run}
              hasIntention={!!screen?.missing.length}
              focused={props.windowFocused}
              matches={matches}
              currentMatch={Math.min(curMatch, matches.length - 1)}
              onRun={props.onRun}
              onGotoDeclaration={(w) => {
                const p = findClassFile(Object.keys(files), w);
                if (p) openFile(model, p);
              }}
              onContextActions={props.onContextActions}
              onEdited={props.onEdited}
            />
          </div>
        </div>
      ) : (
        <div className="ij-empty-editor">
          <div>
            Search Everywhere <kbd>Double Shift</kbd>
            <br />
            Go to File <kbd>Ctrl+Shift+N</kbd>
            <br />
            Recent Files <kbd>Ctrl+E</kbd>
            <br />
            Navigation Bar <kbd>Alt+Home</kbd>
            <br />
            Drop files here to open them
          </div>
        </div>
      )}
      {menu ? (
        <>
          <MenuCatcher onClose={() => setMenu(null)} />
          <MenuList items={menu.items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />
        </>
      ) : null}
      {overflow ? (
        <>
          <MenuCatcher onClose={() => setOverflow(null)} />
          <MenuList
            items={model.tabs.map((id) => ({ label: model.diffs.get(id)?.title ?? id.split('/').pop(), icon: <FileIcon path={model.diffs.get(id)?.path ?? id} />, onClick: () => (model.diffs.has(id) ? ((model.active = id), model.changed()) : openFile(model, id)) }))}
            x={overflow.x}
            y={overflow.y}
            onClose={() => setOverflow(null)}
          />
        </>
      ) : null}
    </div>
  );
}
