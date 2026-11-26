import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@/components/landing/hero";
import { Navbar } from "@/components/landing/navbar";
import Loader from "@/components/loader";
import { DraftNameProvider } from "@/components/onboarding/draft-name-context";
import { EmployerOnboardingBadges } from "@/components/onboarding/employer-onboarding-badges";
import { EmployerOnboardingForm } from "@/components/onboarding/employer-onboarding-form";
import { requireNotOnboarded } from "@/lib/route-guards";
import { orpc } from "@/utils/orpc";

// The redesign's src/app/employer/onboarding/page.tsx, ported.
export const Route = createFileRoute("/employer/onboarding")({
	beforeLoad: async () => {
		return await requireNotOnboarded("employer");
	},
	component: EmployerOnboardingPage,
});

function EmployerOnboardingPage() {
	const { t } = useTranslation("common");
	const { session } = Route.useRouteContext();
	const draftQuery = useQuery({ ...orpc.employer.getDraft.queryOptions(), staleTime: 0 });
	const draft = draftQuery.data?.draft ?? null;
	const draftPhone = typeof draft?.contactPhone === "string" ? draft.contactPhone : "";
	// So the phone field shows "verified" on its first frame, not after loading.
	const phoneStatusQuery = useQuery({
		...orpc.phone.status.queryOptions({ input: { phone: draftPhone } }),
		enabled: draftQuery.isSuccess && draftPhone !== "",
		meta: { suppressErrorToast: true },
	});

	// The form reads the draft once, when it first renders.
	if (draftQuery.isPending || (draftPhone !== "" && phoneStatusQuery.isPending)) {
		return <Loader />;
	}

	return (
		<main className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-teal-page pb-[92px]">
			<DraftNameProvider>
				<Navbar pageRole="employer" onboarding />
				<div className="relative">
					<EmployerOnboardingBadges />
					<Hero
						belowNav={
							<EmployerOnboardingForm
								// The account's own photo (e.g. from Google) — what the form starts with.
								initialAvatarUrl={session.user.image ?? null}
								initialContactEmail={session.user.email}
								// biome-ignore lint: the draft is the form's own autosaved JSON, read back as-is.
								initialDraft={draft as any}
								initialPhoneStatus={phoneStatusQuery.data}
							/>
						}
						showRoleToggle={false}
						// Same headline gradient as the employer landing page.
						headingGradient="var(--brand-gradient-employer)"
						heading={
							<>
								{t("employerOnboarding.heading1")}
								<br />
								{t("employerOnboarding.heading2")}
							</>
						}
						subheadingClassName="mb-[64px]"
						subheading={
							t("employerOnboarding.subheading")
						}
					/>
				</div>
			</DraftNameProvider>
		</main>
	);
}
