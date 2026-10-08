/**
 * Ceiling fixtures and the light rig (World §1.7, §7.1, §7.4): 12 troffers (t01 is an old T8
 * fluorescent with a prismatic lens and a seeded flicker), supply diffusers, egg-crate returns,
 * smoke detectors with a blinking pilot LED, sprinkler heads (instanced), troffer spot lights
 * (12 on Medium+, 6 pair-midpoint spots on Low), hemisphere fill, corridor spot, bench task light
 * (Medium+) and the magnifier-lamp light (High+).
 */
import {
  CanvasTexture,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  PointLight,
  SpotLight,
  SRGBColorSpace,
} from 'three';
import { store } from '@/core/store';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CEILING_FIXTURES, CORRIDOR, LIGHTS, LOW_PRESET_TROFFER_PAIRS, ROOM, TROFFERS, TROFFER_SIZE, sprinklerPositions } from '../layout';
import type { QualityPreset } from '@/core/state';
import { StaticBatch, prepGeometry, xf } from './kit/batch';
import { boxGeo, cylGeo, planeGeo, sphereGeo } from './kit/shapes';
import { eggCrateTex, seeded, ventGrilleTex } from './kit/procTex';
import type { LabCtx } from './kit/context';

const H = ROOM.interior.ceilingY;

export interface LightRig {
  troffers: Map<string, SpotLight>;
  lowSpots: SpotLight[];
  hemi: HemisphereLight;
  bench: PointLight;
  magnifier: PointLight;
  fluorescentMat: MeshStandardMaterial;
  ledMat: MeshStandardMaterial;
  /** Free Play light switch: false = room lights off (emergency level). */
  setRoomLights(on: boolean): void;
  roomLightsOn(): boolean;
  applyQuality(q: QualityPreset): void;
  /** t01 flicker multiplier this frame (1 = steady) for the buzz loop. */
  flickerLevel(): number;
}

