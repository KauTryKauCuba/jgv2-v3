// Every AI provider endpoint and model name the app calls, in one place —
// ported from the redesign's src/lib/ai-models.ts. When a provider retires a
// model, switching is a one-line change here; the AI Usage log still shows
// whatever model string was sent at the time.

export const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";
export const MIMO_ENDPOINT = "https://api.xiaomimimo.com/v1/chat/completions";
export const PERPLEXITY_ENDPOINT = "https://api.perplexity.ai/search";

/** DeepSeek's general chat model — JSON-mode tasks and the assistant. */
export const DEEPSEEK_CHAT_MODEL = "deepseek-chat";
/** MiMo's fast, low-cost chat model — raced against DeepSeek on every text task. */
export const MIMO_CHAT_MODEL = "mimo-v2.6-flash";

/**
 * Extra request fields for a chat completion on this endpoint. MiMo's chat
 * models reason before answering by default, which is slow and unnecessary
 * for a short JSON task — disabled for every prompt we send it.
 */
export function chatRequestExtras(endpoint: string) {
	return endpoint === MIMO_ENDPOINT ? { thinking: { type: "disabled" } } : {};
}
