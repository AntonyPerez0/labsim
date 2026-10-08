/**
 * Finishing touches (World §1.1, §1.4, §7.1): the tool cart by the rack row (open laptop with a
 * terminal, label tape, zip-tie bag, cable coil), the anti-fatigue mat under the rack row, the green
 * LED spill decals on the floor at the rack front posts (Low–High; additive), and some lived-in
 * clutter (boxes by the storage cabinet, a step stool).
 */
import { AdditiveBlending, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three';
import { PROPS, RACKS, RACK_FRAME, getProp } from '../layout';

const BLOB_KINDS = new Set(['desk', 'bench', 'shelf', 'rack', 'tool-chest', 'cabinet', 'counter', 'cart', 'chair', 'table', 'library-shelf', 'computer']);
import { StaticBatch, prepGeometry, xf } from './kit/batch';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boxGeo, cylGeo, rboxGeo, sphereGeo, torusGeo, tubeGeo, type V3 } from './kit/shapes';
import { addTape, type LabCtx } from './kit/context';
import { radialTex, seeded } from './kit/procTex';
import { rad } from './kit/shared';
import { laptop } from './props/furniture';
import { drawOfficeScreen } from './props/screenArt';

export function buildDecor(ctx: LabCtx): void {
  const { mats } = ctx;
  const b = new StaticBatch('decor');

  /* ── tool cart ── */
  const cart = getProp('cart.tools');
  const [cw, cd, ch] = cart.size!;
  const termSlot = ctx.screens.draw(256, 160, (g, w, h) => drawOfficeScreen(g, w, h, 'laptop-code', 41));
  b.at(cart.pos[0], 0, cart.pos[2], rad(cart.rotY), () => {
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        b.box(0.025, ch - 0.09, 0.025, mats.satinBlack, sx * (cw / 2 - 0.02), 0.09 + (ch - 0.09) / 2 - 0.03, sz * (cd / 2 - 0.02));
        b.add(cylGeo(0.038, 0.038, 0.028, 14), mats.blackPlastic, xf(sx * (cw / 2 - 0.05), 0.038, sz * (cd / 2 - 0.05), 0, 0, Math.PI / 2), 'none');
        b.box(0.03, 0.03, 0.03, mats.greySteel, sx * (cw / 2 - 0.05), 0.08, sz * (cd / 2 - 0.05), 0, 'none');
      }
    for (const y of [0.13, 0.5, 0.86]) {
      b.box(cw - 0.02, 0.012, cd - 0.02, mats.satinBlack, 0, y, 0);
      for (const s of [-1, 1]) {
        b.box(cw - 0.02, 0.035, 0.008, mats.satinBlack, 0, y + 0.02, s * (cd / 2 - 0.014));
        b.box(0.008, 0.035, cd - 0.02, mats.satinBlack, s * (cw / 2 - 0.014), y + 0.02, 0);
      }
    }
    b.add(tubeGeo([[-cw / 2 + 0.02, 0.86, -cd / 2 + 0.05], [-cw / 2 - 0.06, 0.92, -cd / 2 + 0.05], [-cw / 2 - 0.06, 0.92, cd / 2 - 0.05], [-cw / 2 + 0.02, 0.86, cd / 2 - 0.05]], 0.012, 8, 30), mats.satinBlack, null, 'cast');
    // top: open laptop (terminal), label tape cassettes, zip-tie bag
    b.within(xf(0.08, 0.866, 0, 0, 0.25, 0), () => laptop(ctx, b, termSlot.page.material, (w, h) => ctx.screens.quad(w, h, termSlot), 112));
    for (let i = 0; i < 3; i++) b.add(rboxGeo(0.045, 0.012, 0.06, 0.003, 1), mats.offWhitePlastic, xf(-0.25, 0.874 + i * 0.012, -0.1, 0, 0.2 * i, 0), 'none');
    b.add(rboxGeo(0.12, 0.02, 0.18, 0.008, 2), ctx.engine.materials.get('lab.bagClear', () => new MeshStandardMaterial({ color: '#dfe5e8', roughness: 0.2, transparent: true, opacity: 0.55 })), xf(-0.24, 0.876, 0.08, 0, 0.4, 0), 'none');
    for (let i = 0; i < 12; i++) b.box(0.003, 0.002, 0.15, mats.blackPlastic, -0.26 + i * 0.004, 0.878, 0.08, 0.4, 'none');
    // middle: coiled cables
    for (const [x, m] of [[-0.15, mats.cat6Yellow], [0.12, mats.cableBlack]] as const) {
      for (let k = 0; k < 6; k++) b.add(torusGeo(0.09 - k * 0.004, 0.0035, 5, 28), m, xf(x, 0.518 + k * 0.006, 0, Math.PI / 2, 0, k * 0.4), 'none');
    }
    // bottom: a small cardboard box + a spare cradle
    b.add(boxGeo(0.3, 0.16, 0.25), mats.cardboard, xf(-0.15, 0.216, 0));
    b.add(rboxGeo(0.1, 0.03, 0.23, 0.004, 1), mats.blackPla, xf(0.18, 0.151, 0, 0, 0.3, 0));
    addTape(ctx, b, 'CART — RETURN TO JARED BENCH', 5, xf(0, 0.5, cd / 2 - 0.009));
  });

  /* ── anti-fatigue mat under the rack row ── */
  const mat = getProp('decor.mat.rack-row');
  const matMat = ctx.engine.materials.get('lab.fatigueMat', () => new MeshStandardMaterial({ color: '#3a3c3f', roughness: 0.95 }));
  b.add(rboxGeo(mat.size![0], 0.006, mat.size![1], 0.003, 1), matMat, xf(mat.pos[0], 0.003, mat.pos[2]), 'receive');

  /* ── boxes by the storage cabinet, step stool by the server shelf ── */
  const r = seeded(77);
  for (const [x, z, w, h, d] of [[5.85, -4.75, 0.4, 0.3, 0.35], [5.85, -4.75, 0.34, 0.22, 0.3], [6.1, -4.1, 0.3, 0.25, 0.3]] as const) {
    const y = x === 5.85 && h === 0.22 ? 0.3 : 0;
    b.add(boxGeo(w, h, d), mats.cardboard, xf(x, y + h / 2, z, 0, (r() - 0.5) * 0.3, 0));
    // solid: taller than the step height (the boxes are rotated ≤ ±8.6°, so pad the footprint)
    if (y === 0) {
      const hw = w / 2 + 0.03;
      const hd = d / 2 + 0.03;
      ctx.disposers.push(ctx.engine.addCollider({ min: [x - hw, 0, z - hd], max: [x + hw, y + h + (x === 5.85 ? 0.22 : 0), z + hd] }));
    }
  }
  // step stool (0.40 high, ~0.42 × 0.32 rotated 0.4 rad): a solid footprint
  ctx.disposers.push(ctx.engine.addCollider({ min: [-2.95 - 0.24, 0, -4.2 - 0.22], max: [-2.95 + 0.24, 0.42, -4.2 + 0.22] }));
  b.at(-2.95, 0, -4.2, 0.4, () => {
    b.add(rboxGeo(0.4, 0.03, 0.3, 0.01, 1), mats.red, xf(0, 0.4, 0));
    b.add(rboxGeo(0.38, 0.03, 0.12, 0.01, 1), mats.red, xf(0, 0.2, 0.12));
    for (const s of [-1, 1]) for (const t of [-1, 1]) b.add(cylGeo(0.012, 0.012, 0.4, 8), mats.chrome, xf(s * 0.17, 0.2, t * 0.12, t * 0.08, 0, 0));
  });
  ctx.statics.add(b);

  /* ── rack-front green spill (additive floor decals at the front posts, §7.1 Low–High) ── */
  const spillMat = new MeshBasicMaterial({ map: radialTex('rgba(43,255,106,1)', 'rgba(43,255,106,0)'), transparent: true, opacity: 0.15, blending: AdditiveBlending, depthWrite: false });
  spillMat.name = 'lab.rackSpill';
  const quads = [];
  for (const rk of RACKS) {
    for (const s of [-1, 1]) {
      const x = rk.pos[0] + s * (RACK_FRAME.postCentreMm.x / 1000);
      const z = rk.pos[2] + RACK_FRAME.postCentreMm.z / 1000 + 0.08;
      quads.push(prepGeometry(new PlaneGeometry(0.6, 0.6), xf(x, 0.008, z, -Math.PI / 2, 0, 0)));
    }
  }
  const spill = new Mesh(mergeGeometries(quads, false)!, spillMat);
  spill.renderOrder = 2;
  spill.name = 'lab.rackSpill';
  ctx.root.add(spill);
  /* ── Low preset: blob shadow decals under floor furniture (§7.4 "shadows off → blob decals") ── */
  const blobMat = new MeshBasicMaterial({ map: radialTex('rgba(0,0,0,1)', 'rgba(0,0,0,0)'), transparent: true, opacity: 0.35, depthWrite: false, color: 0x000000 });
  blobMat.name = 'lab.blobShadow';
  const blobs = [];
  for (const p of PROPS) {
    if (p.mount !== 'floor' || !p.size || !BLOB_KINDS.has(p.kind)) continue;
    const [w, d] = p.size;
    const g = new PlaneGeometry(w + 0.35, d + 0.35);
    blobs.push(prepGeometry(g, xf(p.pos[0], 0.006, p.pos[2], -Math.PI / 2, 0, rad(p.rotY))));
  }
  const blob = new Mesh(mergeGeometries(blobs, false)!, blobMat);
  blob.name = 'lab.blobShadows';
  blob.renderOrder = 1;
  ctx.root.add(blob);
  ctx.hooks.push(() => {
    const low = ctx.quality() === 'low';
    if (blob.visible !== low) blob.visible = low;
  });
  void sphereGeo;
  void ([] as V3[]);
}
