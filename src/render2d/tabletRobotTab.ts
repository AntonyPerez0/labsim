/**
 * Status tablet — Robot tab (World §5.3 †, sim-only content): key/value list and the gantry
 * mini-map (device screen outline to scale, crosshair + dot at the gantry position).
 */
import { FONTS, TABLET_ROBOT_TAB as RT, LAYOUT_CLASS_SIZE_MM, layoutClassFor } from './api';
import type { LabState, OrcaRobot, RigState } from '@/sim/types';
import { roundRectPath } from './shared/theme';

type Ctx = CanvasRenderingContext2D;
const SANS = FONTS.UI_SANS;

function fmtTime(ms: number | null | undefined, lab: LabState): string {
  if (ms === null || ms === undefined) return '—';
  const t = lab.time as LabState['time'] & { epochDate?: string };
  const base = t?.epochDate ? 0 : (t?.startHour ?? 9) * 3600_000;
  const d = (((base + ms) % 86_400_000) + 86_400_000) % 86_400_000;
  const h = Math.floor(d / 3600_000);
  const m = Math.floor((d % 3600_000) / 60_000);
  const s = Math.floor((d % 60_000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const STATUS_LABEL: Readonly<Record<string, string>> = {
  AVAILABLE: 'Available',
  UNAVAILABLE: 'Unavailable',
  OFFLINE: 'Offline',
  CONNECTION_FAILED: 'Connection Failed',
  RESERVED: 'Reserved',
};

export function drawRobotTab(c: Ctx, lab: LabState, rig: RigState, robot: OrcaRobot | null): void {
  const dev = rig.deviceIds?.map((id) => lab.devices?.[id]).find(Boolean) ?? null;
  const pi = rig.piHostId ? lab.hosts?.[rig.piHostId] : undefined;
  const rows: [string, string | { chip: string; color: string }][] = [
    ['Name', robot?.name ?? rig.id],
    ['Human Readable Name', robot?.humanReadableName ?? rig.id.toUpperCase()],
    ['Orca status', { chip: STATUS_LABEL[robot?.status ?? 'AVAILABLE'] ?? String(robot?.status ?? '—'), color: RT.statusChips[robot?.status ?? 'AVAILABLE'] ?? '#6b7280' }],
    ['Device', dev ? `${dev.type} · ${dev.serial}` : '—'],
    ['Device IP', dev ? `${dev.ip}:${dev.adbPort ?? 5444}` : '—'],
    ['Robot Pi', pi?.ip ?? '—'],
    ['Camera', robot?.cameraStreamUrl ?? '—'],
    ['Last health check', robot?.lastHealthCheckMs != null ? `${fmtTime(robot.lastHealthCheckMs, lab)} · ${robot.lastHealthCheckOk ? '200 OK' : 'FAILED'}` : '—'],
    ['Magnetic lock', rig.magneticLock?.engaged ? 'ENGAGED' : 'RELEASED'],
  ];
  rows.forEach(([label, value], i) => {
    const y = RT.firstBaseline + i * RT.pitch;
    c.font = `400 ${RT.labelStyle.sizePx}px ${SANS}`;
    c.fillStyle = RT.labelStyle.color;
    c.fillText(label, RT.labelX, y);
    if (typeof value === 'string') {
      c.font = `400 ${RT.valueStyle.sizePx}px ${SANS}`;
      c.fillStyle = RT.valueStyle.color;
      c.fillText(value, RT.valueX, y, 320);
    } else {
      c.font = `600 20px ${SANS}`;
      const w = c.measureText(value.chip).width + 28;
      roundRectPath(c, RT.valueX, y - 24, w, 32, 16);
      c.fillStyle = value.color;
      c.fill();
      c.fillStyle = '#ffffff';
      c.fillText(value.chip, RT.valueX + 14, y - 2);
    }
  });
  // mini-map
  const mm = RT.miniMap;
  const r = mm.rect;
  roundRectPath(c, r.x, r.y, r.w, r.h, 12);
  c.fillStyle = '#141c30';
  c.fill();
  const cls = dev ? layoutClassFor(dev.type, rig.id === 'r2-d2' ? 'secondary' : 'primary') : null;
  const size = cls ? LAYOUT_CLASS_SIZE_MM[cls] : { w: 68, h: 136 };
  const maxX = Math.max(rig.gantry?.maxXMm ?? size.w, size.w);
  const maxY = Math.max(rig.gantry?.maxYMm ?? size.h, size.h);
  const pad = 24;
  const k = Math.min((r.w - 2 * pad) / maxX, (r.h - 2 * pad) / maxY);
  const ox = r.x + (r.w - maxX * k) / 2;
  const oy = r.y + (r.h - maxY * k) / 2;
  c.strokeStyle = 'rgba(201,210,227,0.35)';
  c.setLineDash([6, 6]);
  c.strokeRect(ox, oy, maxX * k, maxY * k);
  c.setLineDash([]);
  c.strokeStyle = '#c9d2e3';
  c.lineWidth = 2;
  c.strokeRect(ox, oy, size.w * k, size.h * k);
  const gx = ox + (rig.gantry?.xMm ?? 0) * k;
  const gy = oy + (rig.gantry?.yMm ?? 0) * k;
  const col = rig.magneticLock?.engaged === false ? mm.released : mm.ok;
  c.strokeStyle = col;
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(gx - 16, gy);
  c.lineTo(gx + 16, gy);
  c.moveTo(gx, gy - 16);
  c.lineTo(gx, gy + 16);
  c.stroke();
  c.beginPath();
  c.arc(gx, gy, mm.dotPx / 2, 0, Math.PI * 2);
  c.fillStyle = col;
  c.fill();
  // home marker
  c.fillStyle = '#c9d2e3';
  c.fillRect(ox - 3, oy - 3, 6, 6);
  c.font = `500 22px ${FONTS.MONO}`;
  c.fillStyle = '#ffffff';
  c.fillText(`X ${(rig.gantry?.xMm ?? 0).toFixed(1)} mm   Y ${(rig.gantry?.yMm ?? 0).toFixed(1)} mm`, r.x, mm.readoutBaseline);
  c.font = `400 20px ${SANS}`;
  c.fillStyle = '#9fb3d6';
  c.fillText(mm.homeText, r.x, mm.homeBaseline);
}
