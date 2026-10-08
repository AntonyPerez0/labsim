/**
 * GP §3.5 INC01–INC04: Connection Failed causes (crashed Pi, Callus box, blown 5 V fuse, Ethernet).
 */
import type { IncidentDef } from '../../types';
import { c, p } from '../../types';
import {
  F,
  P,
  allRigs,
  box,
  cameraUrl,
  dc,
  deviceType,
  gw,
  healthUrl,
  healthUrls,
  hrn,
  hrnList,
  jaredFix,
  orcaSave,
  ownCamera,
  pi,
  piIp,
  powerCycleCounters,
  rackFuse,
  rackLabel,
  recoveredAtNextCheck,
  restoredStatus,
  rig,
  sym,
  teach,
  v,
  wm,
  TOUCH_RIGS,
} from './helpers';


export const INC01: IncidentDef = {
  id: 'INC01',
  name: 'Connection Failed: crashed Pi',
  difficulty: 1,
  base: 250,
  parS: 180,
  severity: 'P1',
  rigs: { roles: ['touch'], default: 'wall-e', scope: 'rig', describe: 'any rig (default WALL-E)' },
  escalatable: true,
  unlockedBy: 'M06',
  tags: ['orca.status.connfailed', 'orca.healthcheck', 'orca.notes', 'hw.pi', 'orca.robot', 'people.roles'],
  factIds: ['F099', 'F107', 'F108', 'F109', 'F110', 'F111', 'F064', 'F116'],
  processBonuses: ['PB02'],
  ticket: {
    title: (b) => `${hrn(b)} failed checkout — Connection Failed`,
    reporter: 'jenkins-bot',
    misleading: { title: (b) => `${hrn(b)}'s tablet froze, can someone restart the tablet?`, reporter: 'riley' },
  },
  setup: () => ({ scenario: [F('pi.hung', { host: '$PI' })] }),
  reveal: 'healthCheck',
  symptoms: [
    sym('Orca', 'Red `Connection Failed` chip; a checkout attempt toasts "Robot is blocked from checkouts (Connection Failed)".'),
    sym('Notes', (b) => `GET ${healthUrl(b)} → connect timed out after 10000 ms`),
    sym('Jenkins', (b) => `[orca] no Available ${deviceType(b)} robot — build waiting in queue`),
    sym('Tablet', 'Grey banner `Status: CONTROLLER UNREACHABLE`.'),
    sym('LED', 'Pi PWR red solid, ACT solid on (no flicker), Ethernet LEDs lit.'),
    sym('Camera', (b) => (ownCamera(b) ? `Stream unavailable — ${cameraUrl(b)}` : 'The shared rack camera still streams (it runs on another Pi).')),
    sym('Terminal', (b) => `ping -c 3 ${piIp(b)} → 3 packets transmitted, 0 received, 100% packet loss`),
    sym('Terminal', (b) => `ssh pi@${piIp(b)} → ssh: connect to host ${piIp(b)} port 22: Connection timed out`),
  ],
  diagnosisPath: [
    "Orca robot list → filter Status = Connection Failed ({{tate}}'s filter UI) → the rig → Notes: the endpoint attempted and the error text.",
    'Terminal: ping / ssh the Pi — no answer.',
    'At the shelf, hold RMB on the Pi: PWR on but ACT frozen ⇒ powered but hung.',
    'Call it, then escalate to {{jared}} with the endpoint — or power-cycle the Pi yourself.',
  ].map(P),
  hints: [
    'Orca recorded what its health check tried and what came back. Start there.',
    (b) => `Orca → Robots → filter Connection Failed → ${hrn(b)} → Notes. Then look at the Pi's LEDs on the shelf (hold RMB).`,
    (b) =>
      P(`Escalate to {{jared}}: endpoint ${healthUrl(b)}, cause "Pi board hung". Or unplug ${hrn(b)}'s Pi lead (E), wait 5 s, plug it back, and wait for the next health check.`),
  ],
  fix: {
    byTheBook: (b) => P(`Escalate to {{jared}} with endpoint ${healthUrl(b)} and cause A; {{jared}} power-cycles the Pi.`),
    handsOn: (b) => `Unplug ${hrn(b)}'s Pi lead, wait ≥ 5 s, re-plug it (or MAIN off/on with no active test). The Pi boots in 40 s (ACT flickers, tablet turns green); recovery shows at the next health check.`,
  },
  escalation: {
    endpoints: (b) => [healthUrl(b)],
    jaredFix: (b) => jaredFix(`rig.${rig(b)}.pi`, `PWR on, ACT frozen. Hung board. Power-cycling ${hrn(b)}'s Pi.`, 'It boots in about 40 seconds; Orca will see it at the next check.'),
    endpointHint: 'Pick the exact URL from the Notes line — the Robot Controller health endpoint on port 8000.',
  },
  counters: powerCycleCounters,
  success: (b) => c.all(c.eq(p.pi(pi(b)).os, 'RUNNING'), recoveredAtNextCheck([rig(b)])),
  diagnosisCall: dc(
    'Pi board hung — needs a power cycle',
    ['Ethernet cable unplugged', 'An unplugged cable leaves the Pi itself running and its tablet green. Check the tablet and the ACT LED.'],
    ['Rack 5 V fuse blown', 'A blown rack fuse darkens every Pi on that rack, PWR LED included. Is only one rig down?'],
    ['Callus box offline', 'A Callus outage makes the Pi answer 502 and names the upstream. Read the Notes error text.'],
  ),
  wrongButTempting: [
    gw('manual-available', 'GW24', 'Set the rig Available by hand'),
    wm('tablet-reboot', 'Reboot the status tablet', 0, undefined, teach('The tablet was only the messenger.', 'The tablet shows CONTROLLER UNREACHABLE because the Pi behind it is hung. (Ref §3)', 'Look at the Pi: PWR on, ACT frozen ⇒ power-cycle it.')),
    gw('cycle-again', 'GW17', 'Power-cycle the Pi again while it boots'),
    gw('restart-orca', 'GW13', 'Restart the Orca VM'),
  ],
  teaches: P('Ref §3 Connection Failed: the 5-minute ping got no response ⇒ the rig is blocked; Notes log the endpoint and error; a crashed Pi is a typical cause; escalated to {{jared}}. Ref §1: the Pi is the Robot Controller.'),
  variants: [
    {
      id: 'B',
      label: 'Robot Controller service crashed',
      overrides: {
        setup: () => ({ scenario: [F('pi.serviceDown', { host: '$PI', service: 'robot-controller' })] }),
        symptoms: [
          sym('Notes', (b) => `GET ${healthUrl(b)} → Connection refused`),
          sym('LED', 'Pi PWR red solid, ACT flickering normally.'),
          sym('Tablet', 'Grey banner `Status: CONTROLLER UNREACHABLE`.'),
          sym('Terminal', (b) => `ssh pi@${piIp(b)} works; systemctl status robot-controller → Active: failed (Result: exit-code)`),
        ],
        hints: [
          'The Pi answered this time — but something on it refused the connection.',
          (b) => `ssh pi@${piIp(b)} → systemctl status robot-controller.`,
          (b) => P(`sudo systemctl restart robot-controller on ${piIp(b)} — or escalate to {{jared}} with ${healthUrl(b)} and cause "Pi board hung / controller down".`),
        ],
        fix: { byTheBook: (b) => P(`Escalate to {{jared}} with ${healthUrl(b)}.`), handsOn: (b) => `ssh pi@${piIp(b)} → sudo systemctl restart robot-controller → curl -i ${healthUrl(b)} → 200 OK; wait for the next health check.` },
        success: (b) => c.all(c.eq(p.pi(pi(b)).svc('robot-controller'), 'UP'), recoveredAtNextCheck([rig(b)])),
        diagnosisCall: dc(
          'Robot Controller service on the Pi crashed',
          ['Pi board hung', 'A hung Pi does not answer ssh and its ACT LED freezes. This one answers.'],
          ['Ethernet cable unplugged', '"Connection refused" means the host answered on the network. Check the Notes error text.'],
          ['Callus box offline', 'A Callus outage shows a 502 naming the callus upstream. Read the Notes error text.'],
        ),
      },
    },
    {
      id: 'C',
      label: 'Shared ADB-shelf Pi hung (DATA + TARS)',
      overrides: {
        rigs: { candidates: ['data', 'tars'], default: 'data', scope: 'shared-pi', describe: 'ADB shelf (one Pi serves DATA and TARS)' },
        ticket: { title: 'DATA and TARS Connection Failed at the same time', reporter: 'jenkins-bot', misleading: { title: 'Both ADB bots died?', reporter: 'alex' } },
        symptoms: [
          sym('Notes', 'DATA and TARS: GET http://10.42.10.30:8000/health → connect timed out after 10000 ms, same timestamp.'),
          sym('LED', 'ADB-shelf Pi: PWR red solid, ACT solid on.'),
          sym('Terminal', 'ping -c 3 10.42.10.30 → 3 packets transmitted, 0 received, 100% packet loss'),
        ],
        escalation: {
          endpoints: () => ['http://10.42.10.30:8000/health'],
          jaredFix: () => jaredFix('rig.data.pi', 'One Pi, two bots. Power-cycling the ADB-shelf Pi.'),
        },
        success: (b) => c.all(c.eq(p.pi(pi(b)).os, 'RUNNING'), recoveredAtNextCheck(['data', 'tars'])),
      },
    },
  ],
};

