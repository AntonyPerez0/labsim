/**
 * Printed artwork (World §6.3/§6.4): posters, the lab network map, the architecture whiteboard,
 * the roadmap cork board, team-history frames, the lab safety card. Canvas2D vector ops only (they
 * are replayed into atlas padding with a transform).
 */
import { FONT, drawLabMark, fitText, roundRect, wrapText } from '../kit/draw';
import { seeded } from '../kit/procTex';
import { HARDWARE_LEAD, personName } from '@/content/team';

/** Hardware lead's display name (renameable, canon "People"). */
export const LEAD = (): string => personName(HARDWARE_LEAD);

type G = CanvasRenderingContext2D;

/** Canon pool (00-canon "Robots"), in canon order. */
export const POOL_NAMES = [
  'WALL-E', 'EVE', 'MEGATRON', 'OPTIMUS', 'BUMBLEBEE', 'SOUNDWAVE', 'STARSCREAM', 'RATCHET', 'R2-D2', 'C-3PO', 'BB-8',
  'JOHNNY-5', 'BENDER', 'BAYMAX', 'ROSIE', 'MARVIN', 'ROBBY', 'HAL', 'K-9', 'DATA', 'BISHOP', 'ASH', 'SONNY', 'CHAPPIE',
  'TARS', 'CASE', 'ATLAS', 'ASTRO', 'IRON-GIANT', 'VOLTRON', 'KRYTEN', 'MAZINGER', 'JARVIS', 'ULTRON', 'VISION', 'DALEK',
  'NUMBER-5', 'GERTY', 'MOTHER', 'SETI', 'BRAINIAC', 'ZORG',
] as const;
const PHYSICAL = new Set(['WALL-E', 'EVE', 'BUMBLEBEE', 'R2-D2', 'JOHNNY-5', 'BAYMAX', 'SETI', 'ROSIE', 'MEGATRON', 'OPTIMUS', 'DATA', 'TARS']);

function text(g: G, s: string, x: number, y: number, size: number, color: string, weight = 700, align: CanvasTextAlign = 'center', font: string = FONT.UI_SANS): void {
  g.font = `${weight} ${size}px ${font}`;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.fillText(s, x, y);
}

function box(g: G, x: number, y: number, w: number, h: number, fill: string, stroke?: string, r = 8, lw = 3): void {
  roundRect(g, x, y, w, h, r);
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.lineWidth = lw;
    g.strokeStyle = stroke;
    g.stroke();
  }
}

/** Paper with a faint margin shadow. */
function paper(g: G, w: number, h: number, bg: string): void {
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, w - 2, h - 2);
}

export function drawPosterEsd(g: G, w: number, h: number): void {
  paper(g, w, h, '#ffd400');
  // ESD triangle with the hand glyph
  const cx = w / 2;
  const ty = h * 0.07;
  const s = w * 0.62;
  g.fillStyle = '#111';
  g.beginPath();
  g.moveTo(cx, ty);
  g.lineTo(cx + s / 2, ty + s * 0.87);
  g.lineTo(cx - s / 2, ty + s * 0.87);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffd400';
  g.beginPath();
  g.moveTo(cx, ty + s * 0.13);
  g.lineTo(cx + s * 0.39, ty + s * 0.8);
  g.lineTo(cx - s * 0.39, ty + s * 0.8);
  g.closePath();
  g.fill();
  // hand + strike
  g.fillStyle = '#111';
  roundRect(g, cx - s * 0.08, ty + s * 0.36, s * 0.16, s * 0.3, s * 0.05);
  g.fill();
  for (let i = 0; i < 4; i++) {
    roundRect(g, cx - s * 0.08 + i * s * 0.042, ty + s * 0.28, s * 0.034, s * 0.14, s * 0.017);
    g.fill();
  }
  g.lineWidth = s * 0.03;
  g.strokeStyle = '#111';
  g.beginPath();
  g.moveTo(cx - s * 0.2, ty + s * 0.72);
  g.lineTo(cx + s * 0.2, ty + s * 0.32);
  g.stroke();
  text(g, 'ATTENTION', cx, h * 0.66, w * 0.11, '#111', 900);
  text(g, 'OBSERVE PRECAUTIONS FOR HANDLING', cx, h * 0.74, w * 0.052, '#111', 700);
  text(g, 'ELECTROSTATIC SENSITIVE DEVICES', cx, h * 0.8, w * 0.054, '#111', 800);
  g.fillStyle = '#111';
  g.fillRect(w * 0.08, h * 0.86, w * 0.84, 3);
  text(g, 'Wear a wrist strap at the benches', cx, h * 0.92, w * 0.05, '#111', 600);
}

