// The redesign's src/components/OnboardingForm.tsx (the jobseeker profile
// form — onboarding, and later the "My Profile" edit page), ported. Same UI
// and behaviour; the data layer follows v1 (TanStack Query mutations over the
// oRPC client instead of the redesign's fetch calls).
import { ageFromBirthYear, ageFromDate, MAX_AGE, MIN_AGE, parseAge } from "@jobgiga-app/api/shared/age";
import { COUNTRIES, DEFAULT_COUNTRY } from "@jobgiga-app/api/shared/countries";
import { INDUSTRIES } from "@jobgiga-app/api/shared/industries";
import type { JobseekerProfile } from "@jobgiga-app/api/shared/jobseeker-profile";
import {
  canonicalLanguage,
  isListedLanguage,
  LANGUAGE_OPTIONS,
  languageDialects,
  normalizeSpokenLanguages,
  sameLanguage,
} from "@jobgiga-app/api/shared/languages";
import { MALAYSIA_STATES } from "@jobgiga-app/api/shared/malaysia";
import { NATIONALITIES } from "@jobgiga-app/api/shared/nationalities";
import { isValidMalaysianPhone } from "@jobgiga-app/api/shared/phone";
import { plainTextToHtml } from "@jobgiga-app/api/shared/rich-text";
import { formatPlace, MAX_WORK_PLACES, type Place } from "@jobgiga-app/api/shared/work-locations";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChecklistDoneBadge } from "@/components/form/checklist-done-badge";
import { MonthYearPicker, parseMonthYearValue } from "@/components/form/month-year-picker";
import { PhoneInput } from "@/components/form/phone-input";
import { PhoneVerifiedAvatarBadge } from "@/components/form/phone-verified-avatar-badge";
import { PlaceSearch } from "@/components/form/place-search";
import { RichTextEditor } from "@/components/form/rich-text-editor";
import { useRegisterUnsavedChangesGuard } from "@/components/form/unsaved-changes-guard";
import { Dropdown } from "@/components/landing/dropdown";
import { Field } from "@/components/landing/field";
import { CheckIcon, FileIcon, PlusIcon, UploadIcon, UserIcon, XIcon } from "@/components/landing/icons";
import { PENDING_RESUME_KEY } from "@/components/landing/jobseeker/resume-upload";
import { Modal } from "@/components/landing/modal";
import { SiriOrb } from "@/components/landing/siri-orb";
import { gradientFrameClass, inputClass as formInputClass } from "@/lib/landing/form-styles";
import { orpc } from "@/utils/orpc";
import { useDraftName } from "./draft-name-context";

// The language picker's "Other (type it)" choice.
const OTHER_LANGUAGE = "__other__";
// One "Preferred work locations" row: empty until a place is picked.
type WorkPlaceRow = { id: string; place: Place | null };

const EMPLOYMENT_TYPES = [
  { value: "full_time", label: "Full-time" },
  { value: "part_time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "internship", label: "Internship" },
  { value: "freelance", label: "Freelance" },
  { value: "temporary", label: "Temporary" },
] as const;

const WORK_ARRANGEMENTS = [
  { value: "onsite", label: "On-site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
] as const;

const WORK_AUTHORIZATIONS = [
  { value: "citizen", label: "Malaysian citizen" },
  { value: "permanent_resident", label: "Permanent resident" },
  { value: "work_pass_holder", label: "Work pass holder" },
  { value: "needs_sponsorship", label: "Needs sponsorship" },
] as const;

const NOTICE_PERIODS = [
  { value: "immediate", label: "Immediate" },
  { value: "one_week", label: "1 week" },
  { value: "two_weeks", label: "2 weeks" },
  { value: "one_month", label: "1 month" },
  { value: "two_months", label: "2 months" },
  { value: "more_than_two_months", label: "More than 2 months" },
] as const;

const QUALIFICATION_TIERS = [
  { value: "SPM", label: "SPM" },
  { value: "STPM", label: "STPM" },
  { value: "Diploma", label: "Diploma" },
  { value: "Degree", label: "Degree" },
  { value: "Master", label: "Master's" },
  { value: "PhD", label: "PhD" },
  { value: "Other", label: "Other" },
] as const;

const LANGUAGE_LEVELS = [
  { value: "basic", label: "Basic" },
  { value: "conversational", label: "Conversational" },
  { value: "fluent", label: "Fluent" },
  { value: "native", label: "Native" },
] as const;

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

const MARITAL_STATUSES = [
  { value: "single", label: "Single" },
  { value: "married", label: "Married" },
  { value: "divorced", label: "Divorced" },
  { value: "widowed", label: "Widowed" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
] as const;

const DRIVING_LICENSES = [
  { value: "none", label: "None" },
  { value: "b2", label: "Class B2" },
  { value: "b", label: "Class B" },
  { value: "d", label: "Class D" },
  { value: "da", label: "Class DA" },
  { value: "e", label: "Class E" },
] as const;

const RESUME_ACCEPT = ".pdf,.docx";
const RESUME_MAX_BYTES = 10 * 1024 * 1024;

const AVATAR_ACCEPT = "image/*";
const AVATAR_MAX_BYTES = 3 * 1024 * 1024;

const CERTIFICATE_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";
const CERTIFICATE_MAX_BYTES = 5 * 1024 * 1024;

type QualificationTier = (typeof QUALIFICATION_TIERS)[number]["value"];
type LanguageLevel = (typeof LANGUAGE_LEVELS)[number]["value"];

// A draggable visual companion to the Min/Max salary number inputs above it
// — purely reflects and updates the same two values, so typing stays the
// primary way to set an exact figure, but dragging a handle works too.
// Pointer-capture drag, same technique as useDragScroll's row-panning
// (EmployerDashboardOverview.tsx) — the handle keeps receiving move/up
// events even once the cursor leaves it mid-drag.
//
// The scale grows in fixed 10k chunks once a value gets close to the current
// ceiling, rather than continuously stretching in proportion to the value
// itself — a continuously-proportional scale means a handle's position
// eventually stops moving no matter how far you keep dragging it (the
// percentage becomes a fixed ratio once both numerator and denominator scale
// together). Growing in discrete jumps instead means the percentage is only
// ever recalculated against a momentarily-fixed ceiling, so dragging always
// keeps moving the handle, however far past the base scale you go.
const SALARY_SLIDER_BASE_SCALE = 10000;
const SALARY_SLIDER_CHUNK = 10000;
const SALARY_SLIDER_STEP = 100;

function salaryScaleMaxFor(value: number): number {
  let scale = SALARY_SLIDER_BASE_SCALE;
  while (value > scale) scale += SALARY_SLIDER_CHUNK;
  return scale;
}

function SalaryRangeSlider({
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  min: number;
  max: number;
  onMinChange: (value: number) => void;
  onMaxChange: (value: number) => void;
}) {
  const { t } = useTranslation("common");
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"min" | "max" | null>(null);
  // Sticky — only ever grows, never auto-shrinks back down. Recalculating
  // the scale fresh from the current value on every render meant crossing
  // back over a chunk boundary (e.g. typing 19999 after 20000) snapped the
  // scale back down immediately, and landing exactly on a boundary while
  // dragging could flip it back and forth every render.
  const [scaleMax, setScaleMax] = useState(SALARY_SLIDER_BASE_SCALE);
  const neededScale = salaryScaleMaxFor(Math.max(min, max));
  if (neededScale > scaleMax) setScaleMax(neededScale);

  // Kept current in refs (not just closed over) so the interval below always
  // nudges from the latest value, not whatever min/max were when the pointer
  // first went past the edge. Synced via an effect (safe to write a ref
  // outside render) rather than directly during render.
  const minRef = useRef(min);
  const maxRef = useRef(max);
  const onMinChangeRef = useRef(onMinChange);
  const onMaxChangeRef = useRef(onMaxChange);
  useEffect(() => {
    minRef.current = min;
    maxRef.current = max;
    onMinChangeRef.current = onMinChange;
    onMaxChangeRef.current = onMaxChange;
  });

  // Holding past the track's edge (not just a single fast flick past it)
  // keeps expanding the scale every tick, the same "auto-scroll near the
  // edge" pattern drag-and-drop lists use — otherwise you'd have to keep
  // physically moving the cursor further and further off-screen to get more
  // than one 10k jump.
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopHold() {
    if (holdTimerRef.current) {
      clearInterval(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }
  useEffect(() => stopHold, []);

  function ratioFromClientX(clientX: number): number {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return (clientX - rect.left) / rect.width;
  }

  // Latest overshoot, refreshed on every pointermove — read fresh by the
  // interval each tick, rather than frozen at whatever it was when holding
  // started, so dragging further out while already holding actually speeds
  // the expansion up instead of sticking at the first rate.
  const overshootRef = useRef(0);

  function handleDrag(kind: "min" | "max", clientX: number) {
    const ratio = ratioFromClientX(clientX);
    const overshoot = ratio - 1;
    overshootRef.current = overshoot;
    if (overshoot <= 0) {
      stopHold();
      const value = Math.round((Math.max(0, ratio) * scaleMax) / SALARY_SLIDER_STEP) * SALARY_SLIDER_STEP;
      if (kind === "min") onMinChangeRef.current(Math.min(value, maxRef.current));
      else onMaxChangeRef.current(Math.max(value, minRef.current));
      return;
    }
    if (holdTimerRef.current) return; // already ticking for this hold
    // Speed scales with how far past the edge the cursor is, so dragging
    // further out (not just holding right at the edge) expands faster.
    holdTimerRef.current = setInterval(() => {
      const bump = Math.max(SALARY_SLIDER_STEP, Math.round(overshootRef.current * SALARY_SLIDER_CHUNK));
      if (kind === "min") onMinChangeRef.current(minRef.current + bump);
      else onMaxChangeRef.current(maxRef.current + bump);
    }, 120);
  }

  const minPct = Math.min(100, (min / scaleMax) * 100);
  const maxPct = Math.min(100, (max / scaleMax) * 100);

  return (
    <div className="col-span-full select-none">
      <div ref={trackRef} className="relative mt-[18px] h-[6px] rounded-full bg-[#F1F4F8]">
        <div
          className="absolute h-full rounded-full bg-brand-gold"
          style={{ left: `${minPct}%`, width: `${Math.max(0, maxPct - minPct)}%` }}
        />
        <div
          role="slider"
          aria-label={t("jobseekerOnboarding.minimumSalary")}
          aria-valuemin={0}
          aria-valuemax={scaleMax}
          aria-valuenow={min}
          tabIndex={0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging("min");
          }}
          onPointerUp={() => {
            setDragging(null);
            stopHold();
          }}
          onPointerCancel={() => {
            setDragging(null);
            stopHold();
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            handleDrag("min", e.clientX);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onMinChange(Math.max(0, min - SALARY_SLIDER_STEP));
            if (e.key === "ArrowRight") onMinChange(Math.min(max, min + SALARY_SLIDER_STEP));
          }}
          className="absolute top-1/2 h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-white bg-brand-gold-dark shadow-[0_1px_3px_rgba(0,0,0,0.2)] active:cursor-grabbing"
          style={{ left: `${minPct}%` }}
        >
          {dragging === "min" && (
            <span className="absolute bottom-[22px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#141B2E] px-[8px] py-[3px] text-xs text-white">
              RM{min.toLocaleString()}
            </span>
          )}
        </div>
        <div
          role="slider"
          aria-label={t("jobseekerOnboarding.maximumSalary")}
          aria-valuemin={0}
          aria-valuemax={scaleMax}
          aria-valuenow={max}
          tabIndex={0}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDragging("max");
          }}
          onPointerUp={() => {
            setDragging(null);
            stopHold();
          }}
          onPointerCancel={() => {
            setDragging(null);
            stopHold();
          }}
          onPointerMove={(e) => {
            if (e.buttons !== 1) return;
            handleDrag("max", e.clientX);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") onMaxChange(Math.max(min, max - SALARY_SLIDER_STEP));
            if (e.key === "ArrowRight") onMaxChange(max + SALARY_SLIDER_STEP);
          }}
          className="absolute top-1/2 h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 cursor-grab touch-none rounded-full border-2 border-white bg-brand-gold-dark shadow-[0_1px_3px_rgba(0,0,0,0.2)] active:cursor-grabbing"
          style={{ left: `${maxPct}%` }}
        >
          {dragging === "max" && (
            <span className="absolute bottom-[22px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#141B2E] px-[8px] py-[3px] text-xs text-white">
              RM{max.toLocaleString()}
            </span>
          )}
        </div>
      </div>
      <div className="mt-[6px] flex items-center justify-between text-xs text-[#9AA3B2]">
        <span>{t("jobseekerOnboarding.rm0")}</span>
        <span>RM{scaleMax.toLocaleString()}</span>
      </div>
    </div>
  );
}

// Matches MAX_SUGGESTIONS in the suggest-skills API routes — manual entry
// had no cap while AI suggestions did, letting someone paste far more
// skills than the AI path could ever produce.
const MAX_MANUAL_SKILLS = 40;

// Skill tags are compared case-insensitively so "JavaScript" and
// "javascript" can't both end up on the same profile as separate entries —
// a plain .includes() only catches exact-case duplicates.
function includesSkillCaseInsensitive(list: string[], value: string): boolean {
  const target = value.toLowerCase();
  return list.some((s) => s.toLowerCase() === target);
}

// Union of two skill lists, case-insensitively deduped (used when merging
// resume-parsed skills into what's already on the form).
function mergeSkillsCaseInsensitive(existing: string[], incoming: string[]): string[] {
  const merged = [...existing];
  for (const skill of incoming) {
    if (merged.length >= MAX_MANUAL_SKILLS) break;
    if (!includesSkillCaseInsensitive(merged, skill)) merged.push(skill);
  }
  return merged;
}

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());
}

// AI resume parsing still returns a free-text location guess (no structured
// city/state), since the parsing schema isn't Malaysia-specific. Best-effort
// splits it into city/state by matching a known state name at the end of the
// string (e.g. "Petaling Jaya, Selangor" -> city "Petaling Jaya", state
// "Selangor") — falls back to putting the whole guess in `city` with no
// state if none matches, rather than silently dropping it.
// Sums each work-experience entry's duration (start to end, or start to now
// for a current role) rounded to the nearest year — a naive sum rather than
// merging overlapping date ranges, same simplification most "total years of
// experience" auto-calculators make, since genuinely overlapping full-time
// roles are rare and not worth the extra complexity here.
function computeYearsFromWorkExperiences(entries: WorkExperienceEntry[]): number | null {
  let totalMonths = 0;
  let counted = 0;
  const now = new Date();
  for (const entry of entries) {
    const start = parseMonthYearValue(entry.startDate);
    if (!start.month || !start.year) continue;
    const startDate = new Date(Number(start.year), Number(start.month) - 1, 1);
    let endDate: Date;
    if (entry.isCurrent) {
      endDate = now;
    } else {
      const end = parseMonthYearValue(entry.endDate);
      if (!end.month || !end.year) continue;
      endDate = new Date(Number(end.year), Number(end.month) - 1, 1);
    }
    const months = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
    if (months <= 0) continue;
    totalMonths += months;
    counted++;
  }
  if (counted === 0) return null;
  return Math.round(totalMonths / 12);
}

// A resume's location ("Petaling Jaya, Selangor", "Shah Alam, Selangor,
// Malaysia", "Singapore") → city, state and — when it names one — country.
function splitLocationGuess(raw: string): { city: string; state: (typeof MALAYSIA_STATES)[number] | ""; country: string | null } {
  let trimmed = raw.trim();
  const endsWith = (name: string) => trimmed.toLowerCase().endsWith(name.toLowerCase());
  const cut = (name: string) => trimmed.slice(0, trimmed.length - name.length).replace(/,\s*$/, "").trim();
  let country: string | null = null;
  // A trailing country: Malaysia is dropped (its state comes next); any other
  // country is where they are, and the rest is the city.
  for (const c of COUNTRIES) {
    if (endsWith(c)) {
      country = c;
      trimmed = cut(c);
      break;
    }
  }
  if (country && country !== DEFAULT_COUNTRY) return { city: trimmed || country, state: "", country };
  for (const s of MALAYSIA_STATES) {
    if (endsWith(s)) return { city: cut(s), state: s, country: DEFAULT_COUNTRY };
  }
  return { city: trimmed, state: "", country };
}

type WorkExperienceEntry = {
  id: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  achievements: string;
};

function newWorkExperience(): WorkExperienceEntry {
  return { id: newId(), company: "", title: "", startDate: "", endDate: "", isCurrent: false, achievements: "" };
}

type EducationEntry = {
  id: string;
  institution: string;
  fieldOfStudy: string;
  qualificationTier: QualificationTier;
  cgpa: string;
  graduationYear: string;
};

function newEducation(): EducationEntry {
  return {
    id: newId(),
    institution: "",
    fieldOfStudy: "",
    qualificationTier: "Degree",
    cgpa: "",
    graduationYear: "",
  };
}

type CertificationEntry = {
  id: string;
  name: string;
  issuer: string;
  year: string;
  // The certificate/license file: either a "/uploads/certificates/..." URL
  // already saved, or a fresh "data:...;base64,..." just picked and not yet
  // uploaded. Null when there's no file.
  fileUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
};

function newCertification(): CertificationEntry {
  return { id: newId(), name: "", issuer: "", year: "", fileUrl: null, fileName: null, fileSize: null };
}

