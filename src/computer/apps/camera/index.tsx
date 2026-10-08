/**
 * Lab Cameras — MJPEG stream viewer (docs/design/50-computer-apps.md §8): stream list from the Orca robots'
 * Camera Stream URLs, live / mosaic player, wall view, snapshots, recordings with tap analysis.
 * Also exports the recorder and the image materializer started by `initComputer()` (Apps §1.6, §8.6).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getState, useGame } from '@/core/store';
import { APP_ROUTES, buildRoute, getWindowManager, matchRoute, type AppProps } from '@/computer/apps';
import { LivePage } from './Live';
import { WallPage } from './Wall';
import { RecordingPlayer, RecordingsPage, useRecordings } from './Recordings';
import { findRecording, startRecorder } from './recorder';
import { startMaterializer } from './materializer';
import { listStreams, streamStatus, urlOfHost, STREAM_RE, hostOfUrl, type StreamInfo } from './streams';
import { Icon } from './icons';
import './camera.css';

/** Start recording camera frames + events for Jenkins builds and local runs (Apps §8.6). Idempotent. */
export function startCameraRecorder(): () => void {
  return startRecorder();
}

/** Register the image materializer (Apps §1.6, §6.5). Idempotent; returns a disposer. */
export function startImageMaterializer(): () => void {
  return startMaterializer();
}

const R = APP_ROUTES.camera;

type CamPage = { kind: 'home' } | { kind: 'wall' } | { kind: 'stream'; host: string; robot: string | null } | { kind: 'recordings' } | { kind: 'recording'; id: string };

function parse(route: string): CamPage {
  if (matchRoute(R.wall, route)) return { kind: 'wall' };
  const s = matchRoute(R.stream, route);
  if (s) return { kind: 'stream', host: s.params.host!, robot: s.query.robot ?? null };
  if (matchRoute(R.recordings, route)) return { kind: 'recordings' };
  const rc = matchRoute(R.recording, route);
  if (rc) return { kind: 'recording', id: rc.params.id! };
  return { kind: 'home' };
}

function streamRoute(s: StreamInfo, robot?: string | null): string {
  const host = s.host;
  return buildRoute(R.stream, { host }, robot ? { robot } : undefined);
}

