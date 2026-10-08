/**
 * "Get from Version Control" (Apps §4.3, Cur M13 s3): URL → directory, validation, progress line, then
 * `sim.git.clone(repo, 'player')` and the project opens.
 */
import { useEffect, useRef, useState } from 'react';
import { getState } from '@/core/store';
import { emitAppAction, getWindowManager } from '@/computer/apps';
import { sim } from '@/sim';
import type { RepoId } from '@/sim';
import { Dialog } from './Dialog';

const REPOS: RepoId[] = ['gort', 'uia-remote', 'pigeon', 'orchestrator'];

export function parseRepoUrl(url: string): {
  repo: RepoId | null;
  known: boolean;
  valid: boolean;
} {
  const u = url.trim();
  const m = /^(?:git@github\.com:|https?:\/\/github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(u);
  if (!m) return { repo: null, known: false, valid: false };
  const repo = m[2] as RepoId;
  const known = m[1] === 'labsim-lab' && REPOS.includes(repo);
  return { repo: known ? repo : null, known, valid: true };
}

export function GetFromVcsDialog({ initialUrl, onCancel, onOpened }: { initialUrl?: string; onCancel(): void; onOpened(repo: RepoId, cloned: boolean): void }) {
  const [url, setUrl] = useState(initialUrl ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'url' | 'github' | 'ghe'>('url');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const parsed = parseRepoUrl(url);
  const dir = parsed.valid ? `~/IdeaProjects/${parsed.repo ?? /\/([\w.-]+?)(?:\.git)?\/?$/.exec(url.trim())?.[1] ?? ''}` : '';
  const exists = parsed.repo ? !!getState().lab.repos[parsed.repo]?.local : false;
  let fieldError: string | null = null;
  if (url.trim() && parsed.valid && !parsed.known) fieldError = 'Repository not found';

  const clone = () => {
    if (!parsed.repo || busy || exists) return;
    const repo = parsed.repo;
    const typed = url.trim();
    setBusy(`Cloning source repository ${typed}…`);
    setError(null);
    timer.current = setTimeout(() => {
      let r: { ok: boolean; error?: string };
      try {
        r = sim.git.clone(repo, 'player');
      } catch (e) {
        r = { ok: false, error: (e as Error)?.message || 'Internal error' };
      }
      emitAppAction('intellij', 'intellij.project.cloned', {
        repo,
        url: typed,
        ok: r.ok,
        error: r.ok ? null : (r.error ?? 'error'),
      });
      setBusy(null);
      if (!r.ok) {
        setError(`Clone failed\n${r.error ?? ''}`);
        return;
      }
      onOpened(repo, true);
    }, 1200);
  };

  return (
    <Dialog
      title="Get from Version Control"
      onCancel={onCancel}
      onOk={clone}
      bodyPad={false}
      footer={
        <>
          <button type="button" className="ij-btn ij-default" data-hint="intellij.getFromVcs" disabled={!parsed.repo || exists || !!busy} onClick={clone}>
            Clone
          </button>
          <button type="button" className="ij-btn" onClick={onCancel}>
            Cancel
          </button>
        </>
      }
    >
      <div className="ij-vcs-dialog">
        <div className="ij-vcs-side">
          {(
            [
              ['url', 'Repository URL'],
              ['github', 'GitHub'],
              ['ghe', 'GitHub Enterprise'],
            ] as const
          ).map(([id, label]) => (
            <div key={id} className={`ij-list-row${tab === id ? ' ij-active' : ''}`} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
              {label}
            </div>
          ))}
        </div>
        {tab === 'github' ? (
          <div className="ij-vcs-main">
            <div className="ij-vcs-account">labsim-lab · signed in as new-hire</div>
            {REPOS.map((r) => {
              const u = `https://github.com/labsim-lab/${r}.git`;
              return (
                <div
                  key={r}
                  className={`ij-list-row${url.trim() === u ? ' ij-active' : ''}`}
                  onClick={() => {
                    setUrl(u);
                    setError(null);
                  }}
                  onDoubleClick={() => {
                    setUrl(u);
                    setTab('url');
                  }}
                >
                  labsim-lab/{r}
                </div>
              );
            })}
            <div className="ij-vcs-account" style={{ marginTop: 12 }}>
              {url.trim() ? `URL: ${url.trim()}` : 'Select a repository, then Clone.'}
            </div>
          </div>
        ) : tab === 'ghe' ? (
          <div className="ij-vcs-main">
            <div className="ij-vcs-account">No GitHub Enterprise accounts. The lab&apos;s repositories live on github.com (GitHub tab).</div>
          </div>
        ) : (
          <div className="ij-vcs-main">
            <div className="ij-form">
              <label htmlFor="ij-vcs-type">Version control:</label>
              <select id="ij-vcs-type" className="ij-select" style={{ width: 120 }} defaultValue="Git">
                <option>Git</option>
              </select>
              <label htmlFor="ij-vcs-url">URL:</label>
              <input
                id="ij-vcs-url"
                className={`ij-field-input${fieldError ? ' ij-invalid' : ''}`}
                value={url}
                spellCheck={false}
                autoComplete="off"
                data-autofocus
                onChange={(e) => {
                  setUrl(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
                    const t = getWindowManager()?.clipboard.read();
                    if (t) {
                      e.preventDefault();
                      const el = e.currentTarget;
                      const s = el.selectionStart ?? url.length;
                      const en = el.selectionEnd ?? url.length;
                      setUrl(url.slice(0, s) + t.trim() + url.slice(en));
                    }
                  }
                }}
              />
              {fieldError ? <div className="ij-field-error">{fieldError}</div> : null}
              <label htmlFor="ij-vcs-dir">Directory:</label>
              <input id="ij-vcs-dir" className="ij-field-input" value={dir} readOnly />
              {exists ? (
                <div className="ij-field-error">
                  Directory &apos;{dir}&apos; already exists and is not empty{' '}
                  <button type="button" className="ij-link" onClick={() => parsed.repo && onOpened(parsed.repo, false)}>
                    Open
                  </button>
                </div>
              ) : null}
            </div>
            {busy ? (
              <div className="ij-clone-progress">
                {busy}
                <span className="ij-progress" />
              </div>
            ) : null}
            {error ? (
              <div className="ij-clone-progress ij-err" style={{ whiteSpace: 'pre-wrap' }}>
                {error}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </Dialog>
  );
}
