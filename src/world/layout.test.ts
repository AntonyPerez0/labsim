import { describe, expect, it } from 'vitest';
import {
  ADB_RIGS,
  AC_STRIPS,
  BAYS,
  BUILD_TABLE_ITEMS,
  CALLUS_BOXES,
  CAMERAS,
  COLLIS_PROBES,
  DEVICE_MODELS,
  GANTRY_MM,
  INTERACTABLES,
  INTERACTABLE_IDS,
  LIBRARY_ITEMS,
  LOCATIONS,
  LOCATION_BY_ID,
  NPC_ANCHORS,
  OUTLETS,
  PHYSICAL_RIG_IDS,
  POWER_WALL_PARTS,
  PROPS,
  PROP_ALIASES,
  PROP_IDS,
  RACKS,
  RIGS,
  ROOM,
  SPAWNS,
  STATIC_COLLIDERS,
  TETHERED_RIGS,
  TOUCH_RIGS,
  TROFFERS,
  bayInteriorAabb,
  carriageCentresMm,
  findSimObject,
  findSimId,
  footprintAabb,
  insideLab,
  insideWalkableShell,
  isPropId,
  matchesProp,
  nfcLandmarkMm,
  parseRigPartId,
  pointBlocked,
  powerProbePoints,
  primaryScreenRect,
  probeScreenRect,
  resolvePropId,
  rigDevice,
  rigPartId,
  rigProbePoints,
  rigToWorld,
  tabletFocusPose,
  touchRigIds,
  touchRigPartList,
  uBottomMm,
  unitAtHeight,
  unitPositionAt,
  type PropPlacement,
} from './layout';
// Import the sim barrel first: importing `@/sim/initialState` directly enters the
// initialState → core/store → initialState cycle from the wrong side.
import '@/sim';
import { createInitialLabState } from '@/sim/initialState';

/** 10-curriculum §0.5 prop anchors (the content contract the world must satisfy). */
const CURRICULUM_PROP_IDS = [
  'prop.walle.tablet', 'prop.johnny5.tablet', 'prop.seti.tablet', 'prop.walle.power-panel', 'prop.rack-a.rail-labels',
  'prop.seti-panel', 'prop.printer.prusa', 'prop.printer.bambu', 'prop.safety-card', 'prop.walle.door', 'prop.walle.stepper-x',
  'prop.walle.motor-pcb', 'prop.walle.cradle', 'prop.walle.webcam', 'prop.walle.carriage', 'prop.walle.limit-switch-x',
  'prop.walle.limit-switch-y', 'prop.walle.dip-arm', 'prop.walle.pi', 'prop.bolt-bins', 'prop.family-trays', 'prop.megatron.mfd',
  'prop.megatron.cfd', 'prop.optimus.mfd', 'prop.optimus.cfd', 'prop.smartstripe-probe', 'prop.hub-dock', 'prop.meanwell-psu',
  'prop.power-trace', 'prop.regulator-12v', 'prop.regulator-5v10a', 'prop.fuse-5v-b', 'prop.fuse-spares', 'prop.multimeter',
  'prop.ac-strip', 'prop.flex4-psu-brick', 'prop.collis-probe-spare', 'prop.nuc-03', 'prop.minix-01', 'prop.collis-probe-a',
  'prop.eve.pi-power', 'prop.eve.device', 'prop.seti.device', 'prop.data.device', 'prop.tars.device', 'prop.ruler', 'prop.r2d2.mfd',
  'prop.r2d2.cfd', 'prop.coworker-device', 'prop.whiteboard', 'prop.roadmap-board', 'prop.gpu-blade', 'prop.legacy-tower',
  'prop.history.semi', 'prop.history.sedi', 'prop.history.ipx', 'prop.history.paycore', 'prop.history.match',
  ...['station-2018', 'station-2', 'station-duo-1', 'station-duo-2', 'box-duo-3', 'mini-2', 'mini-3', 'box-mini-4', 'flex-1', 'flex-2', 'flex-3', 'flex-4', 'flex-pocket', 'compact'].map(
    (m) => `prop.device-library.${m}`,
  ),
];

/** 10-curriculum §0.5 locations + the extra World §1.3 anchors. */
const LOCATION_IDS = [
  'loc.corridor', 'loc.entrance', 'loc.workstation', 'loc.morgan-desk', 'loc.coworker-desks', 'loc.rack-a', 'loc.callus-shelf',
  'loc.rack-b', 'loc.rear-aisle', 'loc.adb-shelf', 'loc.rack-tethered', 'loc.power-wall', 'loc.server-shelf', 'loc.print-corner',
  'loc.jared-bench', 'loc.husky', 'loc.storage', 'loc.whiteboard', 'loc.build-table', 'loc.device-library', 'loc.coffee', 'loc.history-wall',
];

