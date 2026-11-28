// The redesign's src/components/EmployerJobPostingView.tsx (a live
// posting's own page, /employer/jobs/<slug>), ported. Same UI and flow:
// the posting as jobseekers see it, its applicants and interviews, the
// analytics card, and the same applicant window as the Applicants page.
// Data from application.postingPage (the redesign's server-loaded props)
// and employer.topMatches; every string goes through t().
//
// Not in v3 yet (left out): the video pitch badge beside an applicant's
// name (VideoPitchBadge).
import { ageFromBirthYear } from "@jobgiga-app/api/shared/age";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApplicantDetailModal } from "@/components/applicants/applicant-detail-modal";
import { ExportApplicantsButton } from "@/components/applicants/export-applicants-button";
import { useApplicantActions, useCurrentEmployer } from "@/components/applicants/use-applicant-actions";
import { EmployerDashboardShell } from "@/components/dashboard/employer-dashboard-shell";
import { CheckIcon, PencilIcon, UserIcon } from "@/components/landing/icons";
import type { ApplicantRow, PostingPageData } from "@/lib/applicants/status";
import { APPLICATION_STATUS_COLOR, relativeTimeAgo, statusLabel } from "@/lib/dashboard/pipeline";
import { formatSalary } from "@/lib/jobs/format";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { orpc, queryClient } from "@/utils/orpc";
import type { HiringManagerOption } from "./employer-jobs-view";
import { type ActivePostingRow, JobPostingDetails, toJobPosting } from "./job-posting-details";

const INTERVIEW_STAGE_STATUSES = ["interview", "interviewed", "evaluation", "evaluated"];

// Funnel order for the analytics card — terminal/parked statuses (kiv,
// rejected, withdrawn) are excluded since they're off the main path and
// would make the funnel non-monotonic.
const FUNNEL_STAGES = ["applied", "screened", "shortlisted", "interview", "interviewed", "evaluation", "evaluated", "offer", "hired"];

function daysBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

const AGE_BANDS = [
  { label: "18-24", min: 18, max: 24, color: "#7C5CD1" },
  { label: "25-34", min: 25, max: 34, color: "#008990" },
  { label: "35-44", min: 35, max: 44, color: "#2B6CB0" },
  { label: "45-54", min: 45, max: 54, color: "#E6B34D" },
  { label: "55+", min: 55, max: Number.POSITIVE_INFINITY, color: "#C2600A" },
];

// Fill colors for the funnel bands — same hues as APPLICATION_STATUS_COLOR,
// used as an SVG fill instead of a bg/text pair.
const FUNNEL_STAGE_HEX: Record<string, string> = {
  applied: "#9AA3B2",
  screened: "#E6B34D",
  shortlisted: "#008990",
  interview: "#7C5CD1",
  interviewed: "#2B6CB0",
  evaluated: "#0F9D6C",
  offer: "#C2600A",
  hired: "#2F9E56",
};

// Solid fill colors matching the match-score band text colors from matchBand().
const SCORE_BAND_FILL: Record<string, string> = {
  strong: "bg-[#2F9E56]",
  good: "bg-brand-teal-dark",
  possible: "bg-[#4B5468]",
};

type MatchResult = {
  applicationId: string;
  jobPostingId: string;
  score: number;
  eligible: boolean;
  ineligibleReasons: string[];
};

// Same bands as the Top Matches card, so a score reads the same wherever it shows up.
function matchBand(score: number): { key: "strong" | "good" | "possible"; bg: string; text: string } {
  if (score >= 80) return { key: "strong", bg: "bg-[#E7F6EC]", text: "text-[#2F9E56]" };
  if (score >= 60) return { key: "good", bg: "bg-brand-teal-soft", text: "text-brand-teal-dark" };
  return { key: "possible", bg: "bg-[#F1F4F8]", text: "text-[#4B5468]" };
}

function ApplicantAvatar({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-brand-teal-soft text-brand-teal-dark">
        <UserIcon className="h-[15px] w-[15px]" />
      </div>
    );
  }
  return <img src={url} alt="" className="h-[36px] w-[36px] shrink-0 rounded-full object-cover" />;
}

