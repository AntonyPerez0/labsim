/**
 * Touch controls (mobile) smoke test — same harness as `smoke.spec.ts`, but in a phone-shaped
 * touch context (coarse pointer ⇒ the touch HUD mounts). Drives the on-screen layer through real
 * pointer events: joystick move, drag-to-look, crouch, and the Interact button (≈ the E key).
 */
import { expect, test, type Page } from '@playwright/test';

type LabsimWindow = Window & {
  __labsim: {
    store: { getState(): any; setState(fn: (s: any) => void): void };
    engine: { teleportPlayer(p: [number, number, number], yaw: number, pitch?: number): void; isFocused(): boolean };
    missions: Record<string, (...a: any[]) => any>;
  };
};

const BENIGN = [/GPU stall due to ReadPixels/i, /AudioContext was not allowed/i, /WebGL: too many errors/i];

let page: Page;
const errors: string[] = [];

function freshErrors(from: number): string[] {
  return errors.slice(from).filter((e) => !BENIGN.some((re) => re.test(e)));
}

async function state<T>(fn: string): Promise<T> {
  return page.evaluate(`(() => { const s = window.__labsim.store.getState(); return (${fn})(s); })()`) as Promise<T>;
}

test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[console.error] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const w = window as unknown as LabsimWindow;
    return !!w.__labsim && w.__labsim.store.getState().ui.loading === null;
  }, null, { timeout: 150_000 });
  await page.evaluate(() => {
    (window as unknown as LabsimWindow).__labsim.store.setState((s) => {
      s.progress.settings.quality = 'low';
    });
  });
});

test.afterAll(async () => {
  await page?.close();
});

test('boot: touch layer mounts on the title screen flow and data-touch is set', async () => {
  const mark = errors.length;
  expect(await page.evaluate(() => document.documentElement.dataset.touch)).toBe('on');
  await page.keyboard.press('Enter');
  const name = page.getByRole('textbox', { name: 'Your name' });
  await expect(name).toBeVisible();
  await name.fill('Touch Tester');
  await name.press('Enter');
  await page.getByRole('button', { name: 'Skip to menu' }).click();
  await expect(page.locator('.menu__nav')).toBeVisible();
  // Free Play unlocks after M04 (as in smoke.spec.ts): unlock through the store, then enter.
  await page.evaluate(() => {
    (window as unknown as LabsimWindow).__labsim.store.setState((s) => {
      for (const id of ['M01', 'M02', 'M03', 'M04']) {
        const m = s.progress.modules[id] ?? {};
        s.progress.modules[id] = { ...m, status: 'complete', completed: true };
      }
    });
  });
  await page.locator('.menu__nav-item', { hasText: 'Free Play' }).click();
  await page.getByRole('button', { name: 'Enter the lab' }).click();
  await expect.poll(() => state<string>('(s) => s.session.mode'), { timeout: 60_000 }).toBe('freeplay');
  await expect.poll(() => state<string>('(s) => s.ui.overlay.kind'), { timeout: 30_000 }).toBe('none');
  // The touch HUD replaces the desktop "click to resume" veil.
  await expect(page.locator('.tc-joy')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tc-cluster')).toBeVisible();
  await expect(page.locator('.tc-look')).toBeVisible();
  await expect(page.locator('.hud-resume')).toHaveCount(0);
  expect(freshErrors(mark)).toEqual([]);
});

test('the joystick moves the player (analog drag)', async () => {
  const before = await state<[number, number, number]>('(s) => s.session.player.position');
  const base = await page.locator('.tc-joy').boundingBox();
  expect(base).not.toBeNull();
  const cx = base!.x + base!.width / 2;
  const cy = base!.y + base!.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 40, { steps: 4 }); // push up = forward
  await page.waitForTimeout(1200); // walk a bit (software render: a few fps)
  await page.mouse.up();
  const after = await state<[number, number, number]>('(s) => s.session.player.position');
  const d = Math.hypot(after[0] - before[0], after[2] - before[2]);
  expect(d, `moved ${d.toFixed(3)} m`).toBeGreaterThan(0.2);
});

test('dragging the view turns the camera (no pointer lock on touch)', async () => {
  const yaw0 = await state<number>('(s) => s.session.player.yaw');
  await page.mouse.move(500, 200);
  await page.mouse.down();
  await page.mouse.move(680, 200, { steps: 5 }); // drag right = turn right
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect
    .poll(() => state<number>('(s) => s.session.player.yaw'), { timeout: 30_000, intervals: [200] })
    .not.toBe(yaw0);
  const yaw1 = await state<number>('(s) => s.session.player.yaw');
  const turned = Math.abs(((yaw1 - yaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI); // shortest turn
  expect(turned, `turned ${((turned * 180) / Math.PI).toFixed(0)}°`).toBeGreaterThan(0.3);
  // A touch session must never have entered pointer lock (no auto-pause either).
  expect(await state<boolean>('(s) => s.ui.pointerLocked')).toBe(false);
  expect(await state<string>('(s) => s.ui.overlay.kind')).toBe('none');
});

test('crouch button toggles crouch; torch button toggles the head torch', async () => {
  await page.locator('.tc-btn--md[aria-label="Crouch (C)"]').tap();
  await expect.poll(() => state<boolean>('(s) => s.session.player.crouched'), { timeout: 30_000 }).toBe(true);
  await page.locator('[aria-label="Head torch (F)"]').tap();
  await expect.poll(() => state<boolean>('(s) => s.session.toolModes.flashlightOn'), { timeout: 30_000 }).toBe(true);
  expect(await state<string>('(s) => s.ui.overlay.kind')).toBe('none');
});

test('the Interact button opens the workstation (≈ E on the chair)', async () => {
  const mark = errors.length;
  await page.evaluate(() => (window as unknown as LabsimWindow).__labsim.engine.teleportPlayer([1.1, 0, 3.3], Math.PI, -1.0));
  await expect.poll(() => state<string | null>('(s) => s.ui.prompt?.label ?? null'), { timeout: 30_000 }).toBe('Your workstation');
  await page.locator('.tc-btn--lg').tap();
  await expect.poll(() => state<string>('(s) => s.ui.overlay.kind'), { timeout: 30_000 }).toBe('computer');
  await expect(page.locator('.ws-root')).toBeVisible({ timeout: 30_000 });
  expect(freshErrors(mark)).toEqual([]);
});
