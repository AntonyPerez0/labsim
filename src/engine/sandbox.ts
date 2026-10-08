/**
 * Engine sandbox (engine-sandbox.html): a standalone 8 × 6 m test room that boots the engine
 * without the world/missions modules, runs its own rAF loop and exposes `window.__engine`.
 * It doubles as the reference for lighting values world builders should use.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  SpotLight,
  type Material,
  type Object3D,
} from 'three';
import { engine } from '@/engine';
import type { LabEngine } from './engine';
import { emit, mutate, store } from '@/core/store';
import { bus } from '@/core/bus';
import type { QualityPreset, ToolId } from '@/core/state';

declare global {
  interface Window {
    __engine?: typeof engine;
    __store?: typeof store;
    __sandbox?: Record<string, unknown>;
  }
}

const ROOM = { w: 8, d: 6, h: 2.8 };
const M = engine.materials;
const T = engine.textures;

function box(w: number, h: number, d: number, mat: Material, x: number, y: number, z: number, parent: Object3D = engine.scene): Mesh {
  const m = new Mesh(new BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function buildRoom(): void {
  const { w, d, h } = ROOM;
  const floor = new Mesh(new PlaneGeometry(w, d), M.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  engine.scene.add(floor);

  const ceiling = new Mesh(new PlaneGeometry(w, d), M.ceiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = h;
  engine.scene.add(ceiling);

  const t = 0.12;
  const walls: [number, number, number, number, number][] = [
    // w, d, x, z  (thin boxes around the room)
    [w + 2 * t, t, 0, -d / 2 - t / 2, 0],
    [w + 2 * t, t, 0, d / 2 + t / 2, 0],
    [t, d, -w / 2 - t / 2, 0, 0],
    [t, d, w / 2 + t / 2, 0, 0],
  ];
  for (const [ww, dd, x, z] of walls) {
    const wall = box(ww, h, dd, M.wallPaint, x, h / 2, z);
    wall.castShadow = false;
    engine.addColliderFromObject(wall);
  }
  // Rubber skirting boards.
  const skirt = M.get('skirting', () => new MeshStandardMaterial({ color: '#3a3b3c', roughness: 0.8 }));
  box(w, 0.08, 0.012, skirt, 0, 0.04, -d / 2 + 0.006);
  box(w, 0.08, 0.012, skirt, 0, 0.04, d / 2 - 0.006);
  box(0.012, 0.08, d, skirt, -w / 2 + 0.006, 0.04, 0);
  box(0.012, 0.08, d, skirt, w / 2 - 0.006, 0.04, 0);

  // Door on the right wall (frame + leaf), purely visual.
  const doorMat = M.get('door', () => new MeshStandardMaterial({ color: '#c9c6bd', roughness: 0.55 }));
  box(0.05, 2.1, 0.95, doorMat, w / 2 - 0.03, 1.05, 1.6);
  box(0.06, 2.16, 0.06, M.aluminium, w / 2 - 0.03, 1.08, 1.1);
  box(0.06, 2.16, 0.06, M.aluminium, w / 2 - 0.03, 1.08, 2.1);
  box(0.06, 0.06, 1.06, M.aluminium, w / 2 - 0.03, 2.16, 1.6);
  box(0.04, 0.03, 0.16, M.aluminium, w / 2 - 0.07, 1.0, 1.25);
}

function buildLights(): void {
  const { h } = ROOM;
  engine.scene.add(new HemisphereLight('#eef2ff', '#8a8780', 0.2));
  const panelMat = M.get('troffer', () =>
    new MeshStandardMaterial({ color: '#ffffff', emissive: '#f5f8ff', emissiveIntensity: 1.9, roughness: 0.6 }),
  );
  const frameMat = M.get('troffer-frame', () => new MeshStandardMaterial({ color: '#f2f2ef', roughness: 0.4 }));
  const spots: [number, number, number][] = [
    [-2, -1.5, 2],
    [2, -1.5, 1],
    [-2, 1.5, 0],
    [2, 1.5, 0],
  ];
  for (const [x, z, prio] of spots) {
    box(0.64, 0.02, 0.64, frameMat, x, h - 0.01, z).castShadow = false;
    const panel = new Mesh(new PlaneGeometry(0.6, 0.6), panelMat);
    panel.rotation.x = Math.PI / 2;
    panel.position.set(x, h - 0.021, z);
    engine.scene.add(panel);
    const s = new SpotLight('#f3f6ff', 14, 0, 1.15, 0.9, 2);
    s.position.set(x, h - 0.05, z);
    s.target.position.set(x, 0, z);
    s.castShadow = true;
    s.userData.shadowPriority = prio;
    s.shadow.camera.near = 0.2;
    s.shadow.camera.far = 8;
    engine.scene.add(s, s.target);
  }
}

/** A black powder-coated rack shelf like the ones in the reference photos. */
function buildRack(x: number, z: number): Group {
  const g = new Group();
  g.position.set(x, 0, z);
  const W = 1.2;
  const D = 0.6;
  const H = 1.9;
  const post = 0.04;
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    box(post, H, post, M.blackSteel, (px * (W - post)) / 2, H / 2, (pz * (D - post)) / 2, g);
  }
  for (const y of [0.15, 0.75, 1.3, 1.86]) {
    box(W - 0.01, 0.012, D - 0.01, M.perforatedSteel, 0, y, 0, g);
    // folded front/back lips
    box(W, 0.045, 0.012, M.blackSteel, 0, y - 0.016, D / 2 - 0.006, g);
    box(W, 0.045, 0.012, M.blackSteel, 0, y - 0.016, -D / 2 + 0.006, g);
  }
  // Hex-mesh side guard on the left.
  const guard = new Mesh(new BoxGeometry(0.004, 0.5, D - 0.06), M.hexMesh);
  guard.position.set(-W / 2 + 0.03, 1.02, 0);
  guard.castShadow = true;
  g.add(guard);
  // Green LED strip on the front-left post.
  box(0.012, 1.7, 0.004, M.ledGreen, -(W - post) / 2, 0.95, D / 2 + 0.002, g).castShadow = false;
  // A 2020 aluminium gantry rail on the middle shelf.
  box(0.9, 0.02, 0.02, M.aluminium, 0.05, 0.89, 0.12, g);
  box(0.02, 0.12, 0.02, M.aluminium, -0.4, 0.82, 0.12, g);
  box(0.02, 0.12, 0.02, M.aluminium, 0.5, 0.82, 0.12, g);
  // Black PLA carriage + bracket.
  box(0.07, 0.06, 0.05, M.blackPla, 0.1, 0.89, 0.15, g);
  box(0.12, 0.13, 0.03, M.blackPla, 0.35, 0.82, -0.1, g);
  // A stepper (NEMA-17-ish) on the carriage end.
  box(0.042, 0.042, 0.042, M.blackSteel, 0.52, 0.89, 0.12, g);
  // Label tape on the top-shelf lip.
  const label = T.label('MEGATRON\nCFD');
  const labelMat = M.get('label:megatron', () => new MeshStandardMaterial({ map: label, roughness: 0.45 }));
  const lm = new Mesh(new PlaneGeometry(0.18, 0.045), labelMat);
  lm.position.set(-0.25, 0.135, D / 2 + 0.0015);
  g.add(lm);
  engine.scene.add(g);
  engine.addColliderFromObject(g, 0.02);
  return g;
}

