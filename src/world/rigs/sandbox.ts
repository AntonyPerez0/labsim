/**
 * World-rigs sandbox (sandbox-world-rigs.html): boots the engine, optionally the lab room
 * (`?lab=0` skips it), and `buildRigs`, ticks the sim when implemented and otherwise seeds a demo
 * lab (rigs + devices from the sim factories) so bindings, animation and screens can be checked.
 * `window.__rigs` exposes named views, demo drivers and flat 2D previews of screens / tablets.
 */
import { engine } from '@/engine';
import { mutate, store } from '@/core/store';
import type { QualityPreset, ToolId } from '@/core/state';
import { sim, createTerminalDevice, createDisplayState, createOrderState, createRigState } from '@/sim';
import type { DeviceTypeCode, LabState, ScreenName } from '@/sim/types';
import { displaySizeMm, render2d, screenCanvasSize } from '@/render2d';
import { ADB_RIGS, LOCATIONS, TETHERED_RIGS, TOUCH_RIGS, tipWorld } from '../layout';
import { rigConfigFor as deviceConfigFor } from './rigConfig';
import { buildRigs, rigsWorld } from './index';
import { setHitProxiesVisible } from './kit/moving';
import { missingRigInteractables } from './interact';
import { registry } from './interactCommon';

type V3 = [number, number, number];

const VIEWS: Record<string, { pos: V3; look: V3; fov?: number }> = {
  'img-t': { pos: [-2.6, 1.6, -1.1], look: [-2.6, 1.56, -1.64], fov: 62 },
  'img-t-wide': { pos: [-2.62, 1.62, -0.95], look: [-2.6, 1.6, -1.8], fov: 70 },
  'img-g': { pos: [-3.22, 1.66, -1.72], look: [-2.62, 1.56, -2.12], fov: 62 },
  'img-r': { pos: [2.55, 1.3, -0.75], look: [2.4, 1.1, -2.1], fov: 43 },
  vid: { pos: [-2.98, 1.64, -1.86], look: [-2.6, 1.535, -1.93], fov: 38 },
  'rack-a': { pos: [-2.6, 1.3, 0.4], look: [-2.6, 1.0, -2.1], fov: 60 },
  'rack-row': { pos: [-0.5, 1.6, 1.2], look: [-2.0, 1.1, -2.2], fov: 60 },
  'rack-b': { pos: [-1.4, 1.3, 0.4], look: [-1.4, 1.0, -2.1], fov: 60 },
  callus: { pos: [-2.0, 1.4, -0.6], look: [-2.0, 1.0, -2.1], fov: 60 },
  adb: { pos: [0.85, 1.4, -0.4], look: [0.85, 0.9, -1.9], fov: 60 },
  tethered: { pos: [2.4, 1.45, -0.6], look: [2.4, 1.15, -2.05], fov: 60 },
  'build-table': { pos: [-4.4, 1.7, 2.0], look: [-4.4, 0.9, 0.6], fov: 60 },
  rear: { pos: [-2.0, 1.4, -3.9], look: [-2.0, 1.0, -2.1], fov: 70 },
  'bay-r2d2': { pos: [-3.25, 0.95, -1.95], look: [-2.6, 0.66, -2.1], fov: 60 },
  'bay-bumblebee': { pos: [-3.2, 0.55, -1.9], look: [-2.6, 0.22, -2.1], fov: 60 },
  'bay-johnny5': { pos: [-0.75, 1.62, -1.95], look: [-1.4, 1.55, -2.05], fov: 60 },
  'bay-baymax': { pos: [-0.75, 0.95, -1.95], look: [-1.4, 0.66, -2.1], fov: 60 },
};

declare global {
  interface Window {
    __rigs?: Record<string, unknown>;
  }
}

function lookAt(pos: V3, look: V3, fov?: number): void {
  const dx = look[0] - pos[0];
  const dy = look[1] - pos[1];
  const dz = look[2] - pos[2];
  void engine.focus({ position: pos, lookAt: look, fov: fov ?? 60 }, 1);
  void dx;
  void dy;
  void dz;
}

