/**
 * Geometry helpers for the rig builders: millimetre placement, attribute normalisation for merging,
 * rounded boxes, V-slot extrusion profiles, wedges, tubes. Every builder works in millimetres and
 * converts with `MM` so the procedural tiling materials (box-projected at physical size) show their
 * textures at the real scale.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  Euler,
  ExtrudeGeometry,
  Matrix4,
  Path,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const MM = 0.001;
export const DEG = Math.PI / 180;

/** Transform spec in millimetres + radians (Euler XYZ order unless given). */
export interface Place {
  p?: readonly [number, number, number];
  r?: readonly [number, number, number];
  order?: 'XYZ' | 'YXZ' | 'ZXY' | 'ZYX' | 'XZY' | 'YZX';
  s?: readonly [number, number, number];
}

const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _s = new Vector3();

/** Matrix (metres) from a millimetre placement. */
export function placeMatrix(pl: Place = {}): Matrix4 {
  const p = pl.p ?? [0, 0, 0];
  const r = pl.r ?? [0, 0, 0];
  _e.set(r[0], r[1], r[2], pl.order ?? 'XYZ');
  _q.setFromEuler(_e);
  _v.set(p[0] * MM, p[1] * MM, p[2] * MM);
  const s = pl.s ?? [1, 1, 1];
  _s.set(s[0], s[1], s[2]);
  return new Matrix4().compose(_v, _q, _s);
}

/**
 * Normalise a geometry for merging: keep position/normal/uv only (uv zeros added when missing),
 * always indexed. Returns a NEW geometry (the input is not modified).
 */
export function prepForMerge(src: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  const pos = src.getAttribute('position');
  g.setAttribute('position', pos.clone());
  if (src.getAttribute('normal')) g.setAttribute('normal', src.getAttribute('normal').clone());
  else {
    g.setAttribute('position', pos.clone());
  }
  const uv = src.getAttribute('uv');
  g.setAttribute('uv', uv ? uv.clone() : new BufferAttribute(new Float32Array(pos.count * 2), 2));
  if (src.index) g.setIndex(src.index.clone());
  else {
    const idx = new (pos.count > 65535 ? Uint32Array : Uint16Array)(pos.count);
    for (let i = 0; i < pos.count; i++) idx[i] = i;
    g.setIndex(new BufferAttribute(idx, 1));
  }
  if (!src.getAttribute('normal')) g.computeVertexNormals();
  return g;
}

/* ───────────────────────────── primitive factories (sizes in mm, centred) ───────────────────────────── */

export function boxG(w: number, h: number, d: number): BufferGeometry {
  return new BoxGeometry(w * MM, h * MM, d * MM);
}

/** Rounded box (radius in mm, clamped to half the smallest side). */
export function rboxG(w: number, h: number, d: number, r: number, seg = 1): BufferGeometry {
  const rr = Math.max(0.01, Math.min(r, w / 2 - 0.01, h / 2 - 0.01, d / 2 - 0.01));
  return new RoundedBoxGeometry(w * MM, h * MM, d * MM, seg, rr * MM);
}

/** Cylinder along +Y (diameter, height mm). */
export function cylG(d: number, h: number, seg = 16, open = false): BufferGeometry {
  return new CylinderGeometry((d / 2) * MM, (d / 2) * MM, h * MM, seg, 1, open);
}

export function coneG(d1: number, d2: number, h: number, seg = 16): BufferGeometry {
  return new CylinderGeometry((d2 / 2) * MM, (d1 / 2) * MM, h * MM, seg, 1, false);
}

export function sphereG(d: number, ws = 12, hs = 8, thetaLen = Math.PI): BufferGeometry {
  return new SphereGeometry((d / 2) * MM, ws, hs, 0, Math.PI * 2, 0, thetaLen);
}

export function torusG(d: number, tube: number, rs = 6, ts = 16, arc = Math.PI * 2): BufferGeometry {
  return new TorusGeometry((d / 2) * MM, (tube / 2) * MM, rs, ts, arc);
}

