/**
 * TEST/SANDBOX ONLY — helpers for the computer's jsdom unit tests: mount a component, capture
 * `app.action` / `app.navigated` events, host a routed app with local history.
 */
import { act, useState, type ComponentType, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { bus } from '@/core/bus';
import type { AppProps } from '../../apps';
import { wmApi } from '../wmStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

export interface Mounted {
  container: HTMLDivElement;
  root: Root;
  unmount(): void;
}

export async function mount(el: ReactElement): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(el);
  });
  return {
    container,
    root,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export function captureActions(): { list: { app: string; action: string; data: Record<string, unknown> }[]; stop(): void; of(name: string): Record<string, unknown>[] } {
  const list: { app: string; action: string; data: Record<string, unknown> }[] = [];
  const off = bus.on('app.action', (e) => list.push({ app: e.app, action: e.action, data: (e.data ?? {}) as Record<string, unknown> }));
  return { list, stop: off, of: (name) => list.filter((x) => x.action === name).map((x) => x.data) };
}

/** Host an app component with local route history (like a window). `routes` records every navigation. */
export function makeRoutedHost(App: ComponentType<AppProps>, initial: string) {
  const routes: string[] = [initial];
  let setRoute: (r: string) => void = () => undefined;
  function Host() {
    const [route, set] = useState(initial);
    setRoute = (r) => {
      routes.push(r);
      set(r);
    };
    return <App windowId="wtest" route={route} navigate={(r) => setRoute(r)} wm={wmApi} onTitle={() => undefined} focused />;
  }
  return { Host, routes, go: (r: string) => act(() => setRoute(r)) };
}

export async function click(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error('click: element not found');
  await act(async () => {
    (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** Set a React-controlled input/textarea/select value. */
export async function type(el: Element | null | undefined, value: string): Promise<void> {
  if (!el) throw new Error('type: element not found');
  const input = el as HTMLInputElement;
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}

export async function key(target: EventTarget, k: string, init: KeyboardEventInit = {}): Promise<KeyboardEvent> {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  await act(async () => {
    target.dispatchEvent(e);
  });
  return e;
}

export function byText(root: ParentNode, selector: string, text: string | RegExp): HTMLElement | null {
  for (const el of root.querySelectorAll<HTMLElement>(selector)) {
    const t = el.textContent ?? '';
    if (typeof text === 'string' ? t.trim() === text : text.test(t)) return el;
  }
  return null;
}
