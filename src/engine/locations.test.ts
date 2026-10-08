import { describe, expect, it } from 'vitest';
import { LocationTracker, resolveLocation, type LocationLike } from './locations';

const rack: LocationLike = { id: 'loc.rack-a', center: [0, 0, 0], radius: 1.5 };
const desk: LocationLike = { id: 'loc.workstation', center: [3, 0, 0], radius: 1.5 };

describe('resolveLocation', () => {
  it('is null outside every anchor', () => {
    expect(resolveLocation(10, 10, [rack, desk], null)).toBeNull();
  });

  it('ignores the vertical axis', () => {
    const tall: LocationLike = { id: 'x', center: [0, 5, 0], radius: 1 };
    expect(resolveLocation(0.5, 0, [tall], null)).toBe('x');
  });

  it('picks the relatively closest anchor where they overlap', () => {
    expect(resolveLocation(1.2, 0, [rack, desk], null)).toBe('loc.rack-a');
    expect(resolveLocation(1.8, 0, [rack, desk], null)).toBe('loc.workstation');
  });

  it('keeps the current anchor inside the hysteresis band', () => {
    expect(resolveLocation(1.6, 0, [rack], 'loc.rack-a', 0.25)).toBe('loc.rack-a');
    expect(resolveLocation(1.8, 0, [rack], 'loc.rack-a', 0.25)).toBeNull();
  });

  it('switches when clearly deeper inside another anchor', () => {
    // current rack (barely inside its band), deep inside desk
    expect(resolveLocation(2.9, 0, [rack, { ...desk }], 'loc.rack-a', 2)).toBe('loc.workstation');
  });

  it('drops a removed current anchor', () => {
    expect(resolveLocation(0, 0, [desk], 'loc.rack-a')).toBeNull();
  });
});

describe('LocationTracker', () => {
  it('reports enter once, then exit, then re-enter', () => {
    const t = new LocationTracker();
    t.add(rack);
    let u = t.update(5, 0);
    expect(u).toEqual({ current: null, changed: false, entered: null });
    u = t.update(1, 0);
    expect(u).toEqual({ current: 'loc.rack-a', changed: true, entered: 'loc.rack-a' });
    u = t.update(0.5, 0);
    expect(u.changed).toBe(false);
    expect(u.entered).toBeNull();
    u = t.update(5, 0);
    expect(u).toEqual({ current: null, changed: true, entered: null });
    u = t.update(0, 0);
    expect(u.entered).toBe('loc.rack-a');
  });

  it('moves directly between adjacent anchors', () => {
    const t = new LocationTracker();
    t.add(rack);
    t.add(desk);
    t.update(0, 0);
    const u = t.update(3, 0);
    expect(u.entered).toBe('loc.workstation');
  });

  it('removal handle unregisters the anchor', () => {
    const t = new LocationTracker();
    const off = t.add(rack);
    off();
    expect(t.update(0, 0).current).toBeNull();
    expect(t.all.length).toBe(0);
  });

  it('reset forces a re-enter on the next update', () => {
    const t = new LocationTracker();
    t.add(rack);
    t.update(0, 0);
    t.reset();
    expect(t.update(0, 0).entered).toBe('loc.rack-a');
  });
});
