/**
 * `drawTablet` — the front status tablet dashboard exactly like IMG-T (World §5): green → cyan
 * header with the robot name, translucent LabSim logo, `Status: …` / `Brainbox v6`, the three
 * tabs, the dark navy content panel and the Motion Control button groups. Banner states (yellow,
 * grey, red), boot sequence and the lockout overlay included. Logical canvas 1280 × 800; any canvas
 * size is filled by scaling.
 */
import {
  BANNER_GLYPH,
  BANNER_WIPE_MS,
  FONTS,
  TABLET_BUTTON_STYLE as BS,
  TABLET_CANVAS,
  TABLET_HEADER_GRADIENTS,
  TABLET_JOG,
  TABLET_LAYOUT as L,
  TABLET_LOCKOUT,
  TABLET_MOTION_BUTTONS,
  TABLET_ROBOT_CONTROL_BUTTONS,
  TABLET_STATES,
  TABLET_STATUS_TEXT,
  MOTION_GROUPS,
  type TabletButton,
  type TabletRenderOptions,
  type TabletTab,
} from './api';
import type { BannerColor, LabState, OrcaRobot, RigState } from '@/sim/types';
import { roundRectPath, shade } from './shared/theme';
import { drawMark } from './shared/labLogo';
import * as G from './shared/glyphs';
import { drawRobotTab } from './tabletRobotTab';

type Ctx = CanvasRenderingContext2D;

const SANS = FONTS.UI_SANS;

/** `Status: OK` text from the rig (accepts statusText with or without the `Status:` prefix). */
export function tabletStatusText(rig: RigState): string {
  const raw = (rig.tablet?.statusText ?? '').trim();
  const body = raw.replace(/^status:\s*/i, '');
  if (body) return body;
  switch (rig.banner) {
    case 'yellow':
      return TABLET_STATUS_TEXT.lockReleased;
    case 'grey':
      return TABLET_STATUS_TEXT.unreachable;
    case 'red':
      return `${TABLET_STATUS_TEXT.faultPrefix}MOTION`;
    default:
      return TABLET_STATUS_TEXT.ok;
  }
}

/** Evaluates a `TabletButton.activeWhen` condition against the rig. */
export function buttonActive(rig: RigState, cond: string | undefined): boolean {
  if (!cond) return false;
  const neg = cond.startsWith('!');
  const expr = neg ? cond.slice(1) : cond;
  let v = false;
  const inM = /^(\w+) in \((.*)\)$/.exec(expr);
  if (inM) {
    const val = (rig as unknown as Record<string, unknown>)[inM[1]!];
    const opts = inM[2]!.split(',').map((x) => x.trim().replace(/^'|'$/g, ''));
    v = typeof val === 'string' && opts.includes(val);
  } else if (expr === 'steppersEnabled') v = !!rig.steppersEnabled;
  else if (expr === 'solenoid.down') v = !!rig.solenoid?.down;
  return neg ? !v : v;
}

function gradientFor(c: Ctx, banner: BannerColor): CanvasGradient {
  const g = c.createLinearGradient(0, 0, L.header.w, 0);
  for (const [t, col] of TABLET_HEADER_GRADIENTS[banner]) g.addColorStop(t, col);
  return g;
}

function fitFont(c: Ctx, text: string, weight: number, size: number, maxW: number, min = 10): number {
  let s = size;
  for (; s > min; s -= 1) {
    c.font = `${weight} ${s}px ${SANS}`;
    if (c.measureText(text).width <= maxW) break;
  }
  return s;
}