function dupes(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) out.push(id);
    seen.add(id);
  }
  return out;
}

type Box = { min: [number, number, number]; max: [number, number, number] };
const EPS = 1e-6;
function overlaps(a: Box, b: Box): boolean {
  return a.min[0] < b.max[0] - EPS && b.min[0] < a.max[0] - EPS && a.min[1] < b.max[1] - EPS && b.min[1] < a.max[1] - EPS && a.min[2] < b.max[2] - EPS && b.min[2] < a.max[2] - EPS;
}

describe('ids', () => {
  it('are unique inside every table', () => {
    const tables: Record<string, readonly { id: string }[]> = {
      PROPS, LOCATIONS, SPAWNS, NPC_ANCHORS, INTERACTABLES, POWER_WALL_PARTS, OUTLETS, AC_STRIPS, TROFFERS, CAMERAS, RIGS,
      COLLIS_PROBES, CALLUS_BOXES, BUILD_TABLE_ITEMS, LIBRARY_ITEMS,
    };
    for (const [name, rows] of Object.entries(tables)) expect(dupes(rows.map((r) => r.id)), name).toEqual([]);
    expect(dupes(PROP_IDS)).toEqual([]);
  });

  it('keep anchors, spawns and props in separate namespaces', () => {
    const anchorIds = [...LOCATIONS, ...SPAWNS, ...NPC_ANCHORS].map((a) => a.id);
    expect(dupes(anchorIds)).toEqual([]);
    for (const id of anchorIds) expect(isPropId(id), id).toBe(false);
    for (const l of LOCATIONS) expect(l.id.startsWith('loc.')).toBe(true);
    for (const s of SPAWNS) expect(s.id.startsWith('spawn.')).toBe(true);
    for (const c of CAMERAS) expect(c.id.startsWith('cam.')).toBe(true);
  });

  it('follow the World §0.1 id grammar', () => {
    const grammar = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+$/;
    for (const id of PROP_IDS) expect(id, id).toMatch(grammar);
  });

  it('every interactable id is a known prop id with a label and E/R/G verbs only', () => {
    for (const i of INTERACTABLES) {
      expect(isPropId(i.id), i.id).toBe(true);
      expect(i.label.length, i.id).toBeGreaterThan(0);
      expect(i.callouts.length, i.id).toBeLessThanOrEqual(4);
      for (const v of i.verbs) expect(['E', 'R', 'G']).toContain(v.key);
    }
  });

  it('touch rigs expose every §9.2 part id', () => {
    for (const rig of TOUCH_RIGS) {
      for (const part of touchRigPartList(rig)) {
        const id = rigPartId(rig.id, part);
        expect(isPropId(id), id).toBe(true);
        if (part !== 'solenoid-connector') expect(INTERACTABLE_IDS[id], id).toBeDefined();
      }
      expect(INTERACTABLE_IDS[`collis.${rig.id}`]).toBeDefined();
    }
    expect(INTERACTABLE_IDS['rig.r2-d2.mfd']).toBeDefined();
    expect(INTERACTABLE_IDS['rig.r2-d2.cfd']).toBeDefined();
    expect(INTERACTABLE_IDS['rig.r2-d2.device']).toBeUndefined();
    expect(touchRigIds('wall-e').switchMain).toBe('rig.wall-e.switch-main');
    expect(INTERACTABLE_IDS['rig.wall-e.tablet']!.label).toBe('Status tablet — WALL-E');
    expect(INTERACTABLE_IDS['rack.a.rails.u33-left']!.callouts).toEqual(['U33']);
    expect(INTERACTABLE_IDS['server.blade.gpu-3']!.crouchOnly).toBe(true);
    expect(INTERACTABLE_IDS['rig.wall-e.pi']!.reach).toBe(1.3);
  });

  it('parses rig part ids', () => {
    expect(parseRigPartId('rig.wall-e.switch-main')).toEqual({ rigId: 'wall-e', part: 'switch-main' });
    expect(parseRigPartId('rig.r2-d2.cfd')).toEqual({ rigId: 'r2-d2', part: 'cfd' });
    expect(parseRigPartId('rig.megatron.dock-mfd')).toEqual({ rigId: 'megatron', part: 'dock-mfd' });
    expect(parseRigPartId('rig.johnny-5.pi-power')).toEqual({ rigId: 'johnny-5', part: 'pi-power' });
    expect(parseRigPartId('rig.rack-b.camera-pi')).toEqual({ rigId: 'rack-b', part: 'camera-pi' });
    expect(parseRigPartId('power.fuse.5v-b')).toBeNull();
  });
});

