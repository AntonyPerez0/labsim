/**
 * DR10 hotspot renders (SVG): the POWER panel, the status tablet's Motion Control tab and tab bar, a Robot
 * Pi, a Station Duo and the power wall. Every clickable region carries `data-region` = an id from
 * `SCENE_REGIONS` (logic.ts). Shapes follow the reference photos (Cur §0.5 prop descriptions).
 */
import type { ReactNode } from 'react';
import type { HotspotScene } from './logic';

export interface SceneProps {
  /** Region state after an answer: the target glows green, a wrong pick red. */
  marks: { right: string | null; wrong: string | null };
  onPick: (region: string, el: Element) => void;
  disabled: boolean;
  /** Motion Control: show the yellow LOCK RELEASED banner. */
  yellow?: boolean;
}

function R({ id, children, p }: { id: string; children: ReactNode; p: SceneProps }) {
  const cls = `dr10-region${p.marks.right === id ? ' is-right' : ''}${p.marks.wrong === id ? ' is-wrong' : ''}`;
  return (
    <g
      className={cls}
      data-region={id}
      onClick={(e) => {
        if (!p.disabled) p.onPick(id, e.currentTarget);
      }}
    >
      {children}
    </g>
  );
}

function PowerPanel(p: SceneProps) {
  return (
    <svg viewBox="0 0 600 300" className="dr10-svg">
      <rect x="20" y="20" width="560" height="260" rx="18" fill="#1b1e22" stroke="#3a4048" strokeWidth="3" />
      <text x="50" y="62" fill="#d6dbe1" fontSize="22" fontWeight="800" letterSpacing="4">POWER</text>
      <R id="led-1" p={p}>
        <circle cx="90" cy="130" r="16" fill="#3cff6b" filter="url(#glow)" />
        <circle cx="90" cy="130" r="26" fill="transparent" />
      </R>
      <R id="led-2" p={p}>
        <circle cx="160" cy="130" r="16" fill="#3cff6b" filter="url(#glow)" />
        <circle cx="160" cy="130" r="26" fill="transparent" />
      </R>
      <R id="main" p={p}>
        <rect x="250" y="95" width="80" height="120" rx="10" fill="#2a2f36" stroke="#59616b" strokeWidth="2" />
        <rect x="273" y="105" width="34" height="58" rx="8" fill="#c9ced6" />
        <text x="290" y="245" fill="#d6dbe1" fontSize="18" fontWeight="800" textAnchor="middle">MAIN</text>
      </R>
      <R id="motor" p={p}>
        <rect x="370" y="95" width="80" height="120" rx="10" fill="#2a2f36" stroke="#59616b" strokeWidth="2" />
        <rect x="393" y="105" width="34" height="58" rx="8" fill="#c9ced6" />
        <text x="410" y="245" fill="#d6dbe1" fontSize="18" fontWeight="800" textAnchor="middle">MOTOR</text>
      </R>
      <R id="logo" p={p}>
        <g transform="translate(520 130)">
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={(i % 2) * 18 - 18} y={Math.floor(i / 2) * 18 - 18} width="15" height="15" rx="3" fill="#43b02a" />
          ))}
        </g>
      </R>
      <defs>
        <filter id="glow" x="-1" y="-1" width="3" height="3">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}

const MOTION_GROUPS: { name: string; buttons: [string, string][] }[] = [
  { name: 'Steppers', buttons: [['steppers-enable', 'Enable'], ['steppers-disable', 'Disable']] },
  { name: 'Park', buttons: [['park-all', 'Park All'], ['park-xy', 'Park XY'], ['park-x', 'Park X'], ['park-y', 'Park Y']] },
  { name: 'Dip', buttons: [['dip-in', 'In'], ['dip-out', 'Out']] },
  { name: 'Tap', buttons: [['tap-in', 'In'], ['tap-out', 'Out']] },
  { name: 'Phone', buttons: [['phone-forward', 'Forward'], ['phone-back', 'Back'], ['phone-power', 'Push Power Button']] },
  { name: 'Solenoid', buttons: [['sol-down', 'Down'], ['sol-up', 'Up'], ['sol-lower', 'Lower'], ['sol-raise', 'Raise']] },
];

