/**
 * Jenkins job page (Apps §3.3): Stage View (live), Build History widget, permalinks; Full Stage View; Changes;
 * Build with Parameters (Apps §3.4).
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useGame } from '@/core/store';
import { sim } from '@/sim';
import { emitAppAction, fmtJenkins } from '@/computer/apps';
import type { JenkinsBuild, JenkinsJob } from '@/sim/types';
import { Ball, Sym } from '../icons';
import { useJk, useNowSec, simTry } from '../ctx';
import { Breadcrumbs, Footer, SidePanel, jobMenu, type Task } from '../Layout';
import { NotFoundBody } from './Lists';
import { PARAM_DESCRIPTIONS, buildBall, buildUrl, fmtStage, jobBall, jobBuilds, jobUrl, lastLineOfStage, permalinks, since, buildDurationMs } from '../model';

export function jobCrumbs(job: JenkinsJob, extra: { label: string; route?: string }[] = []) {
  return [
    { label: 'Dashboard', route: '/' },
    { label: job.folder, route: `/job/${encodeURIComponent(job.folder)}/`, menu: [{ label: 'Status', icon: 'status' as const, route: `/job/${encodeURIComponent(job.folder)}/` }] },
    { label: job.name, route: jobUrl(job.id), menu: jobMenu(job.id, job.params.length > 0) },
    ...extra,
  ];
}

export function jobTasks(job: JenkinsJob, current: string, onBuildNow: () => void): Task[] {
  const param = job.params.length > 0;
  return [
    { label: 'Status', icon: 'status', route: jobUrl(job.id), current: current === 'status' },
    { label: 'Changes', icon: 'changes', route: jobUrl(job.id, 'changes'), current: current === 'changes' },
    param
      ? { label: 'Build with Parameters', icon: 'play', route: jobUrl(job.id, 'build'), current: current === 'build', hint: 'jenkins.buildWithParameters' }
      : { label: 'Build Now', icon: 'play', onClick: onBuildNow, hint: 'jenkins.buildWithParameters' },
    { label: 'Configure', icon: 'gear', route: jobUrl(job.id, 'configure'), current: current === 'configure', hint: 'jenkins.configure' },
    { label: 'Delete Pipeline', icon: 'trash', route: jobUrl(job.id, 'delete'), danger: true },
    { label: 'Full Stage View', icon: 'stage', route: jobUrl(job.id, 'workflow-stage'), current: current === 'stage' },
    { label: 'Move', icon: 'move', route: jobUrl(job.id, 'move'), current: current === 'move', hint: 'jenkins.move' },
    { label: 'Rename', icon: 'rename', route: jobUrl(job.id, 'confirm-rename') },
    { label: 'Pipeline Syntax', icon: 'help', route: jobUrl(job.id, 'pipeline-syntax/'), current: current === 'syntax' },
  ];
}

export function useBuildNow(job: JenkinsJob | null) {
  const { notice, readOnly } = useJk();
  return () => {
    if (!job || readOnly) return;
    const r = simTry(() => sim.jenkins.build(job.id, {}, 'player'));
    emitAppAction('jenkins', 'jenkins.build.triggered', { jobId: job.id, params: {}, buildId: r.ok ? r.value.buildId : null, ok: r.ok, error: r.ok ? null : r.error });
    notice(r.ok ? 'Build scheduled' : r.error);
  };
}

/* ─────────────────────────── Build History widget ─────────────────────────── */

