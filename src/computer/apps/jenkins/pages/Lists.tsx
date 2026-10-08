/**
 * Jenkins dashboard, views, folders, global Build History and People (Apps §3.2, §3.8).
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import { sim } from '@/sim';
import { emitAppAction, fmtRelative } from '@/computer/apps';
import { TEAM_MEMBERS } from '@/content/team';
import type { JenkinsJob } from '@/sim/types';
import { Ball, FolderIcon, Sym, Weather } from '../icons';
import { useJk, useNowSec, simTry } from '../ctx';
import { Breadcrumbs, Footer, SidePanel } from '../Layout';
import {
  FOLDER_DESCRIPTIONS,
  buildBall,
  buildDurationMs,
  buildUrl,
  folders,
  jobBall,
  jobBuilds,
  jobDisplayName,
  jobUrl,
  jobWeather,
  jobsInView,
  since,
  visibleJobs,
} from '../model';
import { fmtDuration } from '@/computer/apps';

type IconSize = 'S' | 'M' | 'L';
const SIZE_PX: Record<IconSize, number> = { S: 16, M: 20, L: 24 };

function dashTasks(current: string) {
  return [
    { label: 'New Item', icon: 'plus' as const, route: '/view/all/newJob' },
    { label: 'People', icon: 'people' as const, route: '/asynchPeople/', current: current === 'people' },
    { label: 'Build History', icon: 'history' as const, route: '/view/all/builds', current: current === 'builds' },
    { label: 'Manage Jenkins', icon: 'gear' as const, route: '/manage/' },
    { label: 'My Views', icon: 'views' as const, route: '/me/my-views/' },
  ];
}

/** Schedule a build from a table row (Apps §3.2 ▶ column). */
export function useScheduleBuild() {
  const { navigate, notice, readOnly } = useJk();
  return (job: JenkinsJob) => {
    if (readOnly) return;
    if (job.params.length > 0) {
      navigate(jobUrl(job.id, 'build'));
      return;
    }
    const r = simTry(() => sim.jenkins.build(job.id, {}, 'player'));
    emitAppAction('jenkins', 'jenkins.build.triggered', { jobId: job.id, params: {}, buildId: r.ok ? r.value.buildId : null, ok: r.ok, error: r.ok ? null : r.error });
    notice(r.ok ? 'Build scheduled' : r.error);
  };
}

function JobRows(props: { jobs: JenkinsJob[]; prefixFolder: boolean; size: IconSize }) {
  const { navigate } = useJk();
  const jenkins = useGame((s) => s.lab.jenkins);
  const now = useNowSec();
  const schedule = useScheduleBuild();
  const px = SIZE_PX[props.size];
  return (
    <>
      {props.jobs.map((job) => {
        const builds = jobBuilds(jenkins, job);
        const ball = jobBall(jenkins, job);
        const w = jobWeather(jenkins, [job]);
        const lastOk = builds.find((b) => b.state === 'finished' && b.result === 'SUCCESS');
        const lastFail = builds.find((b) => b.state === 'finished' && b.result === 'FAILURE');
        const lastDone = builds.find((b) => b.state === 'finished');
        return (
          <tr key={job.id} data-hint={`jenkins.jobRow:${job.id}`}>
            <td className="jk-col-icon">
              <Ball kind={ball.kind} running={ball.running} size={px} />
            </td>
            <td className="jk-col-icon">{w ? <Weather kind={w.kind} title={w.title} size={px} /> : null}</td>
            <td>
              <a className="jk-jobname" href={`#${jobUrl(job.id)}`} onClick={(e) => (e.preventDefault(), navigate(jobUrl(job.id)))}>
                {props.prefixFolder ? jobDisplayName(job.id) : job.name}
              </a>
            </td>
            <td>
              {lastOk ? (
                <>
                  {since(lastOk.finishedMs, now)}{' '}
                  <a href={`#${buildUrl(lastOk)}`} onClick={(e) => (e.preventDefault(), navigate(buildUrl(lastOk)))}>
                    #{lastOk.number}
                  </a>
                </>
              ) : (
                <span className="jk-muted">N/A</span>
              )}
            </td>
            <td>
              {lastFail ? (
                <>
                  {since(lastFail.finishedMs, now)}{' '}
                  <a href={`#${buildUrl(lastFail)}`} onClick={(e) => (e.preventDefault(), navigate(buildUrl(lastFail)))}>
                    #{lastFail.number}
                  </a>
                </>
              ) : (
                <span className="jk-muted">N/A</span>
              )}
            </td>
            <td>{lastDone ? fmtDuration(buildDurationMs(lastDone, now)) : <span className="jk-muted">N/A</span>}</td>
            <td className="jk-col-act">
              {job.disabled ? null : (
                <button type="button" className="jk-schedule" title={`Schedule a Build for ${job.name}`} aria-label={`Schedule a Build for ${job.name}`} onClick={() => schedule(job)}>
                  <Sym name="play" size={px} />
                </button>
              )}
            </td>
          </tr>
        );
      })}
    </>
  );
}

