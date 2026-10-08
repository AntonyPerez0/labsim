/**
 * Network reachability (Sim §1.9) — used by every REST call, ping, ssh, adb, curl and health check.
 * Exposed to sim-devops through `CoreServices.resolve` / `CoreServices.reach`.
 */
import type { TerminalDevice, Host, LabState } from '../types';
import type { ReachResult } from '../devops';
import { NET_READY_MS } from '../seed/hosts';
import { rand } from './util';
import { ro, roAt } from './ro';

export interface Resolved {
  hostId: string | null;
  deviceId: string | null;
  ip: string | null;
}

/** `ip`, `ip:port`, hostname or alias → host / LabSim device. */
export function resolve(lab: LabState, target: string): Resolved {
  const raw = (target ?? '').trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, '');
  const name = raw.replace(/:\d+$/, '');
  if (!name) return { hostId: null, deviceId: null, ip: null };
  const lower = name.toLowerCase();
  const L = ro(lab);
  const hosts = ro(L.hosts);
  // Indexed lookup (verified on hit — the index is a cache, the scan below stays the definition).
  const idx = hostIndex(hosts);
  const cand = idx.get(name) ?? idx.get(lower);
  if (cand !== undefined) {
    const h = ro(hosts[cand]);
    if (h && hostMatches(cand, h, name, lower)) return { hostId: cand, deviceId: null, ip: h.ip };
  }
  for (const id of Object.keys(hosts).sort()) {
    const h = ro(hosts[id]!);
    if (hostMatches(id, h, name, lower)) return { hostId: id, deviceId: null, ip: h.ip };
  }
  const devices = ro(L.devices);
  const did = deviceIndex(devices).get(name);
  if (did !== undefined) {
    const d = ro(devices[did]);
    if (d && d.ip === name) return { hostId: null, deviceId: did, ip: d.ip };
  }
  for (const id of Object.keys(devices).sort()) {
    const d = ro(devices[id]!);
    if (d.ip && d.ip === name) return { hostId: null, deviceId: id, ip: d.ip };
  }
  return { hostId: null, deviceId: null, ip: /^\d+\.\d+\.\d+\.\d+$/.test(name) ? name : null };
}

function hostMatches(id: string, h: Host, name: string, lower: string): boolean {
  return h.ip === name || id === name || h.hostname.toLowerCase() === lower || ro(h.aliases).some((a) => a.toLowerCase() === lower);
}

const HOST_INDEX = new WeakMap<object, Map<string, string>>();
/** name / ip / hostname / alias (lower-cased too) → first host id in sorted order. */
function hostIndex(hosts: LabState['hosts']): Map<string, string> {
  let m = HOST_INDEX.get(hosts);
  if (m) return m;
  m = new Map();
  for (const id of Object.keys(hosts).sort()) {
    const h = ro(hosts[id]!);
    for (const k of [h.ip, id, h.hostname.toLowerCase(), ...ro(h.aliases).map((a) => a.toLowerCase())]) if (k && !m.has(k)) m.set(k, id);
  }
  HOST_INDEX.set(hosts, m);
  return m;
}

const DEVICE_INDEX = new WeakMap<object, Map<string, string>>();
function deviceIndex(devices: LabState['devices']): Map<string, string> {
  let m = DEVICE_INDEX.get(devices);
  if (m) return m;
  m = new Map();
  for (const id of Object.keys(devices).sort()) {
    const d = ro(devices[id]!);
    if (d.ip && !m.has(d.ip)) m.set(d.ip, id);
  }
  DEVICE_INDEX.set(devices, m);
  return m;
}

/** Host has a network link (OS up enough and cable seated). Switch state not included. */
export function hostNetUp(lab: LabState, host: Host): boolean {
  const h = ro(host);
  if (h.eth === 'UNPLUGGED') return false;
  if (h.os === 'RUNNING') return true;
  if (h.os === 'BOOTING' && h.bootStartedPhysMs != null) {
    const ready = NET_READY_MS[h.kind] ?? 10_000;
    return ro(ro(lab).time).physMs - h.bootStartedPhysMs >= ready;
  }
  return false;
}

export function deviceNetUp(d: TerminalDevice): boolean {
  return d.power === 'on' && !d.dead;
}

