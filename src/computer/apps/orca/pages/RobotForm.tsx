/**
 * Robot create/edit form (Apps §2.5): grouped cards, exact JHipster validation messages, tethered banner,
 * legacy offsets warning, Name-change warning, save flow (saveRobot then status with the CF override modal).
 */
import { useMemo, useState, type FormEvent } from 'react';
import { getState, useGame } from '@/core/store';
import { sim } from '@/sim';
import type { OrcaRobot, RobotStatus } from '@/sim/types';
import { emitAppAction } from '../../../apps';
import { UI_DEVICE_TYPES } from '../../../shell/deviceTypes';
import {
  AlertArea,
  Field,
  FormButtons,
  NotFound,
  STATUSES,
  STATUS_LABEL,
  addAlert,
  simCall,
  useCtrlS,
  useOnce,
  useOrca,
  validateNumber,
  validateText,
} from '../shared';
import { ENVIRONMENTS, RIG_KINDS, useStatusChange } from './common';
import { NotesSection } from './RobotDetail';

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const URL_RE = /^https?:\/\/\S+$/;

interface FormState {
  name: string;
  humanReadableName: string;
  status: RobotStatus;
  rigKind: string;
  environment: string;
  location: string;
  description: string;
  deviceId: string;
  adbServiceUrl: string;
  cameraStreamUrl: string;
  dipUrl: string;
  tapUrl: string;
  swipeUrl: string;
  mfdDeviceId: string;
  cfdDeviceId: string;
  offsetXMm: string;
  offsetYMm: string;
  capabilityIds: number[];
  merchantConfigId: string;
}

function fromRobot(r: OrcaRobot | null): FormState {
  return {
    name: r?.name ?? '',
    humanReadableName: r?.humanReadableName ?? '',
    status: r?.status ?? 'AVAILABLE',
    rigKind: r?.rigKind ?? 'touch',
    environment: r?.environment ?? 'DEV1',
    location: r?.location ?? '',
    description: r?.description ?? '',
    deviceId: r?.deviceId != null ? String(r.deviceId) : '',
    adbServiceUrl: r?.adbServiceUrl ?? '',
    cameraStreamUrl: r?.cameraStreamUrl ?? '',
    dipUrl: r?.dipUrl ?? '',
    tapUrl: r?.tapUrl ?? '',
    swipeUrl: r?.swipeUrl ?? '',
    mfdDeviceId: r?.mfdDeviceId != null ? String(r.mfdDeviceId) : '',
    cfdDeviceId: r?.cfdDeviceId != null ? String(r.cfdDeviceId) : '',
    offsetXMm: (r?.offsetXMm ?? 0).toFixed(1),
    offsetYMm: (r?.offsetYMm ?? 0).toFixed(1),
    capabilityIds: [...(r?.capabilityIds ?? [])],
    merchantConfigId: r?.merchantConfigId != null ? String(r.merchantConfigId) : '',
  };
}

/** Form values → OrcaRobot fields. */
function toRobot(f: FormState): Partial<OrcaRobot> {
  const num = (s: string) => (s === '' ? null : Number(s));
  return {
    name: f.name,
    humanReadableName: f.humanReadableName,
    rigKind: f.rigKind as OrcaRobot['rigKind'],
    environment: f.environment,
    location: f.location,
    description: f.description,
    deviceId: num(f.deviceId),
    adbServiceUrl: f.adbServiceUrl,
    cameraStreamUrl: f.cameraStreamUrl,
    dipUrl: f.dipUrl || null,
    tapUrl: f.tapUrl || null,
    swipeUrl: f.swipeUrl || null,
    mfdDeviceId: num(f.mfdDeviceId),
    cfdDeviceId: num(f.cfdDeviceId),
    offsetXMm: Math.round(Number(f.offsetXMm) * 10) / 10,
    offsetYMm: Math.round(Number(f.offsetYMm) * 10) / 10,
    capabilityIds: [...f.capabilityIds].sort((a, b) => a - b),
    merchantConfigId: num(f.merchantConfigId),
  };
}

