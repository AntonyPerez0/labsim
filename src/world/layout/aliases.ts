/**
 * Curriculum prop aliases (World §1.10) and the complete world prop-id registry (`PROP_IDS`).
 * Lessons/missions written against 10-curriculum §0.5 ids (`prop.walle.tablet`) resolve to world
 * ids (`rig.wall-e.tablet`) with `resolvePropId`; "is the player looking at it?" checks use
 * `matchesProp` so a group id (e.g. `rack.a.rails`) matches its sub-parts (`rack.a.rails.u33-left`).
 */
import { CABLE_DROPS, CEILING_FIXTURES, CORRIDOR, SPRINKLERS, TRAYS, TROFFERS } from './room';
import { LIBRARY_ITEMS, LIBRARY_TRAYS, PROPS } from './props';
import { AC_STRIPS, OUTLETS, POWER_TRACE, POWER_WALL_PARTS, RACK_DISTRIBUTION, stripSocketId } from './power';
import { RACKS, RACK_FRAME, railUnitId } from './racks';
import { ADB_RIGS, TETHERED_RIGS, TOUCH_RIGS } from './rigs';
import { BUILD_TABLE_ITEMS, CALLUS_BOXES, CALLUS_FIXTURES, COLLIS_PROBES } from './shelves';
import { SHELF_IDS, rigPartId, touchRigPartList } from './ids';
import { INTERACTABLES } from './interactables';

const libraryAliases = Object.fromEntries(LIBRARY_ITEMS.map((it) => [`prop.device-library.${it.model}`, it.id]));

/** Curriculum `prop.*` id → world id (World §1.10). */
export const PROP_ALIASES: Readonly<Record<string, string>> = {
  'prop.walle.tablet': 'rig.wall-e.tablet',
  'prop.johnny5.tablet': 'rig.johnny-5.tablet',
  'prop.seti.tablet': 'rig.seti.tablet',
  'prop.walle.power-panel': 'rig.wall-e.power-panel',
  'prop.rack-a.rail-labels': 'rack.a.rails',
  'prop.seti-panel': 'rig.wall-e.side-panel',
  'prop.printer.prusa': 'fab.printer-prusa',
  'prop.printer.bambu': 'fab.printer-bambu',
  'prop.safety-card': 'wall.safety-card',
  'prop.walle.door': 'rig.wall-e.door',
  'prop.walle.stepper-x': 'rig.wall-e.stepper-x',
  'prop.walle.motor-pcb': 'rig.wall-e.motor-pcb',
  'prop.walle.cradle': 'rig.wall-e.cradle',
  'prop.walle.webcam': 'rig.wall-e.webcam',
  'prop.walle.carriage': 'rig.wall-e.carriage',
  'prop.walle.limit-switch-x': 'rig.wall-e.limit-x',
  'prop.walle.limit-switch-y': 'rig.wall-e.limit-y',
  'prop.walle.dip-arm': 'rig.wall-e.dip-arm',
  'prop.walle.pi': 'rig.wall-e.pi',
  'prop.bolt-bins': 'jared.bolt-bins',
  ...libraryAliases,
  'prop.family-trays': 'library.trays',
  'prop.megatron.mfd': 'rig.megatron.mfd',
  'prop.megatron.cfd': 'rig.megatron.cfd',
  'prop.optimus.mfd': 'rig.optimus.mfd',
  'prop.optimus.cfd': 'rig.optimus.cfd',
  'prop.smartstripe-probe': 'rig.megatron.smartstripe',
  'prop.hub-dock': 'rig.megatron.dock-mfd',
  'prop.meanwell-psu': 'power.psu.mw-1',
  'prop.power-trace': 'power.trace',
  'prop.regulator-12v': 'power.reg.12v',
  'prop.regulator-5v10a': 'power.reg.5v-b',
  'prop.fuse-5v-b': 'power.fuse.5v-b',
  'prop.fuse-spares': 'power.fuse-tray',
  'prop.multimeter': 'tool.multimeter',
  'prop.ac-strip': 'power.strip.w',
  'prop.flex4-psu-brick': 'power.bench.flex4-psu',
  'prop.collis-probe-spare': 'power.bench.collis-spare',
  'prop.nuc-03': 'callus.nuc-03',
  'prop.minix-01': 'callus.minix-01',
  'prop.collis-probe-a': 'collis.wall-e',
  'prop.eve.pi-power': 'rig.eve.pi-power',
  'prop.eve.device': 'rig.eve.device',
  'prop.seti.device': 'rig.seti.device',
  'prop.data.device': 'rig.data.device',
  'prop.tars.device': 'rig.tars.device',
  'prop.ruler': 'tool.ruler',
  'prop.r2d2.mfd': 'rig.r2-d2.mfd',
  'prop.r2d2.cfd': 'rig.r2-d2.cfd',
  'prop.coworker-device': 'desk.coworker-1.device',
  'prop.whiteboard': 'wall.whiteboard',
  'prop.roadmap-board': 'wall.roadmap',
  'prop.gpu-blade': 'server.blade',
  'prop.legacy-tower': 'server.tower',
  'prop.history.semi': 'wall.history.semi',
  'prop.history.sedi': 'wall.history.sedi',
  'prop.history.ipx': 'wall.history.ipx',
  'prop.history.paycore': 'wall.history.paycore',
  'prop.history.match': 'wall.history.match',
};

