/**
 * Flows shared by several Orca pages: entity delete (JHipster modal), robot status change (with the
 * Connection Failed override modal, Apps §2.5), robot naming helpers.
 */
import { useCallback, useState, type ReactNode } from 'react';
import { getState } from '@/core/store';
import { sim } from '@/sim';
import type { OrcaEntityName } from '@/sim/events';
import type { LabState, OrcaRobot, RobotStatus } from '@/sim/types';
import { emitAppAction } from '../../../apps';
import { Fa } from '../icons';
import { DeleteModal, ENTITY_TITLE, Modal, STATUS_LABEL, addAlert, simCall, useOrca } from '../shared';

/** Delete flow: modal → sim.orca.deleteEntity → alert + `orca.entity.deleted`. */
export function useDeleteFlow(entity: OrcaEntityName, afterPath: string): { ask(id: number): void; modal: ReactNode } {
  const { navigate } = useOrca();
  const [id, setId] = useState<number | null>(null);
  const confirm = () => {
    if (id == null) return;
    const r = simCall(() => sim.orca.deleteEntity(entity as never, id, 'player'));
    emitAppAction('orca', 'orca.entity.deleted', { entity, id, ok: r.ok, error: r.ok ? null : r.error });
    if (r.ok) addAlert('success', `A ${ENTITY_TITLE[entity]} is deleted with identifier ${id}`, afterPath);
    else addAlert('danger', r.error, afterPath);
    setId(null);
    navigate(afterPath);
  };
  return {
    ask: setId,
    modal: id != null ? <DeleteModal entity={entity} id={id} onCancel={() => setId(null)} onConfirm={confirm} /> : null,
  };
}

/** Apply a status change through the sim and emit `orca.robot.statusChangeRequested`. */
export function applyStatus(robot: OrcaRobot, to: RobotStatus, confirmed: boolean): { ok: boolean; error: string | null } {
  if (!confirmed) {
    emitAppAction('orca', 'orca.robot.statusChangeRequested', { robotId: robot.id, name: robot.name, from: robot.status, to, confirmed: false, ok: false, error: null });
    return { ok: false, error: null };
  }
  const r = simCall(() => sim.orca.setRobotStatus(robot.id, to, 'player'));
  const out = { ok: r.ok, error: r.ok ? null : r.error };
  emitAppAction('orca', 'orca.robot.statusChangeRequested', { robotId: robot.id, name: robot.name, from: robot.status, to, confirmed: true, ...out });
  return out;
}

/**
 * Status change with the override modal when moving away from Connection Failed.
 * `run(robot, to, done)` → `done(ok, error)` after the sim call (or `done(false, null)` when cancelled).
 */
export function useStatusChange(): { run(robot: OrcaRobot, to: RobotStatus, done: (ok: boolean, error: string | null) => void): void; modal: ReactNode } {
  const [pending, setPending] = useState<{ robot: OrcaRobot; to: RobotStatus; done: (ok: boolean, error: string | null) => void } | null>(null);
  const run = useCallback((robot: OrcaRobot, to: RobotStatus, done: (ok: boolean, error: string | null) => void) => {
    if (robot.status === to) {
      done(true, null);
      return;
    }
    if (robot.status === 'CONNECTION_FAILED') {
      setPending({ robot, to, done });
      return;
    }
    const r = applyStatus(robot, to, true);
    done(r.ok, r.error);
  }, []);
  const cancel = () => {
    if (!pending) return;
    applyStatus(pending.robot, pending.to, false);
    pending.done(false, null);
    setPending(null);
  };
  const override = () => {
    if (!pending) return;
    const r = applyStatus(pending.robot, pending.to, true);
    pending.done(r.ok, r.error);
    setPending(null);
  };
  const err = pending?.robot.lastHealth?.error ?? (pending?.robot.lastHealth?.http != null ? `HTTP ${pending.robot.lastHealth.http}` : 'no response');
  return {
    run,
    modal: pending ? (
      <Modal
        title="Confirm status change"
        onClose={cancel}
        footer={
          <>
            <button type="button" className="orca-btn orca-btn-secondary" onClick={cancel}>
              <Fa.ban /> Cancel
            </button>
            <button type="button" className="orca-btn orca-btn-danger" onClick={override} autoFocus>
              Override
            </button>
          </>
        }
      >
        This robot failed its last health check ({err}). Override anyway?
        <div className="orca-small orca-muted" style={{ marginTop: 8 }}>
          {pending.robot.name}: {STATUS_LABEL[pending.robot.status]} → {STATUS_LABEL[pending.to]}
        </div>
      </Modal>
    ) : null,
  };
}

/** Robot Device row type (the MFD's for tethered rigs). */
export function robotDeviceType(lab: Pick<LabState, 'orca'>, r: OrcaRobot): string | null {
  const id = r.deviceId ?? r.mfdDeviceId;
  return id != null ? (lab.orca.devices[id]?.deviceType ?? null) : null;
}

export function robotById(id: number): OrcaRobot | undefined {
  return getState().lab.orca.robots[id];
}

export const RIG_KINDS = ['touch', 'tethered', 'adb', 'standalone'] as const;
export const RIG_KIND_LABEL: Record<string, string> = { touch: 'Touch', tethered: 'Tethered', adb: 'ADB', standalone: 'Standalone' };
export const ENVIRONMENTS = ['DEV1', 'DEV2', 'STG', 'QA', 'INT'] as const;
