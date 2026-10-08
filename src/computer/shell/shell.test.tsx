// @vitest-environment jsdom
/**
 * Desktop shell (Apps §1): window manager events, history, notifications, clipboard, request queue,
 * gating, Esc stands up.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { bus } from '@/core/bus';
import { getState, mutate } from '@/core/store';
import { requestOpenApp } from '../apps';
import { Desktop } from './Desktop';
import { captureActions, key, mount, type Mounted } from './sandbox/testkit';
import { clipboard, goBack, navigate, notify, openApp, pickFile, resetShell, routeFromParams, shell } from './wmStore';

function events() {
  const opened: string[] = [];
  const nav: string[] = [];
  const offA = bus.on('app.opened', (e) => opened.push(e.app));
  const offB = bus.on('app.navigated', (e) => nav.push(`${e.app} ${e.route}`));
  return { opened, nav, stop: () => (offA(), offB()) };
}

let m: Mounted | null = null;
beforeEach(() => resetShell());
afterEach(() => {
  m?.unmount();
  m = null;
  vi.restoreAllMocks();
});

describe('window manager (Apps §1.3)', () => {
  it('opens, re-targets a single-instance app and emits app.opened / app.navigated', () => {
    const ev = events();
    const id = openApp('orca', { route: '/robot' });
    expect(ev.opened).toEqual(['orca']);
    expect(ev.nav).toEqual(['orca /robot']);
    const again = openApp('orca', { route: '/robot/5/edit' });
    expect(again).toBe(id);
    expect(ev.opened).toEqual(['orca', 'orca']);
    expect(ev.nav.at(-1)).toBe('orca /robot/5/edit');
    expect(shell.getState().windows).toHaveLength(1);
    goBack(id);
    expect(ev.nav.at(-1)).toBe('orca /robot');
    navigate(id, '/robot?status.in=AVAILABLE', { replace: true });
    expect(shell.getState().windows[0]!.history).toEqual(['/robot?status.in=AVAILABLE', '/robot/5/edit']);
    ev.stop();
  });

  it('opens one IntelliJ window per repo and maps app params to routes', () => {
    const a = openApp('intellij', { repo: 'gort' });
    const b = openApp('intellij', { repo: 'uia-remote', file: 'app/src/Main.java' });
    expect(a).not.toBe(b);
    expect(openApp('intellij', { repo: 'gort' })).toBe(a);
    expect(routeFromParams('chat', { channel: 'dm:riley' })).toBe('/dm/riley');
    expect(routeFromParams('chat', { channel: '#orca-alerts' })).toBe('/channel/orca-alerts');
    expect(routeFromParams('dashboard', { robot: 'wall-e', tab: 'robot' })).toBe('/robot/wall-e/robot');
    expect(routeFromParams('camera', { url: 'http://10.42.10.40:8081/stream.mjpg', robot: 'seti' })).toBe('/stream/10.42.10.40?robot=seti');
  });

  it('keeps at most 3 toasts and logs notifications for the bell', () => {
    for (let i = 0; i < 5; i++) notify({ app: 'chat', title: `t${i}` });
    expect(shell.getState().toasts.map((t) => t.title)).toEqual(['t2', 't3', 't4']);
    expect(shell.getState().log).toHaveLength(5);
  });

  it('clipboard writes the in-game clipboard and emits desktop.clipboard.copied', () => {
    const cap = captureActions();
    clipboard.write('git@github.com:labsim-lab/gort.git', 'github');
    expect(clipboard.read()).toBe('git@github.com:labsim-lab/gort.git');
    expect(cap.of('desktop.clipboard.copied')[0]).toEqual({ text: 'git@github.com:labsim-lab/gort.git', sourceApp: 'github' });
    cap.stop();
  });
});

describe('Desktop (Apps §1.1, §1.8, §1.10, §1.11)', () => {
  it('drains open requests queued before mount', async () => {
    requestOpenApp('chat', { channel: '#orca-alerts' });
    m = await mount(<Desktop onExit={() => undefined} />);
    const w = shell.getState().windows.find((x) => x.app === 'chat');
    expect(w?.route).toBe('/channel/orca-alerts');
  });

  it('Esc with nothing to close stands up: desktop.standUp + onExit', async () => {
    vi.useFakeTimers();
    const onExit = vi.fn();
    const cap = captureActions();
    m = await mount(<Desktop onExit={onExit} />);
    await key(window, 'Escape');
    await act(async () => {
      vi.runAllTimers();
    });
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(cap.of('desktop.standUp')).toHaveLength(1);
    cap.stop();
    vi.useRealTimers();
  });

  it('Esc consumed by an app (preventDefault) does not stand up', async () => {
    vi.useFakeTimers();
    const onExit = vi.fn();
    m = await mount(<Desktop onExit={onExit} />);
    const consume = (e: KeyboardEvent) => e.preventDefault();
    window.addEventListener('keydown', consume);
    await key(window, 'Escape');
    await act(async () => {
      vi.runAllTimers();
    });
    window.removeEventListener('keydown', consume);
    expect(onExit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('without onExit, standing up sets ui.overlay to none', async () => {
    vi.useFakeTimers();
    mutate((s) => {
      s.ui.overlay = { kind: 'computer' };
    });
    m = await mount(<Desktop />);
    await act(async () => {
      (m!.container.querySelector('[data-hint="desktop.standUp"]') as HTMLElement).click();
    });
    expect(getState().ui.overlay.kind).toBe('none');
    vi.useRealTimers();
  });

  it('lesson gating: locked apps are refused and greyed', async () => {
    mutate((s) => {
      s.session.computer.unlockedApps = ['orca'];
    });
    m = await mount(<Desktop onExit={() => undefined} />);
    act(() => requestOpenApp('jenkins'));
    expect(shell.getState().windows.some((w) => w.app === 'jenkins')).toBe(false);
    act(() => requestOpenApp('orca'));
    expect(shell.getState().windows.some((w) => w.app === 'orca')).toBe(true);
    expect(m.container.querySelector('[data-hint="desktop.taskbar:jenkins"]')).toBeNull();
    expect(m.container.querySelector('[data-hint="desktop.icon:jenkins"] .ws-icon-locked')).not.toBeNull();
    act(() =>
      mutate((s) => {
        s.session.computer.unlockedApps = 'all';
      }),
    );
  });

  it('file dialog renders inside the requesting window and resolves the double-clicked file', async () => {
    mutate((s) => {
      s.lab.workstation.files['~/Downloads/walle_receipt_0912.jpg'] = 'img:receipt:wall-e:0912';
    });
    m = await mount(<Desktop onExit={() => undefined} />);
    act(() => {
      openApp('gimp');
    });
    let p!: Promise<string | null>;
    act(() => {
      p = pickFile({ title: 'Open Image', filter: 'images', startDir: '~/Downloads' });
    });
    const dlg = m.container.querySelector('.ws-window[data-app="gimp"] [role="dialog"][aria-label="Open Image"]');
    expect(dlg).not.toBeNull();
    expect(dlg!.className).toContain('ws-fd-gtk');
    const row = [...dlg!.querySelectorAll('tr.ws-fd-row')].find((r) => r.textContent?.includes('walle_receipt_0912.jpg'))!;
    await act(async () => {
      row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    await expect(p).resolves.toBe('~/Downloads/walle_receipt_0912.jpg');
  });
});