function buildTerminalDevice(): Group {
  const g = new Group();
  const body = box(0.3, 0.07, 0.22, M.labwhite, 0, 0.035, 0, g);
  body.name = 'device-body';
  const head = new Group();
  head.position.set(0, 0.07, -0.03);
  head.rotation.x = -0.45;
  box(0.28, 0.2, 0.025, M.labwhite, 0, 0.1, 0, head);
  const screen = new Mesh(new PlaneGeometry(0.235, 0.15), M.screenGlass);
  screen.position.set(0, 0.105, 0.0131);
  head.add(screen);
  g.add(head);
  box(0.012, 0.004, 0.004, M.ledGreen, 0.12, 0.071, 0.1, g).castShadow = false;
  return g;
}

function drawFakeDesktop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void {
  ctx.fillStyle = '#0d141b';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#16212b';
  ctx.fillRect(40, 40, w - 80, h - 110);
  ctx.fillStyle = '#43b02a';
  ctx.fillRect(40, 40, w - 80, 46);
  ctx.fillStyle = '#04140a';
  ctx.font = '600 26px system-ui, sans-serif';
  ctx.fillText('Orca — Robots', 60, 72);
  const robots = ['WALL-E', 'EVE', 'BUMBLEBEE', 'R2-D2', 'JOHNNY-5', 'BAYMAX', 'SETI', 'ROSIE'];
  ctx.font = '22px ui-monospace, monospace';
  robots.forEach((r, i) => {
    const y = 130 + i * 52;
    ctx.fillStyle = i % 2 ? '#1a2631' : '#1d2a36';
    ctx.fillRect(56, y - 30, w - 112, 46);
    ctx.fillStyle = '#d7e3ea';
    ctx.fillText(r, 80, y);
    const ok = (i + Math.floor(t)) % 5 !== 0;
    ctx.fillStyle = ok ? '#43d17a' : '#f2b233';
    ctx.beginPath();
    ctx.arc(w - 120, y - 8, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#9fb0bc';
    ctx.fillText(ok ? 'AVAILABLE' : 'BUSY', w - 330, y);
  });
  ctx.fillStyle = '#0a0f14';
  ctx.fillRect(0, h - 44, w, 44);
  ctx.fillStyle = '#43b02a';
  ctx.fillRect(14, h - 34, 24, 24);
}

function buildDesk(x: number, z: number): { monitorScreen: Mesh; device: Group } {
  const g = new Group();
  g.position.set(x, 0, z);
  const top = box(1.6, 0.035, 0.8, M.wood, 0, 0.74, 0, g);
  top.name = 'desk-top';
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) box(0.05, 0.72, 0.05, M.blackSteel, px * 0.74, 0.36, pz * 0.34, g);
  // Monitor
  const mon = new Group();
  mon.position.set(-0.25, 0.76, -0.22);
  box(0.62, 0.38, 0.03, M.rubber, 0, 0.32, 0, mon);
  const screenTex = T.canvas(1024, 640);
  drawFakeDesktop(screenTex.ctx, 1024, 640, 0);
  screenTex.texture.needsUpdate = true;
  const screenMat = new MeshStandardMaterial({ color: '#000000', emissive: '#ffffff', emissiveMap: screenTex.texture, emissiveIntensity: 1.35, roughness: 0.12 });
  const screen = new Mesh(new PlaneGeometry(0.58, 0.345), screenMat);
  screen.position.set(0, 0.325, 0.0155);
  mon.add(screen);
  box(0.05, 0.16, 0.05, M.blackSteel, 0, 0.08, -0.03, mon);
  box(0.22, 0.012, 0.16, M.blackSteel, 0, 0.006, -0.02, mon);
  g.add(mon);
  let lastDraw = 0;
  engine.onFrame((_dt, t) => {
    if (t - lastDraw > 1) {
      lastDraw = t;
      drawFakeDesktop(screenTex.ctx, 1024, 640, t);
      screenTex.texture.needsUpdate = true;
    }
  });
  // Keyboard + mouse
  box(0.44, 0.02, 0.14, M.get('kbd', () => new MeshStandardMaterial({ color: '#202124', roughness: 0.6 })), -0.25, 0.768, 0.1, g);
  box(0.06, 0.02, 0.1, M.rubber, 0.08, 0.768, 0.12, g);
  // LabSim device (interactable) on the right side of the desk
  const device = buildTerminalDevice();
  device.position.set(0.45, 0.758, 0);
  device.rotation.y = -0.4;
  g.add(device);
  engine.scene.add(g);
  engine.addColliderFromObject(top, 0.02);
  // legs-height collider so the player can't walk under the desk top
  engine.addCollider({ min: [x - 0.8, 0, z - 0.4], max: [x + 0.8, 0.76, z + 0.4] });
  return { monitorScreen: screen, device };
}

