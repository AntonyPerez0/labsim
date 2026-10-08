/**
 * Jenkins build page, Console Output (live, clickable lines) and build Parameters (Apps §3.5).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/core/store';
import { sim } from '@/sim';
import { emitAppAction, fmtDuration, fmtJenkins, parseQuery } from '@/computer/apps';
import type { JenkinsBuild, JenkinsJob } from '@/sim/types';
import { Ball, Sym } from '../icons';
import { useJk, useNowSec, simTry } from '../ctx';
import { Breadcrumbs, Footer, SidePanel, type Task } from '../Layout';
import { jobCrumbs, NotFoundShell } from './Job';
import { buildBall, buildDurationMs, buildUrl, fmtStage, isSecretParam, jobUrl, resolveBuild, stageLineIndex, testResult } from '../model';

function useBuild(jobId: string, number: string): { job: JenkinsJob | null; build: JenkinsBuild | null } {
  const jenkins = useGame((s) => s.lab.jenkins);
  const job = jenkins.jobs[jobId] ?? null;
  const build = job ? resolveBuild(jenkins, job, number) : null;
  return { job, build };
}

function buildTasks(job: JenkinsJob, b: JenkinsBuild, current: string, prev: JenkinsBuild | null, next: JenkinsBuild | null, onCamera: (() => void) | null): Task[] {
  const t: Task[] = [
    { label: 'Status', icon: 'status', route: buildUrl(b), current: current === 'status' },
    { label: 'Changes', icon: 'changes', route: jobUrl(job.id, 'changes') },
    { label: 'Console Output', icon: 'terminal', route: buildUrl(b, 'console'), current: current === 'console', hint: 'jenkins.consoleOutput' },
  ];
  if (onCamera) t.push({ label: '▶ Camera recording', icon: 'camera', onClick: onCamera });
  t.push(
    { label: 'Edit Build Information', icon: 'edit', route: buildUrl(b, 'configure-build') },
    { label: `Delete build ‘#${b.number}’`, icon: 'trash', route: buildUrl(b, 'delete'), danger: true },
    { label: 'Parameters', icon: 'list', route: buildUrl(b, 'parameters/'), current: current === 'parameters' },
    { label: 'Pipeline Steps', icon: 'steps', route: buildUrl(b, 'console') },
    { label: 'Restart from Stage', icon: 'history', route: buildUrl(b, 'restart') },
    { label: 'Replay', icon: 'play', route: buildUrl(b, 'replay') },
  );
  if (prev) t.push({ label: '‹ Previous Build', icon: 'prev', route: buildUrl(prev, current === 'console' ? 'console' : '') });
  if (next) t.push({ label: 'Next Build ›', icon: 'next', route: buildUrl(next, current === 'console' ? 'console' : '') });
  return t;
}

function useNeighbours(job: JenkinsJob | null, b: JenkinsBuild | null) {
  const jenkins = useGame((s) => s.lab.jenkins);
  return useMemo(() => {
    if (!job || !b) return { prev: null, next: null };
    const all = job.buildIds.map((id) => jenkins.builds[id]).filter((x): x is JenkinsBuild => !!x);
    const prev = all.filter((x) => x.number < b.number).sort((a, c) => c.number - a.number)[0] ?? null;
    const next = all.filter((x) => x.number > b.number).sort((a, c) => a.number - c.number)[0] ?? null;
    return { prev, next };
  }, [jenkins, job, b]);
}

/** Opens Lab Cameras on this build's recording when the robot has a camera (Apps §8.6). */
function useCameraLink(b: JenkinsBuild | null): (() => void) | null {
  const { wm } = useJk();
  const url = useGame((s) => (b?.robotId != null ? s.lab.orca.robots[b.robotId]?.cameraStreamUrl ?? '' : ''));
  if (!b || !url || !wm) return null;
  return () => wm.openApp('camera', { recordingBuildId: b.id });
}