type LanguageEntry = {
  id: string;
  language: string;
  // The dialects they also speak, e.g. Chinese → Mandarin, Hokkien (see src/lib/languages.ts).
  dialects: string[];
  spokenLevel: LanguageLevel;
  writtenLevel: LanguageLevel;
};

function newLanguage(): LanguageEntry {
  return { id: newId(), language: "", dialects: [], spokenLevel: "conversational", writtenLevel: "conversational" };
}

/** Rows read through the language list: one per language, older names ("Hokkien") as Chinese + Hokkien. */
function normalizeLanguageRows<T extends { language: string; dialects?: string[] | null }>(rows: T[]) {
  const blank = rows.filter((r) => !r.language.trim()).map((r) => ({ ...r, dialects: r.dialects ?? [] }));
  return [...normalizeSpokenLanguages(rows.filter((r) => r.language.trim())), ...blank];
}

type ReferenceEntry = {
  id: string;
  fullName: string;
  jobTitle: string;
  company: string;
  phone: string;
  email: string;
};

function newReference(): ReferenceEntry {
  return { id: newId(), fullName: "", jobTitle: "", company: "", phone: "", email: "" };
}

// Maps the saved profile's related rows (DB nulls, DB ids) onto the form's
// entry shapes (empty-string defaults, client ids reused as-is since a DB id
// is just as good a React key as a freshly generated one).
function mapWorkExperiences(rows: JobseekerProfile["workExperiences"]): WorkExperienceEntry[] {
  return rows.map((r) => ({
    id: r.id,
    company: r.company,
    title: r.title,
    startDate: r.startDate,
    endDate: r.endDate ?? "",
    isCurrent: r.isCurrent,
    achievements: r.achievements ? plainTextToHtml(r.achievements) : "",
  }));
}

function mapEducation(rows: JobseekerProfile["education"]): EducationEntry[] {
  return rows.map((r) => ({
    id: r.id,
    institution: r.institution,
    fieldOfStudy: r.fieldOfStudy ?? "",
    qualificationTier: r.qualificationTier as QualificationTier,
    cgpa: r.cgpa ?? "",
    graduationYear: r.graduationYear != null ? String(r.graduationYear) : "",
  }));
}

function mapCertifications(rows: JobseekerProfile["certifications"]): CertificationEntry[] {
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    issuer: r.issuer ?? "",
    year: r.year != null ? String(r.year) : "",
    fileUrl: r.fileUrl ?? null,
    fileName: r.fileName ?? null,
    fileSize: r.fileSize ?? null,
  }));
}

function mapLanguages(rows: JobseekerProfile["languages"]): LanguageEntry[] {
  return normalizeLanguageRows(
    rows.map((r) => ({
      id: r.id,
      language: r.language,
      dialects: r.dialects ?? [],
      spokenLevel: r.spokenLevel as LanguageLevel,
      writtenLevel: r.writtenLevel as LanguageLevel,
    })),
  );
}

function mapReferences(rows: JobseekerProfile["references"]): ReferenceEntry[] {
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    jobTitle: r.jobTitle ?? "",
    company: r.company ?? "",
    phone: r.phone ?? "",
    email: r.email ?? "",
  }));
}

type ParseUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

type ParsedProfile = {
  fullName: string | null;
  dateOfBirth: string | null;
  gender: (typeof GENDERS)[number]["value"] | null;
  maritalStatus: (typeof MARITAL_STATUSES)[number]["value"] | null;
  nationality: string | null;
  phone: string | null;
  drivingLicense: (typeof DRIVING_LICENSES)[number]["value"] | null;
  location: string | null;
  targetRole: string | null;
  preferredIndustry: (typeof INDUSTRIES)[number] | null;
  yearsExperience: number | null;
  professionalSkills: string[];
  softSkills: string[];
  otherSkills: string[];
  employmentType: (typeof EMPLOYMENT_TYPES)[number]["value"] | null;
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  bio: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  githubUrl: string | null;
  workExperiences: {
    company: string;
    title: string;
    startDate: string;
    endDate: string | null;
    isCurrent: boolean;
    achievements: string | null;
  }[];
  education: {
    institution: string;
    fieldOfStudy: string | null;
    qualificationTier: QualificationTier;
    cgpa: string | null;
    graduationYear: number | null;
  }[];
  certifications: { name: string; issuer: string | null; year: number | null }[];
  languages: { language: string; dialects?: string[]; spokenLevel: LanguageLevel; writtenLevel: LanguageLevel }[];
  references: { fullName: string; jobTitle: string | null; company: string | null; phone: string | null; email: string | null }[];
};

type DraftData = {
  avatarUrl: string | null;
  avatarIsAccountDefault: boolean;
  fullName: string;
  age: string;
  // Drafts saved before ages were asked for hold a date of birth instead.
  dateOfBirth?: string;
  gender: (typeof GENDERS)[number]["value"] | "";
  maritalStatus: (typeof MARITAL_STATUSES)[number]["value"] | "";
  nationality: string;
  phone: string;
  drivingLicense: (typeof DRIVING_LICENSES)[number]["value"] | "";
  location: string;
  city: string;
  state: (typeof MALAYSIA_STATES)[number] | "";
  // Missing on drafts from before country was asked — those are Malaysia.
  country?: string;
  // From the place search (Malaysia); missing on older drafts.
  area?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  targetRole: string;
  preferredIndustry: (typeof INDUSTRIES)[number] | "";
  yearsExperience: string;
  professionalSkills: string[];
  softSkills: string[];
  otherSkills: string[];
  skillSuggestions: { professionalSkills: string[]; softSkills: string[] } | null;
  employmentType: (typeof EMPLOYMENT_TYPES)[number]["value"];
  expectedSalaryMin: string;
  expectedSalaryMax: string;
  bio: string;
  linkedinUrl: string;
  portfolioUrl: string;
  githubUrl: string;
  workArrangement: (typeof WORK_ARRANGEMENTS)[number]["value"];
  // Picked places; older drafts may hold half-picked rows (state only, no area/coordinates).
  preferredWorkPlaces?: { city: string; state: (typeof MALAYSIA_STATES)[number] | ""; area?: string | null; lat?: number | null; lng?: number | null }[];
  // "" until picked — it decides which jobs they're matched and screened for.
  workAuthorization: (typeof WORK_AUTHORIZATIONS)[number]["value"] | "";
  noticePeriod: (typeof NOTICE_PERIODS)[number]["value"];
  workExperiences: Omit<WorkExperienceEntry, "id">[];
  education: Omit<EducationEntry, "id">[];
  certifications: Omit<CertificationEntry, "id">[];
  languages: Omit<LanguageEntry, "id">[];
  references: Omit<ReferenceEntry, "id">[];
  resumeFileName: string | null;
  resumeFileSize: number | null;
  resumeParseTokens: number | null;
  resumeParseDurationMs: number | null;
};

function isNonNegativeInt(value: string) {
  if (value.trim() === "") return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject());
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}



const inputClass = formInputClass("gold");
const entryCardClass = "flex flex-col gap-[10px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]";

function CategoryHeading({ label, first }: { label: string; first?: boolean }) {
  return (
    <p
      className={`col-span-full text-xl font-semibold text-[#141B2E] ${
        first ? "" : "mt-[6px] border-t border-black/[0.06] pt-[14px]"
      }`}
    >
      {label}
    </p>
  );
}

function SectionHeader({
  label,
  hint,
  onAdd,
  addLabel,
  required = false,
  db,
}: {
  label: string;
  hint?: string;
  onAdd: () => void;
  addLabel: string;
  // A red asterisk, like Field's.
  required?: boolean;
  // Development-only DB map key (see src/dev/db-map).
  db?: string;
}) {
  return (
    <div data-db={db} className="flex items-center justify-between">
      <div>
        <p className="text-xs text-[#4B5468]">
          {label}
          {required && <span className="text-red-500"> *</span>}
        </p>
        {hint && <p className="text-xs text-[#9AA3B2]">{hint}</p>}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="flex items-center gap-[4px] rounded-full bg-brand-gold-soft py-[6px] pl-[10px] pr-[12px] text-sm text-brand-gold-dark hover:bg-brand-gold"
      >
        <PlusIcon className="h-[10px] w-[10px]" />
        {addLabel}
      </button>
    </div>
  );
}

function EntryRemoveButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation("common");
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t("jobseekerOnboarding.removeEntry")}
      className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.08] hover:text-[#141B2E]"
    >
      <XIcon className="h-[10px] w-[10px]" />
    </button>
  );
}

