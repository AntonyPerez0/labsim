// Frame-pacing probe: node scripts/perfprobe.mjs <url> <mode: academy|shift|freeplay|menu> [seconds]
// Measures, per animation frame, time spent in sim.tick, engine.frame, and the rest of the rAF
// task (React/store work), plus long tasks. Tiny viewport + low quality so SwiftShader GPU cost
// doesn't drown out CPU costs.
import { chromium } from '@playwright/test';
const [url, mode = 'freeplay', secs = '12'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__labsim && window.__labsim.store.getState().ui.loading === null, null, { timeout: 180000 });
await page.evaluate((mode) => {
  const L = window.__labsim;
  L.store.setState((s) => { s.progress.settings.quality = 'low'; s.progress.settings.resolutionScale = 0.5; });
  for (const m of ['M01','M02','M03','M04','M05','M06','M07','M08']) L.store.setState((s) => { s.progress.modules[m] = { ...(s.progress.modules[m] ?? {}), status: 'completed', completed: true, stars: 3, bestScore: 100 }; });
  if (mode === 'academy') L.missions.startAcademy('M01');
  if (mode === 'shift') L.missions.startShift(L.missions.shifts()[0].id);
  if (mode === 'freeplay') L.missions.startFreeplay();
  // Instrument.
  const P = (window.__perf = { sim: [], eng: [], frames: [], long: [], storeWrites: 0, subs: 0 });
  const st = L.sim.tick.bind(L.sim);
  L.sim.tick = (dt) => { const t = performance.now(); st(dt); P.sim.push([t, performance.now() - t]); };
  const ef = L.engine.frame.bind(L.engine);
  L.engine.frame = (dt) => { const t = performance.now(); ef(dt); P.eng.push([t, performance.now() - t]); };
  let last = performance.now();
  const raf = (now) => { P.frames.push(now - last); last = now; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  const ss = L.store.setState.bind(L.store);
  L.store.subscribe(() => { P.storeWrites++; });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.long.push(e.duration); }).observe({ type: 'longtask', buffered: false }); } catch {}
}, mode);
await page.waitForTimeout(3000);
await page.evaluate(() => { const P = window.__perf; P.sim.length = P.eng.length = P.frames.length = P.long.length = 0; P.storeWrites = 0; P.t0 = performance.now(); });
// Walk forward/turn a bit to exercise the player.
await page.keyboard.down('KeyW');
await page.waitForTimeout(Number(secs) * 1000);
await page.keyboard.up('KeyW');
const r = await page.evaluate(() => {
  const P = window.__perf; const el = (performance.now() - P.t0) / 1000;
  const st = (a) => { if (!a.length) return null; const v = a.map((x) => (Array.isArray(x) ? x[1] : x)).sort((x, y) => x - y); const q = (p) => +v[Math.min(v.length - 1, Math.floor(p * v.length))].toFixed(2); return { n: v.length, p50: q(0.5), p95: q(0.95), max: +v[v.length - 1].toFixed(2), mean: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) }; };
  return { seconds: +el.toFixed(1), simTick: st(P.sim), engineFrame: st(P.eng), frameInterval: st(P.frames), longTasks: st(P.long), storeWritesPerSec: +(P.storeWrites / el).toFixed(1), drawCalls: window.__labsim.engine.stats().drawCalls };
});
console.log(JSON.stringify(r, null, 1));
if (errs.length) console.log('errors:', errs.slice(0, 5));
await browser.close();
