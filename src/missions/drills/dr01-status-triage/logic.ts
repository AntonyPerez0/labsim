/**
 * DR01 Status Triage (GP §2.4.3): a 1–3 sentence scenario, sometimes with a mini render (Orca row, Notes
 * line, health log, tablet, Jenkins line) → press 1–5. Bank ≥ 40 including every required item verbatim.
 * Every answer cites the Ref §3 fact that decides it (F100–F113).
 */
import { personName } from '@/content';
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { teach } from '../common/teach';
import { STATUS_TAG, type StatusName } from '../common/statuses';
import { N } from '../common/people';

export interface TriageRender {
  kind: 'notes' | 'orca' | 'health' | 'tablet' | 'jenkins' | 'terminal';
  lines: string[];
}

export interface TriageData {
  scenario: string;
  render?: TriageRender;
  answer: StatusName;
  /** 1 = definition, 2 = applied, 3 = trap. */
  level: 1 | 2 | 3;
  required?: boolean;
}

const J = personName('jared');
const RILEY = personName('riley');
const MORGAN = personName('morgan');
const SAM = personName('sam');
const ALEX = personName('alex');
const TS = '2026-10-05 08:15:00';

const WHY: Record<StatusName, string> = {
  Available: 'Available = online, healthy and open to general pipeline checkouts.',
  Unavailable: 'Unavailable is strictly reserved: general pipelines cannot check it out unless the job passes the robot\'s exact name.',
  Offline: 'Offline is the manual placeholder while engineers physically build a rig or assemble data profiles — and Orca skips health checks for Offline units.',
  'Connection Failed': 'Connection Failed is set automatically when the 5-minute REST ping to the Pi drops or returns a non-200 response.',
  Reserved: 'Reserved is set manually by an engineer running tests locally; it blocks Jenkins pipelines and health-check overrides.',
};

const BASE_FACTS: Record<StatusName, string[]> = {
  Available: ['F101'],
  Unavailable: ['F102', 'F103'],
  Offline: ['F105', 'F106'],
  'Connection Failed': ['F107', 'F108'],
  Reserved: ['F112', 'F113'],
};

let n = 0;
function t(answer: StatusName, scenario: string, why: string, o: { facts?: string[]; render?: TriageRender; level?: 1 | 2 | 3; required?: boolean; illustrative?: boolean; tags?: string[] } = {}): DrillItem<TriageData> {
  n++;
  const id = `DR01-${String(n).padStart(2, '0')}`;
  const tags = [STATUS_TAG[answer], ...(o.tags ?? [])];
  const factIds = o.facts ?? BASE_FACTS[answer];
  return {
    id,
    tags: [...new Set(tags)],
    factIds,
    teach: teach(`Answer: ${answer}`, why || WHY[answer], { ref: 'Ref §3', factIds, illustrative: o.illustrative, doInstead: `Press ${['Available', 'Unavailable', 'Offline', 'Connection Failed', 'Reserved'].indexOf(answer) + 1} — ${answer}.`, tag: STATUS_TAG[answer] }),
    data: { scenario, render: o.render, answer, level: o.level ?? 2, required: o.required },
  };
}

const notes = (...lines: string[]): TriageRender => ({ kind: 'notes', lines });

