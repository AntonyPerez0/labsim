/**
 * MagStripe Reader (Apps §12.1) — the desk's USB keyboard-wedge reader utility, Windows classic look.
 * Physical swipes arrive as `workstation.cardSwiped` (listener in `./model`, started by `initComputer()`);
 * `Simulate swipe ▾` [game] does the same from the window. Copy buttons write the desktop clipboard and emit
 * `cardreader.copied`. Exports `CardReaderApp` (APP_META.cardreader.exportName) and the listener for boot.
 */
import { useEffect, useRef, useState } from 'react';
import { emitAppAction, type AppProps, type DeskTestCard } from '../../apps';
import { clipboard as shellClipboard } from '../../shell/wmStore';
import { DESK_CARD_LABEL, clearReader, statusText, swipe, useReader } from './model';
import './cardreader.css';

export { startCardReaderListener } from './model';

type Field = 'track1' | 'track2' | 'track3' | 'tracks';

export function CardReaderApp(props: AppProps) {
  const { onTitle, wm } = props;
  const tracks = useReader((s) => s.tracks);
  const raw = useReader((s) => s.raw);
  const swipes = useReader((s) => s.swipes);
  const status = useReader((s) => s.status);
  const card = useReader((s) => s.card);
  const statusLine = useReader(statusText);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState<Field | null>(null);
  const [flash, setFlash] = useState(false);
  const rawRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    onTitle?.('MagStripe Reader');
  }, [onTitle]);

  useEffect(() => {
    if (!swipes) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    if (rawRef.current) rawRef.current.scrollTop = rawRef.current.scrollHeight;
    return () => clearTimeout(t);
  }, [swipes]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [menu]);

  const copy = (field: Field) => {
    const text = field === 'tracks' ? tracks.track1 + tracks.track2 : tracks[field];
    if (!text) return;
    (wm?.clipboard ?? shellClipboard).write(text, 'cardreader');
    emitAppAction('cardreader', 'cardreader.copied', { field, text });
    setCopied(field);
    setTimeout(() => setCopied((c) => (c === field ? null : c)), 1200);
  };

  const doSwipe = (c: DeskTestCard) => {
    setMenu(false);
    swipe(c);
  };

  const trackRow = (n: 1 | 2 | 3) => {
    const field = `track${n}` as 'track1' | 'track2' | 'track3';
    return (
      <div className="cr-row" key={field}>
        <label className="cr-label" htmlFor={`${props.windowId}-${field}`}>
          Track {n}
        </label>
        <input
          id={`${props.windowId}-${field}`}
          className="cr-field"
          readOnly
          value={tracks[field]}
          spellCheck={false}
          onFocus={(e) => e.currentTarget.select()}
        />
        <button type="button" className="cr-btn cr-btn-sm" disabled={!tracks[field]} onClick={() => copy(field)}>
          {copied === field ? 'Copied' : 'Copy'}
        </button>
      </div>
    );
  };

  return (
    <div
      className="cr-root"
      data-app="cardreader"
      data-window={props.windowId}
      onKeyDown={(e) => {
        if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
          e.preventDefault();
          copy('tracks');
        }
        if (e.key === 'Escape' && menu) {
          e.preventDefault();
          e.stopPropagation();
          setMenu(false);
        }
      }}
    >
      <div className="cr-menubar" role="menubar">
        <span className="cr-menu-item">File</span>
        <span className="cr-menu-item">Edit</span>
        <div className="cr-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className={`cr-menu-item cr-menu-btn${menu ? ' is-open' : ''}`}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((m) => !m)}
          >
            Simulate swipe ▾
          </button>
          {menu && (
            <div className="cr-menu" role="menu">
              {(['test-card-visa', 'test-card-interac'] as DeskTestCard[]).map((c) => (
                <button key={c} type="button" role="menuitem" className="cr-menu-entry" onClick={() => doSwipe(c)}>
                  {DESK_CARD_LABEL[c]}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="cr-menu-item">Help</span>
      </div>

      <div className="cr-body">
        <fieldset className="cr-group">
          <legend>Reader</legend>
          <div className="cr-reader">
            <span className="cr-dot" aria-hidden="true" />
            <span>USB HID MSR (keyboard wedge) — Connected</span>
          </div>
          <div className={`cr-status${status === 'waiting' ? ' is-waiting' : ' is-ok'}${flash ? ' is-flash' : ''}`} aria-live="polite">
            {statusLine}
            {status === 'ok' && card && <span className="cr-card"> · {DESK_CARD_LABEL[card]}</span>}
          </div>
        </fieldset>

        <fieldset className="cr-group">
          <legend>Raw data</legend>
          <textarea ref={rawRef} className="cr-raw" readOnly value={raw} spellCheck={false} aria-label="Raw data" rows={3} />
        </fieldset>

        <fieldset className="cr-group">
          <legend>Parsed tracks</legend>
          {trackRow(1)}
          {trackRow(2)}
          {trackRow(3)}
        </fieldset>
      </div>

      <div className="cr-footer">
        <button
          type="button"
          className="cr-btn cr-btn-default"
          data-hint="cardreader.copyTracks"
          disabled={!tracks.track1 && !tracks.track2}
          onClick={() => copy('tracks')}
          title="Track 1 immediately followed by Track 2 (the format Orca stores) — Ctrl+Shift+C"
        >
          {copied === 'tracks' ? 'Copied' : 'Copy Track 1 + 2'}
        </button>
        <button type="button" className="cr-btn" onClick={clearReader}>
          Clear
        </button>
      </div>
      <div className="cr-statusbar">
        <span>COM: HID\VID_0801&amp;PID_0002</span>
        <span>{swipes ? `${swipes} swipe${swipes === 1 ? '' : 's'} this session` : 'Ready'}</span>
      </div>
    </div>
  );
}
