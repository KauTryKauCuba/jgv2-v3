// VPS entrypoint. Reads config from process.env (via .env), picks the
// SQLite file driver (the only place this entrypoint decides that), and
// builds the shared app from app.ts, then serves it with Bun's built-in
// server. All actual logic lives in app.ts.
import { createSqliteDb } from "@jobgiga-app/db/sqlite";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 4401);
const dbPath = process.env.DATABASE_PATH ?? "./data/jobgiga.db";

const db = createSqliteDb(dbPath);

const app = createApp({
	CORS_ORIGIN: process.env.CORS_ORIGIN,
	db,
});

console.log(`Server listening on http://localhost:${port}`);

export default {
	port,
	fetch: app.fetch,
};