/** A running service listening on `port`. */
export function listening(h: Host, port: number): boolean {
  const svcs = ro(ro(h).services);
  for (const k of Object.keys(svcs)) {
    const s = ro(svcs[k]!);
    if (s.running && s.port === port) return true;
  }
  return false;
}

/**
 * Reachability of `target:port` from `fromHostId` (Sim §1.9). Mutates `network.attempts` for DAMAGED
 * cables (every other attempt times out) and draws LAN latency from the `devices` stream unless
 * `opts.noLatency`.
 */
export function reach(lab: LabState, fromHostId: string, target: string, port: number | null, opts: { noLatency?: boolean; sameAttempt?: boolean } = {}): ReachResult {
  const r = resolve(lab, target);
  const fail = (kind: ReachResult['kind'], error: string, latencyMs: number): ReachResult => ({ ok: false, kind, error, latencyMs, hostId: r.hostId, deviceId: r.deviceId });
  if (!r.hostId && !r.deviceId) return fail('no-route', 'No route to host', 0);
  const L = ro(lab);
  const hosts = ro(L.hosts);
  const timeoutMs = ro(ro(L.orca).healthCheck).timeoutMs;
  const from = ro(hosts[fromHostId]);
  const sameHost = r.hostId === fromHostId;
  if (!sameHost) {
    if (from && from.kind !== 'workstation' && !hostNetUp(lab, from)) return fail('timeout', 'connect timed out', timeoutMs);
    if (!ro(L.network).switchUp) return fail('timeout', 'connect timed out', timeoutMs);
  }
  if (r.deviceId) {
    const d = roAt(L.devices, r.deviceId)!;
    if (!deviceNetUp(d)) return fail('no-route', 'No route to host', 0);
    if (port != null && d.adbTcpPort !== port) return fail('refused', 'Connection refused', 1);
  } else {
    const h = ro(hosts[r.hostId!]!);
    if (!sameHost) {
      if (!hostNetUp(lab, h)) return fail('timeout', 'connect timed out', timeoutMs);
      // `sameAttempt`: a hop made while serving a request that already crossed the damaged cable (the Pi's
      // upstream checks inside one `/health`) shares that attempt's fate instead of drawing a new parity.
      for (const hid of opts.sameAttempt ? [] : [r.hostId!, fromHostId]) {
        const hh = ro(hosts[hid]);
        if (hh?.eth === 'DAMAGED') {
          const n = (ro(ro(L.network).attempts)[hid] ?? 0) + 1;
          lab.network.attempts[hid] = n;
          if (n % 2 === 1) return fail('timeout', 'connect timed out', timeoutMs);
        }
      }
    }
    if (port != null && !listening(h, port)) return fail('refused', 'Connection refused', 2);
  }
  const latencyMs = opts.noLatency ? 0 : 1 + Math.floor(4 * rand(lab, 'devices'));
  return { ok: true, kind: 'ok', error: null, latencyMs, hostId: r.hostId, deviceId: r.deviceId };
}

/** Network step (Sim §3.1.1 #4): refresh the ARP view once per physical second. */
export function networkStep(lab: LabState): void {
  const sec = Math.floor(lab.time.physMs / 1000);
  const prevSec = Math.floor((lab.time.physMs - 50) / 1000);
  if (sec === prevSec && Object.keys(ro(ro(lab).network).arp).length > 0) return;
  const arp: Record<string, string> = {};
  const L = ro(lab);
  if (ro(L.network).switchUp) {
    const hosts = ro(L.hosts);
    for (const id of Object.keys(hosts).sort()) {
      const h = ro(hosts[id]!);
      if (h.ip && hostNetUp(lab, h)) arp[h.ip] = id;
    }
    const devices = ro(L.devices);
    for (const id of Object.keys(devices).sort()) {
      const d = ro(devices[id]!);
      if (d.ip && deviceNetUp(d)) arp[d.ip] = id;
    }
  }
  const prev = ro(ro(L.network).arp);
  const pk = Object.keys(prev);
  const nk = Object.keys(arp);
  if (pk.length === nk.length && nk.every((k) => prev[k] === arp[k])) return;
  lab.network.arp = arp;
}
