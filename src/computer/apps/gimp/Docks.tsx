/**
 * GIMP docks (Apps §6.1, §6.3–§6.4): Toolbox (symbolic icons), Tool Options (Rectangle Select Position/Size
 * fields, Zoom direction, Measure, Color Picker), Layers, Pointer dialog with the screencap "Device mm" block.
 */
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';
import { TOOL_INFO, toUnit, type Sel, type Tool, type Unit } from './model';

const TOOL_ICON: Record<Tool, ReactNode> = {
  rect: <rect x="3.5" y="4.5" width="13" height="11" strokeDasharray="2 1.6" />,
  ellipse: <ellipse cx="10" cy="10" rx="7" ry="5.5" strokeDasharray="2 1.6" />,
  free: <path d="M4 15l2-9 5 3 5-5-1 11z" strokeDasharray="2 1.6" />,
  fuzzy: <path d="M4 16l7-7M12 3l.8 2.2L15 6l-2.2.8L12 9l-.8-2.2L9 6l2.2-.8z" />,
  move: <path d="M10 2.5v15M2.5 10h15M10 2.5L8 4.5M10 2.5l2 2M10 17.5l-2-2M10 17.5l2-2M2.5 10l2-2M2.5 10l2 2M17.5 10l-2-2M17.5 10l-2 2" />,
  align: <path d="M3 3v14M6 5h9v3H6zM6 11h6v3H6z" />,
  crop: <path d="M6 2.5V14h11.5M2.5 6H14v11.5" />,
  transform: <path d="M4 4h12v12H4zM4 4l12 12M16 4L4 16" />,
  text: <path d="M4 4.5h12M10 4.5V16M7.5 16h5" />,
  bucket: <path d="M4 9l6-6 6 6-6 6zM16 12c1 1.5 1.5 2.3 1.5 3a1.5 1.5 0 01-3 0c0-.7.5-1.5 1.5-3z" />,
  gradient: <path d="M3 3h14v14H3zM3 17L17 3" />,
  paint: <path d="M14 3l3 3-7 7-3-3zM7 10c-2 0-3.5 1.5-3.5 3.5V17c2.5 0 6-1 6-4" />,
  eraser: <path d="M3 13l7-7 6 6-5 5H7zM8 17h9" />,
  clone: <path d="M6 3v5M4 8h4v3H4zM13 9a3 3 0 110 6 3 3 0 010-6zM6 11v6" />,
  smudge: <path d="M6 16c-1-4 1-6 4-7l3-5 3 2-3 5c-1 3-3 5-7 5z" />,
  dodge: <path d="M10 3a5 5 0 00-1 9.9V17h2v-4.1A5 5 0 0010 3z" />,
  paths: <path d="M3 16C6 4 14 16 17 4M3 16h.1M17 4h.1" />,
  picker: <path d="M13.5 3.5l3 3-1.5 1.5-1-1-6.5 6.5-3 1 1-3 6.5-6.5-1-1z" />,
  zoom: (
    <>
      <circle cx="8.5" cy="8.5" r="5" />
      <path d="M12.3 12.3L17 17M6.5 8.5h4M8.5 6.5v4" />
    </>
  ),
  measure: <path d="M3 13l10-10 4 4-10 10zM6 10l1.5 1.5M8 8l1 1M10 6l1.5 1.5" />,
};

const ORDER: Tool[] = ['move', 'align', 'rect', 'ellipse', 'free', 'fuzzy', 'crop', 'transform', 'measure', 'zoom', 'paths', 'text', 'picker', 'bucket', 'gradient', 'paint', 'eraser', 'clone', 'smudge', 'dodge'];

export function Toolbox(props: { tool: Tool; onTool(t: Tool): void }) {
  return (
    <div className="gimp-toolbox" role="toolbar" aria-label="Toolbox">
      <div className="gimp-wilber" aria-hidden="true">
        <svg viewBox="0 0 40 24" width="44" height="26">
          <path d="M6 18c2-8 8-12 15-11 4 .6 7 3 8 6l5-3-2 6c2 1 2 3 1 4-3-1-5 0-8 0H9c-2 0-3-1-3-2z" fill="#9b8c6f" />
          <circle cx="24" cy="10" r="1.6" fill="#2b2b2b" />
          <path d="M15 7l-3-5M19 6.5l-1-5" stroke="#9b8c6f" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </div>
      <div className="gimp-tools">
        {ORDER.map((t) => (
          <button
            key={t}
            type="button"
            className="gimp-tool"
            aria-pressed={props.tool === t}
            title={`${TOOL_INFO[t].label}${TOOL_INFO[t].key ? `  ${TOOL_INFO[t].key}` : ''}`}
            aria-label={TOOL_INFO[t].label}
            data-hint={t === 'rect' ? 'gimp.tool:rectSelect' : undefined}
            onClick={() => props.onTool(t)}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
              {TOOL_ICON[t]}
            </svg>
          </button>
        ))}
      </div>
      <div className="gimp-colors" aria-hidden="true">
        <span className="gimp-fg" />
        <span className="gimp-bg" />
      </div>
    </div>
  );
}

