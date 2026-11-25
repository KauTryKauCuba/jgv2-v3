// Bindings the Worker receives from Cloudflare (see apps/server/wrangler.jsonc).
declare module "cloudflare:workers" {
	namespace Cloudflare {
		export interface Env {
			DB: D1Database;
			CORS_ORIGIN?: string;
		}
	}
}
