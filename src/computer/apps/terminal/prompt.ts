/**
 * Prompt parsing and colouring (Apps §5.1 "Prompt colouring", §5.3 prompts).
 *   bash / Raspberry Pi OS: `user@host:path$ `  → user@host bold bright green, path bold bright blue.
 *   cmd.exe over OpenSSH:   `automation@MINIX-01 C:\Users\automation>` → default colour.
 *   PowerShell:             `PS C:\Users\automation> ` → default colour.
 */

export type PromptSegmentKind = 'userhost' | 'path' | 'plain';

export interface PromptSegment {
  text: string;
  kind: PromptSegmentKind;
}

export interface ParsedPrompt {
  shell: 'bash' | 'cmd' | 'powershell' | 'unknown';
  user: string | null;
  host: string | null;
  /** Path as shown (`~`, `~/IdeaProjects/uia-remote`, `C:\Users\automation`). */
  path: string | null;
  segments: PromptSegment[];
}

const BASH_RE = /^([A-Za-z0-9_.-]+)@([A-Za-z0-9_.-]+):(.*?)(\s?[$#]\s?)$/;
const CMD_RE = /^([A-Za-z0-9_.-]+)@([A-Za-z0-9_.-]+) ([A-Za-z]:\\.*?)>\s?$/;
const PS_RE = /^PS ([A-Za-z]:\\.*?)>\s?$/;

export function parsePrompt(prompt: string): ParsedPrompt {
  const b = BASH_RE.exec(prompt);
  if (b) {
    return {
      shell: 'bash',
      user: b[1],
      host: b[2],
      path: b[3],
      segments: [
        { text: `${b[1]}@${b[2]}`, kind: 'userhost' },
        { text: ':', kind: 'plain' },
        { text: b[3], kind: 'path' },
        { text: b[4], kind: 'plain' },
      ],
    };
  }
  const c = CMD_RE.exec(prompt);
  if (c) return { shell: 'cmd', user: c[1], host: c[2], path: c[3], segments: [{ text: prompt, kind: 'plain' }] };
  const p = PS_RE.exec(prompt);
  if (p) return { shell: 'powershell', user: null, host: null, path: p[1], segments: [{ text: prompt, kind: 'plain' }] };
  return { shell: 'unknown', user: null, host: null, path: null, segments: [{ text: prompt, kind: 'plain' }] };
}

/** Tab title from a prompt (`engineer@ws-17: ~`, `pi@wall-e: ~`, `automation@MINIX-01: C:\Users\automation`). */
export function titleFromPrompt(prompt: string, previous?: string): string {
  const p = parsePrompt(prompt);
  if (p.user && p.host) return `${p.user}@${p.host}: ${p.path ?? ''}`.trimEnd();
  if (p.shell === 'powershell' && previous) {
    const at = previous.indexOf(':');
    return at > 0 ? `${previous.slice(0, at)}: ${p.path}` : previous;
  }
  return previous ?? (prompt.trim() || 'Terminal');
}

/** Home directory of a prompt user (`pi` → `/home/pi`, `engineer` → `~`). */
export function homeFor(user: string | null): string {
  if (!user || user === 'engineer') return '~';
  if (user === 'root') return '/root';
  return `/home/${user}`;
}

/**
 * Resolve a path typed in a shell against the prompt's cwd (`~` stays `~` for the workstation so it
 * matches the sim's `~/IdeaProjects/...` keys).
 */
export function resolveShellPath(input: string, prompt: string): string {
  const p = parsePrompt(prompt);
  const user = p.user;
  const home = homeFor(user);
  const cwdRaw = p.path ?? '~';
  const expandHome = (s: string) => (s === '~' ? home : s.startsWith('~/') ? `${home}${s.slice(1)}` : s);
  const cwd = expandHome(cwdRaw);
  let path = expandHome(input.trim());
  if (!path.startsWith('/') && !path.startsWith('~')) path = `${cwd.replace(/\/$/, '')}/${path}`;
  const parts: string[] = [];
  const lead = path.startsWith('~') ? '~' : '';
  for (const seg of path.replace(/^~/, '').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return lead ? (parts.length ? `~/${parts.join('/')}` : '~') : `/${parts.join('/')}`;
}
