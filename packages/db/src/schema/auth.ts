import { relations, sql } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Copied from v1 (jobgiga-app-develop/packages/db/src/schema/auth.ts), trimmed
// to just the Better-Auth core + organization tables for Phase 1 (login).
// v1's file also holds jobseeker profile, bookmarks, culture/benefit pivots,
// etc. — those come back in Phase 2/3 alongside the lookup tables they
// reference (countries, industries, medias, …). Columns that pointed at
// those not-yet-existing tables are kept as plain columns for now, marked
// TODO(schema), and get their real .references() back once those tables
// land.

export const user = sqliteTable("user", {
	id: text("id").primaryKey(),
	talentIdUserId: text("talent_id_user_id").unique(), // link to talent id
	name: text("full_name").notNull(),
	firstName: text("first_name"),
	lastName: text("last_name"),
	email: text("email").notNull().unique(),
	emailVerified: integer("email_verified", { mode: "boolean" })
		.default(false)
		.notNull(),
	image: text("image"),
	// TODO(schema): references countries.id once the lookup table exists (Phase 2).
	countryCodeId: integer("country_code_id"),
	phoneNumber: text("phone_number").notNull().default(""),
	phoneVerified: integer("phone_verified", { mode: "boolean" }).default(false).notNull(),
	profilePicture: text("profile_picture"),
	createdAt: text("created_at")
		.default(sql`(datetime('now'))`)
		.notNull(),
	updatedAt: text("updated_at")
		.default(sql`(datetime('now'))`)
		.$onUpdate(() => sql`datetime('now')`)
		.notNull(),
	// Admin plugin — Better Auth persists this on the user row (app RBAC uses `user_roles` separately).
	role: text("role").default("user"),
	banned: integer("banned", { mode: "boolean" }).default(false),
	banReason: text("ban_reason"),
	banExpires: text("ban_expires"),
	deletedAt: text("deleted_at"),
	deletionReason: text("deletion_reason"),
	lastSeenAt: text("last_seen_at"),
});