const CHANGE_NAME: Record<string, string> = {
  adbServiceUrl: 'urls.adb',
  cameraStreamUrl: 'urls.camera',
  dipUrl: 'urls.dip',
  tapUrl: 'urls.tap',
  swipeUrl: 'urls.swipe',
  offsetXMm: 'offsets.x',
  offsetYMm: 'offsets.y',
  merchantConfigId: 'merchant',
  capabilityIds: 'capabilities',
};

export function RobotFormPage(props: { id: number | null }) {
  const { navigate, readOnly, wm } = useOrca();
  const robot = useGame((s) => (props.id != null ? s.lab.orca.robots[props.id] : null)) ?? null;
  const devices = useGame((s) => s.lab.orca.devices);
  const caps = useGame((s) => s.lab.orca.capabilities);
  const merchants = useGame((s) => s.lab.orca.merchants);
  const [f, setF] = useState<FormState>(() => fromRobot(robot));
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const status = useStatusChange();
  const path = props.id != null ? `/robot/${props.id}/edit` : '/robot/new';

  useOnce(props.id == null ? 'new' : robot ? String(robot.id) : null, () =>
    emitAppAction('orca', 'orca.robot.editOpened', { robotId: robot?.id ?? null, name: robot?.name ?? null }),
  );

  const errors = useMemo(() => {
    const e: Record<string, string | null> = {
      name: validateText(f.name, 'Name', { required: true, pattern: NAME_RE, max: 50 }),
      humanReadableName: validateText(f.humanReadableName, 'Human Readable Name', { required: true, max: 32 }),
      location: validateText(f.location, 'Location', { max: 64 }),
      description: validateText(f.description, 'Description', { max: 255 }),
      deviceId: f.deviceId ? null : 'This field is required.',
      adbServiceUrl: validateText(f.adbServiceUrl, 'Robot ADB Service URL', { required: true, pattern: URL_RE }),
      cameraStreamUrl: validateText(f.cameraStreamUrl, 'Camera Stream URL', { pattern: URL_RE }),
      dipUrl: validateText(f.dipUrl, 'Dip URL', { pattern: URL_RE }),
      tapUrl: validateText(f.tapUrl, 'Tap URL', { pattern: URL_RE }),
      swipeUrl: validateText(f.swipeUrl, 'Swipe URL', { pattern: URL_RE }),
      mfdDeviceId: f.cfdDeviceId && !f.mfdDeviceId ? 'MFD is required when CFD is set.' : null,
      offsetXMm: validateNumber(f.offsetXMm, { required: true, min: -50, max: 50 }),
      offsetYMm: validateNumber(f.offsetYMm, { required: true, min: -50, max: 50 }),
      merchantConfigId: f.merchantConfigId ? null : 'This field is required.',
    };
    return e;
  }, [f]);
  const invalid = Object.values(errors).some(Boolean);

  if (props.id != null && !robot) return <NotFound what={`Robot ${props.id}`} />;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((p) => ({ ...p, [k]: v }));
    setTouched((t) => (t.has(k) ? t : new Set(t).add(k)));
  };
  const err = (k: string) => (touched.has(k) || touched.has('*') ? errors[k] : null);

  const finish = (id: number, created: boolean, changed: string[], name: string) => {
    setSaving(false);
    addAlert('success', created ? `A new Robot is created with identifier ${id}` : `A Robot is updated with identifier ${id}`, '/robot');
    emitAppAction('orca', 'orca.robot.saved', { robotId: id, name, created, changed });
    navigate('/robot');
  };
  const fail = (error: string) => {
    setSaving(false);
    addAlert('danger', error, path);
    emitAppAction('orca', 'orca.robot.saveFailed', { robotId: robot?.id ?? null, error });
  };

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (readOnly || saving) return;
    if (invalid) {
      setTouched(new Set(['*']));
      return;
    }
    setSaving(true);
    const next = toRobot(f);
    if (!robot) {
      const r = simCall(() => sim.orca.saveRobot({ ...next, status: f.status }, 'player'));
      if (r.ok) finish(r.value, true, Object.keys(next).map((k) => CHANGE_NAME[k] ?? k).concat('status'), f.name);
      else fail(r.error);
      return;
    }
    const before = robot as unknown as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(next)) if (JSON.stringify(before[k] ?? null) !== JSON.stringify(v ?? null)) patch[k] = v;
    const changed = Object.keys(patch).map((k) => CHANGE_NAME[k] ?? k);
    if (Object.keys(patch).length) {
      const r = simCall(() => sim.orca.saveRobot({ id: robot.id, ...patch }, 'player'));
      if (!r.ok) {
        fail(r.error);
        return;
      }
    }
    if (f.status !== robot.status) {
      const live = getState().lab.orca.robots[robot.id] ?? robot;
      status.run(live, f.status, (ok, error) => {
        if (ok) finish(robot.id, false, [...changed, 'status'], f.name);
        else if (error) fail(error);
        else {
          setSaving(false);
          if (changed.length) emitAppAction('orca', 'orca.robot.saved', { robotId: robot.id, name: f.name, created: false, changed });
        }
      });
      return;
    }
    finish(robot.id, false, changed, f.name);
  };
  useCtrlS(() => save(), !readOnly);

  const activeDevices = Object.values(devices).filter((d) => !d.retired || String(d.id) === f.deviceId);
  const sel = f.deviceId ? devices[Number(f.deviceId)] : null;
  const devOption = (d: (typeof activeDevices)[number]) => `${d.name} · ${d.deviceType} · ${d.serial} · ${d.ip}`;
  const offX = Number(f.offsetXMm) || 0;
  const offY = Number(f.offsetYMm) || 0;
  const sign = (n: number) => `${n >= 0 ? '+' : '−'}${Math.abs(n).toFixed(1)}`;
  const dis = readOnly;
  const input = (k: keyof FormState, opts: { mono?: boolean; type?: string; step?: string } = {}) => (
    <input
      id={`orca-robot-${k}`}
      className={`orca-control${opts.mono ? ' orca-mono' : ''}${err(k) ? ' orca-invalid' : ''}`}
      type={opts.type ?? 'text'}
      step={opts.step}
      value={f[k] as string}
      disabled={dis}
      onChange={(e) => set(k, e.target.value as never)}
      onBlur={() => setTouched((t) => new Set(t).add(k))}
    />
  );

  return (
    <form onSubmit={save} noValidate>
      <h2 id="jhi-robot-heading">Create or edit a Robot</h2>
      <AlertArea />
      <div className="orca-card">
        <h5 className="orca-card-title">Identity</h5>
        <div className="orca-grid2">
          {robot ? (
            <Field label="ID">
              <input className="orca-control" value={robot.id} readOnly />
            </Field>
          ) : null}
          <Field label="Name" help="System identifier used by pipelines (ROBOT_NAME). Lowercase, unique." error={err('name')} hint="orca.robot.field:name" htmlFor="orca-robot-name">
            {input('name')}
            {robot && f.name !== robot.name ? (
              <div className="orca-alert orca-alert-warning" style={{ margin: '6px 0 0', padding: '6px 10px' }}>
                Pipelines and named jobs use the Name. Change it only if the robot is really renamed.
              </div>
            ) : null}
          </Field>
          <Field label="Human Readable Name" help="Shown on the robot's status tablet." error={err('humanReadableName')} hint="orca.robot.field:humanReadableName" htmlFor="orca-robot-humanReadableName">
            {input('humanReadableName')}
          </Field>
          <Field label="Status" hint="orca.robot.field:status" htmlFor="orca-robot-status">
            <select id="orca-robot-status" className="orca-control" value={f.status} disabled={dis} onChange={(e) => set('status', e.target.value as RobotStatus)}>
              {STATUSES.map((s) => (
                <option key={s} value={s} disabled={s === 'CONNECTION_FAILED' && robot?.status !== 'CONNECTION_FAILED'}>
                  {STATUS_LABEL[s]}
                  {s === 'CONNECTION_FAILED' && robot?.status !== 'CONNECTION_FAILED' ? ' (set by the health check only)' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Reserved By">
            <input className="orca-control" readOnly value={f.status === 'RESERVED' ? (robot?.status === 'RESERVED' ? (robot.reservedBy ?? 'player') : 'player') : ''} />
          </Field>
          <Field label="Rig Kind" hint="orca.robot.field:rigKind">
            <select className="orca-control" value={f.rigKind} disabled={dis} onChange={(e) => set('rigKind', e.target.value)}>
              {RIG_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Environment" hint="orca.robot.field:environment">
            <select className="orca-control" value={f.environment} disabled={dis} onChange={(e) => set('environment', e.target.value)}>
              {ENVIRONMENTS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Location" error={err('location')} hint="orca.robot.field:location">
            {input('location')}
          </Field>
        </div>
        <Field label="Description" error={err('description')} hint="orca.robot.field:description">
          <textarea className={`orca-control${err('description') ? ' orca-invalid' : ''}`} rows={2} value={f.description} disabled={dis} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </div>

      <div className="orca-card">
        <h5 className="orca-card-title">Robot Device</h5>
        <Field label="Robot Device" help="The physical terminal on this rig. Upgrades get a new Device so the old one stays for rollback." error={err('deviceId')} hint="orca.robot.field:deviceId">
          <select className={`orca-control${err('deviceId') ? ' orca-invalid' : ''}`} value={f.deviceId} disabled={dis} onChange={(e) => set('deviceId', e.target.value)}>
            <option value="" />
            {activeDevices.map((d) => (
              <option key={d.id} value={d.id}>
                {devOption(d)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Device Type">
          <div>
            {sel ? <span className="orca-badge orca-bg-info">{sel.deviceType}</span> : '—'}{' '}
            {sel ? <small className="orca-muted">Testing profile {UI_DEVICE_TYPES[sel.deviceType]?.profile ?? ''}</small> : null}
          </div>
        </Field>
      </div>

      <div className="orca-card">
        <h5 className="orca-card-title">URL Mappings</h5>
        <Field label="Robot ADB Service URL" error={err('adbServiceUrl')} hint="orca.robot.field:adbServiceUrl">
          {input('adbServiceUrl', { mono: true })}
        </Field>
        <Field
          label={
            <>
              Camera Stream URL
              {f.cameraStreamUrl ? (
                <button type="button" className="orca-link" style={{ marginLeft: 8 }} onClick={() => wm?.openApp('camera', { url: f.cameraStreamUrl, robot: robot?.name })}>
                  ▶ Open stream
                </button>
              ) : null}
            </>
          }
          error={err('cameraStreamUrl')}
          hint="orca.robot.field:cameraStreamUrl"
        >
          {input('cameraStreamUrl', { mono: true })}
        </Field>
        <div className="orca-grid2">
          <Field label="Dip URL" error={err('dipUrl')} hint="orca.robot.field:dipUrl">
            {input('dipUrl', { mono: true })}
          </Field>
          <Field label="Tap URL" error={err('tapUrl')} hint="orca.robot.field:tapUrl">
            {input('tapUrl', { mono: true })}
          </Field>
          <Field label="Swipe URL" error={err('swipeUrl')} hint="orca.robot.field:swipeUrl">
            {input('swipeUrl', { mono: true })}
          </Field>
        </div>
      </div>

      <div className="orca-card">
        <h5 className="orca-card-title">USB Tethered Device Configuration</h5>
        <div className="orca-grid2">
          <Field label="MFD (Merchant Facing Device)" error={err('mfdDeviceId') ?? errors.mfdDeviceId} hint="orca.robot.field:mfdDeviceId">
            <select className={`orca-control${errors.mfdDeviceId ? ' orca-invalid' : ''}`} value={f.mfdDeviceId} disabled={dis} onChange={(e) => set('mfdDeviceId', e.target.value)}>
              <option value="">(none)</option>
              {activeDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {devOption(d)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="CFD (Customer Facing Device)" hint="orca.robot.field:cfdDeviceId">
            <select className="orca-control" value={f.cfdDeviceId} disabled={dis} onChange={(e) => set('cfdDeviceId', e.target.value)}>
              <option value="">(none)</option>
              {activeDevices.map((d) => (
                <option key={d.id} value={d.id}>
                  {devOption(d)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {f.mfdDeviceId ? (
          <div className="orca-alert orca-alert-info" style={{ marginBottom: 0 }}>
            Tethered: MFD populated
            <small className="orca-sub" style={{ color: 'inherit' }}>
              Pipelines inject RUN_TYPE=tethered.
            </small>
          </div>
        ) : (
          <div className="orca-muted">Standalone (MFD empty)</div>
        )}
      </div>

      <div className="orca-card">
        <h5 className="orca-card-title">Offsets (legacy)</h5>
        <div className="orca-grid2">
          {(['offsetXMm', 'offsetYMm'] as const).map((k) => (
            <Field
              key={k}
              label={
                <>
                  {k === 'offsetXMm' ? 'Offset X (mm)' : 'Offset Y (mm)'} <span className="orca-badge orca-bg-warning">Legacy</span>
                </>
              }
              error={err(k)}
              text="Deprecated — compensated for imprecise limit switches before the lab was calibrated to a true (0,0). Leave at 0.0."
              hint={`orca.robot.field:${k}`}
            >
              {input(k, { type: 'number', step: '0.1' })}
            </Field>
          ))}
        </div>
        {offX !== 0 || offY !== 0 ? (
          <div className="orca-alert orca-alert-warning" style={{ marginBottom: 0 }}>
            Non-zero legacy offset — taps will be shifted by ({sign(offX)}, {sign(offY)}) mm.
          </div>
        ) : null}
      </div>

      <div className="orca-card">
        <h5 className="orca-card-title">Capabilities</h5>
        <Field label="Capabilities" hint="orca.robot.field:capabilityIds">
          <div>
            {Object.values(caps).map((c) => (
              <label key={c.id} className="orca-check">
                <input
                  type="checkbox"
                  disabled={dis}
                  checked={f.capabilityIds.includes(c.id)}
                  onChange={(e) => set('capabilityIds', e.target.checked ? [...f.capabilityIds, c.id] : f.capabilityIds.filter((x) => x !== c.id))}
                />
                {c.name} <span className="orca-muted orca-small">({c.key})</span>
              </label>
            ))}
          </div>
        </Field>
      </div>

      <div className="orca-card">
        <h5 className="orca-card-title">Merchant</h5>
        <Field label="Merchant Config" error={err('merchantConfigId')} hint="orca.robot.field:merchantConfigId">
          <select className={`orca-control${err('merchantConfigId') ? ' orca-invalid' : ''}`} value={f.merchantConfigId} disabled={dis} onChange={(e) => set('merchantConfigId', e.target.value)}>
            <option value="" />
            {Object.values(merchants).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <FormButtons onCancel={() => navigate(robot ? `/robot/${robot.id}/view` : '/robot')} invalid={invalid} saving={saving} hint="orca.robot.save" readOnly={readOnly} />
      {robot ? <NotesSection robot={robot} readOnly={readOnly} /> : null}
      {status.modal}
    </form>
  );
}
