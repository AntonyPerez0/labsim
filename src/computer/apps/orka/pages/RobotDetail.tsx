/**
 * Robot detail (Apps §2.5): entity details, Notes (resolve, add when D1 lands), Check out / Release.
 */
import { useEffect, useRef, useState } from 'react';
import { getState, useGame } from '@/core/store';
import { sim } from '@/sim';
import type { OrkaRobot, RobotNote } from '@/sim/types';
import { emitAppAction } from '../../../apps';
import { Fa } from '../icons';
import { AlertArea, BackEditButtons, NotFound, STATUS_LABEL, StatusChip, addAlert, hhmmss, simCall, useOnce, useOrka } from '../shared';
import { buildLabel, isManualCheckout, jenkinsBuildRoute } from './Home';

function deviceLabel(devices: Record<number, { name: string; deviceType: string; serial: string; ip: string }>, id: number | null): string {
  if (id == null) return '—';
  const d = devices[id];
  return d ? `${d.name} · ${d.deviceType} · ${d.serial} · ${d.ip}` : `#${id}`;
}

/* ─────────────────────────────── Notes ─────────────────────────────── */

export function NotesSection(props: { robot: OrkaRobot; readOnly: boolean }) {
  const { robot, readOnly } = props;
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef(false);
  const [text, setText] = useState('');
  const addNote = typeof sim.orka.addNote === 'function' ? sim.orka.addNote.bind(sim.orka) : null;
  const notes = [...robot.notes].sort((a, b) => (b.lastAtMs ?? b.atMs) - (a.lastAtMs ?? a.atMs) || b.id - a.id);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fire = () => {
      if (emitted.current) return;
      emitted.current = true;
      const r = getState().lab.orka.robots[robot.id];
      emitAppAction('orka', 'orka.robot.notesViewed', { robotId: robot.id, name: robot.name, noteCount: r?.notes.length ?? 0 });
    };
    if (typeof IntersectionObserver === 'undefined') {
      fire();
      return;
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        fire();
        io.disconnect();
      }
    });
    io.observe(el);
    return () => io.disconnect();
  }, [robot.id, robot.name]);

  const resolve = (n: RobotNote) => {
    const r = simCall(() => sim.orka.resolveNote(robot.id, n.id, 'player'));
    emitAppAction('orka', 'orka.robot.noteResolved', { robotId: robot.id, noteId: n.id, ok: r.ok, error: r.ok ? null : r.error });
    if (!r.ok) addAlert('danger', r.error, `/robot/${robot.id}/view`);
  };

  const submit = () => {
    const t = text.trim();
    if (!t || !addNote) return;
    let ok = false;
    let error: string | null = null;
    const r = simCall(() => addNote(robot.id, t, 'player'));
    ok = r.ok;
    error = r.ok ? null : r.error;
    if (!r.ok) addAlert('danger', r.error, `/robot/${robot.id}/view`);
    emitAppAction('orka', 'orka.robot.noteAdded', { robotId: robot.id, name: robot.name, text: t, ok, error });
    if (ok) setText('');
  };

  return (
    <div className="orka-notes" ref={ref} data-hint="orka.robot.notes">
      <h4>
        Notes <span className="orka-badge orka-bg-secondary">{robot.notes.length}</span>
      </h4>
      {notes.length === 0 ? <p className="orka-muted">No notes.</p> : null}
      {notes.map((n) => (
        <div key={n.id} className={`orka-note${n.resolved ? ' orka-note-resolved' : ''}`}>
          <span className={`orka-badge orka-kind-${n.kind}`}>{n.kind}</span>
          <span className="orka-note-text">{n.text}</span>
          {n.resolved ? (
            <span className="orka-badge orka-bg-light">Resolved</span>
          ) : readOnly ? null : (
            <button type="button" className="orka-btn orka-btn-sm orka-btn-outline-secondary" onClick={() => resolve(n)}>
              <Fa.check size={12} /> Resolve
            </button>
          )}
        </div>
      ))}
      {addNote && !readOnly ? (
        <div style={{ marginTop: 10 }}>
          <textarea className="orka-control orka-mono" rows={2} value={text} placeholder="Add a note (endpoint, error text, who you told)…" onChange={(e) => setText(e.target.value)} />
          <button type="button" className="orka-btn orka-btn-secondary orka-btn-sm" style={{ marginTop: 6 }} disabled={!text.trim()} onClick={submit}>
            <Fa.plus size={12} /> Add note
          </button>
        </div>
      ) : null}
    </div>
  );
}

