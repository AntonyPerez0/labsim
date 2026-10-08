/**
 * Navigation audit (World §1.8): grid A* between floor points over a collider set, then walk the
 * path with the real `PlayerController` (same collision code as the game) and report where the
 * player got stuck. Pure — used by `navcheck.test.ts` (static colliders) and the integrated world
 * sandbox (`__world.navAudit()`, the engine's live collider set incl. dynamic door colliders).
 */
import { PlayerController, type MoveIntent } from '@/engine/player';
import type { Aabb } from '@/engine/collision';
import { CORRIDOR, ROOM } from './layout';

export interface NavPoint {
  x: number;
  z: number;
}

export interface WalkResult {
  from: string;
  to: string;
  ok: boolean;
  /** Path length (m) of the planned route; NaN when no route exists. */
  pathM: number;
  /** Final distance to the goal (m) after walking. */
  missM: number;
  /** Where the walker ended up when it failed. */
  stuckAt?: NavPoint;
  reason?: string;
}

const CELL = 0.1;
const BOUNDS = { minX: ROOM.interior.minX, maxX: CORRIDOR.maxX, minZ: ROOM.interior.minZ, maxZ: CORRIDOR.maxZ };
const NX = Math.round((BOUNDS.maxX - BOUNDS.minX) / CELL);
const NZ = Math.round((BOUNDS.maxZ - BOUNDS.minZ) / CELL);

/** Boxes that block a standing player horizontally (same rule as the engine: above the step). */
function blockers(boxes: readonly Aabb[], stepHeight: number, height: number): Aabb[] {
  return boxes.filter((b) => b.maxY > stepHeight + 1e-4 && b.minY < height);
}

/** Occupancy grid: a cell is free when a circle of `clearance` at its centre touches no blocker. */
export function buildGrid(boxes: readonly Aabb[], clearance: number, stepHeight = 0.12, height = 1.75): Uint8Array {
  const grid = new Uint8Array(NX * NZ);
  const bl = blockers(boxes, stepHeight, height);
  for (const b of bl) {
    const i0 = Math.max(0, Math.floor((b.minX - clearance - BOUNDS.minX) / CELL));
    const i1 = Math.min(NX - 1, Math.ceil((b.maxX + clearance - BOUNDS.minX) / CELL));
    const k0 = Math.max(0, Math.floor((b.minZ - clearance - BOUNDS.minZ) / CELL));
    const k1 = Math.min(NZ - 1, Math.ceil((b.maxZ + clearance - BOUNDS.minZ) / CELL));
    for (let k = k0; k <= k1; k++) {
      const z = BOUNDS.minZ + (k + 0.5) * CELL;
      for (let i = i0; i <= i1; i++) {
        const x = BOUNDS.minX + (i + 0.5) * CELL;
        const dx = Math.max(b.minX - x, 0, x - b.maxX);
        const dz = Math.max(b.minZ - z, 0, z - b.maxZ);
        if (dx * dx + dz * dz < clearance * clearance) grid[k * NX + i] = 1;
      }
    }
  }
  return grid;
}

const cellOf = (p: NavPoint): [number, number] => [
  Math.min(NX - 1, Math.max(0, Math.floor((p.x - BOUNDS.minX) / CELL))),
  Math.min(NZ - 1, Math.max(0, Math.floor((p.z - BOUNDS.minZ) / CELL))),
];
const centreOf = (i: number, k: number): NavPoint => ({ x: BOUNDS.minX + (i + 0.5) * CELL, z: BOUNDS.minZ + (k + 0.5) * CELL });

