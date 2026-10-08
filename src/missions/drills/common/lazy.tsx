/**
 * Drill component wrapper: each drill's React body (plus its CSS and any canvas renderers) is code-split
 * and loaded when the drill opens, then wrapped in the shared `DrillFrame`. Keeps `DRILLS` cheap to import
 * from the mission runtime and unit tests.
 */
import { createElement, lazy, Suspense, type ComponentType } from 'react';
import type { DrillComponentProps } from '../../types';

type ViewModule = { View: ComponentType<DrillComponentProps> };

export function lazyDrill(load: () => Promise<ViewModule>, accent?: string): (props: DrillComponentProps) => unknown {
  const Lazy = lazy(() =>
    Promise.all([import('./frame'), load()]).then(([frame, mod]) => ({
      default: (p: DrillComponentProps) => createElement(frame.DrillFrame, { accent, children: createElement(mod.View, p) }),
    })),
  );
  function DrillBody(props: DrillComponentProps) {
    return createElement(Suspense, { fallback: createElement('div', { className: 'dk-loading' }, 'Loading drill…') }, createElement(Lazy, props));
  }
  return DrillBody;
}
