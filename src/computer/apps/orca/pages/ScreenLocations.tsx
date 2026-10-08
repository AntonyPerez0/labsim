/**
 * Screen Location (Apps §2.9): filtered list, detail, and the X/Y (mm) form with the Gort sync banner.
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useGame } from '@/core/store';
import { sim } from '@/sim';
import { DEVICE_TYPE_CODES, type ScreenLocation } from '@/sim/types';
import { emitAppAction, fmtMm } from '../../../apps';
import { Fa } from '../icons';
import { AlertArea, BackEditButtons, Field, FormButtons, ItemCount, NotFound, PageHeading, Pagination, RowButtons, addAlert, paginate, simCall, useCtrlS, useOrca, validateNumber, validateText, withQuery } from '../shared';
import { useDeleteFlow } from './common';
import { SYNC_BANNER, lastModified } from './Screens';

export function ScreenLocationsPage() {
  const { query, navigate, readOnly } = useOrca();
  const screens = useGame((s) => s.lab.orca.screens);
  const locs = useGame((s) => s.lab.orca.screenLocations);
  const dt = query['deviceType.equals'] || null;
  const screenId = query['screenId.equals'] ? Number(query['screenId.equals']) : null;
  const button = query['button.contains'] ?? '';
  const page = Number(query.page) || 1;
  const del = useDeleteFlow('screenLocation', '/screen-location');
  const rows = useMemo(
    () =>
      Object.values(locs)
        .filter((l) => {
          const s = screens[l.screenId];
          if (dt && s?.deviceType !== dt) return false;
          if (screenId != null && l.screenId !== screenId) return false;
          if (button && !l.button.toLowerCase().includes(button.toLowerCase())) return false;
          return true;
        })
        .sort((a, b) => a.id - b.id),
    [locs, screens, dt, screenId, button],
  );
  const screenOpts = Object.values(screens).filter((s) => !dt || s.deviceType === dt);
  const go = (q: Record<string, string | number | null>, replace = false) =>
    navigate(withQuery('/screen-location', { 'deviceType.equals': dt, 'screenId.equals': screenId, 'button.contains': button || null, page: null, ...q }), { replace });
  const banner = screenId != null && screens[screenId] ? SYNC_BANNER(screens[screenId]!.deviceType, screens[screenId]!.name) : SYNC_BANNER('<DEVICE_TYPE>', '<SCREEN>');
  return (
    <div>
      <PageHeading title="Screen Locations">
        {readOnly ? null : (
          <button type="button" className="orca-btn orca-btn-primary jh-create-entity" onClick={() => navigate('/screen-location/new')}>
            <Fa.plus /> Create a new Screen Location
          </button>
        )}
      </PageHeading>
      <AlertArea />
      <div className="orca-alert orca-alert-info">{banner}</div>
      <div className="orca-card">
        <div className="orca-filterbar">
          <div className="orca-form-group">
            <label className="orca-label">Device type</label>
            <select className="orca-control" value={dt ?? ''} onChange={(e) => go({ 'deviceType.equals': e.target.value || null, 'screenId.equals': null })}>
              <option value="">All</option>
              {DEVICE_TYPE_CODES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="orca-form-group">
            <label className="orca-label">Screen</label>
            <select className="orca-control" value={screenId ?? ''} onChange={(e) => go({ 'screenId.equals': e.target.value || null })}>
              <option value="">All</option>
              {screenOpts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.deviceType}
                </option>
              ))}
            </select>
          </div>
          <div className="orca-form-group">
            <label className="orca-label">Button</label>
            <input className="orca-control" placeholder="contains…" defaultValue={button} onChange={(e) => go({ 'button.contains': e.target.value || null }, true)} />
          </div>
        </div>
      </div>
      <div className="orca-table-wrap">
        <table className="orca-table orca-table-striped">
          <thead>
            <tr>
              <th>ID</th>
              <th>Screen</th>
              <th>Device Type</th>
              <th>Button</th>
              <th>X (mm)</th>
              <th>Y (mm)</th>
              <th>Last modified</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {paginate(rows, page).map((l) => {
              const s = screens[l.screenId];
              return (
                <tr key={l.id}>
                  <td>
                    <button type="button" className="orca-link" onClick={() => navigate(`/screen-location/${l.id}/view`)}>
                      {l.id}
                    </button>
                  </td>
                  <td>
                    {s ? (
                      <button type="button" className="orca-link orca-mono" onClick={() => navigate(`/screen/${s.id}/view`)}>
                        {s.name}
                      </button>
                    ) : (
                      l.screenId
                    )}
                  </td>
                  <td>{s?.deviceType ?? ''}</td>
                  <td className="orca-mono">{l.button}</td>
                  <td>{fmtMm(l.xMm)}</td>
                  <td>{fmtMm(l.yMm)}</td>
                  <td className="orca-small">{lastModified(l.id)}</td>
                  <td>
                    <RowButtons onView={() => navigate(`/screen-location/${l.id}/view`)} onEdit={readOnly ? undefined : () => navigate(`/screen-location/${l.id}/edit`)} onDelete={readOnly ? undefined : () => del.ask(l.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ItemCount page={page} total={rows.length} />
      <Pagination page={page} total={rows.length} onPage={(p) => go({ page: p })} />
      {del.modal}
    </div>
  );
}

export function ScreenLocationDetailPage(props: { id: number }) {
  const { navigate, readOnly } = useOrca();
  const l = useGame((s) => s.lab.orca.screenLocations[props.id]);
  const screen = useGame((s) => (l ? s.lab.orca.screens[l.screenId] : undefined));
  if (!l) return <NotFound what={`Screen Location ${props.id}`} />;
  return (
    <div>
      <h2>Screen Location</h2>
      <hr />
      <dl className="orca-dl">
        <dt>ID</dt>
        <dd>{l.id}</dd>
        <dt>Screen</dt>
        <dd className="orca-mono">{screen ? `${screen.name} · ${screen.deviceType}` : l.screenId}</dd>
        <dt>Button</dt>
        <dd className="orca-mono">{l.button}</dd>
        <dt>X (mm)</dt>
        <dd>{fmtMm(l.xMm)}</dd>
        <dt>Y (mm)</dt>
        <dd>{fmtMm(l.yMm)}</dd>
        <dt>Last modified</dt>
        <dd>{lastModified(l.id)}</dd>
      </dl>
      <BackEditButtons onBack={() => navigate(screen ? `/screen/${screen.id}/view` : '/screen-location')} onEdit={readOnly ? undefined : () => navigate(`/screen-location/${l.id}/edit`)} />
    </div>
  );
}

export function ScreenLocationFormPage(props: { id: number | null }) {
  const { navigate, readOnly } = useOrca();
  const l = useGame((s) => (props.id != null ? s.lab.orca.screenLocations[props.id] : null)) ?? null;
  const screens = useGame((s) => s.lab.orca.screens);
  const [f, setF] = useState({ screenId: l ? String(l.screenId) : '', button: l?.button ?? '', x: l ? fmtMm(l.xMm) : '', y: l ? fmtMm(l.yMm) : '' });
  const path = props.id != null ? `/screen-location/${props.id}/edit` : '/screen-location/new';
  const errors = {
    screenId: f.screenId ? null : 'This field is required.',
    button: validateText(f.button, 'Button', { required: true }),
    x: validateNumber(f.x, { required: true, min: 0, max: 400 }),
    y: validateNumber(f.y, { required: true, min: 0, max: 400 }),
  };
  const invalid = Object.values(errors).some(Boolean);
  if (props.id != null && !l) return <NotFound what={`Screen Location ${props.id}`} />;
  const screen = f.screenId ? screens[Number(f.screenId)] : undefined;
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (invalid || readOnly) return;
    const row: Partial<ScreenLocation> = { screenId: Number(f.screenId), button: f.button, xMm: Math.round(Number(f.x) * 10) / 10, yMm: Math.round(Number(f.y) * 10) / 10 };
    const r = simCall(() => sim.orca.saveScreenLocation(l ? { id: l.id, ...row } : row, 'player'));
    if (!r.ok) {
      addAlert('danger', r.error, path);
      return;
    }
    emitAppAction('orca', 'orca.screenLocation.saved', { locationId: r.value, screenId: row.screenId!, screen: screen?.name ?? '', deviceType: screen?.deviceType ?? '', button: row.button!, xMm: row.xMm!, yMm: row.yMm!, created: !l });
    const target = screen ? `/screen/${screen.id}/view` : '/screen-location';
    addAlert('success', l ? `A Screen Location is updated with identifier ${r.value}` : `A new Screen Location is created with identifier ${r.value}`, target);
    navigate(target);
  };
  useCtrlS(() => save(), !readOnly);
  return (
    <form onSubmit={save} noValidate>
      <h2>Create or edit a Screen Location</h2>
      <AlertArea />
      <div className="orca-alert orca-alert-info">{SYNC_BANNER(screen?.deviceType ?? '<DEVICE_TYPE>', screen?.name ?? '<SCREEN>')}</div>
      <div className="orca-card">
        {l ? (
          <Field label="ID">
            <input className="orca-control" readOnly value={l.id} />
          </Field>
        ) : null}
        <Field label="Screen" error={errors.screenId && f.screenId !== '' ? errors.screenId : null}>
          <select className="orca-control" value={f.screenId} disabled={readOnly} onChange={(e) => setF({ ...f, screenId: e.target.value })}>
            <option value="" />
            {Object.values(screens).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} · {s.deviceType}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Button" help={'Exact text passed to xy_touch, e.g. "No Receipt"'} error={f.button ? errors.button : null} text={'Exact text passed to xy_touch, e.g. "No Receipt"'}>
          <input className="orca-control orca-mono" value={f.button} disabled={readOnly} onChange={(e) => setF({ ...f, button: e.target.value })} />
        </Field>
        <div className="orca-grid2">
          <Field label="X (mm)" error={f.x ? errors.x : null}>
            <input className="orca-control" type="number" step="0.1" value={f.x} disabled={readOnly} onChange={(e) => setF({ ...f, x: e.target.value })} />
          </Field>
          <Field label="Y (mm)" error={f.y ? errors.y : null}>
            <input className="orca-control" type="number" step="0.1" value={f.y} disabled={readOnly} onChange={(e) => setF({ ...f, y: e.target.value })} />
          </Field>
        </div>
      </div>
      <FormButtons onCancel={() => navigate(l ? `/screen-location/${l.id}/view` : '/screen-location')} invalid={invalid} readOnly={readOnly} />
    </form>
  );
}
