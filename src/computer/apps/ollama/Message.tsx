/**
 * Ollama WebUI messages (Apps §9.2): user bubble with thumbnail, assistant message with pulsing dots while the
 * sim request runs, typing reveal (~60 chars/s, click to skip), action icons and the PoC review tags.
 */
import { useEffect, useRef, useState } from 'react';
import { useGame } from '@/core/store';
import { emitAppAction, getImage, peekImage, type WindowManagerApi } from '@/computer/apps';
import { FLAGS, patchMessage, type Attachment, type ChatMsg, type Flag } from './chats';
import { Llama, OI } from './icons';

export function Thumb(props: { image: Attachment; size?: number; onOpen?(src: string): void; onRemove?(): void }) {
  const [src, setSrc] = useState<string | null>(peekImage(props.image.ref)?.dataUrl ?? null);
  useEffect(() => {
    let live = true;
    let tries = 0;
    let t = 0;
    // The materializer registers asynchronously (initComputer) — retry briefly.
    const load = () =>
      void getImage(props.image.ref).then((e) => {
        if (!live) return;
        if (e) setSrc(e.dataUrl);
        else if (++tries < 12) t = window.setTimeout(load, 250);
      });
    if (!src) load();
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [props.image.ref, src]);
  const s = props.size ?? 64;
  return (
    <span className="oll-thumb" style={{ width: s, height: s }} title={props.image.path}>
      {src ? (
        <img src={src} alt={props.image.path} onClick={() => src && props.onOpen?.(src)} />
      ) : (
        <span className="oll-thumb-load" />
      )}
      {props.onRemove ? (
        <button type="button" className="oll-thumb-x" aria-label="Remove image" onClick={props.onRemove}>
          ×
        </button>
      ) : null}
    </span>
  );
}

export function UserMessage(props: { m: Extract<ChatMsg, { role: 'user' }>; onOpen(src: string): void }) {
  return (
    <div className="oll-user">
      {props.m.image ? (
        <div className="oll-user-img">
          <Thumb image={props.m.image} size={180} onOpen={props.onOpen} />
        </div>
      ) : null}
      <div className="oll-bubble">{props.m.text}</div>
    </div>
  );
}

export function AssistantMessage(props: {
  chatId: string;
  m: Extract<ChatMsg, { role: 'assistant' }>;
  wm: WindowManagerApi | null;
  onRegenerate(): void;
  last: boolean;
}) {
  const { m } = props;
  const req = useGame((s) => (m.requestId ? s.lab.ollama.requests.find((r) => r.id === m.requestId) ?? null : null));
  // The sim keeps the last 30 requests; a revealed answer is cached on the message (`text`).
  const cached = !req && m.text != null;
  const done = cached || (!!req && req.state === 'done');
  const text = m.error ?? (cached ? m.text! : done ? req!.response ?? '' : '');
  const [shown, setShown] = useState(m.shown ? text.length : 0);
  const emitted = useRef(m.shown);
  useEffect(() => {
    if (!done || m.error) return;
    if (shown >= text.length) {
      if (!emitted.current) {
        emitted.current = true;
        patchMessage(props.chatId, m.id, { shown: true, text });
        emitAppAction('ollama', 'ollama.response.received', { requestId: m.requestId!, response: text });
      }
      return;
    }
    const t = window.setTimeout(() => setShown((n) => Math.min(text.length, n + 3)), 50);
    return () => window.clearTimeout(t);
  }, [done, shown, text, m.error, m.id, m.requestId, props.chatId]);
  const flag = (f: Flag) => {
    if (!m.requestId) return;
    const next = m.flag === f ? null : f;
    patchMessage(props.chatId, m.id, { flag: next });
    if (next) emitAppAction('ollama', 'ollama.response.flagged', { requestId: m.requestId, flag: next });
  };
  const visible = m.error ? m.error : text.slice(0, shown);
  const typing = done && !m.error && shown < text.length;
  return (
    <div className="oll-asst">
      <span className="oll-avatar">
        <Llama size={20} />
      </span>
      <div className="oll-asst-body">
        <div className="oll-asst-name">{m.model}</div>
        {m.error ? (
          <div className="oll-error-card" role="alert">
            <OI name="alert" /> {m.error}
          </div>
        ) : !done ? (
          <div className="oll-dots" aria-label="Generating">
            <i />
            <i />
            <i />
          </div>
        ) : (
          <div className={`oll-asst-text${typing ? ' oll-typing' : ''}`} onClick={() => typing && setShown(text.length)} title={typing ? 'Click to skip' : undefined}>
            {visible}
          </div>
        )}
        {done && !typing && !m.error ? (
          <>
            <div className="oll-actions">
              <button type="button" className="oll-icon-btn" title="Copy" aria-label="Copy" onClick={() => props.wm?.clipboard.write(text, 'ollama')}>
                <OI name="copy" />
              </button>
              <button type="button" className="oll-icon-btn" title="Regenerate" aria-label="Regenerate" onClick={props.onRegenerate}>
                <OI name="refresh" />
              </button>
              <button type="button" className="oll-icon-btn" aria-pressed={m.rating === 'up'} title="Good Response" aria-label="Good Response" onClick={() => patchMessage(props.chatId, m.id, { rating: m.rating === 'up' ? null : 'up' })}>
                <OI name="up" />
              </button>
              <button type="button" className="oll-icon-btn" aria-pressed={m.rating === 'down'} title="Bad Response" aria-label="Bad Response" onClick={() => patchMessage(props.chatId, m.id, { rating: m.rating === 'down' ? null : 'down' })}>
                <OI name="down" />
              </button>
            </div>
            <div className="oll-flags" role="group" aria-label="Review tags">
              <span className="oll-flags-label">Review:</span>
              {FLAGS.map((f) => (
                <button key={f.id} type="button" className="oll-chip" aria-pressed={m.flag === f.id} data-hint={`ollama.flag:${f.id}`} onClick={() => flag(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
