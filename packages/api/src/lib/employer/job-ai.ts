import { jobseekerProfile, user } from "@jobgiga-app/db/schema/auth";
import { and, eq, like, notLike, sql } from "drizzle-orm";
import { INDUSTRIES } from "../../shared/industries";
import { isSalaryPeriod, SALARY_PERIODS } from "../../shared/job-posting-options";
import { normalizeLanguageRequirements } from "../../shared/languages";
import type { AiKeys } from "../../context";
import { type ProviderRaceAttempt, raceChatProviders } from "../ai/provider-race";
import { logAiUsage } from "../ai/usage";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

// Post a job's AI helpers and salary insight, from the redesign
// (lib/job-posting-suggestion.ts, api/employer/suggest-salary,
// api/employer/suggest-skills, lib/salary-insights.ts). Prompts and checks
// are the redesign's; the calls go through v3's provider race. With no AI
// keys, each returns clearly labelled sample data (see provider-race.ts).

type Fail = { ok: false; error: string; status: number };

function logAttempts(db: AnyDb, userId: string, feature: string, attempts: Promise<ProviderRaceAttempt>[], startedAt: number) {
	void Promise.allSettled(attempts).then((settled) =>
		Promise.all(
			settled
				.filter((r): r is PromiseFulfilledResult<ProviderRaceAttempt> => r.status === "fulfilled")
				.map((r) =>
					logAiUsage(db, {
						feature,
						provider: r.value.provider,
						model: r.value.model,
						promptTokens: r.value.usage?.prompt_tokens ?? null,
						completionTokens: r.value.usage?.completion_tokens ?? null,
						totalTokens: r.value.usage?.total_tokens ?? null,
						durationMs: Date.now() - startedAt,
						userId,
					}),
				),
		).catch((err) => console.error("AI usage logging failed:", err)),
	);
}

// ── Fill the whole posting from a title ─────────────────────────────────────

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "freelance", "temporary"] as const;
const WORK_ARRANGEMENTS = ["remote", "hybrid", "onsite"] as const;
const QUALIFICATION_TIERS = ["SPM", "STPM", "Diploma", "Degree", "Master", "PhD", "Other"] as const;
const WORK_AUTHORIZATIONS = ["citizen", "permanent_resident", "work_pass_holder", "needs_sponsorship"] as const;
const DRIVING_LICENSES = ["b2", "b", "d", "da", "e"] as const;
const LANGUAGE_LEVELS = ["basic", "conversational", "fluent", "native"] as const;

