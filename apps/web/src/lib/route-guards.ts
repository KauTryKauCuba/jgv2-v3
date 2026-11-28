import { redirect } from "@tanstack/react-router";
import { authClient } from "./auth-client";
import { client, orpc, queryClient } from "@/utils/orpc";

type Session = Awaited<ReturnType<typeof authClient.getSession>>["data"];

export type AuthContext = {
	session: NonNullable<Session>;
};

export type PageRole = "jobseeker" | "employer";

const LANDING_PATH = { jobseeker: "/jobseeker", employer: "/employer" } as const;
const ONBOARDING_PATH = { jobseeker: "/jobseeker/onboarding", employer: "/employer/onboarding" } as const;
const DASHBOARD_PATH = { jobseeker: "/jobseeker/dashboard", employer: "/employer/dashboard" } as const;

/**
 * Has this account finished onboarding for the role? Always asks the server
 * (the cached answer could be from before a profile was saved).
 */
export async function isOnboarded(role: PageRole): Promise<boolean> {
	const status = await queryClient.fetchQuery({ ...orpc.onboarding.status.queryOptions(), staleTime: 0 });
	return role === "employer" ? status.employerAccess : status.jobseekerProfile;
}

/**
 * Requires a signed-in user.
 * Redirects to the role's landing page if not signed in.
 */
export async function requireAuth(role: PageRole): Promise<AuthContext> {
	const { data: session } = await authClient.getSession();
	if (!session) {
		throw redirect({ to: LANDING_PATH[role] });
	}
	return { session };
}

/**
 * Onboarding is compulsory (the redesign's getOnboardingRedirect): every
 * signed-in page of the role sends the user to onboarding until it's done —
 * and an invited teammate to the "About you" welcome step until that's done.
 */
export async function requireOnboarded(role: PageRole): Promise<AuthContext> {
	const auth = await requireAuth(role);
	const status = await queryClient.fetchQuery({ ...orpc.onboarding.status.queryOptions(), staleTime: 0 });
	if (!(role === "employer" ? status.employerAccess : status.jobseekerProfile)) {
		throw redirect({ to: ONBOARDING_PATH[role] });
	}
	if (role === "employer" && status.needsEmployerWelcome) {
		throw redirect({ to: "/employer/welcome" });
	}
	return auth;
}

/** The redesign's employerHomePath: a Panel member starts on Interviews. */
export async function employerHomePath(): Promise<string> {
	const membership = await queryClient
		.fetchQuery({ ...orpc.team.myMembership.queryOptions(), staleTime: 0 })
		.catch(() => null);
	return membership?.role === "panel" ? "/employer/interviews" : "/employer/dashboard";
}

// Set by a team-invite link (/invite/<token>) before the sign-in modal opens:
// the invite to finish joining once signed in.
const PENDING_INVITE_KEY = "jobgiga:pendingInvite";
export type PendingInvite = { token: string; email: string; companyName: string };

export function rememberPendingInvite(invite: PendingInvite) {
	try {
		sessionStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(invite));
	} catch {
		// Private mode: signing in still joins every invite for that email.
	}
}

export function readPendingInvite(): PendingInvite | null {
	try {
		const raw = sessionStorage.getItem(PENDING_INVITE_KEY);
		return raw ? (JSON.parse(raw) as PendingInvite) : null;
	} catch {
		return null;
	}
}

export function clearPendingInvite() {
	try {
		sessionStorage.removeItem(PENDING_INVITE_KEY);
	} catch {
		// Nothing to clear.
	}
}

/**
 * Right after signing in on the employer side (the redesign's sign-in step):
 * finish the invite this sign-in was opened for, then join every other live
 * invite for the email. Failures don't block signing in.
 */
async function joinTeamInvites() {
	const pending = readPendingInvite();
	clearPendingInvite();
	if (pending) await client.team.acceptInvite({ token: pending.token }).catch(() => null);
	await client.team.joinPendingInvites().catch(() => null);
}

/**
 * The onboarding page itself: signed in, and not done yet (no onboarding
 * twice; finished users go on to their dashboard).
 */
export async function requireNotOnboarded(role: PageRole): Promise<AuthContext> {
	const auth = await requireAuth(role);
	if (await isOnboarded(role)) {
		throw redirect({ to: DASHBOARD_PATH[role] });
	}
	return auth;
}

/**
 * Where to send someone right after signing in or switching role (the
 * redesign's getPostAuthRedirect): onboarding first if it's not done,
 * otherwise straight to that role's dashboard — never the landing page.
 */
export async function postAuthRedirect(role: PageRole): Promise<string> {
	if (role === "employer") {
		await joinTeamInvites();
		const status = await queryClient.fetchQuery({ ...orpc.onboarding.status.queryOptions(), staleTime: 0 });
		if (!status.employerAccess) return ONBOARDING_PATH.employer;
		if (status.needsEmployerWelcome) return "/employer/welcome";
		return employerHomePath();
	}
	return (await isOnboarded(role)) ? DASHBOARD_PATH[role] : ONBOARDING_PATH[role];
}

/**
 * The superadmin panel (the redesign's isSuperadminEmail check on every
 * /superadmin page): signed in, and a platform admin (auth.me's
 * isSuperadmin — v1's user.role = "admin"). Anyone else goes to the home
 * page, like the redesign (which in v3 is the employer landing page).
 */
export async function requireAdmin(): Promise<AuthContext> {
	const auth = await requireAuth("employer");
	const me = await queryClient.fetchQuery({ ...orpc.auth.me.queryOptions(), staleTime: 0 }).catch(() => null);
	if (!me?.isSuperadmin) {
		throw redirect({ to: "/" });
	}
	return auth;
}