export function BuildHistoryWidget(props: { job: JenkinsJob }) {
  const { navigate } = useJk();
  const jenkins = useGame((s) => s.lab.jenkins);
  const now = useNowSec();
  const [filter, setFilter] = useState('');
  const builds = useMemo(() => jobBuilds(jenkins, props.job), [jenkins, props.job]);
  const shown = builds.filter((b) => !filter.trim() || `#${b.number} ${fmtJenkins(b.queuedMs)}`.toLowerCase().includes(filter.trim().toLowerCase()));
  const lastOk = builds.find((b) => b.result === 'SUCCESS' && b.startedMs != null && b.finishedMs != null);
  const est = lastOk ? lastOk.finishedMs! - lastOk.startedMs! : 60_000;
  return (
    <section className="jk-card">
      <div className="jk-card-head">
        <span>Build History</span>
        <span style={{ fontWeight: 400, fontSize: 12, color: '#6d6b7f' }}>trend ⌄</span>
      </div>
      <div className="jk-card-body">
        <input className="jk-input jk-bh-filter" placeholder="Filter builds…" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter builds" />
        {shown.map((b) => {
          const ball = buildBall(jenkins, b);
          const el = b.startedMs != null ? now - b.startedMs : 0;
          return (
            <div className="jk-bh-row" key={b.id}>
              <Ball kind={ball.kind} running={ball.running} size={18} />
              <a href={`#${buildUrl(b)}`} onClick={(e) => (e.preventDefault(), navigate(buildUrl(b)))}>
                #{b.number}
              </a>
              <span className="jk-bh-date">{fmtJenkins(b.startedMs ?? b.queuedMs).replace(/:\d\d (AM|PM)$/, ' $1')}</span>
              {b.state === 'running' ? (
                <div className={`jk-progress${el > est ? ' jk-progress-over' : ''}`} style={{ gridColumn: '2 / 4' }}>
                  <i style={{ width: `${Math.min(100, (el / Math.max(1, est)) * 100)}%` }} />
                </div>
              ) : null}
              {b.state === 'queued' ? <span className="jk-bh-pending">(pending—Waiting for next available executor)</span> : null}
            </div>
          );
        })}
        {!shown.length ? <div className="jk-card-empty">No builds</div> : null}
        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 12 }}>
          <span className="jk-link">
            <Sym name="rss" size={13} /> Atom feed for all
          </span>
          <span className="jk-link">
            <Sym name="rss" size={13} /> Atom feed for failures
          </span>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────── Stage View ─────────────────────────── */

