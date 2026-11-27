import {
	isSalaryPeriod,
	isStartAvailability,
	MAX_POSTING_BENEFITS,
	MAX_WORKING_HOURS_LENGTH,
} from "../../shared/job-posting-options";
import {
	DRIVING_LICENSES,
	EMPLOYMENT_TYPES,
	isCustomQuestionArray,
	isLanguageArray,
	isNonEmptyString,
	isOptionalInt,
	isOptionalString,
	isPreferredKeys,
	isSkillSuggestions,
	isStringArray,
	WORK_ARRANGEMENTS,
	WORK_AUTHORIZATIONS,
} from "../../shared/job-posting-validation";
import { INDUSTRIES } from "../../shared/industries";
import { normalizeLanguageRequirements } from "../../shared/languages";
import { sanitizeDescriptionHtml } from "../sanitize-html";
import type { PostingFields } from "./posting";

// The redesign's request checks for creating and editing a job posting
// (app/api/employer/job-postings/route.ts and [id]/route.ts, plus
// lib/posting-extras.ts), with the same rules and messages. Returns the
// cleaned fields — only the ones sent — or the first problem.

type Result = { ok: true; fields: PostingFields } | { ok: false; error: string };

export function parsePostingBody(
	body: Record<string, unknown>,
	opts: { mode: "create" | "update"; screeningEnabledBefore?: boolean },
): Result {
	const b = body;
	const creating = opts.mode === "create";
	const allowed = creating ? ["draft", "pending"] : ["draft", "pending", "closed"];
	if (creating ? !allowed.includes(b.status as string) : b.status !== undefined && !allowed.includes(b.status as string)) {
		return { ok: false, error: "Invalid status." };
	}
	// Drafts can be half-finished — only a title is needed. Submitting for review needs the rest.
	if (creating || b.title !== undefined) {
		if (!isNonEmptyString(b.title)) return { ok: false, error: "Enter a job title." };
	}
	if (creating && b.status === "pending") {
		if (!isNonEmptyString(b.description)) return { ok: false, error: "Enter a description." };
		if (!isNonEmptyString(b.responsibilities)) return { ok: false, error: "Enter the job description/responsibilities." };
		if (!isNonEmptyString(b.industry)) return { ok: false, error: "Choose an industry." };
		if (!isNonEmptyString(b.location)) return { ok: false, error: "Enter a location." };
		if (!isStringArray(b.skills) || b.skills.length === 0) return { ok: false, error: "Add at least one required skill." };
	}
	if (isNonEmptyString(b.industry) && !(INDUSTRIES as readonly string[]).includes(b.industry)) {
		return { ok: false, error: "Invalid industry." };
	}
	if (b.employmentType !== undefined && !(EMPLOYMENT_TYPES as readonly string[]).includes(b.employmentType as string)) {
		return { ok: false, error: "Invalid employment type." };
	}
	if (b.workArrangement !== undefined && !(WORK_ARRANGEMENTS as readonly string[]).includes(b.workArrangement as string)) {
		return { ok: false, error: "Invalid work arrangement." };
	}
	if (!isOptionalInt(b.salaryMin) || !isOptionalInt(b.salaryMax)) return { ok: false, error: "Invalid salary range." };
	if (!isOptionalInt(b.openings)) return { ok: false, error: "Invalid number of openings." };
	if (b.skills !== undefined && !isStringArray(b.skills)) return { ok: false, error: "Invalid skills list." };
	if (b.softSkills !== undefined && !isStringArray(b.softSkills)) return { ok: false, error: "Invalid soft skills list." };
	if (b.niceToHaveSkills !== undefined && !isStringArray(b.niceToHaveSkills)) {
		return { ok: false, error: "Invalid nice-to-have skills list." };
	}
	if (!isOptionalInt(b.minYearsExperience)) return { ok: false, error: "Invalid minimum years of experience." };
	if (!isOptionalString(b.minQualificationTier)) return { ok: false, error: "Invalid minimum qualification." };
	if (b.languages !== undefined && !isLanguageArray(b.languages)) return { ok: false, error: "Invalid required languages." };
	if (
		b.workAuthorizations !== undefined &&
		(!isStringArray(b.workAuthorizations) ||
			!b.workAuthorizations.every((w) => (WORK_AUTHORIZATIONS as readonly string[]).includes(w)))
	) {
		return { ok: false, error: "Invalid work authorizations." };
	}
	if (
		b.drivingLicense !== undefined &&
		b.drivingLicense !== null &&
		!(DRIVING_LICENSES as readonly string[]).includes(b.drivingLicense as string)
	) {
		return { ok: false, error: "Invalid driving license." };
	}
	if (b.customScreeningQuestions !== undefined && !isCustomQuestionArray(b.customScreeningQuestions)) {
		return { ok: false, error: "Invalid custom screening questions." };
	}
	if (b.screeningPreferred !== undefined && !isPreferredKeys(b.screeningPreferred)) {
		return { ok: false, error: "Invalid preferred requirements." };
	}
	if (b.skillSuggestions !== undefined && !isSkillSuggestions(b.skillSuggestions)) {
		return { ok: false, error: "Invalid skill suggestions." };
	}
	if (!isOptionalString(b.postingName)) return { ok: false, error: "Invalid posting name." };
	if (!isOptionalString(b.description)) return { ok: false, error: "Invalid description." };
	if (!isOptionalString(b.responsibilities)) return { ok: false, error: "Invalid responsibilities." };
	if (!isOptionalString(b.location)) return { ok: false, error: "Invalid location." };
	if (!isOptionalString(b.addressLine1) || !isOptionalString(b.addressLine2)) return { ok: false, error: "Invalid street address." };
	if (!isOptionalString(b.city) || !isOptionalString(b.state) || !isOptionalString(b.postcode)) {
		return { ok: false, error: "Invalid address." };
	}
	if (!isOptionalString(b.area) || (typeof b.area === "string" && b.area.trim().length > 80)) {
		return { ok: false, error: "Keep the area to 80 characters." };
	}

	const text = (v: unknown) => (isNonEmptyString(v) ? v.trim() : null);
	const f: PostingFields = {};
	if (b.status !== undefined) f.status = b.status as string;
	if (b.postingName !== undefined) f.postingName = text(b.postingName);
	if (b.title !== undefined) f.title = (b.title as string).trim();
	if (b.description !== undefined) f.description = isNonEmptyString(b.description) ? sanitizeDescriptionHtml(b.description.trim()) : "";
	if (b.responsibilities !== undefined) {
		f.responsibilities = isNonEmptyString(b.responsibilities) ? sanitizeDescriptionHtml(b.responsibilities.trim()) : "";
	}
	if (b.industry !== undefined) f.industry = text(b.industry);
	if (b.employmentType !== undefined) f.employmentType = b.employmentType as string;
	if (b.workArrangement !== undefined) f.workArrangement = b.workArrangement as string;
	if (b.location !== undefined) f.location = text(b.location) ?? "";
	for (const key of ["addressLine1", "addressLine2", "area", "city", "state", "postcode"] as const) {
		if (b[key] !== undefined) f[key] = text(b[key]);
	}
	if (b.salaryMin !== undefined) f.salaryMin = (b.salaryMin as number | null) ?? null;
	if (b.salaryMax !== undefined) f.salaryMax = (b.salaryMax as number | null) ?? null;
	if (b.openings !== undefined) f.openings = (b.openings as number | null) ?? 1;
	if (b.skills !== undefined) f.skills = b.skills as string[];
	if (b.softSkills !== undefined) f.softSkills = b.softSkills as string[];
	if (b.niceToHaveSkills !== undefined) f.niceToHaveSkills = b.niceToHaveSkills as string[];
	if (b.minYearsExperience !== undefined) f.minYearsExperience = (b.minYearsExperience as number | null) ?? null;
	if (b.minQualificationTier !== undefined) f.minQualificationTier = text(b.minQualificationTier);
	// Languages are part of the job itself, kept whether or not screening is on.
	if (b.languages !== undefined) {
		f.languages = normalizeLanguageRequirements(b.languages as { language: string; dialect?: string | null; level: string }[]);
	}
	if (b.workAuthorizations !== undefined) f.workAuthorizations = b.workAuthorizations as string[];
	if (b.drivingLicense !== undefined) f.drivingLicense = text(b.drivingLicense);
	if (b.customScreeningQuestions !== undefined) f.customScreeningQuestions = b.customScreeningQuestions as unknown[];
	if (b.screeningPreferred !== undefined) f.screeningPreferred = b.screeningPreferred as string[];
	if (b.skillSuggestions !== undefined) f.skillSuggestions = (b.skillSuggestions as PostingFields["skillSuggestions"]) ?? null;
	for (const key of ["askMinYearsExperience", "askMinQualificationTier", "askDrivingLicense", "askLanguages", "askWorkAuthorizations"] as const) {
		if (b[key] !== undefined) f[key] = creating ? b[key] !== false : b[key] === true;
		else if (creating) f[key] = true;
	}
	if (b.screeningEnabled !== undefined || creating) f.screeningEnabled = b.screeningEnabled === true;

	// With screening off, its requirements are dropped, whatever was sent.
	const screeningOn = f.screeningEnabled ?? opts.screeningEnabledBefore ?? false;
	if (!screeningOn) {
		f.minYearsExperience = null;
		f.minQualificationTier = null;
		f.workAuthorizations = [];
		f.drivingLicense = null;
		f.customScreeningQuestions = [];
		f.screeningPreferred = [];
	}

	// The posting "extras": benefits, office days, salary period and
	// visibility, start date, working hours (the contact is checked by the router).
	if (b.benefits !== undefined) {
		if (!Array.isArray(b.benefits) || !b.benefits.every((x) => typeof x === "string")) return { ok: false, error: "Invalid benefits." };
		const seen = new Set<string>();
		f.benefits = (b.benefits as string[])
			.map((x) => x.trim().slice(0, 60))
			.filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
			.slice(0, MAX_POSTING_BENEFITS);
	}
	if (b.officeDaysPerWeek !== undefined) {
		const days = b.officeDaysPerWeek;
		if (days === null || days === "") f.officeDaysPerWeek = null;
		else if (typeof days === "number" && Number.isInteger(days) && days >= 1 && days <= 4) f.officeDaysPerWeek = days;
		else return { ok: false, error: "Invalid office days." };
	}
	if (b.salaryPeriod !== undefined) {
		if (!isSalaryPeriod(b.salaryPeriod)) return { ok: false, error: "Invalid salary period." };
		f.salaryPeriod = b.salaryPeriod;
	} else if (creating) {
		f.salaryPeriod = "month";
	}
	if (b.showSalary !== undefined) {
		if (typeof b.showSalary !== "boolean") return { ok: false, error: "Invalid salary visibility." };
		f.showSalary = b.showSalary;
	}
	if (b.startAvailability !== undefined) {
		if (b.startAvailability === null || b.startAvailability === "") f.startAvailability = null;
		else if (isStartAvailability(b.startAvailability)) f.startAvailability = b.startAvailability;
		else return { ok: false, error: "Invalid start date option." };
	}
	if (b.workingHours !== undefined) {
		if (b.workingHours !== null && typeof b.workingHours !== "string") return { ok: false, error: "Invalid working hours." };
		const hours = ((b.workingHours as string | null) ?? "").trim();
		if (hours.length > MAX_WORKING_HOURS_LENGTH) {
			return { ok: false, error: `Keep working hours under ${MAX_WORKING_HOURS_LENGTH} characters.` };
		}
		f.workingHours = hours || null;
	}
	if (b.contactUserId !== undefined) {
		if (b.contactUserId !== null && b.contactUserId !== "" && typeof b.contactUserId !== "string") {
			return { ok: false, error: "Invalid contact person." };
		}
		f.contactUserId = isNonEmptyString(b.contactUserId) ? b.contactUserId : null;
	}
	if (creating) {
		f.employmentType ??= "full_time";
		f.workArrangement ??= "onsite";
		f.openings ??= 1;
		f.location ??= "";
		f.description ??= "";
		f.responsibilities ??= "";
		f.skills ??= [];
		f.softSkills ??= [];
		f.niceToHaveSkills ??= [];
		f.languages ??= [];
		f.benefits ??= [];
	}
	return { ok: true, fields: f };
}
