import { createFileRoute, redirect } from "@tanstack/react-router";
import { EmployerWelcomePage } from "@/components/team/employer-welcome-page";
import { requireAuth } from "@/lib/route-guards";
import { orpc, queryClient } from "@/utils/orpc";

// The redesign's src/app/employer/welcome/page.tsx: an invited teammate's
// one-step onboarding ("About you"), right after joining. Anyone else — no
// company yet, the company's registrant, or done already — goes on.
export const Route = createFileRoute("/employer/welcome")({
	beforeLoad: async () => {
		await requireAuth("employer");
		const status = await queryClient.fetchQuery({ ...orpc.onboarding.status.queryOptions(), staleTime: 0 });
		if (!status.employerAccess) throw redirect({ to: "/employer/onboarding" });
		if (!status.needsEmployerWelcome) throw redirect({ to: "/employer/dashboard" });
	},
	component: EmployerWelcomePage,
});
