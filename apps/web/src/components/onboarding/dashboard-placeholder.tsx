import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Navbar } from "@/components/landing/navbar";
import { gradientFrameClass } from "@/lib/landing/form-styles";

/**
 * Where onboarding's "Take me to my dashboard" lands until the redesign's
 * dashboards are ported (Phase 3). A stand-in, said so on the page — not a
 * port of the redesign's dashboard.
 * TODO(route): replace with the redesign's EmployerDashboard / JobseekerDashboard.
 */
export function DashboardPlaceholder({ role }: { role: "employer" | "jobseeker" }) {
	const { t } = useTranslation("common");
	const accent = role === "jobseeker" ? "gold" : "teal";

	return (
		<main
			className={`flex min-h-[100svh] flex-col overflow-x-clip ${role === "jobseeker" ? "bg-brand-gold-page" : "bg-brand-teal-page"}`}
		>
			<Navbar pageRole={role} />
			<div className="shell flex flex-1 items-center justify-center py-[64px]">
				<div className={`w-full max-w-[440px] ${gradientFrameClass(accent)}`}>
					<div className="rounded-[19px] bg-white p-[22px] text-center">
						<h1 className="text-lg font-semibold text-[#141B2E]">{t("dashboardPlaceholder.title")}</h1>
						<p className="mt-[8px] text-sm leading-[20px] text-[#4B5468]">{t("dashboardPlaceholder.body")}</p>
						<Link
							to={role === "jobseeker" ? "/jobseeker" : "/employer"}
							className={`mt-[18px] inline-flex h-[38px] items-center justify-center rounded-full px-[18px] text-sm transition-opacity hover:opacity-90 ${
								role === "jobseeker" ? "bg-brand-gold text-[#141B2E]" : "bg-brand-teal-dark text-white"
							}`}
						>
							{t("dashboardPlaceholder.back")}
						</Link>
					</div>
				</div>
			</div>
		</main>
	);
}
