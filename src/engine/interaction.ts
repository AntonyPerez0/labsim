/**
 * Interaction: raycast from the screen centre against registered interactables only, pick the
 * nearest one within its reach (and not behind a wall collider), build the prompt, highlight the
 * target and run verbs on key presses.
 *
 * Performance: each interactable keeps a cached local bounding sphere, so per frame we do an O(1)
 * distance cull per entry before the recursive mesh raycast; no per-frame allocations on the hot
 * path except what user `verbs()` callbacks allocate.
 */
import {
  Matrix4,
  Raycaster,
  Sphere,
  Box3,
  Vector3,
  type Intersection,
  type Material,
  type Mesh,
  type MeshStandardMaterial,
  type Object3D,
  type PerspectiveCamera,
  Color,
} from 'three';
import type { Interactable, InteractVerb } from './types';
import { type Aabb, isRayOccluded } from './collision';
import { buildPrompt, isVerbEnabled, promptMatches, type Prompt } from './prompt';
import { collectMeshes } from './renderer';

export const DEFAULT_REACH = 2.2;
const INSPECT_SECONDS = 0.5;
const CULL_MARGIN = 0.6;

interface Entry {
  i: Interactable;
  localCenter: Vector3;
  /** < 0 until first computed. */
  localRadius: number;
}

export interface InteractionHooks {
  /** Write the prompt into the store (called only when it changes). */
  writePrompt(p: Prompt | null): void;
  /** Interactable id under the crosshair changed. */
  lookingAtChanged(id: string | null): void;
  inspected(id: string): void;
  interacted(i: Interactable, verb: InteractVerb): void;
  /** A key was pressed on a target but the matching verb is disabled. */
  denied(i: Interactable, verb: InteractVerb): void;
  /** Outline (high/ultra) — returns false if outline is unavailable (use emissive fallback). */
  outline(meshes: readonly Mesh[] | null): boolean;
}

const HIGHLIGHT_TINT = new Color(0.035, 0.06, 0.045);

export class InteractionSystem {
  private entries: Entry[] = [];
  private readonly raycaster = new Raycaster();
  private readonly hits: Intersection[] = [];
  private readonly origin = new Vector3();
  private readonly dir = new Vector3();
  private readonly tmpV = new Vector3();
  private readonly tmpBox = new Box3();
  private readonly tmpSphere = new Sphere();
  private readonly tmpMat = new Matrix4();
  private target: Entry | null = null;
  private targetVerbs: InteractVerb[] = [];
  private currentPrompt: Prompt | null = null;
  private restTime = 0;
  private inspectedSent = false;
  private refreshCursor = 0;
  private readonly loggedErrors = new Set<string>();
  // highlight
  private readonly highlightMeshes: Mesh[] = [];
  private highlighted: Entry | null = null;
  private emissiveSwaps = new Map<Mesh, Material>();
  private readonly variants = new WeakMap<Material, Material>();
  /** `version` of the original material each highlight variant was last compiled against. */
  private readonly variantSrcVersion = new WeakMap<Material, number>();

  constructor(private readonly hooks: InteractionHooks) {
    this.raycaster.near = 0.01;
    // defaults are 1 m — a cable drawn as a Line inside an interactable would steal every hit
    this.raycaster.params.Line = { threshold: 0.01 };
    this.raycaster.params.Points = { threshold: 0.01 };
  }

  get targetId(): string | null {
    return this.target ? this.target.i.id : null;
  }

  register(i: Interactable): () => void {
    const e: Entry = { i, localCenter: new Vector3(), localRadius: -1 };
    this.entries.push(e);
    return () => {
      const idx = this.entries.indexOf(e);
      if (idx >= 0) this.entries.splice(idx, 1);
      if (this.target === e) this.setTarget(null);
      if (this.highlighted === e) this.clearHighlight();
    };
  }

