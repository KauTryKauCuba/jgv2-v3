import { benefits } from "@jobgiga-app/db/schema/benefits";
import { cities } from "@jobgiga-app/db/schema/cities";
import { industries } from "@jobgiga-app/db/schema/industries";
import { job, JOB_STATUS, jobBenefits, jobSkills } from "@jobgiga-app/db/schema/jobs";
import { postcodes } from "@jobgiga-app/db/schema/postcodes";
import { salaryTypes } from "@jobgiga-app/db/schema/salaryTypes";
import { skills } from "@jobgiga-app/db/schema/skills";
import { states } from "@jobgiga-app/db/schema/states";
import { and, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { toIso, toPostingStatus } from "../../shared/application-status";
import { inChunks } from "./queries";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed
// here, same as the routers.
type AnyDb = any;

// How a redesign job posting lives in v1's tables:
// - v1 columns where v1 has one: title, description, responsibilities,
//   address (street line 1), country/state/city/postcode ids, employment
//   type, work arrangement + location type, salary min/max, salary type id,
//   currency, show salary, education type id, experience type id, work
//   eligibility, status, created by, published at;
// - required skills → job_skills (adding new names to v1's skills list, as
//   v1's job.addSkill does); benefits → job_benefits (new names are added to
//   v1's benefits list for this company, as v1's custom benefits are);
// - everything else in the redesign's extra columns on `job` (see jobs.ts).

const MALAYSIA_COUNTRY_ID = 132;
// The redesign's state names → v1's states.name (Malaysia).
const V1_STATE_NAME: Record<string, string> = {
	Penang: "Pulau Pinang",
	"Kuala Lumpur": "Wp Kuala Lumpur",
	Labuan: "Wp Labuan",
	Putrajaya: "Wp Putrajaya",
};
// salary period → v1 salary_types.name (v1 has no daily or per-project type).
const V1_SALARY_TYPE: Record<string, string> = { hour: "Hourly", month: "Monthly", year: "Yearly" };
// minimum qualification → v1 education_types.id.
const V1_EDUCATION_TYPE: Record<string, number> = { SPM: 1, STPM: 2, Diploma: 3, Degree: 4, Master: 5, PhD: 6 };

/** Minimum years → v1 experience_types.id. */
function v1ExperienceTypeId(years: number | null): number | null {
	if (years === null) return null;
	if (years <= 0) return 1; // No Experience Needed
	if (years < 3) return 4; // 1-3 years
	if (years < 5) return 5; // 3-5 years
	if (years < 10) return 6; // 5-10 years
	return 7; // >10 years
}

/** The redesign's work authorizations → v1's local / international. */
function v1WorkEligibility(workAuthorizations: string[]): string {
	const localOnly =
		workAuthorizations.length > 0 && workAuthorizations.every((w) => w === "citizen" || w === "permanent_resident");
	return localOnly ? "local" : "international";
}

/** The redesign's posting status → v1's job.status. */
export function toV1JobStatus(status: string): string {
	return status === "active" ? JOB_STATUS.PUBLISHED : status;
}

/** "acme-sdn-bhd-graphic-designer", with -2, -3… when taken. */
export function slugify(value: string): string {
	return value
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 80);
}

export async function uniqueJobSlug(db: AnyDb, companyName: string, title: string): Promise<string> {
	const base = slugify(`${companyName}-${title}`) || "job";
	const taken = new Set(
		((await db
			.select({ slug: job.slug })
			.from(job)
			.where(or(eq(job.slug, base), like(job.slug, `${base}-%`)))) as { slug: string }[]).map((r) => r.slug),
	);
	if (!taken.has(base)) return base;
	let n = 2;
	while (taken.has(`${base}-${n}`)) n++;
	return `${base}-${n}`;
}

