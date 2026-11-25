import { createContext } from "@jobgiga-app/api/context";
import { appRouter } from "@jobgiga-app/api/routers/index";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

export type AppEnv = {
	CORS_ORIGIN?: string;
	// The drizzle instance the entrypoint built (D1 on Cloudflare, SQLite
	// file on Bun/VPS). Typed loosely until the schema has real tables —
	// narrow this once routers need to query it.
	db?: unknown;
};

// The one shared Hono app. Both entrypoints (worker.ts for Cloudflare,
// bun.ts for the VPS) build this same app and only differ in how they
// read config and how they listen. Keep all routing/logic here.
export function createApp(env: AppEnv) {
	const app = new Hono();

	app.use(logger());

	app.use(
		"/*",
		cors({
			origin: (env.CORS_ORIGIN ?? "http://localhost:4400").split(","),
			allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
			allowHeaders: ["Content-Type", "Authorization"],
			credentials: true,
		}),
	);

	// Login routes go here once packages/auth is set up:
	// app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

	// Typed API calls from the web app (oRPC), same path as v1.
	const rpcHandler = new RPCHandler(appRouter);

	app.use("/rpc/*", async (c, next) => {
		const { matched, response } = await rpcHandler.handle(c.req.raw, {
			prefix: "/rpc",
			context: await createContext({ context: c, db: env.db }),
		});
		if (matched) {
			return c.newResponse(response.body, response);
		}
		await next();
	});

	app.get("/", (c) => c.text("OK"));

	return app;
}
