// Usage: node scripts/shot.mjs <url> <out.png> [waitMs] [--eval "js"] [--width 1280 --height 720]
// Headless Chromium with SwiftShader WebGL. Prints console errors from the page.
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const url = args[0];
const out = args[1] ?? 'shot.png';
const wait = Number(args[2] ?? 4000);
const evalIdx = args.indexOf('--eval');
const evalJs = evalIdx >= 0 ? args[evalIdx + 1] : null;
const w = Number(args[args.indexOf('--width') + 1] || 1280) || 1280;
const h = Number(args[args.indexOf('--height') + 1] || 720) || 720;

const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(wait);
if (evalJs) {
  const r = await page.evaluate(evalJs);
  console.log('eval result:', JSON.stringify(r)?.slice(0, 2000));
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: out, timeout: 180_000 }); // software-rendered frames can take a while under load
console.log(logs.slice(0, 40).join('\n') || '(no console errors)');
await browser.close();
