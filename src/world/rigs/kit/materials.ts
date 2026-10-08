/**
 * Rig material palette (World §6.1 additions), created through the engine's shared
 * `MaterialLibrary.get(name, factory)` so both world builders share one art direction.
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
import { applyBoxProjection } from '@/engine/boxProjection';
import { braidWeave, copperCoil, ledStripDots, pcbBoard, perforatedRounded, railStrip, ribbonCable } from './textures';

export class RigMaterials {
  constructor(private readonly engine: Engine) {}

  private get lib() {
    return this.engine.materials;
  }

  std(name: string, color: string, roughness: number, metalness = 0, extra: Partial<MeshStandardMaterial> = {}): Material {
    return this.lib.get(name, () => {
      const m = new MeshStandardMaterial({ color, roughness, metalness });
      Object.assign(m, extra);
      return m;
    });
  }

  phys(name: string, color: string, roughness: number, extra: Partial<MeshPhysicalMaterial> = {}): Material {
    return this.lib.get(name, () => {
      const m = new MeshPhysicalMaterial({ color, roughness, metalness: 0 });
      Object.assign(m, extra);
      return m;
    });
  }

  /** Named material from the shared library (created by `factory` on first use). */
  get(name: string, factory: () => Material): Material {
    return this.lib.get(name, factory);
  }

  /* palette (engine) */
  get blackPla(): Material {
    return this.lib.blackPla;
  }
  get blackSteel(): Material {
    return this.lib.blackSteel;
  }
  get perforatedSteel(): Material {
    return this.lib.perforatedSteel;
  }
  get hexMesh(): Material {
    return this.lib.hexMesh;
  }
  get aluminium(): Material {
    return this.lib.aluminium;
  }
  get labwhite(): Material {
    return this.lib.labwhite;
  }
  get screenGlass(): Material {
    return this.lib.screenGlass;
  }
  get rubber(): Material {
    return this.lib.rubber;
  }
  get copper(): Material {
    return this.lib.copper;
  }
  get pcbGreen(): Material {
    return this.lib.pcbGreen;
  }
  get plasticGrey(): Material {
    return this.lib.plasticGrey;
  }

  /* §6.1 additions */
  get anodisedBlack(): Material {
    return this.std('anodisedBlack', '#141518', 0.4, 0.6);
  }
  get steelChrome(): Material {
    return this.std('steelChrome', '#d9dadc', 0.18, 1);
  }
  get steelSatin(): Material {
    return this.std('rigs:steelSatin', '#b7b9bc', 0.35, 1);
  }
  get blackOxide(): Material {
    return this.std('rigs:blackOxide', '#202124', 0.35, 0.8);
  }
  get brass(): Material {
    return this.std('rigs:brass', '#c9a24a', 0.35, 1);
  }
  get nylonWheel(): Material {
    return this.phys('nylonWheel', '#121212', 0.38, { sheen: 0.2 });
  }
  get belt(): Material {
    return this.lib.get('belt', () => new MeshStandardMaterial({ color: '#0e0e0e', roughness: 0.75 }));
  }
  get solenoidBlue(): Material {
    return this.phys('solenoidBlue', '#1f5fd6', 0.5, { clearcoat: 0.3 });
  }
  get rubberTip(): Material {
    return this.std('rubberTip', '#0f0f0f', 0.92);
  }
  get coilOrange(): Material {
    return this.phys('coilOrange', '#ff6a13', 0.45, { clearcoat: 0.4 });
  }
  wire(c: 'red' | 'blue' | 'green' | 'white' | 'black' | 'yellow' | 'orange'): Material {
    const hex = { red: '#d0211c', blue: '#1f4fd1', green: '#1f9e4a', white: '#eeeeee', black: '#121212', yellow: '#f2c200', orange: '#f07d1a' }[c];
    return this.phys(`wire${c[0]!.toUpperCase()}${c.slice(1)}`, hex, 0.45, { clearcoat: 0.2 });
  }
  get ribbonGrey(): Material {
    return this.lib.get('ribbonGrey', () => new MeshStandardMaterial({ color: '#ffffff', map: ribbonCable(20), roughness: 0.5, side: DoubleSide }));
  }
  get braidedSleeve(): Material {
    return this.lib.get('braidedSleeve', () => {
      const t = braidWeave().clone();
      t.wrapS = t.wrapT = RepeatWrapping;
      t.repeat.set(8, 40);
      t.needsUpdate = true;
      return new MeshStandardMaterial({ color: '#ffffff', map: t, roughness: 0.8 });
    });
  }
  cable(c: 'cat6Yellow' | 'cableBlue' | 'cableWhite' | 'cableBlack' | 'cableGrey'): Material {
    const hex = { cat6Yellow: '#f2c200', cableBlue: '#8fb7e6', cableWhite: '#f0f0ee', cableBlack: '#151515', cableGrey: '#8d9196' }[c];
    return this.std(c, hex, 0.55);
  }
  get whiteNylon(): Material {
    return this.std('whiteNylon', '#ecebe4', 0.55);
  }
  get paperWhite(): Material {
    return this.std('paperWhite', '#fbfbf8', 0.85);
  }
  get cardWhite(): Material {
    return this.std('cardWhite', '#f4f4f2', 0.4, 0);
  }
  get collisGrey(): Material {
    return this.std('collisGrey', '#a9acaf', 0.55, 0.35);
  }
  get nucBody(): Material {
    return this.std('nucBody', '#1a1a1c', 0.45, 0.2);
  }
  get nucTop(): Material {
    return this.std('nucTop', '#b8bbbf', 0.35, 0.8);
  }
  get minixBlack(): Material {
    return this.std('minixBlack', '#0f0f10', 0.5, 0.1);
  }
  get deviceGreyBack(): Material {
    return this.std('deviceGreyBack', '#5b5f63', 0.5);
  }
  get deviceDarkGrey(): Material {
    return this.std('rigs:deviceDarkGrey', '#3a3d41', 0.55);
  }
  get smokedPlastic(): Material {
    return this.phys('smokedPlastic', '#2a2a2c', 0.25, { transparent: true, opacity: 0.7 });
  }
  get greenPla(): Material {
    return this.std('greenPla', '#2fd468', 0.6);
  }
  get greyPlaText(): Material {
    return this.std('greyPlaText', '#8d8f93', 0.65);
  }
  get lightGreyPla(): Material {
    return this.std('lightGreyPla', '#d9d9d9', 0.6);
  }
  get monitorBlack(): Material {
    return this.std('monitorBlack', '#0d0d0e', 0.4);
  }
  get darkPort(): Material {
    return this.std('rigs:darkPort', '#202224', 0.6);
  }
  get usbBlue(): Material {
    return this.std('rigs:usbBlue', '#1d5fd8', 0.5);
  }
  get cardboard(): Material {
    return this.std('cardboard', '#b48a5a', 0.9);
  }
  get purplePcb(): Material {
    return this.std('rigs:purplePcb', '#4b2a7a', 0.5);
  }
  get heatsink(): Material {
    return this.std('rigs:heatsink', '#c0c3c6', 0.3, 1);
  }
  get servoBlue(): Material {
    return this.std('rigs:servoBlue', '#2a5bd7', 0.45);
  }
  get yellowSticky(): Material {
    return this.std('rigs:yellowTape', '#f2d21b', 0.6);
  }
  get pcbBoard(): Material {
    return this.lib.get('rigs:pcbBoard', () => new MeshPhysicalMaterial({ color: '#ffffff', map: pcbBoard(), roughness: 0.4, clearcoat: 0.4 }));
  }
  get copperCoil(): Material {
    return this.lib.get('rigs:copperCoil', () => new MeshStandardMaterial({ color: '#ffffff', map: copperCoil(), roughness: 0.5, metalness: 0.2 }));
  }

  /** Emissive green LED strip with 60 LEDs/m dots (UV v runs along the strip; repeat set per mesh). */
  get ledStripGreen(): Material {
    return this.lib.get('ledStripGreen', () => {
      const t = ledStripDots();
      return new MeshStandardMaterial({ color: '#ffffff', map: t.map, emissive: new Color('#2bff6a'), emissiveMap: t.emissiveMap, emissiveIntensity: 2.2, roughness: 0.4 });
    });
  }
  get chipArrowGreen(): Material {
    return this.std('chipArrowGreen', '#0b2a14', 0.3, 0, { emissive: new Color('#39ff7a'), emissiveIntensity: 2.5 });
  }
  get screenGlassOverlay(): Material {
    return this.lib.get('screenGlassOverlay', () =>
      new MeshPhysicalMaterial({ color: '#000000', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.1, clearcoat: 1, depthWrite: false }),
    );
  }
  /** Tablet / device bezels in black glass. */
  get bezelBlack(): Material {
    return this.lib.get('rigs:bezelBlack', () => new MeshPhysicalMaterial({ color: '#0b0c0d', roughness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.05 }));
  }
  /** Red magnetic-lock dot (§2.5) — emissive, shown only when the lock is broken. */
  get lockDot(): Material {
    return this.lib.get('rigs:lockDot', () => new MeshBasicMaterial({ color: new Color('#ff3b30').multiplyScalar(3) }));
  }

  /** Rack front rail flange (square holes + U numbers), alpha-tested. */
  rail(side: 'left' | 'right'): Material {
    return this.lib.get(`rigs:rail-${side}`, () => {
      const t = railStrip(side);
      return new MeshStandardMaterial({ color: '#ffffff', map: t.map, alphaMap: t.alphaMap, alphaTest: 0.5, roughness: 0.5, metalness: 0.05, side: DoubleSide });
    });
  }

  /** `perforatedSteelRounded` (IMG-R shelves of rack.t), box-projected at physical size. */
  get perforatedRounded(): Material {
    return this.lib.get('perforatedSteelRounded', () => {
      const t = perforatedRounded();
      const m = new MeshStandardMaterial({ color: '#ffffff', map: t.map, alphaMap: t.alphaMap, alphaTest: 0.5, side: DoubleSide, roughness: 0.5, metalness: 0.05 });
      return applyBoxProjection(m, t.tileM, true);
    });
  }

  /** Unlit canvas material for screens (`screenLit`, World §3.5). */
  screenLit(map: Texture, brightness = 1): MeshBasicMaterial {
    const m = new MeshBasicMaterial({ map, toneMapped: true });
    m.color.setScalar(1.12 * brightness);
    m.name = 'screenLit';
    return m;
  }

  /** A box-projected blackPla variant with a different tint (green PLA logo etc. use plain std). */
  plaTint(name: string, hex: string): Material {
    return this.lib.get(`rigs:pla-${name}`, () => {
      const base = this.lib.blackPla.clone() as MeshPhysicalMaterial;
      base.color.set(hex);
      return base;
    });
  }

  /** Normal scale helper for PLA-like materials (kept for parity with §6.1). */
  static normalScale(k: number): Vector2 {
    return new Vector2(k, k);
  }
}
