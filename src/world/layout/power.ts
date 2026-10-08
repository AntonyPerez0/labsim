/**
 * Power wall board layout (World §1.5), wall outlets, AC strips, rack distribution blocks, DC taps
 * and the multimeter probe points (§9.4) — with their sim bindings (40-simulation §2.6).
 *
 * Sim ids: the sim doc owns them (`MW-1`, `REG-5V-A`, `F-RACKB-5V`, `STRIP-A`, `WALL-2` …). Every
 * binding lists candidate ids in priority order; binders also accept any sim object whose `propId`
 * equals the world id (see `findSimObject` in `sim.ts`). Missing objects render the healthy state.
 */
import type { SimRef, Vec3 } from './types';

/** Parts stand off the board face toward +Z. */
export const POWER_WALL = {
  boardId: 'wall.power',
  boardFaceZ: -4.966,
  /** Board extents (world). */
  minX: -2.2,
  maxX: 0.8,
  minY: 0.95,
  maxY: 2.25,
  /** Wiring: MW-1 → bus 2 × 10 AWG red/black; bus → regulators 14 AWG; outputs → fuses → up into tray.ct1. */
  wiring: { psuToBus: '2 × 10 AWG red/black', busToRegs: '14 AWG', exitTray: 'tray.ct1' },
} as const;

export type PowerPartKind = 'outlet' | 'psu' | 'bus' | 'regulator' | 'fuse' | 'tap' | 'strip' | 'tag' | 'sign';

export interface PowerWallPart {
  readonly id: string;
  readonly kind: PowerPartKind;
  /** Centre on the board (world x, y); z = boardFaceZ + depth/2. */
  readonly x: number;
  readonly y: number;
  /** W × H × D in millimetres (D = standoff from the board). */
  readonly sizeMm: Vec3;
  /** Exact label text lines. */
  readonly labels: readonly string[];
  readonly desc: string;
  readonly sim?: SimRef;
}

function part(id: string, kind: PowerPartKind, x: number, y: number, sizeMm: Vec3, labels: string[], desc: string, sim?: SimRef): PowerWallPart {
  return sim ? { id, kind, x, y, sizeMm, labels, desc, sim } : { id, kind, x, y, sizeMm, labels, desc };
}

const fuse = (ids: string[]): SimRef => ({ collection: 'power.fuses', ids });
const reg = (ids: string[]): SimRef => ({ collection: 'power.regulators', ids });