/** Seed rigs + devices from the sim factories when the sim has not seeded them (demo only). */
function seedDemoLab(): void {
  mutate((s) => {
    const lab = s.lab as LabState;
    if (Object.keys(lab.rigs ?? {}).length > 0) return;
    const screens: Record<string, ScreenName> = { 'wall-e': 'payment-prompt', eve: 'register', 'r2-d2': 'register', bumblebee: 'home', 'johnny-5': 'lock', seti: 'pin-entry', baymax: 'home', rosie: 'receipt-options' };
    let n = 1;
    for (const r of TOUCH_RIGS) {
      const cfg = deviceConfigFor(r);
      const devId = `dev-${r.sim.orcaDeviceNames[0]}`;
      lab.rigs[r.id] = createRigState(r.id, n++, r.simKind, {
        gantry: { ...createRigState('x', 0, 'touch').gantry, maxXMm: cfg.maxMm[0], maxYMm: cfg.maxMm[1] },
        deviceIds: [devId],
        piHostId: r.sim.piHostId,
        tablet: { tab: 'motion-control', statusText: 'Status: OK', brainbox: 'Brainbox v6', hrnShown: r.hrn, reachable: true },
        webcam: { connected: true, aimedOk: true, cameraId: r.sim.cameraViewId, aimOffsetDeg: { yaw: 0, pitch: 0 } },
      });
      const scr = screens[r.id] ?? 'home';
      lab.devices[devId] = createTerminalDevice(devId, cfg.type, {
        rigId: r.id,
        serial: `SIM-${cfg.type.replace('_', '')}-${String(n).padStart(4, '0')}`,
        display: createDisplayState(scr, { rev: 1 }),
        secondaryDisplay: cfg.type === 'STATION_DUO' ? createDisplayState('customer-cart', { rev: 1 }) : null,
        order: createOrderState('ORD-1001', { lines: [{ name: 'Tax Item 5', priceCents: 1000, qty: 1, taxable: true }], subtotalCents: 1000, taxCents: 83, totalCents: 1083 }),
        apps: ['Register', 'Orders', 'Transactions', 'Sale', 'Authorizations', 'Customers', 'Items', 'Reports', 'Employees', 'Inventory', 'Rewards', 'Gift Cards', 'Help', 'App Market', 'Settings', 'Setup'],
      });
    }
    for (const r of TETHERED_RIGS) {
      const mfd = `dev-${r.id}-mfd`;
      const cfd = `dev-${r.id}-cfd`;
      lab.rigs[r.id] = createRigState(r.id, n++, 'tethered', { deviceIds: [mfd, cfd], webcam: { connected: true, aimedOk: true, cameraId: 'cam-tethered', aimOffsetDeg: { yaw: 0, pitch: 0 } } });
      lab.devices[mfd] = createTerminalDevice(mfd, r.mfd.deviceType, { rigId: r.id, role: 'mfd', display: createDisplayState('lock', { rev: 1 }) });
      lab.devices[cfd] = createTerminalDevice(cfd, r.cfd.deviceType, { rigId: r.id, role: 'cfd', display: createDisplayState('customer-idle', { rev: 1, brightness: 0.04 }) });
    }
    for (const r of ADB_RIGS) {
      const id = `dev-${r.sim.orcaDeviceNames[0]}`;
      lab.rigs[r.id] = createRigState(r.id, n++, 'adb', { deviceIds: [id] });
      lab.devices[id] = createTerminalDevice(id, r.deviceType, { rigId: r.id, display: createDisplayState(r.id === 'data' ? 'customer-cart' : 'home', { rev: 1 }) });
    }
    lab.time.nowMs = (15 * 60 + 45) * 60000;
  });
}