export function drawPosterPool(g: G, w: number, h: number): void {
  paper(g, w, h, '#14213d');
  text(g, 'THE POOL · 42 RIGS', w / 2, h * 0.07, w * 0.085, '#ffffff', 800);
  g.fillStyle = '#43b02a';
  g.fillRect(w * 0.1, h * 0.115, w * 0.8, 3);
  const cols = 6;
  const rows = 7;
  const gx = w * 0.05;
  const gy = h * 0.14;
  const cw = (w * 0.9) / cols;
  const ch = (h * 0.72) / rows;
  POOL_NAMES.forEach((n, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = gx + c * cw;
    const y = gy + r * ch;
    const phys = PHYSICAL.has(n);
    box(g, x + 3, y + 3, cw - 6, ch - 6, phys ? 'rgba(67,176,42,0.22)' : 'rgba(255,255,255,0.06)', phys ? '#43b02a' : 'rgba(255,255,255,0.18)', 6, 2);
    text(g, phys ? `● ${n}` : n, x + cw / 2, y + ch / 2, Math.min(cw * 0.15, ch * 0.3), phys ? '#7ee06a' : '#d7deea', phys ? 800 : 600);
  });
  g.font = `600 ${w * 0.036}px ${FONT.UI_SANS}`;
  g.fillStyle = '#c9d2e3';
  g.textAlign = 'center';
  g.fillText('Orca tracks them all. Gort is a repo, not a rig.', w / 2, h * 0.92);
}

export function drawPoster5444(g: G, w: number, h: number): void {
  paper(g, w, h, '#ffffff');
  text(g, '5444', w / 2, h * 0.3, w * 0.36, '#1f9e4a', 900);
  text(g, '5555', w / 2, h * 0.55, w * 0.2, '#d0211c', 800);
  g.strokeStyle = '#d0211c';
  g.lineWidth = w * 0.025;
  g.beginPath();
  g.moveTo(w * 0.22, h * 0.6);
  g.lineTo(w * 0.78, h * 0.5);
  g.stroke();
  g.fillStyle = '#1f2328';
  g.font = `700 ${w * 0.05}px ${FONT.UI_SANS}`;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  wrapText(g, 'ADB over TCP in this lab: port 5444.', w * 0.08, h * 0.72, w * 0.84, w * 0.065);
  g.font = `500 ${w * 0.042}px ${FONT.UI_SANS}`;
  g.fillStyle = '#3a4048';
  wrapText(g, "5555 is the default — and it found our coworkers' desk devices.", w * 0.08, h * 0.83, w * 0.84, w * 0.056);
}

