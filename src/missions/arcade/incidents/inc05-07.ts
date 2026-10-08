/**
 * GP §3.5 INC05–INC07: health-check timing, Reserved hiding a dead Pi, and the Offline rig under rebuild.
 */
import type { IncidentDef } from '../../types';
import { c, p } from '../../types';
import {
  F,
  OP,
  P,
  dc,
  gw,
  healthUrl,
  hrn,
  jaredFix,
  pi,
  piIp,
  powerCycleCounters,
  restoredStatus,
  rig,
  statusTo,
  sym,
  teach,
  v,
  wm,
} from './helpers';

export const INC05: IncidentDef = {
  id: 'INC05',
  name: 'Patience is a fix (health-check timing)',
  difficulty: 1,
  base: 150,
  parS: 90,
  severity: 'P2',
  rigs: { roles: ['touch'], default: 'wall-e', scope: 'rig', describe: 'any (default WALL-E)' },
  escalatable: false,
  unlockedBy: 'M06',
  tags: ['orca.healthcheck', 'orca.status.offline', 'orca.status.connfailed'],
  factIds: ['F099', 'F107', 'F106'],
  ticket: { title: (b) => `I fixed ${hrn(b)}'s Pi two minutes ago but Orca still says Connection Failed. Reboot it again?`, reporter: 'riley' },
  setup: () => ({
    run: (sim, ctx) => {
      // Director timing (Sim App. A): the rig fails a check, then Riley's fix (a power cycle) is already done.
      const host = String(ctx.binding?.vars.pi ?? 'pi-wall-e');
      const r = sim.faults.inject({ faultId: 'pi.hung', params: { host } });
      sim.orca.runHealthCheckNow();
      if (r.ok) sim.faults.clear(r.value.instanceId, 'riley');
    },
  }),
  reveal: 'none',
  symptoms: [
    sym('Terminal', (b) => `curl -i ${healthUrl(b)} → HTTP/1.1 200 OK {"status":"ok","robot":"${rig(b)}"}`),
    sym('Notes', 'The newest line is still the old failure — no newer health check has run.'),
    sym('HUD', 'Next health check in under a minute (the HUD shows the countdown).'),
    sym('Tablet', 'Green `Status: OK` once the Pi has finished booting.'),
  ],
  diagnosisPath: ['Verify the 200 yourself with curl.', 'Compare the Notes timestamp with the game clock.', 'Reply in LabChat — and don\'t touch the rig.'],
  hints: [
    'Is the Pi actually broken right now? Check it yourself before anyone reboots anything.',
    (b) => `Terminal: curl -i ${healthUrl(b)}. Then compare the newest Notes timestamp with the clock.`,
    'Reply "It\'s healthy now — Orca re-checks every 5 minutes" and wait for the next ping.',
  ],
  fix: { handsOn: P('LabChat reply R_WAIT_PING, then wait for the next health check.') },
  replies: {
    wrongPenalty: 50,
    options: [
      { id: 'R_WAIT_PING', text: "It's healthy now — Orca re-checks every 5 minutes; it'll flip at the next ping.", correct: true },
      { id: 'R_REBOOT', text: 'Yes, reboot it again.', correct: false, teach: teach('Another reboot would miss the next ping.', 'Recovery is observed at the next 5-minute health check. (Ref §3)', 'Verify with curl and wait.') },
      { id: 'R_ESCALATE', text: P("I'll ask {{jared}} to look at it."), correct: false, teach: teach('Nothing is broken any more.', 'Orca only re-checks on its 5-minute schedule. (Ref §3)', 'Reply that it will flip at the next ping.') },
      { id: 'R_SET_AVAILABLE', text: "I'll set it Available by hand.", correct: false, teach: teach('Let Orca confirm it.', 'Recovery is observed at the next 5-minute health check; once the Pi answers 200 the sim restores the status on its own. (Ref §3; restore rule [illus.])', 'Wait for the next health check.') },
    ],
  },
  counters: powerCycleCounters,
  success: (b) => c.all(c.eq(p.ticket.reply, 'R_WAIT_PING'), c.eq(p.counter('powerCycles'), 0), c.nextHealthCheck(c.status(rig(b), restoredStatus(rig(b))))),
  diagnosisCall: dc(
    "Pi is healthy; Orca hasn't re-pinged yet",
    ['Pi still broken', 'curl the health endpoint yourself — what does it return now?'],
    ["Orca's health thread crashed", 'Other rigs keep getting checked on schedule. Look at when the last check ran.'],
    ['Needs {{jared}}', 'Escalations are for hardware faults that persist. Is anything still failing?'],
  ),
  wrongButTempting: [
    gw('reboot-again', 'GW17', 'Reboot the Pi again (misses the upcoming ping)'),
    gw('escalate', 'GW12', 'Escalate to {{jared}}'),
    wm('set-available', 'Set the rig Available by hand ("let Orca confirm it")', 50, { event: 'robot.statusChanged', where: { to: 'AVAILABLE' }, test: (pl) => (pl.actor === 'player' || pl.actor === undefined) && pl.from === 'CONNECTION_FAILED' }),
  ],
  teaches: 'Ref §3: a 5-minute synchronized background ping; recovery is observed at the next ping.',
  variants: [
    {
      id: 'B',
      label: 'Offline bypass (BAYMAX)',
      overrides: {
        rigs: { candidates: ['baymax'], default: 'baymax', scope: 'rig', describe: 'BAYMAX (being rebuilt)' },
        ticket: { title: P("BAYMAX's Pi is unplugged but Orca shows no error — is health checking broken?"), reporter: 'riley' },
        setup: () => ({ scenario: [OP('orca.setStatus', { robot: 'baymax', status: 'OFFLINE', by: 'jared' }), F('pi.off', { host: 'pi-baymax' })] }),
        reveal: 'immediate',
        symptoms: [sym('Orca', 'BAYMAX shows `Offline`; no new Notes.'), sym('Orca', 'Health log: `baymax  SKIPPED (Offline)`'), sym('World', 'BAYMAX\'s Pi lead is unplugged; the door is open.')],
        hints: [
          "Look at BAYMAX's status in Orca before you look at the Pi.",
          'Orca → health log: what does it say for baymax?',
          'Reply that BAYMAX is Offline while it is rebuilt and Orca skips health checks for Offline rigs.',
        ],
        fix: { handsOn: 'LabChat reply R_OFFLINE; leave BAYMAX Offline.' },
        replies: {
          wrongPenalty: 50,
          options: [
            { id: 'R_OFFLINE', text: P('BAYMAX is Offline while {{jared}} rebuilds it; Orca skips health checks for Offline rigs. Working as designed.'), correct: true },
            { id: 'R_BROKEN', text: 'Yes, the health check is broken — I\'ll restart Orca.', correct: false, teach: teach('Health checking is fine.', 'Orca bypasses the 5-minute health check for Offline units. (Ref §3)', 'Check the status and the health log.') },
            { id: 'R_PLUG_IN', text: "I'll plug BAYMAX's Pi back in.", correct: false, teach: teach('The rig is mid-rebuild.', 'Offline is the placeholder while a rig is being built. (Ref §3)', 'Leave it Offline; reply that it is working as designed.') },
          ],
        },
        success: () => c.all(c.eq(p.ticket.reply, 'R_OFFLINE'), c.status('baymax', 'OFFLINE')),
        diagnosisCall: dc(
          'BAYMAX is Offline, so Orca skips its health checks',
          ['Health checking is broken', 'Other rigs are checked on schedule. What does the health log say for baymax?'],
          ["BAYMAX's Pi is fine", 'The Pi lead is visibly unplugged. Why does Orca not care?'],
          ['Orca is down', 'Orca answers and shows BAYMAX\'s status. Read it.'],
        ),
        counters: () => ({}),
      },
    },
  ],
};

