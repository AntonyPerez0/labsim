/**
 * Ollama WebUI chat history (Apps §9.2): session-local (the PoC front-end keeps chats in the browser).
 * The model's answers live in `lab.ollama.requests`; a chat message only references the request id.
 */
import { useSyncExternalStore } from 'react';

export interface Attachment {
  path: string;
  ref: string;
}

export type ChatMsg =
  | { role: 'user'; id: string; text: string; image: Attachment | null; atMs: number }
  | { role: 'assistant'; id: string; requestId: string | null; error: string | null; model: string; flag: Flag | null; rating: 'up' | 'down' | null; shown: boolean; atMs: number; text?: string };

export type Flag = 'layout-incomplete' | 'tip-math-error' | 'total-error' | 'looks-correct';

export const FLAGS: { id: Flag; label: string }[] = [
  { id: 'layout-incomplete', label: 'Layout incomplete' },
  { id: 'tip-math-error', label: 'Tip math error' },
  { id: 'total-error', label: 'Total error' },
  { id: 'looks-correct', label: 'Looks correct' },
];

export interface Chat {
  id: string;
  title: string;
  createdMs: number;
  model: string;
  messages: ChatMsg[];
}

let chats: Chat[] = [];
let version = 0;
let seq = 0;
const listeners = new Set<() => void>();

function changed(): void {
  version++;
  chats = [...chats];
  for (const fn of [...listeners]) fn();
}

export function useChats(): Chat[] {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
  );
  return chats;
}

export function getChat(id: string): Chat | null {
  return chats.find((c) => c.id === id) ?? null;
}

export function newId(prefix: string): string {
  seq++;
  return `${prefix}${(0x5a17 + seq * 7919).toString(16)}-${seq}`;
}

export function createChat(model: string, firstPrompt: string, atMs: number): Chat {
  const c: Chat = { id: newId(''), title: firstPrompt.trim().replace(/\s+/g, ' ').slice(0, 40) || 'New Chat', createdMs: atMs, model, messages: [] };
  chats = [c, ...chats];
  changed();
  return c;
}

export function pushMessage(chatId: string, m: ChatMsg): void {
  const c = getChat(chatId);
  if (!c) return;
  c.messages = [...c.messages, m];
  changed();
}

export function patchMessage(chatId: string, msgId: string, patch: Partial<ChatMsg>): void {
  const c = getChat(chatId);
  if (!c) return;
  c.messages = c.messages.map((m) => (m.id === msgId ? ({ ...m, ...patch } as ChatMsg) : m));
  changed();
}

export function deleteChat(id: string): void {
  chats = chats.filter((c) => c.id !== id);
  changed();
}

/** Test helper. */
export function _resetChats(): void {
  chats = [];
  changed();
}
