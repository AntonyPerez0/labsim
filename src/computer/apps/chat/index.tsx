/**
 * LabChat — Slack-like team chat (docs/design/50-computer-apps.md §11). Reads `lab.chat`; writes through
 * `sim.chat.post` / `sim.chat.markRead`. Routes `/channel/:name`, `/dm/:user`, `/mentions`.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { getState, useGame } from '@/core/store';
import { sim } from '@/sim';
import type { ChatMessage } from '@/sim/types';
import { emitAppAction, getChatReplies, type AppProps, type ChatReplyOption } from '../../apps';
import { MessageList } from './Message';
import { CHANNEL_TOPICS, DEFAULT_CHANNELS, channelFromRoute, channelTitle, dmPeople, isPlayerAuthor, mentionsPlayer, routeForChannel } from './model';
import './chat.css';

const EMPTY: ChatMessage[] = [];

function safe(fn: () => void): void {
  try {
    fn();
  } catch (err) {
    console.warn('[chat] sim call failed', err);
  }
}

function HashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.2 1.5L5.1 14.5M10.9 1.5L9.8 14.5M2 5.5h12.5M1.5 10.5H14" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function QuickSwitcher(props: { items: { id: string; label: string }[]; onPick(id: string): void; onClose(): void }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const list = props.items.filter((x) => x.label.toLowerCase().includes(q.toLowerCase())).slice(0, 10);
  return (
    <div className="lc-switcher-veil" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className="lc-switcher" role="dialog" aria-label="Jump to…">
        <input
          autoFocus
          placeholder="Jump to…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setI(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              props.onClose();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setI((x) => Math.min(x + 1, list.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setI((x) => Math.max(0, x - 1));
            } else if (e.key === 'Enter' && list[i]) {
              e.preventDefault();
              props.onPick(list[i]!.id);
            }
          }}
        />
        {list.map((x, n) => (
          <button key={x.id} type="button" className={`lc-switch-row${n === i ? ' lc-switch-row-on' : ''}`} onClick={() => props.onPick(x.id)}>
            {x.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChatApp(props: AppProps) {
  const { navigate, onTitle, focused, wm } = props;
  const route = props.route ?? '/channel/lab-automation';
  const mentionsView = route.startsWith('/mentions');
  const channel = mentionsView ? null : (channelFromRoute(route) ?? '#lab-automation');
  const messages = useGame((s) => s.lab.chat?.messages ?? EMPTY);
  const unread = useGame((s) => s.lab.chat?.unread);
  const playerName = useGame((s) => s.progress.playerName);
  const nowMs = useGame((s) => Math.floor(s.lab.time.nowMs / 60_000) * 60_000);
  const epochDate = useGame((s) => s.lab.time.epochDate);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [switcher, setSwitcher] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const channels = useMemo(() => {
    const set = new Set(DEFAULT_CHANNELS);
    for (const m of messages) if (m.channel.startsWith('#')) set.add(m.channel);
    return [...set];
  }, [messages]);
  const dms = useMemo(() => {
    const people = dmPeople();
    const keys = new Set(people.map((p) => p.key));
    const extra: { key: string; name: string; color: string }[] = [];
    for (const m of messages) {
      if (m.channel.startsWith('dm:')) {
        const k = m.channel.slice(3);
        if (!keys.has(k)) {
          keys.add(k);
          extra.push({ key: k, name: channelTitle(m.channel, m.author), color: '#555' });
        }
      }
    }
    return [...people, ...extra];
  }, [messages]);
  const ordered = useMemo(() => [...channels, ...dms.map((d) => `dm:${d.key}`)], [channels, dms]);

  const isMention = (m: ChatMessage) => !isPlayerAuthor(m.author) && mentionsPlayer(m.text, playerName);
  const shown = useMemo(() => (mentionsView ? messages.filter(isMention) : messages.filter((m) => m.channel === channel)), [messages, channel, mentionsView, playerName]); // eslint-disable-line react-hooks/exhaustive-deps
  const last = shown[shown.length - 1] ?? null;

  // Title, mark read and `chat.channel.opened` on channel change.
  const title = mentionsView ? 'Mentions & reactions' : channel!.startsWith('dm:') ? channelTitle(channel!) : channel!;
  useEffect(() => {
    onTitle?.(`${title} — LabChat`);
  }, [title, onTitle]);
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!channel || openedFor.current === channel) return;
    openedFor.current = channel;
    safe(() => sim.chat.markRead(channel));
    emitAppAction('chat', 'chat.channel.opened', { channel });
  }, [channel]);
  // New messages in the open channel while the window is focused are read immediately.
  useEffect(() => {
    if (!channel || !focused) return;
    if ((getState().lab.chat?.unread?.[channel] ?? 0) > 0) safe(() => sim.chat.markRead(channel));
  }, [channel, focused, last?.id]);

  // Stick to the bottom.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [shown.length, channel]);

  const replies: ChatReplyOption[] = useMemo(
    () => (channel ? getChatReplies({ channel, lastMessage: last ? { id: last.id, author: last.author, text: last.text, ticketId: last.ticketId } : null }) : []),
    [channel, last],
  );

  const go = (ch: string) => navigate?.(routeForChannel(ch));
  const text = channel ? (draft[channel] ?? '') : '';
  const setText = (v: string) => channel && setDraft((d) => ({ ...d, [channel]: v }));

  const send = () => {
    if (!channel) return;
    const t = text.trim();
    if (!t) return;
    safe(() => sim.chat.post(channel, 'player', t));
    emitAppAction('chat', 'chat.message.sent', { channel, text: t });
    setText('');
  };

  const choose = (o: ChatReplyOption) => {
    if (!channel) return;
    safe(() => sim.chat.post(channel, 'player', o.text, o.ticketId));
    const mine = [...getState().lab.chat.messages].reverse().find((m) => m.channel === channel && isPlayerAuthor(m.author) && m.text === o.text);
    emitAppAction('chat', 'chat.reply.chosen', { channel, ticketId: o.ticketId ?? null, replyId: o.id, messageId: mine?.id ?? null, text: o.text });
    // Like Slack: focus returns to the composer (a focused chip would re-send on Space/Enter).
    inputRef.current?.focus();
  };

  const onComposerKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === 'Escape' && !text && channel && (unread?.[channel] ?? 0) > 0) {
      // Only consumed when there is something to mark read: the composer is focused (and empty) almost
      // always, so consuming every Esc would make "first Esc stands up" (Apps §1.8) impossible here.
      e.preventDefault();
      safe(() => sim.chat.markRead(channel));
    }
  };

  // Alt+↑/↓, Alt+Shift+↑/↓ (unread), Ctrl+K.
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setSwitcher(true);
        return;
      }
      if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const i = channel ? ordered.indexOf(channel) : -1;
      const un = getState().lab.chat?.unread ?? {};
      for (let n = 1; n <= ordered.length; n++) {
        const c = ordered[(i + dir * n + ordered.length * 2) % ordered.length]!;
        if (!e.shiftKey || (un[c] ?? 0) > 0) {
          go(c);
          return;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, channel, ordered]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (focused && channel) inputRef.current?.focus({ preventScroll: true });
  }, [focused, channel]);

  const item = (ch: string, label: string, icon: React.ReactNode) => {
    const n = unread?.[ch] ?? 0;
    const on = ch === channel;
    return (
      <button key={ch} type="button" className={`lc-item${on ? ' lc-item-on' : ''}${n > 0 && !on ? ' lc-item-unread' : ''}`} onClick={() => go(ch)} data-hint={`chat.channel:${ch}`}>
        {icon}
        <span className="lc-item-label">{label}</span>
        {n > 0 && !on ? <span className="lc-badge">{n}</span> : null}
      </button>
    );
  };

  const dmLabel = channel?.startsWith('dm:') ? channelTitle(channel) : null;

  return (
    <div className="lc-root" data-app="chat" data-window={props.windowId}>
      <nav className="lc-side" aria-label="Channels">
        <div className="lc-ws">
          <span>LabSim Automation ▾</span>
          <span className="lc-compose-icon" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16">
              <path d="M11.5 2l2.5 2.5-7.5 7.5H4v-2.5zM2 14h12" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </span>
        </div>
        <div className="lc-side-scroll">
          <button type="button" className="lc-item">
            <span aria-hidden="true">💬</span>
            <span className="lc-item-label">Threads</span>
          </button>
          <button type="button" className={`lc-item${mentionsView ? ' lc-item-on' : ''}`} onClick={() => navigate?.('/mentions')}>
            <span aria-hidden="true">@</span>
            <span className="lc-item-label">Mentions &amp; reactions</span>
          </button>
          <div className="lc-section">▾ Channels</div>
          {channels.map((c) => item(c, c.slice(1), <HashIcon />))}
          <div className="lc-section">▾ Direct messages</div>
          {dms.map((d) =>
            item(
              `dm:${d.key}`,
              d.name,
              <span className="lc-mini-avatar" style={{ background: d.color }}>
                {d.name.slice(0, 1)}
              </span>,
            ),
          )}
        </div>
      </nav>
      <section className="lc-main">
        <header className="lc-header">
          <span className="lc-header-name">{mentionsView ? 'Mentions & reactions' : (dmLabel ?? channel)}</span>
          {channel && CHANNEL_TOPICS[channel] ? <span className="lc-header-topic">{CHANNEL_TOPICS[channel]}</span> : null}
        </header>
        <div className="lc-messages" ref={listRef} aria-live="polite">
          {!mentionsView ? (
            <div className="lc-intro">
              <h3>{dmLabel ?? channel}</h3>
              {dmLabel ? `This conversation is just between you and ${dmLabel}.` : `This is the very beginning of the ${channel} channel.`}
            </div>
          ) : null}
          <MessageList messages={shown} playerName={playerName} nowMs={nowMs} epochDate={epochDate} wm={wm} isMention={isMention} />
          {mentionsView && shown.length === 0 ? <div className="lc-intro">No mentions yet.</div> : null}
        </div>
        {channel ? (
          <>
            {replies.length ? (
              <div className="lc-replies" role="group" aria-label="Quick replies">
                {replies.map((o) => (
                  <button key={o.id} type="button" className="lc-chip" title={o.text} onClick={() => choose(o)} data-hint={`chat.reply:${o.id}`}>
                    {o.label}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="lc-composer" data-hint="chat.composer">
              <div className="lc-toolbar" aria-hidden="true">
                {['B', 'I', 'S', '🔗', '≡', '</>'].map((t) => (
                  <span key={t} className="lc-tool">
                    {t}
                  </span>
                ))}
              </div>
              <textarea
                ref={inputRef}
                className="lc-input"
                rows={1}
                placeholder={`Message ${dmLabel ?? channel}`}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onComposerKey}
                aria-label={`Message ${dmLabel ?? channel}`}
              />
              <div className="lc-send-row">
                <button type="button" className="lc-send" disabled={!text.trim()} onClick={send} aria-label="Send now">
                  <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M1.5 14.5l13-6.5-13-6.5 2 6.5zM3.5 8h6" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        ) : null}
      </section>
      {switcher ? (
        <QuickSwitcher
          items={ordered.map((c) => ({ id: c, label: c.startsWith('dm:') ? channelTitle(c) : c }))}
          onClose={() => setSwitcher(false)}
          onPick={(c) => {
            setSwitcher(false);
            go(c);
          }}
        />
      ) : null}
    </div>
  );
}