export function drawPosterPower(g: G, w: number, h: number): void {
  paper(g, w, h, '#f6f6f2');
  text(g, 'POWER IN THIS LAB', w / 2, h * 0.07, w * 0.075, '#1f2328', 900);
  const steps = ['120V AC', 'MEAN WELL', '24V DC RAIL', '12V (NUCs) · 5V 10A (Pis)', 'INLINE FUSES'];
  steps.forEach((s, i) => {
    const y = h * 0.14 + i * h * 0.11;
    box(g, w * 0.12, y, w * 0.76, h * 0.07, i === 2 ? '#d0211c' : '#2b2f36', undefined, 10);
    text(g, s, w / 2, y + h * 0.035, w * 0.055, '#ffffff', 800);
    if (i < steps.length - 1) {
      g.fillStyle = '#2b2f36';
      g.beginPath();
      g.moveTo(w / 2 - 14, y + h * 0.075);
      g.lineTo(w / 2 + 14, y + h * 0.075);
      g.lineTo(w / 2, y + h * 0.105);
      g.closePath();
      g.fill();
    }
  });
  box(g, w * 0.07, h * 0.72, w * 0.86, h * 0.2, '#ffffff', '#d0211c', 8, 8);
  g.save();
  g.translate(w * 0.07, h * 0.72);
  fitText(g, 'LABSIM DEVICES (18V) & COLLIS PROBES:\nAC STRIPS ONLY', w * 0.86, h * 0.2, { color: '#d0211c', font: FONT.UI_SANS, weight: 900, marginX: 0.06, marginY: 0.16 });
  g.restore();
}

export function drawPosterPark(g: G, w: number, h: number): void {
  paper(g, w, h, '#f6f6f2');
  text(g, 'ARM MOVED?', w / 2, h * 0.09, w * 0.11, '#1f2328', 900);
  const rows: [string, string, string][] = [
    ['tablet header', '#f2b233', 'MAGNETIC LOCK BROKEN'],
    ['press', '#1f6fd1', 'PARK ALL'],
    ['gantry homes to', '#2b2f36', '(0,0)'],
    ['tablet header', '#43b02a', 'OK'],
  ];
  rows.forEach(([cap, col, label], i) => {
    const y = h * 0.18 + i * h * 0.19;
    text(g, cap, w / 2, y, w * 0.045, '#5a6068', 600);
    box(g, w * 0.1, y + h * 0.025, w * 0.8, h * 0.1, col, undefined, 12);
    text(g, label, w / 2, y + h * 0.075, w * 0.07, i === 0 ? '#1f2328' : '#ffffff', 900);
    if (i < rows.length - 1) text(g, '↓', w / 2, y + h * 0.16, w * 0.07, '#1f2328', 900);
  });
}

export function drawPosterLab(g: G, w: number, h: number): void {
  paper(g, w, h, '#0f3d22');
  drawLabMark(g, w * 0.07, h * 0.12, h * 0.12, '#43b02a');
  text(g, 'KEEP THE RIGS GREEN', w * 0.13, h * 0.12, h * 0.1, '#ffffff', 900, 'left');
  const chips: [string, string, string][] = [
    ['AVAILABLE', '#43d17a', 'open to pipelines'],
    ['UNAVAILABLE', '#f2b233', 'named jobs only'],
    ['OFFLINE', '#8a949c', 'being built, no health checks'],
    ['CONNECTION FAILED', '#e5484d', 'ping failed, see Notes'],
    ['RESERVED', '#5aa2ff', "someone's running locally"],
  ];
  chips.forEach(([name, col, meaning], i) => {
    const y = h * 0.27 + i * h * 0.14;
    box(g, w * 0.06, y, w * 0.34, h * 0.1, col, undefined, h * 0.05);
    text(g, name, w * 0.23, y + h * 0.05, h * 0.045, '#08140c', 800);
    text(g, `— ${meaning}`, w * 0.43, y + h * 0.05, h * 0.05, '#e6efe9', 600, 'left');
  });
}