function diffuserTexture(fluorescent: boolean): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d')!;
  if (fluorescent) {
    // prismatic lens over two T8 tubes: brighter bands, fine diamond pattern
    g.fillStyle = '#d9d4ca';
    g.fillRect(0, 0, 128, 256);
    for (const x of [38, 90]) {
      const gr = g.createLinearGradient(x - 26, 0, x + 26, 0);
      gr.addColorStop(0, 'rgba(255,250,240,0)');
      gr.addColorStop(0.5, 'rgba(255,252,246,1)');
      gr.addColorStop(1, 'rgba(255,250,240,0)');
      g.fillStyle = gr;
      g.fillRect(x - 26, 6, 52, 244);
    }
    g.strokeStyle = 'rgba(160,150,140,0.25)';
    g.lineWidth = 1;
    for (let i = -256; i < 256; i += 6) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + 256, 256);
      g.moveTo(i + 256, 0);
      g.lineTo(i, 256);
      g.stroke();
    }
  } else {
    // flat opal LED panel: even, slightly brighter centre
    const gr = g.createRadialGradient(64, 128, 10, 64, 128, 150);
    gr.addColorStop(0, '#ffffff');
    gr.addColorStop(1, '#eceef4');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 256);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function buildLights(ctx: LabCtx): LightRig {
  const { mats, root } = ctx;
  const group = new Group();
  group.name = 'lab.lights';
  root.add(group);

  /* ── troffer housings + diffusers ── */
  const hb = new StaticBatch('troffers');
  const ledMat = (mats.trofferLed as MeshStandardMaterial).clone();
  ledMat.name = 'trofferLed';
  ledMat.emissiveMap = diffuserTexture(false);
  ledMat.map = ledMat.emissiveMap;
  const fluMat = (mats.trofferFluor as MeshStandardMaterial).clone();
  fluMat.name = 'trofferFluor';
  fluMat.emissiveMap = diffuserTexture(true);
  fluMat.map = fluMat.emissiveMap;
  const { w, d } = TROFFER_SIZE;
  const [dw, dd] = TROFFER_SIZE.diffuser;
  for (const t of TROFFERS) {
    // flange (white enamel), sloped inner reveal, recessed lens
    hb.box(w, 0.006, d, mats.whiteEnamel, t.x, H - 0.003, t.z, 0, 'none');
    const lensMat = t.type === 'fluorescent' ? fluMat : ledMat;
    const lens = planeGeo(dw - 0.03, dd - 0.03);
    hb.add(lens, lensMat, xf(t.x, H - 0.0065, t.z, Math.PI / 2, 0, 0), 'none');
    // inner reveal strips (shadowed edge read)
    hb.box(dw, 0.004, 0.015, mats.midGreyPlastic, t.x, H - 0.0062, t.z - dd / 2 + 0.0075, 0, 'none');
    hb.box(dw, 0.004, 0.015, mats.midGreyPlastic, t.x, H - 0.0062, t.z + dd / 2 - 0.0075, 0, 'none');
    hb.box(0.015, 0.004, dd, mats.midGreyPlastic, t.x - dw / 2 + 0.0075, H - 0.0062, t.z, 0, 'none');
    hb.box(0.015, 0.004, dd, mats.midGreyPlastic, t.x + dw / 2 - 0.0075, H - 0.0062, t.z, 0, 'none');
  }

  /* ── supply diffusers, egg-crate returns, smoke detectors ── */
  const ventMat = new MeshStandardMaterial({ map: ventGrilleTex(), roughness: 0.6 });
  ventMat.name = 'lab.ventGrille';
  const eggMat = new MeshStandardMaterial({ map: eggCrateTex(), roughness: 0.7 });
  eggMat.name = 'lab.eggCrate';
  const smokeLeds: number[] = [];
  for (const f of CEILING_FIXTURES) {
    if (f.kind === 'supply-diffuser') {
      hb.box(f.size, 0.01, f.size, mats.whiteEnamel, f.x, H - 0.005, f.z, 0, 'none');
      hb.add(planeGeo(f.size - 0.04, f.size - 0.04), ventMat, xf(f.x, H - 0.0105, f.z, Math.PI / 2, 0, 0), 'none');
    } else if (f.kind === 'return-grille') {
      hb.box(f.size, 0.008, f.size, mats.whiteEnamel, f.x, H - 0.004, f.z, 0, 'none');
      hb.add(planeGeo(f.size - 0.03, f.size - 0.03), eggMat, xf(f.x, H - 0.0085, f.z, Math.PI / 2, 0, 0), 'none');
    } else {
      hb.add(cylGeo(f.size / 2, f.size / 2 - 0.006, 0.035, 24), mats.offWhitePlastic, xf(f.x, H - 0.0175, f.z), 'none');
      hb.add(cylGeo(0.035, 0.035, 0.006, 20), mats.whiteEnamel, xf(f.x, H - 0.038, f.z), 'none');
      smokeLeds.push(ctx.leds.add({ pos: [f.x + 0.045, H - 0.0352, f.z], normal: [0, -1, 0], color: '#ff2614', size: 0.003, level: 0 }));
    }
  }
  ctx.statics.add(hb);

  /* ── sprinkler heads: instanced (escutcheon + frame + deflector) ── */
  const parts = [
    prepGeometry(cylGeo(0.03, 0.03, 0.006, 18), xf(0, -0.003, 0)),
    prepGeometry(cylGeo(0.008, 0.01, 0.02, 10), xf(0, -0.016, 0)),
    prepGeometry(boxGeo(0.018, 0.022, 0.003), xf(0, -0.034, 0)),
    prepGeometry(cylGeo(0.013, 0.013, 0.0015, 14), xf(0, -0.046, 0)),
    prepGeometry(sphereGeo(0.0035, 8, 6), xf(0, -0.03, 0.0)),
  ];
  const head = mergeGeometries(parts, false)!;
  const sp = sprinklerPositions();
  const inst = new InstancedMesh(head, mats.chrome, sp.length);
  inst.name = 'ceiling.sprinklers';
  sp.forEach((p, i) => inst.setMatrixAt(i, new Matrix4().makeTranslation(p[0], H - 0.001, p[2])));
  inst.castShadow = false;
  group.add(inst);

  /* ── lights ── */
  const tr = LIGHTS.troffer;
  const troffers = new Map<string, SpotLight>();
  for (const t of TROFFERS) {
    const fl = t.type === 'fluorescent';
    const s = new SpotLight(fl ? tr.fluorescent.color : tr.led.color, fl ? tr.fluorescent.intensity : tr.led.intensity, tr.distance, tr.angle, tr.penumbra, tr.decay);
    s.name = t.id;
    s.position.set(t.x, tr.y, t.z);
    s.target.position.set(t.x, 0, t.z);
    s.castShadow = t.shadowPriority > 0;
    s.userData.shadowPriority = t.shadowPriority;
    s.userData.baseIntensity = s.intensity;
    s.shadow.camera.near = tr.shadow.near;
    s.shadow.camera.far = tr.shadow.far;
    s.shadow.bias = tr.shadow.bias;
    s.shadow.normalBias = tr.shadow.normalBias;
    group.add(s, s.target);
    troffers.set(t.id, s);
  }
  const lowSpots: SpotLight[] = [];
  for (const [a, b2] of LOW_PRESET_TROFFER_PAIRS) {
    const ta = TROFFERS.find((t) => t.id === a)!;
    const tb = TROFFERS.find((t) => t.id === b2)!;
    const x = (ta.x + tb.x) / 2;
    const z = (ta.z + tb.z) / 2;
    const s = new SpotLight(tr.led.color, tr.lowPresetIntensity, tr.distance, Math.min(1.35, tr.angle + 0.25), tr.penumbra, tr.decay);
    s.name = `low:${a}+${b2}`;
    s.position.set(x, tr.y, z);
    s.target.position.set(x, 0, z);
    s.castShadow = false;
    s.userData.baseIntensity = s.intensity;
    s.visible = false;
    group.add(s, s.target);
    lowSpots.push(s);
  }
  const hemi = new HemisphereLight(LIGHTS.hemisphere.sky, LIGHTS.hemisphere.ground, LIGHTS.hemisphere.intensity);
  hemi.name = 'lab.hemisphere';
  group.add(hemi);
  // corridor spot (only matters in the corridor)
  const cs = new SpotLight('#fff6ea', LIGHTS.corridor.intensity, 0, LIGHTS.corridor.angle, LIGHTS.corridor.penumbra, 2);
  cs.position.set(...LIGHTS.corridor.pos);
  cs.target.position.set(CORRIDOR.ledPanel[0], 0, CORRIDOR.ledPanel[2]);
  cs.name = 'corridor.light';
  group.add(cs, cs.target);
  // bench task light + magnifier lamp
  const bt = LIGHTS.benchTask;
  const bench = new PointLight(bt.color, bt.intensity, bt.distance, bt.decay);
  bench.position.set(...bt.pos);
  bench.name = 'jared.bench-light';
  group.add(bench);
  const ml = LIGHTS.magnifierLamp;
  const magnifier = new PointLight(ml.color, ml.intensity, ml.distance, 2);
  magnifier.position.set(1.4, 1.32, -4.62);
  magnifier.name = 'jared.magnifier-light';
  group.add(magnifier);

  /* ── t01 flicker (seeded 6–14 s gaps, 150 ms sequence at 30 ms steps) ── */
  const fl = LIGHTS.t01Flicker;
  const rnd = seeded(101);
  let nextFlicker = fl.minGapS + rnd() * (fl.maxGapS - fl.minGapS);
  let flickerStart = -1;
  let level = 1;
  let lightsOn = true;
  const t01 = troffers.get('light.t01')!;
  const baseFluEmissive = fluMat.emissiveIntensity;
  const baseLedEmissive = ledMat.emissiveIntensity;
  let quality: QualityPreset = ctx.quality();
  let smokeT = 0;

  ctx.hooks.push((dt, t) => {
    // smoke detector pilot: 120 ms blink every 8 s
    smokeT = t % 8;
    for (const i of smokeLeds) ctx.leds.set(i, smokeT < 0.12 ? 1 : 0);
    if (!lightsOn) return;
    const reduced = ctxReducedMotion();
    if (!reduced && t >= nextFlicker && flickerStart < 0) flickerStart = t;
    if (flickerStart >= 0) {
      const step = Math.floor(((t - flickerStart) * 1000) / fl.stepMs);
      if (step >= fl.multipliers.length) {
        flickerStart = -1;
        level = 1;
        nextFlicker = t + fl.minGapS + rnd() * (fl.maxGapS - fl.minGapS);
      } else level = fl.multipliers[step]!;
    } else level = 1;
    t01.intensity = (t01.userData.baseIntensity as number) * level;
    fluMat.emissiveIntensity = baseFluEmissive * level;
  });

  function applyQuality(q: QualityPreset): void {
    quality = q;
    const low = q === 'low';
    for (const s of troffers.values()) s.visible = !low && lightsOn;
    for (const s of lowSpots) s.visible = low && lightsOn;
    hemi.intensity = (low ? LIGHTS.hemisphere.lowIntensity : LIGHTS.hemisphere.intensity) * (lightsOn ? 1 : 0.25);
    bench.visible = q !== 'low';
    magnifier.visible = q === 'high' || q === 'ultra';
  }
  applyQuality(quality);

  return {
    troffers,
    lowSpots,
    hemi,
    bench,
    magnifier,
    fluorescentMat: fluMat,
    ledMat,
    setRoomLights(on: boolean) {
      lightsOn = on;
      ledMat.emissiveIntensity = on ? baseLedEmissive : 0.02;
      fluMat.emissiveIntensity = on ? baseFluEmissive : 0.02;
      applyQuality(quality);
    },
    roomLightsOn: () => lightsOn,
    applyQuality,
    flickerLevel: () => level,
  };
}

function ctxReducedMotion(): boolean {
  return store.getState().progress.settings.reducedMotion;
}
