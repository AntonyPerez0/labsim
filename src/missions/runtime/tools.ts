/**
 * Hotbar tools and pocket parts (GP §6.3/§6.4): slot selection, tool modes (`R`), world pickups and
 * installs, the large carried item (`Q` sets it down). The world calls these through the missions API.
 */
import type { TxContext } from '@/core/store';
import type { FuseRating, HotbarSlot, MultimeterMode, RootState, ToolId } from '@/core/state';
import { FUSE_POCKET_CAPACITY, FUSE_RATINGS, HOTBAR_SLOTS } from '@/core/state';
import type { InventoryItemRef, MissionResult } from '../api';
import { toast } from './feedback';

const ok: MissionResult = { ok: true, value: undefined };
const fail = (error: string): MissionResult => ({ ok: false, error });

const MULTIMETER_MODES: MultimeterMode[] = ['V_DC', 'V_AC', 'OHM', 'CONTINUITY'];

function busyHands(d: RootState): boolean {
  return !!d.session.items.carried || !!d.session.dialogue;
}

function setTool(d: RootState, ctx: TxContext, tool: ToolId, slot: number | null): void {
  if (d.session.activeTool === tool) return;
  d.session.activeTool = tool;
  ctx.emit('tool.selected', { tool, slot });
}

export function selectHotbar(d: RootState, ctx: TxContext, slot: HotbarSlot | null): void {
  if (busyHands(d)) return;
  if (slot === null) {
    setTool(d, ctx, 'hand', null);
    return;
  }
  const def = HOTBAR_SLOTS.find((s) => s.slot === slot);
  if (!def || !d.session.inventory.includes(def.tool)) return;
  const tool: ToolId = def.tool === 'test-card-visa' && d.session.toolModes.card === 'INTERAC' ? 'test-card-interac' : def.tool;
  setTool(d, ctx, tool, slot);
}

export function selectTool(d: RootState, ctx: TxContext, tool: ToolId): void {
  if (busyHands(d) && tool !== 'hand') return;
  const t: ToolId = tool === 'spare-fuse-12v' ? 'spare-fuse-5v' : tool;
  if (t !== 'hand' && t !== 'flashlight' && !d.session.inventory.includes(t)) return;
  const slot = HOTBAR_SLOTS.find((s) => s.tool === t || (t === 'test-card-interac' && s.tool === 'test-card-visa'))?.slot ?? null;
  if (t === 'flashlight') {
    d.session.toolModes.flashlightOn = !d.session.toolModes.flashlightOn;
    ctx.emit('tool.modeChanged', { tool: 'flashlight', mode: d.session.toolModes.flashlightOn ? 'on' : 'off' });
    return;
  }
  setTool(d, ctx, t, slot);
}

export function cycleToolMode(d: RootState, ctx: TxContext): void {
  const s = d.session;
  const m = s.toolModes;
  switch (s.activeTool) {
    case 'multimeter': {
      m.multimeter = MULTIMETER_MODES[(MULTIMETER_MODES.indexOf(m.multimeter) + 1) % MULTIMETER_MODES.length]!;
      ctx.emit('tool.modeChanged', { tool: 'multimeter', mode: m.multimeter });
      return;
    }
    case 'spare-fuse-5v':
    case 'spare-fuse-12v': {
      m.fuseRating = FUSE_RATINGS[(FUSE_RATINGS.indexOf(m.fuseRating) + 1) % FUSE_RATINGS.length]!;
      ctx.emit('tool.modeChanged', { tool: 'spare-fuse-5v', mode: String(m.fuseRating) });
      return;
    }
    case 'test-card-visa':
    case 'test-card-interac': {
      m.card = m.card === 'VISA' ? 'INTERAC' : 'VISA';
      const tool: ToolId = m.card === 'VISA' ? 'test-card-visa' : 'test-card-interac';
      s.activeTool = tool;
      ctx.emit('tool.modeChanged', { tool, mode: m.card });
      ctx.emit('tool.selected', { tool, slot: 5 });
      return;
    }
    case 'screwdriver':
      m.screwdriverBit = m.screwdriverBit === '2.5mm' ? '5mm' : '2.5mm';
      ctx.emit('tool.modeChanged', { tool: 'screwdriver', mode: m.screwdriverBit });
      return;
    case 'flashlight':
      m.flashlightOn = !m.flashlightOn;
      ctx.emit('tool.modeChanged', { tool: 'flashlight', mode: m.flashlightOn ? 'on' : 'off' });
      return;
    default:
      return;
  }
}

function fuseTotal(d: RootState): number {
  return Object.values(d.session.items.fuses).reduce((a, b) => a + b, 0);
}

