import { accountDeletionRequests, jobseekerProfile, member, organization, user } from "@jobgiga-app/db/schema/auth";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import {
	assertUserCanRequestDeletion,
	executeAccountDeletion,
	resolveDeletionPath,
} from "../lib/account/deletion";
import { loadMemberships, pickMembership } from "../lib/employer/memberships";
import { fileUrl } from "../lib/uploads";
import { type TeamRole, toTeamRole } from "../shared/team-roles";

// biome-ignore lint: context.db is driver-specific (D1 vs bun-sqlite); both
// satisfy the same drizzle query shape at runtime, so this stays loosely
// typed here, same as packages/auth's drizzleAdapter call.
type AnyDb = any;

export const authRouter = {
	// Gates "Sign in" to accounts that actually exist, matching the
	// redesign's otp/request route (sign-in without a `role` 404s with
	// ACCOUNT_NOT_FOUND_MESSAGE when no account is found) and v1 (signing in
	// requires a prior sign-up) — unlike Better-Auth's emailOTP plugin on its
	// own, which happily creates an account on first OTP verify regardless
	// of which button sent the request. "Get started" skips this check.
	accountExists: publicProcedure
		.input(z.object({ email: z.string().email() }))
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const [existing] = await db
				.select({ id: user.id, deletedAt: user.deletedAt })
				.from(user)
				.where(eq(user.email, input.email.trim().toLowerCase()))
				.limit(1);
			// v1 refuses deleted accounts at sign-in ("This account has been
			// deleted."); the modal shows that before sending a code.
			return { exists: Boolean(existing), deleted: Boolean(existing?.deletedAt) };
		}),

	// The redesign's /api/auth/me: what the navbar shows for the signed-in
	// account — name, photo (the saved profile's, else the account's own,
	// e.g. from Google) and whether the phone is verified (the avatar's seal).
	me: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const [account] = await db
			.select({ name: user.name, email: user.email, image: user.image, phoneVerified: user.phoneVerified })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);
		const [profile] = await db
			.select({ fullName: jobseekerProfile.fullName, avatarKey: jobseekerProfile.avatarKey })
			.from(jobseekerProfile)
			.where(eq(jobseekerProfile.userId, userId))
			.limit(1);
		// An employer's name is on their company membership ("About you").
		const [membership] = await db
			.select({ name: member.name })
			.from(member)
			.where(eq(member.userId, userId))
			.limit(1);
		// The redesign's resolveEmployerBadge + per-role name/avatar: on the
		// employer side the navbar shows the current company's logo with the
		// person's own photo over its corner, and "position · role" under the
		// name — for the company picked in the switcher.
		let employer: {
			name: string | null;
			avatarUrl: string | null;
			companyLogoUrl: string | null;
			position: string | null;
			teamRole: TeamRole;
		} | null = null;
		const current = pickMembership(await loadMemberships(db, userId), context.activeOrganizationId);
		if (current) {
			const [row] = (await db
				.select({
					name: member.name,
					avatarKey: member.avatarKey,
					position: member.positionTitle,
					logo: organization.companyLogo,
				})
				.from(member)
				.innerJoin(organization, eq(organization.id, member.organizationId))
				.where(eq(member.id, current.memberId))
				.limit(1)) as AnyDb[];
			// v3 keeps a teammate's own name/photo on their membership row too
			// (team.saveMyProfile), so the membership comes first either way.
			employer = {
				name: (row?.name as string | null) || ((account?.name as string | null) ?? null),
				avatarUrl: fileUrl(context.origin, row?.avatarKey) ?? ((account?.image as string | null) ?? null),
				companyLogoUrl: fileUrl(context.origin, row?.logo),
				position: (row?.position as string | null) ?? null,
				teamRole: toTeamRole(current.role, current.accessLevel),
			};
		}
		return {
			name:
				(profile?.fullName as string | undefined) ||
				(account?.name as string | undefined) ||
				(membership?.name as string | undefined) ||
				null,
			email: (account?.email as string | undefined) ?? context.session.user.email,
			avatarUrl: fileUrl(context.origin, profile?.avatarKey) ?? (account?.image as string | null | undefined) ?? null,
			phoneVerified: Boolean(account?.phoneVerified),
			// v1's platform admins see the navbar's "Superadmin panel" link.
			isSuperadmin: (context.session.user as { role?: string | null }).role === "admin",
			employer,
		};
	}),

	// v1's auth.requestAccountDeletion. No company → deleted now (soft:
	// user.deleted_at, sessions removed). A company member → a request for
	// whoever is above them (an hr manager's goes to a platform admin).
	requestAccountDeletion: protectedProcedure
		.input(
			z.object({
				confirm: z.literal(true),
				reason: z.string().max(500).optional(),
				organizationId: z.string().optional(),
			}),
		)
		.handler(async ({ context, input }) => {
			const db = context.db as AnyDb;
			const userId = context.session.user.id;
			if ((context.session.user as { role?: string | null }).role === "admin") {
				throw new ORPCError("FORBIDDEN", { message: "Platform admin accounts cannot be deleted via self-service." });
			}
			await assertUserCanRequestDeletion(db, userId);
			const path = await resolveDeletionPath(db, userId, input.organizationId ?? null);
			if (path.canSelfDelete) {
				const { deletedAt } = await executeAccountDeletion(db, { userId, reason: input.reason });
				return { status: "completed" as const, deletedAt };
			}
			const requestId = crypto.randomUUID();
			await db.insert(accountDeletionRequests).values({
				id: requestId,
				userId,
				organizationId: path.organizationId,
				requesterMemberRole: path.requesterMemberRole,
				requiredApproverRole: path.requiredApproverRole,
				status: "pending",
				reason: input.reason ?? null,
			});
			return {
				status: "pending" as const,
				requestId,
				requiredApprover: path.requiredApproverRole,
				organizationId: path.organizationId,
			};
		}),

	// v1's auth.getAccountDeletionStatus: the latest request, if any.
	getAccountDeletionStatus: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const [latest] = await db
			.select({
				id: accountDeletionRequests.id,
				status: accountDeletionRequests.status,
				requiredApproverRole: accountDeletionRequests.requiredApproverRole,
				organizationId: accountDeletionRequests.organizationId,
				rejectionReason: accountDeletionRequests.rejectionReason,
				createdAt: accountDeletionRequests.createdAt,
				reviewedAt: accountDeletionRequests.reviewedAt,
			})
			.from(accountDeletionRequests)
			.where(eq(accountDeletionRequests.userId, userId))
			.orderBy(desc(accountDeletionRequests.createdAt))
			.limit(1);
		const [userRow] = await db.select({ deletedAt: user.deletedAt }).from(user).where(eq(user.id, userId)).limit(1);
		if (userRow?.deletedAt) return { status: "completed" as const, deletedAt: userRow.deletedAt as string, request: null };
		if (!latest) return { status: "none" as const, request: null };
		return {
			status: latest.status as "pending" | "approved" | "rejected" | "canceled" | "completed",
			request: latest as {
				id: string;
				status: string;
				requiredApproverRole: string;
				organizationId: string | null;
				rejectionReason: string | null;
				createdAt: string;
				reviewedAt: string | null;
			},
		};
	}),

	// v1's auth.cancelAccountDeletion.
	cancelAccountDeletion: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const [pending] = await db
			.select({ id: accountDeletionRequests.id })
			.from(accountDeletionRequests)
			.where(and(eq(accountDeletionRequests.userId, userId), eq(accountDeletionRequests.status, "pending")))
			.limit(1);
		if (!pending) throw new ORPCError("NOT_FOUND", { message: "No pending account deletion request found" });
		await db.update(accountDeletionRequests).set({ status: "canceled" }).where(eq(accountDeletionRequests.id, pending.id));
		return { success: true, requestId: pending.id as string };
	}),
};
