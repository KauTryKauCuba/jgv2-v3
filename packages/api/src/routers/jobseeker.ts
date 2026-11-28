import {
	jobseekerCertification,
	jobseekerEducation,
	jobseekerProfile,
	jobseekerProfileLanguage,
	jobseekerReference,
	jobseekerWorkingExperience,
	user,
} from "@jobgiga-app/db/schema/auth";
import { jobseekerOnboardingDraft } from "@jobgiga-app/db/schema/onboarding";
import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";
import type { ProviderRaceAttempt } from "../lib/ai/provider-race";
import { raceChatProviders } from "../lib/ai/provider-race";
import { logAiUsage } from "../lib/ai/usage";
import { listMalaysianTowns } from "../lib/geo/postcodes";
import { isSupportedResumeFileName, parseResumeBytes, RESUME_MAX_BYTES } from "../lib/resume/parser";
import { sanitizeDescriptionHtml } from "../lib/sanitize-html";
import { plainTextToHtml } from "../shared/rich-text";
import { fileUrl, resolveUpload, saveBufferUpload } from "../lib/uploads";
import { ageFromDate, birthYearFromAge, MAX_AGE, MIN_AGE, parseAge } from "../shared/age";
import { DEFAULT_COUNTRY, isCountry } from "../shared/countries";
import { INDUSTRIES } from "../shared/industries";
import { normalizeSpokenLanguages } from "../shared/languages";
import { MALAYSIA_STATES } from "../shared/malaysia";
import {
	AREA_MAX,
	formatPlace,
	isMalaysiaCoordinate,
	MAX_WORK_PLACES,
	type Place,
	type WorkPlace,
} from "../shared/work-locations";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed
// here, same as the other routers.
type AnyDb = any;

// The redesign's /api/jobseeker/{profile,onboarding-draft,parse-resume,
// suggest-skills} routes, as oRPC procedures. Validation rules and error
// messages are kept exactly; saving uses db.batch (portability rule #4) and
// files go through the storage module (rule #6).

const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship", "freelance", "temporary"] as const;
const WORK_ARRANGEMENTS = ["remote", "hybrid", "onsite"] as const;
const WORK_AUTHORIZATIONS = ["citizen", "permanent_resident", "work_pass_holder", "needs_sponsorship"] as const;
const NOTICE_PERIODS = ["immediate", "one_week", "two_weeks", "one_month", "two_months", "more_than_two_months"] as const;
const LANGUAGE_LEVELS = ["basic", "conversational", "fluent", "native"] as const;
const GENDERS = ["male", "female", "other", "prefer_not_to_say"] as const;
const MARITAL_STATUSES = ["single", "married", "divorced", "widowed", "prefer_not_to_say"] as const;
const DRIVING_LICENSES = ["none", "b2", "b", "d", "da", "e"] as const;

function bad(message: string): never {
	throw new ORPCError("BAD_REQUEST", { message });
}

