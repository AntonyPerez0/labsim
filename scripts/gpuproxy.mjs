// GPU-load proxy (SwiftShader = GPU work runs on CPU, so frame interval ≈ GPU cost).
// node scripts/gpuproxy.mjs <url> <quality> [seconds] [scene: walk|computer]
import { chromium } from '@playwright/test';
const [url, quality = 'ultra', secs = '15', scene = 'walk'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__labsim && window.__labsim.store.getState().ui.loading === null, null, { timeout: 180000 });
await page.evaluate(([q, scene]) => {
  const L = window.__labsim;
  L.store.setState((s) => { s.progress.settings.quality = q; s.progress.settings.resolutionScale = 1; });
  L.missions.startFreeplay();
  if (scene === 'computer') L.store.setState((s) => { s.ui.overlay = { kind: 'computer' }; });
  const P = (window.__f = []); let last = performance.now();
  const raf = (now) => { P.push(now - last); last = now; requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
}, [quality, scene]);
await page.waitForTimeout(6000);
await page.evaluate(() => { window.__f.length = 0; });
await page.keyboard.down('KeyD');
await page.waitForTimeout(Number(secs) * 1000);
await page.keyboard.up('KeyD');
const r = await page.evaluate(() => { const v = [...window.__f].sort((a, b) => a - b); const q = (p) => +v[Math.floor(p * (v.length - 1))].toFixed(1); return { frames: v.length, p50: q(0.5), p90: q(0.9), max: q(1), stats: window.__labsim.engine.stats() }; });
console.log(quality, scene, JSON.stringify(r));
await browser.close();