/** Extrude a 2D outline (mm, in the XY plane) along +Z by depth mm. */
export function extrudeG(shape: Shape, depth: number, curveSegments = 4, bevel = 0): BufferGeometry {
  const g = new ExtrudeGeometry(shape, {
    depth: depth * MM,
    bevelEnabled: bevel > 0,
    bevelSize: bevel * MM,
    bevelThickness: bevel * MM,
    bevelSegments: 1,
    curveSegments,
  });
  return g;
}

/** Shape from mm points (scaled to metres). */
export function shapeMm(pts: readonly (readonly [number, number])[], holes: (readonly (readonly [number, number])[])[] = []): Shape {
  const s = new Shape();
  pts.forEach(([x, y], i) => (i === 0 ? s.moveTo(x * MM, y * MM) : s.lineTo(x * MM, y * MM)));
  s.closePath();
  for (const h of holes) {
    const p = new Path();
    h.forEach(([x, y], i) => (i === 0 ? p.moveTo(x * MM, y * MM) : p.lineTo(x * MM, y * MM)));
    p.closePath();
    s.holes.push(p);
  }
  return s;
}

/** Circle hole path (mm) for shapes. */
export function circlePath(cx: number, cy: number, r: number, seg = 12): (readonly [number, number])[] {
  const out: [number, number][] = [];
  for (let i = 0; i < seg; i++) {
    const a = (-i / seg) * Math.PI * 2;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

/** Rounded-rectangle outline (mm) centred at (cx, cy). */
export function rrectPts(cx: number, cy: number, w: number, h: number, r: number, seg = 3): [number, number][] {
  const out: [number, number][] = [];
  const rr = Math.min(r, w / 2, h / 2);
  const corners: [number, number, number][] = [
    [cx + w / 2 - rr, cy + h / 2 - rr, 0],
    [cx - w / 2 + rr, cy + h / 2 - rr, Math.PI / 2],
    [cx - w / 2 + rr, cy - h / 2 + rr, Math.PI],
    [cx + w / 2 - rr, cy - h / 2 + rr, (3 * Math.PI) / 2],
  ];
  for (const [x, y, a0] of corners) for (let i = 0; i <= seg; i++) {
    const a = a0 + (i / seg) * (Math.PI / 2);
    out.push([x + rr * Math.cos(a), y + rr * Math.sin(a)]);
  }
  return out;
}

/**
 * V-slot extrusion profile (World §6.2 `vslotProfile`): 20 × 20 or 20 × 40 outline with 6.2 mm
 * slot openings and 45° V faces, Ø 4.2 centre bores. Centred on the origin.
 */
export function vslotShape(kind: '2020' | '2040'): Shape {
  const W = 20;
  const H = kind === '2020' ? 20 : 40;
  const o = 6.2 / 2; // half slot opening
  const lip = 1.8; // wall thickness at the opening
  const vd = 3.2; // V depth beyond the lip
  const pts: [number, number][] = [];
  const hx = W / 2;
  const hy = H / 2;
  // walk the outline counter-clockwise, inserting a slot notch at each 20 mm face segment centre
  const notch = (cx: number, cy: number, nx: number, ny: number) => {
    // (nx, ny) = outward normal, tangent t = (-ny, nx)
    const tx = -ny;
    const ty = nx;
    const at = (u: number, d: number): [number, number] => [cx + tx * u - nx * d, cy + ty * u - ny * d];
    pts.push(at(-o - 0.0, 0), at(-o, lip), at(-o - vd * 0.9, lip + vd * 0.3), at(-o - vd * 0.9, lip + vd), at(o + vd * 0.9, lip + vd), at(o + vd * 0.9, lip + vd * 0.3), at(o, lip), at(o, 0));
  };
  const corner = (x: number, y: number) => pts.push([x, y]);
  // bottom face (y = -hy), normal (0,-1), going +x
  corner(-hx, -hy);
  notch(0, -hy, 0, -1);
  corner(hx, -hy);
  // right face (x = +hx), going +y
  const segs = H / 20;
  for (let i = 0; i < segs; i++) notch(hx, -hy + 10 + i * 20, 1, 0);
  corner(hx, hy);
  // top face (y = +hy), going -x
  notch(0, hy, 0, 1);
  corner(-hx, hy);
  // left face (x = -hx), going -y
  for (let i = segs - 1; i >= 0; i--) notch(-hx, -hy + 10 + i * 20, -1, 0);
  // the notch helper emits points in tangent order; fix orientation per face by construction above
  const holes = [];
  for (let i = 0; i < segs; i++) holes.push(circlePath(0, -hy + 10 + i * 20, 2.1, 10));
  return shapeMm(pts, holes);
}

const vslotCache = new Map<string, BufferGeometry>();

/** V-slot extrusion along +Z, centred (length mm). Cached per kind/length. */
export function vslotG(kind: '2020' | '2040', length: number): BufferGeometry {
  const key = `${kind}:${length.toFixed(1)}`;
  let g = vslotCache.get(key);
  if (!g) {
    g = extrudeG(vslotShape(kind), length, 2);
    g.translate(0, 0, (-length / 2) * MM);
    vslotCache.set(key, g);
  }
  return g;
}

/** Tube through mm points (radius mm). */
export function tubeG(points: readonly (readonly [number, number, number])[], d: number, radial = 8, segPerPoint = 6, closed = false): BufferGeometry {
  const curve = new CatmullRomCurve3(
    points.map(([x, y, z]) => new Vector3(x * MM, y * MM, z * MM)),
    closed,
    'catmullrom',
    0.35,
  );
  return new TubeGeometry(curve, Math.max(4, points.length * segPerPoint), (d / 2) * MM, radial, closed);
}

/** Helix coil (coiled cable / spring) along +Y from y0 to y1 (mm). */
export function helixPoints(cx: number, cz: number, y0: number, y1: number, r: number, turns: number, perTurn = 10): [number, number, number][] {
  const n = Math.max(2, Math.round(turns * perTurn));
  const out: [number, number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * turns * Math.PI * 2;
    out.push([cx + r * Math.cos(a), y0 + (y1 - y0) * t, cz + r * Math.sin(a)]);
  }
  return out;
}

/** Wedge/prism from a side profile (Y–Z plane, mm) extruded along X by width (centred). */
export function sideProfileG(profileYZ: readonly (readonly [number, number])[], width: number): BufferGeometry {
  // shape in XY where shape.x = z, shape.y = y; extrude along +Z then rotate so extrusion is X
  const s = shapeMm(profileYZ.map(([z, y]) => [z, y] as const));
  const g = extrudeG(s, width, 2);
  g.translate(0, 0, (-width / 2) * MM);
  // map (x=z, y=y, z=x) → rotate about Y by -90°: (x, y, z) → (-z?, …). Build explicitly:
  const pos = g.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const zz = pos.getX(i);
    const yy = pos.getY(i);
    const xx = pos.getZ(i);
    pos.setXYZ(i, xx, yy, zz);
  }
  // swapping two axes flips winding → reverse triangles
  const idx = g.index;
  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i + 1);
      idx.setX(i + 1, idx.getX(i + 2));
      idx.setX(i + 2, a);
    }
  }
  g.computeVertexNormals();
  return g;
}

/** Plane (w × h mm) facing +Z with UVs remapped to an atlas rect (u0, v0, u1, v1). */
export function planeUvG(w: number, h: number, uv?: readonly [number, number, number, number]): BufferGeometry {
  const g = new BufferGeometry();
  const hw = (w / 2) * MM;
  const hh = (h / 2) * MM;
  g.setAttribute('position', new BufferAttribute(new Float32Array([-hw, -hh, 0, hw, -hh, 0, hw, hh, 0, -hw, hh, 0]), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]), 3));
  const [u0, v0, u1, v1] = uv ?? [0, 0, 1, 1];
  g.setAttribute('uv', new BufferAttribute(new Float32Array([u0, v0, u1, v0, u1, v1, u0, v1]), 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}
