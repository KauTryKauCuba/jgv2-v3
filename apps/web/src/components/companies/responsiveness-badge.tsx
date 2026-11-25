import { useTranslation } from "react-i18next";
import { ClockIcon } from "@/components/landing/icons";
import {
  type EmployerResponsiveness,
  RESPONSIVENESS_TONE_CLASS,
  responsivenessBadge,
} from "@/lib/companies/responsiveness";

/** "Usually replies within a day". Shows nothing until there's enough history to say. */
export function ResponsivenessBadge({ responsiveness }: { responsiveness: EmployerResponsiveness | null }) {
  const { t } = useTranslation("common");
  const badge = responsivenessBadge(responsiveness);
  if (!badge || !responsiveness) return null;
  return (
    <span
      className={`inline-flex w-fit items-center gap-[5px] rounded-full px-[9px] py-[3px] text-xs ${RESPONSIVENESS_TONE_CLASS[badge.tone]}`}
      title={t("companies.responsiveness.basedOn", { count: responsiveness.sampleSize })}
    >
      <ClockIcon className="h-[11px] w-[11px] shrink-0" />
      {t(`companies.responsiveness.${badge.labelKey}`)}
    </span>
  );
}
