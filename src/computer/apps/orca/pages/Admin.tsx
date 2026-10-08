/**
 * Orca Administration pages (Apps §2.12): User management, Metrics, Health, Configuration,
 * Health-check log [Tate], Audits, Logs.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import { sim } from '@/sim';
import type { HealthLogRun } from '@/sim/types';
import { emitAppAction, fmtStamp } from '../../../apps';
import { Fa } from '../icons';
import type { OrcaRouteKey } from '../session';
import { AlertArea, PageHeading, addAlert, simCall, useOnce, useOrca } from '../shared';

const USERS: [number, string, string, boolean, string[], string, string][] = [
  [1, 'admin', 'admin@orca.lab.local', true, ['ROLE_ADMIN', 'ROLE_USER'], '2024-03-11', 'system'],
  [2, 'user', 'user@orca.lab.local', true, ['ROLE_USER'], '2024-03-11', 'system'],
  [3, 'tate', 'tate@labsim-lab.lab', true, ['ROLE_ADMIN', 'ROLE_USER'], '2024-03-12', 'admin'],
  [4, 'jared', 'jared@labsim-lab.lab', true, ['ROLE_USER'], '2024-04-02', 'tate'],
  [5, 'morgan', 'morgan@labsim-lab.lab', true, ['ROLE_USER'], '2024-04-02', 'tate'],
  [6, 'david', 'david@labsim-lab.lab', true, ['ROLE_USER'], '2025-01-20', 'tate'],
  [7, 'jenkins-ci', 'jenkins@jenkins.lab.local', true, ['ROLE_USER'], '2024-03-14', 'admin'],
];

function UsersPage() {
  const { path } = useOrca();
  const deny = () => addAlert('danger', 'You are not allowed to modify users on this instance (LDAP-managed).', path);
  return (
    <div>
      <PageHeading title="Users">
        <button type="button" className="orca-btn orca-btn-primary" onClick={deny}>
          <Fa.plus /> Create a new user
        </button>
      </PageHeading>
      <AlertArea />
      <div className="orca-table-wrap">
        <table className="orca-table orca-table-striped">
          <thead>
            <tr>
              {['ID', 'Login', 'Email', 'Activated', 'Langkey', 'Profiles', 'Created date', 'Modified by', ''].map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {USERS.map(([id, login, email, act, roles, created, by]) => (
              <tr key={id}>
                <td>{id}</td>
                <td>{login}</td>
                <td>{email}</td>
                <td>
                  <span className={`orca-badge ${act ? 'orca-bg-success' : 'orca-bg-danger'}`}>{act ? 'Activated' : 'Deactivated'}</span>
                </td>
                <td>en</td>
                <td>
                  {roles.map((r) => (
                    <span key={r} className="orca-badge orca-bg-info" style={{ marginRight: 4 }}>
                      {r}
                    </span>
                  ))}
                </td>
                <td>{created}</td>
                <td>{by}</td>
                <td>
                  <div className="orca-btn-group">
                    <button type="button" className="orca-btn orca-btn-info orca-btn-sm" onClick={deny}>
                      <Fa.eye size={12} /> View
                    </button>
                    <button type="button" className="orca-btn orca-btn-primary orca-btn-sm" onClick={deny}>
                      <Fa.pencil size={12} /> Edit
                    </button>
                    <button type="button" className="orca-btn orca-btn-danger orca-btn-sm" onClick={deny} disabled={login === 'admin'}>
                      <Fa.times size={12} /> Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Bar(props: { label: string; used: number; max: number; unit?: string }) {
  const pct = Math.round((props.used / props.max) * 100);
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="orca-small">
        {props.label}: {props.used.toLocaleString('en-US')}
        {props.unit ?? 'M'} / {props.max.toLocaleString('en-US')}
        {props.unit ?? 'M'}
      </div>
      <div style={{ height: 16, background: '#e9ecef', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct > 80 ? '#dc3545' : '#198754', color: '#fff', fontSize: 11, textAlign: 'center' }}>{pct}%</div>
      </div>
    </div>
  );
}

function MetricsPage() {
  const db = useGame((s) => s.lab.orca.app?.dbConnected !== false);
  const runs = useGame((s) => s.lab.orca.healthCheck.runCount);
  const [tick, setTick] = useState(0);
  return (
    <div>
      <PageHeading title="Application Metrics">
        <button type="button" className="orca-btn orca-btn-primary" onClick={() => setTick((t) => t + 1)}>
          <Fa.sync /> Refresh
        </button>
      </PageHeading>
      <h4>JVM Metrics</h4>
      <div className="orca-row">
        <div className="orca-col orca-card">
          <div className="orca-card-title">Memory</div>
          <Bar label="Heap Memory" used={412 + (tick % 3) * 17} max={1024} />
          <Bar label="Non-Heap Memory" used={168} max={256} />
        </div>
        <div className="orca-col orca-card">
          <div className="orca-card-title">Threads (Total: 46)</div>
          <div className="orca-small">Runnable 12 · Timed waiting 21 · Waiting 13 · Blocked 0</div>
        </div>
        <div className="orca-col orca-card">
          <div className="orca-card-title">System</div>
          <div className="orca-small">Uptime 6d 3h · Start time 2026-09-29 06:12 · Process CPU 3.2% · System CPU 7.9%</div>
        </div>
      </div>
      <h4>HTTP requests (time in milliseconds)</h4>
      <div className="orca-table-wrap">
        <table className="orca-table orca-table-striped">
          <thead>
            <tr>
              <th>Code</th>
              <th>Count</th>
              <th>Mean</th>
              <th>Max</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>200</td>
              <td>{18342 + runs * 37 + tick * 11}</td>
              <td>14</td>
              <td>10 412</td>
            </tr>
            <tr>
              <td>201</td>
              <td>412</td>
              <td>22</td>
              <td>310</td>
            </tr>
            <tr>
              <td>400</td>
              <td>57</td>
              <td>6</td>
              <td>41</td>
            </tr>
            <tr>
              <td>404</td>
              <td>23</td>
              <td>4</td>
              <td>12</td>
            </tr>
            <tr>
              <td>409</td>
              <td>9</td>
              <td>1 120</td>
              <td>2 400</td>
            </tr>
            <tr>
              <td>500</td>
              <td>{db ? 0 : 128 + tick}</td>
              <td>{db ? 0 : 10006}</td>
              <td>{db ? 0 : 10021}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h4>Cache statistics</h4>
      <p className="orca-muted">No caches configured.</p>
      <h4>Datasource statistics</h4>
      <div className="orca-codebox">{db ? 'Connection pool: HikariPool-1 · active 2 · idle 8 · max 10' : 'Connection pool: HikariPool-1 · 0 active · pending 10'}</div>
    </div>
  );
}

function HealthPage() {
  const app = useGame((s) => s.lab.orca.app);
  const hc = useGame((s) => s.lab.orca.healthCheck);
  const [res, setRes] = useState<{ db: string } | null>(null);
  useEffect(() => {
    try {
      const r = sim.orca.rest('GET', '/management/health', null, 'player');
      const j = JSON.parse(r.body) as { components?: Record<string, { status: string }> };
      setRes({ db: j.components?.db?.status ?? (app?.dbConnected === false ? 'DOWN' : 'UP') });
    } catch {
      setRes({ db: app?.dbConnected === false ? 'DOWN' : 'UP' });
    }
  }, [app]);
  const rows: [string, string, string][] = [
    ['db', res?.db ?? (app?.dbConnected === false ? 'DOWN' : 'UP'), res?.db === 'DOWN' ? 'MySQL · Communications link failure' : 'MySQL · validationQuery isValid()'],
    ['diskSpace', 'UP', 'free 59 GB'],
    ['ping', 'UP', ''],
    ['healthCheckThread', 'UP', `last run #${hc.runCount} ${fmtStamp(hc.lastRunMs).slice(11)}`],
  ];
  return (
    <div>
      <PageHeading title="Health Checks">
        <button type="button" className="orca-btn orca-btn-primary" onClick={() => setRes(null)}>
          <Fa.sync /> Refresh
        </button>
      </PageHeading>
      <div className="orca-table-wrap">
        <table className="orca-table orca-table-striped">
          <thead>
            <tr>
              <th>Service name</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([n, st, d]) => (
              <tr key={n}>
                <td>{n}</td>
                <td>
                  <span className={`orca-badge ${st === 'UP' ? 'orca-bg-success' : 'orca-bg-danger'}`}>{st}</span>
                </td>
                <td className="orca-small">{d}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const CONFIG: [string, string][] = [
  ['spring.datasource.url', 'jdbc:mysql://localhost:3306/orca'],
  ['spring.datasource.username', 'orca'],
  ['spring.datasource.hikari.maximum-pool-size', '10'],
  ['spring.jpa.open-in-view', 'false'],
  ['spring.profiles.active', 'prod'],
  ['server.port', '8080'],
  ['orca.health-check.interval', '300000'],
  ['orca.health-check.timeout-ms', '10000'],
  ['orca.health-check.endpoint', '/health'],
  ['orca.checkout.lru', 'true'],
  ['orca.gort.sync-on-merge', 'true'],
  ['orca.chat.alerts-channel', '#orca-alerts'],
  ['jhipster.clientApp.name', 'orchestratorApp'],
  ['jhipster.security.authentication.jwt.token-validity-in-seconds', '86400'],
  ['management.endpoints.web.exposure.include', 'configprops,env,health,info,jhimetrics,logfile,loggers,threaddump,caches,liquibase'],
  ['logging.level.com.labsim.orca', 'INFO'],
];

function ConfigurationPage() {
  const [q, setQ] = useState('');
  const rows = CONFIG.filter(([k, v]) => !q || k.includes(q) || v.includes(q));
  return (
    <div>
      <PageHeading title="Configuration" />
      <input className="orca-control" style={{ maxWidth: 360, marginBottom: 12 }} placeholder="Filter (by prefix)" value={q} onChange={(e) => setQ(e.target.value)} />
      <h4>Spring configuration</h4>
      <div className="orca-table-wrap">
        <table className="orca-table orca-table-striped orca-table-fixed">
          <thead>
            <tr>
              <th style={{ width: '45%' }}>Property</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td className="orca-mono">{k}</td>
                <td className="orca-mono" title={v}>
                  {v}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function runHeader(r: HealthLogRun): string {
  return `${fmtStamp(r.atMs)}  health-check run #${r.run} — ${r.pinged} pinged, ${r.skipped} skipped, ${r.failed} failed, ${r.recovered} recovered`;
}

function lineClass(l: string): string | undefined {
  if (/\(recovered\)/.test(l)) return 'orca-log-recovered';
  if (/\bFAIL\b/.test(l)) return 'orca-log-fail';
  if (/SKIPPED \(Offline\)/.test(l)) return 'orca-log-skipped';
  if (/RESERVED — not overridden/.test(l)) return 'orca-log-reserved';
  return undefined;
}

function HealthLogPage() {
  const { path } = useOrca();
  const log = useGame((s) => s.lab.orca.healthCheck.log);
  const showForce = useGame((s) => !!s.session.computer?.forceHealthCheckButton && !!s.lab.config?.forceHealthCheckAllowed);
  const [q, setQ] = useState('');
  const runs = useMemo(() => [...log].sort((a, b) => b.run - a.run), [log]);
  useOnce('healthlog', () => emitAppAction('orca', 'orca.healthLog.viewed', { newestRun: runs[0]?.run ?? null }));
  const prevNewest = useMemo(() => ({ v: runs[0]?.run ?? null }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // A new run arriving while the page is open counts as viewing it.
    const newest = runs[0]?.run ?? null;
    if (newest !== prevNewest.v) {
      prevNewest.v = newest;
      emitAppAction('orca', 'orca.healthLog.viewed', { newestRun: newest });
    }
  }, [runs, prevNewest]);
  const force = () => {
    const fn = (sim.orca as { forceHealthCheck?: (a: string) => { ok: boolean; error?: string } }).forceHealthCheck;
    const r = simCall(() => (fn ? (fn('player') as never) : (sim.orca.runHealthCheckNow(), { ok: true as const, value: undefined })));
    emitAppAction('orca', 'orca.healthCheck.forced', { ok: r.ok, error: r.ok ? null : r.error });
    if (!r.ok) addAlert('danger', r.error, path);
  };
  return (
    <div>
      <PageHeading title="Health-check log">
        <input className="orca-control" style={{ width: 220 }} placeholder="Robot name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Robot name" />
        {showForce ? (
          <button type="button" className="orca-tutorial-btn" style={{ color: '#9a6b00' }} onClick={force}>
            ⟳ Force health check
          </button>
        ) : null}
      </PageHeading>
      <AlertArea />
      {runs.length === 0 ? <p className="orca-muted">No health-check runs yet.</p> : null}
      {runs.map((r) => {
        const hasHeader = r.lines[0]?.includes('health-check run #');
        const header = hasHeader ? r.lines[0]! : runHeader(r);
        const lines = (hasHeader ? r.lines.slice(1) : r.lines).filter((l) => !q || l.toLowerCase().includes(q.toLowerCase()));
        return (
          <div key={r.run} className="orca-card" style={{ padding: 12 }}>
            <div className="orca-logline" style={{ fontWeight: 700 }}>
              {header}
            </div>
            {lines.map((l, i) => (
              <div key={i} className={`orca-logline ${lineClass(l) ?? ''}`}>
                {l}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function AuditsPage() {
  const audit = useGame((s) => s.lab.orca.audit);
  const nowMs = useGame((s) => Math.floor(s.lab.time.nowMs / 86_400_000));
  const dayStr = (d: number) => new Date(Date.UTC(2026, 9, 5) + d * 86_400_000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(dayStr(nowMs - 7));
  const [to, setTo] = useState(dayStr(nowMs));
  const rows = [...audit]
    .filter((a) => {
      const d = fmtStamp(a.atMs).slice(0, 10);
      return d >= from && d <= to;
    })
    .sort((a, b) => b.atMs - a.atMs);
  return (
    <div>
      <PageHeading title="Audits" />
      <div className="orca-filterbar" style={{ marginBottom: 12 }}>
        <div className="orca-form-group">
          <label className="orca-label">From</label>
          <input className="orca-control" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="orca-form-group">
          <label className="orca-label">To</label>
          <input className="orca-control" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <div className="orca-table-wrap">
        <table className="orca-table orca-table-striped">
          <thead>
            <tr>
              <th>Date</th>
              <th>User</th>
              <th>State/Action</th>
              <th>Entity</th>
              <th>ID</th>
              <th>Changes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a, i) => (
              <tr key={i}>
                <td style={{ whiteSpace: 'nowrap' }}>{fmtStamp(a.atMs)}</td>
                <td>{a.who}</td>
                <td>
                  <span className="orca-badge orca-bg-secondary">{a.action}</span>
                </td>
                <td>{a.entity}</td>
                <td>{String(a.entityId)}</td>
                <td className="orca-mono">
                  {a.diff
                    ? Object.entries(a.diff).map(([k, [o, n]]) => (
                        <div key={k}>
                          {k}: {JSON.stringify(o)} → {JSON.stringify(n)}
                        </div>
                      ))
                    : ''}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="orca-muted">
                  No audits found for this period.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const LOGGERS = ['ROOT', 'com.labsim.orca', 'com.labsim.orca.health', 'com.labsim.orca.checkout', 'com.labsim.orca.gort', 'com.labsim.orca.web.rest', 'org.hibernate.SQL', 'org.springframework', 'org.springframework.security', 'com.zaxxer.hikari', 'tech.jhipster'];
const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF'];
const LEVEL_BTN: Record<string, string> = { TRACE: 'orca-btn-primary', DEBUG: 'orca-btn-success', INFO: 'orca-btn-info', WARN: 'orca-btn-warning', ERROR: 'orca-btn-danger', OFF: 'orca-btn-secondary' };

function thread(source: string): { thread: string; logger: string } {
  if (source.includes('health')) return { thread: 'health-check-1', logger: 'c.c.orca.health.HealthCheckService' };
  if (source.includes('checkout')) return { thread: 'http-nio-8080-exec-4', logger: 'c.c.orca.checkout.CheckoutService' };
  if (source.includes('gort')) return { thread: 'task-2', logger: 'c.c.orca.gort.GortSyncService' };
  return { thread: 'http-nio-8080-exec-1', logger: 'c.c.orca.web.rest.RobotResource' };
}

function LogsPage() {
  const log = useGame((s) => s.lab.log);
  const [q, setQ] = useState('');
  const [levels, setLevels] = useState<Record<string, string>>(() => Object.fromEntries(LOGGERS.map((l) => [l, l === 'org.hibernate.SQL' ? 'WARN' : 'INFO'])));
  const recent = useMemo(() => log.filter((e) => e.source.startsWith('orca')).slice(-100), [log]);
  return (
    <div>
      <PageHeading title="Logs" />
      <p>There are 412 loggers.</p>
      <input className="orca-control" style={{ maxWidth: 360, marginBottom: 12 }} placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="orca-table-wrap">
        <table className="orca-table orca-table-striped">
          <thead>
            <tr>
              <th>Name</th>
              <th>Level</th>
            </tr>
          </thead>
          <tbody>
            {LOGGERS.filter((l) => !q || l.includes(q)).map((l) => (
              <tr key={l}>
                <td className="orca-small">{l}</td>
                <td>
                  <div className="orca-btn-group">
                    {LEVELS.map((lv) => (
                      <button key={lv} type="button" className={`orca-btn orca-btn-sm ${levels[l] === lv ? LEVEL_BTN[lv] : 'orca-btn-outline-secondary'}`} onClick={() => setLevels((m) => ({ ...m, [l]: lv }))}>
                        {lv}
                      </button>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h4>Recent log</h4>
      <div className="orca-codebox" style={{ maxHeight: 360, overflow: 'auto' }}>
        {recent.length
          ? recent.map((e, i) => {
              const t = thread(e.source);
              const ms = String(((e.atMs % 1000) + 1000) % 1000).padStart(3, '0');
              return (
                <div key={i}>
                  {`${fmtStamp(e.atMs)}.${ms} ${e.level.toUpperCase().padStart(5)} 1 --- [${t.thread}] ${t.logger} : ${e.text}`}
                </div>
              );
            })
          : 'No log lines.'}
      </div>
    </div>
  );
}

export function AdminPage(props: { which: OrcaRouteKey }) {
  switch (props.which) {
    case 'adminUsers':
      return <UsersPage />;
    case 'adminMetrics':
      return <MetricsPage />;
    case 'adminHealth':
      return <HealthPage />;
    case 'adminConfiguration':
      return <ConfigurationPage />;
    case 'adminHealthCheckLog':
      return <HealthLogPage />;
    case 'adminAudits':
      return <AuditsPage />;
    case 'adminLogs':
      return <LogsPage />;
    default:
      return null;
  }
}
