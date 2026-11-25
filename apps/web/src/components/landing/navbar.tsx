import { Link, useLocation } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { showComingSoon } from "@/lib/coming-soon";

const plainLinkClass = "hidden whitespace-nowrap px-[6px] py-[6px] hover:opacity-60 sm:block";
// The current page's link is bold.
const navLinkClass = `${plainLinkClass} aria-[current=page]:font-semibold`;

/**
 * Landing page navbar (signed-out view): logo, page links, the
 * Employer · Jobseeker switch, language switch, Sign in and Get started.
 * TODO(auth): add the signed-in view (avatar menu, notifications) once
 * Better-Auth is set up; Sign in / Get started then open the auth modal.
 */
export function Navbar({ pageRole }: { pageRole: "employer" | "jobseeker" }) {
  const { t, i18n } = useTranslation("common");
  const pathname = useLocation({ select: (location) => location.pathname });
  const isMalay = i18n.resolvedLanguage === "ms";
  const aboutHref = pageRole === "jobseeker" ? "/jobseeker/about" : "/employer/about";

  return (
    <header className="relative z-20 h-[65px] shrink-0">
      <nav className="shell flex h-full items-center justify-between">
        {/* Left: logo, then Find job / Find companies and About. */}
        <div className="flex items-center gap-[18px] text-sm text-[#141B2E] sm:gap-[28px]">
          <Link to={pageRole === "jobseeker" ? "/jobseeker" : "/employer"} className="flex items-center">
            <img src="/jg-logo.svg" alt="JobGiga" width={111} height={28} />
          </Link>

          {pageRole === "jobseeker" && (
            // Current only at the job search itself; never bold, like the redesign.
            <Link
              to="/jobseeker"
              hash="job-search"
              data-db="action.findJobs"
              activeOptions={{ exact: true, includeHash: true }}
              onClick={(e) => {
                // Already on the page: the route doesn't change, so scroll ourselves.
                if (pathname !== "/jobseeker") return;
                e.preventDefault();
                document.getElementById("job-search")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={plainLinkClass}
            >
              {t("landing.nav.findJob")}
            </Link>
          )}
          {pageRole === "employer" && (
            <Link to="/companies" data-db="action.findCompanies" className={navLinkClass}>
              {t("landing.nav.findCompanies")}
            </Link>
          )}
          {/* Each side has its own About page. */}
          <Link to={aboutHref} data-db="about.page" activeOptions={{ exact: true }} className={navLinkClass}>
            {t("landing.nav.about")}
          </Link>
        </div>

        {/* Right: Employer · Jobseeker, language, then Sign in / Get started. */}
        <div className="flex items-center gap-[18px] text-sm text-[#141B2E]">
          {/* Exact match: "Employer" is current on /employer, not on /employer/about.
              TanStack Router sets aria-current="page" on the active link. */}
          <Link to="/employer" activeOptions={{ exact: true }} className={navLinkClass}>
            {t("landing.roles.employer")}
          </Link>
          <Link to="/jobseeker" activeOptions={{ exact: true }} className={navLinkClass}>
            {t("landing.roles.jobseeker")}
          </Link>

          <button
            type="button"
            onClick={() => i18n.changeLanguage(isMalay ? "en" : "ms")}
            aria-label={t("landing.nav.switchLanguage")}
            title={t("landing.nav.switchLanguage")}
            className="rounded-full border border-black/[0.1] px-[10px] py-[4px] text-xs hover:bg-black/[0.03]"
          >
            <span className={isMalay ? "text-[#9AA3B2]" : "font-semibold"}>EN</span>
            <span className="text-[#9AA3B2]"> / </span>
            <span className={isMalay ? "font-semibold" : "text-[#9AA3B2]"}>BM</span>
          </button>

          <button type="button" data-db="action.signIn" onClick={showComingSoon} className="hidden px-[6px] py-[6px] hover:opacity-60 sm:block">
            {t("landing.nav.signIn")}
          </button>

          <button
            type="button"
            data-db="action.signUp"
            onClick={showComingSoon}
            className={`flex h-[38px] items-center rounded-full px-[18px] text-sm hover:opacity-90 ${
              pageRole === "jobseeker" ? "bg-brand-gold text-[#141B2E]" : "bg-brand-teal-dark text-white"
            }`}
          >
            {t("landing.nav.getStarted")}
          </button>
        </div>
      </nav>
    </header>
  );
}
