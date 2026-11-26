import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/**
 * Landing page hero: gradient headline, subheading, the Employer/Jobseeker
 * toggle, and a slot below it (the live card or the resume upload).
 */
export function Hero({
  heading,
  subheading,
  headingGradient,
  overlay,
  belowNav,
  showRoleToggle = true,
  subheadingClassName = "mb-[18px]",
}: {
  heading: React.ReactNode;
  subheading: React.ReactNode;
  /** Paints the headline with this CSS gradient instead of solid ink. */
  headingGradient?: string;
  /** Decorations behind the text, e.g. the floating badges. */
  overlay?: React.ReactNode;
  belowNav?: React.ReactNode;
  showRoleToggle?: boolean;
  /** Spacing under the subheading — the onboarding pages use a larger gap. */
  subheadingClassName?: string;
}) {
  const { t } = useTranslation("common");
  const isJobseeker = useLocation({ select: (location) => location.pathname === "/jobseeker" });

  return (
    <div className="shell relative pt-[clamp(48px,9vh,96px)] pb-[64px] text-center">
      {overlay}

      {/* The text sits in its own stacking context above the badges, so the
          ribbon further down can paint over the badges, never the headline. */}
      <div className="relative z-10">
        <h1
          className="font-sans font-semibold text-[#141B2E]"
          style={{
            fontSize: "clamp(34px, 4vw, 56px)",
            lineHeight: 1.08,
            letterSpacing: "-0.02em",
            ...(headingGradient
              ? {
                  backgroundImage: headingGradient,
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  // Shrink to the text so the whole gradient falls on the words.
                  display: "inline-block",
                  // Room for descenders (g, j, y) inside the clipped background.
                  paddingBottom: "0.08em",
                }
              : {}),
          }}
        >
          {heading}
        </h1>

        <p className={`mx-auto mt-[18px] max-w-[560px] text-sm leading-[24px] text-[#4B5468] ${subheadingClassName}`}>
          {subheading}
        </p>

        {showRoleToggle && (
          <nav
            aria-label={t("landing.hero.viewAs")}
            className={`mx-auto mt-[28px] grid w-fit grid-cols-2 gap-[4px] rounded-full p-[4px] ${
              isJobseeker ? "bg-brand-teal-dark" : "bg-brand-gold"
            }`}
          >
            <Link
              to="/employer"
              aria-current={!isJobseeker ? "page" : undefined}
              className={`flex h-[38px] items-center justify-center rounded-full px-[22px] text-sm transition-colors aria-[current=page]:bg-brand-teal-dark aria-[current=page]:text-white aria-[current=page]:shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${
                isJobseeker ? "text-white" : "text-[#4B5468]"
              }`}
            >
              {t("landing.roles.employer")}
            </Link>

            <Link
              to="/jobseeker"
              aria-current={isJobseeker ? "page" : undefined}
              className={`flex h-[38px] items-center justify-center rounded-full px-[22px] text-sm transition-colors aria-[current=page]:bg-brand-gold aria-[current=page]:text-[#141B2E] aria-[current=page]:shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${
                isJobseeker ? "" : "text-[#4B5468]"
              }`}
            >
              {t("landing.roles.jobseeker")}
            </Link>
          </nav>
        )}

        {belowNav}
      </div>
    </div>
  );
}
