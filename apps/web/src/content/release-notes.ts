// Release notes, newest first: one list per side, ported from the redesign.
// Same layout as v1's src/content/release-notes.ts: this file only holds the
// structure; the text lives in the translation files under
// landing.releaseNotes.{role}.releases.{id} (title, item1 … itemN), so every
// note is in English and Malay. The month is shown in the reader's language.
//
// To add a release: put a new entry at the top of its side's list (or both),
// then add its title and items to public/locales/{en,ms}/common.json.

export type ReleaseNoteRole = "employer" | "jobseeker";

export interface ReleaseNote {
  /** Key under landing.releaseNotes.{role}.releases. */
  id: string;
  /** Year and month, "YYYY-MM". */
  month: string;
  /** How many items (item1 … itemN) the release has. */
  itemCount: number;
}

export const RELEASE_NOTES: Record<ReleaseNoteRole, ReleaseNote[]> = {
  employer: [
    { id: "assistantUpgrade", month: "2026-11", itemCount: 7 },
    { id: "offersTeamCompany", month: "2026-11", itemCount: 5 },
    { id: "interviewsEvaluations", month: "2026-11", itemCount: 6 },
    { id: "smarterAssistantExcel", month: "2026-11", itemCount: 6 },
    { id: "guidesDashboard", month: "2026-10", itemCount: 6 },
    { id: "legalPages", month: "2026-10", itemCount: 2 },
    { id: "workLocationsCertificates", month: "2026-10", itemCount: 3 },
    { id: "directoryVideoPitch", month: "2026-10", itemCount: 3 },
    { id: "aiAssistant", month: "2026-09", itemCount: 2 },
    { id: "badgesPosters", month: "2026-09", itemCount: 3 },
  ],
  jobseeker: [
    { id: "assistantUpgrade", month: "2026-11", itemCount: 4 },
    { id: "resumeReview", month: "2026-11", itemCount: 6 },
    { id: "smootherNavigation", month: "2026-10", itemCount: 4 },
    { id: "legalPages", month: "2026-10", itemCount: 2 },
    { id: "townOrArea", month: "2026-10", itemCount: 3 },
    { id: "videoPitchDesigner", month: "2026-10", itemCount: 3 },
    { id: "aiAssistant", month: "2026-09", itemCount: 2 },
    { id: "coverLettersMatching", month: "2026-09", itemCount: 2 },
  ],
};
