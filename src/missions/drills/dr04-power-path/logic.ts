/**
 * DR04 Power Path (GP §2.4.3, Cur M03): a wiring board — wire sources to loads; 3 boards, 120 s.
 *
 * Correct graph (Ref §6.3, F227–F229; F074, F085–F087): wall → Mean Well; wall → AC strip; Mean Well 24 V →
 * step-down inputs (and the motor PCB [illus.]); 12 V → inline fuse → NUC; 5 V 10 A → inline fuse → Pis;
 * LabSim PSUs → AC strip; Collis PSU → AC strip.
 * - A LabSim or Collis lead on any DC terminal = instant spark, −300 and a Teach Card (the 18 V exception).
 *   Over-voltage on a Pi/NUC (or AC into a DC input) fries it the same way.
 * - A DC load wired straight to its regulator (no inline fuse) works but costs −100 at submit.
 * Scoring (custom): +50 per correct input, −100 per missing fuse, −300 per spark; a perfect board adds +150
 * and a speed bonus (8 pts per second under 45 s), × the streak multiplier.
 */
import type { RootState } from '@/core/state';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { chance, shuffle, type RngState } from '../common/rng';
import { streakMultiplier } from '../common/scoring';
import { teach } from '../common/teach';

export type NodeId = 'wall' | 'strip' | 'meanwell' | 'reg12' | 'reg5' | 'fuseA' | 'fuseB' | 'pi' | 'nuc' | 'flex4' | 'mini3' | 'collis' | 'motor';

export type Volt = 'AC' | '24V' | '12V' | '5V';

export interface PowerNode {
  id: NodeId;
  label: string;
  sub: string;
  /** Column 0–4 (sources → loads). */
  col: number;
  hasIn: boolean;
  hasOut: boolean;
}

export const NODES: Record<NodeId, PowerNode> = {
  wall: { id: 'wall', label: 'Wall outlet', sub: '120 V AC', col: 0, hasIn: false, hasOut: true },
  strip: { id: 'strip', label: 'AC power strip', sub: 'commercial, 120 V AC', col: 1, hasIn: true, hasOut: true },
  meanwell: { id: 'meanwell', label: 'Mean Well', sub: '120 V AC → 24 V DC', col: 1, hasIn: true, hasOut: true },
  reg12: { id: 'reg12', label: 'Step-down', sub: '24 V → 12 V DC', col: 2, hasIn: true, hasOut: true },
  reg5: { id: 'reg5', label: 'Step-down', sub: '24 V → 5 V DC · 10 A', col: 2, hasIn: true, hasOut: true },
  fuseA: { id: 'fuseA', label: 'Inline fuse holder', sub: 'DC branch', col: 3, hasIn: true, hasOut: true },
  fuseB: { id: 'fuseB', label: 'Inline fuse holder', sub: 'DC branch', col: 3, hasIn: true, hasOut: true },
  pi: { id: 'pi', label: 'Raspberry Pi shelf', sub: 'needs 5 V DC', col: 4, hasIn: true, hasOut: false },
  nuc: { id: 'nuc', label: 'Intel NUC', sub: 'needs 12 V DC', col: 4, hasIn: true, hasOut: false },
  flex4: { id: 'flex4', label: 'Flex 4 PSU', sub: 'LabSim device (18 V)', col: 4, hasIn: true, hasOut: false },
  mini3: { id: 'mini3', label: 'Mini 3 PSU', sub: 'LabSim device (18 V)', col: 4, hasIn: true, hasOut: false },
  collis: { id: 'collis', label: 'Collis probe PSU', sub: 'UL Transaction Security', col: 4, hasIn: true, hasOut: false },
  motor: { id: 'motor', label: 'Motor controller PCB', sub: '25-pin · 24 V [illus.]', col: 4, hasIn: true, hasOut: false },
};

/** A wire from an output to an input (one wire per input). */
export interface Wire {
  from: NodeId;
  to: NodeId;
}

export interface BoardData {
  title: string;
  nodes: NodeId[];
  /** Vertical order per column (node ids, top → bottom). */
  columns: NodeId[][];
}

