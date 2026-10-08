/**
 * Taskbar (Apps §1.2): Start, Search pill, pinned + running apps with indicators/badges/hover list,
 * system tray (overflow, network, speaker, bell, clock/calendar) and the [game] Stand up button.
 */
import { memo, useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import { APP_IDS, APP_META, fmtClock, fmtDate, gameDateParts, type AppId } from '../apps';
import { AppIcon, Glyph } from './icons';
import { isAppUnlocked } from './gating';
import { focusWindow, markNotificationsSeen, minimizeWindow, setPopup, shell, useShell, useShellShallow, wmApi } from './wmStore';
import { BellFlyout } from './Notifications';

function StartGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="1" y="1" width="8.4" height="8.4" rx="1" fill="#fff" />
      <rect x="10.6" y="1" width="8.4" height="8.4" rx="1" fill="#fff" />
      <rect x="1" y="10.6" width="8.4" height="8.4" rx="1" fill="#fff" />
      <rect x="10.6" y="10.6" width="8.4" height="8.4" rx="1" fill="#fff" />
    </svg>
  );
}

const PIN_ORDER: AppId[] = ['files', 'browser', 'orca', 'jenkins', 'github', 'intellij', 'terminal', 'chat', ...APP_IDS.filter((id) => !['files', 'browser', 'orca', 'jenkins', 'github', 'intellij', 'terminal', 'chat'].includes(id))];

function useChatUnread(): number {
  return useGame((s) => {
    let n = 0;
    for (const v of Object.values(s.lab.chat?.unread ?? {})) n += v || 0;
    return n;
  });
}

function useJenkinsFailures(sinceMs: number): number {
  return useGame((s) => {
    let n = 0;
    for (const b of Object.values(s.lab.jenkins?.builds ?? {})) {
      if (b.result === 'FAILURE' && b.finishedMs != null && b.finishedMs > sinceMs) n++;
    }
    return n;
  });
}

/** Activate a taskbar button (Windows rules: open, focus, minimise the focused one, or cycle). */
function activateApp(app: AppId): void {
  const s = shell.getState();
  const wins = s.windows.filter((w) => w.app === app);
  if (!wins.length) {
    wmApi.openApp(app);
    return;
  }
  if (wins.length === 1) {
    const w = wins[0]!;
    if (s.focusedId === w.id && !w.minimized) minimizeWindow(w.id);
    else focusWindow(w.id);
    return;
  }
  const order = s.mru.filter((id) => wins.some((w) => w.id === id));
  const focusedIdx = order.indexOf(s.focusedId ?? '');
  const next = focusedIdx >= 0 ? order[(focusedIdx + 1) % order.length] : order[0];
  if (next) focusWindow(next);
}


const TaskbarApp = memo(function TaskbarApp(props: { app: AppId; badge: number }) {
  const { app, badge } = props;
  const wins = useShellShallow((s) => s.windows.filter((w) => w.app === app).map((w) => `${w.id}\u0000${w.title}`));
  const focused = useShell((s) => {
    const f = s.windows.find((w) => w.id === s.focusedId);
    return !!f && f.app === app && !f.minimized;
  });
  const [hover, setHover] = useState(false);
  const meta = APP_META[app];
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        className={`ws-tb-btn${focused ? ' ws-tb-btn-open' : ''}`}
        aria-label={meta.title}
        data-hint={`desktop.taskbar:${app}`}
        // Like Windows, taskbar buttons never take keyboard focus (a focused button would turn the
        // first Space typed into the new window into a second click that minimises it).
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setHover(false);
          activateApp(app);
        }}
      >
        <AppIcon app={app} size={24} />
        {wins.length ? <span className={`ws-tb-ind${focused ? ' ws-tb-ind-focused' : ''}`} /> : null}
        {badge > 0 ? <span className="ws-tb-badge">{badge > 99 ? '99+' : badge}</span> : null}
      </button>
      {hover ? (
        <div className="ws-tb-tip" role="menu">
          {wins.length ? (
            wins.map((w) => {
              const [id, title] = w.split('\u0000') as [string, string];
              return (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  className="ws-tb-tip-row"
                  onClick={() => {
                    setHover(false);
                    focusWindow(id);
                  }}
                >
                  <AppIcon app={app} size={16} />
                  {title}
                </button>
              );
            })
          ) : (
            <div className="ws-tb-tip-label">{meta.title}</div>
          )}
        </div>
      ) : null}
    </div>
  );
});