/** The redesign's posting fields, as validated by the job router. */
export type PostingFields = {
	status?: string;
	postingName?: string | null;
	title?: string;
	description?: string;
	responsibilities?: string;
	industry?: string | null;
	employmentType?: string;
	workArrangement?: string;
	officeDaysPerWeek?: number | null;
	location?: string;
	addressLine1?: string | null;
	addressLine2?: string | null;
	area?: string | null;
	city?: string | null;
	state?: string | null;
	postcode?: string | null;
	salaryMin?: number | null;
	salaryMax?: number | null;
	salaryPeriod?: string;
	showSalary?: boolean;
	openings?: number;
	skills?: string[];
	softSkills?: string[];
	niceToHaveSkills?: string[];
	minYearsExperience?: number | null;
	minQualificationTier?: string | null;
	languages?: { language: string; dialect?: string | null; level: string }[];
	workAuthorizations?: string[];
	drivingLicense?: string | null;
	screeningEnabled?: boolean;
	askMinYearsExperience?: boolean;
	askMinQualificationTier?: boolean;
	askDrivingLicense?: boolean;
	askLanguages?: boolean;
	askWorkAuthorizations?: boolean;
	customScreeningQuestions?: unknown[];
	screeningPreferred?: string[];
	skillSuggestions?: { professionalSkills: string[]; softSkills: string[]; niceToHaveSkills: string[] } | null;
	benefits?: string[];
	startAvailability?: string | null;
	workingHours?: string | null;
	contactUserId?: string | null;
};

/**
 * The fields sent → `job` column values (only the ones sent, so an update
 * touches nothing else), with v1's lookup ids filled in alongside.
 */
export async function jobValuesFrom(db: AnyDb, f: PostingFields): Promise<Record<string, unknown>> {
	const v: Record<string, unknown> = {};
	const copy = [
		"postingName",
		"title",
		"description",
		"responsibilities",
		"industry",
		"employmentType",
		"officeDaysPerWeek",
		"location",
		"addressLine2",
		"area",
		"city",
		"state",
		"postcode",
		"salaryMin",
		"salaryMax",
		"salaryPeriod",
		"showSalary",
		"openings",
		"softSkills",
		"niceToHaveSkills",
		"minYearsExperience",
		"minQualificationTier",
		"languages",
		"workAuthorizations",
		"drivingLicense",
		"screeningEnabled",
		"askMinYearsExperience",
		"askMinQualificationTier",
		"askDrivingLicense",
		"askLanguages",
		"askWorkAuthorizations",
		"customScreeningQuestions",
		"screeningPreferred",
		"skillSuggestions",
		"startAvailability",
		"workingHours",
		"contactUserId",
	] as const;
	for (const key of copy) if (f[key] !== undefined) v[key] = f[key];

	if (f.status !== undefined) v.status = toV1JobStatus(f.status);
	if (f.addressLine1 !== undefined) v.address = f.addressLine1;
	if (f.workArrangement !== undefined) {
		v.work_arrangement = f.workArrangement;
		v.locationType = f.workArrangement === "remote" ? "remote" : f.workArrangement === "hybrid" ? "hybrid" : "onsite";
	}
	if (f.industry !== undefined) {
		const [row] = f.industry
			? await db.select({ id: industries.id }).from(industries).where(sql`lower(${industries.name}) = lower(${f.industry})`).limit(1)
			: [];
		v.industryId = row?.id ?? null;
	}
	if (f.salaryPeriod !== undefined) {
		const name = V1_SALARY_TYPE[f.salaryPeriod];
		const [row] = name ? await db.select({ id: salaryTypes.id }).from(salaryTypes).where(eq(salaryTypes.name, name)).limit(1) : [];
		v.salaryTypeId = row?.id ?? null;
		v.currencyTypeId = 1; // MYR
		v.salaryCurrency = "MYR";
	}
	if (f.minYearsExperience !== undefined) v.experienceTypeId = v1ExperienceTypeId(f.minYearsExperience);
	if (f.minQualificationTier !== undefined) {
		v.educationTypeId = f.minQualificationTier ? (V1_EDUCATION_TYPE[f.minQualificationTier] ?? null) : null;
	}
	if (f.workAuthorizations !== undefined) v.work_eligibility = v1WorkEligibility(f.workAuthorizations);
	if (f.state !== undefined || f.city !== undefined || f.postcode !== undefined) {
		Object.assign(v, await placeIds(db, f.state ?? null, f.city ?? null, f.postcode ?? null));
	}
	return v;
}

