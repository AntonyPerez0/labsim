/**
 * Cross-zone lab helpers: world-space points from a batch's current frame, the Strict-realism
 * "hint props" group (posters/notes hidden in Strict, World §6.3/§6.4), shared prop state (the mug
 * the coffee machine fills).
 */
import { Group, Vector3 } from 'three';
import { store } from '@/core/store';
import type { StaticBatch } from './batch';
import type { LabCtx } from './context';

const v = new Vector3();

/** World position of a point given in the batch's current local frame. */
export function wpos(b: StaticBatch, x: number, y: number, z: number): [number, number, number] {
  v.set(x, y, z).applyMatrix4(b.matrix);
  return [v.x, v.y, v.z];
}

/** World direction of a local direction in the batch's current frame. */
export function wdir(b: StaticBatch, x: number, y: number, z: number): [number, number, number] {
  v.set(x, y, z).transformDirection(b.matrix);
  return [v.x, v.y, v.z];
}

export function isStrict(): boolean {
  return store.getState().session.shift?.realism === 'strict';
}

/** Mug coffee level 0..1 (filled by the coffee machine, drunk at the desk). */
export const mugState = { fill: 0.55 };

let hintGroup: Group | null = null;

/** Group for props hidden in Strict realism (cheat posters, sticky notes). Created on demand. */
export function hintGroup_(ctx: LabCtx): Group {
  if (hintGroup && hintGroup.parent === ctx.root) return hintGroup;
  hintGroup = new Group();
  hintGroup.name = 'lab.hints';
  ctx.root.add(hintGroup);
  const g = hintGroup;
  ctx.hooks.push(() => {
    const show = !isStrict();
    if (g.visible !== show) g.visible = show;
  });
  return g;
}

export const rad = (deg: number): number => (deg * Math.PI) / 180;

import { Matrix4, Quaternion } from 'three';
import type { LabCtx as Ctx } from './context';

const UPV = new Vector3(0, 1, 0);
const nv = new Vector3();
const qq = new Quaternion();

/** Add an instanced screw head (kind `screw` / `screwBlack` / `nut`) at a local point, axis along the local normal. */
export function screwAt(ctx: Ctx, b: StaticBatch, x: number, y: number, z: number, n: [number, number, number] = [0, 0, 1], kind = 'screw'): void {
  qq.setFromUnitVectors(UPV, nv.set(...n).normalize());
  const m = new Matrix4().compose(new Vector3(x, y, z), qq, new Vector3(1, 1, 1));
  ctx.inst.add(kind, b.matrix.clone().multiply(m));
}

import { emit as emitEvt, mutate as mutateStore } from '@/core/store';
import { boardFocusPose } from '../../layout';

/** Focus a wall board (World §9.3: 1.10 m in front, eye 1.55, FOV 55), open the inspect overlay and tell missions. */
export function focusBoardAt(ctx: Ctx, propId: string, centre: [number, number, number], normal: [number, number, number], action: string): void {
  ctx.engine.exitPointerLock();
  void ctx.engine.focus(boardFocusPose(centre, normal), 600);
  mutateStore((s) => void (s.ui.overlay = { kind: 'inspect', propId }));
  emitEvt('app.action', { app: 'world', action, data: { propId } });
}
