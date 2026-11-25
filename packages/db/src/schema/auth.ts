import { relations, sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
	createdAt: text("created_at")
		.default(sql`(datetime('now'))`)
		.notNull(),
});

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
