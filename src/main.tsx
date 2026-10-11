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
import '@/ui/styles/mobile.css';

// Debug handle for e2e tests and the console.
declare global {
  interface Window {
    __labsim?: Record<string, unknown>;
  }
}
window.__labsim = { store, sim, engine, missions, bus };

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const uiRoot = document.getElementById('ui-root')!;

// The static splash in index.html covers the download/parse time; hand over to the React loading
// screen as soon as it has rendered.
const splash = document.getElementById('boot-splash');
const splashStatus = document.getElementById('boot-splash-status');
if (splashStatus) splashStatus.textContent = 'Starting the game…';
if (splash) {
  const done = () => {
    splash.classList.add('is-done');
    setTimeout(() => splash.remove(), 300);
  };
  if (uiRoot.childElementCount > 0) done();
  else {
    const mo = new MutationObserver(() => {
      if (uiRoot.childElementCount === 0) return;
      mo.disconnect();
      requestAnimationFrame(done);
    });
    mo.observe(uiRoot, { childList: true });
  }
}

installMobileViewport();

createRoot(uiRoot).render(<App />);

bootGame(canvas).catch((err) => {
  console.error('[boot] failed', err);
  reportBootError(err);
});

/**
 * Phones and tablets: block pinch/double-tap page zoom during play (iOS ignores `user-scalable=no`),
 * and publish the visual viewport (on-screen keyboard, URL bar) and the orientation as CSS custom
 * properties for `mobile.css`: `--vvh` (visible height, px) and `--kb` (keyboard overlap, px).
 */
function installMobileViewport(): void {
  const root = document.documentElement;
  for (const ev of ['gesturestart', 'gesturechange'] as const) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
  const vv = window.visualViewport;
  let raf = 0;
  const apply = () => {
    raf = 0;
    const h = vv ? vv.height : window.innerHeight;
    root.style.setProperty('--vvh', `${Math.round(h)}px`);
    const kb = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    root.style.setProperty('--kb', `${Math.round(kb)}px`);
    root.dataset.kb = kb > 120 ? 'open' : 'closed';
    root.dataset.orient = window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait';
    // iOS scrolls the layout viewport to reveal a focused field; the game is a fixed full-screen
    // app, so put it back once the keyboard has settled.
    if (kb === 0 && (window.scrollX || window.scrollY)) window.scrollTo(0, 0);
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(apply);
  };
  vv?.addEventListener('resize', schedule);
  vv?.addEventListener('scroll', schedule);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  apply();
}