const terminalish: NodeId[] = ['flex4', 'mini3', 'collis'];
const DC_LOADS: Partial<Record<NodeId, { reg: NodeId; volt: Volt }>> = { pi: { reg: 'reg5', volt: '5V' }, nuc: { reg: 'reg12', volt: '12V' } };

/** Voltage present at a node's output, following wires upstream (null = unpowered). */
export function outVolt(id: NodeId, wires: readonly Wire[], depth = 0): Volt | null {
  if (depth > 8) return null;
  switch (id) {
    case 'wall':
      return 'AC';
    case 'strip':
      return feed(id, wires, depth) === 'AC' ? 'AC' : null;
    case 'meanwell':
      return feed(id, wires, depth) === 'AC' ? '24V' : null;
    case 'reg12':
      return feed(id, wires, depth) === '24V' ? '12V' : null;
    case 'reg5':
      return feed(id, wires, depth) === '24V' ? '5V' : null;
    case 'fuseA':
    case 'fuseB':
      return feed(id, wires, depth);
    default:
      return null;
  }
}

function feed(id: NodeId, wires: readonly Wire[], depth: number): Volt | null {
  const w = wires.find((x) => x.to === id);
  return w ? outVolt(w.from, wires, depth + 1) : null;
}

/** Nominal voltage an output carries regardless of upstream wiring (for spark checks while wiring). */
export function nominal(id: NodeId, wires: readonly Wire[]): Volt | null {
  if (id === 'wall' || id === 'strip') return 'AC';
  if (id === 'meanwell') return '24V';
  if (id === 'reg12') return '12V';
  if (id === 'reg5') return '5V';
  const w = wires.find((x) => x.to === id);
  return w ? nominal(w.from, wires) : null;
}

/** Does connecting `from` → `to` fry something? Returns the reason, or null. */
export function sparkFor(from: NodeId, to: NodeId, wires: readonly Wire[]): string | null {
  const v = nominal(from, wires);
  if (!v) return null;
  if (terminalish.includes(to) && v !== 'AC') return `${NODES[to].label} on a ${v === '24V' ? '24 V' : v === '12V' ? '12 V' : '5 V'} DC terminal — LabSim devices draw an irregular 18 V; they and the Collis probes bypass the DC rails and plug into commercial AC strips.`;
  const load = DC_LOADS[to];
  if (load && v === 'AC') return `120 V AC straight into the ${NODES[to].label} — it needs ${load.volt === '5V' ? '5 V' : '12 V'} DC from its step-down regulator.`;
  if (to === 'pi' && (v === '12V' || v === '24V')) return `${v === '12V' ? '12 V' : '24 V'} into a Pi — the Pis run on the 5 V DC 10 A line.`;
  if (to === 'nuc' && v === '24V') return '24 V into a NUC — the NUCs run on the 12 V DC line.';
  if ((to === 'reg12' || to === 'reg5' || to === 'motor' || to === 'fuseA' || to === 'fuseB') && v === 'AC') return `120 V AC into a DC part (${NODES[to].label}) — AC only goes into the Mean Well or the AC strip.`;
  return null;
}

export interface InputCheck {
  node: NodeId;
  ok: boolean;
  /** Wired straight to its regulator, no fuse. */
  noFuse: boolean;
  why: string;
}

/** Required source for every input on the board. */
export function checkBoard(board: BoardData, wires: readonly Wire[]): { checks: InputCheck[]; correct: number; missingFuse: number; perfect: boolean } {
  const has = (n: NodeId) => board.nodes.includes(n);
  const src = (n: NodeId) => wires.find((w) => w.to === n)?.from ?? null;
  const checks: InputCheck[] = [];
  const want = (node: NodeId, ok: boolean, why: string, noFuse = false) => checks.push({ node, ok, noFuse, why });
  if (has('meanwell')) want('meanwell', src('meanwell') === 'wall', 'Wall 120 V AC → Mean Well');
  if (has('strip')) want('strip', src('strip') === 'wall', 'Wall 120 V AC → commercial AC strip');
  for (const r of ['reg12', 'reg5'] as const) if (has(r)) want(r, src(r) === 'meanwell', 'Mean Well 24 V DC rail → step-down input');
  if (has('motor')) want('motor', src('motor') === 'meanwell', 'Motor PCB on the 24 V rail [illus.]');
  for (const n of ['pi', 'nuc'] as const) {
    if (!has(n)) continue;
    const reg = DC_LOADS[n]!.reg;
    const s = src(n);
    const viaFuse = (s === 'fuseA' || s === 'fuseB') && src(s) === reg;
    const direct = s === reg;
    want(n, viaFuse || direct, `${reg === 'reg5' ? '5 V 10 A' : '12 V'} regulator → inline fuse → ${NODES[n].label}`, direct);
  }
  for (const n of terminalish) if (has(n)) want(n, src(n) === 'strip', `${NODES[n].label} → commercial AC strip`);
  const correct = checks.filter((c) => c.ok).length;
  const missingFuse = checks.filter((c) => c.ok && c.noFuse).length;
  return { checks, correct, missingFuse, perfect: correct === checks.length && missingFuse === 0 };
}

