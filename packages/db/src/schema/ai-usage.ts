import { sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Merges v1's ai_usage table (packages/db/src/schema/ai-usage.ts) with the
// richer fields the redesign's ai_usage_logs needs for the race between
// DeepSeek/MiMo, plus Perplexity's call-count-only billing. `feature` stays
// plain text (as in v1) rather than a Postgres enum — SQLite has no native
// enum type; valid values mirror the redesign's ai_usage_feature list, e.g.
// "company_lookup", "resume_parse", "skill_suggestion", "assistant_chat".
export const aiUsage = sqliteTable(
	"ai_usage",
	{
		id: text("id").primaryKey(),
		feature: text("feature").notNull(),
		// Which upstream LLM actually answered ("deepseek" | "mimo" |
		// "perplexity") — null where a route doesn't propagate it.
		provider: text("provider"),
		// The specific model string sent (e.g. "deepseek-chat",
		// "mimo-v2.6-flash") — a provider can serve more than one model/price
		// point, so this is tracked separately from `provider`.
		model: text("model"),
		promptTokens: integer("prompt_tokens"),
		completionTokens: integer("completion_tokens"),
		totalTokens: integer("total_tokens"),
		// How many of promptTokens hit the provider's automatic prompt cache —
		// null where a provider/route doesn't report it.
		cachedTokens: integer("cached_tokens"),
		// Perplexity's Search API has no token usage, only a call count.
		// Null for every other provider, which reports tokens instead.
		callCount: integer("call_count"),
		durationMs: integer("duration_ms"),
		// Real per-call cost reported by the provider itself, when present —
		// takes priority over a published-list-pricing token estimate.
		actualCostUsd: real("actual_cost_usd"),
		userId: text("user_id"),
		organizationId: text("organization_id"),
		createdAt: text("created_at")
			.notNull()
			.default(sql`(datetime('now'))`),
	},
	(table) => [
		index("ai_usage_created_at_idx").on(table.createdAt),
		index("ai_usage_feature_idx").on(table.feature),
	],
);
