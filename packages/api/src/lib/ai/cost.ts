// Estimated from published list pricing, as in the redesign
// (src/lib/ai-usage.ts, which says where each rate comes from): Perplexity
// $0.012 a search;
// MiMo $0.14 / $0.0028 cached / $0.28 per 1M (third-party figures);
// icreat $0.035 a call when its real cost wasn't logged.
export function estimateCostUsd(
	provider: string,
	promptTokens: number,
	completionTokens: number,
	callCount: number,
	cachedTokens: number,
): number | null {
	const missTokens = Math.max(promptTokens - cachedTokens, 0);
	const perM = (tokens: number, rate: number) => (tokens / 1_000_000) * rate;
	if (provider === "perplexity") return callCount * 0.012;
	if (provider === "mimo") return perM(missTokens, 0.14) + perM(cachedTokens, 0.0028) + perM(completionTokens, 0.28);
	if (provider === "icreat") return callCount * 0.035;
	return null;
}