export const INC06: IncidentDef = {
  id: 'INC06',
  name: 'Reserved hides a dead Pi',
  difficulty: 3,
  base: 350,
  parS: 210,
  severity: 'P2',
  rigs: { candidates: ['eve', 'wall-e', 'bumblebee', 'r2-d2', 'johnny-5', 'baymax', 'seti'], default: 'eve', scope: 'rig', describe: 'any touch rig (default EVE)' },
  escalatable: true,
  unlockedBy: 'M06',
  tags: ['orca.status.reserved', 'orca.healthcheck', 'hw.pi'],
  factIds: ['F112', 'F113', 'F099'],
  processBonuses: ['PB06'],
  ticket: { title: (b) => `My local run on ${hrn(b)} keeps failing, but Orca says ${hrn(b)} is fine`, reporter: 'riley' },
  setup: () => ({ scenario: [OP('orca.setStatus', { robot: '$R', status: 'RESERVED', by: 'riley' }), F('pi.hung', { host: '$PI' })] }),
  reveal: 'immediate',
  symptoms: [
    sym('LabChat', (b) => P(`{{riley}} pastes: java.net.ConnectException: Failed to connect to /${piIp(b)}:8000`)),
    sym('Orca', 'Status `Reserved`, no new Notes lines.'),
    sym('Orca', (b) => `Health log: \`${rig(b)}  RESERVED — not overridden\``),
    sym('LED', 'Pi PWR on, ACT solid on (hung).'),
    sym('Tablet', 'Grey `Status: CONTROLLER UNREACHABLE`.'),
    sym('Terminal', (b) => `curl -i ${healthUrl(b)} → connect timed out`),
  ],
  diagnosisPath: [
    'Reserved blocks health-check overrides, so Orca\'s status says nothing about health.',
    'Test the Pi yourself (curl the health endpoint).',
    'Inspect the shelf.',
    'Call it, then escalate with the endpoint from your curl — or fix it and tell {{riley}}.',
  ].map(P),
  hints: [
    'Orca has not health-checked this rig. Why not?',
    (b) => `Terminal: curl -i ${healthUrl(b)}; then look at ${hrn(b)}'s Pi LEDs.`,
    (b) => P(`Power-cycle ${hrn(b)}'s Pi (or escalate to {{jared}} with ${healthUrl(b)}); leave the reservation alone and reply R_FIXED to {{riley}}.`),
  ],
  fix: {
    byTheBook: (b) => P(`Escalate with endpoint ${healthUrl(b)} (from your curl) and cause A; reply R_FIXED to {{riley}} once {{jared}} is done.`),
    handsOn: P('Power-cycle / re-plug the Pi; verify curl 200; reply R_FIXED. Leave the reservation alone.'),
  },
  escalation: { endpoints: (b) => [healthUrl(b)], jaredFix: (b) => jaredFix(`rig.${rig(b)}.pi`, 'Reserved rigs never get pinged, so nobody noticed. Power-cycling the Pi.') },
  replies: {
    wrongPenalty: 100,
    to: 'riley',
    options: [
      { id: 'R_FIXED', text: 'Your rig\'s Pi was down — Reserved hides that from health checks. Fixed; please re-run.', correct: true },
      { id: 'R_ORCA_FINE', text: "Orca says it's fine — must be your config.", correct: false, teach: teach('Orca had no information.', 'Reserved blocks health-check overrides, so Orca never pinged the Pi. (Ref §3)', 'Test the Pi yourself.') },
    ],
  },
  success: (b) =>
    c.all(c.eq(p.pi(pi(b)).os, 'RUNNING'), c.status(rig(b), 'RESERVED'), c.eq(p.robot(rig(b)).reservedBy, 'riley'), c.eq(p.ticket.reply, 'R_FIXED')),
  diagnosisCall: dc(
    (b) => `${hrn(b)}'s Pi is down; Reserved hides it from health checks`,
    [P("{{riley}}'s config.properties is wrong"), 'The exception is a connect failure to the Pi on :8000. Test that endpoint yourself.'],
    ['Orca is down', 'Orca answers and shows the rig. Ask why it has not pinged it.'],
    ['Port 5555 collision', 'The failing connection is to port 8000 on the Pi, not ADB. Re-read the exception.'],
  ),
  wrongButTempting: [
    gw('unreserve', 'GW20', 'Change the status to Available "so the health check runs"'),
    gw('unreserve-ask', 'GW20', 'Release the reservation without asking'),
  ],
  teaches: 'Ref §3 Reserved — blocks Jenkins pipelines and health-check overrides.',
  variants: [
    {
      id: 'B',
      label: 'Pi lead unplugged',
      overrides: {
        setup: () => ({ scenario: [OP('orca.setStatus', { robot: '$R', status: 'RESERVED', by: 'riley' }), F('pi.off', { host: '$PI' })] }),
        symptoms: [
          sym('LabChat', (b) => P(`{{riley}} pastes: java.net.ConnectException: Failed to connect to /${piIp(b)}:8000`)),
          sym('Orca', (b) => `Health log: \`${rig(b)}  RESERVED — not overridden\``),
          sym('LED', 'The Pi is completely dark; its power lead lies beside the socket.'),
        ],
      },
    },
  ],
};

