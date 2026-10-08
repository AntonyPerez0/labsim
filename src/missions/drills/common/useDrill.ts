/**
 * `useDrill(props)` — the one hook every drill body uses: resolves the current item from the runtime
 * (`session.drill.currentItemId`), measures the answer time on the session clock, submits verdicts through
 * `props.answer()` and fires the juice (sound, pop-up, flash, streak banners). Drills with a reveal panel
 * (DR02, DR04–DR09, DR16, DR19) `stage()` their verdict first and `commit()` it when the player moves on,
 * so the last item's reveal is still visible before the debrief.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getState, useGame } from '@/core/store';
import type { DrillComponentProps, DrillFeedback, DrillItem, DrillVerdict } from '../../types';
import { previewPoints, streakMultiplier } from './scoring';
import { useFx } from './frame';
import { sfx, sfxCorrect, sfxWrong } from './sound';

export interface Staged<P> {
  verdict: DrillVerdict;
  payload: P;
  /** Points the runtime will award (preview). */
  points: number;
  multiplier: number;
}

export interface DrillHandle<D, P = unknown> {
  itemId: string | null;
  item: DrillItem<D> | null;
  /** Changes on every new item (even when the same bank item is drawn again). */
  itemKey: string;
  index: number;
  streak: number;
  mode: string | null;
  running: boolean;
  /** Fixed-count rounds: items in the round. */
  itemTarget: number | null;
  timeLeftS: number | null;
  /** Ms since the current item appeared (session clock). */
  elapsedMs(): number;
  submit(verdict: DrillVerdict, at?: Element | null, quiet?: boolean): DrillFeedback | null;
  /** Fire the answer juice now with previewed points (quick-fire drills submit a beat later, quietly). */
  juiceNow(verdict: DrillVerdict, at?: Element | null): void;
  stage(verdict: DrillVerdict, payload: P): void;
  staged: Staged<P> | null;
  commit(): DrillFeedback | null;
  finish(): void;
}

const MILESTONES: Record<number, string> = { 3: 'Hat-trick', 5: '5 in a row!', 8: '8 straight — on fire', 10: 'MAX ×2.0', 15: '15 streak!', 20: 'Unstoppable — 20' };

