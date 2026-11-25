import { useTranslation } from "react-i18next";
import { AdCarousel } from "../ad-carousel";
import { ScrollWidthBackground } from "../scroll-width-background";
import { JOB_AD_STRIP_HEIGHT, JobAdCard, type JobAdCardData } from "./job-ad-card";

// The middle card's width; the card is that plus the details strip tall.
const STAGE_WIDTH = "min(320px, 70vw)";

/** `selectable: false` — a sample ad whose listing isn't on the page, so there's nothing to open. */
export type FeaturedJobAd = JobAdCardData & { id: string; jobPostingId: string; selectable?: boolean };

/**
 * "Jobs promoted on JobGiga": featured job ads in a full-width carousel with
 * two main cards on wide screens. Picking a card opens that job below.
 */
export function FeaturedJobAds({
  ads,
  onSelect,
}: {
  ads: FeaturedJobAd[];
  onSelect: (jobPostingId: string) => void;
}) {
  const { t } = useTranslation("common");
  if (ads.length === 0) return null;

  return (
    // Breaks out of the page's side padding so the band spans the full width.
    <div className="relative z-0 mt-[56px] ml-[calc(50%-50vw)] w-screen">
      <ScrollWidthBackground
        color="var(--band-jobseeker)"
        gradient="var(--band-gradient-jobseeker)"
        fadeEdges
        startWidth={45}
        durationMs={1400}
        video={{ src: "/videos/featured-jobs-bg.mp4", poster: "/videos/featured-jobs-bg-poster.jpg" }}
      >
        <section aria-label={t("landing.jobseeker.featured.eyebrow")} className="relative mx-auto w-full py-[clamp(56px,9vh,96px)]">
          <div className="mx-auto max-w-[720px] text-center">
            {/* Block wrapper so the pill and the inline-block heading never share a line. */}
            <div>
              <span className="inline-flex items-center rounded-full bg-brand-gold-soft px-[14px] py-[7px] text-xs text-brand-gold-dark">
                {t("landing.jobseeker.featured.eyebrow")}
              </span>
            </div>
            <h2
              className="mt-[16px] font-sans font-semibold text-[#141B2E]"
              style={{
                fontSize: "clamp(34px, 4vw, 56px)",
                lineHeight: 1.08,
                letterSpacing: "-0.02em",
                backgroundImage: "var(--brand-gradient-jobseeker)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                display: "inline-block",
                paddingBottom: "0.08em",
              }}
            >
              {t("landing.jobseeker.featured.title")}
            </h2>
          </div>

          <AdCarousel
            items={ads}
            renderCard={(ad, active) => (
              <JobAdCard
                ad={ad}
                playing={active}
                onSelect={ad.selectable === false ? undefined : () => onSelect(ad.jobPostingId)}
              />
            )}
            dotLabel={(ad, i) =>
              t("landing.jobseeker.featured.showAd", { index: i + 1, total: ads.length, job: ad.jobTitle })
            }
            stageWidth={STAGE_WIDTH}
            stageHeight={`calc(${STAGE_WIDTH} + ${JOB_AD_STRIP_HEIGHT}px)`}
            // Two main cards, the rest spreading to the screen edges, masked
            // so the video band behind shows through.
            twoMain
            fadeWidth="12vw"
            activeDotClassName="bg-brand-gold-dark"
            className="mt-[56px]"
          />
        </section>
      </ScrollWidthBackground>
    </div>
  );
}
