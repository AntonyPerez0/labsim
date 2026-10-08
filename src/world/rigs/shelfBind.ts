/**
 * Binder for the non-gantry hardware: rack-top distribution LEDs, AC strip switch lamps, the Rack B
 * camera Pi, Collis probe status LEDs (green / amber / off), Windows-box power LEDs, the spare
 * Callus slot, the KVM console, the tethered hubs / SmartStripe dongles / shelf Pis / webcams and
 * the ADB shelf. Missing sim objects read as healthy.
 */
import type { Engine } from '@/engine/types';
import type { LabState } from '@/sim/types';
import { AC_STRIPS, CALLUS_BOXES, findSimObject, type SimRef } from '../layout';
import type { RigKit } from './kit/context';
import type { LedHandle } from './kit/instances';
import type { PiHandles, StripHandles } from './parts';
import type { RackHandles } from './rack';
import { drawCallusConsole, type CallusHandles } from './callusShelf';
import type { TetheredHandles } from './tethered';
import type { AdbHandles } from './adbShelf';

interface HostLike {
  power: string;
  os: string;
  eth?: string;
  ethernet?: boolean;
  hostname?: string;
  ip?: string;
  services?: Record<string, { name: string; running: boolean; port: number | null; failure: string | null }>;
  diskUsedPct?: number;
}

/** Pi LED driver with its own ACT flicker state. */
export function piLedDriver(kit: RigKit, pi: PiHandles): (host: HostLike | undefined, fallbackOn: boolean, now: number) => void {
  let on = false;
  let next = 0;
  let k = 1;
  return (host, fallbackOn, now) => {
    const powered = host ? host.power !== 'off' : fallbackOn;
    const os = host?.os ?? (powered ? 'RUNNING' : 'OFF');
    kit.leds.set(pi.pwr, powered ? 1 : 0);
    let act = 0;
    if (powered && os === 'HUNG') act = 1;
    else if (powered && os !== 'OFF') {
      if (now >= next) {
        on = !on;
        const r = Math.abs(Math.sin(now * 0.0123 + k++ * 1.618)) % 1;
        next = now + (on ? 20 + r * 40 : 1000 / (2 + r * 10));
      }
      act = on ? 1 : 0;
    }
    kit.leds.set(pi.act, act);
    const eth = host ? (host.eth ? host.eth !== 'UNPLUGGED' : host.ethernet !== false) : true;
    kit.leds.set(pi.link, powered && eth ? (Math.sin(now / 41) > -0.3 ? 1 : 0.15) : 0);
    kit.leds.set(pi.speed, powered && eth ? 1 : 0);
  };
}

function stripLit(lab: LabState, ref: SimRef): boolean {
  const s = findSimObject<{ switchOn: boolean; breakerTripped?: boolean; outletId: string | null }>(lab, ref);
  if (!s) return true;
  if (!s.switchOn || s.breakerTripped) return false;
  const o = s.outletId ? findSimObject<{ live: boolean }>(lab, { collection: 'power.outlets', ids: [s.outletId] }) : undefined;
  return o ? o.live : true;
}

const host = (lab: LabState, ids: readonly string[]) => findSimObject<HostLike>(lab, { collection: 'hosts', ids });

