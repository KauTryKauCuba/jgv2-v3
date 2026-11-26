import { createFileRoute } from "@tanstack/react-router";
import { JobseekerDashboard } from "@/components/dashboard/jobseeker-dashboard";
import { requireOnboarded } from "@/lib/route-guards";

export const Route = createFileRoute("/jobseeker/dashboard")({
	beforeLoad: async () => {
		await requireOnboarded("jobseeker");
	},
	component: JobseekerDashboard,
});