// Built inside a function: module-level work runs before a Worker's clock starts.
function postingSystemPrompt() {
	return `You write realistic, typical job posting parameters for a Malaysian hiring platform, given only a job title (and optionally the employer's industry/company size/location for context). You have no way to verify real-world facts — everything you produce is a generated, typical example for that role, not a verified fact, and the employer will review and edit before publishing. Respond with ONLY a json object, no prose, matching exactly this shape:
{
  "description": string,
  "responsibilities": string,
  "industry": ${INDUSTRIES.map((i) => `"${i}"`).join(" | ")} | null,
  "employmentType": ${EMPLOYMENT_TYPES.map((t) => `"${t}"`).join(" | ")},
  "workArrangement": ${WORK_ARRANGEMENTS.map((w) => `"${w}"`).join(" | ")},
  "salaryMin": number,
  "salaryMax": number,
  "skills": string[],
  "softSkills": string[],
  "niceToHaveSkills": string[],
  "minYearsExperience": number,
  "minQualificationTier": ${QUALIFICATION_TIERS.map((t) => `"${t}"`).join(" | ")} | null,
  "languages": { "language": string, "level": ${LANGUAGE_LEVELS.map((l) => `"${l}"`).join(" | ")} }[],
  "workAuthorizations": (${WORK_AUTHORIZATIONS.map((w) => `"${w}"`).join(" | ")})[],
  "drivingLicense": ${DRIVING_LICENSES.map((d) => `"${d}"`).join(" | ")} | null
}
"description" is 3-5 sentences covering what the role involves and what a typical day looks like — written as an actual job posting, not a list. "responsibilities" is the full job-ad body: a "Responsibilities" section (4-7 bullet points, each starting with "- ") followed by a blank line and a "Requirements:" section (3-6 bullet points), formatted as plain text with literal "\\n" newlines and "- " bullet prefixes, not markdown headers — this is the detailed part of the posting, distinct from and longer than "description" above. "industry" is your best classification of which of the three listed industries this role most belongs to, or null if it genuinely could belong to any of them. "employmentType" and "workArrangement" are your best default guess for how this role is normally hired in Malaysia. "salaryMin"/"salaryMax" is a realistic monthly salary range in Malaysian Ringgit (RM) for this role at a typical Malaysian company — a real, sensible range, not a placeholder like 0 or round numbers with no basis. "skills" is 4-8 concrete technical/professional skills or tools genuinely required for this specific role. "softSkills" is 2-4 genuine interpersonal/behavioral traits this specific role actually needs (e.g. "Communication", "Time management", "Attention to detail") — distinct from "skills" above, and specific to the role rather than generic filler that could apply to any job. "niceToHaveSkills" is 2-5 additional technical/professional skills or tools that would be a bonus for this role but aren't strictly required — distinct from "skills" (which are the hard requirements), genuinely optional extras a strong candidate might have (e.g. an adjacent tool, a nice-to-have certification, a related but non-essential technology), empty array only if the role genuinely has no sensible bonus skills. "minYearsExperience" is the typical minimum years of experience for this role at a normal (not senior) level — 0 for genuinely entry-level roles. "minQualificationTier" is the typical minimum education level actually required for this role — null only if the role genuinely has no typical education requirement (e.g. many blue-collar/retail/driving roles), not as a lazy default. "languages" should almost always include at least English at "conversational" or higher for any Malaysian workplace role, plus Malay if the role is customer-facing or locally-oriented — empty array only if truly no language requirement makes sense. "workAuthorizations" should list every work-authorization category you'd realistically accept for this role — for a typical local hire this is usually ["citizen", "permanent_resident"], only add "work_pass_holder"/"needs_sponsorship" if the role plausibly justifies sponsoring foreign talent (e.g. a specialized tech role), never for roles regulated to citizens only. "drivingLicense" is null unless the role genuinely requires driving (e.g. delivery, sales rep, driver) — never default to requiring one for a desk-based role.`;
}

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
	return typeof value === "string" && (options as readonly string[]).includes(value);
}
function nonNegativeInt(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
}
function stringList(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((s): s is string => typeof s === "string" && s.trim().length > 0).map((s) => s.trim())
		: [];
}

function validatePostingSuggestion(raw: unknown) {
	const obj = (raw ?? {}) as Record<string, unknown>;
	const minRaw = nonNegativeInt(obj.salaryMin);
	const maxRaw = nonNegativeInt(obj.salaryMax);
	const [salaryMin, salaryMax] = minRaw !== null && maxRaw !== null && minRaw > maxRaw ? [maxRaw, minRaw] : [minRaw, maxRaw];
	const languages = Array.isArray(obj.languages)
		? obj.languages
				.map((entry) => {
					const e = (entry ?? {}) as Record<string, unknown>;
					if (typeof e.language !== "string" || !e.language.trim() || !isOneOf(e.level, LANGUAGE_LEVELS)) return null;
					return { language: e.language.trim(), level: e.level };
				})
				.filter((e): e is { language: string; level: (typeof LANGUAGE_LEVELS)[number] } => e !== null)
		: [];
	return {
		description: typeof obj.description === "string" && obj.description.trim() ? obj.description.trim() : null,
		responsibilities: typeof obj.responsibilities === "string" && obj.responsibilities.trim() ? obj.responsibilities.trim() : null,
		industry: isOneOf(obj.industry, INDUSTRIES) ? obj.industry : null,
		employmentType: isOneOf(obj.employmentType, EMPLOYMENT_TYPES) ? obj.employmentType : null,
		workArrangement: isOneOf(obj.workArrangement, WORK_ARRANGEMENTS) ? obj.workArrangement : null,
		salaryMin,
		salaryMax,
		skills: stringList(obj.skills),
		softSkills: stringList(obj.softSkills),
		niceToHaveSkills: stringList(obj.niceToHaveSkills),
		minYearsExperience: nonNegativeInt(obj.minYearsExperience),
		minQualificationTier: isOneOf(obj.minQualificationTier, QUALIFICATION_TIERS) ? obj.minQualificationTier : null,
		languages: normalizeLanguageRequirements(languages),
		workAuthorizations: Array.isArray(obj.workAuthorizations)
			? obj.workAuthorizations.filter((v): v is (typeof WORK_AUTHORIZATIONS)[number] => isOneOf(v, WORK_AUTHORIZATIONS))
			: [],
		drivingLicense: isOneOf(obj.drivingLicense, DRIVING_LICENSES) ? obj.drivingLicense : null,
	};
}

