/**
 * Placeholder rows for the employer hero's live card, from the redesign.
 * Clearly sample-flavoured names, not real companies. The card shows real
 * rows first and tops up with these until there are 5.
 */

export type HiringCompany = {
  companyName: string;
  industry: string;
  location: string;
  logoUrl: string | null;
  activeCount: number;
  totalCount: number;
};

export type LatestPosting = {
  id: string;
  title: string;
  companyName: string;
  companyLogoUrl: string | null;
  createdAt: string;
};

export type LatestActivity = {
  id: string;
  status: "shortlisted" | "interview";
  jobTitle: string;
  companyName: string;
  companyLogoUrl: string | null;
  updatedAt: string;
};

const DAY = 86_400_000;
const HOUR = 3_600_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

export const SAMPLE_HIRING_COMPANIES: HiringCompany[] = [
  { companyName: "Northwind Retail Group", industry: "Retail", location: "Petaling Jaya, Selangor", logoUrl: null, activeCount: 2, totalCount: 2 },
  { companyName: "Cempaka Health Clinics", industry: "Healthcare", location: "Kuala Lumpur", logoUrl: null, activeCount: 1, totalCount: 1 },
  { companyName: "Bintang Logistics", industry: "Logistics", location: "Shah Alam, Selangor", logoUrl: null, activeCount: 4, totalCount: 5 },
  { companyName: "Lumino Software Studio", industry: "Technology", location: "Cyberjaya", logoUrl: null, activeCount: 3, totalCount: 3 },
  { companyName: "Sentosa Hospitality Group", industry: "Hospitality", location: "George Town, Penang", logoUrl: null, activeCount: 2, totalCount: 2 },
];

export const SAMPLE_LATEST_POSTINGS: LatestPosting[] = [
  { id: "sample-1", title: "Retail Store Supervisor", companyName: "Northwind Retail Group", companyLogoUrl: null, createdAt: ago(1 * DAY) },
  { id: "sample-2", title: "Clinic Front Desk Executive", companyName: "Cempaka Health Clinics", companyLogoUrl: null, createdAt: ago(2 * DAY) },
  { id: "sample-3", title: "Warehouse Operations Lead", companyName: "Bintang Logistics", companyLogoUrl: null, createdAt: ago(3 * DAY) },
  { id: "sample-4", title: "Frontend Engineer", companyName: "Lumino Software Studio", companyLogoUrl: null, createdAt: ago(4 * DAY) },
  { id: "sample-5", title: "Guest Relations Executive", companyName: "Sentosa Hospitality Group", companyLogoUrl: null, createdAt: ago(5 * DAY) },
];

export const SAMPLE_LATEST_ACTIVITY: LatestActivity[] = [
  { id: "sample-1", status: "shortlisted", jobTitle: "Retail Store Supervisor", companyName: "Northwind Retail Group", companyLogoUrl: null, updatedAt: ago(3 * HOUR) },
  { id: "sample-2", status: "interview", jobTitle: "Frontend Engineer", companyName: "Lumino Software Studio", companyLogoUrl: null, updatedAt: ago(7 * HOUR) },
  { id: "sample-3", status: "shortlisted", jobTitle: "Warehouse Operations Lead", companyName: "Bintang Logistics", companyLogoUrl: null, updatedAt: ago(1 * DAY) },
  { id: "sample-4", status: "interview", jobTitle: "Guest Relations Executive", companyName: "Sentosa Hospitality Group", companyLogoUrl: null, updatedAt: ago(2 * DAY) },
  { id: "sample-5", status: "shortlisted", jobTitle: "Clinic Front Desk Executive", companyName: "Cempaka Health Clinics", companyLogoUrl: null, updatedAt: ago(3 * DAY) },
];

/** Real rows first, topped up with samples until there are `size`. */
export function topUp<T>(real: T[], samples: T[], size = 5): T[] {
  return real.length >= size ? real : [...real, ...samples.slice(0, size - real.length)];
}
