/**
 * Screens (Apps §2.9): filtered list, detail with its Screen Locations (to-scale outline, inline add,
 * `◎ Test tap` popover → `sim.orka.xyTouch`), and the Screen form.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { getState, useGame } from '@/core/store';
import { sim } from '@/sim';
import { DEVICE_TYPE_CODES, type DeviceTypeCode, type OrkaScreen, type ScreenLocation } from '@/sim/types';
import { emitAppAction, fmtMm } from '../../../apps';
import { UI_DEVICE_TYPES, screenMm } from '../../../shell/deviceTypes';
import { Fa } from '../icons';
import { AlertArea, BackEditButtons, Field, FormButtons, NotFound, PageHeading, RowButtons, STATUS_LABEL, addAlert, simCall, useCtrlS, useOnce, useOrka, validateNumber, validateText, withQuery } from '../shared';
import { useDeleteFlow } from './common';

/* ─────────────────────────────── helpers ─────────────────────────────── */

/** `bulk-import · yesterday 16:02`, `jaden · 2026-10-02 11:20`, `—` from the Orka audit trail. */
export function lastModified(locId: number): string {
  const lab = getState().lab;
  const e = lab.orka.audit.find((a) => /screen.?location/i.test(a.entity) && Number(a.entityId) === locId);
  if (!e) return '—';
  const DAY = 86_400_000;
  const dayOf = (ms: number) => Math.floor(ms / DAY);
  const d = dayOf(lab.time.nowMs) - dayOf(e.atMs);
  const t = new Date(Date.UTC(2026, 9, 5) + e.atMs);
  const hm = `${String(t.getUTCHours()).padStart(2, '0')}:${String(t.getUTCMinutes()).padStart(2, '0')}`;
  const when = d === 0 ? `today ${hm}` : d === 1 ? `yesterday ${hm}` : `${t.toISOString().slice(0, 10)} ${hm}`;
  return `${e.who} · ${when}`;
}

export const SYNC_BANNER = (deviceType: string, screen: string) =>
  `Screen Locations are synced from gorth config/screen-locations/${deviceType}/${screen}.json on merge. Direct edits here are not written back to Gorth.`;

function optionsCell(s: OrkaScreen) {
  if (s.optionCount == null) return '—';
  if (s.optionCount === 5)
    return (
      <>
        5 <span className="orka-badge orka-bg-info">QR</span>
      </>
    );
  return String(s.optionCount);
}

/* ─────────────────────────────── list ─────────────────────────────── */

