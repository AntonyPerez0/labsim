/**
 * End-to-end checks for the integrated world sandbox (`window.__world.check.*`). They drive the
 * real engine (interaction raycast, prompts, game loop) and the real SimApi, and read back what the
 * 3D view shows (LED levels, tablet canvas pixels, carriage transforms, screen meshes).
 */
import { Box3, PerspectiveCamera, Texture, Vector3, type Object3D, type PlaneGeometry } from 'three';
import { render2d } from '@/render2d';
import type { Engine, Interactable } from '@/engine/types';
import type { LabEngine } from '@/engine/engine';
import { store } from '@/core/store';
import { bus } from '@/core/bus';
import { sim } from '@/sim';
import type { LabState } from '@/sim/types';
import { LOCATIONS, TOUCH_RIGS } from './layout';
import { rigsWorld } from './rigs';
import { toAabbs, walkAll, type WalkResult } from './navcheck';

/** Every interactable registered through the engine, by id (captured by the sandbox). */
export const captured = new Map<string, Interactable[]>();

export function captureInteractables(engine: Engine): void {
  const orig = engine.registerInteractable.bind(engine);
  engine.registerInteractable = (i: Interactable) => {
    const list = captured.get(i.id) ?? [];
    list.push(i);
    captured.set(i.id, list);
    const off = orig(i);
    return () => {
      off();
      const l = captured.get(i.id);
      const k = l?.indexOf(i) ?? -1;
      if (l && k >= 0) l.splice(k, 1);
    };
  };
}

/** The LabEngine privates the checks read (runtime-only access; not part of the contract). */
interface EngineInternals {
  interaction: { update: (...a: unknown[]) => void; targetId: string | null };
  colliders: { boxes: import('@/engine/collision').Aabb[] };
  player: LabEngine['player'];
}
const internals = (e: Engine) => e as unknown as EngineInternals;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function until(pred: () => boolean, timeoutMs: number, stepMs = 100): Promise<boolean> {
  const t0 = performance.now();
  while (performance.now() - t0 < timeoutMs) {
    if (pred()) return true;
    await wait(stepMs);
  }
  return pred();
}

const lab = () => store.getState().lab as LabState;

/* ───────────────────────────── aiming at interactables ───────────────────────────── */

const probeCam = new PerspectiveCamera(70, 16 / 9, 0.05, 50);
const tmpBox = new Box3();
const tmpC = new Vector3();

function isShown(o: Object3D): boolean {
  for (let p: Object3D | null = o; p; p = p.parent) if (!p.visible) return false;
  return true;
}

function feetFree(boxes: EngineInternals['colliders']['boxes'], x: number, z: number, r = 0.3): boolean {
  for (const b of boxes) {
    if (b.maxY <= 0.13 || b.minY > 1.7) continue;
    const dx = Math.max(b.minX - x, 0, x - b.maxX);
    const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
    if (dx * dx + dz * dz < r * r) return false;
  }
  return x > -6.95 && x < 6.95 && z > -4.95 && (z < 4.95 || (x > 3.45 && x < 8.35 && z < 7.1));
}

export interface AimResult {
  id: string;
  ok: boolean;
  feet?: [number, number, number];
  yaw?: number;
  pitch?: number;
  eyeY?: number;
  hitId?: string | null;
}

/**
 * Find a standing (eye 1.65 m) or crouched (eye 1.1 m) pose from which the engine's own
 * interaction raycast targets `id`. Tries 16 directions × 4 distances around the object's centre.
 */
export function findAim(engine: Engine, id: string): AimResult {
  const e = internals(engine);
  const ia = captured.get(id)?.find((i) => isShown(i.object));
  if (!ia) return { id, ok: false, hitId: null };
  ia.object.updateWorldMatrix(true, true);
  tmpBox.setFromObject(ia.object);
  if (tmpBox.isEmpty()) return { id, ok: false };
  tmpBox.getCenter(tmpC);
  const size = tmpBox.getSize(new Vector3());
  // aim at the centre first, then at off-centre points (a proxy can be covered in the middle,
  // e.g. a cradle under its device, and still be targetable at its rim)
  const targets = [tmpC.clone()];
  for (const [fx, fy, fz] of [[0.4, 0, 0], [-0.4, 0, 0], [0, 0, 0.4], [0, 0, -0.4], [0, 0.4, 0], [0, -0.4, 0]] as const) {
    targets.push(tmpC.clone().add(new Vector3(fx * size.x, fy * size.y, fz * size.z)));
  }
  const boxes = e.colliders.boxes;
  const tool = store.getState().session.activeTool;
  const reach = ia.reach ?? 2.2;
  let lastHit: string | null = null;
  for (const c of targets) for (const eyeY of [1.65, 1.1]) {
    for (const dist of [0.7, 1.0, 1.35, 1.7]) {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        const fx = c.x + Math.sin(a) * dist;
        const fz = c.z + Math.cos(a) * dist;
        if (!feetFree(boxes, fx, fz)) continue;
        const eye = new Vector3(fx, eyeY, fz);
        if (eye.distanceTo(c) > reach) continue;
        probeCam.position.copy(eye);
        probeCam.lookAt(c);
        probeCam.updateMatrixWorld(true);
        e.interaction.update(0, probeCam, true, tool, boxes, () => null);
        lastHit = e.interaction.targetId;
        if (lastHit === id) {
          const dx = c.x - fx;
          const dz = c.z - fz;
          const yaw = Math.atan2(-dx, -dz);
          const pitch = Math.atan2(c.y - eyeY, Math.hypot(dx, dz));
          return { id, ok: true, feet: [fx, 0, fz], yaw, pitch, eyeY, hitId: lastHit };
        }
      }
    }
  }
  return { id, ok: false, hitId: lastHit };
}

