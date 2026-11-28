import { aiUsage } from "@jobgiga-app/db/schema/ai-usage";
import {
	accountDeletionRequests,
	jobseekerProfile,
	member,
	organization,
	organizationAddress,
	user,
} from "@jobgiga-app/db/schema/auth";
import { application, job, JOB_STATUS, savedJob } from "@jobgiga-app/db/schema/jobs";
import { ORPCError } from "@orpc/server";
import { and, asc, count, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure } from "../index";
import { reviewAccountDeletionRequest } from "../lib/account/deletion";
import { estimateCostUsd } from "../lib/ai/cost";
import { loadCompanyLimitInfo, loadCompanyLimitInfoFor, MAX_COMPANY_LIMIT } from "../lib/employer/memberships";
import { namesByJob, postingFromRow } from "../lib/jobs/posting";
import { inChunks, loadEmployerResponsiveness } from "../lib/jobs/queries";
import { fileUrl } from "../lib/uploads";
import { toIso, v1StatusesFor } from "../shared/application-status";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed
// here, same as the other routers.
type AnyDb = any;

// The redesign's superadmin panel (app/superadmin/*, api/superadmin/*) on
// v1's tables, for v1's platform admins (user.role = "admin" — v1's
// adminProcedure). v1's own admin calls for the same jobs are
// job.listAllPendingJobs / job.adminUpdateJobStatus; these return the
// redesign's shapes instead, which its pages are built on.

const DAY = 24 * 60 * 60 * 1000;
// SQLite's datetime('now') format, for comparing with v1's text timestamps.
const sqliteTime = (ms: number) => new Date(ms).toISOString().replace("T", " ").slice(0, 19);

async function countOf(query: Promise<{ value: number }[]>) {
	return (await query)[0]?.value ?? 0;
}

function bad(message: string): never {
	throw new ORPCError("BAD_REQUEST", { message });
}

// Postings with the company and the "Posted by" contact, in the redesign's
// getJobPostingsByStatus row shape: { posting, companyName, companyLogoUrl }.
async function postingRows(db: AnyDb, origin: string, v1Status: string) {
	const rows = (await db
		.select({ job, companyName: organization.displayName, companyLogo: organization.companyLogo })
		.from(job)
		.innerJoin(organization, eq(organization.id, job.organizationId))
		.where(eq(job.status, v1Status))
		.orderBy(desc(job.createdAt))) as AnyDb[];
	const ids = rows.map((r) => r.job.id as string);
	const [skills, benefits] = await Promise.all([namesByJob(db, ids, "skills"), namesByJob(db, ids, "benefits")]);
	// The contact shown on each posting: name, position and photo only.
	const contactIds = [...new Set(rows.map((r) => r.job.contactUserId).filter(Boolean))] as string[];
	const contacts = (await inChunks(contactIds, (chunk) =>
		db
			.select({
				organizationId: member.organizationId,
				userId: member.userId,
				name: member.name,
				position: member.positionTitle,
				avatarKey: member.avatarKey,
			})
			.from(member)
			.where(and(inArray(member.userId, chunk), eq(member.status, "active"))),
	)) as AnyDb[];
	return rows.map((r) => {
		const c = contacts.find((m) => m.userId === r.job.contactUserId && m.organizationId === r.job.organizationId);
		return {
			posting: {
				...postingFromRow(r.job, { skills: skills.get(r.job.id) ?? [], benefits: benefits.get(r.job.id) ?? [] }),
				contact: c ? { name: c.name ?? "", position: c.position ?? null, avatarUrl: fileUrl(origin, c.avatarKey) } : null,
			},
			companyName: r.companyName as string,
			companyLogoUrl: fileUrl(origin, r.companyLogo),
		};
	});
}

