/**
 * IntelliJ keymap (Windows/Linux, Apps §4.12) → command ids handled by ProjectWindow's `cmd()`; plus the persisted
 * splitter layout and the status-bar progress hook. Browser-reserved keys have [game] substitutes (Alt+Shift+W
 * close tab, Alt+Shift+U update project, Alt+Shift+B branches).
 */
import { useEffect, useState } from 'react';
import type { IdeModel } from './ideModel';

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function keyToCommand(e: KeyLike): string | null {
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key;
  const low = k.length === 1 ? k.toLowerCase() : k;
  let id: string | null = null;
  if (ctrl && !e.shiftKey && !e.altKey && low === 's') id = 'save';
  else if (ctrl && e.altKey && low === 's') id = 'settings';
  else if (ctrl && !e.shiftKey && !e.altKey && low === 'f') id = 'find';
  else if (ctrl && !e.shiftKey && !e.altKey && low === 'r') id = 'replace';
  else if (k === 'F3') id = e.shiftKey ? 'findPrev' : 'findNext';
  else if (ctrl && e.shiftKey && low === 'f') id = 'findInFiles';
  else if (ctrl && !e.shiftKey && !e.altKey && low === 'g') id = 'gotoLine';
  else if (ctrl && e.shiftKey && low === 'n') id = 'gotoFile';
  else if (ctrl && !e.shiftKey && !e.altKey && low === 'e') id = 'recentFiles';
  else if (ctrl && e.altKey && k === 'ArrowLeft') id = 'back';
  else if (ctrl && e.altKey && k === 'ArrowRight') id = 'forward';
  else if (k === 'F6' && !ctrl) id = e.shiftKey ? 'rename' : 'move';
  else if (ctrl && k === 'F9') id = 'build';
  else if (e.shiftKey && k === 'F10') id = 'run';
  else if (e.shiftKey && k === 'F9') id = 'debug';
  else if (ctrl && k === 'F2') id = 'stop';
  else if (ctrl && e.shiftKey && low === 'k') id = 'push';
  else if (ctrl && !e.shiftKey && !e.altKey && low === 'k') id = 'commit';
  else if ((ctrl && e.shiftKey && (k === '`' || k === '~')) || (e.altKey && e.shiftKey && low === 'b')) id = 'branches';
  else if (e.altKey && e.shiftKey && low === 'u') id = 'update';
  else if (ctrl && k === 'F4') id = 'closeTab';
  else if (e.altKey && e.shiftKey && low === 'w') id = 'closeTab';
  else if (e.altKey && !ctrl && !e.shiftKey && /^[0-9]$/.test(k)) id = { '1': 'tw:project', '0': 'tw:commit', '4': 'tw:run', '6': 'tw:problems', '9': 'tw:git' }[k] ?? null;
  else if (e.altKey && k === 'F12') id = 'tw:terminal';
  else if (e.altKey && !ctrl && k === 'Enter') id = 'contextActions';
  return id;
}


const LAYOUT_KEY = 'labsim.intellij.layout';
export function loadLayout(): { left: number; bottom: number } | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null');
    return v && typeof v.left === 'number' && typeof v.bottom === 'number' ? v : null;
  } catch {
    return null;
  }
}

export function saveLayout(left: number, bottom: number) {
  try {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify({ left, bottom }));
  } catch {
    /* per-viewer convenience */
  }
}

export function useLiveProgress(model: IdeModel): string | null {
  const [, force] = useState(0);
  const p = model.progress;
  useEffect(() => {
    if (!p) return;
    const t = setTimeout(() => force((x) => x + 1), Math.max(0, p.until - performance.now()) + 20);
    return () => clearTimeout(t);
  }, [p]);
  return p && performance.now() < p.until ? p.label : null;
}

/** Search Everywhere → Actions tab entries. */
export function actionEntries(runConfig: string | null, cmd: (id: string) => void): { label: string; kbd?: string; run(): void }[] {
  return [
    ['Commit…', 'Ctrl+K', 'commit'],
    ['Push…', 'Ctrl+Shift+K', 'push'],
    ['Update Project…', 'Alt+Shift+U', 'update'],
    ['Pull…', '', 'pull'],
    ['Branches…', 'Ctrl+Shift+`', 'branches'],
    ['New Branch…', '', 'newBranch'],
    ['Build Project', 'Ctrl+F9', 'build'],
    [`Run '${runConfig ?? ''}'`, 'Shift+F10', 'run'],
    ['Stop', 'Ctrl+F2', 'stop'],
    ['Edit Configurations…', '', 'editConfigs'],
    ['Reformat Code', 'Ctrl+Alt+L', 'reformat'],
    ['Find in Files…', 'Ctrl+Shift+F', 'findInFiles'],
    ['Settings…', 'Ctrl+Alt+S', 'settings'],
    ['Get from Version Control…', '', 'getFromVcs'],
    ['Code With Me…', '', 'codeWithMe'],
    ['About', '', 'about'],
  ].map(([label, kbd, id]) => ({ label, kbd: kbd || undefined, run: () => cmd(id) }));
}

/** Tool-window splitter drag (sizes persist per viewer). */
export function startSplitterDrag(model: IdeModel, kind: 'left' | 'bottom', e: React.MouseEvent): void {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const w0 = model.leftWidth;
  const h0 = model.bottomHeight;
  const move = (ev: MouseEvent) => {
    if (kind === 'left') model.leftWidth = Math.max(160, Math.min(700, w0 + ev.clientX - startX));
    else model.bottomHeight = Math.max(90, Math.min(700, h0 - (ev.clientY - startY)));
    model.changed();
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    saveLayout(model.leftWidth, model.bottomHeight);
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}
