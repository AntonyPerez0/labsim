/**
 * Live screen textures (World §3.5, §5, §10.5): every LabSim display and status tablet owns a
 * canvas + CanvasTexture on an unlit `screenLit` plane. Redraws happen only when the bound state
 * changed (`display.rev`, power, screen, the minute on clock screens, ripples / short animations),
 * round-robin with ≤ 3 device and ≤ 2 tablet redraws per frame. Missing sim objects render a
 * healthy default (lock screen / dark CFD / green tablet).
 */
import { CanvasTexture, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial, SRGBColorSpace, type Mesh } from 'three';
import { store } from '@/core/store';
import { bus } from '@/core/bus';
import type { QualityPreset } from '@/core/state';
import { render2d, screenCanvasSize, TABLET_CANVAS_BY_PRESET, SCREEN_BRIGHTNESS_SCALE, type TabletTab } from '@/render2d';
import { createTerminalDevice, createDisplayState, createRigState } from '@/sim';
import type { BannerColor, TerminalDevice, DeviceTypeCode, LabState, OrcaRobot, RigState, ScreenName } from '@/sim/types';

const ANIMATED: ReadonlySet<string> = new Set(['processing', 'boot', 'printing', 'payment-prompt', 'customer-idle', 'deprovisioning']);
/** Redraw interval (ms) of animated screens; the near-black screensaver leaf drifts 2 mm/s, so 1 Hz is plenty. */
const ANIM_INTERVAL_MS: Readonly<Record<string, number>> = { 'customer-idle': 1000 };
const CLOCK: ReadonlySet<string> = new Set(['lock', 'home', 'register', 'review-order', 'tender-select', 'app-orders', 'app-transactions', 'app-setup']);

export interface DeviceDisplayBinding {
  key: string;
  mesh: Mesh;
  wMm: number;
  hMm: number;
  type: DeviceTypeCode;
  which: 'primary' | 'secondary';
  /** Resolve the live device + display (undefined = sim object missing → fallback). */
  resolve(lab: LabState): { device: TerminalDevice; display: 'primary' | 'secondary' } | undefined;
  /** Fallback look when the sim has no device here. */
  fallback: ScreenName;
  /** False while this display's mesh is not part of the visible configuration (JOHNNY-5 swap). */
  active?: () => boolean;
}

interface DeviceSlot {
  b: DeviceDisplayBinding;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: CanvasTexture;
  mat: MeshBasicMaterial;
  sig: string;
  dirty: boolean;
  pxPerMm: number;
  fallbackDev: TerminalDevice | null;
  lastAnim: number;
}

export interface TabletBinding {
  rigId: string;
  hrn: string;
  mesh: Mesh;
  resolve(lab: LabState): RigState | undefined;
}

interface TabletSlot {
  b: TabletBinding;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: CanvasTexture;
  mat: MeshBasicMaterial;
  sig: string;
  lastDraw: number;
  mainOnAt: number | null;
  lastMain: boolean;
  banner: BannerColor;
  wipeFrom: BannerColor | null;
  wipeAt: number;
  fallbackRig: RigState;
  pressed: { id: string; at: number } | null;
}

function makeTex(canvas: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  return t;
}

export class ScreenManager {
  private readonly devices: DeviceSlot[] = [];
  private readonly tablets: TabletSlot[] = [];
  private readonly ripples = new Map<string, { x: number; y: number; at: number }>();
  private rr = 0;
  private rrT = 0;
  private quality: QualityPreset = 'high';
  private readonly offs: (() => void)[] = [];
  /** Focused display key renders at native resolution (World §3.5). */
  focusedKey: string | null = null;

  constructor() {
    this.quality = store.getState().progress?.settings?.quality ?? 'high';
    this.offs.push(
      bus.on('device.touched', (p) => {
        this.ripples.set(`${p.deviceId}:${p.display}`, { x: p.xMm, y: p.yMm, at: performance.now() });
      }),
    );
  }

  dispose(): void {
    for (const o of this.offs) o();
  }

  addDevice(b: DeviceDisplayBinding): void {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const tex = makeTex(canvas);
    const mat = new MeshBasicMaterial({ map: tex, toneMapped: true });
    mat.name = 'screenLit';
    b.mesh.material = mat;
    const slot: DeviceSlot = { b, canvas, ctx, tex, mat, sig: '', dirty: true, pxPerMm: 1, fallbackDev: null, lastAnim: 0 };
    this.size(slot);
    this.devices.push(slot);
  }