function FolderRows(props: { names: string[]; size: IconSize }) {
  const { navigate, gate } = useJk();
  const jenkins = useGame((s) => s.lab.jenkins);
  const px = SIZE_PX[props.size];
  return (
    <>
      {props.names.map((f) => {
        const jobs = visibleJobs(jenkins, gate).filter((j) => j.folder === f);
        const w = jobWeather(jenkins, jobs);
        return (
          <tr key={f} data-hint={`jenkins.jobRow:${f}`}>
            <td className="jk-col-icon">
              <FolderIcon size={px} />
            </td>
            <td className="jk-col-icon">{w ? <Weather kind={w.kind} title={w.title} size={px} /> : null}</td>
            <td>
              <a className="jk-jobname" href={`#/job/${f}/`} onClick={(e) => (e.preventDefault(), navigate(`/job/${encodeURIComponent(f)}/`))}>
                {f}
              </a>
            </td>
            <td className="jk-muted">N/A</td>
            <td className="jk-muted">N/A</td>
            <td className="jk-muted">N/A</td>
            <td />
          </tr>
        );
      })}
    </>
  );
}

function JobTable(props: { jobs: JenkinsJob[]; folders?: string[]; prefixFolder: boolean }) {
  const [size, setSize] = useState<IconSize>('L');
  const [desc, setDesc] = useState(false);
  const jobs = useMemo(() => (desc ? [...props.jobs].reverse() : props.jobs), [props.jobs, desc]);
  return (
    <>
      <table className="jk-table" id="projectstatus">
        <thead>
          <tr>
            <th className="jk-col-icon" title="Status of the last build">
              S
            </th>
            <th className="jk-col-icon" title="Weather report showing aggregated status of recent builds">
              W
            </th>
            <th>
              <button type="button" onClick={() => setDesc((d) => !d)}>
                Name {desc ? '↑' : '↓'}
              </button>
            </th>
            <th>Last Success</th>
            <th>Last Failure</th>
            <th>Last Duration</th>
            <th className="jk-col-act" />
          </tr>
        </thead>
        <tbody>
          {props.folders ? <FolderRows names={props.folders} size={size} /> : null}
          <JobRows jobs={jobs} prefixFolder={props.prefixFolder} size={size} />
          {!props.jobs.length && !props.folders?.length ? (
            <tr>
              <td colSpan={7} className="jk-muted">
                This view has no jobs associated with it.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div className="jk-legend">
        <span className="jk-sizes">
          Icon:
          {(['S', 'M', 'L'] as IconSize[]).map((s) => (
            <button key={s} type="button" aria-pressed={size === s} onClick={() => setSize(s)}>
              {s}
            </button>
          ))}
        </span>
        <span className="jk-link">
          <Sym name="help" size={14} /> Legend
        </span>
        <span className="jk-link">
          <Sym name="rss" size={14} /> Atom feed for all
        </span>
        <span className="jk-link">
          <Sym name="rss" size={14} /> Atom feed for failures
        </span>
        <span className="jk-link">
          <Sym name="rss" size={14} /> Atom feed for just latest builds
        </span>
      </div>
    </>
  );
}

function ViewTabs(props: { current: string }) {
  const { navigate } = useJk();
  const views = useGame((s) => s.lab.jenkins.views);
  const names = Object.keys(views).length ? Object.keys(views) : ['All', 'Java', 'iOS'];
  return (
    <div className="jk-tabs" role="tablist">
      {names.map((v) => (
        <button
          key={v}
          type="button"
          role="tab"
          className="jk-tab"
          aria-selected={v === props.current}
          data-hint={`jenkins.viewTab:${v}`}
          onClick={() => navigate(v === 'All' ? '/' : `/view/${encodeURIComponent(v)}/`)}
        >
          {v}
        </button>
      ))}
      <button type="button" className="jk-tab" title="New View" onClick={() => navigate('/newView')}>
        +
      </button>
    </div>
  );
}

/** `/` and `/view/:view/`. */
export function DashboardPage(props: { view: string }) {
  const { gate } = useJk();
  const jenkins = useGame((s) => s.lab.jenkins);
  const view = props.view;
  const known = view === 'All' || !!jenkins.views[view];
  useEffect(() => {
    if (known) emitAppAction('jenkins', 'jenkins.view.opened', { view });
  }, [view, known]);
  const jobs = useMemo(() => (view === 'All' ? [] : jobsInView(jenkins, view, gate)), [jenkins, view, gate]);
  const folderNames = useMemo(() => {
    if (view !== 'All') return undefined;
    const vis = visibleJobs(jenkins, gate);
    return folders(jenkins).filter((f) => !gate || vis.some((j) => j.folder === f));
  }, [jenkins, view, gate]);
  return (
    <>
      <Breadcrumbs crumbs={[{ label: 'Dashboard', route: '/' }, ...(view !== 'All' ? [{ label: view }] : [])]} />
      <div className="jk-body">
        <SidePanel tasks={dashTasks('')} />
        <main className="jk-main">
          {known ? (
            <>
              <ViewTabs current={view} />
              <div style={{ height: 8 }} />
              <JobTable jobs={jobs} folders={folderNames} prefixFolder={view !== 'Java' && view !== 'iOS'} />
            </>
          ) : (
            <NotFoundBody />
          )}
          <Footer />
        </main>
      </div>
    </>
  );
}

/** `/job/:folder/` */
export function FolderPage(props: { folder: string }) {
  const { gate } = useJk();
  const jenkins = useGame((s) => s.lab.jenkins);
  const f = props.folder;
  const exists = folders(jenkins).includes(f);
  const jobs = useMemo(() => visibleJobs(jenkins, gate).filter((j) => j.folder === f), [jenkins, gate, f]);
  return (
    <>
      <Breadcrumbs crumbs={[{ label: 'Dashboard', route: '/' }, { label: f, route: `/job/${f}/` }]} />
      <div className="jk-body">
        <SidePanel
          tasks={[
            { label: 'Status', icon: 'status', route: `/job/${f}/`, current: true },
            { label: 'Configure', icon: 'gear', route: `/job/${f}/configure` },
            { label: 'New Item', icon: 'plus', route: `/job/${f}/newJob` },
            { label: 'Delete Folder', icon: 'trash', route: `/job/${f}/delete`, danger: true },
            { label: 'Move', icon: 'move', route: `/job/${f}/configure` },
            { label: 'Build History', icon: 'history', route: '/view/all/builds' },
            { label: 'Rename', icon: 'rename', route: `/job/${f}/confirm-rename` },
          ]}
        />
        <main className="jk-main">
          {exists ? (
            <>
              <h1>
                <FolderIcon size={30} />
                {f}
              </h1>
              <p className="jk-desc">{FOLDER_DESCRIPTIONS[f] ?? ''}</p>
              <div className="jk-tabs" role="tablist">
                <button type="button" role="tab" className="jk-tab" aria-selected>
                  All
                </button>
              </div>
              <div style={{ height: 8 }} />
              <JobTable jobs={jobs} prefixFolder={false} />
            </>
          ) : (
            <NotFoundBody />
          )}
          <Footer />
        </main>
      </div>
    </>
  );
}

export function NotFoundBody() {
  return (
    <div className="jk-denied">
      <h1>404 Not Found</h1>
      <p>Not Found</p>
      <p className="jk-muted" style={{ color: '#6d6b7f' }}>
        The requested resource was not found on this Jenkins instance.
      </p>
    </div>
  );
}

/** `/view/all/builds` */
export function BuildHistoryPage() {
  const { navigate, gate } = useJk();
  const jenkins = useGame((s) => s.lab.jenkins);
  const now = useNowSec();
  const builds = useMemo(
    () => Object.values(jenkins.builds).filter((b) => !gate || gate.includes(b.jobId)).sort((a, b) => (b.startedMs ?? b.queuedMs) - (a.startedMs ?? a.queuedMs)),
    [jenkins.builds, gate],
  );
  const span = 6 * 3_600_000;
  return (
    <>
      <Breadcrumbs crumbs={[{ label: 'Dashboard', route: '/' }, { label: 'Build History' }]} />
      <div className="jk-body">
        <SidePanel tasks={dashTasks('builds')} />
        <main className="jk-main">
          <h1>Build History of Jenkins</h1>
          <div className="jk-timeline" aria-hidden="true">
            {builds.slice(0, 60).map((b, i) => {
              const start = b.startedMs ?? b.queuedMs;
              const left = 100 - ((now - start) / span) * 100;
              if (left < 0) return null;
              const w = Math.max(0.4, (buildDurationMs(b, now) / span) * 100);
              const c = b.state !== 'finished' ? '#0b6aa2' : b.result === 'SUCCESS' ? '#138347' : b.result === 'FAILURE' ? '#e6001f' : '#9a9aaa';
              return <i key={b.id} style={{ left: `${left}%`, width: `${w}%`, top: 8 + (i % 3) * 14, background: c }} />;
            })}
          </div>
          <table className="jk-table">
            <thead>
              <tr>
                <th className="jk-col-icon">S</th>
                <th>Build</th>
                <th>Time Since</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {builds.map((b) => {
                const ball = buildBall(jenkins, b);
                return (
                  <tr key={b.id}>
                    <td className="jk-col-icon">
                      <Ball kind={ball.kind} running={ball.running} size={20} />
                    </td>
                    <td>
                      <a href={`#${buildUrl(b)}`} onClick={(e) => (e.preventDefault(), navigate(buildUrl(b)))}>
                        {jobDisplayName(b.jobId)} #{b.number}
                      </a>
                    </td>
                    <td>{since(b.startedMs ?? b.queuedMs, now)}</td>
                    <td>{b.state === 'finished' ? (b.result === 'SUCCESS' ? 'stable' : (b.result ?? '').toLowerCase()) : b.state === 'queued' ? 'pending' : 'in progress'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Footer />
        </main>
      </div>
    </>
  );
}

/** `/asynchPeople/` */
export function PeoplePage() {
  const repos = useGame((s) => s.lab.repos);
  const now = useNowSec();
  const rows = useMemo(() => {
    const last: Record<string, { ms: number; on: string }> = {};
    for (const r of Object.values(repos ?? {})) {
      for (const c of Object.values(r.commits)) {
        if (!last[c.author] || last[c.author]!.ms < c.atMs) last[c.author] = { ms: c.atMs, on: r.name };
      }
    }
    const people = [{ key: 'jenkins-ci', name: 'jenkins-ci', color: '#6d6b7f' }, ...TEAM_MEMBERS.filter((m) => m.key !== 'jenkins-bot').map((m) => ({ key: m.key, name: m.name, color: m.color }))];
    return people.map((p) => ({ ...p, last: last[p.key] ?? null }));
  }, [repos]);
  return (
    <>
      <Breadcrumbs crumbs={[{ label: 'Dashboard', route: '/' }, { label: 'People' }]} />
      <div className="jk-body">
        <SidePanel tasks={dashTasks('people')} />
        <main className="jk-main">
          <h1>People</h1>
          <p>Includes all known “users”, including login identities which the current security realm can enumerate, as well as people mentioned in commit messages in recorded changelogs.</p>
          <table className="jk-table">
            <thead>
              <tr>
                <th>User ID</th>
                <th>Name</th>
                <th>Last Commit Activity</th>
                <th>On</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.key}>
                  <td>
                    <span className="jk-avatar" style={{ background: p.color }}>
                      {p.name.slice(0, 1).toUpperCase()}
                    </span>
                    {p.key}
                  </td>
                  <td>{p.name}</td>
                  <td>{p.last ? fmtRelative(p.last.ms, now).replace(' ago', '') : 'N/A'}</td>
                  <td>{p.last ? p.last.on : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Footer />
        </main>
      </div>
    </>
  );
}
