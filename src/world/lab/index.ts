/**
 * World-lab builder (World §1, §6–§9 for everything that is not a rig): room shell, ceiling,
 * lights, overhead trays, workstations, power wall, server shelf, print corner, Jared's bench +
 * parts wall + Husky + storage, west/east/south walls, device library, coffee corner.
 *
 * `buildLab` registers the static colliders (`STATIC_COLLIDERS`, incl. rack/shelf footprints),
 * the dynamic door-leaf collider and every `interactablesFor('lab')` id, starts the ambient audio
 * and installs one per-frame binder that reads `store.getState().lab` (missing sim objects render
 * the healthy state).
 */
import { Group } from 'three';
import type { Engine } from '@/engine/types';
import { store } from '@/core/store';
import { STATIC_COLLIDERS } from '../layout';
import { HARDWARE_LEAD, personName } from '@/content/team';
import { createLabCtx, type LabCtx } from './kit/context';
import { buildRoom } from './room';
import { buildLights } from './lights';
import { buildOverhead } from './overhead';
import { buildEntrance } from './entrance';
import { buildDesks } from './desks';
import { buildPowerWall } from './powerWall';
import { bindPowerWall } from './powerBind';
import { buildServer } from './server';
import { buildFab } from './fab';
import { buildJaredCorner } from './jared';
import { buildPartsWall } from './partsWall';
import { buildWestWall } from './westWall';
import { buildEastWall } from './eastWall';
import { buildSouthWall } from './southWall';
import { buildAudio } from './audio';
import { buildDecor } from './decor';

export type { LabCtx } from './kit/context';

let current: { ctx: LabCtx; root: Group; offFrame: () => void } | null = null;

/** Handle for debug tools / the sandbox. */
export function labContext(): LabCtx | null {
  return current?.ctx ?? null;
}

export async function buildLab(engine: Engine, onProgress: (p: number, label: string) => void): Promise<void> {
  disposeLab(engine);
  const root = new Group();
  root.name = 'lab';
  engine.scene.add(root);
  const ctx = createLabCtx(engine, root);

  const pause = () => new Promise<void>((r) => setTimeout(r, 0));
  const steps: [string, () => void][] = [];
  let room: ReturnType<typeof buildRoom> | null = null;
  let lights: ReturnType<typeof buildLights> | null = null;
  steps.push(['Walls, floor and ceiling…', () => (room = buildRoom(ctx))]);
  steps.push(['Ceiling lights…', () => (lights = buildLights(ctx))]);
  steps.push(['Cable trays…', () => buildOverhead(ctx)]);
  steps.push(['Entrance…', () => buildEntrance(ctx, room!.door, lights!)]);
  steps.push(['Workstations…', () => buildDesks(ctx)]);
  steps.push(['Power wall…', () => bindPowerWall(ctx, buildPowerWall(ctx))]);
  steps.push(['Server shelf…', () => buildServer(ctx)]);
  steps.push(['3D print corner…', () => buildFab(ctx)]);
  steps.push([`${personName(HARDWARE_LEAD)}'s bench…`, () => buildJaredCorner(ctx)]);
  steps.push(['Parts wall, Husky and storage…', () => buildPartsWall(ctx)]);
  steps.push(['Whiteboard and posters…', () => buildWestWall(ctx)]);
  steps.push(['Device library…', () => buildEastWall(ctx)]);
  steps.push(['Team history wall…', () => buildSouthWall(ctx)]);
  steps.push(['Finishing touches…', () => buildDecor(ctx)]);

  for (let i = 0; i < steps.length; i++) {
    const [label, fn] = steps[i]!;
    onProgress(i / (steps.length + 1), label);
    const before = ctx.statics.pendingTriangles();
    try {
      fn();
      ctx.stepTriangles[label] = ctx.statics.pendingTriangles() - before;
    } catch (err) {
      console.error(`[world-lab] ${label} failed`, err);
    }
    await pause();
  }

  ctx.labels.commit();
  ctx.prints.commit();
  ctx.screens.commit();
  ctx.leds.build(root);
  ctx.inst.build(root);
  ctx.statics.build(root);

  // Static colliders: walls, corridor, column, every floor prop (racks/shelves included), chairs.
  for (const c of STATIC_COLLIDERS) ctx.disposers.push(engine.addCollider({ min: c.min, max: c.max }));

  buildAudio(ctx, lights);
  const rig = lights as ReturnType<typeof buildLights> | null;
  let lastQuality = ctx.quality();
  ctx.hooks.push(() => {
    const q = ctx.quality();
    if (q !== lastQuality) {
      lastQuality = q;
      rig?.applyQuality(q);
    }
  });

  const offFrame = engine.onFrame((dt, t) => {
    const lab = store.getState().lab;
    for (const h of ctx.hooks) {
      try {
        h(dt, t, lab);
      } catch (err) {
        reportHookError(err);
      }
    }
    ctx.leds.flush();
  });

  current = { ctx, root, offFrame };
  onProgress(1, 'Lab ready');
}

let hookErrors = 0;
function reportHookError(err: unknown): void {
  if (hookErrors++ < 5) console.error('[world-lab] frame hook threw', err);
}

/** Remove everything `buildLab` added (rebuilds, tests). */
export function disposeLab(engine: Engine): void {
  if (!current) return;
  current.offFrame();
  current.ctx.ia.dispose();
  for (const d of current.ctx.disposers) d();
  engine.scene.remove(current.root);
  current = null;
}
