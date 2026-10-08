/**
 * Registers every rig-side interactable of the catalogue (`interactablesFor('rigs')`, World §9.2)
 * with the engine: touch rigs (`interactTouch.ts`) and racks / shelves / bench / table
 * (`interactShelves.ts`). Returns an unregister function.
 */
import type { Engine } from '@/engine/types';
import { interactablesFor } from '../layout';
import type { RigKit } from './kit/context';
import type { RackHandles } from './rack';
import type { TouchRigView } from './touchRig';
import type { TouchRigBinder } from './rigView';
import type { ScreenManager } from './screens';
import type { CallusHandles } from './callusShelf';
import type { TetheredHandles } from './tethered';
import type { AdbHandles } from './adbShelf';
import type { BuildTableHandles } from './buildTable';
import { registerTouchRig } from './interactTouch';
import { registerShelves } from './interactShelves';
import { registered } from './interactCommon';

export interface InteractCtx {
  views: TouchRigView[];
  binders: TouchRigBinder[];
  racks: RackHandles[];
  callus: CallusHandles;
  tethered: TetheredHandles;
  adb: AdbHandles;
  table: BuildTableHandles | null;
  screens: ScreenManager;
}

export function registerRigInteractions(engine: Engine, kit: RigKit, c: InteractCtx): () => void {
  const offs: (() => void)[] = [];
  c.views.forEach((v, i) => registerTouchRig(engine, offs, v, c.binders[i]!, c.screens, kit.hits));
  registerShelves(engine, offs, kit.hits, c);
  kit.hits.updateMatrixWorld(true);
  return () => {
    for (const o of offs) o();
  };
}

/** Catalogue ids for the rigs builder that were not registered (should be only the parent `rack.*.rails`, the visual-only `solenoid-connector`, and anything noted). */
export function missingRigInteractables(): string[] {
  return interactablesFor('rigs').map((s) => s.id).filter((id) => !registered.has(id));
}