  /** Recompute the cached local bounding sphere of an entry. */
  private refreshBounds(e: Entry): void {
    const obj = e.i.object;
    obj.updateWorldMatrix(true, false);
    this.tmpBox.setFromObject(obj); // updates descendants' world matrices as it goes
    if (this.tmpBox.isEmpty()) {
      e.localRadius = 0;
      e.localCenter.set(0, 0, 0);
    } else {
      this.tmpBox.getBoundingSphere(this.tmpSphere);
      this.tmpMat.copy(obj.matrixWorld).invert();
      e.localCenter.copy(this.tmpSphere.center).applyMatrix4(this.tmpMat);
      e.localRadius = this.tmpSphere.radius / Math.max(1e-6, obj.matrixWorld.getMaxScaleOnAxis());
    }
  }

  /**
   * Per-frame update. `enabled` false clears target & prompt (overlay open, focused, disabled).
   */
  update(dt: number, camera: PerspectiveCamera, enabled: boolean, activeTool: string, colliders: readonly Aabb[], pressed: () => InteractVerb['key'] | null): void {
    if (!enabled) {
      this.setTarget(null);
      this.writePrompt(null);
      while (pressed()) {
        /* drain */
      }
      return;
    }

    // Round-robin bounds refresh (handles children moving relative to the root; the cull margin
    // covers motion in between). Two entries per frame → 300 interactables refresh every ~2.5 s.
    for (let n = 0, count = Math.min(2, this.entries.length); n < count; n++) {
      this.refreshCursor = (this.refreshCursor + 1) % this.entries.length;
      this.refreshBounds(this.entries[this.refreshCursor]!);
    }

    camera.getWorldPosition(this.origin);
    camera.getWorldDirection(this.dir);
    this.raycaster.set(this.origin, this.dir);

    let best: Entry | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let k = 0; k < this.entries.length; k++) {
      const e = this.entries[k]!;
      const obj = e.i.object;
      if (!isShownInScene(obj)) continue;
      if (e.localRadius < 0) this.refreshBounds(e);
      const reach = e.i.reach ?? DEFAULT_REACH;
      // O(1) cull with the cached bounding sphere.
      this.tmpV.copy(e.localCenter).applyMatrix4(obj.matrixWorld);
      const r = e.localRadius * obj.matrixWorld.getMaxScaleOnAxis() + CULL_MARGIN;
      if (this.tmpV.distanceTo(this.origin) - r > reach) continue;
      this.raycaster.far = Math.min(reach, bestDist);
      this.hits.length = 0;
      this.raycaster.intersectObject(obj, true, this.hits);
      for (let h = 0; h < this.hits.length; h++) {
        const hit = this.hits[h]!;
        if (hit.distance > reach || hit.distance >= bestDist) break;
        if (!visibleUpTo(hit.object, obj)) continue;
        best = e;
        bestDist = hit.distance;
        break;
      }
    }
    if (best && colliders.length && isRayOccluded(this.origin.x, this.origin.y, this.origin.z, this.dir.x, this.dir.y, this.dir.z, bestDist, colliders)) {
      best = null;
    }
    this.setTarget(best);

    // Prompt + verbs (re-evaluated each frame while targeted).
    if (this.target) {
      let label: string;
      try {
        label = this.target.i.label();
        this.targetVerbs = this.target.i.verbs();
      } catch (err) {
        if (!this.loggedErrors.has(this.target.i.id)) {
          this.loggedErrors.add(this.target.i.id);
          console.error(`[engine] interactable "${this.target.i.id}" label/verbs threw`, err);
        }
        label = this.target.i.id;
        this.targetVerbs = [];
      }
      if (!promptMatches(this.currentPrompt, label, this.targetVerbs, activeTool)) {
        this.writePrompt(buildPrompt(label, this.targetVerbs, activeTool));
      }
      // Inspect after resting on the target.
      this.restTime += dt;
      if (!this.inspectedSent && this.restTime >= INSPECT_SECONDS) {
        this.inspectedSent = true;
        this.hooks.inspected(this.target.i.id);
      }
    } else {
      this.targetVerbs = [];
      this.writePrompt(null);
    }

