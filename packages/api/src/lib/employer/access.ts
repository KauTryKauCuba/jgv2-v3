import { member, organization } from "@jobgiga-app/db/schema/auth";
import { and, asc, eq } from "drizzle-orm";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

// The redesign's hasFullAccess: owners and admins manage the company itself.
export function hasFullAccess(accessLevel: string): boolean {
	return accessLevel === "owner" || accessLevel === "admin";
}

/** The signed-in user's company (their first active membership — no company switcher yet). */
export async function loadCurrentCompany(db: AnyDb, userId: string) {
	const [row] = await db
		.select({
			memberId: member.id,
			accessLevel: member.accessLevel,
			organizationId: organization.id,
			ssmNumber: organization.ssmNumber,
			ssmDocumentKey: organization.ssmDocumentKey,
			ssmVerificationStatus: organization.ssmVerificationStatus,
			companyName: organization.displayName,
		})
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.where(and(eq(member.userId, userId), eq(member.status, "active")))
		.orderBy(asc(member.createdAt))
		.limit(1);
	return (row ?? null) as {
		memberId: string;
		accessLevel: string;
		organizationId: string;
		ssmNumber: string | null;
		ssmDocumentKey: string | null;
		ssmVerificationStatus: string;
		companyName: string;
	} | null;
}

