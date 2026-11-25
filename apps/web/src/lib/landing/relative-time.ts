import type { TFunction } from "i18next";

/** "today", "3d ago", "2w ago", "4mo ago" — translated. */
export function relativeTimeAgo(iso: string, t: TFunction): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (days <= 0) return t("landing.time.today");
  if (days < 7) return t("landing.time.daysAgo", { count: days });
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return t("landing.time.weeksAgo", { count: weeks });
  return t("landing.time.monthsAgo", { count: Math.floor(days / 30) });
}
