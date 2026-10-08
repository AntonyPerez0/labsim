/**
 * Smoke test of the real integrated game (index.html → src/main.tsx), driven through real input:
 * keyboard, clicks on DOM elements, and the engine's interaction raycast (look at the chair, press E).
 * `window.__labsim` is used only to set up (fast-forward progress, place the player) and to read state.
 *
 * Chromium here is software-rendered (SwiftShader, a few fps), so waits are generous and the render
 * quality is set to Low first. The tests share one page and run in order: booting the 3D lab is the
 * expensive part.
 */
import { expect, test, type Page } from '@playwright/test';

type LabsimWindow = Window & {
  __labsim: {
    store: { getState(): any; setState(fn: (s: any) => void): void };
    engine: { teleportPlayer(p: [number, number, number], yaw: number, pitch?: number): void; isFocused(): boolean };
    missions: Record<string, (...a: any[]) => any>;
  };
};

/** Console noise that is not a game error (headless WebGL/audio warnings surfaced as errors). */
const BENIGN = [/GPU stall due to ReadPixels/i, /AudioContext was not allowed/i, /WebGL: too many errors/i];

let page: Page;
const errors: string[] = [];

function freshErrors(from: number): string[] {
  return errors.slice(from).filter((e) => !BENIGN.some((re) => re.test(e)));
}

async function state<T>(fn: string): Promise<T> {
  return page.evaluate(`(() => { const s = window.__labsim.store.getState(); return (${fn})(s); })()`) as Promise<T>;
}

/** Esc → Pause → Quit to menu → Quit (the real pause-menu path). */
async function quitToMenu(): Promise<void> {
  await expect.poll(() => state<string>('(s) => s.ui.overlay.kind'), { timeout: 30_000 }).toBe('none');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Quit to menu' }).click();
  await page.locator('.pause__confirm').getByRole('button', { name: 'Quit' }).click();
  await expect(page.locator('.menu__nav')).toBeVisible({ timeout: 30_000 });
}

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

test('boots to the title screen with no console errors', async () => {
  await expect(page.locator('.title')).toBeVisible();
  await expect(page.locator('.title__name')).toHaveText('LabSim');
  expect(await state<string>('(s) => s.ui.overlay.kind')).toBe('main-menu');
  expect(freshErrors(0)).toEqual([]);
});

test('Enter on the title leads through a new profile to the main menu', async () => {
  const mark = errors.length;
  await page.keyboard.press('Enter');
  const name = page.getByRole('textbox', { name: 'Your name' });
  await expect(name).toBeVisible();
  await name.fill('Smoke Tester');
  await name.press('Enter');
  await expect(page.getByText('Quick setup')).toBeVisible();
  await page.getByRole('button', { name: 'Skip to menu' }).click();
  await expect(page.locator('.menu__nav')).toBeVisible();
  await expect(page.locator('.menu__player-name')).toHaveText('Smoke Tester');
  expect(freshErrors(mark)).toEqual([]);
});

test('Academy M01 starts and Space advances the first dialogue line', async () => {
  const mark = errors.length;
  await page.locator('.menu__nav-item', { hasText: 'Academy' }).click();
  await page.locator('.acad-node', { hasText: 'M01' }).first().click();
  await page.getByRole('button', { name: 'Start module' }).click();
  await expect(page.locator('.hud-dialogue')).toBeVisible({ timeout: 60_000 });
  expect(await state<string | null>('(s) => s.session.academy?.moduleId ?? null')).toBe('M01');
  const first = await state<string>('(s) => s.session.dialogue.id');
  // First Space finishes the typewriter (if still typing), the next acknowledges the line.
  await expect
    .poll(
      async () => {
        await page.keyboard.press('Space');
        await page.waitForTimeout(400);
        return state<string | null>('(s) => s.session.dialogue?.id ?? null');
      },
      { timeout: 30_000, intervals: [200] },
    )
    .not.toBe(first);
  expect(freshErrors(mark)).toEqual([]);
});

