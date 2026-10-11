/**
 * Orka home (Apps §2.3): welcome, status cards, health-check timer, active checkouts, recent alerts.
 */
import { useMemo } from 'react';
import { useGame } from '@/core/store';
import type { OrkaRobot } from '@/sim/types';
import { Whale } from '../icons';
import { STATUSES, StatusChip, hhmmss, useOrka, withQuery } from '../shared';

/** Jenkins build route for a build id "Java/uia-relay-regression-flux#4127". */
export function jenkinsBuildRoute(buildId: string): string | null {
  const m = /^(.+)#(\d+)$/.exec(buildId);
  if (!m) return null;
  const segs = m[1]!.split('/');
  return `/${segs.map((s) => `job/${encodeURIComponent(s)}`).join('/')}/${m[2]}/`;
}

export function buildLabel(buildId: string): string {
  return buildId.replace(/#(\d+)$/, ' #$1');
}

export function isManualCheckout(r: OrkaRobot): boolean {
  return !!r.checkout && (r.checkout.jobId === 'manual' || r.checkout.buildId.startsWith('manual-'));
}

export function HomePage() {
  const { navigate, wm, login } = useOrka();
  const robots = useGame((s) => s.lab.orka.robots);
  const hc = useGame((s) => s.lab.orka.healthCheck);
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
      <div className="orka-home">
        <div className="orka-home-left">
          <Whale size={220} body="#353d47" />
        </div>
        <div className="orka-home-right">
          <h1>Welcome to Orchestrator!</h1>
          <p className="orka-lead">Controller for Jenkins pipelines and the lab robots.</p>
          <div className="orka-alert orka-alert-warning">
            If you want to{' '}
            <button type="button" className="orka-link" onClick={() => navigate('/login')}>
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
    <div className="orka-home">
      <div className="orka-home-left">
        <Whale size={220} body="#353d47" />
      </div>
      <div className="orka-home-right">
        <h1>Welcome to Orchestrator!</h1>
        <p className="orka-lead">Controller for Jenkins pipelines and the lab robots.</p>
        <div className="orka-alert orka-alert-success">You are logged in as user "{login}".</div>
        <div className="orka-statcards">
          {STATUSES.map((s) => (
            <button key={s} type="button" className="orka-statcard" onClick={() => navigate(withQuery('/robot', { 'status.in': s, page: 1, sort: 'id,asc' }))}>
              <span className="orka-statcard-n">{counts[s] ?? 0}</span>
              <StatusChip status={s} />
            </button>
          ))}
        </div>
        <div className="orka-card">
          Health check: every {Math.round(hc.intervalMs / 60000)} minutes · last run {hhmmss(hc.runCount ? hc.lastRunMs : null)}
          {hc.runCount ? ` (#${hc.runCount})` : ''} · next {hhmmss(hc.nextRunMs)}{' '}
          <button type="button" className="orka-link" onClick={() => navigate('/admin/health-check-log')}>
            View health-check log
          </button>
        </div>
        <h4>Active checkouts</h4>
        {checkouts.length ? (
          <div className="orka-table-wrap">
            <table className="orka-table orka-table-striped">
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
                        <button type="button" className="orka-link" onClick={() => navigate(`/robot/${r.id}/view`)}>
                          {r.name}
                        </button>
                      </td>
                      <td>
                        {manual ? (
                          `manual (${login})`
                        ) : jr ? (
                          <button type="button" className="orka-link" onClick={() => wm?.openApp('jenkins', { route: jr })}>
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
          <p className="orka-muted">No robots are checked out.</p>
        )}
        <h4>Recent alerts</h4>
        {alerts.length ? (
          <div className="orka-table-wrap">
            <table className="orka-table">
              <tbody>
                {alerts.map(({ r, n }) => (
                  <tr key={`${r.id}-${n.id}`}>
                    <td style={{ whiteSpace: 'nowrap', width: 90 }}>{hhmmss(n.lastAtMs ?? n.atMs)}</td>
                    <td style={{ width: 110 }}>
                      <button type="button" className="orka-link" onClick={() => navigate(`/robot/${r.id}/view`)}>
                        {r.name}
                      </button>
                    </td>
                    <td className="orka-mono">{n.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="orka-muted">No unresolved health alerts.</p>
        )}
      </div>
    </div>
  );
}
