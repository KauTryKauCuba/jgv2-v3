import type { TFunction } from "i18next";

// From the redesign's src/lib/applicationStatus.ts and responsiveness.ts —
// the colours and steps of an application's progress. The words are
// translation keys under dashboard.status.* / dashboard.steps.*; the API
// sends v1's statuses already turned into these keys
// (packages/api/src/shared/application-status.ts).

// Fixed hex, not the brand tokens — a status keeps its colour whatever the theme.
export const APPLICATION_STATUS_COLOR: Record<string, { bg: string; text: string }> = {
  applied: { bg: "bg-[#F1F4F8]", text: "text-[#4B5468]" },
  screened: { bg: "bg-[#FFF3D6]", text: "text-[#A67C00]" },
  shortlisted: { bg: "bg-[#E6F9FA]", text: "text-[#008990]" },
  interview: { bg: "bg-[#F1ECFB]", text: "text-[#7C5CD1]" },
  interviewed: { bg: "bg-[#E8F1FF]", text: "text-[#2B6CB0]" },
  evaluation: { bg: "bg-[#FFE9D6]", text: "text-[#B45309]" },
  evaluated: { bg: "bg-[#EDFBF4]", text: "text-[#0F9D6C]" },
  kiv: { bg: "bg-[#EAF0FE]", text: "text-[#3B5BDB]" },
  offer: { bg: "bg-[#FFEFE3]", text: "text-[#C2600A]" },
  hired: { bg: "bg-[#E7F6EC]", text: "text-[#2F9E56]" },
  rejected: { bg: "bg-red-50", text: "text-red-500" },
  withdrawn: { bg: "bg-black/[0.04]", text: "text-[#9AA3B2]" },
};

export function statusLabel(t: TFunction, status: string) {
  return t(`dashboard.status.${status}`, { defaultValue: status });
}

export type ApplicationEvent = { fromStatus: string | null; toStatus: string; createdAt: string };

// The jobseeker-facing tracker folds the 12 statuses into four milestones.
export const TRACKER_STEPS = [
  { key: "applied", statuses: ["applied"] },
  { key: "reviewed", statuses: ["screened", "shortlisted", "kiv"] },
  { key: "interview", statuses: ["interview", "interviewed", "evaluation", "evaluated"] },
  { key: "decision", statuses: ["offer", "hired", "rejected", "withdrawn"] },
] as const;

export function trackerStepIndex(status: string): number {
  const index = TRACKER_STEPS.findIndex((step) => (step.statuses as readonly string[]).includes(status));
  return index === -1 ? 0 : index;
}

/** When each milestone was first reached, from the history (null if not yet). */
export function trackerStepDates(events: ApplicationEvent[], appliedAt: string): (string | null)[] {
  return TRACKER_STEPS.map((step, i) => {
    if (i === 0) return appliedAt;
    const hit = events.find((e) => (step.statuses as readonly string[]).includes(e.toStatus));
    return hit?.createdAt ?? null;
  });
}

export const INTERVIEW_MODES = ["onsite", "online", "phone"] as const;

/** "today", "3d ago", "2w ago", "4mo ago". */
export function relativeTimeAgo(t: TFunction, iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return t("dashboard.ago.today");
  if (days < 7) return t("dashboard.ago.days", { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t("dashboard.ago.weeks", { count: weeks });
  return t("dashboard.ago.months", { count: Math.floor(days / 30) });
}

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "freelance", "temporary"];
export const WORK_ARRANGEMENTS = ["onsite", "hybrid", "remote"];

/**
 * The redesign's compact formatSalary ("RM3,000–4,500/month") with the words
 * translated. Null when neither end is set.
 */
export function formatSalary(
  t: TFunction,
  min: number | null | undefined,
  max: number | null | undefined,
  period: string | null | undefined,
): string | null {
  const unit = t(`dashboard.salary.units.${period ?? "month"}`, { defaultValue: t("dashboard.salary.units.month") });
  const rm = (n: number) => n.toLocaleString("en-US");
  if (min && max) return t("dashboard.salary.range", { min: rm(min), max: rm(max), unit });
  if (min) return t("dashboard.salary.from", { min: rm(min), unit });
  if (max) return t("dashboard.salary.upTo", { max: rm(max), unit });
  return null;
}
