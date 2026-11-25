import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { BuildingIcon } from "../icons";
import { VerifiedBadge } from "../verified-badge";

export type JobAdCardData = {
  mediaType: "image" | "video";
  mediaUrl: string;
  jobTitle: string;
  companyName: string;
  companyLogoUrl: string | null;
  companyVerified?: boolean;
  /** Already-translated location and job type. */
  location: string;
  jobType: string;
};

/** Height of the details strip under the square artwork, in px. */
export const JOB_AD_STRIP_HEIGHT = 78;

/**
 * One featured job: the employer's square artwork with the job's own details
 * in a strip below. Videos play muted on a loop, only while on screen and
 * only for the card in the middle (`playing`).
 */
export function JobAdCard({
  ad,
  onSelect,
  playing = true,
}: {
  ad: JobAdCardData;
  onSelect?: () => void;
  playing?: boolean;
}) {
  const { t } = useTranslation("common");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!playing) {
      video.pause();
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) video.play().catch(() => {});
        else video.pause();
      },
      { threshold: 0.5 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [ad.mediaUrl, playing]);

  const inner = (
    <div data-db="ads.job" className="overflow-hidden rounded-[19px] bg-white">
      <div className="relative aspect-square w-full overflow-hidden bg-[#E9EEF2]">
        {ad.mediaType === "video" ? (
          <video
            ref={videoRef}
            key={ad.mediaUrl}
            src={ad.mediaUrl}
            muted
            loop
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <img src={ad.mediaUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <span className="absolute left-[10px] top-[10px] rounded-full bg-white/90 px-[9px] py-[3px] text-[11px] text-brand-gold-dark shadow-[0_1px_2px_rgba(0,0,0,0.08)]">
          {t("landing.jobseeker.featured.badge")}
        </span>
      </div>
      <div className="flex items-center gap-[10px] px-[12px]" style={{ height: JOB_AD_STRIP_HEIGHT }}>
        <div className="relative h-[38px] w-[38px] shrink-0">
          {ad.companyLogoUrl ? (
            <img
              src={ad.companyLogoUrl}
              alt=""
              className="h-full w-full rounded-[10px] border border-black/[0.06] bg-white object-contain p-[3px]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-brand-gold-soft text-brand-gold-dark">
              <BuildingIcon className="h-[16px] w-[16px]" />
            </div>
          )}
          {ad.companyVerified && <VerifiedBadge size={13} />}
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p data-db="job.title" className="truncate text-sm font-semibold text-[#141B2E]">{ad.jobTitle}</p>
          <p data-db="organization.legalName" className="truncate text-xs text-[#4B5468]">{ad.companyName}</p>
          <p data-db="job.cityId" className="mt-[1px] truncate text-xs text-[#9AA3B2]">
            {ad.location} · {ad.jobType}
          </p>
        </div>
      </div>
    </div>
  );

  const cardClass = `block w-full ${gradientFrameClass("gold")}`;

  return onSelect ? (
    <button
      type="button"
      onClick={onSelect}
      aria-label={t("landing.jobseeker.featured.view", { job: ad.jobTitle, company: ad.companyName })}
      className={`${cardClass} transition-transform hover:-translate-y-[2px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold-dark`}
    >
      {inner}
    </button>
  ) : (
    <div className={cardClass}>{inner}</div>
  );
}
