import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ResponsivenessBadge } from "@/components/companies/responsiveness-badge";
import type { EmployerResponsiveness } from "@/lib/companies/responsiveness";
import { gradientFrameClass } from "@/lib/landing/form-styles";

/** "5 hours", "2 days" — the redesign's formatWait, translated. */
function formatWait(t: TFunction, hours: number): string {
  if (hours < 24) return t("applicants.wait.hours", { count: Math.max(1, Math.round(hours)) });
  return t("applicants.wait.days", { count: Math.round(hours / 24) });
}

/**
 * The redesign's EmployerResponsivenessCard — the employer's own side of
 * the anti-ghosting badge: what jobseekers see on their postings, and how
 * many applicants are waiting on a first reply.
 */
export function EmployerResponsivenessCard({
  responsiveness,
  waitingLong,
  onShowWaiting,
}: {
  responsiveness: EmployerResponsiveness | null;
  waitingLong: number;
  // Filters the list to untouched "Applied" candidates.
  onShowWaiting?: () => void;
}) {
  const { t } = useTranslation("common");
  return (
    <div className={gradientFrameClass("teal")}>
      <div className="flex flex-col gap-[10px] rounded-[19px] bg-white p-[16px] sm:p-[22px]">
        <div>
          <p className="text-sm text-[#141B2E]">{t("applicants.replySpeed.title")}</p>
          <p className="mt-[2px] text-xs text-[#9AA3B2]">{t("applicants.replySpeed.hint")}</p>
        </div>

        {responsiveness ? (
          <>
            <ResponsivenessBadge responsiveness={responsiveness} />
            <p className="text-xs text-[#4B5468]">
              {t("applicants.replySpeed.typical", {
                wait: formatWait(t, responsiveness.medianHours),
                rate: Math.round(responsiveness.responseRate * 100),
                count: responsiveness.sampleSize,
              })}
            </p>
          </>
        ) : (
          <p className="text-xs text-[#4B5468]">{t("applicants.replySpeed.noBadge")}</p>
        )}

        {waitingLong > 0 && (
          <div className="rounded-[10px] bg-brand-gold-soft p-[10px]">
            <p className="text-xs text-brand-gold-dark">{t("applicants.replySpeed.waiting", { count: waitingLong })}</p>
            {onShowWaiting && (
              <button
                type="button"
                onClick={onShowWaiting}
                className="mt-[6px] text-xs text-brand-gold-dark underline hover:no-underline"
              >
                {t("applicants.replySpeed.showWaiting")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
