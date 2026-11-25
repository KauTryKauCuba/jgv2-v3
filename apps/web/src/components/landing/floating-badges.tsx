import { useScrollStack } from "@/hooks/use-scroll-stack";
import { getStackOffset, getStackStyle } from "@/lib/landing/badge-stack";

export type FloatingBadge = {
  id: string;
  label: string;
  src: string;
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
  duration: string;
  delay: string;
};

/** Photo pills that bob around the hero and stack behind the ribbon on scroll. */
export function FloatingBadges({ badges }: { badges: FloatingBadge[] }) {
  const { ref, progress } = useScrollStack();

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] mx-auto hidden max-w-[1300px] md:block"
    >
      {badges.map((badge, i) => (
        <div
          key={badge.id}
          className="absolute will-change-transform"
          style={{
            top: badge.top,
            left: badge.left,
            right: badge.right,
            bottom: badge.bottom,
            ...getStackStyle(progress, getStackOffset(i)),
          }}
        >
          <div
            className="float-bob flex items-center gap-[8px] rounded-full border border-[#EAEDF2] bg-white p-[5px] shadow-[0_8px_20px_rgba(20,27,46,0.1)] lg:py-[6px] lg:pr-[16px]"
            style={{ animationDuration: badge.duration, animationDelay: badge.delay }}
          >
            <span className="relative block h-[34px] w-[34px] shrink-0 overflow-hidden rounded-full lg:h-[38px] lg:w-[38px]">
              <img src={badge.src} alt="" className="absolute inset-0 h-full w-full object-cover" />
            </span>
            <span className="hidden whitespace-nowrap text-xs text-[#141B2E] lg:inline">
              {badge.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
