/**
 * Canvas art for the non-device screens in the lab (World §3.6): workstation desktop mirror,
 * coworker / Morgan monitors and laptops, CAD laptop, desk phone, oscilloscope trace, 3D-printer
 * LCDs, bench instrument readouts. Pure Canvas2D (vector ops only).
 */
import { FONT, drawLabMark, roundRect } from '../kit/draw';
import { seeded } from '../kit/procTex';

type G = CanvasRenderingContext2D;

export interface MirrorState {
  /** Game clock "HH:MM". */
  clock: string;
  /** Seconds (drives the cursor blink / log scroll). */
  t: number;
  /** Robot rows for the Orca window: [name, status, device type] (type '' when the robot has no device). */
  robots: [string, string, string?][];
  /** Terminal lines (most recent last). */
  terminal: string[];
  /** Overlay is open (the React desktop covers the monitors). */
  seated: boolean;
}

const STATUS_COL: Record<string, string> = {
  AVAILABLE: '#43d17a',
  UNAVAILABLE: '#f2b233',
  OFFLINE: '#8a949c',
  CONNECTION_FAILED: '#e5484d',
  RESERVED: '#5aa2ff',
};

function wallpaper(g: G, w: number, h: number): void {
  const gr = g.createLinearGradient(0, 0, w, h);
  gr.addColorStop(0, '#0f3d22');
  gr.addColorStop(1, '#06170d');
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.18;
  drawLabMark(g, w * 0.78, h * 0.42, h * 0.5, '#43b02a');
  g.globalAlpha = 1;
}

function taskbar(g: G, w: number, h: number, clock: string, active: number): void {
  g.fillStyle = 'rgba(8,12,10,0.92)';
  g.fillRect(0, h - 18, w, 18);
  const icons = ['#43b02a', '#c0392b', '#2b2d31', '#111', '#7c5cff', '#f4f4f4'];
  icons.forEach((c, i) => {
    g.fillStyle = c;
    roundRect(g, 26 + i * 20, h - 15, 13, 12, 2);
    g.fill();
    if (i === active) {
      g.fillStyle = '#7fd6a0';
      g.fillRect(27 + i * 20, h - 2, 11, 2);
    }
  });
  g.fillStyle = '#43b02a';
  drawLabMark(g, 11, h - 9, 11, '#43b02a');
  g.fillStyle = '#dfe7e2';
  g.font = `10px ${FONT.UI_SANS}`;
  g.textAlign = 'right';
  g.textBaseline = 'middle';
  g.fillText(clock, w - 6, h - 9);
  g.textAlign = 'left';
}

function windowFrame(g: G, x: number, y: number, w: number, h: number, title: string, bar: string, body: string): void {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(x + 3, y + 3, w, h);
  g.fillStyle = body;
  g.fillRect(x, y, w, h);
  g.fillStyle = bar;
  g.fillRect(x, y, w, 16);
  g.fillStyle = '#ffffff';
  g.font = `600 9px ${FONT.UI_SANS}`;
  g.textBaseline = 'middle';
  g.fillText(title, x + 6, y + 8.5);
  for (let i = 0; i < 3; i++) {
    g.fillStyle = ['#ff5f57', '#febc2e', '#28c840'][i]!;
    g.beginPath();
    g.arc(x + w - 10 - i * 11, y + 8, 3.2, 0, Math.PI * 2);
    g.fill();
  }
}