/** Nearest free cell to `p` (anchors sit on the floor next to props; spiral out up to 1.2 m). */
export function nearestFree(grid: Uint8Array, p: NavPoint): NavPoint | null {
  const [ci, ck] = cellOf(p);
  for (let r = 0; r <= 12; r++) {
    let best: NavPoint | null = null;
    let bestD = Infinity;
    for (let k = ck - r; k <= ck + r; k++) {
      for (let i = ci - r; i <= ci + r; i++) {
        if (Math.max(Math.abs(i - ci), Math.abs(k - ck)) !== r) continue;
        if (i < 0 || k < 0 || i >= NX || k >= NZ || grid[k * NX + i]) continue;
        const c = centreOf(i, k);
        const d = Math.hypot(c.x - p.x, c.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
    }
    if (best) return best;
  }
  return null;
}

/** 8-connected A* on the grid (no corner cutting). Returns world waypoints or null. */
export function findPath(grid: Uint8Array, a: NavPoint, b: NavPoint): NavPoint[] | null {
  const [ai, ak] = cellOf(a);
  const [bi, bk] = cellOf(b);
  const start = ak * NX + ai;
  const goal = bk * NX + bi;
  if (grid[start] || grid[goal]) return null;
  const g = new Float32Array(NX * NZ).fill(Infinity);
  const came = new Int32Array(NX * NZ).fill(-1);
  const closed = new Uint8Array(NX * NZ);
  // binary heap of [f, idx]
  const heap: number[] = [];
  const hf: number[] = [];
  const push = (idx: number, f: number) => {
    heap.push(idx);
    hf.push(f);
    let n = heap.length - 1;
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (hf[p]! <= hf[n]!) break;
      [heap[p], heap[n]] = [heap[n]!, heap[p]!];
      [hf[p], hf[n]] = [hf[n]!, hf[p]!];
      n = p;
    }
  };
  const pop = (): number => {
    const top = heap[0]!;
    const li = heap.pop()!;
    const lf = hf.pop()!;
    if (heap.length) {
      heap[0] = li;
      hf[0] = lf;
      let n = 0;
      for (;;) {
        const l = n * 2 + 1;
        const r = l + 1;
        let m = n;
        if (l < heap.length && hf[l]! < hf[m]!) m = l;
        if (r < heap.length && hf[r]! < hf[m]!) m = r;
        if (m === n) break;
        [heap[m], heap[n]] = [heap[n]!, heap[m]!];
        [hf[m], hf[n]] = [hf[n]!, hf[m]!];
        n = m;
      }
    }
    return top;
  };
  const h = (i: number, k: number) => Math.hypot(i - bi, k - bk);
  g[start] = 0;
  push(start, h(ai, ak));
  while (heap.length) {
    const cur = pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const ci = cur % NX;
    const ck = (cur - ci) / NX;
    for (let dk = -1; dk <= 1; dk++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dk) continue;
        const ni = ci + di;
        const nk = ck + dk;
        if (ni < 0 || nk < 0 || ni >= NX || nk >= NZ) continue;
        const n = nk * NX + ni;
        if (grid[n] || closed[n]) continue;
        if (di && dk && (grid[ck * NX + ni] || grid[nk * NX + ci])) continue;
        const ng = g[cur]! + (di && dk ? Math.SQRT2 : 1);
        if (ng < g[n]!) {
          g[n] = ng;
          came[n] = cur;
          push(n, ng + h(ni, nk));
        }
      }
    }
  }
  if (came[goal] === -1 && start !== goal) return null;
  const cells: number[] = [];
  for (let c = goal; c !== -1; c = came[c]!) cells.push(c);
  cells.reverse();
  // keep every 3rd cell + direction changes (the walker steers towards each)
  const out: NavPoint[] = [];
  for (let j = 0; j < cells.length; j++) {
    if (j % 3 === 0 || j === cells.length - 1) {
      const c = cells[j]!;
      const i = c % NX;
      out.push(centreOf(i, (c - i) / NX));
    }
  }
  return out;
}

const pathLength = (p: NavPoint[]) => p.reduce((s, q, j) => (j ? s + Math.hypot(q.x - p[j - 1]!.x, q.z - p[j - 1]!.z) : 0), 0);

/**
 * Walk from `a` to `b`: plan with clearance a bit larger than the player radius, then steer the
 * real PlayerController along the waypoints at walking speed (60 Hz steps). Fails when no route
 * exists or the walker makes no progress for 2 s.
 */