export const INC02: IncidentDef = {
  id: 'INC02',
  name: 'Connection Failed: Callus box offline',
  difficulty: 2,
  base: 300,
  parS: 210,
  severity: 'P1',
  rigs: { candidates: [...TOUCH_RIGS.slice(0, 4)], default: 'wall-e', scope: 'callus-box', describe: 'rigs served by one Callus box (default MINIX-01 → WALL-E, EVE, BUMBLEBEE, R2-D2)' },
  escalatable: true,
  unlockedBy: 'M06',
  tags: ['orca.status.connfailed', 'cards.callus', 'hw.nuc', 'orca.notes'],
  factIds: ['F049', 'F050', 'F107', 'F109', 'F110', 'F111'],
  ticket: {
    title: (b) => `${allRigs(b).length} rigs Connection Failed at the same time (${hrnList(allRigs(b))})`,
    reporter: 'jenkins-bot',
    misleading: { title: (b) => `${rackLabel(b)} lost power?`, reporter: 'alex' },
  },
  setup: () => ({ scenario: [F('callus.down', { host: '$BOX', mode: 'box-off' })] }),
  reveal: 'healthCheck',
  symptoms: [
    sym('Orca', (b) => `${hrnList(allRigs(b))} all Connection Failed with the same timestamp.`),
    sym('Notes', (b) => `GET ${healthUrl(b)} → 502 Bad Gateway {"error":"callus upstream ${v(b, 'boxIp')}:9000 unreachable"}`),
    sym('LED', (b) => `All the Pis are healthy (PWR on, ACT flickering); ${box(b).toUpperCase()}'s blue power LED is off and its screen is dark.`),
    sym('Tablet', 'Green `Status: OK` (the Pis are fine).'),
    sym('Camera', 'Streams are fine.'),
    sym('Terminal', (b) => `curl -i ${healthUrl(b)} → HTTP/1.1 502 Bad Gateway {"error":"callus upstream ${v(b, 'boxIp')}:9000 unreachable"}`),
    sym('Terminal', (b) => `ping ${v(b, 'boxIp')} → 100% packet loss`),
  ],
  diagnosisPath: [
    'Several rigs failed at the same timestamp ⇒ look for a shared dependency.',
    'Notes: the Pi answered (502) and names the Callus upstream.',
    'Ping the box.',
    'Walk to the Callus shelf (loc.callus-shelf): the Minix box is dark.',
    'Escalate to {{jared}}, or power the box back on.',
  ].map(P),
  hints: [
    'Several rigs, one timestamp. What do they share?',
    (b) => `Read the Notes error: the Pi answered with a 502 and named ${v(b, 'boxIp')}:9000. Ping it, then look at the Callus shelf.`,
    (b) => P(`Escalate to {{jared}} with ${healthUrl(b)} and cause "Minix box running Callus is down" — or press ${box(b).toUpperCase()}'s power button and wait for the next health check.`),
  ],
  fix: {
    byTheBook: (b) => P(`Escalate to {{jared}}: any of the health URLs, cause A ("the Pi answers 502 because the Minix box running Callus at ${v(b, 'boxIp')} is unreachable").`),
    handsOn: (b) => `Press ${box(b).toUpperCase()}'s power button; Windows boots in about 50 s and the screen shows "Callus service · listening on :9000 · probes: …"; recovery shows at the next health check.`,
  },
  escalation: {
    endpoints: healthUrls,
    jaredFix: (b) => jaredFix(`host.${box(b)}`, `${box(b).toUpperCase()} is off — Windows update again. Powering it on.`, 'Callus comes up with the box; the next ping clears the rigs.'),
    endpointHint: 'Use one of the failing rigs\' health URLs exactly as the Notes line shows it.',
  },
  success: (b) => c.all(c.eq(p.box(box(b)).svc('callus'), 'UP'), recoveredAtNextCheck(allRigs(b))),
  diagnosisCall: dc(
    'The Minix box running Callus is down',
    ['Rack 5 V fuse blown', 'A blown fuse darkens the Pis. These Pis are lit and answered with a 502.'],
    ['All four Pis crashed', 'Crashed Pis do not answer at all. These answered 502 and named an upstream.'],
    ['Collis probes unpowered', 'Probe power affects card actions, not the health ping. Read which upstream the 502 names.'],
  ),
  wrongButTempting: [
    gw('cycle-pis', 'GW17', 'Power-cycle the healthy Pis'),
    wm('edit-card-paths', 'Edit card profile paths', 100, orcaSave('cardProfile'), teach('You edited card profiles.', 'The health check failed on the Callus upstream, not on a card file. (Ref §3)', 'Find the Callus box; escalate or power it on.')),
    wm('meter-rail', 'Multimeter the 5 V rail', 0, undefined, teach('The 5 V rail reads 5.1 V — fine.', 'The Pis are powered; the 502 names the Callus box.', 'Ping the box and look at the Callus shelf.')),
  ],
  teaches: P('Ref §3: Connection Failed causes include "a Minix box running Callus services going offline". Ref §1: Callus runs on Windows/Minix boxes and drives the Collis probes.'),
  variants: [
    {
      id: 'B',
      label: 'MINIX-02 down (Rack B + tethered rack)',
      overrides: {
        rigs: { candidates: ['johnny-5', 'baymax', 'seti'], default: 'johnny-5', scope: 'callus-box', describe: 'MINIX-02 → JOHNNY-5, BAYMAX, SETI, ROSIE, MEGATRON, OPTIMUS' },
      },
    },
    {
      id: 'C',
      label: 'Box on, Callus service stopped',
      overrides: {
        setup: () => ({ scenario: [F('callus.down', { host: '$BOX', mode: 'service-stopped' })] }),
        symptoms: [
          sym('Notes', (b) => `GET ${healthUrl(b)} → 502 Bad Gateway {"error":"callus upstream ${v(b, 'boxIp')}:9000 error: Connection refused"}`),
          sym('Terminal', (b) => `ping ${v(b, 'boxIp')} works; curl http://${v(b, 'boxIp')}:9000/status → curl: (7) Failed to connect to ${v(b, 'boxIp')} port 9000: Connection refused`),
          sym('Terminal', (b) => `ssh automation@${v(b, 'boxIp')} → sc query Callus → STATE : 1  STOPPED`),
          sym('World', 'The box is on; its screen reads "Callus service · STOPPED".'),
        ],
        hints: [
          'The box answers ping. Is the service on it running?',
          (b) => `ssh automation@${v(b, 'boxIp')} → sc query Callus.`,
          (b) => `sc start Callus on ${box(b).toUpperCase()}, then wait for the next health check.`,
        ],
        fix: { byTheBook: (b) => P(`Escalate to {{jared}} with ${healthUrl(b)} and cause A.`), handsOn: (b) => `ssh automation@${v(b, 'boxIp')} → sc query Callus → sc start Callus; next health check.` },
      },
    },
  ],
};

