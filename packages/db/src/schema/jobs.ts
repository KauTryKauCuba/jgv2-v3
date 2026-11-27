import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";
import { user, organization } from "./auth";
import { departments } from "./departments";
import { countries } from "./countries";
import { states } from "./states";
import { cities } from "./cities";
import { postcodes } from "./postcodes";
import { skills } from "./skills";
import { benefits } from "./benefits";
import { salaryTypes } from "./salaryTypes";
import { currencyTypes } from "./currencyTypes";
import { educationTypes } from "./educationTypes";
import { experienceTypes } from "./experienceTypes";
import { languages } from "./languages";
import { industries } from "./industries";

// ============================================
// Stages Constants
// ============================================

export const STAGE_NAMES = {
	SUBMITTED: "submitted",
	SCREENED: "screened",
	SHORTLISTED: "shortlisted",
	IN_PROGRESS: "in_progress",
	INTERVIEWED: "interviewed",
	REVIEWED: "reviewed",
	PASSED: "passed",
	REJECT: "reject",
} as const;

export type StageName = (typeof STAGE_NAMES)[keyof typeof STAGE_NAMES];

// ============================================
// Stages Table
// ============================================

export const stages = sqliteTable("stages", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull().unique(),
	slug: text("slug").notNull().unique(),
	description: text("description"),
	order: integer("order").notNull().default(0),
});

// ============================================
// Application Stages Pivot Table
// ============================================

export const applicationStages = sqliteTable(
	"application_stages",
	{
		id: text("id").primaryKey(),
		applicationId: text("application_id")
			.notNull()
			.references(() => application.id, { onDelete: "cascade" }),
		stageId: integer("stage_id")
			.references(() => stages.id, { onDelete: "cascade" }), // Made optional
		stageName: text("stage_name").notNull(), // Track stage name even without stageId
		status: text("status").notNull().default("active"), // active, completed, skipped
		notes: text("notes"),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
	},
	(table) => [
		index("applicationStages_applicationId_idx").on(table.applicationId),
		index("applicationStages_stageId_idx").on(table.stageId),
	],
);

// ============================================
// Status Constants (SQLite doesn't support enums)
// ============================================

export const JOB_STATUS = {
	DRAFT: "draft",
	PENDING: "pending",
	PUBLISHED: "published",
	CLOSED: "closed",
	EXPIRED: "expired",
	ARCHIVED: "archived",
	REJECTED: "rejected",
	// v3: the redesign's two extra posting states.
	FILLED: "filled",
	FLAGGED: "flagged",
} as const;

export const LOCATION_TYPE = {
	ONSITE: "onsite",
	REMOTE: "remote",
	HYBRID: "hybrid",
} as const;

export const EMPLOYMENT_TYPE = {
	FULL_TIME: "full_time",
	PART_TIME: "part_time",
	CONTRACT: "contract",
	INTERNSHIP: "internship",
	TEMPORARY: "temporary",
	FREELANCE: "freelance",
} as const;

export const APPLICATION_STATUS = {
	RECEIVED: "received",
	SCREENED: "screened",
	SHORTLISTED: "shortlisted",
	SCHEDULED: "scheduled",
	INTERVIEWED: "interviewed",
	REVIEWED: "reviewed",
	PASSED: "passed",
	REJECTED: "rejected",
	PENDING: "pending",
	DECLINE: "decline",
	ABSENT: "absent",
	KIV: "kiv",
	REJECT: "reject",
	// v3: the redesign's pipeline has three steps v1 doesn't — added in v1's
	// style (plain values on the same column). See
	// packages/api/src/shared/application-status.ts for how every value
	// shows in the redesign's UI.
	EVALUATION: "evaluation",
	OFFER: "offer",
	WITHDRAWN: "withdrawn",
} as const;

export const WORK_ARRANGEMENT = {
	ONSITE: "onsite",
	REMOTE: "remote",
	HYBRID: "hybrid",
} as const;

export const WORK_ELIGIBILITY = {
	LOCAL: "local",
	INTERNATIONAL: "international",
} as const;

