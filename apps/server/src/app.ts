import { createContext } from "@jobgiga-app/api/context";
import {
	adForMediaKey,
	canReadPrivateFile,
	canSeeUnreviewedAd,
	isAdMediaKey,
	isPrivateFileKey,
	isPublicFileKey,
} from "@jobgiga-app/api/lib/storage/file-access";
import type { Storage } from "@jobgiga-app/api/lib/storage/types";
import { CONTENT_TYPE_BY_EXTENSION } from "@jobgiga-app/api/lib/uploads";
import { appRouter } from "@jobgiga-app/api/routers/index";
import { createAuth } from "@jobgiga-app/auth";
import { RPCHandler } from "@orpc/server/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

export type AppEnv = {
	CORS_ORIGIN?: string;
	BETTER_AUTH_SECRET?: string;
	BETTER_AUTH_URL?: string;
	// AI provider keys (DeepSeek/MiMo/Perplexity), for onboarding's company
	// lookup and resume parsing. Missing keys fall back to dev-mode stubs —
	// see packages/api/src/lib/ai/.
	DEEPSEEK_API_KEY?: string;
	MIMO_API_KEY?: string;
	PERPLEXITY_API_KEY?: string;
	// Company logos for the employer AI lookup (logo.dev); optional — falls back to the site favicon.
	LOGO_DEV_API_KEY?: string;
	// Twilio Verify, for onboarding's phone verification. Missing keys fall
	// back to a dev-mode stub (see packages/api/src/lib/phone/verify.ts).
	TWILIO_API_KEY_SID?: string;
	TWILIO_API_KEY_SECRET?: string;
	TWILIO_VERIFY_SERVICE_SID?: string;
	// The drizzle instance the entrypoint built (D1 on Cloudflare, SQLite
	// file on Bun/VPS). Typed loosely until the schema has real tables —
	// narrow this once routers need to query it.
	db?: unknown;
	// The entrypoint's storage (local folder on Bun, R2 on Cloudflare).
	storage?: Storage;
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

	// Better-Auth, same path as v1 (/api/auth/*). Built once per app instance
	// from the db/config this entrypoint picked — email + OTP code (matches
	// the redesign), not v1's password; social providers come later.
	const corsOrigins = (env.CORS_ORIGIN ?? "http://localhost:4400").split(",");
	const auth = createAuth({
		db: env.db,
		corsOrigins,
		secret: env.BETTER_AUTH_SECRET ?? "dev-only-insecure-secret",
		baseURL: env.BETTER_AUTH_URL ?? "http://localhost:4401",
	});

	app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

	// Typed API calls from the web app (oRPC), same path as v1.
	const rpcHandler = new RPCHandler(appRouter);

	app.use("/rpc/*", async (c, next) => {
		const { matched, response } = await rpcHandler.handle(c.req.raw, {
			prefix: "/rpc",
			context: await createContext({
				context: c,
				db: env.db,
				ai: {
					deepseekKey: env.DEEPSEEK_API_KEY ?? null,
					mimoKey: env.MIMO_API_KEY ?? null,
					perplexityKey: env.PERPLEXITY_API_KEY ?? null,
					logoDevKey: env.LOGO_DEV_API_KEY ?? null,
				},
				auth,
				storage: env.storage,
				phone:
					env.TWILIO_API_KEY_SID && env.TWILIO_API_KEY_SECRET && env.TWILIO_VERIFY_SERVICE_SID
						? {
								keySid: env.TWILIO_API_KEY_SID,
								keySecret: env.TWILIO_API_KEY_SECRET,
								serviceSid: env.TWILIO_VERIFY_SERVICE_SID,
							}
						: null,
			}),
		});
		if (matched) {
			return c.newResponse(response.body, response);
		}
		await next();
	});

	// Stored files (profile photos, resumes, certificates, …), by storage key —
	// the database only ever holds keys (portability rule #6). Signed-in only.
	// TODO(auth): per-file permissions (e.g. only the owner and employers they
	// applied to can open a resume) once applications exist.
	app.get("/files/*", async (c) => {
		const key = decodeURIComponent(c.req.path.slice("/files/".length));
		if (!key || key.includes("..") || !env.storage) return c.text("Not found.", 404);

		// Public without a session: company logos, and approved ads (they show on
		// the landing pages). Everything else needs a signed-in user.
		let isPublic = isPublicFileKey(key);
		const ad = isAdMediaKey(key) ? await adForMediaKey(env.db, key) : null;
		if (isAdMediaKey(key) && !ad) return c.text("Not found.", 404);
		if (ad?.approved) isPublic = true;
		if (!isPublic) {
			const session = await auth.api.getSession({ headers: c.req.raw.headers });
			if (!session) return c.text("Sign in first.", 401);
			// SSM certificates etc.: only the people allowed to see that file.
			if (isPrivateFileKey(key) && !(await canReadPrivateFile(env.db, session.user, key))) {
				return c.text("Not found.", 404);
			}
			// An ad waiting for review: only its company's team and admins.
			if (ad && !(await canSeeUnreviewedAd(env.db, session.user, ad.companyId))) {
				return c.text("Not found.", 404);
			}
		}

		const bytes = await env.storage.read(key);
		if (!bytes) return c.text("Not found.", 404);
		const extension = key.split(".").pop()?.toLowerCase() ?? "";
		const headers: Record<string, string> = {
			"Content-Type": CONTENT_TYPE_BY_EXTENSION[extension] ?? "application/octet-stream",
			"Cache-Control": isPublic ? "public, max-age=3600" : "private, max-age=3600",
			"Accept-Ranges": "bytes",
		};
		// Byte ranges, so videos can seek (Safari won't play a video without them).
		const range = /^bytes=(\d*)-(\d*)$/.exec(c.req.header("Range") ?? "");
		if (range && (range[1] || range[2])) {
			const size = bytes.byteLength;
			let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
			let end = range[1] && range[2] ? Number(range[2]) : size - 1;
			end = Math.min(end, size - 1);
			if (start > end || start >= size) {
				return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
			}
			start = Math.max(0, start);
			return new Response(bytes.slice(start, end + 1), {
				status: 206,
				headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}` },
			});
		}
		return new Response(bytes, { headers });
	});

	app.get("/", (c) => c.text("OK"));

	return app;
}
