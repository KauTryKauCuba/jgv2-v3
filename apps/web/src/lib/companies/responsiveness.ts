// "Usually replies within a day": how quickly an employer first responds to
// applications, from the redesign. The label is a translation key under
// companies.responsiveness.
// TODO(api): measured from the employer's application history once it exists.

export interface EmployerResponsiveness {
  /** Median hours from application to the employer's first move on it. */
  medianHours: number;
  /** Share (0..1) of applications that got any response. */
  responseRate: number;
  sampleSize: number;
}

export type ResponsivenessTone = "fast" | "ok" | "slow";

export function responsivenessBadge(
  r: EmployerResponsiveness | null | undefined,
): { labelKey: "withinDay" | "withinTwoDays" | "withinWeek" | "slow"; tone: ResponsivenessTone } | null {
  if (!r) return null;
  if (r.medianHours <= 24) return { labelKey: "withinDay", tone: "fast" };
  if (r.medianHours <= 48) return { labelKey: "withinTwoDays", tone: "fast" };
  if (r.medianHours <= 24 * 7) return { labelKey: "withinWeek", tone: "ok" };
  return { labelKey: "slow", tone: "slow" };
}

export const RESPONSIVENESS_TONE_CLASS: Record<ResponsivenessTone, string> = {
  fast: "bg-[#E7F6EC] text-[#2F9E56]",
  ok: "bg-[#E6F9FA] text-[#008990]",
  slow: "bg-[#F1F4F8] text-[#4B5468]",
};
