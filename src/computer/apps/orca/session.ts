/**
 * Orca browser session (Apps §2.2): the workstation browser "remembers" `admin`. Module-level so it
 * survives closing the window (like a cookie). All sim calls use actor 'player' regardless of the login.
 */
import { useSyncExternalStore } from 'react';
import { APP_ROUTES, matchRoute, type RouteDef } from '../../apps';

export const ACCOUNTS: Record<string, { password: string | null; admin: boolean }> = {
  admin: { password: 'admin', admin: true },
  user: { password: 'user', admin: false },
  tate: { password: null, admin: true },
  jared: { password: null, admin: false },
};

let login: string | null = 'admin';
let returnTo: string | null = null;
const listeners = new Set<() => void>();

export function getLogin(): string | null {
  return login;
}

export function setLogin(l: string | null): void {
  login = l;
  listeners.forEach((fn) => fn());
}

export function setReturnTo(r: string | null): void {
  returnTo = r;
}

export function takeReturnTo(): string | null {
  const r = returnTo;
  returnTo = null;
  return r;
}

export function useLogin(): string | null {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => login,
  );
}

/** Tests: back to the remembered admin session. */
export function resetOrcaSession(): void {
  setLogin('admin');
  returnTo = null;
}

export type OrcaRouteKey = keyof typeof APP_ROUTES.orca;

/** Match a path against the Orca route catalogue (first match wins). */
export function matchOrcaRoute(path: string): { key: OrcaRouteKey; params: Record<string, string> } | null {
  for (const [key, def] of Object.entries(APP_ROUTES.orca) as [OrcaRouteKey, RouteDef][]) {
    const m = matchRoute(def, path);
    if (m) return { key, params: m.params };
  }
  return null;
}

export const PAGE_TITLES: Record<OrcaRouteKey, string> = {
  home: 'Orchestrator',
  login: 'Sign in',
  robots: 'Robots',
  robotNew: 'Create or edit a Robot',
  robotView: 'Robot',
  robotEdit: 'Create or edit a Robot',
  devices: 'Devices',
  deviceNew: 'Create or edit a Device',
  deviceView: 'Device',
  deviceEdit: 'Create or edit a Device',
  capabilities: 'Robot Capabilities',
  capabilityNew: 'Create or edit a Robot Capability',
  capabilityView: 'Robot Capability',
  capabilityEdit: 'Create or edit a Robot Capability',
  matchPreview: 'Match preview',
  merchants: 'Merchant Configs',
  merchantNew: 'Create or edit a Merchant Config',
  merchantView: 'Merchant Config',
  merchantEdit: 'Create or edit a Merchant Config',
  screens: 'Screens',
  screenNew: 'Create or edit a Screen',
  screenView: 'Screen',
  screenEdit: 'Create or edit a Screen',
  screenLocations: 'Screen Locations',
  screenLocationNew: 'Create or edit a Screen Location',
  screenLocationView: 'Screen Location',
  screenLocationEdit: 'Create or edit a Screen Location',
  cardProfiles: 'Card Profiles',
  cardProfileNew: 'Create or edit a Card Profile',
  cardProfileView: 'Card Profile',
  cardProfileEdit: 'Create or edit a Card Profile',
  screenCompares: 'Screen Compare Images',
  screenCompareNew: 'Create or edit a Screen Compare Image',
  screenCompareView: 'Screen Compare Image',
  screenCompareEdit: 'Create or edit a Screen Compare Image',
  adminUsers: 'Users',
  adminMetrics: 'Application Metrics',
  adminHealth: 'Health Checks',
  adminConfiguration: 'Configuration',
  adminHealthCheckLog: 'Health-check log',
  adminAudits: 'Audits',
  adminLogs: 'Logs',
  adminDocs: 'API',
  accountSettings: 'User settings',
  accountPassword: 'Password',
};
