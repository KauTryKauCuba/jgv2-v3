import { createFileRoute } from "@tanstack/react-router";
import { SuperadminAdsView } from "@/components/superadmin/superadmin-ads-view";

// The redesign's src/app/superadmin/job-ads/page.tsx. The admin check is on
// the /superadmin layout route.
export const Route = createFileRoute("/superadmin/job-ads")({
	component: () => <SuperadminAdsView kind="job" />,
});
