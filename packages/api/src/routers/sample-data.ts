import { organization, user } from "@jobgiga-app/db/schema/auth";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { loadEmployerAccess } from "../lib/employer/dashboard";
import {
	addDemoCompanies,
	addSampleApplicants,
	addSamplePostings,
	addSampleTeam,
	companyHasSampleData,
	isSampleId,
	removeDemoCompanies,
	removeSampleApplicants,
	removeSamplePostings,
	removeSampleTeam,
	type SampleDataContext,
} from "../lib/sample-data";

// The redesign's sample data routes — api/employer/{job-postings,team,
// applications}/dummy, api/employer/dummy-companies and
// api/employer/sample-data-banner — as one router. Each part is added or
// removed by its own call, in the order My Profile's "Sample data" card makes
// them (see lib/sample-data/index.ts for the tables and how sample rows are
// marked). Owners and Admins only (the redesign's getFullEmployerAccess),
// always on the session's current company.

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

const PARTS = ["postings", "team", "applicants", "companies"] as const;

/** The current company, for an Owner or Admin — else the redesign's answers. */
async function requireFullAccess(context: {
	db: unknown;
	storage?: SampleDataContext["storage"];
	session: { user: { id: string } };
	activeOrganizationId: string | null;
}): Promise<SampleDataContext> {
	const db = context.db as AnyDb;
	const userId = context.session.user.id;
	const access = await loadEmployerAccess(db, userId, context.activeOrganizationId);
	if (!access) throw new ORPCError("UNAUTHORIZED", { message: "Not signed in as an employer." });
	if (!access.fullAccess) throw new ORPCError("NOT_FOUND", { message: "Not found." });
	// A demo company is itself sample data — filling or clearing it from inside
	// would remove the company the page is showing.
	if (isSampleId(access.organizationId)) {
		throw new ORPCError("BAD_REQUEST", { message: "This is a sample company — switch to your own company to add or remove sample data." });
	}
	const [org] = (await db
		.select({ name: organization.displayName })
		.from(organization)
		.where(eq(organization.id, access.organizationId))
		.limit(1)) as AnyDb[];
	return { db, storage: context.storage, userId, organizationId: access.organizationId, companyName: (org?.name as string) ?? "" };
}

export const sampleDataRouter = {
	// What My Profile's card and the "Get sample data" bar need: whether this
	// company has sample data, whether the caller may add/remove it, and
	// whether the bar shows (the redesign's showSampleDataBar: an Owner or
	// Admin who hasn't closed it, on a company with no sample data yet).
	status: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const access = await loadEmployerAccess(db, userId, context.activeOrganizationId);
		if (!access || !access.fullAccess || isSampleId(access.organizationId)) {
			return { canManage: false, hasSampleData: false, showBar: false };
		}
		const [[account], hasSampleData] = await Promise.all([
			db
				.select({ dismissedAt: user.sampleDataBannerDismissedAt })
				.from(user)
				.where(eq(user.id, userId))
				.limit(1) as Promise<AnyDb[]>,
			companyHasSampleData(db, access.organizationId),
		]);
		return { canManage: true, hasSampleData, showBar: !account?.dismissedAt && !hasSampleData };
	}),

	// Add one part. Postings first (the team's Hiring managers are assigned to
	// them), then the team, then applicants — whose interview panels include
	// those teammates — then the demo companies. Each clears its own leftovers
	// first, so a repeat click never piles up duplicates.
	add: protectedProcedure.input(z.object({ part: z.enum(PARTS) })).handler(async ({ input, context }) => {
		const ctx = await requireFullAccess(context);
		switch (input.part) {
			case "postings":
				return { ok: true as const, count: await addSamplePostings(ctx) };
			case "team":
				await addSampleTeam(ctx);
				return { ok: true as const };
			case "applicants": {
				const result = await addSampleApplicants(ctx);
				if (!result.ok) throw new ORPCError("BAD_REQUEST", { message: result.error });
				return { ok: true as const, count: result.count };
			}
			case "companies":
				await addDemoCompanies(ctx);
				return { ok: true as const };
		}
	}),

	// Remove one part. Applicants first — they hang off the postings — then
	// postings, team and the demo companies.
	remove: protectedProcedure.input(z.object({ part: z.enum(PARTS) })).handler(async ({ input, context }) => {
		const ctx = await requireFullAccess(context);
		switch (input.part) {
			case "applicants":
				await removeSampleApplicants(ctx);
				return { ok: true as const };
			case "postings":
				await removeSamplePostings(ctx);
				return { ok: true as const };
			case "team":
				await removeSampleTeam(ctx);
				return { ok: true as const };
			case "companies":
				return { ok: true as const, removed: await removeDemoCompanies(ctx) };
		}
	}),

	// The bar's X — hides it for this account everywhere, for good.
	dismissBanner: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		await db
			.update(user)
			.set({ sampleDataBannerDismissedAt: new Date().toISOString() })
			.where(eq(user.id, context.session.user.id));
		return { ok: true as const };
	}),
};
