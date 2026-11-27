import { createFileRoute, redirect } from "@tanstack/react-router";

// The redesign's src/app/superadmin/page.tsx: straight on to the dashboard
// (the /superadmin layout route has already checked the admin).
export const Route = createFileRoute("/superadmin/")({
	beforeLoad: () => {
		throw redirect({ to: "/superadmin/dashboard", replace: true });
	},
});