export function ScreensPage() {
  const { query, navigate, readOnly } = useOrka();
  const screens = useGame((s) => s.lab.orka.screens);
  const locs = useGame((s) => s.lab.orka.screenLocations);
  const dt = query['deviceType.equals'] || null;
  const display = query['display.equals'] || null;
  const name = query['name.contains'] ?? '';
  const [nameText, setNameText] = useState(name);
  const del = useDeleteFlow('screen', '/screen');
  const counts = useMemo(() => {
    const c = new Map<number, number>();
    for (const l of Object.values(locs)) c.set(l.screenId, (c.get(l.screenId) ?? 0) + 1);
    return c;
  }, [locs]);
  const apply = (f: { dt: string | null; display: string | null; name: string }) =>
    Object.values(screens).filter((s) => (!f.dt || s.deviceType === f.dt) && (!f.display || s.display === f.display) && (!f.name || s.name.toLowerCase().includes(f.name.toLowerCase())));
  const rows = useMemo(() => apply({ dt, display, name }).sort((a, b) => a.id - b.id), [screens, dt, display, name]); // eslint-disable-line react-hooks/exhaustive-deps
  const commit = (f: { dt: string | null; display: string | null; name: string }, replace = false) => {
    navigate(withQuery('/screen', { 'deviceType.equals': f.dt, 'name.contains': f.name || null, 'display.equals': f.display }), { replace });
    emitAppAction('orka', 'orka.screens.filtered', { deviceType: f.dt, name: f.name, display: f.display, resultCount: apply(f).length });
  };
  useEffect(() => {
    if (nameText === name) return;
    const t = setTimeout(() => commit({ dt, display, name: nameText }, true), 250);
    return () => clearTimeout(t);
  }, [nameText]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <PageHeading title="Screens">
        {readOnly ? null : (
          <button type="button" className="orka-btn orka-btn-primary jh-create-entity" onClick={() => navigate('/screen/new')}>
            <Fa.plus /> Create a new Screen
          </button>
        )}
      </PageHeading>
      <AlertArea />
      <div className="orka-card">
        <div className="orka-filterbar">
          <div className="orka-form-group" data-hint="orka.screens.filter.deviceType">
            <label className="orka-label">Device type</label>
            <select className="orka-control" value={dt ?? ''} onChange={(e) => commit({ dt: e.target.value || null, display, name })}>
              <option value="">All</option>
              {DEVICE_TYPE_CODES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="orka-form-group" style={{ flex: '1 1 200px' }}>
            <label className="orka-label">Name</label>
            <input className="orka-control" placeholder="contains…" value={nameText} onChange={(e) => setNameText(e.target.value)} />
          </div>
          <div className="orka-form-group">
            <label className="orka-label">Display</label>
            <select className="orka-control" value={display ?? ''} onChange={(e) => commit({ dt, display: e.target.value || null, name })}>
              <option value="">All</option>
              <option value="primary">primary</option>
              <option value="secondary">secondary</option>
            </select>
          </div>
        </div>
      </div>
      <div className="orka-table-wrap">
        <table className="orka-table orka-table-striped">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Device Type</th>
              <th>Testing Profile</th>
              <th>Display</th>
              <th>Options</th>
              <th>Description</th>
              <th>Locations</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} data-hint={`orka.screens.row:${s.name}`}>
                <td>
                  <button type="button" className="orka-link" onClick={() => navigate(`/screen/${s.id}/view`)}>
                    {s.id}
                  </button>
                </td>
                <td className="orka-mono">{s.name}</td>
                <td>{s.deviceType}</td>
                <td>{s.testingProfile}</td>
                <td>{s.display}</td>
                <td>{optionsCell(s)}</td>
                <td>{s.description}</td>
                <td>{counts.get(s.id) ?? 0}</td>
                <td>
                  <RowButtons onView={() => navigate(`/screen/${s.id}/view`)} onEdit={readOnly ? undefined : () => navigate(`/screen/${s.id}/edit`)} onDelete={readOnly ? undefined : () => del.ask(s.id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 ? <div className="orka-alert orka-alert-warning">No Screens found</div> : null}
      {del.modal}
    </div>
  );
}

/* ─────────────────────────────── outline ─────────────────────────────── */

function ScreenOutline(props: { deviceType: DeviceTypeCode; display: 'primary' | 'secondary'; locs: ScreenLocation[] }) {
  const mm = screenMm(props.deviceType, props.display);
  const k = Math.min(3, 340 / Math.max(mm.w, mm.h));
  const pad = 28;
  const W = mm.w * k + pad + 12;
  const H = mm.h * k + pad + 12;
  const ticksX = Array.from({ length: Math.floor(mm.w / 10) + 1 }, (_, i) => i * 10);
  const ticksY = Array.from({ length: Math.floor(mm.h / 10) + 1 }, (_, i) => i * 10);
  return (
    <svg className="orka-outline" width={W} height={H} role="img" aria-label={`${props.deviceType} screen ${fmtMm(mm.w)} × ${fmtMm(mm.h)} mm`}>
      <g transform={`translate(${pad},${pad})`}>
        <rect x={0} y={0} width={mm.w * k} height={mm.h * k} fill="#f8f9fa" stroke="#343a40" strokeWidth={1.5} />
        {ticksX.map((t) => (
          <g key={`x${t}`}>
            <line x1={t * k} x2={t * k} y1={-4} y2={0} stroke="#6c757d" />
            {t % 20 === 0 ? (
              <text x={t * k} y={-7} fontSize={9} textAnchor="middle" fill="#6c757d">
                {t}
              </text>
            ) : null}
          </g>
        ))}
        {ticksY.map((t) => (
          <g key={`y${t}`}>
            <line y1={t * k} y2={t * k} x1={-4} x2={0} stroke="#6c757d" />
            {t % 20 === 0 ? (
              <text y={t * k + 3} x={-7} fontSize={9} textAnchor="end" fill="#6c757d">
                {t}
              </text>
            ) : null}
          </g>
        ))}
        <text x={2} y={11} fontSize={9} fill="#dc3545">
          (0,0)
        </text>
        {props.locs.map((l) => (
          <g key={l.id}>
            <circle cx={l.xMm * k} cy={l.yMm * k} r={3.5} fill="#0d6efd" />
            {/* Labels of right-half buttons sit left of the dot so they stay inside the outline. */}
            <text
              x={l.xMm > mm.w / 2 ? l.xMm * k - 5 : l.xMm * k + 5}
              y={l.yMm * k - 4}
              fontSize={9.5}
              fill="#212529"
              textAnchor={l.xMm > mm.w / 2 ? 'end' : 'start'}
            >
              {l.button}
            </text>
          </g>
        ))}
      </g>
    </svg>
  );
}

/* ─────────────────────────────── test tap ─────────────────────────────── */

function TestTap(props: { screen: OrkaScreen; loc: ScreenLocation }) {
  const { screen, loc } = props;
  const [open, setOpen] = useState(false);
  const [resp, setResp] = useState<{ ok: boolean; text: string } | null>(null);
  const robots = useGame((s) => s.lab.orka.robots);
  const devices = useGame((s) => s.lab.orka.devices);
  const candidates = useMemo(
    () =>
      Object.values(robots)
        .filter((r) => [r.deviceId, r.mfdDeviceId, r.cfdDeviceId].some((id) => id != null && devices[id]?.deviceType === screen.deviceType))
        .sort((a, b) => (a.status === 'AVAILABLE' ? 0 : 1) - (b.status === 'AVAILABLE' ? 0 : 1) || a.id - b.id),
    [robots, devices, screen.deviceType],
  );
  const [robot, setRobot] = useState(candidates[0]?.name ?? '');
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
  const tap = () => {
    if (!robot) return;
    const r = simCall(() => sim.orka.xyTouch(robot, screen.name, loc.button, 'player'));
    const text = r.ok ? `${r.value.status ?? 200} ${r.value.body ?? `{"result":"OK","x_mm":${fmtMm(r.value.xMm)},"y_mm":${fmtMm(r.value.yMm)}}`}` : r.error;
    setResp({ ok: r.ok, text });
    emitAppAction('orka', 'orka.screenLocation.testTap', { robotName: robot, screen: screen.name, button: loc.button, ok: r.ok, response: text });
  };
  return (
    <div className="orka-btn-group" ref={ref}>
      <button type="button" className="orka-btn orka-btn-sm orka-btn-outline-secondary" onClick={() => setOpen((o) => !o)} data-hint={`orka.screenLocation.testTap:${loc.button}`}>
        <Fa.bullseye size={12} /> Test tap
      </button>
      {open ? (
        <div className="orka-popover" role="dialog" aria-label="Test tap">
          <div className="orka-popover-title">
            Test tap · <span className="orka-mono">{loc.button}</span>
          </div>
          <Field label="Robot">
            <select className="orka-control" value={robot} onChange={(e) => setRobot(e.target.value)}>
              {candidates.map((r) => (
                <option key={r.id} value={r.name}>
                  {r.name} · {STATUS_LABEL[r.status]}
                </option>
              ))}
            </select>
          </Field>
          <button type="button" className="orka-btn orka-btn-primary orka-btn-sm" onClick={tap} disabled={!robot}>
            Tap
          </button>
          {resp ? (
            <div className={`orka-alert ${resp.ok ? 'orka-alert-success' : 'orka-alert-danger'} orka-mono`} style={{ marginTop: 10, marginBottom: 6, paddingRight: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {resp.text}
            </div>
          ) : null}
          <small className="orka-form-text">Watch the robot or its camera to confirm the hit.</small>
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────── detail ─────────────────────────────── */

export function ScreenDetailPage(props: { id: number }) {
  const { navigate, readOnly } = useOrka();
  const screen = useGame((s) => s.lab.orka.screens[props.id]);
  const allLocs = useGame((s) => s.lab.orka.screenLocations);
  const locs = useMemo(() => Object.values(allLocs).filter((l) => l.screenId === props.id).sort((a, b) => a.id - b.id), [allLocs, props.id]);
  const path = `/screen/${props.id}/view`;
  const del = useDeleteFlow('screenLocation', path);
  const [adding, setAdding] = useState(false);
  const [nl, setNl] = useState({ button: '', x: '', y: '' });
  useOnce(screen ? String(screen.id) : null, () => emitAppAction('orka', 'orka.screen.viewed', { screenId: screen!.id, name: screen!.name, deviceType: screen!.deviceType }));
  useOnce(screen ? `locs:${screen.id}` : null, () =>
    emitAppAction('orka', 'orka.screenLocations.viewed', { screenId: screen!.id, screen: screen!.name, deviceType: screen!.deviceType, count: locs.length }),
  );
  if (!screen) return <NotFound what={`Screen ${props.id}`} />;

  const addErr = {
    button: nl.button.trim() ? null : 'This field is required.',
    x: validateNumber(nl.x, { required: true, min: 0, max: 400 }),
    y: validateNumber(nl.y, { required: true, min: 0, max: 400 }),
  };
  const saveNew = () => {
    if (Object.values(addErr).some(Boolean)) return;
    const row = { screenId: screen.id, button: nl.button, xMm: Math.round(Number(nl.x) * 10) / 10, yMm: Math.round(Number(nl.y) * 10) / 10 };
    const r = simCall(() => sim.orka.saveScreenLocation(row, 'player'));
    if (!r.ok) {
      addAlert('danger', r.error, path);
      return;
    }
    addAlert('success', `A new Screen Location is created with identifier ${r.value}`, path);
    emitAppAction('orka', 'orka.screenLocation.saved', { locationId: r.value, screenId: screen.id, screen: screen.name, deviceType: screen.deviceType, button: row.button, xMm: row.xMm, yMm: row.yMm, created: true });
    setNl({ button: '', x: '', y: '' });
    setAdding(false);
  };

  return (
    <div>
      <h2>Screen</h2>
      <hr />
      <AlertArea />
      <dl className="orka-dl">
        <dt>Name</dt>
        <dd className="orka-mono">{screen.name}</dd>
        <dt>Device Type</dt>
        <dd>{screen.deviceType}</dd>
        <dt>Testing Profile</dt>
        <dd>{screen.testingProfile}</dd>
        <dt>Display</dt>
        <dd>{screen.display}</dd>
        <dt>Options</dt>
        <dd>{optionsCell(screen)}</dd>
        <dt>Description</dt>
        <dd>{screen.description}</dd>
      </dl>
      <BackEditButtons onBack={() => navigate(withQuery('/screen', { 'deviceType.equals': screen.deviceType }))} onEdit={readOnly ? undefined : () => navigate(`/screen/${screen.id}/edit`)} />
      <h4 style={{ marginTop: 20 }}>Screen Locations</h4>
      <div className="orka-alert orka-alert-info">{SYNC_BANNER(screen.deviceType, screen.name)}</div>
      <div className="orka-row" style={{ alignItems: 'flex-start' }}>
        <div className="orka-col" style={{ minWidth: 420 }} data-hint="orka.screen.locations">
          <div className="orka-table-wrap">
            <table className="orka-table orka-table-striped">
              <thead>
                <tr>
                  <th>Button</th>
                  <th>X (mm)</th>
                  <th>Y (mm)</th>
                  <th>Last modified</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {locs.map((l) => (
                  <tr key={l.id}>
                    <td className="orka-mono">{l.button}</td>
                    <td>{fmtMm(l.xMm)}</td>
                    <td>{fmtMm(l.yMm)}</td>
                    <td className="orka-small">{lastModified(l.id)}</td>
                    <td>
                      <div className="orka-actions">
                        {readOnly ? null : (
                          <div className="orka-btn-group">
                            <button type="button" className="orka-btn orka-btn-primary orka-btn-sm" onClick={() => navigate(`/screen-location/${l.id}/edit`)}>
                              <Fa.pencil size={12} /> Edit
                            </button>
                            <button type="button" className="orka-btn orka-btn-danger orka-btn-sm" onClick={() => del.ask(l.id)}>
                              <Fa.times size={12} /> Delete
                            </button>
                          </div>
                        )}
                        <TestTap screen={screen} loc={l} />
                      </div>
                    </td>
                  </tr>
                ))}
                {locs.length === 0 && !adding ? (
                  <tr>
                    <td colSpan={5} className="orka-muted">
                      No locations (this screen has no tappable buttons).
                    </td>
                  </tr>
                ) : null}
                {adding ? (
                  <tr>
                    <td>
                      <input className={`orka-control orka-mono${nl.button && addErr.button ? ' orka-invalid' : ''}`} placeholder="Button text" value={nl.button} onChange={(e) => setNl({ ...nl, button: e.target.value })} autoFocus />
                    </td>
                    <td>
                      <input className={`orka-control${nl.x && addErr.x ? ' orka-invalid' : ''}`} type="number" step="0.1" value={nl.x} onChange={(e) => setNl({ ...nl, x: e.target.value })} style={{ width: 90 }} />
                    </td>
                    <td>
                      <input className={`orka-control${nl.y && addErr.y ? ' orka-invalid' : ''}`} type="number" step="0.1" value={nl.y} onChange={(e) => setNl({ ...nl, y: e.target.value })} style={{ width: 90 }} />
                    </td>
                    <td />
                    <td>
                      <div className="orka-actions">
                        <button type="button" className="orka-btn orka-btn-primary orka-btn-sm" disabled={Object.values(addErr).some(Boolean)} onClick={saveNew}>
                          <Fa.save size={12} /> Save
                        </button>
                        <button type="button" className="orka-btn orka-btn-secondary orka-btn-sm" onClick={() => setAdding(false)}>
                          <Fa.ban size={12} /> Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {readOnly || adding ? null : (
            <button type="button" className="orka-btn orka-btn-primary orka-btn-sm" onClick={() => setAdding(true)} data-hint="orka.screen.addLocation">
              <Fa.plus size={12} /> Add location
            </button>
          )}
        </div>
        <div>
          <ScreenOutline deviceType={screen.deviceType} display={screen.display} locs={locs} />
          <div className="orka-small orka-muted" style={{ maxWidth: 360 }}>
            {UI_DEVICE_TYPES[screen.deviceType]?.displayName} · {screen.display} display · points only (Orka stores tap points, not button sizes)
          </div>
        </div>
      </div>
      {del.modal}
    </div>
  );
}

/* ─────────────────────────────── form ─────────────────────────────── */

export function ScreenFormPage(props: { id: number | null }) {
  const { navigate, readOnly } = useOrka();
  const s = useGame((st) => (props.id != null ? st.lab.orka.screens[props.id] : null)) ?? null;
  const [f, setF] = useState({ name: s?.name ?? '', deviceType: (s?.deviceType ?? '') as DeviceTypeCode | '', display: s?.display ?? 'primary', optionCount: s?.optionCount == null ? '' : String(s.optionCount), description: s?.description ?? '' });
  const path = props.id != null ? `/screen/${props.id}/edit` : '/screen/new';
  const errors = { name: validateText(f.name, 'Name', { required: true, pattern: /^[A-Z0-9_]+$/ }), deviceType: f.deviceType ? null : 'This field is required.' };
  const invalid = Object.values(errors).some(Boolean);
  if (props.id != null && !s) return <NotFound what={`Screen ${props.id}`} />;
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (invalid || readOnly) return;
    const dt = f.deviceType as DeviceTypeCode;
    const row: Partial<OrkaScreen> = { name: f.name, deviceType: dt, testingProfile: UI_DEVICE_TYPES[dt].profile, display: f.display as 'primary' | 'secondary', optionCount: f.optionCount ? Number(f.optionCount) : null, description: f.description };
    const r = simCall(() => sim.orka.saveScreen(s ? { id: s.id, ...row } : row, 'player'));
    if (!r.ok) {
      addAlert('danger', r.error, path);
      return;
    }
    emitAppAction('orka', 'orka.screen.saved', { screenId: r.value, name: f.name, deviceType: dt, created: !s });
    addAlert('success', s ? `A Screen is updated with identifier ${r.value}` : `A new Screen is created with identifier ${r.value}`, `/screen/${r.value}/view`);
    navigate(`/screen/${r.value}/view`);
  };
  useCtrlS(() => save(), !readOnly);
  return (
    <form onSubmit={save} noValidate>
      <h2>Create or edit a Screen</h2>
      <AlertArea />
      <div className="orka-card">
        <Field label="Name" error={f.name ? errors.name : null}>
          <input className="orka-control orka-mono" value={f.name} disabled={readOnly} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Device Type">
          <select className="orka-control" value={f.deviceType} disabled={readOnly} onChange={(e) => setF({ ...f, deviceType: e.target.value as DeviceTypeCode })}>
            <option value="" />
            {DEVICE_TYPE_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Display">
          <select className="orka-control" value={f.display} disabled={readOnly} onChange={(e) => setF({ ...f, display: e.target.value as 'primary' | 'secondary' })}>
            <option>primary</option>
            <option>secondary</option>
          </select>
        </Field>
        <Field label="Option Count">
          <select className="orka-control" value={f.optionCount} disabled={readOnly} onChange={(e) => setF({ ...f, optionCount: e.target.value })}>
            <option value="">(none)</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </Field>
        <Field label="Description">
          <input className="orka-control" value={f.description} disabled={readOnly} onChange={(e) => setF({ ...f, description: e.target.value })} />
        </Field>
      </div>
      <FormButtons onCancel={() => navigate(s ? `/screen/${s.id}/view` : '/screen')} invalid={invalid} readOnly={readOnly} />
    </form>
  );
}
