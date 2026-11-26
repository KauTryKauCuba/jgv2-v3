
import { sql } from "drizzle-orm";
import { sqliteTable, integer, text, index } from "drizzle-orm/sqlite-core";

export const benefits = sqliteTable("benefits", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	description: text("description").notNull().default(""),
	// Nullable: NULL means global (visible to all), set means scoped to that org only
	organizationId: text("organization_id"),
	createdAt: text("created_at")
		.default(sql`(datetime('now'))`)
		.notNull(),
	updatedAt: text("updated_at")
		.default(sql`(datetime('now'))`)
		.$onUpdate(() => sql`datetime('now')`)
		.notNull(),
},
(table) => [
	index("benefits_organizationId_idx").on(table.organizationId),
]);