/**
 * `DashboardSurface` — the World §5 status-tablet layout (1280 × 800 logical px) in DOM, hosted by the 3D
 * tablet overlay (`host='tablet'`) and the desktop LabSim Robot Dashboard (`host='dashboard'`), Apps §10.
 * Every button → `sim.rig.command(rigId, <RigCommandName>, 'player')`.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { getState, useGame } from '@/core/store';
import { sim } from '@/sim';
import type { RigCommandName } from '@/sim/events';
import type { BannerColor, RigState } from '@/sim/types';
import {
  MOTION_GROUPS,
  TABLET_JOG,
  TABLET_LAYOUT,
  TABLET_LOCKOUT,
  TABLET_MOTION_BUTTONS,
  TABLET_ROBOT_CONTROL_BUTTONS,
  TABLET_ROBOT_TAB,
  TABLET_STATES,
  TABLET_STATUS_TEXT,
  type TabletButton,
} from '@/render2d/api';
import { emitAppAction, fmtMm, fmtTime24, type DashboardTab } from '../../apps';
import { playSound } from '../../shell/engineBridge';
import { reach } from '../../shell/reach';
import { screenMm } from '../../shell/deviceTypes';
import './dashboard.css';

export type SurfaceHost = 'tablet' | 'dashboard';

export interface DashboardSurfaceProps {
  /** Rig id = Orca robot Name ("wall-e"). */
  robotId: string;
  /** 'tablet' = the 3D status tablet overlay (USB reachability), 'dashboard' = the desktop app (network). */
  host: SurfaceHost;
  /** Controlled tab (desktop app: from its route). Uncontrolled when omitted. */
  tab?: DashboardTab;
  onTabChange?(tab: DashboardTab): void;
  /** Keys 1/2/3 switch tabs while true. */
  keyboard?: boolean;
}

const GLYPH: Record<BannerColor, string> = { green: '●', yellow: '▲', grey: '■', red: '✖' };
const TABS: DashboardTab[] = ['robot', 'robot-control', 'motion-control'];
const top = (baseline: number, size: number) => baseline - size * 0.8;

let measureCtx: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, font: string, sizePx: number): number {
  if (measureCtx === undefined) {
    try {
      measureCtx = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
    } catch {
      measureCtx = null;
    }
  }
  if (!measureCtx) return text.length * sizePx * 0.62;
  measureCtx.font = font;
  return measureCtx.measureText(text).width;
}

function fitSize(text: string, weight: number, size: number, min: number, maxW: number): number {
  let s = size;
  while (s > min && textWidth(text, `${weight} ${s}px system-ui, sans-serif`, s) > maxW) s -= 1;
  return s;
}

/** Network/USB reachability of a rig's controller for a host (Apps §10, §0.5). */
export function useControllerReach(robotId: string, host: SurfaceHost): { ok: boolean; netError: string | null; piIp: string | null } {
  return useGame((s) => {
    const rig = s.lab.rigs[robotId];
    const pi = rig?.piHostId ? s.lab.hosts[rig.piHostId] : undefined;
    const piIp = pi?.ip ?? null;
    if (!rig) return NO_RIG;
    const usbOk = rig.tablet?.reachable !== false && rig.mainSwitch !== false && rig.banner !== 'grey';
    if (host === 'tablet') return usbOk ? OK_REACH : GREY_REACH;
    const r = piIp ? reach(s.lab, piIp, 8000) : 'ok';
    if (r !== 'ok') return cache(`net:${r}:${piIp}`, { ok: false, netError: r, piIp });
    return usbOk ? cache(`ok:${piIp}`, { ok: true, netError: null, piIp }) : cache(`grey:${piIp}`, { ok: false, netError: null, piIp });
  });
}
const NO_RIG = { ok: false, netError: null, piIp: null };
const OK_REACH = { ok: true, netError: null, piIp: null };
const GREY_REACH = { ok: false, netError: null, piIp: null };
const reachCache = new Map<string, { ok: boolean; netError: string | null; piIp: string | null }>();
function cache(k: string, v: { ok: boolean; netError: string | null; piIp: string | null }) {
  const hit = reachCache.get(k);
  if (hit) return hit;
  reachCache.set(k, v);
  return v;
}

