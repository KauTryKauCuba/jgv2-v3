import { member, organizationBadge } from "@jobgiga-app/db/schema/auth";
import { application, job, JOB_STATUS, savedJob } from "@jobgiga-app/db/schema/jobs";
import { ORPCError } from "@orpc/server";
import { and, count, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { loadEmployerAccess } from "../lib/employer/dashboard";
import { canViewJob, loadJobHiringManagers, setJobHiringManagers } from "../lib/employer/scope";
import { protectedProcedure, publicProcedure } from "../index";
import { hasFullAccess, loadCurrentCompany } from "../lib/employer/access";
import {
	benefitStatements,
	jobValuesFrom,
	namesByJob,
	postingFromRow,
	skillStatements,
	uniqueJobSlug,
} from "../lib/jobs/posting";
import { parsePostingBody } from "../lib/jobs/posting-input";
import { inChunks, type JobCard, loadEmployerResponsiveness, loadJobCards } from "../lib/jobs/queries";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed
// here, same as the other routers.
type AnyDb = any;

// v1's job router (packages/api/src/routers/job.ts), the parts the
// dashboards use so far, under v1's names. The rest (get, create, update,
// recordView, the admin and analytics calls) comes with Find Job, Post a job
// and Manage Job.

function bad(message: string): never {
	throw new ORPCError("BAD_REQUEST", { message });
}

// The signed-in employer's company, for the Manage Job / Post a job calls.
// `manage`: only owners and admins create, change or delete postings.
async function companyFor(
	db: AnyDb,
	userId: string,
	opts: { manage: boolean; message?: string; activeOrganizationId: string | null },
) {
	const company = await loadCurrentCompany(db, userId, opts.activeOrganizationId);
	if (!company) throw new ORPCError("BAD_REQUEST", { message: "Finish your company profile first." });
	if (opts.manage && !hasFullAccess(company.accessLevel)) {
		throw new ORPCError("FORBIDDEN", { message: opts.message ?? "Only an owner or admin can change job postings." });
	}
	return company;
}

// Postings → the redesign's shape, with skills, benefits and applicant counts.
async function toPostings(db: AnyDb, rows: AnyDb[]) {
	const ids = rows.map((r) => r.id as string);
	const [skillNames, benefitNames, counts] = await Promise.all([
		namesByJob(db, ids, "skills"),
		namesByJob(db, ids, "benefits"),
		inChunks(ids, (chunk) =>
			db
				.select({ jobId: application.jobId, n: count() })
				.from(application)
				.where(inArray(application.jobId, chunk))
				.groupBy(application.jobId),
		),
	]);
	const applicants = new Map((counts as { jobId: string; n: number }[]).map((c) => [c.jobId, c.n]));
	return rows.map((r) =>
		postingFromRow(r, {
			skills: skillNames.get(r.id) ?? [],
			benefits: benefitNames.get(r.id) ?? [],
			applicantCount: applicants.get(r.id) ?? 0,
		}),
	);
}

// The contact must be someone active on this company's team.
async function checkContact(db: AnyDb, organizationId: string, contactUserId: string | null | undefined) {
	if (!contactUserId) return contactUserId;
	const [row] = await db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.organizationId, organizationId), eq(member.userId, contactUserId), eq(member.status, "active")))
		.limit(1);
	return row ? contactUserId : null;
}

// The redesign's hiringManagerIds field: undefined = leave as is, an array
// of team-member ids = set to exactly those (checked in setJobHiringManagers).
function parseHiringManagerIds(value: unknown): string[] | undefined {
	if (value === undefined) return undefined;
	if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) bad("Invalid hiring managers.");
	return value as string[];
}

async function hiringManagerIdsOf(db: AnyDb, origin: string, jobId: string) {
	return ((await loadJobHiringManagers(db, origin, [jobId])).get(jobId) ?? []).map((m) => m.teamMemberId);
}

function badge(db: AnyDb, organizationId: string, badgeKey: string) {
	return db.insert(organizationBadge).values({ id: crypto.randomUUID(), organizationId, badgeKey }).onConflictDoNothing();
}

