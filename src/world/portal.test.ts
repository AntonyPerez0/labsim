import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera } from 'three';
import type { Engine } from '@/engine/types';
import { DOOR, ROOM } from './layout';
import { PortalCuller } from './portal';

function box(name: string, x: number, y: number, z: number): Mesh {
  const m = new Mesh(new BoxGeometry(0.2, 0.2, 0.2), new MeshBasicMaterial());
  m.name = name;
  m.position.set(x, y, z);
  return m;
}

describe('corridor portal culling (World §10.4)', () => {
  it('hides lab meshes the door vision panel cannot show, restores them inside', () => {
    const camera = new PerspectiveCamera();
    const engine = { camera } as unknown as Engine;
    const lab = new Group();
    lab.name = 'lab';
    // door: hinge pivot + leaf (vision panel in leaf-local coordinates)
    const pivot = new Group();
    pivot.position.set(DOOR.hingeX, 0, ROOM.interior.maxZ);
    const leaf = new Group();
    pivot.add(leaf);
    lab.add(pivot);
    const panelX = DOOR.hingeX - DOOR.leaf.w + DOOR.visionPanel.latchSideOffsetM + DOOR.visionPanel.w / 2;
    const seen = box('seen', panelX, 1.5, 0); // straight through the panel
    const hidden = box('hidden', -5, 1.0, -3); // far west: not visible through a 10 cm slit
    const corridor = box('corridor', 5.9, 1.0, 6.5); // corridor side
    lab.add(seen, hidden, corridor);
    lab.updateMatrixWorld(true);
    const culler = new PortalCuller(engine, [lab], leaf, pivot);
    camera.position.set(panelX, 1.5, 6.4);
    camera.updateMatrixWorld(true);
    culler.update();
    expect(hidden.layers.isEnabled(0)).toBe(false);
    expect(seen.layers.isEnabled(0)).toBe(true);
    expect(corridor.layers.isEnabled(0)).toBe(true);
    // door opens wide → everything back
    pivot.rotation.y = -1.2;
    lab.updateMatrixWorld(true);
    culler.update();
    expect(hidden.layers.isEnabled(0)).toBe(true);
    // door shut again, then walk inside → everything back
    pivot.rotation.y = 0;
    lab.updateMatrixWorld(true);
    culler.update();
    expect(hidden.layers.isEnabled(0)).toBe(false);
    camera.position.set(5.9, 1.65, 3.0);
    camera.updateMatrixWorld(true);
    culler.update();
    expect(hidden.layers.isEnabled(0)).toBe(true);
  });
});