export const POWER_WALL_PARTS: readonly PowerWallPart[] = [
  part('power.psu.mw-1', 'psu', -1.75, 1.85, [215, 115, 50], ['MEAN WELL · INPUT 120VAC · OUTPUT 24VDC', 'LRS-600-24 · 24V 25A'],
    'Mean Well LRS-600-24: perforated aluminium case, 7-way terminal strip (L N ⏚ −V −V +V +V) under a clear cover on the right end, green "DC OK" LED, V.ADJ pot; AC cord to W1; long axis horizontal',
    { collection: 'power.psus', ids: ['MW-1', 'meanwell-1'] }),
  part('power.bus.24v', 'bus', -1.25, 1.85, [300, 40, 25], ['24V DC RAIL'], 'Red (+) and black (−) copper bus bars on 4 standoffs, 6 screw lugs each',
    { collection: 'power.rails', ids: ['rail-24v'] }),
  part('power.reg.12v', 'regulator', -0.8, 2.02, [90, 60, 35], ['12V DC · NUC', '24V→12V 15A'], 'Black finned buck module, 4 flying leads', reg(['REG-12V'])),
  part('power.reg.5v-a', 'regulator', -0.4, 2.02, [75, 55, 32], ['5V DC · 10A', 'RACK A'], 'Silver finned buck module', reg(['REG-5V-A'])),
  part('power.reg.5v-b', 'regulator', 0.0, 2.02, [75, 55, 32], ['5V DC · 10A', 'RACK B'], 'Silver finned buck module', reg(['REG-5V-B'])),
  part('power.reg.5v-c', 'regulator', 0.4, 2.02, [75, 55, 32], ['5V DC · 10A', 'BENCH C (TETHERED + ADB)'], 'Silver finned buck module', reg(['REG-5V-BENCH', 'REG-5V-C'])),
  part('power.fuse.12v', 'fuse', -0.8, 1.72, [55, 22, 18], ['F-12V 10A'], 'Inline ATO holder, smoked cap, red 10 A blade', fuse(['F-NUC-12V', 'F-12V'])),
  part('power.fuse.5v-a', 'fuse', -0.4, 1.72, [55, 22, 18], ['F-5V-A 10A'], 'Inline ATO holder, smoked cap, red 10 A blade', fuse(['F-RACKA-5V', 'F-5V-A'])),
  part('power.fuse.5v-b', 'fuse', 0.0, 1.72, [55, 22, 18], ['F-5V-B 10A'], 'Inline ATO holder, smoked cap, red 10 A blade (curriculum prop.fuse-5v-b)', fuse(['F-RACKB-5V', 'F-5V-B'])),
  part('power.fuse.5v-c', 'fuse', 0.4, 1.72, [55, 22, 18], ['F-5V-C 10A'], 'Inline ATO holder, smoked cap, red 10 A blade', fuse(['F-BENCH-5V', 'F-5V-C'])),
  part('power.tap.24v', 'tap', -1.35, 1.45, [20, 400, 12], ['24V'], 'Dangling DC tap lead (0.4 m) with 5.5 × 2.1 barrel plug on a hook — red tag; the wrong-socket trap (M03, INC17)',
    { collection: 'power.terminals', ids: ['T-24V-SPARE'] }),
  part('power.tap.12v', 'tap', -1.15, 1.45, [20, 400, 12], ['12V'], 'Dangling DC tap lead with barrel plug — yellow tag', { collection: 'power.terminals', ids: ['T-12V-SPARE'] }),
  part('power.tap.5v', 'tap', -0.95, 1.45, [20, 400, 12], ['5V'], 'Dangling DC tap lead with barrel plug — blue tag', { collection: 'power.terminals', ids: ['T-5V-SPARE'] }),
  part('power.strip.w', 'strip', 0.35, 1.2, [450, 50, 45], ['AC STRIP — LABSIM / COLLIS ONLY'], '6-outlet commercial metal strip, illuminated red rocker; cord to W4 (curriculum prop.ac-strip)',
    { collection: 'power.strips', ids: ['STRIP-W'] }),
  part('power.tag.nuc', 'tag', -0.8, 2.2, [60, 25, 1], ['→ NUC SHELF (12V)'], 'Clickable line-end tag (power-trace node 7)'),
  part('power.tag.pi', 'tag', 0.0, 2.2, [60, 25, 1], ['→ PI SHELVES (5V)'], 'Clickable line-end tag (power-trace node 8)'),
  part('power.tag.motor', 'tag', -1.25, 2.2, [60, 25, 1], ['→ 24V MOTOR (RACK A / B / T)'], 'Tag on the orange/black bundle'),
  part('power.sign', 'sign', 0.65, 2.12, [300, 200, 1], ['24V DC · 120V AC — DE-ENERGIZE BEFORE SERVICING'], 'Yellow/black safety sign'),
];

/** Tap tag colours. */
export const DC_TAP_TAG_COLORS: Readonly<Record<string, string>> = {
  'power.tap.24v': '#d0211c',
  'power.tap.12v': '#f2c200',
  'power.tap.5v': '#1f4fd1',
};

/**
 * Power-trace minigame order (M03, §9.2 `power.trace`): click each node in this order; each
 * correct node lights its cable (emissive orange 1.5).
 */
export const POWER_TRACE = {
  id: 'power.trace',
  nodes: ['power.outlet.w1', 'power.psu.mw-1', 'power.bus.24v', 'power.reg.12v', 'power.reg.5v-b', 'power.fuse.12v', 'power.fuse.5v-b', 'power.tag.nuc', 'power.tag.pi'] as readonly string[],
  highlightEmissive: 1.5,
  highlightColor: '#ff7a1a',
} as const;

/* ───────────────────────────── Wall outlets ───────────────────────────── */

export interface OutletDef {
  readonly id: string;
  readonly n: number;
  /** Plate centre (world). z / x is the mounting plane of the wall or board. */
  readonly pos: Vec3;
  readonly rotY: number;
  readonly mountedOn: 'power-board' | 'north' | 'south' | 'east';
  readonly label: string;
  readonly sim: SimRef;
  readonly note?: string;
}

