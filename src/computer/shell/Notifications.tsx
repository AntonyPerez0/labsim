/**
 * Toasts (bottom-right, max 3, 6 s, paused while hovered) and the bell flyout (last 30) — Apps §1.5.
 */
import { useGame } from '@/core/store';
import { APP_META, fmtClock, type AppId } from '../apps';
import { AppIcon, Glyph } from './icons';
import { activateToast, clearNotificationLog, clearToastTimer, dismissToast, scheduleToastDismiss, useShell, type ToastItem } from './wmStore';

function appTitle(app: ToastItem['app']): string {
  if (app === 'desktop') return 'Workstation';
  if (app === 'tablet') return 'Status tablet';
  return APP_META[app as AppId]?.title ?? app;
}

function ToastCard(props: { t: ToastItem; live: boolean }) {
  const { t, live } = props;
  const epoch = useGame((s) => s.lab.time.epochDate);
  const isApp = t.app !== 'desktop' && t.app !== 'tablet';
  return (
    <div
      role="button"
      tabIndex={0}
      className={`ws-toast ws-toast-${t.kind}`}
      onMouseEnter={() => live && clearToastTimer(t.id)}
      onMouseLeave={() => live && scheduleToastDismiss(t.id, 3000)}
      onClick={() => activateToast(t)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') activateToast(t);
      }}
    >
      <div className="ws-toast-main">
        <div className="ws-toast-app">
          {isApp ? <AppIcon app={t.app as AppId} size={16} /> : null}
          <span>{appTitle(t.app)}</span>
          <span>{fmtClock(t.atMs, epoch)}</span>
        </div>
        <div className="ws-toast-title">{t.title}</div>
        {t.body ? <div className="ws-toast-body">{t.body}</div> : null}
      </div>
      {live ? (
        <button
          type="button"
          className="ws-toast-x"
          aria-label="Dismiss"
          onClick={(e) => {
            e.stopPropagation();
            dismissToast(t.id);
          }}
        >
          <Glyph.close size={12} />
        </button>
      ) : null}
    </div>
  );
}

export function Toasts() {
  const toasts = useShell((s) => s.toasts);
  if (!toasts.length) return null;
  return (
    <div className="ws-toasts" aria-live="polite" onPointerDown={(e) => e.stopPropagation()}>
      {toasts.map((t) => (
        <ToastCard key={t.id} t={t} live />
      ))}
    </div>
  );
}

export function BellFlyout() {
  const log = useShell((s) => s.log);
  return (
    <div className="ws-flyout ws-bell" onPointerDown={(e) => e.stopPropagation()}>
      <div className="ws-bell-head">
        <span>Notifications</span>
        {log.length ? (
          <button type="button" className="ws-start-more" onClick={clearNotificationLog}>
            Clear all
          </button>
        ) : null}
      </div>
      <div className="ws-bell-list">
        {log.length ? log.map((t) => <ToastCard key={t.id} t={t} live={false} />) : <div className="ws-bell-empty">No new notifications</div>}
      </div>
    </div>
  );
}
