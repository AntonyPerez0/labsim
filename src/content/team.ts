/**
 * Team & NPCs — the ONLY place people's names appear (canon "People"). All names are fictional.
 *
 * Jaden, Nate and Devin stand in (renamed) for real people in the reference. Morgan (canon S04: "the presenter" who
 * created uia-relay), Riley, Sam and Alex (GP §0) are invented for the game. All in-game text uses names or
 * they/them — never gendered pronouns.
 */
import type { TeamMember } from './schema';

export const TEAM_MEMBERS: TeamMember[] = [
  {
    key: 'morgan',
    name: 'Morgan',
    role: 'Automation engineer · uia-relay author · your onboarding mentor',
    blurb:
      'Morgan created uia-relay because no earlier framework could automate native tethered setups, and now runs your onboarding. Ask Morgan about uia-relay, ADB, config.properties, Parrot and test design.',
    color: '#1f8a8a',
    npcId: 'npc.morgan',
    kind: 'mentor',
    fromReference: false,
    illustrative: true,
    askAbout: ['uia-relay structure and page objects', 'config.properties', 'ADB on port 5444', 'Parrot (LSTR)', 'Stand Duet OCR and UI Automator 2.3'],
    voice: { wave: 'sine', hz: 520 },
    anchor: 'npc.morgan.desk',
    outfit: 'Teal hoodie, dark jeans, sticker-covered laptop',
  },
  {
    key: 'jaden',
    name: 'Jaden',
    role: 'Hardware & lab lead',
    blurb:
      'Jaden builds the rigs, calibrated the whole lab to a true (0,0) origin, merges coordinate PRs and takes every Connection Failed hardware escalation. If it sparks, clicks or blinks, it is Jaden\'s.',
    color: '#3b4148',
    npcId: 'npc.jaden',
    kind: 'mentor',
    fromReference: true,
    askAbout: ['Connection Failed escalations (crashed Pi, Kallus box offline)', 'power distribution and fuses', 'rig mechanics and Park All', 'coordinate PRs'],
    voice: { wave: 'square', hz: 330, lowpassHz: 1500 },
    anchor: 'npc.jaden.bench',
    outfit: 'Charcoal work shirt, black apron, safety glasses pushed up',
  },
  {
    key: 'nate',
    name: 'Nate',
    role: 'Orka (Orchestrator) developer',
    blurb:
      'Nate works on Orka: Nate built the robot-list filtering UI and added App ID, App Secret and API Key to Merchant Config so pipelines can export them for the Go SDK.',
    color: '#23395d',
    npcId: 'npc.nate',
    kind: 'mentor',
    fromReference: true,
    askAbout: ['robot statuses and checkouts', 'Orka entities and fields', 'Merchant Config', 'Jenkins env vars'],
    voice: { wave: 'triangle', hz: 440 },
    anchor: 'npc.nate.visit',
    outfit: 'Navy polo, coffee cup',
  },
  {
    key: 'devin',
    name: 'Devin',
    role: 'SDK frameworks lead',
    blurb:
      'Devin oversees the SDK frameworks, including the Terminal SDK, and the dynamic JSON capability lookups they use to ask Orka for the right robot.',
    color: '#7a2430',
    npcId: 'npc.devin',
    kind: 'mentor',
    fromReference: true,
    askAbout: ['Robot Capabilities (dynamic JSON vs non-dynamic)', 'Go SDK pipelines', 'Lazo and Ubo merchant switching', 'AI evaluations'],
    voice: { wave: 'sine', hz: 392 },
    anchor: 'npc.devin.visit',
    outfit: 'Burgundy sweater, notebook',
  },
  {
    key: 'riley',
    name: 'Riley',
    role: 'IPX QA engineer (office coworker)',
    blurb:
      'Riley sits in the office next to the lab with a desk device on the default ADB port 5555 — the one your script will drive if you forget port 5444. Riley files a lot of tickets, some of them misleading.',
    color: '#c79a2b',
    npcId: 'npc.coworker',
    kind: 'coworker',
    fromReference: false,
    illustrative: true,
    voice: { wave: 'sine', hz: 600 },
    anchor: 'npc.coworker.desk-2',
    outfit: 'Mustard cardigan, headphones',
  },
  {
    key: 'sam',
    name: 'Sam',
    role: 'PayCrest Team engineer',
    blurb:
      'Sam runs PayCrest\'s back-to-back Visa/Discover/AmEx card matrices on ROSIE, which must stay Unavailable so general jobs never overwrite its merchant profile.',
    color: '#5b6b3a',
    npcId: 'npc.sam',
    kind: 'coworker',
    fromReference: false,
    illustrative: true,
    voice: { wave: 'triangle', hz: 480 },
    anchor: 'npc.coworker.desk-1',
    outfit: 'Olive jacket',
  },
  {
    key: 'alex',
    name: 'Alex',
    role: 'New hire',
    blurb:
      'Alex started a week after you, copies configs from old wiki pages and asks the questions you asked last week. Explaining things to Alex is a good test of what you know.',
    color: '#8fb7e6',
    npcId: 'npc.alex',
    kind: 'coworker',
    fromReference: false,
    illustrative: true,
    voice: { wave: 'square', hz: 700, lowpassHz: 2000 },
    anchor: 'npc.alex.build',
    outfit: 'Light-blue shirt, clipboard',
  },
  {
    key: 'jenkins-bot',
    name: 'Jenkins Bot',
    role: 'Automated ticket reporter',
    blurb: 'Files tickets automatically when a pipeline fails, a checkout is blocked or a robot goes Connection Failed.',
    color: '#d33833',
    kind: 'system',
    fromReference: false,
    illustrative: true,
  },
];

/** Lookup by key ("jaden"). */
export const TEAM: Record<string, TeamMember> = Object.fromEntries(TEAM_MEMBERS.map((m) => [m.key, m]));

/** The four mentors in Academy order of appearance. */
export const MENTOR_KEYS = ['morgan', 'jaden', 'nate', 'devin'] as const;
export type MentorKey = (typeof MENTOR_KEYS)[number];

export function teamMember(keyOrNpcId: string): TeamMember | undefined {
  if (TEAM[keyOrNpcId]) return TEAM[keyOrNpcId];
  const base = keyOrNpcId.split('.').slice(0, 2).join('.'); // "npc.coworker.desk-2" → "npc.coworker"
  return TEAM_MEMBERS.find((m) => m.npcId === keyOrNpcId || m.npcId === base);
}

/** Display name for a team key or npc id; falls back to the id. */
export function personName(keyOrNpcId: string): string {
  return teamMember(keyOrNpcId)?.name ?? keyOrNpcId;
}

/** The hardware escalation contact (Connection Failed, Ref §3). */
export const HARDWARE_LEAD = 'jaden';