export type JobPostingSuggestion = ReturnType<typeof validatePostingSuggestion>;

export async function suggestJobPosting(
	db: AnyDb,
	ai: AiKeys,
	userId: string,
	params: { jobTitle: string; companyIndustry?: string | null; companySize?: string | null; companyLocation?: string | null },
): Promise<{ ok: true; result: JobPostingSuggestion; usage: unknown; provider: string; durationMs: number } | Fail> {
	const context = [
		params.companyIndustry?.trim() ? `Employer industry: ${params.companyIndustry.trim()}` : null,
		params.companySize?.trim() ? `Employer size: ${params.companySize.trim()}` : null,
		params.companyLocation?.trim() ? `Employer location: ${params.companyLocation.trim()}` : null,
	].filter((line): line is string => line !== null);
	const startedAt = Date.now();
	const attempts: Promise<ProviderRaceAttempt>[] = [];
	const result = await raceChatProviders({
		systemPrompt: postingSystemPrompt(),
		userContent: `Job title: ${params.jobTitle.trim()}${context.length ? `\n${context.join("\n")}` : ""}`,
		mimoKey: ai.mimoKey,
		temperature: 0.4,
		maxTokens: 700,
		taskLabel: "suggestion",
		notConfiguredError: "Job posting suggestions aren't configured.",
		collectedAttempts: attempts,
		devStub: () =>
			JSON.stringify({
				description: `Sample text (no AI key set): a typical ${params.jobTitle.trim()} role at a Malaysian company. You'd work with a small team on day-to-day tasks and report to a manager.`,
				responsibilities:
					"Responsibilities\n- Sample responsibility one\n- Sample responsibility two\n- Sample responsibility three\n\nRequirements:\n- Sample requirement one\n- Sample requirement two",
				industry: null,
				employmentType: "full_time",
				workArrangement: "onsite",
				salaryMin: 3000,
				salaryMax: 4500,
				skills: ["Microsoft Excel", "Project Management", "Reporting"],
				softSkills: ["Communication", "Teamwork"],
				niceToHaveSkills: ["Power BI"],
				minYearsExperience: 2,
				minQualificationTier: "Degree",
				languages: [
					{ language: "English", level: "conversational" },
					{ language: "Malay", level: "conversational" },
				],
				workAuthorizations: ["citizen", "permanent_resident"],
				drivingLicense: null,
			}),
	});
	const durationMs = Date.now() - startedAt;
	if (!result.ok) return result;
	let parsed: unknown;
	try {
		parsed = JSON.parse(result.content);
	} catch {
		return { ok: false, error: "Couldn't understand the suggestion. Try again.", status: 502 };
	}
	logAttempts(db, userId, "job_posting_suggestion", attempts, startedAt);
	return { ok: true, result: validatePostingSuggestion(parsed), usage: result.usage, provider: result.provider, durationMs };
}

// ── Salary range ─────────────────────────────────────────────────────────────

const SALARY_PROMPT = `You estimate typical pay for job postings on a Malaysian hiring platform. Given a role and its details, respond with ONLY a json object, no prose, exactly this shape:
{"salaryMin": number, "salaryMax": number, "reason": string}
"salaryMin"/"salaryMax" are a realistic range in Malaysian Ringgit (RM) for the stated pay period (per month, per hour, per day, or per project), at a typical Malaysian employer in 2026 — whole numbers, min below max, sensible for the role's seniority, location (Klang Valley and Penang usually pay more than smaller towns), job type (part-time/freelance/temporary rates differ from full-time) and required experience. Never return a monthly figure when the period is hourly, daily or per project. "reason" is ONE short sentence (under 20 words) naming the main factors behind the range, e.g. "Mid-level design role in Kuala Lumpur, where demand keeps pay above the national average."`;

const clip = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max) : "");

