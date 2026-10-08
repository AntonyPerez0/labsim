/**
 * DrillFrame — the juice layer every drill body is wrapped in (GP §5.2): floating score pop-ups
 * (`+412 ×1.7`), a streak meter that fills toward ×2.0 and shatters on a break, a speed fuse showing the
 * +50 → 0 speed-bonus window (2 s → 8 s), a soft green edge glow at streak ≥ 4, and a red flash + nudge
 * on mistakes. Drill views talk to it through `useFx()`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useGame } from '@/core/store';
import { streakMultiplier } from './scoring';
import './kit.css';

interface Popup {
  id: number;
  x: number;
  y: number;
  text: string;
  sub: string | null;
  kind: 'good' | 'bad' | 'info';
}

export interface FxApi {
  /** Score pop-up at the last pointer position (or the given point, frame px). */
  pop(text: string, kind: Popup['kind'], sub?: string | null, at?: { x: number; y: number }): void;
  /** Whole-frame flash. */
  flash(kind: 'good' | 'bad'): void;
  /** Big centred banner ("5 in a row!", "SPARK! −300"). */
  banner(text: string, kind?: 'good' | 'bad' | 'info'): void;
  /** Frame-relative point of an element's centre (for pop-ups anchored to a control). */
  centreOf(el: Element | null): { x: number; y: number } | null;
  readonly reducedMotion: boolean;
}

const FxContext = createContext<FxApi | null>(null);

const NOOP: FxApi = { pop() {}, flash() {}, banner() {}, centreOf: () => null, reducedMotion: true };

export function useFx(): FxApi {
  return useContext(FxContext) ?? NOOP;
}

const STREAK_SEGMENTS = 10;

export function DrillFrame({ children, accent }: { children: ReactNode; accent?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [flash, setFlash] = useState<{ kind: 'good' | 'bad'; n: number } | null>(null);
  const [banner, setBanner] = useState<{ text: string; kind: string; n: number } | null>(null);
  const [shatter, setShatter] = useState(0);
  const seq = useRef(1);
  const reducedMotion = useGame((s) => !!s.progress?.settings?.reducedMotion);
  const streak = useGame((s) => s.session.drill?.streak ?? 0);
  const itemKey = useGame((s) => `${s.session.drill?.currentItemId ?? ''}:${s.session.drill?.index ?? 0}`);
  const running = useGame((s) => s.session.drill?.phase === 'running');
  const prevStreak = useRef(streak);

  useEffect(() => {
    if (streak === 0 && prevStreak.current >= 2) setShatter((n) => n + 1);
    prevStreak.current = streak;
  }, [streak]);

  const centreOf = useCallback((el: Element | null) => {
    const host = ref.current;
    if (!el || !host) return null;
    const a = el.getBoundingClientRect();
    const b = host.getBoundingClientRect();
    return { x: a.left + a.width / 2 - b.left, y: a.top + a.height / 2 - b.top };
  }, []);

  const api = useMemo<FxApi>(
    () => ({
      reducedMotion,
      centreOf,
      pop(text, kind, sub = null, at) {
        const host = ref.current;
        const p = at ?? lastPointer.current ?? (host ? { x: host.clientWidth / 2, y: host.clientHeight * 0.42 } : { x: 400, y: 200 });
        const id = seq.current++;
        setPopups((list) => [...list.slice(-5), { id, x: p.x, y: p.y, text, sub, kind }]);
        window.setTimeout(() => setPopups((list) => list.filter((x) => x.id !== id)), 1150);
      },
      flash(kind) {
        setFlash({ kind, n: seq.current++ });
        if (kind === 'bad' && !reducedMotion) {
          ref.current?.querySelector('.dk-body')?.animate(
            [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }],
            { duration: 260, easing: 'ease-out' },
          );
        }
      },
      banner(text, kind = 'info') {
        const n = seq.current++;
        setBanner({ text, kind, n });
        window.setTimeout(() => setBanner((b) => (b && b.n === n ? null : b)), 1300);
      },
    }),
    [reducedMotion, centreOf],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    const host = ref.current;
    if (!host) return;
    const b = host.getBoundingClientRect();
    lastPointer.current = { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  // Keyboard answers anchor pop-ups to the centre again.
  useEffect(() => {
    const k = () => (lastPointer.current = null);
    window.addEventListener('keydown', k, true);
    return () => window.removeEventListener('keydown', k, true);
  }, []);

  const filled = Math.min(STREAK_SEGMENTS, streak);
  const mult = streakMultiplier(streak);
  const cls = [
    'dk-frame',
    streak >= 4 ? 'is-hot' : '',
    streak >= 10 ? 'is-max' : '',
    reducedMotion ? 'is-still' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <FxContext.Provider value={api}>
      <div ref={ref} className={cls} onPointerDownCapture={onPointerDown} style={accent ? ({ '--dk-accent': accent } as React.CSSProperties) : undefined}>
        <div className="dk-meter" aria-label={`Streak ${streak}, multiplier ×${mult.toFixed(1)}`}>
          <div className={`dk-streak${shatter ? ' is-shatter' : ''}`} key={`s${shatter}`}>
            {Array.from({ length: STREAK_SEGMENTS }, (_, i) => (
              <span key={i} className={`dk-streak__seg${i < filled ? ' is-on' : ''}`} style={{ animationDelay: `${i * 18}ms` }} />
            ))}
          </div>
          <div className="dk-meter__mult">×{mult.toFixed(1)}</div>
          <div className="dk-fuse" title="Speed bonus: +50 if you answer within 2 s, falling to 0 at 8 s">
            {running ? <span key={itemKey} className="dk-fuse__bar" /> : null}
          </div>
        </div>
        <div className="dk-body">{children}</div>
        <div className="dk-fx" aria-hidden>
          {flash ? <div key={flash.n} className={`dk-flash is-${flash.kind}`} /> : null}
          {popups.map((p) => (
            <div key={p.id} className={`dk-pop is-${p.kind}`} style={{ left: p.x, top: p.y }}>
              <span className="dk-pop__main">{p.text}</span>
              {p.sub ? <span className="dk-pop__sub">{p.sub}</span> : null}
            </div>
          ))}
          {banner ? (
            <div key={banner.n} className={`dk-banner is-${banner.kind}`}>
              {banner.text}
            </div>
          ) : null}
        </div>
      </div>
    </FxContext.Provider>
  );
}
