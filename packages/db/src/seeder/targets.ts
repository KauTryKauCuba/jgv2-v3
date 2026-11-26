// Where the seed scripts write: the local D1 database `bun run dev` uses
// (through wrangler), or the Bun/VPS SQLite file (DATABASE_PATH).
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type SeedTarget = {
	label: string;
	count: (table: string) => Promise<number>;
	/** One value from a SELECT that returns a single row with column `v`. */
	value: (sql: string) => Promise<unknown>;
	runFile: (path: string) => Promise<void>;
	runSql: (sql: string) => Promise<void>;
};

export function targetFromArgs(): SeedTarget {
	return process.argv.includes("--sqlite") ? sqliteTarget() : d1Target();
}

export function sqliteTarget(): SeedTarget {
	const path = process.env.DATABASE_PATH;
	if (!path) {
		console.error("Set DATABASE_PATH to the SQLite file, e.g. ../../apps/server/data/jobgiga.db");
		process.exit(1);
	}
	const { Database } = require("bun:sqlite") as typeof import("bun:sqlite");
	const sqlite = new Database(path);
	sqlite.exec("PRAGMA foreign_keys = ON;");
	const runSql = async (sql: string) => {
		sqlite.transaction(() => sqlite.exec(sql))();
	};
	return {
		label: path,
		count: async (table) => (sqlite.query(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n,
		value: async (sql) => (sqlite.query(sql).get() as { v: unknown } | null)?.v ?? null,
		runFile: (file) => runSql(readFileSync(file, "utf8")),
		runSql,
	};
}

// Runs through wrangler from apps/server, where wrangler.jsonc names the D1
// database and its local data folder.
export function d1Target(): SeedTarget {
	const serverDir = join(import.meta.dir, "../../../../apps/server");
	// D1_PERSIST_TO points at another local data folder (used for test runs).
	const persist = process.env.D1_PERSIST_TO ? [`--persist-to=${process.env.D1_PERSIST_TO}`] : [];
	const wrangler = async (args: string[]) => {
		const proc = Bun.spawn(["bun", "x", "wrangler", "d1", "execute", "jobgiga-v3", "--local", ...persist, ...args], {
			cwd: serverDir,
			stdout: "pipe",
			stderr: "pipe",
		});
		const [out, err, code] = await Promise.all([
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
			proc.exited,
		]);
		if (code !== 0) throw new Error(`wrangler failed:\n${err || out}`);
		return out;
	};
	const runFile = async (file: string) => {
		await wrangler(["--yes", `--file=${file}`]);
	};
	return {
		label: process.env.D1_PERSIST_TO ? `local D1 in ${process.env.D1_PERSIST_TO}` : "local D1",
		count: async (table) => {
			const out = await wrangler(["--json", "--command", `SELECT count(*) AS n FROM ${table}`]);
			return JSON.parse(out)[0].results[0].n as number;
		},
		value: async (sql) => {
			const out = await wrangler(["--json", "--command", sql]);
			return JSON.parse(out)[0].results[0]?.v ?? null;
		},
		runFile,
		runSql: async (sql) => {
			const file = join(tmpdir(), `jobgiga-seed-${crypto.randomUUID()}.sql`);
			writeFileSync(file, sql);
			try {
				await runFile(file);
			} finally {
				unlinkSync(file);
			}
		},
	};
}
