// Scripted playtest: node scripts/play.mjs <url> <outdir> <steps.json>
// steps: [{eval: "js", wait: ms, shot: "name"}]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const [url, outDir, stepsFile] = process.argv.slice(2);
const steps = JSON.parse(fs.readFileSync(stepsFile, 'utf8'));
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForFunction(() => window.__labsim && window.__labsim.store.getState().ui.loading === null, null, { timeout: 120000 });
for (const s of steps) {
  if (s.key) await page.keyboard.press(s.key);
  if (s.click) await page.mouse.click(s.click[0], s.click[1]);
  if (s.eval) { try { const r = await page.evaluate(s.eval); if (r !== undefined) console.log(`[${s.shot ?? 'eval'}]`, JSON.stringify(r).slice(0, 1500)); } catch (e) { console.log('EVAL ERROR', e.message); } }
  await page.waitForTimeout(s.wait ?? 1500);
  if (s.shot) await page.screenshot({ path: `${outDir}/${s.shot}.png`, timeout: 180_000 }); // slow software rendering under load
}
console.log(logs.slice(0, 30).join('\n') || '(no console errors)');
await browser.close();
