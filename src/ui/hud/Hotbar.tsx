/**
 * Hotbar (GP §6.3/§6.4): 1 screwdriver · 2 multimeter · 3 spare blade fuse · 4 Ethernet cable ·
 * 5 test card. Shows unlock state, the active tool and its `R` mode, pocket counts and the
 * large item carried in both hands (which disables the hotbar).
 */
import { mutate, useGame, useGameShallow } from '@/core/store';
import { HOTBAR_SLOTS, type HotbarSlot, type ToolId } from '@/core/state';
import { Icon, Kbd } from '@/ui/kit';
import { hasMission, ma } from '@/ui/services/missions';

const TOOL_ICON: Partial<Record<ToolId, string>> = {
  screwdriver: 'screwdriver',
  multimeter: 'multimeter',
  'spare-fuse-5v': 'fuse',
  'spare-fuse-12v': 'fuse',
  'ethernet-cable': 'ethernet',
  'usb-cable': 'ethernet',
  'test-card-visa': 'card',
  'test-card-interac': 'card',
  flashlight: 'flashlight',
  ruler: 'ruler',
  hand: 'hand',
};

const METER_MODE: Record<string, string> = { V_DC: 'V DC', V_AC: 'V AC', OHM: 'Ω', CONTINUITY: 'Cont.' };
const FUSE_COLOR: Record<string, string> = { '5': '#d8b98a', '7.5': '#8b5a2b', '10': '#e0453a', '15': '#3b82f6' };
const FUSE_NAME: Record<string, string> = { '5': 'tan', '7.5': 'brown', '10': 'red', '15': 'blue' };

export function selectHotbarSlot(slot: HotbarSlot | null): void {
  if (hasMission('selectHotbar')) {
    ma('selectHotbar', slot);
    return;
  }
  // Runtime not available yet: mirror the selection locally so the HUD still responds.
  mutate((s) => {
    if (slot === null) {
      s.session.activeTool = 'hand';
      return;
    }
    const def = HOTBAR_SLOTS.find((h) => h.slot === slot);
    if (!def) return;
    const tool: ToolId = def.tool === 'test-card-visa' && s.session.toolModes.card === 'INTERAC' ? 'test-card-interac' : def.tool;
    if (s.session.inventory.includes(def.tool) || s.session.inventory.includes(tool)) s.session.activeTool = tool;
  });
}

export function Hotbar() {
  const inventory = useGameShallow((s) => s.session.inventory);
  const active = useGame((s) => s.session.activeTool);
  const modes = useGame((s) => s.session.toolModes);
  const items = useGame((s) => s.session.items);
  const dialogueOpen = useGame((s) => !!s.session.dialogue);
  const carried = items.carried;
  const disabled = !!carried || dialogueOpen;
  const fuseTotal = Object.values(items.fuses).reduce((a, b) => a + b, 0);

  return (
    <div className={`hud-hotbar${disabled ? ' is-disabled' : ''}`}>
      {carried ? (
        <div className="hud-carried">
          <Icon name="box" size={16} />
          <span>
            Carrying <strong>{carried.label}</strong>
          </span>
          <span className="hud-carried__keys">
            <Kbd k="E" size="sm" /> install · <Kbd k="Q" size="sm" /> set down
          </span>
        </div>
      ) : null}
      <div className="hud-hotbar__slots">
        {HOTBAR_SLOTS.map((h) => {
          const tool: ToolId = h.tool === 'test-card-visa' && modes.card === 'INTERAC' ? 'test-card-interac' : h.tool;
          const unlocked = inventory.includes(h.tool) || inventory.includes(tool);
          const isActive = unlocked && (active === tool || (h.tool === 'spare-fuse-5v' && active === 'spare-fuse-12v') || (h.slot === 5 && (active === 'test-card-visa' || active === 'test-card-interac')));
          let mode: string | null = null;
          let count: string | null = null;
          if (h.tool === 'multimeter') mode = METER_MODE[modes.multimeter] ?? modes.multimeter;
          if (h.tool === 'screwdriver') mode = modes.screwdriverBit;
          if (h.tool === 'spare-fuse-5v') {
            mode = `${modes.fuseRating} A`;
            count = `${fuseTotal}/3`;
          }
          if (h.tool === 'ethernet-cable') count = String(items.ethernetCables);
          if (h.slot === 5) mode = modes.card === 'INTERAC' ? 'Interac' : 'Visa';
          return (
            <button
              key={h.slot}
              type="button"
              className={`hud-slot${isActive ? ' is-active' : ''}${unlocked ? '' : ' is-locked'}`}
              title={unlocked ? `${h.label} (${h.slot})` : `${h.label} — unlocks with ${h.unlockedBy}`}
              disabled={!unlocked || disabled}
              onClick={() => selectHotbarSlot(h.slot)}
            >
              <span className="hud-slot__num">{h.slot}</span>
              <span className="hud-slot__icon">
                {unlocked ? <Icon name={TOOL_ICON[tool] ?? 'box'} size={24} stroke={1.6} /> : <Icon name="lock" size={16} />}
                {h.tool === 'spare-fuse-5v' && unlocked ? <span className="hud-slot__fuse" style={{ background: FUSE_COLOR[String(modes.fuseRating)] }} title={`${modes.fuseRating} A ${FUSE_NAME[String(modes.fuseRating)]}`} /> : null}
              </span>
              {count !== null && unlocked ? <span className="hud-slot__count tnum">{count}</span> : null}
              {isActive && mode ? <span className="hud-slot__mode">{mode}</span> : null}
            </button>
          );
        })}
      </div>
      <div className="hud-hotbar__hint">
        {active !== 'hand' && !carried ? (
          <>
            <Kbd k="R" size="sm" /> mode · <Kbd k="Q" size="sm" /> holster
          </>
        ) : modes.flashlightOn ? (
          <>
            <Icon name="flashlight" size={12} /> Head torch on
          </>
        ) : null}
      </div>
    </div>
  );
}
