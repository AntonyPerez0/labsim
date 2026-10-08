/**
 * `RigKit` — shared state every rig builder writes into: materials, the two label atlases, the
 * world-space static batches (merged per material across ALL racks/shelves = a handful of draw
 * calls), instanced pools (screws, V-wheels, NEMA-17s, limit switches), the LED pool and the screen
 * manager. `finish()` builds everything into `root`.
 */
import { BufferGeometry, Group, LatheGeometry, Matrix4, Vector2, type Material } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Engine } from '@/engine/types';
import { Atlas } from './atlas';
import { MeshBatch } from './batch';
import { MM, boxG, cylG, helixPoints, prepForMerge, rboxG, sphereG, tubeG } from './geom';
import { DynamicInstances, LedPool, StaticInstances } from './instances';
import { RigMaterials } from './materials';
import { Moving } from './moving';

function lathe(profileMm: [number, number][], seg: number): BufferGeometry {
  return new LatheGeometry(
    profileMm.map(([r, y]) => new Vector2(r * MM, y * MM)),
    seg,
  );
}

/** Button-head screw (M5 ISO 7380): Ø 9.5 × 2.75 dome, base at y 0, axis +Y. Unit = M5. */
function screwGeometry(): BufferGeometry {
  return lathe(
    [
      [0, 2.75],
      [2.4, 2.45],
      [4.2, 1.4],
      [4.75, 0.2],
    ],
    8,
  );
}

/** V-slot POM wheel Ø 24 × 10.2 with a 625 bearing face; axis +Y, centred. */
function vWheelGeometry(): BufferGeometry {
  return lathe(
    [
      [4.0, -5.1],
      [9.8, -5.1],
      [11.0, -3.2],
      [12.0, 0],
      [11.0, 3.2],
      [9.8, 5.1],
      [4.0, 5.1],
      [4.0, 4.6],
      [2.6, 4.6],
      [2.6, -4.6],
      [4.0, -4.6],
      [4.0, -5.1],
    ],
    12,
  );
}

/** NEMA-17 body (42.3² × 40, chamfered corners), centred, shaft axis +Y. Black part only. */
function nemaBodyGeometry(): BufferGeometry {
  const g = rboxG(42.3, 26, 42.3, 3.5, 1);
  return g;
}

/** NEMA-17 silver end caps + boss + shaft + GT2 pulley (merged), shaft axis +Y. */
function nemaMetalGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const top = rboxG(42.3, 7, 42.3, 3.5, 1);
  top.translate(0, (13 + 3.5) * MM, 0);
  const bot = rboxG(42.3, 7, 42.3, 3.5, 1);
  bot.translate(0, (-13 - 3.5) * MM, 0);
  const boss = cylG(22, 2, 20);
  boss.translate(0, 21 * MM, 0);
  const shaft = cylG(5, 24, 10);
  shaft.translate(0, 32 * MM, 0);
  const pulley = cylG(12.2, 8, 16);
  pulley.translate(0, 34 * MM, 0);
  const flange = cylG(16, 1.2, 16);
  flange.translate(0, 38.6 * MM, 0);
  const hub = cylG(16, 7, 16);
  hub.translate(0, 27 * MM, 0);
  for (const g of [top, bot, boss, shaft, pulley, flange, hub]) parts.push(prepForMerge(g));
  return mergeGeometries(parts, false)!;
}

/** KW12 micro switch with roller lever (black body + chrome lever merged). Body 20 × 10 × 6.4. */
function limitSwitchGeometry(): BufferGeometry {
  const body = prepForMerge(boxG(20, 10, 6.4));
  const lever = prepForMerge(boxG(16, 0.6, 4));
  lever.rotateZ(0.18);
  lever.translate(2 * MM, 6 * MM, 0);
  const roller = prepForMerge(cylG(4.8, 4, 10));
  roller.rotateX(Math.PI / 2);
  roller.translate(9.5 * MM, 7.8 * MM, 0);
  return mergeGeometries([body, lever, roller], false)!;
}