function buildProps(): void {
  // Husky-style tool chest (black with aluminium pulls).
  const chest = new Group();
  chest.position.set(3.4, 0, -2.5);
  box(0.68, 0.95, 0.46, M.blackSteel, 0, 0.53, 0, chest);
  for (let i = 0; i < 6; i++) box(0.5, 0.012, 0.012, M.aluminium, 0, 0.2 + i * 0.14, 0.236, chest);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const wheel = new Mesh(new CylinderGeometry(0.035, 0.035, 0.03, 16), M.rubber);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx * 0.28, 0.035, sz * 0.18);
    chest.add(wheel);
  }
  engine.scene.add(chest);
  engine.addColliderFromObject(chest, 0.01);

  // Red / blue parts bins on a wall rail.
  const red = M.get('bin-red', () => new MeshStandardMaterial({ color: '#c8231c', roughness: 0.5 }));
  const blue = M.get('bin-blue', () => new MeshStandardMaterial({ color: '#1e4fa8', roughness: 0.5 }));
  box(1.4, 0.03, 0.03, M.aluminium, 2.6, 1.45, -2.98);
  for (let i = 0; i < 6; i++) box(0.18, 0.12, 0.16, i % 3 === 2 ? blue : red, 2.05 + i * 0.22, 1.37, -2.9);

  // Stack of crates (colliders) and a low step platform to test step-up.
  box(0.6, 0.4, 0.4, M.plasticGrey, -3.3, 0.2, 2.4);
  box(0.6, 0.4, 0.4, M.plasticGrey, -3.3, 0.6, 2.4);
  box(0.5, 0.35, 0.4, M.labwhite, -2.65, 0.175, 2.45);
  engine.addCollider({ min: [-3.6, 0, 2.2], max: [-2.4, 0.8, 2.65] });
  const plate = box(1.2, 0.1, 0.8, M.get('mat', () => new MeshStandardMaterial({ color: '#2b3a33', roughness: 0.85 })), -2.6, 0.05, 0.6);
  engine.addColliderFromObject(plate);
}

