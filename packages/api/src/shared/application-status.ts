// v3 keeps v1's values in the database (application.status,
// application_stages.stage_name, job.status). The redesign's screens are built
// around their own pipeline names, so the API turns v1's value into the
// redesign's before sending it. Client-safe — the web app imports the types.

/** The redesign's 12 pipeline steps, in the order its screens list them. */
export const PIPELINE_STATUSES = [
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

export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

// v1 value → redesign step. v1's interview outcomes (absent, decline) stay
// on the interview step; the interview row says what happened.
const FROM_V1: Record<string, PipelineStatus> = {
	received: "applied",
	pending: "applied",
	screened: "screened",
	shortlisted: "shortlisted",
	scheduled: "interview",
	in_progress: "interview", // a v1 stage name
	absent: "interview",
	decline: "interview",
	interviewed: "interviewed",
	evaluation: "evaluation", // added in v3
	reviewed: "evaluated",
	kiv: "kiv",
	offer: "offer", // added in v3
	passed: "hired",
	rejected: "rejected",
	reject: "rejected",
	withdrawn: "withdrawn", // added in v3
};

export function toPipelineStatus(v1Status: string): PipelineStatus {
	return FROM_V1[v1Status] ?? "applied";
}

/** Every v1 value that shows as this redesign step — for filtering in SQL. */
export function v1StatusesFor(step: PipelineStatus): string[] {
	return Object.entries(FROM_V1)
		.filter(([, value]) => value === step)
		.map(([key]) => key);
}

// v1's job.status → the redesign's posting status. v1 calls a live job
// "published"; the redesign calls it "active".
export function toPostingStatus(v1Status: string): string {
	return v1Status === "published" ? "active" : v1Status;
}

// v1 interview_type → the redesign's interview mode.
export function toInterviewMode(interviewType: string): "onsite" | "online" | "phone" {
	if (interviewType === "physical") return "onsite";
	if (interviewType === "phone") return "phone";
	return "online";
}

// v1 salary_types.name → the redesign's salary period (see SALARY_PERIODS).
export function toSalaryPeriod(salaryTypeName: string | null | undefined): string {
	const name = (salaryTypeName ?? "").toLowerCase();
	if (name.startsWith("hour")) return "hour";
	if (name.startsWith("year")) return "year";
	if (name.startsWith("day")) return "day";
	return "month";
}

// v1's job.work_arrangement has been written as both "onsite" and "on-site".
export function toWorkArrangement(value: string | null | undefined): string {
	return value === "on-site" ? "onsite" : (value ?? "onsite");
}

// SQLite's datetime('now') gives "2026-11-26 08:30:00" (UTC, no zone).
// Turns that, or anything Date can read, into an ISO string.
export function toIso(value: string | null | undefined): string {
	if (!value) return new Date(0).toISOString();
	const sqlite = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
	const date = new Date(sqlite);
	return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}
