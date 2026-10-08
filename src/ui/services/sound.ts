/**
 * UI sounds through the engine's WebAudio synth (`ui` bus). Best-effort: never throws.
 */
import { store } from '@/core/store';
import { engine } from '@/engine';
import type { SoundId } from '@/engine/types';
import { setKitSoundHandler } from '@/ui/kit/sound';

let unlocked = false;

/**
 * Play an interface sound. `volume` (default 1) is scaled by Settings → Audio → Interface; `channel:
 * 'voice'` (mentor blips) is scaled by the Voice slider instead.
 */
export function uiSound(id: SoundId, volume = 1, channel: 'ui' | 'voice' = 'ui'): void {
  const st = store.getState().progress.settings;
  const level = channel === 'voice' ? st.voiceVolume : st.uiVolume;
  const v = volume * (Number.isFinite(level) ? level : 1);
  if (!(v > 0.001)) return;
  try {
    engine.audio.play(id, { bus: 'ui', volume: v });
  } catch {
    /* audio unavailable (tests, sandbox before a gesture) */
  }
}

/** Call from a user gesture (first click) — browsers block audio until then. */
export function unlockAudio(): void {
  if (unlocked) return;
  try {
    engine.audio.unlock();
    unlocked = true;
  } catch {
    /* ignore */
  }
}

/** Route kit control clicks to the engine synth. */
export function installKitSounds(): void {
  setKitSoundHandler((id) => uiSound(id, id === 'ui-hover' ? 0.35 : 0.7));
}
