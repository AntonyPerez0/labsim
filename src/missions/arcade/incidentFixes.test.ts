/**
 * Solvability spot-checks: apply each incident's documented hands-on fix through the SimApi and check
 * that the immediate part of its success condition becomes true (the deferred "next health check / next
 * build" part is the runtime's job). Catches probe-vocabulary or id mismatches with the sim.
 */
import { describe, expect, it } from 'vitest';
import { sim } from '@/sim';
import type { SimApi } from '@/sim/api';
import { createInitialRoot, getState, store } from '@/core/store';
import { bus } from '@/core/bus';
import { createRngState } from '@/core/rng';
import type { Condition, IncidentBinding, ScenarioItem } from '../types';
import { INCIDENTS_BY_ID } from './incidents';
import { addTruth, bindIncident, resolveVariant } from '../runtime/arcade/binding';
import { substituteScenario } from '../runtime/scripts';
import { createScope, disposeScope, evaluate } from '../runtime/conditions/evaluate';
import { appendLog } from '../runtime/rt';

// Record bus events into the runtime log (what the mission driver does) so `happened` / `sequence`
// parts of a success condition see the player's actions.
bus.onAny((type, payload) => {
  const s = getState();
  appendLog(type, payload, s.lab.time.nowMs, s.session.clockS);
});

/** Advance `s` physical (real) seconds — game time runs at the lab's time scale. */
const tick = (s: number) => {
  const scale = getState().lab.time.timeScale || 1;
  for (let i = 0; i < s * 4; i++) sim.tick(250 * scale);
};

function setUp(id: string, vid = 'A'): IncidentBinding {
  store.setState(createInitialRoot(), true);
  sim.reset({ preset: 'arcade', seed: 7 });
  const def = resolveVariant(INCIDENTS_BY_ID[id]!, vid);
  const rng = createRngState(3);
  const b = addTruth(def, bindIncident(def, vid, getState().lab, rng, { preferRig: null, busyRigs: [], mode: 'default', seed: 9 })!, getState().lab, rng);
  const setup = def.setup(b);
  const r = sim.faults.injectAll(substituteScenario(setup.scenario ?? [], b) as ScenarioItem[] as never);
  if (!r.ok) throw new Error(r.error);
  if (setup.run) setup.run(sim, { lab: getState().lab, rng, binding: b, vars: {} });
  tick(1);
  return b;
}

/** Open an evaluation scope before the fix (so `happened` / `sequence` parts see the player's events). */
function watch(id: string, b: IncidentBinding, vid = 'A'): () => boolean {
  const def = resolveVariant(INCIDENTS_BY_ID[id]!, vid);
  const cond = def.success(b);
  const scope = createScope({ id: `fix:${id}`, kind: 'ticket', ownerId: id, cond, state: getState(), binding: b });
  return () => {
    if (process.env.DEBUG_FIX === id && cond.op === 'all') for (const part of cond.of) console.log('PART', JSON.stringify(part).slice(0, 160), evaluate(part, getState(), scope, 'immediate'));
    return evaluate(cond, getState(), scope, 'immediate');
  };
}

const robotId = (name: string): number => Object.values(getState().lab.orca.robots).find((x) => x.name === name)!.id;
const merchantId = (name: string): number => Object.values(getState().lab.orca.merchants).find((x) => x.name === name)!.id;

/** Run a terminal line to completion (long-running jobs are polled while the sim ticks). */
function term(line: string): string {
  const r = sim.terminal.exec(line) as { lines?: { text: string }[]; jobId?: string | null };
  let out = (r.lines ?? []).map((l) => l.text).join('\n');
  if (r.jobId) {
    for (let i = 0; i < 400; i++) {
      tick(0.25);
      const p = sim.terminal.poll(r.jobId);
      if (p.done) {
        out += p.lines.map((l) => l.text).join('\n');
        break;
      }
    }
  }
  return out;
}

/** Edit keys in the cloned uia-remote config.properties (what IntelliJ's editor does). */
function setConfig(s: SimApi, patch: Record<string, string>): void {
  let text = String(getState().lab.repos['uia-remote']?.local?.files?.['config.properties'] ?? '');
  for (const [k, v] of Object.entries(patch)) text = text.replace(new RegExp(`^${k}=.*$`, 'm'), `${k}=${v}`);
  expect(s.git.writeFile('uia-remote', 'config.properties', text).ok).toBe(true);
}

