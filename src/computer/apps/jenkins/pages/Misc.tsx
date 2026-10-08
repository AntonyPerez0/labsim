/**
 * Jenkins Move, Search results, Manage Jenkins, Nodes, About, Pipeline Syntax and Access Denied (Apps §3.7–§3.9).
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import { sim } from '@/sim';
import { emitAppAction } from '@/computer/apps';
import { Sym, type SymbolName } from '../icons';
import { useJk, simTry } from '../ctx';
import { Breadcrumbs, Footer, SidePanel } from '../Layout';
import { jobCrumbs, jobTasks, NotFoundShell, useBuildNow } from './Job';
import { folders, jobUrl, search } from '../model';

export function MovePage(props: { jobId: string }) {
  const { navigate, readOnly } = useJk();
  const jenkins = useGame((s) => s.lab.jenkins);
  const job = jenkins.jobs[props.jobId] ?? null;
  const buildNow = useBuildNow(job);
  const [to, setTo] = useState(job?.folder ?? 'Java');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setTo(job?.folder ?? 'Java'), [job?.folder]);
  if (!job || job.exists === false) return <NotFoundShell />;
  const move = () => {
    if (readOnly) return;
    if (to === job.folder) {
      navigate(jobUrl(job.id));
      return;
    }
    const r = simTry(() => sim.jenkins.moveJob(job.id, to, 'player'));
    const newId = r.ok ? r.value.jobId : `${to}/${job.name}`;
    emitAppAction('jenkins', 'jenkins.job.moved', { from: job.id, to: newId, ok: r.ok, error: r.ok ? null : r.error });
    if (r.ok) navigate(jobUrl(newId));
    else setError(r.error);
  };
  return (
    <>
      <Breadcrumbs crumbs={jobCrumbs(job, [{ label: 'Move' }])} />
      <div className="jk-body">
        <SidePanel tasks={jobTasks(job, 'move', buildNow)} />
        <main className="jk-main">
          <h1>Move</h1>
          <p>Move ‘{job.name}’ to:</p>
          <select className="jk-select" value={to} onChange={(e) => setTo(e.target.value)} style={{ maxWidth: 320 }} disabled={readOnly} aria-label="Destination">
            {folders(jenkins).map((f) => (
              <option key={f} value={f}>
                Jenkins » {f}
              </option>
            ))}
          </select>
          <div style={{ marginTop: 14 }}>
            {!readOnly ? (
              <button type="button" className="jk-btn jk-btn-primary" onClick={move}>
                Move
              </button>
            ) : null}
          </div>
          {error ? <div className="jk-error">{error}</div> : null}
          <Footer />
        </main>
      </div>
    </>
  );
}

export function SearchPage(props: { q: string }) {
  const { navigate, gate } = useJk();
  const jenkins = useGame((s) => s.lab.jenkins);
  const hits = useMemo(() => search(jenkins, props.q, gate), [jenkins, props.q, gate]);
  return (
    <>
      <Breadcrumbs crumbs={[{ label: 'Dashboard', route: '/' }, { label: 'Search' }]} />
      <div className="jk-body">
        <main className="jk-main" style={{ paddingLeft: 24 }}>
          <h1>Search for ‘{props.q}’</h1>
          {hits.length === 0 ? <p>Nothing seems to match.</p> : null}
          <ol style={{ paddingLeft: 20 }}>
            {hits.map((h) => (
              <li key={h.id} style={{ margin: '4px 0' }}>
                <a href={`#${h.route}`} onClick={(e) => (e.preventDefault(), navigate(h.route))}>
                  {h.label}
                </a>
              </li>
            ))}
          </ol>
          <Footer />
        </main>
      </div>
    </>
  );
}

const MANAGE: { section: string; tiles: { label: string; desc: string; icon: SymbolName; route: string }[] }[] = [
  {
    section: 'System Configuration',
    tiles: [
      { label: 'System', desc: 'Configure global settings and paths.', icon: 'gear', route: '/manage/configure' },
      { label: 'Tools', desc: 'Configure tools, their locations and automatic installers.', icon: 'tools', route: '/manage/configureTools/' },
      { label: 'Plugins', desc: 'Add, remove, disable or enable plugins that can extend the functionality of Jenkins.', icon: 'plugin', route: '/manage/pluginManager/' },
      { label: 'Nodes', desc: 'Add, remove, control and monitor the various nodes that Jenkins runs jobs on.', icon: 'computer', route: '/computer/' },
      { label: 'Clouds', desc: 'Add, remove, and configure cloud instances to provision agents on-demand.', icon: 'cloud', route: '/manage/cloud/' },
    ],
  },
  {
    section: 'Security',
    tiles: [
      { label: 'Security', desc: 'Secure Jenkins; define who is allowed to access/use the system.', icon: 'shield', route: '/manage/configureSecurity/' },
      { label: 'Credentials', desc: 'Configure credentials', icon: 'key', route: '/manage/credentials/' },
      { label: 'Users', desc: 'Create/delete/modify users that can log in to this Jenkins.', icon: 'people', route: '/manage/securityRealm/' },
    ],
  },
  {
    section: 'Status Information',
    tiles: [
      { label: 'System Information', desc: 'Displays various environmental information to assist trouble-shooting.', icon: 'info', route: '/manage/systemInfo' },
      { label: 'System Log', desc: 'System log captures output from java.util.logging output related to Jenkins.', icon: 'log', route: '/manage/log/' },
      { label: 'Load Statistics', desc: 'Check your resource utilization and see if you need more computers for your builds.', icon: 'chart', route: '/manage/load-statistics' },
      { label: 'About Jenkins', desc: 'See the version and license information.', icon: 'help', route: '/manage/about/' },
    ],
  },
];

export function ManagePage() {
  const { navigate } = useJk();
  return (
    <>
      <Breadcrumbs crumbs={[{ label: 'Dashboard', route: '/' }, { label: 'Manage Jenkins' }]} />
      <div className="jk-body">
        <main className="jk-main" style={{ paddingLeft: 24 }}>
          <h1>Manage Jenkins</h1>
          {MANAGE.map((s) => (
            <section key={s.section}>
              <h2>{s.section}</h2>
              <div className="jk-tiles">
                {s.tiles.map((t) => (
                  <button key={t.label} type="button" className="jk-tile" onClick={() => navigate(t.route)}>
                    <Sym name={t.icon} size={28} />
                    <div>
                      <b>{t.label}</b>
                      <span>{t.desc}</span>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
          <Footer />
        </main>
      </div>
    </>
  );
}

export function NodesPage() {
  const executors = useGame((s) => s.lab.jenkins.executors);
  return (
    <>
      <Breadcrumbs crumbs={[{ label: 'Dashboard', route: '/' }, { label: 'Manage Jenkins', route: '/manage/' }, { label: 'Nodes' }]} />
      <div className="jk-body">
        <SidePanel tasks={[{ label: 'New Node', icon: 'plus', route: '/manage/computer/new' }, { label: 'Configure Monitors', icon: 'gear', route: '/manage/computer/configure' }]} />
        <main className="jk-main">
          <h1>Nodes</h1>
          <table className="jk-table">
            <thead>
              <tr>
                <th className="jk-col-icon">S</th>
                <th>Name ↓</th>
                <th>Architecture</th>
                <th>Clock Difference</th>
                <th>Free Disk Space</th>
                <th>Free Swap Space</th>
                <th>Free Temp Space</th>
                <th>Response Time</th>
                <th>Executors</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="jk-col-icon">
                  <Sym name="computer" size={20} />
                </td>
                <td>
                  <b>Built-In Node</b>
                </td>
                <td>Linux (amd64)</td>
                <td>In sync</td>
                <td>104.80 GB</td>
                <td>2.00 GB</td>
                <td>104.80 GB</td>
                <td>0ms</td>
                <td>{executors || 8}</td>
              </tr>
            </tbody>
          </table>
          <Footer />
        </main>
      </div>
    </>
  );
}

export function AboutPage() {
  return (
    <>
      <Breadcrumbs crumbs={[{ label: 'Dashboard', route: '/' }, { label: 'Manage Jenkins', route: '/manage/' }, { label: 'About Jenkins' }]} />
      <div className="jk-body">
        <main className="jk-main" style={{ paddingLeft: 24 }}>
          <h1>About Jenkins 2.462.3</h1>
          <p>The leading open source automation server which enables developers around the world to reliably build, test, and deploy their software.</p>
          <h2>Mavenized dependencies</h2>
          <p>The following third-party libraries are used by this Jenkins instance. Each is distributed under its own license.</p>
          <pre className="jk-pre">
            {`Jenkins core                  MIT License
Folders Plugin                MIT License
Pipeline                      MIT License
Pipeline: Stage View          MIT License
Green Balls                   MIT License
Git plugin                    MIT License`}
          </pre>
          <Footer />
        </main>
      </div>
    </>
  );
}

const SAMPLE_STEPS: Record<string, string> = {
  'sh: Shell Script': "sh './gradlew connectedAndroidTest -Pclasses=HomeScreenTest'",
  'git: Git': "git branch: 'main', url: 'git@github.com:labsim-lab/uia-remote.git'",
  'echo: Print Message': "echo 'Hello from the lab'",
  'archiveArtifacts: Archive the artifacts': "archiveArtifacts artifacts: 'app/build/reports/**', fingerprint: true",
  'junit: Archive JUnit-formatted test results': "junit 'app/build/outputs/androidTest-results/**/*.xml'",
};

