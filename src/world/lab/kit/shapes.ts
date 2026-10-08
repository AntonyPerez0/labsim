/**
 * Geometry helpers for the lab props (metres). All return fresh geometries; `StaticBatch.add`
 * normalises and merges them.
 */
import {
  BoxGeometry,
  BufferGeometry,
  CatmullRomCurve3,
  CylinderGeometry,
  ExtrudeGeometry,
  Float32BufferAttribute,
  LatheGeometry,
  PlaneGeometry,
  Shape,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export type V3 = [number, number, number];

export function boxGeo(w: number, h: number, d: number): BufferGeometry {
  return new BoxGeometry(Math.max(1e-4, w), Math.max(1e-4, h), Math.max(1e-4, d));
}

/** Rounded box (radius clamped to half the smallest side). */
export function rboxGeo(w: number, h: number, d: number, r: number, seg = 2): BufferGeometry {
  const rr = Math.max(0.0002, Math.min(r, Math.min(w, h, d) / 2 - 1e-5));
  return new RoundedBoxGeometry(w, h, d, seg, rr);
}

export function cylGeo(rTop: number, rBottom: number, h: number, seg = 16, openEnded = false): BufferGeometry {
  return new CylinderGeometry(rTop, rBottom, h, seg, 1, openEnded);
}

/** Plane facing +Z, centred. */
export function planeGeo(w: number, h: number): BufferGeometry {
  return new PlaneGeometry(w, h);
}

export interface UvRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Plane facing +Z whose UVs cover `rect` of an atlas texture. */
export function uvPlane(w: number, h: number, rect: UvRect): BufferGeometry {
  const g = new PlaneGeometry(w, h);
  const uv = g.getAttribute('uv') as Float32BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const u = uv.getX(i);
    const v = uv.getY(i);
    uv.setXY(i, rect.u0 + (rect.u1 - rect.u0) * u, rect.v0 + (rect.v1 - rect.v0) * v);
  }
  uv.needsUpdate = true;
  return g;
}

export function sphereGeo(r: number, ws = 12, hs = 8): BufferGeometry {
  return new SphereGeometry(r, ws, hs);
}

export function torusGeo(R: number, r: number, radial = 8, tubular = 16, arc = Math.PI * 2): BufferGeometry {
  return new TorusGeometry(R, r, radial, tubular, arc);
}

/** Smooth tube through the points (cables, hoses). */
export function tubeGeo(points: V3[], r: number, radial = 6, tubularPerM = 40, closed = false): BufferGeometry {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)), closed, 'centripetal');
  const len = curve.getLength();
  const seg = Math.max(4, Math.ceil(len * tubularPerM));
  return new TubeGeometry(curve, seg, r, radial, closed);
}

/** Lathe around Y from [radius, y] profile points. */
export function latheGeo(profile: [number, number][], seg = 24): BufferGeometry {
  return new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), seg);
}

/** Rounded rectangle shape centred on the origin. */
export function roundedRectShape(w: number, h: number, r: number): Shape {
  const s = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  const rr = Math.min(r, w / 2, h / 2);
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

/** Extrude a shape in its XY plane along +Z by `depth` (geometry spans z 0…depth). */
export function extrudeGeo(shape: Shape, depth: number, bevel = 0, curveSegments = 6): BufferGeometry {
  return new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
    curveSegments,
  });
}

/**
 * Prism from a side profile: `profile` is a polygon in the (z, y) plane (z forward, y up),
 * extruded symmetrically along X by `width`. Used for wedges (phones, monitors, printers).
 */
export function profileGeo(profile: [number, number][], width: number, bevel = 0): BufferGeometry {
  const s = new Shape();
  // Shape x = −z so that rotateY(+90°), which maps (x, y, z) → (z, y, −x), yields Z = profile z.
  profile.forEach(([z, y], i) => (i === 0 ? s.moveTo(-z, y) : s.lineTo(-z, y)));
  s.closePath();
  const g = extrudeGeo(s, width, bevel, 2);
  g.rotateY(Math.PI / 2);
  g.translate(-width / 2, 0, 0);
  return g;
}

/** Ring (annulus) in the XY plane facing +Z. */
export function ringGeo(rOuter: number, rInner: number, seg = 24): BufferGeometry {
  const s = new Shape();
  s.absarc(0, 0, rOuter, 0, Math.PI * 2, false);
  const hole = new Shape();
  hole.absarc(0, 0, rInner, 0, Math.PI * 2, true);
  s.holes.push(hole);
  return extrudeGeo(s, 0.0005, 0, seg);
}

/** Simple quad from 4 corner points (counter-clockwise seen from the front). */
export function quadGeo(a: V3, b: V3, c: V3, d: V3): BufferGeometry {
  const g = new BufferGeometry();
  const pos = [...a, ...b, ...c, ...a, ...c, ...d];
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  g.computeVertexNormals();
  return g;
}
