import { ORPCError } from "@orpc/client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { EmployerTeamView } from "@/components/team/employer-team-view";
import { employerHomePath, requireOnboarded } from "@/lib/route-guards";
import { orpc, queryClient } from "@/utils/orpc";

// The redesign's src/app/employer/team/page.tsx. Managing the team is for
// Owners and Admins — anyone else goes to their own home (the redesign's
// redirectScopedTeammate).
export const Route = createFileRoute("/employer/team")({
	beforeLoad: async () => {
		await requireOnboarded("employer");
		try {
			await queryClient.fetchQuery({ ...orpc.team.list.queryOptions(), staleTime: 0, meta: { suppressErrorToast: true } });
		} catch (err) {
			if (err instanceof ORPCError && err.code === "FORBIDDEN") throw redirect({ to: await employerHomePath() });
			// Anything else: the page shows its own error.
		}
	},
	component: EmployerTeamView,
});
