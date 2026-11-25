import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import { Footer } from "@/components/landing/footer";
import { Hero } from "@/components/landing/hero";
import { JobPostingBadges } from "@/components/landing/jobseeker/job-posting-badges";
import { JobPostingHighlights } from "@/components/landing/jobseeker/job-posting-highlights";
import { JobseekerHowItWorks } from "@/components/landing/jobseeker/jobseeker-how-it-works";
import { ResumeUpload } from "@/components/landing/jobseeker/resume-upload";
import { Navbar } from "@/components/landing/navbar";
import { WelcomeModal } from "@/components/landing/welcome-modal";

export const Route = createFileRoute("/jobseeker/")({
  component: JobseekerLandingPage,
});

// TODO(api): the job list and featured jobs show sample data until oRPC
// procedures for them exist.
function JobseekerLandingPage() {
  const { t } = useTranslation("common");

  return (
    <main id="top" className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-gold-page">
      <Navbar pageRole="jobseeker" />
      <WelcomeModal role="jobseeker" image="/welcome/jobseeker.svg" />
      <Hero
        heading={
          <>
            {t("landing.jobseeker.hero.titleLine1")}
            <br />
            {t("landing.jobseeker.hero.titleLine2")}
          </>
        }
        subheading={t("landing.jobseeker.hero.subheading")}
        headingGradient="var(--brand-gradient-jobseeker)"
        overlay={<JobPostingBadges />}
        belowNav={<ResumeUpload />}
      />
      <JobseekerHowItWorks />
      <AnimatedRibbon accent="gold" />
      <JobPostingHighlights />
      <Footer accent="gold" />
      {/* Clipped to its top half so the ribbon reads as bleeding off the bottom edge. */}
      <div className="h-[80px] overflow-hidden sm:h-[110px] lg:h-[150px]">
        <AnimatedRibbon accent="gold" />
      </div>
    </main>
  );
}
