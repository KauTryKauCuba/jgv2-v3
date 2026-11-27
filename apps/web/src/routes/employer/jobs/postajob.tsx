import { createFileRoute } from "@tanstack/react-router";
import { EmployerJobsView } from "@/components/jobs/employer-jobs-view";
import { requireOnboarded } from "@/lib/route-guards";

type PostAJobSearch = {
	// Editing an existing posting (or finishing a draft).
	id?: string;
	// Carried over from Manage Job's "Start with your job title" card.
	title?: string;
	autofill?: boolean;
};

// The redesign's src/app/employer/jobs/postajob/page.tsx (Post a job).
export const Route = createFileRoute("/employer/jobs/postajob")({
	validateSearch: (search: Record<string, unknown>): PostAJobSearch => ({
		id: typeof search.id === "string" ? search.id : undefined,
		// The router parses query values as JSON, so a numeric title arrives as a number.
		title: typeof search.title === "string" || typeof search.title === "number" ? String(search.title) : undefined,
		autofill: search.autofill === true || search.autofill === 1 || search.autofill === "1" ? true : undefined,
	}),
	beforeLoad: async () => {
		await requireOnboarded("employer");
	},
	component: EmployerPostAJobPage,
});

function EmployerPostAJobPage() {
	const { id, title, autofill } = Route.useSearch();
	return <EmployerJobsView mode="post" editingId={id ?? null} initialTitle={title ?? null} autofill={autofill === true} />;
}
