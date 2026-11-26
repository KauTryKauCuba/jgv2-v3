import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const languages = sqliteTable(
	"languages",
	{
	id: integer("id").primaryKey(),
	name: text("name").notNull().unique(),
	/** ISO 639-3 macro/language code (FR-LANG-001). */
	iso6393: text("iso6393").unique(),
	createdAt: text("created_at")
		.default(sql`(datetime('now'))`)
		.notNull(),
	updatedAt: text("updated_at")
		.default(sql`(datetime('now'))`)
		.$onUpdate(() => sql`datetime('now')`)
		.notNull(),
	},
	(table) => [uniqueIndex("languages_iso6393_idx").on(table.iso6393)],
);