export function drawPosterNetwork(g: G, w: number, h: number): void {
  paper(g, w, h, '#ffffff');
  text(g, 'LAB NETWORK', w * 0.06, h * 0.08, h * 0.075, '#1f2328', 900, 'left');
  box(g, w * 0.7, h * 0.035, w * 0.25, h * 0.08, '#f2b233', undefined, 6);
  text(g, 'ILLUSTRATIVE', w * 0.825, h * 0.075, h * 0.035, '#1f2328', 800);
  const rows: [string, string][] = [
    ['GPU blade', '10.42.1.5'],
    ['Orca', 'orca.lab.local → 10.42.1.10:8080'],
    ['  MySQL', 'orca :3306'],
    ['Jenkins', 'jenkins.lab.local → 10.42.1.11:8080'],
    ['Ollama', '10.42.1.12:11434'],
    ['Robot Pis', '10.42.10.x :8000 / :8081'],
    ['Callus boxes', '10.42.20.x :9000'],
    ['LabSim devices', '10.42.30.x ADB :5444'],
    ['You', '10.42.50.17'],
    ['Coworker desks', '10.42.60.x :5555'],
  ];
  rows.forEach(([k, v], i) => {
    const y = h * 0.18 + i * h * 0.078;
    g.fillStyle = i % 2 ? '#ffffff' : '#eef3f0';
    g.fillRect(w * 0.05, y - h * 0.035, w * 0.9, h * 0.07);
    text(g, k, w * 0.07, y, h * 0.036, '#1f7a3b', 800, 'left');
    text(g, v, w * 0.36, y, h * 0.036, '#1f2328', 500, 'left', FONT.MONO);
  });
}

/* ───────────────────────────── whiteboard (§6.4) ───────────────────────────── */

