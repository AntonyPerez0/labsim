/**
 * Small caches the global-wrong-action detectors need: facts that were true *before* an event (a Pi was
 * healthy, a rig had an active test, who held a reservation, a device row's name before deletion, the
 * last config values). Refreshed every mission tick and from the event stream; reset per activity.
 */
import type { RootState } from '@/core/state';
import type { LabState } from '@/sim/types';
import { onActivityReset } from '../rt';
import { parseProperties } from '../lookups';

export const GWS = {
  /** Rig names with an active checkout (Jenkins / local / manual) — dashboard lockout. */
  activeTests: new Set<string>(),
  /** Host id → healthy (OS RUNNING and robot-controller running) at the last sample. */
  hostHealthy: new Map<string, boolean>(),
  /** Robot name → who reserved it (last sample). */
  reservedBy: new Map<string, string | null>(),
  /** Orca device row id → name (last sample; deletion events only carry the id). */
  deviceNames: new Map<number, string>(),
  /** Device row ids referenced by robots or kept as legacy rows when a robot was relinked. */
  legacyDeviceIds: new Set<number>(),
  /** Config file key → { theme, kernelType, portNumber } last seen. */
  config: new Map<string, { theme: string | null; kernelType: string | null; portNumber: string | null }>(),
  /** GW05 was charged this activity (a later PayCore overwrite turns it into a strike). */
  paycoreOpenedAtS: null as number | null,
  /** Local runs started by an incident setup (INC27's run on 5555), not by the player. */
  runtimeRuns: new Set<string>(),
};

onActivityReset(() => {
  GWS.activeTests.clear();
  GWS.hostHealthy.clear();
  GWS.reservedBy.clear();
  GWS.deviceNames.clear();
  GWS.legacyDeviceIds.clear();
  GWS.config.clear();
  GWS.paycoreOpenedAtS = null;
  GWS.runtimeRuns.clear();
});

/** Sample the lab (called once per mission tick, cheap). */
export function sampleLab(s: RootState): void {
  const lab = s.lab;
  GWS.activeTests.clear();
  for (const h of Object.values(lab.hosts ?? {})) {
    const rc = h.services?.['robot-controller'];
    GWS.hostHealthy.set(h.id, h.os === 'RUNNING' && (rc ? rc.running : true));
  }
  for (const r of Object.values(lab.orca?.robots ?? {})) {
    GWS.reservedBy.set(r.name, r.status === 'RESERVED' ? (r.reservedBy ?? null) : null);
    if (r.checkout) GWS.activeTests.add(r.name);
    if (r.deviceId !== null && r.deviceId !== undefined) GWS.legacyDeviceIds.add(r.deviceId);
  }
  for (const rig of Object.values(lab.rigs ?? {})) if (rig.dashboardLocked) GWS.activeTests.add(rig.id);
  for (const d of Object.values(lab.orca?.devices ?? {})) GWS.deviceNames.set(d.id, d.name);
  sampleConfig(lab);
}

function sampleConfig(lab: LabState): void {
  const props = lab.workstation?.configProperties;
  if (props) GWS.config.set('config', { theme: props.theme ?? null, kernelType: props.kernelType ?? null, portNumber: props.portNumber ?? null });
  else {
    const text = lab.repos?.['uia-remote']?.local?.files?.['config.properties'];
    if (text !== undefined) {
      const p = parseProperties(text);
      GWS.config.set('config', { theme: p.theme ?? null, kernelType: p.kernelType ?? null, portNumber: p.portNumber ?? null });
    }
  }
}

/** Current config values (after an edit). */
export function currentConfig(lab: LabState): { theme: string | null; kernelType: string | null; portNumber: string | null } {
  const props = lab.workstation?.configProperties;
  if (props) return { theme: props.theme ?? null, kernelType: props.kernelType ?? null, portNumber: props.portNumber ?? null };
  const p = parseProperties(lab.repos?.['uia-remote']?.local?.files?.['config.properties']);
  return { theme: p.theme ?? null, kernelType: p.kernelType ?? null, portNumber: p.portNumber ?? null };
}

export function trackEvent(type: string, payload: unknown): void {
  const p = payload as Record<string, unknown>;
  if (type === 'robot.checkedOut') GWS.activeTests.add(String(p.name));
  else if (type === 'robot.released') GWS.activeTests.delete(String(p.name));
  else if (type === 'rig.lockout') {
    if (p.locked) GWS.activeTests.add(String(p.rigId));
    else GWS.activeTests.delete(String(p.rigId));
  }
}