/** Teleport so the crosshair rests on `id`, let the real loop run, and return the HUD prompt. */
export async function lookAtInteractable(engine: Engine, id: string): Promise<{ aim: AimResult; prompt: unknown; target: string | null }> {
  const aim = findAim(engine, id);
  if (aim.ok) {
    if (engine.isFocused()) await engine.releaseFocus(1);
    engine.teleportPlayer(aim.feet!, aim.yaw!, aim.pitch!);
    if (aim.eyeY! < 1.5) internals(engine).player.crouched = true;
    else internals(engine).player.crouched = false;
    await until(() => internals(engine).interaction.targetId === id, 3000);
  }
  return { aim, prompt: store.getState().ui.prompt, target: internals(engine).interaction.targetId };
}

/** Reachability audit: every captured interactable that the crosshair can target from the floor. */
export function auditReach(engine: Engine, only?: string[]): { total: number; unreachable: { id: string; hit: string | null | undefined }[] } {
  const unreachable: { id: string; hit: string | null | undefined }[] = [];
  let total = 0;
  for (const id of only ?? [...captured.keys()]) {
    if (!captured.get(id)?.some((i) => isShown(i.object))) continue;
    total++;
    const r = findAim(engine, id);
    if (!r.ok) unreachable.push({ id, hit: r.hitId });
  }
  return { total, unreachable };
}

/* ───────────────────────────── scripted scenarios ───────────────────────────── */

function tabletCanvas(rigId: string): HTMLCanvasElement | null {
  const scr = rigsWorld()?.screens as unknown as { tablets: { b: { rigId: string }; canvas: HTMLCanvasElement }[] } | undefined;
  return scr?.tablets.find((t) => t.b.rigId === rigId)?.canvas ?? null;
}

/** Dominant banner colour of a tablet texture (samples the header strip). */
export function tabletBanner(rigId: string): { rgb: [number, number, number]; name: string } | null {
  const c = tabletCanvas(rigId);
  if (!c) return null;
  const px = c.getContext('2d')!.getImageData(Math.round(c.width * 0.08), Math.round(c.height * 0.06), 1, 1).data;
  const [r, g, b] = [px[0]!, px[1]!, px[2]!];
  const name = g > 140 && r < 120 ? 'green' : r > 180 && g > 150 && b < 110 ? 'yellow' : r > 170 && g < 110 ? 'red' : Math.abs(r - g) < 25 && Math.abs(g - b) < 25 ? 'grey' : 'other';
  return { rgb: [r, g, b], name };
}

/** Carriage position the 3D view currently shows (mm) for a touch rig. */
function shownCarriage(rigId: string): { x: number; y: number } | null {
  const b = rigsWorld()?.binders.find((x) => x.view.def.id === rigId);
  return b ? { ...b.carriageMm } : null;
}

