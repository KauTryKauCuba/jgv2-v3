import { accountDeletionRequests, member, session, user } from "@jobgiga-app/db/schema/auth";
import { APPLICATION_STATUS, application, job } from "@jobgiga-app/db/schema/jobs";
import { interviewPanel, interviews } from "@jobgiga-app/db/schema/interviews";
import { ORPCError } from "@orpc/server";
import { and, eq, ne, or, sql } from "drizzle-orm";

// v1's account deletion (packages/api/src/utils/account-deletion.ts and
// member-interviews.ts), on v3's injected db. The rules are v1's:
// - No company membership → the account is deleted straight away.
// - A company member files a request; who approves it depends on their
//   role (panelist/none → hr staff, hr staff → hr manager, hr manager →
//   a platform admin).
// - "Deleted" is a soft delete: user.deleted_at is set, sessions are
//   removed and memberships are marked deleted. Nothing else is erased.
// Left out from v1: TalentID token revoke (v3 isn't on TalentID yet) and
// push tokens (no mobile app in v3).

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

export type RequiredApproverRole = "self" | "hr staff" | "hr manager" | "superadmin";

const ORG_ROLE_RANK: Record<string, number> = { "hr manager": 4, "hr staff": 3, panelist: 2, none: 1 };
const COMPANY_MEMBER_ROLES = new Set(["hr manager", "hr staff", "panelist", "none"]);

export function getRequiredApproverForMemberRole(role: string): RequiredApproverRole {
	switch (role.toLowerCase()) {
		case "hr manager":
			return "superadmin";
		case "hr staff":
			return "hr manager";
		case "panelist":
		case "none":
			return "hr staff";
		default:
			return "self";
	}
}

export function canOrgMemberReviewDeletion(
	reviewerMemberRole: string,
	requiredApproverRole: string,
	requesterMemberRole: string,
): boolean {
	const reviewer = reviewerMemberRole.toLowerCase();
	const required = requiredApproverRole.toLowerCase();
	const requester = requesterMemberRole.toLowerCase();
	if (required === "superadmin") return false;
	if (reviewer === "hr manager") return required === "hr manager" || required === "hr staff";
	if (reviewer === "hr staff") return required === "hr staff" && (requester === "panelist" || requester === "none");
	return false;
}

type ActiveMembership = { id: string; role: string; organizationId: string };

async function activeMemberships(db: AnyDb, userId: string): Promise<ActiveMembership[]> {
	return db
		.select({ id: member.id, role: member.role, organizationId: member.organizationId })
		.from(member)
		.where(and(eq(member.userId, userId), eq(member.status, "active")));
}

export function resolvePrimaryMembership(memberships: ActiveMembership[], preferredOrganizationId?: string | null) {
	const company = memberships.filter((m) => COMPANY_MEMBER_ROLES.has(m.role.toLowerCase()));
	if (company.length === 0) return null;
	if (preferredOrganizationId) {
		const preferred = company.find((m) => m.organizationId === preferredOrganizationId);
		if (preferred) return preferred;
	}
	return company.reduce((best, current) =>
		(ORG_ROLE_RANK[current.role.toLowerCase()] ?? 0) > (ORG_ROLE_RANK[best.role.toLowerCase()] ?? 0) ? current : best,
	);
}

/** v1's member-interviews check: not while on interviews still in progress. */
async function assertMemberHasNoActiveInterviewApplications(db: AnyDb, memberId: string, organizationId: string, userId: string) {
	const [result] = await db
		.select({ count: sql<number>`count(distinct ${application.id})` })
		.from(application)
		.innerJoin(interviews, eq(interviews.applicationId, application.id))
		.innerJoin(job, eq(interviews.jobId, job.id))
		.leftJoin(interviewPanel, eq(interviewPanel.interviewId, interviews.id))
		.where(
			and(
				eq(job.organizationId, organizationId),
				ne(application.status, APPLICATION_STATUS.PASSED),
				ne(application.status, APPLICATION_STATUS.REJECTED),
				ne(application.status, APPLICATION_STATUS.REJECT),
				or(eq(interviewPanel.memberId, memberId), eq(interviewPanel.interviewerId, userId), eq(interviews.scheduledBy, userId)),
			),
		);
	if (Number(result?.count ?? 0) > 0) {
		throw new ORPCError("BAD_REQUEST", { message: "This employee is assigned to interviews that are still in progress." });
	}
}

