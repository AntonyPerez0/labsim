/**
 * Project tool window (Apps §4.4): tree over the project files with compacted packages, VCS colours, speed search,
 * keyboard navigation, drag & drop (→ Move refactoring) and the context menu.
 */
import { useMemo, useRef, useState } from 'react';
import { emitAppAction, getWindowManager } from '@/computer/apps';
import type { GitRepo } from '@/sim';
import { FileIcon, IcChevronDown, IcChevronRight, IcFolder, IcLibrary, IcModule, IcScratch } from './icons';
import type { IdeModel } from './ideModel';
import { MenuCatcher, MenuList, type MenuItem } from './Menu';
import { buildTree, visibleNodes, type RunConfig, type TreeNode } from './projectModel';
import { fileStatus, type VcsStatus } from './vcs';

export interface ProjectViewProps {
  model: IdeModel;
  repo: string;
  rootLabel: string;
  files: Record<string, string>;
  /** Empty folders created in this session (shown, not tracked). */
  extraDirs: string[];
  gitRepo: GitRepo | null;
  head: Record<string, string>;
  configs: RunConfig[];
  canGit: boolean;
  onOpen(path: string): void;
  onRun(cfg: RunConfig): void;
  onOpenTerminal(): void;
}

interface Row {
  node: TreeNode;
  depth: number;
  decor?: 'libs' | 'lib' | 'scratch';
}

const LIBS = ['< 17 >', 'androidx.test.uiautomator:uiautomator:2.3.0', 'junit:junit:4.13.2'];
const LIB_TEXT: Record<string, string> = {
  '< 17 >': '// JDK 17 (/usr/lib/jvm/java-17-openjdk)\n// java.base, java.logging, java.net.http, java.sql …\n',
  'androidx.test.uiautomator:uiautomator:2.3.0': `// IntelliJ API Decompiler stub source generated from a class file
// Implementation of methods is not available

package androidx.test.uiautomator;

public class UiDevice {
    public boolean hasObject(BySelector selector) { /* compiled code */ }
    public UiObject2 findObject(BySelector selector) { /* compiled code */ }
    public <R> R wait(SearchCondition<R> condition, long timeout) { /* compiled code */ }
    public boolean pressHome() { /* compiled code */ }
    public boolean swipe(int startX, int startY, int endX, int endY, int steps) { /* compiled code */ }
}
`,
  'junit:junit:4.13.2': `// IntelliJ API Decompiler stub source generated from a class file
// Implementation of methods is not available

package org.junit;

public class Assert {
    public static void assertTrue(boolean condition) { /* compiled code */ }
    public static void assertEquals(Object expected, Object actual) { /* compiled code */ }
}
`,
};

function isTestPath(p: string) {
  return /\/(test|androidTest)\/java\//.test(p) && /Test\.java$/.test(p);
}

