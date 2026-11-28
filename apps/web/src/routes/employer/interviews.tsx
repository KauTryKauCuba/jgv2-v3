import { createFileRoute } from "@tanstack/react-router";
import { EmployerInterviewsView, type InterviewsSearch } from "@/components/interviews/employer-interviews-view";
import { requireOnboarded } from "@/lib/route-guards";

// The redesign's src/app/employer/interviews/page.tsx. Everyone in the
// company gets this page — a panel member sees only the interviews they're
// on. `?response=reschedule_requested|no_show` pre-filters (the dashboard's
// "Reschedule requests" / "No-shows" tiles).
export const Route = createFileRoute("/employer/interviews")({
	validateSearch: (search: Record<string, unknown>): InterviewsSearch => ({
		response: search.response === "reschedule_requested" || search.response === "no_show" ? search.response : undefined,
	}),
	beforeLoad: async () => {
		await requireOnboarded("employer");
	},
	component: EmployerInterviewsPage,
});

function EmployerInterviewsPage() {
	const search = Route.useSearch();
	return <EmployerInterviewsView search={search} />;
}
