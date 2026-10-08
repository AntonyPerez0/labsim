/**
 * Room shell (World §1.1): floor, walls with the door opening, rubber cove base, suspended ceiling,
 * the drywall column, the corridor outside the door (§1.1 `corridor.shell`) and the lab door with
 * its hinged leaf, vision panel, lever handles and closer (`door.lab`, dynamic collider §1.8).
 */
import { Group, Mesh, MeshStandardMaterial, Color } from 'three';
import { CORRIDOR, DOOR, ROOM } from '../layout';
import { StaticBatch, xf } from './kit/batch';
import { boxGeo, cylGeo, planeGeo, rboxGeo, tubeGeo } from './kit/shapes';
import { addPrint, addTape, type LabCtx } from './kit/context';
import { drawPlate, FONT, fitText } from './kit/draw';

const R = ROOM.interior;
const T = ROOM.wallThickness;
const H = R.ceilingY;
const COVE = ROOM.coveBase.height;

export interface DoorRig {
  /** Pivot group at the hinge; rotation.y = −angle (opens toward −Z). */
  pivot: Group;
  leaf: Group;
  handleIn: Group;
}

export function buildRoom(ctx: LabCtx): { door: DoorRig } {
  const { mats } = ctx;
  const b = new StaticBatch('room');

  /* ── floor (lab) ── */
  b.boxMin(R.minX, -0.02, R.minZ, R.maxX - R.minX, 0.02, R.maxZ - R.minZ, mats.vct, 'receive');
  // floor under the door opening (threshold) — aluminium saddle
  b.boxMin(DOOR.opening.minX, -0.01, R.maxZ, DOOR.opening.maxX - DOOR.opening.minX, 0.016, T, mats.aluminium, 'receive');

  /* ── walls (outside the interior box) ── */
  const wall = mats.wallPaint;
  // north / west / east full height
  b.boxMin(R.minX - T, 0, R.minZ - T, R.maxX - R.minX + 2 * T, H, T, wall, 'receive');
  b.boxMin(R.minX - T, 0, R.minZ, T, H, R.maxZ - R.minZ, wall, 'receive');
  b.boxMin(R.maxX, 0, R.minZ, T, H, R.maxZ - R.minZ, wall, 'receive');
  // south wall around the door opening (continues east as the corridor's north wall)
  const southEastEnd = CORRIDOR.maxX + T;
  b.boxMin(R.minX - T, 0, R.maxZ, DOOR.opening.minX - (R.minX - T), H, T, wall, 'receive');
  b.boxMin(DOOR.opening.maxX, 0, R.maxZ, southEastEnd - DOOR.opening.maxX, H, T, wall, 'receive');
  b.boxMin(DOOR.opening.minX, DOOR.opening.height, R.maxZ, DOOR.opening.maxX - DOOR.opening.minX, H - DOOR.opening.height, T, wall, 'receive');

  /* ── ceiling (fissured tiles in a T-bar grid; grid lines on k·0.6) ── */
  b.boxMin(R.minX, H, R.minZ, R.maxX - R.minX, 0.02, R.maxZ - R.minZ, mats.ceiling, 'none');
  // perimeter wall angle (white L-trim where the grid meets the walls)
  const trim = mats.whiteEnamel;
  b.boxMin(R.minX, H - 0.022, R.minZ, R.maxX - R.minX, 0.022, 0.022, trim, 'none');
  b.boxMin(R.minX, H - 0.022, R.maxZ - 0.022, R.maxX - R.minX, 0.022, 0.022, trim, 'none');
  b.boxMin(R.minX, H - 0.022, R.minZ, 0.022, 0.022, R.maxZ - R.minZ, trim, 'none');
  b.boxMin(R.maxX - 0.022, H - 0.022, R.minZ, 0.022, 0.022, R.maxZ - R.minZ, trim, 'none');

  /* ── rubber cove base (0.10 m, #1b1b1b) ── */
  const cove = mats.coveBlack;
  const ct = 0.004;
  b.boxMin(R.minX, 0, R.minZ, R.maxX - R.minX, COVE, ct, cove, 'none');
  b.boxMin(R.minX, 0, R.minZ, ct, COVE, R.maxZ - R.minZ, cove, 'none');
  b.boxMin(R.maxX - ct, 0, R.minZ, ct, COVE, R.maxZ - R.minZ, cove, 'none');
  b.boxMin(R.minX, 0, R.maxZ - ct, DOOR.opening.minX - 0.06 - R.minX, COVE, ct, cove, 'none');
  b.boxMin(DOOR.opening.maxX + 0.06, 0, R.maxZ - ct, R.maxX - DOOR.opening.maxX - 0.06, COVE, ct, cove, 'none');

  /* ── drywall column (left edge of IMG-R) ── */
  const col = ROOM.column;
  const [cw, cd, ch] = col.size;
  b.boxMin(col.pos[0] - cw / 2, 0, col.pos[2] - cd / 2, cw, ch, cd, wall, 'both');
  b.boxMin(col.pos[0] - cw / 2 - ct, 0, col.pos[2] - cd / 2 - ct, cw + 2 * ct, COVE, cd + 2 * ct, cove, 'none');
  // corner beads (slightly brighter edges)
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    b.box(0.012, ch - 0.12, 0.012, trim, col.pos[0] + (dx * cw) / 2, 0.11 + (ch - 0.12) / 2, col.pos[2] + (dz * cd) / 2, 0, 'none');
  }

  /* ── corridor (§1.1) ── */
  const c = CORRIDOR;
  const cBatch = new StaticBatch('corridor');
  cBatch.boxMin(c.minX - T, -0.02, R.maxZ + T, c.maxX - c.minX + 2 * T, 0.02, c.maxZ - (R.maxZ + T), mats.corridorVinyl, 'receive');
  cBatch.boxMin(c.minX - T, c.ceilingY, R.maxZ + T, c.maxX - c.minX + 2 * T, 0.02, c.maxZ - (R.maxZ + T), mats.ceiling, 'none');
  // corridor walls: corridor face of the lab's south wall is painted beige (thin skin)
  cBatch.boxMin(c.minX, 0, R.maxZ + T, DOOR.opening.minX - c.minX, c.ceilingY, 0.004, mats.corridorWall, 'receive');
  cBatch.boxMin(DOOR.opening.maxX, 0, R.maxZ + T, c.maxX - DOOR.opening.maxX, c.ceilingY, 0.004, mats.corridorWall, 'receive');
  cBatch.boxMin(c.minX - T, 0, c.minZ, T, c.ceilingY, c.maxZ - c.minZ, mats.corridorWall, 'receive');
  cBatch.boxMin(c.maxX, 0, c.minZ, T, c.ceilingY, c.maxZ - c.minZ, mats.corridorWall, 'receive');
  cBatch.boxMin(c.minX - T, 0, c.maxZ, c.maxX - c.minX + 2 * T, c.ceilingY, T, mats.corridorWall, 'receive');
  // corridor vinyl cove base
  const cc = mats.darkGreyPlastic;
  cBatch.boxMin(c.minX, 0, R.maxZ + T + 0.004, DOOR.opening.minX - 0.06 - c.minX, COVE, ct, cc, 'none');
  cBatch.boxMin(DOOR.opening.maxX + 0.06, 0, R.maxZ + T + 0.004, c.maxX - DOOR.opening.maxX - 0.06, COVE, ct, cc, 'none');
  cBatch.boxMin(c.minX, 0, c.maxZ - ct, c.maxX - c.minX, COVE, ct, cc, 'none');
  cBatch.boxMin(c.minX, 0, c.minZ, ct, COVE, c.maxZ - c.minZ, cc, 'none');
  cBatch.boxMin(c.maxX - ct, 0, c.minZ, ct, COVE, c.maxZ - c.minZ, cc, 'none');
  // non-interactive end doors (west and east corridor walls)
  for (const [x, dir] of [[c.minX, 1], [c.maxX, -1]] as const) {
    const zc = (c.minZ + c.maxZ) / 2;
    cBatch.box(0.05, 2.16, 1.0, mats.frameGrey, x + dir * 0.012, 1.08, zc, 0, 'none');
    cBatch.box(0.045, 2.1, 0.915, mats.doorGrey, x + dir * 0.03, 1.05, zc, 0, 'none');
    cBatch.box(0.06, 0.02, 0.13, mats.steelChrome, x + dir * 0.07, 1.0, zc + 0.36, 0, 'none');
  }
  // corridor LED panel (600 × 600)
  cBatch.box(0.6, 0.012, 0.6, mats.whiteEnamel, c.ledPanel[0], c.ceilingY - 0.006, c.ledPanel[2], 0, 'none');
  cBatch.box(0.57, 0.004, 0.57, mats.trofferLed, c.ledPanel[0], c.ceilingY - 0.013, c.ledPanel[2], 0, 'none');
  // room plate on the corridor side (§1.4 `corridor.sign`)
  addPrint(ctx.labels, cBatch, 0.3, 0.2, 600, 400, (g, w, h) => {
    g.fillStyle = '#26292c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3a3e42';
    g.fillRect(w * 0.03, h * 0.04, w * 0.94, h * 0.92);
    g.save();
    g.translate(0, h * 0.06);
    fitText(g, 'AUTOMATION LAB · 3.14', w, h * 0.5, { color: '#f4f4f0', font: FONT.UI_SANS, weight: 700, marginX: 0.08, marginY: 0.18 });
    g.restore();
    g.fillStyle = '#c8261e';
    g.fillRect(w * 0.08, h * 0.6, w * 0.84, h * 0.26);
    g.save();
    g.translate(0, h * 0.6);
    fitText(g, 'AUTHORIZED PERSONNEL ONLY', w, h * 0.26, { color: '#ffffff', font: FONT.UI_SANS, weight: 700, marginX: 0.1, marginY: 0.2 });
    g.restore();
  }, xf(6.62, 1.55, R.maxZ + T + 0.006));
  ctx.statics.add(cBatch);

  ctx.statics.add(b);

  return { door: buildDoor(ctx) };
}

