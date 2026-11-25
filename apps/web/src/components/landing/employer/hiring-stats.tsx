import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  type HiringCompany,
  type LatestActivity,
  type LatestPosting,
  SAMPLE_HIRING_COMPANIES,
  SAMPLE_LATEST_ACTIVITY,
  SAMPLE_LATEST_POSTINGS,
  topUp,
} from "@/data/landing/sample-hiring";
import { showComingSoon } from "@/lib/coming-soon";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { relativeTimeAgo } from "@/lib/landing/relative-time";
import { BuildingIcon } from "../icons";

const PAGE_ORDER = ["hiring", "posted", "activity"] as const;
type Page = (typeof PAGE_ORDER)[number];

const ROTATE_MS = 6000;

function CompanyLogo({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-brand-teal-soft">
        <BuildingIcon className="h-[16px] w-[16px] text-brand-teal-dark" />
      </div>
    );
  }
  return <img src={url} alt="" className="h-[34px] w-[34px] shrink-0 rounded-[10px] object-contain" />;
}

function Row({
  logoUrl,
  title,
  subtitle,
  pill,
  db,
}: {
  logoUrl: string | null;
  title: string;
  subtitle: string;
  pill: string;
  /** What the title, subtitle and pill map to in the database (shown by the dev DB map). */
  db: { title: string; subtitle: string; pill: string };
}) {
  return (
    <div className="flex items-center gap-[10px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] px-[12px] py-[10px]">
      <CompanyLogo url={logoUrl} />
      <div className="min-w-0 flex-1">
        <p data-db={db.title} className="truncate text-xs text-[#141B2E]">{title}</p>
        <p data-db={db.subtitle} className="truncate text-xs text-[#9AA3B2]">{subtitle}</p>
      </div>
      <span data-db={db.pill} className="shrink-0 rounded-full bg-brand-teal-soft px-[9px] py-[3px] text-xs text-brand-teal-dark">
        {pill}
      </span>
    </div>
  );
}

/**
 * The employer hero's live card. It rotates every 6s between companies
 * hiring, the newest postings, and recent shortlists/interviews.
 * TODO(api): pass real rows from oRPC; samples top up each list to 5.
 */
export function HiringStats({
  hiringCompanies = [],
  latestPostings = [],
  latestActivity = [],
}: {
  hiringCompanies?: HiringCompany[];
  latestPostings?: LatestPosting[];
  latestActivity?: LatestActivity[];
}) {
  const { t } = useTranslation("common");
  const [page, setPage] = useState<Page>("hiring");

  useEffect(() => {
    const id = setInterval(() => {
      setPage((prev) => PAGE_ORDER[(PAGE_ORDER.indexOf(prev) + 1) % PAGE_ORDER.length]!);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const companies = topUp(hiringCompanies, SAMPLE_HIRING_COMPANIES);
  const postings = topUp(latestPostings, SAMPLE_LATEST_POSTINGS);
  const activity = topUp(latestActivity, SAMPLE_LATEST_ACTIVITY);

  return (
    <div className={`mx-auto mt-[24px] w-full max-w-[440px] ${gradientFrameClass("teal")}`}>
      <div className="rounded-[19px] bg-white p-[16px] text-left sm:p-[22px]">
        <p className="text-sm text-[#141B2E]">{t(`landing.employer.hiringStats.${page}.title`)}</p>
        <p className="mt-[2px] text-xs leading-[19px] text-[#4B5468]">
          {t(`landing.employer.hiringStats.${page}.subtitle`)}
        </p>

        <div className="mt-[14px] flex flex-col gap-[10px]">
          {page === "hiring" &&
            companies.map((company) => (
              <Row
                key={company.companyName}
                logoUrl={company.logoUrl}
                title={company.companyName}
                db={{ title: "organization.legalName", subtitle: "organization.industryId", pill: "job.activeCount" }}
                subtitle={`${company.industry} · ${company.location}`}
                pill={
                  company.activeCount > 0
                    ? t("landing.employer.hiringStats.liveRoles", { count: company.activeCount })
                    : t("landing.employer.hiringStats.gettingStarted")
                }
              />
            ))}

          {page === "posted" &&
            postings.map((posting) => (
              <Row
                key={posting.id}
                logoUrl={posting.companyLogoUrl}
                title={posting.title}
                db={{ title: "job.title", subtitle: "organization.legalName", pill: "job.createdAt" }}
                subtitle={posting.companyName}
                pill={relativeTimeAgo(posting.createdAt, t)}
              />
            ))}

          {page === "activity" &&
            activity.map((item) => (
              <Row
                key={item.id}
                logoUrl={item.companyLogoUrl}
                title={item.companyName}
                db={{ title: "organization.legalName", subtitle: "application.status", pill: "application.updatedAt" }}
                subtitle={t(
                  item.status === "interview"
                    ? "landing.employer.hiringStats.interviewingFor"
                    : "landing.employer.hiringStats.shortlistedFor",
                  { jobTitle: item.jobTitle },
                )}
                pill={relativeTimeAgo(item.updatedAt, t)}
              />
            ))}
        </div>

        {/* Which page is showing — the rotation itself is automatic. */}
        <div aria-hidden className="mt-[14px] flex items-center justify-center gap-[6px]">
          {PAGE_ORDER.map((tab) => (
            <span
              key={tab}
              className={`h-[6px] rounded-full transition-all ${
                page === tab ? "w-[18px] bg-brand-teal-dark" : "w-[6px] bg-black/[0.12]"
              }`}
            />
          ))}
        </div>

        <button
          type="button"
          data-db="action.signUpEmployer"
          onClick={showComingSoon}
          className="mt-[16px] flex h-[38px] w-full items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90"
        >
          {t("landing.employer.hiringStats.joinList")}
        </button>
      </div>
    </div>
  );
}