export function walk(boxes: readonly Aabb[], a: NavPoint & { id?: string }, b: NavPoint & { id?: string }, grid?: Uint8Array): WalkResult {
  const player = new PlayerController();
  const g = grid ?? buildGrid(boxes, player.tuning.radius + 0.06, player.tuning.stepHeight, player.standHeight);
  const res: WalkResult = { from: a.id ?? `${a.x},${a.z}`, to: b.id ?? `${b.x},${b.z}`, ok: false, pathM: NaN, missM: NaN };
  const sa = nearestFree(g, a);
  const sb = nearestFree(g, b);
  if (!sa || !sb) return { ...res, reason: `no free floor near ${sa ? 'goal' : 'start'}` };
  const path = findPath(g, sa, sb);
  if (!path) return { ...res, reason: 'no route' };
  res.pathM = pathLength(path);
  player.teleport(sa.x, 0, sa.z, 0);
  const intent: MoveIntent = { forward: 0, right: 0, fast: false, jump: false, toggleCrouch: false };
  const opts = { reducedMotion: true };
  const dt = 1 / 60;
  let wp = 0;
  let best = Infinity;
  let sinceProgress = 0;
  const maxSteps = Math.ceil((res.pathM / player.tuning.walkSpeed + 10) * 60);
  for (let s = 0; s < maxSteps && wp < path.length; s++) {
    const t = path[wp]!;
    const dx = t.x - player.x;
    const dz = t.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d < (wp === path.length - 1 ? 0.08 : 0.2)) {
      wp++;
      best = Infinity;
      sinceProgress = 0;
      continue;
    }
    player.yaw = Math.atan2(-dx, -dz); // yaw 0 looks toward −Z
    intent.forward = 1;
    player.update(dt, intent, boxes, opts);
    if (d < best - 0.005) {
      best = d;
      sinceProgress = 0;
    } else if ((sinceProgress += dt) > 2) {
      return { ...res, missM: Math.hypot(sb.x - player.x, sb.z - player.z), stuckAt: { x: +player.x.toFixed(2), z: +player.z.toFixed(2) }, reason: `stuck before waypoint ${wp}/${path.length}` };
    }
  }
  res.missM = Math.hypot(sb.x - player.x, sb.z - player.z);
  res.ok = wp >= path.length || res.missM < 0.15;
  if (!res.ok) res.reason = 'timeout';
  return res;
}

/** Walk every ordered-pair-free combination (i < j) of the named points. */
export function walkAll(boxes: readonly Aabb[], pts: readonly (NavPoint & { id: string })[]): WalkResult[] {
  const player = new PlayerController();
  const grid = buildGrid(boxes, player.tuning.radius + 0.06, player.tuning.stepHeight, player.standHeight);
  const out: WalkResult[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) out.push(walk(boxes, pts[i]!, pts[j]!, grid));
  return out;
}

/** Convert `ColliderBox`-style boxes (min/max tuples) to the engine's Aabb shape. */
export function toAabbs(boxes: readonly { min: readonly number[]; max: readonly number[] }[]): Aabb[] {
  return boxes.map((b) => ({ minX: b.min[0]!, minY: b.min[1]!, minZ: b.min[2]!, maxX: b.max[0]!, maxY: b.max[1]!, maxZ: b.max[2]! }));
}

/**
 * Straight-line push test: walk from `a` straight towards `b` (no planning) for `seconds` and
 * return how far the player got into the AABB `forbidden` (0 = never entered). Used to prove the
 * player cannot walk through racks / desks.
 */
export function pushInto(boxes: readonly Aabb[], a: NavPoint, b: NavPoint, forbidden: Aabb, seconds = 4): number {
  const player = new PlayerController();
  player.teleport(a.x, 0, a.z, Math.atan2(-(b.x - a.x), -(b.z - a.z)));
  const intent: MoveIntent = { forward: 1, right: 0, fast: true, jump: false, toggleCrouch: false };
  let worst = 0;
  for (let s = 0; s < seconds * 60; s++) {
    player.update(1 / 60, intent, boxes, { reducedMotion: true });
    const inX = Math.min(player.x - forbidden.minX, forbidden.maxX - player.x);
    const inZ = Math.min(player.z - forbidden.minZ, forbidden.maxZ - player.z);
    worst = Math.max(worst, Math.min(inX, inZ));
  }
  return worst;
}
