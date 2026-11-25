import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

// Drizzle connected to a local SQLite file, for the VPS/Bun entrypoint
// (apps/server/src/bun.ts). Never imported from shared app code, so this
// stays the one place the SQLite file driver is chosen.
export function createSqliteDb(path: string) {
	mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path, { create: true });
	return drizzle(sqlite, { schema });
}
