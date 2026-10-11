import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, MeshPhysicalMaterial, MeshStandardMaterial } from 'three';
import { CheapMaterialSwapper } from './cheapMaterials';

const lam = (m: unknown) => m as MeshLambertMaterial;

describe('CheapMaterialSwapper (potato)', () => {
  it('swaps PBR materials for shared Lambert copies, keeps others, restores originals', () => {
    const std = new MeshStandardMaterial({ color: '#ff0000', emissive: '#00ff00', emissiveIntensity: 3 });
    const phys = new MeshPhysicalMaterial({ color: '#0000ff', clearcoat: 1 });
    const basic = new MeshBasicMaterial();
    const root = new Group();
    const a = new Mesh<BoxGeometry, MeshStandardMaterial | MeshLambertMaterial | MeshPhysicalMaterial>(new BoxGeometry(), std);
    const b = new Mesh(new BoxGeometry(), std);
    const c = new Mesh(new BoxGeometry(), phys);
    const d = new Mesh(new BoxGeometry(), basic);
    root.add(a, b, c, d);
    const sw = new CheapMaterialSwapper();
    sw.setEnabled(true, root);
    expect(a.material).toBeInstanceOf(MeshLambertMaterial);
    expect(a.material).toBe(b.material);
    expect(lam(a.material).color.getHexString()).toBe('ff0000');
    expect(lam(a.material).emissiveIntensity).toBe(3);
    expect(c.material).toBeInstanceOf(MeshLambertMaterial);
    expect(d.material).toBe(basic);
    expect(sw.size).toBe(2);

    // world code keeps mutating the original: sync carries it over
    std.emissiveIntensity = 0.5;
    std.color.set('#00ffff');
    sw.sync();
    expect(lam(a.material).emissiveIntensity).toBe(0.5);
    expect(lam(a.material).color.getHexString()).toBe('00ffff');

    sw.setEnabled(false, root);
    expect(a.material).toBe(std);
    expect(c.material).toBe(phys);
  });

  it('skips materials marked keepMaterial', () => {
    const m = new MeshStandardMaterial();
    m.userData.keepMaterial = true;
    const mesh = new Mesh(new BoxGeometry(), m);
    const sw = new CheapMaterialSwapper();
    sw.setEnabled(true, mesh);
    expect(mesh.material).toBe(m);
  });
});
