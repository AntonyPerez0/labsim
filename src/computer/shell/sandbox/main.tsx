/**
 * SANDBOX ONLY — `sandbox-computer.html`: the real desktop shell with every app registered, over the REAL sim
 * (`sim.reset` + a `sim.tick` loop, like the game). `?fake=1` uses the old fake lab/sim instead.
 *
 * Query:
 *  - `?preset=factory` sim preset (any of `sim.presets()`, e.g. `academy:M16`).
 *  - `?open=orca:/robot,dashboard` opens apps (app[:route]; gimp takes a file path).
 *  - `?clone=uia-remote,pigeon` clones repos for the player first.
 *  - `?tablet=wall-e` shows the tablet overlay instead of the desktop.
 *  - `?objectives=1` pins a sample objective; `?chat=1` posts sample LabChat messages.
 *  - `?tick=0` freezes time; `?step=100` game ms per 100 ms real tick.
 * `window.__computer` exposes sim/mutate/getState/requestOpenApp/hints and `events()` (app.* bus history).
 */
import { createRoot } from 'react-dom/client';
import { StrictMode, useState } from 'react';
import { getState, mutate, useGame } from '@/core/store';
import { sim } from '@/sim';
import { bus } from '@/core/bus';
import { Desktop, TabletDashboard, clearHint, requestHint, requestOpenApp, type AppId, type RepoId } from '../../index';
import { seedFakeLab } from './fakeLab';
import { installFakeSim } from './fakeSim';

const q = new URLSearchParams(location.search);
const fake = q.get('fake') === '1';

if (fake) {
  seedFakeLab();
  installFakeSim();
} else {
  try {
    sim.reset({ preset: q.get('preset') ?? 'factory' });
  } catch (e) {
    console.warn('sim.reset failed — falling back to the fake lab', e);
    seedFakeLab();
    installFakeSim();
  }
  for (const r of (q.get('clone') ?? '').split(',').filter(Boolean) as RepoId[]) {
    const res = sim.git.clone(r, 'player');
    if (!res.ok) console.warn('clone', r, res.error);
  }
}

const post = (channel: string, author: string, text: string, ticketId?: string) => {
  try {
    sim.chat.post(channel, author, text, ticketId);
  } catch (e) {
    console.warn('chat.post failed', e);
  }
};
if (fake || q.get('chat') === '1') {
  post('#lab-automation', 'morgan', 'Morning all :wave: — new hire is sitting at *ws-17* today. Be nice.');
  post('#lab-automation', 'jared', 'Rack B camera is back. If JOHNNY-5 looks blurry, reseat the USB before you open a ticket.');
  post('#lab-automation', 'riley', '@engineer can you check why EVE shows a yellow banner? Ticket incoming.', 'LAB-2231');
  post('dm:morgan', 'morgan', 'Hey! Open Orca and filter the robot list to *Available*. Tell me how many there are.\n```\nhttp://orca.lab.local:8080/robot?status.in=AVAILABLE\n```');
}

mutate((s) => {
  s.ui.overlay = q.get('tablet') ? { kind: 'tablet', robotId: q.get('tablet')! } : { kind: 'computer' };
  if (q.get('objectives')) {
    s.session.objectives = [
      { id: 'o1', text: 'Filter the Orca robot list to Available', done: true },
      { id: 'o2', text: 'Open EVE’s Notes and read the last health check', done: false },
      { id: 'o3', text: 'Try to check out EVE from Orca', done: false },
    ];
  }
});

for (const spec of (q.get('open') ?? '').split(',').filter(Boolean)) {
  const i = spec.indexOf(':');
  const app = (i < 0 ? spec : spec.slice(0, i)) as AppId;
  const route = i < 0 ? undefined : spec.slice(i + 1);
  requestOpenApp(app, route ? (app === 'gimp' && !route.startsWith('/') ? { path: route } : { route }) : {});
}

// Console helpers for manual and scripted checks.
(window as unknown as Record<string, unknown>).__computer = {
  requestHint,
  clearHint,
  requestOpenApp,
  sim,
  mutate,
  getState,
  bus,
  /** `app.*` events seen so far (for scripted checks). */
  events: () => bus.history.filter((h) => h.type.startsWith('app.') || h.type.startsWith('computer.')).map((h) => ({ type: h.type, payload: h.payload })),
};

// Game clock: like the game loop, `sim.tick` at 10 Hz (1 game second per real second by default).
if (q.get('tick') !== '0') {
  const step = Number(q.get('step') ?? 100);
  let realTick = true;
  setInterval(() => {
    if (realTick) {
      try {
        sim.tick(step);
        return;
      } catch (e) {
        realTick = false;
        console.warn('sim.tick failed — advancing the clock only', e);
      }
    }
    mutate((s) => {
      s.lab.time.nowMs += step;
    });
  }, 100);
}

function App() {
  const overlay = useGame((s) => s.ui.overlay);
  const [stood, setStood] = useState(0);
  if (overlay.kind === 'computer') return <Desktop />;
  if (overlay.kind === 'tablet') return <TabletDashboard robotId={overlay.robotId} />;
  return (
    <div style={{ color: '#ddd', font: '14px system-ui', padding: 24 }}>
      Stood up ({stood}).{' '}
      <button
        type="button"
        onClick={() => {
          setStood((n) => n + 1);
          mutate((s) => {
            s.ui.overlay = { kind: 'computer' };
          });
        }}
      >
        Sit down
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
