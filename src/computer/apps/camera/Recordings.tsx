/**
 * Lab Cameras recordings (Apps §8.6): list newest first, and the player with transport, scrubber event markers
 * (tap hit green / miss red / screen change blue), speed, and the Tap analysis panel.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getState } from '@/core/store';
import { emitAppAction, fmtTime24 } from '@/computer/apps';
import { render2d, displaySizeMm } from '@/render2d';
import type { TerminalDevice } from '@/sim/types';
import { getRecordings, recordingsVersion, subscribeRecordings, type RecEvent, type Recording } from './recorder';
import { Icon } from './icons';

export function useRecordings(): Recording[] {
  useSyncExternalStore(subscribeRecordings, recordingsVersion);
  return getRecordings();
}

export function RecordingsPage(props: { open(id: string): void }) {
  const recs = useRecordings();
  return (
    <div className="cam-main">
      <div className="cam-toolbar">
        <b>Recordings</b>
        <span style={{ color: '#9aa0a8' }}>Jenkins builds and local runs on robots with a camera · last 8 kept</span>
      </div>
      <div className="cam-rec-list">
        {recs.length === 0 ? (
          <div className="cam-empty" style={{ marginTop: 80 }}>
            <Icon name="film" size={40} />
            <h2>No recordings yet</h2>
            <p>A recording starts automatically when a Jenkins build or a local run checks out a robot with a Camera Stream URL.</p>
          </div>
        ) : null}
        {recs.map((r) => (
          <button key={r.id} type="button" className="cam-rec-row" onClick={() => props.open(r.id)} data-hint={`camera.recording:${r.buildId ?? r.runId ?? r.id}`}>
            {r.frames[0] ? <img src={r.frames[Math.floor(r.frames.length / 2)]!.dataUrl} alt="" /> : <div style={{ width: 128, aspectRatio: '16/9', background: '#000' }} />}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>
                {r.label} · {r.robotName.toUpperCase()}
              </div>
              <div style={{ color: '#9aa0a8', fontSize: 12 }}>
                {fmtTime24(r.startedMs).slice(0, 5)} · {r.frames.length} frames · {r.events.filter((e) => e.kind === 'tap').length} taps · {r.url}
              </div>
            </div>
            <span className={`cam-chip cam-chip-${r.recording ? 'REC' : r.result ?? ''}`}>{r.recording ? '● REC' : r.result ?? '—'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function markerClass(e: RecEvent): string | null {
  if (e.kind === 'tap') return e.hitButton && e.hitButton === e.button ? 'cam-mk-hit' : 'cam-mk-miss';
  if (e.kind === 'screen') return 'cam-mk-screen';
  return null;
}

function TapAnalysis(props: { rec: Recording; index: number; onClose(): void }) {
  const e = props.rec.events[props.index]!;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || !e.deviceId) return;
    const lab = getState().lab;
    const dev = lab.devices[e.deviceId];
    if (!dev) return;
    const display = e.display ?? 'primary';
    const size = displaySizeMm(dev, display) ?? { w: 60, h: 100 };
    const s = Math.min(320 / size.w, 360 / size.h);
    c.width = Math.round(size.w * s);
    c.height = Math.round(size.h * s);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const key = display === 'secondary' ? 'secondaryDisplay' : 'display';
    const base = dev[key];
    const copy: TerminalDevice = e.disp && base ? ({ ...dev, [key]: { ...base, screen: e.disp.screen, params: e.disp.params, receiptOptions: e.disp.receiptOptions } } as TerminalDevice) : dev;
    try {
      render2d.drawDeviceDisplay(ctx, lab, copy, display, { pxPerMm: s, showTouchTargets: true, timeMs: lab.time.physMs });
    } catch {
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    if (e.xMm != null && e.yMm != null) {
      const x = e.xMm * s;
      const y = e.yMm * s;
      ctx.strokeStyle = '#ff3b30';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 14, y);
      ctx.lineTo(x + 14, y);
      ctx.moveTo(x, y - 14);
      ctx.lineTo(x, y + 14);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }, [e]);
  const hit = !!e.hitButton && e.hitButton === e.button;
  return (
    <div className="cam-tap" role="dialog" aria-label="Tap analysis">
      <h3>
        Tap analysis
        <button type="button" className="cam-btn cam-btn-icon" onClick={props.onClose} aria-label="Close">
          <Icon name="x" />
        </button>
      </h3>
      <div style={{ fontSize: 12, color: '#9aa0a8' }}>
        {e.screen} / <b style={{ color: '#e6e6e6' }}>{e.button}</b> · {e.mode} · ({e.xMm?.toFixed(1)}, {e.yMm?.toFixed(1)}) mm
      </div>
      <canvas ref={ref} />
      <div style={{ margin: '6px 0', color: hit ? '#8ff0b0' : '#ffb4b4', fontWeight: 600 }}>{hit ? `Hit: ${e.hitButton}` : `Hit: ${e.hitButton ?? 'none'} (commanded ${e.button})`}</div>
      <pre>{e.line}</pre>
    </div>
  );
}

export function RecordingPlayer(props: { id: string; focused: boolean; back(): void }) {
  const recs = useRecordings();
  const rec = recs.find((r) => r.id === props.id) ?? null;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1);
  const [tap, setTap] = useState<number | null>(null);
  const finishedRef = useRef(false);
  const n = rec?.frames.length ?? 0;

  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!rec) return;
    if (openedFor.current === rec.id) return; // once per opened recording (StrictMode re-runs effects)
    openedFor.current = rec.id;
    emitAppAction('camera', 'camera.recording.opened', { recordingId: rec.id, buildId: rec.buildId, runId: rec.runId, robotName: rec.robotName });
    setIdx(0);
    finishedRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rec?.id]);

  // The current frame, readable from the playback timer. Side effects (stopping, the `finished` app
  // action, which updates the store) must not run inside a state updater: React calls updaters while
  // rendering, and a store update from there is "Cannot update a component while rendering".
  const idxRef = useRef(idx);
  idxRef.current = idx;
  useEffect(() => {
    if (!playing || !rec) return;
    const t = window.setInterval(() => {
      const last = rec.frames.length - 1;
      const i = idxRef.current;
      if (i >= last) {
        setIdx(Math.max(0, last));
        setPlaying(false);
        if (!rec.recording && !finishedRef.current) {
          finishedRef.current = true;
          emitAppAction('camera', 'camera.recording.finished', { recordingId: rec.id, buildId: rec.buildId, runId: rec.runId, robotName: rec.robotName });
        }
        return;
      }
      idxRef.current = i + 1;
      setIdx(i + 1);
    }, 500 / speed);
    return () => window.clearInterval(t);
  }, [playing, speed, rec]);

  useEffect(() => {
    if (!props.focused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIdx((i) => Math.min(n - 1, i + 1));
      } else if (e.key === '[') setSpeed((s) => (s === 2 ? 1 : 0.5));
      else if (e.key === ']') setSpeed((s) => (s === 0.5 ? 1 : 2));
      else if (e.key === 'Escape' && tap != null) {
        e.preventDefault();
        e.stopPropagation();
        setTap(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const markers = useMemo(() => (rec ? rec.events.map((e, i) => ({ e, i, cls: markerClass(e) })).filter((m) => m.cls) : []), [rec]);
  if (!rec) {
    return (
      <div className="cam-main">
        <div className="cam-stage">
          <div className="cam-empty">
            <h2>Recording not found</h2>
            <button type="button" className="cam-btn" onClick={props.back}>
              Back to recordings
            </button>
          </div>
        </div>
      </div>
    );
  }
  function togglePlay() {
    if (!rec) return;
    if (!playing && idx >= rec.frames.length - 1) setIdx(0);
    setPlaying((p) => !p);
  }
  const frame = rec.frames[Math.min(idx, n - 1)];
  const pct = n > 1 ? (idx / (n - 1)) * 100 : 0;
  const seek = (ev: React.MouseEvent<HTMLDivElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    setIdx(Math.round(f * Math.max(0, n - 1)));
  };
  const openTap = (i: number) => {
    const e = rec.events[i]!;
    setIdx(Math.min(e.frame, n - 1));
    setPlaying(false);
    if (e.kind !== 'tap') return;
    setTap(i);
    emitAppAction('camera', 'camera.tapAnalysis.opened', { recordingId: rec.id, eventIndex: i, screen: e.screen ?? '', button: e.button ?? '', hit: !!e.hitButton && e.hitButton === e.button });
  };
  const elapsed = frame ? Math.max(0, frame.physMs - rec.startedPhysMs) : 0;
  return (
    <div className="cam-main">
      <div className="cam-toolbar">
        <button type="button" className="cam-btn" onClick={props.back}>
          <Icon name="prev" /> Recordings
        </button>
        <b style={{ marginLeft: 6 }}>{rec.label}</b>
        <span style={{ color: '#9aa0a8' }}>· {rec.robotName.toUpperCase()}</span>
        <span className={`cam-chip cam-chip-${rec.recording ? 'REC' : rec.result ?? ''}`}>{rec.recording ? '● REC' : rec.result}</span>
      </div>
      <div className="cam-stage">
        <div className="cam-frame">{frame ? <img src={frame.dataUrl} alt={`Frame ${idx + 1}`} style={{ width: '100%', height: '100%', display: 'block' }} /> : null}</div>
        {tap != null ? <TapAnalysis rec={rec} index={tap} onClose={() => setTap(null)} /> : null}
      </div>
      <div className="cam-transport">
        <div className="cam-scrub" onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={Math.max(0, n - 1)} aria-valuenow={idx} aria-label="Scrubber" tabIndex={0}>
          <div className="cam-scrub-track" />
          <div className="cam-scrub-fill" style={{ width: `${pct}%` }} />
          {markers.map((m) => (
            <button
              key={m.i}
              type="button"
              className={`cam-marker ${m.cls}`}
              style={{ left: `${n > 1 ? (Math.min(m.e.frame, n - 1) / (n - 1)) * 100 : 0}%` }}
              title={m.e.kind === 'tap' ? m.e.line : `${m.e.from} → ${m.e.to}`}
              aria-label={m.e.kind === 'tap' ? `Tap ${m.e.button}` : `Screen ${m.e.to}`}
              onClick={(ev) => {
                ev.stopPropagation();
                openTap(m.i);
              }}
            />
          ))}
          <div className="cam-scrub-knob" style={{ left: `${pct}%` }} />
        </div>
        <div className="cam-transport-row">
          <button type="button" className="cam-btn cam-btn-icon" aria-label="Previous frame" onClick={() => setIdx((i) => Math.max(0, i - 1))}>
            <Icon name="stepBack" />
          </button>
          <button type="button" className="cam-btn cam-btn-icon" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          <button type="button" className="cam-btn cam-btn-icon" aria-label="Next frame" onClick={() => setIdx((i) => Math.min(n - 1, i + 1))}>
            <Icon name="stepFwd" />
          </button>
          <span className="cam-time">
            {(elapsed / 1000).toFixed(1)} s · frame {Math.min(idx + 1, n)}/{n}
          </span>
          <span style={{ flex: 1 }} />
          <span className="cam-speed" style={{ display: 'inline-flex', gap: 4 }}>
            {([0.5, 1, 2] as const).map((s) => (
              <button key={s} type="button" className="cam-btn" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
                {s}×
              </button>
            ))}
          </span>
        </div>
      </div>
    </div>
  );
}
