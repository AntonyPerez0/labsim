/**
 * Public entry of the in-game workstation (docs/design/50-computer-apps.md, "Apps").
 *
 *   import { Desktop, TabletDashboard, initComputer } from '@/computer';
 *
 * - `Desktop` — full-screen desktop for `ui.overlay.kind === 'computer'` (Apps §1). Props `{ onExit? }`.
 * - `TabletDashboard` — zoomed status-tablet overlay for `ui.overlay.kind === 'tablet'` (Apps §10.7).
 *   Props `{ robotId, onExit? }`.
 * - `APP_REGISTRY` / `getAppDefinition` — every app's metadata + lazy loader (Apps §1.9).
 * - `initComputer()` — call once at boot: camera recorder, image materializer, LabChat notifier (Apps §1.1).
 * Without `onExit`, both overlays leave with `ui.overlay = {kind:'none'}` + `engine.releaseFocus()`.
 *
 * Mission/world code should import the contract from `@/computer/apps`, not from this file.
 */
export * from './apps';
export { Desktop } from './shell/Desktop';
export { TabletDashboard } from './apps/dashboard/Tablet';
export { APP_REGISTRY, getAppDefinition } from './shell/loaders';
export { initComputer } from './shell/boot';
export { BrowserFrame, BrowserSandbox, ChromiumErrorPage, displayUrl } from './shell/BrowserFrame';
