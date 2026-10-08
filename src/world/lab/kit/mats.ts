/**
 * Lab material palette (World §6.1). Shared palette entries come from `engine.materials`; the
 * additions are created with `materials.get(<§6.1 name>, factory)` using the doc's exact values so
 * the rigs builder and the lab builder share one instance per name.
 */
import {
  Color,
  DoubleSide,
  MeshBasicMaterial,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  Vector2,
  type Material,
  type Texture,
} from 'three';
import type { Engine } from '@/engine/types';
import { braidNormal, cardboardTex, corkTex, louvreAlpha, vctFloor, wireGridAlpha } from './procTex';
import { applyBoxProjection } from '@/engine/boxProjection';

export type LabMats = ReturnType<typeof createLabMats>;

function std(color: string, roughness: number, metalness = 0, extra: Partial<MeshStandardMaterial> = {}): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color, roughness, metalness });
  Object.assign(m, extra);
  return m;
}

function phys(color: string, roughness: number, extra: ConstructorParameters<typeof MeshPhysicalMaterial>[0] = {}): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({ color, roughness, metalness: 0, ...extra });
}

function tiled(t: Texture, rx: number, ry: number): Texture {
  const c = t.clone();
  c.wrapS = c.wrapT = RepeatWrapping;
  c.repeat.set(rx, ry);
  c.needsUpdate = true;
  return c;
}

