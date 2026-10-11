/**
 * Robots list with Nate's filter UI (Apps §2.4): status toggles, device type / rig kind / environment
 * selects, name search (250 ms debounce, replace navigation), sortable columns, pagination, live rows,
 * row actions incl. the `Status ▾` split button.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '@/core/store';
import { DEVICE_TYPE_CODES, type OrkaRobot, type RobotStatus } from '@/sim/types';
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
  useOrka,
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

function HealthCell(props: { r: OrkaRobot }) {
  const { r } = props;
  if (r.status === 'RESERVED') return <span className="orka-grey">Reserved — not overridden</span>;
  if (r.lastHealthCheckMs == null || r.status === 'OFFLINE') return <span>—</span>;
  if (r.lastHealthCheckOk) {
    const http = r.lastHealth?.http ?? 200;
    return <span className="orka-ok">{`${hhmmss(r.lastHealthCheckMs)} · ${http} OK`}</span>;
  }
  return (
    <span className="orka-fail" title={r.lastHealth?.error ?? ''}>
      {`${hhmmss(r.lastHealthCheckMs)} · FAIL`}
    </span>
  );
}

function StatusMenu(props: { r: OrkaRobot; onPick(s: RobotStatus): void; disabled: boolean }) {
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
    <div className="orka-btn-group" ref={ref}>
      <button type="button" className="orka-btn orka-btn-outline-secondary orka-btn-sm orka-caret" disabled={props.disabled} onClick={() => setOpen((o) => !o)} data-hint={`orka.robots.rowStatus:${props.r.name}`} aria-haspopup="menu" aria-expanded={open}>
        Status
      </button>
      {open ? (
        <div className="orka-menu" role="menu">
          {SETTABLE.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitemradio"
              aria-checked={props.r.status === s}
              className="orka-dropdown-item"
              onClick={() => {
                setOpen(false);
                props.onPick(s);
              }}
            >
              <span style={{ width: 14 }}>{props.r.status === s ? <Fa.check size={12} /> : null}</span>
              <span className="orka-badge orka-pill" style={{ background: STATUS_COLOR[s] }}>
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
  const { query, navigate, wm, readOnly, login, focused = true } = useOrka();
  const robots = useGame((s) => s.lab.orka.robots);
  const devices = useGame((s) => s.lab.orka.devices);
  const filters = useMemo(() => readFilters(query), [query]);
  const sort = parseSort(query.sort);
  const page = Number(query.page) || 1;
  const [nameText, setNameText] = useState(filters.name);
  const nameRef = useRef<HTMLInputElement>(null);
  const del = useDeleteFlow('robot', '/robot');
  const status = useStatusChange();
  const [refreshing, setRefreshing] = useState(false);

  const all = useMemo(() => Object.values(robots), [robots]);
  const devType = (r: OrkaRobot) => robotDeviceType({ orka: { devices } } as never, r);
  const counts = useMemo(() => {
    const c = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<RobotStatus, number>;
    for (const r of all) c[r.status]++;
    return c;
  }, [all]);

  const apply = (f: Filters, rows: OrkaRobot[]) =>
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
    emitAppAction('orka', 'orka.robots.filtered', {
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
          className="orka-btn orka-btn-info"
          onClick={() => {
            setRefreshing(true);
            setTimeout(() => setRefreshing(false), 300);
          }}
          disabled={refreshing}
        >
          <Fa.sync /> Refresh list
        </button>
        {readOnly ? null : (
          <button type="button" className="orka-btn orka-btn-primary jh-create-entity" onClick={() => navigate('/robot/new')}>
            <Fa.plus /> Create a new Robot
          </button>
        )}
      </PageHeading>
      <AlertArea />
      <div className="orka-card">
        <div className="orka-filterbar">
          <div className="orka-form-group" data-hint="orka.robots.filter.status">
            <div className="orka-label">Status</div>
            <div className="orka-btn-group" role="group" aria-label="Status filter" style={{ gap: 4, display: 'flex', flexWrap: 'wrap' }}>
              {STATUSES.map((s) => {
                const on = filters.status.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    className={`orka-btn orka-btn-sm orka-btn-outline${on ? ' orka-on' : ''}`}
                    style={{ ['--orka-c' as string]: STATUS_COLOR[s], borderRadius: 50 }}
                    aria-pressed={on}
                    data-hint={`orka.robots.filter.status:${s}`}
                    onClick={() => toggleStatus(s)}
                  >
                    {STATUS_LABEL[s]} ({counts[s]})
                  </button>
                );
              })}
            </div>
          </div>
          <div className="orka-form-group" data-hint="orka.robots.filter.deviceType">
            <label className="orka-label" htmlFor="orka-f-dt">
              Device type
            </label>
            <select id="orka-f-dt" className="orka-control" value={filters.deviceType ?? ''} onChange={(e) => commit({ ...filters, deviceType: e.target.value || null })}>
              <option value="">All device types</option>
              {DEVICE_TYPE_CODES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="orka-form-group" data-hint="orka.robots.filter.rigKind">
            <label className="orka-label" htmlFor="orka-f-rk">
              Rig kind
            </label>
            <select id="orka-f-rk" className="orka-control" value={filters.rigKind ?? ''} onChange={(e) => commit({ ...filters, rigKind: e.target.value || null })}>
              <option value="">All rig kinds</option>
              {RIG_KINDS.map((k) => (
                <option key={k} value={k}>
                  {RIG_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="orka-form-group" data-hint="orka.robots.filter.environment">
            <label className="orka-label" htmlFor="orka-f-env">
              Environment
            </label>
            <select id="orka-f-env" className="orka-control" value={filters.environment ?? ''} onChange={(e) => commit({ ...filters, environment: e.target.value || null })}>
              <option value="">All environments</option>
              {ENVIRONMENTS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <div className="orka-form-group" style={{ flex: '1 1 220px' }} data-hint="orka.robots.filter.name">
            <label className="orka-label" htmlFor="orka-f-name">
              Name
            </label>
            <input
              id="orka-f-name"
              ref={nameRef}
              className="orka-control"
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
              className="orka-link"
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
        <div className="orka-alert orka-alert-warning">No Robots found</div>
      ) : (
        <div className="orka-table-wrap" style={{ opacity: refreshing ? 0.5 : 1 }}>
          <table className="orka-table orka-table-striped" aria-describedby="page-heading">
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
                  <tr key={r.id} className={flash.has(r.id) ? 'orka-row-flash' : undefined} data-hint={`orka.robots.row:${r.name}`}>
                    <td>
                      <button type="button" className="orka-link" onClick={() => navigate(`/robot/${r.id}/view`)}>
                        {r.id}
                      </button>
                    </td>
                    <td>{r.name}</td>
                    <td>{r.humanReadableName}</td>
                    <td aria-label={co ? `${STATUS_LABEL[r.status]} · in use by ${usedBy}` : STATUS_LABEL[r.status]}>
                      <StatusChip status={r.status} />
                      {co ? (
                        <span className="orka-sub">
                          in use by{' '}
                          {jr ? (
                            <button type="button" className="orka-link" title={buildLabel(co.buildId)} onClick={() => wm?.openApp('jenkins', { route: jr })}>
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
                        hintEdit={`orka.robots.rowEdit:${r.name}`}
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
