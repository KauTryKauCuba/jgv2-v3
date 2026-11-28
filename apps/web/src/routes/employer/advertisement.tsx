import { ORPCError } from "@orpc/client";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { type AdvertisementTab, EmployerAdvertisementPage } from "@/components/advertisement/employer-advertisement-page";
import { employerHomePath, requireOnboarded } from "@/lib/route-guards";
import { orpc, queryClient } from "@/utils/orpc";

// The redesign's src/app/employer/advertisement/page.tsx. Ads are for Owners
// and Admins — a Hiring manager or Panel member goes to their own home (the
// redesign's redirectScopedTeammate). `?tab=job` opens the job ads tab.
export const Route = createFileRoute("/employer/advertisement")({
	validateSearch: (search: Record<string, unknown>): { tab?: AdvertisementTab } => ({
		tab: search.tab === "job" ? "job" : undefined,
	}),
	beforeLoad: async () => {
		await requireOnboarded("employer");
		try {
			await queryClient.fetchQuery({ ...orpc.ads.page.queryOptions(), staleTime: 0, meta: { suppressErrorToast: true } });
		} catch (err) {
			if (err instanceof ORPCError && err.code === "FORBIDDEN") throw redirect({ to: await employerHomePath() });
			// Anything else: the page shows its own error.
		}
	},
	component: EmployerAdvertisementRoute,
});

function EmployerAdvertisementRoute() {
	const { tab } = Route.useSearch();
	return <EmployerAdvertisementPage tab={tab ?? "company"} />;
}
