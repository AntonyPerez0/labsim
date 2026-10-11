/**
 * Quick input (Command Palette, Quick Open, Go to Line, git prompts). The widget is model state, so commands,
 * the status bar and the Explorer can all open it.
 */
import { useEffect, useRef } from 'react';
import { getState } from '@/core/store';
import { lineColToOffset } from './jsonLang';
import {
  branchList,
  checkout,
  checkPractice,
  cloneRepo,
  commit,
  formatDocument,
  openFile,
  openFolder,
  practiceFiles,
  pull,
  push,
  remoteBranches,
  repoFiles,
  REPOS,
  runLocal,
  saveAll,
  saveBuffer,
  sync,
} from './actions';
import type { PaletteItem, VsModel } from './model';

function fuzzy(label: string, q: string): boolean {
  if (!q) return true;
  const l = label.toLowerCase();
  let i = 0;
  for (const ch of q.toLowerCase()) {
    if (ch === ' ') continue;
    i = l.indexOf(ch, i);
    if (i < 0) return false;
    i++;
  }
  return true;
}

export function commandItems(model: VsModel): PaletteItem[] {
  const b = model.activeBuffer();
  const items: PaletteItem[] = [
    { id: 'save', label: 'File: Save', hint: 'Ctrl+S', run: () => saveBuffer(model, model.activeBuffer()) },
    { id: 'saveAll', label: 'File: Save All', run: () => saveAll(model) },
    { id: 'openFolder', label: 'File: Open Folder...', run: () => openFolderPrompt(model) },
    { id: 'format', label: 'Format Document', hint: 'Shift+Alt+F', run: () => formatDocument(model) },
    { id: 'gotoLine', label: 'Go to Line/Column...', hint: 'Ctrl+G', run: () => gotoLinePrompt(model) },
    { id: 'quickOpen', label: 'Go to File...', hint: 'Ctrl+P', run: () => quickOpen(model) },
    { id: 'problems', label: 'View: Show Problems', hint: 'Ctrl+Shift+M', run: () => showPanel(model, 'problems') },
    { id: 'output', label: 'View: Show Output', run: () => showPanel(model, 'output') },
    { id: 'terminal', label: 'View: Toggle Terminal', hint: 'Ctrl+`', run: () => togglePanel(model, 'terminal') },
    { id: 'sidebar', label: 'View: Toggle Primary Side Bar Visibility', hint: 'Ctrl+B', run: () => toggleSidebar(model) },
    { id: 'clone', label: 'Git: Clone', run: () => cloneRepoPrompt(model) },
    { id: 'branch', label: 'Git: Create Branch...', run: () => createBranchPrompt(model) },
    { id: 'checkout', label: 'Git: Checkout to...', run: () => branchPicker(model) },
    { id: 'commit', label: 'Git: Commit', run: () => (model.commitMessage.trim() ? commit(model) : commitPrompt(model)) },
    { id: 'push', label: 'Git: Push', run: () => push(model) },
    { id: 'pull', label: 'Git: Pull', run: () => pull(model) },
    { id: 'sync', label: 'Git: Sync', run: () => sync(model) },
    {
      id: 'runLstr',
      label: 'Pigeon: Run LSTR Test (Current File)',
      detail: b?.root === 'repo' && b.path.endsWith('.json') ? b.path : 'open a test from pigeon/tests first',
      run: () => {
        const cur = model.activeBuffer();
        if (cur?.root === 'repo' && cur.path.startsWith('tests/') && cur.path.endsWith('.json')) runLocal(model, cur.path);
        else model.toast('warning', 'Open a Pigeon test (tests/…/*.json) first.');
      },
    },
    {
      id: 'practice',
      label: 'Pigeon Practice: Show Exercises',
      run: () => {
        model.side = 'practice';
        model.changed();
      },
    },
    { id: 'practiceCheck', label: 'Pigeon Practice: Check Exercise', run: () => checkPractice(model) },
  ];
  return items;
}

