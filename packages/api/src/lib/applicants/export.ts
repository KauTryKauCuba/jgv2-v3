import { jobseekerEducation, jobseekerProfile } from "@jobgiga-app/db/schema/auth";
import { inArray } from "drizzle-orm";
import { malaysiaStateOf } from "../../shared/malaysia";
import { QUALIFICATION_TIERS } from "../resume/parser";
import { computeMatchResults, loadEmployerAccess } from "../employer/dashboard";
import { inChunks } from "../jobs/queries";
import type { ApplicantRow } from "./rows";
import { buildXlsx, type XlsxCell, type XlsxColumn } from "./xlsx";

// The redesign's "Export to Excel" (lib/applicant-export.ts) for the exact
// rows on screen. Same columns and labels (the file is in English, as in the
// redesign). Email and phone are never included (the redesign's PDPA rule).
// Left out: the JobGiga Assistant's filter-based export (no assistant in v3),
// and the Screening column's answers (jobseekers can't apply with screening
// answers in v3 yet, so it's always empty).

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

export const EXPORT_MAX_APPLICATIONS = 5000;

const COLUMNS: XlsxColumn[] = [
	{ header: "Name", width: 26 },
	{ header: "Job posting", width: 26 },
	{ header: "Stage", width: 20 },
	{ header: "Applied", width: 13, format: "date" },
	{ header: "Location", width: 22 },
	{ header: "State", width: 16 },
	{ header: "Fit score", width: 10 },
	{ header: "Meets must-haves", width: 16 },
	{ header: "Years of experience", width: 12 },
	{ header: "Skills", width: 40 },
	{ header: "Highest education", width: 36 },
	{ header: "Expected salary (RM / month)", width: 16 },
	{ header: "Notice period", width: 15 },
	{ header: "Work arrangement", width: 15 },
	{ header: "Employment type", width: 15 },
	{ header: "Interview", width: 20, format: "datetime" },
	{ header: "Interview reply", width: 18 },
	{ header: "Screening", width: 60 },
];

const STATUS_LABEL: Record<string, string> = {
	applied: "Applied",
	screened: "Screened",
	shortlisted: "Shortlisted",
	interview: "Interview scheduled",
	interviewed: "Interviewed",
	evaluation: "Evaluation",
	evaluated: "Evaluated",
	kiv: "KIV (on hold)",
	offer: "Offer",
	hired: "Hired",
	rejected: "Rejected",
	withdrawn: "Withdrawn",
};

const REPLY_LABEL: Record<string, string> = {
	pending: "No reply yet",
	accepted: "Accepted",
	declined: "Declined",
	reschedule_requested: "Asked to reschedule",
	attended: "Attended",
	no_show: "No-show",
};

function plain(value: string | null | undefined): string | null {
	if (!value) return null;
	const text = value.replace(/_/g, " ");
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function salary(min: number | null, max: number | null): string | null {
	if (!min && !max) return null;
	if (min && max) return min === max ? `${min}` : `${min}–${max}`;
	return `${min ?? max}`;
}

/** Highest qualification per jobseeker profile, as "Degree — Computer Science, Multimedia University". */
async function highestEducation(db: AnyDb, profileIds: string[]): Promise<Map<string, string>> {
	const result = new Map<string, string>();
	const rows = (await inChunks(profileIds, (chunk) =>
		db
			.select({
				profileId: jobseekerEducation.jobseekerProfileId,
				tier: jobseekerEducation.educationLevel,
				fieldOfStudy: jobseekerEducation.fieldOfStudy,
				institution: jobseekerEducation.schoolName,
			})
			.from(jobseekerEducation)
			.where(inArray(jobseekerEducation.jobseekerProfileId, chunk)),
	)) as { profileId: string; tier: string | null; fieldOfStudy: string | null; institution: string | null }[];
	const rank = (tier: string | null) => (tier === "Other" ? 0 : QUALIFICATION_TIERS.indexOf(tier as never) + 1);
	const best = new Map<string, (typeof rows)[number]>();
	for (const row of rows) {
		const current = best.get(row.profileId);
		if (!current || rank(row.tier) > rank(current.tier)) best.set(row.profileId, row);
	}
	for (const [profileId, row] of best) {
		const detail = [row.fieldOfStudy, row.institution].filter(Boolean).join(", ");
		result.set(profileId, [row.tier, detail].filter(Boolean).join(" — "));
	}
	return result;
}

/** "2026-11-28", Malaysia time — read inside the function (Workers' 1970 rule). */
function dayKey(date: Date) {
	return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kuala_Lumpur" });
}

function fileName(title: string | undefined): string {
	const base = (title ?? "Applicants")
		.normalize("NFKD")
		.replace(/[^\w\s-]/g, "")
		.trim()
		.replace(/\s+/g, "-")
		.slice(0, 60);
	return `${base || "Applicants"}-${dayKey(new Date())}.xlsx`;
}

export async function buildApplicantExport(
	db: AnyDb,
	origin: string,
	userId: string,
	rowsInOrder: ApplicantRow[],
	title: string | undefined,
	activeOrganizationId: string | null,
) {
	const access = await loadEmployerAccess(db, userId, activeOrganizationId);
	const fit = new Map(
		access ? (await computeMatchResults(db, origin, access.organizationId, access.criteria, access.scope)).map((m) => [m.applicationId, m]) : [],
	);
	// The profile id on each row is the jobseeker_profile id (or the account id for old v1 accounts).
	const profileIds = [...new Set(rowsInOrder.map((a) => a.application.jobseekerProfileId))];
	const existing = (await inChunks(profileIds, (chunk) =>
		db.select({ id: jobseekerProfile.id }).from(jobseekerProfile).where(inArray(jobseekerProfile.id, chunk)),
	)) as { id: string }[];
	const education = await highestEducation(
		db,
		existing.map((p) => p.id),
	);

	const cells: XlsxCell[][] = rowsInOrder.map((a) => {
		const m = fit.get(a.application.id);
		const interview = a.application.interviewDetails;
		return [
			a.applicantName,
			a.jobPostingTitle,
			STATUS_LABEL[a.application.status] ?? a.application.status,
			new Date(a.application.appliedAt),
			a.applicantLocation,
			a.applicantLocation ? malaysiaStateOf(a.applicantLocation) : null,
			m?.score ?? null,
			m ? (m.eligible ? "Yes" : "No") : null,
			a.applicantYearsExperience,
			a.applicantSkills.join(", "),
			education.get(a.application.jobseekerProfileId) ?? null,
			salary(a.applicantExpectedSalaryMin, a.applicantExpectedSalaryMax),
			plain(a.applicantNoticePeriod),
			plain(a.applicantWorkArrangement),
			plain(a.applicantEmploymentType),
			interview?.scheduledAt ? new Date(interview.scheduledAt) : null,
			interview?.scheduledAt ? REPLY_LABEL[a.application.interviewResponseStatus ?? "pending"] : null,
			null,
		];
	});

	return { fileName: fileName(title), bytes: await buildXlsx("Applicants", COLUMNS, cells) };
}
