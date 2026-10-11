/**
 * Coach layer: one small tip bubble at a time, anchored to an on-screen element, with "Got it" and
 * "Hide tips" and an optional highlight ring. Rendered into `document.body` above every overlay
 * (including the workstation); only the bubble takes pointer events, so the game underneath keeps
 * working. Tips come from `./tips` and show once each (`progress.flags['coach:<id>']`), only while
 * `settings.coachTips` is on. Using the highlighted control also counts as "Got it".
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { bus } from '@/core/bus';
import { mutate, store, useGame } from '@/core/store';
import type { RootState } from '@/core/state';
import { getWindowManager } from '@/computer/apps';
import { Button, Icon } from '@/ui/kit';
import { isModuleComplete, modulesCompleted } from '@/ui/data/views';
import { TOUCH_DEVICE } from '@/ui/hud/TouchControls';
import { pushToast } from '@/ui/services/toasts';
import { COACH_TIPS, coachCandidates, coachFlag, isTapered, type CoachCtx, type CoachTip } from './tips';
import { placeBubble, rectOnScreen, type Rect } from './place';
import '../guide.css';

const TICK_MS = 250;
/** A passive (in-world) tip retires on its own after this long on screen. */
const PASSIVE_MS = 9000;
/** Pause between one tip closing and the next one appearing. */
const COOLDOWN_MS = 700;

function windowsInfo(): { focusedApp: string | null; openWindows: number } {
  try {
    const wins = getWindowManager()?.windows() ?? [];
    const open = wins.filter((w) => !w.minimized);
    return { focusedApp: open.find((w) => w.focused)?.app ?? null, openWindows: open.length };
  } catch {
    return { focusedApp: null, openWindows: 0 };
  }
}

export function buildCoachCtx(s: RootState): CoachCtx {
  const ov = s.ui.overlay;
  const desk = ov.kind === 'computer' ? windowsInfo() : { focusedApp: null, openWindows: 0 };
  return {
    overlay: ov.kind,
    menuScreen: ov.kind === 'main-menu' ? (ov.screen ?? 'home') : null,
    mode: s.session.mode,
    dialogue: !!s.session.dialogue,
    pointerLocked: s.ui.pointerLocked,
    prompt: !!s.ui.prompt,
    focusedApp: desk.focusedApp,
    openWindows: desk.openWindows,
    modulesDone: modulesCompleted(s.progress),
    m04Done: isModuleComplete(s.progress, 'M04'),
    touch: TOUCH_DEVICE,
  };
}

function markSeen(id: string): void {
  mutate((s) => {
    s.progress.flags[coachFlag(id)] = true;
  });
}

export function hideCoachTips(): void {
  mutate((s) => {
    s.progress.settings.coachTips = false;
  });
  pushToast({ kind: 'info', title: 'Coach tips off', body: 'Turn them back on in Settings → Gameplay.', icon: 'hint' });
}

interface Shown {
  tip: CoachTip;
  rect: Rect | null;
  text: string;
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1 && Math.abs(a.width - b.width) < 1 && Math.abs(a.height - b.height) < 1;
}

function anchorRect(sel: string): Rect | null | 'missing' {
  const el = document.querySelector(sel);
  if (!el) return 'missing';
  const r = el.getBoundingClientRect();
  const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
  return rectOnScreen(rect, { w: window.innerWidth, h: window.innerHeight }) ? rect : 'missing';
}

/** Mounted once by the App root. */
export function CoachLayer() {
  const on = useGame((s) => s.progress.settings.coachTips && s.ui.loading === null);
  if (!on || typeof document === 'undefined') return null;
  return createPortal(<CoachRuntime />, document.body);
}

