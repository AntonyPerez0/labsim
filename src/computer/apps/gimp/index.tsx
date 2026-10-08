/**
 * GIMP 2.10 (single-window mode, Dark theme) — GIMP-lite for coordinate extraction (docs/design/50-computer-apps.md §6).
 * Opens workstation images (webcam snapshots, ADB screencaps, receipts) through the image store / materializer,
 * rectangle selection with Position/Size read-out, Pointer dialog with device mm, Pigeon JSON copy.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getState, useGame } from '@/core/store';
import { APP_ROUTES, emitAppAction, getImage, getWindowManager, matchRoute, type AppProps } from '@/computer/apps';
import { GimpCanvas, type View } from './Canvas';
import { LayersDock, PointerDock, ToolOptions, Toolbox } from './Docks';
import { ContextMenu, MenuBar, type MenuDef, type MenuItem } from './Menus';
import { FUNCTIONAL, TOOL_INFO, addRecent, baseName, clampSel, imagesOf, memSize, moveSel, recentFiles, screencapDevice, stem, toUnit, zoomIn, zoomOut, type OpenImage, type Sel, type Tool, type Unit } from './model';
import './gimp.css';

const IMAGE_EXT = /\.(png|jpe?g)$/i;

function routeOf(path: string): string {
  return `/image/${path}`;
}

export function GimpApp(props: AppProps) {
  const route = props.route ?? props.params?.route ?? '/';
  const m = matchRoute(APP_ROUTES.gimp.image, route);
  const activePath = m ? m.params.path! : null;
  const { onTitle, navigate: nav, windowId } = props;
  const wm = props.wm ?? getWindowManager();
  const focused = props.focused !== false;
  const images = imagesOf(windowId);
  const [, force] = useState(0);
  const rerender = useCallback(() => force((n) => n + 1), []);
  const [tool, setToolState] = useState<Tool>('rect');
  const [unit, setUnit] = useState<Unit>('px');
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [measure, setMeasure] = useState<{ dx: number; dy: number } | null>(null);
  const [picked, setPicked] = useState<[number, number, number] | null>(null);
  const [docks, setDocks] = useState(true);
  const [zoomOutOpt, setZoomOutOpt] = useState(false);
  const [space, setSpace] = useState(false);
  const [views, setViews] = useState<Record<string, View>>({});
  const [fitKeys, setFitKeys] = useState<Record<string, number>>({});
  const [dialog, setDialog] = useState<null | { title: string; text: string }>(null);
  const [ctxMenu, setCtxMenu] = useState<null | { x: number; y: number }>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const files = useGame((s) => s.lab.workstation?.files);
  const selTimer = useRef<number | null>(null);

  const navigate = useCallback(
    (r: string, opts?: { replace?: boolean }) => {
      if (nav) nav(r, opts);
      else getWindowManager()?.navigate(windowId, r, opts);
    },
    [nav, windowId],
  );

  const cur = activePath ? images.find((i) => i.path === activePath) ?? null : null;

  // Open the routed image if it is not open yet.
  useEffect(() => {
    if (!activePath || images.some((i) => i.path === activePath)) return;
    const img: OpenImage = { path: activePath, ref: null, entry: null, error: null, sel: null, undo: [], redo: [], zoom: null, scroll: null };
    images.push(img);
    rerender();
    const ref = getState().lab.workstation?.files?.[activePath];
    if (!IMAGE_EXT.test(activePath) || typeof ref !== 'string' || !ref.startsWith('img:')) {
      img.error = `Opening '${activePath.replace(/^~/, '/home/engineer')}' failed:\n\nCould not open '${activePath.replace(/^~/, '/home/engineer')}' for reading: No such file or directory`;
      rerender();
      return;
    }
    img.ref = ref;
    setMessage(`Opening '${activePath.replace(/^~/, '/home/engineer')}'`);
    // The materializer is registered asynchronously by initComputer(); retry briefly before giving up.
    const load = async () => {
      for (let i = 0; i < 12; i++) {
        const e = await getImage(ref);
        if (e) return e;
        await new Promise((r) => window.setTimeout(r, 250));
      }
      return null;
    };
    load()
      .then((entry) => {
        if (!entry) {
          img.error = `Opening '${activePath}' failed:\n\nUnknown image format`;
        } else {
          img.entry = entry;
          addRecent(activePath);
          emitAppAction('gimp', 'gimp.image.opened', { path: activePath, ref, width: entry.width, height: entry.height });
        }
        setMessage(null);
        rerender();
      })
      .catch(() => {
        img.error = `Opening '${activePath}' failed`;
        setMessage(null);
        rerender();
      });
  }, [activePath, images, rerender]);

  const title = cur?.entry
    ? `[${stem(cur.path)}] (imported)-1.0 (RGB color 8-bit gamma integer, GIMP built-in sRGB, 1 layer) ${cur.entry.width}x${cur.entry.height} – GIMP`
    : 'GNU Image Manipulation Program';
  useEffect(() => onTitle?.(title), [title, onTitle]);

  const W = cur?.entry?.width ?? 0;
  const H = cur?.entry?.height ?? 0;
  const view = cur ? views[cur.path] ?? { zoom: 1, cx: W / 2, cy: H / 2 } : { zoom: 1, cx: 0, cy: 0 };
  const setView = useCallback(
    (v: View) => {
      if (!activePath) return;
      setViews((vs) => ({ ...vs, [activePath]: { zoom: Math.max(0.0625, Math.min(32, v.zoom)), cx: v.cx, cy: v.cy } }));
    },
    [activePath],
  );

  const emitSel = (img: OpenImage) => {
    if (selTimer.current) window.clearTimeout(selTimer.current);
    selTimer.current = window.setTimeout(() => {
      const s = img.sel;
      if (!s || !img.ref) return;
      emitAppAction('gimp', 'gimp.selection.changed', { path: img.path, ref: img.ref, x: s.x, y: s.y, w: s.w, h: s.h });
    }, 300);
  };

  const setSel = (s: Sel | null, record = true) => {
    if (!cur || !cur.entry) return;
    const next = s ? clampSel(s, W, H) : null;
    const same = (a: Sel | null, b: Sel | null) => (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
    if (same(cur.sel, next)) return;
    if (record) {
      cur.undo.push(cur.sel);
      if (cur.undo.length > 100) cur.undo.shift();
      cur.redo = [];
    }
    cur.sel = next && next.w > 0 && next.h > 0 ? next : null;
    rerender();
    if (cur.sel) emitSel(cur);
  };

  const copyPigeon = () => {
    const s = cur?.sel;
    if (!s) {
      setMessage('There is no selection to copy.');
      return;
    }
    const text = `"x": ${s.x}, "y": ${s.y}, "w": ${s.w}, "h": ${s.h}`;
    wm?.clipboard.write(text, 'gimp');
    emitAppAction('gimp', 'gimp.selection.copied', { x: s.x, y: s.y, w: s.w, h: s.h, format: 'pigeon-json', text });
    setMessage(`Copied selection bounds: x ${s.x}, y ${s.y}, w ${s.w}, h ${s.h}`);
  };

  const copyField = (text: string) => {
    const s = cur?.sel;
    wm?.clipboard.write(text, 'gimp');
    if (s) emitAppAction('gimp', 'gimp.selection.copied', { x: s.x, y: s.y, w: s.w, h: s.h, format: 'field', text });
  };

  const openDialog = async () => {
    if (!wm) return;
    const p = await wm.pickFile({ title: 'Open Image', mode: 'open', filter: 'images', startDir: '~/Pictures' });
    if (p) navigate(routeOf(p));
  };

  const closeImage = (path: string) => {
    const i = images.findIndex((x) => x.path === path);
    if (i < 0) return;
    images.splice(i, 1);
    rerender();
    if (path === activePath) {
      const next = images[Math.min(i, images.length - 1)];
      navigate(next ? routeOf(next.path) : '/');
    }
  };

  const exportDisabled = () => setDialog({ title: 'Export Image', text: 'Export is disabled on this workstation image' });

  const setTool = (t: Tool) => {
    if (!FUNCTIONAL.has(t)) {
      setMessage('This tool is not available in GIMP-lite');
      return;
    }
    setToolState(t);
    setMessage(null);
  };

  const fit = () => activePath && setFitKeys((k) => ({ ...k, [activePath]: (k[activePath] ?? 0) + 1 }));
  const zoomTo = (z: number) => setView({ ...view, zoom: z });
  const undo = () => {
    if (!cur || !cur.undo.length) return;
    cur.redo.push(cur.sel);
    cur.sel = cur.undo.pop() ?? null;
    rerender();
    if (cur.sel) emitSel(cur);
  };
  const redo = () => {
    if (!cur || !cur.redo.length) return;
    cur.undo.push(cur.sel);
    cur.sel = cur.redo.pop() ?? null;
    rerender();
    if (cur.sel) emitSel(cur);
  };

  // keyboard (Apps §6.6)
  useEffect(() => {
    if (!focused) return;
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (ctrl && k === 'o') return void (e.preventDefault(), openDialog());
      if (ctrl && k === 's') return void (e.preventDefault(), exportDisabled());
      if (ctrl && e.shiftKey && k === 'e') return void (e.preventDefault(), exportDisabled());
      if (typing) return;
      if (ctrl && e.shiftKey && k === 'j') return void (e.preventDefault(), fit());
      if (ctrl && e.shiftKey && k === 'a') return void (e.preventDefault(), setSel(null));
      if (ctrl && k === 'a') return void (e.preventDefault(), cur?.entry && setSel({ x: 0, y: 0, w: W, h: H }));
      if (ctrl && k === 'z') return void (e.preventDefault(), undo());
      if (ctrl && k === 'y') return void (e.preventDefault(), redo());
      if (ctrl) return;
      if (e.key === ' ' && !e.repeat) {
        e.preventDefault();
        setSpace(true);
        return;
      }
      if (e.key === 'Tab') return void (e.preventDefault(), setDocks((d) => !d));
      if (e.shiftKey && k === 'm') return void (e.preventDefault(), setTool('measure'));
      if (!e.shiftKey && k === 'r') return void (e.preventDefault(), setTool('rect'));
      if (!e.shiftKey && k === 'm') return void (e.preventDefault(), setTool('move'));
      if (!e.shiftKey && k === 'z') return void (e.preventDefault(), setTool('zoom'));
      if (!e.shiftKey && k === 'o') return void (e.preventDefault(), setTool('picker'));
      if (e.key === '+' || e.key === '=') return void (e.preventDefault(), zoomTo(zoomIn(view.zoom)));
      if (e.key === '-') return void (e.preventDefault(), zoomTo(zoomOut(view.zoom)));
      if (e.key === '1') return void (e.preventDefault(), zoomTo(1));
      if (e.key === '2') return void (e.preventDefault(), zoomTo(2));
      if (e.key.startsWith('Arrow') && cur?.sel && tool === 'rect') {
        e.preventDefault();
        const d = e.shiftKey ? 25 : 1;
        const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
        const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
        setSel(moveSel(cur.sel, dx, dy, W, H));
        return;
      }
      if (e.key === 'Escape') {
        if (dialog) {
          e.preventDefault();
          e.stopPropagation();
          setDialog(null);
        }
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') setSpace(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  });

  const hasImg = !!cur?.entry;
  const zoomMenu: MenuItem[] = [
    { label: 'Zoom In', shortcut: '+', onClick: () => zoomTo(zoomIn(view.zoom)), disabled: !hasImg },
    { label: 'Zoom Out', shortcut: '-', onClick: () => zoomTo(zoomOut(view.zoom)), disabled: !hasImg },
    { label: 'Fit Image in Window', shortcut: 'Shift+Ctrl+J', onClick: fit, disabled: !hasImg },
    { separator: true, label: '' },
    { label: '1:1  (100%)', shortcut: '1', onClick: () => zoomTo(1), disabled: !hasImg },
    { label: '2:1  (200%)', shortcut: '2', onClick: () => zoomTo(2), disabled: !hasImg },
    { label: '4:1  (400%)', shortcut: '3', onClick: () => zoomTo(4), disabled: !hasImg },
    { label: '8:1  (800%)', shortcut: '4', onClick: () => zoomTo(8), disabled: !hasImg },
  ];
  const copyItem: MenuItem = { label: 'Copy selection as Pigeon JSON', onClick: copyPigeon, disabled: !cur?.sel };
  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New…', shortcut: 'Ctrl+N', disabled: true },
        { label: 'Open…', shortcut: 'Ctrl+O', onClick: () => void openDialog() },
        { label: 'Open as Layers…', shortcut: 'Ctrl+Alt+O', disabled: true },
        { label: 'Open Recent', submenu: recentFiles().length ? recentFiles().map((p, i) => ({ label: `${baseName(p)}`, shortcut: `Ctrl+${i + 1}`, onClick: () => navigate(routeOf(p)) })) : [{ label: '(empty)', disabled: true }] },
        { separator: true, label: '' },
        { label: 'Save', shortcut: 'Ctrl+S', onClick: exportDisabled, disabled: !hasImg },
        { label: 'Export As…', shortcut: 'Shift+Ctrl+E', onClick: exportDisabled, disabled: !hasImg },
        { label: `Overwrite ${cur ? baseName(cur.path) : ''}`, onClick: exportDisabled, disabled: !hasImg },
        { separator: true, label: '' },
        { label: 'Close View', shortcut: 'Ctrl+W', onClick: () => cur && closeImage(cur.path), disabled: !cur },
        { label: 'Close all', shortcut: 'Shift+Ctrl+W', onClick: () => [...images].forEach((i) => closeImage(i.path)), disabled: !images.length },
        { label: 'Quit', shortcut: 'Ctrl+Q', onClick: () => wm?.close(windowId) },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo Rectangle Select', shortcut: 'Ctrl+Z', onClick: undo, disabled: !cur?.undo.length },
        { label: 'Redo', shortcut: 'Ctrl+Y', onClick: redo, disabled: !cur?.redo.length },
        { separator: true, label: '' },
        { label: 'Cut', shortcut: 'Ctrl+X', disabled: true },
        { label: 'Copy', shortcut: 'Ctrl+C', disabled: true },
        { label: 'Paste', shortcut: 'Ctrl+V', disabled: true },
      ],
    },
    {
      label: 'Select',
      items: [
        { label: 'All', shortcut: 'Ctrl+A', onClick: () => hasImg && setSel({ x: 0, y: 0, w: W, h: H }), disabled: !hasImg },
        { label: 'None', shortcut: 'Shift+Ctrl+A', onClick: () => setSel(null), disabled: !cur?.sel },
        { label: 'Invert', shortcut: 'Ctrl+I', disabled: true },
        { separator: true, label: '' },
        { label: 'Rectangle Select', shortcut: 'R', onClick: () => setTool('rect') },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Zoom', submenu: zoomMenu },
        { label: 'Show Rulers', shortcut: 'Shift+Ctrl+R', checked: true, disabled: true },
        { label: 'Show Statusbar', checked: true, disabled: true },
      ],
    },
    { label: 'Image', items: [{ label: 'Canvas Size…', disabled: true }, { label: 'Scale Image…', disabled: true }, { label: 'Image Properties', shortcut: 'Alt+Return', disabled: true }] },
    { label: 'Layer', items: [{ label: 'New Layer…', shortcut: 'Shift+Ctrl+N', disabled: true }] },
    { label: 'Colors', items: [{ label: 'Levels…', disabled: true }, { label: 'Curves…', disabled: true }] },
    {
      label: 'Tools',
      items: [
        { label: 'Selection Tools', submenu: [{ label: 'Rectangle Select', shortcut: 'R', onClick: () => setTool('rect') }] },
        { label: 'Transform Tools', submenu: [{ label: 'Move', shortcut: 'M', onClick: () => setTool('move') }] },
        { label: 'Color Picker', shortcut: 'O', onClick: () => setTool('picker') },
        { label: 'Measure', shortcut: 'Shift+M', onClick: () => setTool('measure') },
        { label: 'Zoom', shortcut: 'Z', onClick: () => setTool('zoom') },
        { separator: true, label: '' },
        { label: 'Toolbox', shortcut: 'Ctrl+B', onClick: () => setDocks(true) },
      ],
    },
    { label: 'Filters', items: [{ label: 'Script-Fu', submenu: [{ label: 'Lab', submenu: [copyItem] }] }] },
    { label: 'Windows', items: [{ label: 'Dockable Dialogs', submenu: [{ label: 'Pointer', checked: true, onClick: () => setDocks(true) }, { label: 'Layers', shortcut: 'Ctrl+L', checked: true, onClick: () => setDocks(true) }] }, { label: 'Hide Docks', shortcut: 'Tab', checked: !docks, onClick: () => setDocks((d) => !d) }, { label: 'Single-Window Mode', checked: true, disabled: true }] },
    { label: 'Help', items: [{ label: 'About', onClick: () => setDialog({ title: 'About GIMP', text: 'GNU Image Manipulation Program 2.10.36 (GIMP-lite on the lab workstation)' }) }] },
  ];

  const device = useMemo(() => (cur?.ref ? screencapDevice(getState().lab, cur.ref) : null), [cur?.ref]);
  const status = message ?? (tool === 'rect' && cur?.sel ? 'Click-Drag to move the selection mask, or Click to remove it' : cur?.entry ? (TOOL_INFO[tool].hint && pointer ? TOOL_INFO[tool].hint : `${baseName(cur.path)} (${memSize(W, H)})`) : '');
  const measureText = tool === 'measure' && measure ? `Distance: ${Math.hypot(measure.dx, measure.dy).toFixed(1)} pixels, Angle: ${((Math.atan2(-measure.dy, measure.dx) * 180) / Math.PI).toFixed(2)}°, ${Math.round(Math.abs(measure.dx))} × ${Math.round(Math.abs(measure.dy))} pixels` : null;
  void files;

  return (
    <div className="gimp-root" data-app="gimp" data-window={windowId} ref={rootRef} key={props.reloadKey ?? 0}>
      <MenuBar menus={menus} />
      <div className="gimp-body">
        {docks ? (
          <div className="gimp-left">
            <Toolbox tool={tool} onTool={setTool} />
            <ToolOptions tool={tool} sel={cur?.sel ?? null} onSel={(s) => setSel(s)} onCopyField={copyField} picked={picked} measure={measure} zoomOut={zoomOutOpt} setZoomOut={setZoomOutOpt} hasImage={hasImg} />
          </div>
        ) : null}
        <div className="gimp-center">
          {images.length ? (
            <div className="gimp-tabs" role="tablist">
              {images.map((i) => (
                <div key={i.path} role="tab" aria-selected={i.path === activePath} className="gimp-tab" title={i.path} onClick={() => navigate(routeOf(i.path))}>
                  {i.entry ? <img src={i.entry.dataUrl} alt="" /> : <span className="gimp-thumb" />}
                  <button
                    type="button"
                    className="gimp-tab-x"
                    aria-label={`Close ${baseName(i.path)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeImage(i.path);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          <div className="gimp-view">
            {cur?.entry ? (
              <GimpCanvas
                key={cur.path}
                src={cur.entry.dataUrl}
                width={W}
                height={H}
                tool={tool}
                zoomOutDefault={zoomOutOpt}
                view={view}
                setView={setView}
                sel={cur.sel}
                onSelCommit={(s) => setSel(s)}
                onPointer={setPointer}
                onMessage={(mm) => setMessage(mm)}
                onMeasure={setMeasure}
                onPick={setPicked}
                onContextMenu={(x, y) => setCtxMenu({ x, y })}
                spaceDown={space}
                fitKey={fitKeys[cur.path] ?? 0}
              />
            ) : cur?.error ? (
              <div className="gimp-empty" />
            ) : cur ? (
              <div className="gimp-empty">
                <div className="gimp-progress">
                  <i />
                </div>
              </div>
            ) : (
              <div className="gimp-empty gimp-empty-wilber" onDoubleClick={() => void openDialog()}>
                <svg viewBox="0 0 40 24" width="220" height="132" aria-hidden="true">
                  <path d="M6 18c2-8 8-12 15-11 4 .6 7 3 8 6l5-3-2 6c2 1 2 3 1 4-3-1-5 0-8 0H9c-2 0-3-1-3-2z" fill="#3a3a3a" />
                  <circle cx="24" cy="10" r="1.6" fill="#2b2b2b" />
                  <path d="M15 7l-3-5M19 6.5l-1-5" stroke="#3a3a3a" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <span>Drop or open an image (Ctrl+O)</span>
              </div>
            )}
          </div>
          <div className="gimp-status">
            <span className="gimp-status-ptr">{pointer ? `${toUnit(pointer.x, unit)}, ${toUnit(pointer.y, unit)}` : ''}</span>
            <select className="gimp-select gimp-status-sel" value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="Unit">
              <option value="px">px</option>
              <option value="mm">mm</option>
              <option value="in">in</option>
            </select>
            <select className="gimp-select gimp-status-sel" value={String(view.zoom)} onChange={(e) => zoomTo(Number(e.target.value))} aria-label="Zoom" disabled={!hasImg}>
              {[...new Set([view.zoom, 0.25, 0.5, 0.667, 1, 2, 4, 8])].sort((a, b) => a - b).map((z) => (
                <option key={z} value={String(z)}>
                  {Math.round(z * 1000) / 10}%
                </option>
              ))}
            </select>
            <span className="gimp-status-msg">{measureText ?? status}</span>
          </div>
        </div>
        {docks ? (
          <div className="gimp-right">
            <LayersDock name={cur?.entry ? baseName(cur.path) : null} thumb={cur?.entry?.dataUrl ?? null} />
            <PointerDock pointer={pointer} sel={cur?.sel ?? null} unit={unit} device={device} />
          </div>
        ) : null}
      </div>
      {ctxMenu ? (
        <ContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          origin={rootRef.current?.getBoundingClientRect() ?? null}
          close={() => setCtxMenu(null)}
          items={[copyItem, { separator: true, label: '' }, { label: 'Select All', shortcut: 'Ctrl+A', onClick: () => setSel({ x: 0, y: 0, w: W, h: H }) }, { label: 'Select None', shortcut: 'Shift+Ctrl+A', onClick: () => setSel(null), disabled: !cur?.sel }, { separator: true, label: '' }, ...zoomMenu]}
        />
      ) : null}
      {cur?.error ? (
        <div className="gimp-dialog-back">
          <div className="gimp-dialog" role="alertdialog" aria-label="GIMP Message">
            <div className="gimp-dialog-title">GIMP Message</div>
            <div className="gimp-dialog-body">
              <span className="gimp-dialog-icon">!</span>
              <pre>{cur.error}</pre>
            </div>
            <div className="gimp-dialog-foot">
              <button type="button" className="gimp-btn" autoFocus onClick={() => closeImage(cur.path)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {dialog ? (
        <div className="gimp-dialog-back">
          <div className="gimp-dialog" role="alertdialog" aria-label={dialog.title}>
            <div className="gimp-dialog-title">{dialog.title}</div>
            <div className="gimp-dialog-body">
              <span className="gimp-dialog-icon">i</span>
              <pre>{dialog.text}</pre>
            </div>
            <div className="gimp-dialog-foot">
              <button type="button" className="gimp-btn" autoFocus onClick={() => setDialog(null)}>
                OK
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