  addTablet(b: TabletBinding): void {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const tex = makeTex(canvas);
    const mat = new MeshBasicMaterial({ map: tex, toneMapped: true });
    mat.name = 'tabletLit';
    mat.color.setScalar(SCREEN_BRIGHTNESS_SCALE * 0.95);
    b.mesh.material = mat;
    const fallbackRig = createRigState(b.rigId, 0, 'touch', {
      tablet: { tab: 'motion-control', statusText: 'Status: OK', brainbox: 'Brainbox v6', hrnShown: b.hrn, reachable: true },
    });
    const slot: TabletSlot = { b, canvas, ctx, tex, mat, sig: '', lastDraw: -1e9, mainOnAt: null, lastMain: true, banner: 'green', wipeFrom: null, wipeAt: 0, fallbackRig, pressed: null };
    this.sizeTablet(slot);
    this.tablets.push(slot);
  }

  /** Visual press feedback on a tablet button (World §5.2). */
  pressTablet(rigId: string, buttonId: string): void {
    const t = this.tablets.find((x) => x.b.rigId === rigId);
    if (t) t.pressed = { id: buttonId, at: performance.now() };
  }

  private size(s: DeviceSlot): void {
    const focused = this.focusedKey === s.b.key;
    let { w, h, pxPerMm } = screenCanvasSize(s.b.wMm, s.b.hMm, this.quality);
    if (focused) {
      const k = Math.min(12, 2048 / Math.max(s.b.wMm, s.b.hMm));
      w = Math.ceil(s.b.wMm * k);
      h = Math.ceil(s.b.hMm * k);
      pxPerMm = k;
    }
    if (s.canvas.width !== w || s.canvas.height !== h) {
      s.canvas.width = w;
      s.canvas.height = h;
      s.tex.dispose();
      s.tex = makeTex(s.canvas);
      s.mat.map = s.tex;
      s.mat.needsUpdate = true;
    }
    s.pxPerMm = pxPerMm;
    s.dirty = true;
  }

  private sizeTablet(t: TabletSlot): void {
    const { w, h } = TABLET_CANVAS_BY_PRESET[this.quality];
    if (t.canvas.width !== w || t.canvas.height !== h) {
      t.canvas.width = w;
      t.canvas.height = h;
      t.tex.dispose();
      t.tex = makeTex(t.canvas);
      t.mat.map = t.tex;
      t.mat.needsUpdate = true;
    }
    t.sig = '';
  }

  setFocused(key: string | null): void {
    if (this.focusedKey === key) return;
    const prev = this.devices.find((d) => d.b.key === this.focusedKey);
    this.focusedKey = key;
    if (prev) this.size(prev);
    const cur = this.devices.find((d) => d.b.key === key);
    if (cur) this.size(cur);
  }

  update(lab: LabState, nowMs: number): void {
    const q = store.getState().progress?.settings?.quality ?? 'high';
    if (q !== this.quality) {
      this.quality = q;
      for (const d of this.devices) this.size(d);
      for (const t of this.tablets) this.sizeTablet(t);
    }
    this.updateDevices(lab, nowMs);
    this.updateTablets(lab, nowMs);
  }

  private fallback(s: DeviceSlot): TerminalDevice {
    if (!s.fallbackDev) {
      s.fallbackDev = createTerminalDevice(`fallback:${s.b.key}`, s.b.type, {
        display: createDisplayState(s.b.fallback, s.b.fallback === 'customer-idle' ? { brightness: 0.04 } : {}),
        secondaryDisplay: s.b.type.startsWith('STATION_DUO') ? createDisplayState(s.b.fallback === 'lock' ? 'customer-idle' : s.b.fallback) : null,
      });
    }
    return s.fallbackDev;
  }

  private updateDevices(lab: LabState, nowMs: number): void {
    const minute = Math.floor((lab.time?.nowMs ?? 0) / 60000);
    const queue: DeviceSlot[] = [];
    for (const s of this.devices) {
      const active = s.b.active ? s.b.active() : true;
      const r = s.b.resolve(lab);
      const dev = r?.device ?? this.fallback(s);
      const which = r ? r.display : s.b.which;
      const ds = which === 'secondary' ? dev.secondaryDisplay : dev.display;
      const on = active && !!ds && dev.power !== 'off' && dev.power !== 'fried' && ds.screen !== 'off' && ds.brightness > 0;
      s.b.mesh.visible = on;
      if (!on || !ds) continue;
      s.mat.color.setScalar(SCREEN_BRIGHTNESS_SCALE * Math.max(0.04, Math.min(1, ds.brightness)));
      const rip = this.ripples.get(`${dev.id}:${which}`);
      const ripAge = rip ? nowMs - rip.at : 1e9;
      const anim = ANIMATED.has(ds.screen) || ripAge < 1000 || !!ds.toast;
      const sig = `${dev.id}|${which}|${ds.rev}|${ds.screen}|${dev.power}|${dev.theme}|${CLOCK.has(ds.screen) ? minute : 0}|${lab.flags?.showTouchTargets ? 1 : 0}|${s.pxPerMm}`;
      if (sig !== s.sig) {
        s.sig = sig;
        s.dirty = true;
      } else if (anim && nowMs - s.lastAnim > (ripAge < 1000 || ds.toast ? 100 : ANIM_INTERVAL_MS[ds.screen] ?? 100)) s.dirty = true;
      if (s.dirty) queue.push(s);
    }
    if (queue.length === 0) return;
    const n = Math.min(3, queue.length);
    for (let i = 0; i < n; i++) {
      const s = queue[(this.rr + i) % queue.length]!;
      this.drawDevice(s, lab, nowMs);
    }
    this.rr = (this.rr + n) % Math.max(1, queue.length);
  }

