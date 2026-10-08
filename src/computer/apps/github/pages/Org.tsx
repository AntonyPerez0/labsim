/**
 * GitHub organisation overview / repositories (Apps §7.2) and the repo empty states (Issues, Actions,
 * Projects, Security, Insights — Apps §7.1, §7.5).
 */
import { useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import type { GitRepo } from '@/sim/types';
import { Oct, OrgLogo, type OctName } from '../icons';
import { useGh } from '../ctx';
import { GhHeader, Rel } from '../Chrome';
import { REPO_IDS, repoDescription, repoLanguage, repoRoute, tree } from '../model';

export function OrgPage(props: { tab: 'overview' | 'repositories' }) {
  const { navigate, repos: gate } = useGh();
  const all = useGame((s) => s.lab.repos);
  const [q, setQ] = useState('');
  const repos = useMemo(
    () =>
      REPO_IDS.map((id) => all?.[id])
        .filter((r): r is GitRepo => !!r && (!gate || gate.includes(r.id)))
        .map((r) => {
          const head = r.branches[r.defaultBranch] ?? null;
          const t = tree(r, head);
          const updated = Math.max(...Object.values(r.commits).map((c) => c.atMs), r.commits[head ?? '']?.atMs ?? 0);
          return { r, lang: repoLanguage(t), updated };
        })
        .sort((a, b) => b.updated - a.updated),
    [all, gate],
  );
  const shown = repos.filter((x) => !q.trim() || x.r.name.includes(q.trim().toLowerCase()));
  return (
    <>
      <GhHeader />
      <div className="gh-org-head">
        <div className="gh-org-logo">
          <OrgLogo size={72} />
        </div>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 600 }}>labsim-lab</h1>
          <div className="gh-muted">LabSim automation lab</div>
          <div className="gh-flex gh-muted" style={{ fontSize: 12, marginTop: 6, gap: 12 }}>
            <span>
              <Oct name="people" /> 8 followers
            </span>
            <span>
              <Oct name="link" /> lab.local
            </span>
          </div>
        </div>
      </div>
      <nav className="gh-tabs" style={{ borderBottom: '1px solid var(--gh-border)', marginTop: 16, maxWidth: 'none', paddingLeft: 32 }} aria-label="Organization">
        <a className="gh-tab" href="#" aria-current={props.tab === 'overview' ? 'page' : undefined} onClick={(e) => (e.preventDefault(), navigate('/labsim-lab'))}>
          <Oct name="book" /> Overview
        </a>
        <a className="gh-tab" href="#" aria-current={props.tab === 'repositories' ? 'page' : undefined} onClick={(e) => (e.preventDefault(), navigate('/labsim-lab?tab=repositories'))}>
          <Oct name="repo" /> Repositories <span className="gh-counter">{repos.length}</span>
        </a>
        <span className="gh-tab">
          <Oct name="table" /> Projects
        </span>
        <span className="gh-tab">
          <Oct name="people" /> People <span className="gh-counter">8</span>
        </span>
      </nav>
      <div className="gh-container">
        <div className="gh-row">
          <div className="gh-col-main">
            {props.tab === 'overview' ? <h2 style={{ fontSize: 16, fontWeight: 400, marginBottom: 8 }}>Repositories</h2> : null}
            <div className="gh-filter">
              <label className="gh-filter-input" style={{ background: '#fff' }}>
                <input placeholder="Find a repository…" value={q} onChange={(e) => setQ(e.target.value)} />
              </label>
              <button type="button" className="gh-btn">
                Type <Oct name="caret" />
              </button>
              <button type="button" className="gh-btn">
                Language <Oct name="caret" />
              </button>
              <button type="button" className="gh-btn">
                Sort <Oct name="caret" />
              </button>
            </div>
            {shown.map(({ r, lang, updated }) => (
              <div className="gh-repo-card" key={r.id}>
                <h3>
                  <a href={`#${repoRoute(r.id)}`} onClick={(e) => (e.preventDefault(), navigate(repoRoute(r.id)))}>
                    {r.name}
                  </a>
                  <span className="gh-label">Private</span>
                </h3>
                <div className="gh-muted" style={{ fontSize: 14 }}>
                  {repoDescription(r)}
                </div>
                <div className="gh-repo-meta">
                  {lang ? (
                    <span>
                      <span className="gh-lang-dot" style={{ background: lang.color }} /> {lang.name}
                    </span>
                  ) : null}
                  <span>
                    <Oct name="pr" size={14} /> {r.pullRequests.filter((p) => p.state === 'open').length}
                  </span>
                  <span>
                    Updated <Rel ms={updated} />
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="gh-col-side">
            <div className="gh-box" style={{ padding: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>People</h3>
              <p className="gh-muted" style={{ fontSize: 12, margin: 0 }}>
                The lab team: hardware, Orca, SDK frameworks and automation engineers.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const EMPTY: Record<string, { icon: OctName; title: string; text: string }> = {
  issues: { icon: 'issue', title: 'Welcome to issues!', text: 'Issues are used to track todos, bugs, feature requests, and more. This team tracks work in LAB tickets.' },
  actions: { icon: 'play', title: 'Get started with GitHub Actions', text: 'Build, test, and deploy your code. This repository is built by the lab Jenkins.' },
  projects: { icon: 'table', title: 'Welcome to Projects', text: 'Built like a spreadsheet, project tables give you a live canvas to filter, sort, and group issues and pull requests.' },
  security: { icon: 'shield', title: 'Security overview', text: 'Security policy, advisories and code scanning are not configured for this repository.' },
  pulse: { icon: 'graph', title: 'Pulse', text: 'Activity insights are not available for private repositories on this plan.' },
};

export function EmptyTabPage(props: { repo: GitRepo; tab: 'issues' | 'actions' | 'projects' | 'security' | 'pulse' }) {
  const e = EMPTY[props.tab]!;
  const openPrs = props.repo.pullRequests.filter((p) => p.state === 'open').length;
  return (
    <>
      <GhHeader repo={props.repo.id} tab={props.tab} openPrs={openPrs} />
      <div className="gh-container">
        {props.tab === 'issues' ? (
          <div className="gh-filter">
            <label className="gh-filter-input">
              <Oct name="search" />
              <input defaultValue="is:issue state:open" aria-label="Search issues" />
            </label>
            <button type="button" className="gh-btn gh-btn-primary" disabled>
              New issue
            </button>
          </div>
        ) : null}
        <div className="gh-box gh-blankslate">
          <Oct name={e.icon} size={32} />
          <h3>{e.title}</h3>
          <p style={{ maxWidth: 520, margin: '0 auto' }}>{e.text}</p>
        </div>
      </div>
    </>
  );
}
