// The redesign's src/components/ApplicantDetailModal.tsx, ported: an
// applicant's full profile beside their hiring stage — move them along,
// schedule (or reschedule) the interview with its panel, mark attendance,
// and each panelist's scorecard. Same UI and flow; the full profile comes
// from application.applicantProfile, and every string goes through t().
//
// Not in v3 yet (left out):
// - Video pitches (VideoPitchPanel) and the AI interview (AiInterviewPanel).
// - The "panel" variant (the same profile beside the JobGiga Assistant's chat).
import { ageFromBirthYear } from "@jobgiga-app/api/shared/age";
import type { EmployerAddress } from "@jobgiga-app/api/shared/employer-profile";
import {
  averageScore,
  EVALUATION_CRITERIA,
  type EvaluationCriterion,
  isPanelEvaluationComplete,
  type InterviewRecommendation,
  type PanelEvaluation,
  RECOMMENDATION_COLOR,
} from "@jobgiga-app/api/shared/interview-evaluation";
import { formatSpokenLanguage } from "@jobgiga-app/api/shared/languages";
import { formatWorkPlaces } from "@jobgiga-app/api/shared/work-locations";
import { useQuery } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { InterviewCountdown } from "@/components/dashboard/interview-countdown";
import { DatePicker } from "@/components/form/date-picker";
import { PhoneVerifiedAvatarBadge } from "@/components/form/phone-verified-avatar-badge";
import { TimePicker } from "@/components/form/time-picker";
import { RichTextContent } from "@/components/jobs/rich-text-content";
import { Dropdown } from "@/components/landing/dropdown";
import { CheckIcon, ChevronDownIcon, FileIcon, PlusIcon, UserIcon, XIcon } from "@/components/landing/icons";
import {
  type ApplicantRow,
  type EmployerTeamMember,
  expectedSalaryText,
  INTERVIEW_RESPONSE_STATUS_COLOR,
  type InterviewDetails,
} from "@/lib/applicants/status";
import { APPLICATION_STATUS_COLOR, relativeTimeAgo, statusLabel } from "@/lib/dashboard/pipeline";
import { orpc } from "@/utils/orpc";
import { SalaryFitBadge } from "./salary-fit-badge";

const PIPELINE_STATUSES = ["applied", "screened", "shortlisted", "interview", "interviewed", "evaluation", "evaluated", "offer", "hired"];
const INTERVIEW_MODES: InterviewDetails["mode"][] = ["onsite", "online", "phone"];
const RECOMMENDATIONS: InterviewRecommendation[] = ["strong_hire", "hire", "no_hire", "strong_no_hire"];

/** What the scheduling form sends (application.updateStatus's interviewDetails). */
export type InterviewDetailsInput = {
  round: number;
  mode: InterviewDetails["mode"];
  scheduledAt: string;
  durationMinutes: number | null;
  location: string | null;
  meetingLink: string | null;
  interviewerUserIds: string[];
  notes: string | null;
};

/** "Full-time", "1 week notice"… — a known value's words, else the value itself. */
export function optionLabel(t: TFunction, group: string, value: string | null | undefined, fallback?: string): string {
  if (!value) return fallback ?? t("applicants.notSet");
  return t(`${group}.${value}`, { defaultValue: value });
}

const inputClass =
  "h-[34px] w-full rounded-[10px] border border-black/[0.1] px-[10px] text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2] focus:border-brand-teal-dark";

