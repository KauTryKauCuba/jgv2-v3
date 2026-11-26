import { sql } from "drizzle-orm";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth";

// Ported from the redesign's employerOnboardingDrafts/jobseekerOnboardingDrafts
// (one row per user, a JSON blob of whatever the form had so far) — lets
// someone leave the onboarding form and come back without losing progress.
// Not yet read/written anywhere (see onboarding router's TODO); the forms
// built in this step submit directly instead.

export const employerOnboardingDraft = sqliteTable("employer_onboarding_draft", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	data: text("data").notNull(), // JSON string
	updatedAt: text("updated_at")
		.default(sql`(datetime('now'))`)
		.$onUpdate(() => sql`datetime('now')`)
		.notNull(),
});

export const jobseekerOnboardingDraft = sqliteTable("jobseeker_onboarding_draft", {
	userId: text("user_id")
		.primaryKey()
		.references(() => user.id, { onDelete: "cascade" }),
	data: text("data").notNull(), // JSON string
	updatedAt: text("updated_at")
		.default(sql`(datetime('now'))`)
		.$onUpdate(() => sql`datetime('now')`)
		.notNull(),
});
