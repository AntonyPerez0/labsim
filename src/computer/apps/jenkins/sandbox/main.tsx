/**
 * SANDBOX ONLY — `sandbox-computer-web.html`: the real desktop shell over the REAL sim (factory preset) for the
 * web/pro apps of builder "computer-web" (Jenkins, GitHub, Lab Cameras, Ollama WebUI, GIMP).
 * Query: `?open=jenkins:/job/Java/,camera` opens apps (app[:route]); `?preset=academy:M16` picks a sim preset;
 * `?tick=0` freezes time; `?build=Java/uia-remote-regression-flex` starts a build at load.
 */
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { mutate, useGame, getState } from '@/core/store';
import { sim } from '@/sim';
import { bus } from '@/core/bus';
import { Desktop, requestOpenApp, requestHint, clearHint, type AppId } from '@/computer';

const q = new URLSearchParams(location.search);
try {
  sim.reset({ preset: q.get('preset') ?? 'factory' });
} catch (e) {
  console.warn('sim.reset failed', e);
}
mutate((s) => {
  s.ui.overlay = { kind: 'computer' };
});
const build = q.get('build');
if (build) {
  const r = sim.jenkins.build(build, q.get('params') ? JSON.parse(q.get('params')!) : {}, 'player');
  console.log('build', r);
}

for (const spec of (q.get('open') ?? '').split(',').filter(Boolean)) {
  const i = spec.indexOf(':');
  const app = (i < 0 ? spec : spec.slice(0, i)) as AppId;
  const route = i < 0 ? undefined : spec.slice(i + 1);
  requestOpenApp(app, route ? (app === 'gimp' && !route.startsWith('/') ? { path: route } : { route }) : {});
}

(window as unknown as Record<string, unknown>).__computer = {
  sim,
  mutate,
  getState,
  requestOpenApp,
  requestHint,
  clearHint,
  events: () => bus.history.filter((h) => h.type.startsWith('app.')).map((h) => ({ type: h.type, payload: h.payload })),
};

if (q.get('tick') !== '0') {
  const step = Number(q.get('step') ?? 100);
  setInterval(() => {
    try {
      sim.tick(step);
    } catch (e) {
      console.warn(e);
    }
  }, 100);
}

function App() {
  const overlay = useGame((s) => s.ui.overlay);
  if (overlay.kind === 'computer') return <Desktop />;
  return (
    <button type="button" onClick={() => mutate((s) => void (s.ui.overlay = { kind: 'computer' }))} style={{ margin: 24 }}>
      Sit down
    </button>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
