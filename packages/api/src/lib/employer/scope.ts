import { member, teamActivity, user } from "@jobgiga-app/db/schema/auth";
import { job, jobHiringManagers } from "@jobgiga-app/db/schema/jobs";
import { and, eq, inArray } from "drizzle-orm";
import { hasFullAccess, type TeamRole } from "../../shared/team-roles";
import { inChunks } from "../jobs/queries";
import { fileUrl } from "../uploads";

// The redesign's lib/hiring-scope.ts on v1's tables: what part of the
// company's hiring a teammate can see.
// - Owners / Admins: everything.
// - Hiring managers: the jobs they're assigned to (job_hiring_managers),
//   plus any candidate whose interview panel they're on.
// - Panel members: only the candidates whose interview panel they're on.

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

export type HiringScope = { kind: "all" } | { kind: "limited"; userId: string; jobIds: string[] };

export async function loadHiringScope(db: AnyDb, userId: string, memberId: string, role: TeamRole): Promise<HiringScope> {
	if (hasFullAccess(role)) return { kind: "all" };
	const jobIds =
		role === "hiring_manager"
			? (
					(await db
						.select({ jobId: jobHiringManagers.jobId })
						.from(jobHiringManagers)
						.where(eq(jobHiringManagers.memberId, memberId))) as { jobId: string }[]
				).map((r) => r.jobId)
			: [];
	return { kind: "limited", userId, jobIds };
}

/** Can see this application (its candidate, interview and evaluations). */
export function canViewApplication(scope: HiringScope, jobId: string, panel: string[] | undefined) {
	if (scope.kind === "all") return true;
	return scope.jobIds.includes(jobId) || (panel ?? []).includes(scope.userId);
}

/** Can move this application through the pipeline. Panel-only access can't. */
export function canManageApplication(scope: HiringScope, jobId: string) {
	return scope.kind === "all" || scope.jobIds.includes(jobId);
}

/** Can see this job posting (its page, applicants and stats). */
export function canViewJob(scope: HiringScope, jobId: string) {
	return scope.kind === "all" || scope.jobIds.includes(jobId);
}

/** The redesign's getActorLabel: the account's name, else its email. */
export async function actorLabel(db: AnyDb, userId: string) {
	const [row] = (await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).limit(1)) as AnyDb[];
	return ((row?.name as string | null) || (row?.email as string | null)) ?? "Someone";
}

export type TeamActivityInput = {
	organizationId: string;
	actorUserId: string | null;
	actorLabel: string;
	action: "invited" | "resent_invite" | "role_changed" | "removed" | "declined" | "joined" | "job_assigned" | "job_unassigned";
	targetEmail: string;
	fromRole?: string | null;
	toRole?: string | null;
	detail?: string | null;
};

/** The redesign's logTeamActivity, as a query for a batch. */
export function teamActivityInsert(db: AnyDb, entry: TeamActivityInput) {
	return db.insert(teamActivity).values({
		id: crypto.randomUUID(),
		organizationId: entry.organizationId,
		actorUserId: entry.actorUserId,
		actorLabel: entry.actorLabel,
		action: entry.action,
		targetEmail: entry.targetEmail,
		fromRole: entry.fromRole ?? null,
		toRole: entry.toRole ?? null,
		detail: entry.detail ?? null,
	});
}

export type JobHiringManager = {
	teamMemberId: string;
	userId: string | null;
	email: string;
	name: string | null;
	avatarUrl: string | null;
	position: string | null;
	status: "active" | "pending";
};

/** The redesign's getJobHiringManagers: each job's assigned Hiring managers. */
export async function loadJobHiringManagers(db: AnyDb, origin: string, jobIds: string[]) {
	const rows = (await inChunks(jobIds, (chunk) =>
		db
			.select({
				jobId: jobHiringManagers.jobId,
				memberId: member.id,
				userId: member.userId,
				email: member.email,
				name: member.name,
				accountName: user.name,
				avatarKey: member.avatarKey,
				accountImage: user.image,
				position: member.positionTitle,
				status: member.status,
				accessLevel: member.accessLevel,
			})
			.from(jobHiringManagers)
			.innerJoin(member, eq(member.id, jobHiringManagers.memberId))
			.leftJoin(user, eq(user.id, member.userId))
			.where(inArray(jobHiringManagers.jobId, chunk)),
	)) as AnyDb[];
	const out = new Map<string, JobHiringManager[]>();
	for (const r of rows) {
		if (r.status !== "active" && r.status !== "pending") continue;
		if (r.accessLevel !== "hiring_manager") continue;
		const list = out.get(r.jobId) ?? [];
		list.push({
			teamMemberId: r.memberId,
			userId: r.userId ?? null,
			email: r.email ?? "",
			name: ((r.name as string | null) || (r.accountName as string | null)) ?? null,
			avatarUrl: fileUrl(origin, r.avatarKey) ?? (r.accountImage as string | null) ?? null,
			position: r.position ?? null,
			status: r.status,
		});
		out.set(r.jobId, list);
	}
	return out;
}

