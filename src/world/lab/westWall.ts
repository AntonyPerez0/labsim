/**
 * West wall (World §1.4 "West wall", §6.4, §9.2): the architecture whiteboard (aluminium frame,
 * marker tray with 4 markers + eraser, Ref §2 diagram on a canvas), the roadmap cork board with its
 * headers and 8 index cards, the ESD / pool / 5444 posters and the full 10 ft 2020 extrusion on
 * wall hooks.
 */
import { CanvasTexture, Mesh, MeshPhysicalMaterial, SRGBColorSpace } from 'three';
import { getProp, type Vec3 } from '../layout';
import { StaticBatch, xf } from './kit/batch';
import { boxGeo, cylGeo, planeGeo, rboxGeo, sphereGeo } from './kit/shapes';
import { addPrint, addTape, type LabCtx } from './kit/context';
import { pickVerbs } from './kit/runtime';
import { focusBoardAt, hintGroup_, screwAt } from './kit/shared';
import { seeded } from './kit/procTex';
import { drawIndexCard, drawPoster5444, drawPosterEsd, drawPosterPool, drawRoadmapHeaders, drawWhiteboard } from './props/posters';

const FACE_X = -6.999;
const ROT = Math.PI / 2; // local +Z → world +X (into the room)

function focusBoard(ctx: LabCtx, propId: string, centre: Vec3, action: string): void {
  focusBoardAt(ctx, propId, centre, [1, 0, 0], action);
}

