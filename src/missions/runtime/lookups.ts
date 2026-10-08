/**
 * Read helpers over `LabState` (pure). Entity tables are keyed by numeric ids or runtime ids; content
 * refers to things by their names (`wall-e`, `johnny-5-flex2`, `GO-SDK-US-01`, `pi-10.42.10.11`). The
 * name indexes are memoised per table object (immer gives a new object whenever a table changes).
 */
import type {
  CardProfile,
  TerminalDevice,
  Host,
  JenkinsBuild,
  LabState,
  MerchantConfig,
  OrcaDevice,
  OrcaRobot,
  OrcaScreen,
  ScreenCompareImage,
} from '@/sim/types';

function indexBy<T>(cache: WeakMap<object, Map<string, T>>, table: Record<string | number, T> | undefined, key: (v: T) => string): Map<string, T> {
  if (!table) return new Map();
  let idx = cache.get(table);
  if (!idx) {
    idx = new Map();
    for (const v of Object.values(table)) idx.set(key(v), v);
    cache.set(table, idx);
  }
  return idx;
}

const robotIdx = new WeakMap<object, Map<string, OrcaRobot>>();
const deviceRowIdx = new WeakMap<object, Map<string, OrcaDevice>>();
const merchantIdx = new WeakMap<object, Map<string, MerchantConfig>>();
const cardIdx = new WeakMap<object, Map<string, CardProfile>>();
const compareIdx = new WeakMap<object, Map<string, ScreenCompareImage>>();
const screenIdx = new WeakMap<object, Map<string, OrcaScreen>>();
const hostIpIdx = new WeakMap<object, Map<string, Host>>();
const devByOrcaName = new WeakMap<object, Map<string, TerminalDevice>>();

export function robotByName(lab: LabState, name: string | null | undefined): OrcaRobot | null {
  if (!name) return null;
  return indexBy(robotIdx, lab.orca?.robots, (r) => r.name).get(name) ?? null;
}

export function robotById(lab: LabState, id: number | null | undefined): OrcaRobot | null {
  if (id === null || id === undefined) return null;
  return lab.orca?.robots?.[id] ?? null;
}

export function robotNameOf(lab: LabState, id: number | null | undefined): string | null {
  return robotById(lab, id)?.name ?? null;
}

/** Orca Device Type of a robot's device row (e.g. `FLEX_4`), or null. */
export function robotDeviceType(lab: LabState, robotName: string | null | undefined): string | null {
  const r = robotByName(lab, robotName);
  return (r && r.deviceId != null ? deviceRowById(lab, r.deviceId)?.deviceType : null) ?? null;
}

export function deviceRowByName(lab: LabState, name: string | null | undefined): OrcaDevice | null {
  if (!name) return null;
  return indexBy(deviceRowIdx, lab.orca?.devices, (d) => d.name).get(name) ?? null;
}

export function deviceRowById(lab: LabState, id: number | null | undefined): OrcaDevice | null {
  if (id === null || id === undefined) return null;
  return lab.orca?.devices?.[id] ?? null;
}

export function merchantByName(lab: LabState, name: string): MerchantConfig | null {
  return indexBy(merchantIdx, lab.orca?.merchants, (m) => m.name).get(name) ?? null;
}

export function merchantById(lab: LabState, id: number | null | undefined): MerchantConfig | null {
  if (id === null || id === undefined) return null;
  return lab.orca?.merchants?.[id] ?? null;
}

export function cardProfileByName(lab: LabState, name: string): CardProfile | null {
  return indexBy(cardIdx, lab.orca?.cardProfiles, (c) => c.name).get(name) ?? null;
}

export function screenCompareByName(lab: LabState, name: string): ScreenCompareImage | null {
  return indexBy(compareIdx, lab.orca?.screenCompareImages, (c) => c.name).get(name) ?? null;
}

export function screenByTypeAndName(lab: LabState, deviceType: string, name: string): OrcaScreen | null {
  return indexBy(screenIdx, lab.orca?.screens, (s) => `${s.deviceType}/${s.name}`).get(`${deviceType}/${name}`) ?? null;
}

