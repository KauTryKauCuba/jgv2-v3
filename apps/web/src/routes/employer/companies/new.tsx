import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Hero } from "@/components/landing/hero";
import { Navbar } from "@/components/landing/navbar";
import Loader from "@/components/loader";
import { DraftNameProvider } from "@/components/onboarding/draft-name-context";
import { EmployerOnboardingBadges } from "@/components/onboarding/employer-onboarding-badges";
import { EmployerOnboardingForm } from "@/components/onboarding/employer-onboarding-form";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { requireOnboarded } from "@/lib/route-guards";
import { orpc } from "@/utils/orpc";

/**
 * The redesign's src/app/employer/companies/new/page.tsx — "Add a company":
 * an existing employer registering another company, up to their company
 * limit. Same form as company onboarding, with "About you" prefilled from
 * the company they registered (the current one if they registered it, else
 * their first), and the new company becomes the selected one once saved
 * (employer.saveProfile with createNew).
 */
export const Route = createFileRoute("/employer/companies/new")({
	// Someone with no company at all belongs in first-time onboarding.
	beforeLoad: async () => await requireOnboarded("employer"),
	component: AddCompanyPage,
});

function AddCompanyPage() {
	const { t } = useTranslation("common");
	const contextQuery = useQuery({ ...orpc.employer.addCompanyContext.queryOptions(), staleTime: 0 });
	const aboutYou = contextQuery.data?.aboutYou;
	const phone: string = (aboutYou && "contactPhone" in aboutYou ? aboutYou.contactPhone : "") ?? "";
	// So the phone field shows "verified" on its first frame, not after loading.
	const phoneStatusQuery = useQuery({
		...orpc.phone.status.queryOptions({ input: { phone } }),
		enabled: contextQuery.isSuccess && phone !== "",
		meta: { suppressErrorToast: true },
	});

	if (contextQuery.isPending || (phone !== "" && phoneStatusQuery.isPending)) return <Loader />;
	const limit = contextQuery.data?.limit;
	const canAdd = limit?.canAdd ?? false;

	return (
		<main className="flex min-h-[100svh] flex-col overflow-x-clip bg-brand-teal-page pb-[92px]">
			<DraftNameProvider>
				<Navbar pageRole="employer" />
				<div className="relative">
					<EmployerOnboardingBadges />
					<Hero
						showRoleToggle={false}
						// Same headline gradient as the employer landing page.
						headingGradient="var(--brand-gradient-employer)"
						heading={
							<>
								{t("employerAddCompany.heading1")}
								<br />
								{t("employerAddCompany.heading2")}
							</>
						}
						subheadingClassName="mb-[64px]"
						subheading={
							canAdd
								? t("employerAddCompany.subheading", { used: limit?.used ?? 0, limit: limit?.limit ?? 0 })
								: t("employerAddCompany.subheadingAtLimit", { used: limit?.used ?? 0 })
						}
						belowNav={
							canAdd ? (
								<EmployerOnboardingForm
									createNew
									// biome-ignore lint: "About you" in the draft's own shape.
									initialDraft={(aboutYou ?? null) as any}
									initialPhoneStatus={phoneStatusQuery.data}
								/>
							) : (
								<div className={`mx-auto w-full max-w-[460px] text-left ${gradientFrameClass("teal")}`}>
									<div className="rounded-[19px] bg-white p-[22px] text-center sm:p-[28px]">
										<p className="text-sm leading-[20px] text-[#4B5468]">
											{t("employerAddCompany.atLimit", { limit: limit?.limit ?? 0 })}
										</p>
										<Link
											to="/employer/dashboard"
											className="mt-[20px] flex h-[44px] w-full items-center justify-center rounded-full border border-black/[0.1] text-sm text-[#141B2E] hover:bg-black/[0.03]"
										>
											{t("employerAddCompany.backToDashboard")}
										</Link>
									</div>
								</div>
							)
						}
					/>
				</div>
			</DraftNameProvider>
		</main>
	);
}