export const adminRouter = {
	// The redesign's /superadmin/dashboard: the review queue and how the
	// platform is being used. (Video pitches, cover letters and
	// notifications aren't in v3 yet, so their tiles aren't either.)
	dashboard: adminProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const now = Date.now();
		const weekAgo = sqliteTime(now - 7 * DAY);
		const threeDaysAgo = sqliteTime(now - 3 * DAY);
		const monthAgo = sqliteTime(now - 30 * DAY);
		const jobsWith = (status: string) => countOf(db.select({ value: count() }).from(job).where(eq(job.status, status)));
		const appsWith = (statuses: string[], extra?: ReturnType<typeof gt>) =>
			countOf(
				db
					.select({ value: count() })
					.from(application)
					.where(extra ? and(inArray(application.status, statuses), extra) : inArray(application.status, statuses)),
			);
		const [
			pending,
			active,
			flagged,
			rejected,
			employers,
			jobseekers,
			applications,
			applicationsThisWeek,
			interviews,
			hires,
			waitingLong,
			savedJobs,
			usageRows,
			deletionRequests,
		] = await Promise.all([
			jobsWith(JOB_STATUS.PENDING),
			jobsWith(JOB_STATUS.PUBLISHED),
			jobsWith(JOB_STATUS.FLAGGED),
			jobsWith(JOB_STATUS.REJECTED),
			countOf(db.select({ value: count() }).from(organization)),
			countOf(db.select({ value: count() }).from(jobseekerProfile)),
			countOf(db.select({ value: count() }).from(application)),
			countOf(db.select({ value: count() }).from(application).where(gt(application.dateApplied, weekAgo))),
			appsWith(v1StatusesFor("interview")),
			appsWith(v1StatusesFor("hired")),
			appsWith(v1StatusesFor("applied"), lt(application.dateApplied, threeDaysAgo)),
			countOf(db.select({ value: count() }).from(savedJob)),
			db
				.select({
					provider: aiUsage.provider,
					rows: sql<number>`count(*)`,
					promptTokens: sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)`,
					completionTokens: sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)`,
					callCount: sql<number>`coalesce(sum(${aiUsage.callCount}), 0)`,
					cachedTokens: sql<number>`coalesce(sum(${aiUsage.cachedTokens}), 0)`,
					actualCostUsd: sql<number | null>`sum(${aiUsage.actualCostUsd})`,
				})
				.from(aiUsage)
				.where(gt(aiUsage.createdAt, monthAgo))
				.groupBy(aiUsage.provider) as Promise<AnyDb[]>,
			countOf(
				db
					.select({ value: count() })
					.from(accountDeletionRequests)
					.where(
						and(eq(accountDeletionRequests.status, "pending"), eq(accountDeletionRequests.requiredApproverRole, "superadmin")),
					),
			),
		]);
		const aiCostUsd = usageRows.reduce((sum, r) => {
			if (!r.provider || r.provider === "none" || r.provider === "stub") return sum;
			const calls = r.provider === "perplexity" ? r.callCount : r.rows;
			return sum + (r.actualCostUsd ?? estimateCostUsd(r.provider, r.promptTokens, r.completionTokens, calls, r.cachedTokens) ?? 0);
		}, 0);
		return {
			pending,
			active,
			flagged,
			rejected,
			employers,
			jobseekers,
			applications,
			applicationsThisWeek,
			interviews,
			hires,
			waitingLong,
			savedJobs,
			aiCostUsd,
			deletionRequests,
		};
	}),

	// The redesign's /superadmin/job-postings data: pending, active and
	// flagged postings. Jobseekers can't report postings in v3 yet, so the
	// reports list is always empty.
	listJobPostings: adminProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const [pending, active, flagged] = await Promise.all([
			postingRows(db, context.origin, JOB_STATUS.PENDING),
			postingRows(db, context.origin, JOB_STATUS.PUBLISHED),
			postingRows(db, context.origin, JOB_STATUS.FLAGGED),
		]);
		return { pending, active, flagged, reports: [] as unknown[] };
	}),

	// The redesign's PATCH /api/superadmin/job-postings/:id — approve or
	// reject a pending posting, flag an active one. Approving publishes it
	// (v1's status "published", with published_at).
	updateJobPosting: adminProcedure
		.input(z.object({ id: z.string(), action: z.string(), reason: z.string().nullish() }))
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const [existing] = await db.select({ status: job.status }).from(job).where(eq(job.id, input.id)).limit(1);
			if (!existing) throw new ORPCError("NOT_FOUND", { message: "Not found." });
			const reason = input.reason?.trim() ?? "";
			const now = sqliteTime(Date.now());
			if (input.action === "approve" || input.action === "reject") {
				if (existing.status !== JOB_STATUS.PENDING) bad("This posting isn't awaiting review.");
			} else if (input.action === "flag") {
				if (existing.status !== JOB_STATUS.PUBLISHED) bad("Only active postings can be flagged.");
			}
			let set: Record<string, unknown>;
			if (input.action === "approve") {
				set = { status: JOB_STATUS.PUBLISHED, isActive: true, publishedAt: now, rejectionReason: null, flagReason: null, flaggedAt: null };
			} else if (input.action === "reject") {
				if (!reason) bad("Give a reason for rejecting this posting.");
				set = { status: JOB_STATUS.REJECTED, rejectionReason: reason, flagReason: null, flaggedAt: null };
			} else if (input.action === "flag") {
				if (!reason) bad("Give a reason for flagging this posting.");
				set = { status: JOB_STATUS.FLAGGED, flagReason: reason, flaggedAt: now, rejectionReason: null };
			} else if (input.action === "dismiss_reports") {
				return { ok: true as const };
			} else {
				bad("Invalid action.");
			}
			await db.update(job).set(set).where(eq(job.id, input.id));
			const [row] = await db.select().from(job).where(eq(job.id, input.id)).limit(1);
			const [skills, benefits] = await Promise.all([namesByJob(db, [input.id], "skills"), namesByJob(db, [input.id], "benefits")]);
			return { posting: postingFromRow(row, { skills: skills.get(input.id) ?? [], benefits: benefits.get(input.id) ?? [] }) };
		}),

	// The redesign's getEmployersForSuperadmin: every company with its owner,
	// SSM review state, postings, applications and reply speed.
	// The redesign's PATCH /api/superadmin/users/[id]/company-limit: how many
	// companies one account may register — a whole number, or null for the
	// default. Lowering it below what they have deletes nothing; they just
	// can't add more until they're under it.
	setCompanyLimit: adminProcedure
		.input(z.object({ userId: z.string(), limit: z.number().nullable() }))
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const { limit } = input;
			if (limit !== null && !(Number.isInteger(limit) && limit >= 1 && limit <= MAX_COMPANY_LIMIT)) {
				throw new ORPCError("BAD_REQUEST", { message: `Enter a whole number from 1 to ${MAX_COMPANY_LIMIT}.` });
			}
			const [updated] = (await db
				.update(user)
				.set({ companyLimit: limit })
				.where(eq(user.id, input.userId))
				.returning({ id: user.id })) as { id: string }[];
			if (!updated) throw new ORPCError("NOT_FOUND", { message: "Not found." });
			return { companyLimit: await loadCompanyLimitInfo(db, input.userId) };
		}),

	listEmployers: adminProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const threeDaysAgo = sqliteTime(Date.now() - 3 * DAY);
		const companies = (await db
			.select({
				id: organization.id,
				userId: organization.createdByUserId,
				companyName: organization.displayName,
				logoKey: organization.companyLogo,
				ownerEmail: user.email,
				industry: organization.industry,
				ssmNumber: organization.ssmNumber,
				ssmDocumentKey: organization.ssmDocumentKey,
				ssmVerificationStatus: organization.ssmVerificationStatus,
				ssmVerifiedAt: organization.ssmVerifiedAt,
				ssmRejectionReason: organization.ssmRejectionReason,
				createdAt: organization.createdAt,
			})
			.from(organization)
			.leftJoin(user, eq(user.id, organization.createdByUserId))
			.orderBy(desc(organization.createdAt))) as AnyDb[];
		const ids = companies.map((c) => c.id as string);
		const [owners, addresses, postingCounts, applicationStats, responsiveness] = await Promise.all([
			// The registrant's "About you" (their membership row).
			inChunks(ids, (chunk) =>
				db
					.select({ organizationId: member.organizationId, userId: member.userId, name: member.name, email: member.email })
					.from(member)
					.where(and(inArray(member.organizationId, chunk), eq(member.accessLevel, "owner"))),
			) as Promise<AnyDb[]>,
			inChunks(ids, (chunk) =>
				db
					.select({ organizationId: organizationAddress.organizationId, city: organizationAddress.city, state: organizationAddress.state })
					.from(organizationAddress)
					.where(inArray(organizationAddress.organizationId, chunk))
					.orderBy(asc(organizationAddress.sortOrder)),
			) as Promise<AnyDb[]>,
			db.select({ organizationId: job.organizationId, value: count() }).from(job).groupBy(job.organizationId) as Promise<AnyDb[]>,
			db
				.select({
					organizationId: job.organizationId,
					applications: count(),
					waitingLong: sql<number>`sum(case when ${inArray(application.status, v1StatusesFor("applied"))} and ${application.dateApplied} < ${threeDaysAgo} then 1 else 0 end)`,
				})
				.from(application)
				.innerJoin(job, eq(job.id, application.jobId))
				.groupBy(job.organizationId) as Promise<AnyDb[]>,
			loadEmployerResponsiveness(db, ids),
		]);
		const limits = await loadCompanyLimitInfoFor(
			db,
			companies.map((c) => c.userId as string | null).filter((id): id is string => !!id),
		);
		return companies.map((c) => {
			const owner = owners.find((o) => o.organizationId === c.id && (!c.userId || o.userId === c.userId));
			const address = addresses.find((a) => a.organizationId === c.id);
			const stats = applicationStats.find((s) => s.organizationId === c.id);
			return {
				id: c.id as string,
				userId: (c.userId as string | null) ?? owner?.userId ?? null,
				companyName: c.companyName as string,
				logoUrl: fileUrl(context.origin, c.logoKey),
				contactName: (owner?.name as string | null) ?? "",
				contactEmail: (owner?.email as string | null) ?? "",
				email: (c.ownerEmail as string | null) ?? (owner?.email as string | null) ?? "",
				industry: (c.industry as string | null) ?? null,
				ssmNumber: (c.ssmNumber as string | null) ?? "",
				// Private files: the file route lets admins open them.
				ssmDocumentUrl: fileUrl(context.origin, c.ssmDocumentKey),
				ssmVerificationStatus: c.ssmVerificationStatus as string,
				ssmVerifiedAt: c.ssmVerifiedAt ? toIso(c.ssmVerifiedAt) : null,
				ssmRejectionReason: c.ssmRejectionReason ?? null,
				location: address ? `${address.city}, ${address.state}` : null,
				createdAt: toIso(c.createdAt),
				// The registrant's company limit ("Owner has 2 of 5 companies").
				ownerCompanyLimit: c.userId ? (limits.get(c.userId as string) ?? null) : null,
				jobPostingCount: postingCounts.find((p) => p.organizationId === c.id)?.value ?? 0,
				applicationCount: stats?.applications ?? 0,
				waitingLong: Number(stats?.waitingLong ?? 0),
				responsiveness: responsiveness.get(c.id) ?? null,
			};
		});
	}),

	// The redesign's PATCH /api/superadmin/employers/:id/ssm — verify or
	// reject a company's SSM document. (The redesign also notifies the
	// employer; v3 has no notifications yet.)
	updateEmployerSsm: adminProcedure
		.input(z.object({ id: z.string(), action: z.string(), reason: z.string().nullish() }))
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const [existing] = await db
				.select({ ssmDocumentKey: organization.ssmDocumentKey })
				.from(organization)
				.where(eq(organization.id, input.id))
				.limit(1);
			if (!existing) throw new ORPCError("NOT_FOUND", { message: "Not found." });
			if (!existing.ssmDocumentKey) bad("This company hasn't uploaded an SSM document.");
			const now = sqliteTime(Date.now());
			if (input.action === "verify") {
				await db
					.update(organization)
					.set({ ssmVerificationStatus: "verified", ssmVerifiedAt: now, ssmRejectionReason: null, updatedAt: now })
					.where(eq(organization.id, input.id));
				return { ok: true as const };
			}
			if (input.action === "reject") {
				const reason = input.reason?.trim();
				if (!reason) bad("Give a reason for rejecting this document.");
				await db
					.update(organization)
					.set({ ssmVerificationStatus: "rejected", ssmVerifiedAt: null, ssmRejectionReason: reason, updatedAt: now })
					.where(eq(organization.id, input.id));
				return { ok: true as const };
			}
			bad("Invalid action.");
		}),

	// v1's admin.listAccountDeletionRequests: requests only a platform admin
	// can approve (an hr manager's — in v3, whoever registered the company).
	listAccountDeletionRequests: adminProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const rows = (await db
			.select({
				id: accountDeletionRequests.id,
				userId: accountDeletionRequests.userId,
				organizationId: accountDeletionRequests.organizationId,
				requesterMemberRole: accountDeletionRequests.requesterMemberRole,
				reason: accountDeletionRequests.reason,
				createdAt: accountDeletionRequests.createdAt,
				requesterName: user.name,
				requesterEmail: user.email,
				organizationName: organization.displayName,
			})
			.from(accountDeletionRequests)
			.innerJoin(user, eq(accountDeletionRequests.userId, user.id))
			.leftJoin(organization, eq(accountDeletionRequests.organizationId, organization.id))
			.where(and(eq(accountDeletionRequests.status, "pending"), eq(accountDeletionRequests.requiredApproverRole, "superadmin")))
			.orderBy(desc(accountDeletionRequests.createdAt))) as AnyDb[];
		// The employer's own name is on their membership ("About you").
		const userIds = rows.map((r) => r.userId as string);
		const names = (await inChunks(userIds, (chunk) =>
			db.select({ userId: member.userId, name: member.name }).from(member).where(inArray(member.userId, chunk)),
		)) as { userId: string; name: string | null }[];
		const nameOf = new Map(names.filter((n) => n.name).map((n) => [n.userId, n.name as string]));
		return rows.map((r) => ({
			id: r.id as string,
			requesterName: nameOf.get(r.userId) ?? ((r.requesterName as string | null) || null),
			requesterEmail: r.requesterEmail as string,
			requesterMemberRole: (r.requesterMemberRole as string | null) ?? null,
			organizationName: (r.organizationName as string | null) ?? null,
			reason: (r.reason as string | null) ?? null,
			createdAt: toIso(r.createdAt as string),
		}));
	}),

	// v1's admin.reviewAccountDeletion: approve deletes the account (soft),
	// reject keeps it and records the reason.
	reviewAccountDeletion: adminProcedure
		.input(
			z.object({
				requestId: z.string(),
				action: z.enum(["approve", "reject"]),
				rejectionReason: z.string().max(500).optional(),
			}),
		)
		.handler(async ({ context, input }) =>
			reviewAccountDeletionRequest(context.db as AnyDb, {
				requestId: input.requestId,
				reviewerUserId: context.session.user.id,
				action: input.action,
				rejectionReason: input.rejectionReason,
				isSuperAdmin: true,
			}),
		),
};