/** Spin field committing on Enter/blur; Ctrl+C copies its number. */
function NumField(props: { value: number | null; onCommit(v: number): void; onCopy(text: string): void; label: string; disabled?: boolean }) {
  const [text, setText] = useState(props.value == null ? '0' : String(props.value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(props.value == null ? '0' : String(props.value));
  }, [props.value, editing]);
  const commit = () => {
    setEditing(false);
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && n !== props.value) props.onCommit(n);
    else setText(props.value == null ? '0' : String(props.value));
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setEditing(false);
      setText(props.value == null ? '0' : String(props.value));
      (e.target as HTMLInputElement).blur();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
      const el = e.currentTarget;
      const selText = el.value.slice(el.selectionStart ?? 0, el.selectionEnd ?? 0);
      e.preventDefault();
      props.onCopy(selText || el.value);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const n = (Number(text) || 0) + (e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1);
      setText(String(n));
      props.onCommit(n);
    }
  };
  return (
    <input
      className="gimp-num"
      value={text}
      disabled={props.disabled}
      aria-label={props.label}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value.replace(/[^\d-]/g, ''))}
      onBlur={commit}
      onKeyDown={onKey}
    />
  );
}

export interface ToolOptionsProps {
  tool: Tool;
  sel: Sel | null;
  onSel(s: Sel): void;
  onCopyField(text: string): void;
  picked: [number, number, number] | null;
  measure: { dx: number; dy: number } | null;
  zoomOut: boolean;
  setZoomOut(v: boolean): void;
  hasImage: boolean;
}

export function ToolOptions(props: ToolOptionsProps) {
  const { tool, sel } = props;
  const s = sel ?? { x: 0, y: 0, w: 0, h: 0 };
  const dis = !props.hasImage;
  const check = (label: string, on = false) => (
    <label className="gimp-check">
      <input type="checkbox" defaultChecked={on} disabled={label !== 'Highlight' && label !== 'Auto Shrink' && label !== 'Expand from center'} /> {label}
    </label>
  );
  return (
    <div className="gimp-dock-panel">
      <div className="gimp-dock-tab">
        <span>Tool Options</span>
      </div>
      <div className="gimp-opts">
        <div className="gimp-opts-title">{TOOL_INFO[tool].label}</div>
        {tool === 'rect' ? (
          <>
            <div className="gimp-row">
              <span>Mode:</span>
              <span className="gimp-modes">
                {['replace', 'add', 'subtract', 'intersect'].map((m) => (
                  <button key={m} type="button" className="gimp-mode" aria-pressed={m === 'replace'} disabled={m !== 'replace'} title={m}>
                    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2">
                      {m === 'replace' ? <rect x="3" y="3" width="10" height="10" /> : m === 'add' ? <path d="M2 2h7v7H2zM7 7h7v7H7z" /> : m === 'subtract' ? <path d="M2 2h9v9H2zM6 6h8v8H6z" /> : <path d="M2 2h8v8H2zM6 6h8v8H6z" />}
                    </svg>
                  </button>
                ))}
              </span>
            </div>
            {check('Antialiasing', true)}
            {check('Feather edges')}
            {check('Rounded corners')}
            {check('Expand from center')}
            <div className="gimp-row">
              {check('Fixed')}
              <select className="gimp-select" disabled>
                <option>Aspect ratio</option>
              </select>
            </div>
            <input className="gimp-num gimp-wide" disabled value="1:1" readOnly aria-label="Aspect ratio" />
            <div className="gimp-field-label">Position:</div>
            <div className="gimp-pair" data-hint="gimp.toolOptions.position">
              <NumField label="Position X" value={sel ? s.x : null} disabled={dis || !sel} onCommit={(v) => props.onSel({ ...s, x: v })} onCopy={props.onCopyField} />
              <NumField label="Position Y" value={sel ? s.y : null} disabled={dis || !sel} onCommit={(v) => props.onSel({ ...s, y: v })} onCopy={props.onCopyField} />
              <span className="gimp-unit">px</span>
            </div>
            <div className="gimp-field-label">Size:</div>
            <div className="gimp-pair" data-hint="gimp.toolOptions.size">
              <NumField label="Size W" value={sel ? s.w : null} disabled={dis || !sel} onCommit={(v) => props.onSel({ ...s, w: v })} onCopy={props.onCopyField} />
              <NumField label="Size H" value={sel ? s.h : null} disabled={dis || !sel} onCommit={(v) => props.onSel({ ...s, h: v })} onCopy={props.onCopyField} />
              <span className="gimp-unit">px</span>
            </div>
            {check('Highlight')}
            <div className="gimp-row">
              <span>Guides:</span>
              <select className="gimp-select" defaultValue="No guides">
                <option>No guides</option>
                <option>Center lines</option>
                <option>Rule of thirds</option>
              </select>
            </div>
            {check('Auto Shrink')}
          </>
        ) : tool === 'zoom' ? (
          <>
            <div className="gimp-field-label">Direction (Ctrl)</div>
            <label className="gimp-check">
              <input type="radio" name="gimp-zoomdir" checked={!props.zoomOut} onChange={() => props.setZoomOut(false)} /> Zoom in
            </label>
            <label className="gimp-check">
              <input type="radio" name="gimp-zoomdir" checked={props.zoomOut} onChange={() => props.setZoomOut(true)} /> Zoom out
            </label>
          </>
        ) : tool === 'measure' ? (
          <>
            <div className="gimp-row">
              <span>Orientation:</span>
              <select className="gimp-select" defaultValue="Auto">
                <option>Auto</option>
                <option>Horizontal</option>
                <option>Vertical</option>
              </select>
            </div>
            <label className="gimp-check">
              <input type="checkbox" /> Use info window
            </label>
            {props.measure ? (
              <div className="gimp-readout">
                {Math.hypot(props.measure.dx, props.measure.dy).toFixed(1)} px
              </div>
            ) : null}
          </>
        ) : tool === 'picker' ? (
          <>
            <label className="gimp-check">
              <input type="checkbox" /> Sample average
            </label>
            {props.picked ? (
              <div className="gimp-readout">
                <span className="gimp-swatch" style={{ background: `rgb(${props.picked.join(',')})` }} />
                R {props.picked[0]} G {props.picked[1]} B {props.picked[2]}
                <br />
                Hex: {props.picked.map((v) => v.toString(16).padStart(2, '0')).join('')}
              </div>
            ) : (
              <div className="gimp-muted">Click in the image to pick a color.</div>
            )}
          </>
        ) : tool === 'move' ? (
          <div className="gimp-muted">Pick a layer or guide · Move the view (layer moves are not allowed on workstation images)</div>
        ) : (
          <div className="gimp-muted">This tool is not available in GIMP-lite</div>
        )}
      </div>
    </div>
  );
}

