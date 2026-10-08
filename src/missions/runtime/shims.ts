/**
 * Event shims for sim reads the player performs in the world but which the sim does not report as
 * events yet. Today: `sim.power.measure` (the multimeter, World §9.4) returns a reading but emits no
 * `power.measured` (Sim events.ts declares it). Lesson M03.08 and GW21 ("Ω mode on a powered
 * circuit") listen for that event, so the runtime wraps `measure` and emits it for player probes.
 *
 * The shim is self-retiring: if the wrapped call already emitted `power.measured` (the sim started
 * doing it), nothing extra is emitted. Runtime-driven calls (`asRuntime`) and nested calls are not
 * reported.
 */
import { bus } from '@/core/bus';
import { emit } from '@/core/store';
import { sim } from '@/sim';
import type { MultimeterReading } from '@/sim/api';
import { RT } from './rt';

let installed = false;

export function installSimEventShims(): void {
  if (installed) return;
  installed = true;
  const power = sim.power as { measure?: (pointId: string, mode?: 'V' | 'OHM') => MultimeterReading };
  const orig = power?.measure;
  if (typeof orig !== 'function') return;
  let depth = 0;
  const wrapped = (pointId: string, mode: 'V' | 'OHM' = 'V'): MultimeterReading => {
    if (depth > 0 || RT.gwSuppress > 0) return orig.call(sim.power, pointId, mode);
    depth++;
    let seen = false;
    const off = bus.on('power.measured', () => {
      seen = true;
    });
    let r: MultimeterReading;
    try {
      r = orig.call(sim.power, pointId, mode);
    } finally {
      off();
      depth--;
    }
    if (!seen && r) emit('power.measured', { pointId, mode: r.mode ?? mode, display: r.display, live: !!r.live });
    return r;
  };
  try {
    power.measure = wrapped;
  } catch {
    /* frozen API object: nothing to do */
  }
}
