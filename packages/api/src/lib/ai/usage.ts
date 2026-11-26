import { aiUsage } from "@jobgiga-app/db/schema/ai-usage";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite); both satisfy
// the same drizzle insert shape at runtime, same as the other lib helpers
// that take a db this loosely.
type AnyDb = any;

export type LogAiUsageInput = {
	feature: string;
	provider?: string | null;
	model?: string | null;
	promptTokens?: number | null;
	completionTokens?: number | null;
	totalTokens?: number | null;
	cachedTokens?: number | null;
	callCount?: number | null;
	durationMs?: number | null;
	actualCostUsd?: number | null;
	userId?: string | null;
	organizationId?: string | null;
};

// Ported from the redesign's src/lib/ai-usage.ts (logAiUsage), adapted to
// take `db` explicitly rather than a global import — same pattern as every
// other db-touching helper in v3 (see packages/db's d1.ts/sqlite.ts).
export async function logAiUsage(db: AnyDb, input: LogAiUsageInput) {
	await db.insert(aiUsage).values({
		id: crypto.randomUUID(),
		feature: input.feature,
		provider: input.provider ?? null,
		model: input.model ?? null,
		promptTokens: input.promptTokens ?? null,
		completionTokens: input.completionTokens ?? null,
		totalTokens: input.totalTokens ?? null,
		cachedTokens: input.cachedTokens ?? null,
		callCount: input.callCount ?? null,
		durationMs: input.durationMs ?? null,
		actualCostUsd: input.actualCostUsd ?? null,
		userId: input.userId ?? null,
		organizationId: input.organizationId ?? null,
	});
}
