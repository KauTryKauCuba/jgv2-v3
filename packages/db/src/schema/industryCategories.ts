import { sql } from "drizzle-orm";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const industryCategories = sqliteTable("industry_categories", {
	id: integer("id").primaryKey(),
	name: text("name").notNull(),
	createdAt: text("created_at")
		.default(sql`(datetime('now'))`)
		.notNull(),
	updatedAt: text("updated_at")
		.default(sql`(datetime('now'))`)
		.$onUpdate(() => sql`datetime('now')`)
		.notNull(),
});

