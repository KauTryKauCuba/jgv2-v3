import { invitation, member, organization, organizationAddress, organizationBadge, teamActivity, user } from "@jobgiga-app/db/schema/auth";
import { job, jobHiringManagers } from "@jobgiga-app/db/schema/jobs";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, inArray, ne, or } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import { canOrgMemberReviewDeletion, reviewAccountDeletionRequest } from "../lib/account/deletion";
import { loadEmployerAccess } from "../lib/employer/dashboard";
import { actorLabel, setMemberJobAssignments, teamActivityInsert } from "../lib/employer/scope";
import { fileUrl, isBase64DataUrl, keyFromFileUrl, saveBase64Upload } from "../lib/uploads";
import { CONTACT_ROLES } from "../shared/positions";
import { isTeamRole, type TeamRole, toTeamRole, V1_MEMBER_FOR_ROLE } from "../shared/team-roles";
import { toIso } from "../shared/application-status";
import { accountDeletionRequests } from "@jobgiga-app/db/schema/auth";

// The redesign's Team page and invites (api/employer/team/*, api/invite/*,
// the welcome step's api/employer/me) on v1's tables:
// - member      → the team (role + access_level per shared/team-roles.ts;
//                 status "pending" for an invite not yet accepted)
// - invitation  → the invite itself (token hash, expiry, inviter, role, position)
// - job_hiring_managers, team_activity → v3 tables in v1's style
// Same rules and messages as the redesign. Invite emails: v3 has no email
// sender yet (Resend key), so the link is printed in the API log, like
// sign-in codes. Not in v3 yet: notifications.

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

const INVITE_TTL_DAYS = 7;
const MAX_NAME_LENGTH = 80;
const MAX_POSITION_LENGTH = 120;
const MAX_PHONE_LENGTH = 30;

const sqliteNow = () => new Date().toISOString().replace("T", " ").slice(0, 19);

function bad(message: string): never {
	throw new ORPCError("BAD_REQUEST", { message });
}
function notFound(): never {
	throw new ORPCError("NOT_FOUND", { message: "Not found." });
}

