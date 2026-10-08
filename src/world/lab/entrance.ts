/**
 * Entrance (World §1.4 "Entrance & corridor", §9.2): lab door behaviour (badge-in, open/close,
 * auto-close after 8 s when the doorway is clear, dynamic leaf collider §1.8), badge reader LED,
 * push-to-exit button, Free Play light switch, first-aid box and extinguishers.
 */
import { Group, Mesh } from 'three';
import { DOOR, ROOM, getProp } from '../layout';
import { emit, store } from '@/core/store';
import type { ColliderBox } from '@/engine/types';
import { StaticBatch, xf } from './kit/batch';
import { cylGeo, latheGeo, rboxGeo, torusGeo, tubeGeo } from './kit/shapes';
import { addPrint, type LabCtx } from './kit/context';
import { pickVerbs, toast } from './kit/runtime';
import { buildBadgeReader, buildEntranceWallParts, type DoorRig } from './room';
import type { LightRig } from './lights';
import { drawPlate } from './kit/draw';

const R = ROOM.interior;
const OPEN_SPEED = DOOR.badgeOpenDeg / DOOR.badgeOpenS; // deg/s
const CLOSE_SPEED = 55;

export interface DoorControl {
  open(): void;
  close(): void;
  isOpen(): boolean;
  unlock(seconds: number): void;
}

export function buildEntrance(ctx: LabCtx, door: DoorRig, lights: LightRig): DoorControl {
  const { engine, mats } = ctx;
  const reader = buildBadgeReader(ctx);
  const { exitButton, lightSwitch } = buildEntranceWallParts(ctx);
  buildSafetyKit(ctx);

  /* ── door state ── */
  let angle = 0;
  let target = 0;
  let openedAt = -1;
  let unlockedUntil = -1;
  let now = 0;
  let readerGreenUntil = -1;
  let colliderOff: (() => void) | null = null;
  let colliderState = '';

  const setCollider = (box: ColliderBox | null, key: string) => {
    if (key === colliderState) return;
    colliderState = key;
    colliderOff?.();
    colliderOff = box ? engine.addCollider(box) : null;
  };
  const closedBox: ColliderBox = { min: [DOOR.opening.minX, 0, R.maxZ - 0.02], max: [DOOR.opening.maxX, DOOR.opening.height, R.maxZ + ROOM.wallThickness] };
  const leafBox = (deg: number): ColliderBox => {
    const a = (deg * Math.PI) / 180;
    const hx = DOOR.hingeX;
    const hz = R.maxZ + 0.0225;
    const fx = hx - DOOR.leaf.w * Math.cos(a);
    const fz = hz - DOOR.leaf.w * Math.sin(a);
    const p = 0.035;
    return { min: [Math.min(hx, fx) - p, 0, Math.min(hz, fz) - p], max: [Math.max(hx, fx) + p, DOOR.leaf.h, Math.max(hz, fz) + p] };
  };
  setCollider(closedBox, 'closed');
  ctx.disposers.push(() => colliderOff?.());

  const doorPos: [number, number, number] = [5.9, 1.2, R.maxZ];
  const control: DoorControl = {
    open() {
      if (target !== DOOR.badgeOpenDeg) engine.audio.play('door', { position: doorPos, volume: 0.8 });
      target = DOOR.badgeOpenDeg;
      openedAt = now;
    },
    close() {
      target = 0;
    },
    isOpen: () => angle > 1,
    unlock(seconds: number) {
      unlockedUntil = now + seconds;
    },
  };

  const playerOnCorridorSide = () => store.getState().session.player.position[2] > R.maxZ + 0.02;
  const doorwayClear = () => {
    const p = store.getState().session.player.position;
    return !(p[0] > DOOR.opening.minX - 0.4 && p[0] < DOOR.hingeX + 0.3 && p[2] > R.maxZ - DOOR.leaf.w - 0.35 && p[2] < R.maxZ + 0.6);
  };

  ctx.hooks.push((dt) => {
    now += dt;
    if (angle !== target) {
      const sp = target > angle ? OPEN_SPEED : CLOSE_SPEED;
      const prev = angle;
      angle = target > angle ? Math.min(target, angle + sp * dt) : Math.max(target, angle - sp * dt);
      if (prev > 0 && angle === 0) engine.audio.play('door', { position: doorPos, volume: 0.9, rate: 0.85 });
      door.pivot.rotation.y = -(angle * Math.PI) / 180;
    }
    // auto-close after 8 s when the doorway is clear
    if (target > 0 && openedAt >= 0 && now - openedAt > DOOR.autoCloseS && doorwayClear()) control.close();
    if (angle < DOOR.passableDeg) setCollider(closedBox, 'closed');
    else setCollider(leafBox(angle), `open:${Math.round(angle / 10)}`);
    ctx.leds.setColor(reader.ledIndex, now < readerGreenUntil ? '#2bff6a' : '#ff2614');
  });

  /* ── interactables ── */
  ctx.ia.register('door.lab', door.leaf, () =>
    pickVerbs([
      {
        key: 'E',
        label: target > 0 ? 'Close' : 'Open',
        blocked: () => (target === 0 && playerOnCorridorSide() && now > unlockedUntil ? 'Locked — badge in' : null),
        run: () => (target > 0 ? control.close() : control.open()),
      },
    ]),
  );
  ctx.ia.register('door.badge-reader', reader.group, () =>
    pickVerbs([
      {
        key: 'E',
        label: 'Badge in',
        run: () => {
          engine.audio.play('device-beep', { position: [5.28, 1.15, 5.17], volume: 0.9, rate: 1.15 });
          readerGreenUntil = now + 3;
          control.unlock(10);
          control.open();
          emit('app.action', { app: 'world', action: 'door.badgeIn' });
        },
      },
    ]),
  );
  ctx.ia.register('door.exit-button', exitButton, () =>
    pickVerbs([
      {
        key: 'E',
        label: 'Push to exit',
        run: () => {
          engine.audio.play('switch-toggle', { position: [5.28, 1.15, 4.99], volume: 0.6 });
          control.unlock(10);
          control.open();
        },
      },
    ]),
  );
  ctx.ia.register('wall.light-switch', lightSwitch, () =>
    pickVerbs([
      {
        key: 'E',
        label: 'Toggle lights',
        blocked: () => (store.getState().session.mode === 'freeplay' ? null : 'Free Play only'),
        run: () => {
          lights.setRoomLights(!lights.roomLightsOn());
          engine.audio.play('switch-toggle', { position: [5.1, 1.2, 4.99], volume: 0.7 });
          if (!lights.roomLightsOn()) toast('info', 'Lights off', 'Grab the flashlight (F) — the rack LEDs still glow.');
        },
      },
    ]),
  );

  return control;
}