/** Write the RECEIPT_OPTIONS_5 rows the incident's success condition expects (the Orca-rows fix path). */
function applyScreenLocations(s: SimApi, b: IncidentBinding, id: string): void {
  const want: Record<string, { deviceType: string; screen: string; button: string; x?: number; y?: number }> = {};
  const walk = (c: Condition): void => {
    if (c.op === 'all' || c.op === 'any') c.of.forEach(walk);
    if (c.op === 'cmp' && c.probe.p === 'orca.screenLocation' && typeof c.value === 'number') {
      const pr = c.probe as unknown as { deviceType: string; screen: string; button: string; field: 'x' | 'y' };
      const k = `${pr.deviceType}|${pr.screen}|${pr.button}`;
      want[k] ??= { deviceType: pr.deviceType, screen: pr.screen, button: pr.button };
      want[k]![pr.field] = c.value;
    }
  };
  walk(resolveVariant(INCIDENTS_BY_ID[id]!, 'A').success(b));
  expect(Object.keys(want).length).toBeGreaterThan(0);
  for (const w of Object.values(want)) {
    const l = getState().lab.orca;
    let scr = Object.values(l.screens).find((x) => x.deviceType === w.deviceType && x.name === w.screen);
    if (!scr) {
      const r = s.orca.saveScreen({ name: w.screen, deviceType: w.deviceType as never, optionCount: 5, description: 'Receipt options (5)' }, 'player');
      expect(r.ok ? 'ok' : r.error).toBe('ok');
      scr = getState().lab.orca.screens[r.ok ? r.value : -1]!;
    }
    const loc = Object.values(getState().lab.orca.screenLocations).find((x) => x.screenId === scr.id && x.button === w.button);
    const r = s.orca.saveScreenLocation({ ...(loc ? { id: loc.id } : { screenId: scr.id, button: w.button }), xMm: w.x!, yMm: w.y! }, 'player');
    expect(r.ok ? 'ok' : r.error).toBe('ok');
  }
}

