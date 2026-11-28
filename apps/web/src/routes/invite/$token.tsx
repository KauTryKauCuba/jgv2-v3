import { createFileRoute } from "@tanstack/react-router";
import { InvitePage } from "@/components/team/invite-page";

// The redesign's src/app/invite/[token]/page.tsx: the link in a team-invite
// email. Public — opening it changes nothing; joining, declining or
// switching account are explicit button presses.
export const Route = createFileRoute("/invite/$token")({
	validateSearch: (search: Record<string, unknown>): { declined?: boolean } => ({
		declined: search.declined === true || search.declined === "1" ? true : undefined,
	}),
	component: InviteRoute,
});

function InviteRoute() {
	const { token } = Route.useParams();
	const { declined } = Route.useSearch();
	return <InvitePage token={token} declined={!!declined} />;
}