/** First-aid box (east wall) and the two extinguishers (corridor + lab). */
function buildSafetyKit(ctx: LabCtx): void {
  const { mats } = ctx;
  const b = new StaticBatch('safety');
  // first aid: white box with a green cross, facing −X
  const fa = getProp('wall.first-aid');
  b.at(fa.pos[0], fa.pos[1], fa.pos[2], -Math.PI / 2, () => {
    b.add(rboxGeo(0.3, 0.25, 0.1, 0.01), mats.whiteEnamel, xf(0, 0, -0.03), 'both');
    b.box(0.07, 0.022, 0.004, mats.greenPaint, 0, 0.02, 0.0215, 0, 'none');
    b.box(0.022, 0.07, 0.004, mats.greenPaint, 0, 0.02, 0.0215, 0, 'none');
    b.box(0.03, 0.012, 0.012, mats.midGreyPlastic, 0.12, -0.04, 0.022, 0, 'none');
    addPrint(ctx.labels, b, 0.16, 0.03, 320, 60, (c, w, h) => drawPlate(c, w, h, 'FIRST AID', { bg: '#ffffff', fg: '#1f7a3b' }), xf(0, -0.075, 0.0205));
  });
  const ext = (pos: [number, number, number], rotY: number) =>
    b.at(pos[0], pos[1], pos[2], rotY, () => {
      // body (lathe), valve, hose, bracket, label band
      b.add(latheGeo([[0, -0.2], [0.055, -0.2], [0.06, -0.19], [0.06, 0.14], [0.05, 0.18], [0.025, 0.2], [0, 0.2]], 20), mats.red, xf(0, 0, -0.07), 'both');
      b.add(cylGeo(0.012, 0.014, 0.05, 10), mats.blackPlastic, xf(0, 0.225, -0.07), 'none');
      b.add(rboxGeo(0.09, 0.016, 0.022, 0.005), mats.blackPlastic, xf(0.03, 0.255, -0.07, 0, 0, -0.2), 'none');
      b.add(tubeGeo([[0.02, 0.23, -0.07], [0.06, 0.2, -0.02], [0.07, 0.0, -0.01], [0.065, -0.12, -0.02]], 0.007, 6, 20), mats.blackPlastic, null, 'none');
      b.box(0.04, 0.12, 0.004, mats.whiteEnamel, 0, 0.0, -0.0095, 0, 'none');
      b.box(0.08, 0.03, 0.02, mats.greySteel, 0, 0.12, -0.01, 0, 'none');
      b.add(torusGeo(0.061, 0.004, 6, 24, Math.PI), mats.greySteel, xf(0, 0.1, -0.07, Math.PI / 2, 0, 0), 'none');
    });
  const ce = getProp('corridor.extinguisher');
  ext([ce.pos[0], ce.pos[1], R.maxZ + ROOM.wallThickness], 0);
  const we = getProp('wall.extinguisher');
  ext([R.maxX, we.pos[1], we.pos[2]], -Math.PI / 2);
  ctx.statics.add(b);
  void Group;
  void Mesh;
}