// v1's country/state/city/postcode ids for a Malaysian address (null where v1 has no match).
async function placeIds(db: AnyDb, stateName: string | null, cityName: string | null, postcode: string | null) {
	const ids = { countryId: null as number | null, stateId: null as number | null, cityId: null as number | null, postcodeId: null as number | null };
	if (!stateName) return ids;
	const [stateRow] = await db
		.select({ id: states.id })
		.from(states)
		.where(and(eq(states.countryId, MALAYSIA_COUNTRY_ID), eq(states.name, V1_STATE_NAME[stateName] ?? stateName)))
		.limit(1);
	if (!stateRow) return ids;
	ids.countryId = MALAYSIA_COUNTRY_ID;
	ids.stateId = stateRow.id;
	if (cityName) {
		const [cityRow] = await db
			.select({ id: cities.id })
			.from(cities)
			.where(and(eq(cities.stateId, stateRow.id), sql`lower(${cities.name}) = lower(${cityName})`))
			.limit(1);
		ids.cityId = cityRow?.id ?? null;
	}
	if (postcode) {
		const [postcodeRow] = await db
			.select({ id: postcodes.id, cityId: postcodes.cityId })
			.from(postcodes)
			.where(eq(postcodes.postcode, postcode))
			.limit(1);
		ids.postcodeId = postcodeRow?.id ?? null;
		ids.cityId ??= postcodeRow?.cityId ?? null;
	}
	return ids;
}

/**
 * The statements that set a job's skills (job_skills) — adding any skill
 * v1's list doesn't have yet first. Run them in the same batch as the job.
 */
export async function skillStatements(db: AnyDb, jobId: string, names: string[]) {
	const ids = await lookupIds(
		names,
		(chunk) => db.select({ id: skills.id, name: skills.name }).from(skills).where(inArray(sql`lower(${skills.name})`, chunk)),
		(name) => db.insert(skills).values({ name }).returning({ id: skills.id, name: skills.name }),
	);
	return [
		db.delete(jobSkills).where(eq(jobSkills.jobId, jobId)),
		...ids.map((skillId) => db.insert(jobSkills).values({ id: crypto.randomUUID(), jobId, skillId })),
	];
}

/** Same for benefits (job_benefits); new names become this company's own benefits, as in v1. */
export async function benefitStatements(db: AnyDb, jobId: string, organizationId: string, names: string[]) {
	const ids = await lookupIds(
		names,
		(chunk) =>
			db
				.select({ id: benefits.id, name: benefits.name })
				.from(benefits)
				.where(
					and(
						inArray(sql`lower(${benefits.name})`, chunk),
						or(isNull(benefits.organizationId), eq(benefits.organizationId, organizationId)),
					),
				),
		(name) => db.insert(benefits).values({ name, organizationId }).returning({ id: benefits.id, name: benefits.name }),
	);
	return [
		db.delete(jobBenefits).where(eq(jobBenefits.jobId, jobId)),
		...ids.map((benefitId) => db.insert(jobBenefits).values({ id: crypto.randomUUID(), jobId, benefitId })),
	];
}

// The ids for these names, in order, adding the missing ones.
async function lookupIds(
	names: string[],
	find: (lowerNames: string[]) => Promise<{ id: number; name: string }[]>,
	add: (name: string) => Promise<{ id: number; name: string }[]>,
): Promise<number[]> {
	const wanted = [...new Map(names.map((n) => [n.trim().toLowerCase(), n.trim()])).entries()].filter(([k]) => k);
	const found = new Map<string, number>();
	for (const row of await inChunks(
		wanted.map(([k]) => k),
		find,
	)) {
		if (!found.has(row.name.toLowerCase())) found.set(row.name.toLowerCase(), row.id);
	}
	for (const [lower, original] of wanted) {
		if (found.has(lower)) continue;
		const [row] = await add(original);
		if (row) found.set(lower, row.id);
	}
	return wanted.map(([k]) => found.get(k)).filter((id): id is number => id !== undefined);
}

