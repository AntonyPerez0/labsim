/**
 * DR14 Who You Gonna Call (GP §2.4.3): a problem → the right person (Ref §3, §4, team roles in
 * src/content/team.ts) or "Handle it yourself". Hardware/Connection Failed → the hardware lead; Orca schema
 * and UI → the Orca developer; dynamic JSON / SDK frameworks → the SDK lead; uia-remote and the
 * multi-device runner → its author; your own config/syntax mistakes → you.
 */
import type { DrillDef, DrillItem } from '../../types';
import { lazyDrill } from '../common/lazy';
import { teach } from '../common/teach';
import { N } from '../common/people';

export const CALLEES = ['jared', 'tate', 'david', 'morgan', 'self'] as const;
export type Callee = (typeof CALLEES)[number];

export interface CallData {
  problem: string;
  answer: Callee;
  /** Evidence line (Notes, console…), optional. */
  evidence?: string;
}

export const CALLEE_LABEL: Record<Callee, string> = {
  jared: N.jared,
  tate: N.tate,
  david: N.david,
  morgan: N.morgan,
  self: 'Handle it yourself',
};

export const CALLEE_ROLE: Record<Callee, string> = {
  jared: 'hardware & lab lead',
  tate: 'Orca developer',
  david: 'SDK frameworks',
  morgan: 'uia-remote author',
  self: 'your fix, your keyboard',
};

let n = 0;
function c(answer: Callee, problem: string, why: string, o: { facts: string[]; tags: string[]; evidence?: string; ref?: string; doInstead?: string }): DrillItem<CallData> {
  n++;
  const who = CALLEE_LABEL[answer];
  return {
    id: `DR14-${String(n).padStart(2, '0')}`,
    tags: ['people.roles', ...o.tags],
    factIds: o.facts,
    teach: teach(answer === 'self' ? 'Handle it yourself' : `Call ${who}`, why, { ref: o.ref ?? 'Ref §3', factIds: o.facts, doInstead: o.doInstead ?? (answer === 'self' ? 'Fix it yourself — no escalation needed.' : `Take it to ${who} (${CALLEE_ROLE[answer]}).`) }),
    data: { problem, answer, evidence: o.evidence },
  };
}

