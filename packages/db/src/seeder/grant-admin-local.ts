/**
 * Makes an account a platform admin (v1's seed.ts: user.role = "admin"),
 * which opens the superadmin panel. Sign up with the email first.
 *
 * Usage (from packages/db):
 *   bun run admin:grant:local -- you@example.com
 *   bun run admin:grant:local -- you@example.com --revoke
 *   (add --sqlite and DATABASE_PATH=… for the Bun/VPS SQLite file)
 */
import { targetFromArgs } from "./targets";

const q = (value: string) => `'${value.replace(/'/g, "''")}'`;

async function run() {
	const args = process.argv.slice(2).filter((a) => a !== "--");
	const email = args.find((a) => a.includes("@"))?.trim().toLowerCase();
	if (!email) {
		console.error("Give the account's email: bun run admin:grant:local -- you@example.com");
		process.exit(1);
	}
	const revoke = args.includes("--revoke");
	const target = targetFromArgs();
	const role = await target.value(`SELECT role AS v FROM user WHERE lower(email) = ${q(email)}`);
	if (role === null && !(await target.value(`SELECT id AS v FROM user WHERE lower(email) = ${q(email)}`))) {
		console.error(`No account with ${email} in ${target.label} — sign up with it first.`);
		process.exit(1);
	}
	await target.runSql(`UPDATE user SET role = ${q(revoke ? "user" : "admin")} WHERE lower(email) = ${q(email)};`);
	console.log(revoke ? `${email} is no longer an admin.` : `${email} is now a platform admin (superadmin panel: /superadmin).`);
	console.log("Sign out and back in if the panel doesn't show straight away.");
}

run().catch((error) => {
	console.error("Failed:", error);
	process.exit(1);
});