export async function scenarioGantry(engine: Engine, rigId = 'wall-e'): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  const look = await lookAtInteractable(engine, `rig.${rigId}.tablet`);
  out.tabletPrompt = look.prompt;
  out.tabletTargeted = look.target === `rig.${rigId}.tablet`;
  // make sure the rig starts parked & green
  sim.rig.command(rigId, 'park.all', 'player');
  await until(() => lab().rigs[rigId]?.banner === 'green', 15000);
  out.bannerBefore = lab().rigs[rigId]?.banner;
  out.texBefore = tabletBanner(rigId);
  // open the side door, push the head with the real interactable verb
  sim.rig.setDoor(rigId, true, 'player');
  await wait(600);
  const carriage = captured.get(`rig.${rigId}.carriage`)?.[0];
  const pushVerb = carriage?.verbs().find((v) => v.key === 'E');
  out.pushVerb = pushVerb ? `${pushVerb.label}${pushVerb.disabled ? ' (disabled)' : ''}` : null;
  if (pushVerb && !pushVerb.disabled) for (let n = 0; n < 3; n++) pushVerb.run();
  out.pushedTo = { ...lab().rigs[rigId]!.gantry };
  await until(() => lab().rigs[rigId]?.banner === 'yellow', 3000);
  out.bannerAfterPush = lab().rigs[rigId]?.banner;
  await until(() => tabletBanner(rigId)?.name === 'yellow', 3000);
  out.texAfterPush = tabletBanner(rigId);
  out.shownAfterPush = shownCarriage(rigId);
  // Park All from the tablet command path
  const park = sim.rig.command(rigId, 'park.all', 'player');
  out.parkResult = park;
  const t0 = performance.now();
  const samples: [number, number, number][] = [];
  const parked = await until(() => {
    const s = shownCarriage(rigId);
    if (s) samples.push([Math.round(performance.now() - t0), +s.x.toFixed(1), +s.y.toFixed(1)]);
    return !!s && Math.hypot(s.x, s.y) < 0.5 && lab().rigs[rigId]?.banner === 'green';
  }, 20000, 150);
  out.parked = parked;
  out.parkMs = Math.round(performance.now() - t0);
  out.parkSamples = samples.filter((_, i) => i % 4 === 0).slice(0, 12);
  out.bannerAfterPark = lab().rigs[rigId]?.banner;
  await until(() => tabletBanner(rigId)?.name === 'green', 3000);
  out.texAfterPark = tabletBanner(rigId);
  sim.rig.setDoor(rigId, false, 'player');
  return out;
}

function piLeds(): Record<string, number> {
  const w = rigsWorld();
  const out: Record<string, number> = {};
  if (!w) return out;
  const entries = (w.kit.leds as unknown as { entries: { level: number }[] }).entries;
  for (const v of w.views) {
    const h = (v as unknown as { pi: { pwr: { index: number } | null } }).pi.pwr;
    out[v.def.id] = h ? +entries[h.index]!.level.toFixed(2) : -1;
  }
  return out;
}

export async function scenarioFuse(fuseId = 'F-RACKB-5V'): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { fuse: fuseId, before: piLeds() };
  // blow it (debug: what an over-current does), then replace with the UI convenience verb
  const { mutate } = await import('@/core/store');
  mutate((s) => {
    const f = (s.lab as LabState).power.fuses[fuseId];
    if (f) f.blown = true;
  });
  await wait(2500);
  out.hostsAfterBlow = Object.fromEntries(Object.values(lab().hosts).filter((h) => h.id.startsWith('pi-')).map((h) => [h.id, h.power]));
  out.afterBlow = piLeds();
  out.replace = sim.power.replaceFuse(fuseId, 'player');
  await wait(2500);
  out.afterReplace = piLeds();
  // pull / insert path (bench spare)
  out.remove = sim.power.removeFuse(fuseId, 'player');
  await wait(2000);
  out.afterRemove = piLeds();
  out.insert = sim.power.insertFuse(fuseId, 10, 'player');
  await wait(2500);
  out.afterInsert = piLeds();
  return out;
}

/**
 * Probe alignment: for every touch rig, tap a firmware button via `tap.at`, wait for the gantry
 * to settle, then project the solenoid tip (3D, displayed transform) onto the drawn screen plane and
 * check it lands inside the button rectangle the render2d layer drew.
 */
