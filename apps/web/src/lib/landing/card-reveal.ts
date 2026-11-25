/**
 * Per-card targets for the employer page's company cards, which "fade down
 * out of the ribbon" as the row scrolls into view — the reverse of the hero
 * badges in badge-stack.ts. Cards start collapsed up near the ribbon (large
 * negative dy) and travel down into their grid position.
 */
export type RevealOffset = { dx: number; dy: number; rot: number; phase: number };

const REVEAL_OFFSETS: RevealOffset[] = [
  { dx: -25, dy: -320, rot: -4, phase: 0 },
  { dx: 20, dy: -360, rot: 3, phase: 0.05 },
  { dx: -15, dy: -300, rot: -3, phase: 0.1 },
  { dx: 18, dy: -340, rot: 3, phase: 0.03 },
  { dx: -20, dy: -370, rot: -3, phase: 0.08 },
  { dx: 22, dy: -310, rot: 3, phase: 0.13 },
];

/** Eases out, so it settles gently rather than snapping into place. */
function easeOut(t: number) {
  return 1 - (1 - t) * (1 - t);
}

export function getRevealOffset(index: number): RevealOffset {
  return REVEAL_OFFSETS[index % REVEAL_OFFSETS.length]!;
}

export function getRevealStyle(progress: number, offset: RevealOffset): React.CSSProperties {
  const local = Math.min(1, Math.max(0, (progress - offset.phase) / (1 - offset.phase)));
  const eased = easeOut(local);
  const inv = 1 - eased;

  return {
    // Opacity follows the same curve as the movement, so a card stays
    // translucent until it arrives instead of sitting opaque over the heading.
    transform: `translate3d(${offset.dx * inv}px, ${offset.dy * inv}px, 0) scale(${1 - 0.35 * inv}) rotate(${offset.rot * inv}deg)`,
    opacity: eased,
  };
}

/**
 * The reverse, for the Find companies page's row: the cards start in place and
 * tuck away behind the directory card as the page scrolls (`progress` 0 → 1).
 */
export function getTuckStyle(progress: number, offset: RevealOffset): React.CSSProperties {
  const local = Math.min(1, Math.max(0, (progress - offset.phase) / (1 - offset.phase)));
  const eased = easeOut(local);

  return {
    transform: `translate3d(${offset.dx * eased}px, ${-offset.dy * 0.7 * eased}px, 0) scale(${1 - 0.3 * eased}) rotate(${offset.rot * eased}deg)`,
    // Mostly hidden by the directory card sliding over them; the late fade
    // covers narrow screens, where the top cards have further to travel.
    opacity: 1 - eased * eased,
  };
}
