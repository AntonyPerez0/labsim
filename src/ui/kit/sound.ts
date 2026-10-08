/**
 * Kit sound hook. The kit stays engine-free: the app registers a handler at boot
 * (`setKitSoundHandler((id) => engine.audio.play(id))`); kit controls call `kitSound('ui-click')`.
 */
export type KitSound = 'ui-click' | 'ui-hover' | 'ui-success' | 'ui-fail' | 'ui-xp' | 'ui-achievement' | 'ui-ticket' | 'ui-type';

let handler: ((id: KitSound) => void) | null = null;

export function setKitSoundHandler(fn: ((id: KitSound) => void) | null): void {
  handler = fn;
}

export function kitSound(id: KitSound): void {
  try {
    handler?.(id);
  } catch {
    /* audio is best-effort */
  }
}
