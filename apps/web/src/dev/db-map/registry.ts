import { FIELD_MAP, type FieldKind } from "./field-data";
import { ONBOARDING } from "./onboarding";

// Development-only: what each `data-db="…"` element on the pages maps to.
// Most keys are database fields; "about.page" compares v3's About pages with
// v1's About page.
// A key like "job.title" is looked up in the field map (v3 table . v3 field,
// or the redesign's field name for data v1 keeps in another table). Buttons
// and values that aren't a single field are listed in ACTIONS below.

export interface DbMapEntry {
  kind: FieldKind;
  /** Where v1 (and so v3) keeps it. */
  v1: string;
  /** Where the redesign keeps it. */
  v2: string;
  /** The v1 API call (oRPC procedure) that reads or writes it, if any. */
  api?: string;
  note?: string;
  /** Where v3 actually saves it today (onboarding fields). */
  v3?: string;
  /** The v3 API call (oRPC procedure) that saves it. */
  v3Api?: string;
  /** A page compared with v1's page, not a database field. */
  page?: boolean;
}

// Pages that hold no database data, compared with v1's own page. Shown on
// the navbar link to the page, so the page itself stays clean.
const PAGE_SECTIONS: Record<string, DbMapEntry> = {
  "about.page": {
    page: true,
    kind: "shape",
    v1: "/about-us: one page for everyone. Hero (\"JobGiga is a digital workforce platform…\"), 6 feature cards mostly about hiring, and an FAQ with 4 questions. English only.",
    v2: "/employer/about and /jobseeker/about: one per side. Hero, walkthrough video, 3 \"what we believe\" cards, 6 features for that side, and \"Made for Malaysia\". English and Malay.",
    note: "Missing in v3: v1's FAQ (4 questions: what JobGiga is, is it free for job seekers, how to get started, is my data safe).",
  },
  // Footer company links. None of these pages store anything in the database.
  "page.releaseNotes": {
    page: true,
    kind: "shape",
    v1: "/release-notes: one page, searchable and grouped by month. The notes are written in code (src/content/release-notes).",
    v2: "/employer/release-notes and /jobseeker/release-notes: one per side, ported from the redesign. Cards by release (month, title, points), in English and Malay.",
    note: "Neither stores release notes in the database: v1 keeps them in code, v3 in src/content/release-notes.ts with the text in the translation files.",
  },
  "page.privacy": {
    page: true,
    kind: "shape",
    v1: "/data-privacy-guide: the Personal Data Protection Notice (PDPA 2010), written as a Markdown file (src/content/pdpa.md).",
    v2: "/employer/privacy and /jobseeker/privacy: the Privacy Policy, ported from the redesign, in English and Malay.",
    note: "Draft text, not reviewed by a lawyer. Check it covers v1's PDPA notice before launch.",
  },
  "page.security": {
    page: true,
    kind: "v2",
    v1: "— (v1 has no security page)",
    v2: "/employer/security and /jobseeker/security: how accounts and data are protected, ported from the redesign, in English and Malay.",
  },
  "page.terms": {
    page: true,
    kind: "shape",
    v1: "/subscription-terms: terms for paid plans and billing only. v1 has no general terms page.",
    v2: "/employer/terms and /jobseeker/terms: general Terms & Conditions, ported from the redesign, in English and Malay.",
    note: "Different scope: v1's are billing terms; v3's are general terms of use. Draft text, not reviewed by a lawyer.",
  },
};

