/**
 * Sample job listings for the jobseeker page's "Jobs posted on JobGiga",
 * from the redesign. Same curated showcase companies (and logos) as the
 * employer page's company cards. Roles, pay and details are illustrative.
 * Labels (job type, arrangement, salary, dates) are stored as codes and
 * numbers so they're translated when shown; employer-written text
 * (title, description, skills) is shown as written.
 */

export type EmploymentType = "full_time" | "part_time" | "contract" | "internship" | "freelance" | "temporary";
export type WorkArrangement = "onsite" | "hybrid" | "remote";
export type SalaryPeriod = "hour" | "day" | "month" | "year";
export type LanguageLevel = "basic" | "conversational" | "fluent" | "native";
export type WorkAuthorization = "citizen" | "permanent_resident" | "work_pass_holder" | "needs_sponsorship";

export type RequiredLanguage = { language: string; dialect?: string | null; level: LanguageLevel };

export type JobPosting = {
  id: string;
  /** Sample listings can't be applied to or reported — there's no real posting behind them. */
  sample: boolean;
  title: string;
  company: string;
  logoUrl: string | null;
  employmentType: EmploymentType;
  workArrangement: WorkArrangement;
  /** Short location text, or REMOTE_LOCATION for a remote role with no office. */
  location: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryPeriod: SalaryPeriod;
  postedAt: string;
  description: string;
  /** Responsibilities separated by " · ". */
  responsibilities: string;
  industry: string;
  openings: number;
  skills: string[];
  softSkills: string[];
  languages: RequiredLanguage[];
  workAuthorizations: WorkAuthorization[];
};