/** Left + right workstation monitors (each half of a 1024 × 288 canvas). */
export function drawDesktopMirror(g: G, W: number, H: number, s: MirrorState): void {
  const w = W / 2;
  // LEFT: Orca robot list
  g.save();
  g.beginPath();
  g.rect(0, 0, w, H);
  g.clip();
  wallpaper(g, w, H);
  windowFrame(g, 14, 12, w - 28, H - 46, 'Orca — Robots · orca.lab.local:8080', '#1f7a3b', '#f4f6f5');
  g.font = `600 9px ${FONT.UI_SANS}`;
  g.fillStyle = '#4a5560';
  ['Name', 'Device', 'Status', 'Last health'].forEach((c, i) => g.fillText(c, 24 + [0, 120, 250, 360][i]!, 38));
  s.robots.slice(0, 11).forEach(([name, status, type], i) => {
    const y = 52 + i * 17;
    g.fillStyle = i % 2 ? '#ffffff' : '#eef2f0';
    g.fillRect(18, y - 8, w - 36, 17);
    g.fillStyle = '#1f2328';
    g.font = `10px ${FONT.UI_SANS}`;
    g.fillText(name, 24, y);
    g.fillStyle = '#6b7280';
    g.fillText(type ?? '', 144, y);
    const col = STATUS_COL[status] ?? '#8a949c';
    g.fillStyle = col;
    roundRect(g, 270, y - 6, 74, 12, 6);
    g.fill();
    g.fillStyle = '#05140a';
    g.font = `600 7.5px ${FONT.UI_SANS}`;
    g.fillText(status.replace('_', ' '), 276, y + 0.5);
    g.fillStyle = '#6b7280';
    g.font = `9px ${FONT.UI_SANS}`;
    g.fillText(s.clock, 384, y);
  });
  taskbar(g, w, H, s.clock, 0);
  g.restore();

  // RIGHT: terminal + Jenkins
  g.save();
  g.beginPath();
  g.rect(w, 0, w, H);
  g.clip();
  g.translate(w, 0);
  wallpaper(g, w, H);
  windowFrame(g, 10, 10, w * 0.56, H - 40, 'Jenkins — pigeon-android-regression #4127', '#2b2d31', '#f7f7f7');
  g.font = `9px ${FONT.UI_SANS}`;
  ['Checkout', 'Orca checkout', 'Run tests', 'Release robot', 'Report'].forEach((st, i) => {
    const y = 40 + i * 30;
    g.fillStyle = i < 3 ? '#43b02a' : '#c9cdd3';
    roundRect(g, 18, y, w * 0.56 - 18, 22, 4);
    g.fill();
    g.fillStyle = i < 3 ? '#06200f' : '#4a5560';
    g.fillText(st, 26, y + 11);
  });
  windowFrame(g, w * 0.45, 70, w * 0.52, H - 100, 'engineer@ws-17: ~', '#3b3f45', '#0c0f0e');
  g.font = `8.5px ${FONT.MONO}`;
  const lines = s.terminal.slice(-12);
  lines.forEach((l, i) => {
    g.fillStyle = l.startsWith('$') ? '#7fe3a0' : '#cfd8d3';
    g.fillText(l, w * 0.45 + 6, 94 + i * 11);
  });
  if (Math.floor(s.t * 2) % 2 === 0) {
    g.fillStyle = '#7fe3a0';
    g.fillRect(w * 0.45 + 6, 94 + lines.length * 11 - 5, 5, 9);
  }
  taskbar(g, w, H, s.clock, 3);
  g.restore();
}

/** Coworker / Morgan monitor content (static): 'code' | 'chat' | 'sheet'. */
export function drawOfficeScreen(g: G, w: number, h: number, kind: 'code' | 'chat' | 'sheet' | 'laptop-code', seed = 1): void {
  const r = seeded(seed);
  if (kind === 'code' || kind === 'laptop-code') {
    g.fillStyle = '#1e1f22';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#2b2d30';
    g.fillRect(0, 0, w, h * 0.07);
    g.fillRect(0, 0, w * 0.18, h);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = '#4e5157';
      g.fillRect(w * 0.02, h * 0.1 + i * h * 0.07, w * 0.12 * (0.5 + r() * 0.5), h * 0.025);
    }
    const cols = ['#cc7832', '#a9b7c6', '#6a8759', '#9876aa', '#ffc66d', '#808080'];
    for (let i = 0; i < 24; i++) {
      const y = h * 0.1 + i * h * 0.036;
      if (y > h * 0.96) break;
      let x = w * 0.21 + (i % 5 === 0 ? 0 : (1 + Math.floor(r() * 3)) * w * 0.02);
      const n = 2 + Math.floor(r() * 4);
      for (let k = 0; k < n; k++) {
        const ww = w * (0.03 + r() * 0.12);
        g.fillStyle = cols[Math.floor(r() * cols.length)]!;
        g.fillRect(x, y, ww, h * 0.018);
        x += ww + w * 0.012;
      }
    }
  } else if (kind === 'chat') {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#3f0e40';
    g.fillRect(0, 0, w * 0.22, h);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i === 2 ? '#1164a3' : 'rgba(255,255,255,0.5)';
      g.fillRect(w * 0.02, h * 0.1 + i * h * 0.09, w * 0.16, h * 0.045);
    }
    for (let i = 0; i < 6; i++) {
      const y = h * 0.08 + i * h * 0.15;
      g.fillStyle = ['#e8a33d', '#2bac76', '#e01e5a', '#36c5f0'][i % 4]!;
      g.fillRect(w * 0.25, y, h * 0.09, h * 0.09);
      g.fillStyle = '#1d1c1d';
      g.fillRect(w * 0.25 + h * 0.12, y, w * 0.12, h * 0.025);
      g.fillStyle = '#9a9a9a';
      g.fillRect(w * 0.25 + h * 0.12, y + h * 0.045, w * (0.3 + r() * 0.35), h * 0.02);
    }
    g.strokeStyle = '#bbbbbb';
    g.strokeRect(w * 0.25, h * 0.88, w * 0.72, h * 0.08);
  } else {
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#107c41';
    g.fillRect(0, 0, w, h * 0.09);
    g.strokeStyle = '#d4d4d4';
    g.lineWidth = 1;
    for (let x = w * 0.06; x < w; x += w * 0.11) {
      g.beginPath();
      g.moveTo(x, h * 0.15);
      g.lineTo(x, h);
      g.stroke();
    }
    for (let y = h * 0.15; y < h; y += h * 0.055) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    g.fillStyle = '#333';
    for (let i = 0; i < 14; i++)
      for (let j = 0; j < 7; j++) if (r() > 0.25) g.fillRect(w * 0.075 + j * w * 0.11, h * 0.165 + i * h * 0.055, w * (0.03 + r() * 0.05), h * 0.02);
  }
}

