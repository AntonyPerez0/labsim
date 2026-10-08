/**
 * Robots list with Tate's filter UI (Apps §2.4): status toggles, device type / rig kind / environment
 * selects, name search (250 ms debounce, replace navigation), sortable columns, pagination, live rows,
 * row actions incl. the `Status ▾` split button.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/core/store';
import { DEVICE_TYPE_CODES, type OrcaRobot, type RobotStatus } from '@/sim/types';
import { emitAppAction } from '../../../apps';
import { Fa } from '../icons';
import {
  AlertArea,
  ItemCount,
  PageHeading,
  Pagination,
  RowButtons,
  SETTABLE,
  STATUSES,
  STATUS_COLOR,
  STATUS_LABEL,
  SortTh,
  StatusChip,
  addAlert,
  hhmmss,
  nextSort,
  paginate,
  parseSort,
  sortRows,
  useOrca,
  withQuery,
} from '../shared';
import { buildLabel, isManualCheckout, jenkinsBuildRoute } from './Home';
import { ENVIRONMENTS, RIG_KINDS, RIG_KIND_LABEL, robotDeviceType, useDeleteFlow, useStatusChange } from './common';

interface Filters {
  status: RobotStatus[];
  deviceType: string | null;
  rigKind: string | null;
  environment: string | null;
  name: string;
}

function readFilters(q: Record<string, string>): Filters {
  return {
    status: (q['status.in'] ?? '').split(',').filter((s): s is RobotStatus => (STATUSES as string[]).includes(s)),
    deviceType: q['deviceType.equals'] || null,
    rigKind: q['rigKind.equals'] || null,
    environment: q['environment.equals'] || null,
    name: q['name.contains'] ?? '',
  };
}

function filterRoute(f: Filters, page: number, sort: string): string {
  return withQuery('/robot', {
    'status.in': f.status.length ? f.status.join(',') : null,
    'deviceType.equals': f.deviceType,
    'rigKind.equals': f.rigKind,
    'environment.equals': f.environment,
    'name.contains': f.name || null,
    page,
    sort,
  });
}

function HealthCell(props: { r: OrcaRobot }) {
  const { r } = props;
  if (r.status === 'RESERVED') return <span className="orca-grey">Reserved — not overridden</span>;
  if (r.lastHealthCheckMs == null || r.status === 'OFFLINE') return <span>—</span>;
  if (r.lastHealthCheckOk) {
    const http = r.lastHealth?.http ?? 200;
    return <span className="orca-ok">{`${hhmmss(r.lastHealthCheckMs)} · ${http} OK`}</span>;
  }
  return (
    <span className="orca-fail" title={r.lastHealth?.error ?? ''}>
      {`${hhmmss(r.lastHealthCheckMs)} · FAIL`}
    </span>
  );
}

function StatusMenu(props: { r: OrcaRobot; onPick(s: RobotStatus): void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', off);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('pointerdown', off);
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <div className="orca-btn-group" ref={ref}>
      <button type="button" className="orca-btn orca-btn-outline-secondary orca-btn-sm orca-caret" disabled={props.disabled} onClick={() => setOpen((o) => !o)} data-hint={`orca.robots.rowStatus:${props.r.name}`} aria-haspopup="menu" aria-expanded={open}>
        Status
      </button>
      {open ? (
        <div className="orca-menu" role="menu">
          {SETTABLE.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={props.r.status === s}
              className="orca-dropdown-item"
              onClick={() => {
                setOpen(false);
                props.onPick(s);
              }}
            >
              <span style={{ width: 14 }}>{props.r.status === s ? <Fa.check size={12} /> : null}</span>
              <span className="orca-badge orca-pill" style={{ background: STATUS_COLOR[s] }}>
                {STATUS_LABEL[s]}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RobotsPage() {
  const { query, navigate, wm, readOnly, login, focused = true } = useOrca();
  const robots = useGame((s) => s.lab.orca.robots);
  const devices = useGame((s) => s.lab.orca.devices);
  const filters = useMemo(() => readFilters(query), [query]);
  const sort = parseSort(query.sort);
  const page = Number(query.page) || 1;
  const [nameText, setNameText] = useState(filters.name);
  const nameRef = useRef<HTMLInputElement>(null);
  const del = useDeleteFlow('robot', '/robot');
  const status = useStatusChange();
  const [refreshing, setRefreshing] = useState(false);

  const all = useMemo(() => Object.values(robots), [robots]);
  const devType = (r: OrcaRobot) => robotDeviceType({ orca: { devices } } as never, r);
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<RobotStatus, number>;
    for (const r of all) c[r.status]++;
    return c;
  }, [all]);

  const apply = (f: Filters, rows: OrcaRobot[]) =>
    rows.filter((r) => {
      if (f.status.length && !f.status.includes(r.status)) return false;
      if (f.deviceType && devType(r) !== f.deviceType) return false;
      if (f.rigKind && r.rigKind !== f.rigKind) return false;
      if (f.environment && r.environment !== f.environment) return false;
      if (f.name) {
        const q = f.name.toLowerCase();
        if (!r.name.toLowerCase().includes(q) && !r.humanReadableName.toLowerCase().includes(q)) return false;
      }
      return true;
    });

  const filtered = useMemo(() => apply(filters, all), [filters, all, devices]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorted = useMemo(
    () =>
      sortRows(filtered, sort.field, sort.dir, (r, f) =>
        f === 'deviceType' ? devType(r) : f === 'lastHealthCheck' ? r.lastHealthCheckMs : (r as unknown as Record<string, unknown>)[f],
      ),
    [filtered, sort.field, sort.dir], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const rows = paginate(sorted, page);

  // Live rows: flash a row whose status changed.
  const prev = useRef<Map<number, RobotStatus>>(new Map());
  const [flash, setFlash] = useState<Set<number>>(new Set());
  useEffect(() => {
    const changed: number[] = [];
    for (const r of all) {
      const p = prev.current.get(r.id);
      if (p && p !== r.status) changed.push(r.id);
      prev.current.set(r.id, r.status);
    }
    if (!changed.length) return;
    setFlash(new Set(changed));
    const t = setTimeout(() => setFlash(new Set()), 650);
    return () => clearTimeout(t);
  }, [all]);

  const commit = (f: Filters, replace = false) => {
    navigate(filterRoute(f, 1, query.sort ?? 'id,asc'), { replace });
    emitAppAction('orca', 'orca.robots.filtered', {
      status: f.status,
      deviceType: f.deviceType,
      rigKind: f.rigKind,
      environment: f.environment,
      name: f.name,
      resultCount: apply(f, all).length,
    });
  };

  // Debounced name filter (replace navigation while typing).
  useEffect(() => {
    if (nameText === filters.name) return;
    const t = setTimeout(() => commit({ ...filters, name: nameText }, true), 250);
    return () => clearTimeout(t);
  }, [nameText]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setNameText(filters.name);
  }, [filters.name]);

  // `/` focuses the Name filter.
  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '/' || e.ctrlKey || e.altKey || t?.closest('input, textarea, select')) return;
      if (!nameRef.current?.isConnected || nameRef.current.offsetParent === null) return;
      e.preventDefault();
      nameRef.current.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused]);

  const toggleStatus = (s: RobotStatus) => {
    const next = filters.status.includes(s) ? filters.status.filter((x) => x !== s) : [...filters.status, s];
    commit({ ...filters, status: STATUSES.filter((x) => next.includes(x)) });
  };

  const anyFilter = filters.status.length > 0 || !!filters.deviceType || !!filters.rigKind || !!filters.environment || !!filters.name;

  return (
    <div>
      <PageHeading title="Robots">
        <button
          type="button"
          className="orca-btn orca-btn-info"
          onClick={() => {
            setRefreshing(true);
            setTimeout(() => setRefreshing(false), 300);
          }}
          disabled={refreshing}
        >
          <Fa.sync /> Refresh list
        </button>
        {readOnly ? null : (
          <button type="button" className="orca-btn orca-btn-primary jh-create-entity" onClick={() => navigate('/robot/new')}>
            <Fa.plus /> Create a new Robot
          </button>
        )}
      </PageHeading>
      <AlertArea />
      <div className="orca-card">
        <div className="orca-filterbar">
          <div className="orca-form-group" data-hint="orca.robots.filter.status">
            <div className="orca-label">Status</div>
            <div className="orca-btn-group" role="group" aria-label="Status filter" style={{ gap: 4, display: 'flex', flexWrap: 'wrap' }}>
              {STATUSES.map((s) => {
                const on = filters.status.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    className={`orca-btn orca-btn-sm orca-btn-outline${on ? ' orca-on' : ''}`}
                    style={{ ['--orca-c' as string]: STATUS_COLOR[s], borderRadius: 50 }}
                    aria-pressed={on}
                    data-hint={`orca.robots.filter.status:${s}`}
                    onClick={() => toggleStatus(s)}
                  >
                    {STATUS_LABEL[s]} ({counts[s]})
                  </button>
                );
              })}
            </div>
          </div>
          <div className="orca-form-group" data-hint="orca.robots.filter.deviceType">
            <label className="orca-label" htmlFor="orca-f-dt">
              Device type
            </label>
            <select id="orca-f-dt" className="orca-control" value={filters.deviceType ?? ''} onChange={(e) => commit({ ...filters, deviceType: e.target.value || null })}>
              <option value="">All device types</option>
              {DEVICE_TYPE_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="orca-form-group" data-hint="orca.robots.filter.rigKind">
            <label className="orca-label" htmlFor="orca-f-rk">
              Rig kind
            </label>
            <select id="orca-f-rk" className="orca-control" value={filters.rigKind ?? ''} onChange={(e) => commit({ ...filters, rigKind: e.target.value || null })}>
              <option value="">All rig kinds</option>
              {RIG_KINDS.map((k) => (
                <option key={k} value={k}>
                  {RIG_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="orca-form-group" data-hint="orca.robots.filter.environment">
            <label className="orca-label" htmlFor="orca-f-env">
              Environment
            </label>
            <select id="orca-f-env" className="orca-control" value={filters.environment ?? ''} onChange={(e) => commit({ ...filters, environment: e.target.value || null })}>
              <option value="">All environments</option>
              {ENVIRONMENTS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="orca-form-group" style={{ flex: '1 1 220px' }} data-hint="orca.robots.filter.name">
            <label className="orca-label" htmlFor="orca-f-name">
              Name
            </label>
            <input
              id="orca-f-name"
              ref={nameRef}
              className="orca-control"
              placeholder="Search name or human readable name…"
              value={nameText}
              onChange={(e) => setNameText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (nameText !== filters.name) commit({ ...filters, name: nameText }, true);
                }
              }}
            />
          </div>
          {anyFilter ? (
            <button
              type="button"
              className="orca-link"
              style={{ marginBottom: 6 }}
              onClick={() => {
                setNameText('');
                commit({ status: [], deviceType: null, rigKind: null, environment: null, name: '' });
              }}
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>
      {sorted.length === 0 ? (
        <div className="orca-alert orca-alert-warning">No Robots found</div>
      ) : (
        <div className="orca-table-wrap" style={{ opacity: refreshing ? 0.5 : 1 }}>
          <table className="orca-table orca-table-striped" aria-describedby="page-heading">
            <thead>
              <tr>
                {[
                  ['id', 'ID'],
                  ['name', 'Name'],
                  ['humanReadableName', 'Human Readable Name'],
                  ['status', 'Status'],
                  ['deviceType', 'Device Type'],
                  ['rigKind', 'Rig Kind'],
                  ['environment', 'Environment'],
                  ['location', 'Location'],
                  ['lastHealthCheck', 'Last Health Check'],
                ].map(([f, l]) => (
                  <SortTh key={f} field={f!} label={l!} sort={sort} onSort={(fl) => navigate(filterRoute(filters, page, nextSort(sort, fl)))} />
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const co = r.checkout;
                const manual = isManualCheckout(r);
                const jr = co && !manual ? jenkinsBuildRoute(co.buildId) : null;
                const usedBy = co ? (manual ? `manual (${login ?? 'admin'})` : `Jenkins #${co.buildId.split('#')[1] ?? co.buildId}`) : '';
                return (
                  <tr key={r.id} className={flash.has(r.id) ? 'orca-row-flash' : undefined} data-hint={`orca.robots.row:${r.name}`}>
                    <td>
                      <button type="button" className="orca-link" onClick={() => navigate(`/robot/${r.id}/view`)}>
                        {r.id}
                      </button>
                    </td>
                    <td>{r.name}</td>
                    <td>{r.humanReadableName}</td>
                    <td aria-label={co ? `${STATUS_LABEL[r.status]} · in use by ${usedBy}` : STATUS_LABEL[r.status]}>
                      <StatusChip status={r.status} />
                      {co ? (
                        <span className="orca-sub">
                          in use by{' '}
                          {jr ? (
                            <button type="button" className="orca-link" title={buildLabel(co.buildId)} onClick={() => wm?.openApp('jenkins', { route: jr })}>
                              {usedBy}
                            </button>
                          ) : (
                            usedBy
                          )}
                        </span>
                      ) : null}
                    </td>
                    <td>{devType(r) ?? '—'}</td>
                    <td>{r.rigKind}</td>
                    <td>{r.environment}</td>
                    <td>{r.location}</td>
                    <td>
                      <HealthCell r={r} />
                    </td>
                    <td>
                      <RowButtons
                        onView={() => navigate(`/robot/${r.id}/view`)}
                        onEdit={readOnly ? undefined : () => navigate(`/robot/${r.id}/edit`)}
                        onDelete={readOnly ? undefined : () => del.ask(r.id)}
                        hintEdit={`orca.robots.rowEdit:${r.name}`}
                        extra={
                          <StatusMenu
                            r={r}
                            disabled={readOnly}
                            onPick={(s) =>
                              status.run(r, s, (ok, error) => {
                                if (ok) addAlert('success', `A Robot is updated with identifier ${r.id}`, '/robot');
                                else if (error) addAlert('danger', error, '/robot');
                              })
                            }
                          />
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {sorted.length > 0 ? (
        <>
          <ItemCount page={page} total={sorted.length} />
          <Pagination page={page} total={sorted.length} onPage={(p) => navigate(filterRoute(filters, p, query.sort ?? 'id,asc'))} />
        </>
      ) : null}
      {del.modal}
      {status.modal}
    </div>
  );
}