function CalendarFlyout() {
  const nowS = useGame((s) => Math.floor(s.lab.time.nowMs / 60000));
  const epoch = useGame((s) => s.lab.time.epochDate);
  const scale = useGame((s) => s.lab.time.timeScale);
  const p = gameDateParts(nowS * 60000, epoch);
  const first = new Date(Date.UTC(p.y, p.mo - 1, 1));
  const startDow = first.getUTCDay();
  const daysIn = new Date(Date.UTC(p.y, p.mo, 0)).getUTCDate();
  const prevDays = new Date(Date.UTC(p.y, p.mo - 1, 0)).getUTCDate();
  const cells: { d: number; out: boolean; today: boolean }[] = [];
  for (let i = 0; i < startDow; i++) cells.push({ d: prevDays - startDow + 1 + i, out: true, today: false });
  for (let d = 1; d <= daysIn; d++) cells.push({ d, out: false, today: d === p.d });
  while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ d: cells.length - startDow - daysIn + 1, out: true, today: false });
  const month = new Date(Date.UTC(p.y, p.mo - 1, 1)).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  const dow = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const weekday = new Date(Date.UTC(p.y, p.mo - 1, p.d)).toLocaleString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return (
    <div className="ws-flyout ws-calendar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="ws-cal-title">
        {weekday}, {month} {p.d}
      </div>
      <div className="ws-cal-sub">
        {month} {p.y}
      </div>
      <div className="ws-cal-grid">
        {dow.map((d) => (
          <div key={d} className="ws-cal-dow">
            {d}
          </div>
        ))}
        {cells.map((c, i) => (
          <div key={i} className={c.today ? 'ws-cal-today' : c.out ? 'ws-cal-out' : undefined}>
            {c.d}
          </div>
        ))}
      </div>
      <div className="ws-cal-game">Lab time ×{scale}</div>
    </div>
  );
}

function TrayFlyout(props: { kind: 'network' | 'volume' | 'tray' }) {
  const switchUp = useGame((s) => s.lab.network?.switchUp !== false);
  const vol = useGame((s) => Math.round((s.progress.settings?.masterVolume ?? 0.8) * 100));
  const cardPending = useShell((s) => s.windows.some((w) => w.app === 'cardreader'));
  return (
    <div className="ws-flyout ws-trayflyout" onPointerDown={(e) => e.stopPropagation()}>
      {props.kind === 'network' ? (
        <>
          <div style={{ fontWeight: 600 }}>lab-corp</div>
          <div>{switchUp ? 'Connected' : 'No internet access'}</div>
          <div style={{ color: '#ffffffa0' }}>ws-17 · 10.42.50.17 · Ethernet</div>
        </>
      ) : props.kind === 'volume' ? (
        <>
          <div style={{ fontWeight: 600 }}>Speakers</div>
          <div>{vol}%</div>
        </>
      ) : (
        <>
          <div style={{ fontWeight: 600 }}>Background apps</div>
          <div>USB HID MSR (MagStripe Reader) — {cardPending ? 'open' : 'ready'}</div>
          <div>Lab VPN — connected</div>
        </>
      )}
    </div>
  );
}