export function ProjectView(props: ProjectViewProps) {
  const { model, repo, files, gitRepo, head } = props;
  const paths = useMemo(() => Object.keys(files), [files]);
  const extraKey = props.extraDirs.join('|');
  const tree = useMemo(() => buildTree([...paths, ...props.extraDirs.filter((d) => !paths.some((p) => p.startsWith(`${d}/`))).map((d) => `${d}/`)]), [paths, extraKey]);
  const [menu, setMenu] = useState<{ x: number; y: number; items: MenuItem[] } | null>(null);
  const [speed, setSpeed] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const speedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const expanded = model.expanded;

  const rootNode: TreeNode = useMemo(() => ({ path: '', name: repo, kind: 'dir', role: null, children: tree }), [repo, tree]);
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [{ node: rootNode, depth: 0 }];
    if (expanded.has('')) {
      for (const v of visibleNodes(tree, expanded, 1)) out.push(v);
      const libs: TreeNode = { path: '\u0000libs', name: 'External Libraries', kind: 'dir', role: null, children: [] };
      out.push({ node: libs, depth: 0, decor: 'libs' });
      if (expanded.has('\u0000libs')) for (const l of repo === 'uia-remote' ? LIBS : LIBS.slice(0, 1)) out.push({ node: { path: `\u0000lib:${l}`, name: l, kind: 'file', role: null, children: [] }, depth: 1, decor: 'lib' });
      out.push({ node: { path: '\u0000scratch', name: 'Scratches and Consoles', kind: 'dir', role: null, children: [] }, depth: 0, decor: 'scratch' });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, rootNode, repo, model.getVersion()]);

  const statusOf = (p: string): VcsStatus => (gitRepo && props.canGit ? fileStatus(gitRepo, p, head) : 'unchanged');
  const dirStatus = useMemo(() => {
    const s = new Map<string, VcsStatus>();
    if (!gitRepo || !props.canGit) return s;
    for (const p of paths) {
      const st = fileStatus(gitRepo, p, head);
      if (st === 'modified' || st === 'added' || st === 'unversioned') {
        const segs = p.split('/');
        for (let i = 1; i < segs.length; i++) {
          const d = segs.slice(0, i).join('/');
          if (!s.has(d)) s.set(d, 'modified');
        }
      }
    }
    return s;
  }, [gitRepo, head, paths, props.canGit]);

  const select = (row: Row, emit = true) => {
    model.selectedNode = row.node.path;
    model.changed();
    if (emit && !row.decor) emitAppAction('intellij', 'intellij.tree.nodeClicked', { repo, path: row.node.path, kind: row.node.kind });
  };

  const toggle = (path: string, open?: boolean) => {
    const want = open ?? !expanded.has(path);
    if (want) expanded.add(path);
    else expanded.delete(path);
    model.changed();
  };

  const activateRow = (row: Row) => {
    if (row.node.kind === 'dir') toggle(row.node.path);
    else if (row.decor === 'lib') {
      // Library jars open read-only (decompiled view) with the "This file is read-only" banner.
      const name = row.node.name;
      const cls = name.startsWith('junit') ? 'Assert.class' : name.startsWith('androidx') ? 'UiDevice.class' : 'module-info.class';
      const text = LIB_TEXT[name] ?? `// ${name}\n// Library sources are not attached.\n`;
      model.openBuffer(`External Libraries/${name}/${cls}`, text, true);
      model.editorFocusSeq++;
      model.changed();
    } else if (!row.decor) props.onOpen(row.node.path);
  };

  const rootEl = () => listRef.current?.closest('.ij-root') as HTMLElement | null;

  const contextItems = (row: Row): MenuItem[] => {
    const n = row.node;
    const dir = n.kind === 'dir' ? n.path : n.path.split('/').slice(0, -1).join('/');
    const cfg = props.configs.find((c) => c.testPath === n.path);
    const wm = getWindowManager();
    const abs = `${props.rootLabel}${n.path ? `/${n.path}` : ''}`;
    const items: MenuItem[] = [
      {
        label: 'New',
        submenu: [
          { label: 'Java Class', onClick: () => model.openDialog({ kind: 'newClass', dir }) },
          { label: 'File', onClick: () => model.openDialog({ kind: 'newFile', dir, what: 'File' }) },
          { label: 'Directory', onClick: () => model.openDialog({ kind: 'newFile', dir, what: 'Directory' }) },
          { label: 'Package', onClick: () => model.openDialog({ kind: 'newFile', dir, what: 'Package' }) },
        ],
      },
      { separator: true },
      { label: 'Cut', kbd: 'Ctrl+X', disabled: true },
      { label: 'Copy', kbd: 'Ctrl+C', onClick: () => wm?.clipboard.write(n.name, 'intellij') },
      {
        label: 'Copy Path/Reference…',
        submenu: [
          { label: 'Absolute Path', kbd: 'Ctrl+Shift+C', onClick: () => wm?.clipboard.write(abs.replace(/^~/, '/home/engineer'), 'intellij') },
          { label: 'Path From Content Root', onClick: () => wm?.clipboard.write(n.path, 'intellij') },
        ],
      },
      { label: 'Paste', kbd: 'Ctrl+V', disabled: true },
      { separator: true },
      { label: 'Find in Files…', kbd: 'Ctrl+Shift+F', onClick: () => model.openDialog({ kind: 'findInFiles' }) },
      {
        label: 'Refactor',
        disabled: !n.path,
        submenu: [
          { label: 'Rename…', kbd: 'Shift+F6', disabled: n.kind !== 'file', onClick: () => model.openDialog({ kind: 'rename', path: n.path }) },
          { label: 'Move…', kbd: 'F6', disabled: n.kind !== 'file', onClick: () => model.openDialog({ kind: 'move', path: n.path }) },
        ],
      },
      { label: 'Delete…', kbd: 'Delete', disabled: n.kind !== 'file', onClick: () => model.openDialog({ kind: 'delete', path: n.path }) },
      { separator: true },
    ];
    if (cfg) items.push({ label: `Run '${cfg.name}'`, kbd: 'Ctrl+Shift+F10', onClick: () => props.onRun(cfg) }, { separator: true });
    items.push(
      {
        label: 'Git',
        disabled: !props.canGit,
        submenu: [
          { label: 'Add', kbd: 'Ctrl+Alt+A', disabled: n.kind !== 'file', onClick: () => model.openDialog({ kind: 'addToGit', path: n.path }) },
          { label: 'Rollback…', kbd: 'Ctrl+Alt+Z', disabled: n.kind !== 'file' || statusOf(n.path) === 'unchanged', onClick: () => model.openDialog({ kind: 'rollback', paths: [n.path] }) },
          {
            label: 'Show History',
            onClick: () => {
              model.bottomTool = 'git';
              model.changed();
            },
          },
        ],
      },
      { label: 'Open In', submenu: [{ label: 'Terminal', onClick: props.onOpenTerminal }] },
    );
    return items;
  };

  const onContextMenu = (e: React.MouseEvent, row: Row) => {
    e.preventDefault();
    if (row.decor) return;
    select(row, false);
    const r = rootEl()?.getBoundingClientRect();
    setMenu({ x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0), items: contextItems(row) });
  };

  const selectedIndex = rows.findIndex((r) => r.node.path === model.selectedNode);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const cur = rows[selectedIndex] ?? rows[0];
    const move = (i: number) => {
      const r = rows[Math.max(0, Math.min(rows.length - 1, i))];
      if (r && r.node.path !== model.selectedNode) select(r);
      listRef.current?.querySelectorAll('[data-row]')[Math.max(0, Math.min(rows.length - 1, i))]?.scrollIntoView({ block: 'nearest' });
    };
    if (e.key === 'ArrowDown') move(selectedIndex + 1);
    else if (e.key === 'ArrowUp') move(selectedIndex - 1);
    else if (e.key === 'ArrowRight') {
      if (cur.node.kind === 'dir' && !expanded.has(cur.node.path)) toggle(cur.node.path, true);
      else move(selectedIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      if (cur.node.kind === 'dir' && expanded.has(cur.node.path)) toggle(cur.node.path, false);
      else {
        for (let i = selectedIndex - 1; i >= 0; i--) if (rows[i].depth < cur.depth) return (move(i), e.preventDefault());
      }
    } else if (e.key === 'Enter') {
      if (cur) {
        if (!cur.decor) emitAppAction('intellij', 'intellij.tree.nodeClicked', { repo, path: cur.node.path, kind: cur.node.kind });
        activateRow(cur);
      }
    } else if (e.key === 'F6' && !e.shiftKey && cur?.node.kind === 'file') model.openDialog({ kind: 'move', path: cur.node.path });
    else if (e.key === 'F6' && e.shiftKey && cur?.node.kind === 'file') model.openDialog({ kind: 'rename', path: cur.node.path });
    else if (e.key === 'Delete' && cur?.node.kind === 'file' && !cur.decor) model.openDialog({ kind: 'delete', path: cur.node.path });
    else if (e.key === 'Escape' && speed) setSpeed('');
    else if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey && /\S/.test(e.key)) {
      const q = speed + e.key;
      setSpeed(q);
      if (speedTimer.current) clearTimeout(speedTimer.current);
      speedTimer.current = setTimeout(() => setSpeed(''), 2500);
      const idx = rows.findIndex((r, i) => i >= Math.max(0, selectedIndex) && r.node.name.toLowerCase().includes(q.toLowerCase()));
      const any = idx >= 0 ? idx : rows.findIndex((r) => r.node.name.toLowerCase().includes(q.toLowerCase()));
      if (any >= 0) move(any);
    } else if (e.key === 'Backspace' && speed) setSpeed(speed.slice(0, -1));
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  const label = (row: Row) => {
    const n = row.node;
    const st = n.kind === 'file' ? statusOf(n.path) : (dirStatus.get(n.path) ?? 'unchanged');
    const cls = st === 'unchanged' ? '' : `ij-vcs-${st}`;
    if (!speed) return <span className={cls}>{n.name}</span>;
    const i = n.name.toLowerCase().indexOf(speed.toLowerCase());
    if (i < 0) return <span className={cls}>{n.name}</span>;
    return (
      <span className={cls}>
        {n.name.slice(0, i)}
        <span className="ij-hl">{n.name.slice(i, i + speed.length)}</span>
        {n.name.slice(i + speed.length)}
      </span>
    );
  };

  return (
    <>
      <div className="ij-tree" ref={listRef} tabIndex={0} role="tree" aria-label="Project" onKeyDown={onKeyDown}>
        {rows.map((row, i) => {
          const n = row.node;
          const open = n.kind === 'dir' && expanded.has(n.path);
          const isDir = n.kind === 'dir';
          const draggable = n.kind === 'file' && !row.decor;
          return (
            <div
              key={n.path || '\u0000root'}
              data-row
              role="treeitem"
              aria-expanded={isDir ? open : undefined}
              aria-selected={i === selectedIndex}
              data-hint={row.decor ? undefined : `intellij.treeNode:${n.path}`}
              className={`ij-tree-row${i === selectedIndex ? ' ij-selected' : ''}${dropTarget === n.path && isDir ? ' ij-dropping' : ''}`}
              style={{ paddingLeft: 4 + row.depth * 18 }}
              draggable={draggable}
              onDragStart={(e) => {
                e.dataTransfer.setData('text/x-ij-path', n.path);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                if (!isDir || row.decor) return;
                e.preventDefault();
                setDropTarget(n.path);
              }}
              onDragLeave={() => setDropTarget((d) => (d === n.path ? null : d))}
              onDrop={(e) => {
                const from = e.dataTransfer.getData('text/x-ij-path');
                setDropTarget(null);
                if (!from || !isDir || row.decor) return;
                e.preventDefault();
                const curDir = from.split('/').slice(0, -1).join('/');
                if (curDir === n.path) return;
                model.openDialog({ kind: 'move', path: from, targetDir: n.path });
              }}
              onMouseDown={(e) => {
                if (e.button === 0) select(row);
              }}
              onDoubleClick={() => activateRow(row)}
              onContextMenu={(e) => onContextMenu(e, row)}
            >
              <span
                className="ij-twisty"
                onMouseDown={(e) => {
                  if (!isDir) return;
                  e.stopPropagation();
                  toggle(n.path);
                }}
              >
                {isDir && (row.decor !== 'scratch' || false) ? open ? <IcChevronDown size={12} /> : <IcChevronRight size={12} /> : null}
              </span>
              {row.decor === 'libs' || row.decor === 'lib' ? (
                <IcLibrary />
              ) : row.decor === 'scratch' ? (
                <IcScratch />
              ) : !n.path ? (
                <IcModule />
              ) : isDir ? (
                <IcFolder role={n.role} open={open} />
              ) : (
                <FileIcon path={n.path} test={isTestPath(n.path)} />
              )}
              {!n.path ? (
                <>
                  <span className="ij-tree-bold">{repo}</span>
                  <span className="ij-tree-path">{props.rootLabel}</span>
                </>
              ) : (
                label(row)
              )}
            </div>
          );
        })}
      </div>
      {speed ? (
        <div className="ij-speed" style={{ left: 30, top: 28 }}>
          {speed}
        </div>
      ) : null}
      {menu ? (
        <>
          <MenuCatcher onClose={() => setMenu(null)} />
          <MenuList items={menu.items} x={menu.x} y={menu.y} onClose={() => setMenu(null)} />
        </>
      ) : null}
    </>
  );
}
