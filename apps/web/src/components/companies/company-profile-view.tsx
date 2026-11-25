import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import { Footer } from "@/components/landing/footer";
import { CheckIcon, StarIcon, UserIcon } from "@/components/landing/icons";
import { Navbar } from "@/components/landing/navbar";
import type { Company } from "@/data/companies/sample-companies";
import { earnedBadges } from "@/lib/companies/badges";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { formatSalary } from "@/lib/landing/job-format";
import { BadgeMedal } from "./badge-medal";
import { CompanyBanner } from "./company-banner";
import { CompanyLogo } from "./company-logo";
import { ResponsivenessBadge } from "./responsiveness-badge";

function externalHref(url: string) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/** "2026-03" → "March 2026", in the reader's language. */
function formatMonth(month: string, language: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(language, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year ?? 1970, (monthNumber ?? 1) - 1, 1)),
  );
}

const sectionTitle = "text-sm font-semibold text-[#141B2E]";

/**
 * A company's public page (/companies/$companyId), from the redesign: its
 * details, badges and open roles, with contact details and leadership in a
 * side column. Shown on the employer side (teal) for now.
 * TODO(auth): use the signed-in person's side, and link a job seeker straight
 * to each job instead of to sign-in.
 */
export function CompanyProfileView({ company }: { company: Company }) {
  const { t, i18n } = useTranslation("common");
  const language = i18n.resolvedLanguage ?? "en";
  const accentText = "text-brand-teal-dark";
  const badges = earnedBadges(company.badgeKeys);
  const industryDetail =
    company.industryDetail?.trim() && company.industryDetail.trim().toLowerCase() !== company.industry.toLowerCase()
      ? company.industryDetail.trim()
      : null;
  const facts: { db: string; text: string }[] = [
    { db: "organization.industryId", text: company.industry },
    ...(industryDetail ? [{ db: "organization.industryId", text: industryDetail }] : []),
    { db: "organization.location", text: company.location },
    ...(company.companySize ? [{ db: "organization.companySize", text: t("companies.staff", { size: company.companySize }) }] : []),
    ...(company.companyType ? [{ db: "organization.companyType", text: company.companyType }] : []),
    ...(company.foundedYear ? [{ db: "organization.foundedYear", text: t("companies.profile.founded", { year: company.foundedYear }) }] : []),
  ];
  const links = [
    { label: t("companies.profile.website"), url: company.websiteUrl, db: "organization.website" },
    { label: "LinkedIn", url: company.linkedinUrl, db: "organization.linkedinUrl" },
    { label: "Facebook", url: company.facebookUrl, db: "organization.facebookUrl" },
    { label: "Instagram", url: company.instagramUrl, db: "organization.instagramUrl" },
  ].filter((link): link is { label: string; url: string; db: string } => !!link.url?.trim());
  const addresses = company.addresses;

  return (
    <main className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-teal-page pb-[92px]">
      <Navbar pageRole="employer" />
      <div className="shell pt-[24px]">
        <Link to="/companies" className={`text-sm hover:underline ${accentText}`}>
          {t("companies.profile.back")}
        </Link>

        <div className="mt-[16px] grid grid-cols-1 items-start gap-[20px] lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-[20px]">
            <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
              <div className="overflow-hidden rounded-[19px] bg-white">
                <div className="aspect-[3/1] w-full" data-db="organization.companyBannerId">
                  <CompanyBanner url={company.bannerUrl} eager />
                </div>
                <div className="p-[16px] pt-0 sm:p-[22px] sm:pt-0">
                  <div className="flex items-end gap-[16px]">
                    <div
                      data-db="organization.companyLogo"
                      className="-mt-[36px] shrink-0 rounded-[18px] bg-white p-[4px] shadow-[0_2px_6px_rgba(0,0,0,0.12)]"
                    >
                      <CompanyLogo url={company.logoUrl} size={72} verified={company.ssmVerified} />
                    </div>
                    <div className="min-w-0 pt-[12px]">
                      <h1
                        data-db="organization.legalName"
                        className="text-xl font-semibold text-[#141B2E]"
                        style={{ lineHeight: 1.15, letterSpacing: "-0.02em" }}
                      >
                        {company.companyName}
                      </h1>
                      <div className="mt-[8px] flex flex-wrap gap-[6px]">
                        {facts.map((fact) => (
                          <span key={fact.text} data-db={fact.db} className="rounded-full bg-[#F1F4F8] px-[9px] py-[3px] text-xs text-[#4B5468]">
                            {fact.text}
                          </span>
                        ))}
                      </div>
                      <div className="mt-[8px] flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
                        <span data-db="company.responsiveness" className="inline-flex">
                          <ResponsivenessBadge responsiveness={company.responsiveness} />
                        </span>
                        {company.contactVerified && (
                          <span
                            data-db="company.contactVerified"
                            title={t("companies.profile.verifiedContactTitle")}
                            className="inline-flex items-center gap-[5px] rounded-full bg-[#E8F7EE] px-[9px] py-[3px] text-xs text-[#2F9E56]"
                          >
                            <CheckIcon className="h-[8px] w-[8px]" />
                            {t("companies.profile.verifiedContact")}
                          </span>
                        )}
                        <p data-db="organization.createdAt" className="text-xs text-[#9AA3B2]">
                          {t("companies.profile.since", { date: formatMonth(company.joinedAt, language) })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {badges.length > 0 && (
                    <div className="mt-[18px] border-t border-black/[0.06] pt-[16px]" data-db="company.badges">
                      <p className={sectionTitle}>{t("companies.profile.badges")}</p>
                      <p className="mt-[2px] text-xs text-[#9AA3B2]">
                        {t("companies.profile.badgesSubtitle", { company: company.companyName })}
                      </p>
                      <div className="mt-[12px] flex flex-wrap gap-[14px]">
                        {badges.map((badge) => (
                          <div
                            key={badge.key}
                            title={t(`companies.badges.${badge.key}.description`)}
                            className="flex w-[72px] flex-col items-center gap-[4px]"
                          >
                            <div className="w-[64px]">
                              <BadgeMedal badge={badge} />
                            </div>
                            <span className="text-center text-[11px] leading-[14px] text-[#4B5468]">
                              {t(`companies.badges.${badge.key}.label`)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {company.description.length > 0 && (
                    <div className="mt-[18px] border-t border-black/[0.06] pt-[16px]" data-db="organization.description">
                      <p className={sectionTitle}>{t("companies.profile.about")}</p>
                      {company.description.map((paragraph) => (
                        <p key={paragraph} className="mt-[6px] text-sm leading-[21px] text-[#4B5468]">
                          {paragraph}
                        </p>
                      ))}
                    </div>
                  )}

                  {company.benefits.length > 0 && (
                    <div className="mt-[16px]" data-db="organization.benefits">
                      <p className={sectionTitle}>{t("companies.profile.benefits")}</p>
                      <div className="mt-[8px] flex flex-wrap gap-[6px]">
                        {company.benefits.map((benefit) => (
                          <span key={benefit} className="rounded-full bg-[#E7F6EC] px-[10px] py-[3px] text-xs text-[#2F7D4F]">
                            {benefit}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(company.facilities.length > 0 || company.dressCode) && (
                    <div className="mt-[16px]">
                      <p className={sectionTitle}>{t("companies.profile.workplace")}</p>
                      <div className="mt-[8px] flex flex-wrap gap-[6px]">
                        {company.dressCode && (
                          <span data-db="organization.dressCode" className="rounded-full bg-[#F1ECFB] px-[10px] py-[3px] text-xs text-[#7C5CD1]">
                            {t("companies.profile.dressCode", { value: company.dressCode })}
                          </span>
                        )}
                        {company.facilities.map((facility) => (
                          <span
                            key={facility}
                            data-db="organization.facilities"
                            className="rounded-full bg-brand-teal-soft px-[10px] py-[3px] text-xs text-brand-teal-dark"
                          >
                            {facility}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {company.awards.length > 0 && (
                    <div className="mt-[16px]" data-db="organization.awards">
                      <p className={sectionTitle}>{t("companies.profile.awards")}</p>
                      <div className="mt-[8px] flex flex-col gap-[6px]">
                        {company.awards.map((award) => (
                          <div
                            key={`${award.title}-${award.year ?? ""}`}
                            className="flex items-center gap-[10px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] px-[14px] py-[10px]"
                          >
                            <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-brand-gold-soft text-brand-gold-dark">
                              <StarIcon className="h-[13px] w-[13px]" />
                            </span>
                            <span className="min-w-0 flex-1 text-sm text-[#141B2E]">{award.title}</span>
                            {award.year && <span className="shrink-0 text-xs text-[#9AA3B2]">{award.year}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {addresses.length > 0 && (
                    <div className="mt-[16px]" data-db="organization.addresses">
                      <p className={sectionTitle}>
                        {addresses.length === 1 ? t("companies.profile.office") : t("companies.profile.offices", { count: addresses.length })}
                      </p>
                      <div className={`mt-[8px] grid grid-cols-1 gap-[8px] ${addresses.length > 1 ? "sm:grid-cols-2" : ""}`}>
                        {addresses.map((address) => {
                          const full = [address.addressLine1, address.addressLine2, address.area, `${address.postcode} ${address.city}`, address.state]
                            .map((part) => part?.trim())
                            .filter(Boolean)
                            .join(", ");
                          // Company name + address: Google drops a pin on the business when it
                          // knows it, and falls back to the address when it doesn't.
                          const query = encodeURIComponent(`${company.companyName}, ${full}`);
                          return (
                            <div key={address.id} className="min-w-0 overflow-hidden rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB]">
                              <iframe
                                title={t("companies.profile.mapTitle", { company: company.companyName, label: address.label })}
                                src={`https://maps.google.com/maps?q=${query}&z=16&output=embed`}
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                                className={`block w-full border-0 ${addresses.length > 1 ? "h-[180px]" : "h-[240px]"}`}
                              />
                              <div className="px-[14px] py-[10px]">
                                <p className="text-xs text-[#9AA3B2]">{address.label}</p>
                                <p className="mt-[2px] text-sm leading-[20px] text-[#4B5468]">{full}</p>
                                <a
                                  href={`https://www.google.com/maps/search/?api=1&query=${query}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className={`mt-[2px] inline-block text-xs hover:underline ${accentText}`}
                                >
                                  {t("companies.profile.openInMaps")}
                                </a>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "60ms" }}>
              <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
                <div className="flex items-center gap-[8px]">
                  <p className={sectionTitle}>{t("companies.profile.openRoles")}</p>
                  <span data-db="job.activeCount" className="rounded-full bg-[#E7F6EC] px-[9px] py-[2px] text-xs text-[#2F9E56]">
                    {company.jobs.length}
                  </span>
                </div>
                {company.jobs.length === 0 ? (
                  <p className="mt-[12px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-sm text-[#9AA3B2]">
                    {t("companies.profile.notHiring", { company: company.companyName })}
                  </p>
                ) : (
                  <div className="mt-[12px] flex flex-col gap-[8px]">
                    {company.jobs.map((job) => (
                      // The job page needs sign-in, so everyone goes to the job seeker page first.
                      <Link
                        key={job.id}
                        to="/jobseeker"
                        hash="job-search"
                        data-db="action.apply"
                        className="group flex flex-col gap-[4px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px] transition-colors hover:border-black/[0.15] hover:bg-white sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-[#141B2E] group-hover:underline">{job.title}</p>
                          <p className="mt-[2px] truncate text-xs text-[#9AA3B2]">
                            {[
                              job.location,
                              t(`landing.jobs.employmentType.${job.employmentType}`),
                              t(`landing.jobs.workArrangement.${job.workArrangement}`),
                            ].join(" · ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-[10px]">
                          {job.showSalary && <span className="text-xs text-[#4B5468]">{formatSalary(job, t)}</span>}
                          <span className={`text-xs ${accentText}`}>{t("companies.profile.signInToApply")}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 300px side column; stacks below the main column on smaller screens. */}
          <div className="flex w-full max-w-[300px] flex-col gap-[20px] lg:sticky lg:top-[24px]">
            {(company.email || links.length > 0) && (
              <div className={gradientFrameClass("teal")}>
                <div className="flex flex-col gap-[8px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
                  <p className={sectionTitle}>{t("companies.profile.getInTouch")}</p>
                  {company.email && (
                    <div className="min-w-0 border-b border-black/[0.06] pb-[10px]" data-db="organization.email">
                      <p className="text-xs text-[#9AA3B2]">{t("companies.profile.email")}</p>
                      <a href={`mailto:${company.email}`} className={`block truncate text-sm hover:underline ${accentText}`}>
                        {company.email}
                      </a>
                    </div>
                  )}
                  {links.map((link) => (
                    <a
                      key={link.label}
                      href={externalHref(link.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-db={link.db}
                      className={`truncate text-sm hover:underline ${accentText}`}
                    >
                      {link.label} ↗
                    </a>
                  ))}
                </div>
              </div>
            )}
            {company.leaders.length > 0 && (
              <div className={gradientFrameClass("teal")} data-db="organization.leaders">
                <div className="flex flex-col gap-[10px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
                  <p className={sectionTitle}>{t("companies.profile.leadership")}</p>
                  {company.leaders.map((leader) => (
                    <div
                      key={`${leader.name}-${leader.title}`}
                      className="flex items-center gap-[12px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]"
                    >
                      <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-[#9AA3B2]">
                        {leader.photoUrl ? (
                          <img src={leader.photoUrl} alt={leader.name} className="h-full w-full object-cover" />
                        ) : (
                          <UserIcon className="h-[18px] w-[18px]" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-[#141B2E]">{leader.name}</span>
                        <span className="block truncate text-xs text-[#9AA3B2]">{leader.title}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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

/** Shown for a company address that doesn't exist. */
export function CompanyNotFoundView() {
  const { t } = useTranslation("common");
  return (
    <main className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-teal-page pb-[92px]">
      <Navbar pageRole="employer" />
      <div className="shell pt-[clamp(24px,9vh,80px)] text-center">
        <h1 className="text-xl font-semibold text-[#141B2E]">{t("companies.notFound.title")}</h1>
        <p className="mt-[8px] text-sm text-[#4B5468]">{t("companies.notFound.body")}</p>
        <Link to="/companies" className="mt-[16px] inline-block text-sm text-brand-teal-dark hover:underline">
          {t("companies.profile.back")}
        </Link>
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
