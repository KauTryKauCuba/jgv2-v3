// Privacy, Security and Terms & Conditions, ported from the redesign
// (src/lib/legal-content.ts). Same layout as v1's src/content/ files: this
// file only holds each document's structure; the text lives in the
// translation files under landing.legal.{doc}, in English and Malay
// (sections.{id}.heading, p1 … pN for paragraphs, b1 … bN for bullets).
// Each document is the same for employers and jobseekers; only the page colour
// changes.
//
// Draft text from the redesign, not reviewed by a lawyer. Have counsel check
// it (and compare Privacy with v1's PDPA notice, v1 src/content/pdpa.md)
// before relying on it.

export type LegalDocId = "privacy" | "security" | "terms";

export interface LegalSection {
  /** Key under landing.legal.{doc}.sections. */
  id: string;
  /** Paragraphs (p1 … pN), shown before any bullets. */
  paragraphs: number;
  /** Bullet points (b1 … bN). */
  bullets: number;
}

export interface LegalDoc {
  /** Year and month of the last update, "YYYY-MM". */
  lastUpdated: string;
  sections: LegalSection[];
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  privacy: {
    lastUpdated: "2026-10",
    sections: [
      { id: "collect", paragraphs: 0, bullets: 4 },
      { id: "use", paragraphs: 0, bullets: 4 },
      { id: "share", paragraphs: 1, bullets: 4 },
      { id: "storage", paragraphs: 1, bullets: 0 },
      { id: "retention", paragraphs: 1, bullets: 0 },
      { id: "rights", paragraphs: 1, bullets: 0 },
      { id: "children", paragraphs: 1, bullets: 0 },
      { id: "changes", paragraphs: 1, bullets: 0 },
      { id: "contact", paragraphs: 1, bullets: 0 },
    ],
  },
  security: {
    lastUpdated: "2026-10",
    sections: [
      { id: "signIn", paragraphs: 1, bullets: 0 },
      { id: "session", paragraphs: 1, bullets: 0 },
      { id: "data", paragraphs: 1, bullets: 0 },
      { id: "access", paragraphs: 1, bullets: 0 },
      { id: "platform", paragraphs: 1, bullets: 0 },
      { id: "contact", paragraphs: 1, bullets: 0 },
    ],
  },
  terms: {
    lastUpdated: "2026-10",
    sections: [
      { id: "using", paragraphs: 1, bullets: 0 },
      { id: "posting", paragraphs: 0, bullets: 3 },
      { id: "ai", paragraphs: 1, bullets: 0 },
      { id: "verification", paragraphs: 1, bullets: 0 },
      { id: "prohibited", paragraphs: 0, bullets: 4 },
      { id: "removal", paragraphs: 1, bullets: 0 },
      { id: "noGuarantee", paragraphs: 1, bullets: 0 },
      { id: "changes", paragraphs: 1, bullets: 0 },
      { id: "law", paragraphs: 1, bullets: 0 },
      { id: "contact", paragraphs: 1, bullets: 0 },
    ],
  },
};
