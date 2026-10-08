/**
 * Orca home (Apps §2.3): welcome, status cards, health-check timer, active checkouts, recent alerts.
 */
import { useMemo } from 'react';
import { useGame } from '@/core/store';
import type { OrcaRobot } from '@/sim/types';
import { Whale } from '../icons';
import { STATUSES, StatusChip, hhmmss, useOrca, withQuery } from '../shared';

/** Jenkins build route for a build id "Java/uia-remote-regression-flex#4127". */
export function jenkinsBuildRoute(buildId: string): string | null {
  const m = /^(.+)#(\d+)$/.exec(buildId);
  if (!m) return null;
  const segs = m[1]!.split('/');
  return `/${segs.map((s) => `job/${encodeURIComponent(s)}`).join('/')}/${m[2]}/`;
}

export function buildLabel(buildId: string): string {
  return buildId.replace(/#(\d+)$/, ' #$1');
}

export function isManualCheckout(r: OrcaRobot): boolean {
  return !!r.checkout && (r.checkout.jobId === 'manual' || r.checkout.buildId.startsWith('manual-'));
}

export function HomePage() {
  const { navigate, wm, login } = useOrca();
  const robots = useGame((s) => s.lab.orca.robots);
  const hc = useGame((s) => s.lab.orca.healthCheck);
  const list = useMemo(() => Object.values(robots), [robots]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<string, number>;
    for (const r of list) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [list]);
  const checkouts = list.filter((r) => r.checkout);
  const alerts = useMemo(
    () =>
      list
        .flatMap((r) => r.notes.filter((n) => n.kind === 'HEALTH' && !n.resolved).map((n) => ({ r, n })))
        .sort((a, b) => (b.n.lastAtMs ?? b.n.atMs) - (a.n.lastAtMs ?? a.n.atMs))
        .slice(0, 8),
    [list],
  );

  if (!login) {
    return (
      <div className="orca-home">
        <div className="orca-home-left">
          <Whale size={220} body="#353d47" />
        </div>
        <div className="orca-home-right">
          <h1>Welcome to Orchestrator!</h1>
          <p className="orca-lead">Controller for Jenkins pipelines and the lab robots.</p>
          <div className="orca-alert orca-alert-warning">
            If you want to{' '}
            <button type="button" className="orca-link" onClick={() => navigate('/login')}>
              sign in
            </button>
            , you can try the default accounts:
            <br />- Administrator (login="admin" and password="admin")
            <br />- User (login="user" and password="user").
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="orca-home">
      <div className="orca-home-left">
        <Whale size={220} body="#353d47" />
      </div>
      <div className="orca-home-right">
        <h1>Welcome to Orchestrator!</h1>
        <p className="orca-lead">Controller for Jenkins pipelines and the lab robots.</p>
        <div className="orca-alert orca-alert-success">You are logged in as user "{login}".</div>
        <div className="orca-statcards">
          {STATUSES.map((s) => (
            <button key={s} type="button" className="orca-statcard" onClick={() => navigate(withQuery('/robot', { 'status.in': s, page: 1, sort: 'id,asc' }))}>
              <span className="orca-statcard-n">{counts[s] ?? 0}</span>
              <StatusChip status={s} />
            </button>
          ))}
        </div>
        <div className="orca-card">
          Health check: every {Math.round(hc.intervalMs / 60000)} minutes · last run {hhmmss(hc.runCount ? hc.lastRunMs : null)}
          {hc.runCount ? ` (#${hc.runCount})` : ''} · next {hhmmss(hc.nextRunMs)}{' '}
          <button type="button" className="orca-link" onClick={() => navigate('/admin/health-check-log')}>
            View health-check log
          </button>
        </div>
        <h4>Active checkouts</h4>
        {checkouts.length ? (
          <div className="orca-table-wrap">
            <table className="orca-table orca-table-striped">
              <thead>
                <tr>
                  <th>Robot</th>
                  <th>Build</th>
                  <th>Since</th>
                </tr>
              </thead>
              <tbody>
                {checkouts.map((r) => {
                  const manual = isManualCheckout(r);
                  const jr = manual ? null : jenkinsBuildRoute(r.checkout!.buildId);
                  return (
                    <tr key={r.id}>
                      <td>
                        <button type="button" className="orca-link" onClick={() => navigate(`/robot/${r.id}/view`)}>
                          {r.name}
                        </button>
                      </td>
                      <td>
                        {manual ? (
                          `manual (${login})`
                        ) : jr ? (
                          <button type="button" className="orca-link" onClick={() => wm?.openApp('jenkins', { route: jr })}>
                            {buildLabel(r.checkout!.buildId)}
                          </button>
                        ) : (
                          r.checkout!.buildId
                        )}
                      </td>
                      <td>{hhmmss(r.checkout!.startedMs)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="orca-muted">No robots are checked out.</p>
        )}
        <h4>Recent alerts</h4>
        {alerts.length ? (
          <div className="orca-table-wrap">
            <table className="orca-table">
              <tbody>
                {alerts.map(({ r, n }) => (
                  <tr key={`${r.id}-${n.id}`}>
                    <td style={{ whiteSpace: 'nowrap', width: 90 }}>{hhmmss(n.lastAtMs ?? n.atMs)}</td>
                    <td style={{ width: 110 }}>
                      <button type="button" className="orca-link" onClick={() => navigate(`/robot/${r.id}/view`)}>
                        {r.name}
                      </button>
                    </td>
                    <td className="orca-mono">{n.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="orca-muted">No unresolved health alerts.</p>
        )}
      </div>
    </div>
  );
}