export const INC03: IncidentDef = {
  id: 'INC03',
  name: 'Connection Failed: Rack B 5 V fuse blown',
  difficulty: 3,
  base: 400,
  parS: 270,
  severity: 'P1',
  rigs: { candidates: ['johnny-5'], default: 'johnny-5', scope: 'rack', describe: 'one rack (default Rack B: JOHNNY-5, BAYMAX, SETI, ROSIE)' },
  escalatable: true,
  unlockedBy: 'M03',
  tags: ['power.fuses', 'power.rails', 'hw.pi', 'orca.status.connfailed'],
  factIds: ['F086', 'F087', 'F227', 'F074', 'F104'],
  processBonuses: ['PB07'],
  ticket: {
    title: (b) => `${rackLabel(b)}: ${allRigs(b).length} rigs Connection Failed`,
    reporter: 'jenkins-bot',
    misleading: { title: (b) => `${hrn(b)}'s Pi is dead, swap in a new $50 Pi?`, reporter: 'alex' },
  },
  setup: (b) => ({ scenario: [F('fuse.blown', { fuse: rackFuse(b) })] }),
  reveal: 'healthCheck',
  symptoms: [
    sym('Notes', (b) => `${hrnList(allRigs(b))}: GET http://10.42.10.x:8000/health → connect timed out after 10000 ms, same timestamp (${healthUrl(b)} for ${hrn(b)}).`),
    sym('LED', (b) => `All ${rackLabel(b)} Pis completely dark (no PWR).`),
    sym('Tablet', (b) => `${hrnList(allRigs(b))} grey: Status: CONTROLLER UNREACHABLE.`),
    sym('Camera', (b) => (rackFuse(b) === 'F-RACKB-5V' ? 'Rack B shared stream: Stream unavailable — http://10.42.10.40:8081/stream.mjpg' : `Stream unavailable — ${cameraUrl(b)}`)),
    sym('World', (b) => `The ${rackFuse(b)} fuse window shows a broken element (flashlight F + inspect).`),
    sym('World', (b) => {
      const reg = rackFuse(b) === 'F-RACKA-5V' ? 'REG-5V-A' : 'REG-5V-B';
      return `Multimeter: MW-1 out 24.1 V DC · ${reg} out 5.08 V DC · load side of ${rackFuse(b)} 0.00 V DC · fuse removed (power off) Ω OL.`;
    }),
  ],
  diagnosisPath: [
    'Several rigs on one rack, every Pi dark ⇒ shared power path.',
    'Multimeter down the chain: 24 V present → 5 V present → 0 V after the fuse ⇒ the fuse.',
    'Regulator input off, pull the fuse, Ω reads OL — confirmed.',
    'Call it, then escalate or replace the fuse.',
  ],
  hints: [
    'Every Pi on one rack went dark at once. Follow the power.',
    (b) => `Power wall: measure MW-1, then the ${rackLabel(b)} 5 V regulator output, then the load side of ${rackFuse(b)}.`,
    (b) => `Switch the ${rackLabel(b)} regulator input off, remove ${rackFuse(b)}, fit a 10 A (red) blade fuse to match the "10A" label, switch the input on, wait for the next health check.`,
  ],
  fix: {
    byTheBook: (b) => P(`Escalate to {{jared}}: any of the ${rackLabel(b)} health URLs, cause A.`),
    handsOn: (b) => `Regulator input off (PB07) → remove the blown ${rackFuse(b)} → insert a 10 A (red) blade fuse (matches the "10A" label) → input on → the Pis boot (40 s) → next health check.`,
  },
  escalation: {
    endpoints: healthUrls,
    jaredFix: (b) => jaredFix(`power.fuse.${rackFuse(b)}`, `24 V good, 5 V good, nothing after ${rackFuse(b)}. Blown fuse.`, 'Input off, 10 A in, input on. Pis are booting.'),
  },
  success: (b) =>
    c.all(c.eq(p.fuse(rackFuse(b)).state, 'OK'), c.eq(p.fuse(rackFuse(b)).rating, 10), recoveredAtNextCheck(allRigs(b))),
  diagnosisCall: dc(
    (b) => `${rackLabel(b)} 5 V inline fuse blown`,
    ['Four Pis crashed', 'A crashed Pi still shows its red PWR LED. These are completely dark — follow the power.'],
    ['Mean Well failed', 'If the Mean Well failed, every rack and the NUC line would be dead. Measure MW-1.'],
    ['MINIX-02 offline', 'A Callus outage leaves the Pis lit and answering 502. These Pis are dark.'],
  ),
  wrongButTempting: [
    wm('nuc-fuse', 'Replace the 12 V NUC fuse', 100, { event: 'power.fuseRemoved', where: { fuseId: 'F-NUC-12V' } }, teach('You replaced the 12 V NUC fuse.', 'The 12 V line feeds the NUCs; the Pis run on the 5 V 10 A line. (Ref §6)', 'Measure down the 5 V branch of the dark rack.')),
    wm('swap-pi', 'Swap a Pi for a new $50 unit', 0, undefined, teach('The new Pi stays dark too.', 'Every Pi on the rack lost power at once — the fault is upstream. (Ref §6)', 'Follow the power chain with the multimeter.')),
    gw('fuse-15a', 'GW04', 'Fit a 15 A (blue) or 5 A (tan) fuse'),
    gw('live-fuse', 'GW03', 'Pull or insert the fuse with the branch live'),
    gw('ohm-live', 'GW21', 'Measure Ω on a live circuit'),
    gw('rosie-available', 'GW05', 'Set ROSIE Available after recovery'),
  ],
  teaches: 'Ref §6 power chain: 24 V rail → step-downs → 5 V DC 10 A for the Pis, protected by inline fuses. Ref §3: a multi-rig Connection Failed. Unavailable survives the recovery [illus. restore rule].',
  variants: [
    { id: 'B', label: 'Rack A fuse', overrides: { rigs: { candidates: ['wall-e'], default: 'wall-e', scope: 'rack', describe: 'Rack A: WALL-E, EVE, BUMBLEBEE, R2-D2' } } },
    {
      id: 'C',
      label: 'Compound: fuse + JOHNNY-5 Ethernet unplugged',
      minHeat: 3,
      overrides: {
        setup: () => ({ scenario: [F('fuse.blown', { fuse: 'F-RACKB-5V' }), F('eth.unplugged', { host: 'pi-johnny-5' })] }),
        hints: [
          'Every Pi on one rack went dark at once. Follow the power — and re-check every rig afterwards.',
          'After the fuse, compare each rig\'s tablet with Orca: a green tablet with a failed ping means the network.',
          'Fix the fuse (10 A, input off first), then re-seat JOHNNY-5\'s Ethernet cable and wait for the health check.',
        ],
        success: (b) =>
          c.all(c.eq(p.fuse('F-RACKB-5V').state, 'OK'), c.eq(p.fuse('F-RACKB-5V').rating, 10), c.eq(p.pi('pi-johnny-5').eth, 'LINKED'), recoveredAtNextCheck(allRigs(b))),
      },
    },
  ],
};

