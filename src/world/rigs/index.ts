/**
 * `buildRigs` — the world-rigs builder (World §2–§5): touch racks A/B with their 8 rigs, the Callus
 * shelf with the Collis probes and Windows boxes, the tethered bench (MEGATRON / OPTIMUS), the ADB
 * shelf (DATA / TARS) and the build table. Static geometry is merged per material across the whole
 * area; moving parts are small per-rig groups; screws, V-wheels, NEMA-17s, limit switches, toggle
 * bats and every indicator LED are instanced. A per-frame binder reads `store.getState().lab`.
 */
import type { Engine } from '@/engine/types';
import { store } from '@/core/store';
import type { LabState } from '@/sim/types';
import { RACKS, TOUCH_RIGS, rigDevice } from '../layout';
import { RigKit } from './kit/context';
import { buildTouchRack, type RackHandles } from './rack';
import { buildTouchRig, type TouchRigView } from './touchRig';
import { TouchRigBinder } from './rigView';
import { ScreenManager } from './screens';
import { buildCallusShelf, type CallusHandles } from './callusShelf';
import { buildTethered, type TetheredHandles } from './tethered';
import { buildAdbShelf, type AdbHandles } from './adbShelf';
import { buildBuildTable } from './buildTable';
import { registerRigInteractions } from './interact';
import { bindShelves } from './shelfBind';
import { ReceiptStrips } from './receipts';
import { MovingInstancer } from './kit/shareMoving';
import { bloomActive, ledToneScale } from '../ledTone';
import type { MeshStandardMaterial } from 'three';

export interface RigsWorld {
  kit: RigKit;
  /** Cross-rig instancing of the moving parts (debug: `saved` draw calls). */
  movingInst: MovingInstancer;
  racks: RackHandles[];
  views: TouchRigView[];
  binders: TouchRigBinder[];
  screens: ScreenManager;
  callus: CallusHandles;
  tethered: TetheredHandles;
  adb: AdbHandles;
  dispose(): void;
}

let current: RigsWorld | null = null;

/** The built rigs world (debug / sandbox / tests). */
export function rigsWorld(): RigsWorld | null {
  return current;
}

const yieldFrame = () => new Promise<void>((r) => setTimeout(r, 0));

function serialsFor(lab: LabState | undefined, rigId: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const d of Object.values(lab?.devices ?? {})) if (d && d.rigId === rigId) out[d.type] = d.serial;
  return out;
}

export async function buildRigs(engine: Engine, onProgress: (p: number, label: string) => void): Promise<void> {
  current?.dispose();
  const kit = new RigKit(engine);
  engine.scene.add(kit.root);
  const lab = store.getState().lab;
  onProgress(0.02, 'Racks…');
  const racks = RACKS.map((r) => buildTouchRack(kit, r));
  await yieldFrame();
  const views: TouchRigView[] = [];
  for (let i = 0; i < TOUCH_RIGS.length; i++) {
    const def = TOUCH_RIGS[i]!;
    onProgress(0.05 + (i / TOUCH_RIGS.length) * 0.6, `Robot ${def.hrn}…`);
    views.push(buildTouchRig(kit, def, serialsFor(lab, def.id)));
    if (i % 2 === 1) await yieldFrame();
  }
  onProgress(0.7, 'Callus shelf…');
  const callus = buildCallusShelf(kit);
  onProgress(0.76, 'Tethered bench…');
  const tethered = buildTethered(kit, lab);
  onProgress(0.82, 'ADB shelf…');
  const adb = buildAdbShelf(kit, lab);
  const table = buildBuildTable(kit);
  await yieldFrame();
  onProgress(0.88, 'Merging geometry…');
  kit.finish();
  kit.root.updateMatrixWorld(true);
  kit.updateDynamic();
  // identical moving parts of the 8 touch rigs → one InstancedMesh per part/material
  const movingInst = new MovingInstancer();
  movingInst.build(kit.movings.flatMap((m) => m.meshes), kit.root);

  // screens
  const screens = new ScreenManager();
  for (const v of views) {
    const def = v.def;
    for (const vr of v.variants) {
      for (const scr of vr.handle.screens) {
        const which = scr.display;
        screens.addDevice({
          key: `${def.id}:${which}:${vr.cfg.type}`,
          mesh: scr.mesh,
          wMm: scr.wMm,
          hMm: scr.hMm,
          type: vr.cfg.type,
          which,
          resolve: (l) => {
            const r = rigDevice(l, def.id, which);
            return r && r.device.type === vr.cfg.type ? r : undefined;
          },
          fallback: which === 'secondary' ? 'customer-cart' : 'lock',
          active: vr.group ? () => vr.group!.visible : undefined,
        });
      }
    }
    screens.addTablet({ rigId: def.id, hrn: def.hrn, mesh: v.fascia.tabletScreen, resolve: (l) => l.rigs?.[def.id] });
  }
  // receipt paper strips at every touch-rig printer (World §3.3 step 6)
  const receipts = new ReceiptStrips();
  kit.root.add(receipts.root);
  for (const v of views) {
    for (const vr of v.variants) {
      const paper = vr.handle.anchors.paper;
      if (!paper) continue;
      receipts.add(`${v.def.id}:${vr.cfg.type}`, vr.frame, paper, (l) => {
        const r = rigDevice(l, v.def.id, 'primary');
        return r && r.device.type === vr.cfg.type ? r.device : undefined;
      }, vr.group ? () => vr.group!.visible : undefined);
    }
  }
  tethered.addScreens(screens);
  adb.addScreens(screens);
  const binders = views.map((v) => new TouchRigBinder(kit, v, engine));
  const shelfBinder = bindShelves(kit, engine, racks, callus, tethered, adb);
  onProgress(0.94, 'Interactions…');
  const unregister = registerRigInteractions(engine, kit, { views, binders, racks, callus, tethered, adb, table, screens });

  // emissive LED strips / chip arrows: same hue-preserving rule as the LED lenses (world/ledTone.ts)
  const glow = [
    { mat: kit.mats.ledStripGreen as MeshStandardMaterial, k: 2.2 },
    { mat: kit.mats.chipArrowGreen as MeshStandardMaterial, k: 2.5 },
  ];
  let glowBloom: boolean | null = null;
  const offFrame = engine.onFrame((dt) => {
    const bloom = bloomActive();
    if (bloom !== glowBloom) {
      glowBloom = bloom;
      for (const g of glow) g.mat.emissiveIntensity = g.k * ledToneScale(g.k, bloom);
    }
    const l = store.getState().lab;
    const now = performance.now();
    for (const b of binders) b.update(l, dt, now);
    shelfBinder(l, now);
    kit.root.updateMatrixWorld();
    kit.updateDynamic();
    movingInst.update();
    kit.leds.tick(dt * 1000);
    screens.update(l, now);
    receipts.update(l);
  });
  current = {
    kit, movingInst, racks, views, binders, screens, callus, tethered, adb,
    dispose() {
      offFrame();
      unregister();
      screens.dispose();
      receipts.dispose();
      movingInst.dispose();
      engine.scene.remove(kit.root);
    },
  };
  onProgress(1, 'Robots ready');
}
