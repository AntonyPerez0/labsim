/**
 * Build-time geometric detail for the procedural lab (World §7.4 budgets). The potato preset builds
 * curved primitives (cylinders, spheres, tori, tubes, rounded boxes, lathes, curved outlines) with
 * about half the segments: the merged static batches shrink by roughly a third, which cuts vertex
 * work, GPU memory and the buffer uploads at load time on weak phones. Purely visual — colliders and
 * hit boxes never depend on tessellation. Set once per build by `buildWorld` from the preset.
 */
let k = 1;

export function setWorldDetail(reduced: boolean): void {
  k = reduced ? 0.5 : 1;
}

/** True while building for the potato preset (skip purely decorative clutter). */
export function reducedWorldDetail(): boolean {
  return k < 1;
}

/** Segment count `n` scaled by the build detail, never below `min`. */
export function seg(n: number, min = 3): number {
  return k === 1 ? n : Math.max(min, Math.round(n * k));
}