describe('curriculum aliases', () => {
  it('every curriculum prop id has an alias that resolves to a world id', () => {
    for (const id of CURRICULUM_PROP_IDS) {
      expect(PROP_ALIASES[id], id).toBeDefined();
      expect(isPropId(resolvePropId(id)), `${id} → ${resolvePropId(id)}`).toBe(true);
    }
  });

  it('every alias target exists', () => {
    for (const [from, to] of Object.entries(PROP_ALIASES)) expect(isPropId(to), `${from} → ${to}`).toBe(true);
  });

  it('every curriculum / world location exists', () => {
    expect(LOCATIONS.map((l) => l.id).sort()).toEqual([...LOCATION_IDS].sort());
  });

  it('matchesProp accepts sub-parts and aliases', () => {
    expect(matchesProp('prop.rack-a.rail-labels', 'rack.a.rails.u33-left')).toBe(true);
    expect(matchesProp('prop.walle.tablet', 'rig.wall-e.tablet')).toBe(true);
    expect(matchesProp('prop.walle.tablet', 'rig.eve.tablet')).toBe(false);
    expect(matchesProp('power.strip.w', 'power.strip.w.s3')).toBe(true);
    expect(matchesProp('power.strip.w', null)).toBe(false);
  });
});

describe('room and anchors', () => {
  it('room shell is 14 × 10 × 3', () => {
    const r = ROOM.interior;
    expect([r.maxX - r.minX, r.maxZ - r.minZ, r.ceilingY - r.floorY]).toEqual([14, 10, 3]);
  });

  it('every anchor is inside the room (corridor anchors inside the corridor)', () => {
    for (const l of LOCATIONS) {
      if (l.id === 'loc.corridor') expect(insideWalkableShell(l.center[0], l.center[2])).toBe(true);
      else expect(insideLab(l.center[0], l.center[2]), l.id).toBe(true);
      expect(l.radius).toBeGreaterThan(0);
    }
    for (const a of [...SPAWNS, ...NPC_ANCHORS]) {
      expect(insideWalkableShell(a.pos[0], a.pos[2]), a.id).toBe(true);
      if (a.id !== 'spawn.new-game') expect(insideLab(a.pos[0], a.pos[2]), a.id).toBe(true);
    }
  });

  it('anchors stand on free floor (seated anchors excepted)', () => {
    // Desk locations sit at the chair (the walk-to radius is 1.5 m); chairs are ignored for them.
    const chairs = new Set(STATIC_COLLIDERS.filter((c) => c.kind === 'chair').map((c) => c.id));
    for (const l of LOCATIONS) expect(pointBlocked(l.center[0], l.center[2], chairs), l.id).toBeNull();
    for (const a of [...SPAWNS, ...NPC_ANCHORS]) {
      if (a.seated) continue;
      expect(pointBlocked(a.pos[0], a.pos[2]), a.id).toBeNull();
    }
  });

  it('every prop sits inside the lab or corridor', () => {
    for (const p of PROPS) expect(insideWalkableShell(p.pos[0], p.pos[2]) || p.mount === 'wall', p.id).toBe(true);
  });

  it('floor props do not overlap (chairs tuck under desks; tower under its desk)', () => {
    const floor = PROPS.filter((p) => p.mount === 'floor' && p.collider === true && p.size);
    const boxOf = (p: PropPlacement): Box => {
      const [minX, minZ, maxX, maxZ] = footprintAabb(p.pos, p.size![0], p.size![1], p.rotY);
      return { min: [minX, 0, minZ], max: [maxX, p.size![2], maxZ] };
    };
    const hits: string[] = [];
    for (let i = 0; i < floor.length; i++)
      for (let j = i + 1; j < floor.length; j++) if (overlaps(boxOf(floor[i]!), boxOf(floor[j]!))) hits.push(`${floor[i]!.id} × ${floor[j]!.id}`);
    expect(hits).toEqual([]);
  });

  it('door opening is free in the colliders, walls are closed elsewhere', () => {
    expect(pointBlocked(5.9, 5.07)).toBeNull();
    expect(pointBlocked(4.0, 5.07)).not.toBeNull();
    expect(pointBlocked(0, -5.07)).not.toBeNull();
    expect(STATIC_COLLIDERS.some((c) => c.id === 'rack.a')).toBe(true);
    expect(STATIC_COLLIDERS.find((c) => c.id === 'desk.player.chair')!.kind).toBe('chair');
  });

  it('troffers sit on the 600 mm ceiling grid', () => {
    for (const t of TROFFERS) {
      const kx = (t.x - 0.3) / 0.6;
      expect(Math.abs(kx - Math.round(kx)), t.id).toBeLessThan(1e-9);
      const kz = (t.z - 0.6) / 0.6; // 1.2 m long: edges on grid lines
      expect(Math.abs(kz - Math.round(kz)), t.id).toBeLessThan(1e-9);
    }
    expect(TROFFERS).toHaveLength(12);
  });

  it('power wall parts lie on the board', () => {
    for (const p of POWER_WALL_PARTS) {
      expect(p.x, p.id).toBeGreaterThanOrEqual(-2.2);
      expect(p.x, p.id).toBeLessThanOrEqual(0.8);
      expect(p.y, p.id).toBeGreaterThanOrEqual(0.95);
      expect(p.y, p.id).toBeLessThanOrEqual(2.25);
    }
  });
});

