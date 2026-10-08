/**
 * [game] overlays of the desktop (Apps §1.7) — objective pin, hint ring + "Show me" ghost cursor — and the
 * Alt+` window switcher (Apps §1.3).
 */
import { useEffect, useRef, useState, type RefObject } from 'react';
import { bus } from '@/core/bus';
import { useGameShallow } from '@/core/store';
import { APP_META, clearHint, getCurrentHint, type HintRequest } from '../apps';
import { AppIcon } from './icons';
import { effectiveRect, useShell, wmApi } from './wmStore';

/* ─────────────────────────────── Objective pin ─────────────────────────────── */

/** Pin footprint (top-right, Apps §1.7) — used to dock the pin when a window's title bar sits under it. */
const PIN_W = 344;
const PIN_H = 120;

export function ObjectivePin() {
  const objectives = useGameShallow((s) => s.session.objectives.filter((o) => !o.hidden));
  const [collapsed, setCollapsed] = useState(false);
  const [forced, setForced] = useState(false);
  // The focused window's caption buttons (─ ☐ ✕) must never be hidden by the pin: when its top-right corner is
  // under the pin, the pin docks as a small pill at the top centre until the player expands it again.
  const covers = useShell((s) => {
    const w = s.windows.find((x) => x.id === s.focusedId);
    if (!w || w.minimized) return false;
    const r = effectiveRect(w, s.workArea);
    return r.x + r.w > s.workArea.w - PIN_W && r.y < PIN_H;
  });
  useEffect(() => {
    if (!covers) setForced(false);
  }, [covers]);
  if (!objectives.length) return null;
  const sorted = [...objectives.filter((o) => !o.done), ...objectives.filter((o) => o.done)].slice(0, 3);
  const docked = covers && !forced;
  if (collapsed || docked) {
    const open = objectives.filter((o) => !o.done).length;
    return (
      <button
        type="button"
        className={`ws-objective ws-objective-pill${docked ? ' ws-objective-docked' : ''}`}
        title="Show the objective"
        onClick={() => {
          setCollapsed(false);
          if (docked) setForced(true);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <span className="ws-objective-title" style={{ margin: 0 }}>
          Objective · {open}
        </span>
      </button>
    );
  }
  return (
    <div className="ws-objective" role="status" aria-live="polite" onClick={() => (covers ? setForced(false) : setCollapsed(true))} onPointerDown={(e) => e.stopPropagation()}>
      <div className="ws-objective-title">
        <span>Objective</span>
        <span aria-hidden="true">–</span>
      </div>
      <ul>
        {sorted.map((o) => (
          <li key={o.id} className={o.done ? 'ws-obj-done' : undefined}>
            <span>
              {o.text}
              {o.progress ? ` (${o.progress[0]}/${o.progress[1]})` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ─────────────────────────────── Hint ring & Show me ─────────────────────────────── */

function cssEscape(s: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
}

export function HintOverlay(props: { rootRef: RefObject<HTMLDivElement | null> }) {
  const { rootRef } = props;
  const [hint, setHint] = useState<HintRequest | null>(() => getCurrentHint());
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; burst: boolean } | null>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    const offA = bus.on('computer.hintRequested', (h) => setHint(h));
    const offB = bus.on('computer.hintCleared', () => setHint(null));
    return () => {
      offA();
      offB();
    };
  }, []);

  // Open the app (and route) the hint points into.
  useEffect(() => {
    scrolled.current = false;
    setGhost(null);
    if (!hint) return;
    const running = wmApi.windows().some((w) => w.app === hint.app);
    if (hint.route || !running) wmApi.openApp(hint.app, hint.route ? { route: hint.route } : {});
  }, [hint]);

  // Track the target element.
  useEffect(() => {
    if (!hint) {
      setRect(null);
      return;
    }
    let raf = 0;
    let last = '';
    const tick = () => {
      const root = rootRef.current;
      const el = root?.querySelector(`[data-hint="${cssEscape(hint.target)}"]`) as HTMLElement | null;
      if (root && el && el.offsetParent !== null) {
        if (!scrolled.current) {
          scrolled.current = true;
          el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }
        const rr = root.getBoundingClientRect();
        const er = el.getBoundingClientRect();
        const next = { x: er.left - rr.left - 4, y: er.top - rr.top - 4, w: er.width + 8, h: er.height + 8 };
        const sig = `${next.x}|${next.y}|${next.w}|${next.h}`;
        if (sig !== last) {
          last = sig;
          setRect(next);
        }
      } else if (last !== 'none') {
        last = 'none';
        setRect(null);
      }
      raf = window.setTimeout(tick, 120) as unknown as number;
    };
    tick();
    return () => window.clearTimeout(raf);
  }, [hint, rootRef]);

  // "Show me": ghost cursor from the centre to the target, then a ring burst (never clicks).
  useEffect(() => {
    if (!hint?.showMe || !rect || ghost) return;
    const root = rootRef.current;
    if (!root) return;
    const rr = root.getBoundingClientRect();
    setGhost({ x: rr.width / 2, y: rr.height / 2, burst: false });
    const t1 = window.setTimeout(() => setGhost({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, burst: false }), 30);
    const t2 = window.setTimeout(() => setGhost({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, burst: true }), 960);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint, rect !== null]);

  // A real click on the target clears the hint.
  useEffect(() => {
    if (!hint) return;
    const root = rootRef.current;
    if (!root) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(`[data-hint="${cssEscape(hint.target)}"]`)) clearHint();
    };
    root.addEventListener('pointerdown', onDown, true);
    return () => root.removeEventListener('pointerdown', onDown, true);
  }, [hint, rootRef]);

  if (!hint || !rect) return null;
  return (
    <div className="ws-hintlayer" aria-hidden="true">
      <div className="ws-hintring" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />
      {ghost ? (
        <>
          <svg className="ws-ghost" style={{ left: ghost.x, top: ghost.y }} viewBox="0 0 24 24">
            <path d="M3 2l15 8.5-6.6 1.6L8.3 18z" fill="#fff" stroke="#000" strokeWidth="1" />
          </svg>
          {ghost.burst ? <div className="ws-hintburst" style={{ left: ghost.x, top: ghost.y }} /> : null}
        </>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────── Window switcher ─────────────────────────────── */

export function Switcher() {
  const sw = useShell((s) => s.switcher);
  const windows = useShell((s) => s.windows);
  if (!sw) return null;
  return (
    <div className="ws-switcher" role="listbox" aria-label="Switch windows">
      {sw.ids.map((id, i) => {
        const w = windows.find((x) => x.id === id);
        if (!w) return null;
        return (
          <div key={id} role="option" aria-selected={i === sw.index} className={`ws-switch-item${i === sw.index ? ' ws-switch-active' : ''}`}>
            <AppIcon app={w.app} size={40} />
            <span>{w.title || APP_META[w.app].title}</span>
          </div>
        );
      })}
    </div>
  );
}