function isNonEmptyString(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function isOptionalString(value: unknown): value is string | undefined {
	return value === undefined || value === null || typeof value === "string";
}

function isNonNegativeInt(value: unknown): value is number {
	return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
	return typeof value === "string" && (options as readonly string[]).includes(value);
}

function isValidEmail(value: unknown): value is string {
	return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// A place from the place search: an official town in its state, an optional
// area name, optional coordinates (inside Malaysia) — or null if it doesn't fit.
function parsePlace(value: unknown): Place | null {
	const { city, state, area, lat, lng } = (value ?? {}) as Record<string, unknown>;
	const town = listMalaysianTowns().find((t) => t.city === city && t.state === state);
	if (!town) return null;
	if (area !== null && area !== undefined && (typeof area !== "string" || area.trim().length > AREA_MAX)) return null;
	const hasCoords = lat !== null && lat !== undefined;
	if (hasCoords && !isMalaysiaCoordinate(lat, lng)) return null;
	return {
		area: typeof area === "string" && area.trim() ? area.trim() : null,
		city: town.city,
		state: town.state,
		lat: hasCoords ? (lat as number) : null,
		lng: hasCoords ? (lng as number) : null,
	};
}

function parseWorkPlaces(value: unknown): WorkPlace[] | null {
	if (!Array.isArray(value) || value.length > MAX_WORK_PLACES) return null;
	const out: WorkPlace[] = [];
	for (const item of value) {
		const place = parsePlace(item);
		if (!place) return null;
		if (!out.some((p) => formatPlace(p) === formatPlace(place))) out.push(place);
	}
	return out;
}

type WorkExperienceInput = {
	company: string;
	title: string;
	startDate: string;
	endDate: string | null;
	isCurrent: boolean;
	achievements: string | null;
};

function parseWorkExperiences(value: unknown): WorkExperienceInput[] | null {
	if (!Array.isArray(value)) return null;
	const entries: WorkExperienceInput[] = [];
	for (const raw of value) {
		const entry = (raw ?? {}) as Record<string, unknown>;
		if (!isNonEmptyString(entry.company) || !isNonEmptyString(entry.title) || !isNonEmptyString(entry.startDate)) {
			return null;
		}
		entries.push({
			company: entry.company.trim(),
			title: entry.title.trim(),
			startDate: entry.startDate.trim(),
			endDate: isNonEmptyString(entry.endDate) ? entry.endDate.trim() : null,
			isCurrent: entry.isCurrent === true,
			achievements: isNonEmptyString(entry.achievements) ? sanitizeDescriptionHtml(entry.achievements.trim()) : null,
		});
	}
	return entries;
}

type EducationInput = {
	institution: string;
	fieldOfStudy: string | null;
	qualificationTier: string;
	cgpa: string | null;
	graduationYear: number | null;
};

function parseEducation(value: unknown): EducationInput[] | null {
	if (!Array.isArray(value)) return null;
	const entries: EducationInput[] = [];
	for (const raw of value) {
		const entry = (raw ?? {}) as Record<string, unknown>;
		if (!isNonEmptyString(entry.institution) || !isNonEmptyString(entry.qualificationTier)) return null;
		entries.push({
			institution: entry.institution.trim(),
			fieldOfStudy: isNonEmptyString(entry.fieldOfStudy) ? entry.fieldOfStudy.trim() : null,
			qualificationTier: entry.qualificationTier.trim(),
			cgpa: isNonEmptyString(entry.cgpa) ? entry.cgpa.trim() : null,
			graduationYear: isNonNegativeInt(entry.graduationYear) ? entry.graduationYear : null,
		});
	}
	return entries;
}

type CertificationInput = {
	name: string;
	issuer: string | null;
	year: number | null;
	// A fresh data URL picked in the browser, or a /files/… URL from an earlier save.
	fileUrl: string | null;
	fileName: string | null;
	fileSize: number | null;
};

function parseCertifications(value: unknown): CertificationInput[] | null {
	if (!Array.isArray(value)) return null;
	const entries: CertificationInput[] = [];
	for (const raw of value) {
		const entry = (raw ?? {}) as Record<string, unknown>;
		if (!isNonEmptyString(entry.name)) return null;
		// 7MB covers a 5MB certificate file inflated ~33% by base64, plus the prefix.
		if (!isOptionalString(entry.fileUrl) || (typeof entry.fileUrl === "string" && entry.fileUrl.length > 7_000_000)) {
			return null;
		}
		if (!isOptionalString(entry.fileName)) return null;
		if (entry.fileSize !== undefined && entry.fileSize !== null && !isNonNegativeInt(entry.fileSize)) return null;
		entries.push({
			name: entry.name.trim(),
			issuer: isNonEmptyString(entry.issuer) ? entry.issuer.trim() : null,
			year: isNonNegativeInt(entry.year) ? entry.year : null,
			fileUrl: isNonEmptyString(entry.fileUrl) ? entry.fileUrl : null,
			fileName: isNonEmptyString(entry.fileName) ? entry.fileName.trim() : null,
			fileSize: isNonNegativeInt(entry.fileSize) ? entry.fileSize : null,
		});
	}
	return entries;
}

type ReferenceInput = {
	fullName: string;
	jobTitle: string | null;
	company: string | null;
	phone: string | null;
	email: string | null;
};

function parseReferences(value: unknown): ReferenceInput[] | null {
	if (!Array.isArray(value)) return null;
	const entries: ReferenceInput[] = [];
	for (const raw of value) {
		const entry = (raw ?? {}) as Record<string, unknown>;
		if (!isNonEmptyString(entry.fullName)) return null;
		if (isNonEmptyString(entry.email) && !isValidEmail(entry.email)) return null;
		entries.push({
			fullName: entry.fullName.trim(),
			jobTitle: isNonEmptyString(entry.jobTitle) ? entry.jobTitle.trim() : null,
			company: isNonEmptyString(entry.company) ? entry.company.trim() : null,
			phone: isNonEmptyString(entry.phone) ? entry.phone.trim() : null,
			email: isNonEmptyString(entry.email) ? entry.email.trim().toLowerCase() : null,
		});
	}
	return entries;
}

type LanguageInput = {
	language: string;
	dialects: string[];
	spokenLevel: (typeof LANGUAGE_LEVELS)[number];
	writtenLevel: (typeof LANGUAGE_LEVELS)[number];
};

function parseLanguages(value: unknown): LanguageInput[] | null {
	if (!Array.isArray(value)) return null;
	const entries: LanguageInput[] = [];
	for (const raw of value) {
		const entry = (raw ?? {}) as Record<string, unknown>;
		if (
			!isNonEmptyString(entry.language) ||
			!isOneOf(entry.spokenLevel, LANGUAGE_LEVELS) ||
			!isOneOf(entry.writtenLevel, LANGUAGE_LEVELS) ||
			(entry.dialects !== undefined &&
				!(Array.isArray(entry.dialects) && entry.dialects.every((d) => typeof d === "string")))
		) {
			return null;
		}
		entries.push({
			language: entry.language.trim(),
			dialects: (entry.dialects as string[] | undefined) ?? [],
			spokenLevel: entry.spokenLevel,
			writtenLevel: entry.writtenLevel,
		});
	}
	return normalizeSpokenLanguages(entries);
}

// ── Skill suggestions (the redesign's suggest-skills route) ──

const MAX_SUGGESTIONS = 40;

const SKILLS_SYSTEM_PROMPT = `You suggest relevant skills for a jobseeker's profile on a Malaysian job platform, based on the role they're targeting. Respond with ONLY a json object, no prose, matching exactly this shape:
{
  "professionalSkills": string[],
  "softSkills": string[]
}
"professionalSkills" are hard/technical skills, tools, and technologies specific to succeeding in that role (e.g. software, methodologies, technical competencies) — up to ${MAX_SUGGESTIONS} items. "softSkills" are general work-style/interpersonal skills relevant to that role — up to ${MAX_SUGGESTIONS} items. Each item should be short (1-4 words) and Title Case, with no duplicates within or across the two lists. If the target role is too vague, empty, or nonsensical to suggest anything meaningful for, return empty arrays for both rather than guessing generically.`;

function sanitizeSkillList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const raw of value) {
		if (typeof raw !== "string") continue;
		const trimmed = raw.trim();
		if (!trimmed) continue;
		const key = trimmed.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(trimmed);
		if (out.length === MAX_SUGGESTIONS) break;
	}
	return out;
}

