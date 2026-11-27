import { createFileRoute } from "@tanstack/react-router";
import { EmployerJobsView } from "@/components/jobs/employer-jobs-view";
import { requireOnboarded } from "@/lib/route-guards";

// The redesign's src/app/employer/jobs/page.tsx (Manage Job). `?id=` is
// what the dashboard's per-posting cards link with, as in the redesign —
// the list opens the same either way.
export const Route = createFileRoute("/employer/jobs/")({
	validateSearch: (search: Record<string, unknown>): { id?: string } => ({
		id: typeof search.id === "string" ? search.id : undefined,
	}),
	beforeLoad: async () => {
		await requireOnboarded("employer");
	},
	component: EmployerJobsPage,
});

function EmployerJobsPage() {
	return <EmployerJobsView mode="list" />;
}
