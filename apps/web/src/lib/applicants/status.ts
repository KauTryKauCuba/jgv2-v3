import type { AppRouterClient } from "@jobgiga-app/api/routers/index";
import type { CSSProperties, ReactElement } from "react";
import {
  BoltIcon,
  CheckCircleIcon,
  ClockIcon,
  DraftIcon,
  FlagIcon,
  PencilIcon,
  StackIcon,
  XCircleIcon,
} from "@/components/landing/icons";

// The employer applicant pages' shared bits, from the redesign's
// lib/applicationStatus.ts and components/applicationStatusTiles.ts. The
// status colours themselves live in lib/dashboard/pipeline.ts; the words are
// translation keys (dashboard.status.*, applicants.*).

type Output<T extends (...args: never[]) => unknown> = Awaited<ReturnType<T>>;

/** The Applicants page's data (application.listForEmployer). */
export type ApplicantsPageData = Output<AppRouterClient["application"]["listForEmployer"]>;
/** A posting's own page's data (application.postingPage). */
export type PostingPageData = Output<AppRouterClient["application"]["postingPage"]>;
/** The Interviews page's data (application.listInterviews). */
export type InterviewsPageData = Output<AppRouterClient["application"]["listInterviews"]>;
/** One row of the redesign's getApplicationsForEmployer (application.listForEmployer). */
export type ApplicantRow = Output<AppRouterClient["application"]["listForEmployer"]>["applications"][number];
export type EmployerTeamMember = Output<AppRouterClient["application"]["listForEmployer"]>["teamMembers"][number];
export type ApplicantProfile = Output<AppRouterClient["application"]["applicantProfile"]>["profile"];
export type InterviewDetails = NonNullable<ApplicantRow["application"]["interviewDetails"]>;
export type InterviewResponseStatus = NonNullable<ApplicantRow["application"]["interviewResponseStatus"]>;

// Matches application_status exactly (see the finalized pipeline design).
export const STATUS_ORDER = [
  "applied",
  "screened",
  "shortlisted",
  "interview",
  "interviewed",
  "evaluation",
  "evaluated",
  "kiv",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;

// The "at a glance" status tiles' icons.
export const STATUS_ICON: Record<
  string,
  (props: { className?: string; strokeWidth?: number; style?: CSSProperties }) => ReactElement
> = {
  applied: StackIcon,
  screened: ClockIcon,
  shortlisted: BoltIcon,
  interview: ClockIcon,
  interviewed: CheckCircleIcon,
  evaluation: PencilIcon,
  evaluated: CheckCircleIcon,
  kiv: FlagIcon,
  offer: DraftIcon,
  hired: CheckCircleIcon,
  rejected: XCircleIcon,
  withdrawn: XCircleIcon,
};

// Same deeper/saturated pastel each status's APPLICATION_STATUS_COLOR.bg
// approximates — used as the gradient-to-white start color + the watermark
// icon's --icon-accent, matching the Manage Job pipeline tiles' treatment.
export const STATUS_TILE_GRADIENT: Record<string, string> = {
  applied: "#C9CFDA",
  screened: "#FFE1A1",
  shortlisted: "#8CE6D9",
  interview: "#D4C6F7",
  interviewed: "#A5C6F7",
  evaluation: "#FFCFA3",
  evaluated: "#A5EBCD",
  kiv: "#B9C3F9",
  offer: "#FFCDA1",
  hired: "#A5EBB9",
  rejected: "#F9B9B9",
  withdrawn: "#D4D7DC",
};

export const INTERVIEW_RESPONSE_STATUS_COLOR: Record<InterviewResponseStatus, { bg: string; text: string }> = {
  pending: { bg: "bg-[#FFF3D6]", text: "text-[#A67C00]" },
  accepted: { bg: "bg-[#E7F6EC]", text: "text-[#2F9E56]" },
  declined: { bg: "bg-red-50", text: "text-red-500" },
  reschedule_requested: { bg: "bg-[#FFEFE3]", text: "text-[#C2600A]" },
  attended: { bg: "bg-[#E6F9FA]", text: "text-[#008990]" },
  no_show: { bg: "bg-black/[0.06]", text: "text-[#4B5468]" },
};

/** RM3,000–4,500, or "—" when the jobseeker gave no figure. */
export function expectedSalaryText(min: number | null, max: number | null): string {
  const rm = (n: number) => n.toLocaleString("en-US");
  if (min && max) return `RM${rm(min)}–${rm(max)}`;
  if (min || max) return `RM${rm((min || max) as number)}`;
  return "—";
}