function validateSuggestions(raw: unknown) {
	const obj = (raw ?? {}) as Record<string, unknown>;
	const professionalSkills = sanitizeSkillList(obj.professionalSkills);
	const professionalSet = new Set(professionalSkills.map((s) => s.toLowerCase()));
	return {
		professionalSkills,
		// The prompt asks for no cross-list duplicates, but that's not reliable.
		softSkills: sanitizeSkillList(obj.softSkills).filter((s) => !professionalSet.has(s.toLowerCase())),
	};
}

// Both providers were actually called (racing for speed) — every attempt
// that completed gets its own usage row, not just the winner's.
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

export const jobseekerRouter = {
	saveProfile: protectedProcedure.input(z.record(z.string(), z.unknown())).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const {
			avatarUrl,
			fullName,
			resumeUrl,
			resumeFileName,
			resumeFileSize,
			age,
			gender,
			maritalStatus,
			nationality,
			phone,
			drivingLicense,
			city,
			state,
			country,
			area,
			latitude,
			longitude,
			targetRole,
			preferredIndustry,
			yearsExperience,
			professionalSkills,
			softSkills,
			otherSkills,
			employmentType,
			expectedSalaryMin,
			expectedSalaryMax,
			bio,
			linkedinUrl,
			portfolioUrl,
			githubUrl,
			noticePeriod,
			workArrangement,
			preferredWorkPlaces,
			workAuthorization,
			workExperiences: rawWorkExperiences,
			education: rawEducation,
			certifications: rawCertifications,
			languages: rawLanguages,
			references: rawReferences,
		} = input;

		if (!isOptionalString(avatarUrl) || (typeof avatarUrl === "string" && avatarUrl.length > 6_000_000)) {
			bad("Invalid profile photo.");
		}
		// 14MB covers a 10MB resume inflated ~33% by base64, plus the prefix.
		if (!isOptionalString(resumeUrl) || (typeof resumeUrl === "string" && resumeUrl.length > 14_000_000)) {
			bad("Invalid resume file.");
		}
		if (!isOptionalString(resumeFileName)) bad("Invalid resume file.");
		if (resumeFileSize !== undefined && resumeFileSize !== null && !isNonNegativeInt(resumeFileSize)) {
			bad("Invalid resume file.");
		}
		if (!isNonEmptyString(fullName)) bad("Enter your full name.");
		const parsedAge = parseAge(age);
		if (parsedAge === null) bad(`Enter your age (${MIN_AGE}–${MAX_AGE}).`);
		if (gender !== undefined && gender !== null && !isOneOf(gender, GENDERS)) bad("Invalid gender.");
		if (maritalStatus !== undefined && maritalStatus !== null && !isOneOf(maritalStatus, MARITAL_STATUSES)) {
			bad("Invalid marital status.");
		}
		if (!isOptionalString(nationality) || !isOptionalString(phone)) bad("Invalid contact details.");
		if (drivingLicense !== undefined && drivingLicense !== null && !isOneOf(drivingLicense, DRIVING_LICENSES)) {
			bad("Invalid driving license.");
		}
		const countryName = country === undefined || country === null || country === "" ? DEFAULT_COUNTRY : country;
		if (!isCountry(countryName)) bad("Choose your country.");
		const inMalaysia = countryName === DEFAULT_COUNTRY;
		if (!isNonEmptyString(city)) bad("Enter your city.");
		if (inMalaysia && (!isNonEmptyString(state) || !(MALAYSIA_STATES as readonly string[]).includes(state))) {
			bad("Choose your state.");
		}
		const savedState = inMalaysia ? (state as string) : "";
		let savedArea: string | null = null;
		let savedLatitude: number | null = null;
		let savedLongitude: number | null = null;
		if (inMalaysia) {
			if (area !== null && area !== undefined && (typeof area !== "string" || area.trim().length > AREA_MAX)) {
				bad("Invalid area.");
			}
			const hasCoords = latitude !== null && latitude !== undefined;
			if (hasCoords && !isMalaysiaCoordinate(latitude, longitude)) bad("Invalid location.");
			savedArea = typeof area === "string" && area.trim() ? area.trim() : null;
			savedLatitude = hasCoords ? (latitude as number) : null;
			savedLongitude = hasCoords ? (longitude as number) : null;
		}
		if (!isNonEmptyString(targetRole)) bad("Enter the role you're targeting.");
		if (!isOneOf(preferredIndustry, INDUSTRIES)) bad("Choose your preferred industry.");
		if (!isNonNegativeInt(yearsExperience)) bad("Enter your years of experience.");
		if (!Array.isArray(professionalSkills) || professionalSkills.length === 0 || !professionalSkills.every(isNonEmptyString)) {
			bad("Add at least one professional skill.");
		}
		if (!Array.isArray(softSkills) || !softSkills.every(isNonEmptyString)) bad("Invalid soft skills.");
		if (!Array.isArray(otherSkills) || !otherSkills.every(isNonEmptyString)) bad("Invalid other skills.");
		if (!isOneOf(employmentType, EMPLOYMENT_TYPES)) bad("Choose an employment type.");
		if (!isNonNegativeInt(expectedSalaryMin) || !isNonNegativeInt(expectedSalaryMax)) {
			bad("Enter your expected salary range.");
		}
		if (expectedSalaryMin > expectedSalaryMax) bad("Minimum salary can't be higher than the maximum.");
		if (
			!isOptionalString(bio) ||
			!isOptionalString(linkedinUrl) ||
			!isOptionalString(portfolioUrl) ||
			!isOptionalString(githubUrl)
		) {
			bad("Invalid profile details.");
		}
		if (!isOneOf(noticePeriod, NOTICE_PERIODS)) bad("Choose your notice period.");
		if (!isOneOf(workArrangement, WORK_ARRANGEMENTS)) bad("Choose a work arrangement.");
		if (!isOneOf(workAuthorization, WORK_AUTHORIZATIONS)) bad("Choose your work authorization.");
		const workPlaces = preferredWorkPlaces === undefined ? null : parseWorkPlaces(preferredWorkPlaces);
		if (preferredWorkPlaces !== undefined && workPlaces === null) {
			bad("Pick each preferred work location from the list.");
		}
		if (workPlaces !== null && workPlaces.length === 0) bad("Add at least one preferred work location.");

		const workExperiences = parseWorkExperiences(rawWorkExperiences ?? []);
		if (!workExperiences) bad("Check your work experience entries.");
		const education = parseEducation(rawEducation ?? []);
		if (!education) bad("Check your education entries.");
		const certifications = parseCertifications(rawCertifications ?? []);
		if (!certifications) bad("Check your certification entries.");
		const languages = parseLanguages(rawLanguages ?? []);
		if (!languages) bad("Check your language entries.");
		const references = parseReferences(rawReferences ?? []);
		if (!references) bad("Check your reference entries.");

		// Fresh data URLs are saved through the storage module; URLs handed
		// out earlier turn back into their keys.
		const avatarKey = await resolveUpload(context.storage, avatarUrl, "avatars");
		const newResumeKey = await resolveUpload(context.storage, resumeUrl, "resumes");
		const resolvedCertifications = await Promise.all(
			certifications.map(async (c) => ({ ...c, fileKey: await resolveUpload(context.storage, c.fileUrl, "certificates") })),
		);

		const [existing] = await db
			.select({
				id: jobseekerProfile.id,
				resumeUrl: jobseekerProfile.resumeUrl,
				resumeFileName: jobseekerProfile.resumeFileName,
				resumeFileSize: jobseekerProfile.resumeFileSize,
			})
			.from(jobseekerProfile)
			.where(eq(jobseekerProfile.userId, userId))
			.limit(1);
		const profileId: string = existing?.id ?? crypto.randomUUID();

		// A save that didn't pick a new resume keeps the stored one.
		const hasNewResume = isNonEmptyString(newResumeKey);
		const resumeValues = hasNewResume
			? {
					resumeUrl: newResumeKey,
					resumeFileName: isNonEmptyString(resumeFileName) ? resumeFileName.trim() : null,
					resumeFileSize: isNonNegativeInt(resumeFileSize) ? resumeFileSize : null,
				}
			: {
					resumeUrl: existing?.resumeUrl ?? null,
					resumeFileName: existing?.resumeFileName ?? null,
					resumeFileSize: existing?.resumeFileSize ?? null,
				};

		const cityName = city.trim();
		const values = {
			avatarKey: isNonEmptyString(avatarKey) ? avatarKey.trim() : null,
			fullName: fullName.trim(),
			birthYear: birthYearFromAge(parsedAge),
			gender: isNonEmptyString(gender) ? gender : null,
			maritalStatus: isNonEmptyString(maritalStatus) ? maritalStatus : null,
			nationality: isNonEmptyString(nationality) ? nationality.trim() : null,
			mobileNumber: isNonEmptyString(phone) ? phone.trim() : null,
			drivingLicense: isNonEmptyString(drivingLicense) ? drivingLicense : null,
			...resumeValues,
			location: inMalaysia
				? formatPlace({ area: savedArea, city: cityName, state: savedState as Place["state"] })
				: cityName.toLowerCase() === countryName.toLowerCase()
					? cityName
					: `${cityName}, ${countryName}`,
			city: cityName,
			state: savedState,
			country: countryName,
			area: savedArea,
			latitude: savedLatitude,
			longitude: savedLongitude,
			jobTitle: targetRole.trim(),
			preferredIndustry,
			yearsExperience,
			professionalSkills: professionalSkills.map((s) => s.trim()),
			softSkills: softSkills.map((s) => s.trim()),
			otherSkills: otherSkills.map((s) => s.trim()),
			desiredJobType: employmentType,
			expectedSalaryFrom: expectedSalaryMin,
			expectedSalaryTo: expectedSalaryMax,
			bio: isNonEmptyString(bio) ? sanitizeDescriptionHtml(bio.trim()) : null,
			linkedinUrl: isNonEmptyString(linkedinUrl) ? linkedinUrl.trim() : null,
			portfolioUrl: isNonEmptyString(portfolioUrl) ? portfolioUrl.trim() : null,
			githubUrl: isNonEmptyString(githubUrl) ? githubUrl.trim() : null,
			noticePeriod,
			workArrangement,
			workEligibility: workAuthorization,
			...(workPlaces ? { preferredWorkPlaces: workPlaces } : {}),
		};

		// Related entries are replaced wholesale rather than diffed, as in the
		// redesign. All of it in one all-or-nothing batch.
		const queries = [
			existing
				? db.update(jobseekerProfile).set(values).where(eq(jobseekerProfile.id, profileId))
				: db.insert(jobseekerProfile).values({ id: profileId, userId, ...values }),
			db.delete(jobseekerWorkingExperience).where(eq(jobseekerWorkingExperience.jobseekerProfileId, profileId)),
			db.delete(jobseekerEducation).where(eq(jobseekerEducation.jobseekerProfileId, profileId)),
			db.delete(jobseekerCertification).where(eq(jobseekerCertification.jobseekerProfileId, profileId)),
			db.delete(jobseekerProfileLanguage).where(eq(jobseekerProfileLanguage.jobseekerProfileId, profileId)),
			db.delete(jobseekerReference).where(eq(jobseekerReference.jobseekerProfileId, profileId)),
			...workExperiences.map((entry, index) =>
				db.insert(jobseekerWorkingExperience).values({
					id: crypto.randomUUID(),
					jobseekerProfileId: profileId,
					company: entry.company,
					jobTitle: entry.title,
					periodStart: entry.startDate,
					periodEnd: entry.endDate,
					isCurrent: entry.isCurrent,
					jobDescription: entry.achievements,
					sortOrder: index,
				}),
			),
			...education.map((entry, index) =>
				db.insert(jobseekerEducation).values({
					id: crypto.randomUUID(),
					jobseekerProfileId: profileId,
					schoolName: entry.institution,
					fieldOfStudy: entry.fieldOfStudy,
					educationLevel: entry.qualificationTier,
					cgpa: entry.cgpa,
					graduationYear: entry.graduationYear,
					sortOrder: index,
				}),
			),
			...resolvedCertifications.map((entry, index) =>
				db.insert(jobseekerCertification).values({
					id: crypto.randomUUID(),
					jobseekerProfileId: profileId,
					name: entry.name,
					issuer: entry.issuer,
					year: entry.year,
					fileKey: entry.fileKey,
					fileName: entry.fileName,
					fileSize: entry.fileSize,
					sortOrder: index,
				}),
			),
			...languages.map((entry, index) =>
				db.insert(jobseekerProfileLanguage).values({
					id: crypto.randomUUID(),
					jobseekerProfileId: profileId,
					language: entry.language,
					dialects: entry.dialects,
					spokenLevel: entry.spokenLevel,
					writtenLevel: entry.writtenLevel,
					sortOrder: index,
				}),
			),
			...references.map((entry, index) =>
				db.insert(jobseekerReference).values({
					id: crypto.randomUUID(),
					jobseekerProfileId: profileId,
					fullName: entry.fullName,
					jobTitle: entry.jobTitle,
					company: entry.company,
					phone: entry.phone,
					email: entry.email,
					sortOrder: index,
				}),
			),
			// The account's display name follows the profile's.
			db.update(user).set({ name: fullName.trim() }).where(eq(user.id, userId)),
			db.delete(jobseekerOnboardingDraft).where(eq(jobseekerOnboardingDraft.userId, userId)),
		];
		await db.batch(queries);

		return { ok: true as const };
	}),

	getDraft: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const [row] = await db
			.select({ data: jobseekerOnboardingDraft.data })
			.from(jobseekerOnboardingDraft)
			.where(eq(jobseekerOnboardingDraft.userId, context.session.user.id))
			.limit(1);
		if (!row) return { draft: null };
		const draft = JSON.parse(row.data) as Record<string, unknown>;
		// The photo is stored as a key — hand the browser a URL for it.
		if (typeof draft.avatarUrl === "string") draft.avatarUrl = fileUrl(context.origin, draft.avatarUrl);
		return { draft };
	}),

	// The whole in-progress form, autosaved on every change. A freshly picked
	// photo (a data URL) is saved to storage here, since autosave fires far
	// more often than the final submit.
	saveDraft: protectedProcedure.input(z.record(z.string(), z.unknown())).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const data = { ...input };
		if (data.avatarUrl !== undefined && data.avatarUrl !== null) {
			data.avatarUrl = await resolveUpload(context.storage, data.avatarUrl, "avatars");
		}
		const json = JSON.stringify(data);
		await db
			.insert(jobseekerOnboardingDraft)
			.values({ userId: context.session.user.id, data: json })
			.onConflictDoUpdate({ target: jobseekerOnboardingDraft.userId, set: { data: json } });
		return { ok: true as const };
	}),

	deleteDraft: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		await db.delete(jobseekerOnboardingDraft).where(eq(jobseekerOnboardingDraft.userId, context.session.user.id));
		return { ok: true as const };
	}),

	parseResume: protectedProcedure.input(z.object({ resume: z.instanceof(File) })).handler(async ({ input, context }) => {
		const file = input.resume;
		if (file.size === 0) bad("Attach a resume file.");
		if (file.size > RESUME_MAX_BYTES) bad("File is too large — max 10 MB.");
		if (!isSupportedResumeFileName(file.name)) bad("Only PDF or DOCX resumes are supported.");

		const result = await parseResumeBytes(new Uint8Array(await file.arrayBuffer()), file.name, {
			mimoKey: context.ai.mimoKey,
		});
		if (!result.ok) throw new ORPCError(result.status >= 500 ? "BAD_GATEWAY" : "BAD_REQUEST", { message: result.error });

		logAttempts(context.db, context.session.user.id, "resume_parse", result.attempts, Date.now() - result.durationMs);

		return { profile: result.profile, usage: result.usage, durationMs: result.durationMs, photoUrl: result.photoUrl };
	}),

	// The dashboard sidebar's resume card: the saved resume's name and size.
	myResume: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const [row] = await db
			.select({ fileName: jobseekerProfile.resumeFileName, fileSize: jobseekerProfile.resumeFileSize })
			.from(jobseekerProfile)
			.where(eq(jobseekerProfile.userId, context.session.user.id))
			.limit(1);
		return row?.fileName ? { fileName: row.fileName as string, fileSize: (row.fileSize as number | null) ?? null } : null;
	}),

	// The redesign's POST /api/jobseeker/resume (the sidebar resume card):
	// saves the resume and fills in only what the profile doesn't have yet —
	// never overwrites something the jobseeker already filled in. Lists
	// (skills, experience, education, …) get the resume's entries added.
	uploadResume: protectedProcedure.input(z.object({ resume: z.instanceof(File) })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const [profile] = await db.select().from(jobseekerProfile).where(eq(jobseekerProfile.userId, userId)).limit(1);
		if (!profile) throw new ORPCError("NOT_FOUND", { message: "Finish onboarding first." });

		const file = input.resume;
		if (file.size === 0) bad("Attach a resume file.");
		if (file.size > RESUME_MAX_BYTES) bad("File is too large — max 10 MB.");
		if (!isSupportedResumeFileName(file.name)) bad("Only PDF or DOCX resumes are supported.");
		if (!context.storage) throw new ORPCError("INTERNAL_SERVER_ERROR", { message: "File storage isn't set up." });

		const bytes = new Uint8Array(await file.arrayBuffer());
		const result = await parseResumeBytes(bytes, file.name, {
			mimoKey: context.ai.mimoKey,
		});
		if (!result.ok) throw new ORPCError(result.status >= 500 ? "BAD_GATEWAY" : "BAD_REQUEST", { message: result.error });
		logAttempts(context.db, userId, "resume_parse", result.attempts, Date.now() - result.durationMs);

		const parsed = result.profile;
		let filledCount = 0;
		const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
		function fill<T>(current: T, value: T | null): T | null {
			if (isEmpty(current) && value !== null && value !== undefined) {
				filledCount++;
				return value;
			}
			return current;
		}
		const parsedAge = ageFromDate(parsed.dateOfBirth);
		const values = {
			fullName: fill(profile.fullName, parsed.fullName),
			birthYear: fill(profile.birthYear, parsedAge !== null && parseAge(parsedAge) !== null ? birthYearFromAge(parsedAge) : null),
			gender: fill(profile.gender, parsed.gender),
			maritalStatus: fill(profile.maritalStatus, parsed.maritalStatus),
			nationality: fill(profile.nationality, parsed.nationality),
			mobileNumber: fill(profile.mobileNumber, parsed.phone),
			drivingLicense: fill(profile.drivingLicense, parsed.drivingLicense),
			location: fill(profile.location, parsed.location),
			jobTitle: fill(profile.jobTitle, parsed.targetRole),
			yearsExperience: fill(profile.yearsExperience, parsed.yearsExperience),
			desiredJobType: fill(profile.desiredJobType, parsed.employmentType),
			expectedSalaryFrom: fill(profile.expectedSalaryFrom, parsed.expectedSalaryMin),
			expectedSalaryTo: fill(profile.expectedSalaryTo, parsed.expectedSalaryMax),
			bio: fill(profile.bio, parsed.bio ? sanitizeDescriptionHtml(parsed.bio) : null),
			linkedinUrl: fill(profile.linkedinUrl, parsed.linkedinUrl),
			portfolioUrl: fill(profile.portfolioUrl, parsed.portfolioUrl),
			githubUrl: fill(profile.githubUrl, parsed.githubUrl),
			professionalSkills: [...new Set([...(profile.professionalSkills ?? []), ...parsed.professionalSkills])],
			softSkills: [...new Set([...(profile.softSkills ?? []), ...parsed.softSkills])],
		};
		for (const list of [
			parsed.professionalSkills,
			parsed.softSkills,
			parsed.workExperiences,
			parsed.education,
			parsed.certifications,
			parsed.languages,
			parsed.references,
		]) {
			if (list.length > 0) filledCount++;
		}

		const resumeKey = await saveBufferUpload(context.storage, bytes, file.type || "application/octet-stream", "resumes");
		const profileId = profile.id as string;
		// New entries go after the ones already there.
		const countRows = async (table: AnyDb) =>
			((await db.select({ id: table.id }).from(table).where(eq(table.jobseekerProfileId, profileId))) as unknown[]).length;
		const [workCount, eduCount, certCount, refCount] = await Promise.all([
			countRows(jobseekerWorkingExperience),
			countRows(jobseekerEducation),
			countRows(jobseekerCertification),
			countRows(jobseekerReference),
		]);
		// A resume's dialects join a language already listed rather than starting a second one.
		const existingLanguages = (await db
			.select()
			.from(jobseekerProfileLanguage)
			.where(eq(jobseekerProfileLanguage.jobseekerProfileId, profileId))
			.orderBy(jobseekerProfileLanguage.sortOrder)) as AnyDb[];
		const languages = normalizeSpokenLanguages([
			...existingLanguages.map((l) => ({
				language: l.language as string,
				dialects: (l.dialects as string[] | null) ?? [],
				spokenLevel: l.spokenLevel as string,
				writtenLevel: l.writtenLevel as string,
			})),
			...parsed.languages,
		]);

		await db.batch([
			db
				.update(jobseekerProfile)
				.set({ ...values, resumeUrl: resumeKey, resumeFileName: file.name, resumeFileSize: file.size })
				.where(eq(jobseekerProfile.id, profileId)),
			...parsed.workExperiences.map((e, i) =>
				db.insert(jobseekerWorkingExperience).values({
					id: crypto.randomUUID(),
					jobseekerProfileId: profileId,
					company: e.company,
					jobTitle: e.title,
					periodStart: e.startDate,
					periodEnd: e.endDate,
					isCurrent: e.isCurrent,
					// The AI's achievements are plain text; stored as safe HTML like the form's.
					jobDescription: e.achievements ? sanitizeDescriptionHtml(plainTextToHtml(e.achievements)) : null,
					sortOrder: workCount + i,
				}),
			),
			...parsed.education.map((e, i) =>
				db.insert(jobseekerEducation).values({
					id: crypto.randomUUID(),
					jobseekerProfileId: profileId,
					schoolName: e.institution,
					fieldOfStudy: e.fieldOfStudy,
					educationLevel: e.qualificationTier,
					cgpa: e.cgpa,
					graduationYear: e.graduationYear,
					sortOrder: eduCount + i,
				}),
			),
			...parsed.certifications.map((e, i) =>
				db.insert(jobseekerCertification).values({
					id: crypto.randomUUID(),
					jobseekerProfileId: profileId,
					name: e.name,
					issuer: e.issuer,
					year: e.year,
					sortOrder: certCount + i,
				}),
			),
			...parsed.references.map((e, i) =>
				db.insert(jobseekerReference).values({
					id: crypto.randomUUID(),
					jobseekerProfileId: profileId,
					fullName: e.fullName,
					jobTitle: e.jobTitle,
					company: e.company,
					phone: e.phone,
					email: e.email,
					sortOrder: refCount + i,
				}),
			),
			...(parsed.languages.length > 0
				? [
						db.delete(jobseekerProfileLanguage).where(eq(jobseekerProfileLanguage.jobseekerProfileId, profileId)),
						...languages.map((l, i) =>
							db.insert(jobseekerProfileLanguage).values({
								id: crypto.randomUUID(),
								jobseekerProfileId: profileId,
								language: l.language,
								dialects: l.dialects,
								spokenLevel: l.spokenLevel,
								writtenLevel: l.writtenLevel,
								sortOrder: i,
							}),
						),
					]
				: []),
		]);

		return { fileName: file.name, fileSize: file.size, filledCount };
	}),

	// The redesign's DELETE /api/jobseeker/resume: forgets the saved resume
	// (what it filled into the profile stays).
	removeResume: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		await db
			.update(jobseekerProfile)
			.set({ resumeUrl: null, resumeFileName: null, resumeFileSize: null })
			.where(eq(jobseekerProfile.userId, context.session.user.id));
		return { ok: true as const };
	}),

	suggestSkills: protectedProcedure.input(z.object({ targetRole: z.string() })).handler(async ({ input, context }) => {
		const targetRole = input.targetRole.trim();
		if (!targetRole) bad("Enter your target role first.");

		const startedAt = Date.now();
		const attempts: Promise<ProviderRaceAttempt>[] = [];
		const result = await raceChatProviders({
			systemPrompt: SKILLS_SYSTEM_PROMPT,
			userContent: `Target role: ${targetRole}`,
			mimoKey: context.ai.mimoKey,
			temperature: 0.3,
			maxTokens: 900,
			taskLabel: "skill suggestion",
			notConfiguredError: "Skill suggestions are not configured.",
			collectedAttempts: attempts,
			devStub: () =>
				JSON.stringify({
					professionalSkills: ["Communication", "Microsoft Excel", "Project Management"],
					softSkills: ["Teamwork", "Problem Solving"],
				}),
		});
		const durationMs = Date.now() - startedAt;
		if (!result.ok) throw new ORPCError("BAD_GATEWAY", { message: result.error });

		let parsed: unknown;
		try {
			parsed = JSON.parse(result.content);
		} catch {
			throw new ORPCError("BAD_GATEWAY", { message: "Couldn't generate suggestions. Try again." });
		}

		logAttempts(context.db, context.session.user.id, "skill_suggestion", attempts, startedAt);

		return { suggestions: validateSuggestions(parsed), usage: result.usage, durationMs };
	}),
};