export const INC07: IncidentDef = {
  id: 'INC07',
  name: 'Offline rig being rebuilt',
  difficulty: 2,
  base: 250,
  parS: 120,
  severity: 'P2',
  rigs: { roles: ['rebuild'], default: 'baymax', scope: 'rig', describe: '`rebuild` (BAYMAX)' },
  escalatable: false,
  unlockedBy: 'M06',
  tags: ['orca.status.offline', 'orca.healthcheck', 'jenkins.checkout', 'orca.status'],
  factIds: ['F105', 'F106', 'F102', 'F112'],
  ticket: {
    title: (b) => `${hrn(b)} flapping to Connection Failed; pigeon-android-sale-swipe grabbed it`,
    reporter: 'jenkins-bot',
    misleading: { title: (b) => `${hrn(b)} is broken, please fix its Pi`, reporter: 'riley' },
  },
  setup: () => ({
    scenario: [
      OP('orca.setStatus', { robot: '$R', status: 'OFFLINE', by: 'jared', atMs: -1_800_000 }),
      F('rig.rebuild', { rig: '$R' }),
      F('orca.statusOverride', { robot: '$R', status: 'AVAILABLE', by: 'alex' }),
    ],
  }),
  reveal: 'healthCheck',
  symptoms: [
    sym('Orca', (b) => `${hrn(b)} Connection Failed.`),
    sym('Notes', (b) => P(`STATUS Offline → Available ({{alex}}), then GET ${healthUrl(b)} → connect timed out after 10000 ms`)),
    sym('Jenkins', (b) => `PL3 red on ${rig(b)}: adb: failed to connect to '${v(b, 'deviceIp')}:5444': Connection refused`),
    sym('World', P('Sticky note on the rig: "REBUILD IN PROGRESS — J"; door open, Pi unplugged, parts on the shelf.')),
  ],
  diagnosisPath: ['The Notes history shows a manual change from Offline.', 'Walk over: the rebuild is unfinished.', 'Call it and set the rig back to Offline.'],
  hints: [
    'Read the rig\'s Notes history, not just the newest line.',
    (b) => P(`Orca → ${hrn(b)} → Notes: who changed it from Offline? Then look at the rig itself.`),
    (b) => `Orca → ${hrn(b)} → Status = Offline → Save. The next health log line will read "${rig(b)}  SKIPPED (Offline)".`,
  ],
  fix: { handsOn: (b) => `Orca → ${hrn(b)} → Offline.` },
  success: (b) => c.all(c.status(rig(b), 'OFFLINE'), c.label(c.nextHealthCheck(c.status(rig(b), 'OFFLINE')), 'Waiting for the health log to show SKIPPED (Offline)')),
  diagnosisCall: dc(
    'A rig under construction was set Available; it must be Offline',
    ["The rig's Pi crashed", P('The Pi is unplugged on purpose. Read the Notes history and the sticky note.')],
    ['Rack B fuse blown', 'The other Rack B rigs are fine. What is different about this one?'],
    ['Pipeline misconfigured', 'The pipeline took a rig Orca offered as Available. Why was it Available?'],
  ),
  wrongButTempting: [
    wm('finish-wiring', 'Finish wiring the Pi', 20, { event: 'power.plugged', where: { loadId: 'pi-baymax' } }, teach('The Pi boots, but the gantry is incomplete.', 'Offline is the placeholder while engineers physically build a rig. (Ref §3)', 'Set the rig Offline and leave the rebuild to its owner.')),
    wm('unavailable', 'Set it Unavailable', 100, statusTo('baymax', 'UNAVAILABLE'), teach('Unavailable is the wrong placeholder.', 'Unavailable is for specialised rigs that named jobs use; health checks still run. (Ref §3)', 'Use Offline for a rig being built.')),
    wm('reserved', 'Set it Reserved', 100, statusTo('baymax', 'RESERVED'), teach('Reserved is for your local runs.', 'Reserved means an engineer is running tests locally from their workstation. (Ref §3)', 'Use Offline for a rig being built.')),
  ],
  teaches: 'Ref §3 Offline — a manual placeholder while engineers physically build a rig or assemble data profiles; health checks are bypassed.',
};