function base64url(bytes: Uint8Array) {
	let s = "";
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hashToken(token: string) {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The redesign's newInviteToken: email the token, store its hash. */
async function newInviteToken() {
	const token = base64url(crypto.getRandomValues(new Uint8Array(24)));
	return {
		token,
		hash: await hashToken(token),
		expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
	};
}

/** Stands in for the redesign's sendTeamInviteEmail until an email sender is set up. */
function sendInviteLink(webOrigin: string, email: string, companyName: string, inviter: string, role: TeamRole, token: string) {
	console.log(`[team] Invite for ${email} to ${companyName} as ${role} (from ${inviter}): ${webOrigin}/invite/${token}`);
}

function webOriginOf(headers: Headers) {
	return headers.get("origin") ?? "http://localhost:4400";
}

/** The redesign's requireTeamAccess: Owners and Admins only. */
async function requireTeamAccess(db: AnyDb, userId: string, activeOrganizationId: string | null) {
	const access = await loadEmployerAccess(db, userId, activeOrganizationId);
	if (!access) throw new ORPCError("UNAUTHORIZED", { message: "Not signed in as an employer." });
	if (!access.fullAccess) throw new ORPCError("FORBIDDEN", { message: "Only an owner or admin can manage the team." });
	const [org] = (await db
		.select({ name: organization.displayName, createdByUserId: organization.createdByUserId })
		.from(organization)
		.where(eq(organization.id, access.organizationId))
		.limit(1)) as AnyDb[];
	return { ...access, userId, companyName: (org?.name as string) ?? "", registrantUserId: (org?.createdByUserId as string | null) ?? null };
}

/** The redesign's getEmployerTeamMembers: joined members and pending invites. */
async function loadTeam(db: AnyDb, origin: string, organizationId: string, registrantUserId: string | null) {
	const rows = (await db
		.select({
			id: member.id,
			userId: member.userId,
			email: member.email,
			role: member.role,
			accessLevel: member.accessLevel,
			position: member.positionTitle,
			status: member.status,
			createdAt: member.createdAt,
			name: member.name,
			avatarKey: member.avatarKey,
			accountName: user.name,
			accountEmail: user.email,
			accountImage: user.image,
			inviteExpiresAt: invitation.expiresAt,
			invitedAt: invitation.createdAt,
		})
		.from(member)
		.leftJoin(user, eq(user.id, member.userId))
		.leftJoin(invitation, eq(invitation.id, member.invitationId))
		.where(and(eq(member.organizationId, organizationId), or(eq(member.status, "active"), eq(member.status, "pending"))))
		.orderBy(asc(member.createdAt))) as AnyDb[];
	const members = rows.map((r) => ({
		id: r.id as string,
		userId: (r.userId as string | null) ?? null,
		email: ((r.email as string | null) || (r.accountEmail as string | null)) ?? "",
		role: toTeamRole(r.role, r.accessLevel),
		position: (r.position as string | null) ?? null,
		status: r.status as "active" | "pending",
		invitedAt: toIso(r.invitedAt ?? r.createdAt),
		joinedAt: r.status === "active" ? toIso(r.createdAt) : null,
		name: ((r.name as string | null) || (r.accountName as string | null)) ?? null,
		avatarUrl: fileUrl(origin, r.avatarKey) ?? (r.accountImage as string | null) ?? null,
		inviteExpiresAt: r.status === "pending" && r.inviteExpiresAt ? toIso(r.inviteExpiresAt) : null,
		// The person who registered the company (its main contact).
		isRegistrant: !!r.userId && r.userId === registrantUserId,
	}));
	// Owners first, then by who was invited earliest (the redesign's order).
	return members.sort((a, b) => Number(b.role === "owner") - Number(a.role === "owner"));
}

async function loadActivity(db: AnyDb, organizationId: string) {
	const rows = (await db
		.select()
		.from(teamActivity)
		.where(eq(teamActivity.organizationId, organizationId))
		.orderBy(desc(teamActivity.createdAt))
		.limit(30)) as AnyDb[];
	return rows.map((r) => ({
		id: r.id as string,
		actorUserId: (r.actorUserId as string | null) ?? null,
		actorLabel: r.actorLabel as string,
		action: r.action as string,
		targetEmail: r.targetEmail as string,
		fromRole: (r.fromRole as TeamRole | null) ?? null,
		toRole: (r.toRole as TeamRole | null) ?? null,
		detail: (r.detail as string | null) ?? null,
		createdAt: toIso(r.createdAt),
	}));
}

/** The redesign's getMemberJobAssignments: member id → their jobs. */
async function loadAssignments(db: AnyDb, organizationId: string) {
	const rows = (await db
		.select({ memberId: jobHiringManagers.memberId, id: job.id, title: job.title })
		.from(jobHiringManagers)
		.innerJoin(job, eq(job.id, jobHiringManagers.jobId))
		.where(eq(job.organizationId, organizationId))
		.orderBy(asc(job.title))) as { memberId: string; id: string; title: string }[];
	const out: Record<string, { id: string; title: string }[]> = {};
	for (const { memberId, ...j } of rows) (out[memberId] ??= []).push(j);
	return out;
}

async function loadMember(db: AnyDb, organizationId: string, id: string) {
	const [row] = (await db
		.select()
		.from(member)
		.where(and(eq(member.id, id), eq(member.organizationId, organizationId), or(eq(member.status, "active"), eq(member.status, "pending"))))
		.limit(1)) as AnyDb[];
	if (!row) notFound();
	return { ...row, teamRole: toTeamRole(row.role, row.accessLevel) } as AnyDb & { teamRole: TeamRole };
}

async function ownerCount(db: AnyDb, organizationId: string, excludingMemberId: string) {
	const rows = (await db
		.select({ id: member.id })
		.from(member)
		.where(
			and(
				eq(member.organizationId, organizationId),
				eq(member.accessLevel, "owner"),
				or(eq(member.status, "active"), eq(member.status, "pending")),
				ne(member.id, excludingMemberId),
			),
		)) as AnyDb[];
	return rows.length;
}

/** The redesign's findInviteByToken. */
async function findInvite(db: AnyDb, token: string) {
	if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
	const [row] = (await db
		.select({
			invitationId: invitation.id,
			invitationStatus: invitation.status,
			expiresAt: invitation.expiresAt,
			inviterId: invitation.inviterId,
			email: invitation.email,
			organizationId: invitation.organizationId,
			memberId: member.id,
			memberStatus: member.status,
			role: member.role,
			accessLevel: member.accessLevel,
			companyName: organization.displayName,
			companyLogo: organization.companyLogo,
		})
		.from(invitation)
		.innerJoin(organization, eq(organization.id, invitation.organizationId))
		.leftJoin(member, eq(member.invitationId, invitation.id))
		.where(eq(invitation.tokenHash, await hashToken(token)))
		.limit(1)) as AnyDb[];
	if (!row || !row.memberId || (row.memberStatus !== "pending" && row.memberStatus !== "active")) return null;
	const state: "pending" | "expired" | "accepted" =
		row.memberStatus === "active" ? "accepted" : Date.parse(toIso(row.expiresAt)) < Date.now() ? "expired" : "pending";
	return { ...row, state, teamRole: toTeamRole(row.role, row.accessLevel) } as AnyDb & {
		state: "pending" | "expired" | "accepted";
		teamRole: TeamRole;
	};
}

/**
 * The redesign's activatePendingTeamInvites: every live invite for this
 * email becomes an active membership, logged as "joined".
 */
async function activatePendingInvites(db: AnyDb, userId: string, email: string, onlyInvitationId?: string) {
	const rows = (await db
		.select({
			memberId: member.id,
			organizationId: member.organizationId,
			role: member.role,
			accessLevel: member.accessLevel,
			invitationId: invitation.id,
			expiresAt: invitation.expiresAt,
		})
		.from(member)
		.innerJoin(invitation, eq(invitation.id, member.invitationId))
		.where(and(eq(member.status, "pending"), eq(invitation.email, email.toLowerCase())))) as AnyDb[];
	const live = rows.filter(
		(r) => Date.parse(toIso(r.expiresAt)) >= Date.now() && (!onlyInvitationId || r.invitationId === onlyInvitationId),
	);
	if (live.length === 0) return 0;
	const now = sqliteNow();
	await db.batch(
		live.flatMap((r) => [
			db.update(member).set({ status: "active", userId, createdAt: now }).where(eq(member.id, r.memberId)),
			db.update(invitation).set({ status: "accepted" }).where(eq(invitation.id, r.invitationId)),
			teamActivityInsert(db, {
				organizationId: r.organizationId,
				actorUserId: userId,
				actorLabel: email,
				action: "joined",
				targetEmail: email,
				toRole: toTeamRole(r.role, r.accessLevel),
			}),
		]),
	);
	return live.length;
}

export const teamRouter = {
	// The redesign's GET /api/employer/team plus the Team page's own data.
	list: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const auth = await requireTeamAccess(db, context.session.user.id, context.activeOrganizationId);
		const [members, activity, jobAssignments, postings] = await Promise.all([
			loadTeam(db, context.origin, auth.organizationId, auth.registrantUserId),
			loadActivity(db, auth.organizationId),
			loadAssignments(db, auth.organizationId),
			db
				.select({ id: job.id, title: job.title, status: job.status })
				.from(job)
				.where(eq(job.organizationId, auth.organizationId))
				.orderBy(desc(job.createdAt)) as Promise<AnyDb[]>,
		]);
		const registrant = members.find((m) => m.userId && m.userId === auth.registrantUserId);
		return {
			// isRegistrant: the person who registered the company (its main contact).
			members,
			activity,
			jobAssignments,
			jobPostings: postings.map((p) => ({
				id: p.id as string,
				title: p.title as string,
				status: p.status === "published" ? "active" : (p.status as string),
			})),
			currentUserId: auth.userId,
			currentUserRole: auth.teamRole,
			ownerPosition: registrant?.position ?? null,
		};
	}),

	// The redesign's POST /api/employer/team: invite someone.
	invite: protectedProcedure
		.input(
			z.object({
				email: z.string(),
				role: z.string().optional(),
				position: z.string().nullish(),
				jobPostingIds: z.array(z.string()).optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const auth = await requireTeamAccess(db, context.session.user.id, context.activeOrganizationId);
			if (!input.email.trim().includes("@")) bad("Enter a valid email.");
			const email = input.email.trim().toLowerCase();
			const role = input.role ?? "admin";
			if (!isTeamRole(role)) bad("Invalid role.");
			const position = input.position?.trim() || null;
			if (role === "owner" && auth.teamRole !== "owner") {
				throw new ORPCError("FORBIDDEN", { message: "Only an owner can invite someone as an owner." });
			}
			const initialJobIds = role === "hiring_manager" ? [...new Set(input.jobPostingIds ?? [])] : [];
			if (initialJobIds.length > 0) {
				const found = (await db
					.select({ id: job.id })
					.from(job)
					.where(and(eq(job.organizationId, auth.organizationId), inArray(job.id, initialJobIds)))) as AnyDb[];
				if (found.length !== initialJobIds.length) {
					bad("One of the chosen job postings no longer exists. Refresh and pick again.");
				}
			}
			// The redesign's unique (company, email): already invited or on the team.
			const [taken] = (await db
				.select({ id: member.id })
				.from(member)
				.leftJoin(user, eq(user.id, member.userId))
				.where(
					and(
						eq(member.organizationId, auth.organizationId),
						or(eq(member.status, "active"), eq(member.status, "pending")),
						or(eq(member.email, email), eq(user.email, email)),
					),
				)
				.limit(1)) as AnyDb[];
			if (taken) throw new ORPCError("CONFLICT", { message: "That email is already invited or on the team." });

			const invite = await newInviteToken();
			const invitationId = crypto.randomUUID();
			const memberId = crypto.randomUUID();
			const v1 = V1_MEMBER_FOR_ROLE[role];
			const label = await actorLabel(db, auth.userId);
			await db.batch([
				db.insert(invitation).values({
					id: invitationId,
					organizationId: auth.organizationId,
					email,
					role,
					position,
					status: "pending",
					inviterId: auth.userId,
					expiresAt: invite.expiresAt,
					tokenHash: invite.hash,
				}),
				db.insert(member).values({
					id: memberId,
					organizationId: auth.organizationId,
					userId: null,
					email,
					role: v1.role,
					accessLevel: v1.accessLevel,
					positionTitle: position,
					invitationId,
					status: "pending",
				}),
				db
					.insert(organizationBadge)
					.values({ id: crypto.randomUUID(), organizationId: auth.organizationId, badgeKey: "team_builder" })
					.onConflictDoNothing(),
				teamActivityInsert(db, {
					organizationId: auth.organizationId,
					actorUserId: auth.userId,
					actorLabel: label,
					action: "invited",
					targetEmail: email,
					toRole: role,
				}),
			]);
			if (initialJobIds.length > 0) {
				await setMemberJobAssignments(db, {
					organizationId: auth.organizationId,
					memberId,
					memberEmail: email,
					jobIds: initialJobIds,
					actorUserId: auth.userId,
				});
			}
			sendInviteLink(webOriginOf(context.headers), email, auth.companyName, label, role, invite.token);
			const [members, jobAssignments] = await Promise.all([
				loadTeam(db, context.origin, auth.organizationId, auth.registrantUserId),
				loadAssignments(db, auth.organizationId),
			]);
			return { members, jobAssignments };
		}),

	// The redesign's PATCH /api/employer/team/<id>: change someone's role.
	changeRole: protectedProcedure.input(z.object({ id: z.string(), role: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const auth = await requireTeamAccess(db, context.session.user.id, context.activeOrganizationId);
		if (!isTeamRole(input.role)) bad("Invalid role.");
		const role = input.role;
		const target = await loadMember(db, auth.organizationId, input.id);
		if ((role === "owner" || target.teamRole === "owner") && auth.teamRole !== "owner") {
			throw new ORPCError("FORBIDDEN", { message: "Only an owner can change an owner's role." });
		}
		if (target.teamRole === "owner" && role !== "owner" && (await ownerCount(db, auth.organizationId, target.id)) === 0) {
			bad("A company needs at least one owner.");
		}
		const queries: unknown[] = [];
		// Demoting the registrant hands the registration to the owner making the change.
		if (target.teamRole === "owner" && role !== "owner" && target.userId && target.userId === auth.registrantUserId) {
			if (target.userId === auth.userId) bad("Ask another owner to change your role.");
			queries.push(db.update(organization).set({ createdByUserId: auth.userId }).where(eq(organization.id, auth.organizationId)));
		}
		const v1 = V1_MEMBER_FOR_ROLE[role];
		queries.push(db.update(member).set({ role: v1.role, accessLevel: v1.accessLevel }).where(eq(member.id, target.id)));
		// Job assignments only mean something for a Hiring manager.
		if (target.teamRole === "hiring_manager" && role !== "hiring_manager") {
			queries.push(db.delete(jobHiringManagers).where(eq(jobHiringManagers.memberId, target.id)));
		}
		if (role !== target.teamRole) {
			queries.push(
				teamActivityInsert(db, {
					organizationId: auth.organizationId,
					actorUserId: auth.userId,
					actorLabel: await actorLabel(db, auth.userId),
					action: "role_changed",
					targetEmail: target.email ?? "",
					fromRole: target.teamRole,
					toRole: role,
				}),
			);
		}
		await db.batch(queries);
		return { ok: true as const };
	}),

	// The redesign's DELETE /api/employer/team/<id>: remove someone (or
	// cancel their invite). v1's soft removal: the membership is marked deleted.
	remove: protectedProcedure.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const auth = await requireTeamAccess(db, context.session.user.id, context.activeOrganizationId);
		const target = await loadMember(db, auth.organizationId, input.id);
		if (target.teamRole === "owner" && auth.teamRole !== "owner") {
			throw new ORPCError("FORBIDDEN", { message: "Only an owner can remove an owner." });
		}
		if (target.teamRole === "owner" && (await ownerCount(db, auth.organizationId, target.id)) === 0) {
			bad("A company needs at least one owner.");
		}
		if (target.userId && target.userId === auth.userId) bad("You can't remove yourself.");
		const now = sqliteNow();
		const queries: unknown[] = [];
		if (target.userId && target.userId === auth.registrantUserId) {
			queries.push(db.update(organization).set({ createdByUserId: auth.userId }).where(eq(organization.id, auth.organizationId)));
		}
		queries.push(
			db.update(member).set({ status: "deleted", deletedAt: now }).where(eq(member.id, target.id)),
			db.delete(jobHiringManagers).where(eq(jobHiringManagers.memberId, target.id)),
			teamActivityInsert(db, {
				organizationId: auth.organizationId,
				actorUserId: auth.userId,
				actorLabel: await actorLabel(db, auth.userId),
				action: "removed",
				targetEmail: target.email ?? "",
				fromRole: target.teamRole,
			}),
		);
		if (target.invitationId && target.status === "pending") {
			queries.push(db.update(invitation).set({ status: "canceled" }).where(eq(invitation.id, target.invitationId)));
		}
		await db.batch(queries);
		return { ok: true as const };
	}),

	// The redesign's POST /api/employer/team/<id>/resend: a fresh link and a fresh 7 days.
	resendInvite: protectedProcedure.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const auth = await requireTeamAccess(db, context.session.user.id, context.activeOrganizationId);
		const target = await loadMember(db, auth.organizationId, input.id);
		if (target.status !== "pending" || !target.invitationId) bad("That person has already joined.");
		const invite = await newInviteToken();
		const label = await actorLabel(db, auth.userId);
		await db.batch([
			db
				.update(invitation)
				.set({ tokenHash: invite.hash, expiresAt: invite.expiresAt, inviterId: auth.userId })
				.where(eq(invitation.id, target.invitationId)),
			teamActivityInsert(db, {
				organizationId: auth.organizationId,
				actorUserId: auth.userId,
				actorLabel: label,
				action: "resent_invite",
				targetEmail: target.email ?? "",
				toRole: target.teamRole,
			}),
		]);
		sendInviteLink(webOriginOf(context.headers), target.email ?? "", auth.companyName, label, target.teamRole, invite.token);
		return { ok: true as const };
	}),

	// The redesign's PUT /api/employer/team/<id>/jobs: a Hiring manager's jobs.
	setJobs: protectedProcedure
		.input(z.object({ id: z.string(), jobPostingIds: z.array(z.string()) }))
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const auth = await requireTeamAccess(db, context.session.user.id, context.activeOrganizationId);
			const target = await loadMember(db, auth.organizationId, input.id);
			if (target.teamRole !== "hiring_manager") bad("Only a Hiring manager is assigned to specific jobs.");
			const result = await setMemberJobAssignments(db, {
				organizationId: auth.organizationId,
				memberId: target.id,
				memberEmail: target.email ?? "",
				jobIds: input.jobPostingIds,
				actorUserId: auth.userId,
			});
			if (!result.ok) bad(result.error);
			return { ok: true as const };
		}),

	// ── The invite link (/invite/<token>) ──

	// The redesign's /invite/[token] page data.
	lookupInvite: publicProcedure.input(z.object({ token: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const invite = await findInvite(db, input.token);
		if (!invite) return { state: "invalid" as const };
		return {
			state: invite.state,
			email: invite.email as string,
			role: invite.teamRole,
			companyName: invite.companyName as string,
			companyLogoUrl: fileUrl(context.origin, invite.companyLogo),
			inviterName: invite.inviterId ? await actorLabel(db, invite.inviterId) : null,
		};
	}),

	// The redesign's POST /api/invite/<token>/accept, for someone signed in.
	// Signed in as the invited email → joins. Anyone else → "wrong_account"
	// (the page signs them out and opens Sign in with the invited email).
	acceptInvite: protectedProcedure.input(z.object({ token: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const invite = await findInvite(db, input.token);
		if (!invite || invite.state === "expired") return { result: "unavailable" as const };
		const email = context.session.user.email.toLowerCase();
		if (email !== String(invite.email).toLowerCase()) return { result: "wrong_account" as const, email: invite.email as string };
		if (invite.state === "pending") await activatePendingInvites(db, context.session.user.id, email, invite.invitationId);
		return { result: "joined" as const };
	}),

	// The redesign's POST /api/invite/<token>/decline — no sign-in needed:
	// having the link is proof of the inbox.
	declineInvite: publicProcedure.input(z.object({ token: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const invite = await findInvite(db, input.token);
		if (!invite || invite.state !== "pending") return { declined: false };
		await db.batch([
			db.update(member).set({ status: "deleted", deletedAt: sqliteNow() }).where(eq(member.id, invite.memberId)),
			db.update(invitation).set({ status: "rejected" }).where(eq(invitation.id, invite.invitationId)),
			db.delete(jobHiringManagers).where(eq(jobHiringManagers.memberId, invite.memberId)),
			teamActivityInsert(db, {
				organizationId: invite.organizationId,
				actorUserId: invite.inviterId,
				actorLabel: invite.email,
				action: "declined",
				targetEmail: invite.email,
			}),
		]);
		return { declined: true };
	}),

	// The redesign's sign-in step (activatePendingTeamInvites): joins every
	// live invite for the signed-in email. Call right after signing in.
	joinPendingInvites: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const joined = await activatePendingInvites(db, context.session.user.id, context.session.user.email);
		return { joined };
	}),

	// ── The invited teammate's own "About you" (welcome step / My Profile) ──

	// The redesign's /employer/welcome page data.
	myMembership: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const access = await loadEmployerAccess(db, userId, context.activeOrganizationId);
		if (!access) notFound();
		const [[row], [org], [account], addresses] = await Promise.all([
			db
				.select({
					name: member.name,
					position: member.positionTitle,
					hiringRole: member.contactRole,
					phone: member.phoneNumber,
					avatarKey: member.avatarKey,
					profileCompletedAt: member.profileCompletedAt,
					invitationId: member.invitationId,
					inviterId: invitation.inviterId,
				})
				.from(member)
				.leftJoin(invitation, eq(invitation.id, member.invitationId))
				.where(eq(member.id, access.memberId))
				.limit(1) as Promise<AnyDb[]>,
			db
				.select({
					name: organization.displayName,
					logo: organization.companyLogo,
					industry: organization.industry,
					companySize: organization.companySize,
					createdByUserId: organization.createdByUserId,
				})
				.from(organization)
				.where(eq(organization.id, access.organizationId))
				.limit(1) as Promise<AnyDb[]>,
			db.select({ name: user.name, email: user.email, image: user.image }).from(user).where(eq(user.id, userId)).limit(1) as Promise<AnyDb[]>,
			db
				.select()
				.from(organizationAddress)
				.where(eq(organizationAddress.organizationId, access.organizationId)) as Promise<AnyDb[]>,
		]);
		const isRegistrant = org?.createdByUserId === userId || !row?.invitationId;
		const main = addresses.find((a) => a.isJobDefault) ?? addresses[0];
		const [contact] = org?.createdByUserId
			? ((await db
					.select({ name: member.name })
					.from(member)
					.where(and(eq(member.organizationId, access.organizationId), eq(member.userId, org.createdByUserId)))
					.limit(1)) as AnyDb[])
			: [];
		return {
			isRegistrant,
			needsWelcome: !isRegistrant && !row?.profileCompletedAt,
			role: access.teamRole,
			company: {
				name: (org?.name as string) ?? "",
				logoUrl: fileUrl(context.origin, org?.logo),
				industry: (org?.industry as string | null) ?? null,
				companySize: (org?.companySize as string | null) ?? null,
				location: main ? `${main.city}, ${main.state}` : null,
				contactName: (contact?.name as string | null) ?? null,
			},
			inviterName: row?.inviterId ? await actorLabel(db, row.inviterId) : null,
			profile: {
				name: ((row?.name as string | null) || (account?.name as string | null)) ?? "",
				email: (account?.email as string) ?? context.session.user.email,
				avatarUrl: fileUrl(context.origin, row?.avatarKey) ?? (account?.image as string | null) ?? null,
				position: (row?.position as string | null) ?? null,
				hiringRole: (row?.hiringRole as string | null) ?? null,
				phone: (row?.phone as string | null) ?? null,
			},
		};
	}),

	// The redesign's PATCH /api/employer/me: an invited teammate's own About
	// you (name, photo, role, position, phone). The registrant edits theirs
	// through employer.saveProfile instead.
	saveMyProfile: protectedProcedure
		.input(
			z.object({
				name: z.string(),
				position: z.string().nullish(),
				hiringRole: z.string().nullish(),
				phone: z.string().nullish(),
				// The redesign's avatarUrl: omitted keeps, null/"" removes, a data
				// URL is a new upload, an existing /files/ URL keeps that photo.
				avatarUrl: z.string().nullish(),
			}),
		)
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const userId = context.session.user.id;
			const access = await loadEmployerAccess(db, userId, context.activeOrganizationId);
			if (!access) throw new ORPCError("NOT_FOUND", { message: "No company found." });
			const [org] = (await db
				.select({ createdByUserId: organization.createdByUserId })
				.from(organization)
				.where(eq(organization.id, access.organizationId))
				.limit(1)) as AnyDb[];
			if (org?.createdByUserId === userId) bad("Edit your details from the company contact form.");
			const name = input.name.trim();
			if (!name) bad("Enter your full name.");
			if (name.length > MAX_NAME_LENGTH) bad(`Keep your name under ${MAX_NAME_LENGTH} characters.`);
			const position = input.position?.trim() ?? "";
			if (position.length > MAX_POSITION_LENGTH) bad(`Keep your position under ${MAX_POSITION_LENGTH} characters.`);
			const hiringRole = input.hiringRole?.trim() ?? "";
			if (!(CONTACT_ROLES as readonly string[]).includes(hiringRole)) bad("Choose your role.");
			if (!position) bad("Choose your position.");
			const phone = input.phone?.trim() ?? "";
			if (!phone) bad("Enter your phone number.");
			if (phone.length > MAX_PHONE_LENGTH || !/^[0-9+\-\s()]+$/.test(phone)) bad("Enter a valid phone number.");
			let avatarKey: string | null | undefined;
			if (input.avatarUrl === undefined) avatarKey = undefined;
			else if (!input.avatarUrl) avatarKey = null;
			else if (isBase64DataUrl(input.avatarUrl)) {
				if (input.avatarUrl.length > 4_200_000 || !/^data:image\/(png|jpe?g|webp);base64,/.test(input.avatarUrl)) {
					bad("Use a JPG or PNG photo up to 3 MB.");
				}
				if (!context.storage) throw new Error("File storage isn't configured.");
				avatarKey = await saveBase64Upload(context.storage, input.avatarUrl, "avatars");
			} else {
				avatarKey = keyFromFileUrl(input.avatarUrl.trim());
				if (!avatarKey) bad("Invalid photo.");
			}
			await db.batch([
				db.update(user).set({ name }).where(eq(user.id, userId)),
				db
					.update(member)
					.set({
						name,
						positionTitle: position,
						contactRole: hiringRole,
						phoneNumber: phone,
						...(avatarKey !== undefined ? { avatarKey } : {}),
						// Saving from the welcome step (or My Profile) completes "About you".
						profileCompletedAt: sqliteNow(),
					})
					.where(eq(member.id, access.memberId)),
			]);
			return { ok: true as const };
		}),

	// ── v1's company-side account deletion review (company.listAccountDeletionRequests) ──

	// Requests this teammate may approve: HR managers (Owners) review HR staff
	// (Admins, Hiring managers); HR staff review panelists. A platform admin
	// reviews an Owner's — that's on the superadmin panel.
	listDeletionRequests: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const access = await loadEmployerAccess(db, context.session.user.id, context.activeOrganizationId);
		if (!access) return { requests: [] };
		const [me] = (await db.select({ role: member.role }).from(member).where(eq(member.id, access.memberId)).limit(1)) as AnyDb[];
		const rows = (await db
			.select({
				id: accountDeletionRequests.id,
				userId: accountDeletionRequests.userId,
				requesterMemberRole: accountDeletionRequests.requesterMemberRole,
				requiredApproverRole: accountDeletionRequests.requiredApproverRole,
				reason: accountDeletionRequests.reason,
				createdAt: accountDeletionRequests.createdAt,
				email: user.email,
				accountName: user.name,
			})
			.from(accountDeletionRequests)
			.innerJoin(user, eq(user.id, accountDeletionRequests.userId))
			.where(and(eq(accountDeletionRequests.organizationId, access.organizationId), eq(accountDeletionRequests.status, "pending")))
			.orderBy(desc(accountDeletionRequests.createdAt))) as AnyDb[];
		const mine = rows.filter((r) =>
			canOrgMemberReviewDeletion(me?.role ?? "", r.requiredApproverRole, r.requesterMemberRole ?? ""),
		);
		const names = (await db
			.select({ userId: member.userId, name: member.name })
			.from(member)
			.where(eq(member.organizationId, access.organizationId))) as AnyDb[];
		return {
			requests: mine.map((r) => ({
				id: r.id as string,
				name: (names.find((n) => n.userId === r.userId)?.name as string | null) || (r.accountName as string | null) || null,
				email: r.email as string,
				role: toTeamRole(r.requesterMemberRole, null),
				reason: (r.reason as string | null) ?? null,
				createdAt: toIso(r.createdAt),
			})),
		};
	}),

	// v1's company review call: approve deletes the teammate's account (soft), reject keeps it.
	reviewDeletion: protectedProcedure
		.input(z.object({ requestId: z.string(), action: z.enum(["approve", "reject"]), rejectionReason: z.string().max(500).optional() }))
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const access = await loadEmployerAccess(db, context.session.user.id, context.activeOrganizationId);
			if (!access) notFound();
			const [me] = (await db.select({ role: member.role }).from(member).where(eq(member.id, access.memberId)).limit(1)) as AnyDb[];
			return reviewAccountDeletionRequest(db, {
				requestId: input.requestId,
				reviewerUserId: context.session.user.id,
				action: input.action,
				rejectionReason: input.rejectionReason,
				reviewerMemberRole: me?.role ?? "",
			});
		}),
};