export const STATUS_TRIAGE_ITEMS: readonly DrillItem<TriageData>[] = [
  /* ── required items (GP §2.4.3, exact answers) ── */
  t('Offline', `${J} is rebuilding BAYMAX's gantry this afternoon.`, 'A rig being physically built is set Offline by hand — the manual placeholder state.', { required: true, facts: ['F105'] }),
  t('Connection Failed', 'The 08:15 ping to `http://10.42.10.13:8000/health` returned `502 Bad Gateway`.', 'Any non-200 HTTP response to the 5-minute health ping sets Connection Failed automatically.', {
    required: true,
    facts: ['F107'],
    render: notes(`${TS} GET http://10.42.10.13:8000/health → 502 Bad Gateway`),
    tags: ['orca.healthcheck', 'orca.notes'],
  }),
  t('Reserved', "You're about to run TaxTest from IntelliJ on MEGATRON.", 'Running tests locally from your workstation means you Reserve the rig first, which blocks Jenkins pipelines.', { required: true, facts: ['F112', 'F113'] }),
  t('Unavailable', "ROSIE holds PayCore's standalone merchant; general jobs must not touch it.", 'Unavailable isolates specialised rigs such as PayCore standalone setups so general tests do not overwrite their merchant profiles.', { required: true, facts: ['F102', 'F103'] }),
  t('Available', 'Healthy rig, open to any pipeline.', '', { required: true, level: 1 }),
  t('Unavailable', 'A job that named `rosie` just finished. ROSIE\'s status now?', 'When an explicitly named job finishes, Orca automatically resets the robot back to Unavailable.', { required: true, facts: ['F104'], level: 3 }),
  t('Reserved', "A Reserved rig's Pi loses power. What does Orca show at the next check?", 'Reserved blocks health-check overrides: the ping cannot flip a Reserved rig to Connection Failed.', { required: true, facts: ['F113'], level: 3, tags: ['orca.healthcheck'] }),
  t('Offline', "An Offline rig's Pi is unplugged during the build. Status after the next check?", 'Not Connection Failed — Orca skips health checks for Offline rigs, so an unplugged Pi on a rig being built stays Offline.', {
    required: true,
    facts: ['F106'],
    level: 3,
    tags: ['orca.healthcheck'],
  }),
  t('Connection Failed', 'Health ping: `connect timed out after 10000 ms`.', 'A ping that drops (no response) sets Connection Failed automatically.', { required: true, facts: ['F107'], render: notes(`${TS} GET http://10.42.10.12:8000/health → connect timed out after 10000 ms`), tags: ['orca.healthcheck'] }),
  t('Connection Failed', 'The Minix box running Callus for Rack A is powered off; the Pi reports it upstream.', 'A Minix box running Callus going offline is one of the classic Connection Failed causes — the Pi answers, but not with 200.', {
    required: true,
    facts: ['F110', 'F107'],
    level: 3,
    tags: ['cards.callus'],
  }),
  t('Available', 'A coworker finished their local run and wants pipelines to use the rig again.', 'Releasing a Reserved rig sets it back to Available: online, healthy and open to general checkouts.', { required: true, facts: ['F101', 'F112'] }),
  t('Offline', 'A rig is waiting for its data profiles to be assembled.', 'Offline also covers assembling data profiles, not just physical building.', { required: true, facts: ['F105'] }),

  /* ── more Connection Failed ── */
  t('Connection Failed', "WALL-E's Pi board crashed overnight; the 5-minute health check couldn't reach it.", `A crashed Pi board is the textbook Connection Failed cause (escalate to ${N.jared} with the Notes endpoint).`, { facts: ['F110', 'F111'], tags: ['hw.pi'] }),
  t('Connection Failed', 'Ping returned `HTTP/1.1 500 Internal Server Error`.', 'Only a 200 counts as healthy; any other HTTP status from the ping is Connection Failed.', { facts: ['F107'], render: { kind: 'terminal', lines: ['$ curl -i http://10.42.10.16:8000/health', 'HTTP/1.1 500 Internal Server Error'] }, tags: ['orca.healthcheck'] }),
  t('Connection Failed', 'Notes line on WALL-E:', 'The Pi refused the health ping (no 200) — Orca sets Connection Failed and logs the endpoint and error in Notes.', {
    facts: ['F107', 'F109'],
    render: notes(`${TS} GET http://10.42.10.11:8000/health → Connection refused`),
    tags: ['orca.notes'],
  }),
  t('Connection Failed', 'The Pi answered the ping — but with this:', 'A 502 is non-200. Here the Pi itself is alive and is telling you its Callus upstream (the Minix box) is unreachable.', {
    facts: ['F107', 'F110'],
    render: notes(`${TS} GET http://10.42.10.13:8000/health → 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"}`),
    level: 3,
    tags: ['orca.notes', 'cards.callus'],
  }),
  t('Connection Failed', "Orca opened a Notes section on JOHNNY-5 logging the exact endpoint attempted and the error text.", 'Opening Notes with the endpoint and error text is what Orca does when it sets Connection Failed.', { facts: ['F109'], level: 1, tags: ['orca.notes'] }),
  t('Connection Failed', 'Which status does Orca set automatically after a failed 5-minute ping?', '', { facts: ['F107'], level: 1, tags: ['orca.healthcheck'] }),
  t('Connection Failed', "Rack B's 5 V inline fuse blew; JOHNNY-5's Pi (behind it) went dark before the 08:15 check. JOHNNY-5 was Available.", 'A dark Pi cannot answer the ping, so an Available rig behind a blown 5 V fuse fails its next health check.', {
    facts: ['F107', 'F087'],
    level: 2,
    tags: ['power.fuses'],
  }),
  t('Connection Failed', 'Tablet banner grey, `Status: CONTROLLER UNREACHABLE`; Orca\'s last ping to the same Pi timed out.', 'The Pi is hung or off: the ping dropped, so the rig is Connection Failed (and blocked from checkouts).', {
    facts: ['F107', 'F108'],
    render: { kind: 'tablet', lines: ['SONNY', 'Status: CONTROLLER UNREACHABLE'] },
    illustrative: true,
  }),
  t('Connection Failed', "SONNY's Pi has been hung since 07:55; the 08:00 check got no response.", '', { facts: ['F107', 'F110'] }),
  t('Connection Failed', 'Ping response: `HTTP/1.1 404 Not Found` — the robot-controller route moved after an update.', 'Even a "polite" 404 is non-200 — the health check fails and Orca sets Connection Failed.', { facts: ['F107'], level: 3, tags: ['orca.healthcheck'] }),

  /* ── Offline ── */
  t('Offline', `${J} is still soldering ROBBY's new limit switches; the rig is half built.`, '', { facts: ['F105'] }),
  t('Offline', 'Health log line below. What is BAYMAX\'s status?', 'Orca bypasses the 5-minute health check for Offline units — that is what SKIPPED means.', { facts: ['F106'], render: { kind: 'health', lines: ['08:15:00  wall-e   200 OK', '08:15:00  baymax   SKIPPED (Offline)'] }, tags: ['orca.healthcheck'] }),
  t('Offline', "A brand-new Flex 4 rig was just racked; its Card Profiles and Screen Locations aren't entered yet.", 'Assembling data profiles is Offline work — the rig is not ready for any pipeline.', { facts: ['F105'] }),
  t('Offline', 'Which status does Orca skip during the 5-minute health check?', '', { facts: ['F106'], level: 1, tags: ['orca.healthcheck'] }),
  t('Offline', `${ALEX} unboxed a Mini 3 and is printing its cradle; the rig won't be ready until Friday.`, 'A rig that is physically being built sits in the manual Offline placeholder.', { facts: ['F105'] }),
  t('Offline', 'You set DATA aside to rebuild its data profiles after a merchant change.', '', { facts: ['F105'] }),
  t('Offline', "DALEK is Offline for a rebuild. Its Pi is powered down all day. What do the 08:15, 08:20 and 08:25 checks do to its status?", 'Nothing — Offline units are bypassed by the health check, so DALEK stays Offline however long the Pi is down.', { facts: ['F106'], level: 3, tags: ['orca.healthcheck'] }),

  /* ── Reserved ── */
  t('Reserved', `${RILEY} is debugging a flaky test on EVE from their workstation right now.`, '', { facts: ['F112'] }),
  t('Reserved', `MOTHER is locked by ${MORGAN}, who is running a local Contact Canada script from a laptop.`, '', { facts: ['F112', 'F113'] }),
  t('Reserved', 'Which status blocks Jenkins pipelines and health-check overrides because an engineer is testing locally?', '', { facts: ['F113'], level: 1 }),
  t('Reserved', "You're about to run a Pigeon test from IntelliJ against TARS.", 'Any local run from your workstation — uia-remote or Pigeon — means Reserved first.', { facts: ['F112'] }),
  t('Reserved', 'Health log line below. EVE\'s status?', 'Reserved blocks health-check overrides: the check does not override a Reserved rig.', { facts: ['F113'], render: { kind: 'health', lines: ['08:15:00  wall-e   200 OK', '08:15:00  eve      RESERVED — not overridden'] }, illustrative: true, tags: ['orca.healthcheck'] }),
  t('Reserved', 'Jenkins queues a general regression build that could use a rig you have Reserved. What does the rig stay?', 'Reserved blocks Jenkins pipelines — the build waits for another rig.', { facts: ['F113'], level: 3, tags: ['jenkins.checkout'] }),

  /* ── Unavailable ── */
  t('Unavailable', 'KRYTEN carries PayCore\'s standalone merchant profile. A general regression job must not overwrite it.', '', { facts: ['F103'] }),
  t('Unavailable', 'A pipeline passes `ROBOT_NAME=bender` to run the LabSim Dining suite on BENDER (normally Unavailable). When it finishes, BENDER is…', 'Orca automatically resets a rig to Unavailable when an explicitly named job finishes.', { facts: ['F104'], level: 3 }),
  t('Unavailable', 'Which status lets a job check the rig out only if the job names it exactly?', '', { facts: ['F102'], level: 1 }),
  t('Unavailable', `${SAM} needs ROSIE for a PayCore card-matrix run. Which status keeps general jobs off ROSIE between runs?`, 'Unavailable: only jobs that pass ROSIE\'s exact name can check it out, so its PayCore merchant profile survives.', { facts: ['F102', 'F103'] }),
  t('Unavailable', 'A general pipeline (blank `ROBOT_NAME`) is refused this rig, but a job that passes its exact name gets it.', '', { facts: ['F102'], tags: ['jenkins.checkout'] }),

  /* ── Available ── */
  t('Available', 'Orca row below. Status?', 'Online, healthy, no reservation, no named-only flag: open to general checkouts.', { facts: ['F101'], render: { kind: 'orca', lines: ['seti · COMPACT · DEV1', 'last health 08:15 · 200 OK', 'reserved by — · named-only: no'] } }),
  t('Available', 'Ping: `HTTP/1.1 200 OK {"status":"ok","robot":"wall-e"}` on an ordinary rig nobody has claimed.', 'A 200 on an ordinary, unclaimed rig: healthy and open to any pipeline.', { facts: ['F101', 'F107'], render: { kind: 'terminal', lines: ['$ curl -i http://10.42.10.11:8000/health', 'HTTP/1.1 200 OK', '{"status":"ok","robot":"wall-e"}'] }, tags: ['orca.healthcheck'] }),
  t('Available', 'The previous pipeline released WALL-E after a passing build; nothing is wrong with the rig.', 'A general (un-named) checkout releases an ordinary rig back to Available.', { facts: ['F101'], render: { kind: 'jenkins', lines: ['[orca] released wall-e → Available', 'Finished: SUCCESS'] }, illustrative: true, tags: ['jenkins.checkout'] }),
  t('Available', 'Which status means online, healthy and open to general pipeline checkouts?', '', { facts: ['F101'], level: 1 }),
  t('Available', `WALL-E failed the 08:15 ping. ${J} power-cycled the hung Pi at 08:17 and the 08:20 ping returned 200.`, 'Recovery is observed at the next health check: once the ping returns 200 the rig is healthy and back in the general pool (the sim restores it at that ping).', {
    facts: ['F099', 'F101'],
    level: 3,
    illustrative: true,
    tags: ['orca.healthcheck'],
  }),
];

export const DR01: DrillDef<TriageData> = {
  id: 'DR01',
  name: 'Status Triage',
  format: 'Scenario card → press 1–5 (Available, Unavailable, Offline, Connection Failed, Reserved)',
  tags: ['orca.status', 'orca.status.unavailable', 'orca.status.offline', 'orca.status.connfailed', 'orca.status.reserved', 'orca.healthcheck'],
  unlockedBy: ['M06'],
  durationS: 60,
  itemCount: null,
  medals: { bronze: 800, silver: 1500, gold: 2200 },
  scoring: 'standard',
  items: STATUS_TRIAGE_ITEMS,
  component: lazyDrill(() => import('./View'), '#63d443'),
};
