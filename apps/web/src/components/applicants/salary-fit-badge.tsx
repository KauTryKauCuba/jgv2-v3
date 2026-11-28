import { salaryFit } from "@jobgiga-app/api/shared/job-posting-options";
import { useTranslation } from "react-i18next";

/**
 * The redesign's SalaryFitBadge: a small flag next to an applicant's
 * expected salary — whether it fits the posting's salary range. Renders
 * nothing when the two can't be compared (no range on the posting, or a
 * non-monthly posting — expectations are monthly).
 */
export function SalaryFitBadge({
  expectedMin,
  expectedMax,
  postingMin,
  postingMax,
  postingPeriod,
}: {
  expectedMin: number | null;
  expectedMax: number | null;
  postingMin?: number | null;
  postingMax?: number | null;
  postingPeriod?: string;
}) {
  const { t } = useTranslation("common");
  const fit = salaryFit(
    { min: expectedMin, max: expectedMax },
    { min: postingMin ?? null, max: postingMax ?? null, period: postingPeriod },
  );
  if (!fit) return null;
  return fit === "fits" ? (
    <span className="whitespace-nowrap rounded-full bg-[#E7F6EC] px-[8px] py-[1px] text-xs text-[#2F7D4F]">
      {t("applicants.salaryFits")}
    </span>
  ) : (
    <span className="whitespace-nowrap rounded-full bg-[#FFF1E6] px-[8px] py-[1px] text-xs text-[#B4561F]">
      {t("applicants.salaryAbove")}
    </span>
  );
}