  private drawDevice(s: DeviceSlot, lab: LabState, nowMs: number): void {
    const r = s.b.resolve(lab);
    const dev = r?.device ?? this.fallback(s);
    const which = r ? r.display : s.b.which;
    const rip = this.ripples.get(`${dev.id}:${which}`);
    const ageMs = rip ? nowMs - rip.at : 1e9;
    try {
      render2d.drawDeviceDisplay(s.ctx, lab, dev, which, {
        pxPerMm: s.pxPerMm,
        timeMs: nowMs,
        ripple: rip && ageMs < 1000 ? { xMm: rip.x, yMm: rip.y, ageMs } : null,
        showTapRipple: true,
      });
    } catch (err) {
      s.ctx.fillStyle = '#000';
      s.ctx.fillRect(0, 0, s.canvas.width, s.canvas.height);
      console.warn('[world-rigs] screen draw failed', s.b.key, err);
    }
    s.tex.needsUpdate = true;
    s.dirty = false;
    s.lastAnim = nowMs;
  }

  private robotFor(lab: LabState, rigId: string, hrn: string): OrcaRobot {
    const robots = lab.orca?.robots ?? {};
    for (const k in robots) {
      const r = robots[k as unknown as number];
      if (r && r.name === rigId) return r;
    }
    return { id: 0, name: rigId, humanReadableName: hrn, status: 'AVAILABLE' } as unknown as OrcaRobot;
  }

  private updateTablets(lab: LabState, nowMs: number): void {
    let budget = 2;
    const n = this.tablets.length;
    for (let i = 0; i < n; i++) {
      const t = this.tablets[(this.rrT + i) % n]!;
      const rig = t.b.resolve(lab) ?? t.fallbackRig;
      const main = rig.mainSwitch !== false;
      if (main && !t.lastMain) t.mainOnAt = nowMs;
      t.lastMain = main;
      t.b.mesh.visible = main;
      if (!main) continue;
      if (rig.banner !== t.banner) {
        t.wipeFrom = t.banner;
        t.wipeAt = nowMs;
        t.banner = rig.banner;
      }
      const sinceOn = t.mainOnAt === null ? 1e9 : nowMs - t.mainOnAt;
      const boot: 'black' | 'splash' | 'connecting' | null = sinceOn < 1000 ? 'black' : sinceOn < 4000 ? 'splash' : !rig.tablet?.reachable && sinceOn < 60000 && rig.banner !== 'grey' ? 'connecting' : null;
      const wiping = t.wipeFrom !== null && nowMs - t.wipeAt < 300;
      if (!wiping) t.wipeFrom = null;
      const pressed = t.pressed && nowMs - t.pressed.at < 160 ? t.pressed.id : null;
      const robot = this.robotFor(lab, t.b.rigId, t.b.hrn);
      const sig = `${rig === t.fallbackRig ? 'fb' : 'live'}|${rig.tablet?.tab}|${rig.tablet?.statusText}|${rig.banner}|${rig.dashboardLocked}|${rig.steppersEnabled}|${rig.dipArm}|${rig.tapArm}|${rig.phonePusher}|${rig.solenoid?.down}|${rig.magneticLock?.engaged}|${Math.round(rig.gantry.xMm * 10)}|${Math.round(rig.gantry.yMm * 10)}|${robot.humanReadableName}|${robot.status}|${boot}|${pressed}|${t.canvas.width}`;
      const periodic = nowMs - t.lastDraw > (wiping ? 33 : rig.banner === 'yellow' ? 100 : 500);
      if ((sig !== t.sig || periodic) && budget > 0) {
        budget--;
        t.sig = sig;
        t.lastDraw = nowMs;
        try {
          render2d.drawTablet(t.ctx, lab, rig, robot, {
            widthPx: t.canvas.width,
            heightPx: t.canvas.height,
            tab: (rig.tablet?.tab ?? 'motion-control') as TabletTab,
            timeMs: nowMs,
            boot,
            wipe: wiping && t.wipeFrom ? { from: t.wipeFrom, progress01: (nowMs - t.wipeAt) / 300 } : null,
            pressedButtonId: pressed,
            colorBlind: (store.getState().progress?.settings?.colourBlind ?? 'off') !== 'off',
          });
        } catch (err) {
          console.warn('[world-rigs] tablet draw failed', t.b.rigId, err);
        }
        t.tex.needsUpdate = true;
      }
    }
    this.rrT = (this.rrT + 1) % Math.max(1, n);
  }
}
