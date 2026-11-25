import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

// The Company column: each page has one version per side, and the footer links
// to the page's own side. `db` is what the link maps to in the dev DB map
// (see DB-MAP.md); it does nothing in production.
const COMPANY_LINKS = [
  { key: "about", employer: "/employer/about", jobseeker: "/jobseeker/about", db: "about.page" },
  { key: "releaseNotes", employer: "/employer/release-notes", jobseeker: "/jobseeker/release-notes", db: "page.releaseNotes" },
  { key: "privacy", employer: "/employer/privacy", jobseeker: "/jobseeker/privacy", db: "page.privacy" },
  { key: "security", employer: "/employer/security", jobseeker: "/jobseeker/security", db: "page.security" },
  { key: "terms", employer: "/employer/terms", jobseeker: "/jobseeker/terms", db: "page.terms" },
] as const;

/** Landing page footer. No background of its own — it sits on the page colour. */
export function Footer({ accent = "teal" }: { accent?: "teal" | "gold" }) {
  const { t } = useTranslation("common");
  const linkClass = `text-sm ${accent === "gold" ? "text-brand-gold-dark" : "text-brand-teal-dark"} transition-opacity hover:opacity-70`;

  return (
    <footer>
      <div className="shell flex flex-col gap-[40px] pt-[56px] pb-[32px]">
        <div className="flex flex-col justify-between gap-[32px] sm:flex-row">
          <div className="max-w-[280px]">
            <img src="/jg-logo.svg" alt="JobGiga" width={111} height={28} />
            <p className="mt-[8px] text-xs leading-[20px] text-[#4B5468]">{t("landing.footer.tagline")}</p>
          </div>

          <div className="flex gap-[48px]">
            <div>
              <p className="text-xs tracking-[0.04em] text-[#9AA3B2] uppercase">{t("landing.footer.forEmployers")}</p>
              <ul className="mt-[12px] flex flex-col gap-[10px]">
                <li>
                  <Link to="/employer" data-db="action.postJob" className={linkClass}>
                    {t("landing.footer.postJob")}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs tracking-[0.04em] text-[#9AA3B2] uppercase">{t("landing.footer.forJobseekers")}</p>
              <ul className="mt-[12px] flex flex-col gap-[10px]">
                <li>
                  <Link to="/jobseeker" data-db="action.findJobs" className={linkClass}>
                    {t("landing.footer.findJob")}
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-xs tracking-[0.04em] text-[#9AA3B2] uppercase">{t("landing.footer.company")}</p>
              <ul className="mt-[12px] flex flex-col gap-[10px]">
                {COMPANY_LINKS.map((link) => (
                  <li key={link.key}>
                    <Link to={accent === "gold" ? link.jobseeker : link.employer} data-db={link.db} className={linkClass}>
                      {t(`landing.footer.${link.key}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse items-center justify-between gap-[12px] border-t border-black/[0.06] pt-[20px] sm:flex-row">
          <p className="text-xs text-[#9AA3B2]">{t("landing.footer.copyright", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