export async function scenarioProbe(): Promise<Record<string, unknown>[]> {
  const w = rigsWorld();
  const res: Record<string, unknown>[] = [];
  if (!w) return res;
  for (const def of TOUCH_RIGS) {
    const r = lab().rigs[def.id];
    const devId = r?.deviceIds[0];
    if (!r || !devId) {
      res.push({ rig: def.id, ok: false, error: 'no rig/device' });
      continue;
    }
    const which = r.probeDisplay ?? 'primary';
    const all = sim.device.layout(devId, which).filter((b) => b.visible && b.wMm >= 6 && b.hMm >= 6);
    const buttons = all.filter((b) => b.kind === 'button' && b.enabled);
    // pick a button away from the screen centre so a wrong mapping would show (labels when the
    // screen has no buttons, e.g. the R2-D2 CFD idle screen)
    const pool = (buttons.length ? buttons : all).sort((a, b) => Math.hypot(b.xMm, b.yMm) - Math.hypot(a.xMm, a.yMm));
    const btn = pool[Math.floor(pool.length / 3)];
    if (!btn) {
      res.push({ rig: def.id, ok: false, error: `nothing drawn on ${lab().devices[devId]?.display.screen}` });
      continue;
    }
    let tapResult: unknown = null;
    const offTap = bus.on('rig.solenoidTap', (p) => {
      if (p.rigId === def.id) tapResult = { result: p.result, hitButton: p.hitButton, at: [p.xMm, p.yMm] };
    });
    const cmd = sim.rig.command(def.id, 'tap.at', 'player', { xMm: btn.xMm, yMm: btn.yMm });
    const view = w.views.find((v) => v.def.id === def.id)!;
    const binder = w.binders.find((b) => b.view.def.id === def.id)!;
    await until(() => Math.hypot(binder.carriageMm.x - btn.xMm, binder.carriageMm.y - btn.yMm) < 0.3 && !lab().rigs[def.id]!.gantry.moving, 15000);
    const vr = view.variants.find((x) => !x.group || x.group.visible)!;
    const scr = vr.handle.screens.find((x) => x.display === which)!;
    await until(() => tapResult !== null, 4000);
    offTap();
    const tip = view.frame.point(binder.tipBay());
    scr.mesh.updateWorldMatrix(true, false);
    const local = scr.mesh.worldToLocal(tip.clone());
    const g = scr.mesh.geometry as PlaneGeometry;
    const xMm = (local.x / g.parameters.width + 0.5) * scr.wMm;
    const yMm = (0.5 - local.y / g.parameters.height) * scr.hMm;
    const inside = Math.abs(xMm - btn.xMm) <= btn.wMm / 2 && Math.abs(yMm - btn.yMm) <= btn.hMm / 2;
    res.push({
      rig: def.id,
      screen: lab().devices[devId]?.display.screen,
      button: btn.id,
      rect: [btn.xMm, btn.yMm, btn.wMm, btn.hMm],
      tipOnScreenMm: [+xMm.toFixed(2), +yMm.toFixed(2)],
      errMm: +Math.hypot(xMm - btn.xMm, yMm - btn.yMm).toFixed(2),
      tipAboveGlassMm: +(local.z * 1000).toFixed(1),
      inside,
      cmd: cmd.ok ? 'ok' : cmd,
      tap: tapResult,
    });
  }
  return res;
}

/** Walk between every pair of location anchors using the engine's live collider set. */
export function navAudit(engine: Engine): { pairs: number; failed: WalkResult[] } {
  const boxes = internals(engine).colliders.boxes;
  const pts = LOCATIONS.map((l) => ({ id: l.id, x: l.center[0], z: l.center[2] }));
  const res = walkAll(boxes, pts);
  return { pairs: res.length, failed: res.filter((r) => !r.ok) };
}

export { toAabbs };

/**
 * Per-frame work audit: over `ms` of real time, count texture uploads (needsUpdate = true, with
 * the uploaded pixel area), render2d redraws and frames. Idle lab ⇒ should be near zero.
 */
export async function auditUpdates(ms = 3000): Promise<Record<string, unknown>> {
  const proto = Texture.prototype as unknown as Record<string, unknown>;
  const desc = Object.getOwnPropertyDescriptor(Texture.prototype, 'needsUpdate')!;
  const uploads = new Map<string, { n: number; px: number }>();
  Object.defineProperty(proto, 'needsUpdate', {
    configurable: true,
    set(this: Texture, v: boolean) {
      if (v) {
        const img = this.image as { width?: number; height?: number } | undefined;
        const key = `${this.name || 'tex'}:${img?.width ?? 0}x${img?.height ?? 0}`;
        const e = uploads.get(key) ?? { n: 0, px: 0 };
        e.n++;
        e.px += (img?.width ?? 0) * (img?.height ?? 0);
        uploads.set(key, e);
      }
      desc.set!.call(this, v);
    },
  });
  const r2 = render2d as unknown as Record<string, (...a: unknown[]) => unknown>;
  const counts: Record<string, number> = {};
  const origs: Record<string, (...a: unknown[]) => unknown> = {};
  for (const k of ['drawDeviceDisplay', 'drawTablet', 'drawReceipt']) {
    const f = r2[k];
    if (typeof f !== 'function') continue;
    origs[k] = f;
    counts[k] = 0;
    r2[k] = (...a: unknown[]) => {
      counts[k]!++;
      return f.apply(render2d, a);
    };
  }
  let frames = 0;
  let raf = 0;
  const tick = () => {
    frames++;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  await wait(ms);
  cancelAnimationFrame(raf);
  Object.defineProperty(proto, 'needsUpdate', desc);
  for (const [k, f] of Object.entries(origs)) r2[k] = f;
  const list = [...uploads.entries()].sort((a, b) => b[1].px - a[1].px).slice(0, 20);
  const totalPx = list.reduce((a, [, e]) => a + e.px, 0);
  return { frames, render2d: counts, uploads: list.map(([k, e]) => `${k} ×${e.n}`), mpxPerFrame: +(totalPx / Math.max(1, frames) / 1e6).toFixed(3) };
}
