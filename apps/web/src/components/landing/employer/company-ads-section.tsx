import { useTranslation } from "react-i18next";
import { sampleCompanyAdFill } from "@/data/landing/sample-company-ads";
import { AdCarousel } from "../ad-carousel";
import { CompanyAdCard, type CompanyAdCardData } from "./company-ad-card";

const STAGE_WIDTH = "min(640px, 78vw)";

/**
 * "See what companies on JobGiga are building": each company's approved ad
 * (ads.live) in a one-row carousel with the middle ad enlarged. Real ads
 * come first; sample ads fill the remaining slots.
 */
export function CompanyAdsSection({
  ads = [],
  className = "shell relative z-[1] -mt-[48px] pb-[112px]",
  startIndex,
  autoAdvance,
}: {
  ads?: (CompanyAdCardData & { id: string })[];
  // The employer's "Preview on the employer page" renders this same section
  // in a dialog — different spacing, starting on their ad, not moving.
  className?: string;
  startIndex?: number;
  autoAdvance?: boolean;
}) {
  const { t } = useTranslation("common");
  const samples = sampleCompanyAdFill(
    ads.length,
    ads.map((a) => a.companyName),
  );
  const cards = [...ads, ...samples];
  if (cards.length === 0) return null;

  return (
    <section className={className}>
      <div className="mx-auto text-center">
        {/* Block wrapper so the pill and the inline-block heading never share a line. */}
        <div>
          <span className="inline-flex items-center rounded-full bg-brand-teal-soft px-[14px] py-[7px] text-xs text-brand-teal-dark">
            {t("landing.employer.spotlight.eyebrow")}
          </span>
        </div>
        <h2
          className="mt-[16px] font-sans font-semibold text-[#141B2E]"
          style={{
            fontSize: "clamp(34px, 4vw, 56px)",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            backgroundImage: "var(--brand-gradient-employer)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            display: "inline-block",
            paddingBottom: "0.08em",
          }}
        >
          {t("landing.employer.spotlight.titleLine1")}
          <br />
          {t("landing.employer.spotlight.titleLine2")}
        </h2>
      </div>

      <AdCarousel
        items={cards}
        renderCard={(ad, active) => <CompanyAdCard ad={ad} playing={active} />}
        dotLabel={(ad, i) =>
          t("landing.employer.spotlight.showAd", { index: i + 1, total: cards.length, company: ad.companyName })
        }
        stageWidth={STAGE_WIDTH}
        stageHeight={`calc(${STAGE_WIDTH} * 9 / 16)`}
        startIndex={startIndex}
        autoAdvance={autoAdvance}
      />
    </section>
  );
}
