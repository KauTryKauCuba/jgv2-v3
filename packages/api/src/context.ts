import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
	context: HonoContext;
	// The drizzle instance the entrypoint built (D1 on Cloudflare, SQLite
	// file on Bun/VPS) — same shared schema either way.
	db?: unknown;
};

// Built once per request and passed to every procedure. When login is added,
// read the session here (as v1 does) so procedures can see who is calling.
export async function createContext({ context, db }: CreateContextOptions) {
	return {
		headers: context.req.raw.headers,
		db,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
