import type { CriteriaFlags } from "@jobgiga-app/api/shared/matching";
import { useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { orpc } from "@/utils/orpc";

// Each criterion's weight in the blend, or "filter" for the two hard filters.
const CRITERIA: { key: keyof CriteriaFlags; weight: number | "filter" }[] = [
  { key: "skills", weight: 35 },
  { key: "softSkills", weight: 10 },
  { key: "niceToHaveSkills", weight: 10 },
  { key: "experience", weight: 15 },
  { key: "industry", weight: 10 },
  { key: "workArrangement", weight: 10 },
  { key: "employmentType", weight: 10 },
  { key: "workAuthorization", weight: "filter" },
  { key: "drivingLicense", weight: "filter" },
];

/**
 * The redesign's MatchSettingsModal — an inline panel on the Top Matches
 * card (not a popup): which criteria count toward the ranking.
 */
export function MatchSettingsPanel({
  criteria,
  onChange,
}: {
  criteria: CriteriaFlags;
  onChange: (next: CriteriaFlags) => void;
}) {
  const { t } = useTranslation("common");
  const save = useMutation({
    ...orpc.employer.updateSmartMatchSettings.mutationOptions(),
    meta: { suppressErrorToast: true },
  });

  async function toggle(key: keyof CriteriaFlags) {
    const next = { ...criteria, [key]: !criteria[key] };
    // Wait for the save before the card re-scores, so the new setting counts.
    try {
      await save.mutateAsync({ criteria: next });
    } catch {
      // Still applies on screen; it just won't last past a reload.
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-[10px] rounded-[14px] border border-[#EAEDF2] bg-[#F8FAFB] p-[12px]">
      <p className="text-xs text-[#141B2E]">{t("dashboard.matches.settingsTitle")}</p>
      <p className="-mt-[6px] text-xs text-[#9AA3B2]">{t("dashboard.matches.settingsHint")}</p>
      <div className="flex flex-col gap-[10px]">
        {CRITERIA.map(({ key, weight }) => (
          <label key={key} className="flex cursor-pointer items-start gap-[10px]">
            <input
              type="checkbox"
              checked={criteria[key]}
              onChange={() => toggle(key)}
              className="mt-[2px] h-[14px] w-[14px] shrink-0 accent-brand-teal-dark"
            />
            <span>
              <span className="block text-xs text-[#141B2E]">{t(`dashboard.matches.criteria.${key}`)}</span>
              <span className="block text-xs text-[#9AA3B2]">
                {weight === "filter" ? t("dashboard.matches.hardFilter") : t("dashboard.matches.scored", { weight })}
              </span>
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