export function buildWestWall(ctx: LabCtx): void {
  const { mats } = ctx;
  const b = new StaticBatch('west-wall');

  /* ── whiteboard ── */
  const wb = getProp('wall.whiteboard');
  const [ww, , wh] = wb.size!;
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1117;
  drawWhiteboard(c.getContext('2d')!, c.width, c.height);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  const wbMat = new MeshPhysicalMaterial({ map: tex, roughness: 0.12, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  wbMat.name = 'whiteboard';
  const board = new Mesh(planeGeo(ww - 0.03, wh - 0.03), wbMat);
  board.position.set(FACE_X + 0.018, wb.pos[1], wb.pos[2]);
  board.rotation.y = ROT;
  board.receiveShadow = true;
  ctx.root.add(board);
  b.at(FACE_X, wb.pos[1], wb.pos[2], ROT, () => {
    b.box(ww - 0.01, wh - 0.01, 0.016, mats.whiteEnamel, 0, 0, 0.008);
    // aluminium frame
    for (const s of [-1, 1]) {
      b.box(ww, 0.018, 0.022, mats.aluminium, 0, s * (wh / 2 - 0.009), 0.011);
      b.box(0.018, wh, 0.022, mats.aluminium, s * (ww / 2 - 0.009), 0, 0.011);
    }
    for (const s of [-1, 1]) b.add(rboxGeo(0.03, 0.03, 0.025, 0.006, 1), mats.darkGreyPlastic, xf(s * (ww / 2 - 0.009), wh / 2 - 0.009, 0.013), 'none');
    // marker tray, 4 markers (black, blue, red, green) + eraser
    b.box(ww * 0.6, 0.012, 0.07, mats.aluminium, 0, -wh / 2 - 0.006, 0.035);
    b.box(ww * 0.6, 0.025, 0.004, mats.aluminium, 0, -wh / 2 + 0.006, 0.07);
    [mats.satinBlack, mats.cableBlue, mats.red, mats.greenPaint].forEach((m, i) => {
      b.add(cylGeo(0.009, 0.009, 0.12, 10), mats.whiteEnamel, xf(-0.35 + i * 0.05, -wh / 2 + 0.01, 0.04, 0, 0.1 * i, Math.PI / 2), 'none');
      b.add(cylGeo(0.0095, 0.0095, 0.03, 10), m, xf(-0.35 + i * 0.05 - 0.06, -wh / 2 + 0.01, 0.04, 0, 0.1 * i, Math.PI / 2), 'none');
    });
    b.add(rboxGeo(0.13, 0.03, 0.05, 0.006, 1), mats.blackPlastic, xf(0.2, -wh / 2 + 0.015, 0.035));
    b.box(0.13, 0.012, 0.05, ctx.engine.materials.get('lab.felt', () => new MeshPhysicalMaterial({ color: '#9b9b98', roughness: 1 })), 0.2, -wh / 2 + 0.003, 0.035, 0, 'none');
  });
  const wbProxy = ctx.ia.proxy(ctx.root, 0.04, wh, ww, xf(FACE_X + 0.02, wb.pos[1], wb.pos[2]), 'whiteboard');

  /* ── roadmap cork board ── */
  const rm = getProp('wall.roadmap');
  const [rw, , rh] = rm.size!;
  b.at(FACE_X, rm.pos[1], rm.pos[2], ROT, () => {
    b.box(rw, rh, 0.012, mats.cork, 0, 0, 0.006);
    for (const s of [-1, 1]) {
      b.box(rw + 0.04, 0.02, 0.02, mats.butcherBlock, 0, s * (rh / 2 + 0.01), 0.01);
      b.box(0.02, rh, 0.02, mats.butcherBlock, s * (rw / 2 + 0.01), 0, 0.01);
    }
    addPrint(ctx.prints, b, rw - 0.04, 0.07, 1024, 64, drawRoadmapHeaders, xf(0, rh / 2 - 0.05, 0.0125));
    // 4 column dividers (string)
    for (let i = 1; i < 4; i++) b.box(0.002, rh - 0.12, 0.002, mats.red, -rw / 2 + (i * rw) / 4, -0.04, 0.013, 0, 'none');
    // 8 index cards pinned in a pile on the right until sorted
    const r = seeded(17);
    for (let i = 0; i < 8; i++) {
      const x = rw / 2 - 0.12 - (i % 2) * 0.05 + (r() - 0.5) * 0.02;
      const y = 0.2 - i * 0.075 + (r() - 0.5) * 0.02;
      addPrint(ctx.prints, b, 0.127, 0.076, 254, 152, (g, w, h) => drawIndexCard(g, w, h, i), xf(x, y, 0.0128 + i * 0.0004, 0, 0, (r() - 0.5) * 0.15));
      b.add(sphereGeo(0.004, 8, 6), [mats.red, mats.cableBlue, mats.yellowPlastic][i % 3]!, xf(x, y + 0.03, 0.017 + i * 0.0004), 'none');
    }
  });
  const rmProxy = ctx.ia.proxy(ctx.root, 0.04, rh, rw, xf(FACE_X + 0.02, rm.pos[1], rm.pos[2]), 'roadmap');

  /* ── posters (5444 hidden in Strict) ── */
  const hb = new StaticBatch('west-hints');
  for (const [id, draw, hint] of [['poster.esd', drawPosterEsd, false], ['poster.pool', drawPosterPool, false], ['poster.5444', drawPoster5444, true]] as const) {
    const p = getProp(id);
    const bb = hint ? hb : b;
    bb.at(FACE_X, p.pos[1], p.pos[2], ROT, () => {
      addPrint(ctx.prints, bb, 0.61, 0.91, 488, 728, draw, xf(0, 0, 0.0035));
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) bb.add(cylGeo(0.006, 0.006, 0.002, 10), mats.chrome, xf(sx * 0.29, sy * 0.44, 0.0045, Math.PI / 2, 0, 0), 'none');
    });
    ctx.ia.register(id, ctx.ia.proxy(ctx.root, 0.02, 0.91, 0.61, xf(FACE_X + 0.01, p.pos[1], p.pos[2]), id), () => []);
  }
  ctx.statics.flushInto(hb, hintGroup_(ctx));

  /* ── 10 ft 2020 extrusion on two hooks ── */
  const ex = getProp('wall.extrusion-10ft');
  const L = 3.048;
  b.at(-6.96, ex.pos[1], ex.pos[2], 0, () => {
    b.add(boxGeo(0.02, 0.02, L), mats.aluminium, xf(0, 0, 0));
    for (const zz of [-L / 2 + 0.4, L / 2 - 0.4]) {
      b.box(0.04, 0.012, 0.012, mats.satinBlack, -0.02, -0.016, zz, 0, 'none');
      b.box(0.012, 0.03, 0.012, mats.satinBlack, 0.0, -0.005, zz, 0, 'none');
      screwAt(ctx, b, -0.039, -0.016, zz, [1, 0, 0], 'screwBlack');
    }
    addTape(ctx, b, '10 FT', 8, xf(0.0105, 0, 0, 0, Math.PI / 2, 0));
  });
  const exProxy = ctx.ia.proxy(ctx.root, 0.05, 0.05, L, xf(-6.96, ex.pos[1], ex.pos[2]), 'extrusion');

  ctx.statics.add(b);

  /* ── interactions ── */
  ctx.ia.register('wall.whiteboard', wbProxy, () => pickVerbs([{ key: 'E', label: 'Use whiteboard', run: () => focusBoard(ctx, 'wall.whiteboard', [FACE_X, wb.pos[1], wb.pos[2]], 'whiteboard.open') }]));
  ctx.ia.register('wall.roadmap', rmProxy, () => pickVerbs([{ key: 'E', label: 'Sort roadmap', run: () => focusBoard(ctx, 'wall.roadmap', [FACE_X, rm.pos[1], rm.pos[2]], 'roadmap.open') }]));
  ctx.ia.register('wall.extrusion-10ft', exProxy, () => []);
}

