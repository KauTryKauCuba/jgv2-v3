import { AD_SLOTS } from "./ad-slots";
import { CURATED_COMPANIES } from "./curated-companies";
import type { EmploymentType } from "./sample-job-postings";

/**
 * Sample job ads for the jobseeker page's "Featured jobs" carousel, from the
 * redesign. Square artwork in public/ads/showcase-jobs; roles and pay are
 * illustrative. The first six match the sample listings (same company and
 * title), so picking one opens that listing.
 */
export type SampleJobAd = {
  company: string;
  jobTitle: string;
  location: string;
  employmentType: EmploymentType;
  artwork: string;
};

const SAMPLE_JOB_ADS: SampleJobAd[] = [
  { company: "aikido", jobTitle: "Security Engineer", location: "Remote", employmentType: "full_time", artwork: "/ads/showcase-jobs/aikido.svg" },
  { company: "Bolt", jobTitle: "Backend Engineer", location: "Remote", employmentType: "full_time", artwork: "/ads/showcase-jobs/bolt.svg" },
  { company: "Parim", jobTitle: "Customer Success Manager", location: "Remote", employmentType: "full_time", artwork: "/ads/showcase-jobs/parim.svg" },
  { company: "parcelly", jobTitle: "Operations Coordinator", location: "Remote", employmentType: "full_time", artwork: "/ads/showcase-jobs/parcelly.svg" },
  { company: "ParcelTracker", jobTitle: "Frontend Engineer", location: "Remote", employmentType: "full_time", artwork: "/ads/showcase-jobs/parceltracker.svg" },
  { company: "WHALE", jobTitle: "Content Designer", location: "Remote", employmentType: "full_time", artwork: "/ads/showcase-jobs/whale.svg" },
  { company: "aikido", jobTitle: "Product Designer", location: "Kuala Lumpur", employmentType: "full_time", artwork: "/ads/showcase-jobs/aikido-designer.svg" },
  { company: "Bolt", jobTitle: "Data Analyst", location: "Petaling Jaya", employmentType: "full_time", artwork: "/ads/showcase-jobs/bolt-analyst.svg" },
  { company: "Parim", jobTitle: "Sales Executive", location: "Cyberjaya", employmentType: "full_time", artwork: "/ads/showcase-jobs/parim-sales.svg" },
  { company: "WHALE", jobTitle: "Marketing Lead", location: "Bangsar South", employmentType: "full_time", artwork: "/ads/showcase-jobs/whale-marketing.svg" },
];

const LOGOS = new Map(CURATED_COMPANIES.map((c) => [c.name, c.src]));

/** The samples to show next to `realCount` real job ads, skipping companies that have a real one. */
export function sampleJobAdFill(realCount: number, realCompanyNames: string[] = []) {
  const taken = new Set(realCompanyNames.map((n) => n.trim().toLowerCase()));
  return SAMPLE_JOB_ADS.filter((s) => !taken.has(s.company.toLowerCase()))
    .slice(0, Math.max(0, AD_SLOTS - realCount))
    .map((s) => ({ ...s, companyLogoUrl: LOGOS.get(s.company) ?? null }));
}
