import { createFileRoute } from "@tanstack/react-router";
import { EmployerDashboard } from "@/components/dashboard/employer-dashboard";
import { requireOnboarded } from "@/lib/route-guards";

export const Route = createFileRoute("/employer/dashboard")({
	beforeLoad: async () => {
		await requireOnboarded("employer");
	},
	component: EmployerDashboard,
});
