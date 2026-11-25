import type { EmploymentType, SalaryPeriod, WorkArrangement } from "@/data/landing/sample-job-postings";
import type { BadgeKey } from "@/lib/companies/badges";
import type { EmployerResponsiveness } from "@/lib/companies/responsiveness";

/**
 * Sample companies for the Find companies directory and company pages, until
 * the database exists. Clearly sample names (the same ones as the employer
 * page's live card), not real businesses. Company-written text (description,
 * benefits, facilities, office labels, job titles) is shown as written, like
 * the sample job postings. Emails and websites use the reserved .example
 * domain, and there are no phone numbers or news links, so nothing points at
 * a real person or site.
 * TODO(api): replace with organization rows (v1's `organization`, keyed by
 * `slug`) and their published jobs, addresses, badges and responsiveness.
 */

export interface CompanyJob {
  id: string;
  title: string;
  location: string;
  employmentType: EmploymentType;
  workArrangement: WorkArrangement;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod;
  showSalary: boolean;
}

export interface CompanyAddress {
  id: string;
  label: string;
  addressLine1: string;
  addressLine2?: string;
  area?: string;
  postcode: string;
  city: string;
  state: string;
}

export interface Company {
  /** URL slug, like v1's organization.slug. */
  id: string;
  companyName: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  industry: string;
  /** The company's own description of its industry, shown when it differs from `industry`. */
  industryDetail: string | null;
  companySize: string;
  companyType: string | null;
  foundedYear: number | null;
  /** "YYYY-MM": when the company joined JobGiga. */
  joinedAt: string;
  location: string;
  ssmVerified: boolean;
  contactVerified: boolean;
  /** Paragraphs of the company's own description. */
  description: string[];
  benefits: string[];
  facilities: string[];
  dressCode: string | null;
  awards: { title: string; year: number | null }[];
  leaders: { name: string; title: string; photoUrl: string | null }[];
  addresses: CompanyAddress[];
  email: string | null;
  websiteUrl: string | null;
  /** Social pages, as in v1's organization (linkedinUrl, facebookUrl, instagramUrl). */
  linkedinUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  badgeKeys: BadgeKey[];
  responsiveness: EmployerResponsiveness | null;
  jobs: CompanyJob[];
}