export const jobRouter = {
	// Live jobs, newest first — v1's job.list, without its filters yet (they
	// come with the Find Job page). Each row is what the redesign's job cards
	// show, plus the company's typical reply time.
	list: publicProcedure
		.input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const jobs: JobCard[] = await loadJobCards(
				db,
				and(eq(job.status, JOB_STATUS.PUBLISHED), eq(job.isActive, true)),
				input?.limit ?? 50,
			);
			const responsiveness = await loadEmployerResponsiveness(
				db,
				jobs.map((j) => j.organizationId),
			);
			return jobs.map((j) => ({ ...j, responsiveness: responsiveness.get(j.organizationId) ?? null }));
		}),

	// v1's job.bookmark.* — the redesign's heart button (SaveJobButton).
	bookmark: {
		save: protectedProcedure.input(z.object({ jobId: z.string() })).handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const userId = context.session.user.id;
			const [jobRow] = await db.select({ id: job.id }).from(job).where(eq(job.id, input.jobId)).limit(1);
			if (!jobRow) throw new ORPCError("NOT_FOUND", { message: "Job not found" });
			const [existing] = await db
				.select({ id: savedJob.id })
				.from(savedJob)
				.where(and(eq(savedJob.jobId, input.jobId), eq(savedJob.userId, userId)))
				.limit(1);
			// Saving twice is fine: the heart just stays on.
			if (existing) return { saved: true as const };
			await db.insert(savedJob).values({ id: crypto.randomUUID(), jobId: input.jobId, userId });
			return { saved: true as const };
		}),

		unsave: protectedProcedure.input(z.object({ jobId: z.string() })).handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			await db
				.delete(savedJob)
				.where(and(eq(savedJob.jobId, input.jobId), eq(savedJob.userId, context.session.user.id)));
			return { saved: false as const };
		}),

		// The signed-in user's saved jobs, newest first. The dashboard only
		// needs the ids; Saved Jobs will add the job details here.
		listSavedJobs: protectedProcedure.handler(async ({ context }) => {
			const db = context.db as AnyDb;
			const rows = await db
				.select({ id: savedJob.id, jobId: savedJob.jobId, savedAt: savedJob.savedAt })
				.from(savedJob)
				.where(eq(savedJob.userId, context.session.user.id))
				.orderBy(desc(savedJob.savedAt));
			return rows as { id: string; jobId: string; savedAt: string }[];
		}),
	},

	// ── Manage Job / Post a job (the redesign's /api/employer/job-postings) ──

	// v1's job.listOrgJobs: the company's postings, newest first, in the
	// redesign's shape with applicant and view counts.
	listOrgJobs: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const access = await loadEmployerAccess(db, context.session.user.id, context.activeOrganizationId);
		if (!access) return { postings: [] };
		const rows = (await db
			.select()
			.from(job)
			.where(eq(job.organizationId, access.organizationId))
			.orderBy(desc(job.createdAt))) as AnyDb[];
		// A Hiring manager sees the postings they're assigned to (the redesign's scope).
		return { postings: await toPostings(db, rows.filter((r) => canViewJob(access.scope, r.id))) };
	}),

	// v1's job.getForEdit: one posting, for reopening a draft or editing.
	getForEdit: protectedProcedure.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const company = await companyFor(db, context.session.user.id, { activeOrganizationId: context.activeOrganizationId, manage: false });
		const [row] = await db
			.select()
			.from(job)
			.where(and(eq(job.id, input.id), eq(job.organizationId, company.organizationId)))
			.limit(1);
		if (!row) throw new ORPCError("NOT_FOUND", { message: "Not found." });
		const [posting] = await toPostings(db, [row]);
		return { posting: { ...posting!, hiringManagerIds: await hiringManagerIdsOf(db, context.origin, row.id) } };
	}),

	// v1's job.create: a new posting, saved as a draft or sent for review
	// ("pending" — an admin publishes it, as in v1 and the redesign).
	create: protectedProcedure.input(z.record(z.string(), z.unknown())).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const company = await companyFor(db, userId, { activeOrganizationId: context.activeOrganizationId, manage: true, message: "Only an owner or admin can post jobs." });
		const parsed = parsePostingBody(input, { mode: "create" });
		if (!parsed.ok) bad(parsed.error);
		const managerIds = parseHiringManagerIds(input.hiringManagerIds);
		const f = parsed.fields;
		f.contactUserId = await checkContact(db, company.organizationId, f.contactUserId);

		const id = crypto.randomUUID();
		const values = await jobValuesFrom(db, f);
		const slug = await uniqueJobSlug(db, company.companyName, f.title as string);
		const [skillsQ, benefitsQ] = await Promise.all([
			skillStatements(db, id, f.skills ?? []),
			benefitStatements(db, id, company.organizationId, f.benefits ?? []),
		]);
		await db.batch([
			db.insert(job).values({
				...values,
				id,
				organizationId: company.organizationId,
				slug,
				createdById: userId,
			}),
			...skillsQ,
			...benefitsQ,
			badge(db, company.organizationId, "first_job_posted"),
			...(f.screeningEnabled ? [badge(db, company.organizationId, "screening_enabled")] : []),
		]);
		if (managerIds) {
			const set = await setJobHiringManagers(db, {
				organizationId: company.organizationId,
				jobId: id,
				jobTitle: f.title as string,
				memberIds: managerIds,
				actorUserId: userId,
			});
			if (!set.ok) bad(set.error);
		}
		const [row] = await db.select().from(job).where(eq(job.id, id)).limit(1);
		const [posting] = await toPostings(db, [row]);
		return { posting: { ...posting!, hiringManagerIds: await hiringManagerIdsOf(db, context.origin, id) } };
	}),

	// v1's job.update: change any fields sent; status can go to draft,
	// pending (resubmit) or closed.
	update: protectedProcedure
		.input(z.object({ id: z.string() }).catchall(z.unknown()))
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const company = await companyFor(db, context.session.user.id, { activeOrganizationId: context.activeOrganizationId, manage: true });
			const [existing] = await db
				.select()
				.from(job)
				.where(and(eq(job.id, input.id), eq(job.organizationId, company.organizationId)))
				.limit(1);
			if (!existing) throw new ORPCError("NOT_FOUND", { message: "Not found." });
			const { id, hiringManagerIds, ...body } = input;
			const managerIds = parseHiringManagerIds(hiringManagerIds);
			const parsed = parsePostingBody(body, { mode: "update", screeningEnabledBefore: Boolean(existing.screeningEnabled) });
			if (!parsed.ok) bad(parsed.error);
			const f = parsed.fields;
			if (f.contactUserId !== undefined) f.contactUserId = await checkContact(db, company.organizationId, f.contactUserId);

			const values = await jobValuesFrom(db, f);
			const [skillsQ, benefitsQ] = await Promise.all([
				f.skills !== undefined ? skillStatements(db, id, f.skills) : [],
				f.benefits !== undefined ? benefitStatements(db, id, company.organizationId, f.benefits) : [],
			]);
			const screeningOn = f.screeningEnabled ?? Boolean(existing.screeningEnabled);
			await db.batch([
				db.update(job).set(values).where(eq(job.id, id)),
				...skillsQ,
				...benefitsQ,
				...(screeningOn ? [badge(db, company.organizationId, "screening_enabled")] : []),
			]);
			if (managerIds) {
				const set = await setJobHiringManagers(db, {
					organizationId: company.organizationId,
					jobId: id,
					jobTitle: (f.title as string | undefined) ?? (existing.title as string),
					memberIds: managerIds,
					actorUserId: context.session.user.id,
				});
				if (!set.ok) bad(set.error);
			}
			const [row] = await db.select().from(job).where(eq(job.id, id)).limit(1);
			const [posting] = await toPostings(db, [row]);
			return { posting: { ...posting!, hiringManagerIds: await hiringManagerIdsOf(db, context.origin, id) } };
		}),

	// v1's job.delete: removes the posting (its applications go with it).
	delete: protectedProcedure.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const company = await companyFor(db, context.session.user.id, { activeOrganizationId: context.activeOrganizationId, manage: true });
		await db.delete(job).where(and(eq(job.id, input.id), eq(job.organizationId, company.organizationId)));
		return { ok: true as const };
	}),
};