/** Each job's skills / benefits names, by job id, in the order they were saved. */
export async function namesByJob(db: AnyDb, jobIds: string[], kind: "skills" | "benefits") {
	const rows = (await inChunks(jobIds, (chunk) =>
		kind === "skills"
			? db
					.select({ jobId: jobSkills.jobId, name: skills.name, rowid: sql<number>`${jobSkills}.rowid` })
					.from(jobSkills)
					.innerJoin(skills, eq(skills.id, jobSkills.skillId))
					.where(inArray(jobSkills.jobId, chunk))
			: db
					.select({ jobId: jobBenefits.jobId, name: benefits.name, rowid: sql<number>`${jobBenefits}.rowid` })
					.from(jobBenefits)
					.innerJoin(benefits, eq(benefits.id, jobBenefits.benefitId))
					.where(inArray(jobBenefits.jobId, chunk)),
	)) as { jobId: string; name: string; rowid: number }[];
	rows.sort((a, b) => a.rowid - b.rowid);
	const out = new Map<string, string[]>();
	for (const r of rows) out.set(r.jobId, [...(out.get(r.jobId) ?? []), r.name]);
	return out;
}

/**
 * A `job` row → the redesign's job posting (its job_postings row shape),
 * which is what Manage Job and Post a job read.
 */
export function postingFromRow(
	row: AnyDb,
	extra: { skills: string[]; benefits: string[]; applicantCount?: number },
) {
	return {
		id: row.id as string,
		employerProfileId: row.organizationId as string,
		postingName: row.postingName ?? null,
		slug: row.slug ?? row.id,
		title: row.title as string,
		description: row.description ?? "",
		responsibilities: row.responsibilities ?? "",
		industry: row.industry ?? null,
		employmentType: row.employmentType as string,
		workArrangement: row.work_arrangement === "on-site" ? "onsite" : (row.work_arrangement as string),
		officeDaysPerWeek: row.officeDaysPerWeek ?? null,
		location: row.location ?? "",
		addressLine1: row.address ?? null,
		addressLine2: row.addressLine2 ?? null,
		area: row.area ?? null,
		city: row.city ?? null,
		state: row.state ?? null,
		postcode: row.postcode ?? null,
		salaryMin: row.salaryMin ?? null,
		salaryMax: row.salaryMax ?? null,
		salaryPeriod: row.salaryPeriod ?? "month",
		showSalary: Boolean(row.showSalary),
		openings: row.openings ?? 1,
		skills: extra.skills,
		softSkills: (row.softSkills ?? []) as string[],
		niceToHaveSkills: (row.niceToHaveSkills ?? []) as string[],
		minYearsExperience: row.minYearsExperience ?? null,
		minQualificationTier: row.minQualificationTier ?? null,
		languages: (row.languages ?? []) as { language: string; dialect?: string | null; level: string }[],
		workAuthorizations: (row.workAuthorizations ?? []) as string[],
		drivingLicense: row.drivingLicense ?? null,
		screeningEnabled: Boolean(row.screeningEnabled),
		askMinYearsExperience: Boolean(row.askMinYearsExperience),
		askMinQualificationTier: Boolean(row.askMinQualificationTier),
		askDrivingLicense: Boolean(row.askDrivingLicense),
		askLanguages: Boolean(row.askLanguages),
		askWorkAuthorizations: Boolean(row.askWorkAuthorizations),
		customScreeningQuestions: (row.customScreeningQuestions ?? []) as unknown[],
		screeningPreferred: (row.screeningPreferred ?? []) as string[],
		skillSuggestions: row.skillSuggestions ?? null,
		benefits: extra.benefits,
		startAvailability: row.startAvailability ?? null,
		workingHours: row.workingHours ?? null,
		contactUserId: row.contactUserId ?? null,
		status: toPostingStatus(row.status),
		rejectionReason: row.rejectionReason ?? null,
		flagReason: row.flagReason ?? null,
		flaggedAt: row.flaggedAt ? toIso(row.flaggedAt) : null,
		createdAt: toIso(row.createdAt),
		updatedAt: toIso(row.updatedAt),
		applicantCount: extra.applicantCount ?? 0,
		viewCount: (row.views as number) ?? 0,
	};
}

export type EmployerPosting = ReturnType<typeof postingFromRow>;