/** CAD laptop: isometric line render of a cradle built from boxes/cylinders on a grey grid (§3.6). */
export function drawCad(g: G, w: number, h: number): void {
  g.fillStyle = '#3b3f45';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#2c2f33';
  g.fillRect(0, 0, w, h * 0.07);
  g.fillRect(0, 0, w * 0.13, h);
  g.fillStyle = '#9aa1a8';
  g.font = `11px ${FONT.UI_SANS}`;
  g.fillText('cradle_flex_gen3.3mf — Shapes', w * 0.15, h * 0.045);
  g.strokeStyle = 'rgba(255,255,255,0.08)';
  g.lineWidth = 1;
  const iso = (x: number, y: number, z: number): [number, number] => [w * 0.56 + (x - z) * 0.866 * 2.2, h * 0.62 + (x + z) * 0.5 * 2.2 - y * 2.2];
  for (let i = -60; i <= 60; i += 10) {
    let [a, b2] = iso(i, 0, -60);
    let [c, d] = iso(i, 0, 60);
    g.beginPath();
    g.moveTo(a, b2);
    g.lineTo(c, d);
    g.stroke();
    [a, b2] = iso(-60, 0, i);
    [c, d] = iso(60, 0, i);
    g.beginPath();
    g.moveTo(a, b2);
    g.lineTo(c, d);
    g.stroke();
  }
  const boxE = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, col: string) => {
    const P = [
      [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1],
      [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1],
    ].map(([a, b3, c]) => iso(a!, b3!, c!));
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    g.strokeStyle = col;
    g.lineWidth = 1.4;
    for (const [i, j] of E) {
      g.beginPath();
      g.moveTo(P[i!]![0], P[i!]![1]);
      g.lineTo(P[j!]![0], P[j!]![1]);
      g.stroke();
    }
  };
  boxE(-24, 0, -45, 24, 4, 45, '#5ab0ff');
  boxE(-24, 4, -45, -20, 18, 45, '#5ab0ff');
  boxE(20, 4, -45, 24, 18, 45, '#5ab0ff');
  boxE(-24, 4, 30, 24, 12, 45, '#ffb347');
  boxE(-8, 0, -60, 8, 3, -45, '#7fe3a0');
  g.fillStyle = '#c9d1d9';
  g.font = `10px ${FONT.UI_SANS}`;
  ['Box', 'Cylinder', 'Wedge', 'Group', 'Align'].forEach((t2, i) => g.fillText(t2, 6, h * 0.14 + i * 18));
}

/** Desk IP phone 2.8" screen: extension + clock + missed-call icon (§3.6). */
export function drawPhone(g: G, w: number, h: number, clock: string, missed: boolean): void {
  g.fillStyle = '#c9d6c2';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1e2a1a';
  g.font = `700 ${h * 0.2}px ${FONT.MONO}`;
  g.textBaseline = 'middle';
  g.fillText('x4117', w * 0.07, h * 0.22);
  g.textAlign = 'right';
  g.fillText(clock, w * 0.93, h * 0.22);
  g.textAlign = 'left';
  g.fillRect(w * 0.05, h * 0.36, w * 0.9, 1.5);
  g.font = `${h * 0.15}px ${FONT.UI_SANS}`;
  g.fillText(missed ? '1 Missed call' : 'Ready', w * 0.07, h * 0.56);
  g.fillText('Voicemail', w * 0.07, h * 0.8);
  if (missed) {
    g.fillStyle = '#9b1c1c';
    g.beginPath();
    g.arc(w * 0.86, h * 0.56, h * 0.07, 0, Math.PI * 2);
    g.fill();
  }
}

