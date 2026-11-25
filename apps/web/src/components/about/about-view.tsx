import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import { Footer } from "@/components/landing/footer";
import {
  BellIcon,
  BoltIcon,
  BuildingIcon,
  CalendarIcon,
  DraftIcon,
  FileIcon,
  ImageIcon,
  PencilIcon,
  StarIcon,
  TrendUpIcon,
  UploadIcon,
  UserIcon,
} from "@/components/landing/icons";
import { Navbar } from "@/components/landing/navbar";
import { gradientFrameClass } from "@/lib/landing/form-styles";

type Role = "employer" | "jobseeker";
type Icon = (props: { className?: string }) => React.ReactNode;

// Text lives in the translation files under landing.about.{role}; this only
// sets which icon goes with each feature and the walkthrough video per side.
// Everything describes what the product does — no company facts (founders,
// dates, user counts) that aren't ours to claim.
const FEATURE_ICONS: Record<Role, Icon[]> = {
  employer: [BuildingIcon, PencilIcon, TrendUpIcon, StarIcon, CalendarIcon, ImageIcon],
  jobseeker: [UploadIcon, BoltIcon, UserIcon, FileIcon, DraftIcon, BellIcon],
};

const VIDEOS: Record<Role, { src: string; poster: string }> = {
  employer: { src: "/videos/employer-walkthrough.mp4", poster: "/videos/employer-walkthrough-poster.jpg" },
  jobseeker: { src: "/videos/jobseeker-walkthrough.mp4", poster: "/videos/jobseeker-walkthrough-poster.jpg" },
};

/**
 * The About page, one per side: /employer/about in teal on mint,
 * /jobseeker/about in gold on cream — always the page's own side, so each
 * reads as part of its landing page.
 */
