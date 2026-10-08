/**
 * Typed event bus. The event catalogue is the `EventMap` interface in `./events.ts`;
 * modules extend it via declaration merging so subsystems can add events independently:
 *
 *   declare module '@/core/events' {
 *     interface EventMap { 'robot.parkCompleted': { robotId: string } }
 *   }
 */
import type { EventMap } from './events';

export type EventName = keyof EventMap & string;
export type Listener<K extends EventName> = (payload: EventMap[K]) => void;
export type AnyListener = <K extends EventName>(type: K, payload: EventMap[K]) => void;

export interface BusRecord {
  type: EventName;
  payload: unknown;
  /** Game-clock time (ms) when the event was emitted. */
  at: number;
}

export class EventBus {
  private listeners = new Map<string, Set<(p: unknown) => void>>();
  private anyListeners = new Set<AnyListener>();
  /** Ring buffer of recent events — used by the mission runtime and the debug panel. */
  readonly history: BusRecord[] = [];
  private historyLimit = 500;
  /** Supplies the current game time for history records. */
  clock: () => number = () => 0;

  on<K extends EventName>(type: K, fn: Listener<K>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as (p: unknown) => void);
    return () => this.off(type, fn);
  }

  once<K extends EventName>(type: K, fn: Listener<K>): () => void {
    const off = this.on(type, (p) => {
      off();
      fn(p);
    });
    return off;
  }

  off<K extends EventName>(type: K, fn: Listener<K>): void {
    this.listeners.get(type)?.delete(fn as (p: unknown) => void);
  }

  onAny(fn: AnyListener): () => void {
    this.anyListeners.add(fn);
    return () => this.anyListeners.delete(fn);
  }

  emit<K extends EventName>(type: K, payload: EventMap[K]): void {
    this.history.push({ type, payload, at: this.clock() });
    if (this.history.length > this.historyLimit) this.history.splice(0, this.history.length - this.historyLimit);
    const set = this.listeners.get(type);
    if (set) {
      for (const fn of [...set]) {
        try {
          fn(payload);
        } catch (err) {
          console.error(`[bus] listener for "${type}" threw`, err);
        }
      }
    }
    for (const fn of [...this.anyListeners]) {
      try {
        fn(type, payload);
      } catch (err) {
        console.error(`[bus] any-listener threw on "${type}"`, err);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
    this.anyListeners.clear();
    this.history.length = 0;
  }
}

/** The process-wide bus. */
export const bus = new EventBus();
