import type { CriteriaFlags, MatchComponent } from "@jobgiga-app/api/shared/matching";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CheckIcon, TrendUpIcon, XIcon } from "@/components/landing/icons";
import { orpc, queryClient } from "@/utils/orpc";
import { MatchSettingsPanel } from "./match-settings-panel";

const BREAKDOWN_KEYS: MatchComponent[] = [
  "skills",
  "softSkills",
  "niceToHaveSkills",
  "experience",
  "industry",
  "workArrangement",
  "employmentType",
];

function matchBand(score: number): { key: "strong" | "good" | "possible"; bg: string; text: string } {
  if (score >= 80) return { key: "strong", bg: "bg-[#E7F6EC]", text: "text-[#2F9E56]" };
  if (score >= 60) return { key: "good", bg: "bg-brand-teal-soft", text: "text-brand-teal-dark" };
  return { key: "possible", bg: "bg-[#F1F4F8]", text: "text-[#4B5468]" };
}

/**
 * The redesign's TopMatchesCard: every active applicant ranked by how well
 * they fit the job they applied for (employer.topMatches), one job at a
 * time, with the Smart Match switch, the score breakdown and the match
 * settings. Owners and admins change the settings; others just see the list.
 */
export function TopMatchesCard({
  initialEnabled,
  initialCriteria,
  canEditSettings = true,
}: {
  initialEnabled: boolean;
  initialCriteria: CriteriaFlags;
  canEditSettings?: boolean;
}) {
  const { t } = useTranslation("common");
  const [smartMatchOn, setSmartMatchOn] = useState(initialEnabled);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [criteria, setCriteria] = useState(initialCriteria);
  const [selectedPostingId, setSelectedPostingId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  // Off by default: Top Matches ranks by job fit; people who failed this
  // job's screening only show when asked for.
  const [includeScreeningFails, setIncludeScreeningFails] = useState(false);

  const matchesQuery = useQuery({
    ...orpc.employer.topMatches.queryOptions(),
    enabled: smartMatchOn,
    meta: { suppressErrorToast: true },
  });
  const saveSettings = useMutation({
    ...orpc.employer.updateSmartMatchSettings.mutationOptions(),
    meta: { suppressErrorToast: true },
  });
  const results = matchesQuery.data?.results;

  function toggleSmartMatch() {
    const next = !smartMatchOn;
    setSmartMatchOn(next);
    saveSettings.mutate({ enabled: next });
  }

  function handleCriteriaChange(next: CriteriaFlags) {
    setCriteria(next);
    queryClient.invalidateQueries({ queryKey: orpc.employer.topMatches.key() });
  }

  const postings = useMemo(() => {
    const seen = new Map<
      string,
      { jobPostingId: string; jobPostingTitle: string; jobPostingLocation: string; jobPostingEmploymentType: string; applicantCount: number }
    >();
    for (const r of results ?? []) {
      const existing = seen.get(r.jobPostingId);
      if (existing) existing.applicantCount += 1;
      else
        seen.set(r.jobPostingId, {
          jobPostingId: r.jobPostingId,
          jobPostingTitle: r.jobPostingTitle,
          jobPostingLocation: r.jobPostingLocation,
          jobPostingEmploymentType: r.jobPostingEmploymentType,
          applicantCount: 1,
        });
    }
    return Array.from(seen.values());
  }, [results]);

  // No picker when there's only one job to choose from.
  const effectivePostingId = selectedPostingId ?? (postings.length === 1 ? postings[0]!.jobPostingId : null);
  const rankedAll = (results ?? [])
    .filter((r) => r.jobPostingId === effectivePostingId && (includeScreeningFails || r.eligible))
    .sort((a, b) => b.score - a.score);
  const ranked = showAll ? rankedAll : rankedAll.slice(0, 5);

  return (
    <div className="flex flex-col gap-[14px]">
      <div className="flex items-start justify-between gap-[8px]">
        <div>
          <p className="text-sm text-[#141B2E]">{t("dashboard.matches.title")}</p>
          <p className="mt-[2px] text-xs text-[#9AA3B2]">
            {smartMatchOn
              ? t("dashboard.matches.onHint")
              : canEditSettings
                ? t("dashboard.matches.offHintManager")
                : t("dashboard.matches.offHint")}
          </p>
        </div>
        {canEditSettings && (
          <button
            type="button"
            role="switch"
            aria-checked={smartMatchOn}
            aria-label={t("dashboard.matches.toggle")}
            onClick={toggleSmartMatch}
            className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors ${
              smartMatchOn ? "bg-brand-teal-dark" : "bg-black/[0.15]"
            }`}
          >
            <span
              className={`absolute top-[2px] left-[2px] h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform ${
                smartMatchOn ? "translate-x-[16px]" : "translate-x-0"
              }`}
            />
          </button>
        )}
      </div>

      {!smartMatchOn ? (
        <div className="flex flex-col items-center gap-[8px] rounded-[14px] bg-[#F8FAFB] p-[20px] text-center">
          <TrendUpIcon className="h-[18px] w-[18px] text-[#9AA3B2]" />
          <p className="text-xs text-[#4B5468]">
            {canEditSettings ? t("dashboard.matches.offBodyManager") : t("dashboard.matches.offBody")}
          </p>
        </div>
      ) : matchesQuery.isPending ? (
        <p className="rounded-[14px] bg-[#F8FAFB] p-[16px] text-center text-xs text-[#9AA3B2]">{t("dashboard.matches.scoring")}</p>
      ) : matchesQuery.isError ? (
        <p className="rounded-[14px] bg-[#FEF2F2] p-[16px] text-center text-xs text-red-600">{t("dashboard.matches.loadError")}</p>
      ) : postings.length === 0 ? (
        <p className="rounded-[14px] bg-[#F8FAFB] p-[16px] text-center text-xs text-[#9AA3B2]">{t("dashboard.matches.noApplicants")}</p>
      ) : effectivePostingId === null ? (
        <div className="flex flex-col gap-[8px]">
          <p className="text-xs text-[#141B2E]">{t("dashboard.matches.choosePosting")}</p>
          {postings.map((posting) => (
            <button
              key={posting.jobPostingId}
              type="button"
              onClick={() => {
                setSelectedPostingId(posting.jobPostingId);
                setShowAll(false);
              }}
              className="flex items-center justify-between gap-[8px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px] text-left hover:border-brand-teal-dark"
            >
              <span>
                <span className="block text-xs text-[#141B2E]">{posting.jobPostingTitle}</span>
                <span className="mt-[2px] block text-xs text-[#9AA3B2]">
                  {posting.jobPostingLocation || t("dashboard.locationNotSet")} ·{" "}
                  {t(`dashboard.employmentTypes.${posting.jobPostingEmploymentType}`, {
                    defaultValue: posting.jobPostingEmploymentType,
                  })}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-white px-[9px] py-[3px] text-xs text-[#4B5468] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                {t("dashboard.matches.applicantCount", { count: posting.applicantCount })}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <>
          {postings.length > 1 && (
            <button
              type="button"
              onClick={() => setSelectedPostingId(null)}
              className="self-start text-left text-sm text-brand-teal-dark hover:underline"
            >
              {t("dashboard.matches.changePosting")}
            </button>
          )}

          <div className="flex items-center gap-[12px]">
            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              className="text-left text-sm text-brand-teal-dark hover:underline"
            >
              {showBreakdown ? t("dashboard.matches.hideBreakdown") : t("dashboard.matches.showBreakdown")}
            </button>
            {canEditSettings && (
              <button
                type="button"
                onClick={() => setShowSettings((v) => !v)}
                className="text-left text-sm text-brand-teal-dark hover:underline"
              >
                {showSettings ? t("dashboard.matches.hideSettings") : t("dashboard.matches.settingsTitle")}
              </button>
            )}
          </div>

          {canEditSettings && showSettings && <MatchSettingsPanel criteria={criteria} onChange={handleCriteriaChange} />}

          <label className="flex items-center gap-[8px] text-xs text-[#4B5468]">
            <button
              type="button"
              role="switch"
              aria-checked={includeScreeningFails}
              aria-label={t("dashboard.matches.includeFails")}
              onClick={() => setIncludeScreeningFails((v) => !v)}
              className={`relative h-[18px] w-[32px] shrink-0 rounded-full transition-colors ${
                includeScreeningFails ? "bg-brand-teal-dark" : "bg-black/[0.15]"
              }`}
            >
              <span
                className={`absolute top-[2px] left-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform ${
                  includeScreeningFails ? "translate-x-[14px]" : "translate-x-0"
                }`}
              />
            </button>
            {t("dashboard.matches.includeFails")}
          </label>

          {showBreakdown && (
            <div className="flex flex-col gap-[4px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px] text-xs text-[#4B5468]">
              <p>{t("dashboard.matches.weights")}</p>
              <p className="text-[#9AA3B2]">{t("dashboard.matches.weightsNote")}</p>
            </div>
          )}

          {ranked.length === 0 ? (
            <p className="rounded-[14px] bg-[#F8FAFB] p-[16px] text-center text-xs text-[#9AA3B2]">{t("dashboard.matches.noEligible")}</p>
          ) : (
            <div className="flex flex-col gap-[8px]">
              {ranked.map((result, index) => {
                const band = matchBand(result.score);
                return (
                  <div key={result.applicationId} className="flex flex-col gap-[8px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]">
                    <div className="flex items-start gap-[8px]">
                      <span className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full bg-white text-xs text-[#4B5468] shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                        {index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-[18px] text-[#141B2E]">{result.applicantName}</p>
                        <p className="mt-[1px] text-xs leading-[15px] text-[#9AA3B2]">
                          {t("dashboard.matches.appliedFor", { title: result.jobPostingTitle })}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-[6px]">
                      <span className={`self-start rounded-full px-[9px] py-[3px] text-xs ${band.bg} ${band.text}`}>
                        {result.score}% · {t(`dashboard.matches.bands.${band.key}`)}
                      </span>
                      {!result.eligible && (
                        <span
                          className="self-start rounded-full bg-[#FDEDE8] px-[9px] py-[3px] text-xs text-[#C2410C]"
                          title={result.ineligibleReasons.join("; ") || t("dashboard.matches.doesntMeet")}
                        >
                          {t("dashboard.matches.failedScreening")}
                        </span>
                      )}
                    </div>

                    {showBreakdown && (
                      <div className="flex flex-wrap items-center gap-[8px] text-xs text-[#4B5468]">
                        {BREAKDOWN_KEYS.map((key) => {
                          const value = result.breakdown[key];
                          if (value === null) return null;
                          return (
                            <span key={key} className="flex items-center gap-[3px]">
                              {value >= 0.5 ? (
                                <CheckIcon className="h-[9px] w-[9px] text-[#2F9E56]" />
                              ) : (
                                <XIcon className="h-[9px] w-[9px] text-red-400" />
                              )}
                              {t(`dashboard.matches.criteria.${key}`)}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {!showAll && rankedAll.length > 5 && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="self-start text-left text-sm text-brand-teal-dark hover:underline"
                >
                  {t("dashboard.matches.showAll", { count: rankedAll.length })}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
