/** Fault catalogue §4.3.1 — hosts and services (core). */
import type { Host, LabState } from '../../types';
import type { CoreFaultDef, Params, Record_ } from './helpers';
import { info, nothing, ok, p, PHYSICAL_RIG_PIS, str, w } from './helpers';
import { crashLines, CRASH_CAUSE, NO_VIDEO0, stoppedLine, WINE_BROKEN } from '../../text/hosts';
import { DEBUG_LOG, hostPowerButton, hostService, startBoot } from '../hosts';
import { clone } from '../util';

const host = (lab: LabState, params: Params, key = 'host'): Host | undefined => lab.hosts[str(params[key])];
const invalid = (id: string, name: string, v: string, reason: string) => ({ ok: false as const, error: `fault ${id}: invalid param ${name}='${v}' (${reason})` });

function journalAppend(lab: LabState, record: Record_, h: Host, service: string, lines: string[]): void {
  const cur = [...(h.journal[service] ?? []), ...lines].slice(-50);
  w(lab, record, ['hosts', h.id, 'journal', service], cur);
}

function crash(lab: LabState, record: Record_, h: Host, service: string, cause: string): void {
  w(lab, record, ['hosts', h.id, 'services', service, 'running'], false);
  w(lab, record, ['hosts', h.id, 'services', service, 'failure'], 'exit-code');
  w(lab, record, ['hosts', h.id, 'services', service, 'startedPhysMs'], null);
  journalAppend(lab, record, h, service, crashLines(lab, h, service, cause));
}

/** Physical Pi load (host id) or the off-screen host's own supply. */
function unplugPi(lab: LabState, record: Record_, h: Host): void {
  const load = lab.power.loads[h.id];
  if (load && load.hostId === h.id) {
    const tid = load.supply.kind === 'dc-rail' ? load.supply.targetId : null;
    if (tid && lab.power.terminals[tid]?.plugged === load.id) w(lab, record, ['power', 'terminals', tid, 'plugged'], null);
    w(lab, record, ['power', 'loads', load.id, 'supply'], { kind: 'none', targetId: null });
  }
  w(lab, record, ['hosts', h.id, 'supply'], { kind: 'none', targetId: null });
}

function piSupplied(lab: LabState, h: Host): boolean {
  const load = lab.power.loads[h.id];
  return load && load.hostId === h.id ? load.supply.kind !== 'none' : h.supply.kind !== 'none';
}

const piCheck = (id: string, lab: LabState, params: Params) => {
  const h = host(lab, params);
  if (!h || h.kind !== 'pi') return invalid(id, 'host', str(params.host), 'no such pi');
  return null;
};

const serviceDown = (id: string, title: string, fixedService: string | null, extra: { tags: string[]; usedBy: string[]; symptoms: string[]; defaultHost?: string }): CoreFaultDef => ({
  info: info(id, title, 'hosts', fixedService ? [p('host', 'host', 'Camera-serving Pi (any Pi running camera-stream)', { required: !extra.defaultHost, target: true, default: extra.defaultHost })] : [p('host', 'host', 'Any Robot Pi (pi-*)', { required: true, target: true }), p('service', 'string', 'Service that crashes', { default: 'robot-controller', values: ['robot-controller', 'camera-stream', 'adb-service', 'cardprog'] })], {
    tags: extra.tags,
    clears: `services[${fixedService ?? 'service'}].running`,
    symptoms: extra.symptoms,
    usedBy: extra.usedBy,
  }),
  validate(lab, params) {
    const bad = piCheck(id, lab, params);
    if (bad) return bad;
    const h = host(lab, params)!;
    const svc = fixedService ?? str(params.service);
    const s = h.services[svc];
    if (!s) return invalid(id, fixedService ? 'host' : 'service', fixedService ? h.id : svc, `no such service on ${h.id}`);
    if (!s.running) return nothing(id, `${svc} is not running on ${h.id}`);
    return ok(h.id);
  },
  apply(lab, ctx, params, record) {
    const h = host(lab, params)!;
    const svc = fixedService ?? str(params.service);
    crash(lab, record, h, svc, CRASH_CAUSE[svc] ?? `${svc}: fatal error`);
    ctx.emit('host.serviceChanged', { hostId: h.id, service: svc, running: false, failure: 'exit-code' });
  },
  isResolved(lab, f) {
    const h = lab.hosts[f.target];
    return !!h?.services[fixedService ?? str(f.params.service)]?.running;
  },
  revert(lab, ctx, f) {
    const h = lab.hosts[f.target];
    if (h?.os === 'RUNNING') hostService(lab, ctx, h.id, fixedService ?? str(f.params.service), 'restart', 'faults');
  },
});

