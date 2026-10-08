/**
 * Lab ambience (World §8.2/§8.3): 2D room tone, the t01 fluorescent buzz (dips with the flicker),
 * the GPU blade fans (spin up while an Ollama request runs, off when the blade is down) and the
 * Mean Well fan at the power wall. Loops start once and follow sim state at ~30 Hz.
 */
import { store } from '@/core/store';
import type { LoopHandle } from '@/engine/types';
import { getProp, TROFFERS } from '../layout';
import type { LabCtx } from './kit/context';
import type { LightRig } from './lights';
import { throttle } from './kit/bind';

export function buildAudio(ctx: LabCtx, lights?: LightRig | null): void {
  const { audio } = ctx.engine;
  const loops: LoopHandle[] = [];
  const safeLoop = (...a: Parameters<typeof audio.loop>): LoopHandle | null => {
    try {
      const h = audio.loop(...a);
      loops.push(h);
      return h;
    } catch (err) {
      console.warn('[world-lab] audio loop failed', err);
      return null;
    }
  };
  const room = safeLoop('room-tone', { bus: 'ambience', volume: 0.6 });
  const t01 = TROFFERS.find((t) => t.id === 'light.t01');
  const fluo = t01 ? safeLoop('fluorescent', { position: [t01.x, 2.98, t01.z], bus: 'ambience', volume: 0.5 }) : null;
  const blade = getProp('server.blade');
  const gpu = safeLoop('gpu-fans', { position: [blade.pos[0], blade.pos[1], blade.pos[2]], bus: 'ambience', volume: 0.55 });
  const mw = safeLoop('fan', { position: [-1.75, 1.85, -4.94], bus: 'ambience', volume: 0.25, rate: 1.3 });
  ctx.disposers.push(() => loops.forEach((l) => l.stop()));

  const tick = throttle(30);
  let spin = 1;
  void room;
  ctx.hooks.push((dt, t, lab) => {
    if (!tick(t)) return;
    if (fluo && lights) fluo.setVolume(lights.roomLightsOn() ? 0.5 * (0.3 + 0.7 * lights.flickerLevel()) : 0);
    // GPU blade: down → silent; Ollama running → ×1.25 pitch / ×1.6 gain over 3 s (back over 6 s)
    const host = lab?.hosts?.['gpu-blade'];
    const up = !host || host.power !== 'off';
    const busy = (lab?.ollama?.requests ?? []).some((r) => r.state === 'running');
    const target = busy ? 1.25 : 1;
    spin += (target - spin) * Math.min(1, dt * 10 * (busy ? 1 / 3 : 1 / 6));
    if (gpu) {
      gpu.setRate(spin);
      gpu.setVolume(up ? 0.55 * (1 + (spin - 1) * 2.4) : 0);
    }
    // Mean Well fan: +30 % when the DC load is high; silent when the PSU is off
    const psu = lab?.power?.psus?.['MW-1'];
    const on = !psu || (psu.on && (psu.outletId ? lab.power.outlets?.[psu.outletId]?.live ?? true : true));
    const amps = lab?.power?.rails?.['rail-24v']?.currentA ?? 8;
    if (mw) mw.setVolume(on ? 0.25 * (amps > 15 ? 1.3 : 1) : 0);
    void store;
  });
}
