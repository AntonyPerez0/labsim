/**
 * GP §3.3 global wrong actions GW01–GW24 as data: the GP table (penalty, strike, consequence, tag),
 * the GP §5.5 Teach Card, and a machine-checkable trigger (the bus events that can fire it plus the
 * exact predicate in words). Detection code lives in the mission runtime (`runtime/arcade/gw.ts`,
 * missions-core); `./index.ts` merges these specs with those detectors into `GlobalWrongActionDef`s.
 */
import { personText } from '@/content';
import type { EventName } from '@/core/bus';
import type { TeachCardContent } from '@/core/state';

export type StrikeRule = 'always' | 'never' | 'conditional';

export interface GwTrigger {
  /** Bus events a detector listens to (empty = raised directly by the ticket logic). */
  events: readonly EventName[];
  /** Exact predicate over the event payload + post-event state, in words. */
  rule: string;
  /** Only player-caused events count (runtime-driven / NPC events are filtered). */
  playerOnly: boolean;
}

export interface GwSpec {
  id: string;
  /** Pop-up label. */
  name: string;
  /** GP table "Action". */
  action: string;
  penalty: number;
  strike: StrikeRule;
  /** When `strike` is conditional: what makes it a strike (GP §2.3.9). */
  strikeRule?: string;
  /** GP "World consequence". */
  consequence: string;
  tags: readonly string[];
  trigger: GwTrigger;
  /** GP §5.5 Teach Card. */
  teach: TeachCardContent;
  factIds: readonly string[];
}

const P = personText;
const t = (whatHappened: string, why: string, doInstead: string, extra: Partial<TeachCardContent> = {}): TeachCardContent => ({
  whatHappened: P(whatHappened),
  why: P(why),
  doInstead: P(doInstead),
  ...extra,
});

