import { ORPCError } from "@orpc/client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type ApplicantsSearch, EmployerApplicantsView } from "@/components/applicants/employer-applicants-view";
import { requireOnboarded } from "@/lib/route-guards";
import { orpc, queryClient } from "@/utils/orpc";

const str = (value: unknown) => (typeof value === "string" && value ? value : undefined);

// The redesign's src/app/employer/applicants/page.tsx. `?jobId=` scrolls to
// that job's group (Manage Job's "N applicants"), `?status=` pre-filters
// (the dashboard's tiles), `?applicantId=` opens one applicant.
export const Route = createFileRoute("/employer/applicants")({
	validateSearch: (search: Record<string, unknown>): ApplicantsSearch => ({
		jobId: str(search.jobId),
		status: str(search.status),
		applicantId: str(search.applicantId),
	}),
	beforeLoad: async () => {
		await requireOnboarded("employer");
		// A panel member sees their candidates from Interviews.
		try {
			await queryClient.fetchQuery({
				...orpc.application.listForEmployer.queryOptions(),
				staleTime: 0,
				meta: { suppressErrorToast: true },
			});
		} catch (err) {
			if (err instanceof ORPCError && err.code === "FORBIDDEN") throw redirect({ to: "/employer/interviews" });
			// Anything else: the page shows its own error.
		}
	},
	component: EmployerApplicantsPage,
});

function EmployerApplicantsPage() {
	const search = Route.useSearch();
	return <EmployerApplicantsView search={search} />;
}
