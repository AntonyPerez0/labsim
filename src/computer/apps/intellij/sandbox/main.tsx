/**
 * SANDBOX ONLY — `sandbox-computer-ide.html`: IntelliJ and Terminal in fixed-size frames with a tiny window
 * manager (clipboard, notify, openApp, route state) over a fake lab. Query: `?view=ide|term|both`,
 * `&route=/project/uia-remote/file/...`, `&cloned=pigeon,gort,uia-remote`, `&real=1` (do not install the fakes).
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { bus } from '@/core/bus';
import { getState, mutate } from '@/core/store';
import { setWindowManager, type AppId, type AppParams, type WindowManagerApi } from '@/computer/apps';
import { sim, type RepoId } from '@/sim';
import { TerminalApp } from '../../terminal';
import { IntelliJApp } from '..';
import { installFakeSim, seedFakeLab } from './fakeDevops';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'ide';
const realSim = q.get('real') === '1';
if (!realSim) {
  installFakeSim();
  seedFakeLab({ cloned: (q.get('cloned') ?? 'pigeon,gort,uia-remote').split(',').filter(Boolean) as RepoId[] });
} else {
  // Real sim: clone what `cloned` lists, then drive the game clock like the game loop does (50 ms steps).
  for (const r of (q.get('cloned') ?? '').split(',').filter(Boolean) as RepoId[]) sim.git.clone(r, 'player');
  // The IDE sandbox does not need Jenkins; park it (its engine is still landing) unless `&jenkins=1`.
  if (q.get('jenkins') !== '1')
    mutate((s) => {
      s.lab.jenkins.executors = 0;
      for (const j of Object.values(s.lab.jenkins.jobs)) j.nextScheduledMs = null;
    });
  setInterval(() => {
    try {
      sim.tick(50);
    } catch (e) {
      console.warn('[sandbox] sim.tick failed', e);
    }
  }, 50);
}

let clip = '';
const log: string[] = [];
const listeners = new Set<() => void>();
const routes: Record<string, string> = {};
const params: Record<string, AppParams> = {};
const titles: Record<string, string> = {};
const changed = () => listeners.forEach((f) => f());

const wm: WindowManagerApi = {
  openApp(id: AppId, p?: AppParams) {
    log.push(`openApp ${id} ${JSON.stringify(p ?? {})}`);
    if (id === 'intellij') {
      params.ide = { ...(p ?? {}) };
      if (p?.route) routes.ide = p.route;
      else if (p?.repo) routes.ide = p.file ? `/project/${p.repo}/file/${p.file}` : `/project/${p.repo}`;
      changed();
    }
    return 'ide';
  },
  close(id) {
    log.push(`close ${id}`);
  },
  focus() {},
  minimize() {},
  toggleMaximize() {},
  setTitle(id, t) {
    titles[id] = t;
  },
  navigate(id, r) {
    routes[id] = r;
    changed();
  },
  notify(n) {
    log.push(`notify ${n.title}`);
  },
  async pickFile() {
    return null;
  },
  clipboard: {
    read: () => clip,
    write: (t: string) => {
      clip = t;
      log.push(`clipboard ${JSON.stringify(t.slice(0, 60))}`);
    },
  },
  windows: () => [
    { id: 'ide', app: 'intellij', title: titles.ide ?? '', route: routes.ide ?? '', minimized: false, maximized: false, focused: true },
    { id: 'term', app: 'terminal', title: titles.term ?? '', route: routes.term ?? '', minimized: false, maximized: false, focused: true },
  ],
};
setWindowManager(wm);
bus.on('app.navigated', (e) => log.push(`navigated ${e.app} ${e.route}`));
bus.on('app.action', (e) => log.push(`action ${e.action} ${JSON.stringify(e.data).slice(0, 160)}`));

routes.ide = q.get('route') ?? '/welcome';
routes.term = '/tab/1';

function useWm() {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((x) => x + 1);
    listeners.add(f);
    return () => {
      listeners.delete(f);
    };
  }, []);
}

function Frame({ id, title, w, h, children }: { id: string; title: string; w: number; h: number; children: React.ReactNode }) {
  return (
    <div style={{ width: w, height: h, display: 'flex', flexDirection: 'column', border: '1px solid #000', boxShadow: '0 8px 30px #0008', background: '#222' }} data-frame={id}>
      <div style={{ height: 30, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 10px', background: '#1f1f1f', color: '#ddd', font: '12px Segoe UI, sans-serif' }}>{title}</div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>{children}</div>
    </div>
  );
}

function App() {
  useWm();
  const nav = (id: string) => (r: string) => {
    if (routes[id] !== r) {
      routes[id] = r;
      bus.emit('app.navigated', { app: id === 'ide' ? 'intellij' : 'terminal', route: r });
      changed();
    }
  };
  const ide = (
    <Frame id="ide" title={titles.ide ?? 'IntelliJ IDEA'} w={view === 'both' ? 1020 : 1560} h={view === 'both' ? 860 : 860}>
      <IntelliJApp windowId="ide" route={routes.ide} params={params.ide} navigate={nav('ide')} onTitle={(t) => {
        if (titles.ide === t) return;
        titles.ide = t;
        queueMicrotask(changed);
      }} focused wm={wm} />
    </Frame>
  );
  const term = (
    <Frame id="term" title={titles.term ?? 'Terminal'} w={view === 'both' ? 520 : 940} h={view === 'both' ? 860 : 580}>
      <TerminalApp windowId="term" route={routes.term} navigate={nav('term')} onTitle={(t) => {
        if (titles.term === t) return;
        titles.term = t;
        queueMicrotask(changed);
      }} focused={view === 'term'} wm={wm} />
    </Frame>
  );
  return (
    <div style={{ display: 'flex', gap: 16, padding: 16 }}>
      {view !== 'term' ? ide : null}
      {view !== 'ide' ? term : null}
    </div>
  );
}

Object.assign(window, { __sandbox: { log, getState, mutate, sim, wm, routes, clip: () => clip, setClip: (t: string) => (clip = t) } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
