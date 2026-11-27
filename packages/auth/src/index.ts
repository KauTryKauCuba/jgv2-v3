import { betterAuth, type BetterAuthOptions } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, bearer, emailOTP } from "better-auth/plugins";
import * as schema from "@jobgiga-app/db/schema/auth";
import { eq } from "drizzle-orm";

export type CreateAuthOptions = {
	// The drizzle instance the entrypoint built (D1 on Cloudflare, SQLite
	// file on Bun/VPS) — same shared auth schema either way.
	db: unknown;
	corsOrigins: string[];
	secret: string;
	baseURL: string;
};

// Built as a factory instead of reading `cloudflare:workers` directly, so
// both entrypoints (worker.ts, bun.ts) can each build their own instance
// from the config/db they already picked.
//
// Auth flow matches the redesign's AuthModal, not v1's password-based
// login: email + 6-digit code (no password field at all), with Google as
// an alternative. That's Better-Auth's `emailOTP` plugin, not
// `emailAndPassword`.
// - Social providers (Google, LinkedIn, Apple) left out for this step —
//   OTP only, to start.
// - The `organization` plugin left out — it expects a `name` field on the
//   organization table, but ours uses v1's `legalName`/`displayName`
//   columns instead. Add it back (with a field mapping, or once v1's org
//   creation flow is ported) alongside Phase 2/3's company features.
export function createAuth({ db, corsOrigins, secret, baseURL }: CreateAuthOptions) {
	return betterAuth<BetterAuthOptions>({
		// biome-ignore lint: drizzleAdapter's db param type is driver-specific (D1 vs bun-sqlite);
		// both satisfy the same shape at runtime, so this stays loosely typed here.
		database: drizzleAdapter(db as any, {
			provider: "sqlite",
			schema,
		}),
		trustedOrigins: corsOrigins,
		databaseHooks: {
			session: {
				create: {
					// v1: a deleted account can't sign in again ("This account has
					// been deleted." — v1's auth router and context both refuse it).
					// Deletion itself is soft (user.deleted_at), so the row is still
					// here and the email OTP would otherwise sign it straight back in.
					async before(newSession) {
						// biome-ignore lint: driver-specific drizzle instance, see above.
						const [row] = await (db as any)
							.select({ deletedAt: schema.user.deletedAt })
							.from(schema.user)
							.where(eq(schema.user.id, newSession.userId))
							.limit(1);
						if (row?.deletedAt) throw new APIError("FORBIDDEN", { message: "This account has been deleted." });
					},
				},
			},
		},
		plugins: [
			bearer(),
			admin({
				defaultRole: "user",
				adminRoles: ["admin"],
			}),
			emailOTP({
				otpLength: 6,
				expiresIn: 5 * 60, // 5 minutes, same as the redesign's modal copy
				// New accounts are created on first OTP verification — the
				// redesign's "Send code" / "Get started" flows both end up here;
				// the role (employer/jobseeker) is decided by the caller, not by
				// this plugin, same as v1's separate sign-up step.
				disableSignUp: false,
				async sendVerificationOTP({ email, otp, type }) {
					// TODO(api): send through Resend once a key is provided (Phase 1).
					// Dev mode: print the code so sign-in is testable without one.
					console.log(`[auth] OTP for ${email} (${type}): ${otp}`);
				},
			}),
			// TODO(auth): add the `organization` plugin back once its field
			// mapping/org-creation flow is sorted (see note above).
		],
		secret,
		baseURL,
		advanced: {
			defaultCookieAttributes: {
				sameSite: baseURL.startsWith("https") ? "none" : "lax",
				secure: baseURL.startsWith("https"),
				httpOnly: true,
			},
		},
	});
}

export type Auth = ReturnType<typeof createAuth>;
