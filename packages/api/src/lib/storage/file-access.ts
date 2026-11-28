import { adRequests } from "@jobgiga-app/db/schema/ads";
import { member, organization } from "@jobgiga-app/db/schema/auth";
import { employerOnboardingDraft } from "@jobgiga-app/db/schema/onboarding";
import { and, eq } from "drizzle-orm";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed like the other lib helpers.
type AnyDb = any;

// Files under these prefixes are private: not every signed-in user may read
// them (the redesign keeps SSM certificates outside public/, behind a
// permission-checked route). Everything else under /files only needs a session.
const PRIVATE_PREFIXES = ["ssm-documents/"];

export function isPrivateFileKey(key: string) {
	return PRIVATE_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/**
 * Who may read an SSM certificate (the redesign's /api/ssm-documents/[file]
 * rule): a member of the company it belongs to, the person who uploaded it
 * while onboarding (still only in their draft), or an admin.
 */
export async function canReadPrivateFile(
	db: AnyDb,
	user: { id: string; role?: string | null },
	key: string,
): Promise<boolean> {
	if (user.role === "admin") return true;

	const [companyMember] = await db
		.select({ id: member.id })
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.where(and(eq(member.userId, user.id), eq(organization.ssmDocumentKey, key)))
		.limit(1);
	if (companyMember) return true;

	const [draft] = await db
		.select({ data: employerOnboardingDraft.data })
		.from(employerOnboardingDraft)
		.where(eq(employerOnboardingDraft.userId, user.id))
		.limit(1);
	if (!draft) return false;
	try {
		return (JSON.parse(draft.data) as { ssmDocumentUrl?: unknown }).ssmDocumentUrl === key;
	} catch {
		return false;
	}
}

// Ad media (the redesign's /api/company-ads/[id]/media rule): an approved ad
// is public, since it shows on the landing pages to visitors who aren't signed
// in. A pending or rejected one is only for its company's team and admins.
const AD_PREFIXES = ["company-ads/", "job-ads/"];

export function isAdMediaKey(key: string) {
	return AD_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Company logos are public too — the landing pages' ads and companies show them to everyone. */
export function isPublicFileKey(key: string) {
	return key.startsWith("logos/");
}

/** The ad this file belongs to, if any: whether it's approved, and its company. */
export async function adForMediaKey(db: AnyDb, key: string): Promise<{ approved: boolean; companyId: string } | null> {
	const [row] = await db
		.select({ status: adRequests.status, companyId: adRequests.companyId })
		.from(adRequests)
		.where(eq(adRequests.mediaKey, key))
		.limit(1);
	return row ? { approved: row.status === "approved", companyId: row.companyId } : null;
}

/** An unreviewed ad's media: its company's active members, or an admin. */
export async function canSeeUnreviewedAd(db: AnyDb, user: { id: string; role?: string | null }, companyId: string) {
	if (user.role === "admin") return true;
	const [row] = await db
		.select({ id: member.id })
		.from(member)
		.where(and(eq(member.userId, user.id), eq(member.organizationId, companyId), eq(member.status, "active")))
		.limit(1);
	return !!row;
}
