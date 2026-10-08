/**
 * Object-space box projection for tiling materials.
 *
 * Palette materials with tiling textures (floor, walls, ceiling, perforated steel, hex mesh,
 * aluminium, PLA, wood) ignore the mesh's own UVs and instead project the texture along the
 * dominant axis of the object-space normal, at physical scale (`tileSize` metres per texture tile).
 * World builders therefore never need to fix UVs: a 1.2 m shelf and a 0.3 m bracket built from
 * `BoxGeometry(w, h, d)` both show the holes at the real pitch. Object space (not world space)
 * means moving parts (gantries) don't make the texture swim.
 *
 * `material.clone()` keeps the projection (the clone is re-patched), so tinted variants work.
 * Caveat: scaled meshes (mesh.scale ≠ 1) stretch the projection; bake dimensions into geometry.
 */
import { MeshDepthMaterial, MeshDistanceMaterial, Vector2, type Material, type WebGLProgramParametersWithUniforms } from 'three';

const BOX_UV_CHUNK = /* glsl */ `
	vec3 bpAbsN = abs( normal );
	vec2 boxUv = ( bpAbsN.y >= bpAbsN.x && bpAbsN.y >= bpAbsN.z ) ? position.xz
		: ( ( bpAbsN.x >= bpAbsN.z ) ? vec2( position.z, position.y ) : position.xy );
	boxUv /= boxTile;
	#define uv boxUv
	#include <uv_vertex>
	#undef uv
`;

export interface ShadowMaterials {
  depth: MeshDepthMaterial;
  distance: MeshDistanceMaterial;
}

const shadowMaterials = new WeakMap<Material, ShadowMaterials>();

/** Box-projected shadow-pass materials for an alpha-tested palette material (if any). */
export function getShadowMaterials(m: Material): ShadowMaterials | undefined {
  return shadowMaterials.get(m);
}

function patch(shader: WebGLProgramParametersWithUniforms, tile: { value: Vector2 }): void {
  shader.uniforms.boxTile = tile;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nuniform vec2 boxTile;')
    .replace('#include <uv_vertex>', BOX_UV_CHUNK);
}

function patchOnly<M extends Material>(material: M, tileSize: [number, number]): M {
  const tile = { value: new Vector2(Math.max(1e-4, tileSize[0]), Math.max(1e-4, tileSize[1])) };
  material.userData.boxTile = [tile.value.x, tile.value.y];
  material.onBeforeCompile = (shader) => patch(shader, tile);
  material.customProgramCacheKey = () => 'labsim-boxproj';
  return material;
}

/**
 * Patch `material` in place to use box-projected UVs. With `castsPerforatedShadow`, matching
 * shadow-pass materials are registered so alpha-tested holes show up in shadow maps too (assigned
 * to meshes by the engine's scene scan).
 */
export function applyBoxProjection<M extends Material>(material: M, tileSize: [number, number], castsPerforatedShadow = false): M {
  patchOnly(material, tileSize);
  if (castsPerforatedShadow) {
    shadowMaterials.set(material, {
      depth: patchOnly(new MeshDepthMaterial(), tileSize),
      distance: patchOnly(new MeshDistanceMaterial(), tileSize),
    });
  }
  const baseClone = Object.getPrototypeOf(material).clone as (this: M) => M;
  (material as { clone: () => M }).clone = function cloneKeepingProjection(this: M): M {
    return applyBoxProjection(baseClone.call(this), tileSize, castsPerforatedShadow);
  };
  return material;
}