describe('racks and bays', () => {
  it('bay floors follow the rack-unit formula', () => {
    for (const b of BAYS) expect(b.floorY * 1000).toBeCloseTo(uBottomMm(b.units[0]), 6);
    expect(uBottomMm(41)).toBeCloseTo(1878, 6);
  });

  it('matches the IMG-T checks (Appendix C 2)', () => {
    expect(unitAtHeight(1.5446)).toBe(33);
    const wallE = BAYS.find((b) => b.bay === 4)!;
    expect(unitPositionAt(wallE.fasciaY[0] * 1000)).toBeCloseTo(31.34, 2);
    expect(unitPositionAt(wallE.fasciaY[1] * 1000)).toBeCloseTo(35.61, 2);
  });

  it('rig slots do not overlap and every (rack, bay) is used exactly once', () => {
    const slots = TOUCH_RIGS.map((r) => ({ id: r.id, ...bayInteriorAabb(RACKS.find((k) => k.id === r.rackId)!, r.bay) }));
    expect(dupes(TOUCH_RIGS.map((r) => `${r.rackId}/${r.bay}`))).toEqual([]);
    for (const rack of RACKS) for (const [bay, rigId] of Object.entries(rack.bays)) expect(TOUCH_RIGS.find((r) => r.id === rigId)!.bay).toBe(Number(bay));
    for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) expect(overlaps(slots[i]!, slots[j]!), `${slots[i]!.id} × ${slots[j]!.id}`).toBe(false);
    // Tethered faces and ADB devices.
    const faces = TETHERED_RIGS.flatMap((t) => [t.mfd, t.cfd]).map((f) => ({
      id: f.id,
      min: [f.world[0] - f.faceM[0] / 2, f.world[1] - f.faceM[1] / 2, f.world[2] - 0.01] as [number, number, number],
      max: [f.world[0] + f.faceM[0] / 2, f.world[1] + f.faceM[1] / 2, f.world[2] + 0.01] as [number, number, number],
    }));
    for (let i = 0; i < faces.length; i++) for (let j = i + 1; j < faces.length; j++) expect(overlaps(faces[i]!, faces[j]!), `${faces[i]!.id} × ${faces[j]!.id}`).toBe(false);
    expect(Math.abs(ADB_RIGS[0]!.world[0] - ADB_RIGS[1]!.world[0])).toBeGreaterThan(0.2);
    expect(dupes(COLLIS_PROBES.map((c) => `${c.level}/${c.local[0] < 0 ? 'L' : 'R'}`))).toEqual([]);
  });

  it('roster: 12 physical rigs with known locations and hosts', () => {
    expect(PHYSICAL_RIG_IDS).toHaveLength(12);
    for (const r of RIGS) {
      expect(LOCATION_BY_ID[r.locationId], r.id).toBeDefined();
      expect(isPropId(r.hostPropId), r.id).toBe(true);
      expect(CAMERAS.some((c) => c.id === r.cameraId), r.id).toBe(true);
    }
  });
});

