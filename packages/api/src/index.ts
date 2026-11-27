import { ORPCError, os } from "@orpc/server";
import type { Context } from "./context";

export const o = os.$context<Context>();

// Anyone can call these.
export const publicProcedure = o;

// Signed-in users only, as in v1 — rejects with UNAUTHORIZED when
// createContext's session lookup came back empty. Narrows `session` so
// handlers don't need their own null check.
export const protectedProcedure = o.use(({ context, next }) => {
	if (!context.session) {
		throw new ORPCError("UNAUTHORIZED", { message: "Sign in required." });
	}
	return next({ context: { ...context, session: context.session } });
});

// v1's adminProcedure: platform admins only (user.role = "admin", set by
// Better-Auth's admin plugin — see packages/db/src/seeder/grant-admin-local.ts).
// The redesign's superadmin panel runs on these.
export const adminProcedure = protectedProcedure.use(({ context, next }) => {
	const role = (context.session.user as { role?: string | null }).role;
	if (role !== "admin") {
		throw new ORPCError("FORBIDDEN", { message: "Admin access required" });
	}
	return next();
});