/* ─────────────────────────────── Detail page ─────────────────────────────── */

export function RobotDetailPage(props: { id: number }) {
  const { navigate, wm, readOnly, login } = useOrka();
  const robot = useGame((s) => s.lab.orka.robots[props.id]);
  const devices = useGame((s) => s.lab.orka.devices);
  const caps = useGame((s) => s.lab.orka.capabilities);
  const merchants = useGame((s) => s.lab.orka.merchants);
  const nowMs = useGame((s) => Math.floor(s.lab.time.nowMs / 1000));
  const path = `/robot/${props.id}/view`;
  useOnce(robot ? `${robot.id}` : null, () => emitAppAction('orka', 'orka.robot.viewed', { robotId: robot!.id, name: robot!.name }));
  if (!robot) return <NotFound what={`Robot ${props.id}`} />;

  const checkout = () => {
    let ok = false;
    let message: string;
    let kind: 'success' | 'danger' | 'warning';
    const st = robot.status;
    if (st === 'CONNECTION_FAILED' || st === 'RESERVED' || st === 'OFFLINE') {
      message = `Robot is blocked from checkouts (${STATUS_LABEL[st]})`;
      kind = 'danger';
    } else if (st === 'UNAVAILABLE') {
      message = 'Robot is Unavailable — pass its exact Name in the job to use it';
      kind = 'warning';
    } else {
      const r = simCall(() =>
        sim.orka.checkout({ buildId: `manual-${robot.id}-${nowMs}`, jobId: 'manual', robotName: robot.name, environment: robot.environment, kind: 'manual' }),
      );
      ok = r.ok;
      message = r.ok ? `Checked out robot ${robot.name} (manual). Release it when you are done.` : r.error;
      kind = r.ok ? 'success' : 'danger';
    }
    addAlert(kind, message, path);
    emitAppAction('orka', 'orka.robot.checkoutAttempted', { robotId: robot.id, name: robot.name, status: st, ok, message });
  };

  const release = () => {
    if (!robot.checkout) return;
    const r = simCall(() => sim.orka.release(robot.id, robot.checkout!.buildId));
    addAlert(r.ok ? 'success' : 'danger', r.ok ? `Released robot ${robot.name}.` : r.error, path);
    emitAppAction('orka', 'orka.robot.released', { robotId: robot.id, name: robot.name, ok: r.ok, error: r.ok ? null : r.error });
  };

  const manual = isManualCheckout(robot);
  const jr = robot.checkout && !manual ? jenkinsBuildRoute(robot.checkout.buildId) : null;
  const merchant = robot.merchantConfigId != null ? merchants[robot.merchantConfigId] : null;
  const capNames = robot.capabilityIds.map((id) => caps[id]?.name ?? `#${id}`);
  const dev = robot.deviceId != null ? devices[robot.deviceId] : null;

  return (
    <div>
      <h2 data-cy="robotDetailsHeading">Robot</h2>
      <hr />
      <AlertArea />
      <dl className="orka-dl">
        <dt>ID</dt>
        <dd>{robot.id}</dd>
        <dt>Name</dt>
        <dd>{robot.name}</dd>
        <dt>Human Readable Name</dt>
        <dd>{robot.humanReadableName}</dd>
        <dt>Status</dt>
        <dd>
          <StatusChip status={robot.status} />
          {robot.checkout ? (
            <span className="orka-sub">
              in use by{' '}
              {jr ? (
                <button type="button" className="orka-link" onClick={() => wm?.openApp('jenkins', { route: jr })}>
                  Jenkins #{robot.checkout.buildId.split('#')[1]}
                </button>
              ) : manual ? (
                `manual (${login ?? 'admin'})`
              ) : (
                buildLabel(robot.checkout.buildId)
              )}
            </span>
          ) : null}
        </dd>
        <dt>Reserved By</dt>
        <dd>{robot.reservedBy ?? ''}</dd>
        <dt>Rig Kind</dt>
        <dd>{robot.rigKind}</dd>
        <dt>Environment</dt>
        <dd>{robot.environment}</dd>
        <dt>Location</dt>
        <dd>{robot.location}</dd>
        <dt>Description</dt>
        <dd>{robot.description}</dd>
        <dt>Robot Device</dt>
        <dd>{deviceLabel(devices, robot.deviceId)}</dd>
        <dt>Device Type</dt>
        <dd>{dev ? <span className="orka-badge orka-bg-info">{dev.deviceType}</span> : '—'}</dd>
        <dt>Robot ADB Service URL</dt>
        <dd className="orka-mono">{robot.adbServiceUrl}</dd>
        <dt>Camera Stream URL</dt>
        <dd className="orka-mono">
          {robot.cameraStreamUrl}{' '}
          {robot.cameraStreamUrl ? (
            <button type="button" className="orka-link" onClick={() => wm?.openApp('camera', { url: robot.cameraStreamUrl, robot: robot.name })}>
              ▶ Open stream
            </button>
          ) : null}
        </dd>
        <dt>Dip URL</dt>
        <dd className="orka-mono">{robot.dipUrl ?? ''}</dd>
        <dt>Tap URL</dt>
        <dd className="orka-mono">{robot.tapUrl ?? ''}</dd>
        <dt>Swipe URL</dt>
        <dd className="orka-mono">{robot.swipeUrl ?? ''}</dd>
        <dt>MFD (Merchant Facing Device)</dt>
        <dd>{robot.mfdDeviceId != null ? deviceLabel(devices, robot.mfdDeviceId) : ''}</dd>
        <dt>CFD (Customer Facing Device)</dt>
        <dd>{robot.cfdDeviceId != null ? deviceLabel(devices, robot.cfdDeviceId) : ''}</dd>
        <dt>USB Tethered</dt>
        <dd>
          {robot.mfdDeviceId != null ? (
            <span className="orka-badge orka-bg-info" title="Pipelines inject RUN_TYPE=tethered.">
              Tethered: MFD populated
            </span>
          ) : (
            <span className="orka-muted">Standalone (MFD empty)</span>
          )}
        </dd>
        <dt>Offset X (mm)</dt>
        <dd>{robot.offsetXMm.toFixed(1)}</dd>
        <dt>Offset Y (mm)</dt>
        <dd>{robot.offsetYMm.toFixed(1)}</dd>
        <dt>Capabilities</dt>
        <dd>{capNames.length ? capNames.join(', ') : ''}</dd>
        <dt>Merchant Config</dt>
        <dd>
          {merchant ? (
            <button type="button" className="orka-link" onClick={() => navigate(`/merchant-config/${merchant.id}/view`)}>
              {merchant.name}
            </button>
          ) : (
            ''
          )}
        </dd>
        <dt>Last Health Check</dt>
        <dd>
          {robot.lastHealthCheckMs == null
            ? '—'
            : `${hhmmss(robot.lastHealthCheckMs)} · ${robot.lastHealthCheckOk ? `${robot.lastHealth?.http ?? 200} OK` : `FAIL ${robot.lastHealth?.error ?? ''}`}`}
        </dd>
      </dl>
      <BackEditButtons onBack={() => navigate('/robot')} onEdit={readOnly ? undefined : () => navigate(`/robot/${robot.id}/edit`)}>
        {readOnly ? null : (
          <button type="button" className="orka-btn orka-btn-outline-secondary" onClick={checkout} data-hint="orka.robot.checkout">
            <Fa.exchange /> Check out
          </button>
        )}
        {manual && !readOnly ? (
          <button type="button" className="orka-btn orka-btn-warning" onClick={release}>
            Release
          </button>
        ) : null}
      </BackEditButtons>
      <NotesSection robot={robot} readOnly={readOnly} />
    </div>
  );
}