function drawHeader(c: Ctx, rig: RigState, robot: OrcaRobot | null, o: TabletRenderOptions): void {
  const banner: BannerColor = rig.banner ?? 'green';
  c.fillStyle = gradientFor(c, o.wipe ? o.wipe.from : banner);
  c.fillRect(0, 0, L.header.w, L.header.h);
  if (o.wipe) {
    const p = Math.max(0, Math.min(1, o.wipe.progress01));
    c.fillStyle = gradientFor(c, banner);
    c.fillRect(0, 0, L.header.w * p, L.header.h);
  }
  // robot name
  const name = (robot?.humanReadableName || (rig as RigState & { hrnShown?: string }).hrnShown || rig.id.toUpperCase()).trim();
  const ns = fitFont(c, name, L.robotName.weight, L.robotName.sizePx, L.robotName.maxWidthPx, 24);
  c.font = `${L.robotName.weight} ${ns}px ${SANS}`;
  c.fillStyle = L.robotName.color;
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  c.fillText(name, L.robotName.x, L.robotName.baseline);
  // translucent LabSim logo
  const lg = L.logo;
  const leafSize = lg.leafRadiusPx * 4 + lg.leafGapPx;
  drawMark(c, lg.x0 + leafSize / 2, lg.baseline - 20, leafSize, lg.color);
  c.font = `${lg.wordmarkWeight} ${lg.wordmarkPx}px ${SANS}`;
  c.fillStyle = lg.color;
  c.fillText('labsim', lg.x0 + leafSize + 12, lg.baseline);
  // status + board lines
  const prefix = o.colorBlind ? `${BANNER_GLYPH[banner]} ` : '';
  const status = `${prefix}${L.statusLine.prefix}${tabletStatusText(rig)}`;
  c.fillStyle = L.statusLine.color;
  const sz = fitFont(c, status, L.statusLine.weight, L.statusLine.sizePx, L.statusLine.maxWidthPx, L.statusLine.minSizePx);
  c.font = `${L.statusLine.weight} ${sz}px ${SANS}`;
  if (c.measureText(status).width > L.statusLine.maxWidthPx) {
    // wrap to two lines at the last space that fits
    const words = status.split(' ');
    let line1 = '';
    let i = 0;
    for (; i < words.length; i++) {
      const tryLine = line1 ? `${line1} ${words[i]}` : words[i]!;
      if (c.measureText(tryLine).width > L.statusLine.maxWidthPx) break;
      line1 = tryLine;
    }
    c.fillText(line1, L.statusLine.x, L.statusLine.baseline - 10);
    c.fillText(words.slice(i).join(' '), L.statusLine.x, L.statusLine.baseline + sz - 8, L.statusLine.maxWidthPx);
  } else c.fillText(status, L.statusLine.x, L.statusLine.baseline);
  c.font = `400 ${L.boardLine.sizePx}px ${SANS}`;
  c.fillStyle = L.boardLine.color;
  c.fillText(rig.tablet?.brainbox || 'Brainbox v6', L.boardLine.x, L.boardLine.baseline);
}

function drawTabs(c: Ctx, tab: TabletTab): void {
  for (const t of Object.keys(L.tabs) as TabletTab[]) {
    const r = L.tabs[t];
    c.fillStyle = t === tab ? L.tabColors.selected : L.tabColors.unselected;
    c.fillRect(r.x, r.y, r.w, r.h);
    c.font = `400 ${L.tabColors.labelPx}px ${SANS}`;
    c.fillStyle = L.tabColors.label;
    c.textAlign = 'center';
    c.fillText(L.tabLabels[t], r.x + r.w / 2, r.y + r.h / 2 + 8);
  }
  c.textAlign = 'left';
}

export function drawTabletButton(c: Ctx, b: TabletButton, state: { active?: boolean; pressed?: boolean; rejected?: boolean; pulse?: number; disabled?: boolean }): void {
  const style = BS[b.color];
  const shift = state.pressed ? BS.pressedShiftPx : 0;
  const { x, w, h } = b.rect;
  const y = b.rect.y + shift;
  let top: string = style.top;
  let bottom: string = style.bottom;
  if (state.rejected) top = bottom = BS.rejectColor;
  else if (state.pressed) {
    top = shade(top, -BS.pressedDarken);
    bottom = shade(bottom, -BS.pressedDarken);
  } else if (state.active) {
    top = shade(top, BS.activeBrighten);
    bottom = shade(bottom, BS.activeBrighten);
  }
  const g = c.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  c.save();
  if (state.disabled) c.globalAlpha = 0.45;
  roundRectPath(c, x, y, w, h, BS.radiusPx);
  c.fillStyle = g;
  c.fill();
  // subtle top highlight like the Android button bevel
  c.strokeStyle = 'rgba(255,255,255,0.18)';
  c.lineWidth = 1;
  c.stroke();
  if (state.active) {
    roundRectPath(c, x + BS.activeOutlinePx / 2, y + BS.activeOutlinePx / 2, w - BS.activeOutlinePx, h - BS.activeOutlinePx, BS.radiusPx - 2);
    c.strokeStyle = '#ffffff';
    c.lineWidth = BS.activeOutlinePx;
    c.stroke();
  }
  if (state.pulse !== undefined) {
    roundRectPath(c, x - 3, y - 3, w + 6, h + 6, BS.radiusPx + 3);
    c.strokeStyle = `rgba(255,255,255,${0.4 + 0.6 * state.pulse})`;
    c.lineWidth = 3;
    c.stroke();
  }
  const multi = b.lines.length > 1;
  const size = multi ? 24 : BS.labelPx;
  const lh = multi ? 30 : 0;
  c.font = `${BS.labelWeight} ${size}px ${SANS}`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const cx = x + w / 2;
  const cy0 = y + h / 2 - ((b.lines.length - 1) * lh) / 2;
  b.lines.forEach((ln, i) => {
    c.fillStyle = BS.labelShadow;
    c.fillText(ln, cx, cy0 + i * lh + 1.5);
    c.fillStyle = '#ffffff';
    c.fillText(ln, cx, cy0 + i * lh);
  });
  c.restore();
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
}

