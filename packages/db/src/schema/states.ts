
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { countries } from "./countries";
import { sql } from "drizzle-orm";

export const states = sqliteTable("states", {
	id: integer("id").primaryKey(),
	countryId: integer("country_id").notNull().references(() => countries.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	createdAt: text("created_at")
		.default(sql`(datetime('now'))`)
		.notNull(),
	updatedAt: text("updated_at")
		.default(sql`(datetime('now'))`)
		.$onUpdate(() => sql`datetime('now')`)
		.notNull(),
});