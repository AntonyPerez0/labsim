/**
 * DR08 POM Builder / POM Doctor.
 * Build: the next card waits on the right — 1 = Zone 1, 2 = Zone 2, X = bin; P cycles the package, E the
 * superclass; Enter compiles. Click a placed card to take it back.
 * Doctor: read the broken class, tick every repair it needs (1–6), Enter.
 */
import { useEffect, useMemo, useState } from 'react';
import { getState } from '@/core/store';
import type { DrillComponentProps } from '../../types';
import { keyIndex, useDrill, useKeys } from '../common/useDrill';
import { Btn, Kbd, Legend, Reveal, Waiting } from '../common/ui';
import { buildPoints, correctZone, doctorPoints, gradeBuild, gradeDoctor, PACKAGES, REPAIR_TEXT, SUPERS, type BuildData, type DoctorData, type PomCard, type PomData, type RepairId, type Zone } from './logic';
import type { DrillHandle } from '../common/useDrill';
import './style.css';

export function View(props: DrillComponentProps) {
  const d = useDrill<PomData, unknown>(props);
  const it = d.item;
  if (!it) return <Waiting />;
  return it.data.mode === 'doctor' ? <Doctor key={d.itemKey} d={d} data={it.data} why={it.teach.why} /> : <Build key={d.itemKey} d={d} data={it.data} why={it.teach.why} />;
}

/* ───────────── Build ───────────── */

interface BuildPayload {
  zones: Record<string, Zone>;
}

