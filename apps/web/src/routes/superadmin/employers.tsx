import { createFileRoute } from "@tanstack/react-router";
import { SuperadminEmployersView } from "@/components/superadmin/superadmin-employers-view";

// The redesign's src/app/superadmin/employers/page.tsx. The admin check is
// on the /superadmin layout route.
export const Route = createFileRoute("/superadmin/employers")({
	component: SuperadminEmployersView,
});
