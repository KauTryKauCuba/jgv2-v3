import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// Drizzle connected to the Worker's D1 binding, like v1. Used only from the
// Cloudflare entrypoint (apps/server/src/worker.ts) — never imported from
// shared app code, so this stays the one place the D1 driver is chosen.
export function createD1Db(d1: D1Database) {
	return drizzle(d1, { schema });
}