/** `Java/uia-remote-regression-flex #4120` or `Local run · TaxTest (ws-17)`. */
export function lockHolder(rig: RigState): string {
  const lab = getState().lab;
  if (rig.lockedBy?.kind === 'local') {
    const t = lab.workstation?.locallyRunningTest?.testName ?? rig.lockedBy.ref;
    return `Local run · ${t} (ws-17)`;
  }
  const ref = rig.lockedBy?.ref ?? lab.orca.robots[rig.orcaRobotId]?.checkout?.buildId ?? '';
  return ref.replace(/#(\d+)$/, ' #$1');
}

function Header(props: { rig: RigState; banner: BannerColor; statusText: string; hrn: string; colourBlind: boolean }) {
  const { banner } = props;
  const [layers, setLayers] = useState<{ prev: BannerColor | null; cur: BannerColor; key: number }>({ prev: null, cur: banner, key: 0 });
  useEffect(() => {
    setLayers((l) => (l.cur === banner ? l : { prev: l.cur, cur: banner, key: l.key + 1 }));
  }, [banner]);
  const L = TABLET_LAYOUT;
  const nameSize = fitSize(props.hrn, 800, L.robotName.sizePx, 28, L.robotName.maxWidthPx);
  const status = `${props.colourBlind ? `${GLYPH[banner]} ` : ''}${L.statusLine.prefix}${props.statusText}`;
  const single = fitSize(status, 500, L.statusLine.sizePx, L.statusLine.minSizePx, L.statusLine.maxWidthPx);
  const fits = textWidth(status, `500 ${single}px system-ui, sans-serif`, single) <= L.statusLine.maxWidthPx;
  const statusSize = fits ? single : L.statusLine.minSizePx;
  const statusStyle: CSSProperties = fits
    ? { fontSize: statusSize, top: top(L.statusLine.baseline, statusSize), whiteSpace: 'nowrap' }
    : { fontSize: statusSize, top: top(30, statusSize), lineHeight: '16.5px', maxHeight: 34, overflow: 'hidden' };
  return (
    <div className="rdash-header">
      {layers.prev ? <div className={`rdash-grad rdash-grad-${layers.prev}`} /> : null}
      <div key={layers.key} className={`rdash-grad rdash-grad-${layers.cur}${layers.prev ? ' rdash-wipe' : ''}`} />
      <div className="rdash-name" style={{ top: top(L.robotName.baseline, nameSize), fontSize: nameSize }}>
        {props.hrn}
      </div>
      <div className="rdash-logo" aria-hidden="true">
        <svg width="50" height="50" viewBox="0 0 50 50">
          <g fill="currentColor">
            <circle cx="13" cy="13" r="11" />
            <circle cx="37" cy="13" r="11" />
            <circle cx="13" cy="37" r="11" />
            <circle cx="37" cy="37" r="11" />
          </g>
        </svg>
        <span>lab</span>
      </div>
      <div className="rdash-status" style={statusStyle}>
        {status}
      </div>
      <div className="rdash-board">{props.rig.tablet?.brainbox || 'Brainbox v6'}</div>
    </div>
  );
}

function RigButton(props: {
  b: TabletButton;
  active: boolean;
  pulse: boolean;
  pressed: boolean;
  rejected: boolean;
  onPress(b: TabletButton): void;
  host: SurfaceHost;
}) {
  const { b } = props;
  const style: CSSProperties = { left: b.rect.x, top: b.rect.y, width: b.rect.w, height: b.rect.h };
  return (
    <button
      type="button"
      className={`rdash-btn rdash-btn-${b.color}${b.lines.length > 1 ? ' rdash-btn-multi' : ''}${props.active ? ' rdash-btn-active' : ''}${props.pulse ? ' rdash-btn-pulse' : ''}${props.pressed ? ' rdash-btn-pressed' : ''}${props.rejected ? ' rdash-btn-reject' : ''}`}
      style={style}
      onClick={() => props.onPress(b)}
      data-hint={`rdash.button:${b.command}`}
      aria-label={`${b.group} ${b.lines.join(' ')}`}
    >
      {b.lines.map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </button>
  );
}

function evalActive(rig: RigState, cond: string | undefined): boolean {
  if (!cond) return false;
  const neg = cond.startsWith('!');
  const expr = neg ? cond.slice(1) : cond;
  let v = false;
  const inM = /^(\w+) in \((.*)\)$/.exec(expr);
  if (inM) {
    const val = (rig as unknown as Record<string, unknown>)[inM[1]!];
    v = typeof val === 'string' && inM[2]!.split(',').map((x) => x.trim().replace(/^'|'$/g, '')).includes(val);
  } else if (expr === 'steppersEnabled') v = !!rig.steppersEnabled;
  else if (expr === 'solenoid.down') v = !!rig.solenoid?.down;
  return neg ? !v : v;
}

export function DashboardSurface(props: DashboardSurfaceProps) {
  const { robotId, host } = props;
  const rig = useGame((s) => s.lab.rigs[robotId]);
  const robot = useGame((s) => (rig ? s.lab.orca.robots[rig.orcaRobotId] : undefined));
  const devices = useGame((s) => s.lab.orca.devices);
  const piIp = useGame((s) => (rig?.piHostId ? (s.lab.hosts[rig.piHostId]?.ip ?? null) : null));
  const colourBlind = useGame((s) => (s.progress.settings?.colourBlind ?? 'off') !== 'off');
  const reachInfo = useControllerReach(robotId, host);
  const [localTab, setLocalTab] = useState<DashboardTab>(() => rig?.tablet?.tab ?? 'motion-control');
  const tab = props.tab ?? localTab;
  const [pressed, setPressed] = useState<string | null>(null);
  const [rejected, setRejected] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [shake, setShake] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const locked = !!rig?.dashboardLocked;
  const reachable = reachInfo.ok;

  // Lockout shown: once per lock period.
  const lockShownFor = useRef<string | null>(null);
  useEffect(() => {
    if (!rig || !locked || !reachable) {
      if (!locked) lockShownFor.current = null;
      return;
    }
    const holder = lockHolder(rig);
    if (lockShownFor.current === holder) return;
    lockShownFor.current = holder;
    emitAppAction(host, `${host}.lockout.shown` as 'tablet.lockout.shown', { robot: robotId, holder, blockedClick: false });
  }, [locked, reachable, rig, host, robotId]);

  const selectTab = (t: DashboardTab) => {
    if (props.onTabChange) props.onTabChange(t);
    else setLocalTab(t);
    if (host === 'tablet') {
      try {
        sim.rig.setTabletTab(robotId, t);
      } catch {
        /* sim not landed */
      }
    }
    emitAppAction(host, `${host}.tab.opened` as 'tablet.tab.opened', { robot: robotId, tab: t });
  };

  // Keys 1/2/3.
  const selectRef = useRef(selectTab);
  selectRef.current = selectTab;
  useEffect(() => {
    if (!props.keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return;
      const t = (e.target as HTMLElement | null)?.closest?.('input, textarea, select');
      if (t) return;
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i < 0) return;
      e.preventDefault();
      selectRef.current(TABS[i]!);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props.keyboard]);

  const send = (b: TabletButton, args?: { xMm?: number; yMm?: number }) => {
    if (!rig) return;
    setPressed(b.id);
    later(() => setPressed((p) => (p === b.id ? null : p)), 120);
    playSound('ui-click');
    let ok = false;
    let error: string | null = null;
    try {
      const r = sim.rig.command(robotId, b.command as RigCommandName, 'player', args);
      ok = r.ok;
      error = r.ok ? null : r.error;
    } catch (err) {
      console.warn('[dashboard] rig.command threw', err);
      error = 'Controller error';
    }
    if (error === 'not implemented') error = 'Controller error';
    if (!ok) {
      setRejected(b.id);
      later(() => setRejected((p) => (p === b.id ? null : p)), 200);
      playSound('ui-fail');
      if (error && error !== 'LOCKED') {
        setToast(error);
        later(() => setToast((t) => (t === error ? null : t)), 2000);
      }
    }
    emitAppAction(host, `${host}.command.sent` as 'tablet.command.sent', { robot: robotId, command: b.command as RigCommandName, ok, error });
  };

  const jog = (b: TabletButton) => {
    if (!rig) return;
    const g = rig.gantry;
    const w = Math.max(0, g.maxXMm - 10);
    const h = Math.max(0, g.maxYMm - 10);
    const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)) * 10) / 10;
    const dir = TABLET_JOG.dir[b.id];
    if (dir) {
      send(b, { xMm: clamp(g.xMm + dir[0] * step, g.minXMm ?? -10, g.maxXMm), yMm: clamp(g.yMm + dir[1] * step, g.minYMm ?? -10, g.maxYMm) });
    } else if (b.id === 'jog.tap') send(b, { xMm: g.xMm, yMm: g.yMm });
    else if (b.id === 'goto.origin') send(b, { xMm: 0, yMm: 0 });
    else if (b.id === 'goto.centre') send(b, { xMm: Math.round(w * 5) / 10, yMm: Math.round(h * 5) / 10 });
    else send(b, b.args ? { ...b.args } : undefined);
  };

  const blockedClick = () => {
    if (!rig) return;
    setShake((s) => s + 1);
    playSound('ui-fail', { volume: 0.3 });
    emitAppAction(host, `${host}.lockout.shown` as 'tablet.lockout.shown', { robot: robotId, holder: lockHolder(rig), blockedClick: true });
  };

  const hrn = rig?.tablet?.hrnShown || robot?.humanReadableName || robotId.toUpperCase();
  const banner: BannerColor = !rig ? 'grey' : reachable ? rig.banner : 'grey';
  const statusText = useMemo(() => {
    if (!rig) return TABLET_STATUS_TEXT.unreachable;
    if (!reachable && (reachInfo.netError || rig.banner !== 'grey')) return TABLET_STATUS_TEXT.unreachable;
    const raw = (rig.tablet?.statusText || rig.bannerText || '').replace(/^status:\s*/i, '');
    return raw || (rig.banner === 'yellow' ? TABLET_STATUS_TEXT.lockReleased : rig.banner === 'grey' ? TABLET_STATUS_TEXT.unreachable : TABLET_STATUS_TEXT.ok);
  }, [rig, reachable, reachInfo.netError]);

  return (
    <div className="rdash-surface" data-rig={robotId} data-host={host}>
      {rig ? <Header rig={rig} banner={banner} statusText={statusText} hrn={hrn} colourBlind={colourBlind} /> : <div className="rdash-header rdash-grad-grey" />}
      {TABS.map((t) => {
        const r = TABLET_LAYOUT.tabs[t];
        return (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className={`rdash-tab${tab === t ? ' rdash-tab-on' : ''}`}
            style={{ left: r.x, width: r.w }}
            onClick={() => selectTab(t)}
            data-hint={`rdash.tab:${t}`}
          >
            {TABLET_LAYOUT.tabLabels[t]}
          </button>
        );
      })}
      <div className="rdash-panel" />
      <div className={`rdash-heart${reachable ? ' rdash-heart-up' : ''}`} aria-hidden="true" />
      {!rig || !reachable ? (
        <div className="rdash-grey" role="status">
          <div className="rdash-spinner" />
          <div>{TABLET_STATES.unreachable.text}</div>
        </div>
      ) : tab === 'motion-control' ? (
        <>
          {MOTION_GROUPS.map((g) => (
            <div key={g.name} className="rdash-group" style={{ left: g.cx - 100, width: 200, top: top(330, 22) }}>
              {g.name}
            </div>
          ))}
          {TABLET_MOTION_BUTTONS.map((b) => (
            <RigButton
              key={b.id}
              b={b}
              host={host}
              active={evalActive(rig, b.activeWhen)}
              pulse={rig.banner === 'yellow' && b.group === 'Park'}
              pressed={pressed === b.id}
              rejected={rejected === b.id}
              onPress={(x) => send(x)}
            />
          ))}
        </>
      ) : tab === 'robot-control' ? (
        <>
          {TABLET_ROBOT_CONTROL_BUTTONS.map((b) => (
            <RigButton key={b.id} b={b} host={host} active={false} pulse={false} pressed={pressed === b.id} rejected={rejected === b.id} onPress={jog} />
          ))}
          <div className="rdash-steps" role="radiogroup" aria-label="Jog step">
            {TABLET_JOG.stepSelector.stepsMm.map((s, i) => (
              <button key={s} type="button" role="radio" aria-checked={step === s} className={`rdash-step${step === s ? ' rdash-step-on' : ''}`} onClick={() => setStep(s)}>
                {TABLET_JOG.stepSelector.labels[i]}
              </button>
            ))}
          </div>
          <div className="rdash-readout" style={{ left: TABLET_JOG.readout.x, top: TABLET_JOG.readout.y + 8 }}>
            X {fmtMm(rig.gantry.xMm)} Y {fmtMm(rig.gantry.yMm)}
          </div>
        </>
      ) : (
        <RobotTab rig={rig} devices={devices} piIp={piIp} />
      )}
      {toast && reachable ? (
        <div className="rdash-toast" role="alert">
          {toast}
        </div>
      ) : null}
      {rig && locked && reachable ? (
        <div key={shake} className={`rdash-lock${shake ? ' rdash-shake' : ''}`} onClick={blockedClick} role="alert" aria-label={TABLET_LOCKOUT.line1.text}>
          <svg className="rdash-abs" style={{ left: 640 - 48, top: TABLET_LOCKOUT.padlock.y - 112 - 48 }} width="96" height="96" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 10V7a6 6 0 0112 0v3h1.5v12h-15V10zm2.5 0h7V7a3.5 3.5 0 00-7 0z" fill="#fff" />
          </svg>
          <div className="rdash-lock-line" style={{ top: top(TABLET_LOCKOUT.line1.baseline, 34) - 112, fontSize: 34, fontWeight: 700, color: '#fff' }}>
            {TABLET_LOCKOUT.line1.text}
          </div>
          <div className="rdash-lock-line" style={{ top: top(TABLET_LOCKOUT.line2.baseline, 24) - 112, fontSize: 24, color: TABLET_LOCKOUT.line2.color }}>
            {lockHolder(rig)}
          </div>
          <div className="rdash-lock-line" style={{ top: top(TABLET_LOCKOUT.line3.baseline, 20) - 112, fontSize: 20, color: TABLET_LOCKOUT.line3.color }}>
            {TABLET_LOCKOUT.line3.text}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RobotTab(props: { rig: RigState; devices: Record<number, { name: string; deviceType: string; serial: string; ip: string }>; piIp: string | null }) {
  const { rig, devices, piIp } = props;
  const robot = useGame((s) => s.lab.orca.robots[rig.orcaRobotId]);
  const T = TABLET_ROBOT_TAB;
  const dev = robot?.deviceId != null ? devices[robot.deviceId] : undefined;
  const values: React.ReactNode[] = [
    robot?.name ?? rig.id,
    robot?.humanReadableName ?? '',
    robot ? (
      <span className="rdash-chip" style={{ background: T.statusChips[robot.status] }}>
        {{ AVAILABLE: 'Available', UNAVAILABLE: 'Unavailable', OFFLINE: 'Offline', CONNECTION_FAILED: 'Connection Failed', RESERVED: 'Reserved' }[robot.status]}
      </span>
    ) : (
      '—'
    ),
    dev ? `${dev.deviceType} · ${dev.serial}` : '—',
    dev ? `${dev.ip}:5444` : '—',
    piIp ?? '—',
    robot?.cameraStreamUrl || '—',
    robot?.lastHealthCheckMs != null ? `${fmtTime24(robot.lastHealthCheckMs)} · ${robot.lastHealthCheckOk ? `${robot.lastHealth?.http ?? 200} OK` : 'FAIL'}` : '—',
    rig.magneticLock?.engaged ? 'ENGAGED' : 'RELEASED',
  ];
  const mm = dev ? screenMm(dev.deviceType, rig.probeDisplay === 'secondary' ? 'secondary' : 'primary') : { w: Math.max(10, rig.gantry.maxXMm - 10), h: Math.max(10, rig.gantry.maxYMm - 10) };
  const box = T.miniMap.rect;
  const k = Math.min((box.w - 60) / mm.w, (box.h - 40) / mm.h);
  const ox = box.x + (box.w - mm.w * k) / 2;
  const oy = box.y + 20;
  const dx = ox + rig.gantry.xMm * k;
  const dy = oy + rig.gantry.yMm * k;
  const color = rig.magneticLock?.engaged ? T.miniMap.ok : T.miniMap.released;
  return (
    <>
      {T.rows.map((label, i) => {
        const b = T.firstBaseline + i * T.pitch;
        return (
          <div key={label}>
            <div className="rdash-kv-label" style={{ top: top(b, 22) }}>
              {label}
            </div>
            <div className="rdash-kv-value" style={{ top: top(b, 24) - (i === 2 ? 4 : 0) }} title={typeof values[i] === 'string' ? (values[i] as string) : undefined}>
              {values[i]}
            </div>
          </div>
        );
      })}
      <div className="rdash-minimap" aria-hidden="true" />
      <svg className="rdash-abs" style={{ left: 0, top: 0, pointerEvents: 'none' }} width={1280} height={800} aria-hidden="true">
        <rect x={ox} y={oy} width={mm.w * k} height={mm.h * k} fill="#0b1120" stroke="#9fb3d6" strokeWidth={2} />
        <line x1={dx} x2={dx} y1={oy - 6} y2={oy + mm.h * k + 6} stroke={color} strokeWidth={1} strokeDasharray="4 3" />
        <line y1={dy} y2={dy} x1={ox - 6} x2={ox + mm.w * k + 6} stroke={color} strokeWidth={1} strokeDasharray="4 3" />
        <circle cx={dx} cy={dy} r={T.miniMap.dotPx / 2} fill={color} />
      </svg>
      <div className="rdash-readout" style={{ left: box.x, top: top(T.miniMap.readoutBaseline, 24) }}>
        X {fmtMm(rig.gantry.xMm)} mm{'   '}Y {fmtMm(rig.gantry.yMm)} mm
      </div>
      <div className="rdash-readout" style={{ left: box.x, top: top(T.miniMap.homeBaseline, 20), fontSize: 20, color: '#9fb3d6' }}>
        {T.miniMap.homeText}
      </div>
    </>
  );
}

/** Scales a 1280 × 800 surface to fit its parent (crisp DOM text, no canvas). */
export function FitSurface(props: { children: React.ReactNode; maxScale?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.5);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w && h) setK(Math.min(w / 1280, h / 800, props.maxScale ?? 4));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [props.maxScale]);
  return (
    <div className="rdash-fit" ref={ref}>
      <div className="rdash-scaler" style={{ transform: `scale(${k})`, left: `calc(50% - ${640 * k}px)`, top: `calc(50% - ${400 * k}px)` }}>
        {props.children}
      </div>
    </div>
  );
}
