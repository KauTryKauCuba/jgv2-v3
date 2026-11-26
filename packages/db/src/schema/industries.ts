import { sql } from "drizzle-orm";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { industryCategories } from "./industryCategories";

export const industries = sqliteTable("industries", {
	id: integer("id").primaryKey(),
	name: text("name").notNull(),
	categoryId: integer("category_id").references(() => industryCategories.id, { onDelete: "set null" }),
	createdAt: text("created_at")
		.default(sql`(datetime('now'))`)
		.notNull(),
	updatedAt: text("updated_at")
		.default(sql`(datetime('now'))`)
		.$onUpdate(() => sql`datetime('now')`)
		.notNull(),
});