function drawMotionTab(c: Ctx, rig: RigState, o: TabletRenderOptions, t: number): void {
  c.font = `${BS.groupLabel.weight} ${BS.groupLabel.sizePx}px ${SANS}`;
  c.fillStyle = BS.groupLabel.color;
  c.textAlign = 'center';
  for (const g of MOTION_GROUPS) c.fillText(g.name, g.cx, BS.groupLabel.baseline);
  c.textAlign = 'left';
  const yellow = rig.banner === 'yellow';
  const pulse = 0.5 + 0.5 * Math.sin((t / 1000) * Math.PI * 2 * BS.parkPulseHz);
  for (const b of TABLET_MOTION_BUTTONS) {
    drawTabletButton(c, b, {
      active: buttonActive(rig, b.activeWhen),
      pressed: o.pressedButtonId === b.id,
      rejected: o.rejectedButtonId === b.id,
      pulse: yellow && b.group === 'Park' ? pulse : undefined,
    });
  }
}

function drawRobotControlTab(c: Ctx, rig: RigState, o: TabletRenderOptions): void {
  for (const b of TABLET_ROBOT_CONTROL_BUTTONS) {
    drawTabletButton(c, b, { pressed: o.pressedButtonId === b.id, rejected: o.rejectedButtonId === b.id });
  }
  const sel = TABLET_JOG.stepSelector.rect;
  const step = o.jogStepMm ?? 1;
  roundRectPath(c, sel.x, sel.y, sel.w, sel.h, 10);
  c.fillStyle = '#26324f';
  c.fill();
  const segW = sel.w / 3;
  TABLET_JOG.stepSelector.stepsMm.forEach((s, i) => {
    if (s === step) {
      roundRectPath(c, sel.x + i * segW + 3, sel.y + 3, segW - 6, sel.h - 6, 8);
      c.fillStyle = '#1e88e5';
      c.fill();
    }
    c.font = `500 22px ${SANS}`;
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.fillText(TABLET_JOG.stepSelector.labels[i]!, sel.x + i * segW + segW / 2, sel.y + sel.h / 2 + 8);
  });
  c.textAlign = 'left';
  c.font = `500 24px ${FONTS.MONO}`;
  c.fillStyle = '#c9d2e3';
  const gx = rig.gantry?.xMm ?? 0;
  const gy = rig.gantry?.yMm ?? 0;
  c.fillText(`X ${gx.toFixed(1)}  Y ${gy.toFixed(1)} mm`, TABLET_JOG.readout.x, TABLET_JOG.readout.y + 28);
}

function drawUnreachable(c: Ctx, t: number): void {
  const p = L.contentPanel;
  const s = TABLET_STATES.unreachable;
  c.font = `500 ${s.sizePx}px ${SANS}`;
  c.fillStyle = s.color;
  c.textAlign = 'center';
  c.fillText(s.text, p.x + p.w / 2, p.y + p.h / 2 + 50);
  c.textAlign = 'left';
  G.spinner(c, p.x + p.w / 2, p.y + p.h / 2 - 30, 26, ((t % 1000) / 1000) * Math.PI * 2, '#c9d2e3', 'rgba(201,210,227,0.2)');
}

