import { aiUsage } from "@jobgiga-app/db/schema/ai-usage";
import { eq, sql } from "drizzle-orm";
import { protectedProcedure } from "../index";

// Account-wide AI things. The AI features themselves live with their pages
// (employer.lookupCompany, jobseeker.parseResume / suggestSkills).
export const aiRouter = {
	// The avatar menu's inline "AI Usage" line — just this user's totals.
	usageSummary: protectedProcedure.handler(async ({ context }) => {
		// biome-ignore lint: context.db is driver-specific (D1 vs bun-sqlite), same as routers/auth.ts.
		const db = context.db as any;
		const [summary] = await db
			.select({
				totalCalls: sql<number>`count(*)`,
				totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)`,
			})
			.from(aiUsage)
			.where(eq(aiUsage.userId, context.session.user.id));
		return { totalCalls: summary?.totalCalls ?? 0, totalTokens: summary?.totalTokens ?? 0 };
	}),
};
