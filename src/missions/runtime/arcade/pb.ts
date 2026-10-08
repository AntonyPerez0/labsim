/**
 * GP §3.3 process bonuses PB01–PB08, checked when a ticket resolves against the events since it spawned.
 */
import type { BusRecord } from '@/core/bus';
import type { ProcessBonusContext, ProcessBonusDef } from '../../types';
import { robotByName } from '../lookups';
import { rankIndex } from '../progression/xp';
import { personText } from '@/content';

type P = Record<string, unknown>;
const pl = (e: BusRecord): P => (e.payload ?? {}) as P;
const player = (e: BusRecord): boolean => {
  const a = pl(e).actor ?? pl(e).by ?? pl(e).triggeredBy;
  return a === undefined || a === 'player';
};

function rigsOf(ctx: ProcessBonusContext): string[] {
  const b = ctx.binding;
  return [...new Set([...(b.rigs ?? []), ...(b.rig ? [b.rig] : [])])];
}

const HARDWARE_EVENTS = new Set([
  'power.fuseRemoved',
  'power.fuseInserted',
  'power.fuseReplaced',
  'power.plugged',
  'power.unplugged',
  'host.ethernetChanged',
  'host.powerChanged',
  'rig.reseated',
  'rig.cradleReplaced',
  'rig.dipArmAdjusted',
  'rig.motorUsbMoved',
  'rig.webcamAimed',
  'device.swapped',
  'device.powerChanged',
]);

const WIRING_EVENTS = new Set(['power.fuseRemoved', 'power.fuseInserted', 'power.fuseReplaced', 'rig.reseated', 'host.ethernetChanged']);

function isHardwareIncident(tags: readonly string[]): boolean {
  return tags.some((t) => t.startsWith('hw.') || t.startsWith('power.') || t === 'cards.callus');
}