const VM_UNITS: Record<string, string> = { mysql: 'orca-vm', orca: 'orca-vm', jenkins: 'jenkins-vm', ollama: 'ollama-vm' };

function vmDown(id: string, title: string, fixed: { host: string; service: string } | null, meta: { tags: string[]; usedBy: string[]; symptoms: string[]; clears: string }): CoreFaultDef {
  const hs = (params: Params) => (fixed ? fixed : { host: str(params.host), service: str(params.service) });
  return {
    info: info(id, title, 'hosts', fixed ? [] : [p('host', 'host', 'orca-vm, jenkins-vm or ollama-vm', { required: true, target: true, values: ['orca-vm', 'jenkins-vm', 'ollama-vm'] }), p('service', 'string', 'Service to stop', { required: true, values: ['mysql', 'orca', 'jenkins', 'ollama'] })], { ...meta }),
    validate(lab, params) {
      const { host: hid, service } = hs(params);
      const h = lab.hosts[hid];
      if (!h || h.kind !== 'vm') return invalid(id, 'host', hid, 'no such host');
      if (VM_UNITS[service] !== hid || !h.services[service]) return invalid(id, 'service', service, `not a service of ${hid}`);
      if (!h.services[service]!.running) return nothing(id, `${service} is already stopped on ${hid}`);
      return ok(fixed ? 'lab' : hid);
    },
    apply(lab, ctx, params, record) {
      const { host: hid, service } = hs(params);
      const h = lab.hosts[hid]!;
      w(lab, record, ['hosts', hid, 'services', service, 'running'], false);
      w(lab, record, ['hosts', hid, 'services', service, 'failure'], null);
      w(lab, record, ['hosts', hid, 'services', service, 'startedPhysMs'], null);
      journalAppend(lab, record, h, service, [stoppedLine(lab, h, service)]);
      ctx.emit('host.serviceChanged', { hostId: hid, service, running: false, failure: null });
    },
    isResolved(lab, f) {
      const { host: hid, service } = hs(f.params);
      const up = !!lab.hosts[hid]?.services[service]?.running;
      return service === 'mysql' ? up && lab.orca.app.dbConnected : up;
    },
    revert(lab, ctx, f) {
      const { host: hid, service } = hs(f.params);
      if (lab.hosts[hid]?.os === 'RUNNING') hostService(lab, ctx, hid, service, 'start', 'faults');
    },
  };
}

