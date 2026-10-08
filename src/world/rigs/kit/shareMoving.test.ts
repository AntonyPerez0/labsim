import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { MovingInstancer } from './shareMoving';

function rig(x: number, mat: MeshStandardMaterial, w = 1): { group: Group; mesh: Mesh } {
  const group = new Group();
  group.position.set(x, 0, 0);
  const mesh = new Mesh(new BoxGeometry(w, 1, 1), mat);
  group.add(mesh);
  return { group, mesh };
}

describe('MovingInstancer (cross-rig instancing of moving parts)', () => {
  it('instances identical geometry+material, follows the sources and hides with their ancestors', () => {
    const root = new Group();
    const mat = new MeshStandardMaterial();
    const a = rig(1, mat);
    const b = rig(2, mat);
    const odd = rig(3, mat, 2); // different geometry → stays a plain mesh
    root.add(a.group, b.group, odd.group);
    root.updateMatrixWorld(true);
    const inst = new MovingInstancer();
    inst.build([a.mesh, b.mesh, odd.mesh], root);
    expect(inst.instancedMeshes).toBe(1);
    expect(inst.saved).toBe(1);
    expect(a.mesh.layers.isEnabled(0)).toBe(false); // parked on the hidden layer
    expect(odd.mesh.layers.isEnabled(0)).toBe(true);
    const im = root.children.find((c) => c.name.startsWith('moving-inst'))! as unknown as import('three').InstancedMesh;
    const m = new Matrix4();
    im.getMatrixAt(1, m);
    expect(new Vector3().setFromMatrixPosition(m).x).toBe(2);
    // move rig b, hide rig a
    b.group.position.x = 5;
    a.group.visible = false;
    root.updateMatrixWorld(true);
    inst.update();
    im.getMatrixAt(1, m);
    expect(new Vector3().setFromMatrixPosition(m).x).toBe(5);
    im.getMatrixAt(0, m);
    expect(new Vector3().setFromMatrixScale(m).x).toBe(0);
    inst.dispose();
    expect(a.mesh.layers.isEnabled(0)).toBe(true);
  });
});
