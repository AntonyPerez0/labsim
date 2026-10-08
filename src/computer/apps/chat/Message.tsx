/**
 * LabChat message rendering: avatars, grouping, day dividers, the mrkdwn subset (Apps §11.2).
 */
import { Fragment, memo, type ReactNode } from 'react';
import type { ChatMessage } from '@/sim/types';
import { fmtClock, resolveUrl, type WindowManagerApi } from '../../apps';
import { authorColor, authorName, initials, isBot, parseBlocks, type Inline } from './model';

export function openLink(url: string, wm: WindowManagerApi | undefined): void {
  if (!wm) return;
  const r = resolveUrl(url);
  wm.openApp(r.app, r.app === 'browser' ? { url: r.route } : { route: r.route });
}

function renderInline(parts: Inline[], wm: WindowManagerApi | undefined, key = ''): ReactNode[] {
  return parts.map((p, i) => {
    const k = `${key}${i}`;
    switch (p.t) {
      case 'text':
        return <Fragment key={k}>{p.v}</Fragment>;
      case 'bold':
        return <b key={k}>{renderInline(p.v, wm, `${k}b`)}</b>;
      case 'italic':
        return <i key={k}>{renderInline(p.v, wm, `${k}i`)}</i>;
      case 'code':
        return (
          <code key={k} className="lc-code">
            {p.v}
          </code>
        );
      case 'mention':
        return (
          <span key={k} className="lc-mention">
            {p.v}
          </span>
        );
      case 'link':
        return (
          <a
            key={k}
            href={p.url}
            title={p.url}
            onClick={(e) => {
              e.preventDefault();
              openLink(p.url, wm);
            }}
          >
            {p.label}
          </a>
        );
      default:
        return null;
    }
  });
}

export const MessageText = memo(function MessageText(props: { text: string; wm: WindowManagerApi | undefined }) {
  const blocks = parseBlocks(props.text);
  return (
    <div className="lc-text">
      {blocks.map((b, i) =>
        b.t === 'pre' ? (
          <pre key={i} className="lc-pre">
            {b.v}
          </pre>
        ) : (
          <p key={i}>{renderInline(b.v, props.wm, `p${i}-`)}</p>
        ),
      )}
    </div>
  );
});

export function Avatar(props: { author: string; name: string; size?: number }) {
  const bot = isBot(props.author);
  return (
    <span className="lc-avatar" style={{ background: authorColor(props.author), width: props.size, height: props.size }} aria-hidden="true">
      {bot ? (
        <svg width="20" height="20" viewBox="0 0 24 24">
          <rect x="4" y="7" width="16" height="12" rx="3" fill="#fff" />
          <circle cx="9" cy="13" r="1.6" fill="#333" />
          <circle cx="15" cy="13" r="1.6" fill="#333" />
          <path d="M12 3v4" stroke="#fff" strokeWidth="2" />
        </svg>
      ) : (
        initials(props.name)
      )}
    </span>
  );
}

const DAY = 86_400_000;

export function dayLabel(atMs: number, nowMs: number, epochDate: string): string {
  const d = Math.floor(nowMs / DAY) - Math.floor(atMs / DAY);
  if (d === 0) return 'Today';
  if (d === 1) return 'Yesterday';
  const [y, m, dd] = epochDate.split('-').map(Number);
  const t = new Date(Date.UTC(y!, m! - 1, dd!) + Math.floor(atMs / DAY) * DAY);
  return t.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export function MessageList(props: {
  messages: ChatMessage[];
  playerName: string;
  nowMs: number;
  epochDate: string;
  wm: WindowManagerApi | undefined;
  isMention(m: ChatMessage): boolean;
}) {
  const { messages, playerName, nowMs, epochDate, wm } = props;
  const out: ReactNode[] = [];
  let lastDay = -Infinity;
  let prev: ChatMessage | null = null;
  for (const m of messages) {
    const day = Math.floor(m.atMs / DAY);
    if (day !== lastDay) {
      out.push(
        <div key={`d${day}`} className="lc-day" role="separator">
          <span>{dayLabel(m.atMs, nowMs, epochDate)}</span>
        </div>,
      );
      lastDay = day;
      prev = null;
    }
    const grouped = !!prev && prev.author === m.author && m.atMs - prev.atMs < 5 * 60_000 && !m.ticketId;
    const name = authorName(m.author, playerName);
    out.push(
      <div key={m.id} className={`lc-msg${grouped ? ' lc-msg-cont' : ''}${props.isMention(m) ? ' lc-msg-mention' : ''}`} data-msg={m.id}>
        {grouped ? (
          <span className="lc-gutter">{fmtClock(m.atMs, epochDate).replace(/ [AP]M$/, '')}</span>
        ) : (
          <Avatar author={m.author} name={name} />
        )}
        <div className="lc-body">
          {grouped ? null : (
            <div className="lc-meta">
              <span className="lc-author">{name}</span>
              {isBot(m.author) ? <span className="lc-app">APP</span> : null}
              <span className="lc-time">{fmtClock(m.atMs, epochDate)}</span>
              {m.ticketId ? <span className="lc-ticket">{m.ticketId}</span> : null}
            </div>
          )}
          <MessageText text={m.text} wm={wm} />
        </div>
      </div>,
    );
    prev = m;
  }
  return <>{out}</>;
}
