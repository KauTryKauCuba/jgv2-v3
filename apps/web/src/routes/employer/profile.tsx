import { createFileRoute } from "@tanstack/react-router";
import { EmployerMyProfilePage } from "@/components/dashboard/employer-profile-pages";
import { requireOnboarded } from "@/lib/route-guards";

// The redesign's src/app/employer/profile/page.tsx.
export const Route = createFileRoute("/employer/profile")({
	beforeLoad: async () => {
		await requireOnboarded("employer");
	},
	component: EmployerMyProfilePage,
});