function TabletFrame({ banner, children, tabs, p }: { banner: 'ok' | 'yellow'; children: ReactNode; tabs?: boolean; p: SceneProps }) {
  return (
    <svg viewBox="0 0 800 420" className="dr10-svg">
      <rect x="6" y="6" width="788" height="408" rx="22" fill="#0e0f11" />
      <rect x="22" y="22" width="756" height="376" rx="6" fill="#eef1f5" />
      <rect x="22" y="22" width="756" height="56" fill={banner === 'yellow' ? '#f5c518' : '#43b02a'} />
      {tabs ? (
        <>
          <R id="header-name" p={p}>
            <text x="44" y="60" fontSize="26" fontWeight="900" fill="#111">WALL-E</text>
          </R>
          <R id="header-status" p={p}>
            <text x="560" y="58" fontSize="16" fontWeight="700" fill="#111">Status: OK · Brainbox v6</text>
          </R>
        </>
      ) : (
        <>
          <text x="44" y="60" fontSize="26" fontWeight="900" fill="#111">WALL-E</text>
          <text x="440" y="58" fontSize="16" fontWeight="700" fill="#111">{banner === 'yellow' ? 'Status: LOCK RELEASED — PARK REQUIRED' : 'Status: OK · Brainbox v6'}</text>
        </>
      )}
      {children}
    </svg>
  );
}

function MotionControl(p: SceneProps) {
  const colW = 248;
  return (
    <TabletFrame banner={p.yellow ? 'yellow' : 'ok'} p={p}>
      <text x="44" y="108" fontSize="14" fontWeight="800" fill="#4b5563">ROBOT · ROBOT CONTROL · MOTION CONTROL</text>
      {MOTION_GROUPS.map((g, gi) => {
        const gx = 40 + (gi % 3) * colW;
        const gy = 128 + Math.floor(gi / 3) * 132;
        return (
          <g key={g.name}>
            <rect x={gx} y={gy} width={colW - 16} height="118" rx="10" fill="#fff" stroke="#d1d5db" />
            <text x={gx + 12} y={gy + 22} fontSize="13" fontWeight="800" fill="#374151">{g.name}</text>
            {g.buttons.map(([id, label], bi) => {
              const bw = g.buttons.length > 2 ? 106 : 106;
              const bx = gx + 10 + (bi % 2) * (bw + 8);
              const by = gy + 34 + Math.floor(bi / 2) * 40;
              return (
                <R key={id} id={id} p={p}>
                  <rect x={bx} y={by} width={bw} height="32" rx="7" fill="#1f6feb" />
                  <text x={bx + bw / 2} y={by + 21} fontSize={label.length > 12 ? 10.5 : 13} fontWeight="700" fill="#fff" textAnchor="middle">{label}</text>
                </R>
              );
            })}
          </g>
        );
      })}
    </TabletFrame>
  );
}

function TabletTabs(p: SceneProps) {
  const tabs: [string, string][] = [['tab-robot', 'Robot'], ['tab-control', 'Robot Control'], ['tab-motion', 'Motion Control']];
  return (
    <TabletFrame banner="ok" tabs p={p}>
      {tabs.map(([id, label], i) => (
        <R key={id} id={id} p={p}>
          <rect x={44 + i * 240} y="100" width="226" height="54" rx="10" fill={i === 0 ? '#1f2b4a' : '#fff'} stroke="#cbd5e1" />
          <text x={44 + i * 240 + 113} y="134" fontSize="18" fontWeight="800" textAnchor="middle" fill={i === 0 ? '#fff' : '#1f2937'}>{label}</text>
        </R>
      ))}
      <text x="44" y="200" fontSize="15" fill="#4b5563">Rig description: Flex 3 touch robot (photo rig). Dedicated webcam.</text>
      <text x="44" y="230" fontSize="15" fill="#4b5563">Robot Pi 10.42.10.11 · device 10.42.30.11 · Orca: Available</text>
    </TabletFrame>
  );
}

