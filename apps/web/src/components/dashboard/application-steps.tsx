import { useTranslation } from "react-i18next";
import { CheckIcon } from "@/components/landing/icons";
import { type ApplicationEvent, TRACKER_STEPS, trackerStepDates, trackerStepIndex } from "@/lib/dashboard/pipeline";

// What the last step reads as once a decision is in.
const DECISION_TONE: Record<string, string> = {
  offer: "bg-[#C2600A]",
  hired: "bg-[#2F9E56]",
  rejected: "bg-red-500",
  withdrawn: "bg-[#9AA3B2]",
};

function shortDate(iso: string, language: string) {
  return new Date(iso).toLocaleDateString(language === "ms" ? "ms-MY" : "en-GB", { day: "numeric", month: "short" });
}

/**
 * The redesign's ApplicationSteps (from ApplicationTracker.tsx): the four
 * milestones as a row of dots — full size (with the date under each) on My
 * Applications, or `compact` for the dashboard's application list.
 */
export function ApplicationSteps({
  status,
  appliedAt,
  events,
  compact = false,
}: {
  status: string;
  appliedAt: string;
  events: ApplicationEvent[];
  compact?: boolean;
}) {
  const { t, i18n } = useTranslation("common");
  const currentIndex = trackerStepIndex(status);
  const dates = trackerStepDates(events, appliedAt);
  const decisionTone = DECISION_TONE[status];
  const isClosed = status === "hired" || status === "rejected" || status === "withdrawn";
  const dot = compact ? "h-[14px] w-[14px]" : "h-[18px] w-[18px]";

  return (
    <ol className={`grid grid-cols-4 gap-[4px] ${compact ? "" : "py-[10px]"}`}>
      {TRACKER_STEPS.map((step, i) => {
        // Earlier steps count as done — except, once closed, ones that were
        // skipped entirely (e.g. rejected straight after screening never
        // reached "Interview").
        const done = i === currentIndex ? i === 0 || isClosed : i < currentIndex && (!isClosed || dates[i] !== null);
        const current = i === currentIndex && !done;
        const isDecisionStep = i === TRACKER_STEPS.length - 1;
        const showDecision = isDecisionStep && decisionTone && i === currentIndex;
        const dotTone = showDecision
          ? decisionTone
          : done
            ? "bg-brand-gold-dark"
            : current
              ? "bg-white ring-2 ring-brand-gold-dark"
              : "bg-[#E4E7EC]";
        const date = dates[i];
        return (
          <li key={step.key} className="relative flex flex-col items-center text-center">
            {i < TRACKER_STEPS.length - 1 && (
              <span
                aria-hidden
                className={`absolute left-1/2 h-[2px] w-full ${compact ? "top-[6px]" : "top-[8px]"} ${
                  i < currentIndex ? "bg-brand-gold-dark" : "bg-[#E4E7EC]"
                }`}
              />
            )}
            <span className={`relative z-10 flex items-center justify-center rounded-full ${dot} ${dotTone}`}>
              {done && <CheckIcon className={compact ? "h-[7px] w-[7px] text-white" : "h-[9px] w-[9px] text-white"} />}
            </span>
            <span
              className={`${compact ? "mt-[4px] text-[11px]" : "mt-[5px] text-xs"} ${
                i <= currentIndex ? "text-[#141B2E]" : "text-[#9AA3B2]"
              }`}
            >
              {showDecision ? t(`dashboard.steps.decisions.${status}`) : t(`dashboard.steps.${step.key}`)}
            </span>
            {!compact && (
              <span className="text-xs text-[#9AA3B2]">{date ? shortDate(date, i18n.resolvedLanguage ?? "en") : " "}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