/** Oscilloscope 7" screen: grid + scrolling square (CH1) and sine (CH2) traces. */
export function drawScope(g: G, w: number, h: number, t: number): void {
  g.fillStyle = '#05080a';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(120,140,150,0.35)';
  g.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    g.beginPath();
    g.moveTo((i * w) / 10, 0);
    g.lineTo((i * w) / 10, h * 0.86);
    g.stroke();
  }
  for (let j = 0; j <= 8; j++) {
    g.beginPath();
    g.moveTo(0, (j * h * 0.86) / 8);
    g.lineTo(w, (j * h * 0.86) / 8);
    g.stroke();
  }
  g.lineWidth = 2;
  g.strokeStyle = '#f6e13a';
  g.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const ph = (x / w) * 5 + t * 1.6;
    const y = (Math.floor(ph * 2) % 2 === 0 ? 0.22 : 0.42) * h;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.strokeStyle = '#38e3f2';
  g.beginPath();
  for (let x = 0; x <= w; x += 2) {
    const y = h * 0.62 + Math.sin((x / w) * Math.PI * 6 + t * 3) * h * 0.1;
    if (x === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
  g.fillStyle = '#11181c';
  g.fillRect(0, h * 0.86, w, h * 0.14);
  g.font = `${h * 0.075}px ${FONT.MONO}`;
  g.fillStyle = '#f6e13a';
  g.textBaseline = 'middle';
  g.fillText('CH1 2.00V  1kHz', w * 0.03, h * 0.93);
  g.fillStyle = '#38e3f2';
  g.fillText('CH2 500mV', w * 0.52, h * 0.93);
}

/** 3D printer LCD: progress + temperatures (§3.6: `47%`, `215/60°C`). */
export function drawPrinterLcd(g: G, w: number, h: number, kind: 'prusa' | 'bambu', pct: number, printing: boolean): void {
  if (kind === 'prusa') {
    g.fillStyle = '#0b0b0b';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#ff7a1a';
    g.font = `700 ${h * 0.2}px ${FONT.UI_SANS}`;
    g.textBaseline = 'middle';
    g.fillText(printing ? `Printing ${Math.round(pct)}%` : 'Ready', w * 0.05, h * 0.2);
    g.fillStyle = '#e8e8e8';
    g.font = `${h * 0.17}px ${FONT.UI_SANS}`;
    g.fillText(printing ? '215/215°C  60/60°C' : '24/0°C  23/0°C', w * 0.05, h * 0.5);
    g.fillStyle = '#333';
    g.fillRect(w * 0.05, h * 0.72, w * 0.9, h * 0.12);
    g.fillStyle = '#ff7a1a';
    g.fillRect(w * 0.05, h * 0.72, (w * 0.9 * (printing ? pct : 0)) / 100, h * 0.12);
  } else {
    g.fillStyle = '#16191c';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#00ae42';
    g.fillRect(0, 0, w, h * 0.12);
    g.fillStyle = '#ffffff';
    g.font = `600 ${h * 0.09}px ${FONT.UI_SANS}`;
    g.textBaseline = 'middle';
    g.fillText('Bambu Lab', w * 0.04, h * 0.06);
    g.font = `700 ${h * 0.22}px ${FONT.UI_SANS}`;
    g.fillText(printing ? `${Math.round(pct)}%` : 'Idle', w * 0.06, h * 0.38);
    g.font = `${h * 0.1}px ${FONT.UI_SANS}`;
    g.fillStyle = '#c9d1d9';
    g.fillText(printing ? 'Nozzle 220°C · Bed 55°C' : 'Nozzle 25°C · Bed 24°C', w * 0.06, h * 0.62);
    g.fillStyle = '#333';
    g.fillRect(w * 0.06, h * 0.78, w * 0.88, h * 0.07);
    g.fillStyle = '#00ae42';
    g.fillRect(w * 0.06, h * 0.78, (w * 0.88 * (printing ? pct : 0)) / 100, h * 0.07);
  }
}

/** Seven-segment style readout (soldering station, bench PSU, bench DMM). */
export function drawReadout(g: G, w: number, h: number, text: string, color: string, bg = '#0c0606'): void {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = color;
  g.font = `700 ${h * 0.7}px ${FONT.MONO}`;
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  g.fillText(text, w / 2, h * 0.54);
  g.textAlign = 'left';
}
