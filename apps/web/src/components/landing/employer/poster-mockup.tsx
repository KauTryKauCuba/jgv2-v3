import { useTranslation } from "react-i18next";
import { MOCKUP_CARD_CLASS as cardClass } from "@/lib/landing/form-styles";
import { CheckIcon } from "../icons";

const K = "landing.employer.mockups.poster";

// Same two styles (and swatches) as the real Poster Generator.
const STYLES = [
  { id: "playful", swatch: "linear-gradient(135deg, #BEE3F8, #FFFFFF)", phase: "a" },
  { id: "corporate", swatch: "linear-gradient(135deg, #141B2E, #1FA6C9)", phase: "b" },
] as const;

const POSTING = {
  title: "Graphic Designer",
  company: "ParcelTracker",
  location: "KL Sentral, Kuala Lumpur",
  salary: "RM2,800–4,500",
};

/**
 * Animated recreation of the Poster Generator: the side card holds the
 * posting and style picker, the main card one finished poster per style.
 * Both alternate between the styles on one shared CSS timeline
 * (.poster-mock-* in styles/landing.css) — no JS; reduced motion respected.
 */
export function PosterMockup() {
  const { t } = useTranslation("common");
  const jobType = t(`${K}.jobType`);

  return (
    <div className="flex h-full w-full items-center justify-center bg-brand-teal-page p-[20px]">
      <div className="grid w-full max-w-[840px] grid-cols-1 gap-[12px] md:grid-cols-[1fr_2fr]">
        {/* The narrow side card is hidden below md — it doesn't fit a phone-width card. */}
        <div className={`${cardClass} hidden flex-col gap-[10px] self-start md:flex`}>
          <div>
            <h3 className="text-xs font-semibold text-[#141B2E]">{t(`${K}.generator`)}</h3>
            <p className="mt-[2px] text-xs leading-[13px] text-[#4B5468]">{t(`${K}.generatorHint`)}</p>
          </div>

          <div className="rounded-[8px] border border-brand-teal-dark bg-brand-teal-soft px-[8px] py-[6px]">
            <p className="truncate text-xs text-[#141B2E]">{POSTING.title}</p>
            <p className="truncate text-[10px] text-[#4B5468]">{POSTING.location}</p>
          </div>

          <div className="flex flex-col gap-[6px]">
            {STYLES.map((s) => (
              <div
                key={s.id}
                className={`flex items-center gap-[6px] rounded-[8px] border border-black/[0.06] px-[8px] py-[6px] poster-mock-style-${s.phase}`}
              >
                <span
                  aria-hidden
                  className="h-[14px] w-[14px] shrink-0 rounded-full border border-black/[0.06]"
                  style={{ background: s.swatch }}
                />
                <span className="truncate text-[10px] text-[#141B2E]">{t(`${K}.styles.${s.id}`)}</span>
                <CheckIcon className={`ml-auto h-[9px] w-[9px] shrink-0 text-brand-teal-dark poster-mock-check-${s.phase}`} />
              </div>
            ))}
          </div>

          <div className="ai-fill-pulse flex h-[26px] items-center justify-center rounded-full bg-brand-teal-dark text-[10px] text-white">
            {t(`${K}.generate`)}
          </div>
        </div>

        <div className={`${cardClass} flex flex-col gap-[10px]`}>
          <div>
            <h3 className="text-xs font-semibold text-[#141B2E]">{t(`${K}.yourPosters`)}</h3>
            <p className="mt-[2px] text-xs leading-[13px] text-[#4B5468]">{t(`${K}.yourPostersHint`)}</p>
          </div>

          <div className="flex items-center justify-center gap-[14px] rounded-[10px] bg-[#F8FAFB] px-[10px] py-[32px]">
            {/* Playful — sticky note pinned to a soft blue board */}
            <div className="poster-mock-card-a relative flex aspect-[9/16] w-[38%] max-w-[150px] flex-col overflow-hidden rounded-[10px] bg-[#BEE3F8] p-[8px] shadow-[0_4px_12px_rgba(20,27,46,0.12)]">
              <span aria-hidden className="poster-mock-shine-a pointer-events-none absolute inset-y-0 left-0 z-10 w-[40%] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
              <p className="text-center text-[10px] font-semibold text-brand-teal-dark">{t(`${K}.weAreHiring`)}</p>
              <div className="relative mt-[8px] flex flex-1 -rotate-2 flex-col gap-[4px] rounded-[4px] bg-[#FFF3B0] p-[8px] pt-[12px] shadow-[0_2px_4px_rgba(20,27,46,0.12)]">
                <span
                  aria-hidden
                  className="absolute top-[-4px] left-1/2 h-[9px] w-[9px] -translate-x-1/2 rounded-full bg-[#E5484D] shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
                />
                <p className="text-[11px] font-semibold leading-[13px] text-[#141B2E]">{POSTING.title}</p>
                <p className="text-[9px] leading-[11px] text-[#4B5468]">{POSTING.location}</p>
                <p className="text-[9px] leading-[11px] text-[#4B5468]">{jobType}</p>
                <p className="mt-auto text-[10px] font-semibold text-brand-teal-dark">{POSTING.salary}</p>
              </div>
              <div className="mt-[8px] rounded-full bg-white py-[3px] text-center text-[9px] text-[#141B2E]">
                {t(`${K}.applyOnJobGiga`)}
              </div>
            </div>

            {/* Corporate — photo header, logo, clean type */}
            <div className="poster-mock-card-b relative flex aspect-[9/16] w-[38%] max-w-[150px] flex-col overflow-hidden rounded-[10px] bg-[#141B2E] shadow-[0_4px_12px_rgba(20,27,46,0.25)]">
              <span aria-hidden className="poster-mock-shine-b pointer-events-none absolute inset-y-0 left-0 z-10 w-[40%] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              <div className="relative h-[45%] w-full">
                {/* Stand-in "photo": a gradient with a silhouette, not a real image. */}
                <div
                  aria-hidden
                  className="absolute inset-0"
                  style={{ background: "linear-gradient(160deg, #9FD8E6 0%, #1FA6C9 55%, #0E5E73 100%)" }}
                />
                <span aria-hidden className="absolute bottom-[22%] left-1/2 h-[22%] w-[18%] -translate-x-1/2 rounded-full bg-[#0E3A48]/70" />
                <span aria-hidden className="absolute bottom-0 left-1/2 h-[22%] w-[40%] -translate-x-1/2 rounded-t-full bg-[#0E3A48]/70" />
                <span className="absolute top-[6px] left-[6px] rounded-[4px] bg-white px-[5px] py-[1px] text-[8px] font-semibold text-[#141B2E]">
                  {POSTING.company}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-[3px] p-[8px]">
                <p className="text-[8px] uppercase tracking-[0.08em] text-brand-gold">{t(`${K}.nowHiring`)}</p>
                <p className="text-[11px] font-semibold leading-[13px] text-white">{POSTING.title}</p>
                <p className="text-[9px] leading-[11px] text-white/70">{POSTING.location}</p>
                <p className="text-[9px] leading-[11px] text-white/70">{POSTING.salary}</p>
                <div className="mt-auto rounded-full bg-brand-gold py-[3px] text-center text-[9px] text-[#141B2E]">
                  {t(`${K}.applyNow`)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-[6px]">
            <span className="flex h-[24px] flex-1 items-center justify-center rounded-full bg-brand-teal-dark text-[10px] text-white">
              {t(`${K}.download`)}
            </span>
            <span className="flex h-[24px] flex-1 items-center justify-center rounded-full border border-black/[0.1] text-[10px] text-[#4B5468]">
              {t(`${K}.generateAnother`)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
