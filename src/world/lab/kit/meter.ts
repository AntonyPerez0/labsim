/**
 * Multimeter probing (World §9.4): `sim.power.measure(pointId, mode)` with the world-doc spelling
 * as a fallback id, the reading shown as a toast (the HUD's meter LCD reads the same event), and
 * the probe sound.
 */
import { store } from '@/core/store';
import { sim } from '@/sim';
import type { MultimeterReading } from '@/sim/api';
import type { Engine, Vec3 } from '@/engine/types';
import { toast } from './runtime';

export function meterMode(): 'V' | 'OHM' {
  const m = store.getState().session.toolModes.multimeter;
  return m === 'OHM' || m === 'CONTINUITY' ? 'OHM' : 'V';
}

function read(pointId: string, mode: 'V' | 'OHM'): MultimeterReading | null {
  try {
    return sim.power.measure(pointId, mode);
  } catch {
    return null;
  }
}

/** Probe a point and show the LCD text. Returns the reading (null when the sim cannot answer). */
export function probe(engine: Engine, where: Vec3, label: string, pointId: string, altPointId?: string): MultimeterReading | null {
  const mode = meterMode();
  let r = read(pointId, mode);
  const useless = (x: MultimeterReading | null) => !x || x.display === 'ERR' || x.display === '---' || x.display === '';
  if (useless(r) && altPointId && altPointId !== pointId) {
    const alt = read(altPointId, mode);
    if (!useless(alt)) r = alt;
  }
  engine.audio.play('plug-in', { position: where, volume: 0.25, rate: 1.8 });
  const display = r?.display ?? '---';
  toast('info', `Multimeter · ${label}`, `${display}${mode === 'OHM' ? '  (Ω mode)' : ''}`);
  return r;
}