function Sidebar(props: { streams: StreamInfo[]; page: CamPage; navigate(r: string): void }) {
  const [q, setQ] = useState('');
  const [url, setUrl] = useState('');
  const [err, setErr] = useState(false);
  const tick = useGame((s) => Math.floor(s.lab.time.physMs / 2000));
  const recs = useRecordings();
  const status = useMemo(() => {
    const lab = getState().lab;
    const out: Record<string, boolean> = {};
    for (const s of props.streams) out[s.url] = streamStatus(lab, s.url).ok;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.streams, tick]);
  const needle = q.trim().toLowerCase();
  const streams = props.streams.filter((s) => !needle || s.url.toLowerCase().includes(needle) || s.robots.some((r) => r.name.includes(needle) || r.humanReadableName.toLowerCase().includes(needle)));
  const robots = props.streams
    .flatMap((s) => s.robots.map((r) => ({ r, s })))
    .filter(({ r }) => !needle || r.name.includes(needle) || r.humanReadableName.toLowerCase().includes(needle))
    .sort((a, b) => a.r.humanReadableName.localeCompare(b.r.humanReadableName));
  const cur = props.page.kind === 'stream' ? props.page : null;
  const openUrl = () => {
    const u = url.trim();
    const host = hostOfUrl(/^https?:\/\//i.test(u) ? u : `http://${u}`);
    if (!host || !STREAM_RE.test(/^https?:\/\//i.test(u) ? u : `http://${u}`)) {
      setErr(true);
      return;
    }
    setErr(false);
    setUrl('');
    props.navigate(buildRoute(R.stream, { host }));
  };
  return (
    <aside className="cam-side">
      <label className="cam-filter">
        <Icon name="search" />
        <input placeholder="Filter cameras…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filter cameras" />
      </label>
      <div className="cam-side-scroll">
        <div className="cam-sec">
          <span>Streams</span>
          <span>{streams.length}</span>
        </div>
        {streams.map((s) => (
          <button key={s.url} type="button" className="cam-item" aria-current={!!cur && cur.host === s.host && !cur.robot} onClick={() => props.navigate(streamRoute(s))} data-hint={`camera.stream:${s.host}`}>
            <span className={`cam-dot ${status[s.url] ? 'cam-dot-ok' : 'cam-dot-bad'}`} />
            <span style={{ minWidth: 0 }}>
              <b>{s.host}</b>
              <span style={{ color: '#9aa0a8' }}>{s.url.slice(s.url.indexOf(s.host) + s.host.length)}</span>
              <small>{s.robots.map((r) => r.humanReadableName).join(' · ')}</small>
            </span>
          </button>
        ))}
        <div className="cam-sec">
          <span>Robots</span>
          <span>{robots.length}</span>
        </div>
        {robots.map(({ r, s }) => (
          <button key={r.id} type="button" className="cam-item" aria-current={!!cur && cur.robot === r.name} onClick={() => props.navigate(streamRoute(s, r.name))}>
            <span className={`cam-dot ${status[s.url] ? 'cam-dot-ok' : 'cam-dot-bad'}`} />
            <span style={{ minWidth: 0 }}>
              <b>{r.humanReadableName}</b>
              <small>{s.host}</small>
            </span>
          </button>
        ))}
        <div className="cam-sec">
          <span>Recordings</span>
          <span>{recs.length}</span>
        </div>
        <button type="button" className="cam-item" aria-current={props.page.kind === 'recordings' || props.page.kind === 'recording'} onClick={() => props.navigate(R.recordings.path)}>
          <Icon name="film" />
          <span>
            <b>All recordings</b>
            <small>{recs.some((r) => r.recording) ? '● recording now' : 'Jenkins builds & local runs'}</small>
          </span>
        </button>
        <button type="button" className="cam-item" aria-current={props.page.kind === 'wall'} onClick={() => props.navigate(R.wall.path)}>
          <Icon name="grid" />
          <span>
            <b>Wall view</b>
            <small>All streams</small>
          </span>
        </button>
      </div>
      <div className="cam-open-url">
        <input placeholder="Open URL…  http://10.42.10.40:8081/stream.mjpg" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && openUrl()} aria-label="Open URL" style={err ? { borderColor: '#ff6b6b' } : undefined} />
        <button type="button" className="cam-btn" onClick={openUrl}>
          Open
        </button>
      </div>
    </aside>
  );
}

export function CameraApp(props: AppProps) {
  const route = props.route ?? props.params?.route ?? '/';
  const page = useMemo(() => parse(route), [route]);
  const robots = useGame((s) => s.lab.orca.robots);
  const streams = useMemo(() => listStreams(robots), [robots]);
  const { onTitle, navigate: nav, windowId } = props;
  const wm = props.wm ?? getWindowManager();
  const navigate = useCallback(
    (r: string, opts?: { replace?: boolean }) => {
      if (nav) nav(r, opts);
      else getWindowManager()?.navigate(windowId, r, opts);
    },
    [nav, windowId],
  );
  useEffect(() => {
    startRecorder();
    startMaterializer();
  }, []);

  // params.recordingBuildId → that build's recording (Apps §8.6).
  const recBuild = props.params?.recordingBuildId ?? null;
  const recs = useRecordings();
  useEffect(() => {
    if (!recBuild) return;
    const rec = findRecording(recBuild);
    if (rec) navigate(buildRoute(R.recording, { id: rec.id }), { replace: page.kind === 'home' });
    else if (page.kind !== 'recordings') navigate(R.recordings.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recBuild, props.params, recs.length]);

  const url = page.kind === 'stream' ? urlOfHost(page.host) : null;
  const title = page.kind === 'stream' ? `${page.robot ? page.robot.toUpperCase() : page.host} — Lab Cameras` : page.kind === 'wall' ? 'Wall view — Lab Cameras' : page.kind === 'recordings' || page.kind === 'recording' ? 'Recordings — Lab Cameras' : 'Lab Cameras';
  useEffect(() => onTitle?.(title), [title, onTitle]);
  const visible = () => !(wm?.windows().find((w) => w.id === windowId)?.minimized ?? false);
  const focused = props.focused !== false;

  useEffect(() => {
    if (!focused) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if ((e.key === 'w' || e.key === 'W') && !e.ctrlKey && !e.metaKey && !e.altKey && page.kind !== 'wall') {
        e.preventDefault();
        navigate(R.wall.path);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focused, navigate, page.kind]);

  return (
    <div className="cam-root" data-app="camera" data-window={windowId} key={props.reloadKey ?? 0}>
      <Sidebar streams={streams} page={page} navigate={navigate} />
      {page.kind === 'stream' && url ? (
        <LivePage key={url} url={url} robotName={page.robot} streams={streams} wm={wm} windowId={windowId} focused={focused} navigate={navigate} streamRoute={streamRoute} />
      ) : page.kind === 'wall' ? (
        <WallPage streams={streams} open={(s) => navigate(streamRoute(s))} visible={visible} />
      ) : page.kind === 'recordings' ? (
        <RecordingsPage open={(id) => navigate(buildRoute(R.recording, { id }))} />
      ) : page.kind === 'recording' ? (
        <RecordingPlayer id={page.id} focused={focused} back={() => navigate(R.recordings.path)} />
      ) : (
        <div className="cam-main">
          <div className="cam-stage">
            <div className="cam-empty">
              <Icon name="camera" size={44} />
              <h2>No stream selected</h2>
              <p>Pick a stream or a robot on the left, or open a URL such as http://10.42.10.40:8081/stream.mjpg.</p>
              <button type="button" className="cam-btn" onClick={() => navigate(R.wall.path)}>
                <Icon name="grid" /> Wall view
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
