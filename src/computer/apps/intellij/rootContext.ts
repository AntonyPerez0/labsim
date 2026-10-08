/** The IDE window's root element — menus, popups and balloons portal into it (it is `position: relative`). */
import { createContext, useContext } from 'react';

export const IdeRootContext = createContext<HTMLElement | null>(null);

export function useIdeRoot(): HTMLElement | null {
  return useContext(IdeRootContext);
}

/** Point relative to the IDE root for a mouse event or an element's corner. */
export function rootPoint(root: HTMLElement | null, clientX: number, clientY: number): { x: number; y: number } {
  const r = root?.getBoundingClientRect();
  return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
}