export function drawWhiteboard(g: G, w: number, h: number): void {
  g.fillStyle = '#f8f8f6';
  g.fillRect(0, 0, w, h);
  // faint ghosting of erased marker
  const r = seeded(77);
  g.globalAlpha = 0.05;
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = r() > 0.5 ? '#2a3a8a' : '#333';
    g.lineWidth = 6 + r() * 10;
    g.beginPath();
    const x = r() * w;
    const y = r() * h;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + r() * 300 - 150, y + r() * 120 - 60, x + r() * 400 - 200, y + r() * 80 - 40);
    g.stroke();
  }
  g.globalAlpha = 1;
  const M = FONT.MARKER;
  const lw = Math.max(3, w * 0.0025);
  const node = (x: number, y: number, bw: number, bh: number, label: string, color = '#1d3fa8') => {
    g.strokeStyle = '#1a1a1a';
    g.lineWidth = lw;
    g.beginPath();
    g.rect(x + (r() - 0.5) * 3, y + (r() - 0.5) * 3, bw, bh);
    g.stroke();
    g.save();
    g.translate(x, y);
    fitText(g, label, bw, bh, { color, font: M, weight: 700, marginX: 0.07, marginY: 0.18 });
    g.restore();
    return { x, y, w: bw, h: bh, cx: x + bw / 2, cy: y + bh / 2 };
  };
  const arrow = (x1: number, y1: number, x2: number, y2: number, label = '', color = '#1a1a1a', lc = '#1d3fa8') => {
    g.strokeStyle = color;
    g.fillStyle = color;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(x1, y1);
    g.lineTo(x2, y2);
    g.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    const s = w * 0.012;
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(x2 - s * Math.cos(a - 0.4), y2 - s * Math.sin(a - 0.4));
    g.lineTo(x2 - s * Math.cos(a + 0.4), y2 - s * Math.sin(a + 0.4));
    g.closePath();
    g.fill();
    if (label) {
      g.font = `600 ${h * 0.026}px ${M}`;
      g.fillStyle = lc;
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText(label, (x1 + x2) / 2, (y1 + y2) / 2 - 6);
    }
  };
  const bw = w * 0.17;
  const bh = h * 0.1;
  const jen = node(w * 0.04, h * 0.08, bw, bh, 'Jenkins (Executor)');
  const run = node(w * 0.42, h * 0.08, bw * 1.25, bh, 'Test runner\n(uia-remote / Pigeon)');
  const orca = node(w * 0.04, h * 0.42, bw, bh, 'Orca (Controller)');
  const pi = node(w * 0.42, h * 0.42, bw * 1.25, bh * 1.1, 'Raspberry Pi\nRobot Controller (Linux)');
  const dev = node(w * 0.79, h * 0.42, bw, bh * 1.1, 'LabSim device\n(MFD/CFD)');
  arrow(jen.x + jen.w, jen.cy, run.x, run.cy, 'triggers pipeline + env vars');
  arrow(jen.cx, jen.y + jen.h, orca.cx, orca.y, '');
  g.font = `600 ${h * 0.026}px ${M}`;
  g.fillStyle = '#1d3fa8';
  g.textAlign = 'left';
  g.fillText('checkout robot', jen.cx + 10, (jen.y + jen.h + orca.y) / 2);
  arrow(run.x + 20, run.y + run.h, orca.x + orca.w, orca.y + 10, 'REST: xy_touch, swipe/dip/tap');
  // MySQL cylinder
  const mx = w * 0.06;
  const my = h * 0.66;
  g.strokeStyle = '#1a1a1a';
  g.lineWidth = lw;
  g.beginPath();
  g.ellipse(mx + bw * 0.4, my, bw * 0.4, h * 0.02, 0, 0, Math.PI * 2);
  g.moveTo(mx, my);
  g.lineTo(mx, my + h * 0.1);
  g.ellipse(mx + bw * 0.4, my + h * 0.1, bw * 0.4, h * 0.02, 0, Math.PI, 0, true);
  g.lineTo(mx + bw * 0.8, my);
  g.stroke();
  text(g, 'MySQL', mx + bw * 0.4, my + h * 0.055, h * 0.032, '#1d3fa8', 700, 'center', M);
  g.beginPath();
  g.moveTo(orca.cx - bw * 0.1, orca.y + orca.h);
  g.lineTo(mx + bw * 0.4, my - h * 0.02);
  g.stroke();
  arrow(orca.x + orca.w, orca.cy, pi.x, pi.cy, '5-min health ping', '#d0211c', '#d0211c');
  arrow(pi.x + pi.w, pi.cy, dev.x, dev.cy, 'ADB :5444');
  // Pi outputs
  const outs = ['camera stream', 'steppers / solenoid / dip / tap', 'Wine card programming'];
  outs.forEach((o, i) => {
    const y = pi.y + pi.h + h * 0.06 + i * h * 0.06;
    arrow(pi.x + 20, pi.y + pi.h, pi.x + 40 + i * 30, y - h * 0.015);
    text(g, o, pi.x + 50 + i * 30, y, h * 0.03, '#1d3fa8', 700, 'left', M);
  });
  // Callus chain
  const cal = node(w * 0.36, h * 0.82, bw * 1.15, bh, 'Windows/Minix box:\nCallus');
  const col = node(w * 0.63, h * 0.82, bw * 0.8, bh, 'Collis probe');
  arrow(cal.x + cal.w, cal.cy, col.x, col.cy, 'ribbon');
  arrow(col.x + col.w, col.cy, w * 0.9, dev.y + dev.h + h * 0.02, 'card reader');
  // green note
  g.save();
  g.translate(w * 0.75, h * 0.1);
  g.rotate(-0.05);
  text(g, `${LEAD()} calibrated`, 0, 0, h * 0.04, '#1f9e4a', 700, 'left', M);
  text(g, 'to true (0,0) ✓', 0, h * 0.05, h * 0.04, '#1f9e4a', 700, 'left', M);
  g.restore();
}

/** Roadmap cork board headers (index cards are separate quads). */
export function drawRoadmapHeaders(g: G, w: number, h: number): void {
  g.clearRect(0, 0, w, h);
  const heads = ['TODAY', 'IN PROGRESS', 'PLANNED', 'RETIRED / PHASING OUT'];
  heads.forEach((s, i) => {
    const x = (i * w) / 4;
    box(g, x + 6, 6, w / 4 - 12, h - 12, '#fdfcf6', '#2b2f36', 4, 2);
    g.save();
    g.translate(x, 0);
    fitText(g, s, w / 4, h, { color: '#1f2328', font: FONT.UI_SANS, weight: 800, marginX: 0.1, marginY: 0.2 });
    g.restore();
  });
}