export const WHO_ITEMS: readonly DrillItem<CallData>[] = [
  c('jared', 'The Pi answered 502: Callus upstream unreachable.', `Connection Failed is hardware intervention: the Minix box running Callus is down. Escalate to ${N.jared} with the endpoint from Notes.`, {
    facts: ['F110', 'F111'],
    tags: ['orca.status.connfailed', 'cards.callus'],
    evidence: '2026-10-05 08:15:00 GET http://10.42.10.13:8000/health → 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"}',
    doInstead: `Escalate to ${N.jared} with the endpoint http://10.42.10.13:8000/health.`,
  }),
  c('tate', 'You need the App Secret field explained — what is it for and where is it?', `${N.tate} extended Merchant Config with App ID, App Secret and API Key so pipelines can export them for the Go SDK.`, { facts: ['F138', 'F139'], tags: ['orca.merchant'], ref: 'Ref §3.2' }),
  c('david', 'An SDK test needs a dynamic JSON capability lookup.', `${N.david} oversees the SDK frameworks that define capabilities as JSON metadata inside each test definition, parsed at runtime.`, { facts: ['F132', 'F133'], tags: ['orca.capabilities'], ref: 'Ref §3.2' }),
  c('morgan', 'The tethered runner keeps hopping between device handles and you want to understand why.', `${N.morgan} built uia-remote: UI Automator talks to one device at a time, so the runner in test/ targets methods across device handles — MFD, then CFD, then back.`, {
    facts: ['F159', 'F170', 'F171'],
    tags: ['uia.multidevice'],
    ref: 'Ref §4.2',
  }),
  c('jared', 'A coordinate PR for the receipt screens needs merging.', `${N.jared} merged the coordinate PR that ended the 48-hour receipt QR regression — coordinate PRs go to ${N.jared}.`, { facts: ['F214'], tags: ['receipt.qr'], ref: 'Ref §5' }),
  c('self', 'Your pipeline was started with `DEVICE_TYPE=flex_3`.', 'Device Type is an enum, so Jenkins env vars must be ALL CAPS: fix it to FLEX_3 yourself and re-run.', { facts: ['F122'], tags: ['jenkins.envvars', 'orca.devicetype'], ref: 'Ref §3.2', doInstead: 'Re-run with DEVICE_TYPE=FLEX_3.' }),
  c('jared', "WALL-E is Connection Failed; the Pi's ACT LED is frozen and ssh times out.", `A crashed Pi board is a Connection Failed hardware cause — escalate to ${N.jared} for hardware intervention.`, {
    facts: ['F110', 'F111'],
    tags: ['orca.status.connfailed', 'hw.pi'],
    evidence: '2026-10-05 08:15:00 GET http://10.42.10.11:8000/health → connect timed out after 10000 ms',
  }),
  c('tate', 'You want a new filter on the Orca robot list (e.g. by environment).', `${N.tate} built the custom UI filtering for the Robot list.`, { facts: ['F116'], tags: ['orca.robot'], ref: 'Ref §3.2' }),
  c('self', 'Your local config.properties still says `portNumber=5555`.', 'portNumber is locked to 5444; 5555 is the ADB default that hijacked coworkers\' desk devices. Change it yourself.', { facts: ['F198', 'F200'], tags: ['uia.config', 'adb.port'], ref: 'Ref §4.5', doInstead: 'Set portNumber=5444.' }),
  c('jared', 'BUMBLEBEE still has a legacy 1.5 mm Offset — who calibrated the lab to a true (0,0)?', `${N.jared} calibrated the lab hardware to a true (0,0) origin, which made Offsets mostly deprecated.`, { facts: ['F130'], tags: ['orca.offsets'], ref: 'Ref §3.2' }),
  c('morgan', 'A new hire asks why uia-remote exists at all when Lester and Pigeon were already there.', `${N.morgan} created uia-remote because no prior framework could automate native tethered setups (Station-to-Mini, Mini-to-Mini, Station Duo).`, { facts: ['F159'], tags: ['uia.history'], ref: 'Ref §4.1' }),
  c('david', 'Which person oversees the frameworks whose capabilities live inside the test definition?', `That's ${N.david} — SDK frameworks with dynamic JSON capability lookups.`, { facts: ['F133'], tags: ['orca.capabilities'], ref: 'Ref §3.2' }),
  c('self', '`theme=classic` and `kernelType=SPA` in your config.properties.', 'theme is locked to avocado and kernelType to CPA (SPA is legacy). Your file, your fix.', { facts: ['F196', 'F197'], tags: ['uia.config'], ref: 'Ref §4.5', doInstead: 'Set theme=avocado and kernelType=CPA.' }),
  c('jared', 'Four Rack B rigs went Connection Failed at once and all four Pis are completely dark.', `Shared power path (likely the Rack B 5 V inline fuse) — hardware intervention: escalate to ${N.jared}.`, { facts: ['F087', 'F111'], tags: ['power.fuses', 'orca.status.connfailed'] }),
  c('self', 'You are about to run TaxTest locally on MEGATRON but forgot to reserve it.', 'Reserve it yourself in Orca: Reserved is set manually by the engineer running tests locally.', { facts: ['F112'], tags: ['orca.status.reserved'], doInstead: 'Set MEGATRON to Reserved, run, then release it.' }),
  c('self', 'Your Pigeon JSON fails with `LSTR ParseError: Unexpected string in JSON at line 23 column 7`.', 'No linter in Pigeon: hunt the missing comma at the end of the previous line (or paste a known-good block). That is on you, not an escalation.', {
    facts: ['F208', 'F209'],
    tags: ['pigeon.nolint'],
    ref: 'Ref §5',
  }),
  c('jared', 'MINIX-02 is dark and every rig it serves just failed its health check.', `A Minix box running Callus going offline is a Connection Failed cause — escalate to ${N.jared}.`, { facts: ['F110', 'F111'], tags: ['cards.callus', 'orca.status.connfailed'] }),
  c('morgan', 'You want the page-object rules: why every screen class needs waitForScreen() and isScreenPresent().', `${N.morgan}'s uia-remote rules: both methods are mandatory on every screen class (wait for rendering; confirm focus).`, { facts: ['F178', 'F179', 'F180'], tags: ['uia.sync'], ref: 'Ref §4.3' }),
  c('tate', 'Merchant Config shows only a few columns and you need to know where the other fields went.', `Table display limits: click Edit on the row. ${N.tate} works on Orca and the Merchant Config schema.`, { facts: ['F137'], tags: ['orca.merchant'], ref: 'Ref §3.2' }),
];

export const DR14: DrillDef<CallData> = {
  id: 'DR14',
  name: 'Who You Gonna Call',
  format: `Problem → ${N.jared} / ${N.tate} / ${N.david} / ${N.morgan} / “Handle it yourself”`,
  tags: ['people.roles', 'orca.status.connfailed'],
  unlockedBy: ['M01'],
  durationS: 45,
  itemCount: null,
  medals: { bronze: 600, silver: 1100, gold: 1600 },
  scoring: 'standard',
  items: WHO_ITEMS,
  component: lazyDrill(() => import('./View'), '#f5b301'),
};
