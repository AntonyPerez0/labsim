/**
 * Boot error channel: `main.tsx` reports a failed `bootGame()` here and the React root shows a
 * readable error screen (with a reload button) instead of a blank page.
 */
let current: { message: string; stack: string | null } | null = null;
const listeners = new Set<() => void>();

export function reportBootError(err: unknown): void {
  current = {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? (err.stack ?? null) : null,
  };
  for (const l of listeners) l();
}

export function getBootError(): typeof current {
  return current;
}

export function subscribeBootError(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
