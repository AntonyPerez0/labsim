/**
 * Cooperative yielding for the (synchronous, CPU-heavy) lab build: lets the browser paint the
 * loading bar and handle input between build phases, so a slow phone never shows a frozen page.
 * Yields at most every ~40 ms of work (a fast desktop pays almost nothing); falls back to a timer
 * when animation frames are paused (background tab).
 */
let lastYieldAt = 0;
const BUDGET_MS = 40;

export function yieldToPaint(): Promise<void> {
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (now - lastYieldAt < BUDGET_MS) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      lastYieldAt = typeof performance !== 'undefined' ? performance.now() : 0;
      resolve();
    };
    // rAF runs just before a paint; the timeout after it runs once that paint is done.
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(finish, 0));
    setTimeout(finish, 100);
  });
}
