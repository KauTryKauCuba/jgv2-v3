import { sql } from "drizzle-orm";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const salaryTypes = sqliteTable("salary_types", {
	id: integer("id").primaryKey(),
	name: text("name").notNull(),
	createdAt: text("created_at")
		.default(sql`(datetime('now', '+8 hours'))`)
		.notNull(),
	updatedAt: text("updated_at")
		.default(sql`(datetime('now', '+8 hours'))`)
		.$onUpdate(() => sql`datetime('now', '+8 hours')`)
		.notNull(),
});