const SAMPLE_COMPANIES: Company[] = [
  {
    id: "lumino-software-studio",
    companyName: "Lumino Software Studio",
    logoUrl: null,
    bannerUrl: null,
    industry: "Technology",
    industryDetail: "Software development",
    companySize: "11-50",
    companyType: "Sdn Bhd",
    foundedYear: 2019,
    joinedAt: "2026-03",
    location: "Cyberjaya, Selangor",
    ssmVerified: true,
    contactVerified: true,
    description: [
      "Lumino builds web and mobile apps for Malaysian retailers, clinics and logistics firms — from the first sketch to the app in people's hands.",
      "We're a small team that ships every week, reviews each other's work, and keeps meetings short.",
    ],
    benefits: ["Hybrid working", "Medical & dental", "Learning budget", "Flexible hours"],
    facilities: ["Pantry", "Nursing room", "Parking"],
    dressCode: "Smart casual",
    awards: [{ title: "Best Small Tech Workplace, Selangor", year: 2025 }],
    leaders: [
      { name: "Farah Aziz", title: "Founder & CEO", photoUrl: null },
      { name: "Daniel Lim", title: "Head of Engineering", photoUrl: null },
    ],
    addresses: [
      { id: "hq", label: "Head office", addressLine1: "Persiaran Multimedia", area: "Cyber 3", postcode: "63000", city: "Cyberjaya", state: "Selangor" },
      { id: "kl", label: "KL studio", addressLine1: "Jalan Tun Razak", postcode: "50400", city: "Kuala Lumpur", state: "W.P. Kuala Lumpur" },
    ],
    email: "careers@lumino.example",
    websiteUrl: "lumino.example",
    linkedinUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    badgeKeys: ["profile_completed", "first_job_posted", "screening_enabled", "first_candidate_screened", "first_hire", "team_builder"],
    responsiveness: { medianHours: 18, responseRate: 0.92, sampleSize: 36 },
    jobs: [
      { id: "lumino-frontend", title: "Frontend Engineer", location: "Cyberjaya", employmentType: "full_time", workArrangement: "hybrid", salaryMin: 6000, salaryMax: 9000, salaryPeriod: "month", showSalary: true },
      { id: "lumino-backend", title: "Backend Engineer", location: "Cyberjaya", employmentType: "full_time", workArrangement: "hybrid", salaryMin: 6500, salaryMax: 10000, salaryPeriod: "month", showSalary: true },
      { id: "lumino-qa", title: "QA Analyst", location: "Cyberjaya", employmentType: "contract", workArrangement: "onsite", salaryMin: 4000, salaryMax: 5500, salaryPeriod: "month", showSalary: false },
    ],
  },
  {
    id: "bintang-logistics",
    companyName: "Bintang Logistics",
    logoUrl: null,
    bannerUrl: null,
    industry: "Logistics",
    industryDetail: "Warehousing & last-mile delivery",
    companySize: "51-200",
    companyType: "Sdn Bhd",
    foundedYear: 2015,
    joinedAt: "2026-05",
    location: "Shah Alam, Selangor",
    ssmVerified: false,
    contactVerified: false,
    description: [
      "Bintang Logistics runs warehouses and same-day delivery across the Klang Valley for online shops and distributors.",
    ],
    benefits: ["Overtime pay", "Transport allowance", "Annual bonus"],
    facilities: ["Surau", "Canteen"],
    dressCode: "Company uniform",
    awards: [],
    leaders: [],
    addresses: [
      { id: "hub", label: "Main hub", addressLine1: "Jalan Utas 15/7", area: "Seksyen 15", postcode: "40200", city: "Shah Alam", state: "Selangor" },
    ],
    email: "hr@bintang.example",
    websiteUrl: null,
    linkedinUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    badgeKeys: ["first_job_posted", "screening_enabled"],
    responsiveness: { medianHours: 100, responseRate: 0.7, sampleSize: 22 },
    jobs: [
      { id: "bintang-ops-lead", title: "Warehouse Operations Lead", location: "Shah Alam", employmentType: "full_time", workArrangement: "onsite", salaryMin: 4500, salaryMax: 6000, salaryPeriod: "month", showSalary: true },
      { id: "bintang-forklift", title: "Forklift Operator", location: "Shah Alam", employmentType: "full_time", workArrangement: "onsite", salaryMin: 2400, salaryMax: 3000, salaryPeriod: "month", showSalary: true },
      { id: "bintang-driver", title: "Delivery Driver (Class D)", location: "Shah Alam", employmentType: "full_time", workArrangement: "onsite", salaryMin: 2200, salaryMax: 2800, salaryPeriod: "month", showSalary: true },
      { id: "bintang-inventory", title: "Inventory Controller", location: "Shah Alam", employmentType: "contract", workArrangement: "onsite", salaryMin: 3000, salaryMax: 3800, salaryPeriod: "month", showSalary: true },
    ],
  },
  {
    id: "northwind-retail-group",
    companyName: "Northwind Retail Group",
    logoUrl: null,
    bannerUrl: null,
    industry: "Retail",
    industryDetail: "Fashion & lifestyle retail",
    companySize: "201-500",
    companyType: "Berhad",
    foundedYear: 2008,
    joinedAt: "2026-01",
    location: "Petaling Jaya, Selangor",
    ssmVerified: true,
    contactVerified: false,
    description: [
      "Northwind runs fashion and lifestyle stores in malls across Selangor and Kuala Lumpur, with a growing online shop.",
    ],
    benefits: ["Staff discount", "Medical", "Annual bonus"],
    facilities: [],
    dressCode: null,
    awards: [],
    leaders: [],
    addresses: [
      { id: "hq", label: "Head office", addressLine1: "Jalan SS 7/26", area: "Kelana Jaya", postcode: "47301", city: "Petaling Jaya", state: "Selangor" },
    ],
    email: "careers@northwind.example",
    websiteUrl: "northwind.example",
    linkedinUrl: null,
    facebookUrl: null,
    instagramUrl: null,
    badgeKeys: ["profile_completed", "first_job_posted", "first_hire"],
    responsiveness: { medianHours: 40, responseRate: 0.85, sampleSize: 51 },
    jobs: [
      { id: "northwind-supervisor", title: "Retail Store Supervisor", location: "Petaling Jaya", employmentType: "full_time", workArrangement: "onsite", salaryMin: 3200, salaryMax: 4200, salaryPeriod: "month", showSalary: true },
      { id: "northwind-merchandiser", title: "Visual Merchandiser", location: "Petaling Jaya", employmentType: "full_time", workArrangement: "onsite", salaryMin: 2800, salaryMax: 3600, salaryPeriod: "month", showSalary: true },
    ],
  },
];

/** Every company: hiring ones first (most open roles), then A–Z, like the redesign's directory. */
export function listCompanies(): Company[] {
  return [...SAMPLE_COMPANIES].sort(
    (a, b) => b.jobs.length - a.jobs.length || a.companyName.localeCompare(b.companyName),
  );
}

/** One company by its slug, or undefined. */
export function findCompany(id: string): Company | undefined {
  return SAMPLE_COMPANIES.find((company) => company.id === id);
}
