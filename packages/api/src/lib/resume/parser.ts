// The redesign's src/lib/resume-parser.ts, ported: the same prompt, the same
// validation of what the AI sends back, PDF/.docx text extraction, and the
// MiMo call (via ../ai/provider-race, with a dev stub when no keys
// are set). Not ported: profile-photo extraction from the resume — it needs
// `sharp`, a native library that can't run on Cloudflare Workers (backend
// portability rule #7). `photoUrl` is always null until that moves to a
// background job.
import { normalizeSpokenLanguages } from "../../shared/languages";
import { type ProviderRaceAttempt, type ProviderUsage, raceChatProviders } from "../ai/provider-race";
import { extractResumeText } from "./extract-text";

export const RESUME_MAX_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 15000;

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "freelance", "temporary"] as const;
export const QUALIFICATION_TIERS = ["SPM", "STPM", "Diploma", "Degree", "Master", "PhD", "Other"] as const;
export const LANGUAGE_LEVELS = ["basic", "conversational", "fluent", "native"] as const;
export const GENDERS = ["male", "female", "other", "prefer_not_to_say"] as const;
export const MARITAL_STATUSES = ["single", "married", "divorced", "widowed", "prefer_not_to_say"] as const;
export const DRIVING_LICENSES = ["none", "b2", "b", "d", "da", "e"] as const;

const SYSTEM_PROMPT = `You extract structured profile data from a resume's text for a Malaysian job platform. Respond with ONLY a json object, no prose, matching exactly this shape:
{
  "fullName": string | null,
  "dateOfBirth": string | null,
  "gender": ${GENDERS.map((g) => `"${g}"`).join(" | ")} | null,
  "maritalStatus": ${MARITAL_STATUSES.map((m) => `"${m}"`).join(" | ")} | null,
  "nationality": string | null,
  "phone": string | null,
  "drivingLicense": ${DRIVING_LICENSES.map((d) => `"${d}"`).join(" | ")} | null,
  "location": string | null,
  "targetRole": string | null,
  "yearsExperience": number | null,
  "professionalSkills": string[],
  "softSkills": string[],
  "employmentType": "full_time" | "part_time" | "contract" | "internship" | "freelance" | "temporary" | null,
  "expectedSalaryMin": number | null,
  "expectedSalaryMax": number | null,
  "bio": string | null,
  "linkedinUrl": string | null,
  "portfolioUrl": string | null,
  "githubUrl": string | null,
  "workExperiences": { "company": string, "title": string, "startDate": string, "endDate": string | null, "isCurrent": boolean, "achievements": string | null }[],
  "education": { "institution": string, "fieldOfStudy": string | null, "qualificationTier": ${QUALIFICATION_TIERS.map((t) => `"${t}"`).join(" | ")}, "cgpa": string | null, "graduationYear": number | null }[],
  "certifications": { "name": string, "issuer": string | null, "year": number | null }[],
  "languages": { "language": string, "spokenLevel": ${LANGUAGE_LEVELS.map((l) => `"${l}"`).join(" | ")}, "writtenLevel": ${LANGUAGE_LEVELS.map((l) => `"${l}"`).join(" | ")} }[],
  "references": { "fullName": string, "jobTitle": string | null, "company": string | null, "phone": string | null, "email": string | null }[]
}
Use null for anything you cannot determine from the text. Never invent data. Array fields default to an empty array if none are found. "references" are professional references explicitly listed on the resume (e.g. under a "References" heading) — never invent one, and never treat a listed work-experience contact/supervisor as a reference unless the resume itself presents them as a reference; a resume that just says "References available upon request" with no actual names yields an empty array. "professionalSkills" are hard/technical skills, tools, and technologies (e.g. "Photoshop", "SQL", "Project Management"). "softSkills" are work-style/interpersonal skills (e.g. "Teamwork", "Communication", "Problem Solving") — only include one if the resume actually states or clearly demonstrates it, don't pad the list generically. "targetRole" is the role this person is likely seeking next, inferred from their most recent title/experience. "bio" is a 1-3 sentence professional summary written from the resume content, or null if there isn't enough to summarize. "startDate"/"endDate" should use whatever granularity the resume gives (e.g. "Jan 2022" or "2022"); "endDate" is null when "isCurrent" is true. "qualificationTier" must be the closest match from the given list based on the highest/most relevant qualification in that entry. "cgpa" is the exact grade/CGPA as written on the resume (e.g. "3.75", "3.75/4.00", "First Class Honours"), or null if not stated. "dateOfBirth" must be a full "YYYY-MM-DD" date only if the resume states one explicitly — never derive it from a stated age alone. "gender" and "maritalStatus" are only filled when stated explicitly on the resume (common on Malaysian-style CVs), never guessed from a name. "phone" is the contact phone number as written. "drivingLicense" is the closest matching class from the list when the resume states one (e.g. "own transport, license D" -> "d"); use "none" only when the resume explicitly says no license, otherwise null.`;