/** Unit LED lens: Ø 1 mm hemisphere dome on a short cylinder, facing +Z. */
function ledGeometry(): BufferGeometry {
  const dome = sphereG(1, 8, 3, Math.PI / 2);
  dome.rotateX(Math.PI / 2);
  dome.translate(0, 0, 0.2 * MM);
  const base = cylG(1, 0.2, 8, true);
  base.rotateX(Math.PI / 2);
  base.translate(0, 0, 0.1 * MM);
  return mergeGeometries([prepForMerge(dome), prepForMerge(base)], false)!;
}

/** Toggle bat lever Ø 3 × 12 on a short threaded bushing, pivot at the origin, lever along +Y. */
function toggleBatGeometry(): BufferGeometry {
  const bat = cylG(3, 12, 10);
  bat.translate(0, 6 * MM + 1 * MM, 0);
  const tip = sphereG(3.4, 10, 6);
  tip.translate(0, 13 * MM, 0);
  const ball = sphereG(4.5, 10, 6);
  return mergeGeometries([prepForMerge(bat), prepForMerge(tip), prepForMerge(ball)], false)!;
}

/** Orange PU coil cable: 4 loops of Ø 14 along −Z over 200 mm (scaled per instance to stretch). */
function coilGeometry(): BufferGeometry {
  const pts = helixPoints(0, 0, 0, 200, 7, 4, 10).map(([x, y, z]) => [x, z, -y] as [number, number, number]);
  return prepForMerge(tubeG(pts, 3.6, 4, 2));
}

/** Inverse of the shelf group's −90° Y rotation. */
const ROT_INV = new Matrix4().makeRotationY(Math.PI / 2);

export class RigKit {
  readonly root = new Group();
  readonly mats: RigMaterials;
  readonly tape: Atlas;
  readonly decal: Atlas;
  /** World-space static parts, merged per material at `finish()`. */
  readonly stat = new MeshBatch();
  /** Static parts that should NOT cast shadows (labels, small details, cables). */
  readonly statNoShadow = new MeshBatch();
  /** Shelf plates built in a frame rotated 90° about Y so the slots run along Z (World §2.3). */
  readonly shelfRot = new MeshBatch();
  readonly shelfRotGroup = new Group();
  readonly screwsBlack: StaticInstances;
  readonly screwsChrome: StaticInstances;
  readonly wheels: DynamicInstances;
  readonly nemaBody: DynamicInstances;
  readonly nemaMetal: DynamicInstances;
  readonly limitSwitches: DynamicInstances;
  readonly leds: LedPool;
  /** Per-frame callbacks registered by builders (binders, animators). */
  readonly tickers: ((dt: number, t: number) => void)[] = [];
  /** Moving part groups (built at `finish()`). */
  readonly movings: Moving[] = [];
  /** Parent of every interactable hit proxy. */
  readonly hits = new Group();
  /** Parent of the live screen planes (world identity). */
  readonly screens = new Group();
  /** Chrome toggle bats (MAIN/MOTOR), anchored to their pivots. */
  readonly toggleBats: DynamicInstances;
  /** Magnetic-lock belt clamps (printed body + neodymium discs), coil cables, pusher fingers, JST plugs. */
  readonly clampBodies: DynamicInstances;
  readonly magnets: DynamicInstances;
  readonly coils: DynamicInstances;
  readonly fingers: DynamicInstances;
  readonly plugs: DynamicInstances;

