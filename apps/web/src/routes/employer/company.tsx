import { createFileRoute } from "@tanstack/react-router";
import { EmployerCompanyProfilePage } from "@/components/dashboard/employer-profile-pages";
import { requireOnboarded } from "@/lib/route-guards";

// The redesign's src/app/employer/company/page.tsx.
export const Route = createFileRoute("/employer/company")({
	beforeLoad: async () => {
		await requireOnboarded("employer");
	},
	component: EmployerCompanyProfilePage,
});
