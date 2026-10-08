/**
 * A small procedural "electronics lab" used only as input for `PMREMGenerator.fromScene` — the
 * image-based lighting (diffuse fill + reflections) for the whole game.
 *
 * Why not three's `RoomEnvironment`? It is a photo studio: big light boxes on the side walls. In
 * our lab that showed up as side-lit studio reflections on aluminium and as near-mirror screens
 * glowing white edge to edge. This room matches the real one: warm off-white walls, a grey floor,
 * a T-bar ceiling with a grid of cool-white LED troffers (the only bright things), and dark racks
 * along the walls. Glossy black PLA, screens and extrusions therefore reflect ceiling panels and
 * racks, and the ambient light comes mostly from above, like in an office.
 *
 * Values are linear radiance (unlit `MeshBasicMaterial`); the camera sits at the origin at eye
 * height (floor at y = −1.5). The scene is built once at init and disposed right after.
 */
import { BackSide, BoxGeometry, DoubleSide, FrontSide, Mesh, MeshBasicMaterial, PlaneGeometry, Scene, type Material, type Side } from 'three';

const ROOM = { w: 14, d: 11, floor: -1.5, ceiling: 1.3 };
/** Troffer radiance (linear, slightly cool white) — ~12× the lit walls. */
const PANEL: [number, number, number] = [9.2, 9.6, 10.4];

function basic(r: number, g: number, b: number, side: Side = BackSide): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ side });
  m.color.setRGB(r, g, b); // linear working space
  return m;
}

export function createLabEnvironmentScene(): Scene {
  const scene = new Scene();
  const { w, d, floor, ceiling } = ROOM;
  const h = ceiling - floor;

  // Room shell: BoxGeometry groups are +x, −x, +y, −y, +z, −z.
  const wall = basic(0.82, 0.8, 0.76);
  const wallShade = basic(0.72, 0.7, 0.665); // the walls facing away from most panels
  const ceilingMat = basic(0.62, 0.625, 0.63);
  const floorMat = basic(0.5, 0.5, 0.495);
  const shell = new Mesh(new BoxGeometry(w, h, d), [wall, wallShade, ceilingMat, floorMat, wall, wallShade]);
  shell.position.y = floor + h / 2;
  scene.add(shell);

  // Troffer grid (0.6 × 0.6 m panels every 2.4 × 2.2 m).
  const panelGeo = new PlaneGeometry(0.6, 0.6);
  const panelMat = basic(PANEL[0], PANEL[1], PANEL[2], DoubleSide);
  for (let x = -w / 2 + 1.6; x <= w / 2 - 1.2; x += 2.4) {
    for (let z = -d / 2 + 1.4; z <= d / 2 - 1.2; z += 2.2) {
      const p = new Mesh(panelGeo, panelMat);
      p.rotation.x = Math.PI / 2;
      p.position.set(x, ceiling - 0.01, z);
      scene.add(p);
    }
  }

  // Dark racks / benches along the walls and a desk row: break up the walls in reflections and
  // give the lower hemisphere some realistic contrast.
  const rackMat = basic(0.035, 0.035, 0.037, FrontSide);
  const benchMat = basic(0.28, 0.25, 0.2, FrontSide);
  const boxes: [number, number, number, number, number, number, Material][] = [
    // w, h, d, x, z, y of the base
    [3.6, 1.9, 0.6, -2.5, -d / 2 + 0.35, floor, rackMat],
    [3.0, 1.9, 0.6, 3.2, -d / 2 + 0.35, floor, rackMat],
    [0.6, 1.9, 3.0, -w / 2 + 0.35, 1.5, floor, rackMat],
    [0.6, 1.9, 2.4, w / 2 - 0.35, -1.8, floor, rackMat],
    [3.2, 0.75, 0.8, 1.0, d / 2 - 0.5, floor, benchMat],
    [2.4, 0.75, 0.8, -3.6, d / 2 - 0.5, floor, benchMat],
  ];
  for (const [bw, bh, bd, x, z, y0, mat] of boxes) {
    const b = new Mesh(new BoxGeometry(bw, bh, bd), mat);
    b.position.set(x, y0 + bh / 2, z);
    scene.add(b);
  }
  return scene;
}

/** Free the geometries/materials of a scene built by `createLabEnvironmentScene`. */
export function disposeEnvironmentScene(scene: Scene): void {
  const mats = new Set<Material>();
  scene.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    for (const x of Array.isArray(m.material) ? m.material : [m.material]) mats.add(x);
  });
  for (const m of mats) m.dispose();
}