export function boardPoints(r: { correct: number; missingFuse: number; perfect: boolean }, sparks: number, seconds: number, streakBefore: number): number {
  const base = 50 * r.correct - 100 * r.missingFuse - 300 * sparks;
  if (!r.perfect || sparks > 0) return base;
  return Math.round((base + 150 + Math.max(0, Math.round(8 * (45 - seconds)))) * streakMultiplier(streakBefore));
}

interface BoardSpec {
  key: string;
  title: string;
  nodes: NodeId[];
}

function boardSpec(rng: RngState, index: number): BoardSpec {
  const slot = index % 3;
  if (slot === 0) return { key: 'shelf', title: 'Board 1 — the Pi & NUC shelf', nodes: ['wall', 'meanwell', 'reg12', 'reg5', 'fuseA', 'fuseB', 'pi', 'nuc'] };
  if (slot === 1) {
    const lab: NodeId = chance(rng, 0.5) ? 'flex4' : 'mini3';
    return { key: `arrivals-${lab}`, title: 'Board 2 — new arrivals on the bench', nodes: ['wall', 'strip', 'meanwell', 'reg5', 'fuseA', 'pi', lab, 'collis'] };
  }
  return { key: 'full', title: 'Board 3 — the whole power wall', nodes: ['wall', 'strip', 'meanwell', 'reg12', 'reg5', 'fuseA', 'fuseB', 'pi', 'nuc', 'flex4', 'mini3', 'collis', 'motor'] };
}

export function powerItem(spec: BoardSpec, rng: RngState): DrillItem<BoardData> {
  const columns: NodeId[][] = [0, 1, 2, 3, 4].map((c) => shuffle(rng, spec.nodes.filter((n) => NODES[n].col === c)));
  const facts = ['F227', 'F074', 'F085', 'F086', 'F087', 'F228', 'F229'];
  return {
    id: `DR04:${spec.key}`,
    tags: ['power.rails', 'power.fuses', 'power.18v'],
    factIds: facts,
    teach: teach(
      'Wall → Mean Well → 24 V rail → step-downs → inline fuses → NUC (12 V) / Pis (5 V 10 A); LabSim + Collis → AC strip',
      '120 V AC enters a Mean Well and drops to a central 24 V DC rail; step-down regulators split it into 12 V DC (NUCs) and 5 V DC 10 A (Pis), protected by inline fuses. LabSim devices draw an irregular 18 V, so they and the Collis probes plug into commercial AC power strips.',
      { ref: 'Ref §6.3', factIds: facts, tag: 'power.rails' },
    ),
    data: { title: spec.title, nodes: spec.nodes, columns },
  };
}

export function generatePower(rng: RngState, _state: RootState | null, index: number): DrillItem<BoardData> {
  return powerItem(boardSpec(rng, index), rng);
}

export const DR04: DrillDef<BoardData> = {
  id: 'DR04',
  name: 'Power Path',
  format: 'Wiring board: sources → loads; 3 boards, 120 s',
  tags: ['power.rails', 'power.fuses', 'power.18v'],
  unlockedBy: ['M03'],
  durationS: 120,
  itemCount: 3,
  medals: { bronze: 900, silver: 1500, gold: 2100 },
  scoring: 'custom',
  generate: (rng, state, index) => generatePower(rng, state, index),
  component: lazyDrill(() => import('./View'), '#f5b301'),
};
