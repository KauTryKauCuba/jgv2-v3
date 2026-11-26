
import { sqliteTable, integer, text } from "drizzle-orm/sqlite-core";
import { cities } from "./cities";
import { sql } from "drizzle-orm";

export const postcodes = sqliteTable("postcodes", {
    id: integer("id").primaryKey(),
    cityId: integer("city_id").notNull().references(() => cities.id, { onDelete: "cascade" }),
    postcode: text("postcode").notNull(),
    createdAt: text("created_at")
        .default(sql`(datetime('now'))`)
        .notNull(),
    updatedAt: text("updated_at")
        .default(sql`(datetime('now'))`)
        .$onUpdate(() => sql`datetime('now')`)
        .notNull(), 
});
