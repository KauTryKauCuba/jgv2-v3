
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { states } from "./states";
import { sql } from "drizzle-orm";

export const cities = sqliteTable("cities", {
    id: integer("id").primaryKey(),
    stateId: integer("state_id").notNull().references(() => states.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: text("created_at")
        .default(sql`(datetime('now'))`)
        .notNull(),
    updatedAt: text("updated_at")
        .default(sql`(datetime('now'))`)
        .$onUpdate(() => sql`datetime('now')`)
        .notNull(), 
});