/** `door.lab`: frame, hinged leaf with vision panel, lever handles, closer arm. */
function buildDoor(ctx: LabCtx): DoorRig {
  const { mats } = ctx;
  const fb = new StaticBatch('door-frame');
  const o = DOOR.opening;
  const z0 = R.maxZ; // interior wall face
  const fw = 0.05; // frame face width
  // hollow-metal frame: jambs + head wrap the wall thickness
  fb.boxMin(o.minX - fw, 0, z0 - 0.012, fw, o.height + fw, T + 0.024, mats.frameGrey, 'both');
  fb.boxMin(o.maxX, 0, z0 - 0.012, fw, o.height + fw, T + 0.024, mats.frameGrey, 'both');
  fb.boxMin(o.minX, o.height, z0 - 0.012, o.maxX - o.minX, fw, T + 0.024, mats.frameGrey, 'both');
  // door stop strips
  fb.boxMin(o.minX, 0, z0 + 0.045, 0.016, o.height, 0.02, mats.frameGrey, 'none');
  fb.boxMin(o.maxX - 0.016, 0, z0 + 0.045, 0.016, o.height, 0.02, mats.frameGrey, 'none');
  fb.boxMin(o.minX, o.height - 0.016, z0 + 0.045, o.maxX - o.minX, 0.016, 0.02, mats.frameGrey, 'none');
  // strike plate on the latch jamb
  fb.box(0.004, 0.11, 0.03, mats.steelChrome, o.minX + 0.002, 1.0, z0 + 0.025, 0, 'none');
  // closer body on the head (interior side)
  fb.add(rboxGeo(0.28, 0.06, 0.055, 0.008), mats.lightGreyMetal, xf(DOOR.hingeX - 0.24, o.height + 0.085, z0 - 0.04), 'cast');
  ctx.statics.add(fb);

  const L = DOOR.leaf;
  const pivot = new Group();
  pivot.name = 'door.lab.pivot';
  pivot.position.set(DOOR.hingeX - 0.004, 0, z0 + 0.0225);
  ctx.root.add(pivot);
  const leaf = new Group();
  leaf.name = 'door.lab.leaf';
  pivot.add(leaf);

  const lb = new StaticBatch('door-leaf');
  const lw = L.w;
  const panelX0 = -lw + DOOR.visionPanel.latchSideOffsetM; // latch-side panel edge (local)
  const vp = DOOR.visionPanel;
  // leaf with a cut-out for the vision panel: build as 4 slabs around the opening
  const vx0 = panelX0;
  const vx1 = panelX0 + vp.w;
  const leafMat = mats.doorGrey;
  lb.boxMin(-lw, 0, -L.d / 2, vx0 + lw, L.h, L.d, leafMat);
  lb.boxMin(vx1, 0, -L.d / 2, -0.004 - vx1, L.h, L.d, leafMat);
  lb.boxMin(vx0, 0, -L.d / 2, vp.w, vp.minY, L.d, leafMat);
  lb.boxMin(vx0, vp.maxY, -L.d / 2, vp.w, L.h - vp.maxY, L.d, leafMat);
  // vision panel glazing bead + glass
  for (const s of [-1, 1]) {
    lb.boxMin(vx0 - 0.012, vp.minY - 0.012, s * L.d / 2 - (s > 0 ? 0 : 0.006), vp.w + 0.024, 0.012, 0.006, mats.frameGrey, 'none');
    lb.boxMin(vx0 - 0.012, vp.maxY, s * L.d / 2 - (s > 0 ? 0 : 0.006), vp.w + 0.024, 0.012, 0.006, mats.frameGrey, 'none');
    lb.boxMin(vx0 - 0.012, vp.minY, s * L.d / 2 - (s > 0 ? 0 : 0.006), 0.012, vp.maxY - vp.minY, 0.006, mats.frameGrey, 'none');
    lb.boxMin(vx1, vp.minY, s * L.d / 2 - (s > 0 ? 0 : 0.006), 0.012, vp.maxY - vp.minY, 0.006, mats.frameGrey, 'none');
  }
  lb.add(boxGeo(vp.w, vp.maxY - vp.minY, 0.006), mats.glassClear, xf(vx0 + vp.w / 2, (vp.minY + vp.maxY) / 2, 0), 'none');
  // hinges (3 knuckles)
  for (const y of [0.25, 1.05, 1.85]) lb.add(cylGeo(0.008, 0.008, 0.1, 10), mats.steelChrome, xf(0.004, y, -L.d / 2 - 0.004), 'none');
  // kick plate (interior side)
  lb.boxMin(-lw + 0.02, 0.02, -L.d / 2 - 0.0015, lw - 0.04, 0.25, 0.0015, mats.steelChrome, 'none');
  // closer arm bracket on the leaf top
  lb.add(rboxGeo(0.07, 0.03, 0.03, 0.004), mats.lightGreyMetal, xf(-0.3, L.h - 0.04, -L.d / 2 - 0.02), 'none');
  ctx.statics.flushInto(lb, leaf, true);

  // lever handles + roses (latch side, both faces)
  const handleIn = new Group();
  const hb = new StaticBatch('door-handles');
  for (const s of [-1, 1]) {
    const z = s * (L.d / 2 + 0.006);
    hb.add(cylGeo(0.026, 0.026, 0.012, 20), mats.steelChrome, xf(-lw + 0.065, 1.0, z, Math.PI / 2, 0, 0), 'none');
    hb.add(cylGeo(0.009, 0.009, 0.06, 10), mats.steelChrome, xf(-lw + 0.065, 1.0, z + s * 0.03, Math.PI / 2, 0, 0), 'none');
    hb.add(rboxGeo(0.12, 0.018, 0.022, 0.008), mats.steelChrome, xf(-lw + 0.065 + 0.055, 1.0, z + s * 0.062), 'none');
    // cylinder lock on the corridor side
    if (s > 0) hb.add(cylGeo(0.012, 0.012, 0.01, 16), mats.brass, xf(-lw + 0.065, 1.12, z, Math.PI / 2, 0, 0), 'none');
  }
  ctx.statics.flushInto(hb, handleIn);
  leaf.add(handleIn);
  // closer arm (two links) — static decor relative to the leaf
  const arm = new StaticBatch('door-arm');
  arm.add(tubeGeo([[-0.3, L.h - 0.04, -L.d / 2 - 0.03], [-0.16, L.h + 0.06, -0.14], [-0.02, L.h + 0.08, -0.08]], 0.006, 6, 30), mats.lightGreyMetal, null, 'none');
  ctx.statics.flushInto(arm, leaf);

  return { pivot, leaf, handleIn };
}