const FIXES: Record<string, (s: SimApi, b: IncidentBinding) => void> = {
  INC01: (s, b) => {
    s.host.powerCycle(String(b.vars.pi), 'player');
    tick(70);
  },
  INC02: (s, b) => {
    s.host.pressPowerButton(String(b.vars.box), false, 'player');
    tick(60);
  },
  INC03: (s, b) => {
    const fuse = String(b.vars.fuse);
    const reg = fuse === 'F-RACKA-5V' ? 'REG-5V-A' : 'REG-5V-B';
    s.power.toggleRegulator(reg, false, 'player');
    s.power.removeFuse(fuse, 'player');
    s.power.insertFuse(fuse, 10, 'player');
    s.power.toggleRegulator(reg, true, 'player');
    tick(25);
  },
  INC04: (s, b) => {
    s.host.setEthernet(String(b.vars.pi), true, 'player');
    tick(1);
  },
  INC08: (s) => {
    s.host.restartService('pi-cam-rackb', 'camera-stream', 'player');
    tick(5);
  },
  INC10: (s) => {
    s.host.restartService('ollama-vm', 'ollama', 'player');
    tick(15);
  },
  INC14: (s, b) => {
    const r = Object.values(getState().lab.orca.robots).find((x) => x.name === b.rig)!;
    s.orca.saveRobot({ id: r.id, offsetXMm: 0, offsetYMm: 0 }, 'player');
  },
  INC15: (s, b) => {
    s.rig.setSwitch(b.rig!, 'motor', false, 'player');
    s.rig.setDoor(b.rig!, true, 'player');
    expect(s.rig.reseat(b.rig!, 'solenoidConnector', 'player').ok).toBe(true);
    s.rig.setDoor(b.rig!, false, 'player');
    s.rig.setSwitch(b.rig!, 'motor', true, 'player');
    tick(1);
    s.rig.command(b.rig!, 'park.all', 'player');
    tick(20);
  },
  INC16: (s, b) => {
    s.rig.command(b.rig!, 'dip.out', 'player');
    tick(3);
    s.rig.setSwitch(b.rig!, 'motor', false, 'player');
    s.rig.setDoor(b.rig!, true, 'player');
    const r = s.rig.alignDipArm(b.rig!, -1, 'player');
    expect(r.ok ? 'ok' : r.error).toBe('ok');
    s.rig.setDoor(b.rig!, false, 'player');
    s.rig.setSwitch(b.rig!, 'motor', true, 'player');
    tick(1);
    s.rig.command(b.rig!, 'park.all', 'player');
    tick(20);
  },
  INC17: (s, b) => {
    s.power.unplug('desk-fan', 'player');
    s.power.plug(`psu-${String(b.vars.device)}`, { kind: 'ac-strip', targetId: 'STRIP-A', socket: 6 }, 'player');
    tick(40);
  },
  INC18: (s, b) => {
    s.power.plug(`psu-${String(b.vars.probe)}`, { kind: 'ac-strip', targetId: 'STRIP-C', socket: 1 }, 'player');
    tick(5);
  },
  INC19: (s, b) => {
    const rig = b.rig!;
    const robot = Object.values(getState().lab.orca.robots).find((x) => x.name === rig)!;
    s.orca.setRobotStatus(robot.id, 'OFFLINE', 'player');
    s.rig.setSwitch(rig, 'motor', false, 'player');
    expect(s.rig.moveMotorUsb(rig, 'PI', 'player').ok).toBe(true);
    const pi = String(b.vars.pi);
    const yaml = String(getState().lab.hosts[pi]!.files['/etc/robot-controller/controller.yaml'] ?? '');
    expect(yaml).toContain('motion: nuc://10.42.20.3:9100');
    s.host.writeFile(pi, '/etc/robot-controller/controller.yaml', yaml.replace('motion: nuc://10.42.20.3:9100', 'motion: local'), 'player');
    s.host.restartService(pi, 'robot-controller', 'player');
    tick(10);
    s.rig.setSwitch(rig, 'motor', true, 'player');
    tick(1);
    s.rig.command(rig, 'park.all', 'player');
    tick(20);
    s.orca.setRobotStatus(robot.id, 'AVAILABLE', 'player');
  },
  INC59: (s, b) => {
    const rig = b.rig!;
    expect(s.printer3d.start('prusa', 'cradle_flex_gen3.3mf', 'player').ok).toBe(true);
    tick(100);
    s.rig.setSwitch(rig, 'motor', false, 'player');
    s.rig.setDoor(rig, true, 'player');
    const r = s.rig.replaceCradle(rig, 'player');
    expect(r.ok ? 'ok' : r.error).toBe('ok');
    s.rig.setDoor(rig, false, 'player');
    s.rig.setSwitch(rig, 'motor', true, 'player');
    tick(1);
    s.rig.command(rig, 'park.all', 'player');
    tick(20);
  },
  INC65: (s, b) => {
    const r = Object.values(getState().lab.orca.robots).find((x) => x.name === b.rig)!;
    s.orca.saveRobot({ id: r.id, tapUrl: `http://${String(b.vars.piIp)}:8000/tap` }, 'player');
  },
  INC22: (s) => {
    const l = getState().lab;
    const scr = Object.values(l.orca.screens).find((x) => x.deviceType === 'FLEX_1' && x.name === 'RECEIPT_OPTIONS_4')!;
    const loc = Object.values(l.orca.screenLocations).find((x) => x.screenId === scr.id && x.button === 'Print')!;
    s.orca.saveScreenLocation({ id: loc.id, yMm: 66.5 }, 'player');
  },
  INC36: (s) => {
    const c = Object.values(getState().lab.orca.screenCompareImages).find((x) => x.name === 'CFD_TOTAL')!;
    s.orca.saveScreenCompareImage({ id: c.id, bbox: { ...c.bbox, y: 298 } }, 'player');
  },
  INC45: (s, b) => {
    const l = getState().lab;
    const r = Object.values(l.orca.robots).find((x) => x.name === b.rig)!;
    const mfd = Object.values(l.orca.devices).find((x) => x.name === `${b.rig}-mfd`)!;
    const cfd = Object.values(l.orca.devices).find((x) => x.name === `${b.rig}-cfd`)!;
    s.orca.saveRobot({ id: r.id, mfdDeviceId: mfd.id, cfdDeviceId: cfd.id }, 'player');
  },
  INC51: (s) => {
    const m = Object.values(getState().lab.orca.merchants).find((x) => x.name === 'GO-SDK-US-01')!;
    s.orca.saveMerchant({ id: m.id, apiKey: 'key_sim_19c0e2' }, 'player');
  },
  INC53: (s) => {
    const cp = Object.values(getState().lab.orca.cardProfiles).find((x) => x.name === 'VISA_STD_DIP')!;
    s.orca.saveCardProfile({ id: cp.id, gortPath: 'cards/emv/visa_std_dip.json' }, 'player');
  },
  INC54: (s, b) => {
    s.host.runSchedTask(String(b.vars.box), 'GortCardSync', 'player');
    tick(25);
  },
  INC60: (s) => {
    s.host.startService('orca-vm', 'mysql', 'player');
    tick(20);
  },
  INC20: (s, b) => applyScreenLocations(s, b, 'INC20'),
  INC21: (s, b) => applyScreenLocations(s, b, 'INC21'),
  INC25: (s) => {
    const path = 'tests/sale/tip_sale_print.json';
    expect(s.git.clone('pigeon', 'player').ok).toBe(true);
    const lines = String(getState().lab.repos.pigeon!.local!.files[path]).split('\n');
    lines[7] = `${lines[7]!.replace(/,?\s*$/, '')},`;
    const text = lines.join('\n');
    JSON.parse(text);
    expect(s.git.writeFile('pigeon', path, text).ok).toBe(true);
    expect(s.git.stage('pigeon', [path]).ok).toBe(true);
    expect(s.git.commit('pigeon', 'Fix missing comma after add tip', 'player').ok).toBe(true);
    const r = s.git.push('pigeon');
    expect(r.ok ? 'ok' : r.error).toBe('ok');
  },
  INC55: (s, b) => {
    const cp = Object.values(getState().lab.orca.cardProfiles).find((x) => x.name === 'VISA_STD_SWIPE')!;
    s.orca.saveCardProfile({ id: cp.id, trackData: String(b.vars['truth.tracks']) }, 'player');
  },
  INC23: (s) => {
    const path = 'go-sdk/tests/sale_receipt.json';
    expect(s.git.clone('gort', 'player').ok).toBe(true);
    expect(s.git.checkout('gort', 'fix/printer-capability', true).ok).toBe(true);
    const json = JSON.parse(String(getState().lab.repos.gort!.local!.files[path])) as { capabilities: Record<string, unknown> };
    json.capabilities.printer = true;
    expect(s.git.writeFile('gort', path, JSON.stringify(json, null, 2)).ok).toBe(true);
    expect(s.git.stage('gort', [path]).ok).toBe(true);
    expect(s.git.commit('gort', 'Restore printer capability', 'player').ok).toBe(true);
    expect(s.git.push('gort').ok).toBe(true);
    // gort main is protected: PR → reviewer merges
    const pr = s.git.createPullRequest('gort', 'Restore printer capability', 'sale_receipt needs a printer', 'fix/printer-capability', 'player');
    expect(pr.ok ? 'ok' : pr.error).toBe('ok');
    tick(60);
    const merged = getState().lab.repos.gort!.pullRequests.find((x) => pr.ok && x.number === pr.value.number);
    expect(merged?.state, 'reviewer merged the PR').toBe('merged');
  },
  INC34: (s) => {
    for (const reason of ['main-edit', 'missing-isScreenPresent', 'port-5555']) {
      const r = s.git.comment('uia-remote', 431, { path: null, line: null, body: reason, reason }, 'player');
      expect(r.ok ? 'ok' : r.error).toBe('ok');
    }
    expect(s.git.requestChanges('uia-remote', 431, 'player').ok).toBe(true);
  },
  INC07: (s) => {
    s.orca.setRobotStatus(robotId('baymax'), 'OFFLINE', 'player');
  },
  INC09: (s, b) => {
    s.orca.saveRobot({ id: robotId(b.rig!), cameraStreamUrl: String(b.vars.cameraUrl) }, 'player');
  },
  INC11: (s, b) => {
    s.rig.command(b.rig!, 'park.all', 'player');
    tick(20);
  },
  INC13: (s, b) => {
    s.rig.command(b.rig!, 'steppers.enable', 'player');
    tick(1);
    s.rig.command(b.rig!, 'park.all', 'player');
    tick(20);
  },
  INC26: (s) => {
    expect(s.jenkins.moveJob('iOS/pigeon-windows-tender', 'Java', 'player').ok).toBe(true);
  },
  INC28: () => {
    term('ssh pi@10.42.10.30');
    term(`adb -s ${getState().lab.devices['dev-data-mini3']!.serial} tcpip 5444`);
    term('exit');
    tick(5);
  },
  INC30: (s) => {
    setConfig(s, { customerFacingDeviceIp: '10.42.30.14' });
  },
  INC33: (s) => {
    setConfig(s, { deviceType: 'Flex' });
  },
  INC37: (s) => {
    const c = Object.values(getState().lab.orca.screenCompareImages).find((x) => x.name === 'CFD_TOTAL')!;
    s.orca.saveScreenCompareImage({ id: c.id, expectedText: 'Total $10.83' }, 'player');
  },
  INC40: (s) => {
    s.orca.setRobotStatus(robotId('rosie'), 'UNAVAILABLE', 'player');
    expect(s.laz.start('dev-rosie-pocket', merchantId('PAYCORE-STANDALONE-01'), 'player').ok).toBe(true);
    tick(120);
  },
  INC42: (s) => {
    const r = s.device.swapHardware('johnny-5', 'FLEX_2', 'player');
    expect(r.ok ? 'ok' : r.error).toBe('ok');
    if (!r.ok) return;
    const serial = getState().lab.devices[r.value.deviceId]!.serial;
    const d = s.orca.saveDevice({ name: 'johnny-5-flex2', deviceType: 'FLEX_2', serial, ip: '10.42.30.15', label: 'Flex 2 (JOHNNY-5)' }, 'player');
    expect(d.ok ? 'ok' : d.error).toBe('ok');
    if (!d.ok) return;
    s.orca.saveRobot({ id: robotId('johnny-5'), deviceId: d.value }, 'player');
    tick(5);
  },
  INC43: (s) => {
    const flex1 = Object.values(getState().lab.orca.devices).find((x) => x.name === 'johnny-5-flex1')!;
    s.orca.saveRobot({ id: robotId('johnny-5'), deviceId: flex1.id }, 'player');
  },
  INC44: (s) => {
    s.orca.setRobotStatus(robotId('k-9'), 'OFFLINE', 'player');
  },
  INC46: (s) => {
    s.orca.saveRobot({ id: robotId('tars'), mfdDeviceId: null, cfdDeviceId: null }, 'player');
  },
  INC47: (s) => {
    // the reseat verb toggles; only the MFD's hub-to-peer USB lead was knocked loose
    expect(s.device.reseatHub('dev-megatron-mfd', 'usb', 'player')).toEqual({ ok: true, value: { seated: true } });
    tick(5);
  },
  INC49: (s) => {
    const job = s.jenkins.job('Java/contact-canada-pin-sale')!;
    expect(s.jenkins.configureScript(job.id, job.script.replace(/deviceType: '[A-Z_0-9]+'/, "deviceType: 'COMPACT'"), 'player').ok).toBe(true);
  },
  INC50: (s) => {
    const id = merchantId('WESTERS-CA-02');
    s.orca.saveMerchant({ id, ubiRoute: 'ca-central' }, 'player');
    expect(s.laz.start('dev-seti-compact', id, 'player').ok).toBe(true);
    tick(120);
  },
  INC56: () => {
    term('ssh pi@10.42.10.15');
    term('sudo systemctl stop cardprog');
    term('rm -rf /home/pi/.wine-cardprog && cp -a /opt/cardprog/wineprefix-golden /home/pi/.wine-cardprog');
    term('sudo systemctl start cardprog');
    term('exit');
    tick(60);
  },
  INC63: (s) => {
    s.orca.saveRobot({ id: robotId('johnny-5'), humanReadableName: 'JOHNNY-5' }, 'player');
  },
};

/**
 * Fixes the sim cannot carry out yet (reported to the sim owners). Listed instead of silently dropped.
 * INC56: the terminal's `cp -a` copies a directory's children but not the directory marker itself
 * (`'/opt/cardprog/wineprefix-golden/' = 'ok'`), so restoring the golden Wine prefix leaves
 * `/home/pi/.wine-cardprog/` missing and cardprog keeps failing (src/sim/terminal/text.ts `cp`).
 */
const KNOWN_SIM_GAPS: Record<string, string> = {
  INC56: 'terminal cp -a does not recreate the Wine prefix directory marker',
};

describe('documented fixes satisfy the immediate success condition', () => {
  for (const [id, why] of Object.entries(KNOWN_SIM_GAPS)) it.todo(`${id} — ${why}`);
  it.each(Object.keys(FIXES).filter((id) => !KNOWN_SIM_GAPS[id]))('%s', (id) => {
    const b = setUp(id);
    const ok = watch(id, b);
    try {
      expect(ok(), 'broken before the fix').toBe(false);
      FIXES[id]!(sim, b);
      expect(ok(), 'fixed after the documented fix').toBe(true);
    } finally {
      disposeScope(`fix:${id}`);
    }
  });
});
