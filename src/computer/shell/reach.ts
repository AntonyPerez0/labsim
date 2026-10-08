/**
 * Network reachability from the workstation (Apps §0.5; shell-local implementation of contract delta D10
 * until the sim exports a pure `reach(lab, host, port)`). Pure: reads LabState only.
 */
import type { Host, LabState } from '@/sim/types';

export type ReachResult = 'ok' | 'unknown' | 'timeout' | 'refused';

/** Resolve a host id / hostname / alias / IP to a lab host (or a LabSim device IP). */
export function resolveHost(lab: LabState, hostOrIp: string): { host: Host | null; deviceId: string | null } | null {
  const q = hostOrIp.trim().toLowerCase();
  for (const h of Object.values(lab.hosts ?? {})) {
    if (h.id.toLowerCase() === q || h.ip === q || h.hostname.toLowerCase() === q || (h.aliases ?? []).some((a) => a.toLowerCase() === q)) {
      return { host: h, deviceId: null };
    }
  }
  for (const d of Object.values(lab.devices ?? {})) {
    if (d.ip === q) return { host: null, deviceId: d.id };
  }
  return null;
}

/** True when the sim's host table has not been seeded yet (sim still landing): everything is reachable. */
export function hostsUnseeded(lab: LabState): boolean {
  return !lab.hosts || Object.keys(lab.hosts).length === 0;
}

/**
 * Reach `hostOrIp:port` from ws-17. `port = null` checks only that the host is up (VM up ⇒ page loads).
 * Order (Apps §0.5): unknown → timeout (switch, OS, cable, DAMAGED odd attempt) → refused (no service) → ok.
 */
export function reach(lab: LabState, hostOrIp: string, port: number | null): ReachResult {
  if (hostsUnseeded(lab)) return 'ok';
  const r = resolveHost(lab, hostOrIp);
  if (!r) return 'unknown';
  if (lab.network && lab.network.switchUp === false) return 'timeout';
  if (r.deviceId) {
    const d = lab.devices[r.deviceId];
    if (!d || d.power !== 'on') return 'timeout';
    if (port == null) return 'ok';
    return d.adbTcpPort === port ? 'ok' : 'refused';
  }
  const h = r.host!;
  const os = h.os ?? (h.power === 'on' ? 'RUNNING' : 'OFF');
  if (os !== 'RUNNING') return 'timeout';
  const eth = h.eth ?? (h.ethernet === false ? 'UNPLUGGED' : 'LINKED');
  if (eth === 'UNPLUGGED') return 'timeout';
  if (eth === 'DAMAGED' && ((lab.network?.attempts?.[h.id] ?? 0) % 2 === 1)) return 'timeout';
  if (port == null) return 'ok';
  const listening = Object.values(h.services ?? {}).some((s) => s.running && s.port === port);
  return listening ? 'ok' : 'refused';
}

/** Chromium error page texts (Apps §0.5). */
export function reachErrorTexts(host: string, r: Exclude<ReachResult, 'ok'>): { title: string; sub: string; code: string } {
  switch (r) {
    case 'unknown':
      return { title: "This site can’t be reached", sub: `${host}’s server IP address could not be found.`, code: 'DNS_PROBE_FINISHED_NXDOMAIN' };
    case 'timeout':
      return { title: "This site can’t be reached", sub: `${host} took too long to respond.`, code: 'ERR_CONNECTION_TIMED_OUT' };
    case 'refused':
    default:
      return { title: "This site can’t be reached", sub: `${host} refused to connect.`, code: 'ERR_CONNECTION_REFUSED' };
  }
}

/** Stream/dashboard error suffix (Apps §0.5 "Camera / dashboard" column). */
export function reachErrorShort(r: Exclude<ReachResult, 'ok'>): string {
  switch (r) {
    case 'unknown':
      return 'Could not resolve host';
    case 'timeout':
      return 'connect timed out after 10000 ms';
    case 'refused':
    default:
      return 'Connection refused';
  }
}

/** The (host, port) a browser-hosted app's page needs (Apps §0.5 per-app list); null = always reachable. */
export function appEndpoint(app: string, lab: LabState): { host: string; port: number | null } | null {
  switch (app) {
    case 'orca':
      return { host: 'orca.lab.local', port: 8080 };
    case 'jenkins':
      return { host: 'jenkins.lab.local', port: 8080 };
    case 'ollama':
      return { host: '10.42.1.12', port: null };
    default:
      void lab;
      return null;
  }
}
