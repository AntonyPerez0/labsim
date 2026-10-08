/**
 * Drill sounds through the engine's WebAudio synth (`engine.audio.play`, `ui` bus). The engine module is
 * imported lazily on first use so drill logic and unit tests never pull three.js in. Never throws.
 */
import type { Engine, SoundId } from '@/engine/types';

let engineRef: Engine | null = null;
let loading: Promise<Engine | null> | null = null;
let unlocked = false;

function load(): Promise<Engine | null> {
  if (engineRef) return Promise.resolve(engineRef);
  if (!loading) {
    loading = import('@/engine')
      .then((m) => (engineRef = m.engine))
      .catch(() => null);
  }
  return loading;
}

export function sfx(id: SoundId, opts: { volume?: number; rate?: number } = {}): void {
  if (typeof window === 'undefined') return;
  const run = (e: Engine | null) => {
    try {
      if (!e?.audio) return;
      if (!unlocked) {
        e.audio.unlock();
        unlocked = true;
      }
      e.audio.play(id, { bus: 'ui', volume: opts.volume ?? 0.7, rate: opts.rate });
    } catch {
      /* audio unavailable (autoplay policy, tests) */
    }
  };
  if (engineRef) run(engineRef);
  else void load().then(run);
}

/** Correct-answer chime that climbs a semitone per streak step (GP §5.1 UI_COMBO_UP flavour). */
export function sfxCorrect(streak: number): void {
  sfx('ui-success', { volume: 0.6, rate: Math.pow(2, Math.min(12, streak) / 12) });
}

export function sfxWrong(): void {
  sfx('ui-fail', { volume: 0.55 });
}