export async function suggestSalary(
	db: AnyDb,
	ai: AiKeys,
	userId: string,
	body: Record<string, unknown>,
): Promise<{ ok: true; suggestion: { min: number; max: number; period: string; reason: string | null } } | Fail> {
	const title = clip(body.jobTitle, 120);
	if (!title) return { ok: false, error: "Enter a job title first.", status: 400 };
	const period = isSalaryPeriod(body.salaryPeriod) ? body.salaryPeriod : "month";
	const unit = SALARY_PERIODS.find((p) => p.value === period)!.unit;
	const years = typeof body.minYearsExperience === "number" && body.minYearsExperience >= 0 ? body.minYearsExperience : null;
	const userContent = [
		`Job title: ${title}`,
		`Pay period: per ${unit}`,
		clip(body.employmentType, 40) && `Job type: ${clip(body.employmentType, 40).replace("_", "-")}`,
		clip(body.workArrangement, 40) && `Workplace: ${clip(body.workArrangement, 40)}`,
		clip(body.location, 120) && `Location: ${clip(body.location, 120)}`,
		clip(body.industry, 120) && `Industry: ${clip(body.industry, 120)}`,
		years !== null && `Minimum experience: ${years} year${years === 1 ? "" : "s"}`,
	]
		.filter(Boolean)
		.join("\n");

	const startedAt = Date.now();
	const attempts: Promise<ProviderRaceAttempt>[] = [];
	const result = await raceChatProviders({
		systemPrompt: SALARY_PROMPT,
		userContent,
		mimoKey: ai.mimoKey,
		temperature: 0.3,
		maxTokens: 200,
		taskLabel: "suggestion",
		notConfiguredError: "Salary suggestions aren't configured.",
		collectedAttempts: attempts,
		devStub: () =>
			JSON.stringify(
				period === "hour"
					? { salaryMin: 12, salaryMax: 18, reason: "Sample range — no AI key is set yet." }
					: { salaryMin: 3500, salaryMax: 5000, reason: "Sample range — no AI key is set yet." },
			),
	});
	if (!result.ok) return { ok: false, error: "Couldn't reach the suggestion service. Try again.", status: 502 };
	logAttempts(db, userId, "salary_suggestion", attempts, startedAt);
	let parsed: Record<string, unknown>;
	try {
		parsed = JSON.parse(result.content) as Record<string, unknown>;
	} catch {
		return { ok: false, error: "Couldn't understand the suggestion. Try again.", status: 502 };
	}
	const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
	let min = num(parsed.salaryMin);
	let max = num(parsed.salaryMax);
	if (min === null || max === null) {
		return { ok: false, error: "Couldn't come up with a range for this role. Try again.", status: 502 };
	}
	if (min > max) [min, max] = [max, min];
	return { ok: true, suggestion: { min, max, period, reason: clip(parsed.reason, 200) || null } };
}

// ── Skills from a title ──────────────────────────────────────────────────────

const MAX_SUGGESTIONS = 40;
const SKILLS_PROMPT = `You suggest relevant skills for a job posting on a Malaysian job platform, based on the role's title. Respond with ONLY a json object, no prose, matching exactly this shape:
{
  "professionalSkills": string[],
  "softSkills": string[],
  "niceToHaveSkills": string[]
}
"professionalSkills" are hard/technical skills, tools, and technologies a candidate must have to do this job (e.g. software, methodologies, technical competencies) — up to ${MAX_SUGGESTIONS} items. "softSkills" are general work-style/interpersonal skills relevant to the role — up to ${MAX_SUGGESTIONS} items. "niceToHaveSkills" are bonus technical or tool skills that would help but aren't required — up to ${MAX_SUGGESTIONS} items, and must not repeat anything already in "professionalSkills". Each item should be short (1-4 words) and Title Case, with no duplicates within or across the three lists. If the job title is too vague, empty, or nonsensical to suggest anything meaningful for, return empty arrays for all three rather than guessing generically.`;

function sanitizeSkillList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of value) {
		if (typeof raw !== "string") continue;
		const trimmed = raw.trim();
		if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
		seen.add(trimmed.toLowerCase());
		out.push(trimmed);
		if (out.length === MAX_SUGGESTIONS) break;
	}
	return out;
}

export async function suggestPostingSkills(
	db: AnyDb,
	ai: AiKeys,
	userId: string,
	jobTitle: string,
): Promise<
	| { ok: true; suggestions: { professionalSkills: string[]; softSkills: string[]; niceToHaveSkills: string[] }; usage: unknown; durationMs: number }
	| Fail