const outlet = (n: number, pos: Vec3, rotY: number, mountedOn: OutletDef['mountedOn'], note?: string): OutletDef => ({
  id: `power.outlet.w${n}`,
  n,
  pos,
  rotY,
  mountedOn,
  label: `W${n} · 120V`,
  sim: { collection: 'power.outlets', ids: [`WALL-${n}`, `wall-${n}`] },
  ...(note ? { note } : {}),
});

/** Duplex NEMA 5-15R in steel boxes, white plates 70 × 115 mm. */
export const OUTLET_PLATE_MM = { w: 70, h: 115, d: 6 } as const;

export const OUTLETS: readonly OutletDef[] = [
  outlet(1, [-2.05, 1.05, -4.966], 0, 'power-board', 'MW-1 AC cord'),
  outlet(2, [-1.25, 1.05, -4.966], 0, 'power-board', 'power.strip.a, power.strip.c1'),
  outlet(3, [-0.25, 1.05, -4.966], 0, 'power-board', 'power.strip.b, power.strip.c2'),
  outlet(4, [0.65, 1.05, -4.966], 0, 'power-board', 'power.strip.w'),
  outlet(5, [1.6, 1.05, -5.0], 0, 'north', 'above bench.jared — power.strip.t, power.strip.d'),
  outlet(6, [2.6, 1.05, -5.0], 0, 'north', 'above bench.jared'),
  outlet(7, [-3.7, 0.4, -5.0], 0, 'north', 'behind shelf.server'),
  outlet(8, [-5.97, 1.05, -5.0], 0, 'north', 'above bench.fab, in the gap between the printers (doc −6.20 sat hidden behind the Prusa)'),
  outlet(9, [-6.1, 0.4, 5.0], 180, 'south', 'under desk.coworker-1'),
  outlet(10, [-4.3, 0.4, 5.0], 180, 'south', 'under desk.coworker-2'),
  outlet(11, [-0.9, 0.4, 5.0], 180, 'south', 'under desk.morgan'),
  outlet(12, [1.1, 0.4, 5.0], 180, 'south', 'under desk.player'),
  outlet(13, [6.985, 1.05, 3.35], -90, 'east', 'coffee'),
  outlet(14, [6.985, 0.4, 0.3], -90, 'east', 'device library'),
];

/* ───────────────────────────── AC strips ───────────────────────────── */

export interface AcStripDef {
  readonly id: string;
  /** Tablet/tape label text. */
  readonly tape: string;
  /** Short name used in prompts, e.g. "STRIP-A". */
  readonly name: string;
  /** Where it lives (prop id of its rack/shelf/board). */
  readonly host: string;
  /** World centre of the strip body (strips on a shelf lie on it: centre y = level top + H/2). */
  readonly pos: Vec3;
  /** Front (sockets) facing, degrees. */
  readonly rotY: number;
  /** Body W × H × D mm (long axis = local X; 250 mm compact strips on the Callus shelf fit between its posts). */
  readonly sizeMm: Vec3;
  /** Wall outlet its cord runs to (decor routing; the sim decides what is actually plugged). */
  readonly cordTo: string;
  readonly sockets: 6;
  readonly sim: SimRef;
  readonly note?: string;
}

const strip = (s: AcStripDef): AcStripDef => s;