function ApplicantRowButton({ applicant, match, onClick }: { applicant: ApplicantRow; match?: MatchResult; onClick: () => void }) {
  const { t } = useTranslation("common");
  const color = APPLICATION_STATUS_COLOR[applicant.application.status] ?? APPLICATION_STATUS_COLOR.applied!;
  const band = match ? matchBand(match.score) : null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="@container rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px] text-left transition-colors hover:bg-[#F1F4F8]"
    >
      <div className="flex items-start gap-[10px] @[30rem]:items-center">
        <ApplicantAvatar url={applicant.applicantAvatarUrl} />
        <div className="flex min-w-0 flex-1 flex-col gap-[6px] @[30rem]:flex-row @[30rem]:items-center @[30rem]:gap-[10px]">
          <div className="min-w-0 flex-1">
            {/* Not in v3 yet: the video pitch badge beside the name. */}
            <p className="flex min-w-0 items-center gap-[6px] text-sm text-[#141B2E]">
              <span className="truncate">{applicant.applicantName}</span>
            </p>
            <p className="mt-[1px] truncate text-xs text-[#4B5468]">
              {[applicant.applicantTargetRole, t("applicants.appliedAgo", { ago: relativeTimeAgo(t, applicant.application.appliedAt) })]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-[6px] @[30rem]:shrink-0 @[30rem]:justify-end">
            {band && match && (
              <span className={`rounded-full px-[10px] py-[3px] text-xs ${band.bg} ${band.text}`}>
                {t("dashboard.employer.jobMatch", { score: match.score })}
              </span>
            )}
            {match && !match.eligible && (
              <span
                className="rounded-full bg-[#FDEDE8] px-[10px] py-[3px] text-xs text-[#C2410C]"
                title={match.ineligibleReasons.join("; ") || t("dashboard.matches.doesntMeet")}
              >
                {t("dashboard.matches.failedScreening")}
              </span>
            )}
            <span className={`rounded-full px-[10px] py-[3px] text-xs ${color.bg} ${color.text}`}>
              {statusLabel(t, applicant.application.status)}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

function PostingAnalytics({
  postingCreatedAt,
  rows,
  matchByApplicationId,
}: {
  postingCreatedAt: string;
  rows: ApplicantRow[];
  matchByApplicationId: Record<string, MatchResult>;
}) {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.resolvedLanguage === "ms" ? "ms-MY" : "en-US";
  const funnelClipId = useId();

  // 1. Funnel: how many applicants have reached (or passed) each stage, so
  // the bars are monotonically non-increasing left to right.
  const stageIndex: Record<string, number> = {};
  FUNNEL_STAGES.forEach((s, i) => {
    stageIndex[s] = i;
  });
  const funnelCounts = FUNNEL_STAGES.map((stage, i) => ({
    stage,
    count: rows.filter((r) => (stageIndex[r.application.status] ?? -1) >= i).length,
  }));
  const funnelMax = funnelCounts[0]?.count || 1;

  // Smooth funnel silhouette: one continuous curved outline (cubic beziers
  // through each stage's width), with per-stage color bands clipped inside it.
  const funnelRowH = 30;
  const funnelTotalH = funnelCounts.length * funnelRowH;
  const funnelWidthPct = (count: number) => (funnelMax > 0 ? Math.max((count / funnelMax) * 100, count > 0 ? 12 : 0) : 0);
  // n+1 width levels: one per stage boundary, plus the bottom of the last stage.
  const funnelLevels = [...funnelCounts.map((f) => funnelWidthPct(f.count)), funnelWidthPct(funnelCounts.at(-1)?.count ?? 0)];
  const funnelYs = funnelLevels.map((_, i) => i * funnelRowH);
  const funnelRightXs = funnelLevels.map((w) => 50 + w / 2);
  const funnelLeftXs = funnelLevels.map((w) => 50 - w / 2);
  function smoothEdge(xs: number[], ys: number[]): string {
    let d = `M ${xs[0]} ${ys[0]}`;
    for (let i = 1; i < xs.length; i++) {
      const midY = (ys[i - 1]! + ys[i]!) / 2;
      d += ` C ${xs[i - 1]} ${midY}, ${xs[i]} ${midY}, ${xs[i]} ${ys[i]}`;
    }
    return d;
  }
  const funnelOutlinePath = `${smoothEdge(funnelRightXs, funnelYs)} ${smoothEdge([...funnelLeftXs].reverse(), [...funnelYs].reverse()).replace("M", "L")} Z`;

  // 2. Time-to-hire: average days from appliedAt to hiredAt, hired applicants only.
  const hiredRows = rows.filter((r) => r.application.status === "hired" && r.application.hiredAt);
  const avgTimeToHire =
    hiredRows.length > 0
      ? Math.round(
          hiredRows.reduce((sum, r) => sum + daysBetween(r.application.appliedAt, r.application.hiredAt as string), 0) / hiredRows.length,
        )
      : null;

  // 3. Applicant locations — grouped counts, most common first.
  const notSpecified = t("jobDetails.notSpecified");
  const locationCounts = Object.entries(
    rows.reduce<Record<string, number>>((acc, r) => {
      const loc = r.applicantLocation?.trim() || notSpecified;
      acc[loc] = (acc[loc] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .map(([location, count]) => ({ location, count }))
    .sort((a, b) => b.count - a.count);
  const LOCATION_FILL = [
    "#7C5CD1",
    "#008990",
    "#C2600A",
    "#2B6CB0",
    "#E6B34D",
    "#0F9D6C",
    "#D1476B",
    "#4B5468",
    "#3B5BDB",
    "#9C6B1F",
    "#2F9E56",
    "#9AA3B2",
  ];
  const donutSlices = locationCounts.map((l, i) => ({ ...l, color: LOCATION_FILL[i % LOCATION_FILL.length]! }));
  const donutTotal = donutSlices.reduce((sum, s) => sum + s.count, 0);
  const donutPcts = donutSlices.map((s) => (donutTotal > 0 ? (s.count / donutTotal) * 100 : 0));
  const donutArcs = donutSlices.map((s, i) => {
    const cumulative = donutPcts.slice(0, i).reduce((sum, p) => sum + p, 0);
    const pct = donutPcts[i]!;
    return { ...s, pct, dashArray: `${pct} ${100 - pct}`, dashOffset: 25 - cumulative };
  });

  // 4. Applicant ages, bucketed into bands — only those with a birth year on file.
  const ages = rows.map((r) => ageFromBirthYear(r.applicantBirthYear)).filter((a): a is number => a !== null);
  const ageBandCounts = AGE_BANDS.map((band) => ({
    ...band,
    count: ages.filter((a) => a >= band.min && a <= band.max).length,
  }));
  const ageBandMax = Math.max(1, ...ageBandCounts.map((b) => b.count));

  // 5. Match score distribution across the same bands used on applicant rows.
  // Ineligible candidates are excluded, so a hard-filter failure can't
  // inflate the "Strong match" band.
  const scores = rows
    .map((r) => matchByApplicationId[r.application.id])
    .filter((m): m is MatchResult => !!m && m.eligible)
    .map((m) => m.score);
  const scoreBands = [
    { ...matchBand(80), min: 80, max: Number.POSITIVE_INFINITY },
    { ...matchBand(60), min: 60, max: 79 },
    { ...matchBand(0), min: 0, max: 59 },
  ];
  const scoreCounts = scoreBands.map((band) => ({
    ...band,
    count: scores.filter((s) => s >= band.min && s <= band.max).length,
  }));

  // 6. Applications per day, most recent 14 days.
  const today = new Date();
  const dayBuckets: { key: string; label: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = rows.filter((r) => r.application.appliedAt.slice(0, 10) === key).length;
    dayBuckets.push({
      key,
      label: d.toLocaleDateString(locale, { month: "short", day: "numeric", timeZone: "UTC" }),
      count,
    });
  }
  const dayMax = Math.max(1, ...dayBuckets.map((d) => d.count));
  const postedDaysAgo = Math.max(0, Math.round(daysBetween(postingCreatedAt, today.toISOString())));
  const totalInPeriod = dayBuckets.reduce((sum, d) => sum + d.count, 0);
  const avgPerDay = totalInPeriod / dayBuckets.length;
  const peakDay = dayBuckets.reduce((best, d) => (d.count > best.count ? d : best), dayBuckets[0]!);

  return (
    <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
      <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <p className="text-sm text-[#141B2E]">{t("jobPosting.analytics.title")}</p>

        {/* Funnel */}
        <div className="mt-[14px]">
          <p className="text-xs text-[#4B5468]">{t("jobPosting.analytics.funnel")}</p>
          <div className="mt-[10px] flex gap-[10px]">
            <div className="flex shrink-0 flex-col" style={{ width: 72 }}>
              {funnelCounts.map(({ stage }) => (
                <div key={stage} className="flex items-center justify-end text-right text-xs text-[#4B5468]" style={{ height: funnelRowH }}>
                  {t(`jobPosting.analytics.stages.${stage}`)}
                </div>
              ))}
            </div>
            <div className="relative flex-1">
              <svg viewBox={`0 0 100 ${funnelTotalH}`} preserveAspectRatio="none" className="block w-full" style={{ height: funnelTotalH }}>
                <defs>
                  <clipPath id={funnelClipId}>
                    <path d={funnelOutlinePath} />
                  </clipPath>
                </defs>
                <g clipPath={`url(#${funnelClipId})`}>
                  {funnelCounts.map(({ stage }, i) => (
                    <rect key={stage} x={0} y={i * funnelRowH} width={100} height={funnelRowH} fill={FUNNEL_STAGE_HEX[stage] ?? "#008990"} />
                  ))}
                </g>
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col">
                {funnelCounts.map(({ stage, count }) => (
                  <div key={stage} className="flex items-center justify-center text-xs text-white" style={{ height: funnelRowH }}>
                    {count > 0 ? count : ""}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Time to hire */}
        <div className="mt-[16px] border-t border-black/[0.06] pt-[14px]">
          <p className="text-xs text-[#4B5468]">{t("jobPosting.analytics.avgTimeToHire")}</p>
          <p className="mt-[4px] text-lg text-[#141B2E]">
            {avgTimeToHire === null ? t("jobPosting.analytics.noHires") : t("jobPosting.analytics.days", { count: avgTimeToHire })}
          </p>
          {hiredRows.length > 0 && (
            <p className="mt-[1px] text-xs text-[#9AA3B2]">{t("jobPosting.analytics.acrossHires", { count: hiredRows.length })}</p>
          )}
        </div>

        {/* Applicant locations */}
        <div className="mt-[16px] border-t border-black/[0.06] pt-[14px]">
          <p className="text-xs text-[#4B5468]">{t("jobPosting.analytics.locations")}</p>
          {locationCounts.length === 0 ? (
            <p className="mt-[6px] text-xs text-[#9AA3B2]">{t("jobPosting.analytics.noApplicants")}</p>
          ) : (
            <div className="mt-[10px] flex items-center gap-[16px]">
              <div className="relative h-[92px] w-[92px] shrink-0">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  {donutArcs.map((arc) => (
                    <circle
                      key={arc.location}
                      cx={18}
                      cy={18}
                      r={15.9155}
                      fill="transparent"
                      stroke={arc.color}
                      strokeWidth={4}
                      strokeDasharray={arc.dashArray}
                      strokeDashoffset={arc.dashOffset}
                    />
                  ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-base text-[#141B2E]">{donutTotal}</span>
                  <span className="text-[9px] text-[#9AA3B2]">{t("jobPosting.analytics.applicantsWord", { count: donutTotal })}</span>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                {donutArcs.map((arc) => (
                  <div key={arc.location} className="flex items-center gap-[6px]">
                    <span className="h-[8px] w-[8px] shrink-0 rounded-full" style={{ backgroundColor: arc.color }} />
                    <span className="min-w-0 flex-1 truncate text-xs text-[#4B5468]" title={arc.location}>
                      {arc.location}
                    </span>
                    <span className="shrink-0 text-xs text-[#141B2E]">{arc.count}</span>
                    <span className="w-[32px] shrink-0 text-right text-[11px] text-[#9AA3B2]">{Math.round(arc.pct)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Applicant ages */}
        <div className="mt-[16px] border-t border-black/[0.06] pt-[14px]">
          <p className="text-xs text-[#4B5468]">{t("jobPosting.analytics.ages")}</p>
          {ages.length === 0 ? (
            <p className="mt-[6px] text-xs text-[#9AA3B2]">{t("jobPosting.analytics.noAges")}</p>
          ) : (
            <div className="mt-[8px] flex flex-col gap-[6px]">
              {ageBandCounts.map((band) => (
                <div key={band.label} className="flex items-center gap-[8px]">
                  <span className="w-[48px] shrink-0 text-xs text-[#4B5468]">{band.label}</span>
                  <div className="h-[8px] flex-1 overflow-hidden rounded-full bg-[#F1F4F8]">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(band.count / ageBandMax) * 100}%`, backgroundColor: band.color }}
                    />
                  </div>
                  <span className="w-[24px] shrink-0 text-right text-xs text-[#141B2E]">{band.count}</span>
                </div>
              ))}
              {ages.length < rows.length && (
                <p className="text-[11px] text-[#9AA3B2]">{t("jobPosting.analytics.withoutAge", { count: rows.length - ages.length })}</p>
              )}
            </div>
          )}
        </div>

        {/* Match score distribution */}
        <div className="mt-[16px] border-t border-black/[0.06] pt-[14px]">
          <p className="text-xs text-[#4B5468]">{t("jobPosting.analytics.matchDistribution")}</p>
          {scores.length === 0 ? (
            <p className="mt-[6px] text-xs text-[#9AA3B2]">{t("jobPosting.analytics.noScores")}</p>
          ) : (
            <div className="mt-[8px] flex flex-col gap-[6px]">
              {scoreCounts.map((band) => (
                <div key={band.key} className="flex items-center gap-[8px]">
                  <span className={`w-[104px] shrink-0 rounded-full px-[8px] py-[2px] text-center text-[11px] ${band.bg} ${band.text}`}>
                    {t(`jobPosting.analytics.bands.${band.key}`)}
                  </span>
                  <div className="h-[8px] flex-1 overflow-hidden rounded-full bg-[#F1F4F8]">
                    <div
                      className={`h-full rounded-full ${SCORE_BAND_FILL[band.key] ?? "bg-brand-teal-dark"}`}
                      style={{ width: `${scores.length > 0 ? (band.count / scores.length) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-[24px] shrink-0 text-right text-xs text-[#141B2E]">{band.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Applications over time */}
        <div className="mt-[16px] border-t border-black/[0.06] pt-[14px]">
          <div className="flex items-baseline justify-between gap-[8px]">
            <p className="text-xs text-[#4B5468]">
              {t("jobPosting.analytics.last14Days")}
              {postedDaysAgo < 14 ? ` ${t("jobPosting.analytics.postedDaysAgo", { count: postedDaysAgo })}` : ""}
            </p>
            <span className="shrink-0 text-xs text-[#7C5CD1]">{t("jobPosting.analytics.total", { count: totalInPeriod })}</span>
          </div>
          <p className="mt-[2px] text-[11px] text-[#9AA3B2]">
            {t("jobPosting.analytics.perDay", { avg: avgPerDay.toFixed(1) })}
            {peakDay.count > 0 ? ` · ${t("jobPosting.analytics.peak", { count: peakDay.count, day: peakDay.label })}` : ""}
          </p>

          <div className="mt-[12px] flex h-[56px] items-end gap-[3px]">
            {dayBuckets.map((d, i) => {
              const isToday = i === dayBuckets.length - 1;
              return (
                <div key={d.key} className="flex flex-1 flex-col items-center gap-[3px]" title={`${d.label}: ${d.count}`}>
                  {d.count > 0 && <span className="text-[9px] leading-none text-[#7C5CD1]">{d.count}</span>}
                  <div
                    className={`w-full rounded-t-[3px] ${isToday ? "bg-[#5A3FA8]" : "bg-[#7C5CD1]"}`}
                    style={{ height: `${Math.max(2, (d.count / dayMax) * 40)}px` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-[4px] flex items-center justify-between text-[10px] text-[#9AA3B2]">
            <span>{dayBuckets[0]?.label}</span>
            <span>{t("form.datePicker.today")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Who covers this posting as Hiring manager — Owners/Admins can change it
// right here; a Hiring manager just sees who's on it.
function HiringManagersCard({
  postingId,
  options,
  initialIds,
  canEdit,
}: {
  postingId: string;
  options: HiringManagerOption[];
  initialIds: string[];
  canEdit: boolean;
}) {
  const { t } = useTranslation("common");
  const [ids, setIds] = useState(initialIds);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const saveMutation = useMutation(orpc.job.update.mutationOptions());
  const assigned = options.filter((o) => ids.includes(o.teamMemberId));

  async function save() {
    if (!draft) return;
    setError(null);
    try {
      const data = await saveMutation.mutateAsync({ id: postingId, hiringManagerIds: draft });
      setIds(data.posting.hiringManagerIds ?? draft);
      setDraft(null);
      // The Team page's jobs list and the posting's own data read this too.
      void queryClient.invalidateQueries({ queryKey: orpc.team.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.application.postingPage.key() });
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t("jobPosting.hiringManagers.error"));
    }
  }

  return (
    <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "30ms" }}>
      <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <div className="flex items-center justify-between gap-[8px]">
          <div className="flex items-center gap-[8px]">
            <p className="text-sm text-[#141B2E]">{t("jobPosting.hiringManagers.title")}</p>
            <span className="rounded-full bg-[#EAF0FE] px-[10px] py-[3px] text-xs text-[#3B5BDB]">{assigned.length}</span>
          </div>
          {canEdit && !draft && options.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setDraft(ids);
              }}
              className="flex items-center gap-[4px] text-sm text-brand-teal-dark hover:underline"
            >
              <PencilIcon className="h-[11px] w-[11px]" />
              {t("employerJobs.edit")}
            </button>
          )}
        </div>
        <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("jobPosting.hiringManagers.hint")}</p>

        {draft ? (
          <div className="mt-[12px] flex flex-col gap-[6px]">
            {options.map((m) => {
              const checked = draft.includes(m.teamMemberId);
              return (
                <button
                  key={m.teamMemberId}
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() =>
                    setDraft((prev) => (prev ? (checked ? prev.filter((id) => id !== m.teamMemberId) : [...prev, m.teamMemberId]) : prev))
                  }
                  className={`flex items-center gap-[10px] rounded-[12px] border px-[10px] py-[8px] text-left transition-colors ${
                    checked ? "border-brand-teal-dark bg-brand-teal-soft" : "border-[#EAEDF2] bg-white hover:bg-[#F8FAFB]"
                  }`}
                >
                  <span
                    className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[5px] border ${
                      checked ? "border-brand-teal-dark bg-brand-teal-dark text-white" : "border-black/[0.2] bg-white"
                    }`}
                  >
                    {checked && <CheckIcon className="h-[9px] w-[9px]" />}
                  </span>
                  <ApplicantAvatar url={m.avatarUrl} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs text-[#141B2E]">{m.name}</span>
                    <span className="block truncate text-xs text-[#9AA3B2]">
                      {m.pending ? t("jobPosting.hiringManagers.invitedNotJoined") : (m.position ?? m.email)}
                    </span>
                  </span>
                </button>
              );
            })}
            {error && <p className="text-xs text-red-500">{error}</p>}
            <div className="mt-[4px] flex gap-[6px]">
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={save}
                className="flex h-[32px] flex-1 items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {saveMutation.isPending ? t("employerOnboarding.saving") : t("employerOnboarding.save")}
              </button>
              <button
                type="button"
                disabled={saveMutation.isPending}
                onClick={() => setDraft(null)}
                className="flex h-[32px] items-center justify-center rounded-full border border-black/[0.1] px-[14px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
              >
                {t("applicants.cancel")}
              </button>
            </div>
          </div>
        ) : assigned.length === 0 ? (
          <p className="mt-[12px] rounded-[14px] bg-[#F8FAFB] p-[14px] text-xs leading-[18px] text-[#9AA3B2]">
            {options.length === 0
              ? canEdit
                ? t("jobPosting.hiringManagers.noneOnTeam")
                : t("jobPosting.hiringManagers.noneOnJob")
              : canEdit
                ? t("jobPosting.hiringManagers.noneYet")
                : t("jobPosting.hiringManagers.noneOnJob")}
          </p>
        ) : (
          <div className="mt-[12px] flex flex-col gap-[6px]">
            {assigned.map((m) => (
              <div key={m.teamMemberId} className="flex items-center gap-[10px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] px-[10px] py-[8px]">
                <ApplicantAvatar url={m.avatarUrl} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs text-[#141B2E]">{m.name}</span>
                  <span className="block truncate text-xs text-[#9AA3B2]">{m.position ?? m.email}</span>
                </span>
                {m.pending && (
                  <span className="shrink-0 rounded-full bg-[#F1F4F8] px-[8px] py-[2px] text-xs text-[#4B5468]">{t("jobPosting.hiringManagers.invited")}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** The posting exactly as jobseekers see it — a salary hidden from them still shows here, marked. */
function jobseekerView(t: TFunction, data: PostingPageData) {
  const { posting, company } = data;
  const salaryRange = formatSalary(t, posting.salaryMin, posting.salaryMax, posting.salaryPeriod, "long");
  return {
    ...toJobPosting(t, {
      posting: {
        ...posting,
        customScreeningQuestions: posting.customScreeningQuestions as ActivePostingRow["posting"]["customScreeningQuestions"],
      },
      companyName: company.name,
      companyLogoUrl: company.logoUrl,
    }),
    salary: salaryRange
      ? posting.showSalary
        ? salaryRange
        : t("jobPosting.salaryHidden", { salary: salaryRange })
      : t("dashboard.salaryNotDisclosed"),
  };
}

/** The page: the shell, and the posting once application.postingPage has loaded. */
export function EmployerJobPostingView({ slug }: { slug: string }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const pageQuery = useQuery({
    ...orpc.application.postingPage.queryOptions({ input: { slug } }),
    retry: false,
    meta: { suppressErrorToast: true },
  });
  const data = pageQuery.data;

  return (
    <EmployerDashboardShell
      active="jobs"
      heading={data?.posting.title ?? t("jobPosting.jobPosting")}
      headerAction={
        data?.canManagePosting ? (
          <button
            type="button"
            onClick={() => navigate({ to: "/employer/jobs/postajob", search: { id: data.posting.id } })}
            className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] px-[16px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
          >
            {t("jobPosting.editPosting")}
          </button>
        ) : undefined
      }
      subheading={t("jobPosting.subheading")}
    >
      <a
        href="/employer/jobs"
        onClick={(e) => {
          e.preventDefault();
          navigate({ to: "/employer/jobs" });
        }}
        className="text-sm text-[#9AA3B2] hover:text-[#141B2E]"
      >
        ← {data && !data.canManagePosting ? t("jobPosting.backToMyJobs") : t("employerJobs.backToManageJob")}
      </a>

      {pageQuery.isPending ? (
        <p className="mt-[16px] rounded-[14px] bg-white/70 p-[16px] text-center text-xs text-[#9AA3B2]">{t("nav.loading")}</p>
      ) : pageQuery.isError || !data ? (
        <div className="mt-[16px] rounded-[14px] border border-[#EAD9D6] bg-[#FBF3F1] p-[16px] text-center text-sm text-[#A66A61]">
          {(pageQuery.error as { code?: string } | null)?.code === "NOT_FOUND" ? t("jobPosting.notFound") : t("jobPosting.loadError")}
        </div>
      ) : (
        <PostingContent slug={slug} data={data} />
      )}
    </EmployerDashboardShell>
  );
}

function PostingContent({ slug, data }: { slug: string; data: PostingPageData }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const { posting, applications: rows, addresses, teamMembers, canManagePosting } = data;
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [resubmitError, setResubmitError] = useState<string | null>(null);
  const resubmitMutation = useMutation(orpc.job.update.mutationOptions());
  const currentUser = useCurrentEmployer(teamMembers);
  const { statusError, updatingId, updateStatus, setAttendance, saveEvaluation, completeEvaluation } = useApplicantActions(
    (applicationId, patch) =>
      queryClient.setQueryData(orpc.application.postingPage.queryKey({ input: { slug } }), (old) =>
        old
          ? { ...old, applications: old.applications.map((row) => (row.application.id === applicationId ? patch(row) : row)) }
          : old,
      ),
  );

  async function handleResubmit() {
    setResubmitError(null);
    try {
      await resubmitMutation.mutateAsync({ id: posting.id, status: "pending" });
      // Resubmitting moves it to "pending" — this page only serves
      // active/filled/closed/flagged postings, so Manage Job's own pending
      // section is where it lives now.
      void queryClient.invalidateQueries({ queryKey: orpc.job.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.employer.dashboard.key() });
      navigate({ to: "/employer/jobs" });
    } catch (err) {
      setResubmitError(err instanceof Error && err.message ? err.message : t("employerJobs.couldntResubmitPosting"));
    }
  }

  // Same scoring "Top Matches" uses, scoped down to this one posting's applicants.
  const matchesQuery = useQuery({ ...orpc.employer.topMatches.queryOptions(), meta: { suppressErrorToast: true } });
  const matchByApplicationId: Record<string, MatchResult> = {};
  for (const result of matchesQuery.data?.results ?? []) {
    if (result.jobPostingId === posting.id) matchByApplicationId[result.applicationId] = result;
  }

  const viewingApplicant = rows.find((r) => r.application.id === viewingId) ?? null;
  const interviewRows = rows.filter((r) => INTERVIEW_STAGE_STATUSES.includes(r.application.status));

  return (
    <>
      {canManagePosting && posting.status === "flagged" && posting.flagReason && (
        <div className="mt-[16px] rounded-[12px] border border-[#FBDBBE] bg-[#FFF7F0] p-[12px]">
          <p className="mb-[4px] text-xs text-[#C2600A]">{t("employerJobs.flaggedNeedsFix")}</p>
          <p className="text-xs text-[#9A5209]">{posting.flagReason}</p>
          {resubmitError && <p className="mt-[8px] text-xs text-[#9A5209]">{resubmitError}</p>}
          <button
            type="button"
            disabled={resubmitMutation.isPending}
            onClick={handleResubmit}
            className="mt-[10px] flex h-[34px] w-full items-center justify-center rounded-full border border-[#FBDBBE] bg-white text-sm text-[#C2600A] transition-colors hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-[16px]"
          >
            {resubmitMutation.isPending ? t("employerJobs.resubmitting") : t("employerJobs.resubmitForReview")}
          </button>
        </div>
      )}

      <div className="mt-[16px] flex flex-col gap-[16px] lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-col gap-[16px] lg:flex-[3]">
          <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
            <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
              <p className="mb-[14px] text-sm text-[#141B2E]">{t("jobPosting.jobPosting")}</p>
              {/* Same panel jobseekers see on the jobseeker landing page. */}
              <JobPostingDetails posting={jobseekerView(t, data)} />
            </div>
          </div>

          <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "60ms" }}>
            <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
              <div className="flex flex-wrap items-center gap-[8px]">
                <p className="text-sm text-[#141B2E]">{t("applicants.heading")}</p>
                <span className="rounded-full bg-[#F1F4F8] px-[10px] py-[3px] text-xs text-[#4B5468]">{rows.length}</span>
                {rows.length > 0 && (
                  <span className="ml-auto">
                    <ExportApplicantsButton applicationIds={rows.map((a) => a.application.id)} title={posting.title} />
                  </span>
                )}
              </div>
              {statusError && <p className="mt-[6px] text-xs text-red-500">{statusError}</p>}

              {rows.length === 0 ? (
                <p className="mt-[14px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-xs text-[#9AA3B2]">{t("jobPosting.noApplicants")}</p>
              ) : (
                <div className="mt-[12px] flex flex-col gap-[8px]">
                  {rows.map((applicant) => (
                    <ApplicantRowButton
                      key={applicant.application.id}
                      applicant={applicant}
                      match={matchByApplicationId[applicant.application.id]}
                      onClick={() => {
                        setViewingId(applicant.application.id);
                        if (applicant.application.status === "applied") {
                          updateStatus(applicant.application.id, "screened");
                        }
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-[16px] lg:flex-[2]">
          <PostingAnalytics postingCreatedAt={posting.createdAt} rows={rows} matchByApplicationId={matchByApplicationId} />

          <HiringManagersCard
            postingId={posting.id}
            options={data.hiringManagerOptions}
            initialIds={data.hiringManagerIds}
            canEdit={canManagePosting}
          />

          <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "60ms" }}>
            <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
              <div className="flex items-center gap-[8px]">
                <p className="text-sm text-[#141B2E]">{t("jobPosting.interviews")}</p>
                <span className="rounded-full bg-[#F1F4F8] px-[10px] py-[3px] text-xs text-[#4B5468]">{interviewRows.length}</span>
              </div>

              {interviewRows.length === 0 ? (
                <p className="mt-[14px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-xs text-[#9AA3B2]">{t("jobPosting.noInterviews")}</p>
              ) : (
                <div className="mt-[12px] flex flex-col gap-[8px]">
                  {interviewRows.map((applicant) => (
                    <ApplicantRowButton
                      key={applicant.application.id}
                      applicant={applicant}
                      match={matchByApplicationId[applicant.application.id]}
                      onClick={() => setViewingId(applicant.application.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {viewingApplicant && (
        <ApplicantDetailModal
          key={viewingApplicant.application.id}
          applicant={viewingApplicant}
          updating={updatingId === viewingApplicant.application.id}
          onUpdateStatus={(status, interviewDetails) => updateStatus(viewingApplicant.application.id, status, interviewDetails)}
          onSetAttendance={(status) => setAttendance(viewingApplicant.application.id, status)}
          onSaveEvaluation={(scores, recommendation, notes) =>
            saveEvaluation(viewingApplicant.application.id, scores, recommendation, notes)
          }
          onCompleteEvaluation={() => completeEvaluation(viewingApplicant.application.id)}
          savingEvaluation={updatingId === viewingApplicant.application.id}
          addresses={addresses}
          currentUserId={currentUser.id}
          currentUserIsOwner={currentUser.isOwner}
          currentUserName={currentUser.name}
          currentUserAvatarUrl={currentUser.avatarUrl}
          currentUserRole={currentUser.role}
          teamMembers={teamMembers}
          onClose={() => setViewingId(null)}
        />
      )}
    </>
  );
}
