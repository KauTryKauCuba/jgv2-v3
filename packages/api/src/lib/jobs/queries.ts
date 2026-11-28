import { organization } from "@jobgiga-app/db/schema/auth";
import { cities } from "@jobgiga-app/db/schema/cities";
import { industries } from "@jobgiga-app/db/schema/industries";
import { application, applicationStages, job, jobSkills } from "@jobgiga-app/db/schema/jobs";
import { salaryTypes } from "@jobgiga-app/db/schema/salaryTypes";
import { skills } from "@jobgiga-app/db/schema/skills";
import { states } from "@jobgiga-app/db/schema/states";
import { and, asc, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
	type PipelineStatus,
	toIso,
	toPipelineStatus,
	toSalaryPeriod,
	toWorkArrangement,
} from "../../shared/application-status";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed
// here, same as the routers.
type AnyDb = any;

// D1 allows at most 100 bound values per query, so long id lists are split.
const CHUNK = 90;

export async function inChunks<T>(ids: string[], load: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
	const unique = [...new Set(ids)];
	const out: T[] = [];
	for (let i = 0; i < unique.length; i += CHUNK) out.push(...(await load(unique.slice(i, i + CHUNK))));
	return out;
}

/** The posting's own "City, State" (Post a job saves it), else v1's city/state lookups, else the address. */
export function jobLocation(row: {
	locationText?: string | null;
	cityName: string | null;
	stateName: string | null;
	address: string | null;
}): string {
	if (row.locationText?.trim()) return row.locationText.trim();
	const place = [row.cityName, row.stateName].filter(Boolean).join(", ");
	return place || row.address?.trim() || "";
}

// What a job card shows (the redesign's ActivePostingRow), from v1's job
// table and its lookups.
export async function loadJobCards(db: AnyDb, where: SQL | undefined, limit = 50) {
	const rows = await db
		.select({
			id: job.id,
			organizationId: job.organizationId,
			title: job.title,
			status: job.status,
			industry: industries.name,
			employmentType: job.employmentType,
			workArrangement: job.work_arrangement,
			workEligibility: job.work_eligibility,
			address: job.address,
			locationText: job.location,
			cityName: cities.name,
			stateName: states.name,
			salaryMin: job.salaryMin,
			salaryMax: job.salaryMax,
			showSalary: job.showSalary,
			salaryTypeName: salaryTypes.name,
			salaryPeriodText: job.salaryPeriod,
			experienceTypeId: job.experienceTypeId,
			views: job.views,
			publishedAt: job.publishedAt,
			createdAt: job.createdAt,
			companyName: organization.displayName,
		})
		.from(job)
		.innerJoin(organization, eq(organization.id, job.organizationId))
		.leftJoin(industries, eq(industries.id, job.industryId))
		.leftJoin(cities, eq(cities.id, job.cityId))
		.leftJoin(states, eq(states.id, job.stateId))
		.leftJoin(salaryTypes, eq(salaryTypes.id, job.salaryTypeId))
		.where(where)
		.orderBy(desc(job.createdAt))
		.limit(limit);
	const skillNames = await loadSkillNames(
		db,
		rows.map((r: { id: string }) => r.id),
	);
	return rows.map((r: AnyDb) => ({
		id: r.id as string,
		organizationId: r.organizationId as string,
		title: r.title as string,
		status: r.status as string,
		industry: (r.industry as string | null) ?? null,
		employmentType: r.employmentType as string,
		workArrangement: toWorkArrangement(r.workArrangement),
		workEligibility: r.workEligibility as string,
		location: jobLocation(r),
		salaryMin: r.showSalary ? ((r.salaryMin as number | null) ?? null) : null,
		salaryMax: r.showSalary ? ((r.salaryMax as number | null) ?? null) : null,
		// Post a job saves the period itself; v1's rows only have a salary type
		// (their salary_period is the column default, "month").
		salaryPeriod:
			r.salaryPeriodText && r.salaryPeriodText !== "month" ? r.salaryPeriodText : toSalaryPeriod(r.salaryTypeName),
		experienceTypeId: (r.experienceTypeId as number | null) ?? null,
		views: (r.views as number) ?? 0,
		publishedAt: r.publishedAt ? toIso(r.publishedAt) : null,
		createdAt: toIso(r.createdAt),
		companyName: r.companyName as string,
		skills: skillNames.get(r.id) ?? [],
	}));
}

export type JobCard = Awaited<ReturnType<typeof loadJobCards>>[number];

