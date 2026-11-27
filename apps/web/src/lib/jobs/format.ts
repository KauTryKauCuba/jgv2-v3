import { isStartAvailability } from "@jobgiga-app/api/shared/job-posting-options";
import type { TFunction } from "i18next";
import { formatSalary as formatSalaryCompact } from "@/lib/dashboard/pipeline";

// Translated versions of the redesign's job-posting-options helpers
// (formatSalary, officeDaysLabel, startAvailabilityLabel) — the shared
// module's English strings are what the API and AI prompts use; anything
// shown on screen goes through these instead.

/**
 * "RM3,000–4,500/month" (compact, for cards and lists) or
 * "RM 3,000 – RM 4,500 per month" (long, for a posting's own page). Either
 * end may be missing ("From …" / "Up to …"); null when neither is set.
 */
export function formatSalary(
  t: TFunction,
  min: number | null | undefined,
  max: number | null | undefined,
  period: string | null | undefined,
  style: "compact" | "long" = "compact",
): string | null {
  if (style === "compact") return formatSalaryCompact(t, min, max, period);
  const unit = t(`dashboard.salary.units.${period ?? "month"}`, { defaultValue: t("dashboard.salary.units.month") });
  const rm = (n: number) => n.toLocaleString("en-US");
  if (min && max) return t("jobDetails.salaryLong.range", { min: rm(min), max: rm(max), unit });
  if (min) return t("jobDetails.salaryLong.from", { min: rm(min), unit });
  if (max) return t("jobDetails.salaryLong.upTo", { max: rm(max), unit });
  return null;
}

/** Hybrid postings: "3 days a week in the office". */
export function officeDaysLabel(t: TFunction, days: number | null | undefined): string | null {
  if (!days) return null;
  return t("jobDetails.officeDaysInOffice", { count: days });
}

/** How soon the hire needs to start, e.g. "Within 2 weeks". */
export function startAvailabilityLabel(t: TFunction, value: string | null | undefined): string | null {
  return isStartAvailability(value) ? t(`jobDetails.startAvailability.${value}`) : null;
}
