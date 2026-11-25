/**
 * Per-badge targets for the hero's floating badges as they "stack together
 * and slide behind the ribbon" on scroll. Index order matches each badge
 * list's order — sized to the longest list (the employer hero's 8); extend
 * this first if a badge list grows. dx/dy pull the badge toward a point below
 * the headline, rot adds a stacked-deck tilt, phase staggers the start.
 */
export type StackOffset = { dx: number; dy: number; rot: number; phase: number };

const STACK_OFFSETS: StackOffset[] = [
  { dx: 160, dy: 420, rot: -10, phase: 0 },
  { dx: -160, dy: 400, rot: 8, phase: 0.08 },
  { dx: 170, dy: 300, rot: -6, phase: 0.03 },
  { dx: -160, dy: 290, rot: 7, phase: 0.11 },
  { dx: 110, dy: 200, rot: -4, phase: 0.16 },
  { dx: -100, dy: 190, rot: 5, phase: 0.06 },
  { dx: 130, dy: 260, rot: -5, phase: 0.09 },
  { dx: -100, dy: 190, rot: 5, phase: 0.06 },
];

/** Eases in, so the back half of the scroll range does most of the motion. */
function easeIn(t: number) {
  return t * t;
}

/** `extraDy` adds downward travel for a page where the ribbon sits lower
    (the jobseeker page, which has "How it works" before the ribbon). */
export function getStackOffset(index: number, extraDy = 0): StackOffset {
  if (import.meta.env.DEV && index >= STACK_OFFSETS.length) {
    console.warn(
      `[badgeStack] badge index ${index} has no matching offset (only ${STACK_OFFSETS.length} defined). Add more entries to STACK_OFFSETS.`,
    );
  }
  const base = STACK_OFFSETS[index % STACK_OFFSETS.length]!;
  return extraDy ? { ...base, dy: base.dy + extraDy } : base;
}

export function getStackStyle(progress: number, offset: StackOffset): React.CSSProperties {
  const local = Math.min(1, Math.max(0, (progress - offset.phase) / (1 - offset.phase)));
  const eased = easeIn(local);

  // Fully transparent once the stack closes — the ribbon's wave doesn't cover
  // its whole box, so opacity is what sells "gone behind it".
  return {
    transform: `translate3d(${offset.dx * eased}px, ${offset.dy * eased}px, 0) scale(${1 - 0.42 * eased}) rotate(${offset.rot * eased}deg)`,
    opacity: 1 - Math.max(0, (eased - 0.55) / 0.45),
  };
}
