/**
 * Toast queue helpers (`ui.toasts`). Anyone may push; the HUD's ToastStack removes them after
 * their lifetime. Duplicate toasts (same kind + title + body within 2.5 s) are dropped so the UI
 * bridge and the mission runtime can both announce an event without double toasts.
 */
import { mutate, store } from '@/core/store';
import type { Toast } from '@/core/state';

let seq = 0;
const recent = new Map<string, number>();

export interface ToastInput {
  kind: Toast['kind'];
  title: string;
  body?: string;
  icon?: string;
}

export const TOAST_MAX = 5;

export function pushToast(t: ToastInput): string | null {
  const key = `${t.kind}|${t.title}|${t.body ?? ''}`;
  const now = performance.now();
  const last = recent.get(key);
  if (last !== undefined && now - last < 2500) return null;
  recent.set(key, now);
  if (recent.size > 64) {
    for (const [k, at] of recent) if (now - at > 5000) recent.delete(k);
  }
  const id = `ui-toast-${++seq}`;
  try {
    mutate((s) => {
      s.ui.toasts.push({ id, kind: t.kind, title: t.title, body: t.body, icon: t.icon, createdAtMs: s.lab.time.nowMs });
      if (s.ui.toasts.length > TOAST_MAX + 3) s.ui.toasts.splice(0, s.ui.toasts.length - (TOAST_MAX + 3));
    });
  } catch (err) {
    console.warn('[ui] could not push toast', err);
    return null;
  }
  return id;
}

export function dismissToast(id: string): void {
  if (!store.getState().ui.toasts.some((t) => t.id === id)) return;
  mutate((s) => {
    const i = s.ui.toasts.findIndex((t) => t.id === id);
    if (i >= 0) s.ui.toasts.splice(i, 1);
  });
}

/** Lifetime per kind (ms). GP §4.5: achievement toast 4 s. */
export function toastLifetime(kind: Toast['kind']): number {
  switch (kind) {
    case 'error':
    case 'penalty':
      return 6000;
    case 'achievement':
    case 'rank':
      return 4500;
    case 'xp':
      return 2600;
    case 'ticket':
      return 4000;
    default:
      return 4200;
  }
}
