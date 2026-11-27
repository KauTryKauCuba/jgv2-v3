import { aiUsage } from "@jobgiga-app/db/schema/ai-usage";
import { eq, sql } from "drizzle-orm";
import { protectedProcedure } from "../index";
import { estimateCostUsd } from "../lib/ai/cost";

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

	// The redesign's getAiUsageByProviderForUser (My Profile's "AI usage"
	// card): this user's calls per provider and model, with an estimated cost.
	usageByProvider: protectedProcedure.handler(async ({ context }) => {
		// biome-ignore lint: context.db is driver-specific (D1 vs bun-sqlite).
		const db = context.db as any;
		const rows = (await db
			.select({
				provider: aiUsage.provider,
				model: aiUsage.model,
				rowCount: sql<number>`count(*)`,
				promptTokens: sql<number>`coalesce(sum(${aiUsage.promptTokens}), 0)`,
				completionTokens: sql<number>`coalesce(sum(${aiUsage.completionTokens}), 0)`,
				totalTokens: sql<number>`coalesce(sum(${aiUsage.totalTokens}), 0)`,
				callCount: sql<number>`coalesce(sum(${aiUsage.callCount}), 0)`,
				cachedTokens: sql<number>`coalesce(sum(${aiUsage.cachedTokens}), 0)`,
				actualCostUsd: sql<number | null>`sum(${aiUsage.actualCostUsd})`,
			})
			.from(aiUsage)
			.where(eq(aiUsage.userId, context.session.user.id))
			.groupBy(aiUsage.provider, aiUsage.model)) as {
			provider: string | null;
			model: string | null;
			rowCount: number;
			promptTokens: number;
			completionTokens: number;
			totalTokens: number;
			callCount: number;
			cachedTokens: number;
			actualCostUsd: number | null;
		}[];
		return rows
			// "none" = no provider answered; "stub" = v3's no-keys sample data.
			.filter((r): r is typeof r & { provider: string } => !!r.provider && r.provider !== "none" && r.provider !== "stub")
			.map((r) => {
				// Perplexity logs one row per request with N searches.
				const calls = r.provider === "perplexity" ? r.callCount : r.rowCount;
				return {
					provider: r.provider,
					model: r.model,
					calls,
					totalTokens: r.totalTokens,
					costUsd:
						r.actualCostUsd ?? estimateCostUsd(r.provider, r.promptTokens, r.completionTokens, calls, r.cachedTokens),
				};
			});
	}),
};
