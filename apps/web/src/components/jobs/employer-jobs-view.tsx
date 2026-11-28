// The redesign's src/components/EmployerJobsView.tsx (Manage Job and Post a
// job), ported. Same UI and behaviour; changed for v3's stack: TanStack
// Router (query params come from the route's validateSearch), the data
// layer follows v1 (TanStack Query over the oRPC client instead of the
// redesign's fetch calls and server-loaded props), and every string goes
// through t().
//
// Not in v3 yet (says "coming soon"): the Poster generator.
import type { EmployerAddress } from "@jobgiga-app/api/shared/employer-profile";
import { INDUSTRIES } from "@jobgiga-app/api/shared/industries";
import { defaultJobAddress } from "@jobgiga-app/api/shared/job-address";
import {
  compareSalaryRange,
  isSalaryPeriod,
  isStartAvailability,
  MAX_POSTING_BENEFITS,
  MAX_WORKING_HOURS_LENGTH,
  OFFICE_DAYS_OPTIONS,
  POSTING_BENEFITS,
  REMOTE_LOCATION,
  SALARY_PERIODS,
  START_AVAILABILITY,
  WORKING_HOURS_PRESETS,
  type SalaryPeriod,
  type StartAvailability,
} from "@jobgiga-app/api/shared/job-posting-options";
import {
  canonicalLanguage,
  LANGUAGE_OPTIONS,
  languageDialects,
  normalizeLanguageRequirements,
  sameLanguage,
} from "@jobgiga-app/api/shared/languages";
import { MALAYSIA_STATES } from "@jobgiga-app/api/shared/malaysia";
import { plainTextToHtml } from "@jobgiga-app/api/shared/rich-text";
import {
  isScorableQuestion,
  MAX_CHOICE_OPTIONS,
  questionType,
  SCREENING_QUESTION_TYPES,
  SUGGESTED_QUESTION_GROUPS,
  toPublicQuestion,
  type CustomQuestion,
  type PreferrableRequirement,
  type ScreeningQuestionType,
  type SuggestedQuestion,
} from "@jobgiga-app/api/shared/screening-questions";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { EmployerDashboardShell } from "@/components/dashboard/employer-dashboard-shell";
import { RichTextEditor } from "@/components/form/rich-text-editor";
import { useRegisterUnsavedChangesGuard, type NavigationGuard } from "@/components/form/unsaved-changes-guard";
import { AnimatedRibbon } from "@/components/landing/animated-ribbon";
import { Dropdown } from "@/components/landing/dropdown";
import { Field } from "@/components/landing/field";
import {
  BoltIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CopyIcon,
  DotsIcon,
  DraftIcon,
  EyeIcon,
  FlagIcon,
  LockIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  StackIcon,
  TrashIcon,
  UserIcon,
  XCircleIcon,
  XIcon,
} from "@/components/landing/icons";
import { Modal } from "@/components/landing/modal";
import { SiriOrb } from "@/components/landing/siri-orb";
import { authClient } from "@/lib/auth-client";
import { showComingSoon } from "@/lib/coming-soon";
import { relativeTimeAgo } from "@/lib/dashboard/pipeline";
import { formatSalary, officeDaysLabel, startAvailabilityLabel } from "@/lib/jobs/format";
import { postingLocationLabel } from "@/lib/jobs/posting-location";
import { gradientFrameClass, inputClass as formInputClass } from "@/lib/landing/form-styles";
import { orpc } from "@/utils/orpc";
import {
  drivingLicenseLabel,
  JobPostingDetails,
  languageLevelLabel,
  languageRequirementLabel,
  PostingCard,
  qualificationLabel,
  workAuthorizationLabel,
  type JobPosting,
} from "./job-posting-details";
import { JobTitleIllustration } from "./job-title-illustration";

// Matches MAX_SUGGESTIONS in the suggest-skills API — manual entry had no
// cap while AI suggestions did, letting someone paste far more skills than
// the AI path could ever produce.
const MAX_MANUAL_SKILLS = 40;

// Skill tags are compared case-insensitively so "JavaScript" and
// "javascript" can't both end up on the same posting as separate entries —
// a plain .includes() only catches exact-case duplicates.
function includesSkillCaseInsensitive(list: string[], value: string): boolean {
  const target = value.toLowerCase();
  return list.some((s) => s.toLowerCase() === target);
}

// Invisible — exists only to call useRegisterUnsavedChangesGuard from a
// genuine descendant of EmployerDashboardShell's UnsavedChangesGuardBoundary
// (rendered as one of its `children`, see the usage below for why this can't
// just be a hook call in EmployerJobsView's own body).
function GuardRegistrar({ guard }: { guard: NavigationGuard }) {
  useRegisterUnsavedChangesGuard(guard);
  return null;
}

// Matches the `job_posting_status` enum in full — draft -> pending
// (awaiting superadmin approval) -> active -> filled/closed, plus the two
// review-loop states: rejected (superadmin rejects at the initial pending
// review) and flagged (superadmin flags an already-active posting after a
// jobseeker report). Kept as the redesign's English names internally;
// shown through dashboard.postingStatus.
type JobStatus = "Draft" | "Pending" | "Active" | "Filled" | "Closed" | "Rejected" | "Flagged";
type TileKey = "Total postings" | JobStatus;

function statusText(t: TFunction, status: TileKey): string {
  return status === "Total postings" ? t("employerJobs.totalPostings") : t(`dashboard.postingStatus.${status.toLowerCase()}`);
}

type PreviewPosting = {
  title: string;
  status: JobStatus;
  applicants: number;
  views: number;
  posted: string;
  location: string;
  employmentType: string;
  workArrangement: string;
  // Formatted range, e.g. "RM3,000–4,500/month", with "(hidden)" when the
  // posting doesn't show it to jobseekers.
  salary: string;
  openings: number;
  minYearsExperience: number;
  rejectionReason: string | null;
  flagReason: string | null;
};

const STATUS_ORDER: JobStatus[] = ["Active", "Draft", "Pending", "Filled", "Closed", "Rejected", "Flagged"];

// One distinct hue per tile so the row is scannable at a glance.
const STATUS_TILE_COLOR: Record<TileKey, { bg: string; border: string; text: string }> = {
  "Total postings": { bg: "bg-[#F1F4F8]", border: "border-[#E4E9F0]", text: "text-[#4B5468]" },
  Active: { bg: "bg-brand-teal-soft", border: "border-[#CFF4F6]", text: "text-brand-teal-dark" },
  Pending: { bg: "bg-brand-gold-soft", border: "border-[#FBE7B3]", text: "text-brand-gold-dark" },
  Filled: { bg: "bg-[#E7F6EC]", border: "border-[#CDEBD8]", text: "text-[#2F9E56]" },
  Closed: { bg: "bg-black/[0.04]", border: "border-black/[0.08]", text: "text-[#9AA3B2]" },
  Draft: { bg: "bg-[#F1ECFB]", border: "border-[#E1D6F5]", text: "text-[#7C5CD1]" },
  Rejected: { bg: "bg-red-50", border: "border-red-100", text: "text-red-500" },
  Flagged: { bg: "bg-[#FFEFE3]", border: "border-[#FBDBBE]", text: "text-[#C2600A]" },
};

// Same deeper/saturated pastel a tile's STATUS_TILE_COLOR.bg approximates —
// used as the gradient-to-white start color + the watermark icon's
// --icon-accent, matching the treatment on the dashboard's Overview tiles.
const STATUS_TILE_GRADIENT: Record<TileKey, string> = {
  "Total postings": "#C9CFDA",
  Active: "#8CE6D9",
  Pending: "#FFE1A1",
  Filled: "#A5EBB9",
  Closed: "#D4D7DC",
  Draft: "#D4C6F7",
  Rejected: "#F9B9B9",
  Flagged: "#FFCDA1",
};

const STATUS_TILE_ICON: Record<
  TileKey,
  (props: { className?: string; strokeWidth?: number; style?: React.CSSProperties }) => ReactElement
> = {
  "Total postings": StackIcon,
  Active: BoltIcon,
  Pending: ClockIcon,
  Filled: CheckCircleIcon,
  Closed: LockIcon,
  Draft: DraftIcon,
  Rejected: XCircleIcon,
  Flagged: FlagIcon,
};

// Labels are the redesign's English; shown through t() by value
// (dashboard.employmentTypes / dashboard.workArrangements / …).
const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "freelance", label: "Freelance" },
  { value: "temporary", label: "Temporary" },
] as const;
const WORK_ARRANGEMENTS = [
  { value: "onsite", label: "Onsite" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
] as const;
// Matches jobseekerEducation.qualificationTier exactly so "minimum
// education" can be compared directly against a jobseeker's highest
// completed tier.
const QUALIFICATION_TIERS = ["SPM", "STPM", "Diploma", "Degree", "Master", "PhD", "Other"] as const;
// A teammate who can be shown as a posting's contact (public details only).
export type ContactOption = { userId: string; name: string; position: string | null; avatarUrl: string | null };

// A team member with the Hiring manager role, assignable to a posting.
export type HiringManagerOption = {
  teamMemberId: string;
  name: string;
  email: string;
  position: string | null;
  avatarUrl: string | null;
  // Invited but hasn't joined yet — still assignable.
  pending: boolean;
};
// The posting company as jobseekers see it — for the form's preview (plus
// what "Fill with AI" is told about the company).
export type PostingCompany = { name: string; logoUrl: string | null; industry?: string | null; size?: string | null };

// The language picker's "Other (type it)" choice.
const OTHER_LANGUAGE = "__other__";

// Field ids that only render on the screening step — goToField uses this to
// switch steps before it tries to scroll to one of them.
const SCREENING_FIELD_IDS = new Set(["minYearsExperience", "minQualificationTier", "languageScreening", "workAuthorizations", "customQuestionInput"]);
// Matches jobseekerProfiles.workAuthorization exactly.
const WORK_AUTHORIZATIONS = [
  { value: "citizen", label: "Malaysian citizen" },
  { value: "permanent_resident", label: "Permanent resident" },
  { value: "work_pass_holder", label: "Work pass holder" },
  { value: "needs_sponsorship", label: "Open to sponsorship" },
] as const;
// Matches jobseekerProfiles.drivingLicense exactly; "Not required" means the
// field is simply left empty.
const DRIVING_LICENSES = [
  { value: "b2", label: "B2 (motorcycle)" },
  { value: "b", label: "B (car)" },
  { value: "d", label: "D (bus)" },
  { value: "da", label: "DA (bus + trailer)" },
  { value: "e", label: "E (lorry)" },
] as const;
// Matches jobseekerLanguages.spokenLevel/writtenLevel exactly.
const LANGUAGE_LEVELS = [
  { value: "basic", label: "Basic" },
  { value: "conversational", label: "Conversational" },
  { value: "fluent", label: "Fluent" },
  { value: "native", label: "Native" },
] as const;
type LanguageLevel = (typeof LANGUAGE_LEVELS)[number]["value"];
// ONE dialect, or null for "any dialect" (see shared/languages.ts).
type RequiredLanguage = { language: string; dialect: string | null; level: LanguageLevel };

// Example min/max for the salary inputs, sized to the chosen pay period.
const SALARY_PLACEHOLDERS: Record<SalaryPeriod, [number, number]> = {
  month: [3000, 4500],
  hour: [12, 18],
  day: [100, 150],
  project: [2000, 5000],
  // v3 has a yearly period too.
  year: [36000, 54000],
};

// The ready-made screening questions, translated by position — the shared
// list (SUGGESTED_QUESTION_GROUPS) stays English for the API.
function translatedSuggestionGroups(t: TFunction) {
  return SUGGESTED_QUESTION_GROUPS.map((group, gi) => ({
    key: group.label,
    label: t(`employerJobs.suggestedGroups.g${gi}`),
    items: group.items.map(
      (item, qi): SuggestedQuestion => ({
        type: item.type,
        question: t(`employerJobs.suggestedQuestions.g${gi}q${qi}`),
        ...(item.options ? { options: item.options.map((_, oi) => t(`employerJobs.suggestedQuestions.g${gi}q${qi}o${oi}`)) } : {}),
      }),
    ),
  }));
}

// Shown next to a field's label so the mapping to a jobseeker-profile field
// is visible on the form itself, not just documented in comments.
function MatchHint({ field }: { field: string | string[] }) {
  const fields = Array.isArray(field) ? field.join(" + ") : field;
  return (
    <span className="rounded-full bg-brand-teal-soft px-[8px] py-[2px] text-xs whitespace-nowrap text-brand-teal-dark">
      ↔ {fields}
    </span>
  );
}

function NoMatchHint() {
  const { t } = useTranslation("common");
  return (
    <span className="rounded-full bg-[#F1F4F8] px-[8px] py-[2px] text-xs whitespace-nowrap text-[#9AA3B2]">
      {t("employerJobs.noJobseekerMatchYet")}
    </span>
  );
}

// Per-requirement opt-in for the screening step — lets the employer exclude
// a specific question (e.g. one the AI filled in) from what applicants are
// asked, without having to clear its value back out.
function AskToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="ml-auto flex items-center gap-[6px] text-xs whitespace-nowrap text-[#4B5468]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-[13px] w-[13px] accent-brand-teal-dark"
      />
      {label}
    </label>
  );
}

