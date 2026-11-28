// The redesign's src/components/EmployerInterviewsView.tsx (the employer's
// Interviews page), ported. Same UI and flow — List / Kanban / Calendar
// views, the response-status tiles, the "Schedule interview" picker
// (posting → shortlisted applicant → the applicant window's scheduling
// form) — on application.listInterviews, with every move going through the
// same actions as the Applicants page and every string through t().
//
// A Panel member sees only the interviews they're on: no scheduling, no
// moving candidates, just the candidate and their own scorecard.
//
// Not in v3 yet (left out): the video pitch badge beside a name
// (VideoPitchBadge).
import { hasFullAccess } from "@jobgiga-app/api/shared/team-roles";
import { useQuery } from "@tanstack/react-query";
import { type ComponentType, useState } from "react";
import { useTranslation } from "react-i18next";
import { ApplicantDetailModal } from "@/components/applicants/applicant-detail-modal";
import { useApplicantActions, useCurrentEmployer } from "@/components/applicants/use-applicant-actions";
import { InterviewCountdown } from "@/components/dashboard/interview-countdown";
import { EmployerDashboardShell } from "@/components/dashboard/employer-dashboard-shell";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import {
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClockIcon,
  FlagIcon,
  SearchIcon,
  UserIcon,
  XCircleIcon,
} from "@/components/landing/icons";
import { Modal } from "@/components/landing/modal";
import {
  type ApplicantRow,
  INTERVIEW_RESPONSE_STATUS_COLOR,
  type InterviewResponseStatus,
  type InterviewsPageData,
} from "@/lib/applicants/status";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { useTeamRole } from "@/lib/team/use-team-role";
import { orpc, queryClient } from "@/utils/orpc";
import { type CalendarInterview, dateLocale } from "./calendar-utils";
import { InterviewBigCalendar } from "./interview-big-calendar";
import { InterviewCalendarCard } from "./interview-calendar-card";

export type InterviewsSearch = { response?: "reschedule_requested" | "no_show" };

const INTERVIEW_RESPONSE_STATUS_ORDER: InterviewResponseStatus[] = [
  "pending",
  "accepted",
  "declined",
  "reschedule_requested",
  "attended",
  "no_show",
];

const INTERVIEW_RESPONSE_STATUS_ICON: Record<
  InterviewResponseStatus,
  ComponentType<{ className?: string; strokeWidth?: number; style?: React.CSSProperties }>
> = {
  pending: ClockIcon,
  accepted: CheckCircleIcon,
  declined: XCircleIcon,
  reschedule_requested: CalendarIcon,
  attended: CheckCircleIcon,
  no_show: FlagIcon,
};

// Same deeper/saturated pastel each response status's colour approximates —
// the gradient-to-white start color + the watermark icon's --icon-accent.
const INTERVIEW_RESPONSE_STATUS_GRADIENT: Record<InterviewResponseStatus, string> = {
  pending: "#FFE1A1",
  accepted: "#A5EBB9",
  declined: "#F9B9B9",
  reschedule_requested: "#FFCDA1",
  attended: "#8CE6D9",
  no_show: "#D4D7DC",
};

const VIEWS = ["list", "kanban", "calendar"] as const;

