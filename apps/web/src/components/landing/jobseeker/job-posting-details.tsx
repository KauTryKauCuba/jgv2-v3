import { useTranslation } from "react-i18next";
import type { JobPosting } from "@/data/landing/sample-job-postings";
import { formatSalary, isRemoteOnly, locationLabel } from "@/lib/landing/job-format";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { relativeTimeAgo } from "@/lib/landing/relative-time";

const K = "landing.jobs";

function PlaceholderLogo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="7" width="14" height="9" rx="1.6" />
      <path d="M7 7V5.6C7 4.72 7.72 4 8.6 4h2.8c.88 0 1.6.72 1.6 1.6V7" />
    </svg>
  );
}

// Decorative icons for the card's footer row (the landing page's cards don't act on them).
function EyeOffIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M2 2l12 12" strokeLinecap="round" />
      <path d="M7 3.3A6.8 6.8 0 0 1 8 3.2c3.4 0 6.2 2.4 7 4.8-.3.9-.9 1.9-1.7 2.7M4.6 4.7C3.1 5.6 1.9 7 1 8c.9 2.6 3.8 4.8 7 4.8.9 0 1.8-.2 2.5-.5" strokeLinecap="round" />
      <path d="M6.6 6.6a2 2 0 0 0 2.8 2.8" strokeLinecap="round" />
    </svg>
  );
}

function BookmarkIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M4 2.6c0-.55.45-1 1-1h6c.55 0 1 .45 1 1v10.8l-4-2.6-4 2.6V2.6Z" strokeLinejoin="round" />
    </svg>
  );
}

export function CompanyLogo({ url, className = "" }: { url: string | null; className?: string }) {
  if (!url) return <PlaceholderLogo className={className} />;
  return <img src={url} alt="" className={`${className} object-contain`} />;
}

/** The browse card in the job list. */
export function PostingCard({
  posting,
  selected = false,
  onClick,
}: {
  posting: JobPosting;
  selected?: boolean;
  onClick?: () => void;
}) {
  const { t } = useTranslation("common");
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={`h-full w-full text-left ${gradientFrameClass("gold")} ${
        selected ? "ring-1 ring-inset ring-brand-gold-dark" : ""
      }`}
    >
      <div className="flex h-full flex-col gap-[12px] rounded-[19px] bg-white p-[16px]">
        <div className="flex items-start justify-between gap-[10px]">
          <div className="min-w-0">
            <p data-db="job.title" className="truncate text-sm text-[#141B2E]">{posting.title}</p>
            <p data-db="organization.legalName" className="mt-[2px] truncate text-xs text-[#4B5468]">{posting.company}</p>
            <span className="mt-[8px] inline-flex items-center rounded-full bg-[#E3F9E5] px-[10px] py-[3px] text-xs text-[#1F7A3F]">
              {t(`${K}.newToYou`)}
            </span>
          </div>
          <div data-db="organization.companyLogo" className="flex h-[68px] w-[68px] shrink-0 items-center justify-center">
            <CompanyLogo url={posting.logoUrl} className="h-[54px] w-[68px]" />
          </div>
        </div>

        <div className="flex flex-col gap-[2px] text-xs text-[#141B2E]">
          <div className="flex items-center justify-between gap-[8px]">
            <span data-db="job.cityId">{locationLabel(posting.location, t)}</span>
            <span data-db="job.employmentType">{t(`${K}.employmentType.${posting.employmentType}`)}</span>
          </div>
          <span data-db="job.salary">{formatSalary(posting, t)}</span>
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-black/[0.06] pt-[10px]">
          <span data-db="job.createdAt" className="text-xs text-[#9AA3B2]">{relativeTimeAgo(posting.postedAt, t)}</span>
          <div className="flex items-center gap-[10px] text-[#9AA3B2]">
            <EyeOffIcon className="h-[15px] w-[15px]" />
            <BookmarkIcon className="h-[15px] w-[15px]" />
          </div>
        </div>
      </div>
    </Wrapper>
  );
}

function Chip({ children, db }: { children: React.ReactNode; db?: string }) {
  return <span data-db={db} className="rounded-full bg-[#F1F4F8] px-[10px] py-[4px] text-[#4B5468]">{children}</span>;
}

/**
 * The full posting panel beside the job list: header, chips, description,
 * responsibilities, skills, languages and location. Actions are the caller's.
 */
