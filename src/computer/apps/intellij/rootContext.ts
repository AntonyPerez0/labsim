/** The IDE window's root element — menus, popups and balloons portal into it (it is `position: relative`). */
import { createContext, useContext } from 'react';
import { cssZoom } from '@/ui/kit/a11y';

export const IdeRootContext = createContext<HTMLElement | null>(null);

export function useIdeRoot(): HTMLElement | null {
  return useContext(IdeRootContext);
}

/**
 * Point relative to the IDE root for a mouse event or an element's corner, in the root's own CSS px
 * (the app content is scaled with the UI-scale setting via CSS `zoom`; client coordinates are visual).
 */
export function rootPoint(root: HTMLElement | null, clientX: number, clientY: number): { x: number; y: number } {
  const r = root?.getBoundingClientRect();
  const z = cssZoom(root);
  return { x: (clientX - (r?.left ?? 0)) / z, y: (clientY - (r?.top ?? 0)) / z };
}