> {
	const startedAt = Date.now();
	const attempts: Promise<ProviderRaceAttempt>[] = [];
	const result = await raceChatProviders({
		systemPrompt: SKILLS_PROMPT,
		userContent: `Job title: ${jobTitle.trim()}`,
		mimoKey: ai.mimoKey,
		temperature: 0.3,
		maxTokens: 900,
		taskLabel: "skill suggestion",
		notConfiguredError: "Skill suggestions are not configured.",
		collectedAttempts: attempts,
		devStub: () =>
			JSON.stringify({
				professionalSkills: ["Microsoft Excel", "Project Management", "Reporting"],
				softSkills: ["Communication", "Teamwork"],
				niceToHaveSkills: ["Power BI"],
			}),
	});
	const durationMs = Date.now() - startedAt;
	if (!result.ok) return result;
	let parsed: unknown;
	try {
		parsed = JSON.parse(result.content);
	} catch {
		return { ok: false, error: "Couldn't generate suggestions. Try again.", status: 502 };
	}
	logAttempts(db, userId, "skill_suggestion", attempts, startedAt);
	const obj = (parsed ?? {}) as Record<string, unknown>;
	const professionalSkills = sanitizeSkillList(obj.professionalSkills);
	const pro = new Set(professionalSkills.map((s) => s.toLowerCase()));
	const softSkills = sanitizeSkillList(obj.softSkills).filter((s) => !pro.has(s.toLowerCase()));
	const soft = new Set(softSkills.map((s) => s.toLowerCase()));
	const niceToHaveSkills = sanitizeSkillList(obj.niceToHaveSkills).filter(
		(s) => !pro.has(s.toLowerCase()) && !soft.has(s.toLowerCase()),
	);
	return { ok: true, suggestions: { professionalSkills, softSkills, niceToHaveSkills }, usage: result.usage, durationMs };
}

// ── What similar jobseekers expect to earn ──────────────────────────────────

const MIN_PROFILES = 3;
const FILLER_WORDS = new Set([
	"senior", "junior", "lead", "head", "chief", "assistant", "associate", "principal", "intern",
	"trainee", "executive", "officer", "staff", "the", "and", "for", "with", "part", "time", "full",
]);

export type SalaryInsight = {
	count: number;
	typicalMin: number;
	typicalMax: number;
	scope: "role" | "role_state" | "industry";
	state: string | null;
};

function median(values: number[]): number {
	const sorted = [...values].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
const round100 = (n: number) => Math.round(n / 100) * 100;

function summarize(rows: { min: number | null; max: number | null }[], scope: SalaryInsight["scope"], state: string | null) {
	const valid = rows.filter((r): r is { min: number; max: number } => !!r.min && r.min > 0 && !!r.max && r.max >= r.min);
	if (valid.length < MIN_PROFILES) return null;
	return {
		count: valid.length,
		typicalMin: round100(median(valid.map((r) => r.min))),
		typicalMax: round100(median(valid.map((r) => r.max))),
		scope,
		state,
	};
}

/**
 * The Salary card's "Most matching candidates expect …": the typical
 * expected monthly salary of jobseekers aiming for a similar role (in the
 * posting's state when there are enough), else in the same industry.
 * Sample applicants (…@example.com) aren't counted.
 */
export async function getSalaryInsight(
	db: AnyDb,
	params: { title: string; industry?: string | null; state?: string | null },
): Promise<SalaryInsight | null> {
	const words = params.title
		.toLowerCase()
		.split(/[^a-z0-9+#]+/)
		.filter((w) => w.length >= 3 && !FILLER_WORDS.has(w))
		.slice(0, 5);
	const columns = { min: jobseekerProfile.expectedSalaryFrom, max: jobseekerProfile.expectedSalaryTo, state: jobseekerProfile.state };
	const realJobseeker = notLike(user.email, "%@example.com");

	if (words.length > 0) {
		const roleRows = (await db
			.select(columns)
			.from(jobseekerProfile)
			.innerJoin(user, eq(user.id, jobseekerProfile.userId))
			.where(and(realJobseeker, ...words.map((w) => like(sql`lower(${jobseekerProfile.jobTitle})`, `%${w}%`))))
			.limit(1000)) as { min: number | null; max: number | null; state: string }[];
		const state = params.state?.trim() || null;
		if (state) {
			const inState = summarize(
				roleRows.filter((r) => r.state === state),
				"role_state",
				state,
			);
			if (inState) return inState;
		}
		const role = summarize(roleRows, "role", null);
		if (role) return role;
	}
	if (params.industry?.trim()) {
		const industryRows = (await db
			.select(columns)
			.from(jobseekerProfile)
			.innerJoin(user, eq(user.id, jobseekerProfile.userId))
			.where(and(realJobseeker, eq(jobseekerProfile.preferredIndustry, params.industry.trim())))
			.limit(1000)) as { min: number | null; max: number | null }[];
		return summarize(industryRows, "industry", null);
	}
	return null;
}
