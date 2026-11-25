import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Dropdown } from "@/components/landing/dropdown";
import { SearchIcon } from "@/components/landing/icons";
import type { Company } from "@/data/companies/sample-companies";
import { type CuratedCompany, curatedFill } from "@/data/landing/curated-companies";
import { type BadgeKey, earnedBadges } from "@/lib/companies/badges";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { BadgeMedal } from "./badge-medal";
import { CompanyBanner } from "./company-banner";
import { CompanyLogo } from "./company-logo";

/** One directory card: a company with a page, or a curated showcase company filling in (no page). */
interface DirectoryEntry {
  id: string;
  companyName: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  industry: string;
  companySize: string;
  location: string | null;
  openRoles: number;
  badgeKeys: BadgeKey[];
  ssmVerified: boolean;
  curated: CuratedCompany | null;
}

const ALL = "__all__";
const MAX_CARD_BADGES = 5;

/** The company's earned badges as small medals on the card's banner. */
function CardBadges({ keys }: { keys: BadgeKey[] }) {
  const { t } = useTranslation("common");
  const earned = earnedBadges(keys);
  if (earned.length === 0) return null;
  const shown = earned.slice(0, MAX_CARD_BADGES);
  const extra = earned.length - shown.length;
  return (
    <div
      className="flex items-center gap-[2px] rounded-full bg-white/85 px-[6px] py-[3px] shadow-[0_1px_3px_rgba(0,0,0,0.08)] backdrop-blur-sm"
      aria-label={t("companies.directory.badgesLabel", {
        count: earned.length,
        names: earned.map((b) => t(`companies.badges.${b.key}.label`)).join(", "),
      })}
    >
      {shown.map((badge) => (
        <span key={badge.key} title={t(`companies.badges.${badge.key}.label`)} className="block w-[26px]">
          <BadgeMedal badge={badge} />
        </span>
      ))}
      {extra > 0 && <span className="px-[2px] text-[11px] text-[#4B5468]">+{extra}</span>}
    </div>
  );
}

/**
 * The Find companies directory, from the redesign: search, an industry filter,
 * "Hiring now" and a grid of company cards. Companies with a page come first,
 * then the curated showcase companies fill up to six while there are few.
 */
