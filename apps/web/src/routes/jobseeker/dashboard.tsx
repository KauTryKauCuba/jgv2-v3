import { createFileRoute } from "@tanstack/react-router";
import { DashboardPlaceholder } from "@/components/onboarding/dashboard-placeholder";
import { requireOnboarded } from "@/lib/route-guards";

export const Route = createFileRoute("/jobseeker/dashboard")({
	beforeLoad: async () => {
		await requireOnboarded("jobseeker");
	},
	component: () => <DashboardPlaceholder role="jobseeker" />,
});
