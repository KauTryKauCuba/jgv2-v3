// Ported from the redesign's src/lib/ai-provider-race.ts. Shared by every
// route that asks the chat model for a single JSON-mode completion. The
// redesign raced DeepSeek against MiMo; v3 uses MiMo only (the user's choice,
// 2026-11-28), so the "race" has one runner. Every attempt is still collected
// so the caller can log its real usage/cost.
//
// Added for v3 (not in the redesign): when MiMo has no key
// configured, and the caller passes `devStub`, this returns that canned
// response instead of failing — same dev-mode pattern as the OTP email
// console-print, so the onboarding UI can be built and tested before real
// API keys exist. Drop `devStub` once keys are wired up for a given task.
import { MIMO_CHAT_MODEL, MIMO_ENDPOINT, chatRequestExtras } from "./models";

const RETRY_ATTEMPTS = 3;
const REQUEST_TIMEOUT_MS = 15_000;

export type ProviderUsage = {
	prompt_tokens?: number;
	completion_tokens?: number;
	total_tokens?: number;
	prompt_tokens_details?: { cached_tokens?: number } | null;
	prompt_cache_hit_tokens?: number;
};

type ChatCompletionResponse = {
	choices?: { message?: { content?: string } }[];
	usage?: ProviderUsage;
	error?: { message?: string };
};

export class ProviderRaceError extends Error {
	status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

export type ProviderRaceAttempt = {
	content: string;
	usage: ProviderUsage | null;
	provider: string;
	model: string;
};

async function callProvider(
	endpoint: string,
	model: string,
	apiKey: string,
	systemPrompt: string,
	userContent: string,
	temperature: number,
	maxTokens: number,
	providerLabel: string,
	taskLabel: string,
): Promise<
	| { ok: true; content: string; usage: ProviderUsage | null }
	| { ok: false; error: string; status: number }
> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
		try {
			const upstream = await fetch(endpoint, {
				method: "POST",
				signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${apiKey}`,
				},
				body: JSON.stringify({
					model,
					response_format: { type: "json_object" },
					temperature,
					max_tokens: maxTokens,
					messages: [
						{ role: "system", content: systemPrompt },
						{ role: "user", content: userContent },
					],
					...chatRequestExtras(endpoint),
				}),
			});

			const data = (await upstream.json().catch(() => ({}))) as ChatCompletionResponse;
			if (!upstream.ok) {
				console.error(
					`${providerLabel} ${taskLabel} failed (attempt ${attempt}/${RETRY_ATTEMPTS}): ${upstream.status}`,
				);
				continue;
			}
			const content = data.choices?.[0]?.message?.content;
			if (!content) continue;
			return { ok: true, content, usage: data.usage ?? null };
		} catch (err) {
			lastError = err;
			console.error(`${providerLabel} ${taskLabel} failed (attempt ${attempt}/${RETRY_ATTEMPTS}):`, err);
		}
	}
	console.error(`${providerLabel} ${taskLabel} failed after all retries:`, lastError);
	return { ok: false, error: `Couldn't reach the ${taskLabel} service.`, status: 502 };
}

export async function raceChatProviders(params: {
	systemPrompt: string;
	userContent: string;
	mimoKey: string | null;
	temperature: number;
	maxTokens: number;
	taskLabel: string;
	notConfiguredError: string;
	collectedAttempts: Promise<ProviderRaceAttempt>[];
	// Dev-mode only (see file header): returned when the MiMo key isn't set.
	devStub?: () => string;
}): Promise<({ ok: true } & ProviderRaceAttempt) | { ok: false; error: string; status: number }> {
	const {
		systemPrompt,
		userContent,
		mimoKey,
		temperature,
		maxTokens,
		taskLabel,
		notConfiguredError,
		collectedAttempts,
		devStub,
	} = params;

	const attempts: Promise<ProviderRaceAttempt>[] = [];
	if (mimoKey) {
		attempts.push(
			callProvider(
				MIMO_ENDPOINT,
				MIMO_CHAT_MODEL,
				mimoKey,
				systemPrompt,
				userContent,
				temperature,
				maxTokens,
				"MiMo",
				taskLabel,
			).then((r) => {
				if (!r.ok) throw new ProviderRaceError(r.error, r.status);
				return { ...r, provider: "mimo", model: MIMO_CHAT_MODEL };
			}),
		);
	}
	if (attempts.length === 0) {
		if (devStub) {
			console.log(`[ai] STUB completion for "${taskLabel}" (no MiMo key configured)`);
			return { ok: true, content: devStub(), usage: null, provider: "stub", model: "dev-stub" };
		}
		return { ok: false, error: notConfiguredError, status: 500 };
	}
	collectedAttempts.push(...attempts);
	try {
		const result = await Promise.any(attempts);
		return { ok: true, ...result };
	} catch (err) {
		const first = err instanceof AggregateError ? (err.errors[0] as ProviderRaceError | undefined) : undefined;
		return {
			ok: false,
			error: first?.message ?? `Couldn't reach the ${taskLabel} service.`,
			status: first?.status ?? 502,
		};
	}
}