export function createLabMats(engine: Engine) {
  const M = engine.materials;
  const g = (name: string, f: () => Material): Material => M.get(name, f);
  const P = M; // palette shortcut

  return {
    // ── palette (existing) ──
    blackPla: P.blackPla,
    blackSteel: P.blackSteel,
    perforatedSteel: P.perforatedSteel,
    aluminium: P.aluminium,
    labwhite: P.labwhite,
    screenGlass: P.screenGlass,
    rubber: P.rubber,
    copper: P.copper,
    pcbGreen: P.pcbGreen,
    wallPaint: P.wallPaint,
    floor: P.floor,
    ceiling: P.ceiling,
    wood: P.wood,
    plasticGrey: P.plasticGrey,

    // ── §6.1 additions ──
    orangePla: g('orangePla', () => std('#f26a1b', 0.6)),
    greenPla: g('greenPla', () => std('#2fd468', 0.6)),
    anodisedBlack: g('anodisedBlack', () => std('#141518', 0.4, 0.6)),
    steelChrome: g('steelChrome', () => std('#d9dadc', 0.18, 1)),
    rubberTip: g('rubberTip', () => std('#0f0f0f', 0.92)),
    wireRed: g('wireRed', () => phys('#d0211c', 0.45, { clearcoat: 0.2 })),
    wireBlue: g('wireBlue', () => phys('#1f4fd1', 0.45, { clearcoat: 0.2 })),
    wireGreen: g('wireGreen', () => phys('#1f9e4a', 0.45, { clearcoat: 0.2 })),
    wireWhite: g('wireWhite', () => phys('#eeeeee', 0.45, { clearcoat: 0.2 })),
    wireBlack: g('wireBlack', () => phys('#121212', 0.45, { clearcoat: 0.2 })),
    wireYellow: g('wireYellow', () => phys('#f2c200', 0.45, { clearcoat: 0.2 })),
    wireOrange: g('wireOrange', () => phys('#f07d1a', 0.45, { clearcoat: 0.2 })),
    braidedSleeve: g('braidedSleeve', () => {
      const n = braidNormal();
      return std('#141414', 0.8, 0, { normalMap: tiled(n, 30, 4), normalScale: new Vector2(0.8, 0.8) });
    }),
    cat6Yellow: g('cat6Yellow', () => std('#f2c200', 0.55)),
    cableBlue: g('cableBlue', () => std('#8fb7e6', 0.55)),
    cableWhite: g('cableWhite', () => std('#f0f0ee', 0.55)),
    cableBlack: g('cableBlack', () => std('#151515', 0.55)),
    paperWhite: g('paperWhite', () => std('#fbfbf8', 0.85)),
    collisGrey: g('collisGrey', () => std('#a9acaf', 0.55, 0.35)),
    deviceGreyBack: g('deviceGreyBack', () => std('#5b5f63', 0.5)),
    smokedPlastic: g('smokedPlastic', () => phys('#2a2a2c', 0.25, { transparent: true, opacity: 0.7 })),
    // smoky clear polystyrene: reads dark-ish against the contents like the IMG-R organisers
    drawerClear: g('drawerClear', () => phys('#aab3ba', 0.22, { transparent: true, opacity: 0.3, depthWrite: false, envMapIntensity: 0.35 })),
    glassClear: g('glassClear', () => phys('#dfe8ec', 0.05, { transparent: true, opacity: 0.25, depthWrite: false })),
    binRed: g('binRed', () => std('#c8261e', 0.45)),
    binBlue: g('binBlue', () => std('#1f4fb3', 0.45)),
    louvreGrey: g('louvreGrey', () =>
      std('#5a5e63', 0.5, 0.6, { alphaMap: louvreAlpha(), alphaTest: 0.5, side: DoubleSide }),
    ),
    huskyBlack: g('huskyBlack', () => std('#121314', 0.35, 0.4)),
    zincTray: g('zincTray', () => std('#b9bcbf', 0.45, 1)),
    zincMesh: g('lab.zincMesh', () => std('#b9bcbf', 0.45, 1, { alphaMap: wireGridAlpha(), alphaTest: 0.5, side: DoubleSide })),
    cork: g('cork', () => std('#ffffff', 0.95, 0, { map: corkTex() })),
    laminateGrey: g('laminateGrey', () => std('#c9c7c1', 0.55)),
    esdLaminate: g('esdLaminate', () => std('#9aa3a8', 0.6)),
    esdMat: g('esdMat', () => std('#5f7686', 0.9)),
    butcherBlock: g('butcherBlock', () => {
      const base = P.wood as MeshStandardMaterial;
      const m = base.clone();
      m.color = new Color('#c8955c');
      m.roughness = 0.6;
      return m;
    }),
    birchLaminate: g('lab.birchLaminate', () => {
      const base = P.wood as MeshStandardMaterial;
      const m = base.clone();
      m.color = new Color('#f2dcc0');
      m.roughness = 0.5;
      return m;
    }),
    doorGrey: g('doorGrey', () => std('#c9ccd0', 0.5, 0.2)),
    frameGrey: g('frameGrey', () => std('#8d9196', 0.45, 0.5)),
    coveBlack: g('coveBlack', () => std('#1b1b1b', 0.85)),
    monitorBlack: g('monitorBlack', () => std('#0d0d0e', 0.4)),
    keycap: g('keycap', () => std('#1d1d1f', 0.6)),
    trofferLed: g('trofferLed', () => std('#ffffff', 0.9, 0, { emissive: new Color('#f4f6ff'), emissiveIntensity: 2.0 })),
    trofferFluor: g('trofferFluor', () => std('#ffffff', 0.9, 0, { emissive: new Color('#fff3e0'), emissiveIntensity: 1.8 })),
    corridorVinyl: g('corridorVinyl', () => std('#9b8f80', 0.6)),
    corridorWall: g('corridorWall', () => std('#d8d3c8', 0.88)),
    cardboard: g('cardboard', () => std('#ffffff', 0.9, 0, { map: cardboardTex() })),

    // ── lab-only helpers ──
    /** 305 mm light-grey speckled VCT (§1.1), box-projected at real size. */
    vct: g('lab.vct', () => {
      const t = vctFloor();
      const m = std('#c4c5c3', 1, 0, { map: t.map, roughnessMap: t.roughnessMap });
      return applyBoxProjection(m, [1.22, 1.22]);
    }),
    whiteEnamel: g('lab.whiteEnamel', () => std('#f1f1ee', 0.45, 0.1)),
    offWhitePlastic: g('lab.offWhitePlastic', () => std('#e9e8e3', 0.5)),
    blackPlastic: g('lab.blackPlastic', () => std('#151517', 0.55)),
    satinBlack: g('lab.satinBlack', () => std('#1b1c1e', 0.42, 0.15)),
    darkGreyPlastic: g('lab.darkGreyPlastic', () => std('#3a3d41', 0.5)),
    midGreyPlastic: g('lab.midGreyPlastic', () => std('#6d7176', 0.5)),
    lightGreyMetal: g('lab.lightGreyMetal', () => std('#b4b7ba', 0.45, 0.6)),
    greySteel: g('lab.greySteel', () => std('#8c9095', 0.5, 0.45)),
    cabinetGrey: g('lab.cabinetGrey', () => std('#9ea2a6', 0.5, 0.35)),
    beigePlastic: g('lab.beigePlastic', () => std('#c9c3b2', 0.6)),
    meshFabric: g('lab.meshFabric', () => std('#1a1a1c', 0.95)),
    brass: g('lab.brass', () => std('#c9a24a', 0.35, 1)),
    red: g('lab.redPaint', () => std('#c41e1a', 0.4, 0.2)),
    redPlastic: g('lab.redPlastic', () => std('#c8261e', 0.45)),
    yellowPlastic: g('lab.yellowPlastic', () => std('#f2c200', 0.5)),
    greenPaint: g('lab.greenPaint', () => std('#2c8a3c', 0.5)),
    coffee: g('lab.coffee', () => std('#2a160c', 0.15)),
    plant: g('lab.plant', () => std('#3f7a3a', 0.7)),
    soil: g('lab.soil', () => std('#3a2a1e', 0.95)),
    terracotta: g('lab.terracotta', () => std('#b8643f', 0.8)),
    chrome: g('lab.chrome', () => std('#e6e7e8', 0.12, 1)),
    glassDark: g('lab.glassDark', () => phys('#20262b', 0.08, { transparent: true, opacity: 0.55, depthWrite: false, clearcoat: 1 })),
    hidden: g('lab.hidden', () => {
      const m = new MeshBasicMaterial({ color: 0xff00ff });
      m.visible = false;
      return m;
    }),
  };
}