const ACTIONS: Record<string, DbMapEntry> = {
  "job.salary": {
    kind: "shape",
    v1: "job.salaryMin · job.salaryMax · job.salaryTypeId",
    v2: "job_postings.salaryMin · salaryMax · salaryPeriod",
    api: "job.list",
    note: "Min and max are the same; the pay period is a lookup ID in v1 and text in the redesign.",
  },
  "job.activeCount": {
    kind: "both",
    v1: "count of job rows (status active)",
    v2: "count of job_postings rows (status active)",
    api: "job.listCount",
    note: "Worked out from jobs, not stored.",
  },
  "search.jobs": {
    kind: "both",
    v1: "job.title · job.description",
    v2: "job_postings.title · description",
    api: "job.list",
    note: "Keyword search over jobs.",
  },
  "ads.job": {
    kind: "shape",
    v1: "ads + ad_requests (adType = job)",
    v2: "job_ads",
    api: "ads.listLandingPageAds",
    note: "v1 keeps one ad request table for both kinds; the redesign splits job ads and company ads.",
  },
  "ads.company": {
    kind: "shape",
    v1: "ads + ad_requests (adType = company)",
    v2: "company_ads",
    api: "ads.listLandingPageAds",
  },
  "ads.headline": {
    kind: "shape",
    v1: "ad_requests.adTagline",
    v2: "company_ads.headline",
  },
  "ads.media": {
    kind: "shape",
    v1: "ad_requests.imageMediaId → medias",
    v2: "company_ads.fileName",
    note: "v1 points to a medias row; the redesign stores the file name.",
  },
  "action.signIn": {
    kind: "both",
    v1: "user · session · account (Better-Auth)",
    v2: "users · otp_codes",
    api: "Better-Auth sign-in, auth.requestPIN",
  },
  "action.signUp": {
    kind: "both",
    v1: "user · user_roles (Better-Auth)",
    v2: "users",
    api: "auth.signUp",
  },
  "action.signUpEmployer": {
    kind: "both",
    v1: "user · organization · member",
    v2: "users · employer_profiles · employer_team_members",
    api: "auth.signUp, company.create",
    note: "Join the list opens employer sign-up.",
  },
  "action.uploadResume": {
    kind: "both",
    v1: "jobseeker_profile.resumeUrl · jobseeker_resume",
    v2: "jobseeker_profiles.resumeUrl",
    api: "POST /api/upload/resume, resume.parseResume",
    note: "v1 can keep several resumes in jobseeker_resume.",
  },
  "action.apply": {
    kind: "both",
    v1: "application (new row)",
    v2: "job_applications (new row)",
    api: "application.apply",
  },
  "action.postJob": {
    kind: "both",
    v1: "job (new row), with job_skills, job_benefits, job_language_requirements and job_prescreening",
    v2: "job_postings (new row)",
    api: "job.create, job.publish",
    note: "In v3 this link goes to the employer page for now; posting a job needs sign-in.",
  },
  "action.findJobs": {
    kind: "both",
    v1: "job (published jobs)",
    v2: "job_postings (published)",
    api: "job.list, job.get",
    note: "Opens the job seeker page's job board.",
  },
  "action.findCompanies": {
    kind: "both",
    v1: "organization",
    v2: "employer_profiles",
    api: "company.get",
    note: "Opens /companies. It shows sample companies until the database exists.",
  },
  "search.companies": {
    kind: "both",
    v1: "organization.legalName · industryId · cityId",
    v2: "employer_profiles.companyName · industryCategory · employer_addresses.city",
    note: "Searches the company list by name, industry or location.",
  },
  "organization.location": {
    kind: "shape",
    v1: "organization.cityId · organization.stateId",
    v2: "employer_addresses.city · state (first address)",
    note: "v1 stores lookup IDs on the company; the redesign keeps addresses in their own table.",
  },
  "organization.addresses": {
    kind: "shape",
    v1: "organization.address · cityId · stateId · postcodeId (one address)",
    v2: "employer_addresses (one row per office)",
    note: "v1 has one address per company; the redesign allows several offices.",
  },
  "company.badges": {
    kind: "v2",
    v1: "— (add an organization badges table, like the redesign's)",
    v2: "employer_badges",
  },
  "company.responsiveness": {
    kind: "shape",
    v1: "worked out from application_stages",
    v2: "worked out from job_application_events",
    note: "Not stored: the median time to an employer's first response to applications.",
  },
  "company.contactVerified": {
    kind: "v2",
    v1: "— (add phone verification, like the redesign's)",
    v2: "verified_phones (the owner's phone)",
  },
};

/** What a `data-db` key maps to, or undefined when the key is unknown. */
export function lookupDbKey(key: string): DbMapEntry | undefined {
  const action = ACTIONS[key] ?? PAGE_SECTIONS[key] ?? ONBOARDING[key];
  if (action) return action;
  const dot = key.indexOf(".");
  const table = key.slice(0, dot);
  const field = key.slice(dot + 1);
  const pair = FIELD_MAP.find((p) => p.v3Table === table);
  if (!pair) return undefined;
  const row =
    pair.rows.find((r) => r.v1 && r.v3 === field) ?? pair.rows.find((r) => r.v2?.name === field || r.v3 === field);
  if (!row) return undefined;
  return {
    kind: row.kind,
    v1: row.v1 ? `${table}.${row.v1.name}` : row.kind === "v2" ? `— (add ${table}.${row.v3})` : row.v3,
    v2: row.v2 ? `${pair.v2Table}.${row.v2.name}` : "—",
    note: row.note || undefined,
  };
}
