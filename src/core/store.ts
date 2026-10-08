/**
 * The single game store (zustand vanilla + immer).
 *
 * Read:    `store.getState()` (engine/world, every frame) or `useGame(selector)` (React).
 * Write:   `transact((s, ctx) => { ... })` — mutate the immer draft and queue events with
 *          `ctx.emit`. Events are delivered on the bus *after* the state commits, in order.
 *          `mutate(fn)` is the same without a context.
 */
import { createStore } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import { useStoreWithEqualityFn } from 'zustand/traditional';
import { shallow } from 'zustand/shallow';
import { enableMapSet, setAutoFreeze } from 'immer';
import type { RootState } from './state';
import { createDefaultProgress, createDefaultSession, createDefaultUi } from './state';
import type { EventMap } from './events';
import { bus, type EventName } from './bus';
import type { RngState } from './rng';
import { nextFloat } from './rng';
import { createInitialLabState } from '@/sim/initialState';

enableMapSet();
// Auto-freeze catches accidental mutation of committed state in dev; disabled in prod for speed.
setAutoFreeze(import.meta.env?.DEV ?? false);

export interface TxContext {
  /** Queue a domain event; delivered after the transaction commits. */
  emit<K extends EventName>(type: K, payload: EventMap[K]): void;
  /** Current game time (ms) — same as `draft.lab.time.nowMs`. */
  readonly now: number;
  /** Deterministic random float [0,1) drawn from `draft.lab.rng`. */
  random(): number;
  /** The draft's rng state, for use with the helpers in `@/core/rng`. */
  readonly rng: RngState;
}

export function createInitialRoot(): RootState {
  return {
    lab: createInitialLabState(),
    session: createDefaultSession(),
    ui: createDefaultUi(),
    progress: createDefaultProgress(),
  };
}

export const store = createStore<RootState>()(immer(() => createInitialRoot()));

bus.clock = () => store.getState().lab.time.nowMs;

let depth = 0;
let pending: { type: EventName; payload: unknown }[] = [];

/**
 * Run a mutation against the root state. Nested calls join the outer transaction.
 * Returns whatever `fn` returns — never return draft objects (copy with `current()` or map to primitives).
 */
export function transact<R>(fn: (draft: RootState, ctx: TxContext) => R): R {
  let result!: R;
  depth++;
  try {
    if (depth > 1 && currentDraft) {
      // Nested: we are already inside a draft — run directly against it. (A store subscriber that
      // mutates while the outer transaction is notifying has no draft any more: it commits on its own.)
      result = fn(currentDraft!, makeCtx(currentDraft!));
    } else {
      store.setState((draft) => {
        currentDraft = draft;
        try {
          result = fn(draft, makeCtx(draft));
        } finally {
          currentDraft = null;
        }
      });
    }
  } finally {
    depth--;
  }
  if (depth === 0 && pending.length) {
    const toFlush = pending;
    pending = [];
    for (const e of toFlush) bus.emit(e.type, e.payload as never);
  }
  return result;
}

let currentDraft: RootState | null = null;

function makeCtx(draft: RootState): TxContext {
  return {
    emit(type, payload) {
      pending.push({ type, payload });
    },
    get now() {
      return draft.lab.time.nowMs;
    },
    random() {
      return nextFloat(draft.lab.rng);
    },
    get rng() {
      return draft.lab.rng;
    },
  };
}

/** Mutation without event context. */
export function mutate(fn: (draft: RootState) => void): void {
  transact((d) => fn(d));
}

/** Emit an event outside of a transaction (UI-only events such as app navigation). */
export function emit<K extends EventName>(type: K, payload: EventMap[K]): void {
  if (depth > 0) pending.push({ type, payload });
  else bus.emit(type, payload);
}

/** React hook: subscribe to a slice. Selector must return a primitive or a stable reference. */
export function useGame<T>(selector: (s: RootState) => T): T {
  return useStoreWithEqualityFn(store, selector, Object.is);
}

/** React hook with shallow equality — for selectors returning small fresh objects/arrays. */
export function useGameShallow<T>(selector: (s: RootState) => T): T {
  return useStoreWithEqualityFn(store, selector, shallow);
}

export const getState = (): RootState => store.getState();
