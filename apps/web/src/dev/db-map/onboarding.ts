import type { DbMapEntry } from "./registry";

// Development-only: the onboarding forms' fields (data-db="onboarding.…").
// Unlike the field map (a plan, written before these were built), each entry
// says where v3 actually saves the field today (`v3`) and which v3 API call
// does it (`v3Api`). Files are stored as storage keys; the browser gets
// /files/ URLs.

const EMPLOYER_SAVE = "employer.saveProfile (Finish) · employer.saveDraft (autosave)";
const JOBSEEKER_SAVE = "jobseeker.saveProfile (Finish) · jobseeker.saveDraft (autosave)";

function employer(entry: Omit<DbMapEntry, "v3Api"> & { v3Api?: string }): DbMapEntry {
	return { v3Api: EMPLOYER_SAVE, ...entry };
}
function jobseeker(entry: Omit<DbMapEntry, "v3Api"> & { v3Api?: string }): DbMapEntry {
	return { v3Api: JOBSEEKER_SAVE, ...entry };
}

export const ONBOARDING: Record<string, DbMapEntry> = {
	// ── Employer: About you (the registrant's own member row) ──────────────
	"onboarding.employer.avatar": employer({
		kind: "v2",
		v1: "— (v1 has only user.image)",
		v2: "employer_profiles.avatarUrl",
		v3: "member.avatarKey (added)",
		note: "This person's photo at this company; the account photo (user.image) is what the form starts with.",
	}),
	"onboarding.employer.contactName": employer({
		kind: "both",
		v1: "member.name",
		v2: "employer_profiles.contactName",
		v3: "member.name",
	}),
	"onboarding.employer.contactRole": employer({
		kind: "v2",
		v1: "— (member.role is the team permission: hr manager, hr staff, panelist)",
		v2: "employer_profiles.contactRole",
		v3: "member.contactRole (added)",
		note: "Founder / Owner, HR Manager, Recruiter… The owner's member.role is set to \"hr manager\" and accessLevel to \"owner\".",
	}),
	"onboarding.employer.contactPosition": employer({
		kind: "shape",
		v1: "member.positionId → positions",
		v2: "employer_profiles.contactPosition (text)",
		v3: "member.positionTitle (added, text)",
		note: "v1 stores a lookup ID. Map to positionId once v1's positions table is seeded.",
	}),
	"onboarding.employer.contactPhone": employer({
		kind: "shape",
		v1: "user.phoneNumber",
		v2: "employer_profiles.contactPhone (+ verified_phones)",
		v3: "member.phoneNumber (added) · user.phoneNumber + user.phoneVerified when verified",
		v3Api: `${EMPLOYER_SAVE} · phone.send / phone.check (verify)`,
	}),
	"onboarding.employer.contactEmail": employer({
		kind: "both",
		v1: "member.email",
		v2: "employer_profiles.contactEmail",
		v3: "member.email (the sign-in email, read-only here)",
	}),

	// ── Employer: Company name + Fill with AI ───────────────────────────────
	"onboarding.employer.companyName": employer({
		kind: "both",
		v1: "organization.legalName · displayName",
		v2: "employer_profiles.companyName",
		v3: "organization.legalName and displayName (both set to the name)",
	}),
	"onboarding.employer.aiLookup": {
		kind: "v2",
		v1: "— (v1 has no company lookup)",
		v2: "POST /api/employer/lookup-company → ai_usage_logs",
		v3: "nothing saved until Finish; each call logged in ai_usage",
		v3Api: "employer.lookupCompany",
		note: "Perplexity web search + DeepSeek/MiMo. Returns sample data until the API keys are set.",
	},

	// ── Employer: About your company ────────────────────────────────────────
	"onboarding.employer.industry": employer({
		kind: "shape",
		v1: "organization.industryId → industries",
		v2: "employer_profiles.industry (free text)",
		v3: "organization.industry (added, free text)",
	}),
	"onboarding.employer.industryCategory": employer({
		kind: "shape",
		v1: "organization.industryId → industries → industry categories",
		v2: "employer_profiles.industryCategory",
		v3: "organization.industryCategory (added, one of INDUSTRIES)",
		note: "Map to v1's industryId once the lookup table is seeded.",
	}),
	"onboarding.employer.addresses": employer({
		kind: "shape",
		v1: "organization.address · cityId · stateId · postcodeId (one address)",
		v2: "employer_addresses (one row per office)",
		v3: "organization_address (added, one row per office, one marked isJobDefault)",
		v3Api: `${EMPLOYER_SAVE} · geo.addressSearch / geo.postcode / geo.addressArea (lookups)`,
	}),
	"onboarding.employer.companySize": employer({
		kind: "both",
		v1: "organization.companySize",
		v2: "employer_profiles.companySize",
		v3: "organization.companySize",
	}),
	"onboarding.employer.benefits": employer({
		kind: "shape",
		v1: "benefits (lookup table, not linked to the company)",
		v2: "employer_profiles.benefits (text array)",
		v3: "organization.benefits (added, JSON list)",
	}),

	// ── Employer: Business verification ─────────────────────────────────────
	"onboarding.employer.ssmNumber": employer({
		kind: "both",
		v1: "organization.ssmNumber",
		v2: "employer_profiles.ssmNumber",
		v3: "organization.ssmNumber",
	}),
	"onboarding.employer.ssmDocument": employer({
		kind: "v2",
		v1: "— (v1 has organization.status: In Review / approved / rejected)",
		v2: "employer_profiles.ssmDocumentUrl · ssmVerificationStatus",
		v3: "organization.ssmDocumentKey (private file) · ssmVerificationStatus (added)",
		note: "Private: only the company's members, the uploader and admins can open it.",
	}),

	// ── Employer: Make your company stand out ───────────────────────────────
	"onboarding.employer.logo": employer({
		kind: "both",
		v1: "organization.companyLogo",
		v2: "employer_profiles.logoUrl",
		v3: "organization.companyLogo (a storage key)",
	}),
	"onboarding.employer.banner": employer({
		kind: "shape",
		v1: "organization.companyBannerId → medias",
		v2: "employer_profiles.bannerUrl",
		v3: "organization.bannerKey (added; cropped to 1500×500 in the browser)",
	}),
	"onboarding.employer.companyDescription": employer({
		kind: "both",
		v1: "organization.description",
		v2: "employer_profiles.companyDescription",
		v3: "organization.description (cleaned HTML)",
	}),
	"onboarding.employer.websiteUrl": employer({ kind: "both", v1: "organization.website", v2: "employer_profiles.websiteUrl", v3: "organization.website" }),
	"onboarding.employer.companyEmail": employer({ kind: "both", v1: "organization.email", v2: "employer_profiles.companyEmail", v3: "organization.email" }),
	"onboarding.employer.companyPhone": employer({ kind: "both", v1: "organization.phoneNumber", v2: "employer_profiles.companyPhone", v3: "organization.phoneNumber" }),
	"onboarding.employer.companyLinkedin": employer({ kind: "both", v1: "organization.linkedinUrl", v2: "employer_profiles.companyLinkedin", v3: "organization.linkedinUrl" }),
	"onboarding.employer.companyFacebook": employer({ kind: "both", v1: "organization.facebookUrl", v2: "employer_profiles.companyFacebook", v3: "organization.facebookUrl" }),
	"onboarding.employer.companyInstagram": employer({ kind: "both", v1: "organization.instagramUrl", v2: "employer_profiles.companyInstagram", v3: "organization.instagramUrl" }),
	"onboarding.employer.foundedYear": employer({ kind: "v2", v1: "—", v2: "employer_profiles.foundedYear", v3: "organization.foundedYear (added)" }),
	"onboarding.employer.companyType": employer({ kind: "v2", v1: "—", v2: "employer_profiles.companyType", v3: "organization.companyType (added)" }),
	"onboarding.employer.officePhoto": employer({ kind: "v2", v1: "—", v2: "employer_profiles.officePhotoUrl", v3: "organization.officePhotoKey (added)" }),
	"onboarding.employer.recentNews": employer({ kind: "v2", v1: "—", v2: "employer_profiles.recentNews", v3: "organization.recentNews (added, JSON list)" }),
	"onboarding.employer.galleryPhotos": employer({
		kind: "v2",
		v1: "—",
		v2: "employer_profiles.galleryPhotos",
		v3: "organization.galleryPhotos (added, JSON list of keys)",
		v3Api: `${EMPLOYER_SAVE} · employer.uploadPhoto (each photo, when picked)`,
	}),
	"onboarding.employer.facilities": employer({ kind: "v2", v1: "—", v2: "employer_profiles.facilities", v3: "organization.facilities (added, JSON list)" }),
	"onboarding.employer.dressCode": employer({ kind: "v2", v1: "—", v2: "employer_profiles.dressCode", v3: "organization.dressCode (added)" }),
	"onboarding.employer.awards": employer({ kind: "v2", v1: "—", v2: "employer_profiles.awards", v3: "organization.awards (added, JSON list)" }),
	"onboarding.employer.leaders": employer({
		kind: "v2",
		v1: "—",
		v2: "employer_profiles.leaders",
		v3: "organization.leaders (added, JSON list with photo keys)",
		v3Api: `${EMPLOYER_SAVE} · employer.uploadPhoto (each photo, when picked)`,
	}),
	"onboarding.employer.finish": {
		kind: "both",
		v1: "organization + member (company.create)",
		v2: "employer_profiles + employer_addresses + employer_badges; deletes employer_onboarding_drafts",
		v3: "organization + member (owner) + organization_address + organization_badge; deletes employer_onboarding_draft",
		v3Api: "employer.saveProfile",
	},

	// ── Jobseeker: Basic info ───────────────────────────────────────────────
	"onboarding.jobseeker.resume": jobseeker({
		kind: "both",
		v1: "jobseeker_profile.resumeUrl · resumeFileName (+ jobseeker_resume)",
		v2: "jobseeker_profiles.resumeUrl · resumeFileName · resumeFileSize",
		v3: "jobseeker_profile.resumeUrl (a storage key) · resumeFileName · resumeFileSize",
		v3Api: `${JOBSEEKER_SAVE} · jobseeker.parseResume (AI fill)`,
	}),
	"onboarding.jobseeker.avatar": jobseeker({
		kind: "shape",
		v1: "user.image",
		v2: "jobseeker_profiles.avatarUrl",
		v3: "jobseeker_profile.avatarKey (added)",
	}),
	"onboarding.jobseeker.fullName": jobseeker({
		kind: "shape",
		v1: "user.name (firstName · lastName)",
		v2: "jobseeker_profiles.fullName",
		v3: "jobseeker_profile.fullName (added)",
	}),
	"onboarding.jobseeker.age": jobseeker({
		kind: "shape",
		v1: "jobseeker_profile.birthdate (full date)",
		v2: "jobseeker_profiles.birthYear",
		v3: "jobseeker_profile.birthYear (worked out from the age)",
	}),
	"onboarding.jobseeker.gender": jobseeker({ kind: "v2", v1: "—", v2: "jobseeker_profiles.gender", v3: "jobseeker_profile.gender (added)" }),
	"onboarding.jobseeker.maritalStatus": jobseeker({ kind: "v2", v1: "—", v2: "jobseeker_profiles.maritalStatus", v3: "jobseeker_profile.maritalStatus (added)" }),
	"onboarding.jobseeker.nationality": jobseeker({ kind: "both", v1: "jobseeker_profile.nationality", v2: "jobseeker_profiles.nationality", v3: "jobseeker_profile.nationality" }),
	"onboarding.jobseeker.drivingLicense": jobseeker({ kind: "v2", v1: "—", v2: "jobseeker_profiles.drivingLicense", v3: "jobseeker_profile.drivingLicense (added)" }),
	"onboarding.jobseeker.phone": jobseeker({
		kind: "both",
		v1: "jobseeker_profile.mobileNumber",
		v2: "jobseeker_profiles.phone (+ verified_phones)",
		v3: "jobseeker_profile.mobileNumber · user.phoneNumber + user.phoneVerified when verified",
		v3Api: `${JOBSEEKER_SAVE} · phone.send / phone.check (verify)`,
	}),
	"onboarding.jobseeker.email": {
		kind: "both",
		v1: "user.email",
		v2: "users.email",
		v3: "user.email (the sign-in email, read-only here)",
	},
	"onboarding.jobseeker.location": jobseeker({
		kind: "shape",
		v1: "jobseeker_profile.countryId · stateId · cityId (lookup IDs)",
		v2: "jobseeker_profiles.city · state · country · area · latitude · longitude",
		v3: "jobseeker_profile.city · state · country · area · latitude · longitude (text, added)",
		v3Api: `${JOBSEEKER_SAVE} · geo.places (search)`,
	}),

	// ── Jobseeker: Job preferences ──────────────────────────────────────────
	"onboarding.jobseeker.targetRole": jobseeker({ kind: "both", v1: "jobseeker_profile.jobTitle", v2: "jobseeker_profiles.targetRole", v3: "jobseeker_profile.jobTitle" }),
	"onboarding.jobseeker.preferredIndustry": jobseeker({
		kind: "shape",
		v1: "jobseeker_job_preference.jobCategoriesId",
		v2: "jobseeker_profiles.preferredIndustry",
		v3: "jobseeker_profile.preferredIndustry (added, one of INDUSTRIES)",
	}),
	"onboarding.jobseeker.yearsExperience": jobseeker({ kind: "both", v1: "jobseeker_profile.yearsExperience", v2: "jobseeker_profiles.yearsExperience", v3: "jobseeker_profile.yearsExperience" }),
	"onboarding.jobseeker.skills": jobseeker({
		kind: "shape",
		v1: "jobseeker_skill (one row per skill)",
		v2: "jobseeker_profiles.professionalSkills · softSkills · otherSkills",
		v3: "jobseeker_profile.professionalSkills · softSkills · otherSkills (added, JSON lists)",
		v3Api: `${JOBSEEKER_SAVE} · jobseeker.suggestSkills (AI suggestions)`,
	}),
	"onboarding.jobseeker.employmentType": jobseeker({ kind: "both", v1: "jobseeker_profile.desiredJobType", v2: "jobseeker_profiles.employmentType", v3: "jobseeker_profile.desiredJobType" }),
	"onboarding.jobseeker.salary": jobseeker({
		kind: "both",
		v1: "jobseeker_profile.expectedSalaryFrom · expectedSalaryTo",
		v2: "jobseeker_profiles.expectedSalaryMin · expectedSalaryMax",
		v3: "jobseeker_profile.expectedSalaryFrom · expectedSalaryTo",
	}),
	"onboarding.jobseeker.workAuthorization": jobseeker({
		kind: "shape",
		v1: "jobseeker_profile.workEligibility",
		v2: "jobseeker_profiles.workAuthorization",
		v3: "jobseeker_profile.workEligibility (the redesign's values)",
		note: "Check v1's values match before migrating data.",
	}),
	"onboarding.jobseeker.workArrangement": jobseeker({ kind: "both", v1: "jobseeker_profile.workArrangement", v2: "jobseeker_profiles.workArrangement", v3: "jobseeker_profile.workArrangement" }),
	"onboarding.jobseeker.noticePeriod": jobseeker({
		kind: "shape",
		v1: "jobseeker_profile.availability",
		v2: "jobseeker_profiles.noticePeriod",
		v3: "jobseeker_profile.noticePeriod (added)",
		note: "v1's availability could be mapped onto this when migrating.",
	}),
	"onboarding.jobseeker.preferredWorkPlaces": jobseeker({
		kind: "shape",
		v1: "jobseeker_profile.desiredWorkLocation (text)",
		v2: "jobseeker_profiles.preferredWorkPlaces (list of places)",
		v3: "jobseeker_profile.preferredWorkPlaces (added, JSON list)",
	}),

	// ── Jobseeker: Experience & background ──────────────────────────────────
	"onboarding.jobseeker.bio": jobseeker({ kind: "v2", v1: "—", v2: "jobseeker_profiles.bio", v3: "jobseeker_profile.bio (added, cleaned HTML)" }),
	"onboarding.jobseeker.links": jobseeker({
		kind: "shape",
		v1: "jobseeker_link (label + url rows)",
		v2: "jobseeker_profiles.linkedinUrl · portfolioUrl · githubUrl",
		v3: "jobseeker_profile.linkedinUrl · portfolioUrl · githubUrl (added)",
	}),
	"onboarding.jobseeker.workExperiences": jobseeker({
		kind: "both",
		v1: "jobseeker_working_experience",
		v2: "jobseeker_work_experiences",
		v3: "jobseeker_working_experience (+ isCurrent, sortOrder added)",
	}),
	"onboarding.jobseeker.education": jobseeker({
		kind: "shape",
		v1: "jobseeker_education (studyPeriodEnd date)",
		v2: "jobseeker_education (graduationYear)",
		v3: "jobseeker_education (+ cgpa, graduationYear, sortOrder added)",
	}),
	"onboarding.jobseeker.certifications": jobseeker({
		kind: "v2",
		v1: "—",
		v2: "jobseeker_certifications",
		v3: "jobseeker_certification (added; file as a storage key)",
	}),
	"onboarding.jobseeker.languages": jobseeker({
		kind: "shape",
		v1: "jobseeker_profile_languages (languageId, one variety)",
		v2: "jobseeker_languages (name, list of dialects)",
		v3: "jobseeker_profile_language (name and dialects as text)",
		note: "Map to v1's languageId once the lookup table is seeded.",
	}),
	"onboarding.jobseeker.references": jobseeker({ kind: "v2", v1: "—", v2: "jobseeker_references", v3: "jobseeker_reference (added)" }),
	"onboarding.jobseeker.finish": {
		kind: "both",
		v1: "jobseeker_profile + child tables",
		v2: "jobseeker_profiles + child tables; deletes jobseeker_onboarding_drafts",
		v3: "jobseeker_profile + experience, education, certification, language and reference rows; deletes jobseeker_onboarding_draft",
		v3Api: "jobseeker.saveProfile",
	},
};
