/**
 * Power wall interactions and sim bindings (World §9.2 "Power wall", §9.4): Mean Well cord,
 * regulator input switches, fuse holders (open / pull / insert spare / measure), DC taps, STRIP-W
 * and its sockets, wall outlets W1–W14, the M03 power trace, the multimeter / fuse tray / bench
 * pickups. Per-frame: DC OK + regulator LEDs, fuse blades (rating colour, blown, removed), strip
 * rocker + plugs, the PSU cord, sparks and fuse pops.
 */
import { PointLight } from 'three';
import { emit, mutate, store } from '@/core/store';
import { FUSE_RATINGS } from '@/core/state';
import { sim } from '@/sim';
import type { AcStrip, DcRail, Fuse, LabState, PowerOutlet, PowerSupplyUnit, Regulator } from '@/sim/types';
import { OUTLETS, POWER_TRACE, POWER_WALL, POWER_WALL_PARTS, findSimId, findSimObject, fuseOhmsPointId, powerProbePoints, type SimRef, type Vec3 } from '../layout';
import type { LabCtx } from './kit/context';
import { pickVerbs, simCall, toast, type VerbDef } from './kit/runtime';
import { carry, placeCarried, takeFuse, takeTool, useFuse } from './kit/inventory';
import { probe } from './kit/meter';
import { throttle } from './kit/bind';
import type { PowerWallRig } from './powerWall';

const F = POWER_WALL.boardFaceZ;
const PROBES = powerProbePoints();
const probeFor = (id: string) => PROBES.find((p) => p.id === id);
const part = (id: string) => POWER_WALL_PARTS.find((p) => p.id === id)!;
const at = (id: string): Vec3 => {
  const p = part(id);
  return [p.x, p.y, F + 0.03];
};

function lab(): LabState {
  return store.getState().lab;
}

const MULTIMETER = 'multimeter' as const;
const FUSE_TOOL = 'spare-fuse-5v' as const;

/** The carried plug's sim load id (carried.ref), or null. */
function carriedPlug(): { id: string; label: string; ref: string } | null {
  const c = store.getState().session.items.carried;
  if (!c || !c.ref) return null;
  if (!['flex4-psu-brick', 'collis-probe-spare', 'device', 'pi', 'pi-spare'].includes(c.id)) return null;
  return { id: c.id, label: c.label, ref: c.ref };
}