/** What a remote role with no office address stores as its location. */
export const REMOTE_LOCATION = "Remote";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const SAMPLE_JOB_POSTINGS: JobPosting[] = [
  {
    id: "sample-1",
    sample: true,
    title: "Security Engineer",
    company: "aikido",
    logoUrl: "/logos/aikido.svg",
    employmentType: "full_time",
    workArrangement: "remote",
    location: REMOTE_LOCATION,
    salaryMin: 7000,
    salaryMax: 11000,
    salaryPeriod: "month",
    postedAt: daysAgo(4),
    description:
      "We're looking for a Security Engineer to help build and harden the automated vulnerability scanning that powers our platform. You'll work across the stack to catch real risks early, without drowning developers in false positives.",
    responsibilities:
      "Improve detection accuracy across our scanning engines · Triage and validate newly discovered vulnerability classes · Work with engineering to remediate findings in our own codebase · Contribute to research on emerging attack techniques",
    industry: "Cybersecurity",
    openings: 2,
    skills: ["Application security", "Static analysis", "Python"],
    softSkills: ["Attention to detail", "Communication", "Curiosity"],
    languages: [{ language: "English", level: "fluent" }],
    workAuthorizations: ["citizen", "permanent_resident", "work_pass_holder"],
  },
  {
    id: "sample-2",
    sample: true,
    title: "Backend Engineer",
    company: "Bolt",
    logoUrl: "/logos/bolt.jpg",
    employmentType: "full_time",
    workArrangement: "remote",
    location: REMOTE_LOCATION,
    salaryMin: 8000,
    salaryMax: 13000,
    salaryPeriod: "month",
    postedAt: daysAgo(7),
    description:
      "Join the team building the infrastructure behind one of Europe's fastest-growing mobility and fintech platforms. You'll design and scale services that handle millions of transactions, with real ownership over reliability and performance.",
    responsibilities:
      "Design and scale high-throughput backend services · Own reliability and on-call for your team's services · Collaborate closely with product on new payment features · Mentor junior engineers on system design",
    industry: "Fintech",
    openings: 1,
    skills: ["Go", "Distributed systems", "PostgreSQL"],
    softSkills: ["Ownership", "Problem solving", "Clear technical writing"],
    languages: [{ language: "English", level: "fluent" }],
    workAuthorizations: ["citizen", "permanent_resident", "work_pass_holder"],
  },
  {
    id: "sample-3",
    sample: true,
    title: "Customer Success Manager",
    company: "Parim",
    logoUrl: "/logos/parim.svg",
    employmentType: "full_time",
    workArrangement: "remote",
    location: REMOTE_LOCATION,
    salaryMin: 5000,
    salaryMax: 7500,
    salaryPeriod: "month",
    postedAt: daysAgo(2),
    description:
      "We're hiring a Customer Success Manager to help workforce management customers get the most out of our platform. You'll be the main point of contact from onboarding through renewal, spotting risk early and turning happy customers into advocates.",
    responsibilities:
      "Own onboarding and adoption for a portfolio of accounts · Run regular check-ins and business reviews · Spot churn risk early and coordinate a save plan · Feed customer feedback back into the product roadmap",
    industry: "Workforce management",
    openings: 1,
    skills: ["Customer success", "SaaS onboarding", "CRM tools"],
    softSkills: ["Communication", "Empathy", "Relationship building"],
    languages: [{ language: "English", level: "fluent" }],
    workAuthorizations: ["citizen", "permanent_resident"],
  },
  {
    id: "sample-4",
    sample: true,
    title: "Operations Coordinator",
    company: "parcelly",
    logoUrl: "/logos/parcelly.svg",
    employmentType: "full_time",
    workArrangement: "remote",
    location: REMOTE_LOCATION,
    salaryMin: 3800,
    salaryMax: 5200,
    salaryPeriod: "month",
    postedAt: daysAgo(5),
    description:
      "We're looking for an Operations Coordinator to help keep our parcel collection network running smoothly. You'll work closely with partner locations and the logistics team to make sure every drop-off point stays reliable for customers.",
    responsibilities:
      "Monitor partner location performance and flag issues early · Coordinate with couriers on collection scheduling · Support onboarding of new partner locations · Maintain accurate records across internal systems",
    industry: "Logistics",
    openings: 2,
    skills: ["Operations coordination", "Logistics tools", "Excel"],
    softSkills: ["Organization", "Problem solving", "Communication"],
    languages: [{ language: "English", level: "fluent" }],
    workAuthorizations: ["citizen", "permanent_resident"],
  },
  {
    id: "sample-5",
    sample: true,
    title: "Frontend Engineer",
    company: "ParcelTracker",
    logoUrl: "/logos/parceltracker.svg",
    employmentType: "full_time",
    workArrangement: "remote",
    location: REMOTE_LOCATION,
    salaryMin: 6000,
    salaryMax: 9000,
    salaryPeriod: "month",
    postedAt: daysAgo(3),
    description:
      "Join our product team to build the interfaces couriers and warehouse teams rely on every day to scan, sort, and track parcels. You'll have real ownership over how features look and feel, working closely with design and backend engineers.",
    responsibilities:
      "Build and maintain a shared React component library · Implement UI from Figma designs with an eye for detail · Collaborate with backend engineers on API contracts · Write tests for critical scanning and tracking flows",
    industry: "Business software",
    openings: 1,
    skills: ["React", "TypeScript", "REST APIs"],
    softSkills: ["Communication", "Teamwork", "Attention to detail"],
    languages: [{ language: "English", level: "fluent" }],
    workAuthorizations: ["citizen", "permanent_resident", "work_pass_holder"],
  },
  {
    id: "sample-6",
    sample: true,
    title: "Content Designer",
    company: "WHALE",
    logoUrl: "/logos/whale.svg",
    employmentType: "full_time",
    workArrangement: "remote",
    location: REMOTE_LOCATION,
    salaryMin: 4500,
    salaryMax: 6500,
    salaryPeriod: "month",
    postedAt: daysAgo(6),
    description:
      "We're hiring a Content Designer to help teams turn messy processes into clear, easy-to-follow SOPs. You'll shape both our own product content and the templates customers use to document their own workflows.",
    responsibilities:
      "Write and edit clear, concise process documentation · Design reusable SOP templates for customers · Partner with product on in-app copy and onboarding flows · Review customer-submitted docs for clarity",
    industry: "Process documentation software",
    openings: 1,
    skills: ["Technical writing", "Content design", "Process documentation"],
    softSkills: ["Clarity", "Attention to detail", "Collaboration"],
    languages: [{ language: "English", level: "fluent" }],
    workAuthorizations: ["citizen", "permanent_resident"],
  },
];

const MIN_LISTINGS = 6;

/**
 * Real postings first; samples fill up to 6. Once there are 6+ real postings
 * every one of them shows (the list isn't capped).
 */
export function buildDisplayPostings(realPostings: JobPosting[]): JobPosting[] {
  if (realPostings.length >= MIN_LISTINGS) return realPostings;
  return [...realPostings, ...SAMPLE_JOB_POSTINGS.slice(0, MIN_LISTINGS - realPostings.length)];
}
