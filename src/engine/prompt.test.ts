import { describe, expect, it } from 'vitest';
import {
  buildPrompt,
  interactKeyFromCode,
  isVerbEnabled,
  promptEquals,
  promptMatches,
  verbDisplayLabel,
  type Prompt,
} from './prompt';
import type { InteractVerb } from './types';

const noop = () => {};
const verbs: InteractVerb[] = [
  { key: 'E', label: 'Inspect', run: noop },
  { key: 'F', label: 'Replace fuse', requiresTool: 'spare-fuse-5v', run: noop },
  { key: 'R', label: 'Reset', disabled: true, run: noop },
];

describe('verb enablement', () => {
  it('disables tool-gated verbs unless the tool is active', () => {
    expect(isVerbEnabled(verbs[1]!, 'hand')).toBe(false);
    expect(isVerbEnabled(verbs[1]!, 'spare-fuse-5v')).toBe(true);
    expect(isVerbEnabled(verbs[2]!, 'spare-fuse-5v')).toBe(false);
  });

  it('names the missing tool in the label', () => {
    expect(verbDisplayLabel(verbs[1]!, 'hand')).toBe('Replace fuse (needs Spare fuse 5V)');
    expect(verbDisplayLabel(verbs[1]!, 'spare-fuse-5v')).toBe('Replace fuse');
  });
});

describe('buildPrompt', () => {
  it('builds labels and disabled flags', () => {
    const p = buildPrompt('Fuse holder — 5V rail', verbs, 'hand');
    expect(p).toEqual({
      label: 'Fuse holder — 5V rail',
      verbs: [
        { key: 'E', label: 'Inspect' },
        { key: 'F', label: 'Replace fuse (needs Spare fuse 5V)', disabled: true },
        { key: 'R', label: 'Reset', disabled: true },
      ],
    });
  });
});

describe('promptEquals', () => {
  const a: Prompt = { label: 'A', verbs: [{ key: 'E', label: 'Use' }] };

  it('handles nulls and identity', () => {
    expect(promptEquals(null, null)).toBe(true);
    expect(promptEquals(a, a)).toBe(true);
    expect(promptEquals(a, null)).toBe(false);
    expect(promptEquals(null, a)).toBe(false);
  });

  it('compares structurally and treats disabled:false as absent', () => {
    expect(promptEquals(a, { label: 'A', verbs: [{ key: 'E', label: 'Use', disabled: false }] })).toBe(true);
    expect(promptEquals(a, { label: 'B', verbs: [{ key: 'E', label: 'Use' }] })).toBe(false);
    expect(promptEquals(a, { label: 'A', verbs: [{ key: 'F', label: 'Use' }] })).toBe(false);
    expect(promptEquals(a, { label: 'A', verbs: [{ key: 'E', label: 'Use', disabled: true }] })).toBe(false);
    expect(promptEquals(a, { label: 'A', verbs: [] })).toBe(false);
  });
});

describe('promptMatches', () => {
  it('agrees with buildPrompt + promptEquals', () => {
    for (const tool of ['hand', 'spare-fuse-5v']) {
      const built = buildPrompt('Fuse', verbs, tool);
      expect(promptMatches(built, 'Fuse', verbs, tool)).toBe(true);
    }
  });

  it('detects tool changes, label changes and verb changes', () => {
    const built = buildPrompt('Fuse', verbs, 'hand');
    expect(promptMatches(built, 'Fuse', verbs, 'spare-fuse-5v')).toBe(false);
    expect(promptMatches(built, 'Fuse!', verbs, 'hand')).toBe(false);
    expect(promptMatches(built, 'Fuse', verbs.slice(0, 2), 'hand')).toBe(false);
    expect(promptMatches(null, 'Fuse', verbs, 'hand')).toBe(false);
  });

  it('detects a change of the required tool or the label of a tool-gated verb', () => {
    const built = buildPrompt('Fuse', verbs, 'hand');
    const v12: InteractVerb[] = [verbs[0]!, { ...verbs[1]!, requiresTool: 'spare-fuse-12v' }, verbs[2]!];
    expect(promptMatches(built, 'Fuse', v12, 'hand')).toBe(false);
    const renamed: InteractVerb[] = [verbs[0]!, { ...verbs[1]!, label: 'Swap fuse' }, verbs[2]!];
    expect(promptMatches(built, 'Fuse', renamed, 'hand')).toBe(false);
    expect(promptMatches(buildPrompt('Fuse', v12, 'hand'), 'Fuse', v12, 'hand')).toBe(true);
  });
});

describe('interactKeyFromCode', () => {
  it('maps E/F/R/G/Q codes only', () => {
    expect(interactKeyFromCode('KeyE')).toBe('E');
    expect(interactKeyFromCode('KeyQ')).toBe('Q');
    expect(interactKeyFromCode('KeyW')).toBeNull();
  });
});
