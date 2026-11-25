import { useEffect, useRef } from "react";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { BuildingIcon } from "../icons";
import { VerifiedBadge } from "../verified-badge";

export type CompanyAdCardData = {
  mediaType: "image" | "video";
  mediaUrl: string;
  headline: string;
  companyId?: string;
  companyName: string;
  companyLogoUrl: string | null;
  companyIndustry?: string | null;
  companyVerified?: boolean;
};

/**
 * One company advertisement in the Company spotlight. 16:9, with the logo and
 * headline over a dark fade at the bottom. Videos play muted on a loop, only
 * while on screen and only for the card in the middle (`playing`).
 * TODO(route): link to the company's page once a company route exists.
 */
export function CompanyAdCard({ ad, playing = true }: { ad: CompanyAdCardData; playing?: boolean }) {
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
      { threshold: 0.4 },
    );
    observer.observe(video);
    return () => observer.disconnect();
  }, [ad.mediaUrl, playing]);

  return (
    <div className={`group relative block aspect-[16/9] w-full ${gradientFrameClass("teal")}`}>
      <div data-db="ads.company" className="relative h-full w-full overflow-hidden rounded-[19px] bg-[#E9EEF2]">
        {ad.mediaType === "video" ? (
          <video
            ref={videoRef}
            key={ad.mediaUrl}
            src={ad.mediaUrl}
            muted
            loop
            playsInline
            preload="metadata"
            data-db="ads.media"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <img src={ad.mediaUrl} alt="" loading="lazy" data-db="ads.media" className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-black/70 via-black/30 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-[10px] p-[14px]">
          <div className="relative h-[48px] w-[48px] shrink-0">
            {ad.companyLogoUrl ? (
              <img
                src={ad.companyLogoUrl}
                alt=""
                className="h-full w-full rounded-[10px] bg-white object-contain p-[3px]"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-[10px] bg-brand-teal-soft text-brand-teal-dark">
                <BuildingIcon className="h-[20px] w-[20px]" />
              </div>
            )}
            {ad.companyVerified && <VerifiedBadge size={15} />}
          </div>
          <div className="min-w-0 flex-1 text-white">
            <p data-db="ads.headline" className="line-clamp-2 text-sm font-semibold leading-[18px] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
              {ad.headline}
            </p>
            <p data-db="organization.legalName" className="mt-[2px] truncate text-xs text-white/80">
              {[ad.companyName, ad.companyIndustry].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
