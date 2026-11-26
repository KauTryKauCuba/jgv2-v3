
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const countries = sqliteTable("countries", {
	id: integer("id").primaryKey(),
	code: text("code"),
	name: text("name").notNull(),
	createdAt: text("created_at")
		.default(sql`(datetime('now', '+8 hours'))`)
		.notNull(),
	updatedAt: text("updated_at")
		.default(sql`(datetime('now', '+8 hours'))`)
		.$onUpdate(() => sql`(datetime('now', '+8 hours'))`)
		.notNull(),
});