function drawLockout(c: Ctx, robot: OrcaRobot | null, lab: LabState): void {
  const lo = TABLET_LOCKOUT;
  c.fillStyle = lo.bg;
  c.fillRect(lo.rect.x, lo.rect.y, lo.rect.w, lo.rect.h);
  G.padlock(c, lo.padlock.x, lo.padlock.y, lo.padlock.sizePx, '#ffffff', true);
  c.textAlign = 'center';
  c.font = `${lo.line1.weight} ${lo.line1.sizePx}px ${SANS}`;
  c.fillStyle = lo.line1.color;
  c.fillText(lo.line1.text, 640, lo.line1.baseline);
  const co = robot?.checkout;
  let line2 = 'Local test run';
  if (co) {
    const build = lab.jenkins?.builds?.[co.buildId];
    const num = build?.number ?? Number(/#(\d+)/.exec(co.buildId)?.[1] ?? NaN);
    line2 = Number.isFinite(num) ? `${co.jobId} #${num}` : co.buildId;
  }
  c.font = `400 ${lo.line2.sizePx}px ${SANS}`;
  c.fillStyle = lo.line2.color;
  c.fillText(line2, 640, lo.line2.baseline);
  c.font = `400 ${lo.line3.sizePx}px ${SANS}`;
  c.fillStyle = lo.line3.color;
  c.fillText(lo.line3.text, 640, lo.line3.baseline);
  c.textAlign = 'left';
}

/** White LabMark splash of the boot sequence (MAIN on). */
function drawSplash(c: Ctx): void {
  c.fillStyle = '#ffffff';
  c.fillRect(0, 0, TABLET_CANVAS.w, TABLET_CANVAS.h);
  drawMark(c, 640, 360, 220, '#2e9e4f');
  c.font = `600 72px ${SANS}`;
  c.fillStyle = '#2e9e4f';
  c.textAlign = 'center';
  c.fillText('labsim', 640, 560);
  c.textAlign = 'left';
}

export function drawTablet(ctx: Ctx, lab: LabState, rig: RigState, robot: OrcaRobot | null, opts: TabletRenderOptions): void {
  const c = ctx;
  const t = opts.timeMs ?? 0;
  c.save();
  c.setTransform(opts.widthPx / TABLET_CANVAS.w, 0, 0, opts.heightPx / TABLET_CANVAS.h, 0, 0);
  if (opts.boot === 'black') {
    c.fillStyle = '#000000';
    c.fillRect(0, 0, TABLET_CANVAS.w, TABLET_CANVAS.h);
    c.restore();
    return;
  }
  if (opts.boot === 'splash') {
    drawSplash(c);
    c.restore();
    return;
  }
  const tab: TabletTab = opts.tab ?? rig.tablet?.tab ?? 'motion-control';
  c.fillStyle = L.frameBg;
  c.fillRect(0, 0, TABLET_CANVAS.w, TABLET_CANVAS.h);
  drawHeader(c, rig, robot, opts);
  drawTabs(c, tab);
  const p = L.contentPanel;
  c.fillStyle = p.color;
  c.fillRect(p.x, p.y, p.w, p.h);
  const grey = rig.banner === 'grey';
  // heartbeat (tablet ↔ Pi link)
  const hb = L.heartbeat;
  const up = !grey && opts.boot !== 'connecting';
  c.beginPath();
  c.arc(hb.x, hb.y, hb.r * (up ? 0.85 + 0.15 * Math.sin((t / 1000) * Math.PI * 2 * hb.hz) : 1), 0, Math.PI * 2);
  c.fillStyle = up ? hb.up : hb.down;
  c.fill();
  if (opts.boot === 'connecting') {
    c.font = `500 26px ${SANS}`;
    c.fillStyle = '#c9d2e3';
    c.textAlign = 'center';
    c.fillText(TABLET_STATES.connecting, p.x + p.w / 2, p.y + p.h / 2);
    c.textAlign = 'left';
  } else if (grey) drawUnreachable(c, t);
  else if (tab === 'motion-control') drawMotionTab(c, rig, opts, t);
  else if (tab === 'robot-control') drawRobotControlTab(c, rig, opts);
  else drawRobotTab(c, lab, rig, robot);
  if (opts.quip && !rig.dashboardLocked) {
    const q = L.quipStrip;
    c.fillStyle = q.bg;
    c.fillRect(q.rect.x, q.rect.y, q.rect.w, q.rect.h);
    c.font = `italic 400 ${q.sizePx}px ${SANS}`;
    c.fillStyle = '#ffffff';
    c.fillText(opts.quip, q.textX, q.baseline, q.rect.w - 40);
  }
  if (rig.dashboardLocked) drawLockout(c, robot, lab);
  c.restore();
  void BANNER_WIPE_MS;
}