export function takeItem(d: RootState, ctx: TxContext, item: InventoryItemRef, count = 1): MissionResult {
  const it = d.session.items;
  const n = Math.max(1, Math.floor(count));
  switch (item.kind) {
    case 'fuse': {
      if (fuseTotal(d) + n > FUSE_POCKET_CAPACITY) {
        toast(d, 'warning', 'Pockets full', `You can carry ${FUSE_POCKET_CAPACITY} spare fuses.`);
        return fail(`Pockets full (${FUSE_POCKET_CAPACITY} fuses).`);
      }
      const key = String(item.rating);
      it.fuses[key] = (it.fuses[key] ?? 0) + n;
      d.session.toolModes.fuseRating = item.rating as FuseRating;
      if (!d.session.inventory.includes('spare-fuse-5v')) d.session.inventory.push('spare-fuse-5v');
      ctx.emit('inventory.changed', { item: `fuse-${key}`, delta: n, total: it.fuses[key]! });
      return ok;
    }
    case 'ethernet-cable':
      it.ethernetCables += n;
      ctx.emit('inventory.changed', { item: 'ethernet-cable', delta: n, total: it.ethernetCables });
      return ok;
    case 'usb-lead':
      it.usbLeads += n;
      ctx.emit('inventory.changed', { item: 'usb-lead', delta: n, total: it.usbLeads });
      return ok;
    case 'test-card':
      if (!it.testCards.includes(item.card)) it.testCards.push(item.card);
      ctx.emit('inventory.changed', { item: `test-card-${item.card.toLowerCase()}`, delta: 1, total: 1 });
      return ok;
    case 'part':
      it.parts[item.id] = (it.parts[item.id] ?? 0) + n;
      ctx.emit('inventory.changed', { item: item.id, delta: n, total: it.parts[item.id]! });
      return ok;
    case 'removed-fuse':
      it.removedFuse = { fuseId: item.fuseId, rating: item.rating, blown: item.blown };
      ctx.emit('inventory.changed', { item: `removed-fuse:${item.fuseId}`, delta: 1, total: 1 });
      return ok;
    case 'carried':
      if (it.carried) return fail(`Your hands are full (${it.carried.label}).`);
      it.carried = { ...item.item };
      d.session.activeTool = 'hand';
      ctx.emit('item.pickedUp', { itemId: item.item.id, ref: item.item.ref, from: 'world' });
      return ok;
  }
  return fail('Unknown item.');
}

export function useItem(d: RootState, ctx: TxContext, item: InventoryItemRef, count = 1): MissionResult {
  const it = d.session.items;
  const n = Math.max(1, Math.floor(count));
  switch (item.kind) {
    case 'fuse': {
      const key = String(item.rating);
      if ((it.fuses[key] ?? 0) < n) return fail(`No ${key} A fuse in your pocket.`);
      it.fuses[key]! -= n;
      ctx.emit('inventory.changed', { item: `fuse-${key}`, delta: -n, total: it.fuses[key]! });
      return ok;
    }
    case 'ethernet-cable':
      if (it.ethernetCables < n) return fail('No spare Ethernet cable — refill from the blue bin.');
      it.ethernetCables -= n;
      ctx.emit('inventory.changed', { item: 'ethernet-cable', delta: -n, total: it.ethernetCables });
      return ok;
    case 'usb-lead':
      if (it.usbLeads < n) return fail('No USB lead.');
      it.usbLeads -= n;
      ctx.emit('inventory.changed', { item: 'usb-lead', delta: -n, total: it.usbLeads });
      return ok;
    case 'test-card':
      return it.testCards.includes(item.card) ? ok : fail('No such test card.');
    case 'part':
      if ((it.parts[item.id] ?? 0) < n) return fail(`No ${item.id} left.`);
      it.parts[item.id]! -= n;
      ctx.emit('inventory.changed', { item: item.id, delta: -n, total: it.parts[item.id]! });
      return ok;
    case 'removed-fuse':
      if (!it.removedFuse) return fail('You are not holding a fuse.');
      it.removedFuse = null;
      ctx.emit('inventory.changed', { item: `removed-fuse:${item.fuseId}`, delta: -1, total: 0 });
      return ok;
    case 'carried':
      if (!it.carried || it.carried.id !== item.item.id) return fail('You are not carrying that.');
      ctx.emit('item.placed', { itemId: it.carried.id, ref: it.carried.ref, targetId: item.item.ref ?? '', installed: true });
      it.carried = null;
      return ok;
  }
  return fail('Unknown item.');
}

export function setDownCarried(d: RootState, ctx: TxContext, targetId?: string): MissionResult {
  const c = d.session.items.carried;
  if (!c) return fail('Nothing to set down.');
  d.session.items.carried = null;
  ctx.emit('item.placed', { itemId: c.id, ref: c.ref, targetId: targetId ?? 'surface', installed: false });
  return ok;
}
