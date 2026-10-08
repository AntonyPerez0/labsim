/**
 * Shared PBR palette (`MaterialLibrary`) tuned against the lab photos: matte black PLA fixtures,
 * black powder-coated perforated shelves, satin silver 2020 extrusions, warm-white LabSim plastic,
 * dark glossy screen glass and hot LED emitters for the bloom pass.
 *
 * Materials are created lazily on first access and shared — never mutate a palette material for a
 * single object; use `get('my-variant', () => base.clone() …)` instead.
 *
 * Tiling materials use object-space box projection (see `boxProjection.ts`): textures appear at
 * physical scale regardless of mesh UVs.
 */
import {
  Color,
  DoubleSide,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Vector2,
  type Material,
  type Texture,
} from 'three';
import type { MaterialLibrary } from './types';
import type { CanvasTextureLibrary } from './textures/library';
import { applyBoxProjection } from './boxProjection';

/** Emissive strength for indicator LEDs: well above the bloom threshold so only they glow. */
export const LED_INTENSITY = 7;

function tileOf(t: Texture, fallback: [number, number]): [number, number] {
  const ts = t.userData.tileSize as [number, number] | undefined;
  return ts ?? fallback;
}

/**
 * three.js replaces `envMapIntensity` with `scene.environmentIntensity` for every material that
 * has no `envMap` of its own. Palette materials that need a different reflection strength (metals,
 * glass) declare it here and get the scene's environment assigned as their own `envMap`.
 */
const OWN_ENV_INTENSITY: Readonly<Record<string, number>> = {
  // brushed metal: reflects the bright room → reads as light silver like the 2020 extrusions
  aluminium: 1.0,
  copper: 0.9,
  // near-mirror glass: at full strength it mirrors the environment's light boxes edge to edge;
  // keep powered-off screens dark with a faint room reflection (as in the photos)
  screenGlass: 0.3,
};

export class PbrMaterialLibrary implements MaterialLibrary {
  private cache = new Map<string, Material>();
  private envMap: Texture | null = null;

  constructor(private readonly tex: CanvasTextureLibrary) {}

  get(name: string, factory: () => Material): Material {
    let m = this.cache.get(name);
    if (!m) {
      m = factory();
      if (!m.name) m.name = name;
      this.cache.set(name, m);
    }
    return m;
  }

  /** Called by the engine once the PMREM environment exists (see OWN_ENV_INTENSITY). */
  setEnvironment(env: Texture | null): void {
    this.envMap = env;
    for (const [key, m] of this.cache) {
      const name = key.startsWith('palette:') ? key.slice(8) : null;
      if (name && OWN_ENV_INTENSITY[name] !== undefined) this.applyOwnEnv(m, OWN_ENV_INTENSITY[name]!);
    }
  }

  private applyOwnEnv(m: Material, intensity: number): void {
    const std = m as MeshStandardMaterial;
    if (!std.isMeshStandardMaterial) return;
    if (std.envMap !== this.envMap) {
      std.envMap = this.envMap;
      std.needsUpdate = true;
    }
    std.envMapIntensity = intensity;
  }

  private lazy<M extends Material>(name: string, make: () => M): M {
    return this.get(`palette:${name}`, () => {
      const m = make();
      m.name = name;
      const own = OWN_ENV_INTENSITY[name];
      if (own !== undefined && this.envMap) this.applyOwnEnv(m, own);
      return m;
    }) as M;
  }

  /** Every material created so far (used by the engine for recompiles on quality changes). */
  forEach(fn: (m: Material) => void): void {
    for (const m of this.cache.values()) fn(m);
  }

  get blackPla(): Material {
    return this.lazy('blackPla', () => {
      const t = this.tex.plaLayers('#222224');
      const m = new MeshPhysicalMaterial({
        color: 0xffffff,
        map: t.map,
        normalMap: t.normalMap,
        normalScale: new Vector2(0.35, 0.35),
        roughness: 0.74,
        metalness: 0,
        sheen: 0.35,
        sheenRoughness: 0.8,
        sheenColor: new Color('#3a3a3c'),
        specularIntensity: 0.6,
      });
      return applyBoxProjection(m, tileOf(t.map, [0.016, 0.016]));
    });
  }

  get blackSteel(): Material {
    return this.lazy('blackSteel', () =>
      new MeshStandardMaterial({ color: '#1e1f21', roughness: 0.5, metalness: 0.05 }),
    );
  }

  get perforatedSteel(): Material {
    return this.lazy('perforatedSteel', () => {
      const t = this.tex.perforatedSteel({ slots: true });
      const tile = tileOf(t.map, [0.1, 0.1]);
      const m = new MeshStandardMaterial({
        color: 0xffffff,
        map: t.map,
        alphaMap: t.alphaMap,
        normalMap: t.normalMap ?? null,
        normalScale: new Vector2(0.6, 0.6),
        alphaTest: 0.5,
        side: DoubleSide,
        roughness: 0.5,
        metalness: 0.05,
      });
      return applyBoxProjection(m, tile, true);
    });
  }

