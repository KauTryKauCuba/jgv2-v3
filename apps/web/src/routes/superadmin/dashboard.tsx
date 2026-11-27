import { createFileRoute } from "@tanstack/react-router";
import { SuperadminDashboard } from "@/components/superadmin/superadmin-dashboard";

// The redesign's src/app/superadmin/dashboard/page.tsx. The admin check is
// on the /superadmin layout route.
export const Route = createFileRoute("/superadmin/dashboard")({
	component: SuperadminDashboard,
});
