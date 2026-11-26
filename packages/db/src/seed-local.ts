/**
 * Fills v1's lookup tables (countries, states, cities, industries, salary
 * types, …) from v1's own seed files in ./seeds.
 *
 * Usage (from packages/db):
 *   bun run seed:local                              → local D1 (what `bun run dev` uses)
 *   DATABASE_PATH=../../apps/server/data/jobgiga.db bun run seed:local:sqlite
 *                                                   → the Bun/VPS SQLite file
 *
 * A table that already has rows is skipped, so it's safe to run again: it
 * never deletes or overwrites anything that's there. (Some of v1's files start
 * with a DELETE — they only ever run on an empty table here.)
 */
import { join } from "node:path";
import { targetFromArgs } from "./seeder/targets";

// Parents before children: states need countries, cities need states, …
const SEEDS: { table: string; file: string }[] = [
	{ table: "countries", file: "seed-countries.sql" },
	{ table: "states", file: "seed-states.sql" },
	{ table: "cities", file: "seed-cities.sql" },
	{ table: "postcodes", file: "seed-postcodes.sql" },
	{ table: "industry_categories", file: "seed-industry-categories.sql" },
	{ table: "industries", file: "seed-industries.sql" },
	{ table: "salary_types", file: "seed-salary-types.sql" },
	{ table: "currency_types", file: "seed-currency-types.sql" },
	{ table: "education_types", file: "seed-education-types.sql" },
	{ table: "experience_types", file: "seed-experience-types.sql" },
	{ table: "languages", file: "language-reference.sql" },
	{ table: "skills", file: "seed-skills.sql" },
	{ table: "benefits", file: "seed-benefits.sql" },
	{ table: "departments", file: "seed-departments.sql" },
	{ table: "stages", file: "seed-stages.sql" },
];

const seedsDir = join(import.meta.dir, "seeds");

async function seed() {
	const target = targetFromArgs();
	console.log(`Seeding v1's lookup tables into ${target.label}…`);
	for (const { table, file } of SEEDS) {
		const before = await target.count(table);
		if (before > 0) {
			console.log(`  ${table}: already has ${before} rows, skipped`);
			continue;
		}
		await target.runFile(join(seedsDir, file));
		console.log(`  ${table}: ${await target.count(table)} rows added`);
	}
	console.log("Done.");
}

seed().catch((error) => {
	console.error("Seed failed:", error);
	process.exit(1);
});