/** Runtime device by runtime id (`dev-wall-e-flex3`), Orca row name (`wall-e-flex3`) or `dev-<name>`. */
export function runtimeDevice(lab: LabState, idOrName: string | null | undefined): TerminalDevice | null {
  if (!idOrName || !lab.devices) return null;
  const direct = lab.devices[idOrName] ?? lab.devices[`dev-${idOrName}`];
  if (direct) return direct;
  return indexBy(devByOrcaName, lab.devices, (d) => d.orcaDeviceName || d.id).get(idOrName) ?? null;
}

/** Host by id (`pi-wall-e`), case-insensitive id (`MINIX-01`), `pi-<ip>`, bare IP or hostname. */
export function hostById(lab: LabState, id: string | null | undefined): Host | null {
  if (!id || !lab.hosts) return null;
  const hosts = lab.hosts;
  if (hosts[id]) return hosts[id]!;
  const lower = id.toLowerCase();
  if (hosts[lower]) return hosts[lower]!;
  const ipIdx = indexBy(hostIpIdx, hosts, (h) => h.ip);
  const ip = lower.startsWith('pi-') ? lower.slice(3) : lower;
  const byIp = ipIdx.get(ip);
  if (byIp) return byIp;
  for (const h of Object.values(hosts)) {
    if (h.hostname?.toLowerCase() === lower || h.aliases?.some((a) => a.toLowerCase() === lower)) return h;
  }
  return null;
}

/** Host part of a URL (`http://10.42.10.11:8000/adb` → `10.42.10.11`). */
export function urlHost(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^[a-z]+:\/\/([^/:]+)/i.exec(url.trim());
  return m ? m[1]! : null;
}

/** Builds of a job, newest first (by build number). */
export function jobBuilds(lab: LabState, jobId: string): JenkinsBuild[] {
  const builds = lab.jenkins?.builds;
  if (!builds) return [];
  return Object.values(builds)
    .filter((b) => b.jobId === jobId)
    .sort((a, b) => b.number - a.number);
}

/** Latest finished build of a job, or null. */
export function lastFinishedBuild(lab: LabState, jobId: string): JenkinsBuild | null {
  return jobBuilds(lab, jobId).find((b) => b.state === 'finished') ?? null;
}

/** The Pi host that serves a robot (from its ADB Service URL), or the rig's `piHostId`. */
export function piHostOfRobot(lab: LabState, robotName: string): Host | null {
  const rig = lab.rigs?.[robotName];
  if (rig?.piHostId) {
    const h = hostById(lab, rig.piHostId);
    if (h) return h;
  }
  const robot = robotByName(lab, robotName);
  const ip = urlHost(robot?.adbServiceUrl);
  return ip ? hostById(lab, ip) : null;
}

/** Robot names a host id refers to (its own rig, every rig of a shared Pi / Callus box). */
export function rigsServedByHost(lab: LabState, hostId: string): string[] {
  const host = hostById(lab, hostId);
  if (!host) return [];
  const out: string[] = [];
  for (const rig of Object.values(lab.rigs ?? {})) {
    if (rig.piHostId === host.id || rig.callusHostId === host.id) out.push(rig.id);
  }
  if (!out.length) {
    for (const r of Object.values(lab.orca?.robots ?? {})) if (urlHost(r.adbServiceUrl) === host.ip) out.push(r.name);
  }
  return out.sort();
}

/** Parse a `.properties` text into a map (last key wins; `#`/`!` comments ignored). */
export function parseProperties(text: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!text) return out;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const m = /^([^=:\s]+)\s*[=:]\s*(.*)$/.exec(line);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

/** Resolve an RFC 6901 JSON pointer (`/capabilities/printer`). Undefined when missing. */
export function jsonPointer(doc: unknown, pointer: string): unknown {
  if (pointer === '' || pointer === '/') return doc;
  const parts = pointer
    .replace(/^\//, '')
    .split('/')
    .map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let cur: unknown = doc;
  for (const p of parts) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Game ms → "HH:MM" on the game clock. */
export function hhmm(gameMs: number): string {
  const dayMs = 86_400_000;
  const t = ((gameMs % dayMs) + dayMs) % dayMs;
  const h = Math.floor(t / 3_600_000);
  const m = Math.floor((t % 3_600_000) / 60_000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
