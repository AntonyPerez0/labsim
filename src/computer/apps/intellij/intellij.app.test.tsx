// @vitest-environment jsdom
/**
 * IntelliJ app (Apps §4) mounted over the sandbox fake lab: welcome → Get from VCS clone, config.properties
 * validator + Ctrl+S save through sim.git.writeFile, ▶ Run → run.started / run.finished, pigeon JSON not inspected.
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { bus } from '@/core/bus';
import { getState, mutate } from '@/core/store';
import { setWindowManager, type WindowManagerApi } from '@/computer/apps';
import { IntelliJApp } from './index';
import { installFakeSim, seedFakeLab } from './sandbox/fakeDevops';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let clip = '';
const wm: WindowManagerApi = {
  openApp: () => 'w1',
  close: () => undefined,
  focus: () => undefined,
  minimize: () => undefined,
  toggleMaximize: () => undefined,
  setTitle: () => undefined,
  navigate: () => undefined,
  notify: () => undefined,
  pickFile: async () => null,
  clipboard: { read: () => clip, write: (t) => void (clip = t) },
  windows: () => [{ id: 'w1', app: 'intellij', title: '', route: '', minimized: false, maximized: false, focused: true }],
};

interface Mounted {
  container: HTMLDivElement;
  root: Root;
  routes: string[];
}

let mounted: Mounted | null = null;
let actions: { action: string; data: Record<string, unknown> }[] = [];
let off: () => void = () => undefined;

async function mountAt(route: string, opts: { titleCalls?: string[] } = {}): Promise<Mounted> {
  const container = document.createElement('div');
  container.style.width = '1400px';
  container.style.height = '800px';
  document.body.appendChild(container);
  const root = createRoot(container);
  const routes: string[] = [route];
  function Host() {
    const [r, set] = useState(route);
    const [, setTitle] = useState('');
    return (
      <IntelliJApp
        windowId="w1"
        route={r}
        navigate={(n) => {
          routes.push(n);
          set(n);
        }}
        // A fresh callback every render that re-renders the host (like a naive window manager).
        onTitle={
          opts.titleCalls
            ? (t) => {
                opts.titleCalls!.push(t);
                setTitle(t);
              }
            : undefined
        }
        wm={wm}
        focused
      />
    );
  }
  await act(async () => root.render(<Host />));
  mounted = { container, root, routes };
  return mounted;
}

async function keydown(target: EventTarget, key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
  });
}

async function setValue(el: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const of = (name: string) => actions.filter((a) => a.action === name).map((a) => a.data);

beforeAll(() => {
  installFakeSim();
  setWindowManager(wm);
});
afterAll(() => setWindowManager(null));
afterEach(() => {
  if (mounted) {
    const m = mounted;
    act(() => m.root.unmount());
    m.container.remove();
    mounted = null;
  }
  off();
  vi.useRealTimers();
});

function capture() {
  actions = [];
  off = bus.on('app.action', (e) => actions.push({ action: e.action, data: (e.data ?? {}) as Record<string, unknown> }));
}

describe('IntelliJ IDEA', () => {
  it('welcome lists clones and Get from VCS clones uia-remote', async () => {
    seedFakeLab({ cloned: ['pigeon'] });
    capture();
    vi.useFakeTimers();
    const m = await mountAt('/welcome');
    expect(m.container.textContent).toContain('pigeon');
    expect(m.container.textContent).not.toContain('~/IdeaProjects/uia-remote');
    const btn = [...m.container.querySelectorAll('button')].find((b) => b.textContent === 'Get from VCS')!;
    await act(async () => btn.click());
    const url = m.container.querySelector<HTMLInputElement>('#ij-vcs-url')!;
    await setValue(url, 'git@github.com:labsim-lab/nope.git');
    expect(m.container.textContent).toContain('Repository not found');
    await setValue(url, 'git@github.com:labsim-lab/uia-remote.git');
    expect(m.container.querySelector<HTMLInputElement>('#ij-vcs-dir')!.value).toBe('~/IdeaProjects/uia-remote');
    const clone = [...m.container.querySelectorAll('button')].find((b) => b.textContent === 'Clone')!;
    await act(async () => clone.click());
    expect(m.container.textContent).toContain('Cloning source repository git@github.com:labsim-lab/uia-remote.git');
    await act(async () => {
      vi.advanceTimersByTime(1300);
    });
    expect(getState().lab.repos['uia-remote'].local).not.toBeNull();
    expect(of('intellij.project.cloned')[0]).toMatchObject({ repo: 'uia-remote', url: 'git@github.com:labsim-lab/uia-remote.git', ok: true });
    expect(of('intellij.project.opened')[0]).toMatchObject({ repo: 'uia-remote' });
    expect(m.routes).toContain('/project/uia-remote');
  });

  it('validates and saves config.properties, then runs TaxTest', async () => {
    seedFakeLab({ cloned: ['uia-remote', 'pigeon'] });
    capture();
    const m = await mountAt('/project/uia-remote/file/config.properties');
    expect(of('intellij.configValidator.ran')[0]).toMatchObject({ passed: 5, total: 11 });
    expect(m.container.textContent).toContain('config.properties ✗ 5/11');
    const ta = m.container.querySelector<HTMLTextAreaElement>('.ij-input')!;
    const good = getState().lab.repos['uia-remote'].local!.files['config.properties']
      .replace('standalone', 'tethered')
      .replace('customerFacingDeviceIp=', 'customerFacingDeviceIp=10.42.30.22')
      .replace('deviceType=Mini', 'deviceType=Station')
      .replace('classic', 'avocado')
      .replace('SPA', 'CPA')
      .replace('5555', '5444');
    await setValue(ta, good);
    await keydown(ta, 's', { ctrlKey: true });
    expect(getState().lab.repos['uia-remote'].local!.files['config.properties']).toBe(good);
    expect(of('intellij.file.saved')[0]).toMatchObject({ repo: 'uia-remote', path: 'config.properties', trigger: 'explicit', ok: true });
    expect(of('intellij.configValidator.ran').pop()).toMatchObject({ passed: 11, total: 11, failures: [] });
    expect(m.container.textContent).toContain('config.properties ✓ 11/11');
    vi.useFakeTimers();
    const run = m.container.querySelector<HTMLButtonElement>('button[aria-label="Run"]')!;
    await act(async () => run.click());
    expect(of('intellij.run.started')[0]).toMatchObject({ config: 'TaxTest', testPath: 'app/src/androidTest/java/com/labsim/uia/testactions/TaxTest.java', ok: true });
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(of('intellij.run.finished')[0]).toMatchObject({ config: 'TaxTest', passed: true });
    expect(m.container.textContent).toContain('Tests passed: 1 of 1 test');
    expect(m.container.textContent).toContain('Process finished with exit code 0');
  });

  it('never inspects pigeon JSON but flags gort JSON', async () => {
    seedFakeLab({ cloned: ['pigeon', 'gort'] });
    capture();
    const m = await mountAt('/project/pigeon/file/tests/sale/swipe_sale_print.json');
    expect(m.container.querySelector('.ij-wave')).toBeNull();
    expect(m.container.querySelector('.ij-chip')?.getAttribute('title')).toBe('Highlighting level: None (pigeon/.idea/inspectionProfiles)');
    expect(of('intellij.file.opened')[0]).toMatchObject({ repo: 'pigeon', path: 'tests/sale/swipe_sale_print.json' });
    const ta = m.container.querySelector<HTMLTextAreaElement>('.ij-input')!;
    expect(ta.value).toContain('"store": "orderId" }\n');
    await act(async () => m.root.unmount());
    m.container.remove();
    mounted = null;
    const g = await mountAt('/project/gort/file/cards/nfc/visa_std_tap.json');
    const gta = g.container.querySelector<HTMLTextAreaElement>('.ij-input')!;
    await setValue(gta, '{\n  "profile": "VISA_STD_TAP"\n  "entry": "TAP"\n}\n');
    // Inspections re-run on the IDE's debounced change tick (like IntelliJ's daemon).
    await act(async () => {
      await new Promise((r) => setTimeout(r, 320));
    });
    expect(g.container.querySelector('.ij-wave-err')).not.toBeNull();
  });

  it('creates config.properties from the example without re-render loops under an unstable onTitle host', async () => {
    seedFakeLab({ cloned: ['uia-remote'] });
    mutate((st) => {
      delete st.lab.repos['uia-remote'].local!.files['config.properties'];
    });
    capture();
    const titleCalls: string[] = [];
    const m = await mountAt('/project/uia-remote/file/config.properties.example', { titleCalls });
    expect(m.container.textContent).toContain('config.properties not found — copy config.properties.example');
    const create = [...m.container.querySelectorAll('button')].find((b) => b.textContent === 'Create config.properties from example')!;
    await act(async () => create.click());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(getState().lab.repos['uia-remote'].local!.files['config.properties']).toBe(getState().lab.repos['uia-remote'].local!.files['config.properties.example']);
    expect(m.routes[m.routes.length - 1]).toBe('/project/uia-remote/file/config.properties');
    expect(of('intellij.file.opened').map((d) => d.path)).toEqual(['config.properties.example', 'config.properties']);
    expect(titleCalls.length).toBeLessThan(6);
    expect(titleCalls[titleCalls.length - 1]).toBe('uia-remote – config.properties');
  });
});