export function JobseekerOnboardingForm({
  mode = "onboarding",
  initialProfile,
  accountEmail: initialAccountEmail,
  initialAvatarUrl,
  initialDraft,
  topSlot,
  initialPhoneStatus,
}: {
  // Whether the phone the form starts with is verified (from the server), so
  // it shows correctly on the first frame instead of loading in.
  initialPhoneStatus?: { canVerify: boolean; verified: boolean };
  mode?: "onboarding" | "edit";
  initialProfile?: JobseekerProfile;
  accountEmail?: string;
  initialAvatarUrl?: string | null;
  initialDraft?: Partial<DraftData> | null;
  /** Rendered at the top of the main column, so it shares the form's width. */
  topSlot?: React.ReactNode;
} = {}) {
  const { t } = useTranslation("common");
  // The option lists keep their English labels; they're shown in the reader's language by value.
  const tOptions = <T extends { value: string; label: string }>(list: readonly T[], group: string) =>
    list.map((o) => ({ ...o, label: t(`jobseekerOnboarding.options.${group}.${o.value}`) }));
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const saveDraftMutation = useMutation(orpc.jobseeker.saveDraft.mutationOptions());
  const saveProfileMutation = useMutation(orpc.jobseeker.saveProfile.mutationOptions());
  const parseResumeMutation = useMutation(orpc.jobseeker.parseResume.mutationOptions());
  const suggestSkillsMutation = useMutation(orpc.jobseeker.suggestSkills.mutationOptions());
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const saveLabel = mode === "edit" ? t("jobseekerOnboarding.saveChanges") : t("jobseekerOnboarding.finish");
  // Edit mode is always editable — same as the employer's My Profile/Company
  // Profile. Unsaved work is detected by dirtiness (isProfileDirty below),
  // not by an "Edit" unlock toggle.

  useEffect(() => {
    if (!savedAt) return;
    const timeout = setTimeout(() => setSavedAt(null), 3000);
    return () => clearTimeout(timeout);
  }, [savedAt]);

  // Same "intercept sidebar navigation" pattern as Post a Job's unsaved-work
  // guard — the dashboard shell's sidebar links call whatever guard is
  // provided via context before navigating away, so leaving with real
  // unsaved changes prompts the same confirm dialog rather than silently
  // discarding them (and leaving an untouched form never prompts).
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [pendingProceed, setPendingProceed] = useState<(() => void) | null>(null);
  function guardNavigation(proceed: () => void) {
    if (mode === "edit" && isProfileDirty) {
      setPendingProceed(() => proceed);
      setShowLeaveConfirm(true);
    } else {
      proceed();
    }
  }
  async function saveAndLeave() {
    setShowLeaveConfirm(false);
    const saved = await submitProfile();
    if (saved) {
      pendingProceed?.();
      setPendingProceed(null);
    }
  }
  function discardAndLeave() {
    setShowLeaveConfirm(false);
    pendingProceed?.();
    setPendingProceed(null);
  }
  // This form is rendered as `children` *inside* JobseekerDashboardShell
  // (edit mode) — its sidebar sits above this component in the tree, so a
  // context Provider rendered here could never reach it. Registers into the
  // shell's own UnsavedChangesGuardBoundary instead (see that file for why).
  useRegisterUnsavedChangesGuard(guardNavigation);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    initialProfile?.avatarUrl ?? initialDraft?.avatarUrl ?? initialAvatarUrl ?? null,
  );
  // True only while avatarUrl is still the unconfirmed Google account
  // picture auto-filled below, never something the jobseeker actually chose
  // — lets the resume-photo suggestion still offer to replace it, instead of
  // hiding just because *some* avatar happens to be set.
  const [avatarIsAccountDefault, setAvatarIsAccountDefault] = useState(
    initialDraft?.avatarUrl
      ? Boolean(initialDraft.avatarIsAccountDefault)
      : !initialProfile?.avatarUrl && !initialDraft?.avatarUrl && Boolean(initialAvatarUrl),
  );
  // Same idea as avatarIsAccountDefault — true only while the current
  // avatarUrl came from accepting a resume's suggested photo, never a
  // manual upload the jobseeker deliberately chose. Lets removing that
  // resume and uploading a different one surface its own photo suggestion
  // too, instead of staying hidden forever just because *some* avatar
  // happens to already be set from the previous resume.
  const [avatarIsFromResumeSuggestion, setAvatarIsFromResumeSuggestion] = useState(false);
  // A URL can fail to load for reasons outside our control — e.g. a Google
  // account picture blocked by the viewer's own ad blocker/privacy
  // extension — without the underlying value actually being broken. Falls
  // back to the placeholder icon instead of the browser's broken-image
  // glyph. Cleared at every call site that sets a new avatarUrl, so a fresh
  // value always gets a fresh chance to load.
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [suggestedAvatarUrl, setSuggestedAvatarUrl] = useState<string | null>(null);

  const resumeInputRef = useRef<HTMLInputElement>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [restoredResume, setRestoredResume] = useState<{
    name: string;
    size: number;
    tokens: number | null;
    durationMs: number | null;
  } | null>(
    initialProfile?.resumeFileName
      ? {
          name: initialProfile.resumeFileName,
          size: initialProfile.resumeFileSize ?? 0,
          tokens: null,
          durationMs: null,
        }
      : initialDraft?.resumeFileName
        ? {
            name: initialDraft.resumeFileName,
            size: initialDraft.resumeFileSize ?? 0,
            tokens: initialDraft.resumeParseTokens ?? null,
            durationMs: initialDraft.resumeParseDurationMs ?? null,
          }
        : null,
  );
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [resumeStatus, setResumeStatus] = useState<string | null>(null);
  const [showResumeWarning, setShowResumeWarning] = useState(false);
  const [showRemoveResumeConfirm, setShowRemoveResumeConfirm] = useState(false);
  const [showResetResumeConfirm, setShowResetResumeConfirm] = useState(false);
  const [showFinishSuccess, setShowFinishSuccess] = useState(false);
  const [showParseConfirm, setShowParseConfirm] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseElapsedMs, setParseElapsedMs] = useState(0);
  const [parseUsage, setParseUsage] = useState<ParseUsage | null>(null);
  const [parseDurationMs, setParseDurationMs] = useState<number | null>(null);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    if (!parsing) return;
    const startedAt = Date.now();
    const interval = setInterval(() => setParseElapsedMs(Date.now() - startedAt), 100);
    return () => clearInterval(interval);
  }, [parsing]);

  const [fullName, setFullName] = useState(initialProfile?.fullName ?? initialDraft?.fullName ?? "");
  const draftContext = useDraftName();
  const setDraftName = draftContext?.setDraftName;
  useEffect(() => {
    setDraftName?.(fullName);
  }, [fullName, setDraftName]);
  const setDraftAvatarUrl = draftContext?.setDraftAvatarUrl;
  useEffect(() => {
    setDraftAvatarUrl?.(avatarUrl);
  }, [avatarUrl, setDraftAvatarUrl]);
  // Typed as text so it can be cleared; checked with parseAge (see src/lib/age.ts).
  const [age, setAge] = useState(() => {
    const saved = ageFromBirthYear(initialProfile?.birthYear) ?? (initialDraft?.age ? null : ageFromDate(initialDraft?.dateOfBirth));
    return saved !== null ? String(saved) : (initialDraft?.age ?? "");
  });
  const [gender, setGender] = useState<(typeof GENDERS)[number]["value"] | "">(
    (initialProfile?.gender as (typeof GENDERS)[number]["value"] | null | undefined) ??
      initialDraft?.gender ??
      "",
  );
  const [maritalStatus, setMaritalStatus] = useState<(typeof MARITAL_STATUSES)[number]["value"] | "">(
    (initialProfile?.maritalStatus as (typeof MARITAL_STATUSES)[number]["value"] | null | undefined) ??
      initialDraft?.maritalStatus ??
      "",
  );
  const [nationality, setNationality] = useState(initialProfile?.nationality ?? initialDraft?.nationality ?? "");
  const accountEmail = initialAccountEmail ?? "";
  const [phone, setPhone] = useState(initialProfile?.phone ?? initialDraft?.phone ?? "");
  // Whether the number in the phone field is verified — shown as a seal on the avatar
  // here, and (during onboarding) on the navbar's avatar too.
  const [phoneVerified, setPhoneVerified] = useState(initialPhoneStatus?.verified ?? false);
  const setDraftPhoneVerified = draftContext?.setDraftPhoneVerified;
  useEffect(() => {
    setDraftPhoneVerified?.(phoneVerified);
  }, [phoneVerified, setDraftPhoneVerified]);
  const [drivingLicense, setDrivingLicense] = useState<(typeof DRIVING_LICENSES)[number]["value"] | "">(
    (initialProfile?.drivingLicense as (typeof DRIVING_LICENSES)[number]["value"] | null | undefined) ??
      initialDraft?.drivingLicense ??
      "",
  );
  const [city, setCity] = useState(initialProfile?.city ?? initialDraft?.city ?? "");
  const [state, setState] = useState<(typeof MALAYSIA_STATES)[number] | "">(
    (initialProfile?.state as (typeof MALAYSIA_STATES)[number] | undefined) ?? initialDraft?.state ?? "",
  );
  const [country, setCountry] = useState<string>(initialProfile?.country ?? initialDraft?.country ?? DEFAULT_COUNTRY);
  const inMalaysia = country === DEFAULT_COUNTRY;
  // In Malaysia the place comes from the place search (towns and areas, see
  // src/lib/place-search.ts): picking one fills the town, state, area and
  // map coordinates together. Elsewhere the city is just typed.
  const [area, setArea] = useState<string | null>(initialProfile?.area ?? initialDraft?.area ?? null);
  const [latitude, setLatitude] = useState<number | null>(initialProfile?.latitude ?? initialDraft?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(initialProfile?.longitude ?? initialDraft?.longitude ?? null);
  const homePlace: Place | null =
    inMalaysia && city.trim() && state ? { area, city: city.trim(), state, lat: latitude, lng: longitude } : null;
  function setHomePlace(place: Place | null) {
    setCity(place?.city ?? "");
    setState(place?.state ?? "");
    setArea(place?.area ?? null);
    setLatitude(place?.lat ?? null);
    setLongitude(place?.lng ?? null);
  }
  // A resume's location is plain text ("Kota Damansara, Selangor"). Look it up
  // like a typed search so it lands on a real town (and area) — unless the
  // jobseeker has picked something else in the meantime.
  function matchResumePlace(guess: { city: string; state: string }) {
    const q = guess.city.trim();
    if (q.length < 2) return;
    queryClient
      .fetchQuery(orpc.geo.places.queryOptions({ input: { q } }))
      .then((data: { places?: Place[] } | null) => {
        const match = data?.places?.find((p) => !guess.state || p.state === guess.state);
        if (!match) return;
        setCity((prev) => {
          if (prev !== guess.city) return prev;
          setState(match.state);
          setArea(match.area);
          setLatitude(match.lat);
          setLongitude(match.lng);
          return match.city;
        });
      })
      .catch(() => {});
  }
  const location = homePlace
    ? formatPlace(homePlace)
    : inMalaysia
      ? city.trim() || state
      : city.trim() && city.trim().toLowerCase() !== country.toLowerCase()
        ? `${city.trim()}, ${country}`
        : country;
  const [targetRole, setTargetRole] = useState(initialProfile?.targetRole ?? initialDraft?.targetRole ?? "");
  const [preferredIndustry, setPreferredIndustry] = useState<(typeof INDUSTRIES)[number] | "">(
    (initialProfile?.preferredIndustry as (typeof INDUSTRIES)[number] | null | undefined) ??
      initialDraft?.preferredIndustry ??
      "",
  );
  const [yearsExperience, setYearsExperience] = useState(
    initialProfile?.yearsExperience != null
      ? String(initialProfile.yearsExperience)
      : (initialDraft?.yearsExperience ?? ""),
  );
  // Once the user edits this by hand, it stops auto-recalculating from
  // Experience & background — an explicit override should stick, not get
  // silently clobbered the next time a work-history date changes. Starts
  // true for a brand-new profile (nothing typed yet) so the very first
  // completed work-experience entry fills it in for free.
  const [yearsExperienceAuto, setYearsExperienceAuto] = useState(initialProfile?.yearsExperience == null);
  const [professionalSkillInput, setProfessionalSkillInput] = useState("");
  const [professionalSkills, setProfessionalSkills] = useState<string[]>(
    initialProfile?.professionalSkills ?? initialDraft?.professionalSkills ?? [],
  );
  const [softSkillInput, setSoftSkillInput] = useState("");
  const [softSkills, setSoftSkills] = useState<string[]>(
    initialProfile?.softSkills ?? initialDraft?.softSkills ?? [],
  );
  const [otherSkillInput, setOtherSkillInput] = useState("");
  const [otherSkills, setOtherSkills] = useState<string[]>(
    initialProfile?.otherSkills ?? initialDraft?.otherSkills ?? [],
  );
  const [skillSuggestions, setSkillSuggestions] = useState<{
    professionalSkills: string[];
    softSkills: string[];
  } | null>(initialDraft?.skillSuggestions ?? null);
  const [suggestingSkills, setSuggestingSkills] = useState(false);
  const [suggestSkillsError, setSuggestSkillsError] = useState<string | null>(null);
  const [suggestSkillsStatus, setSuggestSkillsStatus] = useState<string | null>(null);
  const [suggestSkillsElapsedMs, setSuggestSkillsElapsedMs] = useState(0);
  const [suggestSkillsTokens, setSuggestSkillsTokens] = useState<number | null>(null);
  const [suggestSkillsDurationMs, setSuggestSkillsDurationMs] = useState<number | null>(null);

  useEffect(() => {
    if (!suggestingSkills) return;
    const startedAt = Date.now();
    const interval = setInterval(() => setSuggestSkillsElapsedMs(Date.now() - startedAt), 100);
    return () => clearInterval(interval);
  }, [suggestingSkills]);
  const [employmentType, setEmploymentType] = useState<(typeof EMPLOYMENT_TYPES)[number]["value"]>(
    (initialProfile?.employmentType as (typeof EMPLOYMENT_TYPES)[number]["value"] | undefined) ??
      initialDraft?.employmentType ??
      "full_time",
  );
  const [expectedSalaryMin, setExpectedSalaryMin] = useState(
    initialProfile?.expectedSalaryMin != null
      ? String(initialProfile.expectedSalaryMin)
      : (initialDraft?.expectedSalaryMin ?? ""),
  );
  const [expectedSalaryMax, setExpectedSalaryMax] = useState(
    initialProfile?.expectedSalaryMax != null
      ? String(initialProfile.expectedSalaryMax)
      : (initialDraft?.expectedSalaryMax ?? ""),
  );

  const [bio, setBio] = useState(initialProfile?.bio ?? initialDraft?.bio ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(initialProfile?.linkedinUrl ?? initialDraft?.linkedinUrl ?? "");
  const [portfolioUrl, setPortfolioUrl] = useState(
    initialProfile?.portfolioUrl ?? initialDraft?.portfolioUrl ?? "",
  );
  const [githubUrl, setGithubUrl] = useState(initialProfile?.githubUrl ?? initialDraft?.githubUrl ?? "");
  // Where they'd like to work: one place-search box per row (towns and
  // areas), at least one and up to MAX_WORK_PLACES (see
  // src/lib/work-locations.ts). Starts with one empty row; an extra empty
  // row is simply ignored.
  const [workPlaceRows, setWorkPlaceRows] = useState<WorkPlaceRow[]>(() => {
    // Ids here must come out the same on the server and the client (the
    // initial render is the same data both times), so they're index-based —
    // newId() (random) is only for rows added afterward via "+ Add".
    const saved = (initialProfile?.preferredWorkPlaces ?? initialDraft?.preferredWorkPlaces ?? []).map((p, i) => ({
      id: `initial-${i}`,
      // Older drafts can hold a half-picked row (state only) — that's empty now.
      place:
        p.city && p.state
          ? { area: p.area ?? null, city: p.city, state: p.state, lat: p.lat ?? null, lng: p.lng ?? null }
          : null,
    }));
    return saved.length > 0 ? saved : [{ id: "initial-0", place: null }];
  });
  const pickedWorkPlaces = workPlaceRows.map((r) => r.place).filter((p): p is Place => p !== null);
  const workPlacesDone = pickedWorkPlaces.length > 0;
  const [workArrangement, setWorkArrangement] = useState<(typeof WORK_ARRANGEMENTS)[number]["value"]>(
    (initialProfile?.workArrangement as (typeof WORK_ARRANGEMENTS)[number]["value"] | undefined) ??
      initialDraft?.workArrangement ??
      "onsite",
  );
  // No default: a wrong guess (e.g. "Malaysian citizen" for someone on a work
  // pass) would match and screen them for the wrong jobs without them noticing.
  const [workAuthorization, setWorkAuthorization] = useState<
    (typeof WORK_AUTHORIZATIONS)[number]["value"] | ""
  >(
    (initialProfile?.workAuthorization as (typeof WORK_AUTHORIZATIONS)[number]["value"] | undefined) ??
      initialDraft?.workAuthorization ??
      "",
  );
  const [noticePeriod, setNoticePeriod] = useState<(typeof NOTICE_PERIODS)[number]["value"]>(
    (initialProfile?.noticePeriod as (typeof NOTICE_PERIODS)[number]["value"] | undefined) ??
      initialDraft?.noticePeriod ??
      "immediate",
  );

  const [workExperiences, setWorkExperiences] = useState<WorkExperienceEntry[]>(
    initialProfile
      ? mapWorkExperiences(initialProfile.workExperiences)
      : (initialDraft?.workExperiences?.map((entry) => ({ ...entry, id: newId() })) ?? []),
  );

  // Keeps Years of experience in sync with Experience & background for as
  // long as the user hasn't typed into that field directly — recalculated
  // during render (React's "adjust state when a dependency changes" pattern)
  // rather than an effect, since it only needs to react to entries changing.
  const [prevWorkExperiences, setPrevWorkExperiences] = useState(workExperiences);
  if (yearsExperienceAuto && workExperiences !== prevWorkExperiences) {
    setPrevWorkExperiences(workExperiences);
    const computed = computeYearsFromWorkExperiences(workExperiences);
    if (computed !== null) setYearsExperience(String(computed));
  } else if (workExperiences !== prevWorkExperiences) {
    setPrevWorkExperiences(workExperiences);
  }
  const [education, setEducation] = useState<EducationEntry[]>(
    initialProfile
      ? mapEducation(initialProfile.education)
      : (initialDraft?.education?.map((entry) => ({ ...entry, id: newId() })) ?? []),
  );
  const [certifications, setCertifications] = useState<CertificationEntry[]>(
    initialProfile
      ? mapCertifications(initialProfile.certifications)
      : // Older drafts were saved before the file fields existed.
        (initialDraft?.certifications?.map((entry) => ({
          ...entry,
          id: newId(),
          fileUrl: entry.fileUrl ?? null,
          fileName: entry.fileName ?? null,
          fileSize: entry.fileSize ?? null,
        })) ?? []),
  );
  const [languages, setLanguages] = useState<LanguageEntry[]>(
    initialProfile
      ? mapLanguages(initialProfile.languages)
      : normalizeLanguageRows((initialDraft?.languages ?? []).map((entry) => ({ ...entry, id: newId() }))),
  );
  const [references, setReferences] = useState<ReferenceEntry[]>(
    initialProfile
      ? mapReferences(initialProfile.references)
      : (initialDraft?.references?.map((entry) => ({ ...entry, id: newId() })) ?? []),
  );

  // Every saved field as it loaded (or was last saved), serialized — any
  // edit, including adding/removing an experience, education, language or
  // reference entry, flips isProfileDirty for the leave-confirm guard. Same
  // approach as the employer form's initialCompanySnapshot. The resume isn't
  // included: in edit mode it's managed separately from the sidebar card.
  const profileSnapshotValue = JSON.stringify({
    avatarUrl,
    fullName,
    age,
    gender,
    maritalStatus,
    nationality,
    phone,
    drivingLicense,
    city,
    state,
    country,
    targetRole,
    preferredIndustry,
    yearsExperience,
    professionalSkills,
    softSkills,
    otherSkills,
    employmentType,
    expectedSalaryMin,
    expectedSalaryMax,
    bio,
    linkedinUrl,
    portfolioUrl,
    githubUrl,
    workArrangement,
    preferredWorkPlaces: pickedWorkPlaces.map(formatPlace),
    area,
    latitude,
    longitude,
    workAuthorization,
    noticePeriod,
    workExperiences: workExperiences.map((e) => [e.company, e.title, e.startDate, e.endDate, e.isCurrent, e.achievements]),
    education: education.map((e) => [e.institution, e.fieldOfStudy, e.qualificationTier, e.cgpa, e.graduationYear]),
    certifications: certifications.map((e) => [e.name, e.issuer, e.year, e.fileUrl, e.fileName, e.fileSize]),
    languages: languages.map((e) => [e.language, e.dialects, e.spokenLevel, e.writtenLevel]),
    references: references.map((e) => [e.fullName, e.jobTitle, e.company, e.phone, e.email]),
  });
  const initialProfileSnapshot = useRef(profileSnapshotValue);
  const isProfileDirty = profileSnapshotValue !== initialProfileSnapshot.current;

  const [autosaveError, setAutosaveError] = useState(false);
  const draftSaveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resumeParseId = useRef(0);

  // Debounced autosave — waits for a pause in typing rather than saving on
  // every keystroke. Skipped in edit mode — there's no draft to autosave to
  // once a profile exists.
  useEffect(() => {
    if (mode === "edit") return;
    if (draftSaveTimeout.current) clearTimeout(draftSaveTimeout.current);
    draftSaveTimeout.current = setTimeout(() => {
      const payload: DraftData = {
        avatarUrl,
        avatarIsAccountDefault,
        fullName,
        age,
        gender,
        maritalStatus,
        nationality,
        phone,
        drivingLicense,
        location,
        city,
        state,
        country,
        targetRole,
        preferredIndustry,
        yearsExperience,
        professionalSkills,
        softSkills,
        otherSkills,
        skillSuggestions,
        employmentType,
        expectedSalaryMin,
        expectedSalaryMax,
        bio,
        linkedinUrl,
        portfolioUrl,
        githubUrl,
        workArrangement,
        preferredWorkPlaces: pickedWorkPlaces,
        area,
        latitude,
        longitude,
        workAuthorization,
        noticePeriod,
        workExperiences: workExperiences.map((e) => ({
          company: e.company,
          title: e.title,
          startDate: e.startDate,
          endDate: e.endDate,
          isCurrent: e.isCurrent,
          achievements: e.achievements,
        })),
        education: education.map((e) => ({
          institution: e.institution,
          fieldOfStudy: e.fieldOfStudy,
          qualificationTier: e.qualificationTier,
          cgpa: e.cgpa,
          graduationYear: e.graduationYear,
        })),
        certifications: certifications.map((e) => ({
          name: e.name,
          issuer: e.issuer,
          year: e.year,
          fileUrl: e.fileUrl,
          fileName: e.fileName,
          fileSize: e.fileSize,
        })),
        languages: languages.map((e) => ({
          language: e.language,
          dialects: e.dialects,
          spokenLevel: e.spokenLevel,
          writtenLevel: e.writtenLevel,
        })),
        references: references.map((e) => ({
          fullName: e.fullName,
          jobTitle: e.jobTitle,
          company: e.company,
          phone: e.phone,
          email: e.email,
        })),
        resumeFileName: resumeFile?.name ?? restoredResume?.name ?? null,
        resumeFileSize: resumeFile?.size ?? restoredResume?.size ?? null,
        resumeParseTokens: parseUsage?.total_tokens ?? restoredResume?.tokens ?? null,
        resumeParseDurationMs: parseDurationMs ?? restoredResume?.durationMs ?? null,
      };
      saveDraftMutation.mutate(payload, {
        onSuccess: () => setAutosaveError(false),
        onError: () => setAutosaveError(true),
      });
    }, 1000);
    return () => {
      if (draftSaveTimeout.current) clearTimeout(draftSaveTimeout.current);
    };
  }, [
    mode,
    avatarUrl,
    avatarIsAccountDefault,
    fullName,
    age,
    gender,
    maritalStatus,
    nationality,
    phone,
    drivingLicense,
    location,
    city,
    state,
    country,
    targetRole,
    preferredIndustry,
    yearsExperience,
    professionalSkills,
    softSkills,
    otherSkills,
    skillSuggestions,
    employmentType,
    expectedSalaryMin,
    expectedSalaryMax,
    bio,
    linkedinUrl,
    portfolioUrl,
    githubUrl,
    workArrangement,
    pickedWorkPlaces,
    area,
    latitude,
    longitude,
    workAuthorization,
    noticePeriod,
    workExperiences,
    education,
    certifications,
    languages,
    references,
    resumeFile,
    restoredResume,
    parseUsage,
    parseDurationMs,
  ]);

  function updateWorkExperience(id: string, patch: Partial<WorkExperienceEntry>) {
    setWorkExperiences((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }
  function removeWorkExperience(id: string) {
    setWorkExperiences((prev) => prev.filter((entry) => entry.id !== id));
  }

  function updateEducation(id: string, patch: Partial<EducationEntry>) {
    setEducation((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }
  function removeEducation(id: string) {
    setEducation((prev) => prev.filter((entry) => entry.id !== id));
  }

  function updateCertification(id: string, patch: Partial<CertificationEntry>) {
    setCertifications((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }
  function removeCertification(id: string) {
    setCertifications((prev) => prev.filter((entry) => entry.id !== id));
    setCertificationFileErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  // One upload box per certification row — picked files are read straight to
  // a data URL (small files, no need to defer like the resume) and resolved
  // to a stored "/uploads/certificates/..." URL on submit, same as the avatar.
  const [certificationFileErrors, setCertificationFileErrors] = useState<Record<string, string>>({});
  async function handleCertificationFile(id: string, file: File | null) {
    if (!file) return;
    if (file.size > CERTIFICATE_MAX_BYTES) {
      setCertificationFileErrors((prev) => ({ ...prev, [id]: t("jobseekerOnboarding.fileTooLargeMax5Mb") }));
      return;
    }
    setCertificationFileErrors((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const dataUrl = await fileToDataUrl(file);
      updateCertification(id, { fileUrl: dataUrl, fileName: file.name, fileSize: file.size });
    } catch {
      setCertificationFileErrors((prev) => ({ ...prev, [id]: t("jobseekerOnboarding.couldntReadThatFile") }));
    }
  }
  function clearCertificationFile(id: string) {
    updateCertification(id, { fileUrl: null, fileName: null, fileSize: null });
  }

  // Language rows switched to "Other (type it)" before anything was typed.
  const [otherLanguageRows, setOtherLanguageRows] = useState<Set<string>>(() => new Set());
  function updateLanguage(id: string, patch: Partial<LanguageEntry>) {
    setLanguages((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }
  function removeLanguage(id: string) {
    setLanguages((prev) => prev.filter((entry) => entry.id !== id));
  }
  function updateReference(id: string, patch: Partial<ReferenceEntry>) {
    setReferences((prev) => prev.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));
  }
  function removeReference(id: string) {
    setReferences((prev) => prev.filter((entry) => entry.id !== id));
  }

  function addProfessionalSkill() {
    const value = professionalSkillInput.trim();
    if (
      !value ||
      includesSkillCaseInsensitive(professionalSkills, value) ||
      professionalSkills.length >= MAX_MANUAL_SKILLS
    ) {
      setProfessionalSkillInput("");
      return;
    }
    setProfessionalSkills((prev) => [...prev, value]);
    setProfessionalSkillInput("");
  }

  function removeProfessionalSkill(skill: string) {
    setProfessionalSkills((prev) => prev.filter((s) => s !== skill));
  }

  function handleProfessionalSkillKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addProfessionalSkill();
    }
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

  function removeSoftSkill(skill: string) {
    setSoftSkills((prev) => prev.filter((s) => s !== skill));
  }

  function handleSoftSkillKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addSoftSkill();
    }
  }

  function addOtherSkill() {
    const value = otherSkillInput.trim();
    if (!value || includesSkillCaseInsensitive(otherSkills, value) || otherSkills.length >= MAX_MANUAL_SKILLS) {
      setOtherSkillInput("");
      return;
    }
    setOtherSkills((prev) => [...prev, value]);
    setOtherSkillInput("");
  }

  function removeOtherSkill(skill: string) {
    setOtherSkills((prev) => prev.filter((s) => s !== skill));
  }

  function handleOtherSkillKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addOtherSkill();
    }
  }

  async function suggestSkills() {
    if (!targetRole.trim()) {
      setSuggestSkillsError(t("jobseekerOnboarding.enterYourTargetRoleFirst"));
      return;
    }
    setSuggestingSkills(true);
    setSuggestSkillsError(null);
    setSuggestSkillsStatus(null);
    setSuggestSkillsElapsedMs(0);
    setSuggestSkillsTokens(null);
    setSuggestSkillsDurationMs(null);
    try {
      const data = await suggestSkillsMutation.mutateAsync({ targetRole: targetRole.trim() });
      setSkillSuggestions({
        professionalSkills: (data.suggestions?.professionalSkills ?? []).filter(
          (s: string) => !includesSkillCaseInsensitive(professionalSkills, s),
        ),
        softSkills: (data.suggestions?.softSkills ?? []).filter(
          (s: string) => !includesSkillCaseInsensitive(softSkills, s),
        ),
      });
      setSuggestSkillsTokens(typeof data.usage?.total_tokens === "number" ? data.usage.total_tokens : null);
      setSuggestSkillsDurationMs(typeof data.durationMs === "number" ? data.durationMs : null);
      setSuggestSkillsStatus(t("jobseekerOnboarding.suggestedReviewBeforeAdding"));
    } catch (err) {
      setSuggestSkillsError(err instanceof Error ? err.message : t("jobseekerOnboarding.couldntSuggestSkills"));
    } finally {
      setSuggestingSkills(false);
    }
  }

  function addSuggestedProfessionalSkill(skill: string) {
    setProfessionalSkills((prev) =>
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

  // Two modes: the default only fills fields the user hasn't already typed
  // into (and adds new work/education/etc. entries alongside existing ones)
  // so a manual edit made while parsing is running is never clobbered.
  // `overwrite` is opt-in — reached only via the confirmation modal when the
  // form already has details — and replaces every field and list wholesale
  // with what this resume says, including clearing anything it doesn't
  // mention, since that's what "start over from this resume" means.
  function applyParsedProfile(profile: ParsedProfile, overwrite: boolean) {
    let filled = 0;
    const mark = () => filled++;

    if (overwrite) {
      setFullName(profile.fullName ?? "");
      setAge(String(ageFromDate(profile.dateOfBirth) ?? ""));
      setGender((profile.gender as (typeof GENDERS)[number]["value"] | null) ?? "");
      setMaritalStatus((profile.maritalStatus as (typeof MARITAL_STATUSES)[number]["value"] | null) ?? "");
      setNationality(profile.nationality ?? "");
      setPhone(profile.phone ?? "");
      setDrivingLicense((profile.drivingLicense as (typeof DRIVING_LICENSES)[number]["value"] | null) ?? "");
      // A resume's location is text, not a picked place — no area or coordinates.
      setArea(null);
      setLatitude(null);
      setLongitude(null);
      if (profile.location) {
        const guess = splitLocationGuess(profile.location);
        setCity(guess.city);
        setState(guess.state);
        setCountry(guess.country ?? DEFAULT_COUNTRY);
        if ((guess.country ?? DEFAULT_COUNTRY) === DEFAULT_COUNTRY) matchResumePlace(guess);
      } else {
        setCity("");
        setState("");
        setCountry(DEFAULT_COUNTRY);
      }
      setTargetRole(profile.targetRole ?? "");
      setYearsExperience(profile.yearsExperience !== null ? String(profile.yearsExperience) : "");
      setProfessionalSkills(profile.professionalSkills);
      setSoftSkills(profile.softSkills);
      setEmploymentType(profile.employmentType ?? "full_time");
      setExpectedSalaryMin(profile.expectedSalaryMin !== null ? String(profile.expectedSalaryMin) : "");
      setExpectedSalaryMax(profile.expectedSalaryMax !== null ? String(profile.expectedSalaryMax) : "");
      setBio(profile.bio ?? "");
      setLinkedinUrl(profile.linkedinUrl ?? "");
      setPortfolioUrl(profile.portfolioUrl ?? "");
      setGithubUrl(profile.githubUrl ?? "");
      setWorkExperiences(
        profile.workExperiences.map((entry) => ({
          id: newId(),
          company: entry.company,
          title: entry.title,
          startDate: entry.startDate,
          endDate: entry.endDate ?? "",
          isCurrent: entry.isCurrent,
          achievements: entry.achievements ? plainTextToHtml(entry.achievements) : "",
        })),
      );
      setEducation(
        profile.education.map((entry) => ({
          id: newId(),
          institution: entry.institution,
          fieldOfStudy: entry.fieldOfStudy ?? "",
          qualificationTier: entry.qualificationTier,
          cgpa: entry.cgpa ?? "",
          graduationYear: entry.graduationYear !== null ? String(entry.graduationYear) : "",
        })),
      );
      setCertifications(
        profile.certifications.map((entry) => ({
          id: newId(),
          name: entry.name,
          issuer: entry.issuer ?? "",
          year: entry.year !== null ? String(entry.year) : "",
          // A resume's text doesn't carry the actual certificate file.
          fileUrl: null,
          fileName: null,
          fileSize: null,
        })),
      );
      setLanguages(
        normalizeLanguageRows(
          profile.languages.map((entry) => ({
            id: newId(),
            language: entry.language,
            dialects: entry.dialects ?? [],
            spokenLevel: entry.spokenLevel,
            writtenLevel: entry.writtenLevel,
          })),
        ),
      );
      setReferences(
        profile.references.map((entry) => ({
          id: newId(),
          fullName: entry.fullName,
          jobTitle: entry.jobTitle ?? "",
          company: entry.company ?? "",
          phone: entry.phone ?? "",
          email: entry.email ?? "",
        })),
      );

      setResumeStatus(t("jobseekerOnboarding.replacedWithDetailsFromYourResume"));
      return;
    }

    if (profile.fullName) {
      setFullName((prev) => {
        if (prev.trim()) return prev;
        mark();
        return profile.fullName as string;
      });
    }
    // A date of birth on the resume fills in the age (the date isn't kept).
    const resumeAge = ageFromDate(profile.dateOfBirth);
    if (resumeAge !== null) {
      setAge((prev) => {
        if (prev.trim()) return prev;
        mark();
        return String(resumeAge);
      });
    }
    if (profile.gender) {
      setGender((prev) => {
        if (prev) return prev;
        mark();
        return profile.gender as (typeof GENDERS)[number]["value"];
      });
    }
    if (profile.maritalStatus) {
      setMaritalStatus((prev) => {
        if (prev) return prev;
        mark();
        return profile.maritalStatus as (typeof MARITAL_STATUSES)[number]["value"];
      });
    }
    if (profile.nationality) {
      setNationality((prev) => {
        if (prev.trim()) return prev;
        mark();
        return profile.nationality as string;
      });
    }
    if (profile.phone) {
      setPhone((prev) => {
        if (prev.trim()) return prev;
        mark();
        return profile.phone as string;
      });
    }
    if (profile.drivingLicense) {
      setDrivingLicense((prev) => {
        if (prev) return prev;
        mark();
        return profile.drivingLicense as (typeof DRIVING_LICENSES)[number]["value"];
      });
    }
    if (profile.location) {
      const guess = splitLocationGuess(profile.location);
      setCity((prev) => {
        if (prev.trim()) return prev;
        mark();
        setState((prevState) => prevState || guess.state);
        if (guess.country) setCountry(guess.country);
        return guess.city;
      });
      if ((guess.country ?? country) === DEFAULT_COUNTRY) matchResumePlace(guess);
    }
    if (profile.targetRole) {
      setTargetRole((prev) => {
        if (prev.trim()) return prev;
        mark();
        return profile.targetRole as string;
      });
    }
    if (profile.yearsExperience !== null) {
      setYearsExperience((prev) => {
        if (prev.trim()) return prev;
        mark();
        return String(profile.yearsExperience);
      });
    }
    if (profile.professionalSkills.length > 0) {
      setProfessionalSkills((prev) => {
        mark();
        return mergeSkillsCaseInsensitive(prev, profile.professionalSkills);
      });
    }
    if (profile.softSkills.length > 0) {
      setSoftSkills((prev) => {
        mark();
        return mergeSkillsCaseInsensitive(prev, profile.softSkills);
      });
    }
    if (profile.employmentType) {
      setEmploymentType(profile.employmentType);
      mark();
    }
    if (profile.expectedSalaryMin !== null) {
      setExpectedSalaryMin((prev) => {
        if (prev.trim()) return prev;
        mark();
        return String(profile.expectedSalaryMin);
      });
    }
    if (profile.expectedSalaryMax !== null) {
      setExpectedSalaryMax((prev) => {
        if (prev.trim()) return prev;
        mark();
        return String(profile.expectedSalaryMax);
      });
    }
    if (profile.bio) {
      setBio((prev) => {
        if (prev.trim()) return prev;
        mark();
        return profile.bio as string;
      });
    }
    if (profile.linkedinUrl) {
      setLinkedinUrl((prev) => {
        if (prev.trim()) return prev;
        mark();
        return profile.linkedinUrl as string;
      });
    }
    if (profile.portfolioUrl) {
      setPortfolioUrl((prev) => {
        if (prev.trim()) return prev;
        mark();
        return profile.portfolioUrl as string;
      });
    }
    if (profile.githubUrl) {
      setGithubUrl((prev) => {
        if (prev.trim()) return prev;
        mark();
        return profile.githubUrl as string;
      });
    }
    if (profile.workExperiences.length > 0) {
      setWorkExperiences((prev) => [
        ...prev,
        ...profile.workExperiences.map((entry) => ({
          id: newId(),
          company: entry.company,
          title: entry.title,
          startDate: entry.startDate,
          endDate: entry.endDate ?? "",
          isCurrent: entry.isCurrent,
          achievements: entry.achievements ? plainTextToHtml(entry.achievements) : "",
        })),
      ]);
      mark();
    }
    if (profile.education.length > 0) {
      setEducation((prev) => [
        ...prev,
        ...profile.education.map((entry) => ({
          id: newId(),
          institution: entry.institution,
          fieldOfStudy: entry.fieldOfStudy ?? "",
          qualificationTier: entry.qualificationTier,
          cgpa: entry.cgpa ?? "",
          graduationYear: entry.graduationYear !== null ? String(entry.graduationYear) : "",
        })),
      ]);
      mark();
    }
    if (profile.certifications.length > 0) {
      setCertifications((prev) => [
        ...prev,
        ...profile.certifications.map((entry) => ({
          id: newId(),
          name: entry.name,
          issuer: entry.issuer ?? "",
          year: entry.year !== null ? String(entry.year) : "",
          fileUrl: null,
          fileName: null,
          fileSize: null,
        })),
      ]);
      mark();
    }
    if (profile.languages.length > 0) {
      // A résumé's dialects join a language already listed, not a second row for it.
      setLanguages((prev) =>
        normalizeLanguageRows([
          ...prev,
          ...profile.languages.map((entry) => ({
            id: newId(),
            language: entry.language,
            dialects: entry.dialects ?? [],
            spokenLevel: entry.spokenLevel,
            writtenLevel: entry.writtenLevel,
          })),
        ]),
      );
      mark();
    }
    if (profile.references.length > 0) {
      setReferences((prev) => [
        ...prev,
        ...profile.references.map((entry) => ({
          id: newId(),
          fullName: entry.fullName,
          jobTitle: entry.jobTitle ?? "",
          company: entry.company ?? "",
          phone: entry.phone ?? "",
          email: entry.email ?? "",
        })),
      ]);
      mark();
    }

    setResumeStatus(
      filled > 0
        ? t("jobseekerOnboarding.filledFromResume")
        : t("jobseekerOnboarding.resumeTooThin"),
    );
  }

  function handleAvatarFile(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;

    if (!picked.type.startsWith("image/")) {
      setAvatarError(t("jobseekerOnboarding.chooseAnImageFile"));
      return;
    }
    if (picked.size > AVATAR_MAX_BYTES) {
      setAvatarError(t("jobseekerOnboarding.imageIsTooLargeMax3"));
      return;
    }

    setAvatarError(null);
    setAvatarIsAccountDefault(false);
    setAvatarIsFromResumeSuggestion(false);
    setAvatarLoadFailed(false);
    const reader = new FileReader();
    reader.onload = () => setAvatarUrl(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => setAvatarError(t("jobseekerOnboarding.couldntReadThatImage"));
    reader.readAsDataURL(picked);
  }

  function clearAvatar() {
    setAvatarUrl(null);
    setAvatarIsAccountDefault(false);
    setAvatarIsFromResumeSuggestion(false);
    setAvatarError(null);
    if (avatarInputRef.current) avatarInputRef.current.value = "";
  }

  function acceptSuggestedAvatar() {
    if (!suggestedAvatarUrl) return;
    setAvatarUrl(suggestedAvatarUrl);
    setAvatarIsAccountDefault(false);
    setAvatarIsFromResumeSuggestion(true);
    setAvatarLoadFailed(false);
    setSuggestedAvatarUrl(null);
  }

  function dismissSuggestedAvatar() {
    setSuggestedAvatarUrl(null);
  }

  function handleResumeFiles(files: FileList | null) {
    const picked = files?.[0];
    if (!picked) return;
    attachResumeFile(picked);
  }

  // Just attaches the file — parsing only starts when the user explicitly
  // clicks "Parse resume", never automatically on attach.
  function attachResumeFile(picked: File) {
    if (picked.size > RESUME_MAX_BYTES) {
      setResumeError(t("jobseekerOnboarding.fileIsTooLargeMax10"));
      setResumeFile(null);
      return;
    }

    resumeParseId.current++;
    setResumeError(null);
    setResumeStatus(null);
    setRestoredResume(null);
    setResumeFile(picked);
    setParseUsage(null);
    setParseDurationMs(null);
    setParseElapsedMs(0);
    setParsing(false);
    setSuggestedAvatarUrl(null);
  }

  async function parseResume(overwrite: boolean) {
    if (!resumeFile) return;
    setResumeError(null);
    setResumeStatus(null);
    setParseUsage(null);
    setParseDurationMs(null);
    setParseElapsedMs(0);
    setSuggestedAvatarUrl(null);
    setParsing(true);
    const requestId = ++resumeParseId.current;
    try {
      const data = await parseResumeMutation.mutateAsync({ resume: resumeFile });
      if (requestId !== resumeParseId.current) return;
      setParseUsage((data.usage as ParseUsage | undefined) ?? null);
      setParseDurationMs(typeof data.durationMs === "number" ? data.durationMs : null);
      if (typeof data.photoUrl === "string") setSuggestedAvatarUrl(data.photoUrl);
      applyParsedProfile(data.profile as ParsedProfile, overwrite);
    } catch (err) {
      if (requestId !== resumeParseId.current) return;
      setResumeError(err instanceof Error ? err.message : t("jobseekerOnboarding.couldntReadThatResume"));
    } finally {
      if (requestId === resumeParseId.current) setParsing(false);
    }
  }

  // Parsing only fills fields the user left empty and adds new work
  // experience/education/certification/language entries — it never
  // overwrites something already typed. Still, appending entries on top of
  // ones already entered by hand can come as a surprise, so anyone who's
  // already put real details into the form gets a heads-up and has to
  // confirm before the parse runs.
  function hasExistingDetails() {
    return Boolean(
      fullName.trim() ||
        location.trim() ||
        targetRole.trim() ||
        bio.trim() ||
        professionalSkills.length > 0 ||
        softSkills.length > 0 ||
        workExperiences.length > 0 ||
        education.length > 0 ||
        certifications.length > 0 ||
        languages.length > 0,
    );
  }

  function handleParseClick() {
    if (hasExistingDetails()) {
      setShowParseConfirm(true);
      return;
    }
    parseResume(false);
  }

  // Picks up a resume handed off from the landing page's ResumeUpload
  // (selected before the user had an account) so it's actually parsed here
  // instead of silently disappearing after signup.
  useEffect(() => {
    if (resumeFile || restoredResume) return;
    let raw: string | null = null;
    try {
      raw = sessionStorage.getItem(PENDING_RESUME_KEY);
      sessionStorage.removeItem(PENDING_RESUME_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    (async () => {
      try {
        const { name, type, dataUrl } = JSON.parse(raw as string) as {
          name: string;
          type: string;
          dataUrl: string;
        };
        const blob = await (await fetch(dataUrl)).blob();
        attachResumeFile(new File([blob], name, { type }));
      } catch {
        // Corrupt handoff payload — just leave the form blank for manual entry.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearResume() {
    resumeParseId.current++;
    setParsing(false);
    setResumeFile(null);
    setRestoredResume(null);
    setResumeError(null);
    setResumeStatus(null);
    setParseUsage(null);
    setParseDurationMs(null);
    setSuggestedAvatarUrl(null);
    if (resumeInputRef.current) resumeInputRef.current.value = "";
  }

  // A full start-over, like the employer form's Reset: the resume and every
  // field on the form — including anything typed by hand — back to how a new
  // account starts. Only the email (from the account) stays, and the photo
  // goes back to the account's Google picture.
  function resetResumeFields() {
    clearResume();
    setAvatarUrl(initialAvatarUrl ?? null);
    setAvatarIsAccountDefault(Boolean(initialAvatarUrl));
    setAvatarIsFromResumeSuggestion(false);
    setAvatarLoadFailed(false);
    setAvatarError(null);
    setFullName("");
    setAge("");
    setGender("");
    setMaritalStatus("");
    setNationality("");
    setPhone("");
    setDrivingLicense("");
    setHomePlace(null);
    setCountry(DEFAULT_COUNTRY);
    setTargetRole("");
    setPreferredIndustry("");
    setYearsExperience("");
    setYearsExperienceAuto(true);
    setProfessionalSkillInput("");
    setProfessionalSkills([]);
    setSoftSkillInput("");
    setSoftSkills([]);
    setOtherSkillInput("");
    setOtherSkills([]);
    setSkillSuggestions(null);
    setEmploymentType("full_time");
    setWorkArrangement("onsite");
    setWorkAuthorization("");
    setNoticePeriod("immediate");
    setWorkPlaceRows([{ id: newId(), place: null }]);
    setExpectedSalaryMin("");
    setExpectedSalaryMax("");
    setBio("");
    setLinkedinUrl("");
    setPortfolioUrl("");
    setGithubUrl("");
    setWorkExperiences([]);
    setEducation([]);
    setCertifications([]);
    setLanguages([]);
    setOtherLanguageRows(new Set());
    setReferences([]);
  }

  const formValid =
    fullName.trim().length > 0 &&
    parseAge(age) !== null &&
    city.trim().length > 0 &&
    (!inMalaysia || state.length > 0) &&
    targetRole.trim().length > 0 &&
    isNonNegativeInt(yearsExperience) &&
    professionalSkills.length > 0 &&
    isNonNegativeInt(expectedSalaryMin) &&
    isNonNegativeInt(expectedSalaryMax) &&
    Number(expectedSalaryMin) <= Number(expectedSalaryMax) &&
    preferredIndustry.length > 0 &&
    workAuthorization !== "" &&
    workPlacesDone &&
    isValidMalaysianPhone(phone) &&
    drivingLicense !== "";

  // Tells the jobseeker which required field(s) are blocking the disabled
  // Finish button — otherwise it just sits unclickable with no explanation.
  const salaryFilled = isNonNegativeInt(expectedSalaryMin) && isNonNegativeInt(expectedSalaryMax);
  const requiredFieldChecklist = [
    { label: t("jobseekerOnboarding.fullName"), done: fullName.trim().length > 0, fieldId: "fullName" },
    { label: t("jobseekerOnboarding.age"), done: parseAge(age) !== null, fieldId: "age" },
    { label: t("jobseekerOnboarding.phoneNumber"), done: isValidMalaysianPhone(phone), fieldId: "phone" },
    { label: t("jobseekerOnboarding.drivingLicense"), done: drivingLicense !== "", fieldId: "drivingLicense" },
    { label: t("jobseekerOnboarding.preferredWorkLocation"), done: workPlacesDone, fieldId: `workplace-${workPlaceRows[0]?.id ?? ""}` },
    { label: t("jobseekerOnboarding.location"), done: city.trim().length > 0 && (!inMalaysia || state.length > 0), fieldId: "city" },
    { label: t("jobseekerOnboarding.targetRole"), done: targetRole.trim().length > 0, fieldId: "targetRole" },
    { label: t("jobseekerOnboarding.yearsOfExperience"), done: isNonNegativeInt(yearsExperience), fieldId: "yearsExperience" },
    { label: t("jobseekerOnboarding.professionalSkills"), done: professionalSkills.length > 0, fieldId: "professionalSkillInput" },
    {
      label: t("jobseekerOnboarding.expectedSalary"),
      done: salaryFilled && Number(expectedSalaryMin) <= Number(expectedSalaryMax),
      fieldId: "expectedSalaryMin",
    },
    { label: t("jobseekerOnboarding.preferredIndustry"), done: preferredIndustry.length > 0, fieldId: "preferredIndustry" },
    { label: t("jobseekerOnboarding.workAuthorization"), done: workAuthorization !== "", fieldId: "workAuthorization" },
  ];

  function goToField(fieldId: string) {
    const el = document.getElementById(fieldId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  }

  // Not required to submit, but each one nudges the profile toward better
  // matches and a resume that actually stands out — friendly nudges, not
  // blockers, so this never touches formValid.
  const hasResume = Boolean(resumeFile || restoredResume);
  const boostChecklist = [
    {
      label: t("jobseekerOnboarding.profilePhoto"),
      done: Boolean(avatarUrl),
      fieldId: "avatarUploadButton",
    },
    // In edit mode the resume card lives in the dashboard sidebar (not on
    // this page), so there's no "resumeUploadCard" element to scroll to —
    // skip the nudge here rather than point at nothing.
    ...(mode === "edit"
      ? []
      : [
          {
            label: t("jobseekerOnboarding.resume"),
            done: hasResume,
            fieldId: "resumeUploadCard",
          },
        ]),
    {
      label: t("jobseekerOnboarding.softSkills"),
      done: softSkills.length > 0,
      fieldId: "softSkillInput",
    },
    {
      label: t("jobseekerOnboarding.shortBio"),
      done: bio.trim().length > 0,
      fieldId: "bio",
    },
    {
      label: t("jobseekerOnboarding.linkedin"),
      done: linkedinUrl.trim().length > 0,
      fieldId: "linkedinUrl",
    },
    {
      label: t("jobseekerOnboarding.portfolio"),
      done: portfolioUrl.trim().length > 0,
      fieldId: "portfolioUrl",
    },
    {
      label: t("jobseekerOnboarding.github"),
      done: githubUrl.trim().length > 0,
      fieldId: "githubUrl",
    },
    {
      label: t("jobseekerOnboarding.reference"),
      done: references.length > 0,
      fieldId: "referencesSection",
    },
  ];
  const boostChecklistRemaining = boostChecklist.filter((item) => !item.done).length;

  async function submitProfile(opts: { keepalive?: boolean } = {}): Promise<boolean> {
    setError(null);
    setSavedAt(null);
    setSubmitting(true);
    if (draftSaveTimeout.current) clearTimeout(draftSaveTimeout.current);
    try {
      // Only a freshly-picked File (this session) has actual bytes to
      // persist — a restored draft only ever kept the filename/size, not
      // the file itself (browser File objects don't survive a reload), so
      // resuming a draft without re-attaching still submits without one.
      let resumeUrl: string | null = null;
      try {
        resumeUrl = resumeFile ? await fileToDataUrl(resumeFile) : null;
      } catch {
        resumeUrl = null;
      }
      const resumeFileName = resumeFile?.name ?? restoredResume?.name ?? null;
      const resumeFileSize = resumeFile?.size ?? restoredResume?.size ?? null;

      await saveProfileMutation.mutateAsync({
          avatarUrl,
          fullName,
          resumeUrl,
          resumeFileName,
          resumeFileSize,
          age: parseAge(age),
          gender: gender || null,
          maritalStatus: maritalStatus || null,
          nationality: nationality.trim() || null,
          phone: phone.trim() || null,
          drivingLicense: drivingLicense || null,
          city,
          state,
          country,
          targetRole,
          preferredIndustry,
          yearsExperience: Number(yearsExperience),
          professionalSkills,
          softSkills,
          otherSkills,
          employmentType,
          expectedSalaryMin: Number(expectedSalaryMin),
          expectedSalaryMax: Number(expectedSalaryMax),
          bio: bio.trim() || null,
          linkedinUrl: linkedinUrl.trim() || null,
          portfolioUrl: portfolioUrl.trim() || null,
          githubUrl: githubUrl.trim() || null,
          noticePeriod,
          workArrangement,
          preferredWorkPlaces: pickedWorkPlaces,
          // Malaysia only; the server clears them for any other country.
          area: inMalaysia ? area : null,
          latitude: inMalaysia ? latitude : null,
          longitude: inMalaysia ? longitude : null,
          workAuthorization,
          workExperiences: workExperiences
            .filter((e) => e.company.trim() && e.title.trim() && e.startDate.trim())
            .map((e) => ({
              company: e.company.trim(),
              title: e.title.trim(),
              startDate: e.startDate.trim(),
              endDate: e.isCurrent ? null : e.endDate.trim() || null,
              isCurrent: e.isCurrent,
              achievements: e.achievements.trim() || null,
            })),
          education: education
            .filter((e) => e.institution.trim() && e.qualificationTier)
            .map((e) => ({
              institution: e.institution.trim(),
              fieldOfStudy: e.fieldOfStudy.trim() || null,
              qualificationTier: e.qualificationTier,
              cgpa: e.cgpa.trim() || null,
              graduationYear: e.graduationYear.trim() ? Number(e.graduationYear) : null,
            })),
          certifications: certifications
            .filter((c) => c.name.trim())
            .map((c) => ({
              name: c.name.trim(),
              issuer: c.issuer.trim() || null,
              year: c.year.trim() ? Number(c.year) : null,
              fileUrl: c.fileUrl,
              fileName: c.fileName,
              fileSize: c.fileSize,
            })),
          languages: languages
            .filter((l) => l.language.trim())
            .map((l) => ({
              language: l.language.trim(),
              dialects: l.dialects,
              spokenLevel: l.spokenLevel,
              writtenLevel: l.writtenLevel,
            })),
          references: references
            .filter((r) => r.fullName.trim())
            .map((r) => ({
              fullName: r.fullName.trim(),
              jobTitle: r.jobTitle.trim() || null,
              company: r.company.trim() || null,
              phone: r.phone.trim() || null,
              email: r.email.trim() || null,
            })),
      });
      if (mode === "edit") {
        setSavedAt(Date.now());
        initialProfileSnapshot.current = profileSnapshotValue;
        void queryClient.invalidateQueries({ queryKey: orpc.jobseeker.key() });
      } else {
        // No router.refresh() here: re-running the onboarding page now that
        // a profile exists redirects it to /jobseeker, bouncing the user to
        // the landing page before they ever see this success modal. The
        // modal's own buttons go to the dashboard, which loads fresh anyway.
        setShowFinishSuccess(true);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : t("jobseekerOnboarding.couldntSaveYourProfile"));
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  function handleFinishClick() {
    if (!hasResume) {
      setShowResumeWarning(true);
      return;
    }
    submitProfile();
  }

  return (
    <div
      className={`mx-auto flex w-full max-w-[1440px] flex-col gap-[20px] ${
        // Onboarding's three columns (no dashboard sidebar) wait for xl —
        // at lg the resume and checklist columns are too narrow.
        mode === "edit" ? "lg:flex-row lg:items-start" : "xl:flex-row xl:items-start"
      }`}
    >
      {mode !== "edit" && (
      <div className={`min-w-0 ${gradientFrameClass("gold")} xl:sticky xl:top-[22px] xl:flex-[1]`}>
        <div id="resumeUploadCard" className="min-w-0 rounded-[19px] bg-white p-[16px] sm:p-[22px] text-left">
          <h2 className="text-lg font-semibold text-[#141B2E]">{t("jobseekerOnboarding.uploadYourResume")}</h2>
          <p className="mt-[10px] text-sm leading-[20px] text-[#4B5468]">
            {t("jobseekerOnboarding.optionalWellAutofillTheFormOn")}
          </p>

          <input
            ref={resumeInputRef}
            type="file"
            accept={RESUME_ACCEPT}
            className="hidden"
            onChange={(e) => handleResumeFiles(e.target.files)}
          />

          {resumeFile ? (
            <div className="mt-[14px] flex items-center gap-[10px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[10px]">
              <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-white text-brand-gold-dark shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                <FileIcon className="h-[17px] w-[17px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-[#141B2E]">
                  {resumeFile.name}
                </p>
                <p className="text-xs text-[#9AA3B2]">
                  {parsing
                    ? t("jobseekerOnboarding.readingResume", { seconds: (parseElapsedMs / 1000).toFixed(1) })
                    : parseUsage
                      ? `${formatSize(resumeFile.size)} · ${t("jobseekerOnboarding.tokens", { tokens: parseUsage.total_tokens ?? "?" })} · ${(
                          (parseDurationMs ?? 0) / 1000
                        ).toFixed(1)}s`
                      : formatSize(resumeFile.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRemoveResumeConfirm(true)}
                aria-label={t("jobseekerOnboarding.removeResume")}
                disabled={parsing}
                className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.05] hover:text-[#141B2E] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <XIcon className="h-[12px] w-[12px]" />
              </button>
            </div>
          ) : restoredResume ? (
            <div className="mt-[14px] flex items-center gap-[10px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[10px]">
              <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full bg-white text-brand-gold-dark shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                <FileIcon className="h-[17px] w-[17px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-[#141B2E]">{restoredResume.name}</p>
                <p className="text-xs text-[#9AA3B2]">
                  {[
                    restoredResume.size > 0 ? formatSize(restoredResume.size) : null,
                    restoredResume.tokens ? t("jobseekerOnboarding.tokens", { tokens: restoredResume.tokens }) : null,
                    restoredResume.durationMs ? `${(restoredResume.durationMs / 1000).toFixed(1)}s` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || t("jobseekerOnboarding.uploadedEarlier")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRemoveResumeConfirm(true)}
                aria-label={t("jobseekerOnboarding.removeResume")}
                className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.05] hover:text-[#141B2E]"
              >
                <XIcon className="h-[12px] w-[12px]" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => resumeInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                handleResumeFiles(e.dataTransfer.files);
              }}
              className={`mt-[14px] flex w-full flex-col items-center justify-center gap-[6px] rounded-[14px] border border-dashed px-[16px] py-[18px] text-center transition-colors ${
                dragActive
                  ? "border-brand-gold-dark bg-brand-gold-soft"
                  : "border-[#D7DCE4] hover:border-brand-gold-dark hover:bg-[#F8FAFB]"
              }`}
            >
              <UploadIcon className="h-[18px] w-[18px] text-brand-gold-dark" />
              <span className="text-xs text-[#141B2E]">
                {t("jobseekerOnboarding.clickToUploadOrDragAnd")}
              </span>
              <span className="text-xs text-[#9AA3B2]">{t("jobseekerOnboarding.pdfOrDocxUpTo10")}</span>
            </button>
          )}

          {resumeFile && (parsing || !parseUsage) && (
            <button
              type="button"
              onClick={handleParseClick}
              data-db="onboarding.jobseeker.resume"
              disabled={parsing}
              className={`mt-[8px] flex h-[38px] w-full items-center justify-center gap-[6px] whitespace-nowrap rounded-[12px] bg-[linear-gradient(45deg,var(--color-brand-teal-dark),var(--color-brand-gold))] px-[14px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
                parsing ? "ai-fill-pulse" : ""
              }`}
            >
              <SiriOrb className="h-[14px] w-[14px]" active={parsing} />
              {parsing
                ? t("jobseekerOnboarding.readingResume", { seconds: (parseElapsedMs / 1000).toFixed(1) })
                : t("jobseekerOnboarding.parseResume")}
            </button>
          )}

          {/* A restored resume only has its filename/size on record — the
              actual bytes never survive a reload, so there's nothing to send
              to the parser until the user re-attaches the file. Only shown
              when it was never actually parsed (no token count on record) —
              once it has been, re-parsing isn't needed. */}
          {!resumeFile && restoredResume && restoredResume.tokens === null && (
            <button
              type="button"
              onClick={() => resumeInputRef.current?.click()}
              className="mt-[8px] flex h-[38px] w-full items-center justify-center gap-[6px] whitespace-nowrap rounded-[12px] bg-[linear-gradient(45deg,var(--color-brand-teal-dark),var(--color-brand-gold))] px-[14px] text-sm text-white transition-opacity hover:opacity-90"
            >
              <SiriOrb className="h-[14px] w-[14px]" active={false} />
              {t("jobseekerOnboarding.reUploadToParseThisResume")}
            </button>
          )}

          {(resumeFile || restoredResume) && (
            <button
              type="button"
              onClick={() => setShowResetResumeConfirm(true)}
              disabled={parsing}
              aria-label={t("jobseekerOnboarding.resetYourProfile")}
              className="mt-[8px] h-[38px] w-full whitespace-nowrap rounded-[12px] bg-[#F1F4F8] px-[14px] text-sm text-[#4B5468] hover:bg-black/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t("jobseekerOnboarding.reset")}
            </button>
          )}

          {resumeError && <p className="mt-[8px] text-xs text-red-500">{resumeError}</p>}
          {resumeStatus && !resumeError && (
            <p className="mt-[8px] text-xs text-brand-gold-dark">{resumeStatus}</p>
          )}
        </div>
      </div>
      )}

      <div className={`flex min-w-0 flex-col gap-[20px] ${mode === "edit" ? "lg:flex-1" : "xl:flex-[2]"}`}>
      {topSlot}
      <div className={`${mode === "edit" ? "animate-fade-in-up" : ""} ${gradientFrameClass("gold")}`}>
        <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px] text-left">
          <h1 className="text-xl font-semibold text-[#141B2E]">{t("jobseekerOnboarding.setUpYourProfile")}</h1>
          <p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">
            {t("jobseekerOnboarding.tellUsABitAboutYourself")}
          </p>
          {autosaveError && (
            <p className="mt-[6px] text-xs text-red-500">
              {t("jobseekerOnboarding.couldntSaveYourProgressCheckYour")}
            </p>
          )}

          <div className="mt-[16px] grid grid-cols-1 gap-x-[14px] gap-y-[12px] sm:grid-cols-2">
          <fieldset className="contents">
          <CategoryHeading label={t("jobseekerOnboarding.basicInfo")} first />
          <div className="col-span-full flex items-center gap-[14px]">
            <input
              ref={avatarInputRef}
              type="file"
              accept={AVATAR_ACCEPT}
              className="hidden"
              onChange={(e) => handleAvatarFile(e.target.files)}
            />
            {/* Wrapped so the "phone verified" tick can sit on the avatar's edge. */}
            <div className="relative shrink-0">
              <button
                id="avatarUploadButton"
                data-db="onboarding.jobseeker.avatar"
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                aria-label={avatarUrl ? t("jobseekerOnboarding.changeProfilePhoto") : t("jobseekerOnboarding.uploadProfilePhoto")}
                className="flex h-[64px] w-[64px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-black/[0.1] bg-[#F1F4F8] text-[#9AA3B2] hover:border-brand-gold-dark"
              >
                {avatarUrl && !avatarLoadFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    referrerPolicy="no-referrer"
                    alt={t("jobseekerOnboarding.profile")}
                    className="h-full w-full object-cover"
                    onError={() => setAvatarLoadFailed(true)}
                  />
                ) : (
                  <UserIcon className="h-[26px] w-[26px]" />
                )}
              </button>
              {phoneVerified && <PhoneVerifiedAvatarBadge />}
            </div>
            <div className="flex flex-col gap-[4px]">
              <div className="flex items-center gap-[10px]">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="rounded-full bg-[#F1F4F8] px-[12px] py-[6px] text-sm text-[#141B2E] hover:bg-black/[0.08]"
                >
                  {avatarUrl ? t("jobseekerOnboarding.changePhoto") : t("jobseekerOnboarding.uploadPhoto")}
                </button>
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={clearAvatar}
                    className="text-sm text-[#9AA3B2] hover:text-[#141B2E]"
                  >
                    {t("jobseekerOnboarding.remove")}
                  </button>
                )}
              </div>
              <p className={`text-xs ${avatarError ? "text-red-500" : "text-[#9AA3B2]"}`}>
                {avatarError ?? t("jobseekerOnboarding.photoHint")}
              </p>
            </div>
          </div>

          {suggestedAvatarUrl &&
            suggestedAvatarUrl !== avatarUrl &&
            (!avatarUrl || avatarIsAccountDefault || avatarIsFromResumeSuggestion) && (
            <div className="col-span-full flex items-center gap-[12px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[10px]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={suggestedAvatarUrl}
                referrerPolicy="no-referrer"
                alt={t("jobseekerOnboarding.photoFoundInResume")}
                className="h-[44px] w-[44px] shrink-0 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-[#141B2E]">{t("jobseekerOnboarding.foundAPhotoInYourResume")}</p>
                <p className="text-xs text-[#9AA3B2]">{t("jobseekerOnboarding.useItAsYourProfilePhoto")}</p>
              </div>
              <button
                type="button"
                onClick={acceptSuggestedAvatar}
                className="shrink-0 rounded-full bg-brand-gold px-[12px] py-[6px] text-sm text-[#141B2E] hover:opacity-90"
              >
                {t("jobseekerOnboarding.usePhoto")}
              </button>
              <button
                type="button"
                onClick={dismissSuggestedAvatar}
                aria-label={t("jobseekerOnboarding.dismissSuggestedPhoto")}
                className="flex h-[24px] w-[24px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.05] hover:text-[#141B2E]"
              >
                <XIcon className="h-[12px] w-[12px]" />
              </button>
            </div>
          )}

          <Field db="onboarding.jobseeker.fullName" required label={t("jobseekerOnboarding.fullName")} htmlFor="fullName">
            <input
              id="fullName"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("jobseekerOnboarding.eGNurAisyah")}
              className={inputClass}
            />
          </Field>
          <Field db="onboarding.jobseeker.age" required label={t("jobseekerOnboarding.age")} htmlFor="age">
            <input
              id="age"
              type="text"
              inputMode="numeric"
              maxLength={2}
              value={age}
              onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 2))}
              placeholder={t("jobseekerOnboarding.example", { value: "27" })}
              aria-invalid={age.trim() !== "" && parseAge(age) === null}
              className={`${inputClass} ${age.trim() !== "" && parseAge(age) === null ? "border-red-400" : ""}`}
            />
            {age.trim() !== "" && parseAge(age) === null && (
              <p className="text-xs text-red-500">
                {t("jobseekerOnboarding.ageRange", { min: MIN_AGE, max: MAX_AGE })}
              </p>
            )}
          </Field>
          <Field db="onboarding.jobseeker.gender" label={t("jobseekerOnboarding.genderOptional")} htmlFor="gender">
            <Dropdown
              id="gender"
              label={t("jobseekerOnboarding.gender")}
              value={gender}
              options={[{ value: "", label: t("jobseekerOnboarding.select") }, ...tOptions(GENDERS, "gender")]}
              onChange={setGender}
              accent="gold"
            />
          </Field>
          <Field db="onboarding.jobseeker.maritalStatus" label={t("jobseekerOnboarding.maritalStatusOptional")} htmlFor="maritalStatus">
            <Dropdown
              id="maritalStatus"
              label={t("jobseekerOnboarding.maritalStatus")}
              value={maritalStatus}
              options={[{ value: "", label: t("jobseekerOnboarding.select") }, ...tOptions(MARITAL_STATUSES, "maritalStatus")]}
              onChange={setMaritalStatus}
              accent="gold"
            />
          </Field>
          <Field db="onboarding.jobseeker.nationality" label={t("jobseekerOnboarding.nationalityOptional")} htmlFor="nationality">
            <Dropdown
              id="nationality"
              label={t("jobseekerOnboarding.nationality")}
              value={nationality}
              options={[{ value: "", label: t("jobseekerOnboarding.select") }, ...NATIONALITIES.map((n) => ({ value: n, label: n }))]}
              onChange={setNationality}
              accent="gold"
              searchable
              searchPlaceholder={t("jobseekerOnboarding.searchNationalities")}
            />
          </Field>
          {/* Required: jobs that need a licence check it, and a blank one
              reads as "no licence" — silently ruling them out. "None" is an option. */}
          <Field db="onboarding.jobseeker.drivingLicense" required label={t("jobseekerOnboarding.drivingLicense")} htmlFor="drivingLicense">
            <Dropdown
              id="drivingLicense"
              label={t("jobseekerOnboarding.drivingLicense")}
              value={drivingLicense}
              options={[{ value: "", label: t("jobseekerOnboarding.select") }, ...tOptions(DRIVING_LICENSES, "drivingLicense")]}
              onChange={setDrivingLicense}
              accent="gold"
            />
          </Field>
          {/* Email and phone run full width, like the employer's About you. */}
          <Field db="onboarding.jobseeker.email" label={t("jobseekerOnboarding.email")} htmlFor="accountEmail" className="col-span-full">
            <input
              id="accountEmail"
              type="email"
              value={accountEmail}
              disabled
              readOnly
              className={`${inputClass} cursor-not-allowed bg-[#F8FAFB] text-[#9AA3B2]`}
            />
          </Field>
          {/* Its own box: the number and its verification belong together.
              Framed with the jobseeker gradient, like the cards. */}
          <div className="col-span-full rounded-[14px] bg-gradient-to-br from-brand-gold via-white to-brand-gold p-px">
            <div className="rounded-[13px] bg-brand-gold-page p-[12px]">
              <PhoneInput
                required
                id="phone"
                db="onboarding.jobseeker.phone"
                label={t("jobseekerOnboarding.phoneNumber")}
                accent="gold"
                value={phone}
                onChange={setPhone}
                verifiable
                initialStatus={initialPhoneStatus}
                onVerifiedChange={setPhoneVerified}
              />
            </div>
          </div>
          {/* Where they're based: Country first, on its own row (it decides the
              field below, so changing it never wipes something filled in
              after it). In Malaysia, one search box for towns and areas
              ("Kota Damansara") — picking one fills the town, state, area and
              map coordinates together. Elsewhere the city is typed. */}
          <Field db="onboarding.jobseeker.location" required label={t("jobseekerOnboarding.country")} htmlFor="country" className="col-span-full">
            <Dropdown
              id="country"
              label={t("jobseekerOnboarding.country")}
              value={country}
              options={COUNTRIES.map((c) => ({ value: c as string, label: c as string }))}
              onChange={(value) => {
                if (value === country) return;
                // A place belongs to its country — start it over.
                setCountry(value);
                setHomePlace(null);
              }}
              accent="gold"
              searchable
              searchPlaceholder={t("jobseekerOnboarding.searchCountries")}
            />
          </Field>
          {inMalaysia ? (
            <Field db="onboarding.jobseeker.location" required label={t("jobseekerOnboarding.townOrArea")} htmlFor="city" className="col-span-full">
              <PlaceSearch id="city" label={t("jobseekerOnboarding.townOrArea")} value={homePlace} onChange={setHomePlace} accent="gold" />
              <p className="text-xs text-[#9AA3B2]">{t("jobseekerOnboarding.typeYourAreaOrTownE")}</p>
            </Field>
          ) : (
            <Field db="onboarding.jobseeker.location" required label={t("jobseekerOnboarding.city")} htmlFor="city" className="col-span-full">
              <input
                id="city"
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder={t("jobseekerOnboarding.eGSingapore")}
                className={inputClass}
              />
            </Field>
          )}
          <Field db="onboarding.jobseeker.targetRole" required label={t("jobseekerOnboarding.targetRole")} htmlFor="targetRole">
            <input
              id="targetRole"
              type="text"
              value={targetRole}
              onChange={(e) => setTargetRole(e.target.value)}
              placeholder={t("jobseekerOnboarding.eGGraphicDesigner")}
              className={inputClass}
            />
          </Field>
          <Field db="onboarding.jobseeker.preferredIndustry" required label={t("jobseekerOnboarding.preferredIndustry")} htmlFor="preferredIndustry">
            <Dropdown
              id="preferredIndustry"
              label={t("jobseekerOnboarding.preferredIndustry")}
              value={preferredIndustry}
              options={[
                { value: "" as const, label: t("jobseekerOnboarding.select") },
                ...INDUSTRIES.map((i) => ({ value: i, label: i })),
              ]}
              onChange={setPreferredIndustry}
              accent="gold"
              searchable
              searchPlaceholder={t("jobseekerOnboarding.searchIndustries")}
            />
          </Field>
          <Field db="onboarding.jobseeker.yearsExperience" required label={t("jobseekerOnboarding.yearsOfExperience")} htmlFor="yearsExperience">
            <input
              id="yearsExperience"
              type="number"
              min={0}
              step={1}
              value={yearsExperience}
              onChange={(e) => {
                setYearsExperienceAuto(false);
                setYearsExperience(e.target.value);
              }}
              placeholder={t("jobseekerOnboarding.example", { value: "3" })}
              className={inputClass}
            />
            {yearsExperienceAuto && workExperiences.length > 0 ? (
              <p className="text-xs text-[#9AA3B2]">{t("jobseekerOnboarding.autoCalculatedFromExperienceBackgroundBelow")}</p>
            ) : (
              !yearsExperienceAuto &&
              computeYearsFromWorkExperiences(workExperiences) !== null && (
                <button
                  type="button"
                  onClick={() => {
                    setYearsExperienceAuto(true);
                    const computed = computeYearsFromWorkExperiences(workExperiences);
                    if (computed !== null) setYearsExperience(String(computed));
                  }}
                  className="text-left text-xs text-brand-gold-dark hover:opacity-70"
                >
                  {t("jobseekerOnboarding.recalculateYears")}
                </button>
              )
            )}
          </Field>
          <div className={`col-span-full ${gradientFrameClass("gold")}`}>
            <div className="flex flex-col gap-[12px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
            <div className="flex items-center justify-between">
              <p className="text-lg font-semibold text-[#141B2E]">{t("jobseekerOnboarding.skills")}</p>
              <button
                type="button"
                onClick={suggestSkills}
                data-db="onboarding.jobseeker.skills"
                disabled={suggestingSkills}
                className={`flex h-[38px] shrink-0 items-center gap-[6px] whitespace-nowrap rounded-[12px] bg-[linear-gradient(45deg,var(--color-brand-teal-dark),var(--color-brand-gold))] px-[14px] text-sm text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 ${
                  suggestingSkills ? "ai-fill-pulse" : ""
                }`}
              >
                <SiriOrb className="h-[14px] w-[14px]" active={suggestingSkills} />
                {suggestingSkills
                  ? t("jobseekerOnboarding.suggesting", { seconds: (suggestSkillsElapsedMs / 1000).toFixed(1) })
                  : t("jobseekerOnboarding.suggestSkills")}
              </button>
            </div>
            {(suggestSkillsStatus || suggestSkillsError) && (
              <p className={`text-xs ${suggestSkillsError ? "text-red-500" : "text-brand-teal-dark"}`}>
                {suggestSkillsError ??
                  `${suggestSkillsStatus}${
                    suggestSkillsTokens || suggestSkillsDurationMs
                      ? ` (${[
                          suggestSkillsTokens ? t("jobseekerOnboarding.tokens", { tokens: suggestSkillsTokens }) : null,
                          suggestSkillsDurationMs ? `${(suggestSkillsDurationMs / 1000).toFixed(1)}s` : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")})`
                      : ""
                  }`}
              </p>
            )}

            <Field db="onboarding.jobseeker.skills" required label={t("jobseekerOnboarding.professionalSkillsToolsTechnologies")} htmlFor="professionalSkillInput">
              <input
                id="professionalSkillInput"
                type="text"
                value={professionalSkillInput}
                onChange={(e) => setProfessionalSkillInput(e.target.value)}
                onKeyDown={handleProfessionalSkillKeyDown}
                onBlur={addProfessionalSkill}
                placeholder={t("jobseekerOnboarding.eGPhotoshopFigmaSqlPress")}
                className={inputClass}
              />
              {professionalSkills.length > 0 && (
                <div className="mt-[10px] flex flex-wrap gap-[6px]">
                  {professionalSkills.map((skill) => (
                    <span
                      key={skill}
                      className="flex items-center gap-[6px] rounded-full bg-brand-gold py-[6px] pl-[12px] pr-[8px] text-xs text-[#141B2E]"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => removeProfessionalSkill(skill)}
                        aria-label={t("jobseekerOnboarding.removeItem", { item: skill })}
                        className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-[#141B2E]/60 hover:bg-black/[0.08] hover:text-[#141B2E]"
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
                      onClick={() => addSuggestedProfessionalSkill(skill)}
                      className="flex items-center gap-[4px] rounded-full border border-dashed border-black/[0.15] py-[6px] pl-[12px] pr-[10px] text-sm text-[#4B5468] hover:border-brand-gold-dark hover:text-brand-gold-dark"
                    >
                      <PlusIcon className="h-[8px] w-[8px]" />
                      {skill}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field db="onboarding.jobseeker.skills" label={t("jobseekerOnboarding.softSkillsWorkStyle")} htmlFor="softSkillInput">
              <input
                id="softSkillInput"
                type="text"
                value={softSkillInput}
                onChange={(e) => setSoftSkillInput(e.target.value)}
                onKeyDown={handleSoftSkillKeyDown}
                onBlur={addSoftSkill}
                placeholder={t("jobseekerOnboarding.eGTeamworkCommunicationPressEnter")}
                className={inputClass}
              />
              {softSkills.length > 0 && (
                <div className="mt-[10px] flex flex-wrap gap-[6px]">
                  {softSkills.map((skill) => (
                    <span
                      key={skill}
                      className="flex items-center gap-[6px] rounded-full bg-brand-gold py-[6px] pl-[12px] pr-[8px] text-xs text-[#141B2E]"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => removeSoftSkill(skill)}
                        aria-label={t("jobseekerOnboarding.removeItem", { item: skill })}
                        className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-[#141B2E]/60 hover:bg-black/[0.08] hover:text-[#141B2E]"
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
                      className="flex items-center gap-[4px] rounded-full border border-dashed border-black/[0.15] py-[6px] pl-[12px] pr-[10px] text-sm text-[#4B5468] hover:border-brand-gold-dark hover:text-brand-gold-dark"
                    >
                      <PlusIcon className="h-[8px] w-[8px]" />
                      {skill}
                    </button>
                  ))}
                </div>
              )}
            </Field>

            <Field db="onboarding.jobseeker.skills" label={t("jobseekerOnboarding.otherSkillsOptional")} htmlFor="otherSkillInput">
              <input
                id="otherSkillInput"
                type="text"
                value={otherSkillInput}
                onChange={(e) => setOtherSkillInput(e.target.value)}
                onKeyDown={handleOtherSkillKeyDown}
                onBlur={addOtherSkill}
                placeholder={t("jobseekerOnboarding.anythingElseRelevantNotCoreTo")}
                className={inputClass}
              />
              {otherSkills.length > 0 && (
                <div className="mt-[10px] flex flex-wrap gap-[6px]">
                  {otherSkills.map((skill) => (
                    <span
                      key={skill}
                      className="flex items-center gap-[6px] rounded-full bg-brand-gold py-[6px] pl-[12px] pr-[8px] text-xs text-[#141B2E]"
                    >
                      {skill}
                      <button
                        type="button"
                        onClick={() => removeOtherSkill(skill)}
                        aria-label={t("jobseekerOnboarding.removeItem", { item: skill })}
                        className="flex h-[16px] w-[16px] items-center justify-center rounded-full text-[#141B2E]/60 hover:bg-black/[0.08] hover:text-[#141B2E]"
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
          </fieldset>
          </div>
        </div>
      </div>

      <div className={gradientFrameClass("gold")}>
        <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px] text-left">
          <h1 className="text-xl font-semibold text-[#141B2E]">{t("jobseekerOnboarding.workPreferences")}</h1>
          <p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">
            {t("jobseekerOnboarding.salaryAvailabilityAndHowYouLike")}
          </p>

          <div className="mt-[16px] grid grid-cols-1 gap-x-[14px] gap-y-[12px] sm:grid-cols-2">
          <fieldset className="contents">
          <Field db="onboarding.jobseeker.employmentType" required label={t("jobseekerOnboarding.employmentType")} htmlFor="employmentType">
            <Dropdown
              id="employmentType"
              label={t("jobseekerOnboarding.employmentType")}
              value={employmentType}
              options={tOptions(EMPLOYMENT_TYPES, "employmentType")}
              onChange={setEmploymentType}
              accent="gold"
            />
          </Field>
          <Field db="onboarding.jobseeker.workArrangement" required label={t("jobseekerOnboarding.workArrangement")} htmlFor="workArrangement">
            <Dropdown
              id="workArrangement"
              label={t("jobseekerOnboarding.workArrangement")}
              value={workArrangement}
              options={tOptions(WORK_ARRANGEMENTS, "workArrangement")}
              onChange={setWorkArrangement}
              accent="gold"
            />
          </Field>
          <Field db="onboarding.jobseeker.salary" required label={t("jobseekerOnboarding.minSalaryRm")} htmlFor="expectedSalaryMin">
            <input
              id="expectedSalaryMin"
              type="number"
              min={0}
              step={1}
              value={expectedSalaryMin}
              onChange={(e) => setExpectedSalaryMin(e.target.value)}
              placeholder={t("jobseekerOnboarding.example", { value: "3000" })}
              className={inputClass}
            />
          </Field>
          <Field db="onboarding.jobseeker.salary" required label={t("jobseekerOnboarding.maxSalaryRm")} htmlFor="expectedSalaryMax">
            <input
              id="expectedSalaryMax"
              type="number"
              min={0}
              step={1}
              value={expectedSalaryMax}
              onChange={(e) => setExpectedSalaryMax(e.target.value)}
              placeholder={t("jobseekerOnboarding.example", { value: "4500" })}
              className={inputClass}
            />
          </Field>

          {/* Shown once there's a number to show — empty, it sat at RM0 and
              looked broken. */}
          {(expectedSalaryMin.trim() !== "" || expectedSalaryMax.trim() !== "") && (
            <SalaryRangeSlider
              min={Number(expectedSalaryMin) || 0}
              max={Number(expectedSalaryMax) || 0}
              onMinChange={(value) => setExpectedSalaryMin(String(value))}
              onMaxChange={(value) => setExpectedSalaryMax(String(value))}
            />
          )}

          <Field db="onboarding.jobseeker.workAuthorization" required label={t("jobseekerOnboarding.workAuthorization")} htmlFor="workAuthorization">
            <Dropdown
              id="workAuthorization"
              label={t("jobseekerOnboarding.workAuthorization")}
              value={workAuthorization}
              options={[{ value: "" as const, label: t("jobseekerOnboarding.select") }, ...tOptions(WORK_AUTHORIZATIONS, "workAuthorization")]}
              onChange={setWorkAuthorization}
              accent="gold"
            />
          </Field>
          <Field db="onboarding.jobseeker.noticePeriod" required label={t("jobseekerOnboarding.noticePeriod")} htmlFor="noticePeriod">
            <Dropdown
              id="noticePeriod"
              label={t("jobseekerOnboarding.noticePeriod")}
              value={noticePeriod}
              options={tOptions(NOTICE_PERIODS, "noticePeriod")}
              onChange={setNoticePeriod}
              accent="gold"
            />
          </Field>
          {/* Where they'd like to work: the same town-or-area search as their
              own location, one row per place. Compulsory: at least one, up to
              MAX_WORK_PLACES. */}
          <div id="preferredWorkPlaces" className="col-span-full flex flex-col gap-[8px]">
            {workPlaceRows.length < MAX_WORK_PLACES ? (
              <SectionHeader
                required
                label={t("jobseekerOnboarding.preferredWorkLocations")}
              db="onboarding.jobseeker.preferredWorkPlaces"
                onAdd={() => setWorkPlaceRows((rows) => [...rows, { id: newId(), place: null }])}
                addLabel={t("jobseekerOnboarding.add")}
              />
            ) : (
              <p className="text-xs text-[#4B5468]">
                Preferred work locations<span className="text-red-500"> *</span> · up to {MAX_WORK_PLACES}
              </p>
            )}
            {workPlaceRows.map((row) => {
              const takenElsewhere = workPlaceRows.filter((r) => r.id !== row.id && r.place).map((r) => formatPlace(r.place!));
              return (
                <div key={row.id} className={`grid items-start gap-[8px] ${workPlaceRows.length > 1 ? "grid-cols-[1fr_auto]" : "grid-cols-1"}`}>
                  <PlaceSearch
                    id={`workplace-${row.id}`}
                    label={t("jobseekerOnboarding.preferredWorkLocation")}
                    value={row.place}
                    onChange={(place) => setWorkPlaceRows((rows) => rows.map((r) => (r.id === row.id ? { ...r, place } : r)))}
                    accent="gold"
                    exclude={takenElsewhere}
                  />
                  {/* At least one row always stays (it's compulsory), so the
                      × only ever shows — and takes up a column — once there's
                      something else to fall back to. */}
                  {workPlaceRows.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setWorkPlaceRows((rows) => rows.filter((r) => r.id !== row.id))}
                      aria-label={t("jobseekerOnboarding.removeItem", { item: row.place ? formatPlace(row.place) : t("jobseekerOnboarding.thisLocation") })}
                      className="flex h-[38px] w-[30px] items-center justify-center rounded-full text-[#9AA3B2] hover:text-red-500"
                    >
                      <XIcon className="h-[11px] w-[11px]" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          </fieldset>
          </div>
        </div>
      </div>

      <div className={gradientFrameClass("gold")}>
        <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px] text-left">
          <h1 className="text-xl font-semibold text-[#141B2E]">{t("jobseekerOnboarding.experienceBackground")}</h1>
          <p className="mt-[6px] text-sm leading-[20px] text-[#4B5468]">
            {t("jobseekerOnboarding.addYourWorkHistoryEducationAnd")}
          </p>

          <div className="mt-[16px] grid grid-cols-1 gap-x-[14px] gap-y-[12px] sm:grid-cols-2">
          <fieldset className="contents">
          <CategoryHeading label={t("jobseekerOnboarding.aboutYou")} first />
          <Field db="onboarding.jobseeker.bio" label={t("jobseekerOnboarding.professionalSummaryOptional")} htmlFor="bio" className="col-span-full">
            <RichTextEditor
              id="bio"
              value={bio}
              onChange={setBio}
              placeholder={t("jobseekerOnboarding.aCoupleSentencesAboutYourExperience")}
              accent="gold"
            />
          </Field>

          <Field db="onboarding.jobseeker.links" label={t("jobseekerOnboarding.linkedinOptional")} htmlFor="linkedinUrl">
            <input
              id="linkedinUrl"
              type="url"
              value={linkedinUrl}
              onChange={(e) => setLinkedinUrl(e.target.value)}
              placeholder="https://linkedin.com/in/..."
              className={inputClass}
            />
          </Field>
          <Field db="onboarding.jobseeker.links" label={t("jobseekerOnboarding.portfolioLinkOptional")} htmlFor="portfolioUrl">
            <input
              id="portfolioUrl"
              type="url"
              value={portfolioUrl}
              onChange={(e) => setPortfolioUrl(e.target.value)}
              placeholder="https://..."
              className={inputClass}
            />
          </Field>
          <Field db="onboarding.jobseeker.links" label={t("jobseekerOnboarding.githubOptional")} htmlFor="githubUrl">
            <input
              id="githubUrl"
              type="url"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              placeholder="https://github.com/..."
              className={inputClass}
            />
          </Field>

          <div className="col-span-full mt-[6px] flex flex-col gap-[10px] border-t border-black/[0.06] pt-[14px]">
            <SectionHeader
              label={t("jobseekerOnboarding.workExperienceOptional")}
              db="onboarding.jobseeker.workExperiences"
              onAdd={() => setWorkExperiences((prev) => [...prev, newWorkExperience()])}
              addLabel={t("jobseekerOnboarding.add")}
            />
            {workExperiences.map((entry) => (
              <div key={entry.id} className={entryCardClass}>
                <div className="flex items-center justify-between gap-[8px]">
                  <div className="grid flex-1 grid-cols-2 gap-[8px]">
                    <input
                      type="text"
                      value={entry.title}
                      onChange={(e) => updateWorkExperience(entry.id, { title: e.target.value })}
                      placeholder={t("jobseekerOnboarding.jobTitle")}
                      className={inputClass}
                    />
                    <input
                      type="text"
                      value={entry.company}
                      onChange={(e) => updateWorkExperience(entry.id, { company: e.target.value })}
                      placeholder={t("jobseekerOnboarding.company")}
                      className={inputClass}
                    />
                  </div>
                  <EntryRemoveButton onClick={() => removeWorkExperience(entry.id)} />
                </div>
                <div className="grid grid-cols-2 gap-[8px]">
                  <MonthYearPicker
                    value={entry.startDate}
                    onChange={(value) => updateWorkExperience(entry.id, { startDate: value })}
                    accent="gold"
                  />
                  <MonthYearPicker
                    value={entry.endDate}
                    onChange={(value) => updateWorkExperience(entry.id, { endDate: value })}
                    disabled={entry.isCurrent}
                    accent="gold"
                  />
                </div>
                <label className="flex items-center gap-[8px] text-xs text-[#4B5468]">
                  <input
                    type="checkbox"
                    checked={entry.isCurrent}
                    onChange={(e) => updateWorkExperience(entry.id, { isCurrent: e.target.checked })}
                    className="h-[14px] w-[14px] accent-brand-gold-dark"
                  />
                  {t("jobseekerOnboarding.iCurrentlyWorkHere")}
                </label>
                <RichTextEditor
                  value={entry.achievements}
                  onChange={(html) => updateWorkExperience(entry.id, { achievements: html })}
                  placeholder={t("jobseekerOnboarding.keyAchievementsOptional")}
                  accent="gold"
                />
              </div>
            ))}
          </div>

          <div className="col-span-full mt-[6px] flex flex-col gap-[10px] border-t border-black/[0.06] pt-[14px]">
            <SectionHeader
              label={t("jobseekerOnboarding.educationOptional")}
              db="onboarding.jobseeker.education"
              onAdd={() => setEducation((prev) => [...prev, newEducation()])}
              addLabel={t("jobseekerOnboarding.add")}
            />
            {education.map((entry) => (
              <div key={entry.id} className={entryCardClass}>
                <div className="flex items-center justify-between gap-[8px]">
                  <input
                    type="text"
                    value={entry.institution}
                    onChange={(e) => updateEducation(entry.id, { institution: e.target.value })}
                    placeholder={t("jobseekerOnboarding.institution")}
                    className={inputClass}
                  />
                  <EntryRemoveButton onClick={() => removeEducation(entry.id)} />
                </div>
                <input
                  type="text"
                  value={entry.fieldOfStudy}
                  onChange={(e) => updateEducation(entry.id, { fieldOfStudy: e.target.value })}
                  placeholder={t("jobseekerOnboarding.fieldOfStudyOptional")}
                  className={inputClass}
                />
                <div className="grid grid-cols-2 gap-[8px]">
                  <Dropdown
                    label={t("jobseekerOnboarding.qualification")}
                    value={entry.qualificationTier}
                    options={tOptions(QUALIFICATION_TIERS, "qualification")}
                    onChange={(value) => updateEducation(entry.id, { qualificationTier: value })}
                    accent="gold"
                  />
                  <input
                    type="number"
                    value={entry.graduationYear}
                    onChange={(e) => updateEducation(entry.id, { graduationYear: e.target.value })}
                    placeholder={t("jobseekerOnboarding.gradYear")}
                    className={inputClass}
                  />
                </div>
                <input
                  type="text"
                  value={entry.cgpa}
                  onChange={(e) => updateEducation(entry.id, { cgpa: e.target.value })}
                  placeholder={t("jobseekerOnboarding.cgpaOptionalEG375")}
                  className={inputClass}
                />
              </div>
            ))}
          </div>

          <div className="col-span-full mt-[6px] flex flex-col gap-[10px] border-t border-black/[0.06] pt-[14px]">
            <SectionHeader
              label={t("jobseekerOnboarding.certificationsLicensesOptional")}
              db="onboarding.jobseeker.certifications"
              onAdd={() => setCertifications((prev) => [...prev, newCertification()])}
              addLabel={t("jobseekerOnboarding.add")}
            />
            {certifications.map((entry) => (
              <div key={entry.id} className={entryCardClass}>
                <div className="flex items-center justify-between gap-[8px]">
                  <input
                    type="text"
                    value={entry.name}
                    onChange={(e) => updateCertification(entry.id, { name: e.target.value })}
                    placeholder={t("jobseekerOnboarding.certificationName")}
                    className={inputClass}
                  />
                  <EntryRemoveButton onClick={() => removeCertification(entry.id)} />
                </div>
                <div className="grid grid-cols-2 gap-[8px]">
                  <input
                    type="text"
                    value={entry.issuer}
                    onChange={(e) => updateCertification(entry.id, { issuer: e.target.value })}
                    placeholder={t("jobseekerOnboarding.issuerOptional")}
                    className={inputClass}
                  />
                  <input
                    type="number"
                    value={entry.year}
                    onChange={(e) => updateCertification(entry.id, { year: e.target.value })}
                    placeholder={t("jobseekerOnboarding.year")}
                    className={inputClass}
                  />
                </div>
                {entry.fileUrl ? (
                  <div className="flex items-center gap-[10px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[10px]">
                    <span className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-full bg-white text-brand-gold-dark shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                      <FileIcon className="h-[15px] w-[15px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-[#141B2E]">{entry.fileName ?? t("jobseekerOnboarding.certificateFile")}</p>
                      {entry.fileSize != null && <p className="text-xs text-[#9AA3B2]">{formatSize(entry.fileSize)}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() => clearCertificationFile(entry.id)}
                      aria-label={t("jobseekerOnboarding.removeCertificateFile")}
                      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[#9AA3B2] hover:bg-black/[0.05] hover:text-[#141B2E]"
                    >
                      <XIcon className="h-[11px] w-[11px]" />
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      id={`cert-file-${entry.id}`}
                      type="file"
                      accept={CERTIFICATE_ACCEPT}
                      className="hidden"
                      onChange={(e) => {
                        void handleCertificationFile(entry.id, e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                    <label
                      htmlFor={`cert-file-${entry.id}`}
                      className="flex h-[38px] w-full cursor-pointer items-center justify-center gap-[6px] rounded-[12px] border border-dashed border-[#D7DCE4] text-xs text-[#4B5468] transition-colors hover:border-brand-gold-dark hover:bg-[#F8FAFB]"
                    >
                      <UploadIcon className="h-[12px] w-[12px] text-brand-gold-dark" />
                      {t("jobseekerOnboarding.uploadCertificateOptionalPdfOrImage")}
                    </label>
                  </>
                )}
                {certificationFileErrors[entry.id] && (
                  <p className="text-xs text-red-500">{certificationFileErrors[entry.id]}</p>
                )}
              </div>
            ))}
          </div>

          <div className="col-span-full mt-[6px] flex flex-col gap-[10px] border-t border-black/[0.06] pt-[14px]">
            <SectionHeader
              label={t("jobseekerOnboarding.languagesOptional")}
              db="onboarding.jobseeker.languages"
              onAdd={() => setLanguages((prev) => [...prev, newLanguage()])}
              addLabel={t("jobseekerOnboarding.add")}
            />
            {languages.map((entry) => (
              <div key={entry.id} className={entryCardClass}>
                <div className="flex items-center justify-between gap-[8px]">
                  {(() => {
                    // Picked from JobGiga's language list (so "BM" and
                    // "Bahasa Melayu" both become "Malay"), or typed via "Other".
                    // A row on "Other" stays there while it's being typed —
                    // even when the text so far matches a listed name — and
                    // only switches to the listed language on leaving the box.
                    const pick = otherLanguageRows.has(entry.id)
                      ? OTHER_LANGUAGE
                      : isListedLanguage(entry.language)
                        ? canonicalLanguage(entry.language)
                        : entry.language
                          ? OTHER_LANGUAGE
                          : "";
                    const dialects = languageDialects(entry.language);
                    return (
                      <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
                        <Dropdown
                          label={t("jobseekerOnboarding.language")}
                          value={pick}
                          accent="gold"
                          searchable
                          searchPlaceholder={t("jobseekerOnboarding.searchLanguages")}
                          options={[
                            { value: "", label: t("jobseekerOnboarding.chooseALanguage") },
                            ...LANGUAGE_OPTIONS.filter(
                              (o) =>
                                o.value === pick ||
                                !languages.some((l) => l.id !== entry.id && sameLanguage(l.language, o.value)),
                            ),
                            { value: OTHER_LANGUAGE, label: t("jobseekerOnboarding.otherTypeIt") },
                          ]}
                          onChange={(value) => {
                            if (value === OTHER_LANGUAGE) {
                              setOtherLanguageRows((prev) => new Set(prev).add(entry.id));
                              if (isListedLanguage(entry.language)) updateLanguage(entry.id, { language: "", dialects: [] });
                            } else {
                              setOtherLanguageRows((prev) => {
                                const next = new Set(prev);
                                next.delete(entry.id);
                                return next;
                              });
                              // Nearly every Chinese speaker in Malaysia speaks
                              // Mandarin — ticked to start with, easy to untick.
                              updateLanguage(entry.id, { language: value, dialects: value === "Chinese" ? ["Mandarin"] : [] });
                            }
                          }}
                        />
                        {pick === OTHER_LANGUAGE && (
                          <input
                            type="text"
                            value={entry.language}
                            onChange={(e) => updateLanguage(entry.id, { language: e.target.value })}
                            onBlur={() => {
                              if (!isListedLanguage(entry.language)) return;
                              const value = canonicalLanguage(entry.language);
                              setOtherLanguageRows((prev) => {
                                const next = new Set(prev);
                                next.delete(entry.id);
                                return next;
                              });
                              updateLanguage(entry.id, { language: value, dialects: value === "Chinese" ? ["Mandarin"] : [] });
                            }}
                            placeholder={t("jobseekerOnboarding.typeTheLanguage")}
                            className={inputClass}
                          />
                        )}
                        {dialects.length > 0 && (
                          <div>
                            <p className="text-xs text-[#4B5468]">{t("jobseekerOnboarding.dialectsYouSpeakOptional")}</p>
                            <div className="mt-[6px] flex flex-wrap gap-[6px]" role="group" aria-label={`${entry.language} dialects`}>
                              {dialects.map((dialect) => {
                                const on = entry.dialects.includes(dialect);
                                return (
                                  <button
                                    key={dialect}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() =>
                                      updateLanguage(entry.id, {
                                        dialects: on ? entry.dialects.filter((d) => d !== dialect) : [...entry.dialects, dialect],
                                      })
                                    }
                                    className={`flex items-center gap-[5px] rounded-full py-[5px] pl-[9px] pr-[11px] text-xs transition-colors ${
                                      on
                                        ? "bg-brand-gold-dark text-white"
                                        : "bg-white text-[#4B5468] ring-1 ring-black/[0.08] hover:text-[#141B2E]"
                                    }`}
                                  >
                                    {on ? <CheckIcon className="h-[9px] w-[9px]" /> : <PlusIcon className="h-[8px] w-[8px]" />}
                                    {dialect}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                  <EntryRemoveButton onClick={() => removeLanguage(entry.id)} />
                </div>
                <div className="grid grid-cols-2 gap-[8px]">
                  <div>
                    <p className="mb-[5px] text-xs text-[#9AA3B2]">{t("jobseekerOnboarding.spoken")}</p>
                    <Dropdown
                      label={t("jobseekerOnboarding.spokenLevel")}
                      value={entry.spokenLevel}
                      options={tOptions(LANGUAGE_LEVELS, "languageLevel")}
                      onChange={(value) => updateLanguage(entry.id, { spokenLevel: value })}
                      accent="gold"
                    />
                  </div>
                  <div>
                    <p className="mb-[5px] text-xs text-[#9AA3B2]">{t("jobseekerOnboarding.written")}</p>
                    <Dropdown
                      label={t("jobseekerOnboarding.writtenLevel")}
                      value={entry.writtenLevel}
                      options={tOptions(LANGUAGE_LEVELS, "languageLevel")}
                      onChange={(value) => updateLanguage(entry.id, { writtenLevel: value })}
                      accent="gold"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            id="referencesSection"
            className="col-span-full mt-[6px] flex flex-col gap-[10px] border-t border-black/[0.06] pt-[14px]"
          >
            <SectionHeader
              label={t("jobseekerOnboarding.referencesOptional")}
              db="onboarding.jobseeker.references"
              onAdd={() => setReferences((prev) => [...prev, newReference()])}
              addLabel={t("jobseekerOnboarding.add")}
            />
            {references.map((entry) => (
              <div key={entry.id} className={entryCardClass}>
                <div className="flex items-center justify-between gap-[8px]">
                  <input
                    type="text"
                    value={entry.fullName}
                    onChange={(e) => updateReference(entry.id, { fullName: e.target.value })}
                    placeholder={t("jobseekerOnboarding.fullName")}
                    className={inputClass}
                  />
                  <EntryRemoveButton onClick={() => removeReference(entry.id)} />
                </div>
                <div className="grid grid-cols-2 gap-[8px]">
                  <input
                    type="text"
                    value={entry.jobTitle}
                    onChange={(e) => updateReference(entry.id, { jobTitle: e.target.value })}
                    placeholder={t("jobseekerOnboarding.roleEGFormerManager")}
                    className={inputClass}
                  />
                  <input
                    type="text"
                    value={entry.company}
                    onChange={(e) => updateReference(entry.id, { company: e.target.value })}
                    placeholder={t("jobseekerOnboarding.companyOptional")}
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-[8px]">
                  <input
                    type="text"
                    value={entry.phone}
                    onChange={(e) => updateReference(entry.id, { phone: e.target.value })}
                    placeholder={t("jobseekerOnboarding.phoneOptional")}
                    className={inputClass}
                  />
                  <input
                    type="email"
                    value={entry.email}
                    onChange={(e) => updateReference(entry.id, { email: e.target.value })}
                    placeholder={t("jobseekerOnboarding.emailOptional")}
                    className={inputClass}
                  />
                </div>
              </div>
            ))}
          </div>
          </fieldset>
          </div>
        </div>
      </div>

      {/* Finish, with what's still missing right next to it — on a phone the
          checklist card is far below, so a greyed-out button alone would
          give no reason. Its own card, like the employer form's. */}
      <div className={`${mode === "edit" ? "animate-fade-in-up" : ""} ${gradientFrameClass("gold")}`}>
        <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px] text-left">
          {!formValid && (
            <div className="mb-[12px]">
              <p className="text-sm text-[#141B2E]">Still needed to {mode === "edit" ? "save" : "finish"}:</p>
              <div className="mt-[8px] flex flex-wrap gap-[6px]">
                {requiredFieldChecklist
                  .filter((item) => !item.done)
                  .map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => goToField(item.fieldId)}
                      className="rounded-full border border-[#E8C9C4] bg-[#FBF3F2] px-[10px] py-[4px] text-xs text-[#A66A61] hover:underline"
                    >
                      {item.label}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {error && <p className="mb-[8px] text-xs text-red-500">{error}</p>}

          <button
            type="button"
            disabled={!formValid || submitting}
            onClick={handleFinishClick}
            data-db="onboarding.jobseeker.finish"
            className="flex h-[38px] w-full items-center justify-center rounded-full bg-brand-gold text-sm text-[#141B2E] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? t("jobseekerOnboarding.saving") : saveLabel}
          </button>
          {savedAt && !error && <p className="mt-[8px] text-xs text-brand-gold-dark">{t("jobseekerOnboarding.saved")}</p>}
        </div>
      </div>
      </div>

      <div
        className={`flex flex-col gap-[16px] ${
          // In edit mode this page sits inside JobseekerDashboardShell, which
          // has its own sticky navbar (~85px tall) pinned above — top-[22px]
          // would tuck this column underneath it. Onboarding has no such
          // navbar, so it can sit right under the page's own top padding.
          mode === "edit" ? "lg:sticky lg:top-[85px] lg:w-[300px] lg:shrink-0" : "xl:sticky xl:top-[22px] xl:flex-[1]"
        }`}
      >
        <div
          className={
            formValid
              ? gradientFrameClass("gold")
              : "rounded-[20px] bg-gradient-to-br from-[#A66A61] via-white to-[#A66A61] p-px shadow-[0_1px_2px_rgba(0,0,0,0.04),0_16px_40px_-24px_rgba(20,27,46,0.2)]"
          }
        >
          <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
            <p className="flex items-center gap-[8px] text-left text-lg font-semibold text-[#141B2E]">
              {t("jobseekerOnboarding.required")}
              {formValid && <ChecklistDoneBadge />}
            </p>
            <ul className="mt-[16px] flex flex-col gap-[4px]">
              {requiredFieldChecklist.map(({ label, done, fieldId }) => (
                <li key={label}>
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

          <div className={gradientFrameClass("gold")}>
          <div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
            <p className="flex items-center gap-[8px] text-left text-lg font-semibold text-[#141B2E]">
              {t("jobseekerOnboarding.optional")}
              {boostChecklistRemaining === 0 && <ChecklistDoneBadge />}
            </p>
            <ul className="mt-[16px] flex flex-col gap-[4px]">
              {boostChecklist.map(({ label, done, fieldId }) => (
                <li key={label}>
                  <button
                    type="button"
                    disabled={done}
                    onClick={() => goToField(fieldId)}
                    className={`flex w-full items-center gap-[8px] text-left text-sm ${
                      done
                        ? "cursor-default text-[#1F7A3F]"
                        : "text-[#4B5468] hover:text-brand-gold-dark hover:underline"
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

      {showParseConfirm && (
        <Modal onClose={() => setShowParseConfirm(false)}>
          <>
            <h2 className="text-lg font-semibold text-[#141B2E]">{t("jobseekerOnboarding.youVeAlreadyFilledSomeOf")}</h2>
            <p className="mt-[10px] text-sm leading-[20px] text-[#4B5468]">
              {t("jobseekerOnboarding.parsingThisResumeWillReplaceThe")}
            </p>
            <div className="mt-[20px] flex flex-col gap-[8px]">
              <button
                type="button"
                onClick={() => {
                  setShowParseConfirm(false);
                  parseResume(true);
                }}
                className="flex h-[38px] items-center justify-center rounded-full bg-[linear-gradient(45deg,var(--color-brand-teal-dark),var(--color-brand-gold))] text-sm text-white transition-opacity hover:opacity-90"
              >
                {t("jobseekerOnboarding.overwriteWithThisResume")}
              </button>
              <button
                type="button"
                onClick={() => setShowParseConfirm(false)}
                className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03]"
              >
                {t("jobseekerOnboarding.cancel")}
              </button>
            </div>
          </>
        </Modal>
      )}

      {showRemoveResumeConfirm && (
        <Modal ariaLabel={t("jobseekerOnboarding.removeThisResume")} onClose={() => setShowRemoveResumeConfirm(false)}>
          <h2 className="text-lg font-semibold text-[#141B2E]">{t("jobseekerOnboarding.removeThisResume")}</h2>
          <p className="mt-[10px] text-sm leading-[20px] text-[#4B5468]">
            {t("jobseekerOnboarding.youllNeedToUploadItAgain")}
          </p>
          <div className="mt-[18px] flex flex-col gap-[8px]">
            <button
              type="button"
              onClick={() => {
                clearResume();
                setShowRemoveResumeConfirm(false);
              }}
              className="flex h-[38px] items-center justify-center rounded-full border border-red-200 text-sm text-red-500 hover:bg-red-50"
            >
              {t("jobseekerOnboarding.yesRemoveIt")}
            </button>
            <button
              type="button"
              onClick={() => setShowRemoveResumeConfirm(false)}
              className="flex h-[38px] items-center justify-center text-sm text-[#9AA3B2] hover:text-[#141B2E]"
            >
              {t("jobseekerOnboarding.keepIt")}
            </button>
          </div>
        </Modal>
      )}

      {showResetResumeConfirm && (
        <Modal ariaLabel={t("jobseekerOnboarding.resetYourProfile2")} onClose={() => setShowResetResumeConfirm(false)}>
          <h2 className="text-lg font-semibold text-[#141B2E]">{t("jobseekerOnboarding.resetYourProfile2")}</h2>
          <p className="mt-[10px] text-sm leading-[20px] text-[#4B5468]">
            {t("jobseekerOnboarding.thisClearsYourResumeAndEvery")}
          </p>
          <div className="mt-[18px] flex flex-col gap-[8px]">
            <button
              type="button"
              onClick={() => {
                resetResumeFields();
                setShowResetResumeConfirm(false);
              }}
              className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] text-sm text-red-500 hover:bg-red-50"
            >
              {t("jobseekerOnboarding.resetEverything")}
            </button>
            <button
              type="button"
              onClick={() => setShowResetResumeConfirm(false)}
              className="flex h-[38px] items-center justify-center text-sm text-[#9AA3B2] hover:text-[#141B2E]"
            >
              {t("jobseekerOnboarding.keepMyDetails")}
            </button>
          </div>
        </Modal>
      )}

      {showFinishSuccess && (
        <Modal
          ariaLabel={t("jobseekerOnboarding.profileComplete")}
          onClose={() => {
            setShowFinishSuccess(false);
            navigate({ to: "/jobseeker/dashboard" });
          }}
        >
          <h2 className="text-lg font-semibold text-[#141B2E]">{t("jobseekerOnboarding.youReAllSet")}</h2>
          <p className="mt-[10px] text-sm leading-[20px] text-[#4B5468]">
            {t("jobseekerOnboarding.thankYouSoMuchForTaking")}
          </p>
          <div className="mt-[20px] flex flex-col gap-[8px]">
            <button
              type="button"
              onClick={() => {
                setShowFinishSuccess(false);
                navigate({ to: "/jobseeker/dashboard" });
              }}
              className="flex h-[38px] items-center justify-center rounded-full bg-brand-gold text-sm text-[#141B2E] transition-opacity hover:opacity-90"
            >
              {t("jobseekerOnboarding.takeMeToMyDashboard")}
            </button>
          </div>
        </Modal>
      )}

      {showResumeWarning && (
        <Modal onClose={() => setShowResumeWarning(false)}>
          <>
            <h2 className="text-lg font-semibold text-[#141B2E]">{t("jobseekerOnboarding.oneMoreThingYourResume")}</h2>
            <p className="mt-[10px] text-sm leading-[20px] text-[#4B5468]">
              {t("jobseekerOnboarding.employersReallyDoJudgeAProfile")}
            </p>
            <div className="mt-[20px] flex flex-col gap-[8px]">
              <button
                type="button"
                onClick={() => {
                  setShowResumeWarning(false);
                  // Not wired up yet — just the entry point for now.
                }}
                className="flex h-[38px] items-center justify-center rounded-full bg-brand-gold text-sm text-[#141B2E] transition-opacity hover:opacity-90"
              >
                {t("jobseekerOnboarding.generateMyResumeViaJobgiga")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResumeWarning(false);
                  submitProfile();
                }}
                className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03]"
              >
                {t("jobseekerOnboarding.skipForNow")}
              </button>
            </div>
          </>
        </Modal>
      )}

      {showLeaveConfirm && (
        <Modal
          ariaLabel={t("jobseekerOnboarding.leaveWithoutSaving")}
          onClose={() => {
            setShowLeaveConfirm(false);
            setPendingProceed(null);
          }}
        >
          <h2 className="text-lg font-semibold text-[#141B2E]">{t("jobseekerOnboarding.leaveWithoutSaving")}</h2>
          <p className="mt-[10px] text-sm leading-[20px] text-[#4B5468]">
            {t("jobseekerOnboarding.youveMadeChangesToYourProfile")}
          </p>
          <div className="mt-[18px] flex flex-col gap-[8px]">
            <button
              type="button"
              disabled={submitting || !formValid}
              onClick={saveAndLeave}
              className="flex h-[38px] items-center justify-center rounded-full bg-brand-gold text-sm text-[#141B2E] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? t("jobseekerOnboarding.saving") : t("jobseekerOnboarding.saveChanges")}
            </button>
            <button
              type="button"
              onClick={discardAndLeave}
              className="flex h-[38px] items-center justify-center rounded-full border border-black/[0.1] text-sm text-red-500 hover:bg-red-50"
            >
              {t("jobseekerOnboarding.discardChanges")}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowLeaveConfirm(false);
                setPendingProceed(null);
              }}
              className="flex h-[38px] items-center justify-center text-sm text-[#9AA3B2] hover:text-[#141B2E]"
            >
              {t("jobseekerOnboarding.keepEditing")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
