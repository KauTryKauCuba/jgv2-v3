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