export async function assertUserCanRequestDeletion(db: AnyDb, userId: string) {
	const [userRow] = await db.select({ id: user.id, deletedAt: user.deletedAt }).from(user).where(eq(user.id, userId)).limit(1);
	if (!userRow) throw new ORPCError("NOT_FOUND", { message: "User not found" });
	if (userRow.deletedAt) throw new ORPCError("CONFLICT", { message: "Account is already deleted" });

	const [pending] = await db
		.select({ id: accountDeletionRequests.id })
		.from(accountDeletionRequests)
		.where(and(eq(accountDeletionRequests.userId, userId), eq(accountDeletionRequests.status, "pending")))
		.limit(1);
	if (pending) throw new ORPCError("CONFLICT", { message: "An account deletion request is already pending" });

	for (const m of await activeMemberships(db, userId)) {
		if (COMPANY_MEMBER_ROLES.has(m.role.toLowerCase())) {
			await assertMemberHasNoActiveInterviewApplications(db, m.id, m.organizationId, userId);
		}
	}
}

export async function resolveDeletionPath(db: AnyDb, userId: string, preferredOrganizationId?: string | null) {
	const primary = resolvePrimaryMembership(await activeMemberships(db, userId), preferredOrganizationId);
	if (!primary) {
		return {
			canSelfDelete: true as const,
			requiredApproverRole: "self" as const,
			organizationId: null,
			requesterMemberRole: null,
		};
	}
	return {
		canSelfDelete: false as const,
		requiredApproverRole: getRequiredApproverForMemberRole(primary.role),
		organizationId: primary.organizationId,
		requesterMemberRole: primary.role,
	};
}

export async function executeAccountDeletion(
	db: AnyDb,
	options: { userId: string; reason?: string; requestId?: string; reviewedByUserId?: string },
) {
	const { userId, reason, requestId, reviewedByUserId } = options;
	const deletedAt = new Date().toISOString();
	// v1 uses a transaction; D1 has none, so one batch (atomic on both drivers).
	const queries = [
		db.update(user).set({ deletedAt, deletionReason: reason ?? null }).where(eq(user.id, userId)),
		db.delete(session).where(eq(session.userId, userId)),
		db
			.update(member)
			.set({ status: "deleted", deletedAt, userId: null })
			.where(and(eq(member.userId, userId), eq(member.status, "active"))),
	];
	if (requestId) {
		queries.push(
			db
				.update(accountDeletionRequests)
				.set({ status: "completed", reviewedAt: deletedAt, ...(reviewedByUserId && { reviewedByUserId }) })
				.where(eq(accountDeletionRequests.id, requestId)),
		);
	}
	await db.batch(queries);
	return { deletedAt };
}

export async function reviewAccountDeletionRequest(
	db: AnyDb,
	options: {
		requestId: string;
		reviewerUserId: string;
		action: "approve" | "reject";
		rejectionReason?: string;
		reviewerMemberRole?: string;
		isSuperAdmin?: boolean;
	},
) {
	const [requestRow] = await db
		.select()
		.from(accountDeletionRequests)
		.where(eq(accountDeletionRequests.id, options.requestId))
		.limit(1);
	if (!requestRow) throw new ORPCError("NOT_FOUND", { message: "Account deletion request not found" });
	if (requestRow.status !== "pending") {
		throw new ORPCError("BAD_REQUEST", { message: `Request is already ${requestRow.status}` });
	}

	if (options.action === "reject") {
		await db
			.update(accountDeletionRequests)
			.set({
				status: "rejected",
				reviewedByUserId: options.reviewerUserId,
				reviewedAt: new Date().toISOString(),
				rejectionReason: options.rejectionReason ?? null,
			})
			.where(eq(accountDeletionRequests.id, options.requestId));
		return { success: true, status: "rejected" as const, requestId: options.requestId };
	}

	if (requestRow.requiredApproverRole === "superadmin") {
		if (!options.isSuperAdmin) {
			throw new ORPCError("FORBIDDEN", { message: "Only platform admins can approve this deletion request" });
		}
	} else {
		if (!options.reviewerMemberRole || !requestRow.organizationId) {
			throw new ORPCError("FORBIDDEN", { message: "Organization context required" });
		}
		if (
			!canOrgMemberReviewDeletion(options.reviewerMemberRole, requestRow.requiredApproverRole, requestRow.requesterMemberRole ?? "")
		) {
			throw new ORPCError("FORBIDDEN", { message: "You are not authorized to approve this deletion request" });
		}
		const [reviewer] = await db
			.select({ id: member.id })
			.from(member)
			.where(
				and(
					eq(member.userId, options.reviewerUserId),
					eq(member.organizationId, requestRow.organizationId),
					eq(member.status, "active"),
				),
			)
			.limit(1);
		if (!reviewer) throw new ORPCError("FORBIDDEN", { message: "You are not a member of this organization" });
	}

	const { deletedAt } = await executeAccountDeletion(db, {
		userId: requestRow.userId,
		reason: requestRow.reason ?? undefined,
		requestId: requestRow.id,
		reviewedByUserId: options.reviewerUserId,
	});
	return { success: true, status: "completed" as const, requestId: options.requestId, deletedAt };
}
