/**
 * App registry: `APP_META` (apps.ts) + one lazy loader per app (Apps §1.9). Lives in the shell so the
 * desktop can load apps without importing `src/computer/index.ts` (which imports the shell).
 */
import type { ComponentType } from 'react';
import { APP_IDS, APP_META, type AppDefinition, type AppId, type AppProps } from '../apps';

const LOADERS: Record<AppId, () => Promise<ComponentType<AppProps>>> = {
  orca: () => import('../apps/orca').then((m) => m.OrcaApp),
  jenkins: () => import('../apps/jenkins').then((m) => m.JenkinsApp),
  github: () => import('../apps/github').then((m) => m.GitHubApp),
  ollama: () => import('../apps/ollama').then((m) => m.OllamaApp),
  browser: () => import('../apps/browser').then((m) => m.BrowserApp),
  intellij: () => import('../apps/intellij').then((m) => m.IntelliJApp),
  terminal: () => import('../apps/terminal').then((m) => m.TerminalApp),
  gimp: () => import('../apps/gimp').then((m) => m.GimpApp),
  camera: () => import('../apps/camera').then((m) => m.CameraApp),
  dashboard: () => import('../apps/dashboard').then((m) => m.DashboardApp),
  chat: () => import('../apps/chat').then((m) => m.ChatApp),
  cardreader: () => import('../apps/cardreader').then((m) => m.CardReaderApp),
  files: () => import('../apps/files').then((m) => m.FilesApp),
};

/** Every app: metadata from `APP_META` plus its lazy component loader. */
export const APP_REGISTRY: readonly AppDefinition[] = APP_IDS.map((id) => ({ ...APP_META[id], load: LOADERS[id] }));

export function getAppDefinition(id: AppId): AppDefinition {
  const def = APP_REGISTRY.find((d) => d.id === id);
  if (!def) throw new Error(`[computer] unknown app id "${id}"`);
  return def;
}

const loaded = new Map<AppId, ComponentType<AppProps>>();
const loading = new Map<AppId, Promise<ComponentType<AppProps>>>();

/** Synchronous lookup of an already-loaded component. */
export function peekAppComponent(id: AppId): ComponentType<AppProps> | null {
  return loaded.get(id) ?? null;
}

/** Load (once) and cache an app component. */
export function loadAppComponent(id: AppId): Promise<ComponentType<AppProps>> {
  const hit = loaded.get(id);
  if (hit) return Promise.resolve(hit);
  let p = loading.get(id);
  if (!p) {
    p = LOADERS[id]().then((c) => {
      loaded.set(id, c);
      loading.delete(id);
      return c;
    });
    p.catch(() => loading.delete(id));
    loading.set(id, p);
  }
  return p;
}
