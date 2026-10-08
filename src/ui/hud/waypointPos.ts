/**
 * Where an objective marker points in the world (metres), from the world placement contract
 * (`@/world/layout`, pure data): location anchors, prop placements, touch-rig bay parts, racks, NPC
 * desks. Pure (no engine / DOM) so it is unit-tested.
 */
import type { MarkerTarget } from '@/core/state';
import { LOCATION_BY_ID, PROPS, PROP_BY_ID, RACKS, RIG_BY_ID, bayPartPositions, resolvePropId, rigToWorld } from '@/world/layout';
import type { RigDef, Vec3 } from '@/world/layout';

/** Placement-less part families → the prop that carries them. */
const FALLBACK_HOSTS: readonly [string, string][] = [
  ['power.', 'wall.power'],
  ['callus.', 'shelf.callus'],
  ['server.', 'shelf.server'],
];

const camel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** World position (metres) of a marker target, or null when the layout does not know it. */
export function markerWorldPos(m: MarkerTarget): Vec3 | null {
  try {
    if (m.kind === 'location') {
      const l = LOCATION_BY_ID[m.id];
      return l ? [l.center[0], 1.1, l.center[2]] : null;
    }
    if (m.kind === 'npc' || m.id.startsWith('npc.')) {
      // People stand at their desk / bench: `npc.morgan` → `desk.morgan`, `npc.jared` → his bench.
      const key = m.id.replace(/^npc\./, '');
      const prop = PROPS.find((p) => p.id === `desk.${key}` || p.id === `bench.${key}`) ?? PROPS.find((p) => p.id.split('.').includes(key));
      return prop ? [prop.pos[0], 1.3, prop.pos[2]] : null;
    }
    if (m.kind !== 'prop' && m.kind !== 'rig') return null;
    let id = m.kind === 'rig' ? `rig.${m.id}` : resolvePropId(m.id);
    // Parts without their own placement: fall back to the fixture that carries them.
    const collis = /^collis\.(.+)$/.exec(id);
    if (collis) id = `rig.${collis[1]}`;
    for (const [prefix, host] of FALLBACK_HOSTS) if (!PROP_BY_ID[id] && id.startsWith(prefix) && PROP_BY_ID[host]) id = host;
    for (let i = 0; i < 4 && id; i++) {
      const prop = PROP_BY_ID[id];
      if (prop) {
        const h = prop.size?.[2] ?? prop.cyl?.h ?? 0;
        return [prop.pos[0], prop.pos[1] + Math.max(0.15, h / 2), prop.pos[2]];
      }
      const rigM = /^rig\.([^.]+)(?:\.(.+))?$/.exec(id);
      if (rigM) {
        const rig = (RIG_BY_ID as Readonly<Record<string, RigDef | undefined>>)[rigM[1]!];
        if (rig && rig.kind === 'touch') {
          const parts = bayPartPositions(rig.doorSide);
          const p = rigM[2] ? parts[camel(rigM[2].split('.')[0]!)] : (parts.tablet ?? null);
          if (p) return rigToWorld(rig, p.pos);
        }
        const loc = rig?.locationId ? LOCATION_BY_ID[rig.locationId] : null;
        if (loc) return [loc.center[0], 1.2, loc.center[2]];
      }
      const rackM = /^rack\.([a-z])/i.exec(id);
      if (rackM) {
        const rack = RACKS.find((r) => r.id === `rack.${rackM[1]!.toLowerCase()}`);
        if (rack) return [rack.pos[0], 1.3, rack.pos[2]];
      }
      id = id.includes('.') ? id.slice(0, id.lastIndexOf('.')) : '';
    }
  } catch {
    /* unknown id shape */
  }
  return null;
}
