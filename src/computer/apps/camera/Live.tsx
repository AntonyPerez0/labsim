/**
 * Lab Cameras live player (Apps §8.1–§8.2, §8.6 snapshot): toolbar, 16:9 player with overlays, the
 * "Stream unavailable — <url>" card, snapshot dialog → sim.camera.snapshot + putImage, Open in GIMP, Send to Ollama.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { getState, useGame } from '@/core/store';
import { sim } from '@/sim';
import { emitAppAction, fmtStamp, fmtTime24, putImage, type WindowManagerApi } from '@/computer/apps';
import { displaySizeMm } from '@/render2d';
import type { OrcaRobot } from '@/sim/types';
import { captureProfile, useCaptureJob } from './capture';
import { cameraDef, drawOverlays, drawStreamFrame, frameDataUrl, FRAME_H, FRAME_W, type FrameTag } from './frames';
import { isRecording } from './recorder';
import { robotTag, snapshotName, streamStatus, type StreamInfo } from './streams';
import { Icon } from './icons';

export interface LiveProps {
  url: string;
  robotName: string | null;
  streams: StreamInfo[];
  wm: WindowManagerApi | null;
  windowId: string;
  focused: boolean;
  navigate(route: string, opts?: { replace?: boolean }): void;
  streamRoute(s: StreamInfo, robot?: string | null): string;
}

const lastSnapshot = new Map<string, string>();

function useStatus(url: string) {
  const tick = useGame((s) => Math.floor(s.lab.time.physMs / 2000));
  const [retry, setRetry] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const status = useMemo(() => streamStatus(getState().lab, url), [url, tick, retry]);
  return { status, retry: () => setRetry((r) => r + 1) };
}

export function LivePage(props: LiveProps) {
  const { url, robotName, wm } = props;
  const { status, retry } = useStatus(url);
  const robots = useGame((s) => s.lab.orca.robots);
  const robot: OrcaRobot | null = useMemo(() => (robotName ? Object.values(robots).find((r) => r.name === robotName) ?? null : null), [robots, robotName]);
  const users = useMemo(() => Object.values(robots).filter((r) => (r.cameraStreamUrl ?? '').trim().toLowerCase() === url.toLowerCase()), [robots, url]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fill, setFill] = useState(false);
  const [dialog, setDialog] = useState<null | { then: 'none' | 'gimp' | 'ollama' }>(null);
  const [toast, setToast] = useState<null | { text: string; path: string }>(null);
  const prof = captureProfile();
  const idx = props.streams.findIndex((s) => s.url.toLowerCase() === url.toLowerCase());

  // camera.stream.opened once per URL (+ robot) open
  const opened = useRef<string>('');
  useEffect(() => {
    const key = `${url}|${robotName ?? ''}`;
    if (opened.current === key) return;
    opened.current = key;
    const host = /^https?:\/\/([^/:]+)/.exec(url)?.[1] ?? null;
    const rn = robotName ?? (users.length === 1 ? users[0]!.name : null);
    emitAppAction('camera', 'camera.stream.opened', { url, host, robotName: rn, cameraId: status.cameraId, ok: status.ok, error: status.ok ? null : `${status.error} · ${status.reason}` });
  }, [url, robotName, status, users]);

  const minimized = () => wm?.windows().find((w) => w.id === props.windowId)?.minimized ?? false;

  const highlightRect = useMemo(() => {
    if (!robot || !status.cameraId) return null;
    const cam = cameraDef(status.cameraId);
    if (!cam || cam.views.length < 2) return null;
    const lab = getState().lab;
    const devIds = lab.rigs[robot.name]?.deviceIds ?? [];
    const v = cam.views.find((x) => devIds.includes(x.deviceId));
    const dev = v ? lab.devices[v.deviceId] : null;
    if (!v || !dev) return null;
    const size = displaySizeMm(dev, v.display) ?? { w: 60, h: 100 };
    return { x: v.ox - 10, y: v.oy - 10, w: size.w * v.s + 20, h: size.h * v.s + 20 };
  }, [robot, status.cameraId]);

  useCaptureJob(
    () => {
      const c = canvasRef.current;
      if (!c || !status.ok) return;
      if (c.width !== prof.w) c.width = prof.w;
      if (c.height !== prof.h) c.height = prof.h;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const lab = getState().lab;
      const res = drawStreamFrame(ctx, lab, url, status.cameraId, true);
      let tags: FrameTag[] = res.tags;
      const cam = status.cameraId ? cameraDef(status.cameraId) : null;
      if ((cam?.rigId || users.length === 1) && users.length <= 1) {
        const r = users[0] ?? robot;
        tags = r ? [{ text: robotTag(r), x: 12, y: 12 }] : tags;
      }
      if (highlightRect) {
        const sx = c.width / FRAME_W;
        const sy = c.height / FRAME_H;
        ctx.strokeStyle = '#3ea6ff';
        ctx.lineWidth = Math.max(2, 3 * sx);
        ctx.strokeRect(highlightRect.x * sx, highlightRect.y * sy, highlightRect.w * sx, highlightRect.h * sy);
      }
      drawOverlays(ctx, tags, fmtStamp(lab.time.nowMs), isRecording(url));
    },
    prof.fps,
    status.ok && !minimized(),
  );

  const take = (path: string, then: 'none' | 'gimp' | 'ollama') => {
    let r: ReturnType<typeof sim.camera.snapshot>;
    try {
      r = sim.camera.snapshot(url, path, 'player');
    } catch (err) {
      console.warn('[camera] snapshot failed', err);
      r = { ok: false, error: 'Snapshot failed' };
    }
    if (!r.ok) return r.error;
    const lab = getState().lab;
    // Snapshots go to GIMP/Ollama/OCR, which measure against the sim frame model (Orca boxes such as
    // CFD_TOTAL 412,288,236×44): always the frame-model render, not the 3D live view.
    const dataUrl = frameDataUrl(lab, url, status.cameraId, { live: false });
    if (dataUrl) putImage({ ref: r.value.imageRef, dataUrl, width: FRAME_W, height: FRAME_H, kind: 'webcam' });
    lastSnapshot.set(url, r.value.path);
    const rn = robotName ?? (users.length === 1 ? users[0]!.name : null);
    emitAppAction('camera', 'camera.snapshot.saved', { path: r.value.path, ref: r.value.imageRef, url, robotName: rn });
    setToast({ text: `Snapshot saved — ${r.value.path}`, path: r.value.path });
    window.setTimeout(() => setToast((t) => (t?.path === r.value.path ? null : t)), 6000);
    if (then === 'gimp') wm?.openApp('gimp', { path: r.value.path });
    if (then === 'ollama') wm?.openApp('ollama', { attach: r.value.path });
    return null;
  };

  const withSnapshot = (then: 'gimp' | 'ollama') => {
    const p = lastSnapshot.get(url);
    if (p) {
      if (then === 'gimp') wm?.openApp('gimp', { path: p });
      else wm?.openApp('ollama', { attach: p });
    } else setDialog({ then });
  };

  useEffect(() => {
    if (!props.focused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 's' || e.key === 'S') {
        if (!status.ok) return;
        e.preventDefault();
        setDialog({ then: 'none' });
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setFill((f) => !f);
      } else if (e.key === 'Escape' && fill) {
        e.preventDefault();
        e.stopPropagation();
        setFill(false);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!props.streams.length) return;
        e.preventDefault();
        const n = props.streams.length;
        const next = props.streams[((idx < 0 ? 0 : idx) + (e.key === 'ArrowLeft' ? n - 1 : 1)) % n]!;
        props.navigate(props.streamRoute(next));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props, status.ok, fill, idx]);

  const step = (d: number) => {
    const n = props.streams.length;
    if (!n) return;
    props.navigate(props.streamRoute(props.streams[((idx < 0 ? 0 : idx) + d + n) % n]!));
  };
  const defaultName = snapshotName(robot ?? (users.length === 1 ? users[0]! : null), status.cameraId, fmtTime24(getState().lab.time.nowMs));

  return (
    <div className="cam-main">
      <div className="cam-toolbar">
        <span className={`cam-live${status.ok ? '' : ' cam-live-off'}`}>● LIVE</span>
        <button type="button" className="cam-btn cam-btn-icon" title="Previous stream (←)" aria-label="Previous stream" onClick={() => step(-1)}>
          <Icon name="prev" />
        </button>
        <button type="button" className="cam-btn cam-btn-icon" title="Next stream (→)" aria-label="Next stream" onClick={() => step(1)}>
          <Icon name="next" />
        </button>
        <div className="cam-url" title={url}>
          <span>{url}</span>
          <button type="button" className="cam-btn cam-btn-icon" style={{ height: 22, width: 24, border: 0, background: 'transparent' }} title="Copy URL" aria-label="Copy URL" onClick={() => wm?.clipboard.write(url, 'camera')}>
            <Icon name="copy" />
          </button>
        </div>
        <button type="button" className="cam-btn" data-hint="camera.snapshot" disabled={!status.ok} onClick={() => setDialog({ then: 'none' })} title="Snapshot (S)">
          <Icon name="camera" /> Snapshot
        </button>
        <button type="button" className="cam-btn" disabled={!status.ok} onClick={() => withSnapshot('gimp')}>
          <Icon name="gimp" /> Open in GIMP
        </button>
        <button type="button" className="cam-btn" disabled={!status.ok} onClick={() => withSnapshot('ollama')}>
          <Icon name="send" /> Send to Ollama
        </button>
        <button type="button" className="cam-btn" onClick={() => props.navigate('/wall')} title="Wall view (W)">
          <Icon name="grid" /> Wall view
        </button>
        <button type="button" className="cam-btn cam-btn-icon" onClick={() => setFill((f) => !f)} title="Fill window (F)" aria-label="Fill window" aria-pressed={fill}>
          <Icon name="fill" />
        </button>
      </div>
      <div className={`cam-stage${fill ? ' cam-stage-fill' : ''}`}>
        <div className="cam-frame" style={fill ? { width: '100%', height: '100%', aspectRatio: 'auto' } : undefined}>
          <canvas ref={canvasRef} width={prof.w} height={prof.h} aria-label={`Camera stream ${url}`} role="img" />
          {!status.ok ? (
            <div className="cam-unavail" role="alert">
              <div className="cam-unavail-title">{status.error}</div>
              <div className="cam-unavail-reason">{status.reason}</div>
              <button type="button" className="cam-btn" onClick={retry} style={{ marginTop: 8 }}>
                Retry
              </button>
            </div>
          ) : null}
        </div>
        {toast ? (
          <div className="cam-toast" role="status">
            <span>{toast.text}</span>
            <button type="button" className="cam-btn" onClick={() => wm?.openApp('gimp', { path: toast.path })}>
              Open in GIMP
            </button>
            <button type="button" className="cam-btn" onClick={() => wm?.openApp('files', { dir: toast.path.replace(/\/[^/]*$/, '') })}>
              Show in folder
            </button>
          </div>
        ) : null}
      </div>
      {dialog ? <SnapshotDialog defaultPath={`~/Pictures/${defaultName}`} onCancel={() => setDialog(null)} onSave={(p) => {
        const err = take(p, dialog.then);
        if (!err) setDialog(null);
        return err;
      }} /> : null}
    </div>
  );
}

function SnapshotDialog(props: { defaultPath: string; onCancel(): void; onSave(path: string): string | null }) {
  const [path, setPath] = useState(props.defaultPath);
  const [error, setError] = useState<string | null>(null);
  const save = () => {
    const p = path.trim();
    if (!p) return;
    setError(props.onSave(p));
  };
  return (
    <div className="cam-dialog-back" onKeyDown={(e) => e.key === 'Escape' && (e.preventDefault(), e.stopPropagation(), props.onCancel())}>
      <div className="cam-dialog" role="dialog" aria-modal="true" aria-label="Save snapshot as">
        <h3>Save snapshot as</h3>
        <input autoFocus value={path} onChange={(e) => setPath(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && save()} onFocus={(e) => e.currentTarget.setSelectionRange(path.lastIndexOf('/') + 1, path.lastIndexOf('.') > 0 ? path.lastIndexOf('.') : path.length)} aria-label="File name" />
        {error ? <div className="cam-error">{error}</div> : null}
        <div className="cam-dialog-foot">
          <button type="button" className="cam-btn" onClick={props.onCancel}>
            Cancel
          </button>
          <button type="button" className="cam-btn cam-btn-primary" onClick={save}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