describe('touch-rig geometry (§2.10)', () => {
  it('gantry stays within its mechanical range for every device config', () => {
    for (const rig of TOUCH_RIGS) {
      for (const cfg of rig.deviceConfigs) {
        for (const x of [0, cfg.maxMm[0]]) {
          for (const y of [0, cfg.maxMm[1]]) {
            const { cx, az } = carriageCentresMm(cfg, x, y);
            expect(cx, `${rig.id} ${cfg.type} cx`).toBeGreaterThanOrEqual(GANTRY_MM.cxRange[0]);
            expect(cx, `${rig.id} ${cfg.type} cx`).toBeLessThanOrEqual(GANTRY_MM.cxRange[1]);
            expect(az, `${rig.id} ${cfg.type} az`).toBeGreaterThanOrEqual(GANTRY_MM.azRange[0]);
            expect(az, `${rig.id} ${cfg.type} az`).toBeLessThanOrEqual(GANTRY_MM.azRange[1]);
          }
        }
      }
    }
  });

  it('screens are centred and their bottom bezel ends at the chip-slot edge z −160', () => {
    for (const rig of TOUCH_RIGS) {
      for (const cfg of rig.deviceConfigs) {
        const model = DEVICE_MODELS[cfg.type];
        const probe = probeScreenRect(cfg);
        const margins = cfg.probeDisplay === 'secondary' ? model.cfdMargins! : model.margins!;
        expect(probe.x + probe.w / 2, `${rig.id} centred`).toBeCloseTo(0, 6);
        expect(probe.z + probe.h + margins.bottom, `${rig.id} ${cfg.type} slot edge`).toBeCloseTo(-160, 6);
        expect(primaryScreenRect(cfg).x).toBeCloseTo(-cfg.primaryScreenMm[0] / 2, 6);
        const nfc = nfcLandmarkMm(cfg.type)!;
        // The doc rounds landmarks to 0.1 mm.
        expect(Math.abs(cfg.nfcMm[0] - nfc[0]), `${rig.id} nfc x`).toBeLessThan(0.06);
        expect(Math.abs(cfg.nfcMm[1] - nfc[1]), `${rig.id} nfc y`).toBeLessThan(0.06);
        // Camera target = probe screen centre.
        expect(cfg.cameraTargetMm[2]).toBeCloseTo(probe.z + probe.h / 2, 0);
      }
    }
  });

  it('places the WALL-E tablet and focus pose in front of Rack A bay 4', () => {
    const wallE = TOUCH_RIGS.find((r) => r.id === 'wall-e')!;
    const pose = tabletFocusPose(wallE);
    expect(pose.lookAt[0]).toBeCloseTo(-2.6, 6);
    expect(pose.lookAt[1]).toBeCloseTo(1.4335 + 0.11, 6);
    expect(pose.lookAt[2]).toBeCloseTo(-1.65 + 0.0035, 6);
    expect(pose.position[2] - pose.lookAt[2]).toBeCloseTo(0.32, 6);
    expect(rigToWorld(wallE, [0, 0, -900])[2]).toBeCloseTo(-2.55, 6);
  });
});

describe('power and probes', () => {
  it('probe point ids are unique and sit on known props', () => {
    const pts = [...powerProbePoints(), ...rigProbePoints()];
    expect(dupes(pts.map((p) => p.id))).toEqual([]);
    for (const p of pts) expect(isPropId(p.on), `${p.id} on ${p.on}`).toBe(true);
  });

  it('every strip binds to a sim strip id and has 6 socket ids', () => {
    for (const s of AC_STRIPS) {
      expect(s.sim.ids.length).toBeGreaterThan(0);
      for (let n = 1; n <= 6; n++) expect(isPropId(`${s.id}.s${n}`)).toBe(true);
    }
  });
});

describe('sim binding helpers', () => {
  it('degrade gracefully on a partial lab and resolve by propId or candidate id', () => {
    // The real sim now seeds everything: empty the collections to model a partial lab.
    const lab = createInitialLabState();
    lab.power.fuses = {};
    lab.power.regulators = {};
    lab.rigs = {};
    lab.devices = {};
    expect(findSimObject(lab, { collection: 'power.fuses', ids: ['F-RACKB-5V'] }, 'power.fuse.5v-b')).toBeUndefined();
    expect(findSimObject(lab, { collection: 'power.regulators', ids: ['REG-5V-B'] })).toBeUndefined();
    expect(rigDevice(lab, 'wall-e')).toBeUndefined();
    lab.power.fuses['F-RACKB-5V'] = { id: 'F-RACKB-5V', railId: 'rail-5v-b', ratingA: 10, blown: false, propId: null };
    lab.power.fuses['odd'] = { id: 'odd', railId: 'rail-5v-b', ratingA: 10, blown: true, propId: 'power.fuse.5v-b' };
    expect(findSimId(lab, { collection: 'power.fuses', ids: ['F-RACKB-5V'] }, 'power.fuse.5v-b')).toBe('odd');
    expect(findSimId(lab, { collection: 'power.fuses', ids: ['F-RACKB-5V'] })).toBe('F-RACKB-5V');
    expect(findSimObject(null, { collection: 'hosts', ids: ['pi-wall-e'] })).toBeUndefined();
  });
});