function ApplicantAvatar({ url }: { url: string | null }) {
  if (!url) {
    return (
      <div className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-[#F1ECFB] text-[#7C5CD1]">
        <UserIcon className="h-[16px] w-[16px]" />
      </div>
    );
  }
  return <img src={url} alt="" className="h-[38px] w-[38px] shrink-0 rounded-full object-cover" />;
}

function InterviewRow({
  applicant,
  onView,
  draggable,
  onDragStart,
  onDragEnd,
  dragging,
}: {
  applicant: ApplicantRow;
  onView: (id: string) => void;
  // Kanban view only — the list view renders a plain click-only row.
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  dragging?: boolean;
}) {
  const { t, i18n } = useTranslation("common");
  const locale = dateLocale(i18n.resolvedLanguage);
  const details = applicant.application.interviewDetails;
  const responseStatus = applicant.application.interviewResponseStatus;
  const responseColor = responseStatus ? INTERVIEW_RESPONSE_STATUS_COLOR[responseStatus] : null;
  return (
    <button
      type="button"
      onClick={() => onView(applicant.application.id)}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`@container flex flex-col gap-[10px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px] text-left transition-colors hover:bg-[#F1F4F8] ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${dragging ? "opacity-40" : ""}`}
    >
      <div className="flex flex-col gap-[8px] @[26rem]:flex-row @[26rem]:items-start @[26rem]:justify-between @[26rem]:gap-[10px]">
        <div className="flex min-w-0 flex-1 items-start gap-[10px]">
          <ApplicantAvatar url={applicant.applicantAvatarUrl} />
          <div className="min-w-0 flex-1">
            {/* Not in v3 yet: the video pitch badge beside the name. */}
            <p className="flex min-w-0 items-center gap-[6px] text-sm text-[#141B2E]">
              <span className="truncate">{applicant.applicantName}</span>
            </p>
            <p className="mt-[1px] truncate text-xs text-[#4B5468]">
              {[applicant.applicantTargetRole, applicant.jobPostingTitle].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-[6px] pl-[48px] @[26rem]:shrink-0 @[26rem]:flex-col @[26rem]:items-end @[26rem]:pl-0">
          {responseStatus && responseColor && (
            <span className={`whitespace-nowrap rounded-full px-[10px] py-[3px] text-xs ${responseColor.bg} ${responseColor.text}`}>
              {t(`applicants.interview.response.${responseStatus}`)}
            </span>
          )}
          <span className="whitespace-nowrap text-xs text-brand-teal-dark">{t("applicants.viewDetails")}</span>
        </div>
      </div>
      {details ? (
        <div className="flex w-full flex-wrap items-center gap-x-[10px] gap-y-[2px] rounded-[10px] bg-[#F1ECFB] px-[10px] py-[6px]">
          <p className="flex shrink-0 items-center gap-[6px] text-xs text-[#7C5CD1]">
            <CalendarIcon className="h-[12px] w-[12px]" />
            {t("interviews.roundMode", { round: details.round, mode: t(`dashboard.interviewModes.${details.mode}`) })}
          </p>
          <p className="shrink-0 text-xs text-[#4B5468]">
            {new Date(details.scheduledAt).toLocaleString(locale, {
              weekday: "short",
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
            {details.durationMinutes ? ` · ${t("applicants.interview.minutes", { count: details.durationMinutes })}` : ""}
          </p>
          {applicant.application.status === "interview" && (
            <InterviewCountdown scheduledAt={details.scheduledAt} className="shrink-0 text-xs text-[#7C5CD1]" />
          )}
        </div>
      ) : (
        <p className="text-xs text-[#9AA3B2]">{t("interviews.noTimeYet")}</p>
      )}
    </button>
  );
}

/** The page: the shell, and the interviews once application.listInterviews has loaded. */
export function EmployerInterviewsView({ search }: { search: InterviewsSearch }) {
  const { t } = useTranslation("common");
  const listQuery = useQuery({ ...orpc.application.listInterviews.queryOptions(), meta: { suppressErrorToast: true } });
  const [view, setView] = useState<(typeof VIEWS)[number]>("list");
  // Bumped by the header's "Schedule interview" — the content opens its picker.
  const [pickerRequest, setPickerRequest] = useState(0);
  const canSchedule = listQuery.data?.canSchedule ?? false;
  const teamRole = useTeamRole();

  return (
    <EmployerDashboardShell
      active="interviews"
      canManage={listQuery.data ? canSchedule : true}
      heading={t("interviews.heading")}
      headerAction={
        <div className="flex flex-wrap items-center gap-[8px]">
          <div className="flex h-[38px] items-center rounded-full border border-black/[0.1] p-[3px]">
            {VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`flex h-[30px] items-center justify-center rounded-full px-[14px] text-sm transition-colors ${
                  view === v ? "bg-brand-teal-dark text-white" : "text-[#4B5468] hover:bg-black/[0.03]"
                }`}
              >
                {t(`interviews.views.${v}`)}
              </button>
            ))}
          </div>
          {canSchedule && (
            <button
              type="button"
              onClick={() => setPickerRequest((n) => n + 1)}
              className="flex h-[38px] items-center justify-center rounded-full bg-brand-teal-dark px-[16px] text-sm text-white hover:opacity-90"
            >
              {t("applicants.interviewForm.schedule")}
            </button>
          )}
        </div>
      }
      subheading={
        listQuery.data && !canSchedule
          ? t("interviews.subheadingPanel")
          : hasFullAccess(teamRole ?? "owner")
            ? t("interviews.subheading")
            : t("interviews.subheadingHiringManager")
      }
    >
      {listQuery.isPending ? (
        <p className="rounded-[14px] bg-white/70 p-[16px] text-center text-xs text-[#9AA3B2]">{t("nav.loading")}</p>
      ) : listQuery.isError ? (
        <div className="rounded-[14px] border border-[#EAD9D6] bg-[#FBF3F1] p-[16px] text-center text-sm text-[#A66A61]">
          {t("interviews.loadError")}
        </div>
      ) : (
        <InterviewsContent data={listQuery.data} search={search} view={view} pickerRequest={pickerRequest} />
      )}
    </EmployerDashboardShell>
  );
}

function InterviewsContent({
  data,
  search,
  view,
  pickerRequest,
}: {
  data: InterviewsPageData;
  search: InterviewsSearch;
  view: (typeof VIEWS)[number];
  pickerRequest: number;
}) {
  const { t, i18n } = useTranslation("common");
  const locale = dateLocale(i18n.resolvedLanguage);
  const { addresses, teamMembers, canSchedule } = data;
  // Shortlisted applicants aren't scheduled yet, so they're left out of the
  // sections below (those filter on status), but being in the same rows lets
  // the "Schedule interview" picker open the same applicant window.
  const rows = [...data.applications, ...data.shortlisted];
  const [viewingId, setViewingId] = useState<string | null>(null);
  // Kanban drag state — dragOverKey highlights the column under the
  // pointer, draggingId dims the card being dragged.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerJobPostingId, setPickerJobPostingId] = useState<string | null>(null);
  const [pickerDate, setPickerDate] = useState<string | null>(null);
  // Set when the window is opened from the applicant picker — no date to
  // pre-fill, but scheduling is the whole point, so the form opens.
  const [openViaSchedulePicker, setOpenViaSchedulePicker] = useState(false);
  const [nameQuery, setNameQuery] = useState("");
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  // Arriving from a dashboard tile ("Reschedules"/"No-shows") lands with
  // that response filter already applied.
  const [responseFilter, setResponseFilter] = useState<InterviewResponseStatus | null>(search.response ?? null);
  const currentUser = useCurrentEmployer(teamMembers);
  const { statusError, updatingId, updateStatus, setAttendance, saveEvaluation, completeEvaluation } = useApplicantActions(
    (applicationId, patch) =>
      queryClient.setQueryData(orpc.application.listInterviews.queryKey(), (old) => {
        if (!old) return old;
        const apply = (list: ApplicantRow[]) => list.map((row) => (row.application.id === applicationId ? patch(row) : row));
        return { ...old, applications: apply(old.applications), shortlisted: apply(old.shortlisted) };
      }),
  );

  // The header's "Schedule interview" (a new request each click).
  const [seenPickerRequest, setSeenPickerRequest] = useState(pickerRequest);
  if (pickerRequest !== seenPickerRequest) {
    setSeenPickerRequest(pickerRequest);
    setPickerDate(null);
    setPickerJobPostingId(null);
    setPickerOpen(true);
  }

  function toggleResponseFilter(status: InterviewResponseStatus) {
    setResponseFilter((prev) => (prev === status ? null : status));
  }

  function openPickerForDate(date: Date) {
    const pad = (n: number) => String(n).padStart(2, "0");
    setPickerDate(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`);
    setPickerJobPostingId(null);
    setPickerOpen(true);
  }
  const viewingApplicant = rows.find((r) => r.application.id === viewingId) ?? null;
  const shortlistedRows = rows.filter((row) => row.application.status === "shortlisted");
  const shortlistedJobPostings = Array.from(
    new Map(shortlistedRows.map((row) => [row.jobPostingId, row.jobPostingTitle])).entries(),
  ).map(([id, title]) => ({
    id,
    title,
    count: shortlistedRows.filter((row) => row.jobPostingId === id).length,
  }));
  const pickerApplicants = pickerJobPostingId ? shortlistedRows.filter((row) => row.jobPostingId === pickerJobPostingId) : [];

  const calendarInterviews: CalendarInterview[] = rows.flatMap((row) =>
    row.application.interviewDetails
      ? [
          {
            applicationId: row.application.id,
            applicantName: row.applicantName,
            jobPostingTitle: row.jobPostingTitle,
            status: row.application.status,
            details: row.application.interviewDetails,
          },
        ]
      : [],
  );

  // Today / this week / this month — calendar windows (Mon-Sun, 1st-end of
  // month), not rolling 7/30-day windows.
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  const startOfWeek = new Date(startOfToday.getTime() - ((startOfToday.getDay() + 6) % 7) * 24 * 60 * 60 * 1000);
  const endOfWeek = new Date(startOfWeek.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  function countInterviewsBetween(start: Date, end: Date) {
    return calendarInterviews.filter((interview) => {
      const scheduledAt = new Date(interview.details.scheduledAt);
      return scheduledAt >= start && scheduledAt < end;
    }).length;
  }

  const interviewCounts = {
    today: countInterviewsBetween(startOfToday, endOfToday),
    thisWeek: countInterviewsBetween(startOfWeek, endOfWeek),
    thisMonth: countInterviewsBetween(startOfMonth, endOfMonth),
  };

  // Soonest interview first — this page is a schedule, not an applied-order feed.
  function bySoonest(a: ApplicantRow, b: ApplicantRow) {
    const aTime = a.application.interviewDetails ? new Date(a.application.interviewDetails.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.application.interviewDetails ? new Date(b.application.interviewDetails.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  }
  const byStatus = (status: string) => rows.filter((row) => row.application.status === status).sort(bySoonest);

  // Only narrows what List/Kanban render — tile counts and the calendar stay
  // based on everything, so a search doesn't make "Today" or the calendar lie.
  const trimmedNameQuery = nameQuery.trim().toLowerCase();
  const hasActiveFilter = !!responseFilter || !!trimmedNameQuery;
  function matchesFilters(row: ApplicantRow) {
    return (
      (!trimmedNameQuery || row.applicantName.toLowerCase().includes(trimmedNameQuery)) &&
      (!responseFilter || row.application.interviewResponseStatus === responseFilter)
    );
  }

  const sections = [
    { key: "interview", pillBg: "bg-[#F1ECFB]", pillText: "text-[#7C5CD1]" },
    { key: "interviewed", pillBg: "bg-[#E8F1FF]", pillText: "text-[#2B6CB0]" },
    { key: "evaluation", pillBg: "bg-[#FFE9D6]", pillText: "text-[#B45309]" },
    { key: "evaluated", pillBg: "bg-[#EDFBF4]", pillText: "text-[#0F9D6C]" },
  ].map((section) => ({
    ...section,
    label: t(`interviews.sections.${section.key}`),
    rows: byStatus(section.key).filter(matchesFilters),
    empty: hasActiveFilter ? t("interviews.noMatch") : t(`interviews.empty.${section.key}`),
  }));

  function closeWindow() {
    setViewingId(null);
    setPickerDate(null);
    setOpenViaSchedulePicker(false);
  }

  return (
    <>
      {canSchedule && (
        <div className={`animate-fade-in-up ${gradientFrameClass("teal")} mx-auto w-full max-w-[1440px]`}>
          <div className="relative overflow-hidden rounded-[19px] bg-white p-[16px] sm:p-[22px]">
            {!howItWorksOpen && (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-x-0 bottom-0 h-[70px] overflow-hidden rounded-b-[19px] sm:h-[95px] lg:h-[130px]"
              >
                {/* The ribbon is much taller than this crop window — the
                    negative margin lands the visible slice on its colour. */}
                <div className="-mt-[67px] sm:-mt-[92px] lg:-mt-[125px]">
                  <AnimatedRibbon />
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => setHowItWorksOpen((o) => !o)}
              aria-expanded={howItWorksOpen}
              className="relative flex w-full items-center gap-[8px] text-left"
            >
              <p className="text-sm text-[#141B2E]">{t("interviews.howItWorks.title")}</p>
              <ChevronDownIcon
                className={`ml-auto h-[10px] w-[10px] text-[#9AA3B2] transition-transform ${howItWorksOpen ? "" : "-rotate-90"}`}
              />
            </button>
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                howItWorksOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <div className="mt-[12px] grid grid-cols-1 gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
                  {([1, 2, 3, 4] as const).map((step) => (
                    <div key={step} className="flex flex-col gap-[4px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px]">
                      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-teal-dark text-xs text-white">
                        {step}
                      </span>
                      <p className="mt-[4px] text-xs text-[#141B2E]">{t(`interviews.howItWorks.step${step}.title`)}</p>
                      <p className="text-xs text-[#4B5468]">{t(`interviews.howItWorks.step${step}.detail`)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={`animate-fade-in-up ${gradientFrameClass("teal")} mx-auto w-full max-w-[1440px] ${canSchedule ? "mt-[20px]" : ""}`}
        style={{ animationDelay: "60ms" }}
      >
        <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <p className="mb-[12px] text-sm text-[#141B2E]">{t("interviews.statusTitle")}</p>
          <div className="grid grid-cols-2 gap-[12px] sm:grid-cols-3 lg:grid-cols-6">
            {INTERVIEW_RESPONSE_STATUS_ORDER.map((responseStatus) => {
              const count = rows.filter((row) => row.application.interviewResponseStatus === responseStatus).length;
              const color = INTERVIEW_RESPONSE_STATUS_COLOR[responseStatus];
              const Icon = INTERVIEW_RESPONSE_STATUS_ICON[responseStatus];
              const gradient = INTERVIEW_RESPONSE_STATUS_GRADIENT[responseStatus];
              const isActive = responseFilter === responseStatus;
              return (
                <button
                  type="button"
                  key={responseStatus}
                  disabled={count === 0}
                  onClick={() => toggleResponseFilter(responseStatus)}
                  style={{ backgroundImage: `linear-gradient(to bottom, ${gradient}, white 90%)` }}
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
                  <span className={`relative text-xs ${color.text}`}>{t(`applicants.interview.response.${responseStatus}`)}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {view !== "calendar" && (
        <div className="animate-fade-in-up mx-auto mt-[20px] flex w-full max-w-[1440px] flex-wrap items-center gap-[8px]" style={{ animationDelay: "90ms" }}>
          <div className="flex min-w-[200px] flex-1 items-center gap-[8px] rounded-[12px] border border-black/[0.1] bg-white px-[12px] focus-within:border-brand-teal-dark">
            <SearchIcon className="h-[13px] w-[13px] shrink-0 text-[#9AA3B2]" />
            <input
              type="search"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder={t("interviews.searchPlaceholder")}
              aria-label={t("interviews.searchLabel")}
              className="h-[38px] w-full bg-transparent text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2]"
            />
          </div>
          {hasActiveFilter && (
            <button
              type="button"
              onClick={() => {
                setResponseFilter(null);
                setNameQuery("");
              }}
              className="shrink-0 text-sm text-brand-teal-dark hover:underline"
            >
              {t("applicants.clearFilter")}
            </button>
          )}
        </div>
      )}
      {view !== "calendar" && responseFilter && (
        <p className="mx-auto mt-[6px] w-full max-w-[1440px] text-xs text-[#9AA3B2]">
          {t("interviews.showingOnlyBefore")}
          <span className="text-[#4B5468]">{t(`applicants.interview.response.${responseFilter}`)}</span>
          {t("interviews.showingOnlyAfter")}
        </p>
      )}

      {view === "calendar" ? (
        <div className={`animate-fade-in-up ${gradientFrameClass("teal")} mx-auto mt-[20px] w-full max-w-[1440px]`} style={{ animationDelay: "120ms" }}>
          <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
            <InterviewBigCalendar
              interviews={calendarInterviews}
              onSelectInterview={setViewingId}
              onScheduleDate={canSchedule ? openPickerForDate : undefined}
            />
          </div>
        </div>
      ) : view === "kanban" ? (
        <div className="mx-auto mt-[12px] grid w-full max-w-[1440px] grid-cols-1 gap-[16px] sm:grid-cols-2 lg:grid-cols-4 lg:items-start">
          {statusError && <p className="col-span-full text-xs text-red-500">{statusError}</p>}
          {sections.map((col, index) => (
            <div
              key={col.key}
              onDragOver={(e) => {
                if (!draggingId) return;
                e.preventDefault();
                setDragOverKey(col.key);
              }}
              onDragLeave={() => setDragOverKey((k) => (k === col.key ? null : k))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverKey(null);
                const id = e.dataTransfer.getData("text/plain");
                const row = rows.find((r) => r.application.id === id);
                setDraggingId(null);
                if (!row || row.application.status === col.key) return;
                // Every cross-column move needs a real action first (marking
                // attendance, saving an evaluation) — so a drop opens that
                // applicant to complete it, rather than flipping the status.
                setViewingId(id);
              }}
              style={{ animationDelay: `${120 + index * 40}ms` }}
              className={`animate-fade-in-up ${gradientFrameClass("teal")} rounded-[20px] transition-shadow ${
                dragOverKey === col.key ? "ring-2 ring-brand-teal-dark ring-offset-2" : ""
              }`}
            >
              <div className="flex flex-col rounded-[19px] bg-white p-[18px]">
                <div className="flex items-center gap-[8px]">
                  <p className="text-sm text-[#141B2E]">{col.label}</p>
                  <span className={`rounded-full px-[10px] py-[3px] text-xs ${col.pillBg} ${col.pillText}`}>{col.rows.length}</span>
                </div>
                {col.rows.length === 0 ? (
                  <p className="mt-[14px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-xs text-[#9AA3B2]">{col.empty}</p>
                ) : (
                  <div className="mt-[14px] flex max-h-[70vh] flex-col gap-[10px] overflow-y-auto">
                    {col.rows.map((applicant) => (
                      <InterviewRow
                        key={applicant.application.id}
                        applicant={applicant}
                        onView={setViewingId}
                        // Dragging opens the candidate to move them — only for those who can.
                        draggable={applicant.canManage !== false}
                        dragging={draggingId === applicant.application.id}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", applicant.application.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(applicant.application.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDragOverKey(null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mx-auto mt-[12px] flex w-full max-w-[1440px] flex-col gap-[20px] lg:flex-row lg:items-start">
          <div className="flex flex-col gap-[16px] lg:sticky lg:top-[85px] lg:w-[300px] lg:shrink-0">
            <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "120ms" }}>
              <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
                <p className="mb-[12px] text-sm text-[#141B2E]">{t("interviews.calendar.title")}</p>
                <div className="flex flex-col gap-[12px]">
                  {(["today", "thisWeek", "thisMonth"] as const).map((key) => (
                    <div key={key} className="flex flex-col gap-[4px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px]">
                      <div className="flex items-start justify-between">
                        <span className="text-xl text-[#141B2E]">{interviewCounts[key]}</span>
                        <CalendarIcon className="h-[16px] w-[16px] text-[#9AA3B2]" />
                      </div>
                      <span className="text-xs text-[#4B5468]">{t(`interviews.calendar.${key}`)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-[16px] border-t border-black/[0.06] pt-[16px]">
                  <InterviewCalendarCard interviews={calendarInterviews} onScheduleDate={canSchedule ? openPickerForDate : undefined} />
                </div>
              </div>
            </div>
          </div>

          <div className={`animate-fade-in-up ${gradientFrameClass("teal")} min-w-0 lg:flex-1`} style={{ animationDelay: "180ms" }}>
            <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
              {statusError && <p className="text-xs text-red-500">{statusError}</p>}
              {sections.map((section, index) => (
                <div key={section.key} id={`interviews-${section.key}`}>
                  <div
                    className={`flex items-center gap-[8px] ${index > 0 ? "mt-[24px] border-t border-black/[0.06] pt-[24px]" : ""}`}
                  >
                    <p className="text-sm text-[#141B2E]">{section.label}</p>
                    <span className={`rounded-full px-[10px] py-[3px] text-xs ${section.pillBg} ${section.pillText}`}>
                      {section.rows.length}
                    </span>
                  </div>
                  {section.rows.length === 0 ? (
                    <p className="mt-[14px] rounded-[14px] bg-[#F8FAFB] p-[16px] text-xs text-[#9AA3B2]">{section.empty}</p>
                  ) : (
                    <div className="mt-[14px] flex flex-col gap-[10px]">
                      {section.rows.map((applicant) => (
                        <InterviewRow key={applicant.application.id} applicant={applicant} onView={setViewingId} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
          onClose={closeWindow}
          initialInterviewDate={pickerDate ?? undefined}
          autoOpenInterviewForm={openViaSchedulePicker}
        />
      )}

      {pickerOpen && !pickerJobPostingId && (
        <Modal onClose={() => setPickerOpen(false)} ariaLabel={t("interviews.picker.title")}>
          <h2 className="text-lg font-semibold text-[#141B2E]">
            {pickerDate
              ? t("interviews.picker.titleOn", {
                  date: new Date(`${pickerDate}T00:00`).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" }),
                })
              : t("interviews.picker.title")}
          </h2>
          <p className="mt-[4px] text-xs text-[#4B5468]">{t("interviews.picker.pickPosting")}</p>
          {shortlistedJobPostings.length === 0 ? (
            <p className="mt-[16px] rounded-[12px] bg-[#F8FAFB] p-[14px] text-xs text-[#9AA3B2]">{t("interviews.picker.noneShortlisted")}</p>
          ) : (
            <div className="mt-[16px] flex max-h-[360px] flex-col gap-[8px] overflow-y-auto">
              {shortlistedJobPostings.map((posting) => (
                <button
                  key={posting.id}
                  type="button"
                  onClick={() => setPickerJobPostingId(posting.id)}
                  className="flex items-center justify-between gap-[10px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px] text-left transition-colors hover:bg-[#F1F4F8]"
                >
                  <span className="truncate text-xs text-[#141B2E]">{posting.title}</span>
                  <span className="shrink-0 rounded-full bg-[#F1ECFB] px-[9px] py-[2px] text-xs text-[#7C5CD1]">
                    {t("interviews.picker.shortlistedCount", { count: posting.count })}
                  </span>
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setPickerOpen(false)}
            className="mt-[16px] flex h-[36px] w-full items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03]"
          >
            {t("applicants.cancel")}
          </button>
        </Modal>
      )}

      {pickerOpen && pickerJobPostingId && (
        <Modal onClose={() => setPickerOpen(false)} ariaLabel={t("interviews.picker.pickApplicantLabel")}>
          <button type="button" onClick={() => setPickerJobPostingId(null)} className="text-sm text-[#4B5468] hover:text-[#141B2E]">
            ← {t("interviews.picker.backToPostings")}
          </button>
          <h2 className="mt-[10px] text-lg font-semibold text-[#141B2E]">
            {pickerApplicants[0]?.jobPostingTitle ?? t("interviews.picker.shortlistedApplicants")}
          </h2>
          <p className="mt-[4px] text-xs text-[#4B5468]">{t("interviews.picker.pickApplicant")}</p>
          <div className="mt-[16px] flex max-h-[360px] flex-col gap-[8px] overflow-y-auto">
            {pickerApplicants.map((applicant) => (
              <button
                key={applicant.application.id}
                type="button"
                onClick={() => {
                  setPickerOpen(false);
                  setOpenViaSchedulePicker(true);
                  setViewingId(applicant.application.id);
                }}
                className="flex items-center gap-[10px] rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[10px] text-left transition-colors hover:bg-[#F1F4F8]"
              >
                <ApplicantAvatar url={applicant.applicantAvatarUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs text-[#141B2E]">{applicant.applicantName}</p>
                  {applicant.applicantTargetRole && (
                    <p className="mt-[1px] truncate text-xs text-[#4B5468]">{applicant.applicantTargetRole}</p>
                  )}
                </div>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(false)}
            className="mt-[16px] flex h-[36px] w-full items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03]"
          >
            {t("applicants.cancel")}
          </button>
        </Modal>
      )}
    </>
  );
}