  constructor(readonly engine: Engine) {
    this.root.name = 'world-rigs';
    this.mats = new RigMaterials(engine);
    this.tape = new Atlas(2048, 'tape');
    this.decal = new Atlas(2048, 'decal');
    const screw = screwGeometry();
    this.screwsBlack = new StaticInstances(screw, this.mats.blackOxide, 'screws-black');
    this.screwsChrome = new StaticInstances(screw, this.mats.steelSatin, 'screws-chrome');
    this.wheels = new DynamicInstances(vWheelGeometry(), this.mats.nylonWheel, 'v-wheels');
    this.nemaBody = new DynamicInstances(nemaBodyGeometry(), this.mats.blackSteel, 'nema17-body');
    this.nemaMetal = new DynamicInstances(nemaMetalGeometry(), this.mats.aluminium, 'nema17-metal');
    this.limitSwitches = new DynamicInstances(limitSwitchGeometry(), this.mats.blackPla, 'limit-switches');
    this.leds = new LedPool(ledGeometry());
    this.toggleBats = new DynamicInstances(toggleBatGeometry(), this.mats.steelChrome, 'toggle-bats');
    this.clampBodies = new DynamicInstances(rboxG(30, 14, 12, 1.5, 1), this.mats.blackPla, 'clamp-bodies');
    this.magnets = new DynamicInstances(cylG(10, 3, 16), this.mats.steelChrome, 'magnets');
    this.coils = new DynamicInstances(coilGeometry(), this.mats.coilOrange, 'coil-cables');
    this.fingers = new DynamicInstances(rboxG(8, 6, 6, 1, 1), this.mats.blackPla, 'pusher-fingers');
    this.plugs = new DynamicInstances(rboxG(9, 7, 5, 1, 1), this.mats.whiteNylon, 'jst-plugs');
    this.hits.name = 'rig-hits';
    this.screens.name = 'rig-screens';
    this.root.add(this.hits, this.screens);
    // rotate +90° about Y: object x → world −z … we want object x along world z: rotation −90°
    this.shelfRotGroup.rotation.y = -Math.PI / 2;
    this.shelfRotGroup.name = 'shelves-rot';
  }

  /** A moving group under `parent` (default: root), merged per material at `finish()`. */
  moving(name: string, parent?: import('three').Object3D, castShadow = false): Moving {
    const m = new Moving(name, parent ?? this.root, castShadow);
    this.movings.push(m);
    return m;
  }

  /** Register a nested moving part (created with `Moving.child`) so it is built at `finish()`. */
  track(m: Moving): Moving {
    this.movings.push(m);
    return m;
  }

  /**
   * Add a horizontal perforated shelf part given its WORLD matrix: it goes into the 90°-rotated
   * shelf batch so the box-projected slots run along world Z (front to back, World §2.3).
   */
  addShelf(g: BufferGeometry, mat: Material, world: Matrix4): void {
    this.shelfRot.add(g, mat, ROT_INV.clone().multiply(world));
  }

  /** Static material set that never casts shadows (labels, LEDs, glass). */
  noShadow(...m: Material[]): Set<Material> {
    return new Set(m);
  }

  /** Build all static batches and pools into `root` (call once after every builder ran). */
  finish(): void {
    this.tape.flush();
    this.decal.flush();
    this.stat.build(this.root, { castShadow: true, receiveShadow: true, name: 'rigs-static', noShadowMaterials: new Set([this.mats.ledStripGreen, this.mats.chipArrowGreen, this.tape.material, this.decal.material]) });
    this.statNoShadow.build(this.root, { castShadow: false, receiveShadow: true, name: 'rigs-static-ns' });
    this.root.add(this.shelfRotGroup);
    this.shelfRot.build(this.shelfRotGroup, { castShadow: true, receiveShadow: true, name: 'rigs-shelves' });
    this.screwsBlack.build(this.root);
    this.screwsChrome.build(this.root);
    this.wheels.build(this.root);
    this.nemaBody.build(this.root);
    this.nemaMetal.build(this.root);
    this.limitSwitches.build(this.root);
    this.leds.build(this.root);
    this.toggleBats.build(this.root);
    for (const p of [this.clampBodies, this.magnets, this.coils, this.fingers, this.plugs]) p.build(this.root);
    for (const m of this.movings) m.build();
  }

  /** Update every dynamic pool from its anchors (call after moving groups changed). */
  updateDynamic(): void {
    this.wheels.update();
    this.nemaBody.update();
    this.nemaMetal.update();
    this.limitSwitches.update();
    this.toggleBats.update();
    for (const p of [this.clampBodies, this.magnets, this.coils, this.fingers, this.plugs]) p.update();
  }
}
