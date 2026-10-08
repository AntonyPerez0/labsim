/**
 * Ollama WebUI (`http://10.42.1.12:3000`) — the Vision PoC's Open-WebUI-like front-end (docs/design/50-computer-apps.md §9).
 * Chats are session-local (`chats.ts`); answers come only from `sim.ollama.ask` and `lab.ollama.requests`.
 * The shell draws the browser chrome and the "This site can't be reached" page when `ollama-vm` is down;
 * this app shows `Model server unreachable` when the VM is up but the `ollama` service (:11434) is not (GP INC10).
 */
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { getState, useGame, useGameShallow } from '@/core/store';
import { sim } from '@/sim';
import { emitAppAction, fmtClock, getWindowManager, matchRoute, APP_ROUTES, type AppProps } from '@/computer/apps';
import { createChat, deleteChat, getChat, newId, pushMessage, patchMessage, useChats, type Attachment, type Chat, type ChatMsg } from './chats';
import { AssistantMessage, Thumb, UserMessage } from './Message';
import { Llama, OI } from './icons';
import { Lightbox } from './Lightbox';
import { groupChats, ollamaServiceUp, RECEIPT_PROMPT, WEBCAM_PROMPT } from './model';
import './ollama.css';

const DEFAULT_MODEL = 'llava:latest';

