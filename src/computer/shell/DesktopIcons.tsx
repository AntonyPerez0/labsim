/**
 * Desktop icon grid (Apps §1.2): 84 × 92 cells from (12, 12), column-major; click selects, double-click /
 * Enter opens, arrow keys move the selection, drag rearranges (persisted per viewer in localStorage).
 */
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { APP_META, type AppId } from '../apps';
import { AppIcon, Glyph } from './icons';
import { LOCKED_TEXT } from './gating';
import { wmApi } from './wmStore';

type IconId = AppId | 'recycle';
const ICON_ORDER: IconId[] = ['files', 'browser', 'orca', 'jenkins', 'github', 'intellij', 'terminal', 'gimp', 'camera', 'ollama', 'chat', 'dashboard', 'cardreader', 'recycle'];
const CELL_W = 84;
const CELL_H = 92;
const ORIGIN = 12;
const STORE_KEY = 'labsim.desktop.icons.v1';

type Slots = Partial<Record<IconId, { c: number; r: number }>>;

function readSlots(): Slots {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Slots) : {};
  } catch {
    return {};
  }
}

function saveSlots(s: Slots): void {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* storage blocked */
  }
}

function layout(rows: number, saved: Slots): Record<IconId, { c: number; r: number }> {
  const out = {} as Record<IconId, { c: number; r: number }>;
  const taken = new Set<string>();
  for (const id of ICON_ORDER) {
    const s = saved[id];
    if (s && s.r < rows && !taken.has(`${s.c},${s.r}`)) {
      out[id] = s;
      taken.add(`${s.c},${s.r}`);
    }
  }
  let i = 0;
  for (const id of ICON_ORDER) {
    if (out[id]) continue;
    while (taken.has(`${Math.floor(i / rows)},${i % rows}`)) i++;
    out[id] = { c: Math.floor(i / rows), r: i % rows };
    taken.add(`${out[id].c},${out[id].r}`);
  }
  return out;
}

function RecycleIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 7h12l-1.1 13.2a1.5 1.5 0 01-1.5 1.3H8.6a1.5 1.5 0 01-1.5-1.3z" fill="#d7e4ee" stroke="#8aa4b8" strokeWidth=".8" />
      <rect x="5" y="4.6" width="14" height="2.6" rx=".8" fill="#eef4f8" stroke="#8aa4b8" strokeWidth=".8" />
      <path d="M10 10v8.5M14 10v8.5" stroke="#9db3c4" strokeWidth=".9" />
    </svg>
  );
}

export function DesktopIcons(props: { height: number; isUnlocked(app: AppId): boolean }) {
  const { isUnlocked } = props;
  const rows = Math.max(1, Math.floor((props.height - ORIGIN) / CELL_H));
  const [saved, setSaved] = useState<Slots>(readSlots);
  const [sel, setSel] = useState<IconId | null>(null);
  const [drag, setDrag] = useState<{ id: IconId; x: number; y: number } | null>(null);
  const pos = layout(rows, saved);
  const rootRef = useRef<HTMLDivElement>(null);

  const open = useCallback(
    (id: IconId) => {
      if (id === 'recycle') {
        wmApi.openApp('files', { route: '/dir/Recycle Bin' });
        return;
      }
      if (!isUnlocked(id)) {
        wmApi.notify({ app: 'desktop', title: LOCKED_TEXT, body: APP_META[id].title });
        return;
      }
      wmApi.openApp(id);
    },
    [isUnlocked],
  );

  useEffect(() => {
    const clear = (e: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setSel(null);
    };
    window.addEventListener('pointerdown', clear);
    return () => window.removeEventListener('pointerdown', clear);
  }, []);

  const onPointerDown = (id: IconId) => (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    setSel(id);
    const start = { x: e.clientX, y: e.clientY };
    const base = pos[id];
    let moved = false;
    const onMove = (ev: globalThis.PointerEvent) => {
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      moved = true;
      setDrag({ id, x: ORIGIN + base.c * CELL_W + dx, y: ORIGIN + base.r * CELL_H + dy });
    };
    const onUp = (ev: globalThis.PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setDrag(null);
      if (!moved) return;
      const x = ORIGIN + base.c * CELL_W + (ev.clientX - start.x);
      const y = ORIGIN + base.r * CELL_H + (ev.clientY - start.y);
      const c = Math.max(0, Math.round((x - ORIGIN) / CELL_W));
      const r = Math.min(rows - 1, Math.max(0, Math.round((y - ORIGIN) / CELL_H)));
      const occupant = ICON_ORDER.find((o) => o !== id && pos[o].c === c && pos[o].r === r);
      const next: Slots = { ...pos, [id]: { c, r } };
      if (occupant) next[occupant] = base;
      setSaved(next);
      saveSlots(next);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!sel) return;
    const cur = pos[sel];
    let target: { c: number; r: number } | null = null;
    if (e.key === 'ArrowDown') target = { c: cur.c, r: cur.r + 1 };
    else if (e.key === 'ArrowUp') target = { c: cur.c, r: cur.r - 1 };
    else if (e.key === 'ArrowRight') target = { c: cur.c + 1, r: cur.r };
    else if (e.key === 'ArrowLeft') target = { c: cur.c - 1, r: cur.r };
    else if (e.key === 'Enter') {
      e.preventDefault();
      open(sel);
      return;
    }
    if (!target) return;
    e.preventDefault();
    const hit = ICON_ORDER.find((o) => pos[o].c === target!.c && pos[o].r === target!.r);
    if (hit) {
      setSel(hit);
      (rootRef.current?.querySelector(`[data-icon="${hit}"]`) as HTMLElement | null)?.focus();
    }
  };

  return (
    <div className="ws-icons" ref={rootRef} onKeyDown={onKey}>
      {ICON_ORDER.map((id) => {
        const p = drag?.id === id ? { x: drag.x, y: drag.y } : { x: ORIGIN + pos[id].c * CELL_W, y: ORIGIN + pos[id].r * CELL_H };
        const locked = id !== 'recycle' && !isUnlocked(id);
        const label = id === 'recycle' ? 'Recycle Bin' : APP_META[id].iconLabel;
        return (
          <button
            key={id}
            type="button"
            data-icon={id}
            data-hint={id === 'recycle' ? undefined : `desktop.icon:${id}`}
            className={`ws-icon${sel === id ? ' ws-icon-selected' : ''}`}
            style={{ left: p.x, top: p.y, zIndex: drag?.id === id ? 2 : undefined }}
            title={locked ? LOCKED_TEXT : undefined}
            onPointerDown={onPointerDown(id)}
            onDoubleClick={() => open(id)}
            onFocus={() => setSel(id)}
          >
            <span className={`ws-icon-glyph${locked ? ' ws-icon-locked' : ''}`}>
              {id === 'recycle' ? <RecycleIcon /> : <AppIcon app={id} size={40} />}
            </span>
            {locked ? (
              <span className="ws-lockbadge" style={{ right: 20, top: 30, bottom: 'auto' }}>
                <Glyph.padlock size={11} />
              </span>
            ) : null}
            <span className="ws-icon-label">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