export function useDrill<D, P = unknown>(props: DrillComponentProps): DrillHandle<D, P> {
  const fx = useFx();
  const itemId = useGame((s) => s.session.drill?.currentItemId ?? null);
  const index = useGame((s) => s.session.drill?.index ?? 0);
  const streak = useGame((s) => s.session.drill?.streak ?? 0);
  const running = useGame((s) => s.session.drill?.phase === 'running');
  const itemTarget = useGame((s) => s.session.drill?.itemTarget ?? null);
  const timeLeftS = useGame((s) => (s.session.drill?.timeLeftS === null || s.session.drill?.timeLeftS === undefined ? null : Math.ceil(s.session.drill.timeLeftS)));
  const item = useMemo(() => (itemId ? (props.item(itemId) as DrillItem<D> | null) : null), [itemId, index]); // eslint-disable-line react-hooks/exhaustive-deps
  const itemKey = `${itemId ?? ''}:${index}`;
  const [staged, setStaged] = useState<Staged<P> | null>(null);
  const stagedRef = useRef<Staged<P> | null>(null);
  stagedRef.current = staged;
  const busy = useRef(false);

  useEffect(() => {
    setStaged(null);
    busy.current = false;
  }, [itemKey]);

  const elapsedMs = useCallback((): number => {
    const d = getState().session;
    const run = d.drill;
    if (!run) return 0;
    return Math.max(0, (d.clockS - run.itemShownAtS) * 1000);
  }, []);

  const juice = useCallback(
    (fb: DrillFeedback, verdict: DrillVerdict, at?: Element | null) => {
      const point = at ? fx.centreOf(at) ?? undefined : undefined;
      const pts = fb.points;
      const sign = pts > 0 ? '+' : pts < 0 ? '−' : '±';
      const label = `${sign}${Math.abs(pts)}`;
      if (verdict.correct) {
        sfxCorrect(fb.streak);
        fx.pop(label, 'good', fb.multiplier > 1 ? `×${fb.multiplier.toFixed(1)}` : null, point);
        fx.flash('good');
        const m = MILESTONES[fb.streak];
        if (m) {
          fx.banner(m, 'good');
          sfx('ui-xp', { volume: 0.5 });
        }
      } else {
        sfxWrong();
        fx.pop(label, pts > 0 ? 'info' : 'bad', null, point);
        fx.flash('bad');
      }
    },
    [fx],
  );

  const submit = useCallback(
    (verdict: DrillVerdict, at?: Element | null, quiet?: boolean): DrillFeedback | null => {
      if (!itemId || busy.current) return null;
      busy.current = true;
      const v: DrillVerdict = { ...verdict, elapsedMs: verdict.elapsedMs ?? elapsedMs() };
      const fb = props.answer(itemId, v);
      if (!quiet) juice(fb, v, at);
      return fb;
    },
    [itemId, props, elapsedMs, juice],
  );

  const juiceNow = useCallback(
    (verdict: DrillVerdict, at?: Element | null) => {
      const ms = verdict.elapsedMs ?? elapsedMs();
      const st = getState().session.drill?.streak ?? 0;
      const pts = previewPoints(verdict, ms, st);
      const next = verdict.correct ? st + 1 : 0;
      juice({ points: pts, streak: next, multiplier: verdict.correct ? streakMultiplier(st) : 1, score: 0, teach: null, nextItemId: null }, verdict, at);
    },
    [elapsedMs, juice],
  );

  const stage = useCallback(
    (verdict: DrillVerdict, payload: P) => {
      if (!itemId || stagedRef.current) return;
      const ms = verdict.elapsedMs ?? elapsedMs();
      const v = { ...verdict, elapsedMs: ms };
      const st = getState().session.drill?.streak ?? 0;
      const s: Staged<P> = { verdict: v, payload, points: previewPoints(v, ms, st), multiplier: v.correct ? streakMultiplier(st) : 1 };
      setStaged(s);
      if (v.correct) sfxCorrect(st + 1);
      else sfxWrong();
      fx.flash(v.correct ? 'good' : 'bad');
    },
    [itemId, elapsedMs, fx],
  );

  const commit = useCallback((): DrillFeedback | null => {
    const s = stagedRef.current;
    if (!s) return null;
    return submit(s.verdict);
  }, [submit]);

  return {
    itemId,
    item,
    itemKey,
    index,
    streak,
    mode: props.mode,
    running,
    itemTarget,
    timeLeftS,
    elapsedMs,
    submit,
    juiceNow,
    stage,
    staged,
    commit,
    finish: props.finish,
  };
}

/** Window keydown handler bound for the component's lifetime (skips typing targets unless `inInputs`). */
export function useKeys(handler: (e: KeyboardEvent) => void, deps: readonly unknown[], opts: { inInputs?: boolean; enabled?: boolean } = {}): void {
  const h = useRef(handler);
  h.current = handler;
  useEffect(() => {
    if (opts.enabled === false) return;
    const on = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (!opts.inInputs && t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      h.current(e);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [opts.enabled, opts.inInputs, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** 1–9 from Digit/Numpad codes, A–Z letter index, else -1. */
export function keyIndex(e: KeyboardEvent): { digit: number; letter: number } {
  let digit = -1;
  let letter = -1;
  const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
  if (m) digit = Number(m[1]);
  const l = /^Key([A-Z])$/.exec(e.code);
  if (l) letter = l[1]!.charCodeAt(0) - 65;
  return { digit, letter };
}

/**
 * Quick-fire answering: show the verdict on the current card for a beat (right/wrong highlight), then
 * submit with the time measured at the click. Wrong answers linger a little longer so the right option
 * is seen.
 */
export function useQuickAnswer<K>(d: Pick<DrillHandle<unknown>, 'itemKey' | 'elapsedMs' | 'submit' | 'juiceNow'>, delays = { right: 300, wrong: 700 }) {
  const [picked, setPicked] = useState<{ key: K; correct: boolean } | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    setPicked(null);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
    };
  }, [d.itemKey]);
  const answer = useCallback(
    (key: K, correct: boolean, at?: Element | null, extra: Omit<DrillVerdict, 'correct'> = {}) => {
      if (timer.current !== null) return;
      const elapsedMs = d.elapsedMs();
      const verdict: DrillVerdict = { ...extra, correct, elapsedMs };
      setPicked({ key, correct });
      d.juiceNow(verdict, at);
      timer.current = window.setTimeout(
        () => {
          timer.current = null;
          d.submit(verdict, null, true);
        },
        correct ? delays.right : delays.wrong,
      );
    },
    [d, delays.right, delays.wrong],
  );
  return { picked, answer, locked: picked !== null };
}