export function AboutView({ role }: { role: Role }) {
  const { t } = useTranslation("common");
  const k = `landing.about.${role}`;
  const gold = role === "jobseeker";
  const accent = gold ? "gold" : "teal";
  const solidButton = gold ? "bg-brand-gold text-[#141B2E]" : "bg-brand-teal-dark text-white";
  const iconTile = gold ? "bg-brand-gold-soft text-brand-gold-dark" : "bg-brand-teal-soft text-brand-teal-dark";
  const accentText = gold ? "text-brand-gold-dark" : "text-brand-teal-dark";
  const ctaClass = `flex h-[38px] shrink-0 items-center rounded-full px-[18px] text-sm transition-opacity hover:opacity-90 ${solidButton}`;
  const video = VIDEOS[role];

  return (
    <main
      className={`flex min-h-[100svh] flex-col overflow-x-clip pb-[92px] ${gold ? "bg-brand-gold-page" : "bg-brand-teal-page"}`}
    >
      <Navbar pageRole={role} />

      {/* Same distance from the navbar as the landing page's hero heading. */}
      <div className="shell pt-[clamp(2px,calc(9vh-46px),50px)]">
        <div className="mx-auto max-w-[720px] text-center">
          <span className="inline-flex items-center rounded-full bg-[#F1F4F8] px-[14px] py-[7px] text-xs text-[#4B5468]">
            {t(`${k}.eyebrow`)}
          </span>
          <h1
            className="mt-[16px] font-sans font-semibold text-[#141B2E]"
            style={{
              // Same size and gradient as the landing page's hero heading.
              fontSize: "clamp(34px, 4vw, 56px)",
              lineHeight: 1.08,
              letterSpacing: "-0.02em",
              backgroundImage: `var(--brand-gradient-${role})`,
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              display: "inline-block",
              paddingBottom: "0.08em",
            }}
          >
            {t(`${k}.headline`)}
          </h1>
          <p className="mx-auto mt-[16px] max-w-[560px] text-sm leading-[24px] text-[#4B5468]">{t(`${k}.intro`)}</p>
        </div>

        {/* A real screen recording, muted and looping with no controls, so it
            plays like a moving screenshot. */}
        <div className="mx-auto mt-[48px] max-w-[1000px]">
          <div className="text-center">
            <h2 className="text-lg font-semibold text-[#141B2E]">{t(`${k}.videoTitle`)}</h2>
            <p className="mt-[4px] text-xs text-[#9AA3B2]">{t(`${k}.videoCaption`)}</p>
          </div>
          <div className={`mt-[16px] animate-fade-in-up ${gradientFrameClass(accent)}`}>
            <div className="overflow-hidden rounded-[19px] bg-white">
              <video
                src={video.src}
                poster={video.poster}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                aria-label={t(`${k}.videoTitle`)}
                className={`block aspect-[8/5] w-full ${gold ? "bg-brand-gold-page" : "bg-brand-teal-page"}`}
              />
            </div>
          </div>
        </div>

        {/* What we believe */}
        <div className="mt-[56px] grid grid-cols-1 gap-[16px] md:grid-cols-3">
          {[1, 2, 3].map((n, i) => (
            <div
              key={n}
              className={`animate-fade-in-up ${gradientFrameClass(accent)}`}
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <div className="h-full rounded-[19px] bg-white p-[20px] sm:p-[24px]">
                <span
                  className={`flex h-[28px] w-[28px] items-center justify-center rounded-full text-xs font-semibold ${solidButton}`}
                >
                  {n}
                </span>
                <h2 className="mt-[14px] text-base font-semibold text-[#141B2E]">{t(`${k}.principle${n}Title`)}</h2>
                <p className="mt-[6px] text-sm leading-[21px] text-[#4B5468]">{t(`${k}.principle${n}Detail`)}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Features */}
        <div className={`mt-[56px] ${gradientFrameClass(accent)}`}>
          <div className="rounded-[19px] bg-white p-[20px] sm:p-[28px]">
            <h2 className="text-lg font-semibold text-[#141B2E]">{t(`${k}.featuresTitle`)}</h2>
            <div className="mt-[20px] grid grid-cols-1 gap-x-[28px] gap-y-[22px] sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_ICONS[role].map((Icon, i) => (
                <div key={i} className="flex items-start gap-[12px]">
                  <span className={`flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] ${iconTile}`}>
                    <Icon className="h-[16px] w-[16px]" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[#141B2E]">{t(`${k}.feature${i + 1}Title`)}</h3>
                    <p className="mt-[4px] text-sm leading-[21px] text-[#4B5468]">{t(`${k}.feature${i + 1}Detail`)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Made for Malaysia */}
        <div className={`mt-[20px] ${gradientFrameClass(accent)}`}>
          <div className="flex flex-col items-start gap-[16px] rounded-[19px] bg-white p-[20px] sm:p-[28px] md:flex-row md:items-center md:justify-between">
            <div className="max-w-[620px]">
              <h2 className="text-lg font-semibold text-[#141B2E]">{t("landing.about.madeForMalaysia")}</h2>
              <p className="mt-[6px] text-sm leading-[22px] text-[#4B5468]">{t(`${k}.malaysia`)}</p>
            </div>
            {gold ? (
              <Link to="/jobseeker" hash="job-search" data-db="action.findJobs" className={ctaClass}>
                {t(`${k}.cta`)}
              </Link>
            ) : (
              <Link to="/companies" data-db="action.findCompanies" className={ctaClass}>
                {t(`${k}.cta`)}
              </Link>
            )}
          </div>
        </div>

        <p className="mt-[28px] text-center text-sm">
          <Link to={gold ? "/employer/about" : "/jobseeker/about"} className={`hover:underline ${accentText}`}>
            {t(`${k}.other`)} →
          </Link>
        </p>
      </div>

      <div className="flex-1" />
      <div className="mt-[64px]">
        <Footer accent={accent} />
      </div>
      <div className="-mb-[92px] h-[80px] overflow-hidden sm:h-[110px] lg:h-[150px]">
        <AnimatedRibbon accent={accent} />
      </div>
    </main>
  );
}
