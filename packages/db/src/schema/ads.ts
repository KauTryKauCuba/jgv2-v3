import { relations, sql } from "drizzle-orm";
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { organization, user } from "./auth";
import { job } from "./jobs";

// v1's ad tables (jobgiga-app-develop/packages/db/src/schema/ads.ts), with the
// redesign's booking flow added in v1's style (the user's choice, 2026-11-28):
// - The employer books a start date; a pending request holds its slot while
//   the superadmin reviews it (the redesign's company_ads / job_ads rules).
// - Every run lasts `ad_placements.duration_days`, booked up to
//   `book_ahead_months` ahead, at most `max_active_per_company` at once.
// - On approval an `ads` row takes a slot number, as in v1.
// Changes from v1:
// - `image_media_id` is nullable with no foreign key: v3 has no `medias`
//   table (files are storage keys), so new rows use `media_key` instead.
//   Old v1 rows keep their id for migrating.
// - Added: media_key, media_type, start_date, end_date, rejection_reason,
//   submitted_by_user_id, updated_at; on ad_placements book_ahead_months and
//   max_active_per_company.

// ============================================
// Ad placement / slot configuration
// ============================================

export const AD_PLACEMENT_SLUG = {
	JOB: "job_homepage",
	COMPANY: "company_homepage",
} as const;

export const adPlacements = sqliteTable("ad_placements", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	slug: text("slug").notNull().unique(),
	maxSlots: integer("max_slots").notNull(),
	durationDays: integer("duration_days").notNull(),
	// v3: the redesign's booking window and per-company limit.
	bookAheadMonths: integer("book_ahead_months").notNull().default(3),
	maxActivePerCompany: integer("max_active_per_company").notNull().default(2),
	createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ============================================
// Ad request (employer submits, superadmin reviews)
// ============================================

export const AD_REQUEST_STATUS = {
	PENDING: "pending",
	APPROVED: "approved",
	REJECTED: "rejected",
} as const;

export const AD_TYPE = {
	JOB: "job",
	COMPANY: "company",
} as const;

export const AD_MEDIA_TYPE = {
	IMAGE: "image",
	VIDEO: "video",
} as const;

export const adRequests = sqliteTable(
	"ad_requests",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		companyId: text("company_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		jobId: text("job_id").references(() => job.id, { onDelete: "cascade" }),
		placementId: integer("placement_id")
			.notNull()
			.references(() => adPlacements.id, { onDelete: "cascade" }),
		adType: text("ad_type").notNull(), // 'job' | 'company'
		// Company ads: the redesign's headline. Job ads: the job title when booked.
		adName: text("ad_name").notNull(),
		adTagline: text("ad_tagline"),
		adDescription: text("ad_description"),
		// v1's link to `medias`; v3 rows leave it empty and use media_key.
		imageMediaId: integer("image_media_id"),
		// v3: the storage key of the ad's image or video, and which it is.
		mediaKey: text("media_key"),
		mediaType: text("media_type").notNull().default("image"), // image | video
		status: text("status").notNull(), // pending | approved | rejected
		// v3: Malaysia calendar days ("YYYY-MM-DD"). Shows from start_date,
		// gone on end_date (exclusive). Pending requests hold these dates.
		startDate: text("start_date"),
		endDate: text("end_date"),
		rejectionReason: text("rejection_reason"),
		submittedByUserId: text("submitted_by_user_id").references(() => user.id, { onDelete: "set null" }),
		reviewedByAdminId: text("reviewed_by_admin_id").references(() => user.id, {
			onDelete: "set null",
		}),
		reviewedAt: text("reviewed_at"),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at").default(sql`(datetime('now'))`),
	},
	(table) => [
		index("ad_requests_company_id_idx").on(table.companyId),
		index("ad_requests_placement_id_idx").on(table.placementId),
		index("ad_requests_status_idx").on(table.status),
		index("ad_requests_dates_idx").on(table.startDate, table.endDate),
	],
);

// ============================================
// Running ads (occupying slots)
// ============================================

export const AD_STATUS = {
	SCHEDULED: "scheduled",
	ACTIVE: "active",
	EXPIRED: "expired",
} as const;

export const ads = sqliteTable(
	"ads",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		adRequestId: integer("ad_request_id")
			.notNull()
			.references(() => adRequests.id, { onDelete: "cascade" }),
		companyId: text("company_id")
			.notNull()
			.references(() => organization.id, { onDelete: "cascade" }),
		jobId: text("job_id").references(() => job.id, { onDelete: "cascade" }),
		placementId: integer("placement_id")
			.notNull()
			.references(() => adPlacements.id, { onDelete: "cascade" }),
		slotNumber: integer("slot_number").notNull(),
		startsAt: text("starts_at").notNull(),
		endsAt: text("ends_at").notNull(),
		status: text("status").notNull(), // scheduled | active | expired
		createdAt: text("created_at").default(sql`(datetime('now'))`),
	},
	(table) => [
		index("ads_placement_id_status_idx").on(table.placementId, table.status),
		index("ads_company_id_idx").on(table.companyId),
		index("ads_job_id_idx").on(table.jobId),
	],
);

// ============================================
// Ad payments (v1: future; unused in v3 until billing is decided)
// ============================================

export const AD_PAYMENT_STATUS = {
	PENDING: "pending",
	PAID: "paid",
	FAILED: "failed",
	REFUNDED: "refunded",
} as const;

export const adPayments = sqliteTable("ad_payments", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	adRequestId: integer("ad_request_id")
		.notNull()
		.references(() => adRequests.id, { onDelete: "cascade" }),
	amount: real("amount"), // DECIMAL(10,2)
	currency: text("currency"),
	paymentProvider: text("payment_provider"),
	paymentReference: text("payment_reference"),
	status: text("status"), // pending | paid | failed | refunded
	paidAt: text("paid_at"),
	createdAt: text("created_at").default(sql`(datetime('now'))`),
});

// ============================================
// Relations
// ============================================

export const adPlacementsRelations = relations(adPlacements, ({ many }) => ({
	adRequests: many(adRequests),
	ads: many(ads),
}));

export const adRequestsRelations = relations(adRequests, ({ one, many }) => ({
	placement: one(adPlacements, {
		fields: [adRequests.placementId],
		references: [adPlacements.id],
	}),
	company: one(organization, {
		fields: [adRequests.companyId],
		references: [organization.id],
	}),
	job: one(job, {
		fields: [adRequests.jobId],
		references: [job.id],
	}),
	reviewedByAdmin: one(user, {
		fields: [adRequests.reviewedByAdminId],
		references: [user.id],
	}),
	ads: many(ads),
	payments: many(adPayments),
}));

export const adsRelations = relations(ads, ({ one }) => ({
	adRequest: one(adRequests, {
		fields: [ads.adRequestId],
		references: [adRequests.id],
	}),
	placement: one(adPlacements, {
		fields: [ads.placementId],
		references: [adPlacements.id],
	}),
	company: one(organization, {
		fields: [ads.companyId],
		references: [organization.id],
	}),
	job: one(job, {
		fields: [ads.jobId],
		references: [job.id],
	}),
}));

export const adPaymentsRelations = relations(adPayments, ({ one }) => ({
	adRequest: one(adRequests, {
		fields: [adPayments.adRequestId],
		references: [adRequests.id],
	}),
}));
