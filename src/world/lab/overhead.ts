/**
 * Overhead (World §1.6): zinc wire-basket cable trays hung from Ø10 threaded rods with strut
 * trapezes every 1.20 m, the visible cable contents (merged per colour), and the black braided
 * drops to the rack row / tethered rack / ADB shelf.
 */
import { Float32BufferAttribute, PlaneGeometry, type BufferGeometry, type Material } from 'three';
import { CABLE_DROPS, CABLE_DROP_DIAMETER_M, ROOM, TRAYS, TRAY_SPEC, type Vec2 } from '../layout';
import { StaticBatch, xf } from './kit/batch';
import { tubeGeo } from './kit/shapes';
import { seeded } from './kit/procTex';
import type { LabCtx } from './kit/context';

const H = ROOM.interior.ceilingY;

/** Plane (length L along +X, width W along Z) with UVs in wire-grid cells (100 × 50 mm). */
function gridPlane(L: number, W: number): BufferGeometry {
  const g = new PlaneGeometry(L, W);
  const uv = g.getAttribute('uv') as Float32BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (L / 0.1), uv.getY(i) * (W / 0.05));
  return g;
}

export function buildOverhead(ctx: LabCtx): void {
  const { mats } = ctx;
  const b = new StaticBatch('overhead');
  const y0 = TRAY_SPEC.bottomY;
  const rnd = seeded(606);
  const cableMats: Material[] = [mats.cat6Yellow, mats.cat6Yellow, mats.cableBlack, mats.cableBlack, mats.wireRed, mats.wireBlack, mats.wireYellow, mats.wireOrange, mats.cableBlue, mats.cat6Yellow];

  for (const tray of TRAYS) {
    const W = tray.sectionMm[0] / 1000;
    const D = tray.sectionMm[1] / 1000;
    for (const run of tray.runs) {
      for (let i = 0; i < run.length - 1; i++) {
        const a = run[i] as Vec2;
        const c = run[i + 1] as Vec2;
        const dx = c[0] - a[0];
        const dz = c[1] - a[1];
        const L = Math.hypot(dx, dz) + W * 0.5; // overlap at corners
        const ang = Math.atan2(-dz, dx); // local +X along the run
        const mx = (a[0] + c[0]) / 2;
        const mz = (a[1] + c[1]) / 2;
        b.at(mx, 0, mz, ang, () => {
          // basket: bottom + two side walls (wire grid alpha)
          b.add(gridPlane(L, W), mats.zincMesh, xf(0, y0, 0, -Math.PI / 2, 0, 0), 'none');
          b.add(gridPlane(L, D), mats.zincMesh, xf(0, y0 + D / 2, W / 2, 0, 0, 0), 'none');
          b.add(gridPlane(L, D), mats.zincMesh, xf(0, y0 + D / 2, -W / 2, 0, 0, 0), 'none');
          // safety top wires + bottom edge wires
          for (const s of [-1, 1]) {
            b.rod([-L / 2, y0 + D, (s * W) / 2], [L / 2, y0 + D, (s * W) / 2], 0.0025, mats.zincTray, 6, 'none');
            b.rod([-L / 2, y0, (s * W) / 2], [L / 2, y0, (s * W) / 2], 0.0022, mats.zincTray, 6, 'none');
          }
          // trapezes + threaded rods every 1.2 m
          const n = Math.max(2, Math.round(L / TRAY_SPEC.rodSpacingM) + 1);
          for (let k = 0; k < n; k++) {
            const x = -L / 2 + 0.15 + ((L - 0.3) * k) / (n - 1);
            b.box(0.041, 0.021, W + 0.12, mats.zincTray, x, y0 - 0.0105, 0, 0, 'none');
            for (const s of [-1, 1]) {
              b.rod([x, y0 - 0.03, s * (W / 2 + 0.04)], [x, H, s * (W / 2 + 0.04)], TRAY_SPEC.rodDiameterM / 2, mats.zincTray, 6, 'none');
              b.add(tubeGeo([[x, y0 - 0.026, s * (W / 2 + 0.04)], [x, y0 - 0.024, s * (W / 2 + 0.04)]], 0.009, 6, 4), mats.zincTray, null, 'none');
            }
            // ceiling anchor plate
            for (const s of [-1, 1]) b.box(0.05, 0.004, 0.05, mats.zincTray, x, H - 0.002, s * (W / 2 + 0.04), 0, 'none');
          }
          // cables lying in the basket
          const count = W > 0.25 ? 10 : 6;
          for (let k = 0; k < count; k++) {
            const zz = (rnd() - 0.5) * (W - 0.05);
            const rr = k < 3 ? 0.003 : 0.0035 + rnd() * 0.002;
            const yy = y0 + rr + 0.002 + rnd() * 0.02;
            const sag = (rnd() - 0.5) * 0.02;
            b.add(
              tubeGeo([[-L / 2, yy, zz], [-L / 6, yy + 0.004, zz + sag], [L / 6, yy, zz - sag], [L / 2, yy + 0.003, zz]], rr, 6, 3),
              cableMats[k % cableMats.length]!,
              null,
              'none',
            );
          }
        });
      }
    }
  }

  /* ── braided drops (Ø 40 mm) ── */
  const r = CABLE_DROP_DIAMETER_M / 2;
  for (const d of CABLE_DROPS) {
    const [x, z] = d.at;
    b.add(
      tubeGeo(
        [
          [x, d.fromY - 0.02, z],
          [x, (d.fromY + d.toY) / 2, z + 0.01],
          [x + 0.01, d.toY - 0.05, z],
          [x + 0.03, d.toY + 0.03, z - 0.02],
        ],
        r,
        10,
        30,
      ),
      mats.braidedSleeve,
      null,
      'cast',
    );
    // velcro straps
    for (const yy of [d.fromY + 0.05, d.toY - 0.08]) b.add(tubeGeo([[x, yy, z], [x, yy + 0.02, z]], r + 0.002, 10, 2), mats.cableBlack, null, 'none');
  }

  ctx.statics.add(b);
}
