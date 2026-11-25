import { useEffect, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { CURATED_FILL_TARGET, curatedFill } from "@/data/landing/curated-companies";
import { useScrollReveal } from "@/hooks/use-scroll-reveal";
import { getRevealOffset, getRevealStyle, getTuckStyle } from "@/lib/landing/card-reveal";
import { gradientFrameClass } from "@/lib/landing/form-styles";

// How far the page scrolls (px) for the "page" variant's cards to tuck away
// behind the directory card.
const TUCK_DISTANCE = 450;

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  window.addEventListener("resize", onChange);
  return () => {
    window.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}
const noSubscribe = () => () => {};

export type HighlightCompany = {
  companyName: string;
  industry: string | null;
  location: string | null;
  logoUrl: string | null;
  activeCount: number;
  totalCount: number;
};

type Company = {
  name: string;
  industry: string;
  /** Illustrative for curated companies; real for companies from the API. */
  openRoles: number;
} & ({ logoKind: "image"; src: string } | { logoKind: "icon" });

/**
 * One size/offset per card, matched by index. A fixed, deliberately uneven
 * set so the row reads as a skyline rather than a uniform grid. Negative
 * offsets sit a card higher (further tucked under the ribbon at rest).
 */
type SizeVariant = { logoBox: number; logoImg: number; padding: string; offset: number };
const SIZE_VARIANTS: SizeVariant[] = [
  { logoBox: 125, logoImg: 120, padding: "lg:p-[22px]", offset: 0 },
  { logoBox: 88, logoImg: 84, padding: "lg:p-[16px]", offset: 30 },
  { logoBox: 150, logoImg: 145, padding: "lg:p-[26px]", offset: -20 },
  { logoBox: 100, logoImg: 96, padding: "lg:p-[18px]", offset: 16 },
  { logoBox: 132, logoImg: 127, padding: "lg:p-[24px]", offset: -8 },
  { logoBox: 92, logoImg: 88, padding: "lg:p-[16px]", offset: 24 },
];

function PlaceholderLogo({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <rect x="3" y="7" width="14" height="9" rx="1.6" />
      <path d="M7 7V5.6C7 4.72 7.72 4 8.6 4h2.8c.88 0 1.6.72 1.6 1.6V7" />
    </svg>
  );
}

/** Real employers first, then curated showcase companies fill the rest. */
function buildDisplayCompanies(realCompanies: HighlightCompany[]): Company[] {
  const real: Company[] = realCompanies.slice(0, CURATED_FILL_TARGET).map((c) => ({
    name: c.companyName,
    industry: c.industry ?? "—",
    openRoles: c.activeCount,
    ...(c.logoUrl ? { logoKind: "image" as const, src: c.logoUrl } : { logoKind: "icon" as const }),
  }));
  const curated: Company[] = curatedFill(
    real.length,
    real.map((c) => c.name),
  ).map((c) => ({ name: c.name, industry: c.industry, openRoles: c.openRoles, logoKind: "image" as const, src: c.src }));
  return [...real, ...curated];
}

/**
 * A row of company cards, in two places:
 * - `variant="landing"` (default): the employer page's "Companies building
 *   their teams on JobGiga", tucked under the ribbon and fading down into
 *   place on scroll.
 * - `variant="page"`: the top of Find companies. The cards are on screen at
 *   load, fade up one by one, then tuck away behind the directory card as the
 *   page scrolls (the page gives that card a higher z-index).
 * TODO(api): pass real companies from oRPC; curated ones fill the gaps.
 */
export function CompanyHighlights({
  realCompanies = [],
  variant = "landing",
  accent = "employer",
}: {
  realCompanies?: HighlightCompany[];
  variant?: "landing" | "page";
  /** Which side's gradient the page variant's heading uses. */
  accent?: "employer" | "jobseeker";
}) {
  const { t } = useTranslation("common");
  const onPage = variant === "page";
  const { ref, progress } = useScrollReveal();
  const displayCompanies = buildDisplayCompanies(realCompanies);

  // useScrollReveal stays at 0 under reduced motion, which here would mean
  // "collapsed and hidden" — so show the cards fully settled instead.
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(reduce.matches);
    sync();
    reduce.addEventListener("change", sync);
    return () => reduce.removeEventListener("change", sync);
  }, []);
  const revealProgress = reducedMotion ? 1 : progress;

  // Only the page variant follows the scroll position, and only in the single
  // 6-across row (lg+); in the 2/3-column grids the row is too tall to tuck.
  const scrollY = useSyncExternalStore(
    onPage ? subscribeScroll : noSubscribe,
    () => (onPage && window.innerWidth >= 1024 ? window.scrollY : 0),
    () => 0,
  );
  const tuckProgress = reducedMotion ? 0 : Math.min(1, scrollY / TUCK_DISTANCE);

  return (
    <div
      className={onPage ? "relative z-0 pb-[48px]" : "shell relative z-[1] -mt-[32px] pt-[clamp(32px,5vh,56px)] pb-[128px]"}
    >
      <div className="relative z-[1] mx-auto max-w-[720px] text-center">
        {/* Block wrapper so the pill and the inline-block heading never share a line. */}
        <div>
          <span
            className={`inline-flex items-center rounded-full px-[14px] py-[7px] text-xs ${
              onPage ? "bg-[#F1F4F8] text-[#4B5468]" : "bg-brand-teal-soft text-brand-teal-dark"
            }`}
          >
            {t(onPage ? "companies.highlights.eyebrow" : "landing.employer.companies.eyebrow")}
          </span>
        </div>
        <h2
          className="mt-[16px] font-sans font-semibold text-[#141B2E]"
          style={{
            fontSize: "clamp(34px, 4vw, 56px)",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            backgroundImage: `var(--brand-gradient-${accent})`,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            display: "inline-block",
            paddingBottom: "0.08em",
          }}
        >
          {onPage ? (
            t("companies.highlights.title")
          ) : (
            <>
              {t("landing.employer.companies.titleLine1")}
              <br />
              {t("landing.employer.companies.titleLine2")}
            </>
          )}
        </h2>
      </div>

      <div
        ref={ref}
        className={`relative z-0 grid grid-cols-2 items-start gap-[12px] sm:grid-cols-3 lg:grid-cols-6 ${
          onPage ? "mt-[40px] lg:mt-[56px]" : "mt-[128px]"
        }`}
      >
        {displayCompanies.map((company, i) => {
          const size = SIZE_VARIANTS[i % SIZE_VARIANTS.length]!;
          return (
            // The uneven skyline offsets only apply in the 6-across row (lg+).
            // The page variant's load fade is on this outer div (its keyframes set
            // `transform`), so it never overrides the inner div's scroll-driven one.
            <div
              key={company.name}
              className={`lg:translate-y-[var(--skyline-offset)] ${onPage ? "animate-fade-in-up" : ""}`}
              style={
                {
                  "--skyline-offset": `${size.offset}px`,
                  ...(onPage ? { animationDelay: `${i * 70}ms` } : {}),
                } as React.CSSProperties
              }
            >
              <div
                className="will-change-transform"
                style={
                  onPage
                    ? getTuckStyle(tuckProgress, getRevealOffset(i))
                    : getRevealStyle(revealProgress, getRevealOffset(i))
                }
              >
                <div className={gradientFrameClass("teal")}>
                  <div
                    className={`flex flex-col items-center gap-[10px] rounded-[19px] bg-white p-[14px] text-center ${size.padding}`}
                  >
                    <div
                      data-db="organization.companyLogo"
                      className="flex max-w-full shrink-0 items-center justify-center"
                      style={{ height: size.logoBox, width: size.logoBox }}
                    >
                      {company.logoKind === "image" ? (
                        <img
                          src={company.src}
                          alt={company.name}
                          className="max-w-full object-contain"
                          style={{ height: size.logoImg, width: size.logoImg }}
                        />
                      ) : (
                        <PlaceholderLogo
                          className="text-[#141B2E]"
                          style={{ height: size.logoImg * 0.4, width: size.logoImg * 0.4 }}
                        />
                      )}
                    </div>

                    <div className="w-full min-w-0">
                      <p data-db="organization.legalName" className="truncate text-sm text-[#141B2E]">{company.name}</p>
                      <p data-db="organization.industryId" className="text-balance break-words text-xs text-[#4B5468]">{company.industry}</p>
                      <p data-db="job.activeCount" className="mt-[2px] text-xs text-brand-teal-dark">
                        {t("landing.employer.companies.openRoles", { count: company.openRoles })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