export const PROCESS_BONUSES: readonly ProcessBonusDef[] = [
  {
    id: 'PB01',
    behaviour: 'Rig set Offline before physical rebuild/upgrade work and back after verification',
    points: 50,
    appliesTo: 'listed',
    check: (ctx) => {
      const rigs = rigsOf(ctx);
      let offlineAt = -1;
      let backAt = -1;
      let firstHw = -1;
      ctx.events.forEach((e, i) => {
        if (e.type === 'robot.statusChanged' && player(e) && rigs.includes(String(pl(e).name))) {
          if (pl(e).to === 'OFFLINE' && offlineAt < 0) offlineAt = i;
          if (pl(e).from === 'OFFLINE' && offlineAt >= 0) backAt = i;
        }
        if (HARDWARE_EVENTS.has(e.type) && firstHw < 0 && player(e)) firstHw = i;
      });
      return offlineAt >= 0 && backAt > offlineAt && (firstHw < 0 || offlineAt < firstHw);
    },
  },
  {
    id: 'PB02',
    behaviour: 'Confirmation build triggered after the fix goes green before Resolve',
    points: 50,
    appliesTo: 'any',
    check: (ctx) => {
      const fixed = ctx.ticket.fixedAtMs;
      if (fixed === null) return false;
      const rigs = rigsOf(ctx);
      return ctx.events.some((e) => {
        if (e.type !== 'jenkins.buildFinished' || pl(e).result !== 'SUCCESS' || e.at < fixed) return false;
        const b = ctx.state.lab.jenkins?.builds?.[String(pl(e).buildId)];
        if (!b || b.triggeredBy !== 'player') return false;
        if (!rigs.length) return true;
        const robotId = pl(e).robotId as number | null;
        return rigs.some((r) => robotByName(ctx.state.lab, r)?.id === robotId);
      });
    },
  },
  {
    id: 'PB03',
    behaviour: personText('Coordinate change landed through a Gort PR merged by {{jared}} (not only a direct Orca edit)'),
    points: 75,
    appliesTo: 'listed',
    check: (ctx) => ctx.events.some((e) => e.type === 'github.prMerged' && pl(e).repo === 'gort' && pl(e).by === 'jared'),
  },
  {
    id: 'PB04',
    behaviour: 'Pigeon JSON fixed by pasting from tests/_templates/known_good_actions.json, or located with git diff',
    points: 25,
    appliesTo: 'listed',
    check: (ctx) =>
      ctx.events.some(
        (e) =>
          (e.type === 'terminal.command' && /\bgit\s+diff\b/.test(String(pl(e).line))) ||
          (e.type === 'app.action' && JSON.stringify(pl(e).data ?? {}).includes('known_good_actions.json')),
      ),
  },
  {
    id: 'PB05',
    behaviour: 'Legacy Device row kept and new one linked (upgrades)',
    points: 50,
    appliesTo: 'listed',
    check: (ctx) => {
      const created = ctx.events.some((e) => e.type === 'orca.entitySaved' && pl(e).entity === 'device' && pl(e).action === 'create' && player(e));
      const deleted = ctx.events.some((e) => e.type === 'orca.entitySaved' && pl(e).entity === 'device' && pl(e).action === 'delete' && player(e));
      const linked = ctx.events.some(
        (e) => e.type === 'orca.entitySaved' && pl(e).entity === 'robot' && player(e) && ((pl(e).fields as string[] | undefined) ?? []).some((f) => /deviceId|device/i.test(f)),
      );
      return created && linked && !deleted;
    },
  },
  {
    id: 'PB06',
    behaviour: 'Reserving engineer asked in LabChat before touching a Reserved rig',
    points: 25,
    appliesTo: 'listed',
    check: (ctx) => {
      let asked = false;
      for (const e of ctx.events) {
        if (e.type === 'chat.message' && pl(e).author === 'player') asked = true;
        if (e.type === 'robot.statusChanged' && pl(e).from === 'RESERVED' && player(e)) return asked;
      }
      return asked;
    },
  },
  {
    id: 'PB07',
    behaviour: 'Power off (regulator input / MAIN / MOTOR) before touching wiring, fuses or ribbons',
    points: 25,
    appliesTo: 'listed',
    check: (ctx) => {
      let touched = false;
      for (const e of ctx.events) {
        if (!WIRING_EVENTS.has(e.type) || !player(e)) continue;
        if (pl(e).live === true) return false;
        touched = true;
      }
      if (!touched) return false;
      return ctx.events.some(
        (e) => (e.type === 'power.regulatorToggled' && pl(e).on === false) || (e.type === 'rig.switch' && pl(e).on === false) || (e.type === 'power.stripToggled' && pl(e).on === false),
      );
    },
  },
  {
    id: 'PB08',
    behaviour: 'Hands-on fix of an escalatable hardware incident at rank Lab Technician or above',
    points: 50,
    minRank: 'lab-technician',
    appliesTo: 'escalatable',
    check: (ctx) => !ctx.escalated && rankIndex(ctx.rank) >= rankIndex('lab-technician') && ctx.events.some((e) => HARDWARE_EVENTS.has(e.type) && player(e)),
  },
];

const overrides = new Map<string, ProcessBonusDef>();
/** Content overrides (`src/missions/arcade/incidents/pb.ts`), keyed by id. */
export function registerProcessBonuses(defs: readonly ProcessBonusDef[]): void {
  for (const b of defs) overrides.set(b.id, b);
}
function allBonuses(): ProcessBonusDef[] {
  const out = PROCESS_BONUSES.map((b) => overrides.get(b.id) ?? b);
  for (const [id, b] of overrides) if (!PROCESS_BONUSES.some((x) => x.id === id)) out.push(b);
  return out;
}

/** Process bonuses applicable to an incident. */
export function applicableBonuses(incident: { processBonuses?: readonly string[]; escalatable: boolean; tags: readonly string[] }): ProcessBonusDef[] {
  const listed = new Set(incident.processBonuses ?? []);
  return allBonuses().filter((b) => {
    if (b.appliesTo === 'any') return true;
    if (b.appliesTo === 'escalatable') return incident.escalatable && isHardwareIncident(incident.tags);
    return listed.has(b.id);
  });
}
