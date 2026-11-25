import { createContext } from "@jobgiga-app/api/context";
import { appRouter } from "@jobgiga-app/api/routers/index";
import { RPCHandler } from "@orpc/server/fetch";
import { env } from "cloudflare:workers";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

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
		context: await createContext({ context: c }),
	});
	if (matched) {
		return c.newResponse(response.body, response);
	}
	await next();
});

app.get("/", (c) => c.text("OK"));

export default app;
