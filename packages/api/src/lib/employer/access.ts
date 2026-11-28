import { member, organization } from "@jobgiga-app/db/schema/auth";
import { and, eq } from "drizzle-orm";
import { currentOrganizationId } from "./memberships";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

// The redesign's hasFullAccess: owners and admins manage the company itself.
export function hasFullAccess(accessLevel: string): boolean {
	return accessLevel === "owner" || accessLevel === "admin";
}

/** The signed-in user's current company (the switcher's choice, else their first — see memberships.ts). */
export async function loadCurrentCompany(db: AnyDb, userId: string, activeOrganizationId?: string | null) {
	const organizationId = await currentOrganizationId(db, userId, activeOrganizationId);
	if (!organizationId) return null;
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
		.where(and(eq(member.userId, userId), eq(member.status, "active"), eq(member.organizationId, organizationId)))
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