function PiBoard(p: SceneProps) {
  return (
    <svg viewBox="0 0 640 380" className="dr10-svg">
      <rect x="40" y="40" width="560" height="300" rx="22" fill="#1a7a3a" stroke="#0e4d23" strokeWidth="4" />
      {[60, 580].map((x) => [60, 320].map((y) => <circle key={`${x}-${y}`} cx={x} cy={y} r="11" fill="#d4af37" />))}
      <R id="gpio" p={p}>
        <rect x="110" y="52" width="380" height="34" rx="4" fill="#111" />
        {Array.from({ length: 20 }, (_, i) => (
          <rect key={i} x={118 + i * 18.6} y="58" width="9" height="9" fill="#d4af37" />
        ))}
        {Array.from({ length: 20 }, (_, i) => (
          <rect key={`b${i}`} x={118 + i * 18.6} y="72" width="9" height="9" fill="#d4af37" />
        ))}
      </R>
      <rect x="230" y="150" width="120" height="120" rx="6" fill="#2b2b2b" />
      <text x="290" y="215" fill="#888" fontSize="13" textAnchor="middle">BCM2712</text>
      <R id="eth" p={p}>
        <rect x="520" y="120" width="96" height="86" rx="4" fill="#c0c4c8" stroke="#8a9096" strokeWidth="2" />
        <rect x="544" y="146" width="48" height="36" fill="#333" />
      </R>
      <R id="usb" p={p}>
        <rect x="520" y="224" width="96" height="44" rx="4" fill="#c0c4c8" stroke="#8a9096" strokeWidth="2" />
        <rect x="534" y="238" width="68" height="14" fill="#1f4bd8" />
      </R>
      <R id="power-in" p={p}>
        <rect x="90" y="318" width="58" height="34" rx="6" fill="#c0c4c8" stroke="#8a9096" strokeWidth="2" />
        <text x="119" y="372" fill="#d6dbe1" fontSize="12" textAnchor="middle">5V</text>
      </R>
      <R id="hdmi" p={p}>
        <rect x="190" y="318" width="54" height="30" rx="4" fill="#c0c4c8" stroke="#8a9096" strokeWidth="2" />
        <rect x="264" y="318" width="54" height="30" rx="4" fill="#c0c4c8" stroke="#8a9096" strokeWidth="2" />
      </R>
      <R id="led-pwr" p={p}>
        <rect x="64" y="210" width="16" height="10" rx="2" fill="#ff3b30" />
        <rect x="56" y="202" width="32" height="26" fill="transparent" />
        <text x="72" y="244" fill="#e5f5ea" fontSize="10" textAnchor="middle">PWR</text>
      </R>
      <R id="led-act" p={p}>
        <rect x="64" y="160" width="16" height="10" rx="2" fill="#3cff6b" />
        <rect x="56" y="152" width="32" height="26" fill="transparent" />
        <text x="72" y="194" fill="#e5f5ea" fontSize="10" textAnchor="middle">ACT</text>
      </R>
      <text x="300" y="120" fill="#bfe8cc" fontSize="14" fontWeight="700" textAnchor="middle">Robot Pi · wall-e · 10.42.10.11</text>
    </svg>
  );
}

function StationDuo(p: SceneProps) {
  return (
    <svg viewBox="0 0 700 380" className="dr10-svg">
      <rect x="40" y="300" width="420" height="40" rx="10" fill="#d9dde2" />
      <R id="mfd" p={p}>
        <rect x="60" y="40" width="380" height="250" rx="14" fill="#111" />
        <rect x="74" y="54" width="352" height="222" rx="4" fill="#f4f6f8" />
        <rect x="74" y="54" width="352" height="30" fill="#2b7d19" />
        <text x="88" y="75" fill="#fff" fontSize="15" fontWeight="800">Register</text>
        <text x="250" y="180" fill="#374151" fontSize="18" fontWeight="700" textAnchor="middle">Review Order</text>
        <text x="250" y="210" fill="#6b7280" fontSize="13" textAnchor="middle">MFD (merchant)</text>
      </R>
      <R id="printer" p={p}>
        <rect x="300" y="300" width="140" height="34" rx="6" fill="#bfc4ca" />
        <rect x="320" y="312" width="100" height="6" fill="#7b8189" />
      </R>
      <R id="cfd" p={p}>
        <rect x="490" y="120" width="180" height="200" rx="14" fill="#111" transform="rotate(-6 580 220)" />
        <rect x="502" y="132" width="156" height="150" rx="4" fill="#f4f6f8" transform="rotate(-6 580 220)" />
        <text x="580" y="200" fill="#111" fontSize="16" fontWeight="800" textAnchor="middle" transform="rotate(-6 580 220)">TOTAL $10.83</text>
        <text x="580" y="226" fill="#6b7280" fontSize="12" textAnchor="middle" transform="rotate(-6 580 220)">CFD (customer)</text>
      </R>
      <text x="350" y="30" fill="#aab4bd" fontSize="13" textAnchor="middle">R2-D2 · STATION_DUO · 10.42.30.14</text>
    </svg>
  );
}

