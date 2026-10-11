/**
 * Potato preset: swap PBR materials (MeshStandard / MeshPhysical) for MeshLambert copies.
 *
 * Lambert is a diffuse-only BRDF (no GGX specular, no clearcoat/sheen lobes, no IBL lookups), which
 * is several times cheaper per fragment on weak GPUs and on software rasterisers. The copy keeps
 * what carries the look: colour, map, emissive (+ map, intensity), alpha (map, test, blending),
 * side, vertex colours, fog, and the object-space box projection (`boxProjection.ts` patches the
 * shared `uv_vertex` chunk, which Lambert uses too). Normal/roughness/metalness maps are dropped.
 *
 * World code keeps owning — and mutating — the ORIGINAL materials (LED levels, banner colours,
 * screen brightness…), so every frame `sync()` copies the cheap-to-copy dynamic fields from each
 * original to its copy, and a full re-copy + recompile happens when the original's `version`
 * changes (someone set `needsUpdate`). `scan()` (once a second, plus on demand) swaps meshes added
 * later; `restore()` puts every original back when the preset changes.
 *
 * Materials opt out with `material.userData.keepMaterial = true` (e.g. highlight variants).
 */
import { Color, MeshLambertMaterial, type Material, type Mesh, type MeshStandardMaterial, type Object3D } from 'three';

interface Pair {
  src: MeshStandardMaterial;
  dst: MeshLambertMaterial;
  version: number;
}

/** Metals have (almost) no diffuse colour; without reflections they would turn black or flat grey. */
const METAL_TINT = new Color(0.62, 0.63, 0.65);
const _c = new Color();

function isPbr(m: Material | null | undefined): m is MeshStandardMaterial {
  return !!m && (m as MeshStandardMaterial).isMeshStandardMaterial === true && !m.userData.keepMaterial;
}

export class CheapMaterialSwapper {
  private readonly pairs = new Map<Material, Pair>();
  private readonly copies = new WeakSet<Material>();
  /** mesh → original material(s) it had when swapped. */
  private readonly swapped = new Map<Mesh, Material | Material[]>();
  private active = false;

  get enabled(): boolean {
    return this.active;
  }

  /** Number of distinct materials swapped (debug). */
  get size(): number {
    return this.pairs.size;
  }

  setEnabled(on: boolean, root: Object3D): void {
    if (on === this.active) return;
    this.active = on;
    if (on) this.scan(root);
    else this.restore();
  }

  /** Swap every PBR mesh under `root` that is not swapped yet (cheap enough for ~1 Hz). */
  scan(root: Object3D): void {
    if (!this.active) return;
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        if (!mat.some(isPbr)) return;
        if (!this.swapped.has(mesh)) this.swapped.set(mesh, mat);
        mesh.material = mat.map((m) => (isPbr(m) ? this.copyOf(m) : m));
        return;
      }
      if (!isPbr(mat)) return;
      this.swapped.set(mesh, mat);
      mesh.material = this.copyOf(mat);
    });
  }

  /** Copy dynamic fields from the originals (call once per frame while enabled). */
  sync(): void {
    if (!this.active) return;
    for (const p of this.pairs.values()) {
      const s = p.src;
      const d = p.dst;
      if (s.version !== p.version) {
        p.version = s.version;
        this.copyAll(s, d);
        d.needsUpdate = true;
        continue;
      }
      this.copyColor(s, d);
      if (!d.emissive.equals(s.emissive)) d.emissive.copy(s.emissive);
      d.emissiveIntensity = s.emissiveIntensity;
      d.opacity = s.opacity;
      d.visible = s.visible;
      if (d.map !== s.map || d.emissiveMap !== s.emissiveMap || d.alphaMap !== s.alphaMap || d.transparent !== s.transparent) {
        const recompile = !!d.map !== !!s.map || !!d.emissiveMap !== !!s.emissiveMap || !!d.alphaMap !== !!s.alphaMap || d.transparent !== s.transparent;
        d.map = s.map;
        d.emissiveMap = s.emissiveMap;
        d.alphaMap = s.alphaMap;
        d.transparent = s.transparent;
        if (recompile) d.needsUpdate = true;
      }
    }
  }

  /** Put the original materials back (only where nobody replaced the copy meanwhile). */
  restore(): void {
    for (const [mesh, orig] of this.swapped) {
      const cur = mesh.material;
      if (Array.isArray(orig)) {
        if (Array.isArray(cur) && cur.some((m) => this.copies.has(m))) mesh.material = orig;
      } else if (!Array.isArray(cur) && this.copies.has(cur)) {
        mesh.material = orig;
      }
    }
    this.swapped.clear();
    for (const p of this.pairs.values()) p.dst.dispose();
    this.pairs.clear();
  }

  private copyOf(src: MeshStandardMaterial): MeshLambertMaterial {
    let p = this.pairs.get(src);
    if (!p) {
      const dst = new MeshLambertMaterial();
      dst.name = `${src.name || 'mat'}~lambert`;
      dst.userData.cheapCopyOf = src;
      this.copyAll(src, dst);
      p = { src, dst, version: src.version };
      this.pairs.set(src, p);
      this.copies.add(dst);
    }
    return p.dst;
  }

  private copyColor(s: MeshStandardMaterial, d: MeshLambertMaterial): void {
    if (s.metalness > 0.5) {
      // Metals: keep the hue but give them a light diffuse body (they read as satin grey/silver).
      _c.copy(s.color).lerp(METAL_TINT, 0.55);
      if (!d.color.equals(_c)) d.color.copy(_c);
    } else if (!d.color.equals(s.color)) d.color.copy(s.color);
  }

  private copyAll(s: MeshStandardMaterial, d: MeshLambertMaterial): void {
    this.copyColor(s, d);
    d.map = s.map;
    d.emissive.copy(s.emissive);
    d.emissiveIntensity = s.emissiveIntensity;
    d.emissiveMap = s.emissiveMap;
    d.alphaMap = s.alphaMap;
    d.alphaTest = s.alphaTest;
    d.alphaHash = s.alphaHash;
    d.transparent = s.transparent;
    d.opacity = s.opacity;
    d.depthWrite = s.depthWrite;
    d.depthTest = s.depthTest;
    d.side = s.side;
    d.vertexColors = s.vertexColors;
    d.flatShading = s.flatShading;
    d.fog = s.fog;
    d.toneMapped = s.toneMapped;
    d.visible = s.visible;
    d.blending = s.blending;
    d.colorWrite = s.colorWrite;
    d.polygonOffset = s.polygonOffset;
    d.polygonOffsetFactor = s.polygonOffsetFactor;
    d.polygonOffsetUnits = s.polygonOffsetUnits;
    d.wireframe = s.wireframe;
    d.lightMap = s.lightMap;
    d.aoMap = s.aoMap;
    d.aoMapIntensity = s.aoMapIntensity;
    // Box-projected tiling (patches `uv_vertex`, shared by the Lambert shader) and any other
    // vertex-stage patch: keep it so textures stay at physical scale.
    d.onBeforeCompile = s.onBeforeCompile;
    d.customProgramCacheKey = s.customProgramCacheKey;
    if (s.userData.boxTile) d.userData.boxTile = s.userData.boxTile;
  }
}
