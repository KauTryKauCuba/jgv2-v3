import { sql } from "drizzle-orm";
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";

export const currencyTypes = sqliteTable("currency_types", {
	id: integer("id").primaryKey(),
	code: text("code").notNull(), // e.g., "MYR", "USD", "SGD"
	name: text("name").notNull(), // e.g., "Malaysian Ringgit", "US Dollar", "Singapore Dollar"
	createdAt: text("created_at")
		.default(sql`(datetime('now'))`)
		.notNull(),
	updatedAt: text("updated_at")
		.default(sql`(datetime('now'))`)
		.$onUpdate(() => sql`datetime('now')`)
		.notNull(),
});

