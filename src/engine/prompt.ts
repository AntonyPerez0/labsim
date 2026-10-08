/**
 * Interaction prompt helpers (pure): verb enablement by active tool, display labels and
 * allocation-free equality so the engine writes `ui.prompt` only when it actually changes.
 */
import type { ToolId } from '@/core/state';
import type { InteractVerb } from './types';

export interface PromptVerb {
  key: string;
  label: string;
  disabled?: boolean;
}

export interface Prompt {
  label: string;
  verbs: PromptVerb[];
}

/** Human-readable tool names (used in "needs …" hints). */
export const TOOL_NAMES: Readonly<Record<ToolId, string>> = {
  hand: 'Bare hands',
  screwdriver: 'Screwdriver',
  multimeter: 'Multimeter',
  'spare-fuse-5v': 'Spare fuse 5V',
  'spare-fuse-12v': 'Spare fuse 12V',
  'ethernet-cable': 'Ethernet cable',
  'usb-cable': 'USB cable',
  'test-card-visa': 'Test card (Visa)',
  'test-card-interac': 'Test card (Interac)',
  flashlight: 'Flashlight',
  ruler: 'Steel ruler',
};

const NEEDS_PREFIX = ' (needs ';

export function toolName(tool: string): string {
  return (TOOL_NAMES as Record<string, string>)[tool] ?? tool;
}

type VerbLike = Pick<InteractVerb, 'key' | 'label' | 'disabled' | 'requiresTool'>;

/** A verb is usable when not explicitly disabled and its required tool (if any) is active. */
export function isVerbEnabled(v: VerbLike, activeTool: string): boolean {
  if (v.disabled) return false;
  if (v.requiresTool && v.requiresTool !== activeTool) return false;
  return true;
}

/** True when the verb is blocked only because the wrong tool is held. */
export function needsTool(v: VerbLike, activeTool: string): boolean {
  return !!v.requiresTool && v.requiresTool !== activeTool;
}

/** Label shown in the prompt, e.g. "Replace fuse (needs Spare fuse 5V)". */
export function verbDisplayLabel(v: VerbLike, activeTool: string): string {
  return needsTool(v, activeTool) ? `${v.label}${NEEDS_PREFIX}${toolName(v.requiresTool!)})` : v.label;
}

export function buildPrompt(label: string, verbs: readonly VerbLike[], activeTool: string): Prompt {
  return {
    label,
    verbs: verbs.map((v) => {
      const out: PromptVerb = { key: v.key, label: verbDisplayLabel(v, activeTool) };
      if (!isVerbEnabled(v, activeTool)) out.disabled = true;
      return out;
    }),
  };
}

/** Structural equality of two prompts (`disabled: false` ≡ absent). */
export function promptEquals(a: Prompt | null | undefined, b: Prompt | null | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.label !== b.label || a.verbs.length !== b.verbs.length) return false;
  for (let i = 0; i < a.verbs.length; i++) {
    const x = a.verbs[i]!;
    const y = b.verbs[i]!;
    if (x.key !== y.key || x.label !== y.label || !!x.disabled !== !!y.disabled) return false;
  }
  return true;
}

/** `label === verbDisplayLabel(v, tool)` for a tool-gated verb, without building the string. */
function isNeedsLabel(label: string, verbLabel: string, tool: string): boolean {
  const name = toolName(tool);
  return (
    label.length === verbLabel.length + NEEDS_PREFIX.length + name.length + 1 &&
    label.startsWith(verbLabel) &&
    label.startsWith(NEEDS_PREFIX, verbLabel.length) &&
    label.startsWith(name, verbLabel.length + NEEDS_PREFIX.length) &&
    label.endsWith(')')
  );
}

/**
 * Would `buildPrompt(label, verbs, activeTool)` equal `current`? Allocation-free, so it is cheap
 * to call every frame.
 */
export function promptMatches(current: Prompt | null, label: string, verbs: readonly VerbLike[], activeTool: string): boolean {
  if (!current) return false;
  if (current.label !== label || current.verbs.length !== verbs.length) return false;
  for (let i = 0; i < verbs.length; i++) {
    const v = verbs[i]!;
    const c = current.verbs[i]!;
    if (c.key !== v.key) return false;
    if (!!c.disabled !== !isVerbEnabled(v, activeTool)) return false;
    if (needsTool(v, activeTool)) {
      if (!isNeedsLabel(c.label, v.label, v.requiresTool!)) return false;
    } else if (c.label !== v.label) return false;
  }
  return true;
}

/** Map a keyboard `KeyboardEvent.code` to an interaction key. */
export function interactKeyFromCode(code: string): InteractVerb['key'] | null {
  switch (code) {
    case 'KeyE':
      return 'E';
    case 'KeyF':
      return 'F';
    case 'KeyR':
      return 'R';
    case 'KeyG':
      return 'G';
    case 'KeyQ':
      return 'Q';
    default:
      return null;
  }
}
