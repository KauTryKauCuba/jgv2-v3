import { defineConfig } from "drizzle-kit";

// Same schema and migrations folder as drizzle.config.ts (the D1/Cloudflare
// config) — only the target differs: a local SQLite file for the VPS/Bun
// path instead of a remote D1 database over HTTP.
export default defineConfig({
	schema: "./src/schema",
	out: "./src/migrations",
	dialect: "sqlite",
	dbCredentials: {
		url: process.env.DATABASE_PATH ?? "../../apps/server/data/jobgiga.db",
	},
});