function AbortButton(props: { build: JenkinsBuild; job: JenkinsJob }) {
  const [confirm, setConfirm] = useState(false);
  const { notice } = useJk();
  if (props.build.state === 'finished') return null;
  const doAbort = () => {
    setConfirm(false);
    const r = simTry(() => sim.jenkins.abort(props.build.id, 'player'));
    emitAppAction('jenkins', 'jenkins.build.aborted', { buildId: props.build.id, ok: r.ok, error: r.ok ? null : r.error });
    if (!r.ok) notice(r.error);
  };
  return (
    <>
      <button type="button" className="jk-btn jk-btn-danger jk-abort-h" onClick={() => setConfirm(true)} title="Abort">
        <Sym name="x" size={16} /> Abort
      </button>
      {confirm ? (
        <div role="dialog" aria-modal="true" style={{ position: 'absolute', inset: 0, background: '#14141f55', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), e.preventDefault(), setConfirm(false))}>
          <div style={{ background: '#fff', borderRadius: 10, padding: '18px 20px', width: 440, boxShadow: '0 12px 40px #0004', fontSize: 14, fontWeight: 400 }}>
            <p style={{ margin: '0 0 16px' }}>
              Are you sure you want to abort {props.job.name} #{props.build.number}?
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="jk-btn" onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button type="button" className="jk-btn jk-btn-primary" autoFocus onClick={doAbort}>
                Yes
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function BuildStageRow(props: { build: JenkinsBuild }) {
  const now = useNowSec();
  const { navigate } = useJk();
  const b = props.build;
  if (!b.stages.length) return null;
  return (
    <div className="jk-stage-wrap">
      <table className="jk-stage">
        <thead>
          <tr>
            {b.stages.map((s) => (
              <th key={s.name} style={{ borderLeft: '1px solid #f0f0f2' }}>
                {s.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {b.stages.map((s) => (
              <td key={s.name} style={{ borderLeft: '1px solid #f0f0f2', padding: 0 }}>
                {s.status === 'pending' ? null : (
                  <button type="button" className={`jk-stage-cell jk-st-${s.status}`} onClick={() => navigate(`${buildUrl(b, 'console')}?stage=${encodeURIComponent(s.name)}`)}>
                    {s.status === 'skipped' ? '' : fmtStage(s.status === 'running' ? (s.startedMs != null ? now - s.startedMs : 0) : s.durationMs)}
                  </button>
                )}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function BuildPage(props: { jobId: string; number: string }) {
  const { job, build } = useBuild(props.jobId, props.number);
  const jenkins = useGame((s) => s.lab.jenkins);
  const robot = useGame((s) => (build?.robotId != null ? s.lab.orca.robots[build.robotId] ?? null : null));
  const robotType = useGame((s) => {
    const dId = robot?.deviceId;
    return dId != null ? s.lab.orca.devices?.[dId]?.deviceType ?? null : null;
  });
  const repos = useGame((s) => s.lab.repos);
  const now = useNowSec();
  const { prev, next } = useNeighbours(job, build);
  const camera = useCameraLink(build);
  if (!job || !build) return <NotFoundShell />;
  const ball = buildBall(jenkins, build);
  const started = build.console[0]?.startsWith('Started by') ? build.console[0] : 'Started by user Engineer';
  const revLine = build.console.find((l) => l.startsWith('Checking out Revision '));
  const repo = job.testRef ? repos?.[job.testRef.repo] : null;
  const rev = revLine ? /Revision ([0-9a-f]+)/.exec(revLine)?.[1] ?? null : repo ? repo.branches[repo.defaultBranch] ?? null : null;
  const tests = build.state === 'finished' ? testResult(build.console) : null;
  return (
    <>
      <Breadcrumbs crumbs={jobCrumbs(job, [{ label: `#${build.number}` }])} />
      <div className="jk-body">
        <SidePanel tasks={buildTasks(job, build, 'status', prev, next, camera)} />
        <main className="jk-main">
          <h1>
            <Ball kind={ball.kind} running={ball.running} size={30} />
            #{build.number} ({fmtJenkins(build.startedMs ?? build.queuedMs)})
            <AbortButton build={build} job={job} />
          </h1>
          {build.state === 'finished' ? <div className="jk-took">Took {fmtDuration(buildDurationMs(build, now))}</div> : null}
          {build.state === 'queued' ? <p className="jk-muted">(pending—Waiting for next available executor)</p> : null}
          <div className="jk-summary">
            <Sym name="user" size={22} />
            <div>{started}</div>
            {rev ? (
              <>
                <Sym name="changes" size={22} />
                <div>
                  <div>
                    Revision: <code>{rev}</code>
                  </div>
                  <div>
                    Repository: <code>{repo?.remoteUrl ?? `git@github.com:labsim-lab/${job.testRef?.repo ?? 'uia-remote'}.git`}</code>
                  </div>
                  <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
                    <li>refs/remotes/origin/{build.params.BRANCH || 'main'}</li>
                  </ul>
                </div>
              </>
            ) : null}
            {robot ? (
              <>
                <Sym name="computer" size={22} />
                <div>
                  Robot: {robot.name}
                  {robotType ? ` (${robotType})` : ''}
                </div>
              </>
            ) : null}
            {tests ? (
              <>
                <Sym name="doc" size={22} />
                <div>Test Result: {tests}</div>
              </>
            ) : null}
          </div>
          <BuildStageRow build={build} />
          <Footer />
        </main>
      </div>
    </>
  );
}

/**
 * Scroll position that shows the end of the console (the `<main>` column's bottom) at the bottom of the
 * page. `.jk-body` also holds the side panel, which is often taller than a short console: scrolling to
 * `scrollHeight` would then show only the panel's executors with the console scrolled out of view.
 */
function tailScrollTop(el: HTMLElement): number {
  const main = el.querySelector<HTMLElement>(':scope > .jk-main');
  const max = Math.max(0, el.scrollHeight - el.clientHeight);
  if (!main) return max;
  // The flex row stretches <main> to the viewport height; its content overflows it, so use scrollHeight.
  const delta = main.getBoundingClientRect().top + main.scrollHeight - el.getBoundingClientRect().bottom;
  return Math.min(max, Math.max(0, Math.round(el.scrollTop + delta)));
}

/** `/job/…/:number/console` — the page lessons live on (Apps §3.5). */
export function ConsolePage(props: { jobId: string; number: string }) {
  const { route, wm } = useJk();
  const { job, build } = useBuild(props.jobId, props.number);
  const { prev, next } = useNeighbours(job, build);
  const camera = useCameraLink(build);
  const lines = build?.console ?? [];
  const bodyRef = useRef<HTMLDivElement>(null);
  const autoTop = useRef(-1);
  const [follow, setFollow] = useState(true);
  const [sel, setSel] = useState<number | null>(null);
  const [plain, setPlain] = useState(false);
  const [flash, setFlash] = useState<number | null>(null);
  const stageQ = parseQuery(route.split('?')[1] ?? '').stage ?? null;
  const buildId = build?.id ?? null;

  // console.opened: once per open, with the state/result at that moment.
  useEffect(() => {
    if (!build) return;
    emitAppAction('jenkins', 'jenkins.console.opened', { buildId: build.id, jobId: build.jobId, number: build.number, state: build.state, result: build.result });
    setSel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildId]);

  // Scroll to a stage (Stage View cell click), else to the tail.
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !build) return;
    if (stageQ) {
      const i = stageLineIndex(build.console, stageQ);
      if (i >= 0) {
        setFollow(false);
        setFlash(i);
        const line = el.querySelector<HTMLElement>(`[data-line="${i + 1}"]`);
        if (line) el.scrollTop = Math.max(0, line.offsetTop - el.offsetTop - 80);
        return;
      }
    }
    el.scrollTop = tailScrollTop(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildId, stageQ]);

  // Auto-scroll while following — also on the commit that finishes the build (the spinner and the
  // Follow button go away), so "Finished: …" is always the last thing on screen.
  const isRunning = !!build && build.state !== 'finished';
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el || !follow) return;
    el.scrollTop = tailScrollTop(el);
    autoTop.current = el.scrollTop;
  }, [lines.length, follow, isRunning]);

  if (!job || !build) return <NotFoundShell />;
  const running = isRunning;
  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    // Our own tail-scroll (its scroll event arrives a frame later, possibly after more lines landed):
    // never treat it as the user scrolling away.
    if (Math.abs(el.scrollTop - autoTop.current) < 2) return;
    const atBottom = el.scrollTop >= tailScrollTop(el) - 24;
    if (!atBottom && follow) setFollow(false);
    if (atBottom && !follow && running) setFollow(true);
  };
  const click = (i: number) => {
    const s = window.getSelection?.();
    if (s && s.toString().length > 0) return; // text selection, not a click
    setSel(i);
    emitAppAction('jenkins', 'jenkins.console.lineClicked', { buildId: build.id, line: i + 1, text: lines[i] ?? '' });
  };
  return (
    <>
      <Breadcrumbs crumbs={jobCrumbs(job, [{ label: `#${build.number}`, route: buildUrl(build) }, { label: 'Console Output' }])} />
      <div className="jk-body" ref={bodyRef} onScroll={onScroll}>
        <SidePanel tasks={buildTasks(job, build, 'console', prev, next, camera)} />
        <main className="jk-main">
          <div className="jk-console-head">
            <h1>
              <Sym name="terminal" size={30} />
              Console Output
            </h1>
            <div className="jk-console-links">
              <span className="jk-link" title="Download">
                <Sym name="download" size={14} /> Download
              </span>
              <button type="button" className="jk-link" onClick={() => wm?.clipboard.write(lines.join('\n'), 'jenkins')}>
                <Sym name="copy" size={14} /> Copy
              </button>
              <button type="button" className="jk-link" onClick={() => setPlain((p) => !p)}>
                <Sym name="doc" size={14} /> {plain ? 'View as formatted text' : 'View as plain text'}
              </button>
            </div>
            <AbortButton build={build} job={job} />
          </div>
          <pre className="jk-console" aria-live="polite" role="log">
            {plain
              ? lines.join('\n')
              : lines.map((l, i) => (
                  <span
                    key={i}
                    data-line={i + 1}
                    className={`jk-cline${l.startsWith('[Pipeline]') ? ' jk-cline-pipeline' : ''}${sel === i ? ' jk-cline-sel' : ''}${flash === i ? ' jk-cline-flash' : ''}`}
                    onClick={() => click(i)}
                  >
                    {l}
                    {'\n'}
                  </span>
                ))}
          </pre>
          {running ? <span className="jk-console-spin" aria-label="Build in progress" /> : null}
          {running ? (
            <button type="button" className="jk-follow" aria-pressed={follow} onClick={() => setFollow((f) => !f)}>
              {follow ? 'Following' : 'Follow'}
            </button>
          ) : null}
          <Footer />
        </main>
      </div>
    </>
  );
}

export function BuildParametersPage(props: { jobId: string; number: string }) {
  const { job, build } = useBuild(props.jobId, props.number);
  const { prev, next } = useNeighbours(job, build);
  const camera = useCameraLink(build);
  if (!job || !build) return <NotFoundShell />;
  const names = job.params.length ? job.params.map((p) => p.name) : Object.keys(build.params);
  for (const k of Object.keys(build.params)) if (!names.includes(k)) names.push(k);
  return (
    <>
      <Breadcrumbs crumbs={jobCrumbs(job, [{ label: `#${build.number}`, route: buildUrl(build) }, { label: 'Parameters' }])} />
      <div className="jk-body">
        <SidePanel tasks={buildTasks(job, build, 'parameters', prev, next, camera)} />
        <main className="jk-main">
          <h1>Parameters</h1>
          {names.length === 0 ? <p>No parameters.</p> : null}
          {names.map((n) => (
            <div className="jk-param" key={n}>
              <label className="jk-param-name">{n}</label>
              <input className="jk-input" readOnly value={isSecretParam(n) ? '********' : build.params[n] ?? ''} aria-label={n} />
              {job.params.find((p) => p.name === n)?.description ? <div className="jk-param-desc">{job.params.find((p) => p.name === n)!.description}</div> : null}
            </div>
          ))}
          <Footer />
        </main>
      </div>
    </>
  );
}