function splitDateTime(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

type InterviewerOption = { value: string; name: string; position: string | null; avatarUrl: string | null };

// Same avatar+name+position look as the locked scheduler chip, but pickable
// (not a plain-text Dropdown) — so a team member's photo shows up once
// chosen, not just a name string.
function InterviewerPicker({
  value,
  options,
  onChange,
}: {
  value: string;
  options: InterviewerOption[];
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex h-[52px] w-full items-center gap-[10px] rounded-[12px] border border-black/[0.1] px-[10px] text-left outline-none focus:border-brand-teal-dark"
      >
        {selected?.avatarUrl ? (
          <img src={selected.avatarUrl} referrerPolicy="no-referrer" alt="" className="h-[28px] w-[28px] shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-[#F1F4F8] text-[#9AA3B2]">
            <UserIcon className="h-[14px] w-[14px]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          {selected ? (
            <>
              <p className="truncate text-sm text-[#141B2E]">{selected.name}</p>
              {selected.position && <p className="truncate text-xs text-[#9AA3B2]">{selected.position}</p>}
            </>
          ) : (
            <p className="truncate text-sm text-[#9AA3B2]">{t("applicants.modal.selectMember")}</p>
          )}
        </div>
        <ChevronDownIcon className={`h-[11px] w-[11px] shrink-0 text-[#9AA3B2] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-10 mt-[6px] w-full rounded-[12px] border border-black/[0.1] bg-white p-[6px] shadow-[0_8px_24px_-8px_rgba(20,27,46,0.2)]">
          <ul role="listbox" className="flex max-h-[240px] flex-col gap-[2px] overflow-y-auto">
            {options.length === 0 ? (
              <li className="px-[10px] py-[10px] text-sm text-[#9AA3B2]">{t("applicants.modal.noMembers")}</li>
            ) : (
              options.map((option) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center gap-[8px] rounded-[8px] px-[8px] py-[6px] text-left transition-colors hover:bg-[#F1F4F8] ${
                      option.value === value ? "bg-[#F1F4F8]" : ""
                    }`}
                  >
                    {option.avatarUrl ? (
                      <img src={option.avatarUrl} referrerPolicy="no-referrer" alt="" className="h-[24px] w-[24px] shrink-0 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full bg-[#F1F4F8] text-[#9AA3B2]">
                        <UserIcon className="h-[12px] w-[12px]" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[#141B2E]">{option.name}</p>
                      {option.position && <p className="truncate text-xs text-[#9AA3B2]">{option.position}</p>}
                    </div>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ApplicantDetailModal({
  applicant,
  updating,
  onUpdateStatus,
  onSetAttendance,
  onSaveEvaluation,
  onCompleteEvaluation,
  savingEvaluation,
  onClose,
  initialInterviewDate,
  autoOpenInterviewForm,
  addresses = [],
  currentUserId,
  currentUserIsOwner = false,
  currentUserName,
  currentUserAvatarUrl,
  currentUserRole,
  teamMembers = [],
}: {
  applicant: ApplicantRow;
  updating: boolean;
  onUpdateStatus: (status: string, interviewDetails?: InterviewDetailsInput) => void;
  onSetAttendance?: (status: "attended" | "no_show") => void;
  onSaveEvaluation?: (
    scores: Partial<Record<EvaluationCriterion, number>>,
    recommendation: InterviewRecommendation,
    notes: string,
  ) => void;
  // Owner-only: close out the evaluation without waiting for the rest of the panel.
  onCompleteEvaluation?: () => void;
  savingEvaluation?: boolean;
  onClose: () => void;
  // Set when opened by picking a date on the interview calendar — pre-fills
  // and auto-expands the scheduling form ("YYYY-MM-DD").
  initialInterviewDate?: string;
  // Set when opened straight from a "pick who to schedule" flow — auto-
  // expands the scheduling form even though there's no date to pre-fill.
  autoOpenInterviewForm?: boolean;
  // The employer's saved office addresses (Company Profile) — an onsite
  // interview can reuse one instead of retyping it.
  addresses?: EmployerAddress[];
  // The signed-in employer — pre-filled as the first interviewer on a
  // brand-new interview, and how the evaluation section knows whether
  // they're on the panel (and so owe a scorecard).
  currentUserId?: string | null;
  currentUserIsOwner?: boolean;
  currentUserName?: string | null;
  currentUserAvatarUrl?: string | null;
  currentUserRole?: string | null;
  // The company's team — panelists are picked from here (active members
  // only), so an interviewer is always a real account.
  teamMembers?: EmployerTeamMember[];
}) {
  const { t, i18n } = useTranslation("common");
  const locale = i18n.resolvedLanguage === "ms" ? "ms-MY" : "en-US";
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  // Interview details waiting on the "send this invite?" confirmation.
  const [confirmingInterview, setConfirmingInterview] = useState(false);
  const [showInterviewForm, setShowInterviewForm] = useState(!!initialInterviewDate || !!autoOpenInterviewForm);
  const profileQuery = useQuery({
    ...orpc.application.applicantProfile.queryOptions({ input: { id: applicant.application.id } }),
    meta: { suppressErrorToast: true },
  });
  const fullProfile = profileQuery.data?.profile ?? null;

  // Each panelist fills in their own scorecard — the form only ever edits
  // the signed-in user's, never someone else's.
  const panelEvaluations: PanelEvaluation[] = applicant.evaluations ?? [];
  const myEvaluation = currentUserId ? (panelEvaluations.find((e) => e.evaluatorUserId === currentUserId) ?? null) : null;
  const [evaluationScores, setEvaluationScores] = useState<Partial<Record<EvaluationCriterion, number>>>(
    myEvaluation?.scores ?? {},
  );
  const [evaluationRecommendation, setEvaluationRecommendation] = useState<InterviewRecommendation | null>(
    myEvaluation?.recommendation ?? null,
  );
  const [evaluationNotes, setEvaluationNotes] = useState(myEvaluation?.notes ?? "");
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluationLocked, setEvaluationLocked] = useState(!!myEvaluation);

  const existing = applicant.application.interviewDetails;
  const isAtOrPastInterviewStage = !["applied", "screened", "shortlisted"].includes(applicant.application.status);
  // Evaluation only unlocks once the employer has explicitly marked
  // attendance — the scheduled time passing on its own isn't enough.
  const interviewHasHappened =
    !!existing &&
    isAtOrPastInterviewStage &&
    (applicant.application.interviewResponseStatus === "no_show" ||
      (applicant.application.interviewResponseStatus === "attended" &&
        applicant.application.jobseekerConfirmedAttendance === true));
  // Attendance is marked, but the employer hasn't explicitly moved into
  // "Evaluation" yet — a hard-to-miss prompt so it isn't forgotten.
  const readyToStartEvaluation = interviewHasHappened && applicant.application.status === "interviewed";
  // The score form (or its saved summary) only shows once they're really in
  // the Evaluation step, so "Evaluated" can only come from finishing it.
  const canEvaluate =
    interviewHasHappened && (applicant.application.status === "evaluation" || applicant.application.status === "evaluated");
  const existingDateTime = splitDateTime(existing?.scheduledAt ?? null);
  // Captured once at mount — the modal is short-lived, so a mount-time
  // snapshot is accurate enough for "has the interview time passed yet".
  const [openedAt] = useState(() => Date.now());
  const todayIsoDate = splitDateTime(new Date(openedAt).toISOString()).date;
  const [round, setRound] = useState(existing ? existing.round : 1);
  const [mode, setMode] = useState<InterviewDetails["mode"]>(existing?.mode ?? "onsite");
  const [date, setDate] = useState(existingDateTime.date || initialInterviewDate || todayIsoDate);
  const [time, setTime] = useState(existingDateTime.time);
  const [durationMinutes, setDurationMinutes] = useState(existing?.durationMinutes ? String(existing.durationMinutes) : "60");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [meetingLink, setMeetingLink] = useState(existing?.meetingLink ?? "");
  // Panel slots hold team-member account ids (each one owes an evaluation).
  const activeMembers = teamMembers.filter((m) => m.status === "active" && m.userId);
  const memberName = (m: EmployerTeamMember) => m.name || m.email;
  const [interviewers, setInterviewers] = useState<string[]>(() => {
    // Someone who has since left the team can't stay on the panel (the
    // server would reject the save) — drop them.
    if (existing?.interviewerUserIds?.length) {
      return existing.interviewerUserIds.filter((id) => activeMembers.some((m) => m.userId === id));
    }
    // Brand-new interview — default the first slot to whoever's scheduling
    // it, followed by the posting's Hiring managers (removable).
    if (!existing) {
      const managers = (applicant.hiringManagerUserIds ?? []).filter(
        (id) => id !== currentUserId && activeMembers.some((m) => m.userId === id),
      );
      return currentUserId ? [currentUserId, ...managers] : managers;
    }
    return [];
  });
  const canManage = applicant.canManage !== false;
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  const status = applicant.application.status;
  const currentIndex = PIPELINE_STATUSES.indexOf(status);
  const isTerminal = status === "rejected" || status === "withdrawn";
  const color = APPLICATION_STATUS_COLOR[status] ?? APPLICATION_STATUS_COLOR.applied!;
  const criterionLabel = (c: EvaluationCriterion) => t(`applicants.evaluation.criteria.${c}`);
  const recommendationLabel = (r: InterviewRecommendation) => t(`applicants.evaluation.recommendations.${r}`);

  // Screened -> Shortlisted just needs a deliberate confirm. Shortlisted ->
  // Interview needs real scheduling details, not just a status flip.
  function handleStageClick(next: string) {
    if (next === "shortlisted" && status === "screened") {
      setPendingStatus(next);
      return;
    }
    if (next === "interview") {
      setFormError(null);
      setConfirmingInterview(false);
      setShowInterviewForm(true);
      return;
    }
    // Interviewed only comes from the Attendance buttons, and Evaluated only
    // from actually saving scores (the server rejects a direct update).
    if (next === "interviewed" && status === "interview") return;
    if (next === "evaluated" && status !== "evaluation") return;
    onUpdateStatus(next);
  }

  function confirmPendingStatus() {
    if (!pendingStatus) return;
    onUpdateStatus(pendingStatus);
    setPendingStatus(null);
  }

  /** The form as it stands now, checked — or null (with the problem shown). */
  function readInterviewForm(): InterviewDetailsInput | null {
    if (!date || !time) {
      setFormError(t("applicants.modal.errors.pickDateTime"));
      return null;
    }
    const scheduledAt = new Date(`${date}T${time}`);
    if (Number.isNaN(scheduledAt.getTime())) {
      setFormError(t("applicants.modal.errors.invalidDateTime"));
      return null;
    }
    if (mode === "onsite" && !location.trim()) {
      setFormError(t("applicants.modal.errors.addLocation"));
      return null;
    }
    if (mode === "online" && !meetingLink.trim()) {
      setFormError(t("applicants.modal.errors.addMeetingLink"));
      return null;
    }

    setFormError(null);
    return {
      round,
      mode,
      scheduledAt: scheduledAt.toISOString(),
      durationMinutes: durationMinutes.trim() ? Number(durationMinutes) : null,
      location: mode === "onsite" ? location.trim() : location.trim() || null,
      meetingLink: mode === "online" ? meetingLink.trim() : meetingLink.trim() || null,
      interviewerUserIds: interviewers.filter((id) => id.length > 0),
      notes: notes.trim() || null,
    };
  }

  function submitInterviewDetails() {
    // Sending (or changing) an invite reaches the candidate, so it waits
    // for an explicit "yes" — see the confirm box under the form.
    if (readInterviewForm()) setConfirmingInterview(true);
  }

  function confirmInterviewDetails() {
    // Read again: the form stays editable under the confirm box, and the
    // candidate must get what it shows.
    const details = readInterviewForm();
    setConfirmingInterview(false);
    if (!details) return;
    onUpdateStatus("interview", details);
    setShowInterviewForm(false);
  }

  function setScore(criterion: EvaluationCriterion, value: number) {
    setEvaluationScores((prev) => ({ ...prev, [criterion]: value }));
  }

  function submitEvaluation() {
    if (Object.keys(evaluationScores).length === 0) {
      setEvaluationError(t("applicants.evaluation.errors.rateOne"));
      return;
    }
    if (!evaluationRecommendation) {
      setEvaluationError(t("applicants.evaluation.errors.pickRecommendation"));
      return;
    }
    setEvaluationError(null);
    onSaveEvaluation?.(evaluationScores, evaluationRecommendation, evaluationNotes.trim());
    setEvaluationLocked(true);
  }

  const age = fullProfile ? ageFromBirthYear(fullProfile.birthYear) : null;
  const workPlaces = fullProfile ? formatWorkPlaces(fullProfile.preferredWorkPlaces) : null;
  const inInterviewSteps = ["interview", "interviewed", "evaluation", "evaluated"].includes(status);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("applicants.modal.ariaLabel", { name: applicant.applicantName })}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-16px_rgba(0,0,0,0.24)]"
      >
        <div className="flex items-start justify-between gap-[12px] border-b border-black/[0.06] px-[22px] py-[18px]">
          <div className="flex items-start gap-[12px]">
            <div className="relative shrink-0">
              {applicant.applicantAvatarUrl ? (
                <img
                  src={applicant.applicantAvatarUrl}
                  referrerPolicy="no-referrer"
                  alt=""
                  className="h-[46px] w-[46px] shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full bg-brand-teal-soft text-brand-teal-dark">
                  <UserIcon className="h-[20px] w-[20px]" />
                </div>
              )}
              {applicant.applicantPhoneVerified && <PhoneVerifiedAvatarBadge size={18} />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#141B2E]">{applicant.applicantName}</h2>
              {applicant.applicantTargetRole && (
                <p className="mt-[1px] text-xs text-[#4B5468]">{applicant.applicantTargetRole}</p>
              )}
              <p className="mt-[2px] text-xs text-[#9AA3B2]">
                {t("applicants.modal.appliedFor", {
                  title: applicant.jobPostingTitle,
                  ago: relativeTimeAgo(t, applicant.application.appliedAt),
                })}
              </p>
              {applicant.applicantPhoneVerified && (
                <p className="mt-[6px] inline-flex items-center gap-[5px] rounded-full bg-[#E8F7EE] px-[10px] py-[2px] text-xs text-[#2F9E56]">
                  <CheckIcon className="h-[8px] w-[8px]" />
                  {t("form.phone.verified")}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.06] hover:text-[#141B2E]"
          >
            <XIcon className="h-[12px] w-[12px]" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto px-[22px] pt-[18px] pb-[40px] sm:basis-2/3">
            {/* Not in v3 yet: the video pitch (VideoPitchPanel) and the AI
                interview (AiInterviewPanel) went here, above the details. */}
            <div>
              <p className="text-xs text-[#141B2E]">{t("applicants.modal.candidateDetails")}</p>
              <div className="mt-[10px] grid grid-cols-1 gap-x-[16px] gap-y-[10px] sm:grid-cols-2">
                <div>
                  <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.location")}</p>
                  <p className="text-xs text-[#141B2E]">{applicant.applicantLocation || t("applicants.notSet")}</p>
                </div>
                <div>
                  <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.experience")}</p>
                  <p className="text-xs text-[#141B2E]">
                    {applicant.applicantYearsExperience === null
                      ? t("applicants.notSet")
                      : t("applicants.modal.years", { count: applicant.applicantYearsExperience })}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.employmentType")}</p>
                  <p className="text-xs text-[#141B2E]">
                    {optionLabel(t, "dashboard.employmentTypes", applicant.applicantEmploymentType)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.workArrangement")}</p>
                  <p className="text-xs text-[#141B2E]">
                    {optionLabel(t, "dashboard.workArrangements", applicant.applicantWorkArrangement)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.expectedSalary")}</p>
                  <p className="flex flex-wrap items-center gap-x-[6px] gap-y-[2px] text-xs text-[#141B2E]">
                    <span>{expectedSalaryText(applicant.applicantExpectedSalaryMin, applicant.applicantExpectedSalaryMax)}</span>
                    <SalaryFitBadge
                      expectedMin={applicant.applicantExpectedSalaryMin}
                      expectedMax={applicant.applicantExpectedSalaryMax}
                      postingMin={applicant.postingSalaryMin}
                      postingMax={applicant.postingSalaryMax}
                      postingPeriod={applicant.postingSalaryPeriod}
                    />
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.noticePeriod")}</p>
                  <p className="text-xs text-[#141B2E]">{optionLabel(t, "applicants.noticePeriods", applicant.applicantNoticePeriod)}</p>
                </div>
              </div>

              {applicant.applicantSkills.length > 0 && (
                <div className="mt-[14px]">
                  <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.skills")}</p>
                  <div className="mt-[6px] flex flex-wrap gap-[6px]">
                    {applicant.applicantSkills.map((skill) => (
                      <span key={skill} className="rounded-full bg-brand-teal-dark px-[10px] py-[4px] text-xs text-white">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {profileQuery.isPending && <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.loadingProfile")}</p>}
            {profileQuery.isError && (
              <p className="text-xs text-red-500">{profileQuery.error.message || t("applicants.modal.profileError")}</p>
            )}

            {fullProfile && (
              <>
                {fullProfile.bio && (
                  <div>
                    <p className="text-xs text-[#141B2E]">{t("applicants.modal.about")}</p>
                    <RichTextContent html={fullProfile.bio} className="mt-[4px] text-xs text-[#4B5468]" />
                  </div>
                )}

                <div>
                  <p className="text-xs text-[#141B2E]">{t("applicants.modal.contactPersonal")}</p>
                  <div className="mt-[10px] grid grid-cols-1 gap-x-[16px] gap-y-[10px] sm:grid-cols-2">
                    {fullProfile.phone && (
                      <div>
                        <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.phone")}</p>
                        <p className="text-xs text-[#141B2E]">{fullProfile.phone}</p>
                      </div>
                    )}
                    {age !== null && (
                      <div>
                        <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.age")}</p>
                        <p className="text-xs text-[#141B2E]">{age}</p>
                      </div>
                    )}
                    {workPlaces && (
                      <div>
                        <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.preferredWorkLocation")}</p>
                        <p className="text-xs text-[#141B2E]">{workPlaces}</p>
                      </div>
                    )}
                    {fullProfile.gender && (
                      <div>
                        <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.gender")}</p>
                        <p className="text-xs text-[#141B2E]">
                          {optionLabel(t, "jobseekerOnboarding.options.gender", fullProfile.gender)}
                        </p>
                      </div>
                    )}
                    {fullProfile.maritalStatus && (
                      <div>
                        <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.maritalStatus")}</p>
                        <p className="text-xs text-[#141B2E]">
                          {optionLabel(t, "jobseekerOnboarding.options.maritalStatus", fullProfile.maritalStatus)}
                        </p>
                      </div>
                    )}
                    {fullProfile.nationality && (
                      <div>
                        <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.nationality")}</p>
                        <p className="text-xs text-[#141B2E]">{fullProfile.nationality}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.workAuthorization")}</p>
                      <p className="text-xs text-[#141B2E]">
                        {optionLabel(t, "landing.jobs.workAuthorizationType", fullProfile.workAuthorization)}
                      </p>
                    </div>
                    {fullProfile.drivingLicense && (
                      <div>
                        <p className="text-xs text-[#9AA3B2]">{t("applicants.modal.drivingLicense")}</p>
                        <p className="text-xs text-[#141B2E]">
                          {optionLabel(t, "employerJobs.drivingLicenses", fullProfile.drivingLicense)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {(fullProfile.linkedinUrl || fullProfile.portfolioUrl || fullProfile.githubUrl) && (
                  <div>
                    <p className="text-xs text-[#141B2E]">{t("applicants.modal.links")}</p>
                    <div className="mt-[6px] flex flex-wrap gap-[8px] text-xs">
                      {fullProfile.linkedinUrl && (
                        <a href={fullProfile.linkedinUrl} target="_blank" rel="noopener noreferrer" className="text-brand-teal-dark hover:underline">
                          LinkedIn
                        </a>
                      )}
                      {fullProfile.portfolioUrl && (
                        <a href={fullProfile.portfolioUrl} target="_blank" rel="noopener noreferrer" className="text-brand-teal-dark hover:underline">
                          {t("applicants.modal.portfolio")}
                        </a>
                      )}
                      {fullProfile.githubUrl && (
                        <a href={fullProfile.githubUrl} target="_blank" rel="noopener noreferrer" className="text-brand-teal-dark hover:underline">
                          GitHub
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {fullProfile.softSkills.length > 0 && (
                  <div>
                    <p className="text-xs text-[#141B2E]">{t("applicants.modal.softSkills")}</p>
                    <div className="mt-[6px] flex flex-wrap gap-[6px]">
                      {fullProfile.softSkills.map((skill) => (
                        <span key={skill} className="rounded-full bg-brand-teal-dark px-[10px] py-[4px] text-xs text-white">
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {fullProfile.workExperiences.length > 0 && (
                  <div>
                    <p className="text-xs text-[#141B2E]">{t("applicants.modal.workExperience")}</p>
                    <div className="mt-[8px] flex flex-col gap-[10px]">
                      {fullProfile.workExperiences.map((exp) => (
                        <div key={exp.id} className="rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]">
                          <p className="text-xs text-[#141B2E]">{exp.title}</p>
                          <p className="text-xs text-[#4B5468]">{exp.company}</p>
                          <p className="mt-[2px] text-xs text-[#9AA3B2]">
                            {exp.startDate} – {exp.isCurrent ? t("form.present") : exp.endDate}
                          </p>
                          {exp.achievements && (
                            <RichTextContent html={exp.achievements} className="mt-[4px] text-xs text-[#4B5468]" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {fullProfile.education.length > 0 && (
                  <div>
                    <p className="text-xs text-[#141B2E]">{t("applicants.modal.education")}</p>
                    <div className="mt-[8px] flex flex-col gap-[10px]">
                      {fullProfile.education.map((edu) => (
                        <div key={edu.id} className="rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]">
                          <p className="text-xs text-[#141B2E]">
                            {optionLabel(t, "jobseekerOnboarding.options.qualification", edu.qualificationTier, "")}
                            {edu.fieldOfStudy ? ` — ${edu.fieldOfStudy}` : ""}
                          </p>
                          <p className="text-xs text-[#4B5468]">{edu.institution}</p>
                          <p className="mt-[2px] text-xs text-[#9AA3B2]">
                            {[edu.graduationYear, edu.cgpa ? t("applicants.modal.cgpa", { cgpa: edu.cgpa }) : null]
                              .filter(Boolean)
                              .join(" · ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {fullProfile.certifications.length > 0 && (
                  <div>
                    <p className="text-xs text-[#141B2E]">{t("applicants.modal.certifications")}</p>
                    <div className="mt-[8px] flex flex-col gap-[6px]">
                      {fullProfile.certifications.map((cert) => (
                        <div key={cert.id} className="flex items-center justify-between gap-[8px]">
                          <p className="text-xs text-[#141B2E]">
                            {cert.name}
                            {cert.issuer ? ` · ${cert.issuer}` : ""}
                            {cert.year ? ` · ${cert.year}` : ""}
                          </p>
                          {cert.fileUrl && (
                            <a
                              href={cert.fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="shrink-0 text-xs text-brand-teal-dark hover:underline"
                            >
                              {t("applicants.modal.viewFile")}
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {fullProfile.languages.length > 0 && (
                  <div>
                    <p className="text-xs text-[#141B2E]">{t("applicants.modal.languages")}</p>
                    <div className="mt-[6px] flex flex-wrap gap-[6px]">
                      {fullProfile.languages.map((lang) => (
                        <span key={lang.id} className="rounded-full bg-[#F1F4F8] px-[10px] py-[4px] text-xs text-[#141B2E]">
                          {t("applicants.modal.languageLevels", {
                            language: formatSpokenLanguage(lang.language, lang.dialects),
                            spoken: optionLabel(t, "landing.jobs.languageLevel", lang.spokenLevel),
                            written: optionLabel(t, "landing.jobs.languageLevel", lang.writtenLevel),
                          })}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {fullProfile.references.length > 0 && (
                  <div>
                    <p className="text-xs text-[#141B2E]">{t("applicants.modal.references")}</p>
                    <div className="mt-[8px] flex flex-col gap-[8px]">
                      {fullProfile.references.map((ref) => (
                        <div key={ref.id} className="text-xs text-[#141B2E]">
                          <p>
                            {ref.fullName}
                            {ref.jobTitle || ref.company ? ` · ${[ref.jobTitle, ref.company].filter(Boolean).join(", ")}` : ""}
                          </p>
                          {(ref.phone || ref.email) && (
                            <p className="text-[#4B5468]">{[ref.phone, ref.email].filter(Boolean).join(" · ")}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex min-h-0 flex-col gap-[10px] overflow-y-auto border-t border-black/[0.06] bg-[#F8FAFB] px-[18px] pt-[18px] pb-[40px] sm:basis-1/3 sm:border-t-0 sm:border-l">
            {showInterviewForm ? (
              <div className="flex flex-col gap-[8px]">
                <p className="text-xs text-[#141B2E]">{t("applicants.interviewForm.title")}</p>

                <div>
                  <label className="text-xs text-[#9AA3B2]">{t("applicants.interviewForm.round")}</label>
                  <input
                    type="number"
                    min={1}
                    value={round}
                    onChange={(e) => setRound(Math.max(1, Number(e.target.value) || 1))}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className="text-xs text-[#9AA3B2]">{t("applicants.interviewForm.format")}</label>
                  <div className="mt-[2px] grid grid-cols-3 gap-[4px]">
                    {INTERVIEW_MODES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`rounded-[8px] px-[6px] py-[6px] text-sm transition-colors ${
                          mode === m ? "bg-brand-teal-dark text-white" : "bg-white text-[#4B5468] hover:bg-black/[0.04]"
                        }`}
                      >
                        {t(`dashboard.interviewModes.${m}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-[6px]">
                  <div>
                    <label className="text-xs text-[#9AA3B2]">{t("applicants.interviewForm.date")}</label>
                    <DatePicker value={date} onChange={setDate} min={todayIsoDate} />
                  </div>
                  <div>
                    <label className="text-xs text-[#9AA3B2]">{t("applicants.interviewForm.time")}</label>
                    <TimePicker value={time} onChange={setTime} />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-[#9AA3B2]">{t("applicants.interviewForm.duration")}</label>
                  <input
                    type="number"
                    min={5}
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    placeholder="60"
                    className={inputClass}
                  />
                </div>

                {mode === "onsite" && (
                  <div className="flex flex-col gap-[6px]">
                    <label className="text-xs text-[#9AA3B2]">{t("applicants.interviewForm.location")}</label>
                    {addresses.length > 0 && (
                      <Dropdown
                        id="interviewLocationPicker"
                        label={t("applicants.interviewForm.useSavedAddress")}
                        value=""
                        options={[
                          { value: "", label: t("applicants.interviewForm.useSavedAddressOption") },
                          ...addresses.map((a) => ({ value: a.id, label: `${a.label} — ${a.city}, ${a.state}` })),
                        ]}
                        onChange={(value) => {
                          const picked = addresses.find((a) => a.id === value);
                          if (picked) {
                            setLocation([picked.addressLine1, picked.area, picked.city, picked.state].filter(Boolean).join(", "));
                          }
                        }}
                      />
                    )}
                    <input
                      type="text"
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder={t("applicants.interviewForm.locationPlaceholder")}
                      className={inputClass}
                    />
                  </div>
                )}

                {mode === "online" && (
                  <div>
                    <label className="text-xs text-[#9AA3B2]">{t("applicants.interviewForm.meetingLink")}</label>
                    <input
                      type="text"
                      value={meetingLink}
                      onChange={(e) => setMeetingLink(e.target.value)}
                      placeholder="https://..."
                      className={inputClass}
                    />
                  </div>
                )}

                <div>
                  <label className="text-xs text-[#9AA3B2]">{t("applicants.interviewForm.interviewers")}</label>
                  <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("applicants.interviewForm.interviewersHint")}</p>
                  <div className="mt-[6px] flex flex-col gap-[6px]">
                    {interviewers.map((userId, i) => {
                      // Locked only for the scheduler's own first-slot entry.
                      const isLockedScheduler = i === 0 && !!currentUserId && userId === currentUserId;
                      if (isLockedScheduler) {
                        const name = currentUserName?.trim() || t("applicants.interviewForm.you");
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-[10px] rounded-[12px] border border-black/[0.1] bg-[#F8FAFB] px-[10px] py-[7px]"
                          >
                            {currentUserAvatarUrl ? (
                              <img
                                src={currentUserAvatarUrl}
                                referrerPolicy="no-referrer"
                                alt=""
                                className="h-[28px] w-[28px] shrink-0 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-[#F1F4F8] text-[#9AA3B2]">
                                <UserIcon className="h-[14px] w-[14px]" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate text-sm text-[#141B2E]">{name}</p>
                              {currentUserRole && <p className="truncate text-xs text-[#9AA3B2]">{currentUserRole}</p>}
                            </div>
                          </div>
                        );
                      }
                      // Active team members not already picked in another slot.
                      const otherChosen = new Set(interviewers.filter((_, j) => j !== i));
                      const options: InterviewerOption[] = activeMembers
                        .filter((m) => !otherChosen.has(m.userId as string))
                        .map((m) => ({
                          value: m.userId as string,
                          name: memberName(m),
                          position: m.position,
                          avatarUrl: m.avatarUrl,
                        }));
                      return (
                        <div key={i} className="flex items-center gap-[6px]">
                          <div className="min-w-0 flex-1">
                            <InterviewerPicker
                              value={userId}
                              options={options}
                              onChange={(value) => setInterviewers((prev) => prev.map((n, j) => (j === i ? value : n)))}
                            />
                          </div>
                          {/* The first slot is whoever's scheduling this interview. */}
                          {i > 0 && (
                            <button
                              type="button"
                              onClick={() => setInterviewers((prev) => prev.filter((_, j) => j !== i))}
                              aria-label={t("applicants.interviewForm.removeInterviewer")}
                              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-[#9AA3B2] hover:bg-black/[0.04] hover:text-[#141B2E]"
                            >
                              <XIcon className="h-[12px] w-[12px]" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <button
                      type="button"
                      onClick={() => setInterviewers((prev) => [...prev, ""])}
                      className="flex h-[32px] w-fit items-center gap-[6px] rounded-full border border-black/[0.1] px-[12px] text-xs text-[#4B5468] hover:bg-black/[0.03]"
                    >
                      <PlusIcon className="h-[9px] w-[9px]" />
                      {interviewers.length === 0 ? t("applicants.interviewForm.addInterviewer") : t("applicants.interviewForm.addAnother")}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-[#9AA3B2]">{t("applicants.interviewForm.notes")}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder={t("applicants.interviewForm.notesPlaceholder")}
                    className={`${inputClass} h-auto py-[8px]`}
                  />
                </div>

                {formError && <p className="text-xs text-red-500">{formError}</p>}

                {confirmingInterview ? (
                  <div className="rounded-[10px] border border-[#FBE7B3] bg-brand-gold-soft p-[10px]">
                    <p className="text-xs text-[#141B2E]">
                      {existing
                        ? t("applicants.interviewForm.confirmUpdate", { name: applicant.applicantName })
                        : t("applicants.interviewForm.confirmInvite", { name: applicant.applicantName })}
                    </p>
                    <p className="mt-[1px] text-xs text-[#4B5468]">
                      {existing ? t("applicants.interviewForm.confirmUpdateHint") : t("applicants.interviewForm.confirmInviteHint")}
                    </p>
                    <div className="mt-[8px] flex gap-[6px]">
                      <button
                        type="button"
                        disabled={updating}
                        onClick={confirmInterviewDetails}
                        className="flex h-[30px] flex-1 items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {existing ? t("applicants.interviewForm.yesUpdate") : t("applicants.interviewForm.yesInvite")}
                      </button>
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() => setConfirmingInterview(false)}
                        className="flex h-[30px] items-center justify-center rounded-full border border-black/[0.1] px-[12px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
                      >
                        {t("applicants.interviewForm.goBack")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-[4px] flex gap-[6px]">
                    <button
                      type="button"
                      disabled={updating}
                      onClick={submitInterviewDetails}
                      className="flex h-[32px] flex-1 items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {existing ? t("applicants.saveChanges") : t("applicants.interviewForm.schedule")}
                    </button>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() => setShowInterviewForm(false)}
                      className="flex h-[32px] items-center justify-center rounded-full border border-black/[0.1] px-[12px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
                    >
                      {t("applicants.cancel")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                {fullProfile?.resumeUrl && (
                  <a
                    href={fullProfile.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex w-full items-center justify-center gap-[6px] rounded-[10px] border border-black/[0.1] px-[12px] py-[8px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
                  >
                    <FileIcon className="h-[13px] w-[13px] text-brand-teal-dark" />
                    {t("applicants.modal.viewResume")}
                  </a>
                )}

                {existing && inInterviewSteps && (
                  <div className="rounded-[14px] border border-[#E1D6F5] bg-[#F1ECFB] p-[14px]">
                    <div className="flex items-center justify-between gap-[8px]">
                      <p className="text-xs text-[#141B2E]">
                        {t("applicants.interview.roundMode", {
                          round: existing.round,
                          mode: t(`dashboard.interviewModes.${existing.mode}`),
                        })}
                      </p>
                      {applicant.application.interviewResponseStatus && (
                        <span
                          className={`shrink-0 rounded-full px-[9px] py-[2px] text-xs ${
                            INTERVIEW_RESPONSE_STATUS_COLOR[applicant.application.interviewResponseStatus].bg
                          } ${INTERVIEW_RESPONSE_STATUS_COLOR[applicant.application.interviewResponseStatus].text}`}
                        >
                          {t(`applicants.interview.response.${applicant.application.interviewResponseStatus}`)}
                        </span>
                      )}
                    </div>
                    <p className="mt-[2px] text-xs text-[#4B5468]">
                      {new Date(existing.scheduledAt).toLocaleString(locale, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                      {existing.durationMinutes ? ` · ${t("applicants.interview.minutes", { count: existing.durationMinutes })}` : ""}
                    </p>
                    <InterviewCountdown scheduledAt={existing.scheduledAt} />
                    {existing.mode === "onsite" && existing.location && (
                      <p className="mt-[4px] text-xs text-[#4B5468]">📍 {existing.location}</p>
                    )}
                    {existing.mode === "online" && existing.meetingLink && (
                      <p className="mt-[4px] truncate text-xs text-[#7C5CD1]">🔗 {existing.meetingLink}</p>
                    )}
                    {existing.interviewers.length > 0 && (
                      <p className="mt-[4px] text-xs text-[#4B5468]">
                        {t("applicants.interview.interviewers", {
                          count: existing.interviewers.length,
                          names: existing.interviewers.join(", "),
                        })}
                      </p>
                    )}
                    {existing.notes && <p className="mt-[4px] text-xs text-[#4B5468]">{existing.notes}</p>}
                    {applicant.application.interviewResponseStatus === "attended" && (
                      <p className="mt-[4px] text-xs text-brand-teal-dark">
                        {applicant.application.jobseekerConfirmedAttendance
                          ? t("applicants.interview.candidateConfirmed")
                          : t("applicants.interview.candidateNotConfirmed")}
                      </p>
                    )}
                  </div>
                )}

                {existing && onSaveEvaluation && isAtOrPastInterviewStage && !interviewHasHappened && (
                  <div className="rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px]">
                    <p className="text-xs text-[#141B2E]">{t("applicants.evaluation.title")}</p>
                    <p className="mt-[4px] text-xs text-[#9AA3B2]">
                      {applicant.application.interviewResponseStatus === "attended"
                        ? t("applicants.evaluation.waitingConfirm")
                        : canManage
                          ? t("applicants.evaluation.markToUnlock", { round: existing.round })
                          : t("applicants.evaluation.opensWhenAttended", { round: existing.round })}
                    </p>
                  </div>
                )}

                {readyToStartEvaluation && !canManage && onSaveEvaluation && (
                  <div className="rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px]">
                    <p className="text-xs text-[#141B2E]">{t("applicants.evaluation.title")}</p>
                    <p className="mt-[4px] text-xs text-[#9AA3B2]">{t("applicants.evaluation.panelWait")}</p>
                  </div>
                )}

                {readyToStartEvaluation && canManage && (
                  <div className="rounded-[14px] border border-[#FBD9B4] bg-[#FFE9D6] p-[14px]">
                    <p className="text-xs text-[#B45309]">{t("applicants.evaluation.completeTitle")}</p>
                    <p className="mt-[4px] text-xs text-[#B45309]">{t("applicants.evaluation.completeBody")}</p>
                    <button
                      type="button"
                      disabled={updating}
                      onClick={() => onUpdateStatus("evaluation")}
                      className="mt-[10px] flex h-[32px] w-full items-center justify-center rounded-full bg-[#B45309] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {t("applicants.evaluation.start")}
                    </button>
                  </div>
                )}

                {existing &&
                  onSaveEvaluation &&
                  canEvaluate &&
                  (() => {
                    // One row per panelist (each owes a scorecard), then any
                    // extra scorecards from Owners who aren't on the panel.
                    const panelIds = existing.interviewerUserIds ?? [];
                    const rows: { key: string; name: string; isMe: boolean; evaluation: PanelEvaluation | null }[] = [
                      ...panelIds.map((id, i) => ({
                        key: id,
                        // The server sends names in the same order as the ids.
                        name: existing.interviewers[i] || t("applicants.evaluation.interviewer"),
                        isMe: id === currentUserId,
                        evaluation: panelEvaluations.find((e) => e.evaluatorUserId === id) ?? null,
                      })),
                      ...panelEvaluations
                        .filter((e) => !e.evaluatorUserId || !panelIds.includes(e.evaluatorUserId))
                        .map((e, i) => ({
                          key: e.evaluatorUserId ?? `legacy-${i}`,
                          name: e.evaluatorName ?? t("applicants.evaluation.earlier"),
                          isMe: !!e.evaluatorUserId && e.evaluatorUserId === currentUserId,
                          evaluation: e,
                        })),
                    ];
                    const submittedCount = panelIds.filter((id) => panelEvaluations.some((e) => e.evaluatorUserId === id)).length;
                    const panelComplete = isPanelEvaluationComplete(existing.interviewerUserIds, panelEvaluations);
                    const onPanel = !!currentUserId && panelIds.includes(currentUserId);
                    const canSubmit = panelIds.length === 0 || onPanel || currentUserIsOwner;
                    const summary = applicant.evaluation;
                    return (
                      <div className="rounded-[14px] border border-[#EAEDF2] bg-white p-[14px]">
                        <div className="flex items-center justify-between gap-[8px]">
                          <p className="text-xs text-[#141B2E]">{t("applicants.evaluation.panelTitle")}</p>
                          {summary && (
                            <span
                              className={`shrink-0 rounded-full px-[9px] py-[2px] text-xs ${
                                RECOMMENDATION_COLOR[summary.recommendation].bg
                              } ${RECOMMENDATION_COLOR[summary.recommendation].text}`}
                              title={rows.length > 1 ? t("applicants.evaluation.panelAverage") : undefined}
                            >
                              {recommendationLabel(summary.recommendation)}
                            </span>
                          )}
                        </div>
                        {panelIds.length > 0 && (
                          <p className="mt-[2px] text-xs text-[#9AA3B2]">
                            {panelComplete
                              ? t("applicants.evaluation.allSubmitted")
                              : t("applicants.evaluation.submittedCount", { submitted: submittedCount, count: panelIds.length })}
                          </p>
                        )}

                        {rows.length > 0 && (
                          <div className="mt-[10px] flex flex-col gap-[6px]">
                            {rows.map((row) => {
                              const avg = row.evaluation ? averageScore(row.evaluation.scores) : null;
                              return (
                                <details key={row.key} className="group rounded-[10px] border border-[#EAEDF2] bg-[#F8FAFB] px-[10px] py-[8px]">
                                  <summary
                                    className={`flex list-none items-center gap-[8px] ${row.evaluation ? "cursor-pointer" : "pointer-events-none"}`}
                                  >
                                    <span className="min-w-0 flex-1 truncate text-xs text-[#141B2E]">
                                      {row.name}
                                      {row.isMe && <span className="text-[#9AA3B2]"> {t("applicants.evaluation.you")}</span>}
                                    </span>
                                    {row.evaluation ? (
                                      <>
                                        {avg !== null && <span className="shrink-0 text-xs text-[#4B5468]">{avg.toFixed(1)}/5</span>}
                                        <span
                                          className={`shrink-0 rounded-full px-[8px] py-[1px] text-xs ${
                                            RECOMMENDATION_COLOR[row.evaluation.recommendation].bg
                                          } ${RECOMMENDATION_COLOR[row.evaluation.recommendation].text}`}
                                        >
                                          {recommendationLabel(row.evaluation.recommendation)}
                                        </span>
                                        <ChevronDownIcon className="h-[9px] w-[9px] shrink-0 text-[#9AA3B2] transition-transform group-open:rotate-180" />
                                      </>
                                    ) : (
                                      <span className="shrink-0 rounded-full bg-[#F1F4F8] px-[8px] py-[1px] text-xs text-[#9AA3B2]">
                                        {t("applicants.evaluation.pending")}
                                      </span>
                                    )}
                                  </summary>
                                  {row.evaluation && (
                                    <div className="mt-[8px] flex flex-col gap-[4px] border-t border-[#EAEDF2] pt-[8px]">
                                      {EVALUATION_CRITERIA.filter((c) => row.evaluation!.scores[c] !== undefined).map((c) => (
                                        <div key={c} className="flex items-center justify-between gap-[8px]">
                                          <span className="text-xs text-[#4B5468]">{criterionLabel(c)}</span>
                                          <span className="text-xs text-[#141B2E]">{row.evaluation!.scores[c]}/5</span>
                                        </div>
                                      ))}
                                      {row.evaluation.notes && (
                                        <p className="mt-[4px] whitespace-pre-line text-xs text-[#4B5468]">{row.evaluation.notes}</p>
                                      )}
                                    </div>
                                  )}
                                </details>
                              );
                            })}
                          </div>
                        )}

                        {!canSubmit && <p className="mt-[10px] text-xs text-[#9AA3B2]">{t("applicants.evaluation.onlyPanel")}</p>}

                        {canSubmit && myEvaluation && evaluationLocked && (
                          <button
                            type="button"
                            onClick={() => setEvaluationLocked(false)}
                            className="mt-[10px] flex h-[32px] w-full items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03]"
                          >
                            {t("applicants.evaluation.editMine")}
                          </button>
                        )}

                        {currentUserIsOwner &&
                          onCompleteEvaluation &&
                          status === "evaluation" &&
                          !panelComplete &&
                          panelEvaluations.length > 0 && (
                            <div className="mt-[10px] rounded-[10px] bg-brand-gold-soft p-[10px]">
                              <p className="text-xs text-brand-gold-dark">{t("applicants.evaluation.ownerClose")}</p>
                              <button
                                type="button"
                                disabled={savingEvaluation}
                                onClick={onCompleteEvaluation}
                                className="mt-[8px] flex h-[30px] w-full items-center justify-center rounded-full border border-brand-gold-dark text-sm text-brand-gold-dark hover:bg-white/60 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {t("applicants.evaluation.markComplete")}
                              </button>
                            </div>
                          )}
                      </div>
                    );
                  })()}

                {existing &&
                  onSaveEvaluation &&
                  canEvaluate &&
                  // Also shown when locked but nothing of mine is saved — i.e.
                  // a submit that failed — so the form doesn't just vanish.
                  (!evaluationLocked || !myEvaluation) &&
                  ((existing.interviewerUserIds ?? []).length === 0 ||
                    (!!currentUserId && (existing.interviewerUserIds ?? []).includes(currentUserId)) ||
                    currentUserIsOwner) && (
                    <div className="rounded-[14px] border border-[#EAEDF2] bg-white p-[14px]">
                      <p className="text-xs text-[#141B2E]">{t("applicants.evaluation.yours")}</p>
                      <p className="mt-[1px] text-xs text-[#9AA3B2]">{t("applicants.evaluation.yoursHint", { round: existing.round })}</p>

                      <div className="mt-[10px] flex flex-col gap-[8px]">
                        {EVALUATION_CRITERIA.map((criterion) => (
                          <div key={criterion} className="flex items-center justify-between gap-[8px]">
                            <span className="text-xs text-[#4B5468]">{criterionLabel(criterion)}</span>
                            <div className="flex gap-[3px]">
                              {[1, 2, 3, 4, 5].map((value) => (
                                <button
                                  key={value}
                                  type="button"
                                  onClick={() => setScore(criterion, value)}
                                  aria-label={`${criterionLabel(criterion)}: ${value}`}
                                  className={`flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-sm transition-colors ${
                                    evaluationScores[criterion] === value
                                      ? "bg-brand-teal-dark text-white"
                                      : "bg-[#F1F4F8] text-[#4B5468] hover:bg-black/[0.06]"
                                  }`}
                                >
                                  {value}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-[10px]">
                        <label className="text-xs text-[#9AA3B2]">{t("applicants.evaluation.recommendation")}</label>
                        <div className="mt-[4px] grid grid-cols-2 gap-[4px]">
                          {RECOMMENDATIONS.map((rec) => (
                            <button
                              key={rec}
                              type="button"
                              onClick={() => setEvaluationRecommendation(rec)}
                              className={`rounded-[8px] px-[8px] py-[6px] text-sm transition-colors ${
                                evaluationRecommendation === rec
                                  ? `${RECOMMENDATION_COLOR[rec].bg} ${RECOMMENDATION_COLOR[rec].text}`
                                  : "bg-[#F1F4F8] text-[#4B5468] hover:bg-black/[0.06]"
                              }`}
                            >
                              {recommendationLabel(rec)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-[10px]">
                        <label className="text-xs text-[#9AA3B2]">{t("applicants.evaluation.notes")}</label>
                        <textarea
                          value={evaluationNotes}
                          onChange={(e) => setEvaluationNotes(e.target.value)}
                          rows={2}
                          placeholder={t("applicants.evaluation.notesPlaceholder")}
                          className={`${inputClass} h-auto py-[8px]`}
                        />
                      </div>

                      {evaluationError && <p className="mt-[6px] text-xs text-red-500">{evaluationError}</p>}

                      <button
                        type="button"
                        disabled={savingEvaluation}
                        onClick={submitEvaluation}
                        className="mt-[10px] flex h-[32px] w-full items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {myEvaluation ? t("applicants.saveChanges") : t("applicants.evaluation.submit")}
                      </button>
                    </div>
                  )}

                {!canManage && (
                  <div className="rounded-[14px] border border-[#E1D6F5] bg-white p-[14px]">
                    <p className="text-xs text-[#141B2E]">{t("applicants.stage.title")}</p>
                    <p className={`mt-[6px] inline-flex rounded-full px-[10px] py-[3px] text-xs ${color.bg} ${color.text}`}>
                      {statusLabel(t, status)}
                    </p>
                    <p className="mt-[8px] text-xs leading-[18px] text-[#9AA3B2]">{t("applicants.stage.panelOnly")}</p>
                  </div>
                )}

                {canManage && (
                  <>
                    <div>
                      <p className="text-xs text-[#141B2E]">{t("applicants.stage.title")}</p>
                      <p className="mt-[1px] text-xs text-[#9AA3B2]">{t("applicants.stage.hint")}</p>
                    </div>

                    {(isTerminal || status === "kiv") && (
                      <p className={`inline-flex self-start rounded-full px-[10px] py-[3px] text-xs ${color.bg} ${color.text}`}>
                        {t("applicants.stage.currently", { status: statusLabel(t, status) })}
                      </p>
                    )}

                    <div className="flex flex-col gap-[6px]">
                      {PIPELINE_STATUSES.map((stage, index) => {
                        const isCurrent = stage === status;
                        const isPast = currentIndex >= 0 && index < currentIndex;
                        // Interviewed only through the Attendance buttons
                        // (they also record attended/no-show).
                        const needsAttendanceFirst = stage === "interviewed" && status === "interview";
                        // Evaluation only right after attendance — the server
                        // rejects it from anywhere else too.
                        const needsAttendanceBeforeEvaluation = stage === "evaluation" && status === "interview";
                        // Evaluated only comes from the panel finishing their
                        // scorecards (or an Owner's "Mark evaluation complete").
                        const needsEvaluationFirst = stage === "evaluated" && !isCurrent && !isPast;
                        const disabledReason =
                          needsAttendanceFirst || needsAttendanceBeforeEvaluation
                            ? t("applicants.stage.markAttendanceFirst")
                            : needsEvaluationFirst
                              ? t("applicants.stage.evaluatedHint")
                              : undefined;
                        return (
                          <button
                            key={stage}
                            type="button"
                            disabled={updating || needsAttendanceFirst || needsAttendanceBeforeEvaluation || needsEvaluationFirst}
                            title={disabledReason}
                            onClick={() => handleStageClick(stage)}
                            className={`flex items-center gap-[6px] rounded-[10px] px-[12px] py-[8px] text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                              isCurrent
                                ? "bg-brand-teal-dark text-white"
                                : isPast
                                  ? "bg-brand-teal-soft text-brand-teal-dark hover:opacity-80"
                                  : "bg-white text-[#4B5468] hover:bg-black/[0.04]"
                            }`}
                          >
                            {isPast ? <CheckIcon className="h-[10px] w-[10px] shrink-0" /> : null}
                            {statusLabel(t, stage)}
                          </button>
                        );
                      })}
                    </div>

                    {inInterviewSteps && (
                      <div className="flex flex-col gap-[8px]">
                        {onSetAttendance &&
                          status === "interview" &&
                          (existing && new Date(existing.scheduledAt).getTime() <= openedAt ? (
                            <div className="flex flex-col gap-[6px]">
                              <p className="text-xs text-[#141B2E]">{t("applicants.attendance.title")}</p>
                              <button
                                type="button"
                                disabled={updating}
                                onClick={() => onSetAttendance("attended")}
                                className="flex h-[30px] w-full items-center justify-center rounded-full border border-black/[0.1] px-[14px] text-sm text-[#4B5468] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {t("applicants.attendance.attended")}
                              </button>
                              <button
                                type="button"
                                disabled={updating}
                                onClick={() => onSetAttendance("no_show")}
                                className="flex h-[30px] w-full items-center justify-center rounded-full border border-black/[0.1] px-[14px] text-sm text-[#4B5468] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {t("applicants.attendance.noShow")}
                              </button>
                            </div>
                          ) : (
                            <p className="text-xs text-[#9AA3B2]">{t("applicants.attendance.notYet")}</p>
                          ))}
                        <button
                          type="button"
                          onClick={() => {
                            setFormError(null);
                            setConfirmingInterview(false);
                            setShowInterviewForm(true);
                          }}
                          className="self-start text-left text-sm text-brand-teal-dark hover:underline"
                        >
                          {status === "interview" ? t("applicants.interview.reschedule") : t("applicants.interview.nextRound")}
                        </button>
                      </div>
                    )}

                    {(inInterviewSteps || status === "kiv") && (
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() => onUpdateStatus(status === "kiv" ? "evaluated" : "kiv")}
                        className={`flex w-full items-center justify-center rounded-[10px] px-[12px] py-[8px] text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          status === "kiv" ? "bg-[#3B5BDB] text-white" : "bg-[#EAF0FE] text-[#3B5BDB] hover:opacity-80"
                        }`}
                      >
                        {status === "kiv" ? t("applicants.stage.backToEvaluated") : t("applicants.stage.keepInView")}
                      </button>
                    )}

                    {pendingStatus && (
                      <div className="rounded-[10px] border border-[#FBE7B3] bg-brand-gold-soft p-[10px]">
                        <p className="text-xs text-[#141B2E]">{t("applicants.stage.shortlistConfirm")}</p>
                        <p className="mt-[1px] text-xs text-[#4B5468]">{t("applicants.stage.shortlistHint")}</p>
                        <div className="mt-[8px] flex gap-[6px]">
                          <button
                            type="button"
                            disabled={updating}
                            onClick={confirmPendingStatus}
                            className="flex h-[30px] flex-1 items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {t("applicants.confirm")}
                          </button>
                          <button
                            type="button"
                            disabled={updating}
                            onClick={() => setPendingStatus(null)}
                            className="flex h-[30px] items-center justify-center rounded-full border border-black/[0.1] px-[12px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
                          >
                            {t("applicants.cancel")}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-[4px] border-t border-black/[0.06] pt-[10px]">
                      <p className="text-xs text-[#9AA3B2]">{t("applicants.stage.notMovingForward")}</p>
                      <button
                        type="button"
                        disabled={updating}
                        onClick={() => onUpdateStatus("rejected")}
                        className={`mt-[6px] flex w-full items-center justify-center rounded-[10px] px-[12px] py-[8px] text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                          status === "rejected" ? "bg-red-500 text-white" : "bg-red-50 text-red-500 hover:bg-red-100"
                        }`}
                      >
                        {t("applicants.stage.reject")}
                      </button>
                      {status === "withdrawn" && (
                        <p className="mt-[6px] rounded-[10px] bg-black/[0.06] px-[10px] py-[6px] text-center text-xs text-[#9AA3B2]">
                          {t("applicants.stage.withdrawnByCandidate")}
                        </p>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