  get hexMesh(): Material {
    return this.lazy('hexMesh', () => {
      const t = this.tex.hexMesh();
      const tile = tileOf(t.map, [0.056, 0.0485]);
      // Bars are ~1.3 mm: alpha-tested they vanish in the mip chain (moiré stripes at distance).
      // Blend instead, so the mesh reads as a translucent dark grille far away and as crisp
      // hexagonal holes up close (mip 0 alpha is binary).
      const m = new MeshStandardMaterial({
        color: 0xffffff,
        map: t.map,
        alphaMap: t.alphaMap,
        transparent: true,
        depthWrite: false,
        // low threshold: discards the holes up close (and in shadow maps), keeps the averaged
        // (~30 %) coverage of distant mips so the grille never disappears
        alphaTest: 0.15,
        side: DoubleSide,
        roughness: 0.45,
        metalness: 0.35,
      });
      return applyBoxProjection(m, tile, true);
    });
  }

  get aluminium(): Material {
    return this.lazy('aluminium', () => {
      const t = this.tex.brushedAluminium();
      const m = new MeshStandardMaterial({
        color: new Color(1.08, 1.08, 1.1),
        map: t.map,
        roughnessMap: t.roughnessMap,
        roughness: 1, // the map encodes 0.26–0.42 (≈ 0.35)
        metalness: 1,
      });
      return applyBoxProjection(m, tileOf(t.map, [0.25, 0.25]));
    });
  }

  get labwhite(): Material {
    return this.lazy('labwhite', () =>
      new MeshPhysicalMaterial({
        color: '#ecebe5',
        roughness: 0.45,
        metalness: 0,
        clearcoat: 0.12,
        clearcoatRoughness: 0.4,
      }),
    );
  }

  get screenGlass(): Material {
    return this.lazy('screenGlass', () =>
      new MeshPhysicalMaterial({
        color: '#06080a',
        roughness: 0.06,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
        ior: 1.52,
        specularIntensity: 1,
      }),
    );
  }

  get rubber(): Material {
    return this.lazy('rubber', () => new MeshStandardMaterial({ color: '#171717', roughness: 0.92, metalness: 0 }));
  }

  get copper(): Material {
    return this.lazy('copper', () => new MeshStandardMaterial({ color: '#d4875a', roughness: 0.32, metalness: 1 }));
  }

  get pcbGreen(): Material {
    return this.lazy('pcbGreen', () =>
      new MeshPhysicalMaterial({ color: '#1c5a2b', roughness: 0.38, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.25 }),
    );
  }

  private led(name: string, hex: string, intensity = LED_INTENSITY): Material {
    return this.lazy(name, () => {
      const c = new Color(hex);
      return new MeshStandardMaterial({
        color: c.clone().multiplyScalar(0.25),
        emissive: c,
        emissiveIntensity: intensity,
        roughness: 0.3,
        metalness: 0,
      });
    });
  }

  get ledGreen(): Material {
    return this.led('ledGreen', '#2bff6a');
  }
  get ledRed(): Material {
    return this.led('ledRed', '#ff2614');
  }
  get ledBlue(): Material {
    return this.led('ledBlue', '#2f6bff', LED_INTENSITY * 1.3);
  }
  get ledAmber(): Material {
    return this.led('ledAmber', '#ffa516');
  }

  get wallPaint(): Material {
    return this.lazy('wallPaint', () => {
      const t = this.tex.wallPaint();
      const m = new MeshStandardMaterial({ color: 0xffffff, map: t.map, roughness: 0.88, metalness: 0 });
      return applyBoxProjection(m, tileOf(t.map, [1, 1]));
    });
  }

  get floor(): Material {
    return this.lazy('floor', () => {
      const t = this.tex.floorTiles();
      const m = new MeshStandardMaterial({
        color: 0xffffff,
        map: t.map,
        roughnessMap: t.roughnessMap,
        roughness: 1, // map encodes ≈ 0.45–0.85
        metalness: 0,
      });
      return applyBoxProjection(m, tileOf(t.map, [1.2, 1.2]));
    });
  }

  get ceiling(): Material {
    return this.lazy('ceiling', () => {
      const t = this.tex.ceilingTiles();
      const m = new MeshStandardMaterial({ color: 0xffffff, map: t.map, roughness: 0.95, metalness: 0 });
      return applyBoxProjection(m, tileOf(t.map, [1.2, 1.2]));
    });
  }

  get wood(): Material {
    return this.lazy('wood', () => {
      const t = this.tex.woodGrain();
      const m = new MeshStandardMaterial({ color: 0xffffff, map: t.map, roughness: 0.5, metalness: 0 });
      return applyBoxProjection(m, tileOf(t.map, [1.2, 0.6]));
    });
  }

  get plasticGrey(): Material {
    return this.lazy('plasticGrey', () => new MeshStandardMaterial({ color: '#8b8f93', roughness: 0.5, metalness: 0 }));
  }
}
