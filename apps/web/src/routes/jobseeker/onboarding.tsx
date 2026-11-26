import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "@/components/landing/hero";
import { Navbar } from "@/components/landing/navbar";
import Loader from "@/components/loader";
import { DraftNameProvider } from "@/components/onboarding/draft-name-context";
import { JobseekerOnboardingBadges } from "@/components/onboarding/jobseeker-onboarding-badges";
import { JobseekerOnboardingForm } from "@/components/onboarding/jobseeker-onboarding-form";
import { requireNotOnboarded } from "@/lib/route-guards";
import { orpc } from "@/utils/orpc";

// The redesign's src/app/jobseeker/onboarding/page.tsx, ported.
export const Route = createFileRoute("/jobseeker/onboarding")({
	beforeLoad: async () => {
		return await requireNotOnboarded("jobseeker");
	},
	component: JobseekerOnboardingPage,
});

function JobseekerOnboardingPage() {
	const { t } = useTranslation("common");
	const { session } = Route.useRouteContext();
	const draftQuery = useQuery({ ...orpc.jobseeker.getDraft.queryOptions(), staleTime: 0 });
	const draft = draftQuery.data?.draft ?? null;
	const draftPhone = typeof draft?.phone === "string" ? draft.phone : "";
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
		<main className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-gold-page pb-[92px]">
			<DraftNameProvider>
				<Navbar pageRole="jobseeker" onboarding />
				<div className="relative">
					<JobseekerOnboardingBadges />
					<Hero
						belowNav={
							<JobseekerOnboardingForm
								accountEmail={session.user.email}
								// The account's own photo (e.g. from Google) — what the form starts with.
								initialAvatarUrl={session.user.image ?? null}
								// biome-ignore lint: the draft is the form's own autosaved JSON, read back as-is.
								initialDraft={draft as any}
								initialPhoneStatus={phoneStatusQuery.data}
							/>
						}
						showRoleToggle={false}
						subheadingClassName="mb-[64px]"
						// Same headline gradient as the jobseeker landing page.
						headingGradient="var(--brand-gradient-jobseeker)"
						heading={
							<>
								{t("jobseekerOnboarding.heading1")}
								<br />
								{t("jobseekerOnboarding.heading2")}
							</>
						}
						subheading={
							t("jobseekerOnboarding.subheading")
						}
					/>
				</div>
			</DraftNameProvider>
		</main>
	);
}