/** Corridor-side door hardware: badge reader + its LED ring (dynamic). Returns the reader group. */
export function buildBadgeReader(ctx: LabCtx): { group: Group; ledIndex: number } {
  const { mats } = ctx;
  const g = new Group();
  g.name = 'door.badge-reader';
  const z = R.maxZ + T;
  g.position.set(5.28, 1.15, z);
  const reader = new Mesh(rboxGeo(0.05, 0.09, 0.018, 0.006), mats.blackPlastic);
  reader.position.z = 0.009;
  reader.castShadow = true;
  g.add(reader);
  const face = new Mesh(planeGeo(0.036, 0.05), new MeshStandardMaterial({ color: new Color('#0c0c0d'), roughness: 0.15 }));
  face.position.set(0, -0.008, 0.0182);
  g.add(face);
  ctx.root.add(g);
  const ledIndex = ctx.leds.add({ pos: [5.28, 1.15 + 0.032, z + 0.0182], normal: [0, 0, 1], color: '#ff2614', size: 0.008 });
  return { group: g, ledIndex };
}

/** Interior "PUSH TO EXIT" button + double light switch on the south wall. */
export function buildEntranceWallParts(ctx: LabCtx): { exitButton: Group; lightSwitch: Group } {
  const { mats } = ctx;
  const b = new StaticBatch('entrance-parts');
  const zf = R.maxZ;
  // exit button plate (green, 70 × 115)
  const exitButton = new Group();
  exitButton.name = 'door.exit-button';
  exitButton.position.set(5.28, 1.15, zf);
  exitButton.rotation.y = Math.PI;
  ctx.root.add(exitButton);
  const eb = new StaticBatch('exit');
  eb.add(rboxGeo(0.07, 0.115, 0.008, 0.004), mats.greenPaint, xf(0, 0, 0.004), 'none');
  eb.add(cylGeo(0.022, 0.024, 0.014, 24), mats.whiteEnamel, xf(0, -0.012, 0.012, Math.PI / 2, 0, 0), 'none');
  addPrint(ctx.labels, eb, 0.06, 0.022, 240, 88, (c, w, h) => drawPlate(c, w, h, 'PUSH TO EXIT', { bg: '#2c8a3c', fg: '#ffffff' }), xf(0, 0.034, 0.0082));
  ctx.statics.flushInto(eb, exitButton);

  const lightSwitch = new Group();
  lightSwitch.name = 'wall.light-switch';
  lightSwitch.position.set(5.1, 1.2, zf);
  lightSwitch.rotation.y = Math.PI;
  ctx.root.add(lightSwitch);
  const sb = new StaticBatch('light-switch');
  sb.add(rboxGeo(0.07, 0.115, 0.006, 0.003), mats.offWhitePlastic, xf(0, 0, 0.003), 'none');
  for (const x of [-0.014, 0.014]) sb.add(rboxGeo(0.02, 0.07, 0.008, 0.003), mats.whiteEnamel, xf(x, 0, 0.008, -0.08, 0, 0), 'none');
  ctx.statics.flushInto(sb, lightSwitch);
  ctx.statics.add(b);
  return { exitButton, lightSwitch };
}

export { addTape };