export const AC_STRIPS: readonly AcStripDef[] = [
  strip({
    id: 'power.strip.a', name: 'STRIP-A', tape: 'STRIP-A — LABSIM / COLLIS ONLY', host: 'rack.a',
    // rack-local (0, 1.885…1.929, −0.47), 1U at the rear, facing the rear aisle
    pos: [-2.6, 1.907, -2.57], rotY: 180, sizeMm: [482, 44, 60], cordTo: 'power.outlet.w2', sockets: 6,
    sim: { collection: 'power.strips', ids: ['STRIP-A'] },
  }),
  strip({
    id: 'power.strip.b', name: 'STRIP-B', tape: 'STRIP-B — LABSIM / COLLIS ONLY', host: 'rack.b',
    pos: [-1.4, 1.907, -2.57], rotY: 180, sizeMm: [482, 44, 60], cordTo: 'power.outlet.w3', sockets: 6,
    sim: { collection: 'power.strips', ids: ['STRIP-B'] },
  }),
  strip({
    id: 'power.strip.c1', name: 'STRIP-C1', tape: 'STRIP-C1 — COLLIS RACK A', host: 'shelf.callus',
    // shelf-local (−0.15, L1 0.100, −0.40), lying on the level, sockets up
    pos: [-2.15, 0.1225, -2.5], rotY: 0, sizeMm: [250, 45, 50], cordTo: 'power.outlet.w2', sockets: 6,
    sim: { collection: 'power.strips', ids: ['STRIP-C', 'STRIP-C1'] },
    note: 'Sim seeds one STRIP-C for all Collis PSUs; C2 binds only if the sim adds it.',
  }),
  strip({
    id: 'power.strip.c2', name: 'STRIP-C2', tape: 'STRIP-C2 — COLLIS RACK B', host: 'shelf.callus',
    pos: [-1.85, 0.1225, -2.5], rotY: 0, sizeMm: [250, 45, 50], cordTo: 'power.outlet.w3', sockets: 6,
    sim: { collection: 'power.strips', ids: ['STRIP-C2'] },
  }),
  strip({
    id: 'power.strip.t', name: 'STRIP-T', tape: 'STRIP-T — LABSIM / COLLIS ONLY', host: 'rack.t',
    // S0 (top y 0.10), rear
    pos: [2.4, 0.1225, -2.4], rotY: 0, sizeMm: [450, 45, 50], cordTo: 'power.outlet.w5', sockets: 6,
    sim: { collection: 'power.strips', ids: ['STRIP-T'] },
  }),
  strip({
    id: 'power.strip.d', name: 'STRIP-D', tape: 'STRIP-D — LABSIM / COLLIS ONLY', host: 'shelf.adb',
    // lower tier (top 0.45) rear
    pos: [0.85, 0.4725, -2.12], rotY: 0, sizeMm: [450, 45, 50], cordTo: 'power.outlet.w5', sockets: 6,
    sim: { collection: 'power.strips', ids: ['STRIP-D'] },
    note: 'Sim puts DATA/TARS bricks on STRIP-T; STRIP-D binds only if the sim adds it.',
  }),
  strip({
    id: 'power.strip.w', name: 'STRIP-W', tape: 'AC STRIP — LABSIM / COLLIS ONLY', host: 'wall.power',
    pos: [0.35, 1.2, -4.9435], rotY: 0, sizeMm: [450, 50, 45], cordTo: 'power.outlet.w4', sockets: 6,
    sim: { collection: 'power.strips', ids: ['STRIP-W'] },
  }),
];

/** Socket sub-ids: `power.strip.a.s1` … `.s6` (socket n ↔ sim strip `loads[n − 1]`). */
export function stripSocketId(stripId: string, n: number): string {
  return `${stripId}.s${n}`;
}

/* ───────────────────────────── Rack-top distribution (§2.8) ───────────────────────────── */

export interface RackDistDef {
  readonly id: string;
  readonly rackId: string;
  /** Base centre (world) standing on the U41 plate: rack-local (0, 1.880, +0.40). W × H × D mm. */
  readonly pos: Vec3;
  readonly sizeMm: Vec3;
  readonly tape: string;
  readonly rail5v: SimRef;
}

export const RACK_DISTRIBUTION: readonly RackDistDef[] = [
  {
    id: 'power.rackdist.a', rackId: 'rack.a', pos: [-2.6, 1.88, -1.7], sizeMm: [300, 60, 70],
    tape: 'RACK A · 5V IN (F-5V-A) · 24V MOTOR IN', rail5v: { collection: 'power.rails', ids: ['rail-5v-a'] },
  },
  {
    id: 'power.rackdist.b', rackId: 'rack.b', pos: [-1.4, 1.88, -1.7], sizeMm: [300, 60, 70],
    tape: 'RACK B · 5V IN (F-5V-B) · 24V MOTOR IN', rail5v: { collection: 'power.rails', ids: ['rail-5v-b'] },
  },
];

/* ───────────────────────────── §9.4 Multimeter probe points ───────────────────────────── */

export interface ProbePointDef {
  /** World probe id (6 mm ring marker), e.g. `mp.fuse.5v-b.out`. */
  readonly id: string;
  /** Prop the marker sits on. */
  readonly on: string;
  /** `sim.power.measure(pointId)` id per the sim doc (§2.6 table). */
  readonly pointId: string;
  /** The World §9.4 spelling, accepted as a fallback if the sim implements that form. */
  readonly altPointId: string;
}

