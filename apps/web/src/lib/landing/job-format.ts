import type { TFunction } from "i18next";
import { type JobPosting, REMOTE_LOCATION } from "@/data/landing/sample-job-postings";

const rm = (n: number) => n.toLocaleString("en-US");

/** "RM 7,000 – RM 11,000 per month", "From RM 3,000 per month", or "Salary not disclosed". */
export function formatSalary(posting: Pick<JobPosting, "salaryMin" | "salaryMax" | "salaryPeriod">, t: TFunction) {
  const { salaryMin: min, salaryMax: max, salaryPeriod } = posting;
  const unit = t(`landing.jobs.salaryPeriod.${salaryPeriod}`);
  if (min && max) return t("landing.jobs.salary.range", { min: rm(min), max: rm(max), unit });
  if (min) return t("landing.jobs.salary.from", { min: rm(min), unit });
  if (max) return t("landing.jobs.salary.upTo", { max: rm(max), unit });
  return t("landing.jobs.salary.notDisclosed");
}

export function isRemoteOnly(posting: Pick<JobPosting, "location">) {
  return posting.location === REMOTE_LOCATION;
}

/** The location as shown: "Remote" is translated, a place name isn't. */
export function locationLabel(location: string, t: TFunction) {
  return location === REMOTE_LOCATION ? t("landing.jobs.workArrangement.remote") : location;
}