/** The redesign's hiringManagerOptions: every Hiring manager on the team (joined or invited). */
export async function loadHiringManagerOptions(db: AnyDb, origin: string, organizationId: string) {
	const rows = (await db
		.select({
			id: member.id,
			email: member.email,
			name: member.name,
			accountName: user.name,
			position: member.positionTitle,
			avatarKey: member.avatarKey,
			accountImage: user.image,
			status: member.status,
		})
		.from(member)
		.leftJoin(user, eq(user.id, member.userId))
		.where(and(eq(member.organizationId, organizationId), eq(member.accessLevel, "hiring_manager")))) as AnyDb[];
	return rows
		.filter((r) => r.status === "active" || r.status === "pending")
		.map((r) => ({
			teamMemberId: r.id as string,
			name: ((r.name as string | null) || (r.accountName as string | null) || (r.email as string)) ?? "",
			email: (r.email as string) ?? "",
			position: (r.position as string | null) ?? null,
			avatarUrl: fileUrl(origin, r.avatarKey) ?? (r.accountImage as string | null) ?? null,
			pending: r.status === "pending",
		}));
}

/**
 * The redesign's parseHiringManagerIds + setJobHiringManagers: sets exactly
 * which Hiring managers cover a job, logging each change on the Team
 * activity. `memberIds` must all be this company's Hiring managers.
 */
export async function setJobHiringManagers(
	db: AnyDb,
	params: { organizationId: string; jobId: string; jobTitle: string; memberIds: string[]; actorUserId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
	const wanted = [...new Set(params.memberIds)];
	const valid = wanted.length
		? ((await db
				.select({ id: member.id, email: member.email })
				.from(member)
				.where(
					and(
						eq(member.organizationId, params.organizationId),
						eq(member.accessLevel, "hiring_manager"),
						inArray(member.id, wanted),
					),
				)) as { id: string; email: string }[])
		: [];
	if (valid.length !== wanted.length) return { ok: false, error: "Pick hiring managers from your team." };
	const current = (await db
		.select({ memberId: jobHiringManagers.memberId, email: member.email })
		.from(jobHiringManagers)
		.innerJoin(member, eq(member.id, jobHiringManagers.memberId))
		.where(eq(jobHiringManagers.jobId, params.jobId))) as { memberId: string; email: string }[];
	const currentIds = new Set(current.map((c) => c.memberId));
	const toAdd = valid.filter((v) => !currentIds.has(v.id));
	const toRemove = current.filter((c) => !wanted.includes(c.memberId));
	if (toAdd.length === 0 && toRemove.length === 0) return { ok: true };
	const label = await actorLabel(db, params.actorUserId);
	await db.batch([
		...toAdd.map((a) => db.insert(jobHiringManagers).values({ id: crypto.randomUUID(), jobId: params.jobId, memberId: a.id }).onConflictDoNothing()),
		...toRemove.map((r) =>
			db.delete(jobHiringManagers).where(and(eq(jobHiringManagers.jobId, params.jobId), eq(jobHiringManagers.memberId, r.memberId))),
		),
		...toAdd.map((a) =>
			teamActivityInsert(db, {
				organizationId: params.organizationId,
				actorUserId: params.actorUserId,
				actorLabel: label,
				action: "job_assigned",
				targetEmail: a.email,
				detail: params.jobTitle,
			}),
		),
		...toRemove.map((r) =>
			teamActivityInsert(db, {
				organizationId: params.organizationId,
				actorUserId: params.actorUserId,
				actorLabel: label,
				action: "job_unassigned",
				targetEmail: r.email,
				detail: params.jobTitle,
			}),
		),
	]);
	return { ok: true };
}

/** The redesign's setMemberJobAssignments: exactly which jobs one Hiring manager covers. */
export async function setMemberJobAssignments(
	db: AnyDb,
	params: { organizationId: string; memberId: string; memberEmail: string; jobIds: string[]; actorUserId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
	const wanted = [...new Set(params.jobIds)];
	const jobs = wanted.length
		? ((await db
				.select({ id: job.id, title: job.title })
				.from(job)
				.where(and(eq(job.organizationId, params.organizationId), inArray(job.id, wanted)))) as { id: string; title: string }[])
		: [];
	if (jobs.length !== wanted.length) return { ok: false, error: "Pick job postings from this company." };
	const current = (await db
		.select({ jobId: jobHiringManagers.jobId, title: job.title })
		.from(jobHiringManagers)
		.innerJoin(job, eq(job.id, jobHiringManagers.jobId))
		.where(eq(jobHiringManagers.memberId, params.memberId))) as { jobId: string; title: string }[];
	const currentIds = new Set(current.map((c) => c.jobId));
	const toAdd = jobs.filter((j) => !currentIds.has(j.id));
	const toRemove = current.filter((c) => !wanted.includes(c.jobId));
	if (toAdd.length === 0 && toRemove.length === 0) return { ok: true };
	const label = await actorLabel(db, params.actorUserId);
	await db.batch([
		...toAdd.map((j) => db.insert(jobHiringManagers).values({ id: crypto.randomUUID(), jobId: j.id, memberId: params.memberId }).onConflictDoNothing()),
		...toRemove.map((r) =>
			db.delete(jobHiringManagers).where(and(eq(jobHiringManagers.memberId, params.memberId), eq(jobHiringManagers.jobId, r.jobId))),
		),
		...toAdd.map((j) =>
			teamActivityInsert(db, {
				organizationId: params.organizationId,
				actorUserId: params.actorUserId,
				actorLabel: label,
				action: "job_assigned",
				targetEmail: params.memberEmail,
				detail: j.title,
			}),
		),
		...toRemove.map((r) =>
			teamActivityInsert(db, {
				organizationId: params.organizationId,
				actorUserId: params.actorUserId,
				actorLabel: label,
				action: "job_unassigned",
				targetEmail: params.memberEmail,
				detail: r.title,
			}),
		),
	]);
	return { ok: true };
}