function PowerWall(p: SceneProps) {
  const box = (x: number, y: number, w: number, h: number, fill: string, l1: string, l2: string) => (
    <>
      <rect x={x} y={y} width={w} height={h} rx="8" fill={fill} stroke="#4b5563" strokeWidth="2" />
      <text x={x + w / 2} y={y + h / 2 - 2} fontSize="14" fontWeight="800" textAnchor="middle" fill="#111">{l1}</text>
      <text x={x + w / 2} y={y + h / 2 + 16} fontSize="11" textAnchor="middle" fill="#333">{l2}</text>
    </>
  );
  return (
    <svg viewBox="0 0 820 400" className="dr10-svg">
      <rect x="10" y="10" width="800" height="380" rx="14" fill="#2a2f35" />
      <R id="meanwell" p={p}>{box(40, 60, 170, 100, '#c8ccd2', 'MEAN WELL', 'IN 120VAC · OUT 24VDC')}</R>
      <R id="rail24" p={p}>
        <rect x="250" y="100" width="520" height="22" rx="4" fill="#b8860b" />
        <text x="510" y="116" fontSize="12" fontWeight="800" textAnchor="middle" fill="#1c1400">24 V DC RAIL</text>
      </R>
      <R id="reg12" p={p}>{box(300, 170, 150, 80, '#9fd3ff', 'STEP-DOWN', '12V DC · NUC')}</R>
      <R id="reg5" p={p}>{box(500, 170, 150, 80, '#a6f0a0', 'STEP-DOWN', '5V DC · 10A')}</R>
      <R id="fuse5" p={p}>
        <rect x="680" y="190" width="70" height="40" rx="6" fill="#1b1e22" stroke="#9aa3ad" />
        <rect x="694" y="202" width="42" height="16" rx="3" fill="#f5b301" />
        <text x="715" y="250" fontSize="11" textAnchor="middle" fill="#d6dbe1">RACK B 5V</text>
      </R>
      <R id="ac-strip" p={p}>
        <rect x="40" y="300" width="420" height="50" rx="10" fill="#e5e7eb" stroke="#9ca3af" strokeWidth="2" />
        {Array.from({ length: 6 }, (_, i) => (
          <g key={i}>
            <rect x={60 + i * 64} y="312" width="40" height="26" rx="5" fill="#cfd4da" />
            <rect x={72 + i * 64} y="318" width="4" height="12" fill="#333" />
            <rect x={84 + i * 64} y="318" width="4" height="12" fill="#333" />
          </g>
        ))}
        <text x="250" y="372" fontSize="12" textAnchor="middle" fill="#d6dbe1">COMMERCIAL AC POWER STRIP</text>
      </R>
      <text x="125" y="190" fontSize="12" textAnchor="middle" fill="#d6dbe1">wall 120 V AC</text>
      <line x1="125" y1="160" x2="125" y2="178" stroke="#d6dbe1" strokeWidth="2" />
    </svg>
  );
}

export function Scene({ scene, ...p }: SceneProps & { scene: HotspotScene }) {
  switch (scene) {
    case 'power-panel':
      return <PowerPanel {...p} />;
    case 'motion-control':
      return <MotionControl {...p} />;
    case 'tablet-tabs':
      return <TabletTabs {...p} />;
    case 'pi-board':
      return <PiBoard {...p} />;
    case 'station-duo':
      return <StationDuo {...p} />;
    case 'power-wall':
      return <PowerWall {...p} />;
  }
}