export function bindPowerWall(ctx: LabCtx, rig: PowerWallRig): void {
  const { engine } = ctx;
  const P = (id: string) => rig.proxies.get(id)!;

  /* ── M03 power trace ── */
  const trace = { active: false, idx: 0, doneAt: -1 };
  let now = 0;
  const traceVerb = (id: string): VerbDef | null => {
    if (!trace.active || !POWER_TRACE.nodes.includes(id)) return null;
    return {
      key: 'E',
      label: 'Trace: next stop',
      run: () => {
        const expected = POWER_TRACE.nodes[trace.idx];
        if (id !== expected) {
          engine.audio.play('ui-fail');
          toast('warning', 'Power trace', 'Not yet — follow the power from the wall outlet (W1) through the Mean Well.');
          emit('app.action', { app: 'world', action: 'power.trace.wrong', data: { clicked: id, expected } });
          return;
        }
        const gm = rig.traceGlow.get(id);
        if (gm) gm.visible = true;
        trace.idx++;
        engine.audio.play('ui-success');
        emit('app.action', { app: 'world', action: 'power.trace.step', data: { node: id, step: trace.idx } });
        if (trace.idx >= POWER_TRACE.nodes.length) {
          trace.active = false;
          trace.doneAt = now;
          toast('success', 'Power trace complete', '120V AC → Mean Well → 24V rail → 12V / 5V regulators → inline fuses → NUC shelf / Pi shelves.');
          emit('app.action', { app: 'world', action: 'power.trace.complete' });
        }
      },
    };
  };
  const withTrace = (id: string, defs: VerbDef[]) => {
    const t = traceVerb(id);
    return pickVerbs(t ? [t, ...defs.filter((d) => d.key !== 'E')] : defs);
  };
  ctx.ia.register('power.trace', P('power.trace'), () =>
    pickVerbs([
      {
        key: 'E',
        label: trace.active ? 'Restart trace' : 'Start trace',
        run: () => {
          trace.active = true;
          trace.idx = 0;
          for (const m of rig.traceGlow.values()) m.visible = false;
          toast('info', 'Power trace', 'Click each stop in order, starting at wall outlet W1.');
          emit('app.action', { app: 'world', action: 'power.trace.start' });
        },
      },
    ]),
  );

  /* ── Mean Well ── */
  const psuRef = part('power.psu.mw-1').sim!;
  const psuId = () => findSimId(lab(), psuRef, 'power.psu.mw-1') ?? psuRef.ids[0]!;
  ctx.ia.register('power.psu.mw-1', P('power.psu.mw-1'), () =>
    withTrace('power.psu.mw-1', [
      {
        key: 'E',
        label: (findSimObject<PowerSupplyUnit>(lab(), psuRef, 'power.psu.mw-1')?.on ?? true) ? 'Unplug AC cord' : 'Plug in AC cord',
        run: () => {
          const on = findSimObject<PowerSupplyUnit>(lab(), psuRef, 'power.psu.mw-1')?.on ?? true;
          const r = simCall('Mean Well AC cord', () => sim.power.togglePsu(psuId(), !on, 'player'));
          if (r?.ok) engine.audio.play(on ? 'unplug' : 'plug-in', { position: [-2.05, 1.07, -4.95] });
        },
      },
      { key: 'E', label: 'Measure 24 V out', tool: MULTIMETER, run: () => probe(engine, at('power.psu.mw-1'), 'MW-1 +V/−V', 'MW-1.out', 'psu:meanwell-1') },
    ]),
  );

  /* ── bus ── */
  ctx.ia.register('power.bus.24v', P('power.bus.24v'), () =>
    withTrace('power.bus.24v', [{ key: 'E', label: 'Measure', tool: MULTIMETER, run: () => probe(engine, at('power.bus.24v'), '24V DC rail', 'rail-24v') }]),
  );

  /* ── regulators ── */
  for (const id of ['power.reg.12v', 'power.reg.5v-a', 'power.reg.5v-b', 'power.reg.5v-c']) {
    const ref = part(id).sim!;
    const pp = probeFor(`mp.${id.slice(6)}.out`);
    ctx.ia.register(id, P(id), () =>
      withTrace(id, [
        { key: 'E', label: 'Measure output', tool: MULTIMETER, run: () => probe(engine, at(id), part(id).labels.join(' · '), pp?.pointId ?? '', pp?.altPointId) },
        {
          key: 'R',
          label: (findSimObject<Regulator>(lab(), ref, id)?.inputSwitch ?? true) ? 'Switch input off' : 'Switch input on',
          run: () => {
            const reg = findSimObject<Regulator>(lab(), ref, id);
            const simId = findSimId(lab(), ref, id) ?? ref.ids[0]!;
            const r = simCall('Regulator input switch', () => sim.power.toggleRegulator(simId, !(reg?.inputSwitch ?? true), 'player'));
            if (r) engine.audio.play('switch-toggle', { position: at(id), volume: 0.6 });
          },
        },
      ]),
    );
  }

  /* ── fuses ── */
  const fuseOpen = new Map<string, { target: number; cur: number }>();
  for (const [id, holder] of rig.fuses) {
    const ref = part(id).sim!;
    const key = id.slice('power.fuse.'.length);
    const pin = probeFor(`mp.fuse.${key}.in`);
    const pout = probeFor(`mp.fuse.${key}.out`);
    const st = { target: 0, cur: 0 };
    fuseOpen.set(id, st);
    const fuse = () => findSimObject<Fuse>(lab(), ref, id);
    const simId = () => findSimId(lab(), ref, id) ?? ref.ids[0]!;
    const isOpen = () => st.target > 0.5;
    const insert = () => {
      const rating = store.getState().session.toolModes.fuseRating;
      const have = store.getState().session.items.fuses[String(rating)] ?? 0;
      if (have <= 0) return void toast('warning', `No ${rating} A fuse in your pocket`, 'Take one from the fuse tray on the power bench (R cycles the rating).');
      const f = fuse();
      if (f && !(f.removed ?? false)) {
        const r = simCall('Pull fuse', () => sim.power.removeFuse(simId(), 'player'));
        if (!r?.ok) return;
      }
      const r = simCall('Insert fuse', () => sim.power.insertFuse(simId(), rating, 'player'));
      if (r?.ok) {
        useFuse(rating);
        mutate((s) => void (s.session.items.removedFuse = s.session.items.removedFuse ?? { fuseId: simId(), rating: f?.ratingA ?? 10, blown: f?.blown ?? false }));
        engine.audio.play('plug-in', { position: [part(id).x, part(id).y, F], volume: 0.7 });
      }
    };
    ctx.ia.register(id, P(id), () =>
      withTrace(id, [
        { key: 'E', label: isOpen() ? 'Close holder' : 'Open holder', run: () => ((st.target = isOpen() ? 0 : 1), engine.audio.play('switch-toggle', { position: at(id), volume: 0.3, rate: 1.6 })) },
        {
          key: 'R',
          label: 'Pull fuse',
          show: () => !(fuse()?.removed ?? false),
          blocked: () => (isOpen() ? null : 'Open the holder first (E)'),
          run: () => {
            const f = fuse();
            const r = simCall('Pull fuse', () => sim.power.removeFuse(simId(), 'player'));
            if (r?.ok) {
              mutate((s) => void (s.session.items.removedFuse = { fuseId: simId(), rating: f?.ratingA ?? 10, blown: f?.blown ?? false }));
              engine.audio.play('unplug', { position: at(id), volume: 0.6 });
            }
          },
        },
        {
          key: 'E',
          label: `Insert ${store.getState().session.toolModes.fuseRating} A fuse`,
          tool: FUSE_TOOL,
          // Only into an empty holder or over a blown fuse — after a good fuse is in, E closes the holder.
          show: () => (fuse()?.removed ?? false) || (fuse()?.blown ?? false),
          blocked: () => (isOpen() ? null : 'Open the holder first'),
          run: insert,
        },
        // The pulled fuse itself, out of circuit (Ω → OL when blown; M03 step 8). World §9.4 `fuseOhmsPointId`.
        {
          key: 'R', // free while the fuse is out ("Pull fuse" is hidden then)
          label: 'Measure the pulled fuse',
          tool: MULTIMETER,
          show: () => (fuse()?.removed ?? false) && store.getState().session.items.removedFuse?.fuseId === simId() && store.getState().session.activeTool === 'multimeter',
          run: () => {
            const pt = fuseOhmsPointId(simId());
            probe(engine, at(id), `${part(id).labels[0]} (pulled fuse)`, pt.pointId, pt.altPointId);
          },
        },
        { key: 'E', label: 'Measure (load side)', tool: MULTIMETER, run: () => probe(engine, at(id), `${part(id).labels[0]} out`, pout?.pointId ?? '', pout?.altPointId) },
        { key: 'G', label: 'Measure (supply side)', tool: MULTIMETER, run: () => probe(engine, at(id), `${part(id).labels[0]} in`, pin?.pointId ?? '', pin?.altPointId) },
      ]),
    );
    void holder;
  }

  /* ── DC taps ── */
  for (const id of ['power.tap.24v', 'power.tap.12v', 'power.tap.5v']) {
    const ref = part(id).sim!;
    ctx.ia.register(id, P(id), () =>
      pickVerbs([
        {
          key: 'E',
          label: carriedPlug() ? `Plug ${carriedPlug()!.label} here` : 'Plug in here',
          blocked: () => (carriedPlug() ? null : 'Carry a power plug first'),
          run: () => {
            const c = carriedPlug();
            if (!c) return;
            const target = findSimId(lab(), ref, id) ?? ref.ids[0]!;
            const r = simCall('DC tap', () => sim.power.plug(c.ref, { kind: 'dc-rail', targetId: target }, 'player'));
            if (r?.ok) {
              placeCarried(id, true);
              engine.audio.play('plug-in', { position: at(id) });
            }
          },
        },
        { key: 'E', label: 'Measure', tool: MULTIMETER, run: () => probe(engine, at(id), `DC tap ${part(id).labels[0]}`, ref.ids[0]!) },
      ]),
    );
  }

  /* ── tags (trace end nodes, callouts only otherwise) ── */
  for (const id of ['power.tag.nuc', 'power.tag.pi', 'power.tag.motor']) ctx.ia.register(id, P(id), () => withTrace(id, []));

  /* ── STRIP-W + sockets ── */
  const swRef = part('power.strip.w').sim!;
  const strip = () => findSimObject<AcStrip>(lab(), swRef, 'power.strip.w');
  const stripId = () => findSimId(lab(), swRef, 'power.strip.w') ?? swRef.ids[0]!;
  ctx.ia.register('power.strip.w', P('power.strip.w'), () =>
    pickVerbs([
      {
        key: 'E',
        label: (strip()?.switchOn ?? true) ? 'Switch off' : 'Switch on',
        run: () => {
          const r = simCall('AC strip switch', () => sim.power.toggleStrip(stripId(), !(strip()?.switchOn ?? true), 'player'));
          if (r) engine.audio.play('relay', { position: [0.15, 1.2, F], volume: 0.7 });
        },
      },
      {
        key: 'R',
        label: 'Reset breaker',
        show: () => !!strip()?.breakerTripped,
        run: () => void simCall('Reset breaker', () => sim.power.resetBreaker(stripId(), 'player')),
      },
      { key: 'E', label: 'Measure V~', tool: MULTIMETER, run: () => probe(engine, at('power.strip.w'), 'STRIP-W', stripId(), 'strip:power.strip.w') },
    ]),
  );
  for (let n = 1; n <= 6; n++) {
    const sid = `power.strip.w.s${n}`;
    const where = (): Vec3 => [rig.stripPlugs[n - 1]!.position.x, 1.2, F + 0.05];
    ctx.ia.register(sid, P(sid), () => {
      const load = strip()?.loads?.[n - 1] ?? null;
      return pickVerbs([
        load
          ? {
              key: 'E',
              label: `Unplug ${lab().power?.loads?.[load]?.label ?? load}`,
              run: () => {
                const r = simCall('Unplug', () => sim.power.unplug(load, 'player'));
                if (r?.ok) engine.audio.play('unplug', { position: where() });
              },
            }
          : {
              key: 'E',
              label: carriedPlug() ? `Plug ${carriedPlug()!.label} in` : 'Plug in',
              blocked: () => (carriedPlug() ? null : 'Carry a power plug first'),
              run: () => {
                const c = carriedPlug();
                if (!c) return;
                const r = simCall('Plug in', () => sim.power.plug(c.ref, { kind: 'ac-strip', targetId: stripId(), socket: n }, 'player'));
                if (r?.ok) {
                  placeCarried(sid, true);
                  engine.audio.play('plug-in', { position: where() });
                }
              },
            },
        { key: 'E', label: 'Measure V~', tool: MULTIMETER, run: () => probe(engine, where(), `STRIP-W socket ${n}`, stripId(), `strip:power.strip.w`) },
      ]);
    });
  }

  /* ── wall outlets ──
   * The sim models what hangs off an outlet as `outlet.plugged` (a PSU or AC strip id, Sim §2.6) and has no
   * outlet hookup kind, so the cord is "unplugged" through the thing it feeds: a PSU via `togglePsu`, a strip
   * via `toggleStrip` (both de-energise exactly what pulling the cord would). Loads only plug into strips. */
  for (const o of OUTLETS) {
    const outlet = () => findSimObject<PowerOutlet>(lab(), o.sim, o.id);
    const pos: Vec3 = [o.pos[0], o.pos[1], o.pos[2]];
    const cordVerb = (): VerbDef | null => {
      const L = lab();
      const plugged = outlet()?.plugged ?? null;
      if (!plugged) return null;
      const psu = L.power?.psus?.[plugged];
      if (psu) {
        return {
          key: 'E',
          label: psu.on ? `Unplug ${plugged} AC cord` : `Plug ${plugged} AC cord back in`,
          run: () => {
            const r = simCall('Mean Well AC cord', () => sim.power.togglePsu(plugged, !psu.on, 'player'));
            if (r?.ok) engine.audio.play(psu.on ? 'unplug' : 'plug-in', { position: pos });
          },
        };
      }
      const st = L.power?.strips?.[plugged];
      if (st) {
        return {
          key: 'E',
          label: st.switchOn ? `Unplug ${plugged} cord` : `Plug ${plugged} cord back in`,
          run: () => {
            const r = simCall('AC strip cord', () => sim.power.toggleStrip(plugged, !st.switchOn, 'player'));
            if (r?.ok) engine.audio.play(st.switchOn ? 'unplug' : 'plug-in', { position: pos });
          },
        };
      }
      if (L.power?.loads?.[plugged]) {
        const label = L.power.loads[plugged]!.label;
        return { key: 'E', label: `Unplug ${label}`, run: () => void (simCall('Unplug', () => sim.power.unplug(plugged, 'player'))?.ok && engine.audio.play('unplug', { position: pos })) };
      }
      return null;
    };
    ctx.ia.register(o.id, P(o.id), () => {
      const cord = cordVerb();
      const defs: VerbDef[] = [
        cord ?? {
          key: 'E',
          label: 'Plug in',
          show: () => !!carriedPlug(),
          blocked: () => 'LabSim / Collis bricks go on an AC strip socket',
          run: () => undefined,
        },
        { key: 'E', label: 'Measure V~', tool: MULTIMETER, run: () => probe(engine, pos, o.label, `WALL-${o.n}`, `outlet:w${o.n}`) },
      ];
      return o.n === 1 ? withTrace(o.id, defs) : pickVerbs(defs);
    });
  }

  /* ── bench pickups ── */
  ctx.ia.register('tool.multimeter', rig.pickups.get('tool.multimeter')!, () =>
    pickVerbs([{ key: 'E', label: 'Pick up', run: () => takeTool('multimeter', 'Multimeter') }]),
  );
  ctx.ia.register('power.fuse-tray', P('power.fuse-tray'), () => {
    const rating = store.getState().session.toolModes.fuseRating;
    return pickVerbs([
      { key: 'E', label: `Take ${rating} A fuse`, run: () => void (takeFuse(rating) && toast('success', `Took a ${rating} A blade fuse`, 'Select it with 3; R cycles the rating.')) },
      {
        key: 'R',
        label: 'Next rating',
        run: () =>
          mutate((s) => {
            const i = FUSE_RATINGS.indexOf(s.session.toolModes.fuseRating);
            s.session.toolModes.fuseRating = FUSE_RATINGS[(i + 1) % FUSE_RATINGS.length]!;
          }),
      },
    ]);
  });
  const loadRef = (propId: string, ids: string[]): string => {
    const l = findSimObject<{ id: string }>(lab(), { collection: 'power.loads', ids } as SimRef, propId);
    return l?.id ?? ids[0]!;
  };
  // Sim load ids: the M03 preset adds `psu-flex4-new` / `psu-collis-spare` (`power.addLoad`, no propId).
  const pickup: [string, Parameters<typeof carry>[0], string, string[]][] = [
    ['power.bench.flex4-psu', 'flex4-psu-brick', 'Flex 4 power brick', ['psu-flex4-new', 'brick-flex4-spare']],
    ['power.bench.collis-spare', 'collis-probe-spare', 'Spare Collis probe', ['psu-collis-spare', 'collis-spare']],
    ['power.bench.desk-fan', 'device', 'Desk fan', ['desk-fan']],
  ];
  for (const [id, item, label, fallback] of pickup) {
    ctx.ia.register(id, rig.pickups.get(id)!, () => pickVerbs([{ key: 'E', label: 'Pick up', run: () => void carry(item, label, loadRef(id, fallback), id) }]));
  }

  /* ── per-frame binding ── */
  const tick = throttle(12);
  const flash = new PointLight('#ffd6a0', 0, 1.2, 2);
  flash.visible = false;
  ctx.root.add(flash);
  let flashT = 0;
  let lastSparkAt = -1;
  const lastBlown = new Map<string, boolean>();
  let blink = 0;
  ctx.hooks.push((dt, t, L) => {
    now = t;
    // animate holder caps
    for (const [id, st] of fuseOpen) {
      if (Math.abs(st.cur - st.target) > 1e-3) {
        st.cur += Math.sign(st.target - st.cur) * Math.min(Math.abs(st.target - st.cur), dt * 5);
        const f = findSimObject<Fuse>(L, part(id).sim!, id);
        rig.fuses.get(id)!.setState({ rating: f?.ratingA ?? 10, blown: f?.blown ?? false, removed: f?.removed ?? false, open: st.cur });
      }
    }
    if (flashT > 0) {
      flashT -= dt;
      flash.intensity = Math.max(0, flashT) * 30;
      if (flashT <= 0) flash.visible = false;
    }
    if (trace.doneAt > 0 && t - trace.doneAt > 20) {
      trace.doneAt = -1;
      for (const m of rig.traceGlow.values()) m.visible = false;
    }
    if (!tick(t)) return;
    blink = (blink + 1) % 12;
    const pw = L?.power;
    const psu = findSimObject<PowerSupplyUnit>(L, psuRef, 'power.psu.mw-1');
    const psuOutlet = psu?.outletId ? pw?.outlets?.[psu.outletId] : undefined;
    const psuLive = (psu?.on ?? true) && (psuOutlet?.live ?? true);
    const hiccup = psu?.hiccupUntilPhysMs != null && (L.time?.physMs ?? 0) < psu.hiccupUntilPhysMs;
    ctx.leds.set(rig.psuLed, psuLive && (!hiccup || blink < 6));
    rig.psuCordIn.visible = psu?.on ?? true;
    rig.psuCordOut.visible = !rig.psuCordIn.visible;
    const rail24 = (pw?.rails?.['rail-24v'] as DcRail | undefined)?.voltage ?? 24.1;
    for (const [id, led] of rig.regLeds) {
      const reg = findSimObject<Regulator>(L, part(id).sim!, id);
      ctx.leds.set(led, (reg?.inputSwitch ?? true) && rail24 > 18);
    }
    for (const [id, holder] of rig.fuses) {
      const f = findSimObject<Fuse>(L, part(id).sim!, id);
      const st = fuseOpen.get(id)!;
      holder.setState({ rating: f?.ratingA ?? 10, blown: f?.blown ?? false, removed: f?.removed ?? false, open: st.cur });
      const blown = f?.blown ?? false;
      if (blown && lastBlown.get(id) === false) {
        engine.audio.play('fuse-pop', { position: [part(id).x, part(id).y, F + 0.02] });
        flash.position.set(part(id).x, part(id).y, F + 0.05);
        flash.visible = true;
        flashT = 0.15;
      }
      lastBlown.set(id, blown);
    }
    const s = strip();
    const sOutlet = s?.outletId ? pw?.outlets?.[s.outletId] : undefined;
    ctx.leds.set(rig.stripRocker, (s?.switchOn ?? true) && (sOutlet?.live ?? true) && !(s?.breakerTripped ?? false));
    rig.stripPlugs.forEach((m, i) => (m.visible = !!s?.loads?.[i]));
    for (const [id, g] of rig.pickups) {
      const carried = store.getState().session.items.carried;
      if (id === 'tool.multimeter') g.visible = !store.getState().session.inventory.includes('multimeter');
      else g.visible = !(carried && carried.label && (carried.ref === loadRef(id, pickup.find((p) => p[0] === id)?.[3] ?? ['']) || carried.label === pickup.find((p) => p[0] === id)?.[2]));
    }
    // sparks at the power wall
    const sp = pw?.sparks;
    const last = sp && sp.length ? sp[sp.length - 1]! : null;
    if (last && last.atPhysMs !== lastSparkAt) {
      if (lastSparkAt !== -1) {
        const where = sparkPos(last.at);
        engine.audio.play('spark', { position: where });
        flash.position.set(...where);
        flash.visible = true;
        flashT = 0.3;
      }
      lastSparkAt = last.atPhysMs;
    } else if (!last && lastSparkAt === -1) lastSparkAt = -2;
  });
}

/** Rough world position for a spark at a sim point id (fuse / terminal / strip / outlet). */
function sparkPos(at: string): Vec3 {
  const upper = at.toUpperCase();
  for (const p of POWER_WALL_PARTS) {
    if (p.sim && p.sim.ids.some((id) => upper.includes(id.toUpperCase()))) return [p.x, p.y, F + 0.04];
  }
  const m = /WALL-(\d+)/.exec(upper);
  if (m) {
    const o = OUTLETS.find((x) => x.n === Number(m[1]));
    if (o) return o.pos;
  }
  return [-0.7, 1.6, F + 0.1];
}