export type ParsedWorkExperience = {
  company: string;
  title: string;
  startDate: string;
  endDate: string | null;
  isCurrent: boolean;
  achievements: string | null;
};

export type ParsedEducation = {
  institution: string;
  fieldOfStudy: string | null;
  qualificationTier: (typeof QUALIFICATION_TIERS)[number];
  cgpa: string | null;
  graduationYear: number | null;
};

export type ParsedCertification = {
  name: string;
  issuer: string | null;
  year: number | null;
};

export type ParsedReference = {
  fullName: string;
  jobTitle: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
};

export type ParsedLanguage = {
  language: string;
  // Dialects named on the résumé ("Hokkien" → Chinese with Hokkien).
  dialects: string[];
  spokenLevel: (typeof LANGUAGE_LEVELS)[number];
  writtenLevel: (typeof LANGUAGE_LEVELS)[number];
};

export type ParsedProfile = {
  fullName: string | null;
  dateOfBirth: string | null;
  gender: (typeof GENDERS)[number] | null;
  maritalStatus: (typeof MARITAL_STATUSES)[number] | null;
  nationality: string | null;
  phone: string | null;
  drivingLicense: (typeof DRIVING_LICENSES)[number] | null;
  location: string | null;
  targetRole: string | null;
  yearsExperience: number | null;
  professionalSkills: string[];
  softSkills: string[];
  employmentType: (typeof EMPLOYMENT_TYPES)[number] | null;
  expectedSalaryMin: number | null;
  expectedSalaryMax: number | null;
  bio: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  githubUrl: string | null;
  workExperiences: ParsedWorkExperience[];
  education: ParsedEducation[];
  certifications: ParsedCertification[];
  languages: ParsedLanguage[];
  references: ParsedReference[];
};

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nullableBool(value: unknown): boolean {
  return value === true;
}

