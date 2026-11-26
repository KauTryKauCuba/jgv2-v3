import type { Context as HonoContext } from "hono";
import type { Storage } from "./lib/storage/types";

export type AiKeys = {
	deepseekKey: string | null;
	mimoKey: string | null;
	perplexityKey: string | null;
	logoDevKey?: string | null;
};

export type TwilioConfig = { keySid: string; keySecret: string; serviceSid: string } | null;

// biome-ignore lint: avoids a dependency cycle (packages/auth already
// depends on packages/db, and we don't want api -> auth -> ... loops just
// for a type import); auth.api.getSession's real return type still applies
// at the call site in app.ts.
type AnyAuth = any;

export type CreateContextOptions = {
	context: HonoContext;
	// The drizzle instance the entrypoint built (D1 on Cloudflare, SQLite
	// file on Bun/VPS) — same shared schema either way.
	db?: unknown;
	ai?: AiKeys;
	// The Better-Auth instance app.ts built for this request, used to read
	// the caller's session below.
	auth?: AnyAuth;
	// The entrypoint's storage (local folder on Bun, R2 on Cloudflare) —
	// same Storage interface either way.
	storage?: Storage;
	// Twilio Verify config, or null to fall back to the dev-mode stub (see
	// packages/api/src/lib/phone/verify.ts).
	phone?: TwilioConfig;
};

// Built once per request and passed to every procedure. Reads the signed-in
// session (if any) via Better-Auth, as v1 does — protectedProcedure (see
// ../index.ts) rejects when this is null.
export async function createContext({ context, db, ai, auth, storage, phone }: CreateContextOptions) {
	const session = auth ? await auth.api.getSession({ headers: context.req.raw.headers }) : null;
	return {
		headers: context.req.raw.headers,
		// This API's own origin (e.g. http://localhost:4401) — for building
		// the browser-facing URLs of stored files (see lib/uploads.ts).
		origin: new URL(context.req.url).origin,
		db,
		ai: ai ?? { deepseekKey: null, mimoKey: null, perplexityKey: null },
		session,
		storage,
		phone: phone ?? null,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
