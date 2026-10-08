/**
 * `qrPattern(seed, modules)` (World §6.2): a QR-looking matrix — three finder squares, timing rows,
 * an alignment square and seeded data modules. Not a decodable QR code (illustrative).
 */
import { hash32, mulberry } from './theme';

export function qrPattern(seed: string, modules = 29): boolean[][] {
  const n = modules;
  const grid: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const reserved: boolean[][] = Array.from({ length: n }, () => new Array<boolean>(n).fill(false));
  const finder = (ox: number, oy: number) => {
    for (let y = -1; y <= 7; y++)
      for (let x = -1; x <= 7; x++) {
        const gx = ox + x;
        const gy = oy + y;
        if (gx < 0 || gy < 0 || gx >= n || gy >= n) continue;
        reserved[gy]![gx] = true;
        const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3));
        grid[gy]![gx] = x >= 0 && y >= 0 && x <= 6 && y <= 6 && ring !== 2;
      }
  };
  finder(0, 0);
  finder(n - 7, 0);
  finder(0, n - 7);
  // Timing patterns.
  for (let i = 8; i < n - 8; i++) {
    grid[6]![i] = i % 2 === 0;
    grid[i]![6] = i % 2 === 0;
    reserved[6]![i] = true;
    reserved[i]![6] = true;
  }
  // Alignment pattern.
  const a = n - 9;
  for (let y = -2; y <= 2; y++)
    for (let x = -2; x <= 2; x++) {
      const ring = Math.max(Math.abs(x), Math.abs(y));
      grid[a + y]![a + x] = ring !== 1;
      reserved[a + y]![a + x] = true;
    }
  const r = mulberry(hash32(seed));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!reserved[y]![x]) grid[y]![x] = r() < 0.48;
  return grid;
}

/** Draw a QR block (with a 4-module quiet zone) into a px square. */
export function drawQr(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, seed: string, fg = '#111111', bg = '#ffffff', modules = 29): void {
  const grid = qrPattern(seed, modules);
  const total = modules + 8;
  const m = size / total;
  ctx.fillStyle = bg;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = fg;
  for (let gy = 0; gy < modules; gy++) {
    const row = grid[gy]!;
    for (let gx = 0; gx < modules; gx++) {
      if (row[gx]) ctx.fillRect(x + (gx + 4) * m, y + (gy + 4) * m, Math.ceil(m), Math.ceil(m));
    }
  }
}