export function PipelineSyntaxPage(props: { jobId: string }) {
  const job = useGame((s) => s.lab.jenkins.jobs[props.jobId]) ?? null;
  const buildNow = useBuildNow(job);
  const [step, setStep] = useState(Object.keys(SAMPLE_STEPS)[0]!);
  const [out, setOut] = useState('');
  if (!job || job.exists === false) return <NotFoundShell />;
  return (
    <>
      <Breadcrumbs crumbs={jobCrumbs(job, [{ label: 'Pipeline Syntax' }])} />
      <div className="jk-body">
        <SidePanel tasks={jobTasks(job, 'syntax', buildNow)} widgets={false} />
        <main className="jk-main">
          <h1>Snippet Generator</h1>
          <h3>Steps</h3>
          <div className="jk-field">
            <label htmlFor="jk-step">Sample Step</label>
            <select id="jk-step" className="jk-select" value={step} onChange={(e) => setStep(e.target.value)} style={{ maxWidth: 480 }}>
              {Object.keys(SAMPLE_STEPS).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </div>
          <button type="button" className="jk-btn" onClick={() => setOut(SAMPLE_STEPS[step]!)}>
            Generate Pipeline Script
          </button>
          {out ? <textarea className="jk-textarea" readOnly value={out} style={{ marginTop: 12, fontFamily: 'var(--jk-mono)', maxWidth: 900 }} /> : null}
          <Footer />
        </main>
      </div>
    </>
  );
}

export function AccessDeniedPage(props: { permission: string }) {
  const { playerName } = useJk();
  return (
    <>
      <Breadcrumbs crumbs={[{ label: 'Dashboard', route: '/' }]} />
      <div className="jk-body">
        <main className="jk-main jk-denied" style={{ paddingLeft: 24 }}>
          <h1>
            <Sym name="shield" size={30} />
            Access Denied
          </h1>
          <p>
            {playerName} is missing the {props.permission} permission
          </p>
          <Footer />
        </main>
      </div>
    </>
  );
}
