import { useTranslation } from "react-i18next";
import { type FloatingBadge, FloatingBadges } from "@/components/landing/floating-badges";

type BadgeConfig = Omit<FloatingBadge, "label"> & { labelKey: string };

// The redesign's EmployerOnboardingBadges: an onboarding-only set, kept
// separate from the landing page's EmployerFloatingBadges so tuning one
// doesn't touch the other. Positioned within a fixed-height wrapper rather
// than the full hero, since the hero here grows tall with the form.
const BADGES: BadgeConfig[] = [
	{ id: "blue-collar", labelKey: "manufacturing", src: "/employer-types/blue-collar.jpg", top: "4%", left: "2%", duration: "5.4s", delay: "0s" },
	{ id: "white-collar", labelKey: "corporate", src: "/employer-types/white-collar.jpg", top: "4%", right: "2%", duration: "6.1s", delay: "0.6s" },
	{ id: "construction", labelKey: "construction", src: "/employer-types/construction.jpg", bottom: "6%", left: "8%", duration: "5.8s", delay: "1.1s" },
	{ id: "office", labelKey: "technology", src: "/employer-types/office.jpg", bottom: "6%", right: "8%", duration: "6.4s", delay: "0.3s" },
];

export function EmployerOnboardingBadges() {
	const { t } = useTranslation("common");
	return (
		<div className="pointer-events-none absolute inset-x-0 top-0 hidden h-[300px] md:block">
			<FloatingBadges
				badges={BADGES.map(({ labelKey, ...badge }) => ({
					...badge,
					label: t(`landing.employer.industries.${labelKey}`),
				}))}
			/>
		</div>
	);
}