export const HOST_FAULTS: CoreFaultDef[] = [
  {
    info: info('pi.hung', 'Pi board hung', 'hosts', [p('host', 'host', 'Any Robot Pi (pi-*)', { required: true, target: true })], {
      tags: ['hw.pi', 'orca.status.connfailed', 'orca.healthcheck'],
      clears: "os == 'RUNNING' (only a power interruption ends a hang)",
      symptoms: ['PWR solid, ACT solid on, Ethernet lit', 'ping/ssh time out', 'Notes → connect timed out after 10000 ms for every rig the Pi serves', 'tablet grey Status: CONTROLLER UNREACHABLE', 'camera stream unavailable'],
      usedBy: ['INC01', 'INC01-C', 'INC05', 'INC06', 'FP'],
    }),
    randomPools: { host: PHYSICAL_RIG_PIS },
    validate(lab, params) {
      const bad = piCheck('pi.hung', lab, params);
      if (bad) return bad;
      const h = host(lab, params)!;
      if (h.os !== 'RUNNING') return nothing('pi.hung', `${h.id} is not running`);
      return ok(h.id);
    },
    apply(lab, ctx, params, record) {
      const h = host(lab, params)!;
      w(lab, record, ['hosts', h.id, 'os'], 'HUNG');
      w(lab, record, ['hosts', h.id, 'power'], 'crashed');
      ctx.emit('host.osChanged', { hostId: h.id, from: 'RUNNING', to: 'HUNG' });
      ctx.emit('host.crashed', { hostId: h.id, reason: 'hung' });
    },
    isResolved: (lab, f) => lab.hosts[f.target]?.os === 'RUNNING',
    revert(lab, ctx, f) {
      const h = lab.hosts[f.target];
      if (h && h.os === 'HUNG') startBoot(lab, ctx, h);
    },
  },
  {
    info: info('pi.off', 'Pi power lead unplugged', 'hosts', [p('host', 'host', 'Any Robot Pi; @random = the Pis of the 12 physical rigs', { required: true, target: true })], {
      tags: ['hw.pi', 'orca.status.connfailed'],
      clears: "os == 'RUNNING'",
      symptoms: ["os = 'OFF', all LEDs dark", 'Notes → connect timed out after 10000 ms', 'tablet grey (on battery)', 'camera dark'],
      usedBy: ['P2-1', 'INC06', 'INC07'],
    }),
    randomPools: { host: PHYSICAL_RIG_PIS },
    validate(lab, params) {
      const bad = piCheck('pi.off', lab, params);
      if (bad) return bad;
      const h = host(lab, params)!;
      if (!piSupplied(lab, h)) return nothing('pi.off', `${h.id} lead is already unplugged`);
      return ok(h.id);
    },
    apply(lab, ctx, params, record) {
      const h = host(lab, params)!;
      unplugPi(lab, record, h);
      if (lab.power.loads[h.id]) ctx.emit('power.unplugged', { loadId: h.id });
    },
    isResolved: (lab, f) => lab.hosts[f.target]?.os === 'RUNNING',
  },
  serviceDown('pi.serviceDown', 'Pi service crashed', null, {
    tags: ['hw.pi', 'tools.terminal', 'orca.status.connfailed'],
    usedBy: ['INC01-B', 'FP'],
    symptoms: ['robot-controller: Notes → Connection refused, tablet grey, systemctl status → Active: failed (Result: exit-code)', 'camera-stream: Stream unavailable', 'adb-service: ADB_TOUCH 502', 'cardprog: 503 CARDPROG_UNAVAILABLE'],
  }),
  serviceDown('camera.sharedHostDown', 'Shared camera service down', 'camera-stream', {
    tags: ['orca.urls', 'vision.camera', 'hw.pi'],
    usedBy: ['INC08'],
    defaultHost: 'pi-cam-rackb',
    symptoms: ['Stream unavailable — http://10.42.10.40:8081/stream.mjpg', '[vision] GET … → Connection refused → Finished: FAILURE', 'rigs stay Available'],
  }),
  {
    info: info('camera.usbUnplugged', 'Webcam USB lead pulled', 'hosts', [p('host', 'host', 'pi-cam-rackb or a rig Pi with its own webcam', { required: true, target: true })], {
      tags: ['vision.camera', 'hw.pi'],
      clears: "'webcam' ∈ usb && services['camera-stream'].running",
      symptoms: ["journalctl -u camera-stream -n 3 → Cannot open '/dev/video0': No such file or directory", 'Stream unavailable'],
      usedBy: ['INC08-B', 'FP'],
    }),
    validate(lab, params) {
      const bad = piCheck('camera.usbUnplugged', lab, params);
      if (bad) return bad;
      const h = host(lab, params)!;
      if (!h.usb.includes('webcam') || !h.services['camera-stream']) return nothing('camera.usbUnplugged', `${h.id} has no webcam attached`);
      return ok(h.id);
    },
    apply(lab, ctx, params, record) {
      const h = host(lab, params)!;
      w(lab, record, ['hosts', h.id, 'usb'], h.usb.filter((u) => u !== 'webcam'));
      for (const r of Object.values(lab.rigs)) if (r.piHostId === h.id && r.webcam.cameraId === `cam-${r.id}`) w(lab, record, ['rigs', r.id, 'webcam', 'connected'], false);
      crash(lab, record, h, 'camera-stream', NO_VIDEO0);
      ctx.emit('host.usbChanged', { hostId: h.id, usbId: 'webcam', attached: false });
    },
    isResolved: (lab, f) => !!lab.hosts[f.target]?.usb.includes('webcam') && !!lab.hosts[f.target]?.services['camera-stream']?.running,
    revert(lab, ctx, f) {
      const h = lab.hosts[f.target];
      if (!h) return;
      if (!h.usb.includes('webcam')) h.usb = [...h.usb, 'webcam'];
      if (h.os === 'RUNNING') hostService(lab, ctx, h.id, 'camera-stream', 'restart', 'faults');
    },
  },
  {
    info: info('pi.diskFull', 'Pi SD card full', 'hosts', [p('host', 'host', 'Any Robot Pi', { required: true, target: true })], {
      tags: ['hw.pi', 'tools.terminal'],
      clears: 'diskUsedGb ≤ diskTotalGb − 0.5',
      symptoms: ['/health → 500 Internal Server Error {"error":"robot-controller: No space left on device"}', 'df -h / → 29G 29G 0 100% /'],
      usedBy: ['FP'],
    }),
    validate(lab, params) {
      const bad = piCheck('pi.diskFull', lab, params);
      if (bad) return bad;
      const h = host(lab, params)!;
      if (h.diskUsedGb >= h.diskTotalGb - 0.5) return nothing('pi.diskFull', `${h.id} disk is already full`);
      return ok(h.id);
    },
    apply(lab, _ctx, params, record) {
      const h = host(lab, params)!;
      w(lab, record, ['hosts', h.id, 'diskUsedGb'], h.diskTotalGb);
      w(lab, record, ['hosts', h.id, 'diskUsedPct'], 100);
      w(lab, record, ['hosts', h.id, 'files', DEBUG_LOG], '<size:22.9G>');
    },
    isResolved: (lab, f) => {
      const h = lab.hosts[f.target];
      return !!h && h.diskUsedGb <= h.diskTotalGb - 0.5;
    },
  },
  {
    info: info('pi.wineBroken', 'Wine prefix broken', 'hosts', [p('host', 'host', 'Rig Pi running cardprog', { required: true, target: true })], {
      tags: ['cards.wine', 'hw.pi', 'tools.terminal'],
      clears: "Wine prefix marker 'ok' && services.cardprog.running",
      symptoms: ['[pi] cardprog: program VISA_STD_DIP → 503 CARDPROG_UNAVAILABLE', 'journalctl -u cardprog -n 3 → wine: could not load kernel32.dll, status c0000135'],
      usedBy: ['INC56'],
    }),
    validate(lab, params) {
      const bad = piCheck('pi.wineBroken', lab, params);
      if (bad) return bad;
      const h = host(lab, params)!;
      if (!h.services.cardprog) return invalid('pi.wineBroken', 'host', h.id, 'no cardprog on this Pi');
      if (h.files['/home/pi/.wine-cardprog/'] !== 'ok') return nothing('pi.wineBroken', `${h.id} Wine prefix is already broken`);
      return ok(h.id);
    },
    apply(lab, ctx, params, record) {
      const h = host(lab, params)!;
      w(lab, record, ['hosts', h.id, 'files', '/home/pi/.wine-cardprog/'], 'corrupt');
      crash(lab, record, h, 'cardprog', WINE_BROKEN);
      ctx.emit('host.serviceChanged', { hostId: h.id, service: 'cardprog', running: false, failure: 'exit-code' });
    },
    isResolved: (lab, f) => lab.hosts[f.target]?.files['/home/pi/.wine-cardprog/'] === 'ok' && !!lab.hosts[f.target]?.services.cardprog?.running,
    revert(lab, ctx, f) {
      const h = lab.hosts[f.target];
      if (!h) return;
      if (h.files['/home/pi/.wine-cardprog/'] === 'corrupt') h.files['/home/pi/.wine-cardprog/'] = 'ok';
      if (h.os === 'RUNNING') hostService(lab, ctx, h.id, 'cardprog', 'restart', 'faults');
    },
  },
  ...(['unplugged', 'damaged'] as const).map(
    (kind): CoreFaultDef => ({
      info: info(`eth.${kind}`, kind === 'unplugged' ? 'Ethernet cable unplugged' : 'Damaged Ethernet cable', 'hosts', [p('host', 'host', 'Any host with an Ethernet jack', { required: true, target: true })], {
        tags: kind === 'unplugged' ? ['orca.status.connfailed', 'hw.pi', 'orca.notes'] : ['orca.status.connfailed', 'hw.pi'],
        clears: "eth == 'LINKED'",
        symptoms: kind === 'unplugged' ? ['timeouts → Notes connect timed out after 10000 ms', 'jack LEDs off', 'tablet stays green', 'ping 100 % loss'] : ['every other connection attempt times out', 'Notes alternate failure / recovery', 'link LED flickers'],
        usedBy: kind === 'unplugged' ? ['INC04', 'INC03-C', 'FP'] : ['INC04-B'],
      }),
      validate(lab, params) {
        const h = host(lab, params);
        if (!h || h.kind === 'switch' || h.kind === 'vm') return invalid(`eth.${kind}`, 'host', str(params.host), 'no such host');
        if (h.eth !== 'LINKED') return nothing(`eth.${kind}`, `${h.id} cable is already ${h.eth.toLowerCase()}`);
        return ok(h.id);
      },
      apply(lab, ctx, params, record) {
        const h = host(lab, params)!;
        w(lab, record, ['hosts', h.id, 'eth'], kind === 'unplugged' ? 'UNPLUGGED' : 'DAMAGED');
        w(lab, record, ['hosts', h.id, 'ethernet'], kind !== 'unplugged');
        ctx.emit('host.ethernetChanged', { hostId: h.id, connected: kind !== 'unplugged', eth: kind === 'unplugged' ? 'UNPLUGGED' : 'DAMAGED' });
      },
      isResolved: (lab, f) => lab.hosts[f.target]?.eth === 'LINKED',
    }),
  ),
  {
    info: info('callus.down', 'Callus box offline / Callus stopped', 'hosts', [p('host', 'host', 'Windows box running Callus', { target: true, default: 'minix-01' }), p('mode', 'string', 'box-off (a Windows update shut it down) or service-stopped', { default: 'box-off', values: ['box-off', 'service-stopped'] })], {
      tags: ['orca.status.connfailed', 'cards.callus', 'hw.nuc', 'orca.notes'],
      clears: "os == 'RUNNING' && services.callus.running",
      symptoms: ['/health 502 Bad Gateway {"error":"callus upstream 10.42.20.1:9000 unreachable"} for every rig on the box', '[callus] 10.42.20.1:9000 unreachable', 'service-stopped: sc query Callus → STATE : 1  STOPPED, status screen Callus service · STOPPED'],
      usedBy: ['INC02', 'M18', 'FP'],
    }),
    validate(lab, params) {
      const h = host(lab, params);
      if (!h || (h.kind !== 'minix' && h.kind !== 'nuc') || !h.services.callus?.enabled) return invalid('callus.down', 'host', str(params.host), 'no such Callus box');
      if (h.os !== 'RUNNING' || !h.services.callus.running) return nothing('callus.down', `${h.id} Callus is not running`);
      return ok(h.id);
    },
    apply(lab, ctx, params, record) {
      const h = host(lab, params)!;
      if (str(params.mode) === 'service-stopped') {
        w(lab, record, ['hosts', h.id, 'services', 'callus', 'running'], false);
        w(lab, record, ['hosts', h.id, 'services', 'callus', 'failure'], null);
        w(lab, record, ['hosts', h.id, 'services', 'callus', 'startedPhysMs'], null);
        ctx.emit('host.serviceChanged', { hostId: h.id, service: 'callus', running: false, failure: null });
        return;
      }
      w(lab, record, ['hosts', h.id, 'os'], 'OFF');
      w(lab, record, ['hosts', h.id, 'power'], 'off');
      w(lab, record, ['hosts', h.id, 'bootStartedPhysMs'], null);
      for (const s of Object.keys(h.services).sort()) {
        if (h.services[s]!.running) w(lab, record, ['hosts', h.id, 'services', s, 'running'], false);
      }
      ctx.emit('host.osChanged', { hostId: h.id, from: 'RUNNING', to: 'OFF' });
      ctx.emit('host.powerChanged', { hostId: h.id, from: 'on', to: 'off' });
    },
    isResolved: (lab, f) => lab.hosts[f.target]?.os === 'RUNNING' && !!lab.hosts[f.target]?.services.callus?.running,
    revert(lab, ctx, f) {
      const h = lab.hosts[f.target];
      if (!h) return;
      if (h.os === 'OFF') hostPowerButton(lab, ctx, h.id, false);
      else if (h.os === 'RUNNING' && !h.services.callus?.running) hostService(lab, ctx, h.id, 'callus', 'start', 'faults');
    },
  },
  {
    info: info('nuc.diskFull', 'Windows box disk full (corporate agent)', 'hosts', [p('host', 'host', 'nuc-03 or any Windows box', { target: true, default: 'nuc-03' })], {
      tags: ['hw.nuc'],
      clears: 'API only (the agent refills the disk; deleting its logs is GW11)',
      symptoms: ['writing services answer 500 {"error":"No space left on device"}', 'Get-PSDrive C → C 237.9 0.0'],
      usedBy: ['INC19', 'FP'],
      apiOnly: true,
    }),
    validate(lab, params) {
      const h = host(lab, params);
      if (!h || (h.kind !== 'minix' && h.kind !== 'nuc')) return invalid('nuc.diskFull', 'host', str(params.host), 'no such Windows box');
      return ok(h.id);
    },
    apply(lab, _ctx, params, record) {
      const h = host(lab, params)!;
      if (h.diskUsedGb < h.diskTotalGb) {
        w(lab, record, ['hosts', h.id, 'diskUsedGb'], h.diskTotalGb);
        w(lab, record, ['hosts', h.id, 'diskUsedPct'], 100);
      }
      if (h.files['C:\\ProgramData\\SecAgent\\agent.cfg'] !== 'log.rotation=off') w(lab, record, ['hosts', h.id, 'files', 'C:\\ProgramData\\SecAgent\\agent.cfg'], 'log.rotation=off');
    },
    isResolved: () => false,
  },
  vmDown('vm.serviceDown', 'VM service stopped', null, { tags: ['arch.infra', 'tools.terminal'], usedBy: ['FP'], symptoms: ['systemctl status <service> → Active: inactive (dead)', 'curl: (7) Failed to connect … Connection refused'], clears: 'services[service].running (mysql: && orca.app.dbConnected)' }),
  vmDown('orca.mysqlDown', "Orca's MySQL down", { host: 'orca-vm', service: 'mysql' }, { tags: ['arch.stack', 'arch.infra', 'tools.terminal', 'arch.flow'], usedBy: ['INC60'], symptoms: ['Orca error page 500 Internal Server Error — Could not open JPA EntityManager…', '[orca] checkout request … → 500', 'health check aborted', '/management/health 503'], clears: 'services.mysql.running && orca.app.dbConnected' }),
  vmDown('orca.appDown', 'Orca application stopped', { host: 'orca-vm', service: 'orca' }, { tags: ['arch.stack', 'arch.infra'], usedBy: ['FP'], symptoms: ['UI connection refused', 'checkouts → Connection refused', 'no health checks'], clears: 'services.orca.running' }),
  vmDown('jenkins.down', 'Jenkins stopped', { host: 'jenkins-vm', service: 'jenkins' }, { tags: ['arch.infra'], usedBy: ['FP'], symptoms: ['Jenkins unreachable', 'queue frozen'], clears: 'services.jenkins.running' }),
  vmDown('ollama.down', 'Ollama stopped', { host: 'ollama-vm', service: 'ollama' }, { tags: ['vision.ollama', 'arch.infra', 'tools.terminal'], usedBy: ['INC10'], symptoms: ['Model server unreachable', 'curl: (7) Failed to connect to 10.42.1.12 port 11434: Connection refused', 'OLLAMA_DOWN'], clears: 'services.ollama.running' }),
  {
    info: info('net.switchDown', 'Lab core switch down', 'hosts', [], {
      tags: ['arch.infra'],
      clears: "API only (the switch is IT's)",
      symptoms: ['every network request times out', 'all rigs Connection Failed at the next check', 'tablets green (USB)'],
      usedBy: ['FP'],
      apiOnly: true,
    }),
    validate(lab) {
      if (!lab.network.switchUp) return nothing('net.switchDown', 'the switch is already down');
      return ok('lab');
    },
    apply(lab, _ctx, _params, record) {
      w(lab, record, ['network', 'switchUp'], false);
    },
    isResolved: () => false,
  },
];

export { clone };
