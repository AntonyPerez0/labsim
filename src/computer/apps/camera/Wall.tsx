/** Lab Cameras wall view (Apps §8.1 `/wall`): every stream at reduced fps; click a tile to open it. */
import { useEffect, useMemo, useRef } from 'react';
import { getState, useGame } from '@/core/store';
import { emitAppAction, fmtStamp } from '@/computer/apps';
import { captureProfile, useCaptureJob } from './capture';
import { drawOverlays, drawStreamFrame } from './frames';
import { streamStatus, type StreamInfo } from './streams';

function Tile(props: { s: StreamInfo; onOpen(): void; visible: () => boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const tick = useGame((st) => Math.floor(st.lab.time.physMs / 2000));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const status = useMemo(() => streamStatus(getState().lab, props.s.url), [props.s.url, tick]);
  const prof = captureProfile();
  useCaptureJob(
    () => {
      const c = ref.current;
      if (!c) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const lab = getState().lab;
      const r = drawStreamFrame(ctx, lab, props.s.url, status.cameraId, true);
      drawOverlays(ctx, r.tags, fmtStamp(lab.time.nowMs), false, 1.6);
    },
    Math.max(1, prof.fps / 2),
    status.ok && props.visible(),
  );
  return (
    <button type="button" className="cam-tile" onClick={props.onOpen} data-hint={`camera.stream:${props.s.host}`}>
      <canvas ref={ref} width={320} height={180} />
      {!status.ok ? (
        <div className="cam-tile-bad">
          {status.error}
          <br />
          {status.reason}
        </div>
      ) : null}
      <div className="cam-tile-label">
        <span className={`cam-dot ${status.ok ? 'cam-dot-ok' : 'cam-dot-bad'}`} style={{ marginTop: 0 }} />
        <b>{props.s.host}</b>
        <span style={{ color: '#9aa0a8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{props.s.robots.map((r) => r.humanReadableName).join(' · ')}</span>
      </div>
    </button>
  );
}

export function WallPage(props: { streams: StreamInfo[]; open(s: StreamInfo): void; visible: () => boolean }) {
  useEffect(() => {
    emitAppAction('camera', 'camera.wall.opened', {});
  }, []);
  const n = props.streams.length;
  const cols = n <= 4 ? 2 : n <= 9 ? 3 : 4;
  return (
    <div className="cam-main">
      <div className="cam-toolbar">
        <b>Wall view</b>
        <span style={{ color: '#9aa0a8' }}>
          {n} stream{n === 1 ? '' : 's'}
        </span>
      </div>
      <div className="cam-wall" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {props.streams.map((s) => (
          <Tile key={s.url} s={s} onOpen={() => props.open(s)} visible={props.visible} />
        ))}
      </div>
    </div>
  );
}
