import type { InterviewDetails } from "@/lib/applicants/status";

// Shared by the two interview calendars (from the redesign's
// InterviewCalendarCard / InterviewBigCalendar).

export type CalendarInterview = {
  applicationId: string;
  applicantName: string;
  jobPostingTitle: string;
  status: string;
  details: InterviewDetails;
};

export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Monday-first weekday index (0 = Monday .. 6 = Sunday), matching DatePicker.
export function mondayFirstDay(date: Date) {
  return (date.getDay() + 6) % 7;
}

/** "en-US" / "ms-MY" for the reader's language. */
export function dateLocale(language: string | undefined) {
  return language === "ms" ? "ms-MY" : "en-US";
}

/** "November 2026" in the reader's language. */
export function monthYearLabel(locale: string, year: number, month: number) {
  return new Date(year, month, 1).toLocaleDateString(locale, { month: "long", year: "numeric" });
}

/** "9:30 AM" — the interview's local time. */
export function timeLabel(locale: string, iso: string) {
  return new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}