export function OllamaApp(props: AppProps) {
  const route = props.route ?? props.params?.route ?? '/';
  const m = matchRoute(APP_ROUTES.ollama.chat.path, route);
  const chatId = m ? m.params.chatId ?? '' : null;
  const chats = useChats();
  const chat = chatId ? chats.find((c) => c.id === chatId) ?? null : null;
  const up = useGame((s) => ollamaServiceUp(s.lab));
  const models = useGameShallow((s) => s.lab.ollama?.models ?? []);
  const playerName = useGame((s) => s.progress?.playerName || 'Engineer');
  const nowMs = useGame((s) => Math.floor(s.lab.time.nowMs / 60_000) * 60_000);
  const wm = props.wm ?? getWindowManager();
  const { navigate: nav, onTitle, windowId } = props;

  const [model, setModel] = useState<string>(DEFAULT_MODEL);
  const [modelMenu, setModelMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [text, setText] = useState('');
  const [attach, setAttach] = useState<Attachment | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [search, setSearch] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState(true);
  const [retryFlash, setRetryFlash] = useState(0);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const navigate = useCallback(
    (r: string, opts?: { replace?: boolean }) => {
      if (nav) nav(r, opts);
      else getWindowManager()?.navigate(windowId, r, opts);
    },
    [nav, windowId],
  );

  // Unknown chat id (chats are browser-local) → back to a new chat.
  useEffect(() => {
    if (chatId && !getChat(chatId)) navigate('/', { replace: true });
  }, [chatId, navigate]);

  // Keep the model selector on the open chat's model.
  useEffect(() => {
    if (chat) setModel(chat.model);
  }, [chat?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = chat ? `${chat.title} | Open WebUI` : 'Open WebUI';
  useEffect(() => onTitle?.(title), [title, onTitle]);

  /* ── params.prompt / params.attach (missions, Lab Cameras "Send to Ollama") prefill without sending ── */
  const attachPath = useCallback((path: string): boolean => {
    const ref = getState().lab.workstation?.files?.[path];
    if (!ref || !ref.startsWith('img:')) return false;
    setAttach({ path, ref });
    emitAppAction('ollama', 'ollama.image.attached', { path, ref });
    return true;
  }, []);
  const pPrompt = props.params?.prompt;
  const pAttach = props.params?.attach;
  useEffect(() => {
    if (pPrompt != null) setText(pPrompt);
  }, [pPrompt]);
  useEffect(() => {
    if (!pAttach) return;
    const path = pAttach.startsWith('~') ? pAttach : `~/Downloads/${pAttach}`;
    if (!attachPath(path) && !pAttach.startsWith('~')) attachPath(`~/Pictures/${pAttach}`);
  }, [pAttach, attachPath]);

  /* ── auto-grow textarea (8 lines max) ── */
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 8 * 24 + 12)}px`;
  }, [text]);

  /* ── follow the conversation tail ── */
  const msgCount = chat?.messages.length ?? 0;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgCount, chat?.id]);

  const pickImage = async () => {
    if (!wm) return;
    const path = await wm.pickFile({ title: 'Open', filter: 'images', startDir: '~/Downloads' });
    if (path) attachPath(path);
  };

  /** Ask the sim; returns the assistant message to append. */
  const ask = useCallback((mdl: string, prompt: string, image: Attachment | null): ChatMsg => {
    let requestId: string | null = null;
    let error: string | null = null;
    try {
      const r = sim.ollama.ask(mdl, prompt, image?.ref ?? null, 'player');
      if (r.ok) requestId = r.value.requestId;
      else error = r.error;
    } catch (e) {
      console.warn('[ollama] sim.ollama.ask failed', e);
      error = 'Something went wrong';
    }
    emitAppAction('ollama', 'ollama.prompt.sent', { requestId, model: mdl, prompt, image: image?.ref ?? null, ok: requestId !== null, error });
    return { role: 'assistant', id: newId('a'), requestId, error, model: mdl, flag: null, rating: null, shown: false, atMs: getState().lab.time.nowMs };
  }, []);

  const canSend = text.trim().length > 0 && !!model && (up ? models.includes(model) : true);
  const send = () => {
    const prompt = text.trim();
    if (!prompt || !model) return;
    const nowMsNow = getState().lab.time.nowMs;
    let c: Chat | null = chat;
    if (!c) c = createChat(model, prompt, nowMsNow);
    pushMessage(c.id, { role: 'user', id: newId('u'), text: prompt, image: attach, atMs: nowMsNow });
    pushMessage(c.id, ask(model, prompt, attach));
    setText('');
    setAttach(null);
    if (!chat) navigate(`/c/${c.id}`);
    taRef.current?.focus();
  };

  const regenerate = (assistantId: string) => {
    if (!chat) return;
    const idx = chat.messages.findIndex((x) => x.id === assistantId);
    const user = [...chat.messages.slice(0, idx)].reverse().find((x) => x.role === 'user');
    if (!user || user.role !== 'user') return;
    const prev = chat.messages[idx];
    const mdl = prev && prev.role === 'assistant' ? prev.model : model;
    const fresh = ask(mdl, user.text, user.image);
    patchMessage(chat.id, assistantId, { ...fresh, id: assistantId } as Partial<ChatMsg>);
  };

  const newChat = () => {
    setText('');
    setAttach(null);
    navigate('/');
    window.setTimeout(() => taRef.current?.focus(), 0);
  };

  const pickModel = (mdl: string) => {
    setModel(mdl);
    setModelMenu(false);
    emitAppAction('ollama', 'ollama.model.selected', { model: mdl });
  };

  const copyLast = () => {
    const last = [...(chat?.messages ?? [])].reverse().find((x) => x.role === 'assistant');
    if (!last || last.role !== 'assistant' || !last.requestId) return;
    const req = getState().lab.ollama.requests.find((r) => r.id === last.requestId);
    if (req?.response) wm?.clipboard.write(req.response, 'ollama');
  };

  const onKeyDown = (e: RKeyboardEvent<HTMLDivElement>) => {
    const k = e.key.toLowerCase();
    if (e.key === 'Escape') {
      if (lightbox || modelMenu || moreMenu || search !== null) {
        setLightbox(null);
        setModelMenu(false);
        setMoreMenu(false);
        if (search !== null && !lightbox && !modelMenu && !moreMenu) setSearch(null);
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (e.ctrlKey && e.shiftKey && k === 'o') {
      e.preventDefault();
      newChat();
    } else if (e.ctrlKey && e.shiftKey && (e.key === ';' || e.key === ':')) {
      e.preventDefault();
      copyLast();
    } else if (e.ctrlKey && e.shiftKey && k === 's') {
      e.preventDefault();
      setSidebar((v) => !v);
    }
  };

  const onComposerKey = (e: RKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (canSend) send();
    }
  };

  const shownChats = useMemo(() => {
    const q = (search ?? '').trim().toLowerCase();
    return q ? chats.filter((c) => c.title.toLowerCase().includes(q)) : chats;
  }, [chats, search]);
  const groups = groupChats(shownChats, nowMs);
  const modelList = up ? models : [];
  const lastAssistantId = [...(chat?.messages ?? [])].reverse().find((x) => x.role === 'assistant')?.id;

  return (
    <div className="oll-root" data-app="ollama" data-window={windowId} onKeyDown={onKeyDown} key={props.reloadKey ?? 0}>
      {sidebar ? (
        <aside className="oll-side" aria-label="Chats">
          <div className="oll-side-top">
            <button type="button" className="oll-side-new" onClick={newChat} title="New Chat (Ctrl+Shift+O)">
              <span className="oll-logo-sm">
                <Llama size={18} />
              </span>
              <span>New Chat</span>
              <OI name="edit" size={17} />
            </button>
            <button type="button" className="oll-icon-btn" title="Close Sidebar" aria-label="Close Sidebar" onClick={() => setSidebar(false)}>
              <OI name="sidebar" />
            </button>
          </div>
          {search === null ? (
            <button type="button" className="oll-side-item" onClick={() => setSearch('')}>
              <OI name="search" size={16} /> Search
            </button>
          ) : (
            <div className="oll-side-search">
              <OI name="search" size={16} />
              <input autoFocus placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search chats" />
            </div>
          )}
          <nav className="oll-side-list">
            {groups.map((g) => (
              <div key={g.label} className="oll-side-group">
                <div className="oll-side-label">{g.label}</div>
                {g.chats.map((c) => (
                  <div key={c.id} className={`oll-side-chat${c.id === chatId ? ' oll-on' : ''}`}>
                    <button type="button" className="oll-side-chat-btn" onClick={() => navigate(`/c/${c.id}`)} title={c.title}>
                      {c.title}
                    </button>
                    <button
                      type="button"
                      className="oll-side-del"
                      aria-label={`Delete ${c.title}`}
                      title="Delete"
                      onClick={() => {
                        deleteChat(c.id);
                        if (c.id === chatId) navigate('/', { replace: true });
                      }}
                    >
                      <OI name="x" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {groups.length === 0 && search ? <div className="oll-side-empty">No results found</div> : null}
          </nav>
          <div className="oll-side-user">
            <span className="oll-user-av">{initials(playerName)}</span>
            <span>{playerName}</span>
          </div>
        </aside>
      ) : null}

      <main className="oll-main">
        <header className="oll-top">
          {!sidebar ? (
            <button type="button" className="oll-icon-btn" title="Open Sidebar" aria-label="Open Sidebar" onClick={() => setSidebar(true)}>
              <OI name="sidebar" />
            </button>
          ) : null}
          <div className="oll-model">
            <button type="button" className="oll-model-btn" aria-haspopup="listbox" aria-expanded={modelMenu} data-hint="ollama.model" onClick={() => setModelMenu((v) => !v)}>
              {modelList.length ? model : <span className="oll-no-models">No models available</span>}
              <OI name="caret" size={16} />
            </button>
            {modelMenu ? (
              <>
                <div className="oll-scrim" onClick={() => setModelMenu(false)} />
                <div className="oll-menu oll-model-menu" role="listbox" aria-label="Models">
                  <div className="oll-menu-search">
                    <OI name="search" size={15} /> <span>Search a model</span>
                  </div>
                  {modelList.length === 0 ? <div className="oll-menu-empty">No results found</div> : null}
                  {modelList.map((mdl) => (
                    <button key={mdl} type="button" role="option" aria-selected={mdl === model} className="oll-menu-item" onClick={() => pickModel(mdl)}>
                      <span className="oll-menu-av">
                        <Llama size={14} />
                      </span>
                      <span className="oll-menu-name">{mdl}</span>
                      <span className="oll-menu-tag">7B</span>
                      {mdl === model ? <OI name="check" size={16} /> : null}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
          <div className="oll-top-sp" />
          <div className="oll-more">
            <button type="button" className="oll-icon-btn" aria-label="More" title="More" onClick={() => setMoreMenu((v) => !v)}>
              <OI name="dots" />
            </button>
            {moreMenu ? (
              <>
                <div className="oll-scrim" onClick={() => setMoreMenu(false)} />
                <div className="oll-menu oll-more-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    className="oll-menu-item"
                    disabled={!chat}
                    onClick={() => {
                      setMoreMenu(false);
                      copyLast();
                    }}
                  >
                    <OI name="copy" size={16} /> Copy last response
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="oll-menu-item"
                    disabled={!chat}
                    onClick={() => {
                      setMoreMenu(false);
                      if (chat) {
                        deleteChat(chat.id);
                        navigate('/', { replace: true });
                      }
                    }}
                  >
                    <OI name="x" size={16} /> Delete chat
                  </button>
                </div>
              </>
            ) : null}
          </div>
          <span className="oll-user-av oll-top-av" title={playerName}>
            {initials(playerName)}
          </span>
        </header>

        {!up ? (
          <div className="oll-banner" role="alert" key={retryFlash}>
            <OI name="alert" size={18} />
            <div>
              <div className="oll-banner-title">Model server unreachable</div>
              <div className="oll-banner-sub">http://10.42.1.12:11434 — Connection refused</div>
            </div>
            <button type="button" className="oll-link" onClick={() => setRetryFlash((n) => n + 1)}>
              Retry
            </button>
          </div>
        ) : null}

        {chat ? (
          <div className="oll-thread" ref={listRef} aria-live="polite">
            <div className="oll-thread-in">
              {chat.messages.map((msg) =>
                msg.role === 'user' ? (
                  <UserMessage key={msg.id} m={msg} onOpen={setLightbox} />
                ) : (
                  <AssistantMessage key={msg.id + (msg.requestId ?? '')} chatId={chat.id} m={msg} wm={wm} last={msg.id === lastAssistantId} onRegenerate={() => regenerate(msg.id)} />
                ),
              )}
            </div>
          </div>
        ) : (
          <div className="oll-empty">
            <div className="oll-empty-head">
              <span className="oll-logo">
                <Llama size={34} />
              </span>
              <div className="oll-empty-model">{modelList.length ? model : 'Ollama WebUI'}</div>
            </div>
            <h1 className="oll-empty-title">How can I help you today?</h1>
            <div className="oll-suggest">
              <button type="button" className="oll-card" data-hint="ollama.suggest.receipt" onClick={() => setText(RECEIPT_PROMPT)}>
                <span className="oll-card-t">Check a receipt image</span>
                <span className="oll-card-s">Layout and tip math — PASS or FAIL</span>
              </button>
              <button type="button" className="oll-card" onClick={() => setText(WEBCAM_PROMPT)}>
                <span className="oll-card-t">Describe this webcam frame</span>
                <span className="oll-card-s">What is on the device screen?</span>
              </button>
            </div>
          </div>
        )}

        <div className={`oll-composer-wrap${chat ? '' : ' oll-composer-center'}`}>
          <div className="oll-composer">
            {attach ? (
              <div className="oll-attachments">
                <Thumb image={attach} onOpen={setLightbox} onRemove={() => setAttach(null)} />
                <span className="oll-attach-name">{attach.path.split('/').pop()}</span>
              </div>
            ) : null}
            <textarea
              ref={taRef}
              className="oll-textarea"
              rows={1}
              placeholder="Send a Message"
              value={text}
              data-hint="ollama.prompt"
              onChange={(e) => setText(e.target.value)}
              onKeyDown={onComposerKey}
              aria-label="Send a Message"
            />
            <div className="oll-composer-row">
              <button type="button" className="oll-icon-btn oll-plus" title="Upload Files" aria-label="Upload Files" data-hint="ollama.attach" onClick={() => void pickImage()} disabled={!!attach}>
                <OI name="plus" />
              </button>
              <div className="oll-top-sp" />
              <button type="button" className="oll-send" aria-label="Send message" title="Send message" data-hint="ollama.send" disabled={!canSend} onClick={send}>
                <OI name="send" />
              </button>
            </div>
          </div>
          <div className="oll-foot">
            LLMs can make mistakes. Verify important information. · {fmtClock(nowMs)}
          </div>
        </div>
      </main>
      {lightbox ? <Lightbox src={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? 'E') + (parts.length > 1 ? parts[parts.length - 1]![0] : '')).toUpperCase();
}
