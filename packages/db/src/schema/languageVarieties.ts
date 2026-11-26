import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { languages } from "./languages";

export const languageVarieties = sqliteTable(
	"language_varieties",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		languageId: integer("language_id")
			.notNull()
			.references(() => languages.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		iso6393: text("iso6393").notNull(),
		createdAt: text("created_at")
			.default(sql`(datetime('now'))`)
			.notNull(),
		updatedAt: text("updated_at")
			.default(sql`(datetime('now'))`)
			.$onUpdate(() => sql`datetime('now')`)
			.notNull(),
	},
	(table) => [
		uniqueIndex("language_varieties_language_name_idx").on(
			table.languageId,
			table.name,
		),
	],
);