export function bindShelves(kit: RigKit, engine: Engine, racks: RackHandles[], callus: CallusHandles, tethered: TetheredHandles, adb: AdbHandles): (lab: LabState, now: number) => void {
  void engine;
  const leds = kit.leds;
  const camPi = racks.find((r) => r.cameraPi)?.cameraPi;
  const camDrv = camPi ? piLedDriver(kit, camPi) : null;
  const tPi = piLedDriver(kit, tethered.pi);
  const aPi = piLedDriver(kit, adb.pi);
  const strips: { h: StripHandles; ref: SimRef }[] = [];
  for (const r of racks) strips.push({ h: r.strip, ref: AC_STRIPS.find((s) => s.host === r.rack.id)!.sim });
  for (const [id, h] of Object.entries(callus.strips)) strips.push({ h, ref: AC_STRIPS.find((s) => s.id === id)!.sim });
  strips.push({ h: tethered.strip, ref: AC_STRIPS.find((s) => s.id === 'power.strip.t')!.sim });
  strips.push({ h: adb.strip, ref: AC_STRIPS.find((s) => s.id === 'power.strip.d')!.sim });
  let consoleSig = '';
  let consoleAt = 0;
  return (lab, now) => {
    for (const r of racks) {
      const L = r.rack.letter.toLowerCase();
      const r5 = findSimObject<{ voltage: number }>(lab, { collection: 'power.rails', ids: [`rail-5v-${L}`] });
      const r24 = findSimObject<{ voltage: number }>(lab, { collection: 'power.rails', ids: ['rail-24v'] });
      leds.set(r.dist.led5v, r5 ? (r5.voltage > 4 ? 1 : 0) : 1);
      leds.set(r.dist.led24v, r24 ? (r24.voltage > 18 ? 1 : 0) : 1);
    }
    for (const s of strips) leds.set(s.h.switchLed, stripLit(lab, s.ref) ? 1 : 0);
    camDrv?.(host(lab, ['pi-cam-rackb', 'pi-rackb-cam']), true, now);
    // Collis probes
    for (const c of Object.values(callus.collis)) {
      const p = findSimObject<{ ledColor?: 'green' | 'amber' | 'off'; powered?: boolean; ribbonConnected?: boolean }>(lab, { collection: 'collis', ids: [c.simId] }, c.worldId);
      const color = p?.ledColor ?? (p ? (p.powered === false ? 'off' : p.ribbonConnected === false ? 'amber' : 'green') : 'green');
      if (color === 'off') leds.set(c.led, 0);
      else {
        leds.setColor(c.led, color === 'green' ? '#2bff6a' : '#ffa516', 7);
        leds.set(c.led, 1);
      }
    }
    // Windows boxes
    for (const bx of CALLUS_BOXES) {
      const h = callus.boxes[bx.id];
      if (!h) continue;
      const hs = host(lab, bx.sim.ids);
      if (h.group) h.group.visible = !!hs;
      if (h.led) leds.set(h.led, hs ? (hs.power !== 'off' ? 1 : 0) : bx.kind === 'slot' ? 0 : 1);
    }
    // KVM console (≤ 1 Hz)
    const mon = callus.monitor;
    const box = CALLUS_BOXES[mon.kvm % CALLUS_BOXES.length]!;
    const hs = host(lab, box.sim.ids);
    const sig = `${box.id}|${hs?.power}|${hs?.os}|${JSON.stringify(hs?.services ? Object.values(hs.services).map((s) => [s.name, s.running]) : null)}|${hs?.diskUsedPct}`;
    if (sig !== consoleSig || now - consoleAt > 5000) {
      consoleSig = sig;
      consoleAt = now;
      const lines: string[] = [];
      if (hs && hs.power === 'off') lines.push('', '            No signal');
      else {
        lines.push(`Microsoft Windows [Version 10.0.19044]`, `${hs?.hostname ?? box.label} · ${hs?.ip ?? '10.42.20.x'}`, '');
        lines.push(`C:\\Callus> sc query callus`);
        const svc = hs?.services ?? {};
        const names = Object.keys(svc).length ? Object.values(svc) : [{ name: 'callus', running: true, port: 9000, failure: null }];
        for (const s of names) lines.push(`  ${s.name.padEnd(16)} ${s.running ? 'RUNNING' : 'STOPPED'}${s.port ? `  :${s.port}` : ''}`);
        if (hs?.diskUsedPct !== undefined) lines.push('', `Disk C: ${Math.round(hs.diskUsedPct)}% used`);
        lines.push('', 'C:\\Callus> _');
      }
      drawCallusConsole(mon.ctx, box.label, lines);
      mon.tex.needsUpdate = true;
    }
    // tethered bench
    tPi(host(lab, ['pi-tethered']), true, now);
    for (const [dockId, led] of Object.entries(tethered.hubs)) {
      const rigId = dockId.split('.')[1]!;
      const role = dockId.endsWith('mfd') ? 'mfd' : 'cfd';
      const rig = lab.rigs?.[rigId];
      const dev = rig?.deviceIds.map((id) => lab.devices?.[id]).find((d) => d?.role === role) ?? rig?.deviceIds.map((id) => lab.devices?.[id])[role === 'mfd' ? 0 : 1];
      const linked = dev ? dev.hubEthernet !== false && dev.power !== 'off' : true;
      leds.set(led as LedHandle, linked ? (Math.sin(now / 53 + dockId.length) > -0.4 ? 1 : 0.2) : 0);
    }
    for (const [rigId, led] of Object.entries(tethered.dongles)) {
      const p = findSimObject<{ ribbonConnected?: boolean; powered?: boolean }>(lab, { collection: 'collis', ids: [`smartstripe-${rigId}`] });
      leds.set(led, p ? (p.ribbonConnected !== false ? 1 : 0) : 1);
    }
    const tRig = lab.rigs?.megatron;
    leds.set(tethered.webcam.led, tRig ? (tRig.webcam?.connected ? 1 : 0) : 1);
    // ADB shelf
    aPi(host(lab, ['pi-adb-shelf']), true, now);
    adb.switchLeds.forEach((l, i) => leds.set(l, Math.sin(now / (60 + i * 13)) > -0.5 ? 1 : 0.2));
    const dRig = lab.rigs?.data;
    leds.set(adb.webcam.led, dRig ? (dRig.webcam?.connected ? 1 : 0) : 1);
  };
}
