/** Welcome to IntelliJ IDEA (Apps §4.3, route `/welcome`): recent projects (local clones), Open, Get from VCS. */
import { useState } from 'react';
import { useGameShallow } from '@/core/store';
import type { RepoId } from '@/sim';
import { Dialog } from './Dialog';
import { IcFolder, IcIdeaLogo } from './icons';
import { GetFromVcsDialog } from './VcsDialog';

const REPOS: RepoId[] = ['gort', 'uia-remote', 'pigeon', 'orchestrator'];
const BADGE: Record<string, string> = { gort: '#2f7d6b', 'uia-remote': '#8a5a2b', pigeon: '#5e4a8a', orchestrator: '#2b5d8a' };

export function Welcome({ onOpen, vcsUrl, notice }: { onOpen(repo: RepoId, cloned: boolean): void; vcsUrl?: string; notice?: string | null }) {
  const cloned = useGameShallow((s) => REPOS.filter((r) => !!s.lab.repos?.[r]?.local));
  const [dialog, setDialog] = useState<null | 'vcs' | 'open' | 'new'>(vcsUrl !== undefined ? 'vcs' : null);
  const [q, setQ] = useState('');
  const [nav, setNav] = useState('Projects');
  const [active, setActive] = useState(0);
  const list = cloned.filter((r) => r.includes(q.trim().toLowerCase()));

  return (
    <div className="ij-welcome">
      <div className="ij-welcome-nav">
        <div className="ij-welcome-brand">
          <IcIdeaLogo size={34} />
          <div>
            <b>IntelliJ IDEA</b>
            <span className="ij-dim">2024.3</span>
          </div>
        </div>
        {['Projects', 'Customize', 'Plugins', 'Learn'].map((n) => (
          <button key={n} type="button" className={`ij-welcome-navitem${nav === n ? ' ij-on' : ''}`} onClick={() => setNav(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="ij-welcome-main">
        {nav !== 'Projects' ? (
          <div className="ij-welcome-empty">
            {nav === 'Customize' ? 'Color theme: Darcula · IDE font: 13 · Keymap: Windows' : nav === 'Plugins' ? 'Installed: Git, JUnit, Maven, uia-remote Config Assistant' : 'Learn IntelliJ IDEA — onboarding tours are not available offline.'}
          </div>
        ) : (
          <>
            <div className="ij-welcome-bar">
              <input
                className="ij-field-input ij-welcome-search"
                placeholder="Search projects"
                aria-label="Search projects"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') setActive(Math.min(list.length - 1, active + 1));
                  else if (e.key === 'ArrowUp') setActive(Math.max(0, active - 1));
                  else if (e.key === 'Enter' && list[active]) onOpen(list[active], false);
                  else return;
                  e.preventDefault();
                }}
              />
              <button type="button" className="ij-btn" onClick={() => setDialog('new')}>
                New Project
              </button>
              <button type="button" className="ij-btn" onClick={() => setDialog('open')}>
                Open
              </button>
              <button type="button" className="ij-btn" data-hint="intellij.getFromVcs" onClick={() => setDialog('vcs')}>
                Get from VCS
              </button>
            </div>
            {notice ? <div className="ij-notif ij-notif-yellow" style={{ marginBottom: 10 }}>{notice}</div> : null}
            {list.length ? (
              list.map((r, i) => (
                <div
                  key={r}
                  className={`ij-recent${i === active ? ' ij-active' : ''}`}
                  role="button"
                  tabIndex={0}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onOpen(r, false)}
                  onKeyDown={(e) => e.key === 'Enter' && onOpen(r, false)}
                >
                  <span className="ij-recent-badge" style={{ background: BADGE[r] }}>
                    {r
                      .split('-')
                      .map((x) => x[0].toUpperCase())
                      .join('')
                      .slice(0, 2)}
                  </span>
                  <div>
                    <div>{r}</div>
                    <div className="ij-dim">~/IdeaProjects/{r}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="ij-welcome-empty">
                {cloned.length ? 'Nothing found' : 'No recent projects. Clone a repository with Get from VCS to start.'}
              </div>
            )}
          </>
        )}
      </div>
      {dialog === 'vcs' ? (
        <GetFromVcsDialog
          initialUrl={vcsUrl}
          onCancel={() => setDialog(null)}
          onOpened={(repo, wasCloned) => {
            setDialog(null);
            onOpen(repo, wasCloned);
          }}
        />
      ) : null}
      {dialog === 'open' ? <OpenProjectDialog onCancel={() => setDialog(null)} onOpen={(r) => (setDialog(null), onOpen(r, false))} /> : null}
      {dialog === 'new' ? (
        <Dialog title="New Project" onCancel={() => setDialog(null)} footer={<button type="button" className="ij-btn" onClick={() => setDialog(null)}>Close</button>}>
          <div style={{ maxWidth: 420 }}>Lab projects are created on GitHub by the team leads. Use <b>Get from VCS</b> to clone one of the labsim-lab repositories.</div>
        </Dialog>
      ) : null}
    </div>
  );
}

export function OpenProjectDialog({ onCancel, onOpen }: { onCancel(): void; onOpen(repo: RepoId): void }) {
  const cloned = useGameShallow((s) => REPOS.filter((r) => !!s.lab.repos?.[r]?.local));
  const [sel, setSel] = useState<RepoId | null>(cloned[0] ?? null);
  return (
    <Dialog
      title="Open File or Project"
      onCancel={onCancel}
      onOk={() => sel && onOpen(sel)}
      footer={
        <>
          <button type="button" className="ij-btn ij-default" disabled={!sel} onClick={() => sel && onOpen(sel)}>
            OK
          </button>
          <button type="button" className="ij-btn" onClick={onCancel}>
            Cancel
          </button>
        </>
      }
    >
      <div className="ij-dim" style={{ marginBottom: 6 }}>
        /home/engineer/IdeaProjects
      </div>
      <div className="ij-list" style={{ minHeight: 140, border: '1px solid var(--ij-border2)' }} role="listbox" tabIndex={0}>
        {cloned.map((r) => (
          <div key={r} role="option" aria-selected={sel === r} className={`ij-list-row${sel === r ? ' ij-active' : ''}`} onMouseDown={() => setSel(r)} onDoubleClick={() => onOpen(r)}>
            <IcFolder /> {r}
          </div>
        ))}
        {!cloned.length ? <div className="ij-list-row ij-dim">(empty)</div> : null}
      </div>
    </Dialog>
  );
}
