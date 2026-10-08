/**
 * Steel-ruler measurement (Cur M09.10, World §9 `tool.ruler`): with the ruler in hand, "Look at
 * screen" on a device opens this panel. The ruler snaps to the screen's top-left (0,0); clicking a
 * button reads its centre in millimetres (X right, Y down) and reports
 *   `app.action { app: 'world', action: 'ruler.measured', data: { deviceId, rigId, screen, button, xMm, yMm } }`.
 *
 * Positions come from the firmware layout tables the sim hit-tests touches against, so a reading is
 * exactly what Orca's Screen Locations must hold for that screen.
 */
import { useMemo, useState } from 'react';
import { emit, useGame } from '@/core/store';
import type { TerminalDevice, LabState } from '@/sim';
import { DEVICE_TYPES, layoutIdFor } from '@/sim/seed/deviceTypes';
import { LAYOUTS, type LayoutEl } from '@/sim/seed/layouts/tables';
import { receiptOptionsFor } from '@/sim/core/devices/model';
import { Icon, Segmented } from '@/ui/kit';

/** `rig.<rigId>.device|mfd|cfd` → rig id and display. */
export function parseDeviceProp(propId: string): { rigId: string; display: 'primary' | 'secondary'; part: string } | null {
  const m = /^rig\.([a-z0-9-]+)\.(device|mfd|cfd)$/.exec(propId);
  if (!m) return null;
  return { rigId: m[1]!, display: m[2] === 'cfd' ? 'secondary' : 'primary', part: m[2]! };
}

function deviceFor(lab: LabState, rigId: string, part: string): TerminalDevice | null {
  const rig = lab.rigs?.[rigId];
  if (!rig) return null;
  const devs = rig.deviceIds.map((id) => lab.devices[id]).filter((d): d is TerminalDevice => !!d);
  if (!devs.length) return null;
  if (part === 'cfd') return devs.find((d) => d.role === 'cfd') ?? devs[1] ?? devs[0]!;
  if (part === 'mfd') return devs.find((d) => d.role === 'mfd') ?? devs[0]!;
  return devs[0]!;
}

/** The `ruler.measured` payload for one button of a device screen (null when it is not measurable). */
export function rulerMeasurement(lab: LabState, propId: string, screen: string, button: string): Record<string, unknown> | null {
  const parsed = parseDeviceProp(propId);
  const device = parsed ? deviceFor(lab, parsed.rigId, parsed.part) : null;
  if (!parsed || !device) return null;
  const el = LAYOUTS[layoutIdFor(device.type, parsed.display)].screens[screen]?.find((e) => e.kind === 'button' && e.id === button);
  if (!el) return null;
  return { deviceId: device.id, rigId: parsed.rigId, deviceType: device.type, screen, button: el.id, xMm: round1(el.x), yMm: round1(el.y) };
}

/** The receipt screen a device shows today (`RECEIPT_OPTIONS_4` / `_5`, Sim §3.10). */
export function receiptScreenFor(lab: LabState, propId: string): string | null {
  const parsed = parseDeviceProp(propId);
  const device = parsed ? deviceFor(lab, parsed.rigId, parsed.part) : null;
  return device ? `RECEIPT_OPTIONS_${receiptOptionsFor(lab, device)}` : null;
}

/** Screens worth measuring: the receipt screen first (the QR regression), then a few common ones. */
const MEASURABLE = ['RECEIPT_OPTIONS', 'TENDER', 'TIP', 'HOME_P1', 'REGISTER_HOME', 'PIN'];