export function Taskbar(props: { onStandUp(): void; unlocked: 'all' | string[] }) {
  const popup = useShell((s) => s.popup);
  const runningApps = useShellShallow((s) => {
    const seen: AppId[] = [];
    for (const w of s.windows) if (!seen.includes(w.app)) seen.push(w.app);
    return seen;
  });
  const jenkinsSeen = useShell((s) => s.jenkinsSeenMs);
  const jenkinsFocused = useShell((s) => s.windows.find((w) => w.id === s.focusedId)?.app === 'jenkins');
  const chatUnread = useChatUnread();
  const jenkinsFail = useJenkinsFailures(jenkinsSeen);
  const unseen = useShell((s) => s.unseen);
  const nowSec = useGame((s) => Math.floor(s.lab.time.nowMs / 1000));
  const epoch = useGame((s) => s.lab.time.epochDate);
  const switchUp = useGame((s) => s.lab.network?.switchUp !== false);
  const vol = useGame((s) => Math.round((s.progress.settings?.masterVolume ?? 0.8) * 100));

  const gating = useMemo(() => ({ unlockedApps: props.unlocked, restrictions: {}, forceHealthCheckButton: false, tabCompletion: true }), [props.unlocked]);
  const pinned = PIN_ORDER.filter((id) => APP_META[id].pinned && isAppUnlocked(gating, id));
  const extra = runningApps.filter((id) => !pinned.includes(id));
  const badge = (id: AppId) => (id === 'chat' ? chatUnread : id === 'jenkins' && !jenkinsFocused ? jenkinsFail : 0);
  const toggle = (p: NonNullable<typeof popup>) => setPopup(popup === p ? null : p);

  return (
    <div className="ws-taskbar" role="toolbar" aria-label="Taskbar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="ws-tb-center">
        <button type="button" className={`ws-tb-btn${popup === 'start' ? ' ws-tb-btn-open' : ''}`} aria-label="Start" onClick={() => toggle('start')}>
          <StartGlyph />
        </button>
        <button type="button" className="ws-tb-search" onClick={() => setPopup('start')}>
          <Glyph.search size={14} />
          Search
        </button>
        {pinned.map((id) => (
          <TaskbarApp key={id} app={id} badge={badge(id)} />
        ))}
        {extra.length ? <span className="ws-tb-sep" /> : null}
        {extra.map((id) => (
          <TaskbarApp key={id} app={id} badge={badge(id)} />
        ))}
      </div>
      <div className="ws-tray">
        <button type="button" className={`ws-tray-btn${popup === 'tray' ? ' ws-tray-btn-open' : ''}`} aria-label="Show hidden icons" onClick={() => toggle('tray')}>
          <Glyph.chevronUp size={14} />
        </button>
        <button
          type="button"
          className={`ws-tray-btn${popup === 'network' ? ' ws-tray-btn-open' : ''}`}
          title={switchUp ? 'lab-corp · Connected' : 'No internet access'}
          aria-label={switchUp ? 'lab-corp · Connected' : 'No internet access'}
          onClick={() => toggle('network')}
        >
          <Glyph.network size={16} />
          {!switchUp ? <span className="ws-tray-dot" style={{ background: '#e81123' }} /> : null}
        </button>
        <button
          type="button"
          className={`ws-tray-btn${popup === 'volume' ? ' ws-tray-btn-open' : ''}`}
          title={`Speakers: ${vol}%`}
          aria-label={`Speakers: ${vol}%`}
          onClick={() => toggle('volume')}
        >
          <Glyph.speaker size={16} />
        </button>
        <button
          type="button"
          className={`ws-tray-btn${popup === 'bell' ? ' ws-tray-btn-open' : ''}`}
          aria-label="Notifications"
          onClick={() => {
            toggle('bell');
            markNotificationsSeen();
          }}
        >
          <Glyph.bell size={16} />
          {unseen > 0 ? <span className="ws-bellcount">{unseen}</span> : null}
        </button>
        <button type="button" className={`ws-tray-btn${popup === 'calendar' ? ' ws-tray-btn-open' : ''}`} aria-label="Clock" onClick={() => toggle('calendar')}>
          <span className="ws-clock">
            <span>{fmtClock(nowSec * 1000, epoch)}</span>
            <span>{fmtDate(nowSec * 1000, epoch)}</span>
          </span>
        </button>
        <button type="button" className="ws-standup" data-hint="desktop.standUp" onClick={props.onStandUp}>
          <Glyph.chair size={16} />
          Stand up · Esc
        </button>
      </div>
      {popup === 'calendar' ? <CalendarFlyout /> : null}
      {popup === 'bell' ? <BellFlyout /> : null}
      {popup === 'network' || popup === 'volume' || popup === 'tray' ? <TrayFlyout kind={popup} /> : null}
    </div>
  );
}
