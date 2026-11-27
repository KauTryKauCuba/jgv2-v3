/**
 * Local development only: publishes job postings waiting for review, the way
 * an admin will once v3 has an admin panel (v1's adminUpdateJobStatus, the
 * redesign's superadmin review). Submitted jobs stay "pending" until then.
 *
 * Usage (from packages/db):
 *   bun run jobs:approve:local                 → lists pending jobs
 *   bun run jobs:approve:local -- --all        → publishes every pending job
 *   bun run jobs:approve:local -- <job id>     → publishes that one
 *   (add --sqlite and DATABASE_PATH=… for the Bun/VPS SQLite file)
 */
import { targetFromArgs } from "./targets";

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

async function run() {
	const target = targetFromArgs();
	const args = process.argv.slice(2).filter((a) => a !== "--sqlite" && a !== "--");
	const pending = Number(await target.value("SELECT count(*) AS v FROM job WHERE status = 'pending'"));
	if (args.length === 0) {
		console.log(`${pending} job(s) waiting for review in ${target.label}.`);
		if (pending > 0) {
			const list = await target.value(
				"SELECT group_concat(id || '  ' || title, char(10)) AS v FROM (SELECT id, title FROM job WHERE status = 'pending' ORDER BY created_at)",
			);
			console.log(list);
			console.log("\nPublish with: bun run jobs:approve:local -- --all   (or -- <job id>)");
		}
		return;
	}
	const where = args.includes("--all") ? "status = 'pending'" : `status = 'pending' AND id IN (${args.map(q).join(", ")})`;
	const count = Number(await target.value(`SELECT count(*) AS v FROM job WHERE ${where}`));
	await target.runSql(
		`UPDATE job SET status = 'published', is_active = 1, published_at = datetime('now'), updated_at = datetime('now') WHERE ${where};`,
	);
	console.log(`Published ${count} job(s) in ${target.label}.`);
}

run().catch((error) => {
	console.error("Failed:", error);
	process.exit(1);
});
