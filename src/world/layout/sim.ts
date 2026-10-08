/**
 * Binding helpers: find the sim object behind a world prop without crashing while the sim is still
 * partial. Resolution order: (1) an object whose `propId` equals the world id; (2) the first
 * candidate id of the `SimRef` that exists. Absent → `undefined` → render the healthy default.
 */
import type { TerminalDevice, LabState, RigState } from '@/sim/types';
import type { SimRef } from './types';

/** The `LabState` collection a `SimRef` points at (undefined if the sim has not added it yet). */
export function simCollection(lab: LabState | null | undefined, collection: SimRef['collection']): Record<string, unknown> | undefined {
  if (!lab) return undefined;
  let node: unknown = lab;
  for (const key of collection.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node && typeof node === 'object' ? (node as Record<string, unknown>) : undefined;
}

/** Find the sim object for a world prop (see header for the resolution order). */
export function findSimObject<T = unknown>(lab: LabState | null | undefined, ref: SimRef, worldId?: string): T | undefined {
  const coll = simCollection(lab, ref.collection);
  if (!coll) return undefined;
  if (worldId) {
    for (const v of Object.values(coll)) {
      if (v && typeof v === 'object' && (v as { propId?: unknown }).propId === worldId) return v as T;
    }
  }
  for (const id of ref.ids) {
    const v = coll[id];
    if (v !== undefined && v !== null) return v as T;
  }
  return undefined;
}

/** The id under which `findSimObject` found the object (for sim calls that take an id). */
export function findSimId(lab: LabState | null | undefined, ref: SimRef, worldId?: string): string | undefined {
  const coll = simCollection(lab, ref.collection);
  if (!coll) return undefined;
  if (worldId) {
    for (const [k, v] of Object.entries(coll)) {
      if (v && typeof v === 'object' && (v as { propId?: unknown }).propId === worldId) return k;
    }
  }
  return ref.ids.find((id) => coll[id] !== undefined && coll[id] !== null);
}

export function rigState(lab: LabState | null | undefined, rigId: string): RigState | undefined {
  return lab?.rigs?.[rigId];
}

/**
 * The device shown on a rig display. Touch/ADB rigs: the rig's device (Station Duo: `secondary` =
 * the same device's CFD display). Tethered rigs: `primary` = the MFD device, `secondary` = the CFD
 * device (both use their own `display`).
 */
export function rigDevice(
  lab: LabState | null | undefined,
  rigId: string,
  which: 'primary' | 'secondary' = 'primary',
): { device: TerminalDevice; display: 'primary' | 'secondary' } | undefined {
  const rig = rigState(lab, rigId);
  if (!rig || !lab?.devices) return undefined;
  const devices = rig.deviceIds.map((id) => lab.devices[id]).filter((d): d is TerminalDevice => !!d);
  if (devices.length === 0) return undefined;
  const tethered = devices.find((d) => d.role === 'cfd') ?? (devices.length > 1 ? devices[1] : undefined);
  if (tethered) {
    const mfd = devices.find((d) => d.role === 'mfd') ?? devices[0]!;
    return which === 'primary' ? { device: mfd, display: 'primary' } : { device: tethered, display: 'primary' };
  }
  const dev = devices[0]!;
  if (which === 'secondary') return dev.secondaryDisplay ? { device: dev, display: 'secondary' } : undefined;
  return { device: dev, display: 'primary' };
}
