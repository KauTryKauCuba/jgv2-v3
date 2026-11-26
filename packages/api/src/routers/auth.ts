import { jobseekerProfile, member, user } from "@jobgiga-app/db/schema/auth";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import { fileUrl } from "../lib/uploads";

// biome-ignore lint: context.db is driver-specific (D1 vs bun-sqlite); both
// satisfy the same drizzle query shape at runtime, so this stays loosely
// typed here, same as packages/auth's drizzleAdapter call.
type AnyDb = any;

export const authRouter = {
	// Gates "Sign in" to accounts that actually exist, matching the
	// redesign's otp/request route (sign-in without a `role` 404s with
	// ACCOUNT_NOT_FOUND_MESSAGE when no account is found) and v1 (signing in
	// requires a prior sign-up) — unlike Better-Auth's emailOTP plugin on its
	// own, which happily creates an account on first OTP verify regardless
	// of which button sent the request. "Get started" skips this check.
	accountExists: publicProcedure
		.input(z.object({ email: z.string().email() }))
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const [existing] = await db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, input.email.trim().toLowerCase()))
				.limit(1);
			return { exists: Boolean(existing) };
		}),

	// The redesign's /api/auth/me: what the navbar shows for the signed-in
	// account — name, photo (the saved profile's, else the account's own,
	// e.g. from Google) and whether the phone is verified (the avatar's seal).
	me: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const [account] = await db
			.select({ name: user.name, email: user.email, image: user.image, phoneVerified: user.phoneVerified })
			.from(user)
			.where(eq(user.id, userId))
			.limit(1);
		const [profile] = await db
			.select({ fullName: jobseekerProfile.fullName, avatarKey: jobseekerProfile.avatarKey })
			.from(jobseekerProfile)
			.where(eq(jobseekerProfile.userId, userId))
			.limit(1);
		// An employer's name is on their company membership ("About you").
		const [membership] = await db
			.select({ name: member.name })
			.from(member)
			.where(eq(member.userId, userId))
			.limit(1);
		return {
			name:
				(profile?.fullName as string | undefined) ||
				(account?.name as string | undefined) ||
				(membership?.name as string | undefined) ||
				null,
			email: (account?.email as string | undefined) ?? context.session.user.email,
			avatarUrl: fileUrl(context.origin, profile?.avatarKey) ?? (account?.image as string | null | undefined) ?? null,
			phoneVerified: Boolean(account?.phoneVerified),
		};
	}),
};
