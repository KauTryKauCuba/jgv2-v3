import { useTranslation } from "react-i18next";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import { CompanyHighlights, type HighlightCompany } from "@/components/landing/employer/company-highlights";
import { Footer } from "@/components/landing/footer";
import { Navbar } from "@/components/landing/navbar";
import { listCompanies } from "@/data/companies/sample-companies";
import { CompanyDirectoryView } from "./company-directory-view";

/**
 * Find companies (/companies), from the redesign: the employer page's company
 * row as a showcase, then the full directory sliding up over it on scroll.
 * Shown on the employer side (teal) for now.
 * TODO(auth): use the signed-in person's side, like the redesign.
 * TODO(api): companies from oRPC instead of the sample list.
 */
export function CompaniesPageView() {
  const { t } = useTranslation("common");
  const companies = listCompanies();
  // Like the redesign's getEmployersWithPostings(6): companies with postings,
  // most open roles first, ahead of the curated showcase companies.
  const highlightCompanies: HighlightCompany[] = companies
    .filter((c) => c.jobs.length > 0)
    .sort((a, b) => b.jobs.length - a.jobs.length)
    .slice(0, 6)
    .map((c) => ({
      companyName: c.companyName,
      industry: c.industry,
      location: c.location,
      logoUrl: c.logoUrl,
      activeCount: c.jobs.length,
      totalCount: c.jobs.length,
    }));

  return (
    <main className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-teal-page pb-[92px]">
      <Navbar pageRole="employer" />
      <div className="shell pt-[clamp(2px,calc(9vh-46px),50px)]">
        <CompanyHighlights variant="page" accent="employer" realCompanies={highlightCompanies} />
        {/* Above the showcase row, on the page's own background, so its cards
            tuck in behind this whole section as the page scrolls. */}
        <div className="relative z-[2] bg-brand-teal-page pt-[32px]">
          {/* Soft top edge, so the cards fade out as they slide under. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-[48px] h-[48px] bg-gradient-to-b from-transparent to-brand-teal-page"
          />
          <h1 className="font-sans text-xl font-semibold text-[#141B2E]" style={{ lineHeight: 1.15, letterSpacing: "-0.02em" }}>
            {t("companies.directory.title")}
          </h1>
          <p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">{t("companies.directory.intro")}</p>
          <div className="mt-[24px]">
            <CompanyDirectoryView companies={companies} />
          </div>
        </div>
      </div>
      <div className="flex-1" />
      <div className="mt-[48px]">
        <Footer accent="teal" />
      </div>
      <div className="-mb-[92px] h-[80px] overflow-hidden sm:h-[110px] lg:h-[150px]">
        <AnimatedRibbon accent="teal" />
      </div>
    </main>
  );
}