/** Each job's required skills (v1's job_skills → skills), by job id. */
export async function loadSkillNames(db: AnyDb, jobIds: string[]): Promise<Map<string, string[]>> {
	const rows = await inChunks(jobIds, (chunk) =>
		db
			.select({ jobId: jobSkills.jobId, name: skills.name })
			.from(jobSkills)
			.innerJoin(skills, eq(skills.id, jobSkills.skillId))
			.where(inArray(jobSkills.jobId, chunk)),
	);
	const out = new Map<string, string[]>();
	for (const row of rows as { jobId: string; name: string }[]) {
		out.set(row.jobId, [...(out.get(row.jobId) ?? []), row.name]);
	}
	return out;
}

export type ApplicationEvent = { fromStatus: string | null; toStatus: PipelineStatus; createdAt: string };

/**
 * Each application's history, oldest first, from v1's application_stages —
 * the redesign's job_application_events. Repeats of the same step (v1 can
 * log several rows for one step) are folded into the first.
 */
export async function loadApplicationEvents(db: AnyDb, applicationIds: string[]) {
	const rows = await inChunks(applicationIds, (chunk) =>
		db
			.select({
				applicationId: applicationStages.applicationId,
				stageName: applicationStages.stageName,
				createdAt: applicationStages.createdAt,
			})
			.from(applicationStages)
			.where(inArray(applicationStages.applicationId, chunk))
			// rowid keeps moves made in the same second in order.
			.orderBy(asc(applicationStages.createdAt), asc(sql`rowid`)),
	);
	const out = new Map<string, ApplicationEvent[]>();
	for (const row of rows as { applicationId: string; stageName: string; createdAt: string }[]) {
		const list = out.get(row.applicationId) ?? [];
		const toStatus = toPipelineStatus(row.stageName);
		const previous = list.at(-1)?.toStatus ?? "applied";
		if (toStatus !== previous || list.length === 0) {
			// The first "received" row is the application itself, not a move.
			if (!(list.length === 0 && toStatus === "applied")) {
				list.push({ fromStatus: previous, toStatus, createdAt: toIso(row.createdAt) });
			}
		}
		out.set(row.applicationId, list);
	}
	return out;
}

export type EmployerResponsiveness = {
	medianHours: number;
	responseRate: number;
	sampleSize: number;
	waitingLong: number;
};

// Same rules as the redesign's getEmployerResponsiveness: the last 180 days,
// an application counts once it got a reply or has waited 3+ days, and fewer
// than 3 such applications says nothing.
const WINDOW_DAYS = 180;
const UNANSWERED_AFTER_HOURS = 72;
const MIN_SAMPLE = 3;
const HOUR = 60 * 60 * 1000;

/** Each company's typical time to first reply, by organization id. */
export async function loadEmployerResponsiveness(db: AnyDb, organizationIds: string[]) {
	const apps = (await inChunks(organizationIds, (chunk) =>
		db
			.select({
				id: application.id,
				organizationId: job.organizationId,
				status: application.status,
				dateApplied: application.dateApplied,
			})
			.from(application)
			.innerJoin(job, eq(job.id, application.jobId))
			.where(and(inArray(job.organizationId, chunk))),
	)) as { id: string; organizationId: string; status: string; dateApplied: string }[];

	const now = Date.now();
	const recent = apps.filter(
		(a) =>
			now - new Date(toIso(a.dateApplied)).getTime() < WINDOW_DAYS * 24 * HOUR &&
			toPipelineStatus(a.status) !== "withdrawn",
	);
	const events = await loadApplicationEvents(
		db,
		recent.map((a) => a.id),
	);

	const byOrg = new Map<string, { hours: number[]; measured: number; responded: number; waitingLong: number }>();
	for (const a of recent) {
		const stats = byOrg.get(a.organizationId) ?? { hours: [], measured: 0, responded: 0, waitingLong: 0 };
		const appliedAt = new Date(toIso(a.dateApplied)).getTime();
		const firstReply = events.get(a.id)?.find((e) => e.fromStatus === "applied");
		const waitedLong = now - appliedAt > UNANSWERED_AFTER_HOURS * HOUR;
		if (firstReply) {
			stats.measured++;
			stats.responded++;
			stats.hours.push((new Date(firstReply.createdAt).getTime() - appliedAt) / HOUR);
		} else if (waitedLong) {
			stats.measured++;
			if (toPipelineStatus(a.status) === "applied") stats.waitingLong++;
		}
		byOrg.set(a.organizationId, stats);
	}

	const out = new Map<string, EmployerResponsiveness>();
	for (const [orgId, s] of byOrg) {
		if (s.measured < MIN_SAMPLE || s.hours.length === 0) continue;
		const sorted = [...s.hours].sort((x, y) => x - y);
		const mid = Math.floor(sorted.length / 2);
		const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
		out.set(orgId, {
			medianHours: median,
			responseRate: s.responded / s.measured,
			sampleSize: s.measured,
			waitingLong: s.waitingLong,
		});
	}
	return out;
}
