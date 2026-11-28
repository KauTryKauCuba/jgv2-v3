import { createFileRoute, redirect } from "@tanstack/react-router";
import { EmployerDashboard } from "@/components/dashboard/employer-dashboard";
import { employerHomePath, requireOnboarded } from "@/lib/route-guards";

export const Route = createFileRoute("/employer/dashboard")({
	beforeLoad: async () => {
		await requireOnboarded("employer");
		// The redesign's dashboard page: a Panel member only sits on
		// interviews, so their home is Interviews (employerHomePath).
		if ((await employerHomePath()) === "/employer/interviews") throw redirect({ to: "/employer/interviews" });
	},
	component: EmployerDashboard,
});