    // Key presses: at most ONE verb runs per frame. A verb usually changes state (opens an
    // overlay, starts a focus, swaps a fuse), so further presses queued in the same frame are left
    // for the next frame, where they see fresh verbs — or get drained if input was disabled.
    // Presses that do nothing (no target / no matching verb) are consumed in the same loop.
    for (let key = pressed(); key; key = pressed()) {
      if (!this.target) continue;
      const verb = this.targetVerbs.find((v) => v.key === key);
      if (!verb) continue;
      const target = this.target.i;
      if (!isVerbEnabled(verb, activeTool)) {
        this.hooks.denied(target, verb);
        break;
      }
      let ok = true;
      try {
        verb.run();
      } catch (err) {
        ok = false;
        console.error(`[engine] verb "${verb.label}" on "${target.id}" threw`, err);
      }
      if (ok) this.hooks.interacted(target, verb);
      break;
    }
  }

  /**
   * Keep the cached prompt in step with the store: if something else replaced or cleared
   * `ui.prompt` (a store reset, a UI writing it), adopt that value so the next update rewrites the
   * prompt when it differs. Identity check only — call once per frame.
   */
  adoptStorePrompt(storePrompt: Prompt | null): void {
    if (storePrompt !== this.currentPrompt) this.currentPrompt = storePrompt;
  }

  private writePrompt(p: Prompt | null): void {
    if (p === null && this.currentPrompt === null) return;
    this.currentPrompt = p;
    this.hooks.writePrompt(p);
  }

  /** Force the next update to rewrite the prompt (e.g. after the store was reset). */
  invalidatePrompt(): void {
    this.currentPrompt = null;
    this.hooks.writePrompt(null);
  }

  private setTarget(e: Entry | null): void {
    if (e === this.target) return;
    this.target = e;
    this.restTime = 0;
    this.inspectedSent = false;
    this.hooks.lookingAtChanged(e ? e.i.id : null);
    this.clearHighlight();
    if (e && e.i.highlight !== false) this.applyHighlight(e);
  }

  private applyHighlight(e: Entry): void {
    this.highlighted = e;
    collectMeshes(e.i.object, this.highlightMeshes);
    if (this.hooks.outline(this.highlightMeshes)) return;
    // Emissive-tint fallback: swap in a cached tinted clone of each mesh's material.
    for (const mesh of this.highlightMeshes) {
      const mat = mesh.material as Material | Material[];
      if (Array.isArray(mat)) continue;
      const std = mat as MeshStandardMaterial;
      if (!std.isMeshStandardMaterial) continue;
      let v = this.variants.get(mat) as MeshStandardMaterial | undefined;
      if (!v) {
        v = std.clone();
        this.variants.set(mat, v);
      } else {
        v.copy(std); // pick up any changes made to the original since last time
      }
      // `copy()` doesn't recompile; if the original was flagged for a recompile (maps added /
      // removed, defines changed) since the variant was built, recompile the variant too.
      if (this.variantSrcVersion.get(v) !== std.version) {
        v.needsUpdate = true;
        this.variantSrcVersion.set(v, std.version);
      }
      v.emissive.add(HIGHLIGHT_TINT);
      v.name = `${mat.name || 'mat'}+highlight`;
      this.emissiveSwaps.set(mesh, mat);
      mesh.material = v;
    }
  }

  clearHighlight(): void {
    if (!this.highlighted) return;
    this.hooks.outline(null);
    for (const [mesh, orig] of this.emissiveSwaps) {
      // restore only if nobody replaced the material meanwhile
      if (mesh.material === this.variants.get(orig)) mesh.material = orig;
    }
    this.emissiveSwaps.clear();
    this.highlightMeshes.length = 0;
    this.highlighted = null;
  }

  /** Re-apply the highlight with the current mode (after a quality change). */
  refreshHighlight(): void {
    const e = this.target;
    this.clearHighlight();
    if (e && e.i.highlight !== false) this.applyHighlight(e);
  }
}

/** Visible itself and through all ancestors, and attached to a scene (not detached / hidden rig). */
function isShownInScene(o: Object3D): boolean {
  let cur: Object3D | null = o;
  let top: Object3D = o;
  while (cur) {
    if (!cur.visible) return false;
    top = cur;
    cur = cur.parent;
  }
  return (top as Object3D & { isScene?: boolean }).isScene === true;
}

function visibleUpTo(o: Object3D, root: Object3D): boolean {
  let cur: Object3D | null = o;
  while (cur) {
    if (!cur.visible) return false;
    if (cur === root) return true;
    cur = cur.parent;
  }
  return true;
}