export const session = sqliteTable(
	"session",
	{
		id: text("id").primaryKey(),
		expiresAt: text("expires_at").notNull(),
		token: text("token").notNull().unique(),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
		ipAddress: text("ip_address"),
		userAgent: text("user_agent"),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// Admin plugin field
		impersonatedBy: text("impersonated_by"),
		// Organization plugin fields
		activeOrganizationId: text("active_organization_id"),
	},
	(table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
	"account",
	{
		id: text("id").primaryKey(),
		accountId: text("account_id").notNull(),
		providerId: text("provider_id").notNull(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		accessToken: text("access_token"),
		refreshToken: text("refresh_token"),
		idToken: text("id_token"),
		accessTokenExpiresAt: text("access_token_expires_at"),
		refreshTokenExpiresAt: text("refresh_token_expires_at"),
		scope: text("scope"),
		password: text("password"),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
	},
	(table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
	"verification",
	{
		id: text("id").primaryKey(),
		identifier: text("identifier").notNull(),
		value: text("value").notNull(),
		expiresAt: text("expires_at").notNull(),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
	},
	(table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
	sessions: many(session),
	accounts: many(account),
	members: many(member),
}));

export const sessionRelations = relations(session, ({ one }) => ({
	user: one(user, {
		fields: [session.userId],
		references: [user.id],
	}),
}));

export const accountRelations = relations(account, ({ one }) => ({
	user: one(user, {
		fields: [account.userId],
		references: [user.id],
	}),
}));

// ============================================
// Organization Plugin Tables
// ============================================

export const organization = sqliteTable("organization", {
	id: text("id").primaryKey(),
	legalName: text("legal_name").notNull(),
	displayName: text("display_name").notNull(),
	slug: text("slug").unique(),
	companyLogo: text("company_logo"),
	companySize: text("company_size"),
	ssmNumber: text("ssm_number"),
	status: text("status").notNull().default("In Review"), // In Review, approved, rejected
	metadata: text("metadata"), // JSON string for custom data like approval status
	address: text("address"),
	// TODO(schema): references countries/states/cities/postcodes.id once those lookup tables exist (Phase 2).
	countryId: integer("country_id"),
	stateId: integer("state_id"),
	cityId: integer("city_id"),
	postcodeId: integer("postcode_id"),
	// TODO(schema): references industries.id once the lookup table exists (Phase 2). v1 has this
	// notNull — left nullable here until that table and its seed data land.
	industryId: integer("industry_id"),
	// Multi-organization support: parent organization for hierarchical structure
	parentOrganizationId: text("parent_organization_id").references(
		(): any => organization.id,
		{ onDelete: "set null" },
	),
	website: text("website"),
	email: text("email"),
	phoneNumber: text("phone_number"),
	// TODO(schema): references medias.id once that table exists (Phase 2).
	companyBannerId: integer("company_banner_id"),
	companyBannerSmallId: integer("company_banner_small_id"),
	description: text("description"),
	facebookUrl: text("facebook_url"),
	linkedinUrl: text("linkedin_url"),
	tiktokUrl: text("tiktok_url"),
	instagramUrl: text("instagram_url"),
	verified: integer("verified", { mode: "boolean" }).default(false),
	// ── The redesign's employer_profiles fields that v1 has no column for ──
	// (v1 names above are reused where they exist: legalName/displayName ←
	// companyName, companyLogo ← logo (a storage key), companySize, ssmNumber,
	// website, email, phoneNumber, description, linkedinUrl/facebookUrl/
	// instagramUrl.) Files are storage keys, as everywhere in v3.
	// Free-text industry ("Digital marketing agency") — the redesign keeps it
	// next to the standardized category below.
	industry: text("industry"),
	// One of INDUSTRIES (packages/api/src/shared/industries.ts).
	// TODO(schema): v1's industryId lookup once that table is seeded.
	industryCategory: text("industry_category"),
	foundedYear: integer("founded_year"),
	companyType: text("company_type"),
	benefits: text("benefits", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
	officePhotoKey: text("office_photo_key"),
	// 3:1 cover banner. TODO(schema): v1's companyBannerId → medias once that exists.
	bannerKey: text("banner_key"),
	recentNews: text("recent_news", { mode: "json" })
		.$type<{ title: string; url: string }[]>()
		.notNull()
		.default(sql`'[]'`),
	// The workplace (see shared/company-workplace.ts): gallery photo keys,
	// facilities, dress code, awards, leadership.
	galleryPhotos: text("gallery_photos", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
	facilities: text("facilities", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
	dressCode: text("dress_code"),
	awards: text("awards", { mode: "json" })
		.$type<{ title: string; year: number | null }[]>()
		.notNull()
		.default(sql`'[]'`),
	leaders: text("leaders", { mode: "json" })
		.$type<{ name: string; title: string; photoKey: string | null }[]>()
		.notNull()
		.default(sql`'[]'`),
	// SSM certificate (private file) and its review by a superadmin.
	ssmDocumentKey: text("ssm_document_key"),
	ssmVerificationStatus: text("ssm_verification_status").notNull().default("unverified"), // unverified | pending | verified | rejected
	ssmVerifiedAt: text("ssm_verified_at"),
	ssmRejectionReason: text("ssm_rejection_reason"),
	// The account that registered the company (the redesign's employer_profiles.userId).
	createdByUserId: text("created_by_user_id").references(() => user.id, { onDelete: "set null" }),
	// The redesign's Smart Match settings (Top Matches card): on/off, and which
	// criteria count. Criteria is a JSON object of flags; missing keys mean
	// "on" (see packages/api/src/shared/matching.ts).
	smartMatchEnabled: integer("smart_match_enabled", { mode: "boolean" }).notNull().default(true),
	smartMatchCriteria: text("smart_match_criteria", { mode: "json" }).$type<Record<string, boolean>>(),
	updatedAt: text("updated_at"),
	createdAt: text("created_at")
		.default(sql`(datetime('now'))`)
		.notNull(),
});

// The redesign's employer_addresses: a company can have several offices.
export const organizationAddress = sqliteTable(
	"organization_address",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		label: text("label").notNull(),
		addressLine1: text("address_line1").notNull(),
		addressLine2: text("address_line2"),
		// Optional neighbourhood, e.g. "Bangsar South".
		area: text("area"),
		city: text("city").notNull(),
		state: text("state").notNull(),
		postcode: text("postcode").notNull(),
		// The address new job postings start with — exactly one per company.
		isJobDefault: integer("is_job_default", { mode: "boolean" }).notNull().default(false),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
	},
	(table) => [index("organizationAddress_organizationId_idx").on(table.organizationId)],
);

// The redesign's employer_badges: milestones a company has earned.
export const organizationBadge = sqliteTable(
	"organization_badge",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		badgeKey: text("badge_key").notNull(),
		earnedAt: text("earned_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("organizationBadge_org_key_unique").on(table.organizationId, table.badgeKey),
		index("organizationBadge_organizationId_idx").on(table.organizationId),
	],
);

export const organizationRelations = relations(organization, ({ many, one }) => ({
	members: many(member),
	invitations: many(invitation),
	// Parent organization
	parentOrganization: one(organization, {
		fields: [organization.parentOrganizationId],
		references: [organization.id],
		relationName: "parent",
	}),
	// Child organizations (subsidiaries)
	childOrganizations: many(organization, {
		relationName: "parent",
	}),
}));

export const member = sqliteTable(
	"member",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		name: text("name"),
		email: text("email"),
		role: text("role").notNull(), // hr manager, hr staff, panelist
		accessLevel: text("access_level").notNull().default("none"), //none,admin,panel,owner
		// TODO(schema): references positions.id once that table exists (Phase 2/3).
		positionId: integer("position_id"),
		invitationId: text("invitation_id").references(() => invitation.id, {
			onDelete: "cascade",
		}),
		hasSeenDashboardTour: integer("has_seen_dashboard_tour", {
			mode: "boolean",
		}).default(false),
		status: text("status").notNull().default("active"), // active | deleted
		// The redesign's "About you" on employer_profiles (contact*): this
		// person's own details at the company. name/email above are reused.
		contactRole: text("contact_role"), // one of CONTACT_ROLES
		// Their actual job title. TODO(schema): v1's positionId once seeded.
		positionTitle: text("position_title"),
		phoneNumber: text("phone_number"),
		avatarKey: text("avatar_key"),
		deletedAt: text("deleted_at"),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
	},
	(table) => [
		index("member_organizationId_idx").on(table.organizationId),
		index("member_userId_idx").on(table.userId),
		index("member_positionId_idx").on(table.positionId),
		index("member_invitationId_idx").on(table.invitationId),
	],
);

export const memberRelations = relations(member, ({ one }) => ({
	organization: one(organization, {
		fields: [member.organizationId],
		references: [organization.id],
	}),
	user: one(user, {
		fields: [member.userId],
		references: [user.id],
	}),
}));

export const invitation = sqliteTable(
	"invitation",
	{
		id: text("id").primaryKey(),
		organizationId: text("organization_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		name: text("name"),
		role: text("role").notNull(), // admin, member
		// TODO(schema): references positions.id once that table exists (Phase 2/3).
		positionId: integer("position_id"),
		status: text("status").notNull().default("pending"), // pending, accepted, rejected, canceled
		inviterId: text("inviter_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		expiresAt: text("expires_at").notNull(),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
	},
	(table) => [
		index("invitation_organizationId_idx").on(table.organizationId),
		index("invitation_email_idx").on(table.email),
	],
);

export const invitationRelations = relations(invitation, ({ one }) => ({
	organization: one(organization, {
		fields: [invitation.organizationId],
		references: [organization.id],
	}),
	inviter: one(user, {
		fields: [invitation.inviterId],
		references: [user.id],
	}),
}));

// ============================================
// Jobseeker Profile
// ============================================
// Holds everything the redesign's jobseeker onboarding form saves
// (OnboardingForm.tsx → POST /api/jobseeker/profile). Table names follow v1;
// where v1 already has the same field its column name is kept (job_title,
// mobile_number, nationality, desired_job_type, expected_salary_from/to,
// work_eligibility, resume_url, …); the redesign's extra fields use its own
// names in snake_case. Files are storage keys, never data or disk paths
// (portability rule #6). Lists of words (skills) and of places are JSON text.

export type WorkPlaceJson = {
	area: string | null;
	city: string;
	state: string;
	lat: number | null;
	lng: number | null;
};

export const jobseekerProfile = sqliteTable(
	"jobseeker_profile",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.unique()
			.references(() => user.id, { onDelete: "cascade" }),
		// Storage key of the profile photo, or an external URL (e.g. Google's).
		avatarKey: text("avatar_key"),
		fullName: text("full_name").notNull().default(""),
		// The year their age implies — a full date of birth is never stored.
		birthYear: integer("birth_year"),
		gender: text("gender"),
		maritalStatus: text("marital_status"),
		nationality: text("nationality"),
		mobileNumber: text("mobile_number"),
		drivingLicense: text("driving_license"),
		// Storage key of the resume file.
		resumeUrl: text("resume_url"),
		resumeFileName: text("resume_file_name"),
		resumeFileSize: integer("resume_file_size"),
		// Display string ("City, State" in Malaysia, "City, Country" elsewhere).
		location: text("location").notNull().default(""),
		city: text("city").notNull().default(""),
		state: text("state").notNull().default(""),
		country: text("country").notNull().default("Malaysia"),
		area: text("area"),
		latitude: real("latitude"),
		longitude: real("longitude"),
		// The role they're after (the redesign's targetRole).
		jobTitle: text("job_title"),
		preferredIndustry: text("preferred_industry"),
		yearsExperience: integer("years_experience"),
		professionalSkills: text("professional_skills", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
		softSkills: text("soft_skills", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
		otherSkills: text("other_skills", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
		// full_time | part_time | contract | internship | freelance | temporary
		desiredJobType: text("desired_job_type"),
		expectedSalaryFrom: integer("expected_salary_from"),
		expectedSalaryTo: integer("expected_salary_to"),
		bio: text("bio"),
		linkedinUrl: text("linkedin_url"),
		portfolioUrl: text("portfolio_url"),
		githubUrl: text("github_url"),
		noticePeriod: text("notice_period"),
		workArrangement: text("work_arrangement"),
		preferredWorkPlaces: text("preferred_work_places", { mode: "json" })
			.$type<WorkPlaceJson[]>()
			.notNull()
			.default(sql`'[]'`),
		// citizen | permanent_resident | work_pass_holder | needs_sponsorship
		workEligibility: text("work_eligibility"),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
	},
	(table) => [index("jobseekerProfile_userId_idx").on(table.userId)],
);

export const jobseekerWorkingExperience = sqliteTable(
	"jobseeker_working_experience",
	{
		id: text("id").primaryKey(),
		jobseekerProfileId: text("jobseeker_profile_id")
			.notNull()
			.references(() => jobseekerProfile.id, { onDelete: "cascade" }),
		company: text("company").notNull(),
		jobTitle: text("job_title").notNull(),
		// "Jan 2022" — the granularity the form and resume parsing give.
		periodStart: text("period_start").notNull(),
		periodEnd: text("period_end"),
		isCurrent: integer("is_current", { mode: "boolean" }).notNull().default(false),
		// Rich text (the redesign's "achievements").
		jobDescription: text("job_description"),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
	},
	(table) => [index("jobseekerWorkExp_profileId_idx").on(table.jobseekerProfileId)],
);

export const jobseekerEducation = sqliteTable(
	"jobseeker_education",
	{
		id: text("id").primaryKey(),
		jobseekerProfileId: text("jobseeker_profile_id")
			.notNull()
			.references(() => jobseekerProfile.id, { onDelete: "cascade" }),
		schoolName: text("school_name").notNull(),
		fieldOfStudy: text("field_of_study"),
		// SPM | STPM | Diploma | Degree | Master | PhD | Other
		educationLevel: text("education_level").notNull(),
		cgpa: text("cgpa"),
		graduationYear: integer("graduation_year"),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
	},
	(table) => [index("jobseekerEdu_profileId_idx").on(table.jobseekerProfileId)],
);

export const jobseekerCertification = sqliteTable(
	"jobseeker_certification",
	{
		id: text("id").primaryKey(),
		jobseekerProfileId: text("jobseeker_profile_id")
			.notNull()
			.references(() => jobseekerProfile.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		issuer: text("issuer"),
		year: integer("year"),
		// Storage key of the certificate file (PDF or image), optional.
		fileKey: text("file_key"),
		fileName: text("file_name"),
		fileSize: integer("file_size"),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
	},
	(table) => [index("jobseekerCert_profileId_idx").on(table.jobseekerProfileId)],
);

export const jobseekerProfileLanguage = sqliteTable(
	"jobseeker_profile_language",
	{
		id: text("id").primaryKey(),
		jobseekerProfileId: text("jobseeker_profile_id")
			.notNull()
			.references(() => jobseekerProfile.id, { onDelete: "cascade" }),
		language: text("language").notNull(),
		dialects: text("dialects", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
		// basic | conversational | fluent | native
		spokenLevel: text("spoken_level").notNull(),
		writtenLevel: text("written_level").notNull(),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
	},
	(table) => [index("jobseekerLang_profileId_idx").on(table.jobseekerProfileId)],
);

export const jobseekerReference = sqliteTable(
	"jobseeker_reference",
	{
		id: text("id").primaryKey(),
		jobseekerProfileId: text("jobseeker_profile_id")
			.notNull()
			.references(() => jobseekerProfile.id, { onDelete: "cascade" }),
		fullName: text("full_name").notNull().default(""),
		jobTitle: text("job_title"),
		company: text("company"),
		phone: text("phone"),
		email: text("email"),
		sortOrder: integer("sort_order").notNull().default(0),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
	},
	(table) => [index("jobseekerRef_profileId_idx").on(table.jobseekerProfileId)],
);

export const jobseekerProfileRelations = relations(jobseekerProfile, ({ one, many }) => ({
	user: one(user, {
		fields: [jobseekerProfile.userId],
		references: [user.id],
	}),
	workingExperiences: many(jobseekerWorkingExperience),
	educations: many(jobseekerEducation),
	certifications: many(jobseekerCertification),
	languages: many(jobseekerProfileLanguage),
	references: many(jobseekerReference),
}));

// v1's account_deletion_requests, unchanged. A user with no company deletes
// their own account straight away (user.deleted_at); a company member files
// a request that someone above them approves (see
// packages/api/src/lib/account/deletion.ts).
export const accountDeletionRequests = sqliteTable(
	"account_deletion_requests",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		requesterMemberRole: text("requester_member_role"),
		requiredApproverRole: text("required_approver_role").notNull(), // superadmin | hr manager | hr staff
		status: text("status").notNull().default("pending"), // pending | approved | rejected | canceled | completed
		reason: text("reason"),
		reviewedByUserId: text("reviewed_by_user_id").references(() => user.id, {
			onDelete: "set null",
		}),
		reviewedAt: text("reviewed_at"),
		rejectionReason: text("rejection_reason"),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
	},
	(table) => [
		index("account_deletion_requests_userId_status_idx").on(table.userId, table.status),
		index("account_deletion_requests_org_status_idx").on(table.organizationId, table.status),
	],
);
