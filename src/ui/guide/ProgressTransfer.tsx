/**
 * Export / import progress (Settings → Profile and the main-menu Profile screen). Progress lives only
 * in this browser's localStorage; export writes `{ format: 'labsim-progress', version, exportedAt,
 * progress }` to a JSON file, import validates such a file (`parseProgressImport`), shows who/what it
 * contains and replaces the current progress only after the player confirms. Bad files change nothing.
 */
import { useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { mutate, store, useGame } from '@/core/store';
import type { ProgressState } from '@/core/state';
import { buildExportPayload, exportFileName, IMPORT_MAX_BYTES, parseProgressImport, saveProgress, summarizeProgress, withDeviceSettings, type ProgressSummary } from '@/core/persistence';
import { MODULES, RANKS_BY_ID } from '@/content';
import { Button, Icon, Modal } from '@/ui/kit';
import { pushToast } from '@/ui/services/toasts';
import { dateLabel, num } from '@/ui/services/format';
import './guide.css';

const LAST_EXPORT_KEY = 'labsim.lastExportAt';

export function lastExportAt(): number {
  try {
    return Number(localStorage.getItem(LAST_EXPORT_KEY)) || 0;
  } catch {
    return 0;
  }
}

/** Download the current progress as a JSON file (falls back to opening it in a new tab). */
export function exportProgressFile(): void {
  const p = store.getState().progress;
  const now = new Date();
  const json = JSON.stringify(buildExportPayload(p, now), null, 2);
  const name = exportFileName(p.playerName, now);
  let url: string | null = null;
  try {
    const blob = new Blob([json], { type: 'application/json' });
    url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    if ('download' in a) {
      a.href = url;
      a.download = name;
      a.rel = 'noopener';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else {
      window.open(url, '_blank', 'noopener');
    }
  } catch (err) {
    console.warn('[progress] export download failed, opening the JSON instead', err);
    try {
      window.open(`data:application/json;charset=utf-8,${encodeURIComponent(json)}`, '_blank', 'noopener');
    } catch {
      pushToast({ kind: 'error', title: 'Export failed', body: 'This browser blocked the download.' });
      return;
    }
  } finally {
    const u = url;
    if (u) setTimeout(() => URL.revokeObjectURL(u), 60_000);
  }
  try {
    localStorage.setItem(LAST_EXPORT_KEY, String(Date.now()));
  } catch {
    /* per-viewer convenience only */
  }
  pushToast({ kind: 'success', title: 'Progress exported', body: name, icon: 'check' });
}

function applyImport(imported: ProgressState): void {
  const progress = withDeviceSettings(imported, store.getState().progress);
  mutate((s) => {
    s.progress = progress;
  });
  saveProgress(store.getState().progress);
  pushToast({ kind: 'success', title: 'Progress imported', body: `Welcome back, ${progress.playerName}.`, icon: 'check' });
}

function rankTitle(id: string): string {
  return RANKS_BY_ID[id]?.title ?? id;
}

/** Export + import buttons, the hidden file picker, error line and confirm dialog. */
export function ProgressTransfer({ layout = 'row' }: { layout?: 'row' | 'stack' }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inActivity = useGame((s) => s.session.mode !== 'menu');
  const [pending, setPending] = useState<{ progress: ProgressState; summary: ProgressSummary; file: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (file.size > IMPORT_MAX_BYTES) {
      setError('That file is far too big to be a LabSim progress file.');
      return;
    }
    setBusy(true);
    try {
      const text = await file.text();
      const r = parseProgressImport(text);
      if (r.ok) setPending({ progress: r.progress, summary: r.summary, file: file.name });
      else setError(r.error);
    } catch {
      setError('That file could not be read.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className={`xfer xfer--${layout}`}>
      <div className="xfer__buttons">
        <Button icon="arrow-down" onClick={exportProgressFile}>
          Export progress
        </Button>
        <Button icon="arrow-up" onClick={() => inputRef.current?.click()} disabled={busy || inActivity} title={inActivity ? 'Import from the main menu (not during an activity)' : undefined}>
          {busy ? 'Reading…' : 'Import progress…'}
        </Button>
        <input ref={inputRef} type="file" accept="application/json,.json" className="xfer__input" tabIndex={-1} aria-hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>
      {inActivity ? <div className="muted xfer__note">Import is available from the main menu.</div> : null}
      {error ? (
        <div className="xfer__error" role="alert">
          <Icon name="alert" size={14} /> <span>{error} Nothing was changed.</span>
        </div>
      ) : null}
      {pending ? (
        <ConfirmImport
          pending={pending}
          onCancel={() => setPending(null)}
          onConfirm={() => {
            applyImport(pending.progress);
            setPending(null);
          }}
        />
      ) : null}
    </div>
  );
}

function ConfirmImport({ pending, onCancel, onConfirm }: { pending: { summary: ProgressSummary; file: string }; onCancel: () => void; onConfirm: () => void }) {
  const current = useGame((s) => s.progress);
  const cur = summarizeProgress(current);
  const inc = pending.summary;
  const exported = inc.exportedAt ? Date.parse(inc.exportedAt) : NaN;
  // Esc cancels here, without also closing the panel underneath.
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onCancel();
    }
  };
  const host = (typeof document !== 'undefined' && document.querySelector('.ui-root')) || null;
  const dialog = (
    <div className="xfer-modal" onKeyDown={onKey}>
      <Modal width="min(580px, calc(100vw / var(--ui-scale, 1) - 32px))" onClose={onCancel} labelledBy="xfer-title" backdrop="blur" closeOnBackdrop>
        <div className="ov-head">
          <h2 id="xfer-title">Replace your progress?</h2>
        </div>
        <p className="muted xfer-modal__file">
          <Icon name="book" size={13} /> {pending.file}
          {Number.isFinite(exported) ? ` · exported ${dateLabel(exported)}` : ''}
        </p>
        <div className="xfer-modal__compare">
          <ProgressBox label="In the file" s={inc} tone="new" />
          <Icon name="arrow-right" size={18} />
          <ProgressBox label="Now in this browser" s={cur} tone="old" />
        </div>
        <p className="xfer-modal__warn">
          <Icon name="alert" size={14} /> Importing replaces everything in this browser — XP, modules, flashcards, achievements and settings (graphics settings stay as they are on this device). It cannot be undone, so export your current progress first if you might want it back.
        </p>
        <div className="xfer-modal__actions">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <span className="spacer" />
          <Button icon="arrow-down" onClick={exportProgressFile}>
            Export current first
          </Button>
          <Button variant="primary" icon="check" onClick={onConfirm}>
            Replace progress
          </Button>
        </div>
      </Modal>
    </div>
  );
  return host ? createPortal(dialog, host) : dialog;
}

function ProgressBox({ label, s, tone }: { label: string; s: ProgressSummary; tone: 'new' | 'old' }) {
  return (
    <div className={`xfer-box xfer-box--${tone}`}>
      <div className="caps">{label}</div>
      <div className="xfer-box__name">{s.playerName}</div>
      <div className="muted">{rankTitle(s.rank)}</div>
      <div className="xfer-box__stats tnum">
        <span>{num(s.xp)} XP</span>
        <span>
          {s.modulesDone}/{MODULES.length} modules
        </span>
      </div>
    </div>
  );
}

/** Profile-screen reminder: progress is stored only in this browser. */
export function LocalSaveNotice() {
  const [last] = useState(lastExportAt);
  return (
    <div className="xfer-notice" role="note">
      <Icon name="info" size={18} />
      <div className="grow">
        <div className="xfer-notice__title">Your progress is saved only in this browser</div>
        <div className="muted">Clearing site data, a private window or another device starts from zero. Export a backup file to keep it safe or move it to another browser{last ? ` — last export ${dateLabel(last)}` : ''}.</div>
      </div>
      <ProgressTransfer />
    </div>
  );
}