export const INC04: IncidentDef = {
  id: 'INC04',
  name: 'Connection Failed: Ethernet unplugged',
  difficulty: 1,
  base: 200,
  parS: 150,
  severity: 'P1',
  rigs: { roles: ['touch'], default: 'bumblebee', scope: 'rig', describe: 'any rig with its own Pi (default BUMBLEBEE)' },
  escalatable: true,
  unlockedBy: 'M06',
  tags: ['orca.status.connfailed', 'hw.pi', 'orca.notes'],
  factIds: ['F099', 'F107', 'F109'],
  ticket: { title: (b) => `${hrn(b)} Connection Failed`, reporter: 'jenkins-bot', misleading: { title: (b) => `${hrn(b)}'s Pi crashed again`, reporter: 'riley' } },
  setup: () => ({ scenario: [F('eth.unplugged', { host: '$PI' })] }),
  reveal: 'healthCheck',
  symptoms: [
    sym('Notes', (b) => `GET ${healthUrl(b)} → connect timed out after 10000 ms`),
    sym('LED', 'Pi PWR on, ACT flickering normally, Ethernet jack LEDs off; the cable end dangles behind the cradle.'),
    sym('Tablet', 'Green `Status: OK`.'),
    sym('Camera', (b) => `Stream unavailable from the workstation${ownCamera(b) ? ` — ${cameraUrl(b)}` : ''}.`),
    sym('Terminal', (b) => `ping -c 3 ${piIp(b)} → 3 packets transmitted, 0 received, 100% packet loss`),
  ],
  diagnosisPath: ['Tablet green but Orca red ⇒ the Pi is alive, its network is not.', 'Inspect the Pi\'s Ethernet jack.', 'Call it, then escalate or re-seat the cable.'],
  hints: [
    'Compare the rig\'s tablet with what Orca says.',
    (b) => `Look at ${hrn(b)}'s Pi: are the Ethernet jack LEDs lit?`,
    (b) => `Re-seat the cable: E on the loose end, then on ${hrn(b)}'s Pi jack. Wait for the next health check.`,
  ],
  fix: {
    byTheBook: (b) => P(`Escalate to {{jared}} with ${healthUrl(b)} and cause A.`),
    handsOn: 'Re-seat the Ethernet cable (E on the loose end, then on the jack); the link LEDs light; wait for the next health check.',
  },
  escalation: { endpoints: (b) => [healthUrl(b)], jaredFix: (b) => jaredFix(`rig.${rig(b)}.pi`, 'Tablet green, jack dark. Somebody tugged the cable moving a bin. Re-seating it.') },
  counters: powerCycleCounters,
  success: (b) => c.all(c.eq(p.pi(pi(b)).eth, 'LINKED'), recoveredAtNextCheck([rig(b)])),
  diagnosisCall: dc(
    'Network cable disconnected',
    ['Pi hung', 'A hung Pi freezes its ACT LED and greys the tablet. This tablet is green.'],
    ['Rack fuse blown', 'A blown fuse darkens every Pi on the rack. Only one rig is down.'],
    ['Orca health thread stuck', 'Other rigs were checked at the same time and passed.'],
  ),
  wrongButTempting: [
    gw('cycle-pi', 'GW17', 'Power-cycle the healthy Pi'),
    gw('toggle-main', 'GW17', 'Toggle MAIN'),
    wm('edit-adb-url', 'Edit the Robot ADB Service URL', 100, orcaSave('robot', { fields: ['adbServiceUrl'] }), teach('You edited the ADB Service URL.', 'The URL was right; the ping timed out because the Pi is off the network. (Ref §3)', 'Inspect the Pi\'s Ethernet jack.')),
  ],
  teaches: 'Ref §3: the health check is a REST ping over the network; a healthy tablet next to a failed ping localises the fault to the network.',
  variants: [
    {
      id: 'B',
      label: 'Damaged cable (flapping)',
      overrides: {
        setup: () => ({ scenario: [F('eth.damaged', { host: '$PI' })] }),
        symptoms: [
          sym('Notes', (b) => `Alternating lines across checks: GET ${healthUrl(b)} → connect timed out after 10000 ms / → 200 OK · status restored to Available.`),
          sym('LED', 'The Ethernet link LED flickers irregularly.'),
        ],
        hints: [
          'The Notes alternate between failure and recovery. What would make a link come and go?',
          (b) => `Inspect ${hrn(b)}'s Ethernet cable — re-seating won't help a damaged cable.`,
          'Fit the spare Ethernet cable (hotbar 4) and wait for two health checks in a row to pass.',
        ],
        fix: { handsOn: 'Replace the cable with the spare (hotbar 4); success needs two consecutive OK checks.' },
        success: (b) =>
          c.all(
            c.eq(p.pi(pi(b)).eth, 'LINKED'),
            c.label(c.verify({ kind: 'event', match: { event: 'orca.healthCheckRan' }, count: 2 }, { then: c.status(rig(b), restoredStatus(rig(b))) }), 'Waiting for two health checks'),
          ),
      },
    },
  ],
};

