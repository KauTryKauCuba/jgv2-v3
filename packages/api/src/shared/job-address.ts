// Ported verbatim from the redesign's src/lib/job-address.ts — client-safe, shared
// by the API and the web app (import from "@jobgiga-app/api/shared/job-address").

// Which company address a new job posting starts with: the one marked as the
// default for job posts, else the first (oldest — usually HQ). Pure, so the
// client-side Post a job form and the server can both use it.
export function defaultJobAddress<T extends { isJobDefault?: boolean | null }>(addresses: T[]): T | null {
  return addresses.find((a) => a.isJobDefault) ?? addresses[0] ?? null;
}
