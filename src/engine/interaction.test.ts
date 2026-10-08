import { describe, expect, it } from 'vitest';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, type Mesh as MeshT } from 'three';
import { InteractionSystem, type InteractionHooks } from './interaction';
import type { Interactable, InteractVerb } from './types';
import type { Prompt } from './prompt';

function world() {
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1, 0.05, 50);
  camera.position.set(0, 1.6, 0);
  camera.lookAt(0, 1.6, -5);
  scene.add(camera);
  camera.updateMatrixWorld();
  const group = new Group();
  group.position.set(0, 1.6, -1.5);
  const body = new Mesh(new BoxGeometry(0.3, 0.3, 0.3), new MeshBasicMaterial());
  const hitMat = new MeshBasicMaterial();
  hitMat.visible = false; // invisible, enlarged hit area
  const hitArea = new Mesh(new BoxGeometry(0.8, 0.8, 0.8), hitMat);
  group.add(body, hitArea);
  scene.add(group);
  scene.updateMatrixWorld(true);
  return { scene, camera, group, body, hitArea };
}

function harness() {
  const log = { prompts: [] as (Prompt | null)[], interacted: [] as string[], denied: 0, outlined: [] as MeshT[][] };
  const hooks: InteractionHooks = {
    writePrompt: (p) => log.prompts.push(p),
    lookingAtChanged: () => {},
    inspected: () => {},
    interacted: (_i, v) => log.interacted.push(v.label),
    denied: () => log.denied++,
    outline: (m) => {
      log.outlined.push(m ? [...m] : []);
      return true;
    },
  };
  return { sys: new InteractionSystem(hooks), log };
}

function queue(keys: InteractVerb['key'][]) {
  return () => keys.shift() ?? null;
}

describe('InteractionSystem', () => {
  it('runs at most one verb per frame; later presses see fresh state next frame', () => {
    const { scene, camera, group } = world();
    void scene;
    const { sys, log } = harness();
    let runs = 0;
    const i: Interactable = {
      id: 'dev',
      object: group,
      label: () => 'Device',
      verbs: () => [{ key: 'E', label: 'Use', run: () => { runs++; group.visible = false; } }],
    };
    sys.register(i);
    const keys: InteractVerb['key'][] = ['E', 'E'];
    sys.update(1 / 60, camera, true, 'hand', [], queue(keys));
    expect(runs).toBe(1);
    expect(keys).toEqual(['E']); // second press left for the next frame
    sys.update(1 / 60, camera, true, 'hand', [], queue(keys));
    expect(runs).toBe(1); // object hidden by the first verb → no target, press consumed
    expect(log.interacted).toEqual(['Use']);
    expect(log.prompts.at(-1)).toBeNull();
  });

  it('does not report an interaction whose verb threw', () => {
    const { camera, group } = world();
    const { sys, log } = harness();
    sys.register({ id: 'x', object: group, label: () => 'X', verbs: () => [{ key: 'E', label: 'Boom', run: () => { throw new Error('boom'); } }] });
    const err = console.error;
    console.error = () => {};
    sys.update(1 / 60, camera, true, 'hand', [], queue(['E']));
    console.error = err;
    expect(log.interacted).toEqual([]);
  });

  it('ignores interactables hidden through an ancestor or detached from the scene', () => {
    const { scene, camera, group } = world();
    const parent = new Group();
    scene.add(parent);
    parent.attach(group);
    const { sys, log } = harness();
    sys.register({ id: 'x', object: group, label: () => 'X', verbs: () => [] });
    parent.visible = false;
    sys.update(1 / 60, camera, true, 'hand', [], queue([]));
    expect(sys.targetId).toBeNull();
    parent.visible = true;
    sys.update(1 / 60, camera, true, 'hand', [], queue([]));
    expect(sys.targetId).toBe('x');
    scene.remove(parent);
    sys.update(1 / 60, camera, true, 'hand', [], queue([]));
    expect(sys.targetId).toBeNull();
    expect(log.prompts.at(-1)).toBeNull();
  });

  it('outlines only rendered meshes, never the invisible hit area', () => {
    const { camera, group, body } = world();
    const { sys, log } = harness();
    sys.register({ id: 'x', object: group, label: () => 'X', verbs: () => [] });
    sys.update(1 / 60, camera, true, 'hand', [], queue([]));
    expect(sys.targetId).toBe('x');
    expect(log.outlined.at(-1)).toEqual([body]);
  });

  it('rewrites the prompt after something else cleared ui.prompt', () => {
    const { camera, group } = world();
    const { sys, log } = harness();
    sys.register({ id: 'x', object: group, label: () => 'X', verbs: () => [{ key: 'E', label: 'Use', run: () => {} }] });
    sys.update(1 / 60, camera, true, 'hand', [], queue([]));
    const written = log.prompts.at(-1)!;
    expect(written?.label).toBe('X');
    const n = log.prompts.length;
    sys.adoptStorePrompt(written); // store still holds what we wrote → no rewrite
    sys.update(1 / 60, camera, true, 'hand', [], queue([]));
    expect(log.prompts.length).toBe(n);
    sys.adoptStorePrompt(null); // e.g. the store was reset
    sys.update(1 / 60, camera, true, 'hand', [], queue([]));
    expect(log.prompts.length).toBe(n + 1);
    expect(log.prompts.at(-1)?.label).toBe('X');
  });

  it('clears target and prompt and drains presses while disabled', () => {
    const { camera, group } = world();
    const { sys, log } = harness();
    let runs = 0;
    sys.register({ id: 'x', object: group, label: () => 'X', verbs: () => [{ key: 'E', label: 'Use', run: () => runs++ }] });
    sys.update(1 / 60, camera, true, 'hand', [], queue([]));
    const keys: InteractVerb['key'][] = ['E', 'E'];
    sys.update(1 / 60, camera, false, 'hand', [], queue(keys));
    expect(keys).toEqual([]);
    expect(runs).toBe(0);
    expect(sys.targetId).toBeNull();
    expect(log.prompts.at(-1)).toBeNull();
  });
});