function boot(): void {
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  // The sandbox has no menus: go straight to first-person.
  mutate((s) => {
    s.ui.overlay = { kind: 'none' };
    s.ui.loading = null;
    s.session.inventory = ['hand', 'spare-fuse-5v', 'multimeter', 'flashlight'];
    s.session.activeTool = 'hand';
  });

  void engine.init(canvas).then(() => {
    const e = engine as LabEngine;
    buildRoom();
    buildLights();
    const rack = buildRack(-0.6, -2.55);
    const { monitorScreen, device } = buildDesk(1.6, -0.9);
    buildProps();

    // Interactables.
    engine.registerInteractable({
      id: 'sandbox.device',
      object: device,
      label: () => 'Station — test device',
      verbs: () => [
        { key: 'E', label: 'Inspect', run: () => console.log('[sandbox] inspect device') },
        { key: 'F', label: 'Replace fuse', requiresTool: 'spare-fuse-5v', run: () => console.log('[sandbox] replace fuse') },
      ],
    });
    const monitorPose = { position: [1.35, 1.2, -0.42] as [number, number, number], lookAt: [1.35, 1.08, -1.12] as [number, number, number], fov: 50 };
    engine.registerInteractable({
      id: 'sandbox.monitor',
      object: monitorScreen,
      label: () => 'Workstation',
      verbs: () => [{ key: 'E', label: 'Sit down', run: () => void engine.focus(monitorPose) }],
    });
    engine.registerInteractable({
      id: 'sandbox.rack',
      object: rack,
      reach: 2.4,
      label: () => 'Rack A — MEGATRON',
      verbs: () => [{ key: 'E', label: 'Look closer', run: () => console.log('[sandbox] rack') }],
    });
    engine.registerLocation({ id: 'loc.rack-a', label: 'Rack A', center: [-0.6, 0, -1.9], radius: 1.1 });
    engine.registerLocation({ id: 'loc.workstation', label: 'Workstation', center: [1.6, 0, 0.0], radius: 1.0 });

    // Ambience (starts once audio is unlocked by the first click/key).
    engine.audio.loop('room-tone');
    engine.audio.loop('fluorescent', { position: [0, 2.7, 0], volume: 0.6 });
    engine.audio.loop('fan', { position: [-0.6, 0.5, -2.5], volume: 0.5 });

    engine.teleportPlayer([0.2, 0, 1.9], 0.12, -0.06);

    // Sandbox keys: quality 1–4, T cycles tool, Esc releases focus.
    const presets: QualityPreset[] = ['low', 'medium', 'high', 'ultra'];
    const tools: ToolId[] = ['hand', 'spare-fuse-5v', 'multimeter'];
    window.addEventListener('keydown', (ev) => {
      const n = Number(ev.key);
      if (n >= 1 && n <= 4) {
        mutate((s) => {
          s.progress.settings.quality = presets[n - 1]!;
        });
        engine.setQuality(presets[n - 1]!);
      }
      if (ev.code === 'KeyT') {
        mutate((s) => {
          const i = tools.indexOf(s.session.activeTool);
          s.session.activeTool = tools[(i + 1) % tools.length]!;
        });
      }
      if (ev.code === 'Escape' && engine.isFocused()) void engine.releaseFocus();
    });

    // Debug event log.
    bus.onAny((type, payload) => {
      if (String(type).startsWith('player.')) console.log('[event]', type, JSON.stringify(payload));
    });

    // Loop.
    let last = performance.now();
    const loop = (now: number) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      engine.frame(dt);
    };
    requestAnimationFrame(loop);

    // HUD.
    const promptEl = document.getElementById('prompt')!;
    const statsEl = document.getElementById('stats')!;
    const renderPrompt = () => {
      const p = store.getState().ui.prompt;
      if (!p) {
        promptEl.style.display = 'none';
        return;
      }
      promptEl.style.display = 'block';
      promptEl.innerHTML = '';
      const l = document.createElement('div');
      l.className = 'label';
      l.textContent = p.label;
      promptEl.appendChild(l);
      for (const v of p.verbs) {
        const row = document.createElement('div');
        if (v.disabled) row.className = 'disabled';
        const k = document.createElement('span');
        k.className = 'key';
        k.textContent = v.key;
        row.append(k, document.createTextNode(v.label));
        promptEl.appendChild(row);
      }
    };
    store.subscribe((s, prev) => {
      if (s.ui.prompt !== prev.ui.prompt) renderPrompt();
    });
    setInterval(() => {
      const st = engine.stats();
      const s = store.getState();
      const pl = s.session.player;
      statsEl.textContent =
        `${st.fps.toFixed(0)} fps · ${st.drawCalls} draws · ${(st.triangles / 1000).toFixed(1)}k tris · ${st.textures} tex\n` +
        `quality ${e.qualitySettings.preset} · tool ${s.session.activeTool} · loc ${pl.locationId ?? '—'} · looking ${pl.lookingAt ?? '—'}`;
    }, 250);

    // Capture test target.
    const capCanvas = document.createElement('canvas');
    capCanvas.width = 320;
    capCanvas.height = 240;
    const capCtx = capCanvas.getContext('2d')!;
    const capCam = new PerspectiveCamera(60, 320 / 240, 0.05, 30);
    capCam.position.set(-3.5, 2.3, 2.6);
    capCam.lookAt(0, 0.8, -1.5);

    window.__engine = engine;
    window.__store = store;
    window.__sandbox = {
      monitorPose,
      focusMonitor: () => engine.focus(monitorPose),
      release: () => engine.releaseFocus(),
      setQuality: (q: QualityPreset) => engine.setQuality(q),
      setTool: (t: ToolId) =>
        mutate((s) => {
          s.session.activeTool = t;
        }),
      look: (yaw: number, pitch: number, pos?: [number, number, number]) => engine.teleportPlayer(pos ?? [e.player.x, e.player.y, e.player.z], yaw, pitch),
      capture: () => {
        engine.captureView(capCam, capCtx, 320, 240);
        return capCanvas.toDataURL('image/png');
      },
      showCapture: () => {
        engine.captureView(capCam, capCtx, 320, 240);
        capCanvas.style.cssText = 'position:fixed;right:10px;bottom:10px;border:2px solid #43b02a;z-index:5';
        document.body.appendChild(capCanvas);
      },
      emitTest: () => emit('player.inspected', { interactableId: 'test' }),
    };
  });
}

boot();