export function StageView(props: { job: JenkinsJob; max: number }) {
  const { navigate } = useJk();
  const jenkins = useGame((s) => s.lab.jenkins);
  const now = useNowSec();
  const [tip, setTip] = useState<string | null>(null);
  const builds = useMemo(() => jobBuilds(jenkins, props.job).filter((b) => b.state !== 'queued').slice(0, props.max), [jenkins, props.job, props.max]);
  const stages = useMemo(() => {
    const names: string[] = [];
    for (const b of builds) for (const s of b.stages) if (!names.includes(s.name)) names.push(s.name);
    return names;
  }, [builds]);
  const avg = useMemo(() => {
    const out: Record<string, string> = {};
    for (const n of stages) {
      const ds = builds.flatMap((b) => b.stages.filter((s) => s.name === n && s.status === 'success' && s.durationMs != null).map((s) => s.durationMs!));
      out[n] = ds.length ? fmtStage(ds.reduce((a, b) => a + b, 0) / ds.length) : '';
    }
    return out;
  }, [builds, stages]);
  if (!builds.length) {
    return (
      <div className="jk-stage-wrap" style={{ padding: 16, color: '#6d6b7f' }}>
        No data available. This Pipeline has not yet run.
      </div>
    );
  }
  const cell = (b: JenkinsBuild, name: string) => {
    const s = b.stages.find((x) => x.name === name);
    if (!s || s.status === 'pending') return <td key={name} />;
    const dur = s.status === 'running' ? (s.startedMs != null ? now - s.startedMs : 0) : s.durationMs;
    const key = `${b.id}|${name}`;
    const label = s.status === 'failed' ? `Failed\n${lastLineOfStage(b.console, name)}` : s.status === 'skipped' ? 'Skipped' : null;
    return (
      <td key={name}>
        <button
          type="button"
          className={`jk-stage-cell jk-st-${s.status}`}
          onMouseEnter={() => setTip(key)}
          onMouseLeave={() => setTip((t) => (t === key ? null : t))}
          onClick={() => navigate(`${buildUrl(b, 'console')}?stage=${encodeURIComponent(name)}`)}
          aria-label={`${name}: ${s.status} ${fmtStage(dur)}`}
        >
          {s.status === 'skipped' ? '' : fmtStage(dur)}
          {tip === key && label ? <span className="jk-stage-tip">{label}</span> : null}
        </button>
      </td>
    );
  };
  return (
    <div className="jk-stage-wrap">
      <table className="jk-stage">
        <thead>
          <tr>
            <th />
            {stages.map((n) => (
              <th key={n}>{n}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="jk-stage-avg">
            <td>Average stage times:</td>
            {stages.map((n) => (
              <td key={n}>{avg[n]}</td>
            ))}
          </tr>
          {builds.map((b) => {
            const ball = buildBall(jenkins, b);
            return (
              <tr key={b.id}>
                <td>
                  <div className="jk-stage-build">
                    <b>
                      <Ball kind={ball.kind} running={ball.running} size={14} />{' '}
                      <a href={`#${buildUrl(b)}`} onClick={(e) => (e.preventDefault(), navigate(buildUrl(b)))}>
                        #{b.number}
                      </a>
                    </b>
                    <span>{fmtJenkins(b.startedMs ?? b.queuedMs).replace(/, \d{4},/, ',')}</span>
                    <span>Changes: No changes</span>
                  </div>
                </td>
                {stages.map((n) => cell(b, n))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────── Pages ─────────────────────────── */

export function JobPage(props: { jobId: string }) {
  const { navigate, readOnly, notice } = useJk();
  const job = useGame((s) => s.lab.jenkins.jobs[props.jobId]) ?? null;
  const jenkins = useGame((s) => s.lab.jenkins);
  const now = useNowSec();
  const buildNow = useBuildNow(job);
  useEffect(() => {
    if (job) emitAppAction('jenkins', 'jenkins.job.opened', { jobId: props.jobId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.jobId, !!job]);
  if (!job || job.exists === false) return <NotFoundShell />;
  const ball = jobBall(jenkins, job);
  const links = permalinks(jenkins, job);
  const enable = () => {
    const r = simTry(() => sim.jenkins.saveJob(job.id, { disabled: false }, 'player'));
    emitAppAction('jenkins', 'jenkins.job.configured', { jobId: job.id, changed: ['disabled'], ok: r.ok, error: r.ok ? null : r.error });
    if (!r.ok) notice(r.error);
  };
  return (
    <>
      <Breadcrumbs crumbs={jobCrumbs(job)} />
      <div className="jk-body">
        <SidePanel tasks={jobTasks(job, 'status', buildNow)}>
          <BuildHistoryWidget job={job} />
        </SidePanel>
        <main className="jk-main">
          <h1>
            <Ball kind={ball.kind} running={ball.running} size={30} />
            Pipeline {job.name}
          </h1>
          {job.description ? <p className="jk-desc">{job.description}</p> : null}
          {job.disabled ? (
            <div className="jk-banner jk-banner-warn">
              <span>This project is currently disabled</span>
              {!readOnly ? (
                <button type="button" className="jk-btn" onClick={enable}>
                  Enable
                </button>
              ) : null}
            </div>
          ) : null}
          <h2>Stage View</h2>
          <StageView job={job} max={10} />
          <h2>Permalinks</h2>
          <ul className="jk-perma">
            {links.map((l) => (
              <li key={l.label}>
                <a href={`#${buildUrl(l.build)}`} onClick={(e) => (e.preventDefault(), navigate(buildUrl(l.build)))}>
                  {l.label} (#{l.build.number}), {since(l.build.finishedMs ?? l.build.startedMs ?? l.build.queuedMs, now)} ago
                </a>
              </li>
            ))}
            {!links.length ? <li className="jk-muted">No builds yet.</li> : null}
          </ul>
          <Footer />
        </main>
      </div>
    </>
  );
}

export function NotFoundShell() {
  return (
    <>
      <Breadcrumbs crumbs={[{ label: 'Dashboard', route: '/' }]} />
      <div className="jk-body">
        <main className="jk-main" style={{ paddingLeft: 24 }}>
          <NotFoundBody />
          <Footer />
        </main>
      </div>
    </>
  );
}

export function FullStageViewPage(props: { jobId: string }) {
  const job = useGame((s) => s.lab.jenkins.jobs[props.jobId]) ?? null;
  const buildNow = useBuildNow(job);
  if (!job || job.exists === false) return <NotFoundShell />;
  return (
    <>
      <Breadcrumbs crumbs={jobCrumbs(job, [{ label: 'Full Stage View' }])} />
      <div className="jk-body">
        <SidePanel tasks={jobTasks(job, 'stage', buildNow)} widgets={false} />
        <main className="jk-main">
          <h1>{job.name} - Stage View</h1>
          <StageView job={job} max={20} />
          <Footer />
        </main>
      </div>
    </>
  );
}

export function ChangesPage(props: { jobId: string }) {
  const jenkins = useGame((s) => s.lab.jenkins);
  const job = jenkins.jobs[props.jobId] ?? null;
  const buildNow = useBuildNow(job);
  if (!job || job.exists === false) return <NotFoundShell />;
  const builds = jobBuilds(jenkins, job).filter((b) => b.state !== 'queued');
  return (
    <>
      <Breadcrumbs crumbs={jobCrumbs(job, [{ label: 'Changes' }])} />
      <div className="jk-body">
        <SidePanel tasks={jobTasks(job, 'changes', buildNow)} />
        <main className="jk-main">
          <h1>Changes</h1>
          {builds.map((b) => (
            <div key={b.id} style={{ margin: '8px 0' }}>
              <b>#{b.number}</b> ({fmtJenkins(b.startedMs ?? b.queuedMs)})
              <div style={{ marginLeft: 20, color: '#6d6b7f' }}>No changes.</div>
            </div>
          ))}
          <Footer />
        </main>
      </div>
    </>
  );
}

/** `/job/…/build` — Build with Parameters (Apps §3.4). */
export function BuildWithParametersPage(props: { jobId: string }) {
  const { navigate, notice, readOnly } = useJk();
  const job = useGame((s) => s.lab.jenkins.jobs[props.jobId]) ?? null;
  const buildNow = useBuildNow(job);
  const initial = useMemo(() => {
    const v: Record<string, string> = {};
    for (const p of job?.params ?? []) v[p.name] = job!.savedParams?.[p.name] ?? p.default ?? '';
    return v;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.jobId]);
  const [values, setValues] = useState<Record<string, string>>(initial);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement | HTMLSelectElement | null>(null);
  useEffect(() => {
    setValues(initial);
    setError(null);
    if (job) emitAppAction('jenkins', 'jenkins.buildWithParameters.opened', { jobId: props.jobId, params: initial });
    firstRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.jobId, !!job]);
  if (!job || job.exists === false) return <NotFoundShell />;
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (readOnly) return;
    const params = { ...values };
    const r = simTry(() => sim.jenkins.build(job.id, params, 'player'));
    emitAppAction('jenkins', 'jenkins.build.triggered', { jobId: job.id, params, buildId: r.ok ? r.value.buildId : null, ok: r.ok, error: r.ok ? null : r.error });
    if (r.ok) {
      navigate(jobUrl(job.id));
      notice('Build scheduled');
    } else {
      setError(r.error);
    }
  };
  return (
    <>
      <Breadcrumbs crumbs={jobCrumbs(job, [{ label: job.params.length ? 'Build with Parameters' : 'Build' }])} />
      <div className="jk-body">
        <SidePanel tasks={jobTasks(job, 'build', buildNow)} />
        <main className="jk-main">
          <h1>Pipeline {job.name}</h1>
          {job.disabled ? <div className="jk-banner jk-banner-warn">This project is currently disabled</div> : null}
          <form onSubmit={submit} noValidate>
            <p>{job.params.length ? 'This build requires parameters:' : 'This build has no parameters.'}</p>
            {job.params.map((p, i) => {
              const id = `jk-p-${p.name}`;
              const desc = p.description || PARAM_DESCRIPTIONS[p.name] || '';
              return (
                <div className="jk-param" key={p.name} data-hint={`jenkins.param:${p.name}`}>
                  <label className="jk-param-name" htmlFor={id}>
                    {p.name}
                  </label>
                  {p.type === 'choice' ? (
                    <select
                      id={id}
                      ref={i === 0 ? (el) => void (firstRef.current = el) : undefined}
                      className="jk-select"
                      value={values[p.name] ?? ''}
                      disabled={readOnly}
                      onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                    >
                      {(p.choices ?? []).map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  ) : p.type === 'boolean' ? (
                    <label className="jk-check">
                      <input
                        id={id}
                        type="checkbox"
                        checked={values[p.name] === 'true'}
                        disabled={readOnly}
                        onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.checked ? 'true' : 'false' }))}
                      />
                      {p.name}
                    </label>
                  ) : (
                    <input
                      id={id}
                      ref={i === 0 ? (el) => void (firstRef.current = el) : undefined}
                      className="jk-input"
                      type="text"
                      spellCheck={false}
                      autoComplete="off"
                      value={values[p.name] ?? ''}
                      disabled={readOnly}
                      onChange={(e) => setValues((v) => ({ ...v, [p.name]: e.target.value }))}
                    />
                  )}
                  {desc ? <div className="jk-param-desc">{desc}</div> : null}
                </div>
              );
            })}
            {!readOnly ? (
              <button type="submit" className="jk-btn jk-btn-primary" data-hint="jenkins.buildButton">
                Build
              </button>
            ) : null}
            {error ? <div className="jk-error" role="alert">{error}</div> : null}
          </form>
          <Footer />
        </main>
      </div>
    </>
  );
}

/** Took / elapsed text for build pages. */
export function tookText(b: JenkinsBuild, now: number): string {
  return buildDurationMs(b, now) ? `Took ${since(b.startedMs, b.finishedMs ?? now)}` : '';
}
