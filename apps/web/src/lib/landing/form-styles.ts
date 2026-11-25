const GRADIENT_FRAME_SHADOW =
  "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(20,27,46,0.2)]";

/** Shared card style for the product mockups on the employer landing page. */
export const MOCKUP_CARD_CLASS =
  "rounded-[14px] border border-black/[0.06] bg-white p-[14px] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(20,27,46,0.2)]";

/** The redesign's signature card: a 1px gradient border around a white card.
    Teal for employer, gold for jobseeker. */
export function gradientFrameClass(accent: "teal" | "gold" = "gold") {
  return accent === "gold"
    ? `rounded-[20px] bg-gradient-to-br from-brand-gold via-white to-brand-gold p-px ${GRADIENT_FRAME_SHADOW}`
    : `rounded-[20px] bg-gradient-to-br from-brand-teal via-white to-brand-teal p-px ${GRADIENT_FRAME_SHADOW}`;
}
