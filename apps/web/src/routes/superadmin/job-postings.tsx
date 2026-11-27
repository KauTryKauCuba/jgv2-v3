import { createFileRoute } from "@tanstack/react-router";
import { SuperadminJobPostingsView } from "@/components/superadmin/superadmin-job-postings-view";

// The redesign's src/app/superadmin/job-postings/page.tsx. The admin check
// is on the /superadmin layout route.
export const Route = createFileRoute("/superadmin/job-postings")({
	component: SuperadminJobPostingsView,
});
