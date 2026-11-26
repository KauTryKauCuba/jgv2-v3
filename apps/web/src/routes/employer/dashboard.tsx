import { createFileRoute } from "@tanstack/react-router";
import { DashboardPlaceholder } from "@/components/onboarding/dashboard-placeholder";
import { requireOnboarded } from "@/lib/route-guards";

export const Route = createFileRoute("/employer/dashboard")({
	beforeLoad: async () => {
		await requireOnboarded("employer");
	},
	component: () => <DashboardPlaceholder role="employer" />,
});