export function RulerPanel({ propId }: { propId: string }) {
  const lab = useGame((s) => s.lab);
  const parsed = parseDeviceProp(propId);
  const device = parsed ? deviceFor(lab, parsed.rigId, parsed.part) : null;
  const layout = device && parsed ? LAYOUTS[layoutIdFor(device.type, parsed.display)] : null;
  const receiptName = device ? `RECEIPT_OPTIONS_${receiptOptionsFor(lab, device)}` : 'RECEIPT_OPTIONS_4';

  const screens = useMemo(() => {
    if (!layout) return [];
    const names = Object.keys(layout.screens).filter((n) => layout.screens[n]!.some((e) => e.kind === 'button'));
    const pick = names.filter((n) => n === receiptName || (!n.startsWith('RECEIPT_OPTIONS') && MEASURABLE.some((m) => n.startsWith(m))));
    return pick.sort((a, b) => (a === receiptName ? -1 : b === receiptName ? 1 : a.localeCompare(b))).slice(0, 4);
  }, [layout, receiptName]);
  const [screen, setScreen] = useState<string | null>(null);
  const active = screen && screens.includes(screen) ? screen : screens[0] ?? null;
  const [readings, setReadings] = useState<Record<string, { x: number; y: number }>>({});

  if (!parsed || !device || !layout || !active) {
    return <p className="muted">The ruler only measures device screens.</p>;
  }

  const els = layout.screens[active]!.filter((e) => e.kind === 'button' || e.kind === 'qr');
  const scale = Math.min(360 / layout.wMm, 420 / layout.hMm);
  const measure = (el: LayoutEl) => {
    const data = el.kind === 'button' ? rulerMeasurement(lab, propId, active, el.id) : null;
    if (!data) return;
    setReadings((m) => ({ ...m, [`${active}:${el.id}`]: { x: data.xMm as number, y: data.yMm as number } }));
    emit('app.action', { app: 'world', action: 'ruler.measured', data });
  };
  const measured = els.filter((e) => readings[`${active}:${e.id}`]);

  return (
    <div className="ruler">
      <div className="ruler__head">
        <Icon name="ruler" size={16} />
        <span>
          {DEVICE_TYPES[device.type]?.displayName ?? device.type} · {layout.wMm} × {layout.hMm} mm screen · ruler at (0,0) top-left
        </span>
      </div>
      {screens.length > 1 ? <Segmented value={active} onChange={(v: string) => setScreen(v)} options={screens.map((s) => ({ value: s, label: s }))} size="sm" /> : null}
      <div className="ruler__stage">
        <div className="ruler__scale ruler__scale--x" style={{ width: layout.wMm * scale }}>
          {ticks(layout.wMm).map((t) => (
            <span key={t} style={{ left: t * scale }} className={t % 10 === 0 ? 'is-major' : ''}>
              {t % 20 === 0 ? t : ''}
            </span>
          ))}
        </div>
        <div className="ruler__row">
          <div className="ruler__scale ruler__scale--y" style={{ height: layout.hMm * scale }}>
            {ticks(layout.hMm).map((t) => (
              <span key={t} style={{ top: t * scale }} className={t % 10 === 0 ? 'is-major' : ''}>
                {t % 20 === 0 ? t : ''}
              </span>
            ))}
          </div>
          <div className="ruler__screen" style={{ width: layout.wMm * scale, height: layout.hMm * scale }}>
            {els.map((e) => {
              const r = readings[`${active}:${e.id}`];
              return (
                <button
                  key={e.id}
                  type="button"
                  disabled={e.kind !== 'button'}
                  className={`ruler__el ruler__el--${e.kind}${r ? ' is-measured' : ''}`}
                  style={{ left: (e.x - e.w / 2) * scale, top: (e.y - e.h / 2) * scale, width: e.w * scale, height: e.h * scale }}
                  onClick={() => measure(e)}
                  title={e.kind === 'button' ? `Measure ${e.id}` : 'QR block'}
                >
                  {e.kind === 'qr' ? 'QR' : e.id}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      <table className="ruler__table">
        <thead>
          <tr>
            <th>{active}</th>
            <th>x (mm)</th>
            <th>y (mm)</th>
          </tr>
        </thead>
        <tbody>
          {measured.length ? (
            measured.map((e) => (
              <tr key={e.id}>
                <td>{e.id}</td>
                <td className="mono">{readings[`${active}:${e.id}`]!.x.toFixed(1)}</td>
                <td className="mono">{readings[`${active}:${e.id}`]!.y.toFixed(1)}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={3} className="muted">
                Click a button to read its centre from the top-left corner.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function ticks(maxMm: number): number[] {
  const out: number[] = [];
  for (let t = 0; t <= maxMm; t += 5) out.push(t);
  return out;
}
