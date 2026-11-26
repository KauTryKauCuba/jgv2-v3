// VPS entrypoint. Reads config from process.env (via .env), picks the
// SQLite file driver and local-folder storage (the only place this
// entrypoint decides those), and builds the shared app from app.ts, then
// serves it with Bun's built-in server. All actual logic lives in app.ts.
import { createLocalStorage } from "@jobgiga-app/api/lib/storage/local";
import { createSqliteDb } from "@jobgiga-app/db/sqlite";
import { createApp } from "./app";

const port = Number(process.env.PORT ?? 4401);
const dbPath = process.env.DATABASE_PATH ?? "./data/jobgiga.db";
const storagePath = process.env.STORAGE_PATH ?? "./storage";

const db = createSqliteDb(dbPath);
const storage = createLocalStorage(storagePath);

const app = createApp({
	CORS_ORIGIN: process.env.CORS_ORIGIN,
	BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
	BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
	DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
	MIMO_API_KEY: process.env.MIMO_API_KEY,
	PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY,
	LOGO_DEV_API_KEY: process.env.LOGO_DEV_API_KEY,
	TWILIO_API_KEY_SID: process.env.TWILIO_API_KEY_SID,
	TWILIO_API_KEY_SECRET: process.env.TWILIO_API_KEY_SECRET,
	TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,
	db,
	storage,
});

console.log(`Server listening on http://localhost:${port}`);

export default {
	port,
	fetch: app.fetch,
};
