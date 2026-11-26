import { useTranslation } from "react-i18next";
import { gradientFrameClass } from "@/lib/landing/form-styles";
import { BADGE_DEFINITIONS, type BadgeKey } from "@/lib/companies/badges";
import { BadgeMedal } from "./badge-medal";

// The redesign's CompanyBadgesCard, ported: every badge, earned or locked,
// with its description on hover.
export function CompanyBadgesCard({ earnedBadges }: { earnedBadges: Partial<Record<BadgeKey, Date>> }) {
	const { t, i18n } = useTranslation("common");
	const locale = i18n.resolvedLanguage === "ms" ? "ms-MY" : "en-MY";

	return (
		<div className={`animate-fade-in-up ${gradientFrameClass("teal")}`}>
			<div className="rounded-[19px] bg-white p-[16px] sm:p-[22px]">
				<p className="text-sm text-[#141B2E]">{t("companies.badgesCard.title")}</p>
				<p className="mt-[2px] text-xs text-[#9AA3B2]">{t("companies.badgesCard.subtitle")}</p>
				<div className="mt-[14px] grid grid-cols-2 gap-[14px] sm:grid-cols-4 lg:grid-cols-8">
					{BADGE_DEFINITIONS.map((badge, index) => {
						const earnedAt = earnedBadges[badge.key];
						const earned = !!earnedAt;
						const isFirst = index === 0;
						const isLast = index === BADGE_DEFINITIONS.length - 1;

						return (
							<div
								key={badge.key}
								className={`group relative flex flex-col items-center gap-[6px] transition-opacity ${earned ? "" : "opacity-70"}`}
							>
								<span
									className={`pointer-events-none absolute bottom-[calc(100%+8px)] z-10 w-[150px] scale-95 rounded-[10px] bg-[#141B2E] px-[10px] py-[8px] text-center text-[11px] leading-[16px] text-white opacity-0 shadow-lg transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 ${
										isFirst ? "left-0" : isLast ? "right-0" : "left-1/2 -translate-x-1/2"
									}`}
								>
									{t(`companies.badges.${badge.key}.description`)}
									<span
										className={`absolute top-full border-[5px] border-transparent border-t-[#141B2E] ${
											isFirst ? "left-[20px]" : isLast ? "right-[20px]" : "left-1/2 -translate-x-1/2"
										}`}
									/>
								</span>
								<BadgeMedal badge={badge} earned={earned} />
								<span className="text-center text-[11px] text-[#9AA3B2]">
									{earnedAt
										? earnedAt.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })
										: t("companies.badgesCard.locked")}
								</span>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}