const WALL_FUSES: readonly { key: string; simFuse: string; regOut: string; worldFuse: string }[] = [
  { key: '12v', simFuse: 'F-NUC-12V', regOut: 'REG-12V.out', worldFuse: 'F-12V' },
  { key: '5v-a', simFuse: 'F-RACKA-5V', regOut: 'REG-5V-A.out', worldFuse: 'F-5V-A' },
  { key: '5v-b', simFuse: 'F-RACKB-5V', regOut: 'REG-5V-B.out', worldFuse: 'F-5V-B' },
  { key: '5v-c', simFuse: 'F-BENCH-5V', regOut: 'REG-5V-BENCH.out', worldFuse: 'F-5V-C' },
];

/** Probe points that do not depend on a rig (rig probe points: `rigProbePoints()` in rigs.ts). */
export function powerProbePoints(): ProbePointDef[] {
  const out: ProbePointDef[] = [];
  for (const o of OUTLETS) {
    out.push({ id: `mp.outlet.w${o.n}`, on: o.id, pointId: `WALL-${o.n}`, altPointId: `outlet:w${o.n}` });
  }
  out.push({ id: 'mp.psu.mw-1.out', on: 'power.psu.mw-1', pointId: 'MW-1.out', altPointId: 'psu:meanwell-1' });
  out.push({ id: 'mp.bus.24v', on: 'power.bus.24v', pointId: 'rail-24v', altPointId: 'rail-24v' });
  out.push({ id: 'mp.reg.12v.out', on: 'power.reg.12v', pointId: 'REG-12V.out', altPointId: 'rail-12v' });
  for (const r of ['a', 'b', 'c'] as const) {
    out.push({
      id: `mp.reg.5v-${r}.out`,
      on: `power.reg.5v-${r}`,
      pointId: r === 'c' ? 'REG-5V-BENCH.out' : `REG-5V-${r.toUpperCase()}.out`,
      altPointId: `rail-5v-${r}`,
    });
  }
  for (const f of WALL_FUSES) {
    out.push({ id: `mp.fuse.${f.key}.in`, on: `power.fuse.${f.key}`, pointId: f.regOut, altPointId: `fuse:${f.worldFuse}:in` });
    out.push({ id: `mp.fuse.${f.key}.out`, on: `power.fuse.${f.key}`, pointId: `${f.simFuse}.load`, altPointId: `fuse:${f.worldFuse}:out` });
  }
  for (const d of RACK_DISTRIBUTION) {
    const r = d.id.slice(-1);
    out.push({ id: `mp.rackdist.${r}.5v`, on: d.id, pointId: `rail-5v-${r}`, altPointId: `rail-5v-${r}` });
    out.push({ id: `mp.rackdist.${r}.24v`, on: d.id, pointId: 'rail-24v', altPointId: 'rail-24v' });
  }
  out.push({ id: 'mp.callus.12v', on: 'callus.dist-12v', pointId: 'rail-12v', altPointId: 'rail-12v' });
  for (const s of AC_STRIPS) {
    out.push({ id: `mp.strip.${s.id.split('.').pop()}`, on: s.id, pointId: s.sim.ids[0]!, altPointId: `strip:${s.id}` });
  }
  return out;
}

/** Removed fuse in hand, Ω mode: `F-<id>` (sim) / `fuse:<fuseId>:ohms` (world spelling). */
export function fuseOhmsPointId(simFuseId: string): { pointId: string; altPointId: string } {
  return { pointId: simFuseId, altPointId: `fuse:${simFuseId}:ohms` };
}

/** Fuse blade colour by rating (§6.2 `fuseBlade`). */
export const FUSE_COLORS: Readonly<Record<string, string>> = {
  '5': '#d2b48c',
  '7.5': '#8b5a2b',
  '10': '#d0211c',
  '15': '#1f6fd1',
  '20': '#f2c200',
};

/** Spare fuse tray contents (D3): rating → count. */
export const FUSE_TRAY_CONTENTS: Readonly<Record<string, number>> = { '5': 6, '7.5': 6, '10': 6, '15': 6 };