export function showPanel(model: VsModel, tab: VsModel['panelTab']): void {
  model.panelOpen = true;
  model.panelTab = tab;
  model.changed();
}

export function togglePanel(model: VsModel, tab: VsModel['panelTab']): void {
  if (model.panelOpen && model.panelTab === tab) model.panelOpen = false;
  else {
    model.panelOpen = true;
    model.panelTab = tab;
  }
  model.changed();
}

export function toggleSidebar(model: VsModel): void {
  model.side = model.side ? null : 'explorer';
  model.changed();
}

export function commandPalette(model: VsModel): void {
  model.openPalette({ placeholder: '', mode: 'commands', input: '>', items: commandItems(model) });
}

export function quickOpen(model: VsModel): void {
  const lab = getState().lab;
  const files = Object.keys(repoFiles(lab, model.repo) ?? {}).map((p) => ({ root: 'repo' as const, p }));
  const prac = Object.keys(practiceFiles(lab)).map((p) => ({ root: 'practice' as const, p }));
  const items: PaletteItem[] = [...files, ...prac].map(({ root, p }) => ({
    id: `${root}:${p}`,
    label: p.split('/').pop()!,
    detail: root === 'repo' ? `${model.repo}/${p}` : `pigeon-practice/${p}`,
    run: () => openFile(model, root, p),
  }));
  model.openPalette({ placeholder: 'Search files by name', mode: 'files', input: '', items });
}

export function gotoLinePrompt(model: VsModel): void {
  model.openPalette({
    placeholder: 'Type a line number to go to',
    mode: 'line',
    input: ':',
    items: [],
    onAccept: (t) => {
      const b = model.activeBuffer();
      const m = /^:?\s*(\d+)(?:[:,](\d+))?/.exec(t);
      if (!b || !m) return;
      const off = lineColToOffset(b.text, Number(m[1]), Number(m[2] ?? 1));
      b.selStart = b.selEnd = off;
      model.revealSeq++;
    },
  });
}

export function cloneRepoPrompt(model: VsModel): void {
  model.openPalette({
    placeholder: 'Provide repository URL or pick a repository source.',
    mode: 'prompt',
    input: '',
    items: REPOS.map((r) => ({ id: r, label: `git@github.com:labsim-lab/${r}.git`, detail: 'Clone from GitHub', run: () => cloneRepo(model, `git@github.com:labsim-lab/${r}.git`) })),
    onAccept: (t) => {
      if (t.trim()) cloneRepo(model, t);
    },
  });
}

export function openFolderPrompt(model: VsModel): void {
  const lab = getState().lab;
  const cloned = REPOS.filter((r) => !!lab.repos[r]?.local);
  model.openPalette({
    placeholder: cloned.length ? 'Open Folder (~/IdeaProjects)' : 'No folders yet — clone a repository first',
    mode: 'pick',
    input: '',
    items: cloned.length
      ? cloned.map((r) => ({ id: r, label: r, detail: `~/IdeaProjects/${r}`, run: () => openFolder(model, r) }))
      : [{ id: 'clone', label: 'Git: Clone', detail: 'Clone a repository from GitHub', run: () => cloneRepoPrompt(model) }],
  });
}

export function createBranchPrompt(model: VsModel): void {
  model.openPalette({
    placeholder: "Please provide a new branch name (Press 'Enter' to confirm or 'Escape' to cancel)",
    mode: 'prompt',
    input: '',
    items: [],
    onAccept: (t) => {
      if (t.trim()) checkout(model, t, true);
    },
  });
}

export function commitPrompt(model: VsModel): void {
  model.openPalette({
    placeholder: 'Commit message',
    mode: 'prompt',
    input: '',
    items: [],
    onAccept: (t) => {
      model.commitMessage = t;
      commit(model);
    },
  });
}

