import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import { CompanyAdsSection } from "@/components/landing/employer/company-ads-section";
import { CompanyHighlights } from "@/components/landing/employer/company-highlights";
import { EmployerFloatingBadges } from "@/components/landing/employer/employer-floating-badges";
import { EmployerSteps } from "@/components/landing/employer/employer-steps";
import { HiringStats } from "@/components/landing/employer/hiring-stats";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { Navbar } from "@/components/landing/navbar";
import { ScrollWidthBackground } from "@/components/landing/scroll-width-background";
import { WelcomeModal } from "@/components/landing/welcome-modal";

export const Route = createFileRoute("/employer/")({
  component: EmployerLandingPage,
});

// TODO(api): the live card, company cards and spotlight ads show sample data
// until oRPC procedures for them exist.
function EmployerLandingPage() {
  const { t } = useTranslation("common");

  return (
    <main className="flex min-h-[100svh] flex-col overflow-x-hidden bg-brand-teal-page">
      <Navbar pageRole="employer" />
      <WelcomeModal role="employer" image="/welcome/employer.svg" />
      <Hero
        heading={
          <>
            {t("landing.employer.hero.titleLine1")}
            <br />
            {t("landing.employer.hero.titleLine2")}
          </>
        }
        subheading={t("landing.employer.hero.subheading")}
        headingGradient="var(--brand-gradient-employer)"
        overlay={<EmployerFloatingBadges />}
        belowNav={<HiringStats />}
      />
      <AnimatedRibbon />
      <CompanyHighlights />
      <ScrollWidthBackground
        color="var(--band-employer)"
        gradient="var(--band-gradient-employer)"
        fadeEdges
        startWidth={45}
        durationMs={1400}
        video={{ src: "/videos/spotlight-bg.mp4", poster: "/videos/spotlight-bg-poster.jpg" }}
      >
        <CompanyAdsSection className="shell relative z-[1] py-[clamp(56px,9vh,96px)]" />
      </ScrollWidthBackground>
      <EmployerSteps />
      <Footer accent="teal" />
      {/* Clipped to its top half so the ribbon reads as bleeding off the bottom edge. */}
      <div className="h-[80px] overflow-hidden sm:h-[110px] lg:h-[150px]">
        <AnimatedRibbon />
      </div>
    </main>
  );
}
