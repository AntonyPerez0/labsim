// JS CPU profile of the running game: node scripts/cpuprofile.mjs <url> <mode> [seconds] [out.json]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [url, mode = 'freeplay', secs = '10', out = 'profile.json'] = process.argv.slice(2);
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 320, height: 180 } });
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__labsim && window.__labsim.store.getState().ui.loading === null, null, { timeout: 180000 });
await page.evaluate((mode) => {
  const L = window.__labsim;
  L.store.setState((s) => { s.progress.settings.quality = 'low'; s.progress.settings.resolutionScale = 0.5; });
  for (const m of ['M01','M02','M03','M04','M05','M06','M07','M08']) L.store.setState((s) => { s.progress.modules[m] = { ...(s.progress.modules[m] ?? {}), status: 'completed', completed: true, stars: 3, bestScore: 100 }; });
  if (mode === 'shift') L.missions.startShift(L.missions.shifts()[0].id);
  if (mode === 'freeplay') L.missions.startFreeplay();
  if (mode === 'academy') L.missions.startAcademy('M01');
}, mode);
await page.waitForTimeout(4000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
await page.keyboard.down('KeyW');
await page.waitForTimeout(Number(secs) * 1000);
await page.keyboard.up('KeyW');
const { profile } = await cdp.send('Profiler.stop');
fs.writeFileSync(out, JSON.stringify(profile));
// Self time per function.
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const self = new Map();
const dts = profile.timeDeltas; const samples = profile.samples;
for (let i = 0; i < samples.length; i++) { const n = byId.get(samples[i]); const k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dts[i] || 0)); }
const total = [...self.values()].reduce((a, b) => a + b, 0);
const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
console.log('total ms', (total / 1000).toFixed(0));
for (const [k, v] of top) console.log((v / 1000).toFixed(1).padStart(8), ((100 * v) / total).toFixed(1).padStart(5) + '%', k);
await browser.close();
