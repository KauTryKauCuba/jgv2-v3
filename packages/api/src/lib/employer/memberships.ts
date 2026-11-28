import { member, organization, session, user } from "@jobgiga-app/db/schema/auth";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { inChunks } from "../jobs/queries";

// The redesign's getEmployerMemberships + getEmployerAccess on v1's tables.
// A person can belong to several companies (their own, plus invites). The
// current one is the session's `active_organization_id` (v1's column, set by
// the company switcher), falling back to the first membership — companies
// they registered first (oldest first), then invites (oldest first) — when
// the session hasn't picked one or points at a company they've left.

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

/** How many companies one account may register unless a superadmin sets a custom limit (user.company_limit). */
export const DEFAULT_COMPANY_LIMIT = 5;
export const MAX_COMPANY_LIMIT = 100;

export type MembershipRow = {
	memberId: string;
	organizationId: string;
	role: string | null;
	accessLevel: string | null;
	createdByUserId: string | null;
	joinedAt: string | null;
	orgCreatedAt: string | null;
};

/** Every company this user is an active member of, in the redesign's order. */
export async function loadMemberships(db: AnyDb, userId: string): Promise<MembershipRow[]> {
	const rows = (await db
		.select({
			memberId: member.id,
			organizationId: organization.id,
			role: member.role,
			accessLevel: member.accessLevel,
			createdByUserId: organization.createdByUserId,
			joinedAt: member.createdAt,
			orgCreatedAt: organization.createdAt,
		})
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.where(and(eq(member.userId, userId), eq(member.status, "active")))
		.orderBy(asc(member.createdAt), sql`"member".rowid`)) as MembershipRow[];
	const owned = rows
		.filter((r) => r.createdByUserId === userId)
		.sort((a, b) => String(a.orgCreatedAt ?? "").localeCompare(String(b.orgCreatedAt ?? "")));
	const invited = rows.filter((r) => r.createdByUserId !== userId);
	return [...owned, ...invited];
}

/** The session's company if this user still belongs to it, else their first. */
export function pickMembership<T extends { organizationId: string }>(list: T[], activeOrganizationId?: string | null): T | null {
	if (list.length === 0) return null;
	if (activeOrganizationId) {
		const current = list.find((m) => m.organizationId === activeOrganizationId);
		if (current) return current;
	}
	return list[0] ?? null;
}

/** The current company's id for this user (see pickMembership), or null. */
export async function currentOrganizationId(db: AnyDb, userId: string, activeOrganizationId?: string | null) {
	return pickMembership(await loadMemberships(db, userId), activeOrganizationId)?.organizationId ?? null;
}

/** The redesign's setActiveEmployerCompany: this session now shows that company. */
export function setActiveCompanyQuery(db: AnyDb, sessionId: string, organizationId: string) {
	return db.update(session).set({ activeOrganizationId: organizationId }).where(eq(session.id, sessionId));
}

export type CompanyLimitInfo = { used: number; limit: number; custom: boolean; canAdd: boolean };

/** Companies this account has registered, against its limit. */
export async function loadCompanyLimitInfo(db: AnyDb, userId: string): Promise<CompanyLimitInfo> {
	const [[account], [row]] = await Promise.all([
		db.select({ companyLimit: user.companyLimit }).from(user).where(eq(user.id, userId)).limit(1),
		db.select({ n: count() }).from(organization).where(eq(organization.createdByUserId, userId)),
	]);
	const used = Number(row?.n ?? 0);
	const custom = account?.companyLimit != null;
	const limit = (account?.companyLimit as number | null) ?? DEFAULT_COMPANY_LIMIT;
	return { used, limit, custom, canAdd: used < limit };
}

/** Same, for many accounts at once (the superadmin Employers list). */
export async function loadCompanyLimitInfoFor(db: AnyDb, userIds: string[]): Promise<Map<string, CompanyLimitInfo>> {
	const ids = [...new Set(userIds)];
	if (ids.length === 0) return new Map();
	const [limits, counts] = (await Promise.all([
		inChunks(ids, (chunk) => db.select({ id: user.id, companyLimit: user.companyLimit }).from(user).where(inArray(user.id, chunk))),
		inChunks(ids, (chunk) =>
			db
				.select({ userId: organization.createdByUserId, n: count() })
				.from(organization)
				.where(inArray(organization.createdByUserId, chunk))
				.groupBy(organization.createdByUserId),
		),
	])) as [{ id: string; companyLimit: number | null }[], { userId: string; n: number }[]];
	const used = new Map(counts.map((c) => [c.userId, Number(c.n)]));
	return new Map(
		limits.map((u) => {
			const n = used.get(u.id) ?? 0;
			const limit = u.companyLimit ?? DEFAULT_COMPANY_LIMIT;
			return [u.id, { used: n, limit, custom: u.companyLimit != null, canAdd: n < limit }];
		}),
	);
}