test('sitting at the workstation opens Orca with the robot list', async () => {
  const mark = errors.length;
  // Leave the lesson for Free Play (the full lab, every app unlocked). Unlocking it is set-up only.
  await page.evaluate(() => {
    const { store } = (window as unknown as LabsimWindow).__labsim;
    store.setState((s) => {
      for (const id of ['M01', 'M02', 'M03', 'M04']) {
        const m = s.progress.modules[id] ?? {};
        s.progress.modules[id] = { ...m, status: 'complete', completed: true };
      }
    });
  });
  await quitToMenu();
  await page.locator('.menu__nav-item', { hasText: 'Free Play' }).click();
  await page.getByRole('button', { name: 'Enter the lab' }).click();
  await expect.poll(() => state<string>('(s) => s.session.mode'), { timeout: 60_000 }).toBe('freeplay');
  await expect.poll(() => state<string>('(s) => s.ui.overlay.kind'), { timeout: 30_000 }).toBe('none');

  // Stand behind the chair facing the desk (+Z), look down at the seat, and press E: the engine's
  // interaction raycast picks the chair and runs its "Sit at workstation" verb.
  await page.evaluate(() => (window as unknown as LabsimWindow).__labsim.engine.teleportPlayer([1.1, 0, 3.3], Math.PI, -1.0));
  await expect.poll(() => state<string | null>('(s) => s.ui.prompt?.label ?? null'), { timeout: 30_000 }).toBe('Your workstation');
  await page.keyboard.press('e');
  await expect.poll(() => state<string>('(s) => s.ui.overlay.kind'), { timeout: 30_000 }).toBe('computer');
  await expect(page.locator('.ws-root')).toBeVisible({ timeout: 30_000 });

  await page.locator('[data-icon="orca"]').dblclick();
  // Orca's robot list shows the seeded roster.
  await expect(page.getByText('WALL-E', { exact: false }).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('BUMBLEBEE', { exact: false }).first()).toBeVisible();
  expect(freshErrors(mark)).toEqual([]);

  await page.keyboard.press('Escape');
  await expect.poll(() => state<string>('(s) => s.ui.overlay.kind'), { timeout: 30_000 }).not.toBe('computer');
});

test('the Field Manual finds the lab ADB port 5444', async () => {
  const mark = errors.length;
  // In an activity Tab opens the Notebook, which links to the Field Manual.
  await page.keyboard.press('Tab');
  await page.getByRole('button', { name: 'Open Field Manual' }).click();
  const search = page.getByRole('textbox', { name: 'Search the Field Manual' });
  await expect(search).toBeVisible({ timeout: 30_000 });
  await search.fill('5444');
  const manual = page.locator('.fm');
  await expect(manual.getByText(/5444/).first()).toBeVisible();
  await expect(manual.getByText(/ADB/).first()).toBeVisible();
  expect(freshErrors(mark)).toEqual([]);
  // Esc in a non-empty search box clears it first; the next Esc closes the manual.
  await page.keyboard.press('Escape');
  await expect(search).toHaveValue('');
  await page.keyboard.press('Escape');
  // Back to the Notebook it was opened from, then Tab closes that too.
  await expect.poll(() => state<string>('(s) => s.ui.overlay.kind'), { timeout: 30_000 }).toBe('notebook');
  await page.keyboard.press('Tab');
  await expect.poll(() => state<string>('(s) => s.ui.overlay.kind'), { timeout: 30_000 }).toBe('none');
});

test('a 5-minute Shift starts and a ticket arrives', async () => {
  // The shift clock is real time but the sim/mission loop catches up at most 8 steps a frame, so on a
  // software-rendered, loaded machine the first ticket (spawned at shift t = 8 s) can take minutes.
  test.setTimeout(360_000);
  const mark = errors.length;
  if ((await state<string>('(s) => s.ui.overlay.kind')) !== 'main-menu') await quitToMenu();
  await page.locator('.menu__nav-item', { hasText: 'Arcade' }).click();
  await page.locator('.arcade-card', { hasText: 'Shift' }).first().click();
  await page.locator('.setup__len').filter({ has: page.locator('.setup__len-min', { hasText: /^5$/ }) }).click();
  await page.getByRole('button', { name: 'Clock in' }).click();
  await expect.poll(() => state<string>('(s) => s.session.mode'), { timeout: 60_000 }).toBe('arcade-shift');
  expect(await state<string | null>('(s) => s.session.shift?.configId ?? null')).toBe('shift-5');
  await expect(page.locator('.hud-ticket').first()).toBeVisible({ timeout: 300_000 });
  expect(await state<number>('(s) => s.session.tickets.length')).toBeGreaterThan(0);
  expect(freshErrors(mark)).toEqual([]);
});
