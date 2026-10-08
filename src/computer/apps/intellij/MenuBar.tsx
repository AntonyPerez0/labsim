/** Main menu (Apps §4.11). Items not listed in the spec render disabled. */
import { useState } from 'react';
import { MenuCatcher, MenuList, type MenuItem } from './Menu';
import { rootPoint, useIdeRoot } from './rootContext';

export type Cmd = (id: string) => void;

export interface MenuState {
  hasProject: boolean;
  hasEditor: boolean;
  canGit: boolean;
  runConfig: string | null;
  running: boolean;
  recentProjects: string[];
}

export function buildMenus(cmd: Cmd, st: MenuState): [string, MenuItem[]][] {
  const p = !st.hasProject;
  const e = !st.hasEditor;
  const g = !st.canGit || p;
  const cfg = st.runConfig;
  return [
    [
      'File',
      [
        {
          label: 'New',
          submenu: [
            { label: 'Project from Version Control…', onClick: () => cmd('getFromVcs') },
            { separator: true },
            { label: 'Java Class', disabled: p, onClick: () => cmd('newClass') },
            { label: 'File', disabled: p, onClick: () => cmd('newFile') },
            { label: 'Directory', disabled: p, onClick: () => cmd('newDirectory') },
            { label: 'Package', disabled: p, onClick: () => cmd('newPackage') },
          ],
        },
        { label: 'Open…', onClick: () => cmd('openProject') },
        { label: 'Recent Projects', disabled: !st.recentProjects.length, submenu: st.recentProjects.map((r) => ({ label: r, onClick: () => cmd(`openRecent:${r}`) })) },
        { label: 'Close Project', disabled: p, onClick: () => cmd('closeProject') },
        { separator: true },
        { label: 'Settings…', kbd: 'Ctrl+Alt+S', onClick: () => cmd('settings') },
        { label: 'Project Structure…', kbd: 'Ctrl+Alt+Shift+S', disabled: true },
        { separator: true },
        { label: 'Save All', kbd: 'Ctrl+S', disabled: p, onClick: () => cmd('save') },
        { label: 'Reload All from Disk', kbd: 'Ctrl+Alt+Y', disabled: true },
        { separator: true },
        { label: 'Exit', onClick: () => cmd('exit') },
      ],
    ],
    [
      'Edit',
      [
        { label: 'Undo', kbd: 'Ctrl+Z', disabled: e, onClick: () => cmd('undo') },
        { label: 'Redo', kbd: 'Ctrl+Shift+Z', disabled: e, onClick: () => cmd('redo') },
        { separator: true },
        { label: 'Cut', kbd: 'Ctrl+X', disabled: e, onClick: () => cmd('cut') },
        { label: 'Copy', kbd: 'Ctrl+C', disabled: e, onClick: () => cmd('copy') },
        { label: 'Paste', kbd: 'Ctrl+V', disabled: e, onClick: () => cmd('paste') },
        { separator: true },
        { label: 'Select All', kbd: 'Ctrl+A', disabled: e, onClick: () => cmd('selectAll') },
        {
          label: 'Find',
          submenu: [
            { label: 'Find…', kbd: 'Ctrl+F', disabled: e, onClick: () => cmd('find') },
            { label: 'Replace…', kbd: 'Ctrl+R', disabled: e, onClick: () => cmd('replace') },
            { label: 'Find Next / Move to Next Occurrence', kbd: 'F3', disabled: e, onClick: () => cmd('findNext') },
            { label: 'Find Previous / Move to Previous Occurrence', kbd: 'Shift+F3', disabled: e, onClick: () => cmd('findPrev') },
            { separator: true },
            { label: 'Find in Files…', kbd: 'Ctrl+Shift+F', disabled: p, onClick: () => cmd('findInFiles') },
          ],
        },
      ],
    ],
    [
      'View',
      [
        {
          label: 'Tool Windows',
          disabled: p,
          submenu: [
            { label: 'Project', kbd: 'Alt+1', onClick: () => cmd('tw:project') },
            { label: 'Commit', kbd: 'Alt+0', onClick: () => cmd('tw:commit') },
            { label: 'Run', kbd: 'Alt+4', onClick: () => cmd('tw:run') },
            { label: 'Problems', kbd: 'Alt+6', onClick: () => cmd('tw:problems') },
            { label: 'Git', kbd: 'Alt+9', onClick: () => cmd('tw:git') },
            { label: 'Terminal', kbd: 'Alt+F12', onClick: () => cmd('tw:terminal') },
            { label: 'TODO', onClick: () => cmd('tw:todo') },
          ],
        },
        { label: 'Appearance', disabled: true },
        { label: 'Quick Definition', kbd: 'Ctrl+Shift+I', disabled: true },
      ],
    ],
    [
      'Navigate',
      [
        { label: 'Back', kbd: 'Ctrl+Alt+Left', disabled: p, onClick: () => cmd('back') },
        { label: 'Forward', kbd: 'Ctrl+Alt+Right', disabled: p, onClick: () => cmd('forward') },
        { separator: true },
        { label: 'Search Everywhere', kbd: 'Double Shift', disabled: p, onClick: () => cmd('searchEverywhere') },
        { label: 'File…', kbd: 'Ctrl+Shift+N', disabled: p, onClick: () => cmd('gotoFile') },
        { label: 'Line/Column…', kbd: 'Ctrl+G', disabled: e, onClick: () => cmd('gotoLine') },
        { label: 'Recent Files', kbd: 'Ctrl+E', disabled: p, onClick: () => cmd('recentFiles') },
      ],
    ],
    [
      'Code',
      [
        { label: 'Show Context Actions', kbd: 'Alt+Enter', disabled: e, onClick: () => cmd('contextActions') },
        { separator: true },
        { label: 'Comment with Line Comment', kbd: 'Ctrl+/', disabled: e, onClick: () => cmd('comment') },
        { label: 'Reformat Code', kbd: 'Ctrl+Alt+L', disabled: e, onClick: () => cmd('reformat') },
        { separator: true },
        { label: 'Move Statement Down', kbd: 'Ctrl+Shift+Down', disabled: e, onClick: () => cmd('moveStatementDown') },
        { label: 'Move Statement Up', kbd: 'Ctrl+Shift+Up', disabled: e, onClick: () => cmd('moveStatementUp') },
        { label: 'Move Line Down', kbd: 'Alt+Shift+Down', disabled: e, onClick: () => cmd('moveLineDown') },
        { label: 'Move Line Up', kbd: 'Alt+Shift+Up', disabled: e, onClick: () => cmd('moveLineUp') },
      ],
    ],
    [
      'Refactor',
      [
        { label: 'Rename…', kbd: 'Shift+F6', disabled: p, onClick: () => cmd('rename') },
        { label: 'Move…', kbd: 'F6', disabled: p, onClick: () => cmd('move') },
        { label: 'Extract Method…', kbd: 'Ctrl+Alt+M', disabled: true },
      ],
    ],
    [
      'Build',
      [
        { label: 'Build Project', kbd: 'Ctrl+F9', disabled: p, onClick: () => cmd('build') },
        { label: 'Rebuild Project', disabled: true },
      ],
    ],
    [
      'Run',
      [
        { label: cfg ? `Run '${cfg}'` : 'Run…', kbd: 'Shift+F10', disabled: p || !cfg, onClick: () => cmd('run') },
        { label: cfg ? `Debug '${cfg}'` : 'Debug…', kbd: 'Shift+F9', disabled: p || !cfg, onClick: () => cmd('debug') },
        { label: 'Stop', kbd: 'Ctrl+F2', disabled: !st.running, onClick: () => cmd('stop') },
        { separator: true },
        { label: 'Edit Configurations…', disabled: p, onClick: () => cmd('editConfigs') },
      ],
    ],
    ['Tools', [{ label: 'Code With Me…', onClick: () => cmd('codeWithMe') }, { label: 'Generate JavaDoc…', disabled: true }]],
    [
      'Git',
      [
        { label: 'Commit…', kbd: 'Ctrl+K', disabled: g, onClick: () => cmd('commit') },
        { label: 'Push…', kbd: 'Ctrl+Shift+K', disabled: g, onClick: () => cmd('push') },
        { label: 'Update Project…', kbd: 'Alt+Shift+U', disabled: g, onClick: () => cmd('update') },
        { label: 'Pull…', disabled: g, onClick: () => cmd('pull') },
        { separator: true },
        { label: 'Branches…', kbd: 'Ctrl+Shift+`', disabled: g, onClick: () => cmd('branches') },
        { label: 'New Branch…', disabled: g, onClick: () => cmd('newBranch') },
        { separator: true },
        { label: 'Show History', disabled: g, onClick: () => cmd('tw:git') },
        { label: 'Rollback…', kbd: 'Ctrl+Alt+Z', disabled: g, onClick: () => cmd('tw:commit') },
      ],
    ],
    ['Window', [{ label: 'Restore Default Layout', kbd: 'Shift+F12', onClick: () => cmd('defaultLayout') }]],
    ['Help', [{ label: 'Keyboard Shortcuts PDF', disabled: true }, { separator: true }, { label: 'About', onClick: () => cmd('about') }]],
  ];
}

export function MenuBar({ menus }: { menus: [string, MenuItem[]][] }) {
  const root = useIdeRoot();
  const [open, setOpen] = useState<{ i: number; x: number; y: number } | null>(null);
  const show = (i: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const p = rootPoint(root, r.left, r.bottom);
    setOpen({ i, x: p.x, y: p.y });
  };
  return (
    <div className="ij-menubar" role="menubar">
      {menus.map(([name], i) => (
        <button
          key={name}
          type="button"
          role="menuitem"
          aria-haspopup="menu"
          aria-expanded={open?.i === i}
          className={`ij-menubar-item${open?.i === i ? ' ij-open' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            if (open?.i === i) setOpen(null);
            else show(i, e.currentTarget);
          }}
          onMouseEnter={(e) => open && open.i !== i && show(i, e.currentTarget)}
        >
          <span>{name}</span>
        </button>
      ))}
      {open ? (
        <>
          <MenuCatcher top={26} onClose={() => setOpen(null)} />
          <MenuList key={open.i} items={menus[open.i][1]} x={open.x} y={open.y} onClose={() => setOpen(null)} />
        </>
      ) : null}
    </div>
  );
}