function Build({ d, data, why }: { d: DrillHandle<PomData, unknown>; data: BuildData; why: string }) {
  const [zones, setZones] = useState<Record<string, Zone>>({});
  const [pkg, setPkg] = useState<string>(data.pkg);
  const [sup, setSup] = useState<string>(data.sup);
  const st = d.staged as { verdict: { correct: boolean }; points: number; multiplier: number; payload: BuildPayload } | null;
  const queue = data.cards.filter((c) => !zones[c.id]);
  const next = queue[0] ?? null;

  const place = (c: PomCard | null, z: Zone) => {
    if (!c || st) return;
    setZones((zs) => ({ ...zs, [c.id]: z }));
  };
  const cycle = <T extends string>(list: readonly T[], v: string): T => list[(list.indexOf(v as T) + 1) % list.length]!;

  const compile = () => {
    if (st || queue.length) return;
    const g = gradeBuild(data, zones, pkg, sup);
    const ms = d.elapsedMs();
    const pts = buildPoints(g, ms / 1000, getState().session.drill?.streak ?? 0);
    const bad = [g.pkgOk ? '' : 'package', g.supOk ? '' : 'superclass', g.cardsOk < g.cards ? `${g.cards - g.cardsOk} card${g.cards - g.cardsOk > 1 ? 's' : ''} misplaced` : ''].filter(Boolean).join(' · ');
    d.stage({ correct: g.perfect, pointsOverride: pts, elapsedMs: ms, detail: g.perfect ? undefined : bad }, { zones });
  };

  useKeys(
    (e) => {
      if (st) return;
      if (e.code === 'Digit1' || e.code === 'Numpad1') place(next, 'z1');
      else if (e.code === 'Digit2' || e.code === 'Numpad2') place(next, 'z2');
      else if (e.code === 'KeyX' || e.code === 'Digit0') place(next, 'bin');
      else if (e.code === 'KeyP') setPkg((p) => cycle(PACKAGES, p));
      else if (e.code === 'KeyE') setSup((s) => cycle(SUPERS, s));
      else if (e.code === 'Backspace') {
        e.preventDefault();
        const placed = data.cards.filter((c) => zones[c.id]);
        const last = Object.keys(zones).pop();
        if (last && placed.length) setZones((zs) => Object.fromEntries(Object.entries(zs).filter(([k]) => k !== last)));
      } else if (e.code === 'Enter') {
        e.preventDefault();
        compile();
      }
    },
    [zones, pkg, sup, st, next?.id],
  );

  const inZone = (z: Zone) => data.cards.filter((c) => zones[c.id] === z);
  const mark = (c: PomCard) => (st ? (correctZone(c) === zones[c.id] ? ' is-ok' : ' is-bad') : '');
  const line = (c: PomCard) => (
    <button key={c.id} type="button" className={`dr08-placed${mark(c)}`} onClick={() => !st && setZones((zs) => Object.fromEntries(Object.entries(zs).filter(([k]) => k !== c.id)))}>
      <code>{c.code}</code>
      {st && correctZone(c) !== zones[c.id] ? <span className="dr08-placed__why">{c.why}</span> : null}
    </button>
  );

  return (
    <div className="dr08">
      <div className="dr08-editor">
        <div className="dr08-editor__tab">androidTest/java/com/labsim/uia/pageobjects/{data.cls}.java</div>
        <div className="dr08-src">
          <div className="dr08-row">
            <span className="kw">package</span> com.labsim.uia.
            <button type="button" className={`dr08-token${st ? (pkg === 'pageobjects' ? ' is-ok' : ' is-bad') : ''}`} onClick={() => !st && setPkg((p) => cycle(PACKAGES, p))}>
              {pkg}
            </button>
            ; <Kbd k="P" size="sm" />
          </div>
          <div className="dr08-row">&nbsp;</div>
          <div className="dr08-row">
            <span className="kw">public class</span> <span className="cls">{data.cls}</span> <span className="kw">extends</span>{' '}
            <button type="button" className={`dr08-token${st ? (sup === 'BaseTest' ? ' is-ok' : ' is-bad') : ''}`} onClick={() => !st && setSup((s) => cycle(SUPERS, s))}>
              {sup}
            </button>{' '}
            {'{'} <Kbd k="E" size="sm" />
          </div>
          <div className="dr08-zone">
            <div className="dr08-zone__title">// ===== Zone 1: Element Locators =====</div>
            {inZone('z1').map(line)}
            {!inZone('z1').length ? <div className="dr08-drop">// [drop locators here]</div> : null}
          </div>
          <div className="dr08-zone">
            <div className="dr08-zone__title">// ===== Zone 2: Helper / Action Methods =====</div>
            {inZone('z2').map(line)}
            {!inZone('z2').length ? <div className="dr08-drop">// [drop methods here]</div> : null}
          </div>
          <div className="dr08-row">{'}'}</div>
        </div>
      </div>
      <div className="dr08-side">
        {st ? (
          <Reveal correct={st.verdict.correct} points={st.points} multiplier={st.multiplier} title={st.verdict.correct ? `${data.cls} compiles — clean page object` : 'Review the red lines'} onNext={() => d.commit()} autoMs={2400}>
            {why}
          </Reveal>
        ) : next ? (
          <div className="dr08-next">
            <div className="dk-eyebrow">
              Card {data.cards.length - queue.length + 1} of {data.cards.length}
            </div>
            <code className="dr08-card">{next.code}</code>
            <div className="dr08-actions">
              <Btn onClick={() => place(next, 'z1')} k="1">
                Zone 1
              </Btn>
              <Btn onClick={() => place(next, 'z2')} k="2">
                Zone 2
              </Btn>
              <Btn onClick={() => place(next, 'bin')} k="X">
                Bin
              </Btn>
            </div>
            <div className="dr08-queue">
              {queue.slice(1, 5).map((c) => (
                <code key={c.id}>{c.code}</code>
              ))}
            </div>
          </div>
        ) : (
          <div className="dr08-next">
            <div className="dr08-ready">All cards placed. Package and superclass right?</div>
            <Btn primary onClick={compile} k="⏎">
              Compile ▶
            </Btn>
          </div>
        )}
        <div className="dr08-bin">
          <div className="dr08-bin__title">🗑 Bin</div>
          {inZone('bin').map((c) => (
            <button key={c.id} type="button" className={`dr08-placed is-bin${mark(c)}`} onClick={() => !st && setZones((zs) => Object.fromEntries(Object.entries(zs).filter(([k]) => k !== c.id)))}>
              <code>{c.code}</code>
              {st && correctZone(c) !== 'bin' ? <span className="dr08-placed__why">{c.why}</span> : null}
            </button>
          ))}
        </div>
      </div>
      {!st ? (
        <Legend
          items={[
            ['1', 'Zone 1'],
            ['2', 'Zone 2'],
            ['X', 'bin'],
            ['P', 'package'],
            ['E', 'extends'],
            ['⏎', 'compile'],
          ]}
        />
      ) : null}
    </div>
  );
}

/* ───────────── Doctor ───────────── */

interface DoctorPayload {
  ticked: RepairId[];
}

function Doctor({ d, data, why }: { d: DrillHandle<PomData, unknown>; data: DoctorData; why: string }) {
  const [ticked, setTicked] = useState<RepairId[]>([]);
  const st = d.staged as { verdict: { correct: boolean }; points: number; multiplier: number; payload: DoctorPayload } | null;
  useEffect(() => setTicked([]), [data]);
  const toggle = (r: RepairId) => !st && setTicked((t) => (t.includes(r) ? t.filter((x) => x !== r) : [...t, r]));
  const submit = () => {
    if (st || !ticked.length) return;
    const g = gradeDoctor(data, ticked);
    const ms = d.elapsedMs();
    const pts = doctorPoints(g, ms / 1000, getState().session.drill?.streak ?? 0);
    d.stage({ correct: g.perfect, pointsOverride: pts, elapsedMs: ms, detail: g.perfect ? undefined : `${g.hits}/${data.needed.length} repairs found${g.false ? `, ${g.false} unnecessary` : ''}` }, { ticked });
  };
  useKeys(
    (e) => {
      if (st) return;
      const { digit } = keyIndex(e);
      if (digit >= 1 && digit <= data.options.length) toggle(data.options[digit - 1]!);
      else if (e.code === 'Enter') {
        e.preventDefault();
        submit();
      }
    },
    [ticked, st],
  );
  const code = useMemo(() => data.lines, [data]);
  return (
    <div className="dr08 is-doctor">
      <div className="dr08-editor">
        <div className="dr08-editor__tab">{data.cls}.java — 🩺 POM Doctor</div>
        <div className="dr08-src is-doctor">
          {code.map((l, i) => (
            <div key={i} className="dr08-codeline">
              <span className="dr08-gutter">{i + 1}</span>
              <code>{l || ' '}</code>
            </div>
          ))}
        </div>
      </div>
      <div className="dr08-side">
        <div className="dr08-next">
          <div className="dk-eyebrow">What does this class need? Tick every repair.</div>
          {data.options.map((r, i) => {
            const on = (st ? st.payload.ticked : ticked).includes(r);
            const need = data.needed.includes(r);
            const cls = st ? (need && on ? ' is-ok' : need ? ' is-missed' : on ? ' is-bad' : '') : on ? ' is-on' : '';
            return (
              <button key={r} type="button" className={`dr08-check${cls}`} onClick={() => toggle(r)}>
                <Kbd k={String(i + 1)} size="sm" />
                <span className="dr08-check__box">{on ? '✓' : ''}</span>
                <span>{REPAIR_TEXT[r]}</span>
              </button>
            );
          })}
          {!st ? (
            <Btn primary onClick={submit} disabled={!ticked.length} k="⏎">
              Apply repairs
            </Btn>
          ) : null}
        </div>
        {st ? (
          <Reveal correct={st.verdict.correct} points={st.points} multiplier={st.multiplier} title={st.verdict.correct ? 'Patient discharged' : 'Not quite'} onNext={() => d.commit()} autoMs={2400}>
            {why}
          </Reveal>
        ) : null}
      </div>
      {!st ? <Legend items={[[`1–${data.options.length}`, 'tick a repair'], ['⏎', 'apply']]} /> : null}
    </div>
  );
}
