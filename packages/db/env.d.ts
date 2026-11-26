// Bindings the Worker receives from Cloudflare (see apps/server/wrangler.jsonc).
declare module "cloudflare:workers" {
	namespace Cloudflare {
		export interface Env {
			DB: D1Database;
			CORS_ORIGIN?: string;
			BETTER_AUTH_SECRET?: string;
			BETTER_AUTH_URL?: string;
			DEEPSEEK_API_KEY?: string;
			MIMO_API_KEY?: string;
			PERPLEXITY_API_KEY?: string;
			TWILIO_API_KEY_SID?: string;
			TWILIO_API_KEY_SECRET?: string;
			TWILIO_VERIFY_SERVICE_SID?: string;
			STORAGE: R2Bucket;
		}
	}
}