// Type helpers
export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];
export type LocationType = (typeof LOCATION_TYPE)[keyof typeof LOCATION_TYPE];
export type EmploymentType = (typeof EMPLOYMENT_TYPE)[keyof typeof EMPLOYMENT_TYPE];
export type ApplicationStatus = (typeof APPLICATION_STATUS)[keyof typeof APPLICATION_STATUS];

// ============================================
// Job Table
// ============================================

export const job = sqliteTable(
	"job",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		departmentId: integer("department_id")
			.references(() => departments.id, { onDelete: "set null" }),
		title: text("title").notNull(),
		description: text("description").notNull(), // HTML from rich text editor
		requirements: text("requirements"), // HTML
		qualifications: text("qualifications"),
		experience: text("experience"),
		responsibilities: text("responsibilities"), // HTML
		industryId: integer("industry_id")
			.references(() => industries.id, { onDelete: "set null" }),
		address: text("address"),
		countryId: integer("country_id")
			.references(() => countries.id, { onDelete: "set null" }),
		stateId: integer("state_id")
			.references(() => states.id, { onDelete: "set null" }),
		cityId: integer("city_id")
			.references(() => cities.id, { onDelete: "set null" }),
		postcodeId: integer("postcode_id")
			.references(() => postcodes.id, { onDelete: "set null" }),
		locationType: text("location_type").notNull().default(LOCATION_TYPE.ONSITE),
		employmentType: text("employment_type").notNull().default(EMPLOYMENT_TYPE.FULL_TIME), // full_time, part_time, contract
		work_arrangement: text("work_arrangement").notNull().default(WORK_ARRANGEMENT.ONSITE), // onsite, remote, hybrid
		work_eligibility: text("work_eligibility").notNull().default(WORK_ELIGIBILITY.LOCAL), // local, international
		salaryMin: integer("salary_min"),
		salaryMax: integer("salary_max"),
		salaryTypeId: integer("salary_type_id")
			.references(() => salaryTypes.id, { onDelete: "set null" }),
		currencyTypeId: integer("currency_type_id")
			.references(() => currencyTypes.id, { onDelete: "set null" }),
		salaryCurrency: text("salary_currency").default("USD"), // Keep for backward compatibility
		showSalary: integer("show_salary", { mode: "boolean" }).default(true).notNull(),
		educationTypeId: integer("education_type_id")
			.references(() => educationTypes.id, { onDelete: "set null" }),
		experienceTypeId: integer("experience_type_id")
			.references(() => experienceTypes.id, { onDelete: "set null" }),
		languageId: integer("language_id")
			.references(() => languages.id, { onDelete: "set null" }),
		jobOpenToCountryId: integer("job_open_to_country_id")
			.references(() => countries.id, { onDelete: "set null" }),
		status: text("status").notNull().default(JOB_STATUS.PENDING),
		isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
		closingDate: text("closing_date"),
		validity: text("validity"),
		// List impressions (Find Job) + detail views (panel / job page). Funnel “View” stage.
		views: integer("views").default(0).notNull(),
		// Opens of job details (detail page or desktop panel). Funnel “Click” stage.
		clickedAmount: integer("clicked_amount").default(0),
		isUrgent: integer("is_urgent", { mode: "boolean" }).default(false).notNull(),
		isBonanza: integer("is_bonanza", { mode: "boolean" }).default(false).notNull(),
		boostedAt: text("boosted_at"), // ISO timestamp when boost started
		boostedUntil: text("boosted_until"), // ISO timestamp when boost expires (boostedAt + 3 days)
		createdById: text("created_by_id")
			.references(() => user.id, { onDelete: "set null" }),
		publishedAt: text("published_at"),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
		appStartedCount: integer('app_started_count').default(0),

		// ── v3: the redesign's Post a job fields that v1's job has no column
		// for, added in v1's style. Where v1 does have a column, that's used
		// instead (title, description, responsibilities, address, city/state
		// ids, employment type, work arrangement, salary, show salary, skills
		// via job_skills, benefits via job_benefits, education and experience
		// type ids, status). See packages/api/src/lib/jobs/posting.ts.
		// URL slug, made once from company name + title.
		slug: text("slug").unique(),
		// The employer's own label for telling postings apart; never shown to jobseekers.
		postingName: text("posting_name"),
		// One of the redesign's INDUSTRIES (industryId is set too when v1 has the same name).
		industry: text("industry"),
		// The short "City, State" shown on cards; the address parts below.
		location: text("location"),
		addressLine2: text("address_line2"),
		area: text("area"),
		city: text("city"),
		state: text("state"),
		postcode: text("postcode"),
		// Hybrid only: office days a week (1–4).
		officeDaysPerWeek: integer("office_days_per_week"),
		// "month" | "hour" | "day" | "project" | "year" (salaryTypeId too, where v1 has the type).
		salaryPeriod: text("salary_period").notNull().default("month"),
		openings: integer("openings").notNull().default(1),
		softSkills: text("soft_skills", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
		niceToHaveSkills: text("nice_to_have_skills", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
		// Exact figures behind experienceTypeId / educationTypeId.
		minYearsExperience: integer("min_years_experience"),
		minQualificationTier: text("min_qualification_tier"),
		// [{ language, dialect, level }] — the redesign's language list is wider than v1's languages table.
		languages: text("languages", { mode: "json" })
			.$type<{ language: string; dialect?: string | null; level: string }[]>()
			.notNull()
			.default(sql`'[]'`),
		// citizen | permanent_resident | work_pass_holder | needs_sponsorship (work_eligibility is derived from it).
		workAuthorizations: text("work_authorizations", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
		drivingLicense: text("driving_license"),
		// Screening: the master switch, which built-in questions to ask, custom questions, preferred ones.
		screeningEnabled: integer("screening_enabled", { mode: "boolean" }).notNull().default(false),
		askMinYearsExperience: integer("ask_min_years_experience", { mode: "boolean" }).notNull().default(true),
		askMinQualificationTier: integer("ask_min_qualification_tier", { mode: "boolean" }).notNull().default(true),
		askDrivingLicense: integer("ask_driving_license", { mode: "boolean" }).notNull().default(true),
		askLanguages: integer("ask_languages", { mode: "boolean" }).notNull().default(true),
		askWorkAuthorizations: integer("ask_work_authorizations", { mode: "boolean" }).notNull().default(true),
		customScreeningQuestions: text("custom_screening_questions", { mode: "json" }).$type<unknown[]>().notNull().default(sql`'[]'`),
		screeningPreferred: text("screening_preferred", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
		// AI skill suggestions not reviewed yet (the dashed chips), kept with a draft.
		skillSuggestions: text("skill_suggestions", { mode: "json" }).$type<{
			professionalSkills: string[];
			softSkills: string[];
			niceToHaveSkills: string[];
		} | null>(),
		startAvailability: text("start_availability"),
		workingHours: text("working_hours"),
		// The teammate shown as the posting's contact (name, position and photo only).
		contactUserId: text("contact_user_id").references(() => user.id, { onDelete: "set null" }),
		rejectionReason: text("rejection_reason"),
		flagReason: text("flag_reason"),
		flaggedAt: text("flagged_at"),
	},
	(table) => [
		index("job_organizationId_idx").on(table.organizationId),
		index("job_status_idx").on(table.status),
		index("job_createdById_idx").on(table.createdById),
	],
);

// ============================================
// Application Table
// ============================================

export const application = sqliteTable(
	"application",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		jobId: text("job_id")
			.notNull()
			.references(() => job.id, { onDelete: "cascade" }),
		status: text("status").notNull().default(APPLICATION_STATUS.RECEIVED),
		matchScore: integer("match_score"), // Numeric match score
		matchBreakdown: text("match_breakdown"), // JSON string for detailed breakdowns
		resumeFileName: text("resume_file_name"),
		resumeFileUrl: text("resume_file_url"), // R2 URL or file path
		coverLetter: text("cover_letter"),
		applicationFormData: text("application_form_data"),
		wellBeingScore: integer("well_being_score"),
		wellBeingTestData: text("well_being_test_data"),
		source: text("source").notNull().default("desktop"), // 'desktop' | 'mobile' | 'tablet'
		jobseekerViewResult: integer("jobseeker_view_result", { mode: "boolean" }).notNull().default(false),
		rejectionType: text("rejection_type"), // 'auto' | 'manual' | null
		rejectionRemarks: text("rejection_remarks"),
		rejectedBy: text("rejected_by"),
		rejectedAt: text("rejected_at"),
		dateApplied: text("date_applied")
			.default(sql`(datetime('now'))`)
			.notNull(),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
	},
	(table) => [
		index("application_userId_idx").on(table.userId),
		index("application_jobId_idx").on(table.jobId),
		index("application_status_idx").on(table.status),
		index("application_matchScore_idx").on(table.matchScore),
		index("application_source_idx").on(table.source),
	],
);

export const JOB_EVENT_TYPE = {
	CLICK: "click",
	VIEW: "view",
} as const;

export type JobEventType = (typeof JOB_EVENT_TYPE)[keyof typeof JOB_EVENT_TYPE];

// Timestamped job engagement events. job.clickedAmount / job.views stay the
// lifetime counters; this table exists so events can be scoped to a date range.
export const jobEventLog = sqliteTable(
	"job_event_log",
	{
		id: text("id").primaryKey(),
		jobId: text("job_id")
			.notNull()
			.references(() => job.id, { onDelete: "cascade" }),
		eventType: text("event_type").notNull(),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
	},
	(table) => [
		index("job_event_log_jobId_idx").on(table.jobId),
		index("job_event_log_eventType_idx").on(table.eventType),
		index("job_event_log_createdAt_idx").on(table.createdAt),
	],
);

// ============================================
// Liked Job Table
// ============================================

export const likedJob = sqliteTable(
	"liked_job",
	{
		id: text("id").primaryKey(),
		jobId: text("job_id")
			.notNull()
			.references(() => job.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		likedAt: text("liked_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
	},
	(table) => [
		index("likedJob_jobId_idx").on(table.jobId),
		index("likedJob_userId_idx").on(table.userId),
		index("likedJob_likedAt_idx").on(table.likedAt),
		unique("likedJob_unique").on(table.jobId, table.userId), // Prevent duplicate likes
	],
);

// ============================================
// Saved Job Table
// ============================================

export const savedJob = sqliteTable(
	"saved_job",
	{
		id: text("id").primaryKey(),
		jobId: text("job_id")
			.notNull()
			.references(() => job.id, { onDelete: "cascade" }),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		savedAt: text("saved_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
	},
	(table) => [
		index("savedJob_jobId_idx").on(table.jobId),
		index("savedJob_userId_idx").on(table.userId),
		index("savedJob_savedAt_idx").on(table.savedAt),
		unique("savedJob_unique").on(table.jobId, table.userId), // Prevent duplicate saves
	],
);

// ============================================
// Application Feedback Table
// ============================================

export const applicationFeedback = sqliteTable(
	"application_feedback",
	{
		id: text("id").primaryKey(),
		applicationId: text("application_id")
			.notNull()
			.references(() => application.id, { onDelete: "cascade" }),
		panelistId: text("panelist_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		rating: integer("rating").notNull(), // 1-5
		comment: text("comment"),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
	},
	(table) => [
		index("applicationFeedback_applicationId_idx").on(table.applicationId),
		index("applicationFeedback_panelistId_idx").on(table.panelistId),
		unique("applicationFeedback_unique").on(table.applicationId, table.panelistId),
	],
);

// Pivot table job and skills
export const jobSkills = sqliteTable(
	"job_skills",
	{
		id: text("id").primaryKey(),
		jobId: text("job_id")
			.notNull()
			.references(() => job.id, { onDelete: "cascade" }),
		skillId: integer("skill_id")
			.notNull()
			.references(() => skills.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("jobSkills_jobId_idx").on(table.jobId),
		index("jobSkills_skillId_idx").on(table.skillId),
	],
);

// ============================================
// Job Benefits Junction Table
// ============================================

export const jobBenefits = sqliteTable(
	"job_benefits",
	{
		id: text("id").primaryKey(),
		jobId: text("job_id")
			.notNull()
			.references(() => job.id, { onDelete: "cascade" }),
		benefitId: integer("benefit_id")
			.notNull()
			.references(() => benefits.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("jobBenefits_jobId_idx").on(table.jobId),
		index("jobBenefits_benefitId_idx").on(table.benefitId),
	],
);

// ============================================
// Job Languages Junction Table
// ============================================

export const jobLanguages = sqliteTable(
	"job_languages",
	{
		id: text("id").primaryKey(),
		jobId: text("job_id")
			.notNull()
			.references(() => job.id, { onDelete: "cascade" }),
		languageId: integer("language_id")
			.notNull()
			.references(() => languages.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("jobLanguages_jobId_idx").on(table.jobId),
		index("jobLanguages_languageId_idx").on(table.languageId),
	],
);

// ============================================
// Job Open To Countries Junction Table
// ============================================

export const jobOpenToCountries = sqliteTable(
	"job_open_to_countries",
	{
		id: text("id").primaryKey(),
		jobId: text("job_id")
			.notNull()
			.references(() => job.id, { onDelete: "cascade" }),
		countryId: integer("country_id")
			.notNull()
			.references(() => countries.id, { onDelete: "cascade" }),
	},
	(table) => [
		index("jobOpenToCountries_jobId_idx").on(table.jobId),
		index("jobOpenToCountries_countryId_idx").on(table.countryId),
	],
);

// ============================================
// Relations
// ============================================

export const jobRelations = relations(job, ({ one, many }) => ({
	organization: one(organization, {
		fields: [job.organizationId],
		references: [organization.id],
	}),
	department: one(departments, {
		fields: [job.departmentId],
		references: [departments.id],
	}),
	country: one(countries, {
		fields: [job.countryId],
		references: [countries.id],
	}),
	state: one(states, {
		fields: [job.stateId],
		references: [states.id],
	}),
	city: one(cities, {
		fields: [job.cityId],
		references: [cities.id],
	}),
	postcode: one(postcodes, {
		fields: [job.postcodeId],
		references: [postcodes.id],
	}),
	createdBy: one(user, {
		fields: [job.createdById],
		references: [user.id],
	}),
	applications: many(application),
	savedBy: many(savedJob),
	likedBy: many(likedJob),
}));

export const applicationRelations = relations(application, ({ one, many }) => ({
	job: one(job, {
		fields: [application.jobId],
		references: [job.id],
	}),
	user: one(user, {
		fields: [application.userId],
		references: [user.id],
	}),
	feedback: many(applicationFeedback),
	stages: many(applicationStages),
}));

export const stagesRelations = relations(stages, ({ many }) => ({
	applications: many(applicationStages),
}));

export const applicationStagesRelations = relations(applicationStages, ({ one }) => ({
	application: one(application, {
		fields: [applicationStages.applicationId],
		references: [application.id],
	}),
	stage: one(stages, {
		fields: [applicationStages.stageId],
		references: [stages.id],
	}),
}));

export const applicationFeedbackRelations = relations(applicationFeedback, ({ one }) => ({
	application: one(application, {
		fields: [applicationFeedback.applicationId],
		references: [application.id],
	}),
	panelist: one(user, {
		fields: [applicationFeedback.panelistId],
		references: [user.id],
	}),
}));

export const savedJobRelations = relations(savedJob, ({ one }) => ({
	job: one(job, {
		fields: [savedJob.jobId],
		references: [job.id],
	}),
	user: one(user, {
		fields: [savedJob.userId],
		references: [user.id],
	}),
}));

export const likedJobRelations = relations(likedJob, ({ one }) => ({
	job: one(job, {
		fields: [likedJob.jobId],
		references: [job.id],
	}),
	user: one(user, {
		fields: [likedJob.userId],
		references: [user.id],
	}),
}));
