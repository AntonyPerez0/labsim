/**
 * World pickups → the player's pockets. Prefers the missions runtime (`missions.takeItem`, which
 * enforces pocket limits and emits the right events); while the runtime is still a stub, falls
 * back to a direct, equivalent store update (`session.items`, `session.inventory`) + events.
 */
import { emit, mutate, store } from '@/core/store';
import type { CarriedItem, CarriedItemId, FuseRating, ToolId } from '@/core/state';
import { FUSE_POCKET_CAPACITY } from '@/core/state';
import { missions } from '@/missions';
import type { InventoryItemRef } from '@/missions';
import { toast } from './runtime';

function viaMissions(fn: () => { ok: boolean; error?: string } | unknown): boolean | null {
  try {
    const r = fn() as { ok?: boolean; error?: string } | undefined;
    if (r && typeof r === 'object' && 'ok' in r) {
      if (!r.ok) toast('warning', 'Can’t take that', r.error ?? '');
      return !!r.ok;
    }
    return true;
  } catch {
    return null; // runtime not implemented yet → fallback
  }
}

function addTool(s: ReturnType<typeof store.getState>['session'], t: ToolId, select: boolean): void {
  if (!s.inventory.includes(t)) s.inventory.push(t);
  if (select) s.activeTool = t;
}

/** Spare blade fuse of a rating (pocket holds 3). */
export function takeFuse(rating: FuseRating): boolean {
  const ref: InventoryItemRef = { kind: 'fuse', rating };
  const r = viaMissions(() => missions.takeItem(ref, 1));
  if (r !== null) return r;
  const st = store.getState().session.items;
  const total = Object.values(st.fuses).reduce((a, b) => a + b, 0);
  if (total >= FUSE_POCKET_CAPACITY) {
    toast('warning', 'Pockets full', `You can carry ${FUSE_POCKET_CAPACITY} spare fuses.`);
    return false;
  }
  const key = String(rating);
  let after = 0;
  mutate((s) => {
    s.session.items.fuses[key] = (s.session.items.fuses[key] ?? 0) + 1;
    after = s.session.items.fuses[key]!;
    addTool(s.session, 'spare-fuse-5v', false);
  });
  emit('inventory.changed', { item: `fuse-${key}`, delta: 1, total: after });
  return true;
}

/** Use one spare fuse of a rating from the pocket (insert). */
export function useFuse(rating: number): boolean {
  const r = viaMissions(() => missions.useItem({ kind: 'fuse', rating: rating as FuseRating }, 1));
  if (r !== null) return r;
  const key = String(rating);
  const have = store.getState().session.items.fuses[key] ?? 0;
  if (have <= 0) {
    toast('warning', `No ${key} A fuse in your pocket`, 'Take one from the fuse tray on the power bench (R cycles the rating).');
    return false;
  }
  mutate((s) => {
    s.session.items.fuses[key] = have - 1;
  });
  emit('inventory.changed', { item: `fuse-${key}`, delta: -1, total: have - 1 });
  return true;
}

/** Small parts (bins/drawers): `pi-spare`, `sd-card`, `usb-lead`, `ethernet-cable` … */
export function takePart(id: string, label: string): boolean {
  let ref: InventoryItemRef = { kind: 'part', id };
  if (id === 'ethernet-cable') ref = { kind: 'ethernet-cable' };
  if (id === 'usb-lead') ref = { kind: 'usb-lead' };
  const r = viaMissions(() => missions.takeItem(ref, 1));
  if (r === null) {
    let total = 0;
    mutate((s) => {
      const it = s.session.items;
      if (id === 'ethernet-cable') {
        it.ethernetCables += 1;
        total = it.ethernetCables;
        addTool(s.session, 'ethernet-cable', false);
      } else if (id === 'usb-lead') {
        it.usbLeads += 1;
        total = it.usbLeads;
        addTool(s.session, 'usb-cable', false);
      } else {
        it.parts[id] = (it.parts[id] ?? 0) + 1;
        total = it.parts[id]!;
      }
    });
    emit('inventory.changed', { item: id, delta: 1, total });
  } else if (!r) return false;
  toast('success', `Took: ${label}`);
  return true;
}

/** Pick up a large item in both hands. */
export function carry(id: CarriedItemId, label: string, ref: string | null, from: string): boolean {
  const item: CarriedItem = { id, label, ref };
  const cur = store.getState().session.items.carried;
  if (cur) {
    toast('warning', 'Hands full', `Put down the ${cur.label} first (Q).`);
    return false;
  }
  const r = viaMissions(() => missions.takeItem({ kind: 'carried', item }, 1));
  if (r === null) {
    mutate((s) => {
      s.session.items.carried = item;
      if (id === 'ruler') addTool(s.session, 'ruler', true);
    });
    emit('item.pickedUp', { itemId: id, ref, from });
  } else if (!r) return false;
  return true;
}

/** Put the carried item down onto a world target (returns the item that was carried). */
export function placeCarried(targetId: string, installed = false): CarriedItem | null {
  const cur = store.getState().session.items.carried;
  if (!cur) return null;
  const r = viaMissions(() => missions.setDownCarried(targetId));
  if (r === null) {
    mutate((s) => {
      s.session.items.carried = null;
      if (cur.id === 'ruler') {
        s.session.inventory = s.session.inventory.filter((t) => t !== 'ruler');
        if (s.session.activeTool === 'ruler') s.session.activeTool = 'hand';
      }
    });
    emit('item.placed', { itemId: cur.id, ref: cur.ref, targetId, installed });
  } else if (!r) return null;
  return cur;
}

/** Hand tool pickup (multimeter → hotbar 2). */
export function takeTool(t: ToolId, label: string): void {
  try {
    missions.selectTool(t);
  } catch {
    /* runtime stub */
  }
  mutate((s) => addTool(s.session, t, true));
  emit('tool.selected', { tool: t, slot: null });
  toast('success', `${label} picked up`);
}

export function carriedId(): string | null {
  return store.getState().session.items.carried?.id ?? null;
}
