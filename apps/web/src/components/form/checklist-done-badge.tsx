import { useTranslation } from "react-i18next";
import { CheckIcon } from "@/components/landing/icons";

/**
 * The redesign's ChecklistDoneBadge: the tick beside a finished onboarding
 * checklist's heading ("Required", "Optional") — a larger version of the
 * green done-circle on each checklist row.
 */
export function ChecklistDoneBadge() {
	const { t } = useTranslation("common");
	return (
		<span
			role="img"
			aria-label={t("form.complete")}
			className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[#1F7A3F]"
		>
			<CheckIcon className="h-[11px] w-[11px] text-white" />
		</span>
	);
}
