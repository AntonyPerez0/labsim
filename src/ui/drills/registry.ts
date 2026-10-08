/**
 * UI drill registry (the alternative to `DrillDef.component`, see `src/missions/contract/arcade.ts`):
 * drill UIs register a React component by drill id; the drill host renders `def.component` first, then
 * the registered component, then the generic quiz-item fallback.
 *
 *   registerDrillComponent('DR01', StatusTriage);
 */
import type { ComponentType } from 'react';
import type { DrillComponentProps } from '@/missions';

const registry = new Map<string, ComponentType<DrillComponentProps>>();

export function registerDrillComponent(drillId: string, component: ComponentType<DrillComponentProps>): void {
  registry.set(drillId, component);
}

export function getDrillComponent(drillId: string): ComponentType<DrillComponentProps> | null {
  return registry.get(drillId) ?? null;
}
