/**
 * Toast stack (bottom-right): info / success / warning / error / xp / achievement / ticket /
 * penalty / bonus / rank / streak / manual. Each toast removes itself after its lifetime;
 * hovering pauses the timer.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/core/store';
import type { Toast } from '@/core/state';
import { Icon } from '@/ui/kit';
import { dismissToast, toastLifetime, TOAST_MAX } from '@/ui/services/toasts';
import { uiSound } from '@/ui/services/sound';
import { isBarkToast } from './Subtitles';

const KIND_SOUND: Partial<Record<Toast['kind'], Parameters<typeof uiSound>[0]>> = {
  achievement: 'ui-achievement',
  rank: 'ui-achievement',
  xp: 'ui-xp',
  penalty: 'ui-fail',
  error: 'ui-fail',
  ticket: 'ui-ticket',
  success: 'ui-success',
  bonus: 'ui-success',
  manual: 'ui-xp',
};

/** Several toasts often land together (module complete: XP lines + achievement): one cue per kind. */
const lastCueAt = new Map<string, number>();
function cue(kind: Toast['kind']): void {
  const snd = KIND_SOUND[kind];
  if (!snd) return;
  const now = performance.now();
  if (now - (lastCueAt.get(snd) ?? -1e9) < 350) return;
  lastCueAt.set(snd, now);
  uiSound(snd, kind === 'xp' || kind === 'manual' ? 0.45 : 0.7);
}

const KIND_ICON: Record<Toast['kind'], string> = {
  info: 'info',
  success: 'check',
  warning: 'alert',
  error: 'alert',
  xp: 'sparkle',
  achievement: 'trophy',
  manual: 'book',
  penalty: 'alert',
  bonus: 'sparkle',
  ticket: 'ticket',
  rank: 'award',
  streak: 'flame',
};

function ToastCard({ t }: { t: Toast }) {
  const [leaving, setLeaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const leave = () => {
    setLeaving(true);
    setTimeout(() => dismissToast(t.id), 220);
  };
  const arm = (ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(leave, ms);
  };

  useEffect(() => {
    cue(t.kind);
    arm(toastLifetime(t.kind));
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [t.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isEmoji = !!t.icon && !/^[a-z-]+$/.test(t.icon);
  return (
    <div
      className={`hud-toast hud-toast--${t.kind}${leaving ? ' is-leaving' : ''}`}
      role="status"
      onMouseEnter={() => {
        if (timer.current) clearTimeout(timer.current);
      }}
      onMouseLeave={() => arm(1400)}
      onClick={leave}
    >
      <div className="hud-toast__icon">{isEmoji ? <span className="hud-toast__emoji">{t.icon}</span> : <Icon name={t.icon ?? KIND_ICON[t.kind]} size={t.kind === 'achievement' ? 20 : 16} />}</div>
      <div className="hud-toast__text">
        {t.kind === 'achievement' ? <div className="hud-toast__eyebrow">Achievement unlocked</div> : null}
        {t.kind === 'rank' ? <div className="hud-toast__eyebrow">Career</div> : null}
        <div className="hud-toast__title">{t.title}</div>
        {t.body ? <div className="hud-toast__body">{t.body}</div> : null}
      </div>
    </div>
  );
}

export function ToastStack({ raised }: { raised?: boolean }) {
  const toasts = useGame((s) => s.ui.toasts);
  // Barks already shown as subtitles: drop their toast mirror for good.
  useEffect(() => {
    for (const t of toasts) if (isBarkToast(t)) dismissToast(t.id);
  }, [toasts]);
  const visible = toasts.filter((t) => !isBarkToast(t)).slice(-TOAST_MAX);
  if (!visible.length) return null;
  return (
    <div className={`hud-toasts${raised ? ' is-raised' : ''}`} aria-live="polite">
      {visible.map((t) => (
        <ToastCard key={t.id} t={t} />
      ))}
    </div>
  );
}
