/**
 * LabSim Robot Dashboard — desktop client of the rigs' status-tablet dashboard (Apps §10.6).
 * Exports `DashboardApp` (APP_META.dashboard.exportName) and `DashboardSurface` (also hosted by the
 * status-tablet overlay `TabletDashboard`, Apps §10.7).
 */
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '@/core/store';
import type { BannerColor } from '@/sim/types';
import { APP_ROUTES, buildRoute, emitAppAction, matchRoute, type AppProps, type DashboardTab } from '../../apps';
import { reachErrorShort } from '../../shell/reach';
import { DashboardSurface, FitSurface, useControllerReach } from './Surface';
import './dashboard.css';

export { DashboardSurface, type DashboardSurfaceProps } from './Surface';

const DOT: Record<BannerColor, string> = { green: '#2bd862', yellow: '#f2c12e', grey: '#8b9099', red: '#e04b3c' };
const TABS: DashboardTab[] = ['robot', 'robot-control', 'motion-control'];

function AddressStrip(props: { robot: string }) {
  const r = useControllerReach(props.robot, 'dashboard');
  const pi = r.piIp ?? '10.42.10.?';
  if (r.netError) {
    return (
      <div className="rdash-addr rdash-addr-err" role="alert">
        Controller unreachable — http://{pi}:8000 ({reachErrorShort(r.netError as 'timeout')})
      </div>
    );
  }
  return <div className="rdash-addr">http://{pi}:8000/dashboard</div>;
}

export function DashboardApp(props: AppProps) {
  const { navigate, onTitle, focused } = props;
  const route = props.route ?? '/';
  const m = matchRoute(APP_ROUTES.dashboard.robot, route);
  const robotName = m?.params.name ?? null;
  const tab = (TABS.includes(m?.params.tab as DashboardTab) ? m!.params.tab : 'motion-control') as DashboardTab;
  const rigs = useGame((s) => s.lab.rigs);
  const robots = useGame((s) => s.lab.orca.robots);
  const [q, setQ] = useState('');

  const groups = useMemo(() => {
    const rows = Object.values(rigs)
      .filter((r) => r.hasGantry)
      .map((r) => {
        const o = robots[r.orcaRobotId];
        return { rig: r, name: r.id, hrn: o?.humanReadableName ?? r.id.toUpperCase(), rack: (o?.location ?? 'Unassigned').split(' · ')[0]!, id: r.orcaRobotId };
      })
      .filter((x) => !q || x.name.includes(q.toLowerCase()) || x.hrn.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => a.id - b.id);
    const map = new Map<string, typeof rows>();
    for (const r of rows) map.set(r.rack, [...(map.get(r.rack) ?? []), r]);
    return [...map.entries()];
  }, [rigs, robots, q]);

  const hrn = robotName ? (robots[rigs[robotName]?.orcaRobotId ?? -1]?.humanReadableName ?? robotName.toUpperCase()) : null;
  useEffect(() => {
    onTitle?.(hrn ? `LabSim Robot Dashboard — ${hrn}` : 'LabSim Robot Dashboard');
  }, [hrn, onTitle]);

  const select = (name: string) => {
    emitAppAction('dashboard', 'dashboard.robot.selected', { robot: name });
    navigate?.(buildRoute(APP_ROUTES.dashboard.robot, { name, tab }));
  };

  return (
    <div className="rdash-root" data-app="dashboard" data-window={props.windowId}>
      <aside className="rdash-side">
        <div className="rdash-side-head">Robots</div>
        <input className="rdash-search" placeholder="Search robots" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search robots" />
        <div className="rdash-list" role="listbox" aria-label="Robots">
          {groups.map(([rack, rows]) => (
            <div key={rack}>
              <div className="rdash-rack">{rack}</div>
              {rows.map((r) => (
                <button
                  key={r.name}
                  type="button"
                  role="option"
                  aria-selected={robotName === r.name}
                  className={`rdash-item${robotName === r.name ? ' rdash-item-on' : ''}`}
                  onClick={() => select(r.name)}
                  data-hint={`dashboard.robot:${r.name}`}
                >
                  <span className="rdash-dot" style={{ background: DOT[r.rig.banner] }} />
                  <span style={{ flex: 1 }}>{r.hrn}</span>
                  {r.rig.dashboardLocked ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" aria-label="Locked">
                      <path d="M6 10V7a6 6 0 0112 0v3h1.5v12h-15V10zm2.5 0h7V7a3.5 3.5 0 00-7 0z" fill="#b9c6dc" />
                    </svg>
                  ) : null}
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 ? <div className="rdash-rack">No robots</div> : null}
        </div>
      </aside>
      <section className="rdash-main">
        {robotName && rigs[robotName] ? (
          <>
            <AddressStrip robot={robotName} />
            <div className="rdash-stage">
              <FitSurface>
                <DashboardSurface
                  key={robotName}
                  robotId={robotName}
                  host="dashboard"
                  tab={tab}
                  keyboard={!!focused}
                  onTabChange={(t) => navigate?.(buildRoute(APP_ROUTES.dashboard.robot, { name: robotName, tab: t }))}
                />
              </FitSurface>
            </div>
          </>
        ) : (
          <div className="rdash-empty">{robotName ? `Unknown robot "${robotName}"` : 'Select a robot to open its dashboard.'}</div>
        )}
      </section>
    </div>
  );
}