/**
 * Curriculum NPC alias: `npc.coworker` (the unnamed office coworker with the desk Flex on 5555) is
 * whoever sits at `desk.coworker-1` (the Flex desk).
 */
export const NPC_ALIASES: Readonly<Record<string, string>> = { 'npc.coworker': 'npc.sam' };

/** Curriculum/world id → world id (unknown ids are returned unchanged). */
export function resolvePropId(id: string): string {
  return PROP_ALIASES[id] ?? NPC_ALIASES[id] ?? id;
}

/**
 * True when `lookingAt` (the interactable under the crosshair) is the target prop or one of its
 * sub-parts. Accepts curriculum aliases: `matchesProp('prop.rack-a.rail-labels', 'rack.a.rails.u33-left')`.
 */
export function matchesProp(targetId: string, lookingAt: string | null | undefined): boolean {
  if (!lookingAt) return false;
  const world = resolvePropId(targetId);
  return lookingAt === world || lookingAt.startsWith(`${world}.`);
}

function collectPropIds(): string[] {
  const ids = new Set<string>();
  const add = (id: string) => ids.add(id);
  PROPS.forEach((p) => add(p.id));
  LIBRARY_TRAYS.forEach((t) => add(t.id));
  POWER_WALL_PARTS.forEach((p) => add(p.id));
  OUTLETS.forEach((o) => add(o.id));
  for (const s of AC_STRIPS) {
    add(s.id);
    for (let n = 1; n <= s.sockets; n++) add(stripSocketId(s.id, n));
  }
  RACK_DISTRIBUTION.forEach((d) => add(d.id));
  add(POWER_TRACE.id);
  TRAYS.forEach((t) => add(t.id));
  CABLE_DROPS.forEach((d) => add(d.id));
  TROFFERS.forEach((t) => add(t.id));
  CEILING_FIXTURES.forEach((f) => add(f.id));
  add(SPRINKLERS.id);
  add(CORRIDOR.id);
  for (const rack of RACKS) {
    add(`${rack.id}.rails`);
    for (let n = 1; n <= RACK_FRAME.units; n++) {
      add(railUnitId(rack.id, n, 'left'));
      add(railUnitId(rack.id, n, 'right'));
    }
  }
  for (const rig of TOUCH_RIGS) for (const part of touchRigPartList(rig)) add(rigPartId(rig.id, part));
  COLLIS_PROBES.forEach((c) => add(c.id));
  CALLUS_BOXES.forEach((b) => add(b.id));
  add(CALLUS_FIXTURES.dist12v.id);
  add(CALLUS_FIXTURES.monitor.id);
  add(CALLUS_FIXTURES.spare24vLead.id);
  for (const t of TETHERED_RIGS) {
    add(t.mfd.id);
    add(t.cfd.id);
    add(t.mfd.dockId);
    add(t.cfd.dockId);
    add(t.smartstripe.id);
  }
  ADB_RIGS.forEach((r) => add(r.propId));
  Object.values(SHELF_IDS).forEach(add);
  BUILD_TABLE_ITEMS.forEach((i) => add(i.id));
  INTERACTABLES.forEach((i) => add(i.id));
  return [...ids].sort();
}

/** Every world prop / interactable id (World Appendix C 1). */
export const PROP_IDS: readonly string[] = collectPropIds();

const PROP_ID_SET: ReadonlySet<string> = new Set(PROP_IDS);

export function isPropId(id: string): boolean {
  return PROP_ID_SET.has(id);
}
