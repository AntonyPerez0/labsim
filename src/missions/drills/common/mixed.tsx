/**
 * Mixed-round body (Weak Spot warm-up, `runtime/drills/host.ts` `mixedDrillDef`): items come from several
 * drill banks plus curriculum quiz items, so each item is rendered by the drill that owns it — `DR01-07`
 * → DR01's view, `q:Q123` → the Speed Quiz view. Hand this to the mixed DrillDef as its `component`.
 */
import { createElement } from 'react';
import { useGame } from '@/core/store';
import type { DrillComponentProps, DrillDef } from '../../types';

/** Owning drill id of an item id (`DR13-04`, `DR11:jenkins:…` → DR13 / DR11; `q:Q123` → DR10). */
export function ownerOf(itemId: string): string | null {
  if (itemId.startsWith('q:')) return 'DR10';
  const m = /^(DR\d\d)[-:]/.exec(itemId);
  return m ? m[1]! : null;
}

export function makeMixedComponent(byId: () => Readonly<Record<string, DrillDef>>): (props: DrillComponentProps) => unknown {
  function MixedDrill(props: DrillComponentProps) {
    const itemId = useGame((s) => s.session.drill?.currentItemId ?? null);
    const owner = itemId ? ownerOf(itemId) : null;
    const comp = owner ? (byId()[owner]?.component as ((p: DrillComponentProps) => unknown) | undefined) : undefined;
    if (!comp) return createElement('div', { className: 'dk-waiting' }, itemId ? 'This item has no board yet.' : 'Next item on its way…');
    return createElement(comp as (p: DrillComponentProps) => React.ReactElement, { ...props, key: owner ?? 'none' });
  }
  return MixedDrill;
}