// Required (a miss marks the applicant not eligible) or Preferred (a hit
// boosts the match score, a miss costs nothing).
function PriorityToggle({
  preferred,
  onChange,
  disabled = false,
}: {
  preferred: boolean;
  onChange: (preferred: boolean) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation("common");
  return (
    <span
      role="group"
      aria-label={t("employerJobs.howStrict")}
      title={t("employerJobs.howStrictTitle")}
      className={`flex items-center rounded-full bg-[#F1F4F8] p-[2px] text-xs ${disabled ? "opacity-40" : ""}`}
    >
      {([false, true] as const).map((value) => (
        <button
          key={String(value)}
          type="button"
          disabled={disabled}
          aria-pressed={preferred === value}
          onClick={() => onChange(value)}
          className={`rounded-full px-[10px] py-[2px] whitespace-nowrap transition-colors disabled:cursor-not-allowed ${
            preferred === value ? "bg-white text-brand-teal-dark shadow-sm" : "text-[#4B5468] hover:text-[#141B2E]"
          }`}
        >
          {value ? t("employerJobs.preferred") : t("employerJobs.required")}
        </button>
      ))}
    </span>
  );
}

const inputClass = formInputClass("teal");

// An oRPC error's message is the server's (English) message — what the
// redesign showed from `data.error`.
function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export type PostJobFormHandle = { guardNavigation: (proceed: () => void) => void };

const PostJobForm = forwardRef<
  PostJobFormHandle,
  {
    onClose: () => void;
    // The route's ?id= (editing an existing posting), ?title= and
    // ?autofill= (carried over from Manage Job's "Start with your job title").
    editingId: string | null;
    initialTitle: string | null;
    autofill: boolean;
    addresses: EmployerAddress[];
    companyBenefits: string[];
    contactOptions: ContactOption[];
    hiringManagerOptions: HiringManagerOption[];
    currentUserId: string | null;
    company: PostingCompany | null;
  }
>(
  function PostJobForm(
    { onClose, editingId, initialTitle, autofill, addresses, companyBenefits, contactOptions, hiringManagerOptions, currentUserId, company },
    ref,
  ) {
  const { t } = useTranslation("common");
  const queryClient = useQueryClient();
  const createMutation = useMutation(orpc.job.create.mutationOptions());
  const updateMutation = useMutation(orpc.job.update.mutationOptions());
  const suggestPostingMutation = useMutation(orpc.employer.suggestJobPosting.mutationOptions());
  const suggestSalaryMutation = useMutation(orpc.employer.suggestSalary.mutationOptions());
  const suggestSkillsMutation = useMutation(orpc.employer.suggestSkills.mutationOptions());
  const [loadingExisting, setLoadingExisting] = useState(() => !!editingId);
  // Set when ?id= can't be opened: showing the blank form instead would look
  // like a new posting, and saving it would try to update one that isn't there.
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [postingName, setPostingName] = useState("");
  const [title, setTitle] = useState(() => initialTitle ?? "");
  const [description, setDescription] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [industry, setIndustry] = useState<(typeof INDUSTRIES)[number] | "">("");
  const [employmentType, setEmploymentType] = useState<(typeof EMPLOYMENT_TYPES)[number]["value"]>("full_time");
  const [workArrangement, setWorkArrangement] = useState<(typeof WORK_ARRANGEMENTS)[number]["value"]>("onsite");
  // Hybrid only — "" = not said.
  const [officeDays, setOfficeDays] = useState("");
  // A brand-new posting starts at the company's default address for job
  // posts (its only address, or the one marked in Company Profile); editing
  // an existing posting loads that posting's own location instead.
  const [startAddress] = useState(() => (editingId ? null : defaultJobAddress(addresses)));
  const startLocation = startAddress
    ? postingLocationLabel(startAddress.area ?? "", startAddress.city, startAddress.state)
    : "";
  const [selectedAddressId, setSelectedAddressId] = useState(startAddress?.id ?? "");
  const [location, setLocation] = useState(startLocation);
  const [addressLine1, setAddressLine1] = useState(startAddress?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(startAddress?.addressLine2 ?? "");
  const [area, setArea] = useState(startAddress?.area ?? "");
  const [city, setCity] = useState(startAddress?.city ?? "");
  const [state, setState] = useState<(typeof MALAYSIA_STATES)[number] | "">(
    () => MALAYSIA_STATES.find((s) => s === startAddress?.state) ?? "",
  );
  const [postcode, setPostcode] = useState(startAddress?.postcode ?? "");
  // Benefits & working conditions. A brand-new posting starts with the
  // company's own benefits (from Company Profile) and the person posting it
  // as the contact; editing loads the posting's saved values instead.
  const [startDefaults] = useState(() => ({
    benefits: editingId ? [] : companyBenefits,
    contactUserId: editingId ? "" : contactOptions.some((c) => c.userId === currentUserId) ? (currentUserId ?? "") : "",
  }));
  const [benefits, setBenefits] = useState<string[]>(startDefaults.benefits);
  const [benefitInput, setBenefitInput] = useState("");
  const [startAvailability, setStartAvailability] = useState<StartAvailability | "">("");
  const [workingHours, setWorkingHours] = useState("");
  const [contactUserId, setContactUserId] = useState(startDefaults.contactUserId);
  // Team-member ids of the Hiring managers covering this posting.
  const [hiringManagerIds, setHiringManagerIds] = useState<string[]>([]);
  // Hiring managers invited from this form (quick add), on top of the server's list.
  const [invitedManagers, setInvitedManagers] = useState<HiringManagerOption[]>([]);
  const [showQuickInvite, setShowQuickInvite] = useState(false);
  const [quickEmail, setQuickEmail] = useState("");
  const [quickPosition, setQuickPosition] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const quickInviteMutation = useMutation(orpc.team.invite.mutationOptions());
  const quickSending = quickInviteMutation.isPending;
  const allHiringManagers = [
    ...hiringManagerOptions,
    ...invitedManagers.filter((i) => !hiringManagerOptions.some((o) => o.teamMemberId === i.teamMemberId)),
  ];
  const closeQuickInvite = () => {
    setShowQuickInvite(false);
    setQuickEmail("");
    setQuickPosition("");
    setQuickError(null);
  };
  async function sendQuickInvite() {
    const email = quickEmail.trim().toLowerCase();
    if (!email.includes("@")) {
      setQuickError(t("employerJobs.quickInvite.invalidEmail"));
      return;
    }
    // Already a hiring manager here — just tick them instead of inviting twice.
    const existing = allHiringManagers.find((m) => m.email.toLowerCase() === email);
    if (existing) {
      setHiringManagerIds((prev) => (prev.includes(existing.teamMemberId) ? prev : [...prev, existing.teamMemberId]));
      closeQuickInvite();
      return;
    }
    setQuickError(null);
    try {
      const data = await quickInviteMutation.mutateAsync({ email, role: "hiring_manager", position: quickPosition.trim() || undefined });
      const member = data.members.find((m) => m.email.toLowerCase() === email);
      if (member) {
        setInvitedManagers((prev) => [
          ...prev,
          {
            teamMemberId: member.id,
            name: member.name || member.email,
            email: member.email,
            position: member.position,
            avatarUrl: member.avatarUrl,
            pending: true,
          },
        ]);
        setHiringManagerIds((prev) => [...prev, member.id]);
      }
      closeQuickInvite();
    } catch (err) {
      setQuickError(errorMessage(err, t("employerJobs.quickInvite.error")));
    }
  }
  const [salaryMin, setSalaryMin] = useState("");
  const [salaryMax, setSalaryMax] = useState("");
  const [salaryPeriod, setSalaryPeriod] = useState<SalaryPeriod>("month");
  const [showSalary, setShowSalary] = useState(true);
  const [openings, setOpenings] = useState("1");
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [softSkills, setSoftSkills] = useState<string[]>([]);
  const [softSkillInput, setSoftSkillInput] = useState("");
  const [niceToHaveSkills, setNiceToHaveSkills] = useState<string[]>([]);
  const [niceToHaveSkillInput, setNiceToHaveSkillInput] = useState("");

  // Hard filters — structured requirements matched exactly against a
  // jobseeker profile (years of experience, education tier, languages,
  // work authorization, driving license) to narrow the candidate pool,
  // separate from the free-text fields above that an AI matcher ranks by
  // semantic fit against the posting.
  const [minYearsExperience, setMinYearsExperience] = useState("");
  const [minQualificationTier, setMinQualificationTier] = useState<(typeof QUALIFICATION_TIERS)[number] | "">("");
  const [languages, setLanguages] = useState<RequiredLanguage[]>([]);
  const [languagePick, setLanguagePick] = useState("");
  // For a language with dialects: which one is required — "" for any dialect.
  const [dialectPick, setDialectPick] = useState("");
  const [languageInput, setLanguageInput] = useState("");
  const [languageLevelInput, setLanguageLevelInput] = useState<LanguageLevel>("conversational");
  const [workAuthorizations, setWorkAuthorizations] = useState<string[]>([]);
  const [drivingLicense, setDrivingLicense] = useState<(typeof DRIVING_LICENSES)[number]["value"] | "">("");
  // Master switch for the block above — off by default so a new posting
  // never silently asks applicants anything until the employer explicitly
  // opts in on the screening step.
  const [screeningEnabled, setScreeningEnabled] = useState(false);
  // Per-requirement opt-in — lets the employer pick exactly which of the
  // structured questions below actually get asked, independent of whether a
  // value is filled in. Defaults to true so a freshly filled-in field asks
  // by default, matching the "filled = asked" behavior.
  const [askMinExperience, setAskMinExperience] = useState(true);
  const [askMinEducation, setAskMinEducation] = useState(true);
  const [askDrivingLicense, setAskDrivingLicense] = useState(true);
  const [askLanguages, setAskLanguages] = useState(true);
  const [askWorkAuthorizations, setAskWorkAuthorizations] = useState(true);
  // Free-form questions beyond the structured fields above.
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [customQuestionInput, setCustomQuestionInput] = useState("");
  const [customQuestionRequiredAnswer, setCustomQuestionRequiredAnswer] = useState(true);
  const [customQuestionType, setCustomQuestionType] = useState<ScreeningQuestionType>("yesno");
  // Multiple choice: what applicants pick from, and which picks are accepted.
  const [choiceOptions, setChoiceOptions] = useState<string[]>([]);
  const [choiceAccepted, setChoiceAccepted] = useState<string[]>([]);
  const [choiceInput, setChoiceInput] = useState("");
  // Number: the lowest accepted answer ("" = no minimum, just collect it).
  const [customQuestionMin, setCustomQuestionMin] = useState("");
  const [customQuestionPreferred, setCustomQuestionPreferred] = useState(false);
  const [customQuestionError, setCustomQuestionError] = useState<string | null>(null);
  // Which category of the ready-made questions is showing.
  const suggestionGroups = translatedSuggestionGroups(t);
  const [suggestionGroup, setSuggestionGroup] = useState(SUGGESTED_QUESTION_GROUPS[0]!.label);
  // Built-in requirements marked Preferred rather than Required.
  const [screeningPreferred, setScreeningPreferred] = useState<PreferrableRequirement[]>([]);
  const [formStep, setFormStep] = useState<"details" | "screening">("details");

  function setRequirementPreferred(key: PreferrableRequirement, preferred: boolean) {
    setScreeningPreferred((prev) => (preferred ? (prev.includes(key) ? prev : [...prev, key]) : prev.filter((k) => k !== key)));
  }

  function addChoiceOption() {
    const value = choiceInput.trim();
    if (!value) return;
    if (choiceOptions.some((o) => o.toLowerCase() === value.toLowerCase())) {
      setCustomQuestionError(t("employerJobs.optionAlreadyThere"));
      return;
    }
    if (choiceOptions.length >= MAX_CHOICE_OPTIONS) {
      setCustomQuestionError(t("employerJobs.upToOptions", { max: MAX_CHOICE_OPTIONS }));
      return;
    }
    setCustomQuestionError(null);
    setChoiceOptions((prev) => [...prev, value]);
    // New options start accepted — the employer un-ticks the ones that don't qualify.
    setChoiceAccepted((prev) => [...prev, value]);
    setChoiceInput("");
  }

  function removeChoiceOption(option: string) {
    setChoiceOptions((prev) => prev.filter((o) => o !== option));
    setChoiceAccepted((prev) => prev.filter((o) => o !== option));
  }

  function resetCustomQuestionBuilder() {
    setCustomQuestionInput("");
    setChoiceOptions([]);
    setChoiceAccepted([]);
    setChoiceInput("");
    setCustomQuestionMin("");
    setCustomQuestionPreferred(false);
    setCustomQuestionError(null);
  }

  // A picker chip: Yes/No and Short answer go straight in; Multiple choice and
  // Number fill the builder so the employer sets what qualifies, then presses Add.
  function applySuggestion(item: SuggestedQuestion) {
    if (item.type === "yesno" || item.type === "text") {
      addCustomQuestion({ question: item.question, type: item.type });
      return;
    }
    resetCustomQuestionBuilder();
    setCustomQuestionType(item.type);
    setCustomQuestionInput(item.question);
    if (item.type === "choice" && item.options) {
      setChoiceOptions(item.options);
      // Every option starts as qualifying — the employer unticks the ones that don't.
      setChoiceAccepted(item.options);
    }
    document.getElementById("customQuestionInput")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  function addCustomQuestion(suggestion?: { question: string; type: "yesno" | "text" }) {
    const textOverride = suggestion?.question;
    const value = (textOverride ?? customQuestionInput).trim();
    if (!value) return;
    const type: ScreeningQuestionType = suggestion ? suggestion.type : customQuestionType;
    if (customQuestions.some((q) => q.question.toLowerCase() === value.toLowerCase())) {
      setCustomQuestionError(t("employerJobs.questionAlreadyAdded"));
      return;
    }
    const base = { id: crypto.randomUUID(), question: value, type, requiredAnswer: true };
    let question: CustomQuestion;
    if (type === "choice") {
      if (choiceOptions.length < 2) {
        setCustomQuestionError(t("employerJobs.addTwoOptions"));
        return;
      }
      if (choiceAccepted.length === 0) {
        setCustomQuestionError(t("employerJobs.tickOneOption"));
        return;
      }
      question = { ...base, options: choiceOptions, acceptedOptions: choiceAccepted };
    } else if (type === "number") {
      const min = customQuestionMin.trim() === "" ? null : Number(customQuestionMin);
      if (min !== null && !Number.isFinite(min)) {
        setCustomQuestionError(t("employerJobs.enterValidMinimum"));
        return;
      }
      question = { ...base, minNumber: min };
    } else if (type === "text") {
      question = base;
    } else {
      question = { ...base, requiredAnswer: textOverride ? true : customQuestionRequiredAnswer };
    }
    if (customQuestionPreferred && !textOverride && isScorableQuestion(question)) question.preferred = true;
    setCustomQuestions((prev) => [...prev, question]);
    // A suggestion chip shouldn't wipe a question the employer is mid-typing.
    if (textOverride) setCustomQuestionError(null);
    else resetCustomQuestionBuilder();
  }

  function removeCustomQuestion(id: string) {
    setCustomQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function setQuestionPreferred(id: string, preferred: boolean) {
    setCustomQuestions((prev) => prev.map((q) => (q.id === id ? { ...q, preferred } : q)));
  }

  const [aiFillLoading, setAiFillLoading] = useState(false);
  const [aiFillError, setAiFillError] = useState<string | null>(null);
  const [aiFillStatus, setAiFillStatus] = useState<string | null>(null);
  const [aiFillElapsedMs, setAiFillElapsedMs] = useState(0);
  const [aiFillTokens, setAiFillTokens] = useState<number | null>(null);
  const [aiFillDurationMs, setAiFillDurationMs] = useState<number | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [showJobseekerPreview, setShowJobseekerPreview] = useState(false);

  // Same "Suggest skills" flow as the jobseeker onboarding form, driven by
  // the job title, with a third niceToHaveSkills bucket to match this
  // form's three skill fields. Persisted with the posting itself
  // (skillSuggestions), so a refresh or reopening the draft elsewhere
  // doesn't throw away suggestions the employer hadn't reviewed yet.
  const [skillSuggestions, setSkillSuggestions] = useState<{
    professionalSkills: string[];
    softSkills: string[];
    niceToHaveSkills: string[];
  } | null>(null);
  // Salary card: the AI's suggested range and what jobseekers on JobGiga
  // targeting a similar role expect. Each is kept with what it was made for
  // (title and pay period; title, industry and state) and only shown while
  // those still match — so changing the title never leaves another role's
  // numbers on screen.
  const [salarySuggestion, setSalarySuggestion] = useState<{
    min: number;
    max: number;
    period: SalaryPeriod;
    reason: string | null;
    title: string;
  } | null>(null);
  const [suggestingSalary, setSuggestingSalary] = useState(false);
  const [salarySuggestError, setSalarySuggestError] = useState<string | null>(null);
  const salaryInsightKey = `${title.trim().toLowerCase()}|${industry}|${state}`;

  async function suggestSalary() {
    if (!title.trim()) return;
    setSuggestingSalary(true);
    setSalarySuggestError(null);
    try {
      const data = await suggestSalaryMutation.mutateAsync({
        jobTitle: title.trim(),
        salaryPeriod,
        employmentType,
        workArrangement,
        location: workArrangement === "remote" && !location.trim() ? "Remote (Malaysia)" : location.trim(),
        industry: industry || null,
        minYearsExperience: minYearsExperience.trim() ? Number(minYearsExperience) : null,
      });
      if (!data.suggestion) {
        setSalarySuggestError(t("employerJobs.couldntSuggestSalary"));
        return;
      }
      setSalarySuggestion({
        ...data.suggestion,
        period: isSalaryPeriod(data.suggestion.period) ? data.suggestion.period : salaryPeriod,
        title: title.trim().toLowerCase(),
      });
    } catch (err) {
      setSalarySuggestError(errorMessage(err, t("employerJobs.couldntReachSuggestion")));
    } finally {
      setSuggestingSalary(false);
    }
  }

  // Candidate expectations are monthly, so only fetched for monthly pay —
  // debounced while the title is being typed. (A stale result is hidden by
  // `visibleSalaryInsight` — it carries the key it was fetched for.)
  const [insightParams, setInsightParams] = useState<{ key: string; title: string; industry: string | null; state: string | null } | null>(null);
  useEffect(() => {
    const trimmed = title.trim();
    if (!trimmed || salaryPeriod !== "month") return;
    const key = `${trimmed.toLowerCase()}|${industry}|${state}`;
    const timer = setTimeout(() => setInsightParams({ key, title: trimmed, industry: industry || null, state: state || null }), 600);
    return () => clearTimeout(timer);
  }, [title, industry, state, salaryPeriod]);
  const salaryInsightQuery = useQuery({
    ...orpc.employer.salaryInsight.queryOptions({
      input: { title: insightParams?.title ?? "", industry: insightParams?.industry, state: insightParams?.state },
    }),
    enabled: !!insightParams,
    meta: { suppressErrorToast: true },
  });
  const salaryInsight =
    insightParams && salaryInsightQuery.data ? { key: insightParams.key, insight: salaryInsightQuery.data.insight } : null;

  const [suggestingSkills, setSuggestingSkills] = useState(false);
  const [suggestSkillsError, setSuggestSkillsError] = useState<string | null>(null);
  const [suggestSkillsStatus, setSuggestSkillsStatus] = useState<string | null>(null);
  const [suggestSkillsElapsedMs, setSuggestSkillsElapsedMs] = useState(0);
  const [suggestSkillsTokens, setSuggestSkillsTokens] = useState<number | null>(null);
  const [suggestSkillsDurationMs, setSuggestSkillsDurationMs] = useState<number | null>(null);

  useEffect(() => {
    if (!showPreview && !showJobseekerPreview) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPreview(false);
        setShowJobseekerPreview(false);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [showPreview, showJobseekerPreview]);

  useEffect(() => {
    if (!suggestingSkills) return;
    const startedAt = Date.now();
    const interval = setInterval(() => setSuggestSkillsElapsedMs(Date.now() - startedAt), 100);
    return () => clearInterval(interval);
  }, [suggestingSkills]);

  async function suggestSkills() {
    if (!title.trim()) {
      setSuggestSkillsError(t("employerJobs.enterJobTitleFirstDot"));
      return;
    }
    setSuggestingSkills(true);
    setSuggestSkillsError(null);
    setSuggestSkillsStatus(null);
    setSuggestSkillsElapsedMs(0);
    setSuggestSkillsTokens(null);
    setSuggestSkillsDurationMs(null);
    try {
      const data = await suggestSkillsMutation.mutateAsync({ jobTitle: title.trim() });
      setSkillSuggestions({
        professionalSkills: (data.suggestions?.professionalSkills ?? []).filter(
          (s: string) => !includesSkillCaseInsensitive(skills, s),
        ),
        softSkills: (data.suggestions?.softSkills ?? []).filter(
          (s: string) => !includesSkillCaseInsensitive(softSkills, s),
        ),
        niceToHaveSkills: (data.suggestions?.niceToHaveSkills ?? []).filter(
          (s: string) => !includesSkillCaseInsensitive(niceToHaveSkills, s),
        ),
      });
      const usage = data.usage as { total_tokens?: unknown } | null | undefined;
      setSuggestSkillsTokens(typeof usage?.total_tokens === "number" ? usage.total_tokens : null);
      setSuggestSkillsDurationMs(typeof data.durationMs === "number" ? data.durationMs : null);
      setSuggestSkillsStatus(t("employerJobs.suggestedReview"));
    } catch (err) {
      setSuggestSkillsError(errorMessage(err, t("employerJobs.couldntSuggestSkills")));
    } finally {
      setSuggestingSkills(false);
    }
  }

  function addSuggestedSkill(skill: string) {
    setSkills((prev) =>
      includesSkillCaseInsensitive(prev, skill) || prev.length >= MAX_MANUAL_SKILLS ? prev : [...prev, skill],
    );
    setSkillSuggestions((prev) =>
      prev ? { ...prev, professionalSkills: prev.professionalSkills.filter((s) => s !== skill) } : prev,
    );
  }

  function addSuggestedSoftSkill(skill: string) {
    setSoftSkills((prev) =>
      includesSkillCaseInsensitive(prev, skill) || prev.length >= MAX_MANUAL_SKILLS ? prev : [...prev, skill],
    );
    setSkillSuggestions((prev) => (prev ? { ...prev, softSkills: prev.softSkills.filter((s) => s !== skill) } : prev));
  }

  function addSuggestedNiceToHaveSkill(skill: string) {
    setNiceToHaveSkills((prev) =>
      includesSkillCaseInsensitive(prev, skill) || prev.length >= MAX_MANUAL_SKILLS ? prev : [...prev, skill],
    );
    setSkillSuggestions((prev) =>
      prev ? { ...prev, niceToHaveSkills: prev.niceToHaveSkills.filter((s) => s !== skill) } : prev,
    );
  }

  useEffect(() => {
    if (!aiFillLoading) return;
    const startedAt = Date.now();
    const interval = setInterval(() => setAiFillElapsedMs(Date.now() - startedAt), 100);
    return () => clearInterval(interval);
  }, [aiFillLoading]);

  // Carries an auto-fill request over from the "Start with your job title"
  // card on the Manage Job list page — the title itself is seeded straight
  // into useState above, this just resumes the AI draft that was requested
  // there so the employer doesn't have to click Fill with AI twice.
  useEffect(() => {
    if (initialTitle && autofill) handleAiFill(initialTitle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Loads an existing posting's fields when arriving via "Edit" on the
  // Manage Job list (?id=<uuid>) — everything above defaults to blank/new.
  const existingQuery = useQuery({
    ...orpc.job.getForEdit.queryOptions({ input: { id: editingId ?? "" } }),
    enabled: !!editingId,
    // Always the latest saved version, and loaded into the form only once.
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
    meta: { suppressErrorToast: true },
  });
  const loadedExisting = useRef(false);
  useEffect(() => {
    if (!editingId || loadedExisting.current) return;
    if (existingQuery.isError) {
      loadedExisting.current = true;
      const err = existingQuery.error as (Error & { code?: string }) | null;
      setLoadFailed(
        err?.code === "NOT_FOUND" ? t("employerJobs.postingNoLongerExists") : errorMessage(err, t("employerJobs.couldntLoadPosting")),
      );
      setLoadingExisting(false);
      return;
    }
    if (!existingQuery.data) return;
    loadedExisting.current = true;
    const posting = existingQuery.data.posting as unknown as DbJobPosting;
    setPostingName(posting.postingName ?? "");
    setBenefits(posting.benefits ?? []);
    setStartAvailability(isStartAvailability(posting.startAvailability) ? posting.startAvailability : "");
    setWorkingHours(posting.workingHours ?? "");
    setContactUserId(posting.contactUserId ?? "");
    setHiringManagerIds(posting.hiringManagerIds ?? []);
    setTitle(posting.title);
    setDescription(plainTextToHtml(posting.description));
    setResponsibilities(plainTextToHtml(posting.responsibilities));
    setIndustry((posting.industry as (typeof INDUSTRIES)[number] | null) ?? "");
    setEmploymentType(posting.employmentType as (typeof EMPLOYMENT_TYPES)[number]["value"]);
    setWorkArrangement(posting.workArrangement as (typeof WORK_ARRANGEMENTS)[number]["value"]);
    // A remote posting saved without an address stores "Remote" as its
    // location — that's a display fallback, not something the employer typed.
    setLocation(posting.location === REMOTE_LOCATION && !posting.city ? "" : posting.location);
    setOfficeDays(posting.officeDaysPerWeek ? String(posting.officeDaysPerWeek) : "");
    setAddressLine1(posting.addressLine1 ?? "");
    setAddressLine2(posting.addressLine2 ?? "");
    setArea(posting.area ?? "");
    setCity(posting.city ?? "");
    setState((posting.state as (typeof MALAYSIA_STATES)[number] | null) ?? "");
    setPostcode(posting.postcode ?? "");
    setSalaryMin(posting.salaryMin !== null ? String(posting.salaryMin) : "");
    setSalaryMax(posting.salaryMax !== null ? String(posting.salaryMax) : "");
    setSalaryPeriod(isSalaryPeriod(posting.salaryPeriod) ? posting.salaryPeriod : "month");
    setShowSalary(posting.showSalary);
    setOpenings(String(posting.openings));
    setSkills(posting.skills);
    setSoftSkills(posting.softSkills);
    setNiceToHaveSkills(posting.niceToHaveSkills);
    setMinYearsExperience(posting.minYearsExperience !== null ? String(posting.minYearsExperience) : "");
    setMinQualificationTier((posting.minQualificationTier as (typeof QUALIFICATION_TIERS)[number] | null) ?? "");
    // Read through the language list, so a requirement saved under an
    // older name ("Hokkien") opens as Chinese with Hokkien.
    setLanguages(normalizeLanguageRequirements(posting.languages as RequiredLanguage[]));
    setWorkAuthorizations(posting.workAuthorizations);
    setDrivingLicense((posting.drivingLicense as (typeof DRIVING_LICENSES)[number]["value"] | null) ?? "");
    setScreeningEnabled(posting.screeningEnabled);
    // Loaded straight from their own saved flags, not derived from whether
    // the requirement's own value is set — an employer can tick "Ask this"
    // before (or without ever) filling the field in.
    setAskMinExperience(posting.askMinYearsExperience);
    setAskMinEducation(posting.askMinQualificationTier);
    setAskDrivingLicense(posting.askDrivingLicense);
    setAskLanguages(posting.askLanguages);
    setAskWorkAuthorizations(posting.askWorkAuthorizations);
    setCustomQuestions(posting.customScreeningQuestions);
    setScreeningPreferred((posting.screeningPreferred ?? []) as PreferrableRequirement[]);
    setSkillSuggestions(posting.skillSuggestions);
    setLoadingExisting(false);
  }, [editingId, existingQuery.data, existingQuery.isError, existingQuery.error, t]);

  async function handleAiFill(titleOverride?: string) {
    const jobTitle = (titleOverride ?? title).trim();
    if (!jobTitle) return;
    setAiFillLoading(true);
    setAiFillError(null);
    setAiFillStatus(null);
    setAiFillElapsedMs(0);
    setAiFillTokens(null);
    setAiFillDurationMs(null);
    try {
      const companyAddress = defaultJobAddress(addresses);
      const data = await suggestPostingMutation.mutateAsync({
        jobTitle,
        companyIndustry: company?.industry ?? null,
        companySize: company?.size ?? null,
        companyLocation: companyAddress ? postingLocationLabel(companyAddress.area ?? "", companyAddress.city, companyAddress.state) : null,
      });
      const result = data.result as unknown as {
        description: string | null;
        responsibilities: string | null;
        industry: (typeof INDUSTRIES)[number] | null;
        employmentType: (typeof EMPLOYMENT_TYPES)[number]["value"] | null;
        workArrangement: (typeof WORK_ARRANGEMENTS)[number]["value"] | null;
        salaryMin: number | null;
        salaryMax: number | null;
        skills: string[];
        softSkills: string[];
        niceToHaveSkills: string[];
        minYearsExperience: number | null;
        minQualificationTier: (typeof QUALIFICATION_TIERS)[number] | null;
        languages: { language: string; dialect?: string | null; level: LanguageLevel }[];
        workAuthorizations: string[];
        drivingLicense: (typeof DRIVING_LICENSES)[number]["value"] | null;
      };

      // Only fills fields the employer hasn't already set by hand — same
      // rule as the company-profile "Fill with AI", so a generated
      // suggestion never clobbers a manual edit.
      // The internal posting name starts as the job title ("Graphic
      // Designer"), ready to add a tag like "— KL Branch (Urgent)".
      setPostingName((prev) => (prev.trim() ? prev : jobTitle));
      if (result.description) {
        setDescription((prev) => (prev.trim() ? prev : plainTextToHtml(result.description as string)));
      }
      if (result.responsibilities) {
        setResponsibilities((prev) => (prev.trim() ? prev : plainTextToHtml(result.responsibilities as string)));
      }
      if (result.industry) {
        setIndustry((prev) => (prev ? prev : (result.industry as (typeof INDUSTRIES)[number])));
      }
      if (result.employmentType) {
        setEmploymentType((prev) => (prev !== "full_time" ? prev : result.employmentType!));
      }
      if (result.workArrangement) {
        setWorkArrangement((prev) => (prev !== "onsite" ? prev : result.workArrangement!));
      }
      // The AI's range is always monthly — only used when the posting is too.
      if (salaryPeriod === "month") {
        if (result.salaryMin !== null && !salaryMin.trim()) setSalaryMin(String(result.salaryMin));
        if (result.salaryMax !== null && !salaryMax.trim()) setSalaryMax(String(result.salaryMax));
      }
      if (result.skills.length > 0) {
        setSkills((prev) => {
          const additions = result.skills
            .filter((s) => !includesSkillCaseInsensitive(prev, s))
            .slice(0, Math.max(0, MAX_MANUAL_SKILLS - prev.length));
          return additions.length === 0 ? prev : [...prev, ...additions];
        });
      }
      if (result.softSkills.length > 0) {
        setSoftSkills((prev) => {
          const additions = result.softSkills
            .filter((s) => !includesSkillCaseInsensitive(prev, s))
            .slice(0, Math.max(0, MAX_MANUAL_SKILLS - prev.length));
          return additions.length === 0 ? prev : [...prev, ...additions];
        });
      }
      if (result.niceToHaveSkills.length > 0) {
        setNiceToHaveSkills((prev) => {
          const additions = result.niceToHaveSkills
            .filter((s) => !includesSkillCaseInsensitive(prev, s))
            .slice(0, Math.max(0, MAX_MANUAL_SKILLS - prev.length));
          return additions.length === 0 ? prev : [...prev, ...additions];
        });
      }
      if (result.minYearsExperience !== null && !minYearsExperience.trim()) {
        setMinYearsExperience(String(result.minYearsExperience));
      }
      if (result.minQualificationTier) {
        setMinQualificationTier((prev) => (prev ? prev : (result.minQualificationTier as (typeof QUALIFICATION_TIERS)[number])));
      }
      if (result.languages.length > 0) {
        // A language already required (in any dialect) isn't added again.
        setLanguages((prev) => {
          const additions = result.languages
            .filter((l) => !prev.some((p) => sameLanguage(p.language, l.language)))
            .map((l) => ({ ...l, dialect: l.dialect ?? null }));
          return additions.length === 0 ? prev : [...prev, ...additions];
        });
      }
      if (result.workAuthorizations.length > 0) {
        setWorkAuthorizations((prev) => {
          const additions = result.workAuthorizations.filter((w) => !prev.includes(w));
          return additions.length === 0 ? prev : [...prev, ...additions];
        });
      }
      if (result.drivingLicense) {
        setDrivingLicense((prev) => (prev ? prev : (result.drivingLicense as (typeof DRIVING_LICENSES)[number]["value"])));
      }

      const usage = data.usage as { total_tokens?: unknown } | null | undefined;
      setAiFillTokens(typeof usage?.total_tokens === "number" ? usage.total_tokens : null);
      setAiFillDurationMs(typeof data.durationMs === "number" ? data.durationMs : null);
      setAiFillStatus(t("employerJobs.filledReview"));
    } catch (err) {
      setAiFillError(errorMessage(err, t("employerJobs.couldntGenerate")));
    } finally {
      setAiFillLoading(false);
    }
  }

  function addSkill() {
    const value = skillInput.trim();
    if (!value || includesSkillCaseInsensitive(skills, value) || skills.length >= MAX_MANUAL_SKILLS) {
      setSkillInput("");
      return;
    }
    setSkills((prev) => [...prev, value]);
    setSkillInput("");
  }

  function addSoftSkill() {
    const value = softSkillInput.trim();
    if (!value || includesSkillCaseInsensitive(softSkills, value) || softSkills.length >= MAX_MANUAL_SKILLS) {
      setSoftSkillInput("");
      return;
    }
    setSoftSkills((prev) => [...prev, value]);
    setSoftSkillInput("");
  }

  function addNiceToHaveSkill() {
    const value = niceToHaveSkillInput.trim();
    if (
      !value ||
      includesSkillCaseInsensitive(niceToHaveSkills, value) ||
      niceToHaveSkills.length >= MAX_MANUAL_SKILLS
    ) {
      setNiceToHaveSkillInput("");
      return;
    }
    setNiceToHaveSkills((prev) => [...prev, value]);
    setNiceToHaveSkillInput("");
  }

  function addBenefit(value: string) {
    const b = value.trim().slice(0, 60);
    setBenefitInput("");
    if (!b) return;
    setBenefits((prev) =>
      prev.length >= MAX_POSTING_BENEFITS || prev.some((x) => x.toLowerCase() === b.toLowerCase()) ? prev : [...prev, b],
    );
  }

  // A language can be required more than once with different dialects (e.g.
  // Cantonese and Hokkien), never the same language+dialect twice.
  const isRequired = (language: string, dialect: string | null) =>
    languages.some(
      (l) => sameLanguage(l.language, language) && (l.dialect ?? "").toLowerCase() === (dialect ?? "").toLowerCase(),
    );
  // The picked language's dialect choices: "Any dialect" first, then its
  // dialects — minus the ones already required. Empty if it has no dialects.
  const dialectChoices = languageDialects(languagePick).length
    ? [
        ...(isRequired(languagePick, null) ? [] : [{ value: "", label: t("employerJobs.anyDialectOption") }]),
        ...languageDialects(languagePick)
          .filter((d) => !isRequired(languagePick, d))
          .map((d) => ({ value: d, label: d })),
      ]
    : [];

  function pickLanguage(value: string) {
    setLanguagePick(value);
    // Starts on "Any dialect" (or the first dialect not required yet).
    const dialects = languageDialects(value);
    setDialectPick(dialects.length && isRequired(value, null) ? (dialects.find((d) => !isRequired(value, d)) ?? "") : "");
  }

  function addLanguage() {
    // A listed language, or (via "Other") whatever was typed — standardised
    // either way, so a typed "BM" still lands as "Malay".
    const value = canonicalLanguage(languagePick === OTHER_LANGUAGE ? languageInput : languagePick);
    const dialect = languageDialects(value).length ? dialectPick || null : null;
    if (value && !isRequired(value, dialect)) {
      setLanguages((prev) => [...prev, { language: value, dialect, level: languageLevelInput }]);
    }
    setLanguagePick("");
    setDialectPick("");
    setLanguageInput("");
  }

  function toggleWorkAuthorization(value: string) {
    setWorkAuthorizations((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  function goToField(fieldId: string) {
    const focusAndScroll = () => {
      const el = document.getElementById(fieldId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      if (el instanceof HTMLElement) el.focus({ preventScroll: true });
    };
    // Screening fields only exist in the DOM on the screening step — switch
    // there first and let the new step render before scrolling to it.
    if (SCREENING_FIELD_IDS.has(fieldId) && formStep !== "screening") {
      setFormStep("screening");
      requestAnimationFrame(() => requestAnimationFrame(focusAndScroll));
      return;
    }
    focusAndScroll();
  }

  // Tells the employer which required field(s) are blocking the disabled
  // "Post job" button — otherwise it just sits unclickable with no explanation.
  const requiredFieldChecklist = [
    { key: "jobTitle", label: t("employerJobs.jobTitle"), done: title.trim().length > 0, fieldId: "jobTitle" },
    { key: "description", label: t("employerJobs.description"), done: description.trim().length > 0, fieldId: "jobDescription" },
    { key: "jobDescription", label: t("employerJobs.jobDescription"), done: responsibilities.trim().length > 0, fieldId: "jobResponsibilities" },
    { key: "industry", label: t("employerJobs.industry"), done: industry.trim().length > 0, fieldId: "jobIndustry" },
    { key: "jobType", label: t("employerJobs.jobType"), done: !!employmentType, fieldId: "jobEmploymentType" },
    { key: "where", label: t("employerJobs.where"), done: !!workArrangement, fieldId: "jobWorkArrangement" },
    // Remote roles don't need an address.
    { key: "location", label: t("employerJobs.location"), done: location.trim().length > 0 || workArrangement === "remote", fieldId: "jobAddressLine1" },
    { key: "skills", label: t("employerJobs.skillsRequired"), done: skills.length > 0, fieldId: "skillInput" },
  ];
  const formValid = requiredFieldChecklist.every((item) => item.done);

  // Not required to post, but each one narrows the candidate pool or makes
  // the posting more appealing — friendly nudges, not blockers. Listed in
  // the same order as the form's cards, top to bottom.
  const boostChecklist = [
    { key: "postingName", label: t("employerJobs.boost.postingName"), done: postingName.trim().length > 0, fieldId: "jobPostingName" },
    { key: "languages", label: t("employerJobs.boost.languages"), done: languages.length > 0, fieldId: "languageInput" },
    {
      key: "salaryRange",
      label: t("employerJobs.boost.salaryRange"),
      done: salaryMin.trim().length > 0 && salaryMax.trim().length > 0,
      fieldId: "salaryMin",
    },
    { key: "showSalary", label: t("employerJobs.boost.showSalary"), done: showSalary, fieldId: "showSalary" },
    { key: "softSkills", label: t("employerJobs.boost.softSkills"), done: softSkills.length > 0, fieldId: "softSkillInput" },
    { key: "niceToHave", label: t("employerJobs.boost.niceToHave"), done: niceToHaveSkills.length > 0, fieldId: "niceToHaveSkillInput" },
    { key: "startDate", label: t("employerJobs.boost.startDate"), done: startAvailability !== "", fieldId: "jobStartAvailability" },
    { key: "workingHours", label: t("employerJobs.boost.workingHours"), done: workingHours.trim().length > 0, fieldId: "jobWorkingHours" },
    { key: "benefits", label: t("employerJobs.boost.benefits"), done: benefits.length > 0, fieldId: "jobBenefitInput" },
    { key: "contact", label: t("employerJobs.boost.contact"), done: contactUserId !== "", fieldId: "jobContactPerson" },
    // The four items below only make sense once screening requirements are
    // turned on — while it's off they're intentionally blank, not missing,
    // so they're left out of the nudge list entirely.
    ...(screeningEnabled
      ? [
          {
            key: "minExperience",
            label: t("employerJobs.boost.minExperience"),
            done: askMinExperience && minYearsExperience.trim().length > 0,
            fieldId: "minYearsExperience",
          },
          {
            key: "minEducation",
            label: t("employerJobs.boost.minEducation"),
            done: askMinEducation && minQualificationTier.trim().length > 0,
            fieldId: "minQualificationTier",
          },
          {
            key: "screenLanguage",
            label: t("employerJobs.boost.screenLanguage"),
            done: askLanguages && languages.length > 0,
            fieldId: "languageScreening",
          },
          {
            key: "workAuthorization",
            label: t("employerJobs.boost.workAuthorization"),
            done: askWorkAuthorizations && workAuthorizations.length > 0,
            fieldId: "workAuthorizations",
          },
        ]
      : []),
  ];
  const boostChecklistRemaining = boostChecklist.filter((item) => !item.done).length;

  // The posting as jobseekers will see it — built from this form, shown in
  // "Preview as jobseeker". Screening fields follow the same "only when
  // asked" rules as the saved payload below.
  const previewContact = contactOptions.find((c) => c.userId === contactUserId);
  const previewPosting: JobPosting = {
    id: "preview",
    title: title.trim() || t("employerJobs.jobTitleNotSet"),
    company: company?.name ?? t("employerJobs.yourCompany"),
    logoUrl: company?.logoUrl ?? null,
    jobType: t(`landing.jobs.employmentType.${employmentType}`),
    location: location.trim() || (workArrangement === "remote" ? REMOTE_LOCATION : t("jobDetails.notSpecified")),
    addressLine1: addressLine1.trim() || null,
    addressLine2: addressLine2.trim() || null,
    area: area.trim() || null,
    city: city.trim() || null,
    state: state || null,
    postcode: postcode.trim() || null,
    salary:
      (showSalary && formatSalary(t, Number(salaryMin) || null, Number(salaryMax) || null, salaryPeriod, "long")) ||
      t("landing.jobs.salary.notDisclosed"),
    postedAgo: t("employerJobs.justNow"),
    description,
    responsibilities,
    industry: industry || t("jobDetails.notSpecified"),
    workArrangement: t(`landing.jobs.workArrangement.${workArrangement}`),
    openings: Number(openings) || 1,
    skills,
    softSkills,
    minYearsExperience:
      screeningEnabled && askMinExperience && minYearsExperience.trim() ? Number(minYearsExperience) : null,
    minQualificationTier: (screeningEnabled && askMinEducation && minQualificationTier) || null,
    drivingLicense: (screeningEnabled && askDrivingLicense && drivingLicense) || undefined,
    languages,
    screeningLanguages: askLanguages ? languages : [],
    benefits,
    startLabel: startAvailabilityLabel(t, startAvailability),
    workingHours: workingHours.trim() || null,
    officeDays: workArrangement === "hybrid" && officeDays ? officeDaysLabel(t, Number(officeDays)) : null,
    contact: previewContact
      ? { name: previewContact.name, position: previewContact.position, avatarUrl: previewContact.avatarUrl }
      : null,
    workAuthorizations: screeningEnabled && askWorkAuthorizations ? workAuthorizations : [],
    screeningEnabled,
    customQuestions: screeningEnabled ? customQuestions.map(toPublicQuestion) : [],
  };

  // Salary card's competitiveness hint — against the AI's range for this
  // pay period when there is one, otherwise against what matching
  // candidates expect (monthly only).
  const activeSalarySuggestion =
    salarySuggestion?.period === salaryPeriod && salarySuggestion.title === title.trim().toLowerCase() ? salarySuggestion : null;
  const enteredSalary = { min: Number(salaryMin) || null, max: Number(salaryMax) || null };
  const salaryPlace = workArrangement === "remote" && !city.trim() ? t("employerJobs.remoteRoles") : `${city.trim() || state || "Malaysia"}`;
  const visibleSalaryInsight =
    salaryPeriod === "month" && title.trim() && salaryInsight?.key === salaryInsightKey ? salaryInsight.insight : null;
  const aiSalaryComparison = compareSalaryRange(enteredSalary, activeSalarySuggestion);
  const candidateSalaryComparison =
    !aiSalaryComparison && visibleSalaryInsight
      ? compareSalaryRange(enteredSalary, { min: visibleSalaryInsight.typicalMin, max: visibleSalaryInsight.typicalMax })
      : null;
  const salaryHint = aiSalaryComparison
    ? {
        tone: aiSalaryComparison,
        text:
          aiSalaryComparison === "below"
            ? t("employerJobs.salaryHint.aiBelow", { place: salaryPlace })
            : aiSalaryComparison === "above"
              ? t("employerJobs.salaryHint.aiAbove", { place: salaryPlace })
              : t("employerJobs.salaryHint.aiCompetitive", { place: salaryPlace }),
      }
    : candidateSalaryComparison
      ? {
          tone: candidateSalaryComparison,
          text:
            candidateSalaryComparison === "below"
              ? t("employerJobs.salaryHint.candidatesBelow")
              : candidateSalaryComparison === "above"
                ? t("employerJobs.salaryHint.candidatesAbove")
                : t("employerJobs.salaryHint.candidatesInLine"),
        }
      : null;

  // Anything the employer has typed or picked, beyond the untouched
  // defaults — used to decide whether leaving needs a confirmation at all.
  const hasUnsavedInput =
    postingName.trim().length > 0 ||
    benefits.join("|") !== startDefaults.benefits.join("|") ||
    startAvailability !== "" ||
    workingHours.trim().length > 0 ||
    contactUserId !== startDefaults.contactUserId ||
    hiringManagerIds.length > 0 ||
    title.trim().length > 0 ||
    description.trim().length > 0 ||
    responsibilities.trim().length > 0 ||
    industry.length > 0 ||
    // The pre-filled default address isn't the employer's own input.
    location.trim() !== startLocation ||
    officeDays !== "" ||
    salaryMin.trim().length > 0 ||
    salaryMax.trim().length > 0 ||
    salaryPeriod !== "month" ||
    !showSalary ||
    openings !== "1" ||
    skills.length > 0 ||
    softSkills.length > 0 ||
    niceToHaveSkills.length > 0 ||
    minYearsExperience.trim().length > 0 ||
    minQualificationTier.length > 0 ||
    languages.length > 0 ||
    workAuthorizations.length > 0 ||
    drivingLicense.length > 0 ||
    customQuestions.length > 0 ||
    screeningEnabled;

  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingProceed, setPendingProceed] = useState<(() => void) | null>(null);

  function guardNavigation(proceed: () => void) {
    if (hasUnsavedInput) {
      setPendingProceed(() => proceed);
      setShowLeaveConfirm(true);
    } else {
      proceed();
    }
  }

  useImperativeHandle(ref, () => ({ guardNavigation }));

  async function submitPosting(status: "draft" | "pending", onSuccess: () => void = onClose) {
    setSubmitting(true);
    setSubmitError(null);
    const payload = {
      status,
      postingName: postingName.trim() || null,
      benefits,
      startAvailability: startAvailability || null,
      workingHours: workingHours.trim() || null,
      contactUserId: contactUserId || null,
      hiringManagerIds,
      title: title.trim(),
      description: description.trim(),
      responsibilities: responsibilities.trim(),
      industry: industry || null,
      employmentType,
      workArrangement,
      officeDaysPerWeek: workArrangement === "hybrid" && officeDays ? Number(officeDays) : null,
      location: location.trim() || (workArrangement === "remote" ? REMOTE_LOCATION : ""),
      addressLine1: addressLine1.trim() || null,
      addressLine2: addressLine2.trim() || null,
      area: area.trim() || null,
      city: city.trim() || null,
      state: state || null,
      postcode: postcode.trim() || null,
      salaryMin: salaryMin.trim() ? Number(salaryMin) : null,
      salaryMax: salaryMax.trim() ? Number(salaryMax) : null,
      salaryPeriod,
      showSalary,
      openings: openings.trim() ? Number(openings) : 1,
      skills,
      softSkills,
      niceToHaveSkills,
      // Cleared, not just hidden, when the master toggle or a requirement's
      // own "ask this" toggle is off — a posting can't keep asking
      // applicants about something the employer explicitly excluded, even
      // if a value is still sitting in the field underneath.
      minYearsExperience:
        screeningEnabled && askMinExperience && minYearsExperience.trim() ? Number(minYearsExperience) : null,
      minQualificationTier: screeningEnabled && askMinEducation ? minQualificationTier || null : null,
      // Always saved and shown on the posting — whether applicants are
      // screened by them is askLanguages (+ screeningEnabled), checked server-side.
      languages,
      workAuthorizations: screeningEnabled && askWorkAuthorizations ? workAuthorizations : [],
      drivingLicense: screeningEnabled && askDrivingLicense ? drivingLicense || null : null,
      customScreeningQuestions: screeningEnabled ? customQuestions : [],
      screeningPreferred: screeningEnabled ? screeningPreferred : [],
      screeningEnabled,
      skillSuggestions,
      askMinYearsExperience: askMinExperience,
      askMinQualificationTier: askMinEducation,
      askDrivingLicense,
      askLanguages,
      askWorkAuthorizations,
    };
    try {
      if (editingId) await updateMutation.mutateAsync({ id: editingId, ...payload });
      else await createMutation.mutateAsync(payload);
      void queryClient.invalidateQueries({ queryKey: orpc.job.listOrgJobs.key() });
      void queryClient.invalidateQueries({ queryKey: orpc.employer.dashboard.key() });
      onSuccess();
    } catch (err) {
      setSubmitError(errorMessage(err, t("employerJobs.couldntSavePosting")));
      setSubmitting(false);
    }
  }

  // "1,234 tokens · 2.3s" after an AI call, when either is known.
  function usageNote(tokens: number | null, durationMs: number | null): string {
    if (!tokens && !durationMs) return "";
    return ` (${[
      tokens ? t("employerOnboarding.tokens", { tokens }) : null,
      durationMs ? `${(durationMs / 1000).toFixed(1)}s` : null,
    ]
      .filter(Boolean)
      .join(" · ")})`;
  }

  if (loadingExisting) {
    return (
      <div className={gradientFrameClass("teal")}>
        <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px] text-xs text-[#9AA3B2]">{t("employerJobs.loadingPosting")}</div>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className={gradientFrameClass("teal")}>
        <div className="flex flex-col items-start gap-[12px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <p className="text-sm text-[#141B2E]">{loadFailed}</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[38px] items-center justify-center rounded-full bg-brand-teal-dark px-[22px] text-sm text-white transition-opacity hover:opacity-90"
          >
            {t("employerJobs.backToManageJob")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[20px] lg:flex-row lg:items-start">
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!formValid) return;
        setShowPreview(true);
      }}
      className="flex min-w-0 flex-col gap-[20px] lg:flex-1"
    >
      <div className={gradientFrameClass("teal")}>
        <div className="@container relative flex flex-col gap-[16px] overflow-hidden rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <JobTitleIllustration
            lit={title.trim().length > 0}
            className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-auto [&>svg]:h-full [&>svg]:w-auto @[40rem]:block"
          />

          <div className="relative @[40rem]:max-w-[calc(100%-300px)]">
            <p className="text-sm text-[#141B2E]">{t("employerJobs.startWithTitle")}</p>
            <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("employerJobs.startWithTitleHint")}</p>
          </div>

          <Field
            label={t("employerJobs.jobTitle")}
            htmlFor="jobTitle"
            hint={<MatchHint field="targetRole" />}
            required
            className="relative @[40rem]:max-w-[calc(100%-300px)]"
          >
            <div className="flex flex-wrap gap-[8px]">
              <input
                id="jobTitle"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={aiFillLoading}
                placeholder={t("employerJobs.jobTitlePlaceholder")}
                className={`${inputClass} min-w-[180px] flex-1`}
              />
              <button
                type="button"
                onClick={() => handleAiFill()}
                disabled={!title.trim() || aiFillLoading}
                className={`flex h-[38px] shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[12px] bg-[linear-gradient(45deg,var(--color-brand-teal-dark),var(--color-brand-gold))] px-[14px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
                  aiFillLoading ? "ai-fill-pulse" : ""
                }`}
              >
                <SiriOrb className="h-[14px] w-[14px]" active={aiFillLoading} />
                {aiFillLoading
                  ? t("employerJobs.filling", { seconds: (aiFillElapsedMs / 1000).toFixed(1) })
                  : t("employerOnboarding.fillWithAi")}
              </button>
            </div>
            {(aiFillStatus || aiFillError) && (
              <p className={`mt-[6px] text-xs ${aiFillError ? "text-red-500" : "text-brand-teal-dark"}`}>
                {aiFillError ?? `${aiFillStatus}${usageNote(aiFillTokens, aiFillDurationMs)}`}
              </p>
            )}
          </Field>
        </div>
      </div>

      {formStep === "details" && (
      <>
      <div className={gradientFrameClass("teal")}>
      <div className="flex flex-col gap-[16px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
      <div>
        <p className="text-lg font-semibold text-[#141B2E]">{t("employerJobs.roleDetails")}</p>
        <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("employerJobs.roleDetailsHint")}</p>
      </div>

      <Field label={t("employerJobs.postingName")} htmlFor="jobPostingName" hint={<NoMatchHint />}>
        <input
          id="jobPostingName"
          type="text"
          value={postingName}
          onChange={(e) => setPostingName(e.target.value)}
          placeholder={t("employerJobs.postingNamePlaceholder")}
          className={inputClass}
        />
      </Field>

      <Field label={t("employerJobs.description")} htmlFor="jobDescription" hint={<MatchHint field={["bio", "workExperiences"]} />} required>
        <RichTextEditor
          id="jobDescription"
          value={description}
          onChange={setDescription}
          placeholder={t("employerJobs.descriptionPlaceholder")}
        />
      </Field>

      <Field label={t("employerJobs.jobDescription")} htmlFor="jobResponsibilities" hint={<MatchHint field="workExperiences" />} required>
        <RichTextEditor
          id="jobResponsibilities"
          value={responsibilities}
          onChange={setResponsibilities}
          placeholder={t("employerJobs.responsibilitiesPlaceholder")}
        />
      </Field>

      <div className="grid grid-cols-1 gap-x-[14px] gap-y-[12px] sm:grid-cols-2">
        <Field label={t("employerJobs.industry")} htmlFor="jobIndustry" hint={<MatchHint field="preferredIndustry" />} required>
          <Dropdown
            id="jobIndustry"
            label={t("employerJobs.industry")}
            value={industry}
            options={[
              { value: "" as const, label: t("employerOnboarding.selectIndustry") },
              ...INDUSTRIES.map((i) => ({ value: i, label: i })),
            ]}
            onChange={(value) => setIndustry(value as (typeof INDUSTRIES)[number] | "")}
            searchable
            searchPlaceholder={t("jobseekerOnboarding.searchIndustries")}
          />
        </Field>

        <Field label={t("employerJobs.openings")} htmlFor="openings" hint={<NoMatchHint />}>
          <input
            id="openings"
            type="number"
            min={1}
            value={openings}
            onChange={(e) => setOpenings(e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label={t("employerJobs.languages")}
        htmlFor="languageInput"
        hint={<MatchHint field="jobseekerLanguages" />}
      >
        <div className="flex flex-wrap gap-[8px] sm:flex-nowrap">
          <div className="min-w-[160px] flex-1">
            <Dropdown
              id="languageInput"
              label={t("employerJobs.language")}
              value={languagePick}
              searchable
              searchPlaceholder={t("employerJobs.searchLanguages")}
              options={[
                { value: "", label: t("employerJobs.chooseLanguage") },
                // Hidden once there's nothing left to add for it (no dialects
                // and already required, or "any" and every dialect required).
                ...LANGUAGE_OPTIONS.filter((o) =>
                  languageDialects(o.value).length
                    ? !isRequired(o.value, null) || languageDialects(o.value).some((d) => !isRequired(o.value, d))
                    : !isRequired(o.value, null),
                ),
                { value: OTHER_LANGUAGE, label: t("employerJobs.otherLanguage") },
              ]}
              onChange={pickLanguage}
            />
          </div>
          {dialectChoices.length > 0 && (
            <div className="min-w-[150px] flex-1">
              <Dropdown
                id="languageDialect"
                label={t("employerJobs.dialect")}
                value={dialectPick}
                options={dialectChoices}
                onChange={(value) => setDialectPick(value)}
              />
            </div>
          )}
          {languagePick === OTHER_LANGUAGE && (
            <input
              type="text"
              value={languageInput}
              onChange={(e) => setLanguageInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLanguage();
                }
              }}
              placeholder={t("employerJobs.typeLanguage")}
              autoFocus
              className={`${inputClass} min-w-[160px] flex-1`}
            />
          )}
          <div className="w-[150px] shrink-0">
            <Dropdown
              id="languageLevel"
              label={t("employerJobs.minimumLevel")}
              value={languageLevelInput}
              options={LANGUAGE_LEVELS.map((l) => ({ value: l.value, label: languageLevelLabel(t, l.value) }))}
              onChange={(value) => setLanguageLevelInput(value)}
            />
          </div>
          <button
            type="button"
            onClick={addLanguage}
            disabled={!languagePick || (languagePick === OTHER_LANGUAGE && !languageInput.trim())}
            className="h-[38px] shrink-0 whitespace-nowrap rounded-[12px] bg-brand-teal-soft px-[14px] text-sm text-brand-teal-dark hover:bg-[#CFF4F6] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("employerJobs.add")}
          </button>
        </div>
        {languages.length > 0 && (
          <div className="mt-[10px] flex flex-wrap gap-[6px]">
            {languages.map((entry) => (
              <span
                key={`${entry.language}|${entry.dialect ?? ""}`}
                className="flex items-center gap-[6px] rounded-full bg-[#F1F4F8] py-[6px] pl-[12px] pr-[8px] text-xs text-[#141B2E]"
              >
                {languageRequirementLabel(t, entry.language, entry.dialect)} —{" "}
                {languageLevelLabel(t, entry.level)}
                <button
                  type="button"
                  onClick={() => setLanguages((prev) => prev.filter((l) => l !== entry))}
                  aria-label={t("employerJobs.removeItem", { item: languageRequirementLabel(t, entry.language, entry.dialect) })}
                  className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.08] hover:text-[#141B2E]"
                >
                  <XIcon className="h-[9px] w-[9px]" />
                </button>
              </span>
            ))}
          </div>
        )}
      </Field>
      </div>
      </div>

      <div className={gradientFrameClass("teal")}>
      <div className="flex flex-col gap-[16px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
      <div>
        <p className="text-lg font-semibold text-[#141B2E]">{t("employerJobs.jobTypeWorkplace")}</p>
        <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("employerJobs.jobTypeWorkplaceHint")}</p>
      </div>

      <div className="grid grid-cols-1 gap-x-[14px] gap-y-[12px] sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t("employerJobs.jobType")} htmlFor="jobEmploymentType" hint={<MatchHint field="employmentType" />} required>
          <Dropdown
            id="jobEmploymentType"
            label={t("employerJobs.jobType")}
            value={employmentType}
            options={EMPLOYMENT_TYPES.map((type) => ({ value: type.value, label: t(`dashboard.employmentTypes.${type.value}`) }))}
            onChange={(value) => {
              setEmploymentType(value);
              // Freelance work is usually paid per project.
              if (value === "freelance" && salaryPeriod === "month" && !salaryMin.trim() && !salaryMax.trim()) {
                setSalaryPeriod("project");
              }
            }}
          />
        </Field>

        <Field label={t("employerJobs.where")} htmlFor="jobWorkArrangement" hint={<MatchHint field="workArrangement" />} required>
          <Dropdown
            id="jobWorkArrangement"
            label={t("employerJobs.where")}
            value={workArrangement}
            options={WORK_ARRANGEMENTS.map((w) => ({ value: w.value, label: t(`dashboard.workArrangements.${w.value}`) }))}
            onChange={(value) => setWorkArrangement(value)}
          />
        </Field>

        {workArrangement === "hybrid" && (
          <Field label={t("employerJobs.daysInOffice")} htmlFor="jobOfficeDays" hint={<NoMatchHint />}>
            <Dropdown
              id="jobOfficeDays"
              label={t("employerJobs.daysInOffice")}
              value={officeDays}
              options={[
                { value: "", label: t("jobDetails.notSpecified") },
                ...OFFICE_DAYS_OPTIONS.map((d) => ({ value: String(d), label: t("employerJobs.daysAWeek", { count: d }) })),
              ]}
              onChange={(value) => setOfficeDays(value)}
            />
          </Field>
        )}
      </div>

      <Field
        label={workArrangement === "remote" ? t("employerJobs.officeAddressOptional") : t("employerJobs.location")}
        htmlFor="jobAddressLine1"
        hint={<MatchHint field="location" />}
        required={workArrangement !== "remote"}
      >
        <div className="flex flex-col gap-[10px]">
          {workArrangement === "remote" && (
            <p className="text-xs text-[#9AA3B2]">{t("employerJobs.remoteNoAddress")}</p>
          )}
          {addresses.length > 0 && (
            <Dropdown
              id="jobLocationPicker"
              label={t("employerJobs.useSavedAddress")}
              value={selectedAddressId}
              options={[
                { value: "" as const, label: t("employerJobs.useSavedAddressEllipsis") },
                ...addresses.map((a) => ({
                  value: a.id,
                  label: `${a.label} — ${postingLocationLabel(a.area ?? "", a.city, a.state)}${
                    addresses.length > 1 && a.id === defaultJobAddress(addresses)?.id ? ` ${t("employerJobs.defaultSuffix")}` : ""
                  }`,
                })),
              ]}
              onChange={(value) => {
                const picked = addresses.find((a) => a.id === value);
                if (!picked) return;
                setSelectedAddressId(picked.id);
                setAddressLine1(picked.addressLine1);
                setAddressLine2(picked.addressLine2 ?? "");
                setArea(picked.area ?? "");
                setCity(picked.city);
                setState(picked.state as (typeof MALAYSIA_STATES)[number]);
                setPostcode(picked.postcode);
                setLocation(postingLocationLabel(picked.area ?? "", picked.city, picked.state));
              }}
            />
          )}
          <div className="grid grid-cols-1 gap-x-[14px] gap-y-[10px] sm:grid-cols-2">
            <input
              id="jobAddressLine1"
              type="text"
              value={addressLine1}
              onChange={(e) => {
                setAddressLine1(e.target.value);
                setSelectedAddressId("");
              }}
              placeholder={t("employerJobs.addressLine1Placeholder")}
              className={`${inputClass} sm:col-span-2`}
            />
            <input
              id="jobAddressLine2"
              type="text"
              value={addressLine2}
              onChange={(e) => {
                setAddressLine2(e.target.value);
                setSelectedAddressId("");
              }}
              placeholder={t("employerOnboarding.addressLine2Optional")}
              className={`${inputClass} sm:col-span-2`}
            />
            <input
              id="jobArea"
              type="text"
              maxLength={80}
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setSelectedAddressId("");
                setLocation(postingLocationLabel(e.target.value, city, state));
              }}
              placeholder={t("employerJobs.areaPlaceholder")}
              className={inputClass}
            />
            <input
              id="jobCity"
              type="text"
              value={city}
              onChange={(e) => {
                setCity(e.target.value);
                setSelectedAddressId("");
                setLocation(postingLocationLabel(area, e.target.value, state));
              }}
              placeholder={t("employerJobs.cityPlaceholder")}
              className={inputClass}
            />
            <Dropdown
              id="jobState"
              label={t("employerOnboarding.state")}
              value={state}
              options={[
                { value: "" as const, label: t("employerOnboarding.selectState") },
                ...MALAYSIA_STATES.map((s) => ({ value: s, label: s })),
              ]}
              onChange={(value) => {
                const nextState = value as (typeof MALAYSIA_STATES)[number] | "";
                setState(nextState);
                setSelectedAddressId("");
                setLocation(postingLocationLabel(area, city, nextState));
              }}
            />
            <input
              id="jobPostcode"
              type="text"
              inputMode="numeric"
              value={postcode}
              onChange={(e) => {
                setPostcode(e.target.value.replace(/\D/g, "").slice(0, 5));
                setSelectedAddressId("");
              }}
              placeholder={t("employerJobs.postcodePlaceholder")}
              className={inputClass}
            />
          </div>
          {addressLine1.trim() && city.trim() && state && (
            <iframe
              title={t("employerJobs.mapForLocation")}
              src={`https://www.google.com/maps?q=${encodeURIComponent(
                `${addressLine1}, ${addressLine2 ? `${addressLine2}, ` : ""}${area.trim() ? `${area.trim()}, ` : ""}${city}, ${state}${postcode ? ` ${postcode}` : ""}, Malaysia`,
              )}&output=embed`}
              loading="lazy"
              className="h-[160px] w-full rounded-[12px] border border-black/[0.08]"
            />
          )}
        </div>
      </Field>
      </div>
      </div>

      <div className={gradientFrameClass("teal")}>
      <div className="flex flex-col gap-[16px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <div>
          <p className="text-lg font-semibold text-[#141B2E]">{t("employerJobs.salary")}</p>
          <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("employerJobs.salaryHintText")}</p>
        </div>
        <button
          type="button"
          onClick={suggestSalary}
          disabled={suggestingSalary || !title.trim()}
          title={title.trim() ? undefined : t("employerJobs.enterJobTitleFirst")}
          className={`flex h-[38px] shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[12px] bg-[linear-gradient(45deg,var(--color-brand-teal-dark),var(--color-brand-gold))] px-[14px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
            suggestingSalary ? "ai-fill-pulse" : ""
          }`}
        >
          <SiriOrb className="h-[14px] w-[14px]" active={suggestingSalary} />
          {suggestingSalary ? t("employerJobs.suggesting") : t("employerJobs.suggestSalary")}
        </button>
      </div>

      {salarySuggestError && <p className="text-xs text-red-500">{salarySuggestError}</p>}

      {activeSalarySuggestion && (
        <div className="flex flex-wrap items-center justify-between gap-[10px] rounded-[12px] bg-brand-teal-soft px-[14px] py-[10px]">
          <div className="min-w-0">
            <p className="text-sm text-[#141B2E]">
              {t("employerJobs.aiSuggests")}{" "}
              <span className="font-semibold">
                {formatSalary(t, activeSalarySuggestion.min, activeSalarySuggestion.max, activeSalarySuggestion.period)}
              </span>
            </p>
            {activeSalarySuggestion.reason && (
              <p className="mt-[2px] text-xs text-[#4B5468]">{activeSalarySuggestion.reason}</p>
            )}
            <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("employerJobs.aiEstimateNote")}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSalaryMin(String(activeSalarySuggestion.min));
              setSalaryMax(String(activeSalarySuggestion.max));
            }}
            className="h-[34px] shrink-0 whitespace-nowrap rounded-[10px] bg-white px-[12px] text-sm text-brand-teal-dark hover:bg-[#CFF4F6]"
          >
            {t("employerJobs.useThisRange")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-x-[14px] gap-y-[12px] sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t("employerJobs.payPeriod")} htmlFor="salaryPeriod" hint={<NoMatchHint />}>
          <Dropdown
            id="salaryPeriod"
            label={t("employerJobs.payPeriod")}
            value={salaryPeriod}
            options={SALARY_PERIODS.map((p) => ({ value: p.value, label: t(`employerJobs.salaryPeriods.${p.value}`) }))}
            onChange={(value) => setSalaryPeriod(value)}
          />
        </Field>

        <Field label={t("employerJobs.salaryMin")} htmlFor="salaryMin" hint={<MatchHint field="expectedSalaryMin" />}>
          <input
            id="salaryMin"
            type="number"
            min={0}
            value={salaryMin}
            onChange={(e) => setSalaryMin(e.target.value)}
            placeholder={t("employerJobs.eg", { example: SALARY_PLACEHOLDERS[salaryPeriod][0] })}
            className={inputClass}
          />
        </Field>

        <Field label={t("employerJobs.salaryMax")} htmlFor="salaryMax" hint={<MatchHint field="expectedSalaryMax" />}>
          <input
            id="salaryMax"
            type="number"
            min={0}
            value={salaryMax}
            onChange={(e) => setSalaryMax(e.target.value)}
            placeholder={t("employerJobs.eg", { example: SALARY_PLACEHOLDERS[salaryPeriod][1] })}
            className={inputClass}
          />
        </Field>
      </div>

      {(salaryHint || visibleSalaryInsight) && (
        <div className="flex flex-col gap-[4px]">
          {salaryHint && (
            <p
              className={`text-xs ${
                salaryHint.tone === "below"
                  ? "text-[#B4561F]"
                  : salaryHint.tone === "above"
                    ? "text-brand-teal-dark"
                    : "text-[#2F7D4F]"
              }`}
            >
              {salaryHint.tone === "below" ? "▼ " : salaryHint.tone === "above" ? "▲ " : "✓ "}
              {salaryHint.text}
            </p>
          )}
          {visibleSalaryInsight && (
            <p className="text-xs text-[#4B5468]">
              {visibleSalaryInsight.scope === "role_state"
                ? t("employerJobs.insight.candidatesInState", { state: visibleSalaryInsight.state })
                : visibleSalaryInsight.scope === "industry"
                  ? t("employerJobs.insight.candidatesInIndustry")
                  : t("employerJobs.insight.candidates")}{" "}
              <span className="text-[#141B2E]">
                {formatSalary(t, visibleSalaryInsight.typicalMin, visibleSalaryInsight.typicalMax, "month")}
              </span>{" "}
              <span className="text-[#9AA3B2]">
                {t("employerJobs.insight.basedOn", { count: visibleSalaryInsight.count })}
              </span>
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-[4px]">
        <label className="flex items-start gap-[8px] text-sm text-[#141B2E]">
          <input
            id="showSalary"
            type="checkbox"
            checked={showSalary}
            onChange={(e) => setShowSalary(e.target.checked)}
            className="mt-[2px] h-[15px] w-[15px] shrink-0 accent-brand-teal-dark"
          />
          {t("employerJobs.showSalaryOnPosting")}
        </label>
        {!showSalary && (
          <p className="text-xs text-[#B4561F]">{t("employerJobs.hiddenSalaryWarning")}</p>
        )}
      </div>
      </div>
      </div>

      <div className={gradientFrameClass("teal")}>
      <div className="flex flex-col gap-[16px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <p className="text-lg font-semibold text-[#141B2E]">{t("employerJobs.skills")}</p>
        <button
          type="button"
          onClick={suggestSkills}
          disabled={suggestingSkills || !title.trim()}
          className={`flex h-[38px] shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[12px] bg-[linear-gradient(45deg,var(--color-brand-teal-dark),var(--color-brand-gold))] px-[14px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
            suggestingSkills ? "ai-fill-pulse" : ""
          }`}
        >
          <SiriOrb className="h-[14px] w-[14px]" active={suggestingSkills} />
          {suggestingSkills
            ? t("employerJobs.suggestingSeconds", { seconds: (suggestSkillsElapsedMs / 1000).toFixed(1) })
            : t("employerJobs.suggestSkillsForRole")}
        </button>
      </div>
      {(suggestSkillsStatus || suggestSkillsError) && (
        <p className={`text-xs ${suggestSkillsError ? "text-red-500" : "text-brand-teal-dark"}`}>
          {suggestSkillsError ?? `${suggestSkillsStatus}${usageNote(suggestSkillsTokens, suggestSkillsDurationMs)}`}
        </p>
      )}

      <Field label={t("employerJobs.skillsRequired")} htmlFor="skillInput" hint={<MatchHint field="professionalSkills" />} required>
        <input
          id="skillInput"
          type="text"
          value={skillInput}
          onChange={(e) => setSkillInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addSkill();
            }
          }}
          onBlur={addSkill}
          placeholder={t("employerJobs.skillPlaceholder")}
          className={inputClass}
        />
        {skills.length > 0 && (
          <div className="mt-[10px] flex flex-wrap gap-[6px]">
            {skills.map((skill) => (
              <span
                key={skill}
                className="flex items-center gap-[6px] rounded-full bg-brand-teal-dark py-[6px] pl-[12px] pr-[8px] text-xs text-white"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => setSkills((prev) => prev.filter((s) => s !== skill))}
                  aria-label={t("employerJobs.removeItem", { item: skill })}
                  className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white"
                >
                  <XIcon className="h-[9px] w-[9px]" />
                </button>
              </span>
            ))}
          </div>
        )}
        {skillSuggestions && skillSuggestions.professionalSkills.length > 0 && (
          <div className="mt-[10px] flex flex-wrap gap-[6px]">
            {skillSuggestions.professionalSkills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => addSuggestedSkill(skill)}
                className="flex items-center gap-[4px] rounded-full border border-dashed border-black/[0.15] py-[6px] pl-[12px] pr-[10px] text-sm text-[#4B5468] hover:border-brand-teal-dark hover:text-brand-teal-dark"
              >
                <PlusIcon className="h-[8px] w-[8px]" />
                {skill}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label={t("employerJobs.softSkillsOptional")} htmlFor="softSkillInput" hint={<MatchHint field="softSkills" />}>
        <input
          id="softSkillInput"
          type="text"
          value={softSkillInput}
          onChange={(e) => setSoftSkillInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addSoftSkill();
            }
          }}
          onBlur={addSoftSkill}
          placeholder={t("employerJobs.softSkillPlaceholder")}
          className={inputClass}
        />
        {softSkills.length > 0 && (
          <div className="mt-[10px] flex flex-wrap gap-[6px]">
            {softSkills.map((skill) => (
              <span
                key={skill}
                className="flex items-center gap-[6px] rounded-full bg-brand-teal-dark py-[6px] pl-[12px] pr-[8px] text-xs text-white"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => setSoftSkills((prev) => prev.filter((s) => s !== skill))}
                  aria-label={t("employerJobs.removeItem", { item: skill })}
                  className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white"
                >
                  <XIcon className="h-[9px] w-[9px]" />
                </button>
              </span>
            ))}
          </div>
        )}
        {skillSuggestions && skillSuggestions.softSkills.length > 0 && (
          <div className="mt-[10px] flex flex-wrap gap-[6px]">
            {skillSuggestions.softSkills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => addSuggestedSoftSkill(skill)}
                className="flex items-center gap-[4px] rounded-full border border-dashed border-black/[0.15] py-[6px] pl-[12px] pr-[10px] text-sm text-[#4B5468] hover:border-brand-teal-dark hover:text-brand-teal-dark"
              >
                <PlusIcon className="h-[8px] w-[8px]" />
                {skill}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field
        label={t("employerJobs.niceToHaveOptional")}
        htmlFor="niceToHaveSkillInput"
        hint={<MatchHint field="niceToHaveSkills" />}
      >
        <input
          id="niceToHaveSkillInput"
          type="text"
          value={niceToHaveSkillInput}
          onChange={(e) => setNiceToHaveSkillInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addNiceToHaveSkill();
            }
          }}
          onBlur={addNiceToHaveSkill}
          placeholder={t("employerJobs.niceToHavePlaceholder")}
          className={inputClass}
        />
        {niceToHaveSkills.length > 0 && (
          <div className="mt-[10px] flex flex-wrap gap-[6px]">
            {niceToHaveSkills.map((skill) => (
              <span
                key={skill}
                className="flex items-center gap-[6px] rounded-full bg-brand-teal-dark py-[6px] pl-[12px] pr-[8px] text-xs text-white"
              >
                {skill}
                <button
                  type="button"
                  onClick={() => setNiceToHaveSkills((prev) => prev.filter((s) => s !== skill))}
                  aria-label={t("employerJobs.removeItem", { item: skill })}
                  className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white"
                >
                  <XIcon className="h-[9px] w-[9px]" />
                </button>
              </span>
            ))}
          </div>
        )}
        {skillSuggestions && skillSuggestions.niceToHaveSkills.length > 0 && (
          <div className="mt-[10px] flex flex-wrap gap-[6px]">
            {skillSuggestions.niceToHaveSkills.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => addSuggestedNiceToHaveSkill(skill)}
                className="flex items-center gap-[4px] rounded-full border border-dashed border-black/[0.15] py-[6px] pl-[12px] pr-[10px] text-sm text-[#4B5468] hover:border-brand-teal-dark hover:text-brand-teal-dark"
              >
                <PlusIcon className="h-[8px] w-[8px]" />
                {skill}
              </button>
            ))}
          </div>
        )}
      </Field>
      </div>
      </div>

      <div className={gradientFrameClass("teal")}>
      <div className="flex flex-col gap-[16px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
      <div>
        <p className="text-lg font-semibold text-[#141B2E]">{t("employerJobs.benefitsConditions")}</p>
        <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("employerJobs.benefitsConditionsHint")}</p>
      </div>

      <div className="grid grid-cols-1 gap-x-[14px] gap-y-[16px] sm:grid-cols-2">
        <Field label={t("jobDetails.startDate")} htmlFor="jobStartAvailability" hint={<NoMatchHint />}>
          <Dropdown
            id="jobStartAvailability"
            label={t("jobDetails.startDate")}
            value={startAvailability}
            options={[
              { value: "" as const, label: t("jobDetails.notSpecified") },
              ...START_AVAILABILITY.map((o) => ({ value: o.value, label: t(`jobDetails.startAvailability.${o.value}`) })),
            ]}
            onChange={(value) => setStartAvailability(value)}
          />
        </Field>
      </div>

      <Field label={t("jobDetails.workingHours")} htmlFor="jobWorkingHours" hint={<NoMatchHint />}>
        <input
          id="jobWorkingHours"
          type="text"
          value={workingHours}
          maxLength={MAX_WORKING_HOURS_LENGTH}
          onChange={(e) => setWorkingHours(e.target.value)}
          placeholder={t("employerJobs.workingHoursPlaceholder")}
          className={inputClass}
        />
        <div className="mt-[8px] flex flex-wrap gap-[6px]">
          {WORKING_HOURS_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setWorkingHours(preset)}
              className={`rounded-full border px-[10px] py-[5px] text-xs ${
                workingHours === preset
                  ? "border-brand-teal-dark bg-brand-teal-soft text-brand-teal-dark"
                  : "border-black/[0.1] text-[#4B5468] hover:bg-black/[0.03]"
              }`}
            >
              {preset}
            </button>
          ))}
        </div>
      </Field>

      <Field label={t("jobDetails.benefits")} htmlFor="jobBenefitInput" hint={<NoMatchHint />}>
        {companyBenefits.length > 0 && !editingId && (
          <p className="mb-[8px] text-xs text-[#9AA3B2]">{t("employerJobs.benefitsPrefilled")}</p>
        )}
        {benefits.length > 0 && (
          <div className="mb-[10px] flex flex-wrap gap-[6px]">
            {benefits.map((b) => (
              <span
                key={b}
                className="flex items-center gap-[6px] rounded-full bg-brand-teal-dark py-[6px] pl-[12px] pr-[8px] text-xs text-white"
              >
                {b}
                <button
                  type="button"
                  onClick={() => setBenefits((prev) => prev.filter((x) => x !== b))}
                  aria-label={t("employerJobs.removeItem", { item: b })}
                  className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-white/70 hover:bg-white/20 hover:text-white"
                >
                  <XIcon className="h-[9px] w-[9px]" />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-[8px]">
          <input
            id="jobBenefitInput"
            type="text"
            value={benefitInput}
            onChange={(e) => setBenefitInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addBenefit(benefitInput);
              }
            }}
            placeholder={t("employerJobs.addAnotherBenefit")}
            className={`${inputClass} flex-1`}
          />
          <button
            type="button"
            onClick={() => addBenefit(benefitInput)}
            disabled={!benefitInput.trim() || benefits.length >= MAX_POSTING_BENEFITS}
            className="h-[38px] shrink-0 whitespace-nowrap rounded-[12px] bg-brand-teal-soft px-[14px] text-sm text-brand-teal-dark hover:bg-[#CFF4F6] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("employerJobs.add")}
          </button>
        </div>
        {POSTING_BENEFITS.some((b) => !benefits.includes(b)) && (
          <div className="mt-[10px] flex flex-wrap gap-[6px]">
            {POSTING_BENEFITS.filter((b) => !benefits.includes(b)).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => addBenefit(b)}
                className="flex items-center gap-[4px] rounded-full border border-dashed border-black/[0.15] py-[6px] pl-[12px] pr-[10px] text-sm text-[#4B5468] hover:border-brand-teal-dark hover:text-brand-teal-dark"
              >
                <PlusIcon className="h-[8px] w-[8px]" />
                {b}
              </button>
            ))}
          </div>
        )}
      </Field>

      <Field label={t("employerJobs.contactPerson")} htmlFor="jobContactPerson" hint={<NoMatchHint />}>
        <Dropdown
          id="jobContactPerson"
          label={t("employerJobs.contactPerson")}
          value={contactUserId}
          options={[
            { value: "", label: t("employerJobs.dontShowContact") },
            ...contactOptions.map((c) => ({
              value: c.userId,
              label: c.position ? `${c.name} — ${c.position}` : c.name,
            })),
          ]}
          onChange={(value) => setContactUserId(value)}
        />
        <p className="mt-[4px] text-xs text-[#9AA3B2]">{t("employerJobs.contactPersonHint")}</p>
      </Field>

      <Field label={t("employerJobs.hiringManagersOptional")} htmlFor="jobHiringManagers">
        <div id="jobHiringManagers" className="flex flex-wrap gap-[6px]">
            {allHiringManagers.map((m) => {
              const selected = hiringManagerIds.includes(m.teamMemberId);
              return (
                <button
                  key={m.teamMemberId}
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() =>
                    setHiringManagerIds((prev) =>
                      selected ? prev.filter((id) => id !== m.teamMemberId) : [...prev, m.teamMemberId],
                    )
                  }
                  className={`flex items-center gap-[8px] rounded-full border py-[4px] pl-[4px] pr-[12px] text-sm transition-colors ${
                    selected
                      ? "border-brand-teal-dark bg-brand-teal-soft text-brand-teal-dark"
                      : "border-black/[0.1] bg-white text-[#4B5468] hover:border-brand-teal-dark"
                  }`}
                >
                  {m.avatarUrl ? (
                    <img src={m.avatarUrl} alt="" referrerPolicy="no-referrer" className="h-[24px] w-[24px] rounded-full object-cover" />
                  ) : (
                    <span className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-[#EAF0FE] text-[#3B5BDB]">
                      <UserIcon className="h-[12px] w-[12px]" />
                    </span>
                  )}
                  <span className="max-w-[180px] truncate">{m.name}</span>
                  {m.pending && <span className="text-xs text-[#9AA3B2]">{t("employerJobs.invited")}</span>}
                  {selected && <CheckIcon className="h-[9px] w-[9px]" />}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setShowQuickInvite(true)}
              className="flex items-center gap-[4px] rounded-full border border-dashed border-black/[0.15] py-[6px] pl-[12px] pr-[10px] text-sm text-[#4B5468] hover:border-brand-teal-dark hover:text-brand-teal-dark"
            >
              {t("employerJobs.inviteHiringManager")}
              <PlusIcon className="h-[8px] w-[8px]" />
            </button>
        </div>
        <p className="mt-[4px] text-xs text-[#9AA3B2]">{t("employerJobs.hiringManagersHint")}</p>
      </Field>
      </div>
      </div>

      <div className={gradientFrameClass("teal")}>
      <div className="flex flex-col gap-[16px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
      {submitError && <p className="text-xs text-red-500">{submitError}</p>}
      <div className="flex flex-col gap-[8px] sm:flex-row">
        <button
          type="button"
          disabled={!formValid}
          onClick={() => setFormStep("screening")}
          className="flex h-[38px] shrink-0 items-center sm:flex-1 justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("employerJobs.continue")}
        </button>
        <button
          type="button"
          disabled={submitting || !title.trim()}
          onClick={() => submitPosting("draft")}
          className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] px-[22px] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? t("employerOnboarding.saving") : t("employerJobs.saveAsDraft")}
        </button>
        <button
          type="button"
          onClick={() => guardNavigation(onClose)}
          className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] px-[22px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
        >
          {t("employerJobs.cancel")}
        </button>
      </div>
      </div>
      </div>
      </>
      )}

      {formStep === "screening" && (
      <>
      <div className={gradientFrameClass("teal")}>
      <div className="flex flex-col gap-[16px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
      <div className="flex flex-col gap-[10px]">
        <p className="text-sm text-[#141B2E]">{t("jobDetails.screeningRequirements")}</p>
        <label className="flex items-start gap-[8px] text-sm text-[#141B2E]">
          <input
            type="checkbox"
            checked={screeningEnabled}
            onChange={(e) => setScreeningEnabled(e.target.checked)}
            className="mt-[2px] h-[15px] w-[15px] shrink-0 accent-brand-teal-dark"
          />
          {t("employerJobs.addScreening")}
        </label>
        <p className="text-xs text-[#9AA3B2]">
          {screeningEnabled ? t("employerJobs.screeningOnHint") : t("employerJobs.screeningOffHint")}
        </p>
      </div>

      {screeningEnabled && (
      <>
      <div className="flex flex-col gap-[12px]">
        <Field
          label={t("employerJobs.minExperienceYears")}
          htmlFor="minYearsExperience"
          hint={<><MatchHint field="yearsExperience" /><PriorityToggle preferred={screeningPreferred.includes("yearsExperience")} onChange={(p) => setRequirementPreferred("yearsExperience", p)} disabled={!askMinExperience} /><AskToggle checked={askMinExperience} onChange={setAskMinExperience} label={t("employerJobs.askThis")} /></>}
        >
          <input
            id="minYearsExperience"
            type="number"
            min={0}
            disabled={!askMinExperience}
            value={minYearsExperience}
            onChange={(e) => setMinYearsExperience(e.target.value)}
            placeholder={t("employerJobs.eg", { example: 2 })}
            className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#F8FAFB] disabled:text-[#9AA3B2]`}
          />
        </Field>

        <Field
          label={t("jobDetails.minimumEducation")}
          htmlFor="minQualificationTier"
          hint={<><MatchHint field="qualificationTier" /><PriorityToggle preferred={screeningPreferred.includes("qualificationTier")} onChange={(p) => setRequirementPreferred("qualificationTier", p)} disabled={!askMinEducation} /><AskToggle checked={askMinEducation} onChange={setAskMinEducation} label={t("employerJobs.askThis")} /></>}
        >
          <Dropdown
            id="minQualificationTier"
            label={t("jobDetails.minimumEducation")}
            value={minQualificationTier}
            disabled={!askMinEducation}
            options={[
              { value: "" as const, label: t("employerJobs.noRequirement") },
              ...QUALIFICATION_TIERS.map((tier) => ({ value: tier, label: qualificationLabel(t, tier) })),
            ]}
            onChange={(value) => setMinQualificationTier(value as (typeof QUALIFICATION_TIERS)[number] | "")}
          />
        </Field>

        <Field
          label={t("employerJobs.drivingLicenseOptional")}
          htmlFor="drivingLicense"
          hint={<><MatchHint field="drivingLicense" /><PriorityToggle preferred={screeningPreferred.includes("drivingLicense")} onChange={(p) => setRequirementPreferred("drivingLicense", p)} disabled={!askDrivingLicense} /><AskToggle checked={askDrivingLicense} onChange={setAskDrivingLicense} label={t("employerJobs.askThis")} /></>}
        >
          <Dropdown
            id="drivingLicense"
            label={t("jobDetails.drivingLicense")}
            value={drivingLicense}
            disabled={!askDrivingLicense}
            options={[
              { value: "" as const, label: t("employerJobs.notRequired") },
              ...DRIVING_LICENSES.map((d) => ({ value: d.value, label: drivingLicenseLabel(t, d.value) })),
            ]}
            onChange={(value) => setDrivingLicense(value)}
          />
        </Field>
      </div>

      <Field
        label={t("jobDetails.languagesRequired")}
        htmlFor="languageScreening"
        hint={<><MatchHint field="jobseekerLanguages" /><PriorityToggle preferred={screeningPreferred.includes("languages")} onChange={(p) => setRequirementPreferred("languages", p)} disabled={!askLanguages} /><AskToggle checked={askLanguages} onChange={setAskLanguages} label={t("employerJobs.askThis")} /></>}
      >
        {/* The languages themselves are set under Role details (always on the
            posting); this only decides whether applicants are asked about
            them and screened out if they fall short. */}
        <div id="languageScreening" className={askLanguages ? "" : "opacity-50"}>
          {languages.length > 0 ? (
            <div className="flex flex-wrap gap-[6px]">
              {languages.map((entry) => (
                <span key={`${entry.language}|${entry.dialect ?? ""}`} className="rounded-full bg-[#F1F4F8] px-[12px] py-[6px] text-xs text-[#141B2E]">
                  {languageRequirementLabel(t, entry.language, entry.dialect)} — {languageLevelLabel(t, entry.level)}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[#9AA3B2]">{t("employerJobs.noLanguagesYet")}</p>
          )}
        </div>
      </Field>

      <Field
        label={t("landing.jobs.workAuthorization")}
        htmlFor="workAuthorizations"
        hint={<><MatchHint field="workAuthorization" /><PriorityToggle preferred={screeningPreferred.includes("workAuthorization")} onChange={(p) => setRequirementPreferred("workAuthorization", p)} disabled={!askWorkAuthorizations} /><AskToggle checked={askWorkAuthorizations} onChange={setAskWorkAuthorizations} label={t("employerJobs.askThis")} /></>}
      >
        <div id="workAuthorizations" className="flex flex-col gap-[8px]">
          {WORK_AUTHORIZATIONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-[8px] text-sm text-[#141B2E] ${!askWorkAuthorizations ? "opacity-40" : ""}`}
            >
              <input
                type="checkbox"
                disabled={!askWorkAuthorizations}
                checked={workAuthorizations.includes(option.value)}
                onChange={() => toggleWorkAuthorization(option.value)}
                className="h-[15px] w-[15px] accent-brand-teal-dark disabled:cursor-not-allowed"
              />
              {workAuthorizationLabel(t, option.value)}
            </label>
          ))}
        </div>
      </Field>
      </>
      )}
      </div>
      </div>

      {screeningEnabled && (
      <div className={gradientFrameClass("teal")}>
      <div className="flex flex-col gap-[16px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
      <Field label={t("employerJobs.customQuestionsOptional")} htmlFor="customQuestionInput">
        <div className="flex flex-col gap-[8px] sm:flex-row">
          <div className="w-full shrink-0 sm:w-[150px]">
            <Dropdown
              id="customQuestionType"
              label={t("employerJobs.questionType")}
              value={customQuestionType}
              options={SCREENING_QUESTION_TYPES.map((type) => ({ value: type, label: t(`employerJobs.questionTypes.${type}`) }))}
              onChange={(value) => {
                setCustomQuestionType(value);
                setCustomQuestionError(null);
              }}
            />
          </div>
          <input
            id="customQuestionInput"
            type="text"
            value={customQuestionInput}
            onChange={(e) => setCustomQuestionInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomQuestion();
              }
            }}
            placeholder={t(`employerJobs.questionPlaceholders.${customQuestionType}`)}
            maxLength={200}
            className={`${inputClass} flex-1`}
          />
          {customQuestionType === "yesno" && (
            <div className="w-full shrink-0 sm:w-[130px]">
              <Dropdown
                id="customQuestionRequiredAnswer"
                label={t("employerJobs.correctAnswer")}
                value={customQuestionRequiredAnswer ? "yes" : "no"}
                options={[
                  { value: "yes" as const, label: t("employerJobs.yesRequired") },
                  { value: "no" as const, label: t("employerJobs.noRequired") },
                ]}
                onChange={(value) => setCustomQuestionRequiredAnswer(value === "yes")}
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => addCustomQuestion()}
            className="h-[38px] shrink-0 whitespace-nowrap rounded-[12px] bg-brand-teal-soft px-[14px] text-sm text-brand-teal-dark hover:bg-[#CFF4F6]"
          >
            {t("employerJobs.add")}
          </button>
        </div>

        {customQuestionType === "choice" && (
          <div className="mt-[8px] flex flex-col gap-[8px]">
            <div className="flex gap-[8px]">
              <input
                type="text"
                value={choiceInput}
                onChange={(e) => setChoiceInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChoiceOption();
                  }
                }}
                placeholder={t("employerJobs.addOptionPlaceholder")}
                aria-label={t("employerJobs.addAnOption")}
                maxLength={80}
                className={`${inputClass} flex-1`}
              />
              <button
                type="button"
                onClick={addChoiceOption}
                className="h-[38px] shrink-0 whitespace-nowrap rounded-[12px] border border-black/[0.1] px-[14px] text-sm text-[#4B5468] hover:border-brand-teal-dark hover:text-brand-teal-dark"
              >
                {t("employerJobs.addOption")}
              </button>
            </div>
            {choiceOptions.length > 0 && (
              <>
                <div className="flex flex-wrap gap-[6px]">
                  {choiceOptions.map((option) => {
                    const accepted = choiceAccepted.includes(option);
                    return (
                      <span
                        key={option}
                        className={`flex items-center gap-[6px] rounded-full border py-[4px] pl-[12px] pr-[8px] text-sm ${
                          accepted
                            ? "border-brand-teal-dark bg-brand-teal-soft text-brand-teal-dark"
                            : "border-black/[0.1] bg-white text-[#4B5468]"
                        }`}
                      >
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={accepted}
                          onClick={() =>
                            setChoiceAccepted((prev) =>
                              accepted ? prev.filter((o) => o !== option) : [...prev, option],
                            )
                          }
                          className="flex items-center gap-[6px]"
                        >
                          {accepted && <CheckIcon className="h-[9px] w-[9px]" />}
                          {option}
                        </button>
                        <button
                          type="button"
                          onClick={() => removeChoiceOption(option)}
                          aria-label={t("employerJobs.removeItem", { item: option })}
                          className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.08] hover:text-[#141B2E]"
                        >
                          <XIcon className="h-[9px] w-[9px]" />
                        </button>
                      </span>
                    );
                  })}
                </div>
                <p className="text-xs text-[#9AA3B2]">{t("employerJobs.tickedOptionsQualify")}</p>
              </>
            )}
          </div>
        )}

        {customQuestionType === "number" && (
          <div className="mt-[8px]">
            <input
              type="number"
              value={customQuestionMin}
              onChange={(e) => setCustomQuestionMin(e.target.value)}
              placeholder={t("employerJobs.minimumQualifiesOptional")}
              aria-label={t("employerJobs.minimumQualifies")}
              className={inputClass}
            />
          </div>
        )}

        <div className="mt-[8px] flex flex-wrap items-center gap-x-[16px] gap-y-[6px]">
          {(customQuestionType === "yesno" ||
            customQuestionType === "choice" ||
            (customQuestionType === "number" && customQuestionMin.trim() !== "")) && (
            <PriorityToggle preferred={customQuestionPreferred} onChange={setCustomQuestionPreferred} />
          )}
          <p className="text-xs text-[#9AA3B2]">
            {customQuestionType === "text"
              ? t("employerJobs.textAnswerNote")
              : customQuestionType === "number" && customQuestionMin.trim() === ""
                ? t("employerJobs.numberNoMinNote")
                : t("employerJobs.preferredNote")}
          </p>
        </div>

        <div className="mt-[14px]">
          <p className="text-xs text-[#4B5468]">{t("employerJobs.readyMadeQuestions")}</p>
          <div role="tablist" aria-label={t("employerJobs.questionCategories")} className="mt-[6px] flex flex-wrap gap-[6px]">
            {suggestionGroups.map((group) => (
              <button
                key={group.key}
                type="button"
                role="tab"
                aria-selected={suggestionGroup === group.key}
                onClick={() => setSuggestionGroup(group.key)}
                className={`rounded-full px-[12px] py-[4px] text-xs transition-colors ${
                  suggestionGroup === group.key
                    ? "bg-brand-teal-soft text-brand-teal-dark"
                    : "bg-[#F1F4F8] text-[#4B5468] hover:text-[#141B2E]"
                }`}
              >
                {group.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="mt-[8px] flex flex-wrap gap-[6px]">
            {(() => {
              const items = (suggestionGroups.find((g) => g.key === suggestionGroup)?.items ?? []).filter(
                (s) => !customQuestions.some((q) => q.question.toLowerCase() === s.question.toLowerCase()),
              );
              if (items.length === 0) return <p className="text-xs text-[#9AA3B2]">{t("employerJobs.addedThemAll")}</p>;
              return items.map((s) => (
                <button
                  key={s.question}
                  type="button"
                  onClick={() => applySuggestion(s)}
                  className="flex items-center gap-[4px] rounded-full border border-dashed border-black/[0.15] py-[6px] pl-[12px] pr-[10px] text-sm text-[#4B5468] hover:border-brand-teal-dark hover:text-brand-teal-dark"
                >
                  {s.question}
                  <PlusIcon className="h-[8px] w-[8px]" />
                </button>
              ));
            })()}
          </div>
        </div>
        {customQuestionError && <p className="mt-[6px] text-xs text-red-500">{customQuestionError}</p>}

        {customQuestions.length > 0 && (
          <div className="mt-[10px] flex flex-col gap-[6px]">
            {customQuestions.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between gap-[8px] rounded-[10px] bg-[#F1F4F8] px-[12px] py-[8px] text-xs text-[#141B2E]"
              >
                <span className="min-w-0">
                  {q.question}{" "}
                  <span className="text-[#9AA3B2]">
                    —{" "}
                    {questionType(q) === "choice"
                      ? t("employerJobs.questionSummary.choice", {
                          count: (q.options ?? []).length,
                          accepted: (q.acceptedOptions ?? []).join(", "),
                        })
                      : questionType(q) === "number"
                        ? q.minNumber != null
                          ? t("employerJobs.questionSummary.numberMin", { min: q.minNumber })
                          : t("employerJobs.questionSummary.number")
                        : questionType(q) === "text"
                          ? t("employerJobs.questionSummary.text")
                          : q.requiredAnswer
                            ? t("employerJobs.questionSummary.mustYes")
                            : t("employerJobs.questionSummary.mustNo")}
                  </span>
                </span>
                {isScorableQuestion(q) && (
                  <span className="ml-auto shrink-0">
                    <PriorityToggle preferred={q.preferred === true} onChange={(p) => setQuestionPreferred(q.id, p)} />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeCustomQuestion(q.id)}
                  aria-label={t("employerJobs.removeItem", { item: q.question })}
                  className="flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.08] hover:text-[#141B2E]"
                >
                  <XIcon className="h-[9px] w-[9px]" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Field>
      </div>
      </div>
      )}

      <div className={gradientFrameClass("teal")}>
      <div className="flex flex-col gap-[16px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
      <p className="text-xs text-[#9AA3B2]">{t("employerJobs.previewOfFlow")}</p>

      {submitError && <p className="text-xs text-red-500">{submitError}</p>}
      <div className="flex flex-col gap-[8px] sm:flex-row">
        <button
          type="button"
          onClick={() => setFormStep("details")}
          className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] px-[22px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
        >
          {t("employerJobs.back")}
        </button>
        <button
          type="button"
          disabled={!formValid}
          onClick={() => setShowJobseekerPreview(true)}
          className="flex h-[38px] shrink-0 items-center sm:flex-1 justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("employerJobs.previewAsJobseeker")}
        </button>
        <button
          type="button"
          disabled={submitting || !title.trim()}
          onClick={() => submitPosting("draft")}
          className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] px-[22px] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? t("employerOnboarding.saving") : t("employerJobs.saveAsDraft")}
        </button>
        <button
          type="button"
          onClick={() => guardNavigation(onClose)}
          className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] px-[22px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
        >
          {t("employerJobs.cancel")}
        </button>
      </div>
      </div>
      </div>
      </>
      )}
    </form>

    <div className="flex flex-col gap-[16px] lg:sticky lg:top-[85px] lg:w-[300px] lg:shrink-0">
      <div
        className={
          formValid
            ? gradientFrameClass("teal")
            : "rounded-[20px] bg-gradient-to-br from-[#A66A61] via-white to-[#A66A61] p-px shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(20,27,46,0.2)]"
        }
      >
        <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <p className="text-left text-lg font-semibold text-[#141B2E]">
            {formValid ? t("employerJobs.allRequiredComplete") : t("employerJobs.completeRequired")}
          </p>
          <ul className="mt-[16px] flex flex-col gap-[4px]">
            {requiredFieldChecklist.map(({ key, label, done, fieldId }) => (
              <li key={key}>
                <button
                  type="button"
                  disabled={done}
                  onClick={() => goToField(fieldId)}
                  className={`flex w-full items-center gap-[8px] text-left text-sm ${
                    done ? "cursor-default text-[#1F7A3F]" : "text-[#A66A61] hover:underline"
                  }`}
                >
                  <span
                    className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border ${
                      done ? "border-[#1F7A3F] bg-[#1F7A3F]" : "border-[#C99089]"
                    }`}
                  >
                    {done && <CheckIcon className="h-[8px] w-[8px] text-white" />}
                  </span>
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={gradientFrameClass("teal")}>
        <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <p className="text-left text-lg font-semibold text-[#141B2E]">
            {boostChecklistRemaining > 0 ? t("employerJobs.boostIntro") : t("employerJobs.boostDone")}
          </p>
          <ul className="mt-[16px] flex flex-col gap-[4px]">
            {boostChecklist.map(({ key, label, done, fieldId }) => (
              <li key={key}>
                <button
                  type="button"
                  disabled={done}
                  onClick={() => goToField(fieldId)}
                  className={`flex w-full items-center gap-[8px] text-left text-sm ${
                    done
                      ? "cursor-default text-[#1F7A3F]"
                      : "text-[#4B5468] hover:text-brand-teal-dark hover:underline"
                  }`}
                >
                  <span
                    className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full border ${
                      done ? "border-[#1F7A3F] bg-[#1F7A3F]" : "border-black/[0.15]"
                    }`}
                  >
                    {done && <CheckIcon className="h-[8px] w-[8px] text-white" />}
                  </span>
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
    </div>

    {showPreview && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
        onClick={() => setShowPreview(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("employerJobs.previewJobPosting")}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-full w-full max-w-[640px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-16px_rgba(0,0,0,0.24)]"
        >
          <div className="flex items-center justify-between border-b border-black/[0.06] px-[22px] py-[16px]">
            <div>
              <p className="text-sm text-[#141B2E]">{t("employerJobs.previewYourPosting")}</p>
              <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("employerJobs.previewYourPostingHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              aria-label={t("employerJobs.closePreview")}
              className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.06] hover:text-[#141B2E]"
            >
              <XIcon className="h-[12px] w-[12px]" />
            </button>
          </div>

          <div className="flex flex-col gap-[16px] scrollbar-thin-teal overflow-y-auto px-[22px] py-[18px]">
            <div>
              {postingName.trim() && (
                <p className="text-xs text-[#9AA3B2]">{postingName}</p>
              )}
              <p className="text-lg text-[#141B2E]">{title}</p>
              <div className="mt-[6px] flex flex-wrap items-center gap-[6px]">
                {industry && (
                  <span className="rounded-full bg-[#F1F4F8] px-[10px] py-[3px] text-xs text-[#4B5468]">
                    {industry}
                  </span>
                )}
                <span className="rounded-full bg-brand-teal-soft px-[10px] py-[3px] text-xs text-brand-teal-dark">
                  {t(`dashboard.employmentTypes.${employmentType}`)}
                </span>
                <span className="rounded-full bg-brand-teal-soft px-[10px] py-[3px] text-xs text-brand-teal-dark">
                  {t(`dashboard.workArrangements.${workArrangement}`)}
                </span>
              </div>
              <div className="mt-[10px] flex flex-wrap items-center gap-x-[10px] gap-y-[2px] text-xs text-[#4B5468]">
                <span>{location || (workArrangement === "remote" ? t("dashboard.workArrangements.remote") : t("employerJobs.locationNotSet"))}</span>
                <span className="text-[#C7CDD7]">·</span>
                <span>
                  {(showSalary &&
                    formatSalary(t, Number(salaryMin) || null, Number(salaryMax) || null, salaryPeriod)) ||
                    t("landing.jobs.salary.notDisclosed")}
                </span>
                <span className="text-[#C7CDD7]">·</span>
                <span>{t("landing.jobs.openings", { count: Number(openings) || 0 })}</span>
              </div>
            </div>

            <div className="border-t border-black/[0.06] pt-[14px]">
              <p className="text-xs text-[#141B2E]">{t("employerJobs.aboutTheRole")}</p>
              <p className="mt-[4px] whitespace-pre-line text-xs text-[#4B5468]">{description}</p>
            </div>

            <div className="border-t border-black/[0.06] pt-[14px]">
              <p className="text-xs text-[#141B2E]">{t("employerJobs.responsibilitiesRequirements")}</p>
              <p className="mt-[4px] whitespace-pre-line text-xs text-[#4B5468]">{responsibilities}</p>
            </div>

            {skills.length > 0 && (
              <div className="border-t border-black/[0.06] pt-[14px]">
                <p className="text-xs text-[#141B2E]">{t("employerJobs.skillsRequired")}</p>
                <div className="mt-[8px] flex flex-wrap gap-[6px]">
                  {skills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-brand-teal-dark px-[12px] py-[6px] text-xs text-white"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {softSkills.length > 0 && (
              <div>
                <p className="text-xs text-[#141B2E]">{t("landing.jobs.softSkills")}</p>
                <div className="mt-[8px] flex flex-wrap gap-[6px]">
                  {softSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-[#F1F4F8] px-[12px] py-[6px] text-xs text-[#141B2E]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {niceToHaveSkills.length > 0 && (
              <div>
                <p className="text-xs text-[#141B2E]">{t("employerJobs.niceToHaveSkills")}</p>
                <div className="mt-[8px] flex flex-wrap gap-[6px]">
                  {niceToHaveSkills.map((skill) => (
                    <span
                      key={skill}
                      className="rounded-full bg-[#F1F4F8] px-[12px] py-[6px] text-xs text-[#141B2E]"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {(minYearsExperience.trim() ||
              minQualificationTier ||
              drivingLicense ||
              languages.length > 0 ||
              workAuthorizations.length > 0) && (
              <div className="border-t border-black/[0.06] pt-[14px]">
                <p className="text-xs text-[#141B2E]">{t("employerJobs.candidateRequirements")}</p>
                <ul className="mt-[6px] flex flex-col gap-[3px] text-xs text-[#4B5468]">
                  {minYearsExperience.trim() && <li>{t("employerJobs.yearsOfExperience", { years: minYearsExperience })}</li>}
                  {minQualificationTier && (
                    <li>{t("employerJobs.minimumEducationIs", { tier: qualificationLabel(t, minQualificationTier) })}</li>
                  )}
                  {drivingLicense && (
                    <li>{t("employerJobs.drivingLicenseIs", { license: drivingLicenseLabel(t, drivingLicense) })}</li>
                  )}
                  {languages.length > 0 && (
                    <li>
                      {t("employerJobs.languagesAre", {
                        languages: languages.map((l) => `${l.language} (${languageLevelLabel(t, l.level)})`).join(", "),
                      })}
                    </li>
                  )}
                  {workAuthorizations.length > 0 && (
                    <li>
                      {t("employerJobs.workAuthorizationIs", {
                        authorizations: workAuthorizations.map((w) => workAuthorizationLabel(t, w)).join(", "),
                      })}
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-[8px] border-t border-black/[0.06] px-[22px] py-[16px] sm:flex-row">
            <button
              type="button"
              disabled={submitting}
              onClick={() => {
                setShowPreview(false);
                setShowJobseekerPreview(true);
              }}
              className="flex h-[38px] shrink-0 items-center sm:flex-1 justify-center rounded-full border border-brand-teal-dark bg-white text-sm text-brand-teal-dark hover:bg-brand-teal-soft disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("employerJobs.seeJobseekerView")}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => submitPosting("pending")}
              className="flex h-[38px] shrink-0 items-center sm:flex-1 justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? t("employerJobs.submitting") : t("employerJobs.looksGoodPostIt")}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => submitPosting("draft")}
              className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] px-[22px] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("employerJobs.saveAsDraft")}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setShowPreview(false)}
              className="flex h-[38px] items-center justify-center rounded-full text-sm text-[#9AA3B2] hover:text-[#141B2E]"
            >
              {t("employerJobs.backToEdit")}
            </button>
          </div>
          {submitError && (
            <p className="border-t border-black/[0.06] px-[22px] py-[10px] text-xs text-red-500">
              {submitError}
            </p>
          )}
        </div>
      </div>
    )}

    {showQuickInvite && (
      <Modal ariaLabel={t("employerJobs.quickInvite.title")} onClose={quickSending ? undefined : closeQuickInvite}>
        <h2 className="text-lg font-semibold text-[#141B2E]">{t("employerJobs.quickInvite.title")}</h2>
        <p className="mt-[6px] text-xs text-[#4B5468]">{t("employerJobs.quickInvite.body")}</p>
        <form
          noValidate
          className="mt-[14px] flex flex-col gap-[10px]"
          onSubmit={(e) => {
            e.preventDefault();
            // The modal is portalled, but React still bubbles submit to the posting form.
            e.stopPropagation();
            if (!quickSending) void sendQuickInvite();
          }}
        >
          <input
            type="email"
            autoFocus
            value={quickEmail}
            onChange={(e) => setQuickEmail(e.target.value)}
            placeholder={t("employerOnboarding.emailAddress")}
            aria-label={t("employerOnboarding.emailAddress")}
            maxLength={254}
            className={inputClass}
          />
          <input
            type="text"
            value={quickPosition}
            onChange={(e) => setQuickPosition(e.target.value)}
            placeholder={t("employerJobs.quickInvite.jobTitle")}
            aria-label={t("employerJobs.quickInvite.jobTitle")}
            maxLength={80}
            className={inputClass}
          />
          {quickError && <p className="text-xs text-red-500">{quickError}</p>}
          <div className="mt-[4px] flex flex-col gap-[8px]">
            <button
              type="submit"
              disabled={quickSending || !quickEmail.trim()}
              className="flex h-[38px] items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {quickSending ? t("auth.sending") : t("team.invite.send")}
            </button>
            <button
              type="button"
              disabled={quickSending}
              onClick={closeQuickInvite}
              className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:opacity-40"
            >
              {t("employerJobs.cancel")}
            </button>
          </div>
        </form>
      </Modal>
    )}

    {showLeaveConfirm && (
      <Modal
        ariaLabel={t("employerOnboarding.leaveWithoutSaving")}
        onClose={() => {
          setShowLeaveConfirm(false);
          setPendingProceed(null);
        }}
      >
        <h2 className="text-lg font-semibold text-[#141B2E]">{t("employerJobs.leaveThisPosting")}</h2>
        <p className="mt-[6px] text-xs text-[#4B5468]">{t("employerJobs.leaveThisPostingHint")}</p>
        <div className="mt-[18px] flex flex-col gap-[8px]">
          <button
            type="button"
            disabled={submitting || !title.trim()}
            onClick={async () => {
              setShowLeaveConfirm(false);
              const proceed = pendingProceed;
              setPendingProceed(null);
              // submitPosting only calls onSuccess once the save actually
              // succeeds — a failed save leaves the form open (with
              // submitError shown) instead of navigating away and losing
              // what was typed, same as a direct "Save as draft" click.
              await submitPosting("draft", () => proceed?.());
            }}
            className="flex h-[38px] items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? t("employerOnboarding.saving") : t("employerJobs.saveAsDraft")}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLeaveConfirm(false);
              pendingProceed?.();
              setPendingProceed(null);
            }}
            className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] text-sm text-red-500 hover:bg-red-50"
          >
            {t("employerJobs.discardPosting")}
          </button>
          {submitError && <p className="text-xs text-red-500">{submitError}</p>}
          <button
            type="button"
            onClick={() => {
              setShowLeaveConfirm(false);
              setPendingProceed(null);
            }}
            className="flex h-[38px] items-center justify-center text-sm text-[#9AA3B2] hover:text-[#141B2E]"
          >
            {t("employerOnboarding.keepEditing")}
          </button>
        </div>
      </Modal>
    )}

    {showJobseekerPreview && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8"
        onClick={() => setShowJobseekerPreview(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("employerJobs.previewAsJobseeker")}
          onClick={(e) => e.stopPropagation()}
          className="flex max-h-full w-full max-w-[1100px] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04),0_24px_48px_-16px_rgba(0,0,0,0.24)]"
        >
          <div className="flex items-center justify-between border-b border-black/[0.06] px-[22px] py-[16px]">
            <div>
              <p className="text-sm text-[#141B2E]">{t("employerJobs.jobseekerView")}</p>
              <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("employerJobs.jobseekerViewHint")}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowJobseekerPreview(false)}
              className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full hover:bg-black/[0.04]"
              aria-label={t("employerJobs.closePreview")}
            >
              <XIcon className="h-[14px] w-[14px]" />
            </button>
          </div>

          <div className="scrollbar-thin-teal flex-1 overflow-y-auto bg-brand-gold-page px-[16px] py-[20px] sm:px-[22px]">
            {/* The very same card and details panel as the jobseeker job
                list (JobPostingDetails), filled from this form. */}
            <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-[300px_1fr] lg:items-start">
              {/* Stays put while the details panel scrolls (side-by-side layout only). */}
              <div className="lg:sticky lg:top-0">
                <p className="mb-[8px] text-xs text-[#9AA3B2]">{t("employerJobs.inTheJobList")}</p>
                <PostingCard posting={previewPosting} selected />
              </div>
              <div>
                <p className="mb-[8px] text-xs text-[#9AA3B2]">{t("employerJobs.whenTheyOpenIt")}</p>
                <div className={gradientFrameClass("gold")}>
                  <div className="rounded-[19px] bg-white p-[16px] sm:p-[24px]">
                    <JobPostingDetails posting={previewPosting} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-[8px] border-t border-black/[0.06] px-[22px] py-[16px] sm:flex-row">
            <button
              type="button"
              disabled={submitting}
              onClick={() => submitPosting("pending")}
              className="flex h-[38px] shrink-0 items-center sm:flex-1 justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? t("employerJobs.submitting") : t("employerJobs.submitForApproval")}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => submitPosting("draft")}
              className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] px-[22px] text-sm text-[#141B2E] hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("employerJobs.saveAsDraft")}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setShowJobseekerPreview(false)}
              className="flex h-[38px] items-center justify-center rounded-full text-sm text-[#9AA3B2] hover:text-[#141B2E]"
            >
              {t("employerJobs.backToEdit")}
            </button>
          </div>
          {submitError && (
            <p className="border-t border-black/[0.06] px-[22px] py-[10px] text-xs text-red-500">
              {submitError}
            </p>
          )}
        </div>
      </div>
    )}
    </>
  );
  },
);

type PostingWithId = PreviewPosting & { id: string; slug: string };

// Shape job.listOrgJobs / job.getForEdit return — the redesign's
// job_postings row, JSON-serialized (timestamps as ISO strings, enum values
// lowercase/snake_case).
export type DbJobPosting = {
  id: string;
  slug: string;
  postingName: string | null;
  title: string;
  description: string;
  responsibilities: string;
  industry: string | null;
  employmentType: string;
  workArrangement: string;
  officeDaysPerWeek: number | null;
  location: string;
  addressLine1: string | null;
  addressLine2: string | null;
  area?: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: string;
  showSalary: boolean;
  openings: number;
  skills: string[];
  softSkills: string[];
  niceToHaveSkills: string[];
  minYearsExperience: number | null;
  minQualificationTier: string | null;
  languages: { language: string; dialect?: string | null; level: string }[];
  workAuthorizations: string[];
  drivingLicense: string | null;
  screeningEnabled: boolean;
  customScreeningQuestions: CustomQuestion[];
  screeningPreferred?: string[];
  skillSuggestions: { professionalSkills: string[]; softSkills: string[]; niceToHaveSkills: string[] } | null;
  askMinYearsExperience: boolean;
  askMinQualificationTier: boolean;
  askDrivingLicense: boolean;
  askLanguages: boolean;
  askWorkAuthorizations: boolean;
  benefits?: string[];
  startAvailability?: string | null;
  workingHours?: string | null;
  contactUserId?: string | null;
  // Only on a single posting fetched for editing (job.getForEdit).
  hiringManagerIds?: string[];
  status: string;
  rejectionReason: string | null;
  flagReason: string | null;
  flaggedAt: string | null;
  createdAt: string;
  updatedAt: string;
  applicantCount?: number;
  viewCount?: number;
};

const DB_STATUS_TO_DISPLAY: Record<string, JobStatus> = {
  draft: "Draft",
  pending: "Pending",
  active: "Active",
  filled: "Filled",
  closed: "Closed",
  rejected: "Rejected",
  flagged: "Flagged",
};

function postedLabel(t: TFunction, posting: DbJobPosting): string {
  switch (posting.status) {
    case "draft":
      return t("employerJobs.posted.notYetPublished");
    case "pending":
      return t("employerJobs.posted.awaitingApproval");
    case "rejected":
      return t("employerJobs.posted.needsRevision");
    case "flagged":
      return t("employerJobs.posted.underReview");
    case "closed":
      return t("employerJobs.posted.closed", { ago: relativeTimeAgo(t, posting.updatedAt) });
    case "filled":
      return t("employerJobs.posted.filled", { ago: relativeTimeAgo(t, posting.updatedAt) });
    default:
      return t("employerJobs.posted.posted", { ago: relativeTimeAgo(t, posting.createdAt) });
  }
}

function normalizeJobPosting(t: TFunction, posting: DbJobPosting): PostingWithId {
  const range = formatSalary(t, posting.salaryMin, posting.salaryMax, posting.salaryPeriod);
  const salaryLabel = range
    ? posting.showSalary
      ? range
      : t("employerJobs.salaryHidden", { range })
    : t("employerJobs.salaryNotSet");
  return {
    id: posting.id,
    slug: posting.slug,
    title: posting.title,
    status: DB_STATUS_TO_DISPLAY[posting.status] ?? "Draft",
    applicants: posting.applicantCount ?? 0,
    views: posting.viewCount ?? 0,
    posted: postedLabel(t, posting),
    location:
      posting.location === REMOTE_LOCATION
        ? t("dashboard.workArrangements.remote")
        : posting.location || t("employerJobs.notSet"),
    employmentType: t(`dashboard.employmentTypes.${posting.employmentType}`, { defaultValue: posting.employmentType }),
    workArrangement: t(`dashboard.workArrangements.${posting.workArrangement}`, { defaultValue: posting.workArrangement }),
    salary: salaryLabel,
    openings: posting.openings,
    minYearsExperience: posting.minYearsExperience ?? 0,
    rejectionReason: posting.rejectionReason,
    flagReason: posting.flagReason,
  };
}

function MenuItem({
  icon: Icon,
  label,
  onClick,
  danger,
}: {
  icon: (props: { className?: string }) => ReactElement;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex h-[34px] w-full items-center gap-[8px] rounded-[8px] px-[10px] text-left text-sm transition-colors hover:bg-[#F1F4F8] ${
        danger ? "text-red-500" : "text-[#141B2E]"
      }`}
    >
      <Icon className="h-[13px] w-[13px]" />
      {label}
    </button>
  );
}

function PostingActionsMenu({
  posting,
  canManage,
  onView,
  onEdit,
  onDuplicate,
  onCloseJob,
  onDelete,
}: {
  posting: PostingWithId;
  // false for a Hiring manager — they can look, not edit/close/delete.
  canManage: boolean;
  onView: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onCloseJob: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu is portaled to <body> with fixed coordinates: the status
  // sections wrap their rows in overflow-hidden (for the collapse animation),
  // which would otherwise clip an absolutely-positioned popover.
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number } | null>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
      setConfirmingDelete(false);
    }
    function dismiss() {
      setOpen(false);
      setConfirmingDelete(false);
    }
    document.addEventListener("mousedown", handleClick);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, []);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const rect = ref.current?.getBoundingClientRect();
    if (rect) {
      const right = window.innerWidth - rect.right;
      // ~250px covers the tallest menu (5 items); flip above if it won't fit.
      setPos(
        window.innerHeight - rect.bottom < 250
          ? { bottom: window.innerHeight - rect.top + 6, right }
          : { top: rect.bottom + 6, right },
      );
    }
    setOpen(true);
  }

  const canClose = posting.status !== "Closed";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("employerJobs.actionsFor", { title: posting.title })}
        className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.06] hover:text-[#141B2E]"
      >
        <DotsIcon className="h-[14px] w-[14px]" />
      </button>

      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={pos}
          className="fixed z-50 w-[190px] rounded-[12px] border border-black/[0.08] bg-white p-[6px] shadow-[0_8px_24px_-8px_rgba(20,27,46,0.2)]"
        >
          <MenuItem
            icon={EyeIcon}
            label={t("employerJobs.viewDetails")}
            onClick={() => {
              onView();
              setOpen(false);
            }}
          />
          {canManage && (
            <>
              <MenuItem
                icon={PencilIcon}
                label={t("employerJobs.edit")}
                onClick={() => {
                  onEdit();
                  setOpen(false);
                }}
              />
              <MenuItem
                icon={CopyIcon}
                label={t("employerJobs.duplicate")}
                onClick={() => {
                  onDuplicate();
                  setOpen(false);
                }}
              />
              {canClose && (
                <MenuItem
                  icon={LockIcon}
                  label={t("employerJobs.closeJob")}
                  onClick={() => {
                    onCloseJob();
                    setOpen(false);
                  }}
                />
              )}
              {!confirmingDelete ? (
                <MenuItem icon={TrashIcon} label={t("employerJobs.delete")} danger onClick={() => setConfirmingDelete(true)} />
              ) : (
                <MenuItem
                  icon={TrashIcon}
                  label={t("employerJobs.confirmDelete")}
                  danger
                  onClick={() => {
                    onDelete();
                    setOpen(false);
                    setConfirmingDelete(false);
                  }}
                />
              )}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-[12px]">
      <dt className="text-[#9AA3B2]">{label}</dt>
      <dd className="text-[#141B2E]">{value}</dd>
    </div>
  );
}

function PostingDetailsModal({
  posting,
  onClose,
  onResubmit,
}: {
  posting: PostingWithId;
  onClose: () => void;
  onResubmit?: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const color = STATUS_TILE_COLOR[posting.status];
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmitError, setResubmitError] = useState<string | null>(null);
  const isRejected = posting.status === "Rejected";
  const isFlagged = posting.status === "Flagged";
  const { rejectionReason, flagReason } = posting;

  async function handleResubmit() {
    if (!onResubmit) return;
    setResubmitting(true);
    setResubmitError(null);
    try {
      await onResubmit(posting.id);
      onClose();
    } catch (err) {
      setResubmitError(errorMessage(err, t("employerJobs.couldntResubmitPosting")));
    } finally {
      setResubmitting(false);
    }
  }

  return (
    <Modal ariaLabel={t("employerJobs.detailsOf", { title: posting.title })} onClose={onClose}>
      <div className="flex items-start justify-between gap-[8px]">
        <h2 className="text-lg font-semibold text-[#141B2E]">{posting.title}</h2>
        <span className={`shrink-0 rounded-full px-[10px] py-[3px] text-xs ${color.bg} ${color.text}`}>
          {statusText(t, posting.status)}
        </span>
      </div>

      {isRejected && rejectionReason && (
        <div className="mt-[14px] rounded-[12px] border border-red-100 bg-red-50 p-[12px]">
          <p className="text-xs text-red-700 mb-[4px]">{t("employerJobs.rejectionReason")}</p>
          <p className="text-xs text-red-600">{rejectionReason}</p>
          {resubmitError && <p className="mt-[8px] text-xs text-red-600">{resubmitError}</p>}
          {onResubmit && (
            <button
              type="button"
              disabled={resubmitting}
              onClick={handleResubmit}
              className="mt-[10px] flex h-[34px] w-full items-center justify-center rounded-full border border-red-300 bg-white text-sm text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resubmitting ? t("employerJobs.resubmitting") : t("employerJobs.resubmitForReview")}
            </button>
          )}
        </div>
      )}

      {isFlagged && flagReason && (
        <div className="mt-[14px] rounded-[12px] border border-[#FBDBBE] bg-[#FFF7F0] p-[12px]">
          <p className="text-xs text-[#C2600A] mb-[4px]">{t("employerJobs.flaggedNeedsFix")}</p>
          <p className="text-xs text-[#9A5209]">{flagReason}</p>
          {resubmitError && <p className="mt-[8px] text-xs text-[#9A5209]">{resubmitError}</p>}
          {onResubmit && (
            <button
              type="button"
              disabled={resubmitting}
              onClick={handleResubmit}
              className="mt-[10px] flex h-[34px] w-full items-center justify-center rounded-full border border-[#FBDBBE] bg-white text-sm text-[#C2600A] transition-colors hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resubmitting ? t("employerJobs.resubmitting") : t("employerJobs.resubmitForReview")}
            </button>
          )}
        </div>
      )}

      <dl className="mt-[16px] flex flex-col gap-[9px] text-xs">
        <DetailRow label={t("employerJobs.location")} value={posting.location} />
        <DetailRow label={t("employerJobs.jobType")} value={posting.employmentType} />
        <DetailRow label={t("employerJobs.where")} value={posting.workArrangement} />
        <DetailRow label={t("employerJobs.salaryRange")} value={posting.salary} />
        <DetailRow label={t("employerJobs.openings")} value={String(posting.openings)} />
        <DetailRow
          label={t("jobDetails.minimumExperience")}
          value={
            posting.minYearsExperience === 0
              ? t("employerJobs.noExperienceRequired")
              : t("employerJobs.yearsPlus", { years: posting.minYearsExperience })
          }
        />
        <DetailRow label={t("employerJobs.views")} value={String(posting.views)} />
        <div className="flex items-center justify-between gap-[12px]">
          <dt className="text-[#9AA3B2]">{t("employerJobs.applicants")}</dt>
          <dd>
            <button
              type="button"
              onClick={() => navigate({ to: "/employer/applicants", search: { jobId: posting.id } })}
              className="text-brand-teal-dark underline-offset-2 hover:underline"
            >
              {posting.applicants}
            </button>
          </dd>
        </div>
        <DetailRow label={t("employerJobs.postedLabel")} value={posting.posted} />
      </dl>
      <button
        type="button"
        onClick={onClose}
        className="mt-[18px] flex h-[38px] w-full items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03]"
      >
        {t("employerJobs.close")}
      </button>
    </Modal>
  );
}

function JobPostingsPanel({ initialPostings, canManage }: { initialPostings: DbJobPosting[]; canManage: boolean }) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createMutation = useMutation(orpc.job.create.mutationOptions());
  const updateMutation = useMutation(orpc.job.update.mutationOptions());
  const deleteMutation = useMutation(orpc.job.delete.mutationOptions());
  // The full raw rows (not just what PostingWithId displays) so Duplicate
  // can resend every field; normalized for display on each render.
  const [rawPostings, setRawPostings] = useState<DbJobPosting[]>(initialPostings);
  const postings = rawPostings.map((p) => normalizeJobPosting(t, p));
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewingId, setViewingId] = useState<string | null>(null);
  const viewing = postings.find((p) => p.id === viewingId) ?? null;
  const [collapsedStatuses, setCollapsedStatuses] = useState<Set<JobStatus>>(() => new Set());
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);

  function toggleStatusCollapsed(status: JobStatus) {
    setCollapsedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  }
  const [heroTitle, setHeroTitle] = useState("");

  function startWithTitle() {
    const value = heroTitle.trim();
    if (!value) return;
    navigate({ to: "/employer/jobs/postajob", search: { title: value, autofill: true } });
  }

  // The list's cache and the dashboard's counts are stale after any change.
  // The list is only marked stale (refetched next time it's opened): this
  // panel already shows the change, like the redesign's, and an immediate
  // refetch would remount it (see its `key`) and drop the search.
  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: orpc.job.listOrgJobs.key(), refetchType: "none" });
    void queryClient.invalidateQueries({ queryKey: orpc.employer.dashboard.key() });
  }

  const searchTerm = search.trim().toLowerCase();
  const searching = searchTerm.length > 0;
  const visiblePostings = searching
    ? postings.filter((p) =>
        [p.title, p.location, p.employmentType, p.workArrangement, statusText(t, p.status)].some((v) =>
          String(v ?? "").toLowerCase().includes(searchTerm),
        ),
      )
    : postings;
  const matchCount = visiblePostings.length;
  const tiles: { label: TileKey; count: number }[] = [
    { label: "Total postings", count: postings.length },
    ...STATUS_ORDER.map((status) => ({
      label: status,
      count: postings.filter((p) => p.status === status).length,
    })),
  ];

  async function duplicate(id: string) {
    setActionError(null);
    const original = rawPostings.find((p) => p.id === id);
    if (!original) return;
    try {
      const data = await createMutation.mutateAsync({
        status: "draft",
        postingName: original.postingName,
        title: t("employerJobs.copyTitle", { title: original.title }),
        description: original.description,
        responsibilities: original.responsibilities,
        industry: original.industry,
        employmentType: original.employmentType,
        workArrangement: original.workArrangement,
        officeDaysPerWeek: original.officeDaysPerWeek,
        location: original.location,
        addressLine1: original.addressLine1,
        addressLine2: original.addressLine2,
        area: original.area ?? null,
        city: original.city,
        state: original.state,
        postcode: original.postcode,
        salaryMin: original.salaryMin,
        salaryMax: original.salaryMax,
        salaryPeriod: original.salaryPeriod,
        showSalary: original.showSalary,
        openings: original.openings,
        skills: original.skills,
        softSkills: original.softSkills,
        niceToHaveSkills: original.niceToHaveSkills,
        minYearsExperience: original.minYearsExperience,
        minQualificationTier: original.minQualificationTier,
        languages: original.languages,
        workAuthorizations: original.workAuthorizations,
        drivingLicense: original.drivingLicense,
        screeningEnabled: original.screeningEnabled,
        customScreeningQuestions: original.customScreeningQuestions,
        screeningPreferred: original.screeningPreferred ?? [],
        skillSuggestions: original.skillSuggestions,
        askMinYearsExperience: original.askMinYearsExperience,
        askMinQualificationTier: original.askMinQualificationTier,
        askDrivingLicense: original.askDrivingLicense,
        askLanguages: original.askLanguages,
        askWorkAuthorizations: original.askWorkAuthorizations,
        benefits: original.benefits ?? [],
        startAvailability: original.startAvailability ?? null,
        workingHours: original.workingHours ?? null,
        contactUserId: original.contactUserId ?? null,
      });
      const created = data.posting as unknown as DbJobPosting;
      setRawPostings((prev) => {
        const index = prev.findIndex((p) => p.id === id);
        if (index === -1) return [...prev, created];
        const next = [...prev];
        next.splice(index + 1, 0, created);
        return next;
      });
      invalidate();
    } catch (err) {
      setActionError(errorMessage(err, t("employerJobs.couldntDuplicatePosting")));
    }
  }

  async function closeJob(id: string) {
    setActionError(null);
    try {
      const data = await updateMutation.mutateAsync({ id, status: "closed" });
      const updated = data.posting as unknown as DbJobPosting;
      setRawPostings((prev) => prev.map((p) => (p.id === id ? updated : p)));
      invalidate();
    } catch (err) {
      setActionError(errorMessage(err, t("employerJobs.couldntClosePosting")));
    }
  }

  async function deletePosting(id: string) {
    setActionError(null);
    try {
      await deleteMutation.mutateAsync({ id });
      setRawPostings((prev) => prev.filter((p) => p.id !== id));
      invalidate();
    } catch (err) {
      setActionError(errorMessage(err, t("employerJobs.couldntDeletePosting")));
    }
  }

  async function resubmitPosting(id: string) {
    setActionError(null);
    const data = await updateMutation.mutateAsync({ id, status: "pending" });
    const updated = data.posting as unknown as DbJobPosting;
    setRawPostings((prev) => prev.map((p) => (p.id === id ? updated : p)));
    setViewingId(null);
    invalidate();
  }

  // A Hiring manager with nothing assigned yet.
  if (!canManage && postings.length === 0) {
    return (
      <div className={`animate-fade-in-up ${gradientFrameClass("teal")} mx-auto w-full max-w-[1440px]`}>
        <div className="flex flex-col items-center gap-[8px] rounded-[19px] bg-white p-[28px] text-center">
          <span className="flex h-[40px] w-[40px] items-center justify-center rounded-full bg-[#EAF0FE] text-[#3B5BDB]">
            <StackIcon className="h-[18px] w-[18px]" />
          </span>
          <p className="text-sm text-[#141B2E]">{t("employerJobs.noJobsAssigned")}</p>
          <p className="max-w-[420px] text-xs leading-[18px] text-[#4B5468]">{t("employerJobs.noJobsAssignedHint")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-[20px] lg:flex-row lg:items-start">
    <div className="flex min-w-0 flex-col gap-[20px] lg:flex-1">
    {canManage && (
    <>
    <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
      <div className="@container relative flex flex-col gap-[16px] overflow-hidden rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <JobTitleIllustration
          lit={heroTitle.trim().length > 0}
          className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-auto [&>svg]:h-full [&>svg]:w-auto @[40rem]:block"
        />

        <div className="relative @[40rem]:max-w-[calc(100%-300px)]">
          <p className="text-sm text-[#141B2E]">{t("employerJobs.startWithTitle")}</p>
          <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("employerJobs.startWithTitleHint")}</p>
        </div>

        <Field label={t("employerJobs.jobTitle")} htmlFor="heroJobTitle" hint={<MatchHint field="targetRole" />} className="relative @[40rem]:max-w-[calc(100%-300px)]">
          <div className="flex flex-wrap gap-[8px]">
            <input
              id="heroJobTitle"
              type="text"
              value={heroTitle}
              onChange={(e) => setHeroTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  startWithTitle();
                }
              }}
              placeholder={t("employerJobs.jobTitlePlaceholder")}
              className={`${inputClass} min-w-[180px] flex-1`}
            />
            <button
              type="button"
              onClick={startWithTitle}
              disabled={!heroTitle.trim()}
              className="flex h-[38px] shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[12px] bg-[linear-gradient(45deg,var(--color-brand-teal-dark),var(--color-brand-gold))] px-[14px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <SiriOrb className="h-[14px] w-[14px]" active={false} />
              {t("employerOnboarding.fillWithAi")}
            </button>
          </div>
        </Field>
      </div>
    </div>

    <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "60ms" }}>
      <div className="relative overflow-hidden rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        {!howItWorksOpen && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[70px] overflow-hidden rounded-b-[19px] sm:h-[95px] lg:h-[130px]"
          >
            {/* AnimatedRibbon renders a much taller graphic (160/220/300px) than
                this crop window — the negative margin shifts it up so the
                visible slice lands on the ribbon's actual colour ("belly")
                pools instead of the mostly-empty top of its viewBox. */}
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
          <p className="text-sm text-[#141B2E]">{t("employerJobs.howPostingWorks")}</p>
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
              {[1, 2, 3, 4].map((step) => (
                <div key={step} className="flex flex-col gap-[4px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px]">
                  <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-brand-teal-dark text-xs text-white">
                    {step}
                  </span>
                  <p className="mt-[4px] text-xs text-[#141B2E]">{t(`employerJobs.howItWorks.step${step}Title`)}</p>
                  <p className="text-xs text-[#4B5468]">{t(`employerJobs.howItWorks.step${step}Detail`)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
    </>
    )}

    <div className={`animate-fade-in-up ${gradientFrameClass("teal")}`} style={{ animationDelay: "120ms" }}>
      <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <p className="mb-[12px] text-sm text-[#141B2E]">{t("employerJobs.pipelineAtAGlance")}</p>
        <div className="grid grid-cols-4 gap-[12px]">
          {tiles.map((tile) => {
            const Icon = STATUS_TILE_ICON[tile.label];
            const color = STATUS_TILE_COLOR[tile.label];
            const gradient = STATUS_TILE_GRADIENT[tile.label];
            const hasMatches = tile.label === "Total postings" ? postings.length > 0 : tile.count > 0;
            return (
              <button
                key={tile.label}
                type="button"
                disabled={!hasMatches}
                onClick={() => {
                  const id = tile.label === "Total postings" ? "job-postings-list" : `status-section-${tile.label}`;
                  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                style={{ backgroundImage: `linear-gradient(to bottom, ${gradient}, white 90%)` }}
                className={`gradient-noise group relative flex flex-col gap-[4px] overflow-hidden rounded-[14px] p-[14px] text-left transition-opacity ${
                  hasMatches ? "cursor-pointer hover:opacity-80" : "cursor-default opacity-60"
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
                  <span className="text-xl text-[#141B2E]">{tile.count}</span>
                  <Icon className={`h-[16px] w-[16px] ${color.text}`} />
                </div>
                <span className={`relative text-xs ${color.text}`}>{statusText(t, tile.label)}</span>
              </button>
            );
          })}
        </div>

        <div id="job-postings-list" className="mt-[24px] scroll-mt-[100px]">
          <p className="text-sm text-[#141B2E]">
            {canManage ? t("employerJobs.postingsByStatus") : t("employerJobs.jobsYouManage")}
          </p>
          {actionError && <p className="mt-[6px] text-xs text-red-500">{actionError}</p>}
          <div className="mt-[10px] flex items-center gap-[8px] rounded-[12px] border border-black/[0.1] px-[12px] focus-within:border-brand-teal-dark">
            <SearchIcon className="h-[13px] w-[13px] shrink-0 text-[#9AA3B2]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("employerJobs.searchPlaceholder")}
              aria-label={t("employerJobs.searchLabel")}
              className="h-[38px] w-full bg-transparent text-sm text-[#141B2E] outline-none placeholder:text-[#9AA3B2]"
            />
          </div>
          {searching && matchCount === 0 && (
            <p className="mt-[12px] text-sm text-[#9AA3B2]">{t("employerJobs.noMatches", { search: search.trim() })}</p>
          )}
          <div className="mt-[10px] flex flex-col gap-[10px]">
            {STATUS_ORDER.map((status, index) => {
              const statusPostings = visiblePostings.filter((p) => p.status === status);
              if (statusPostings.length === 0) return null;
              // Matches stay visible while searching, even in a section the
              // employer had collapsed.
              const collapsed = !searching && collapsedStatuses.has(status);
              return (
                <div
                  key={status}
                  id={`status-section-${status}`}
                  className={`animate-fade-in-up ${gradientFrameClass("teal")} scroll-mt-[100px]`}
                  style={{ animationDelay: `${180 + index * 40}ms` }}
                >
                <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
                  <button
                    type="button"
                    onClick={() => toggleStatusCollapsed(status)}
                    aria-expanded={!collapsed}
                    className="flex w-full items-center gap-[8px] text-left"
                  >
                    <span
                      className={`rounded-full px-[10px] py-[3px] text-xs ${STATUS_TILE_COLOR[status].bg} ${STATUS_TILE_COLOR[status].text}`}
                    >
                      {statusText(t, status)}
                    </span>
                    <span className="text-xs text-[#9AA3B2]">{statusPostings.length}</span>
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
                    {statusPostings.map((posting) => (
                      <div
                        key={posting.id}
                        onClick={() => {
                          if (["Active", "Filled", "Closed", "Flagged"].includes(posting.status)) {
                            // A live (or once-live) posting's own page.
                            navigate({ to: "/employer/jobs/$slug", params: { slug: posting.slug } });
                          } else if (posting.status === "Draft" && canManage) {
                            // A draft has nothing to "view" yet — go straight to finishing it.
                            navigate({ to: "/employer/jobs/postajob", search: { id: posting.id } });
                          } else {
                            setViewingId(posting.id);
                          }
                        }}
                        className="@container cursor-pointer rounded-[12px] border border-[#EAEDF2] bg-[#F8FAFB] p-[14px] transition-colors hover:bg-[#F1F4F8]"
                      >
                        <div className="flex flex-col gap-[8px] @[36rem]:flex-row @[36rem]:items-center @[36rem]:justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-[8px]">
                            <p className="truncate text-sm text-[#141B2E]">{posting.title}</p>
                          </div>
                          <div className="mt-[4px] flex flex-wrap items-center gap-x-[8px] gap-y-[2px] text-xs text-[#4B5468]">
                            <span>{posting.location}</span>
                            <span className="text-[#C7CDD7]">·</span>
                            <span>{posting.employmentType}</span>
                            <span className="text-[#C7CDD7]">·</span>
                            <span>{posting.workArrangement}</span>
                            <span className="text-[#C7CDD7]">·</span>
                            <span>{posting.salary}</span>
                            <span className="text-[#C7CDD7]">·</span>
                            <span>{t("landing.jobs.openings", { count: posting.openings })}</span>
                            <span className="text-[#C7CDD7]">·</span>
                            <span>
                              {posting.minYearsExperience === 0
                                ? t("employerJobs.noExperienceRequired")
                                : t("employerJobs.yrsExperience", { years: posting.minYearsExperience })}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-[12px] gap-y-[6px] text-xs @[36rem]:shrink-0 @[36rem]:flex-nowrap">
                          <span className="whitespace-nowrap text-[#9AA3B2]">
                            {t("employerJobs.viewCount", { count: posting.views })}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate({ to: "/employer/applicants", search: { jobId: posting.id } });
                            }}
                            className="whitespace-nowrap rounded-full bg-brand-teal-soft px-[10px] py-[3px] text-sm text-brand-teal-dark transition-colors hover:bg-[#D2F3F5]"
                          >
                            {t("employerJobs.applicantCount", { count: posting.applicants })}
                          </button>
                          <span className="whitespace-nowrap text-[#9AA3B2]">{posting.posted}</span>
                          <div className="ml-auto @[36rem]:ml-0" onClick={(e) => e.stopPropagation()}>
                            <PostingActionsMenu
                              posting={posting}
                              canManage={canManage}
                              onView={() => setViewingId(posting.id)}
                              onEdit={() => navigate({ to: "/employer/jobs/postajob", search: { id: posting.id } })}
                              onDuplicate={() => duplicate(posting.id)}
                              onCloseJob={() => closeJob(posting.id)}
                              onDelete={() => deletePosting(posting.id)}
                            />
                          </div>
                        </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  </div>
                  </div>
                </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {viewing && (
        <PostingDetailsModal
          posting={viewing}
          onClose={() => setViewingId(null)}
          onResubmit={canManage ? resubmitPosting : undefined}
        />
      )}
    </div>
    </div>

    {canManage && (
    <div className="flex flex-col gap-[16px] lg:sticky lg:top-[85px] lg:w-[300px] lg:shrink-0">
      <div className={gradientFrameClass("teal")}>
        <div className="flex flex-col gap-[10px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
          <div>
            <p className="text-sm text-[#141B2E]">{t("employerJobs.posterGenerator")}</p>
            <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("employerJobs.posterGeneratorHint")}</p>
          </div>
          {/* TODO(route): /employer/jobs/poster-generator (Poster generator). */}
          <button
            type="button"
            onClick={showComingSoon}
            className="flex h-[38px] items-center justify-center rounded-full bg-brand-teal-dark text-sm text-white transition-opacity hover:opacity-90"
          >
            {t("employerJobs.openPosterGenerator")}
          </button>
        </div>
      </div>
    </div>
    )}
    </div>
  );
}

function PageMessage({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return error ? (
    <div className="rounded-[14px] border border-[#EAD9D6] bg-[#FBF3F1] p-[16px] text-center text-sm text-[#A66A61]">{children}</div>
  ) : (
    <p className="rounded-[14px] bg-white/70 p-[16px] text-center text-xs text-[#9AA3B2]">{children}</p>
  );
}

/**
 * Manage Job (`mode="list"`, /employer/jobs) and Post a job (`mode="post"`,
 * /employer/jobs/postajob, `?id=` to edit). The redesign's page loaders
 * become job.listOrgJobs and employer.postJobContext.
 */
export function EmployerJobsView({
  mode = "list",
  editingId = null,
  initialTitle = null,
  autofill = false,
}: {
  mode?: "list" | "post";
  editingId?: string | null;
  initialTitle?: string | null;
  autofill?: boolean;
}) {
  const { t } = useTranslation("common");
  const navigate = useNavigate();
  const composing = mode === "post";
  const editing = composing && !!editingId;
  const { data: session } = authClient.useSession();
  const contextQuery = useQuery({ ...orpc.employer.postJobContext.queryOptions(), meta: { suppressErrorToast: true } });
  const listQuery = useQuery({
    ...orpc.job.listOrgJobs.queryOptions(),
    enabled: !composing,
    meta: { suppressErrorToast: true },
  });
  const canManage = contextQuery.data?.canManage ?? true;
  useEffect(() => {
    // The redesign sends teammates without full access away from Post a job.
    if (composing && contextQuery.data && !contextQuery.data.canManage) navigate({ to: "/employer/jobs" });
  }, [composing, contextQuery.data, navigate]);

  const postJobFormRef = useRef<PostJobFormHandle>(null);
  const guardNavigation: NavigationGuard = (proceed) => {
    if (composing && postJobFormRef.current) {
      postJobFormRef.current.guardNavigation(proceed);
    } else {
      proceed();
    }
  };
  const backToList = () => navigate({ to: "/employer/jobs" });

  const loading = contextQuery.isPending || (!composing && listQuery.isPending);
  const failed = contextQuery.isError || (!composing && listQuery.isError);

  return (
    <EmployerDashboardShell
      active="jobs"
      canManage={canManage}
      heading={
        editing
          ? t("employerJobs.headingEdit")
          : composing
            ? t("dashboard.employer.postJob")
            : canManage
              ? t("dashboard.employerNav.jobs")
              : t("employerJobs.headingMyJobs")
      }
      headerAction={
        !canManage ? undefined : composing ? (
          <button
            type="button"
            onClick={() => guardNavigation(backToList)}
            className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] px-[22px] text-sm text-[#141B2E] hover:bg-black/[0.03]"
          >
            {t("employerJobs.cancel")}
          </button>
        ) : (
          <div className="flex flex-wrap items-center gap-[8px]">
            <button
              type="button"
              onClick={() => navigate({ to: "/employer/jobs/postajob" })}
              className="flex h-[38px] items-center justify-center rounded-full bg-brand-teal-dark px-[22px] text-sm text-white transition-opacity hover:opacity-90"
            >
              {t("dashboard.employer.postJob")}
            </button>
          </div>
        )
      }
      subheading={
        editing
          ? t("employerJobs.subheadingEdit")
          : composing
            ? t("employerJobs.subheadingPost")
            : canManage
              ? t("employerJobs.subheadingList")
              : t("employerJobs.subheadingMyJobs")
      }
    >
      {/* EmployerDashboardShell's sidebar reads the guard from its own
          UnsavedChangesGuardBoundary, which only sees registrations from
          genuine descendants — this component itself sits above that
          Boundary (it renders EmployerDashboardShell, not the other way
          around), so the registration has to happen from inside `children`
          like this, not from EmployerJobsView's own body. */}
      <GuardRegistrar guard={guardNavigation} />
      {loading ? (
        <PageMessage>{t("nav.loading")}</PageMessage>
      ) : failed || !contextQuery.data ? (
        <PageMessage error>{t("employerJobs.loadError")}</PageMessage>
      ) : composing ? (
        <PostJobForm
          // A fresh form for each posting opened (or a new one).
          key={editingId ?? "new"}
          ref={postJobFormRef}
          onClose={backToList}
          editingId={editingId}
          initialTitle={initialTitle}
          autofill={autofill}
          addresses={contextQuery.data.addresses}
          companyBenefits={contextQuery.data.companyBenefits}
          contactOptions={contextQuery.data.contactOptions}
          hiringManagerOptions={contextQuery.data.hiringManagerOptions}
          currentUserId={session?.user.id ?? null}
          company={contextQuery.data.company}
        />
      ) : (
        <JobPostingsPanel
          // Starts over when the list comes back different (a posting saved
          // on Post a job, or changed elsewhere) — like the redesign's
          // server-loaded list.
          key={(listQuery.data?.postings ?? []).map((p) => `${p.id}@${p.updatedAt}`).join(",")}
          initialPostings={(listQuery.data?.postings ?? []) as unknown as DbJobPosting[]}
          canManage={canManage}
        />
      )}
    </EmployerDashboardShell>
  );
}
