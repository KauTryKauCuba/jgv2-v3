// The redesign's src/components/EmployerApplicantsView.tsx (the employer's
// Applicants page), ported. Same UI and flow; the data comes from
// application.listForEmployer (the redesign's server-loaded props) and the
// match scores from employer.topMatches, every move goes through
// application.updateStatus & co., and every string goes through t().
//
// Not in v3 yet (left out): the video pitch badge beside a name
// (VideoPitchBadge). A Hiring manager gets only their jobs' applicants (the
// API scopes them) and the Hiring-manager wording.
import type { CriteriaFlags } from "@jobgiga-app/api/shared/matching";
import { hasFullAccess } from "@jobgiga-app/api/shared/team-roles";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EmployerDashboardShell } from "@/components/dashboard/employer-dashboard-shell";
import { TopMatchesCard } from "@/components/dashboard/top-matches-card";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import { ChevronDownIcon, SearchIcon, UserIcon } from "@/components/landing/icons";
import {
  type ApplicantRow,
  type ApplicantsPageData as ListData,
  expectedSalaryText, STATUS_ICON, STATUS_ORDER, STATUS_TILE_GRADIENT } from "@/lib/applicants/status";
import { APPLICATION_STATUS_COLOR, relativeTimeAgo, statusLabel } from "@/lib/dashboard/pipeline";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { useTeamRole } from "@/lib/team/use-team-role";
import { orpc, queryClient } from "@/utils/orpc";
import { ApplicantDetailModal, optionLabel } from "./applicant-detail-modal";
import { EmployerResponsivenessCard } from "./employer-responsiveness-card";
import { ExportApplicantsButton } from "./export-applicants-button";
import { SalaryFitBadge } from "./salary-fit-badge";
import { useApplicantActions, useCurrentEmployer } from "./use-applicant-actions";

export type ApplicantsSearch = { jobId?: string; status?: string; applicantId?: string };

function ApplicantAvatar({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-brand-teal-soft text-brand-teal-dark">
        <UserIcon className="h-[16px] w-[16px]" />
      </div>
    );
  }
  return <img src={url} alt="" className="h-[38px] w-[38px] shrink-0 rounded-full object-cover" />;
}

/** The page: the shell, and the list once application.listForEmployer has loaded. */
export function EmployerApplicantsView({ search }: { search: ApplicantsSearch }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const listQuery = useQuery({ ...orpc.application.listForEmployer.queryOptions(), meta: { suppressErrorToast: true } });
  // Owners/Admins; a Hiring manager sees only their own jobs' applicants.
  const teamRole = useTeamRole();
  const fullAccess = hasFullAccess(teamRole ?? "owner");

  return (
    <EmployerDashboardShell
      active="applicants"
      heading={t("applicants.heading")}
      headerAction={
        fullAccess ? (
          <button
            type="button"
            onClick={() => navigate({ to: "/employer/jobs/postajob" })}
            className="flex h-[38px] items-center justify-center rounded-full bg-brand-teal-dark px-[22px] text-sm text-white transition-opacity hover:opacity-90"
          >
            {t("dashboard.employer.postJob")}
          </button>
        ) : undefined
      }
      subheading={fullAccess ? t("applicants.subheading") : t("applicants.subheadingHiringManager")}
    >
      {listQuery.isPending ? (
        <p className="rounded-[14px] bg-white/70 p-[16px] text-center text-xs text-[#9AA3B2]">{t("nav.loading")}</p>
      ) : listQuery.isError ? (
        <div className="rounded-[14px] border border-[#EAD9D6] bg-[#FBF3F1] p-[16px] text-center text-sm text-[#A66A61]">
          {t("applicants.loadError")}
        </div>
      ) : (
        <ApplicantsContent
          fullAccess={fullAccess}
          search={search}
          applications={listQuery.data.applications}
          addresses={listQuery.data.addresses}
          teamMembers={listQuery.data.teamMembers}
          initialSmartMatchEnabled={listQuery.data.smartMatchEnabled}
          initialCriteria={listQuery.data.criteria}
          responsiveness={listQuery.data.responsiveness}
          waitingLong={listQuery.data.waitingLong}
        />
      )}
    </EmployerDashboardShell>
  );
}