const RAW: readonly GwSpec[] = [
  {
    id: 'GW01', name: 'Fried hardware', action: 'Connect a LabSim device (or its PSU lead) to any DC rail/regulator terminal', penalty: 500, strike: 'always',
    consequence: 'Device FRIED (spark, smoke); follow-up "Replace fried device" ticket', tags: ['power.18v'], factIds: ['F228', 'F229'],
    trigger: { events: ['power.plugged', 'device.fried'], rule: 'power.plugged with hookup.kind == "dc-rail" and the load is a LabSim device or its PSU brick (load.deviceId set or expects AC-BRICK-18V); or device.fried caused by a DC hookup', playerOnly: true },
    teach: t('The Flex fried on the 24 V tap.', 'LabSim devices draw an irregular 18 V; they bypass the DC rails and use commercial AC strips. (Ref §6)', "Free an outlet on the AC strip; use the device's own PSU.", { ref: 'Ref §6', practiceDrillId: 'DR04', tag: 'power.18v' }),
  },
  {
    id: 'GW02', name: 'Fried Collis probe', action: 'Connect a Collis probe to any DC terminal', penalty: 750, strike: 'always',
    consequence: 'Probe FRIED; rig loses card actions; spare from the locked cabinet costs 120 s', tags: ['power.18v', 'hw.collis'], factIds: ['F069', 'F229'],
    trigger: { events: ['power.plugged'], rule: 'power.plugged with hookup.kind == "dc-rail" and the load is a Collis/SmartStripe probe PSU', playerOnly: true },
    teach: t('The Collis probe fried on DC power.', 'Collis probes are high-cost and, like LabSim devices, go only on AC strips. (Ref §1, §6)', 'Plug the probe PSU into the strip; re-seat its rear ribbon.', { ref: 'Ref §1, §6', practiceDrillId: 'DR04', tag: 'power.18v' }),
  },
  {
    id: 'GW03', name: 'Live fuse swap', action: 'Remove/insert a fuse with its branch live (regulator input on / MAIN on)', penalty: 200, strike: 'never',
    consequence: 'Spark + snap', tags: ['power.fuses'], factIds: ['F087'],
    trigger: { events: ['power.fuseRemoved', 'power.fuseInserted'], rule: 'payload.live == true', playerOnly: true },
    teach: t('You pulled a fuse on a live branch.', 'De-energise before servicing a fused line. [illus. practice]', 'Regulator input off (or MAIN off), then swap the fuse.', { illustrative: true, practiceDrillId: 'DR13', tag: 'power.fuses' }),
  },
  {
    id: 'GW04', name: 'Wrong fuse rating', action: 'Fuse rating ≠ holder label', penalty: 250, strike: 'never',
    consequence: 'Over-rated: flagged unsafe; under-rated (5 A): blows again within 20 s', tags: ['power.fuses'], factIds: ['F086', 'F087'],
    trigger: { events: ['power.fuseInserted'], rule: 'payload.ratingA != payload.labelA', playerOnly: true },
    teach: t('Wrong fuse rating.', 'Use the rating on the holder label (10 A on the 5 V 10 A line). [illus. rating]', 'Take a red 10 A blade fuse.', { illustrative: true, practiceDrillId: 'DR13', tag: 'power.fuses' }),
  },
  {
    id: 'GW05', name: 'PayCore rig opened', action: 'Set a `paycore` rig to `Available`', penalty: 400, strike: 'conditional',
    strikeRule: 'A Laz merchant overwrite of that rig (laz.runFinished / device.provisioned on its device) follows while it is Available',
    consequence: '40 % per checkout cycle that a general pipeline takes it and Laz swaps its merchant → INC40', tags: ['orca.status.unavailable'], factIds: ['F102', 'F103'],
    trigger: { events: ['robot.statusChanged'], rule: 'to == "AVAILABLE" on a rig with the `paycore` role tag (ROSIE)', playerOnly: true },
    teach: t("ROSIE opened to general pipelines.", "Unavailable keeps PayCore's merchant safe; only jobs naming the robot use it, and Orca resets it afterwards. (Ref §3)", 'Leave it Unavailable; pass `ROBOT_NAME=rosie`.', { ref: 'Ref §3', practiceDrillId: 'DR01', tag: 'orca.status.unavailable' }),
  },
  {
    id: 'GW06', name: 'Arm pushed by hand', action: 'Push/drag a gantry carriage by hand', penalty: 100, strike: 'never',
    consequence: 'Lock released, banner yellow', tags: ['hw.motion'], factIds: ['F231', 'F232'],
    trigger: { events: ['rig.carriageDragged', 'rig.lockBroken'], rule: 'the player dragged a carriage (actor == "player") — the magnetic lock breaks', playerOnly: true },
    teach: t('Pushing the arm released its magnetic lock.', 'Manual moves turn the banner yellow; only Park All re-homes to the limit switches. (Ref §6)', 'Motion Control → Park All.', { ref: 'Ref §6', practiceDrillId: 'DR16', tag: 'hw.motion' }),
  },
  {
    id: 'GW07', name: 'Power cut mid-test', action: 'Toggle MAIN/MOTOR or press any motion button on a rig with an active test', penalty: 250, strike: 'never',
    consequence: 'Running build fails; coworker bark', tags: ['hw.lockout'], factIds: ['F230'],
    trigger: { events: ['rig.switch', 'rig.command'], rule: 'the rig is checked out by a running build (dashboard lockout active) at the time of the switch/command', playerOnly: true },
    teach: t('You cut power during an active test.', 'The dashboard locks out during tests for this reason. (Ref §6)', 'Wait for the job to finish.', { ref: 'Ref §6', practiceDrillId: 'DR16', tag: 'hw.lockout' }),
  },
  {
    id: 'GW08', name: 'Port 5555', action: 'Use port 5555 (config, `adb connect`, `adb tcpip 5555`, Orca URL)', penalty: 300, strike: 'conditional',
    strikeRule: 'The 5555 connection reaches a coworker desk device (10.42.60.x; adb.coworkerDriven)',
    consequence: "{{riley}}'s desk Flex gets driven (INC27)", tags: ['adb.port'], factIds: ['F198', 'F199', 'F200'],
    trigger: {
      events: ['git.fileEdited', 'adb.connected', 'adb.command', 'orca.entitySaved'],
      rule: 'config.properties portNumber becomes 5555; adb connect to <host>:5555; adb tcpip 5555; or a robot URL saved with :5555',
      playerOnly: true,
    },
    teach: t('Port 5555 used.', "5555 is the ADB default and let scripts drive coworkers' desk devices; the lab uses 5444. (Ref §4)", '`portNumber=5444`; `adb connect <ip>:5444`.', { ref: 'Ref §4', practiceDrillId: 'DR03', tag: 'adb.port' }),
  },
  {
    id: 'GW09', name: 'Legacy device deleted', action: "Delete a Device row that is a robot's legacy/rollback device", penalty: 300, strike: 'never',
    consequence: 'Rollback impossible (INC43 much longer)', tags: ['orca.device'], factIds: ['F119', 'F120'],
    trigger: { events: ['orca.entitySaved'], rule: 'entity == "device", action == "delete", and the row was ever a Robot Device of a robot (legacy / rollback row)', playerOnly: true },
    teach: t('Legacy device configuration lost.', 'Robots link to a separate Device row so upgrades keep the old config for rollback. (Ref §3)', 'Create a new Device row and relink Robot Device.', { ref: 'Ref §3', practiceDrillId: 'DR12', tag: 'orca.device' }),
  },
  {
    id: 'GW10', name: 'Device edited in place', action: "Change an existing Device row's `type`/serial in place for a hardware swap", penalty: 300, strike: 'never',
    consequence: 'Legacy config lost', tags: ['orca.device'], factIds: ['F119', 'F120'],
    trigger: { events: ['orca.entitySaved'], rule: 'entity == "device", action == "update", fields include deviceType or serial, on a row linked to a robot', playerOnly: true },
    teach: t('Legacy device configuration lost.', 'Robots link to a separate Device row so upgrades keep the old config for rollback. (Ref §3)', 'Create a new Device row and relink Robot Device.', { ref: 'Ref §3', practiceDrillId: 'DR12', tag: 'orca.device' }),
  },
  {
    id: 'GW11', name: 'Security tampering', action: 'Uninstall/disable the corporate security agent or delete its logs', penalty: 800, strike: 'always',
    consequence: '"Security policy violation" email in LabChat', tags: ['hw.nuc'], factIds: ['F067', 'F068'],
    trigger: { events: ['host.securityTamper'], rule: 'any security-agent tamper (uninstall, disable, delete its logs) on a Windows box', playerOnly: true },
    teach: t('Security monitoring was tampered with.', 'The NUC disk problem is why hardware control moved to the Pis — not something to delete. (Ref §1)', 'Move control back to the Pi.', { ref: 'Ref §1', practiceDrillId: 'DR17', tag: 'hw.nuc' }),
  },
  {
    id: 'GW12', name: 'Wrong escalation', action: 'Escalate a non-escalatable issue to {{jared}}', penalty: 100, strike: 'never',
    consequence: '20 s bounce + teaching bark', tags: ['people.roles'], factIds: ['F111'],
    trigger: { events: [], rule: 'raised by the ticket logic when Escalate is used on an incident with escalatable == false', playerOnly: true },
    teach: t('{{jared}} bounced the escalation.', 'Escalate hardware Connection Failed causes; config issues are yours. (Ref §3)', 'Read the Notes / Edit view and fix it.', { ref: 'Ref §3', practiceDrillId: 'DR14', tag: 'people.roles' }),
  },
  {
    id: 'GW13', name: 'Shared infra restarted', action: 'Restart the Orca/Jenkins/Ollama VM or power-cycle the GPU blade', penalty: 500, strike: 'never',
    consequence: 'All running builds fail; VMs down 45 s (they share the blade)', tags: ['arch.infra'], factIds: ['F078'],
    trigger: { events: ['host.powerChanged', 'terminal.command'], rule: 'orca-vm, jenkins-vm, ollama-vm or gpu-blade goes to "off" (reboot / power cycle) by the player — restarting a single service is not GW13', playerOnly: true },
    teach: t('You restarted shared infrastructure.', 'Orca, Jenkins and Ollama VMs share the GPU blade; restarts kill every running job. (Ref §1)', 'Restart only the failed service.', { ref: 'Ref §1', practiceDrillId: 'DR17', tag: 'arch.infra' }),
  },
  {
    id: 'GW14', name: 'Edited app/src/main', action: 'Edit any file under `uia-remote/app/src/main`', penalty: 200, strike: 'never',
    consequence: 'PR auto-flagged by {{morgan}}', tags: ['uia.layout'], factIds: ['F164'],
    trigger: { events: ['git.fileEdited'], rule: 'repo == "uia-remote" and path starts with "app/src/main/"', playerOnly: true },
    teach: t('Edited app/src/main.', 'main holds production/app registration code; QA never modifies it. (Ref §4)', 'Put tests in the androidTest packages.', { ref: 'Ref §4', practiceDrillId: 'DR15', tag: 'uia.layout' }),
  },
  {
    id: 'GW15', name: 'Deprecated config values', action: '`theme` ≠ `avocado` or `kernelType` ≠ `CPA`', penalty: 100, strike: 'never',
    consequence: 'Local run fails at setup', tags: ['uia.config'], factIds: ['F196', 'F197'],
    trigger: { events: ['git.fileEdited'], rule: 'a config.properties edit leaves theme != "avocado" or kernelType != "CPA" where it was correct before', playerOnly: true },
    teach: t('Deprecated theme/kernel.', 'theme is locked to avocado; kernelType to CPA (replaces SPA). (Ref §4)', '`theme=avocado`, `kernelType=CPA`.', { ref: 'Ref §4', practiceDrillId: 'DR02', tag: 'uia.config' }),
  },
  {
    id: 'GW16', name: 'Resolved too early', action: 'Resolve a ticket whose success condition is false', penalty: 100, strike: 'never',
    consequence: 'Combo reset; ticket stays open', tags: [], factIds: [],
    trigger: { events: [], rule: 'raised by the ticket logic: Resolve pressed while the immediate success condition is false, or a deferred verification trigger arrives and the condition is false', playerOnly: true },
    teach: t('Resolved too early.', "The fix isn't verified yet (next health check / next build).", "Check the ticket's verification line."),
  },
  {
    id: 'GW17', name: 'Extra power cycle', action: 'Redundant power-cycle (target already booting or healthy)', penalty: 50, strike: 'never',
    consequence: 'Recovery slips to the next health check', tags: ['orca.healthcheck'], factIds: ['F099', 'F107'],
    trigger: { events: ['host.powerChanged', 'rig.switch'], rule: 'a Pi/box goes to "off" (lead pulled, MAIN off, power button) while it was BOOTING, or RUNNING with no active fault on it', playerOnly: true },
    teach: t('Extra power cycle.', 'Recovery shows at the next 5-minute health check; cycling again delays it. (Ref §3)', 'Verify with curl and wait for the ping.', { ref: 'Ref §3', practiceDrillId: 'DR01', tag: 'orca.healthcheck' }),
  },
  {
    id: 'GW18', name: 'Offsets used', action: 'Enter non-zero Offsets to compensate for coordinate problems', penalty: 150, strike: 'never',
    consequence: 'Masks the root cause', tags: ['orca.offsets'], factIds: ['F129', 'F130'],
    trigger: { events: ['orca.entitySaved'], rule: 'entity == "robot", fields include offsetXMm/offsetYMm and the saved value is non-zero', playerOnly: true },
    teach: t('Offsets used to compensate.', 'Offsets are legacy; the lab is calibrated to true (0,0). (Ref §3)', 'Offsets to 0; fix the coordinates or hardware.', { ref: 'Ref §3', practiceDrillId: 'DR12', tag: 'orca.offsets' }),
  },
  {
    id: 'GW19', name: "Aborted someone's job", action: "Abort another engineer's running job without cause", penalty: 200, strike: 'never',
    consequence: 'Coworker complaint', tags: ['hw.lockout'], factIds: ['F230'],
    trigger: { events: ['jenkins.buildFinished'], rule: 'result == "ABORTED" by the player on a build the player did not trigger', playerOnly: true },
    teach: t("You took over someone else's rig.", 'Active runs and Reserved rigs belong to their engineer. (Ref §3, §6)', 'Ask in LabChat first.', { ref: 'Ref §3, §6', practiceDrillId: 'DR01', tag: 'hw.lockout' }),
  },
  {
    id: 'GW20', name: "Took someone's Reserved rig", action: 'Change a rig away from `Reserved` set by someone else without asking', penalty: 150, strike: 'never',
    consequence: 'Their local run collides with Jenkins', tags: ['orca.status.reserved'], factIds: ['F112', 'F113'],
    trigger: { events: ['robot.statusChanged'], rule: 'from == "RESERVED", reservedBy != "player", and the player has not asked that engineer in LabChat during the activity', playerOnly: true },
    teach: t("You took over someone else's rig.", 'Active runs and Reserved rigs belong to their engineer. (Ref §3, §6)', 'Ask in LabChat first.', { ref: 'Ref §3, §6', practiceDrillId: 'DR01', tag: 'orca.status.reserved' }),
  },
  {
    id: 'GW21', name: 'Ω on a live circuit', action: 'Ω mode on a powered circuit', penalty: 50, strike: 'never',
    consequence: 'Meter shows "ERR"', tags: ['power.fuses'], factIds: ['F087'],
    trigger: { events: ['power.measured'], rule: 'mode == "OHM" and live == true', playerOnly: true },
    teach: t('Ω mode on a live circuit.', 'Resistance is measured with power off. [general practice]', 'Power off, then Ω.', { practiceDrillId: 'DR13', tag: 'power.fuses' }),
  },
  {
    id: 'GW22', name: 'Robot Name edited', action: "Edit a robot's **Name** (system identifier) when the Human Readable Name was meant", penalty: 100, strike: 'never',
    consequence: 'Pipelines and named jobs lose the robot until reverted ({{tate}}: "Name is the system identifier. Pipelines use it. Leave it.")', tags: ['orca.names'], factIds: ['F117', 'F118'],
    trigger: { events: ['orca.entitySaved'], rule: 'entity == "robot", action == "update", fields include name', playerOnly: true },
    teach: t('You edited the robot\'s Name.', 'Name is the system identifier pipelines use; the tablet shows the Human Readable Name. (Ref §3)', 'Revert Name; edit Human Readable Name.', { ref: 'Ref §3', practiceDrillId: 'DR12', tag: 'orca.names' }),
  },
  {
    id: 'GW23', name: "Unplugged a coworker's device", action: "Unplug or power off a coworker's desk device to stop a collision", penalty: 100, strike: 'never',
    consequence: '{{riley}} annoyed; the config is still wrong', tags: ['adb.port'], factIds: ['F200'],
    trigger: { events: ['power.unplugged', 'device.powerChanged'], rule: 'the load / device is a coworker desk device (10.42.60.x)', playerOnly: true },
    teach: t("You unplugged a coworker's device.", 'The problem is your port, not their desk. (Ref §4)', 'Stop the run, disconnect, set 5444.', { ref: 'Ref §4', practiceDrillId: 'DR03', tag: 'adb.port' }),
  },
  {
    id: 'GW24', name: 'Overrode a failed health check', action: 'Manually set a `Connection Failed` rig to `Available` while the cause persists', penalty: 200, strike: 'always',
    consequence: 'A pipeline checks out a dead rig (red build); next ping flips it back', tags: ['orca.status.connfailed'], factIds: ['F107', 'F108'],
    trigger: { events: ['robot.statusChanged'], rule: 'from == "CONNECTION_FAILED", to == "AVAILABLE", and a fault keeping the rig from passing its next health check is still active', playerOnly: true },
    teach: t('You overrode a failed health check.', 'Connection Failed blocks checkouts for a reason; the next ping will flip it back. (Ref §3)', 'Find the cause or escalate to {{jared}} with the endpoint.', { ref: 'Ref §3', practiceDrillId: 'DR01', tag: 'orca.status.connfailed' }),
  },
];

export const GW_SPECS: readonly GwSpec[] = RAW.map((g) => ({ ...g, action: P(g.action), consequence: P(g.consequence) }));

export const GW_SPEC_BY_ID: Readonly<Record<string, GwSpec>> = Object.fromEntries(GW_SPECS.map((g) => [g.id, g]));
