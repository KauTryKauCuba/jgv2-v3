import type { Context as HonoContext } from "hono";

export type CreateContextOptions = {
	context: HonoContext;
};

// Built once per request and passed to every procedure. When login is added,
// read the session here (as v1 does) so procedures can see who is calling.
export async function createContext({ context }: CreateContextOptions) {
	return {
		headers: context.req.raw.headers,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