function CoachRuntime() {
  const [shown, setShown] = useState<Shown | null>(null);
  const reduced = useGame((s) => s.progress.settings.reducedMotion);
  const shownRef = useRef<Shown | null>(null);
  shownRef.current = shown;
  const closeRef = useRef<(seen: boolean) => void>(() => undefined);

  useEffect(() => {
    const since = new Map<string, number>();
    const done = new Set<string>();
    let shownAt = 0;
    let cooldownUntil = 0;

    const seen = (id: string) => done.has(id) || !!store.getState().progress.flags[coachFlag(id)];
    const close = (asSeen: boolean) => {
      const cur = shownRef.current;
      if (cur && asSeen) {
        done.add(cur.tip.id);
        markSeen(cur.tip.id);
      }
      shownRef.current = null;
      setShown(null);
      cooldownUntil = performance.now() + COOLDOWN_MS;
    };
    closeRef.current = close;

    const tick = () => {
      if (document.hidden) return;
      const s = store.getState();
      const ctx = buildCoachCtx(s);
      const tapered = isTapered(ctx);
      // Nothing left to say: stay idle (cheap check before any DOM work).
      if (!COACH_TIPS.some((t) => !seen(t.id) && (!tapered || t.tier === 'visit'))) {
        if (shownRef.current) close(false);
        return;
      }
      const now = performance.now();
      // Phones in portrait: the lab is covered by "Rotate to landscape" — in-world tips wait for it.
      const rotate = ctx.overlay === 'none' && (document.querySelector('.tc-rotate')?.getClientRects().length ?? 0) > 0;
      const cands = rotate ? [] : coachCandidates(ctx, seen);
      const ids = new Set(cands.map((c) => c.id));
      for (const k of [...since.keys()]) if (!ids.has(k)) since.delete(k);
      for (const c of cands) if (!since.has(c.id)) since.set(c.id, now);

      const cur = shownRef.current;
      if (cur) {
        if (!ids.has(cur.tip.id)) return close(false);
        const r = cur.tip.anchor ? anchorRect(cur.tip.anchor) : null;
        if (r === 'missing') return close(false);
        if (cur.tip.passive && now - shownAt > PASSIVE_MS) return close(true);
        // Something with higher priority came up (e.g. an app window opened over the desktop): yield.
        const first = cands[0];
        if (first && first.id !== cur.tip.id && cands.indexOf(cur.tip) > 0 && now - (since.get(first.id) ?? now) >= (first.delayMs ?? 400) && first.anchor && anchorRect(first.anchor) !== 'missing') return close(false);
        if (!sameRect(r, cur.rect)) setShown({ ...cur, rect: r });
        return;
      }
      if (now < cooldownUntil) return;
      for (const tip of cands) {
        if (now - (since.get(tip.id) ?? now) < (tip.delayMs ?? 400)) continue;
        const r = tip.anchor ? anchorRect(tip.anchor) : null;
        if (r === 'missing') continue;
        shownAt = now;
        const next = { tip, rect: r, text: tip.text(ctx) };
        shownRef.current = next;
        setShown(next);
        break;
      }
    };

    const timer = setInterval(tick, TICK_MS);
    const offApp = bus.on('app.opened', () => setTimeout(tick, 60));
    // Using the highlighted control counts as "Got it".
    const onDown = (e: PointerEvent) => {
      const cur = shownRef.current;
      if (!cur?.tip.anchor || !(e.target instanceof Node)) return;
      if ((e.target as Element).closest?.('.coach-bubble')) return;
      const el = document.querySelector(cur.tip.anchor);
      if (el && el.contains(e.target) && cur.tip.place !== 'inside') queueMicrotask(() => close(true));
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      clearInterval(timer);
      offApp();
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, []);

  if (!shown) return null;
  return <Bubble key={shown.tip.id} shown={shown} reduced={reduced} onGotIt={() => closeRef.current(true)} onHide={() => (closeRef.current(true), hideCoachTips())} />;
}

function Bubble({ shown, reduced, onGotIt, onHide }: { shown: Shown; reduced: boolean; onGotIt: () => void; onHide: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 320, h: 150 });
  const [vp, setVp] = useState({ w: window.innerWidth, h: window.innerHeight });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (Math.abs(w - size.w) > 1 || Math.abs(h - size.h) > 1) setSize({ w, h });
  });
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  // Text-size setting: the bubble zooms like the rest of the UI. Placement works in screen px (scaled size),
  // while left/top/arrow are in the zoomed bubble's own px.
  const zoom = useGame((st) => Math.min(1.5, Math.max(0.85, st.progress.settings.uiScale || 1)));
  const { tip, rect, text } = shown;
  const p = placeBubble(rect, { w: size.w * zoom, h: size.h * zoom }, vp, tip.place ?? 'auto');
  const style = { zoom, left: p.x / zoom, top: p.y / zoom, '--coach-arrow': p.arrow === null ? undefined : `${p.arrow / zoom}px` } as CSSProperties;
  const titleId = `coach-title-${tip.id.replace(/[^\w-]/g, '-')}`;
  return (
    <div className="coach-layer">
      {tip.ring && rect ? <div className={`coach-ring${reduced ? ' is-static' : ''}`} style={{ left: rect.left - 6, top: rect.top - 6, width: rect.width + 12, height: rect.height + 12 }} aria-hidden /> : null}
      <div ref={ref} className={`coach-bubble coach-bubble--${p.side}${reduced ? ' is-reduced' : ''}`} style={style} role="dialog" aria-modal="false" aria-labelledby={titleId} data-ui-interactive data-coach-tip={tip.id}>
        {p.arrow !== null ? <span className="coach-bubble__arrow" aria-hidden /> : null}
        <div className="coach-bubble__head">
          <span className="coach-bubble__icon">
            <Icon name="hint" size={14} />
          </span>
          <span className="coach-bubble__title" id={titleId}>
            {tip.title}
          </span>
        </div>
        <p className="coach-bubble__text">{text}</p>
        <div className="coach-bubble__actions">
          <Button size="sm" variant="primary" onClick={onGotIt}>
            Got it
          </Button>
          <Button size="sm" variant="ghost" onClick={onHide} title="Turn coach tips off (Settings → Gameplay turns them back on)">
            Hide tips
          </Button>
        </div>
      </div>
    </div>
  );
}
