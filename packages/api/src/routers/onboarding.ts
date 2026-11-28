import { jobseekerProfile, member } from "@jobgiga-app/db/schema/auth";
import { and, eq } from "drizzle-orm";
import { protectedProcedure } from "../index";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed
// here, same as the other routers/lib helpers that touch it.
type AnyDb = any;

// Where each side's onboarding stands. The forms themselves save through
// routers/jobseeker.ts and routers/employer.ts.
export const onboardingRouter = {
	// Whether this signed-in user has already finished onboarding on either
	// side — the route loaders use this to redirect away from the onboarding
	// page once there's nothing left to do there.
	status: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		// An active membership only — not a removed one, nor an invite not yet accepted.
		const [memberRow] = await db
			.select({ id: member.id, invitationId: member.invitationId, profileCompletedAt: member.profileCompletedAt })
			.from(member)
			.where(and(eq(member.userId, userId), eq(member.status, "active")))
			.limit(1);
		const [profileRow] = await db
			.select({ id: jobseekerProfile.id })
			.from(jobseekerProfile)
			.where(eq(jobseekerProfile.userId, userId))
			.limit(1);
		return {
			employerAccess: Boolean(memberRow),
			jobseekerProfile: Boolean(profileRow),
			// An invited teammate who hasn't done the redesign's welcome step
			// ("About you") yet — the employer pages send them there first.
			needsEmployerWelcome: Boolean(memberRow?.invitationId && !memberRow.profileCompletedAt),
		};
	}),
};
