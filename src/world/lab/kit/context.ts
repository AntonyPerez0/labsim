/**
 * Shared build context for the lab builders: materials, atlases (labels / prints / small screens),
 * the instanced LED set, the interactable registry and the per-frame hook list.
 */
import {
  BoxGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Color,
  type Material,
  type Object3D,
} from 'three';
import type { Engine, Interactable, InteractVerb } from '@/engine/types';
import type { QualityPreset } from '@/core/state';
import { store } from '@/core/store';
import type { LabState } from '@/sim/types';
import { INTERACTABLE_IDS } from '../../layout';
import { CanvasAtlas, type AtlasSlot, type DrawFn } from './atlas';
import { LedSet } from './leds';
import { createLabMats, type LabMats } from './mats';
import { StaticCollector, type StaticBatch } from './batch';
import { drawTape, tapeSizeMm, type TapeStyle } from './draw';
import { InstanceSet, hexNutGeo, screwHeadGeo } from './instances';

export type FrameHook = (dt: number, t: number, lab: LabState) => void;

export interface LabCtx {
  engine: Engine;
  mats: LabMats;
  root: Group;
  labels: CanvasAtlas;
  prints: CanvasAtlas;
  screens: CanvasAtlas;
  leds: LedSet;
  /** Instanced repeated parts (screws `screw`, lugs `nut`, plus builder-defined kinds). */
  inst: InstanceSet;
  /** Lab-wide static merge: `ctx.statics.add(batch)` instead of `batch.flush(ctx.root)`. */
  statics: StaticCollector;
  ia: Interactions;
  hooks: FrameHook[];
  /** Cleanup callbacks (unregister interactables, colliders, loops). */
  disposers: (() => void)[];
  quality(): QualityPreset;
  /** Debug: static triangles each builder step queued (sandbox perf report). */
  stepTriangles: Record<string, number>;
}

export function createLabCtx(engine: Engine, root: Group): LabCtx {
  const ctx: LabCtx = {
    engine,
    mats: createLabMats(engine),
    root,
    labels: new CanvasAtlas(engine, 'lab.labels', 2048, 4, (tex) => new MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0 })),
    prints: new CanvasAtlas(engine, 'lab.prints', 2048, 6, (tex) => new MeshStandardMaterial({ map: tex, roughness: 0.78, metalness: 0 })),
    // Self-lit small screens (scope, printer LCDs, phone, readouts): unlit, peak ≈ 1.12 (§3.5).
    screens: new CanvasAtlas(engine, 'lab.screens', 1024, 4, (tex) => new MeshBasicMaterial({ map: tex, color: new Color(1.12, 1.12, 1.12), toneMapped: true })),
    leds: new LedSet('lab', 7),
    inst: new InstanceSet(),
    statics: new StaticCollector(),
    ia: new Interactions(engine),
    hooks: [],
    disposers: [],
    quality: () => store.getState().progress.settings.quality,
    stepTriangles: {},
  };
  ctx.inst.define('screw', screwHeadGeo, ctx.mats.steelChrome);
  ctx.inst.define('screwBlack', screwHeadGeo, ctx.mats.satinBlack);
  ctx.inst.define('nut', hexNutGeo, ctx.mats.steelChrome);
  return ctx;
}

/* ───────────────────────────── printed quads ───────────────────────────── */

/**
 * Add label-maker tape (§6.2) to a batch: the quad is centred on `m`'s origin and faces local +Z.
 * Returns the physical size in metres.
 */
export function addTape(ctx: LabCtx, batch: StaticBatch, text: string, capMm: number, m: Matrix4, style: TapeStyle = {}, sizeOverrideMm?: { w: number; h: number }): { w: number; h: number } {
  const sz = sizeOverrideMm ?? tapeSizeMm(text, capMm);
  const pxPerMm = Math.min(9, 900 / Math.max(sz.w, 1));
  const slot = ctx.labels.draw(sz.w * pxPerMm, sz.h * pxPerMm, (c, w, h) => drawTape(c, w, h, text, style));
  batch.add(ctx.labels.quad(sz.w / 1000, sz.h / 1000, slot), slot.page.material, m, 'receive');
  return { w: sz.w / 1000, h: sz.h / 1000 };
}

/** Add any printed artwork (posters, stickers, signs) from an atlas as a quad facing local +Z. */
export function addPrint(atlas: CanvasAtlas, batch: StaticBatch, wM: number, hM: number, pxW: number, pxH: number, draw: DrawFn, m: Matrix4): AtlasSlot {
  const slot = atlas.draw(pxW, pxH, draw);
  batch.add(atlas.quad(wM, hM, slot), slot.page.material, m, 'receive');
  return slot;
}

/* ───────────────────────────── interactables ───────────────────────────── */

export interface RegisterOpts {
  label?: () => string;
  reach?: number;
  highlight?: boolean;
}

/**
 * Registry of the lab's interactables. Labels/reach default to the World §9 catalogue
 * (`INTERACTABLE_IDS`), so prompts read exactly as specified.
 */
export class Interactions {
  private offs: (() => void)[] = [];
  readonly registered = new Map<string, Interactable>();
  private hiddenMat: Material;

  constructor(private readonly engine: Engine) {
    const m = new MeshBasicMaterial({ color: 0xff00ff });
    m.visible = false;
    m.name = 'lab.proxy';
    this.hiddenMat = m;
  }

  /** Invisible raycast proxy box (w × h × d, centred on `m`) added to `parent`. */
  proxy(parent: Object3D, w: number, h: number, d: number, m: Matrix4, name = 'proxy'): Mesh {
    const mesh = new Mesh(new BoxGeometry(w, h, d), this.hiddenMat);
    mesh.name = name;
    mesh.applyMatrix4(m);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  }

  register(id: string, object: Object3D, verbs: () => InteractVerb[], opts: RegisterOpts = {}): void {
    const spec = INTERACTABLE_IDS[id];
    const label = opts.label ?? (() => spec?.label ?? id);
    const i: Interactable = {
      id,
      object,
      label,
      verbs,
      reach: opts.reach ?? spec?.reach ?? 2.2,
      highlight: opts.highlight ?? true,
    };
    if (this.registered.has(id)) console.warn(`[world-lab] interactable registered twice: ${id}`);
    this.registered.set(id, i);
    this.offs.push(this.engine.registerInteractable(i));
  }

  dispose(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.registered.clear();
  }
}
