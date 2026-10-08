/**
 * HUD logic (node, no DOM): the objective waypoint resolves lesson marker targets to world positions.
 */
import { describe, expect, it } from 'vitest';
import type { MarkerTarget } from '@/core/state';
import { AUTHORED_LESSONS } from '@/missions/academy/lessons';
import { markerWorldPos } from './waypointPos';

function stepMarker(s: Record<string, unknown>): MarkerTarget | null {
  const m = s.marker as MarkerTarget | undefined;
  if (m) return m;
  if (typeof s.location === 'string') return { kind: 'location', id: s.location };
  const id = (s.prop ?? s.target) as unknown;
  return typeof id === 'string' ? { kind: id.startsWith('npc.') ? 'npc' : 'prop', id } : null;
}

describe('objective waypoint positions', () => {
  it('resolves locations, props, rig parts, racks and NPC desks inside the room', () => {
    for (const m of [
      { kind: 'location', id: 'loc.rack-a' },
      { kind: 'prop', id: 'prop.walle.tablet' },
      { kind: 'prop', id: 'rack.a.rails.u33' },
      { kind: 'prop', id: 'prop.safety-card' },
      { kind: 'prop', id: 'prop.fuse-5v-b' },
      { kind: 'npc', id: 'npc.morgan' },
    ] as MarkerTarget[]) {
      const p = markerWorldPos(m);
      expect(p, m.id).not.toBeNull();
      expect(Math.abs(p![0]) < 20 && p![1] > 0 && p![1] < 3 && Math.abs(p![2]) < 20, m.id).toBe(true);
    }
    expect(markerWorldPos({ kind: 'app', id: 'orca' })).toBeNull();
    expect(markerWorldPos({ kind: 'prop', id: 'no.such.thing' })).toBeNull();
  });

  it('covers (nearly) every Academy step target', () => {
    let n = 0;
    let ok = 0;
    const missing: string[] = [];
    for (const l of AUTHORED_LESSONS)
      for (const s of l.steps) {
        const m = stepMarker(s as unknown as Record<string, unknown>);
        if (!m || m.kind === 'app') continue;
        n++;
        if (markerWorldPos(m)) ok++;
        else missing.push(`${s.id} ${m.kind}:${m.id}`);
      }
    expect(n).toBeGreaterThan(40);
    // NPCs who are not physically in the lab (remote teammates) have no marker.
    expect(ok / n, missing.join(', ')).toBeGreaterThanOrEqual(0.95);
  });
});
