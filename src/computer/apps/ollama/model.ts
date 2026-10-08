/** Ollama WebUI pure helpers (Apps §9): service availability, sidebar grouping, suggestion prompts. */
import type { LabState } from '@/sim';
import type { Chat } from './chats';

/** Cur M17 s5 prefilled prompt — exact. */
export const RECEIPT_PROMPT =
  'Check this receipt image. Is the layout complete (merchant header, items, subtotal, tax, tip, total) and is the tip math correct? Answer PASS or FAIL with one reason.';
export const WEBCAM_PROMPT = 'Describe this webcam frame. Which screen is the device showing?';

/**
 * Is the `ollama` service on `ollama-vm` answering on :11434? Mirrors the sim's rule (Sim §3.21.2): the VM's OS is
 * RUNNING and the service runs (and has finished starting). Falls back to `lab.ollama.up` before hosts are seeded.
 */
export function ollamaServiceUp(lab: LabState): boolean {
  const h = lab.hosts?.['ollama-vm'];
  const o = lab.ollama;
  if (!h) return o?.up !== false;
  const svc = h.services?.['ollama'];
  if (h.os !== 'RUNNING') return false;
  if (!svc) return o?.up !== false;
  return svc.running && (svc.startedPhysMs === null || svc.startedPhysMs <= lab.time.physMs);
}

const DAY = 86_400_000;

/** Sidebar groups: `Today`, `Yesterday`, `Previous 7 days`, `Older` (newest first). */
export function groupChats(chats: Chat[], nowMs: number): { label: string; chats: Chat[] }[] {
  const today = Math.floor(nowMs / DAY);
  const out: { label: string; chats: Chat[] }[] = [];
  const add = (label: string, c: Chat) => {
    let g = out.find((x) => x.label === label);
    if (!g) out.push((g = { label, chats: [] }));
    g.chats.push(c);
  };
  for (const c of [...chats].sort((a, b) => b.createdMs - a.createdMs)) {
    const d = today - Math.floor(c.createdMs / DAY);
    add(d <= 0 ? 'Today' : d === 1 ? 'Yesterday' : d <= 7 ? 'Previous 7 days' : 'Older', c);
  }
  return out;
}