function ApplicantsContent({
  fullAccess,
  search,
  applications: rows,
  addresses,
  teamMembers,
  initialSmartMatchEnabled,
  initialCriteria,
  responsiveness,
  waitingLong,
}: {
  fullAccess: boolean;
  search: ApplicantsSearch;
  applications: ApplicantRow[];
  addresses: ListData["addresses"];
  teamMembers: ListData["teamMembers"];
  initialSmartMatchEnabled: boolean;
  initialCriteria: CriteriaFlags;
  responsiveness: ListData["responsiveness"];
  waitingLong: number;
}) {
  const { t } = useTranslation("common");
  const initialJobId = search.jobId;
  // A link can open straight onto one applicant (?applicantId=…).
  const [viewingId, setViewingId] = useState<string | null>(() => {
    const linked = search.applicantId;
    return linked && rows.some((r) => r.application.id === linked) ? linked : null;
  });
  const [collapsedPostings, setCollapsedPostings] = useState<Set<string>>(() => new Set());
  const [howStagesWorkOpen, setHowStagesWorkOpen] = useState(false);
  // Arriving from a dashboard tile ("Needs evaluation"/"New applicants"/etc.)
  // lands straight on that status tab already selected.
  const [statusFilter, setStatusFilter] = useState<string | null>(() => {
    const status = search.status;
    return status && (STATUS_ORDER as readonly string[]).includes(status) ? status : null;
  });
  const [nameQuery, setNameQuery] = useState("");
  const currentUser = useCurrentEmployer(teamMembers);
  const { statusError, updatingId, updateStatus, setAttendance, saveEvaluation, completeEvaluation } = useApplicantActions(
    (applicationId, patch) =>
      queryClient.setQueryData(orpc.application.listForEmployer.queryKey(), (old) =>
        old
          ? { ...old, applications: old.applications.map((row) => (row.application.id === applicationId ? patch(row) : row)) }
          : old,
      ),
  );

  // The same 0-100 match score shown on "Top Matches", so employers can
  // gauge fit at a glance; ineligibleReasons explain a failed screening.
  const matchesQuery = useQuery({ ...orpc.employer.topMatches.queryOptions(), meta: { suppressErrorToast: true } });
  const matchScores = new Map((matchesQuery.data?.results ?? []).map((r) => [r.applicationId, r]));

  function togglePostingCollapsed(postingId: string) {
    setCollapsedPostings((prev) => {
      const next = new Set(prev);
      if (next.has(postingId)) next.delete(postingId);
      else next.add(postingId);
      return next;
    });
  }
  const viewingApplicant = rows.find((r) => r.application.id === viewingId) ?? null;

  // Arriving from a "N applicants" link on Manage Job — scroll straight to
  // that job's group (left expanded, along with every other group).
  useEffect(() => {
    if (!initialJobId) return;
    document.getElementById(`posting-${initialJobId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initialJobId]);

  // Arriving from a dashboard tile with ?status= — scroll past the status
  // tiles straight to the (now pre-filtered) list below them.
  useEffect(() => {
    if (!statusFilter) return;
    document.getElementById("applicants-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
    // Only on arrival — not every time the filter changes via a tile click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trimmedNameQuery = nameQuery.trim().toLowerCase();
  const filteredRows = rows.filter(
    (a) =>
      (!statusFilter || a.application.status === statusFilter) &&
      (!trimmedNameQuery || a.applicantName.toLowerCase().includes(trimmedNameQuery)),
  );
  const postingIds = Array.from(new Set(filteredRows.map((a) => a.jobPostingId)));
  const postings = postingIds.map((id) => ({
    id,
    title: filteredRows.find((a) => a.jobPostingId === id)!.jobPostingTitle,
    applicants: filteredRows.filter((a) => a.jobPostingId === id),
  }));
  const totalPostingCount = new Set(rows.map((a) => a.jobPostingId)).size;
  const hasActiveFilter = !!statusFilter || !!trimmedNameQuery;

  function toggleStatusFilter(status: string) {
    setStatusFilter((prev) => (prev === status ? null : status));
  }

  const stageSteps = [1, 2, 3, 4] as const;

  return (
    <>
      <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[20px] lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-col gap-[20px] lg:flex-1">
          <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
            <div className="relative overflow-hidden rounded-[19px] bg-white p-[16px] sm:p-[22px]">
              {!howStagesWorkOpen && (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 bottom-0 h-[70px] overflow-hidden rounded-b-[19px] sm:h-[95px] lg:h-[130px]"
                >
                  {/* AnimatedRibbon renders a much taller graphic than this
                      crop window — the negative margin shifts it up so the
                      visible slice lands on the ribbon's colour pools. */}
                  <div className="-mt-[67px] sm:-mt-[92px] lg:-mt-[125px]">
                    <AnimatedRibbon />
                  </div>
                </div>
              )}
              <button
                type="button"
                onClick={() => setHowStagesWorkOpen((o) => !o)}
                aria-expanded={howStagesWorkOpen}
                className="relative flex w-full items-center gap-[8px] text-left"
              >
                <p className="text-sm text-[#141B2E]">{t("applicants.howStagesWork.title")}</p>
                <ChevronDownIcon
                  className={`ml-auto h-[10px] w-[10px] text-[#9AA3B2] transition-transform ${howStagesWorkOpen ? "" : "-rotate-90"}`}
                />
              </button>
              <div
                className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                  howStagesWorkOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                }`}
              >
                <div className="overflow-hidden">
                  <div className="mt-[12px] grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
                    {stageSteps.map((step) => (
                      <div key={step} className="flex flex-col gap-[4px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px]">
                        <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-teal-dark text-xs text-white">
                          {step}
                        </span>
                        <p className="mt-[4px] text-xs text-[#141B2E]">{t(`applicants.howStagesWork.step${step}.title`)}</p>
                        <p className="text-xs text-[#4B5468]">{t(`applicants.howStagesWork.step${step}.detail`)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "60ms" }}>
            <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
              <p className="mb-[12px] text-sm text-[#141B2E]">{t("applicants.atAGlance")}</p>
              <div className="grid grid-cols-2 gap-[12px] sm:grid-cols-4">
                <button
                  type="button"
                  disabled={rows.length === 0}
                  onClick={() => {
                    setStatusFilter(null);
                    setNameQuery("");
                  }}
                  style={{ backgroundImage: "linear-gradient(to bottom, #C9CFDA, white 90%)", "--icon-accent": "#C9CFDA" } as React.CSSProperties}
                  className={`gradient-noise relative flex flex-col gap-[4px] overflow-hidden rounded-[14px] p-[14px] text-left transition-opacity ${
                    rows.length > 0
                      ? `cursor-pointer hover:opacity-80 ${!statusFilter && !trimmedNameQuery ? "ring-gradient-color" : ""}`
                      : "cursor-default opacity-60"
                  }`}
                >
                  <span aria-hidden className="pointer-events-none absolute -top-[10%] -right-[10%]">
                    <UserIcon
                      className="icon-gradient-color h-[48px] w-[48px] opacity-40"
                      strokeWidth={0.7}
                      style={{ "--icon-accent": "#C9CFDA" } as React.CSSProperties}
                    />
                  </span>
                  <div className="relative flex items-start justify-between">
                    <span className="text-xl text-[#141B2E]">{rows.length}</span>
                    <UserIcon className="h-[16px] w-[16px] text-[#9AA3B2]" />
                  </div>
                  <span className="relative text-xs text-[#4B5468]">{t("applicants.totalApplicants")}</span>
                </button>
                <div
                  style={{ backgroundImage: "linear-gradient(to bottom, #C9CFDA, white 90%)" }}
                  className={`gradient-noise relative flex flex-col gap-[4px] overflow-hidden rounded-[14px] p-[14px] ${
                    totalPostingCount > 0 ? "" : "opacity-60"
                  }`}
                >
                  <span aria-hidden className="pointer-events-none absolute -top-[10%] -right-[10%]">
                    <UserIcon
                      className="icon-gradient-color h-[48px] w-[48px] opacity-40"
                      strokeWidth={0.7}
                      style={{ "--icon-accent": "#C9CFDA" } as React.CSSProperties}
                    />
                  </span>
                  <div className="relative flex items-start justify-between">
                    <span className="text-xl text-[#141B2E]">{totalPostingCount}</span>
                    <UserIcon className="h-[16px] w-[16px] text-[#9AA3B2]" />
                  </div>
                  <span className="relative text-xs text-[#4B5468]">{t("applicants.postingsWithApplicants")}</span>
                </div>
                {STATUS_ORDER.map((status) => {
                  const count = rows.filter((a) => a.application.status === status).length;
                  const Icon = STATUS_ICON[status]!;
                  const color = APPLICATION_STATUS_COLOR[status]!;
                  const gradient = STATUS_TILE_GRADIENT[status]!;
                  const isActive = statusFilter === status;
                  return (
                    <button
                      type="button"
                      key={status}
                      disabled={count === 0}
                      onClick={() => toggleStatusFilter(status)}
                      style={{ backgroundImage: `linear-gradient(to bottom, ${gradient}, white 90%)`, "--icon-accent": gradient } as React.CSSProperties}
                      className={`gradient-noise relative flex flex-col gap-[4px] overflow-hidden rounded-[14px] p-[14px] text-left transition-opacity ${
                        count > 0 ? `cursor-pointer hover:opacity-80 ${isActive ? "ring-gradient-color" : ""}` : "cursor-default opacity-60"
                      }`}
                    >
                      <span aria-hidden className="pointer-events-none absolute -top-[10%] -right-[10%]">
                        <Icon
                          className="icon-gradient-color h-[48px] w-[48px] opacity-40"
                          strokeWidth={0.7}
                          style={{ "--icon-accent": gradient } as React.CSSProperties}
                        />
                      </span>
                      <div className="relative flex items-start justify-between">
                        <span className="text-xl text-[#141B2E]">{count}</span>
                        <Icon className={`h-[16px] w-[16px] ${color.text}`} />
                      </div>
                      <span className={`relative text-xs ${color.text}`}>{statusLabel(t, status)}</span>
                    </button>
                  );
                })}
              </div>

              <div id="applicants-list" className="mt-[24px] scroll-mt-[100px]">
                <div className="flex flex-wrap items-center justify-between gap-[8px]">
                  <p className="text-sm text-[#141B2E]">{t("applicants.groupedByPosting")}</p>
                  <div className="flex items-center gap-[12px]">
                    {hasActiveFilter && (
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter(null);
                          setNameQuery("");
                        }}
                        className="text-sm text-brand-teal-dark hover:underline"
                      >
                        {t("applicants.clearFilter")}
                      </button>
                    )}
                    {/* Exactly what's listed below — the filter applies, in the same order. */}
                    <ExportApplicantsButton
                      applicationIds={postings.flatMap((p) => p.applicants.map((a) => a.application.id))}
                      title={
                        statusFilter
                          ? t("applicants.exportTitleStatus", { status: statusLabel(t, statusFilter) })
                          : t("applicants.heading")
                      }
                    />
                  </div>
                </div>
                <div className="mt-[10px] flex items-center gap-[8px] rounded-[12px] border border-black/[0.1] px-[12px] focus-within:border-brand-teal-dark">
                  <SearchIcon className="h-[13px] w-[13px] shrink-0 text-[#9AA3B2]" />
                  <input
                    type="search"
                    value={nameQuery}
                    onChange={(e) => setNameQuery(e.target.value)}
                    placeholder={t("applicants.searchPlaceholder")}
                    aria-label={t("applicants.searchLabel")}
                    className="h-[38px] w-full bg-transparent text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2]"
                  />
                </div>
                {statusFilter && (
                  <p className="mt-[6px] text-xs text-[#9AA3B2]">
                    {t("applicants.showingOnlyBefore")}
                    <span className="text-[#4B5468]">{statusLabel(t, statusFilter)}</span>
                    {t("applicants.showingOnlyAfter")}
                  </p>
                )}
                {statusError && <p className="mt-[6px] text-xs text-red-500">{statusError}</p>}

                {postings.length === 0 ? (
                  <p className="mt-[14px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-xs text-[#9AA3B2]">
                    {hasActiveFilter ? t("applicants.noMatch") : t("applicants.empty")}
                  </p>
                ) : (
                  <div className="mt-[10px] flex flex-col gap-[10px]">
                    {postings.map((posting, index) => {
                      const collapsed = collapsedPostings.has(posting.id);
                      return (
                        <div
                          key={posting.id}
                          id={`posting-${posting.id}`}
                          className={`animate-fade-in-up ${gradientFrameClass("teal")}`}
                          style={{ animationDelay: `${120 + index * 40}ms` }}
                        >
                          <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
                            <button
                              type="button"
                              onClick={() => togglePostingCollapsed(posting.id)}
                              aria-expanded={!collapsed}
                              className="flex w-full items-center gap-[8px] text-left"
                            >
                              <p className="text-sm text-[#141B2E]">{posting.title}</p>
                              <span className="rounded-full bg-[#F1F4F8] px-[10px] py-[3px] text-xs text-[#4B5468]">
                                {t("dashboard.matches.applicantCount", { count: posting.applicants.length })}
                              </span>
                              <ChevronDownIcon
                                className={`ml-auto h-[10px] w-[10px] text-[#9AA3B2] transition-transform ${collapsed ? "-rotate-90" : ""}`}
                              />
                            </button>
                            <div
                              className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                                collapsed ? "grid-rows-[0fr]" : "grid-rows-[1fr]"
                              }`}
                            >
                              <div className="overflow-hidden">
                                <div className="mt-[10px] flex flex-col gap-[10px]">
                                  {posting.applicants.map((applicant) => {
                                    const match = matchScores.get(applicant.application.id);
                                    const color = APPLICATION_STATUS_COLOR[applicant.application.status] ?? APPLICATION_STATUS_COLOR.applied!;
                                    return (
                                      <button
                                        key={applicant.application.id}
                                        type="button"
                                        onClick={() => {
                                          setViewingId(applicant.application.id);
                                          // Opening an "Applied" applicant is itself the
                                          // screening step — auto-advances so the employer
                                          // doesn't have to mark them as screened.
                                          if (applicant.application.status === "applied") {
                                            updateStatus(applicant.application.id, "screened");
                                          }
                                        }}
                                        className="@container rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px] text-left transition-colors hover:bg-[#F1F4F8]"
                                      >
                                        <div className="flex flex-col gap-[10px] @[34rem]:flex-row @[34rem]:items-start @[34rem]:justify-between">
                                          <div className="flex min-w-0 flex-1 items-start gap-[10px]">
                                            <ApplicantAvatar url={applicant.applicantAvatarUrl} />
                                            <div className="min-w-0 flex-1">
                                              {/* Not in v3 yet: the video pitch badge beside the name. */}
                                              <p className="flex min-w-0 items-center gap-[6px] text-sm text-[#141B2E]">
                                                <span className="truncate">{applicant.applicantName}</span>
                                              </p>
                                              {applicant.applicantTargetRole && (
                                                <p className="mt-[1px] truncate text-xs text-[#4B5468]">{applicant.applicantTargetRole}</p>
                                              )}
                                              <div className="mt-[6px] flex flex-wrap items-center gap-x-[8px] gap-y-[2px] text-xs text-[#9AA3B2]">
                                                <span>{applicant.applicantLocation || t("dashboard.locationNotSet")}</span>
                                                <span className="text-[#C7CDD7]">·</span>
                                                <span>
                                                  {t("applicants.yearsExperience", { count: applicant.applicantYearsExperience ?? 0 })}
                                                </span>
                                                {applicant.applicantEmploymentType && (
                                                  <>
                                                    <span className="text-[#C7CDD7]">·</span>
                                                    <span>{optionLabel(t, "dashboard.employmentTypes", applicant.applicantEmploymentType)}</span>
                                                  </>
                                                )}
                                                {applicant.applicantWorkArrangement && (
                                                  <>
                                                    <span className="text-[#C7CDD7]">·</span>
                                                    <span>
                                                      {optionLabel(t, "dashboard.workArrangements", applicant.applicantWorkArrangement)}
                                                    </span>
                                                  </>
                                                )}
                                                {(applicant.applicantExpectedSalaryMin || applicant.applicantExpectedSalaryMax) && (
                                                  <>
                                                    <span className="text-[#C7CDD7]">·</span>
                                                    <span>
                                                      {expectedSalaryText(applicant.applicantExpectedSalaryMin, applicant.applicantExpectedSalaryMax)}
                                                    </span>
                                                  </>
                                                )}
                                                <SalaryFitBadge
                                                  expectedMin={applicant.applicantExpectedSalaryMin}
                                                  expectedMax={applicant.applicantExpectedSalaryMax}
                                                  postingMin={applicant.postingSalaryMin}
                                                  postingMax={applicant.postingSalaryMax}
                                                  postingPeriod={applicant.postingSalaryPeriod}
                                                />
                                                {applicant.applicantNoticePeriod && (
                                                  <>
                                                    <span className="text-[#C7CDD7]">·</span>
                                                    <span>{optionLabel(t, "applicants.noticePeriods", applicant.applicantNoticePeriod)}</span>
                                                  </>
                                                )}
                                              </div>
                                              {applicant.applicantSkills.length > 0 && (
                                                <div className="mt-[8px] flex flex-wrap gap-[6px]">
                                                  {applicant.applicantSkills.slice(0, 6).map((skill) => (
                                                    <span
                                                      key={skill}
                                                      className="rounded-full bg-brand-teal-soft px-[9px] py-[3px] text-xs text-brand-teal-dark"
                                                    >
                                                      {skill}
                                                    </span>
                                                  ))}
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                          <div className="flex flex-wrap items-center gap-[6px] border-t border-[#EAEDF2] pt-[10px] @[34rem]:shrink-0 @[34rem]:flex-col @[34rem]:items-end @[34rem]:border-t-0 @[34rem]:pt-0">
                                            <span className="text-xs text-[#9AA3B2]">
                                              {t("applicants.appliedAgo", { ago: relativeTimeAgo(t, applicant.application.appliedAt) })}
                                            </span>
                                            {match && (
                                              <div className="flex flex-wrap items-center gap-[6px] @[34rem]:max-w-[220px] @[34rem]:flex-col @[34rem]:items-end @[34rem]:gap-[4px]">
                                                <span className="shrink-0 rounded-full bg-[#F1F4F8] px-[10px] py-[3px] text-xs text-[#4B5468]">
                                                  {t("dashboard.employer.jobMatch", { score: match.score })}
                                                </span>
                                                {match.eligible ? (
                                                  <span className="shrink-0 rounded-full bg-[#E7F6EC] px-[10px] py-[3px] text-xs text-[#2F9E56]">
                                                    {t("applicants.passedScreening")}
                                                  </span>
                                                ) : (
                                                  <span className="shrink-0 rounded-full bg-[#FDEDE8] px-[10px] py-[3px] text-xs text-[#C2410C]">
                                                    {t("dashboard.matches.failedScreening")}
                                                  </span>
                                                )}
                                              </div>
                                            )}
                                            <span className={`shrink-0 rounded-full px-[10px] py-[3px] text-xs ${color.bg} ${color.text}`}>
                                              {statusLabel(t, applicant.application.status)}
                                            </span>
                                            <span className="ml-auto text-xs text-brand-teal-dark @[34rem]:ml-0">
                                              {t("applicants.viewDetails")}
                                            </span>
                                          </div>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-[16px] lg:sticky lg:top-[85px] lg:max-h-[calc(100svh-105px)] lg:w-[300px] lg:shrink-0 lg:overflow-y-auto">
          {/* Company-wide reply-time stats — not shown to a Hiring manager, who only sees their own jobs. */}
          {fullAccess && (
            <EmployerResponsivenessCard
              responsiveness={responsiveness}
              waitingLong={waitingLong}
              onShowWaiting={() => {
                setStatusFilter("applied");
                document.getElementById("applicants-list")?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
          )}
          <div className={gradientFrameClass("teal")}>
            <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
              <TopMatchesCard initialEnabled={initialSmartMatchEnabled} initialCriteria={initialCriteria} canEditSettings={fullAccess} />
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
