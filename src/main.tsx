import { createRoot } from 'react-dom/client';
import { App } from '@/ui/App';
import { reportBootError } from '@/ui/app/bootError';
import { bootGame } from '@/core/game';
import { store } from '@/core/store';
import { bus } from '@/core/bus';
import { sim } from '@/sim';
import { engine } from '@/engine';
import { missions } from '@/missions';
import '@/ui/styles/global.css';

// Debug handle for e2e tests and the console.
declare global {
  interface Window {
    __labsim?: Record<string, unknown>;
  }
}
window.__labsim = { store, sim, engine, missions, bus };

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root')!;

createRoot(uiRoot).render(<App />);

bootGame(canvas).catch((err) => {
  console.error('[boot] failed', err);
  reportBootError(err);
});