export function LayersDock(props: { name: string | null; thumb: string | null }) {
  return (
    <div className="gimp-dock-panel">
      <div className="gimp-dock-tab">
        <span>Layers</span>
        <span className="gimp-dock-tab-dim">Channels</span>
        <span className="gimp-dock-tab-dim">Paths</span>
      </div>
      <div className="gimp-layers-head">
        <span>Mode</span>
        <select className="gimp-select" disabled>
          <option>Normal</option>
        </select>
      </div>
      <div className="gimp-layers-head">
        <span>Opacity</span>
        <div className="gimp-bar">
          <i style={{ width: '100%' }} />
          <b>100.0</b>
        </div>
      </div>
      {props.name ? (
        <div className="gimp-layer" aria-selected="true">
          <span className="gimp-eye">👁</span>
          {props.thumb ? <img src={props.thumb} alt="" /> : <span className="gimp-thumb" />}
          <span>{props.name}</span>
        </div>
      ) : null}
    </div>
  );
}

export function PointerDock(props: { pointer: { x: number; y: number } | null; sel: Sel | null; unit: Unit; device: { type: string; pxPerMm: number } | null }) {
  const p = props.pointer;
  const u = props.unit;
  const s = props.sel;
  return (
    <div className="gimp-dock-panel">
      <div className="gimp-dock-tab">
        <span>Pointer</span>
      </div>
      <table className="gimp-ptr">
        <tbody>
          <tr>
            <th>Pixels</th>
            <td>X {p ? p.x : 'n/a'}</td>
            <td>Y {p ? p.y : 'n/a'}</td>
          </tr>
          <tr>
            <th>Units</th>
            <td>X {p ? toUnit(p.x, u === 'px' ? 'mm' : u) : 'n/a'}</td>
            <td>Y {p ? toUnit(p.y, u === 'px' ? 'mm' : u) : 'n/a'}</td>
          </tr>
          <tr>
            <th>Selection</th>
            <td>X {s ? s.x : 'n/a'}</td>
            <td>Y {s ? s.y : 'n/a'}</td>
          </tr>
          <tr>
            <th />
            <td>W {s ? s.w : 'n/a'}</td>
            <td>H {s ? s.h : 'n/a'}</td>
          </tr>
        </tbody>
      </table>
      {props.device ? (
        <div className="gimp-devmm">
          <b>Device mm</b>
          <div>
            {p ? `X ${(p.x / props.device.pxPerMm).toFixed(1)}  Y ${(p.y / props.device.pxPerMm).toFixed(1)} mm` : 'X n/a  Y n/a'} ({props.device.type} @ {props.device.pxPerMm.toFixed(3)} px/mm)
          </div>
          {s ? (
            <div>
              Selection centre: X {((s.x + s.w / 2) / props.device.pxPerMm).toFixed(1)}  Y {((s.y + s.h / 2) / props.device.pxPerMm).toFixed(1)} mm
            </div>
          ) : null}
          <small>{`GIMP's own "mm" unit uses the image print resolution (72 ppi), not the device's pixels per millimetre.`}</small>
        </div>
      ) : null}
    </div>
  );
}