function demoMutateRig(id: string, fn: (r: LabState['rigs'][string], lab: LabState) => void): void {
  mutate((s) => {
    const r = (s.lab as LabState).rigs[id];
    if (r) fn(r, s.lab as LabState);
  });
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const params = new URLSearchParams(location.search);
  const q = (params.get('q') as QualityPreset | null) ?? 'high';
  mutate((s) => {
    s.ui.overlay = { kind: 'none' };
    s.ui.loading = null;
    s.session.mode = 'freeplay';
    s.session.inventory = ['hand', 'flashlight', 'multimeter', 'spare-fuse-5v', 'screwdriver', 'test-card-visa', 'ethernet-cable'];
    s.session.activeTool = 'hand';
    s.progress.settings.quality = q;
  });
  let simOk = true;
  let simErrors = 0;
  try {
    sim.reset();
  } catch {
    simOk = false;
  }
  seedDemoLab();
  await engine.init(canvas);
  engine.setQuality(q);
  for (const l of LOCATIONS) engine.registerLocation({ id: l.id, label: l.label, center: l.center, radius: l.radius });
  const status = document.getElementById('stats')!;
  if (params.get('lab') !== '0') {
    try {
      const { buildLab } = await import('../lab');
      await buildLab(engine, (p, l) => (status.textContent = `lab ${Math.round(p * 100)}% ${l}`));
    } catch (err) {
      console.warn('[rigs sandbox] lab failed', err);
    }
  }
  const t0 = performance.now();
  await buildRigs(engine, (p, l) => (status.textContent = `rigs ${Math.round(p * 100)}% ${l}`));
  const buildMs = performance.now() - t0;
  engine.teleportPlayer([-1.2, 0, 0.6], Math.PI * 0.08, -0.1);
  const v = params.get('view');
  if (v && VIEWS[v]) lookAt(VIEWS[v].pos, VIEWS[v].look, VIEWS[v].fov);

  let last = performance.now();
  const loop = (now: number) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    if (simOk) {
      try {
        sim.tick(dt * 1000);
      } catch (err) {
        // keep ticking (a transient sim error must not freeze the demo); report the first few
        if (++simErrors <= 3) console.warn('[rigs sandbox] sim.tick failed', err);
        if (simErrors > 200) simOk = false;
      }
    }
    engine.frame(dt);
  };
  requestAnimationFrame(loop);

  const promptEl = document.getElementById('prompt')!;
  store.subscribe((s, prev) => {
    if (s.ui.prompt === prev.ui.prompt) return;
    const p = s.ui.prompt;
    promptEl.style.display = p ? 'block' : 'none';
    promptEl.innerHTML = '';
    if (!p) return;
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = p.label;
    promptEl.appendChild(l);
    for (const vb of p.verbs) {
      const row = document.createElement('div');
      if (vb.disabled) row.className = 'disabled';
      const k = document.createElement('span');
      k.className = 'key';
      k.textContent = vb.key;
      row.append(k, document.createTextNode(vb.label));
      promptEl.appendChild(row);
    }
  });
  window.addEventListener('keydown', (ev) => {
    if (ev.code === 'Escape' && engine.isFocused()) {
      mutate((s) => void (s.ui.overlay = { kind: 'none' }));
      rigsWorld()?.screens.setFocused(null);
      void engine.releaseFocus();
    }
    const n = Number(ev.key);
    const tools: ToolId[] = ['hand', 'screwdriver', 'multimeter', 'spare-fuse-5v', 'ethernet-cable', 'test-card-visa'];
    if (n >= 1 && n <= 6) mutate((s) => void (s.session.activeTool = tools[n - 1]!));
  });
  setInterval(() => {
    const st = engine.stats();
    const s = store.getState();
    status.textContent = `${st.fps.toFixed(0)} fps · ${st.drawCalls} draws · ${(st.triangles / 1000).toFixed(1)}k tris · ${st.textures} tex · build ${buildMs.toFixed(0)} ms\nlooking ${s.session.player.lookingAt ?? '—'} · tool ${s.session.activeTool}`;
  }, 500);

  const flat = document.getElementById('flat') as HTMLCanvasElement;
  window.__engine = engine;
  window.__store = store;
  (window as unknown as { __sim: typeof sim }).__sim = sim;
  window.__rigs = {
    world: rigsWorld,
    views: Object.keys(VIEWS),
    view: (name: string) => {
      const vv = VIEWS[name];
      // side views look in through WALL-E's open door (IMG-G / VID were taken with it open)
      if (name === 'img-g' || name === 'vid') {
        try {
          sim.rig.setDoor('wall-e', true, 'player');
        } catch {
          /* sim pending */
        }
      }
      if (vv) lookAt(vv.pos, vv.look, vv.fov);
      return !!vv;
    },
    lookAt,
    stats: () => engine.stats(),
    showHits: setHitProxiesVisible,
    missing: missingRigInteractables,
    /** Verbs of a registered interactable (label + key + disabled). */
    verbs: (id: string) => (registry.get(id) ?? []).map((i) => ({ label: i.label(), verbs: i.verbs().map((v) => `${v.key}:${v.label}${v.disabled ? ' (disabled)' : ''}`) })),
    /** Run a verb by key on the first registered interactable with this id. */
    run: (id: string, key: 'E' | 'R' | 'G') => {
      const v = registry.get(id)?.[0]?.verbs().find((x) => x.key === key);
      if (!v || v.disabled) return false;
      v.run();
      return true;
    },
    setQuality: (qq: QualityPreset) => {
      mutate((s) => void (s.progress.settings.quality = qq));
      engine.setQuality(qq);
    },
    /** Demo drivers (mutate the demo lab directly; with the real sim use sim.rig.command). */
    gantry: (id: string, x: number, y: number) => demoMutateRig(id, (r) => {
      r.gantry.xMm = x;
      r.gantry.yMm = y;
    }),
    tap: (id: string) => demoMutateRig(id, (r, lab) => {
      r.solenoid.taps += 1;
      r.solenoid.lastTapMs = lab.time.physMs;
    }),
    set: (id: string, patch: Record<string, unknown>) => demoMutateRig(id, (r) => Object.assign(r, patch)),
    screen: (rigId: string, screen: ScreenName, params: Record<string, string | number | boolean> = {}, which: 'primary' | 'secondary' = 'primary') =>
      mutate((s) => {
        const lab = s.lab as LabState;
        const r = lab.rigs[rigId];
        const d = r && lab.devices[r.deviceIds[which === 'secondary' && r.deviceIds.length > 1 ? 1 : 0]!];
        if (!d) return;
        const ds = which === 'secondary' && d.secondaryDisplay ? d.secondaryDisplay : d.display;
        ds.screen = screen;
        ds.params = params;
        ds.rev += 1;
        ds.brightness = screen === 'customer-idle' ? 0.04 : 1;
      }),
    /**
     * Tap a firmware button with the rig's solenoid (`tap.at` at the button centre from the sim's
     * layout). Returns the command result and the button centre (mm).
     */
    tapButton: (rigId: string, button: string) => {
      const lab = store.getState().lab as LabState;
      const r = lab.rigs[rigId];
      const devId = r?.deviceIds[0];
      if (!r || !devId) return { ok: false, error: 'no rig/device' };
      const btn = sim.device.layout(devId, r.probeDisplay ?? 'primary').find((b) => b.id === button);
      if (!btn) return { ok: false, error: `no button ${button}` };
      const res = sim.rig.command(rigId, 'tap.at', 'player', { xMm: btn.xMm, yMm: btn.yMm });
      return { ...res, xMm: btn.xMm, yMm: btn.yMm };
    },
    /**
     * Alignment check: world distance (mm) between the solenoid tip (current displayed gantry
     * position) and the point on the screen plane where the sim's screen-mm (x, y) is drawn.
     */
    alignCheck: (rigId: string) => {
      const w = rigsWorld();
      const view = w?.views.find((v) => v.def.id === rigId);
      const binder = w?.binders.find((b) => b.view.def.id === rigId);
      if (!view || !binder) return null;
      const lab = store.getState().lab as LabState;
      const r = lab.rigs[rigId];
      const which = r?.probeDisplay ?? 'primary';
      const vr = view.variants.find((x) => !x.group || x.group.visible)!;
      const scr = vr.handle.screens.find((x) => x.display === which)!;
      const { x, y } = binder.carriageMm;
      const tip = view.frame.point(binder.tipBay());
      // screen mm → plane local (centre origin, +Y up) → world
      const g = scr.mesh.geometry as import('three').PlaneGeometry;
      const pw = g.parameters.width;
      const ph = g.parameters.height;
      const local = new (tip.constructor as typeof import('three').Vector3)((x / scr.wMm - 0.5) * pw, (0.5 - y / scr.hMm) * ph, 0);
      const onScreen = local.applyMatrix4(scr.mesh.matrixWorld);
      const dx = (tip.x - onScreen.x) * 1000;
      const dz = (tip.z - onScreen.z) * 1000;
      const dy = (tip.y - onScreen.y) * 1000;
      return { gantry: { x, y }, horizErrMm: Math.hypot(dx, dz), tipAboveMm: dy };
    },
    /** Solenoid tip world position for the current gantry position (alignment checks). */
    tipWorld: (id: string) => {
      const def = TOUCH_RIGS.find((r) => r.id === id)!;
      const r = (store.getState().lab as LabState).rigs[id];
      return tipWorld(def, deviceConfigFor(def), r?.gantry.xMm ?? 0, r?.gantry.yMm ?? 0, false);
    },
    /** Flat 2D preview of a device screen / tablet texture over the page (null hides it). */
    flat: (what: { kind: 'screen'; type: DeviceTypeCode; screen: ScreenName; params?: Record<string, string | number | boolean>; which?: 'primary' | 'secondary'; pxPerMm?: number } | { kind: 'tablet'; rig: string; tab?: 'robot' | 'robot-control' | 'motion-control'; banner?: string; locked?: boolean } | null) => {
      if (!what) {
        flat.style.display = 'none';
        return;
      }
      const lab = store.getState().lab as LabState;
      const ctx = flat.getContext('2d')!;
      flat.style.display = 'block';
      if (what.kind === 'tablet') {
        flat.width = 1280;
        flat.height = 800;
        const r = { ...(lab.rigs[what.rig] ?? createRigState(what.rig, 0, 'touch')) };
        if (what.banner) r.banner = what.banner as typeof r.banner;
        if (what.banner === 'yellow') r.tablet = { ...r.tablet, statusText: 'Status: LOCK RELEASED — PARK REQUIRED' };
        if (what.banner === 'grey') r.tablet = { ...r.tablet, statusText: 'Status: Controller unreachable' };
        if (what.locked) r.dashboardLocked = true;
        if (what.tab) r.tablet = { ...r.tablet, tab: what.tab };
        const def = TOUCH_RIGS.find((x) => x.id === what.rig);
        render2d.drawTablet(ctx, lab, r, { id: 1, name: what.rig, humanReadableName: def?.hrn ?? what.rig.toUpperCase(), status: 'AVAILABLE', checkout: what.locked ? { buildId: 'Java/uia-remote-regression-flex#4120', jobId: 'Java/uia-remote-regression-flex' } : null } as never, { widthPx: 1280, heightPx: 800, timeMs: performance.now() });
        return;
      }
      const dev = createTerminalDevice('flat', what.type, {
        display: createDisplayState(what.screen, { params: what.params ?? {}, rev: 1 }),
        secondaryDisplay: what.type.startsWith('STATION_DUO') ? createDisplayState(what.screen, { params: what.params ?? {}, rev: 1 }) : null,
        order: createOrderState('ORD-1001', { lines: [{ name: 'Tax Item 5', priceCents: 1000, qty: 1, taxable: true }, { name: 'Coffee', priceCents: 250, qty: 1, taxable: true }], subtotalCents: 1250, taxCents: 104, totalCents: 1354 }),
        apps: ['Register', 'Orders', 'Transactions', 'Sale', 'Authorizations', 'Customers', 'Items', 'Reports', 'Employees', 'Inventory', 'Rewards', 'Gift Cards', 'Help', 'App Market', 'Settings', 'Setup', 'Dining'],
      });
      const which = what.which ?? 'primary';
      const k = what.pxPerMm ?? 5;
      const sz = displaySizeMm(dev, which) ?? { w: 68, h: 136 };
      void screenCanvasSize;
      flat.width = Math.ceil(sz.w * k);
      flat.height = Math.ceil(sz.h * k);
      render2d.drawDeviceDisplay(ctx, lab, dev, which, { pxPerMm: k, timeMs: performance.now(), showTouchTargets: false });
    },
  };
}

void boot();