export function JobPostingDetails({ posting }: { posting: JobPosting }) {
  const { t } = useTranslation("common");
  // A remote role with no office address has no map, and no second "Remote"
  // chip next to the work arrangement one.
  const remoteOnly = isRemoteOnly(posting);
  const responsibilities = posting.responsibilities
    .split("·")
    .map((item) => item.trim())
    .filter(Boolean);

  return (
    <>
      <div className="flex items-start justify-between gap-[16px]">
        <div>
          <p data-db="job.title" className="text-lg text-[#141B2E]">{posting.title}</p>
          <p data-db="organization.legalName" className="mt-[4px] text-sm text-[#4B5468]">{posting.company}</p>
        </div>
        <div data-db="organization.companyLogo" className="flex h-[56px] w-[56px] shrink-0 items-center justify-center">
          <CompanyLogo url={posting.logoUrl} className="h-[44px] w-[56px]" />
        </div>
      </div>

      <div className="mt-[16px] flex flex-wrap items-center gap-[8px] text-xs">
        <Chip db="job.industryId">{posting.industry}</Chip>
        {!remoteOnly && <Chip db="job.cityId">{posting.location}</Chip>}
        <Chip db="job.employmentType">{t(`${K}.employmentType.${posting.employmentType}`)}</Chip>
        <Chip db="job.work_arrangement">{t(`${K}.workArrangement.${posting.workArrangement}`)}</Chip>
        <Chip db="job.salary">{formatSalary(posting, t)}</Chip>
        <Chip db="job.openings">{t(`${K}.openings`, { count: posting.openings })}</Chip>
        <span data-db="job.createdAt" className="text-[#9AA3B2]">{t(`${K}.posted`, { ago: relativeTimeAgo(posting.postedAt, t) })}</span>
      </div>

      <p data-db="job.description" className="mt-[20px] text-sm leading-[22px] text-[#4B5468]">{posting.description}</p>

      <div className="mt-[20px]">
        <p className="text-xs text-[#141B2E]">{t(`${K}.jobDescription`)}</p>
        <ul data-db="job.responsibilities" className="mt-[6px] list-disc pl-[20px] text-sm leading-[22px] text-[#4B5468]">
          {responsibilities.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      {posting.skills.length > 0 && (
        <div className="mt-[20px]">
          <p className="text-xs text-[#141B2E]">{t(`${K}.skillsRequired`)}</p>
          <div data-db="job.skills" className="mt-[8px] flex flex-wrap gap-[6px]">
            {posting.skills.map((skill) => (
              <span key={skill} className="rounded-full bg-brand-gold px-[12px] py-[6px] text-xs text-[#141B2E]">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {posting.softSkills.length > 0 && (
        <div className="mt-[16px]">
          <p className="text-xs text-[#141B2E]">{t(`${K}.softSkills`)}</p>
          <div data-db="job.softSkills" className="mt-[8px] flex flex-wrap gap-[6px]">
            {posting.softSkills.map((skill) => (
              <span key={skill} className="rounded-full bg-[#F1F4F8] px-[12px] py-[6px] text-xs text-[#141B2E]">
                {skill}
              </span>
            ))}
          </div>
        </div>
      )}

      {posting.languages.length > 0 && (
        <div className="mt-[16px]">
          <p className="text-xs text-[#141B2E]">{t(`${K}.languages`)}</p>
          <div data-db="job.languages" className="mt-[8px] flex flex-wrap gap-[6px]">
            {posting.languages.map((l) => (
              <span
                key={`${l.language}|${l.dialect ?? ""}`}
                className="rounded-full bg-[#F1F4F8] px-[12px] py-[6px] text-xs text-[#141B2E]"
              >
                {l.dialect ? `${l.language} (${l.dialect})` : l.language} · {t(`${K}.languageLevel.${l.level}`)}
              </span>
            ))}
          </div>
        </div>
      )}

      {posting.workAuthorizations.length > 0 && (
        <div className="mt-[16px]">
          <p className="text-xs text-[#141B2E]">{t(`${K}.workAuthorization`)}</p>
          <p data-db="job.work_eligibility" className="mt-[2px] text-sm text-[#4B5468]">
            {posting.workAuthorizations.map((w) => t(`${K}.workAuthorizationType.${w}`)).join(", ")}
          </p>
        </div>
      )}

      <div className="mt-[16px]">
        <p className="text-xs text-[#141B2E]">{t(`${K}.location`)}</p>
        <p data-db="job.cityId" className="mt-[2px] text-sm text-[#4B5468]">{remoteOnly ? t(`${K}.remoteAnywhere`) : posting.location}</p>
        {!remoteOnly && (
          <iframe
            title={t(`${K}.mapFor`, { location: posting.location })}
            src={`https://www.google.com/maps?q=${encodeURIComponent(`${posting.location}, Malaysia`)}&output=embed`}
            loading="lazy"
            className="mt-[8px] h-[160px] w-full rounded-[12px] border border-black/[0.08]"
          />
        )}
      </div>
    </>
  );
}