function nullableEnum<T extends string>(value: unknown, options: readonly T[]): T | null {
  return typeof value === "string" && (options as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

const DATE_OF_BIRTH_RE = /^\d{4}-\d{2}-\d{2}$/;

function nullableDateOfBirth(value: unknown): string | null {
  return typeof value === "string" && DATE_OF_BIRTH_RE.test(value) ? value : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function nullableEmail(value: unknown): string | null {
  return typeof value === "string" && EMAIL_RE.test(value.trim()) ? value.trim().toLowerCase() : null;
}

function parseWorkExperiences(value: unknown): ParsedWorkExperience[] {
  if (!Array.isArray(value)) return [];
  const entries: ParsedWorkExperience[] = [];
  for (const raw of value) {
    const obj = (raw ?? {}) as Record<string, unknown>;
    const company = nullableString(obj.company);
    const title = nullableString(obj.title);
    const startDate = nullableString(obj.startDate);
    if (!company || !title || !startDate) continue;
    entries.push({
      company,
      title,
      startDate,
      endDate: nullableString(obj.endDate),
      isCurrent: nullableBool(obj.isCurrent),
      achievements: nullableString(obj.achievements),
    });
  }
  return entries;
}

function parseEducation(value: unknown): ParsedEducation[] {
  if (!Array.isArray(value)) return [];
  const entries: ParsedEducation[] = [];
  for (const raw of value) {
    const obj = (raw ?? {}) as Record<string, unknown>;
    const institution = nullableString(obj.institution);
    const qualificationTier =
      typeof obj.qualificationTier === "string" &&
      (QUALIFICATION_TIERS as readonly string[]).includes(obj.qualificationTier)
        ? (obj.qualificationTier as (typeof QUALIFICATION_TIERS)[number])
        : null;
    if (!institution || !qualificationTier) continue;
    entries.push({
      institution,
      fieldOfStudy: nullableString(obj.fieldOfStudy),
      qualificationTier,
      cgpa: nullableString(obj.cgpa),
      graduationYear: nullableNumber(obj.graduationYear),
    });
  }
  return entries;
}

function parseCertifications(value: unknown): ParsedCertification[] {
  if (!Array.isArray(value)) return [];
  const entries: ParsedCertification[] = [];
  for (const raw of value) {
    const obj = (raw ?? {}) as Record<string, unknown>;
    const name = nullableString(obj.name);
    if (!name) continue;
    entries.push({ name, issuer: nullableString(obj.issuer), year: nullableNumber(obj.year) });
  }
  return entries;
}

function parseReferences(value: unknown): ParsedReference[] {
  if (!Array.isArray(value)) return [];
  const entries: ParsedReference[] = [];
  for (const raw of value) {
    const obj = (raw ?? {}) as Record<string, unknown>;
    const fullName = nullableString(obj.fullName);
    if (!fullName) continue;
    entries.push({
      fullName,
      jobTitle: nullableString(obj.jobTitle),
      company: nullableString(obj.company),
      phone: nullableString(obj.phone),
      email: nullableEmail(obj.email),
    });
  }
  return entries;
}

function parseLanguages(value: unknown): ParsedLanguage[] {
  if (!Array.isArray(value)) return [];
  const entries: ParsedLanguage[] = [];
  for (const raw of value) {
    const obj = (raw ?? {}) as Record<string, unknown>;
    const language = nullableString(obj.language);
    const spokenLevel =
      typeof obj.spokenLevel === "string" && (LANGUAGE_LEVELS as readonly string[]).includes(obj.spokenLevel)
        ? (obj.spokenLevel as (typeof LANGUAGE_LEVELS)[number])
        : null;
    const writtenLevel =
      typeof obj.writtenLevel === "string" && (LANGUAGE_LEVELS as readonly string[]).includes(obj.writtenLevel)
        ? (obj.writtenLevel as (typeof LANGUAGE_LEVELS)[number])
        : null;
    if (!language || !spokenLevel || !writtenLevel) continue;
    entries.push({ language, dialects: [], spokenLevel, writtenLevel });
  }
  // Merges e.g. separate "Mandarin" and "Hokkien" lines into Chinese with both.
  return normalizeSpokenLanguages(entries);
}

export function validateParsedProfile(raw: unknown): ParsedProfile {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const employmentType =
    typeof obj.employmentType === "string" &&
    (EMPLOYMENT_TYPES as readonly string[]).includes(obj.employmentType)
      ? (obj.employmentType as (typeof EMPLOYMENT_TYPES)[number])
      : null;

  return {
    fullName: nullableString(obj.fullName),
    dateOfBirth: nullableDateOfBirth(obj.dateOfBirth),
    gender: nullableEnum(obj.gender, GENDERS),
    maritalStatus: nullableEnum(obj.maritalStatus, MARITAL_STATUSES),
    nationality: nullableString(obj.nationality),
    phone: nullableString(obj.phone),
    drivingLicense: nullableEnum(obj.drivingLicense, DRIVING_LICENSES),
    location: nullableString(obj.location),
    targetRole: nullableString(obj.targetRole),
    yearsExperience: nullableNumber(obj.yearsExperience),
    professionalSkills: Array.isArray(obj.professionalSkills)
      ? obj.professionalSkills.filter((s): s is string => typeof s === "string")
      : [],
    softSkills: Array.isArray(obj.softSkills)
      ? obj.softSkills.filter((s): s is string => typeof s === "string")
      : [],
    employmentType,
    bio: nullableString(obj.bio),
    linkedinUrl: nullableString(obj.linkedinUrl),
    portfolioUrl: nullableString(obj.portfolioUrl),
    githubUrl: nullableString(obj.githubUrl),
    workExperiences: parseWorkExperiences(obj.workExperiences),
    education: parseEducation(obj.education),
    certifications: parseCertifications(obj.certifications),
    languages: parseLanguages(obj.languages),
    references: parseReferences(obj.references),
    expectedSalaryMin: nullableNumber(obj.expectedSalaryMin),
    expectedSalaryMax: nullableNumber(obj.expectedSalaryMax),
  };
}

export function isSupportedResumeFileName(fileName: string): boolean {
  const name = fileName.toLowerCase();
  return name.endsWith(".pdf") || name.endsWith(".docx");
}

export type ResumeParseResult =
  | {
      ok: true;
      profile: ParsedProfile;
      usage: ProviderUsage | null;
      provider: string;
      model: string;
      durationMs: number;
      photoUrl: string | null;
      attempts: Promise<ProviderRaceAttempt>[];
    }
  | { ok: false; error: string; status: number };

// Dev stub (no MiMo key): the resume's first line as the name, the
// rest left empty for the person to fill in — enough to try the flow locally.
function devStubProfile(text: string): string {
  const firstLine = text.split("\n").map((l) => l.trim()).find(Boolean) ?? null;
  return JSON.stringify({
    fullName: firstLine && firstLine.length <= 80 ? firstLine : null,
    professionalSkills: [],
    softSkills: [],
    workExperiences: [],
    education: [],
    certifications: [],
    languages: [],
    references: [],
  });
}

export async function parseResumeBytes(
  bytes: Uint8Array,
  fileName: string,
  keys: { mimoKey: string | null },
): Promise<ResumeParseResult> {
  let text: string;
  try {
    text = (await extractResumeText(bytes, fileName)).trim();
  } catch (err) {
    console.error("resume extractText failed:", err);
    return { ok: false, error: "Couldn't read that file. Try a different resume or fill in manually.", status: 400 };
  }

  if (!text) {
    return {
      ok: false,
      error: "Couldn't find any text in that file. Try a different resume or fill in manually.",
      status: 400,
    };
  }

  const startedAt = Date.now();
  const attempts: Promise<ProviderRaceAttempt>[] = [];
  const result = await raceChatProviders({
    systemPrompt: SYSTEM_PROMPT,
    userContent: text.slice(0, MAX_TEXT_CHARS),
    mimoKey: keys.mimoKey,
    temperature: 0,
    maxTokens: 2000,
    taskLabel: "resume parsing",
    notConfiguredError: "Resume parsing is not configured.",
    collectedAttempts: attempts,
    devStub: () => devStubProfile(text),
  });
  const durationMs = Date.now() - startedAt;
  if (!result.ok) return { ok: false, error: result.error, status: result.status };

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.content);
  } catch {
    return { ok: false, error: "Couldn't read that resume. Try filling in manually.", status: 502 };
  }

  return {
    ok: true,
    profile: validateParsedProfile(parsed),
    usage: result.usage,
    provider: result.provider,
    model: result.model,
    durationMs,
    photoUrl: null,
    attempts,
  };
}
