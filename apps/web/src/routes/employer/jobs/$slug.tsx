import { ORPCError } from "@orpc/client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { EmployerJobPostingView } from "@/components/jobs/employer-job-posting-view";
import { requireOnboarded } from "@/lib/route-guards";
import { orpc, queryClient } from "@/utils/orpc";

// The redesign's src/app/employer/jobs/[slug]/page.tsx: a live (or filled,
// closed, flagged) posting's own page. Draft/pending/rejected postings
// aren't served (Manage Job's details window covers those).
export const Route = createFileRoute("/employer/jobs/$slug")({
	beforeLoad: async ({ params }) => {
		await requireOnboarded("employer");
		// A panel member works from their interviews, not job pages.
		try {
			await queryClient.fetchQuery({
				...orpc.application.postingPage.queryOptions({ input: { slug: params.slug } }),
				staleTime: 0,
				retry: false,
				meta: { suppressErrorToast: true },
			});
		} catch (err) {
			if (err instanceof ORPCError && err.code === "FORBIDDEN") throw redirect({ to: "/employer/interviews" });
			// Anything else (e.g. not found): the page shows its own message.
		}
	},
	component: EmployerJobPostingPage,
});

function EmployerJobPostingPage() {
	const { slug } = Route.useParams();
	return <EmployerJobPostingView slug={slug} />;
}