export function CompanyDirectoryView({ companies }: { companies: Company[] }) {
  const { t } = useTranslation("common");
  const [search, setSearch] = useState("");
  const [industry, setIndustry] = useState(ALL);
  const [hiringOnly, setHiringOnly] = useState(false);
  const term = search.trim().toLowerCase();

  const allCompanies: DirectoryEntry[] = useMemo(
    () => [
      ...companies.map((c) => ({
        id: c.id,
        companyName: c.companyName,
        logoUrl: c.logoUrl,
        bannerUrl: c.bannerUrl,
        industry: c.industry,
        companySize: c.companySize,
        location: c.location,
        openRoles: c.jobs.length,
        badgeKeys: c.badgeKeys,
        ssmVerified: c.ssmVerified,
        curated: null,
      })),
      ...curatedFill(
        companies.length,
        companies.map((c) => c.companyName),
      ).map((c) => ({
        id: `curated-${c.name}`,
        companyName: c.name,
        logoUrl: c.src,
        bannerUrl: c.banner,
        industry: c.industry,
        companySize: c.companySize,
        location: c.location,
        openRoles: c.openRoles,
        badgeKeys: [],
        ssmVerified: false,
        curated: c,
      })),
    ],
    [companies],
  );

  const industryOptions = useMemo(
    () => [
      { value: ALL, label: t("companies.directory.allIndustries") },
      ...[...new Set(allCompanies.map((c) => c.industry).filter(Boolean))]
        .sort()
        .map((name) => ({ value: name, label: name })),
    ],
    [allCompanies, t],
  );

  const filtering = term !== "" || industry !== ALL || hiringOnly;
  const visible = allCompanies.filter((c) => {
    if (hiringOnly && c.openRoles === 0) return false;
    if (industry !== ALL && c.industry !== industry) return false;
    if (!term) return true;
    return [c.companyName, c.industry, c.location].some((v) => v?.toLowerCase().includes(term));
  });
  const hiringCount = allCompanies.filter((c) => c.openRoles > 0).length;

  return (
    <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
      <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <div className="flex flex-col gap-[8px] lg:flex-row lg:items-center">
          <div className="flex flex-1 items-center gap-[8px] rounded-[12px] border border-black/[0.1] px-[12px] focus-within:border-brand-teal-dark">
            <SearchIcon className="h-[13px] w-[13px] shrink-0 text-[#9AA3B2]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("companies.directory.searchPlaceholder")}
              aria-label={t("companies.directory.searchLabel")}
              data-db="search.companies"
              className="h-[38px] w-full bg-transparent text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2]"
            />
          </div>
          <div className="lg:w-[240px]" data-db="organization.industryId">
            <Dropdown
              label={t("companies.directory.industryLabel")}
              value={industry}
              options={industryOptions}
              onChange={setIndustry}
              searchable
            />
          </div>
          <label
            data-db="job.activeCount"
            className="flex h-[38px] shrink-0 cursor-pointer items-center gap-[8px] rounded-[12px] border border-black/[0.1] px-[12px] text-sm text-[#141B2E]"
          >
            <input
              type="checkbox"
              checked={hiringOnly}
              onChange={(e) => setHiringOnly(e.target.checked)}
              className="h-[14px] w-[14px] accent-brand-teal-dark"
            />
            {t("companies.directory.hiringNow")}
            <span className="text-xs text-[#9AA3B2]">({hiringCount})</span>
          </label>
        </div>

        <p className="mt-[16px] text-xs text-[#9AA3B2]">
          {t(filtering ? "companies.directory.summaryFiltered" : "companies.directory.summaryAll", { count: visible.length })}
        </p>

        {visible.length === 0 ? (
          <p className="mt-[10px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-sm text-[#9AA3B2]">
            {t(allCompanies.length === 0 ? "companies.directory.noneYet" : "companies.directory.noMatches")}
          </p>
        ) : (
          <div className="mt-[10px] grid grid-cols-1 gap-[12px] sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((c) => {
              const body = (
                <>
                  {/* Cover banner with the logo overlapping its bottom edge. */}
                  <div className="relative aspect-[3/1] w-full overflow-hidden" data-db="organization.companyBannerId">
                    <CompanyBanner url={c.bannerUrl} />
                    <div className="absolute top-[8px] right-[8px]">
                      <CardBadges keys={c.badgeKeys} />
                    </div>
                  </div>
                  <div className="flex items-end gap-[12px] px-[16px]">
                    <div
                      data-db="organization.companyLogo"
                      className="relative -mt-[34px] shrink-0 rounded-[14px] bg-white p-[3px] shadow-[0_1px_3px_rgba(0,0,0,0.12)]"
                    >
                      <CompanyLogo url={c.logoUrl} size={58} verified={c.ssmVerified} />
                    </div>
                    <div className="min-w-0 pb-[1px]">
                      <p
                        data-db="organization.legalName"
                        className="truncate text-sm font-semibold text-[#141B2E] group-hover:text-brand-teal-dark"
                      >
                        {c.companyName}
                      </p>
                      <p data-db="organization.industryId" className="truncate text-xs text-[#4B5468]">
                        {c.industry}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-[6px] px-[16px] pb-[16px] text-xs">
                    {c.location && (
                      <span data-db="organization.location" className="rounded-full bg-white px-[9px] py-[3px] text-[#4B5468]">
                        {c.location}
                      </span>
                    )}
                    {c.companySize && (
                      <span data-db="organization.companySize" className="rounded-full bg-white px-[9px] py-[3px] text-[#4B5468]">
                        {t("companies.staff", { size: c.companySize })}
                      </span>
                    )}
                    <span
                      data-db="job.activeCount"
                      className={`ml-auto rounded-full px-[9px] py-[3px] ${
                        c.openRoles > 0 ? "bg-[#E7F6EC] text-[#2F9E56]" : "bg-[#F1F4F8] text-[#9AA3B2]"
                      }`}
                    >
                      {c.openRoles > 0
                        ? t("companies.directory.openRoles", { count: c.openRoles })
                        : t("companies.directory.notHiring")}
                    </span>
                  </div>
                </>
              );
              const cardClass = "flex flex-col gap-[12px] overflow-hidden rounded-[16px] border border-[#EAEDF2] bg-[#F8FAFB]";
              // Showcase companies have no JobGiga page to open.
              return c.curated ? (
                <div key={c.id} className={cardClass}>
                  {body}
                </div>
              ) : (
                <Link
                  key={c.id}
                  to="/companies/$companyId"
                  params={{ companyId: c.id }}
                  className={`group ${cardClass} transition-colors hover:border-brand-teal-dark/40 hover:bg-white`}
                >
                  {body}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