export function branchPicker(model: VsModel): void {
  const lab = getState().lab;
  const local = branchList(lab, model.repo);
  const remote = remoteBranches(lab, model.repo).filter((b) => !local.includes(b));
  const cur = lab.repos[model.repo]?.local?.branch;
  model.openPalette({
    placeholder: 'Select a branch or tag to checkout',
    mode: 'pick',
    input: '',
    items: [
      { id: '+new', label: '+ Create new branch...', run: () => createBranchPrompt(model) },
      ...local.map((b) => ({ id: b, label: b, detail: b === cur ? 'current' : 'local branch', run: () => (b === cur ? undefined : void checkout(model, b, false)) })),
      ...remote.map((b) => ({ id: `origin/${b}`, label: `origin/${b}`, detail: 'remote branch', run: () => void checkout(model, b, false) })),
    ],
  });
}

export function Palette({ model }: { model: VsModel }) {
  const p = model.palette;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
  }, [p?.placeholder, p?.mode]);
  if (!p) return null;
  const q = p.mode === 'commands' ? p.input.replace(/^>\s*/, '') : p.input;
  const items = p.mode === 'line' ? [] : p.items.filter((i) => fuzzy(`${i.label} ${p.mode === 'files' ? (i.detail ?? '') : ''}`, q)).slice(0, 60);
  const sel = Math.min(p.sel, Math.max(0, items.length - 1));
  const accept = (item?: PaletteItem) => {
    const input = p.input;
    const onAccept = p.onAccept;
    model.palette = null;
    model.focusSeq++;
    if (item) item.run(input);
    else onAccept?.(input);
    model.changed();
  };
  const lineHint = (() => {
    if (p.mode !== 'line') return null;
    const b = model.activeBuffer();
    const n = b ? b.text.split('\n').length : 0;
    return `Current Line: ${b ? b.text.slice(0, b.selStart).split('\n').length : 1}. Type a line number between 1 and ${n} to navigate to.`;
  })();
  return (
    <div className="vsc-palette" onMouseDown={(e) => e.stopPropagation()}>
      <input
        ref={inputRef}
        className="vsc-palette__input"
        value={p.input}
        placeholder={p.placeholder}
        onChange={(e) => {
          const v = e.target.value;
          // Typing ">" in Quick Open switches to commands, ":" to go-to-line (like VS Code).
          if (p.mode === 'files' && v.startsWith('>')) {
            model.palette = { ...p, mode: 'commands', input: v, items: commandItems(model), sel: 0 };
          } else if (p.mode === 'files' && v.startsWith(':')) {
            gotoLinePrompt(model);
            if (model.palette) model.palette.input = v;
          } else model.palette = { ...p, input: v, sel: 0 };
          model.changed();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            model.closePalette();
          } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const n = items.length || 1;
            model.palette = { ...p, sel: (sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n };
            model.changed();
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (p.mode === 'prompt' && (p.input.trim() || !items.length)) accept();
            else if (items[sel]) accept(items[sel]);
            else accept();
          }
        }}
        onBlur={() => setTimeout(() => model.palette === p && model.closePalette(), 150)}
      />
      {p.mode === 'prompt' && p.placeholder ? <div className="vsc-palette__msg">{p.placeholder}</div> : null}
      {lineHint ? <div className="vsc-palette__msg">{lineHint}</div> : null}
      <div className="vsc-palette__list">
        {items.map((i, k) => (
          <div key={i.id} className={`vsc-palette__item${k === sel ? ' is-sel' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => accept(i)}>
            <span className="vsc-palette__label">{i.label}</span>
            {i.detail ? <span className="vsc-palette__detail">{i.detail}</span> : null}
            {i.hint ? <span className="vsc-palette__hint">{i.hint}</span> : null}
          </div>
        ))}
        {!items.length && p.mode === 'commands' ? <div className="vsc-palette__item vsc-dim">No matching commands</div> : null}
        {!items.length && p.mode === 'files' ? <div className="vsc-palette__item vsc-dim">No matching results</div> : null}
      </div>
    </div>
  );
}
