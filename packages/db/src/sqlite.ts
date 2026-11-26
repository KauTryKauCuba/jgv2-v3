import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

// Drizzle connected to a local SQLite file, for the VPS/Bun entrypoint
// (apps/server/src/bun.ts). Never imported from shared app code, so this
// stays the one place the SQLite file driver is chosen.
//
// Adds `batch([...])`, which D1's driver has and Bun's doesn't, so routers
// can write the same all-or-nothing `db.batch([...])` on either platform
// (backend portability rule #4: no interactive transactions — D1 has none).
// Here the statements run inside one SQLite transaction.
export function createSqliteDb(path: string) {
	mkdirSync(dirname(path), { recursive: true });
	const sqlite = new Database(path, { create: true });
	sqlite.exec("PRAGMA foreign_keys = ON;");
	const db = drizzle(sqlite, { schema });
	return Object.assign(db, {
		async batch(queries: readonly { run: () => unknown }[]) {
			sqlite.transaction(() => {
				for (const query of queries) query.run();
			})();
			return [];
		},
	});
}
