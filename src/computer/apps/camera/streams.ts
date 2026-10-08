/**
 * Camera stream catalogue and availability (Apps §8.1–§8.2): distinct Orca Camera Stream URLs, the robots on
 * each, reachability of `camera-stream` :8081 with the reason line, the camera id behind a URL.
 */
import { sim } from '@/sim';
import type { LabState, OrcaRobot } from '@/sim/types';
import { reach, reachErrorShort } from '@/computer/shell/reach';
import { cameraDefForUrl } from './frames';

export interface StreamInfo {
  url: string;
  /** "10.42.10.40" */
  host: string;
  robots: OrcaRobot[];
}

export const STREAM_RE = /^https?:\/\/([\d.]+)(?::(\d+))?\/stream\.mjpg\/?$/i;

export function hostOfUrl(url: string): string | null {
  const m = /^https?:\/\/([^/:]+)/i.exec(url.trim());
  return m ? m[1]! : null;
}

export function urlOfHost(host: string): string {
  return `http://${host}:8081/stream.mjpg`;
}

function ipKey(ip: string): number {
  return ip.split('.').reduce((a, p) => a * 256 + (Number(p) || 0), 0);
}

export function listStreams(robots: Record<number, OrcaRobot>): StreamInfo[] {
  const by = new Map<string, StreamInfo>();
  for (const r of Object.values(robots)) {
    const url = (r.cameraStreamUrl ?? '').trim();
    if (!url) continue;
    const host = hostOfUrl(url);
    if (!host) continue;
    const key = url.toLowerCase();
    const cur = by.get(key) ?? { url, host, robots: [] };
    cur.robots.push(r);
    by.set(key, cur);
  }
  const out = [...by.values()];
  for (const s of out) s.robots.sort((a, b) => a.id - b.id);
  return out.sort((a, b) => ipKey(a.host) - ipKey(b.host) || a.url.localeCompare(b.url));
}

export interface StreamStatus {
  ok: boolean;
  cameraId: string | null;
  /** "Stream unavailable — <url>" when !ok. */
  error: string | null;
  /** Reason line (`Connection refused`, `connect timed out after 10000 ms`, `Could not resolve host`). */
  reason: string | null;
}

/** Availability per Apps §8.2 (sim probe when available, shell reach for the reason). */
export function streamStatus(lab: LabState, url: string): StreamStatus {
  const host = hostOfUrl(url);
  const unavailable = (reason: string): StreamStatus => ({ ok: false, cameraId: null, error: `Stream unavailable — ${url}`, reason });
  if (!host || !STREAM_RE.test(url.trim())) return unavailable('Could not resolve host');
  const port = Number(/:(\d+)\//.exec(url)?.[1] ?? 80);
  const r = reach(lab, host, port);
  let probe: ReturnType<typeof sim.camera.probe> | null = null;
  try {
    probe = sim.camera.probe(url);
  } catch {
    probe = null;
  }
  if (probe) {
    if (probe.ok) return { ok: true, cameraId: probe.cameraId, error: null, reason: null };
    return unavailable(r === 'ok' ? 'Connection refused' : reachErrorShort(r));
  }
  if (r !== 'ok') return unavailable(reachErrorShort(r));
  return { ok: true, cameraId: cameraDefForUrl(url)?.id ?? null, error: null, reason: null };
}

/** Robot tag text: `R2-D2 · 10.42.10.14` (dedicated cameras) — the robot's Pi IP from its ADB service URL. */
export function robotTag(r: OrcaRobot): string {
  const ip = hostOfUrl(r.adbServiceUrl ?? '') ?? hostOfUrl(r.cameraStreamUrl) ?? '';
  return `${r.humanReadableName || r.name.toUpperCase()}${ip ? ` · ${ip}` : ''}`;
}

/** Snapshot file name (Apps §8.6): `r2d2_cfd.png` for R2-D2, else `<rig>_<hhmmss>.png`. */
export function snapshotName(robot: OrcaRobot | null, cameraId: string | null, hhmmss: string): string {
  const rig = robot?.name ?? cameraId?.replace(/^cam-/, '') ?? 'camera';
  if (rig === 'r2-d2') return 'r2d2_cfd.png';
  return `${rig.replace(/[^a-z0-9]+/gi, '').toLowerCase()}_${hhmmss.replace(/:/g, '')}.png`;
}
