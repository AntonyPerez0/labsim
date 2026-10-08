/**
 * Device entity (Apps §2.6): list with `Show retired`, detail, create/edit form with enum metrics line and
 * the linked-device warning (hardware swaps get a new Device row).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { useGame } from '@/core/store';
import { sim } from '@/sim';
import { DEVICE_TYPE_CODES, type DeviceTypeCode, type OrcaDevice, type OrcaRobot } from '@/sim/types';
import { emitAppAction } from '../../../apps';
import { deviceTypeInfoLine } from '../../../shell/deviceTypes';
import { Fa } from '../icons';
import {
  AlertArea,
  BackEditButtons,
  Field,
  FormButtons,
  ItemCount,
  NotFound,
  PageHeading,
  Pagination,
  RowButtons,
  SortTh,
  addAlert,
  nextSort,
  paginate,
  parseSort,
  simCall,
  sortRows,
  useCtrlS,
  useOrca,
  validateText,
  withQuery,
} from '../shared';
import { useDeleteFlow } from './common';

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SERIAL_RE = /^[A-Z0-9-]+$/;
const IP_RE = /^((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)$/;

function usedBy(robots: Record<number, OrcaRobot>, deviceId: number): OrcaRobot[] {
  return Object.values(robots).filter((r) => r.deviceId === deviceId || r.mfdDeviceId === deviceId || r.cfdDeviceId === deviceId);
}

export function DevicesPage() {
  const { query, navigate, readOnly } = useOrca();
  const devices = useGame((s) => s.lab.orca.devices);
  const robots = useGame((s) => s.lab.orca.robots);
  const showRetired = query['retired'] === 'true';
  const sort = parseSort(query.sort);
  const page = Number(query.page) || 1;
  const del = useDeleteFlow('device', '/device');
  const rows = useMemo(() => sortRows(Object.values(devices).filter((d) => showRetired || !d.retired), sort.field, sort.dir, (d, f) => (d as unknown as Record<string, unknown>)[f]), [devices, showRetired, sort.field, sort.dir]);
  const route = (p: number, s: string, retired = showRetired) => withQuery('/device', { retired: retired ? 'true' : null, page: p, sort: s });
  return (
    <div>
      <PageHeading title="Devices">
        <button type="button" className="orca-btn orca-btn-info" onClick={() => navigate(route(page, query.sort ?? 'id,asc'), { replace: true })}>
          <Fa.sync /> Refresh list
        </button>
        {readOnly ? null : (
          <button type="button" className="orca-btn orca-btn-primary jh-create-entity" onClick={() => navigate('/device/new')} data-hint="orca.devices.create">
            <Fa.plus /> Create a new Device
          </button>
        )}
      </PageHeading>
      <AlertArea />
      <label className="orca-check" style={{ marginBottom: 10 }}>
        <input type="checkbox" checked={showRetired} onChange={(e) => navigate(route(1, query.sort ?? 'id,asc', e.target.checked), { replace: true })} />
        Show retired
      </label>
      <div className="orca-table-wrap">
        <table className="orca-table orca-table-striped">
          <thead>
            <tr>
              {[
                ['id', 'ID'],
                ['name', 'Name'],
                ['deviceType', 'Device Type'],
                ['serial', 'Serial'],
                ['ip', 'IP'],
                ['label', 'Label'],
                ['retired', 'Retired'],
              ].map(([f, l]) => (
                <SortTh key={f} field={f!} label={l!} sort={sort} onSort={(fl) => navigate(route(page, nextSort(sort, fl)))} />
              ))}
              <th>Used by</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {paginate(rows, page).map((d) => {
              const users = usedBy(robots, d.id);
              return (
                <tr key={d.id}>
                  <td>
                    <button type="button" className="orca-link" onClick={() => navigate(`/device/${d.id}/view`)}>
                      {d.id}
                    </button>
                  </td>
                  <td>{d.name}</td>
                  <td>{d.deviceType}</td>
                  <td className="orca-mono">{d.serial}</td>
                  <td className="orca-mono">{d.ip}</td>
                  <td>{d.label}</td>
                  <td>{d.retired ? '✓' : ''}</td>
                  <td>
                    {users.length
                      ? users.map((r, i) => (
                          <span key={r.id}>
                            {i > 0 ? ', ' : ''}
                            <button type="button" className="orca-link" onClick={() => navigate(`/robot/${r.id}/view`)}>
                              {r.name}
                            </button>
                          </span>
                        ))
                      : '—'}
                  </td>
                  <td>
                    <RowButtons onView={() => navigate(`/device/${d.id}/view`)} onEdit={readOnly ? undefined : () => navigate(`/device/${d.id}/edit`)} onDelete={readOnly ? undefined : () => del.ask(d.id)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ItemCount page={page} total={rows.length} />
      <Pagination page={page} total={rows.length} onPage={(p) => navigate(route(p, query.sort ?? 'id,asc'))} />
      {del.modal}
    </div>
  );
}

export function DeviceDetailPage(props: { id: number }) {
  const { navigate, readOnly } = useOrca();
  const d = useGame((s) => s.lab.orca.devices[props.id]);
  const robots = useGame((s) => s.lab.orca.robots);
  if (!d) return <NotFound what={`Device ${props.id}`} />;
  const users = usedBy(robots, d.id);
  return (
    <div>
      <h2>Device</h2>
      <hr />
      <AlertArea />
      <dl className="orca-dl">
        <dt>ID</dt>
        <dd>{d.id}</dd>
        <dt>Name</dt>
        <dd>{d.name}</dd>
        <dt>Device Type</dt>
        <dd>
          {d.deviceType} <small className="orca-muted">{deviceTypeInfoLine(d.deviceType)}</small>
        </dd>
        <dt>Serial</dt>
        <dd className="orca-mono">{d.serial}</dd>
        <dt>IP</dt>
        <dd className="orca-mono">{d.ip}</dd>
        <dt>Label</dt>
        <dd>{d.label}</dd>
        <dt>Retired</dt>
        <dd>{d.retired ? 'true' : 'false'}</dd>
        <dt>Used by</dt>
        <dd>{users.length ? users.map((r) => r.name).join(', ') : '—'}</dd>
      </dl>
      <BackEditButtons onBack={() => navigate('/device')} onEdit={readOnly ? undefined : () => navigate(`/device/${d.id}/edit`)} />
    </div>
  );
}

export function DeviceFormPage(props: { id: number | null }) {
  const { navigate, readOnly } = useOrca();
  const existing = useGame((s) => (props.id != null ? s.lab.orca.devices[props.id] : null)) ?? null;
  const robots = useGame((s) => s.lab.orca.robots);
  const [f, setF] = useState({
    name: existing?.name ?? '',
    deviceType: (existing?.deviceType ?? '') as DeviceTypeCode | '',
    serial: existing?.serial ?? '',
    ip: existing?.ip ?? '',
    label: existing?.label ?? '',
    retired: existing?.retired ?? false,
  });
  const [touched, setTouched] = useState(false);
  const path = props.id != null ? `/device/${props.id}/edit` : '/device/new';
  const errors = {
    name: validateText(f.name, 'Name', { required: true, pattern: NAME_RE, max: 50 }),
    deviceType: f.deviceType ? null : 'This field is required.',
    serial: validateText(f.serial, 'Serial', { required: true, pattern: SERIAL_RE }),
    ip: validateText(f.ip, 'IP', { required: true, pattern: IP_RE }),
  };
  const invalid = Object.values(errors).some(Boolean);
  if (props.id != null && !existing) return <NotFound what={`Device ${props.id}`} />;
  const linked = existing ? usedBy(robots, existing.id) : [];
  const err = (k: keyof typeof errors) => (touched ? errors[k] : null);
  const set = (patch: Partial<typeof f>) => {
    setF((p) => ({ ...p, ...patch }));
    setTouched(true);
  };

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (readOnly) return;
    if (invalid) {
      setTouched(true);
      return;
    }
    const row: Partial<OrcaDevice> = { name: f.name, deviceType: f.deviceType as DeviceTypeCode, serial: f.serial, ip: f.ip, label: f.label, retired: f.retired };
    const r = simCall(() => sim.orca.saveDevice(existing ? { id: existing.id, ...row } : row, 'player'));
    if (!r.ok) {
      addAlert('danger', r.error, path);
      return;
    }
    if (existing) {
      const changed = (Object.keys(row) as (keyof OrcaDevice)[]).filter((k) => existing[k] !== row[k]);
      emitAppAction('orca', 'orca.device.saved', { deviceId: existing.id, name: f.name, changed: changed as string[] });
      addAlert('success', `A Device is updated with identifier ${existing.id}`, '/device');
    } else {
      emitAppAction('orca', 'orca.device.created', { deviceId: r.value, name: f.name, deviceType: f.deviceType, serial: f.serial, ip: f.ip });
      addAlert('success', `A new Device is created with identifier ${r.value}`, '/device');
    }
    navigate('/device');
  };
  useCtrlS(() => save(), !readOnly);

  return (
    <form onSubmit={save} noValidate>
      <h2 id="jhi-device-heading">Create or edit a Device</h2>
      <AlertArea />
      {existing && linked.length ? (
        <div className="orca-alert orca-alert-info">
          This device is linked to {linked.map((r) => r.name).join(', ')}. For a hardware swap, create a new Device and relink the robot instead.
        </div>
      ) : null}
      <div className="orca-card">
        {existing ? (
          <Field label="ID">
            <input className="orca-control" readOnly value={existing.id} />
          </Field>
        ) : null}
        <Field label="Name" error={err('name')}>
          <input className={`orca-control${err('name') ? ' orca-invalid' : ''}`} value={f.name} disabled={readOnly} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Device Type" error={err('deviceType')} text={f.deviceType ? deviceTypeInfoLine(f.deviceType) : undefined}>
          <select className={`orca-control${err('deviceType') ? ' orca-invalid' : ''}`} value={f.deviceType} disabled={readOnly} onChange={(e) => set({ deviceType: e.target.value as DeviceTypeCode })}>
            <option value="" />
            {DEVICE_TYPE_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Serial" error={err('serial')}>
          <input className={`orca-control orca-mono${err('serial') ? ' orca-invalid' : ''}`} value={f.serial} disabled={readOnly} onChange={(e) => set({ serial: e.target.value })} />
        </Field>
        <Field label="IP" error={err('ip')}>
          <input className={`orca-control orca-mono${err('ip') ? ' orca-invalid' : ''}`} value={f.ip} disabled={readOnly} onChange={(e) => set({ ip: e.target.value })} />
        </Field>
        <Field label="Label">
          <input className="orca-control" value={f.label} disabled={readOnly} onChange={(e) => set({ label: e.target.value })} />
        </Field>
        <label className="orca-check">
          <input type="checkbox" checked={f.retired} disabled={readOnly} onChange={(e) => set({ retired: e.target.checked })} />
          Retired
        </label>
      </div>
      <FormButtons onCancel={() => navigate('/device')} invalid={invalid} readOnly={readOnly} />
    </form>
  );
}