const ROADMAP_CARDS = [
  'GPU blade (Orca, Jenkins, Ollama VMs)',
  'Legacy tower',
  'Ollama vision triage',
  'Flex 4 / Pocket profile',
  'Mini 4 rigs',
  'Station Duo 3 rigs',
  'NUC motion control',
  'uia-remote tethered',
];

export function drawIndexCard(g: G, w: number, h: number, i: number): void {
  g.fillStyle = '#fbfbf5';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#d0211c';
  g.fillRect(0, h * 0.18, w, 2);
  g.strokeStyle = 'rgba(31,79,209,0.25)';
  g.lineWidth = 1;
  for (let y = h * 0.34; y < h; y += h * 0.16) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  g.save();
  g.translate(0, h * 0.2);
  fitText(g, ROADMAP_CARDS[i % ROADMAP_CARDS.length]!, w, h * 0.78, { color: '#1b1f2a', font: FONT.HAND, weight: 600, marginX: 0.08, marginY: 0.12 });
  g.restore();
}

export const HISTORY_TEXT: Record<string, [string, string]> = {
  semi: ['SEMI TEAM', 'third-party POS SDKs · USB Pay Display · Secure Network Pay Display (link MFDs and CFDs over USB or the local network)'],
  sedi: ['SEDI (QA) TEAM', "tested Semi's apps with the Lester framework"],
  ipx: ['IPX', 'Integrated Payment Experience. uia-remote tests standalone + tethered across Register, Orders, Authorizations, Sale, Transactions, Setup'],
  paycore: ['PAYCORE', 'adopted uia-remote for LabSim Dining · back-to-back card matrices (Visa, Discover, AmEx) · standalone rigs kept Unavailable'],
};

export function drawHistoryFrame(g: G, w: number, h: number, key: string): void {
  const [title, body] = HISTORY_TEXT[key] ?? ['', ''];
  g.fillStyle = '#f7f5ef';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#1f7a3b';
  g.fillRect(0, 0, w, h * 0.16);
  text(g, title, w / 2, h * 0.08, h * 0.07, '#ffffff', 800);
  drawLabMark(g, w / 2, h * 0.3, h * 0.12, '#43b02a');
  g.fillStyle = '#1f2328';
  g.font = `500 ${h * 0.05}px ${FONT.UI_SANS}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  const words = body.split(' ');
  let line = '';
  let y = h * 0.47;
  for (const wd of words) {
    const t = line ? `${line} ${wd}` : wd;
    if (g.measureText(t).width > w * 0.84 && line) {
      g.fillText(line, w / 2, y);
      y += h * 0.065;
      line = wd;
    } else line = t;
  }
  g.fillText(line, w / 2, y);
}

export function drawSafetyCard(g: G, w: number, h: number): void {
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.fillStyle = '#d0211c';
  g.fillRect(0, 0, w, h * 0.14);
  text(g, 'LAB SAFETY CARD', w / 2, h * 0.07, h * 0.065, '#ffffff', 900);
  g.fillStyle = '#1f2328';
  g.font = `600 ${h * 0.045}px ${FONT.UI_SANS}`;
  g.textAlign = 'left';
  g.textBaseline = 'alphabetic';
  let y = h * 0.24;
  for (const l of [
    '1. Never touch a robot while a test is running.',
    '2. If you move an arm by hand, Park All before you walk away.',
    '3. LabSim terminals and Collis probes go on the AC power strips — never the DC rails.',
    `4. Broken rig? Tell ${LEAD()}.`,
  ]) y = wrapText(g, l, w * 0.07, y, w * 0.86, h * 0.06) + h * 0.03;
}
