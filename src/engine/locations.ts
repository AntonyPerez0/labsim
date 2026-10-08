/**
 * Location anchors: named horizontal circles ("loc.workstation", "loc.rack-a" …). Pure logic.
 *
 * Rules
 *  - The player is "in" an anchor when the horizontal distance to its centre is ≤ radius.
 *  - Overlapping anchors: the one whose centre is relatively closest (distance / radius) wins.
 *  - Hysteresis: once inside, the player stays in that anchor until they move `hysteresis` metres
 *    beyond its radius (no flicker on the boundary), unless they are deeper inside another anchor.
 */
import type { Vec3 } from './types';

export interface LocationLike {
  id: string;
  center: Vec3;
  radius: number;
}

function horizontalDistance(x: number, z: number, a: LocationLike): number {
  const dx = x - a.center[0];
  const dz = z - a.center[2];
  return Math.sqrt(dx * dx + dz * dz);
}

/** Which anchor contains (x, z), given the anchor the player is currently in. */
export function resolveLocation(
  x: number,
  z: number,
  anchors: readonly LocationLike[],
  currentId: string | null,
  hysteresis = 0.25,
): string | null {
  let best: LocationLike | null = null;
  let bestRatio = Number.POSITIVE_INFINITY;
  let current: LocationLike | null = null;
  for (const a of anchors) {
    if (!(a.radius > 0)) continue;
    const d = horizontalDistance(x, z, a);
    if (a.id === currentId) current = a;
    if (d <= a.radius) {
      const ratio = d / a.radius;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        best = a;
      }
    }
  }
  if (current) {
    const d = horizontalDistance(x, z, current);
    if (d <= current.radius + hysteresis) {
      // Stay unless clearly deeper inside a different anchor.
      if (!best || best === current) return current.id;
      const curRatio = d / current.radius;
      return bestRatio < curRatio * 0.5 ? best.id : current.id;
    }
  }
  return best ? best.id : null;
}

export interface LocationUpdate {
  /** Location id after this update (null = none). */
  current: string | null;
  /** True when `current` differs from the previous value. */
  changed: boolean;
  /** Set when the player entered a (non-null) location this update. */
  entered: string | null;
}

/** Stateful wrapper used by the engine: tracks the current location and reports enters. */
export class LocationTracker {
  private anchors: LocationLike[] = [];
  current: string | null = null;

  add(a: LocationLike): () => void {
    this.anchors.push(a);
    return () => {
      const i = this.anchors.indexOf(a);
      if (i >= 0) this.anchors.splice(i, 1);
    };
  }

  get all(): readonly LocationLike[] {
    return this.anchors;
  }

  update(x: number, z: number): LocationUpdate {
    const next = resolveLocation(x, z, this.anchors, this.current);
    const changed = next !== this.current;
    this.current = next;
    return { current: next, changed, entered: changed && next !== null ? next : null };
  }

  /** Forget the current location (e.g. after a teleport) so the next update re-enters. */
  reset(): void {
    this.current = null;
  }
}
