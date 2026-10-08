/**
 * GP §3.3 process bonuses PB01–PB08 as data with machine-checkable triggers. The check functions live
 * in the mission runtime (`runtime/arcade/pb.ts`, missions-core); `./index.ts` merges them in.
 */
import { personText } from '@/content';
import type { CareerRankId } from '@/core/state';
import type { EventName } from '@/core/bus';

export interface PbSpec {
  id: string;
  behaviour: string;
  points: number;
  appliesTo: 'listed' | 'any' | 'escalatable';
  minRank?: CareerRankId;
  trigger: { events: readonly EventName[]; rule: string };
  /** Incidents that list this bonus (GP §3.5 mentions). */
  incidents: readonly string[];
}

export const PB_SPECS: readonly PbSpec[] = [
  {
    id: 'PB01', behaviour: 'Rig set Offline before physical rebuild/upgrade work and back after verification', points: 50, appliesTo: 'listed',
    trigger: { events: ['robot.statusChanged'], rule: 'the player sets the bound rig OFFLINE before the first hardware event of the ticket, and later sets it back from OFFLINE (to AVAILABLE) after the fix' },
    incidents: ['INC19', 'INC42', 'INC44', 'INC59'],
  },
  {
    id: 'PB02', behaviour: 'Confirmation build triggered after the fix goes green before Resolve', points: 50, appliesTo: 'any',
    trigger: { events: ['jenkins.buildQueued', 'jenkins.buildFinished'], rule: 'a build the player queued after the fix (fixedAtMs) finishes SUCCESS on the bound rig before Resolve' },
    incidents: ['INC01', 'INC15', 'INC20', 'INC23', 'INC42', 'INC59'],
  },
  {
    id: 'PB03', behaviour: personText('Coordinate change landed through a Gort PR merged by {{jared}} (not only a direct Orca edit)'), points: 75, appliesTo: 'listed',
    trigger: { events: ['github.prMerged', 'orca.screenLocationsSynced'], rule: 'a gort PR touching config/screen-locations/** is merged by jared and synced into Orca while the ticket is open' },
    incidents: ['INC20', 'INC21'],
  },
  {
    id: 'PB04', behaviour: 'Pigeon JSON fixed by pasting from tests/_templates/known_good_actions.json, or located with git diff', points: 25, appliesTo: 'listed',
    trigger: { events: ['terminal.command', 'app.action', 'git.committed'], rule: 'the player ran git diff / opened known_good_actions.json, then committed a pigeon fix that parses' },
    incidents: ['INC25'],
  },
  {
    id: 'PB05', behaviour: 'Legacy Device row kept and new one linked (upgrades)', points: 50, appliesTo: 'listed',
    trigger: { events: ['orca.entitySaved'], rule: 'a new Device row was created and linked as Robot Device while the previous row still exists unchanged' },
    incidents: ['INC42'],
  },
  {
    id: 'PB06', behaviour: 'Reserving engineer asked in LabChat before touching a Reserved rig', points: 25, appliesTo: 'listed',
    trigger: { events: ['chat.message', 'robot.statusChanged'], rule: 'a player LabChat message precedes the first player status change away from RESERVED' },
    incidents: ['INC06', 'INC48'],
  },
  {
    id: 'PB07', behaviour: 'Power off (regulator input / MAIN / MOTOR) before touching wiring, fuses or ribbons', points: 25, appliesTo: 'listed',
    trigger: { events: ['power.regulatorToggled', 'rig.switch', 'power.stripToggled', 'power.fuseRemoved', 'rig.reseated'], rule: 'every wiring/fuse/ribbon event of the ticket happened with its branch de-energised (live == false) after a regulator/MAIN/MOTOR/strip off' },
    incidents: ['INC03', 'INC15', 'INC16', 'INC18', 'INC19', 'INC42', 'INC59'],
  },
  {
    id: 'PB08', behaviour: 'Hands-on fix of an escalatable hardware incident at rank Lab Technician or above', points: 50, appliesTo: 'escalatable', minRank: 'lab-technician',
    trigger: { events: ['ticket.resolved'], rule: 'escalatable hardware incident resolved without an accepted escalation, with a player hardware action, at rank ≥ lab-technician' },
    incidents: ['INC01', 'INC02', 'INC03', 'INC04', 'INC06'],
  },
];

export const PB_SPEC_BY_ID: Readonly<Record<string, PbSpec>> = Object.fromEntries(PB_SPECS.map((b) => [b.id, b]));
