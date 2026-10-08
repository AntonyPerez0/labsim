/**
 * LabChat pure helpers (Apps §11): channel ids ↔ routes, author display, mrkdwn subset tokenizer, emoji.
 */
import { TEAM, TEAM_MEMBERS, personName } from '@/content/team';

export const PLAYER_KEYS = new Set(['player', 'engineer', 'you']);

export function isPlayerAuthor(author: string): boolean {
  return PLAYER_KEYS.has(author);
}

/** "#lab-automation" | "dm:riley" from a LabChat route. */
export function channelFromRoute(route: string): string | null {
  const m = /^\/(channel|dm)\/([^/?#]+)/.exec(route);
  if (!m) return null;
  const v = decodeURIComponent(m[2]!);
  return m[1] === 'dm' ? `dm:${v}` : `#${v}`;
}

export function routeForChannel(channel: string): string {
  if (channel.startsWith('dm:')) return `/dm/${encodeURIComponent(channel.slice(3))}`;
  return `/channel/${encodeURIComponent(channel.replace(/^#/, ''))}`;
}

export const BOTS: Record<string, { name: string; color: string; glyph: string }> = {
  'orca-health-check': { name: 'Orca', color: '#353d47', glyph: 'O' },
  orca: { name: 'Orca', color: '#353d47', glyph: 'O' },
  'jenkins-bot': { name: 'Jenkins', color: '#335061', glyph: 'J' },
  jenkins: { name: 'Jenkins', color: '#335061', glyph: 'J' },
  system: { name: 'LabChat', color: '#4a154b', glyph: 'L' },
};

export function teamKey(author: string): string {
  return author.startsWith('npc.') ? author.slice(4) : author;
}

export function authorName(author: string, playerName: string): string {
  if (isPlayerAuthor(author)) return playerName;
  const bot = BOTS[author];
  if (bot) return bot.name;
  const key = teamKey(author);
  if (TEAM[key]) return TEAM[key]!.name;
  try {
    return personName(author);
  } catch {
    return author;
  }
}

export function authorColor(author: string): string {
  const bot = BOTS[author];
  if (bot) return bot.color;
  const m = TEAM[teamKey(author)];
  if (m?.color) return m.color;
  let h = 0;
  for (const c of author) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 45% 38%)`;
}

export function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return '?';
  return (p[0]![0]! + (p.length > 1 ? p[p.length - 1]![0]! : '')).toUpperCase();
}

export function isBot(author: string): boolean {
  return !!BOTS[author];
}

/** DM people listed in the sidebar (team NPCs, Apps §11.2). */
export function dmPeople(): { key: string; name: string; color: string }[] {
  return TEAM_MEMBERS.map((m) => ({ key: m.key, name: m.name, color: m.color }));
}

export function channelTitle(channel: string, author?: string): string {
  if (channel.startsWith('dm:')) {
    const key = channel.slice(3);
    return TEAM[key]?.name ?? (author ? authorName(author, 'You') : key);
  }
  return channel;
}

export const CHANNEL_TOPICS: Record<string, string> = {
  '#lab-automation': 'Lab ops, tickets, coworkers',
  '#orca-alerts': 'Health-check failures and recoveries (Orca)',
  '#jenkins': 'Red builds',
};

export const DEFAULT_CHANNELS = ['#lab-automation', '#orca-alerts', '#jenkins'];

/* ─────────────────────────────── mrkdwn subset ─────────────────────────────── */

export const EMOJI: Record<string, string> = {
  red_circle: '🔴',
  large_green_circle: '🟢',
  green_circle: '🟢',
  white_check_mark: '✅',
  warning: '⚠️',
  wave: '👋',
  x: '❌',
  eyes: '👀',
  thumbsup: '👍',
  '+1': '👍',
  tada: '🎉',
  fire: '🔥',
  rotating_light: '🚨',
  hourglass: '⏳',
  wrench: '🔧',
  robot_face: '🤖',
  pray: '🙏',
  question: '❓',
  coffee: '☕',
  bulb: '💡',
};

export function emojify(s: string): string {
  return s.replace(/:([a-z0-9_+-]+):/g, (m, k: string) => EMOJI[k] ?? m);
}

/** Plain-text rendering (toasts, previews). */
export function plainText(s: string): string {
  return emojify(s)
    .replace(/```/g, '')
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, '$2')
    .replace(/<(https?:\/\/[^>]+)>/g, '$1')
    .replace(/(^|\W)[*_](\S[^*_\n]*\S|\S)[*_](?=\W|$)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1');
}

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'bold'; v: Inline[] }
  | { t: 'italic'; v: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; url: string; label: string }
  | { t: 'mention'; v: string };

export type Block = { t: 'para'; v: Inline[] } | { t: 'pre'; v: string };

/** Split a message into paragraphs and fenced code blocks. */
export function parseBlocks(text: string): Block[] {
  const out: Block[] = [];
  const parts = text.split('```');
  parts.forEach((p, i) => {
    if (i % 2 === 1) out.push({ t: 'pre', v: p.replace(/^\n/, '').replace(/\n$/, '') });
    else if (p.trim()) out.push({ t: 'para', v: parseInline(p.replace(/^\n+|\n+$/g, '')) });
  });
  return out;
}

const INLINE_SRC = /`([^`\n]+)`|<(https?:\/\/[^|>\s]+)(?:\|([^>]+))?>|(https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"])|(@[a-z][a-z0-9._-]*)|(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)|(^|[\s(])_([^_\n]+)_(?=[\s).,!?:;]|$)/gi;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  const text = emojify(s);
  const INLINE_RE = new RegExp(INLINE_SRC.source, INLINE_SRC.flags);
  let m: RegExpExecArray | null;
  while ((m = INLINE_RE.exec(text))) {
    let start = m.index;
    const lead = m[6] ?? m[8] ?? '';
    start += lead.length;
    if (start > last) out.push({ t: 'text', v: text.slice(last, start) });
    else if (lead) out.push({ t: 'text', v: lead });
    if (m[1] != null) out.push({ t: 'code', v: m[1] });
    else if (m[2] != null) out.push({ t: 'link', url: m[2], label: m[3] ?? m[2] });
    else if (m[4] != null) out.push({ t: 'link', url: m[4], label: m[4] });
    else if (m[5] != null) out.push({ t: 'mention', v: m[5] });
    else if (m[7] != null) out.push({ t: 'bold', v: parseInline(m[7]) });
    else if (m[9] != null) out.push({ t: 'italic', v: parseInline(m[9]) });
    last = INLINE_RE.lastIndex;
  }
  if (last < text.length) out.push({ t: 'text', v: text.slice(last) });
  return out;
}

/** Does the message mention the player (`@engineer` or their name)? */
export function mentionsPlayer(text: string, playerName: string): boolean {
  const t = text.toLowerCase();
  if (t.includes('@engineer') || t.includes('@you')) return true;
  const first = playerName.trim().split(/\s+/)[0]?.toLowerCase();
  return !!first && first !== 'new' && (t.includes(`@${first}`) || new RegExp(`\\b${first.replace(/[^a-z0-9]/g, '')}\\b`).test(t));
}
