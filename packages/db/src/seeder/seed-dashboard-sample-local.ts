/**
 * Sample jobs, applicants, applications and interviews, so the two
 * dashboards have something to show before Post a job and Apply exist.
 * Local development only. Run `bun run seed:local` first (it needs v1's
 * cities, skills, industries and salary types).
 *
 * Usage (from packages/db):
 *   EMPLOYER_EMAIL=you@company.com JOBSEEKER_EMAIL=you@example.com bun run seed:sample:local
 *   bun run seed:sample:local -- --remove      → deletes everything it added
 *   (add --sqlite and DATABASE_PATH=… for the Bun/VPS SQLite file)
 *
 * EMPLOYER_EMAIL: the jobs are posted by this person's company, so its
 *   dashboard fills in. Without it they go to a sample company.
 * JOBSEEKER_EMAIL: this person gets 3 applications and 1 saved job, so the
 *   jobseeker dashboard fills in.
 *
 * Every row it adds has an id starting with "sample-", and --remove deletes
 * exactly those. Running it again first removes the previous sample rows.
 */
import { targetFromArgs } from "./targets";

const q = (value: string | number | null) =>
	value === null ? "NULL" : typeof value === "number" ? String(value) : `'${value.replace(/'/g, "''")}'`;
// A time relative to now, in SQLite's own "YYYY-MM-DD HH:MM:SS" (UTC) form.
const ago = (days: number, hours = 0) => `datetime('now', '-${days} days', '-${hours} hours')`;
// An interview time: `days` from today at `hour`:00 UTC, as ISO.
const at = (days: number, hour: number) =>
	`strftime('%Y-%m-%dT%H:%M:%SZ', 'now', 'start of day', '${days >= 0 ? "+" : ""}${days} days', '+${hour} hours')`;
const malaysianCity = (name: string) =>
	`(SELECT c.id FROM cities c JOIN states s ON s.id = c.state_id WHERE c.name = ${q(name)} AND s.country_id = 132 LIMIT 1)`;
const stateOf = (city: string) => `(SELECT state_id FROM cities WHERE id = ${malaysianCity(city)})`;

const REMOVE = `
DELETE FROM saved_job WHERE id LIKE 'sample-%';
DELETE FROM interviews WHERE id LIKE 'sample-%';
DELETE FROM application_stages WHERE id LIKE 'sample-%';
DELETE FROM application WHERE id LIKE 'sample-%';
DELETE FROM job_skills WHERE id LIKE 'sample-%';
DELETE FROM job WHERE id LIKE 'sample-%';
DELETE FROM jobseeker_profile WHERE id LIKE 'sample-%';
DELETE FROM user WHERE id LIKE 'sample-%';
DELETE FROM organization WHERE id LIKE 'sample-%';
`;

type SampleJob = {
	id: string;
	title: string;
	city: string;
	industry: string;
	employmentType: string;
	workArrangement: string;
	salary: [number, number];
	salaryType: string;
	experienceTypeId: number;
	status: string;
	views: number;
	postedDaysAgo: number;
	skills: string[];
};

const JOBS: SampleJob[] = [
	{ id: "sample-job-1", title: "Senior Graphic Designer", city: "Petaling Jaya", industry: "Advertising & Arts & Media", employmentType: "full_time", workArrangement: "hybrid", salary: [4500, 6500], salaryType: "Monthly", experienceTypeId: 5, status: "published", views: 412, postedDaysAgo: 30, skills: ["Adobe Suite", "Digital Marketing", "Collaboration"] },
	{ id: "sample-job-2", title: "Customer Service Executive", city: "Shah Alam", industry: "BPO & Call Center", employmentType: "full_time", workArrangement: "onsite", salary: [2800, 3500], salaryType: "Monthly", experienceTypeId: 4, status: "published", views: 268, postedDaysAgo: 21, skills: ["Customer Service", "Call Centre", "English Language", "MS Office"] },
	{ id: "sample-job-3", title: "Account Manager", city: "Cyberjaya", industry: "Business Service", employmentType: "full_time", workArrangement: "hybrid", salary: [5000, 7000], salaryType: "Monthly", experienceTypeId: 5, status: "published", views: 190, postedDaysAgo: 14, skills: ["Account Management", "Salesforce", "Sales Pipeline"] },
	{ id: "sample-job-4", title: "Part-time Retail Assistant", city: "Subang Jaya", industry: "Apparel", employmentType: "part_time", workArrangement: "onsite", salary: [12, 15], salaryType: "Hourly", experienceTypeId: 1, status: "published", views: 95, postedDaysAgo: 7, skills: ["Customer Oriented", "Team Player"] },
	{ id: "sample-job-5", title: "Marketing Intern", city: "Petaling Jaya", industry: "Advertising & Arts & Media", employmentType: "internship", workArrangement: "onsite", salary: [1000, 1200], salaryType: "Monthly", experienceTypeId: 2, status: "pending", views: 0, postedDaysAgo: 1, skills: ["Digital Marketing", "TikTok"] },
	{ id: "sample-job-6", title: "Operations Lead", city: "Johor Bahru", industry: "Automotive", employmentType: "full_time", workArrangement: "onsite", salary: [6000, 8500], salaryType: "Monthly", experienceTypeId: 6, status: "rejected", views: 12, postedDaysAgo: 3, skills: ["Project Management", "Budgeting", "Scheduling"] },
];

type SampleApplicant = {
	n: number;
	name: string;
	skills: string[];
	years: number;
	industry: string;
	workArrangement: string;
	jobType: string;
};

const APPLICANTS: SampleApplicant[] = [
	{ n: 1, name: "Nur Aisyah Binti Rahman", skills: ["Adobe Suite", "Digital Marketing", "Collaboration"], years: 6, industry: "Advertising & Arts & Media", workArrangement: "hybrid", jobType: "full_time" },
	{ n: 2, name: "Tan Wei Ming", skills: ["Adobe Suite", "Problem Solving"], years: 2, industry: "Advertising & Arts & Media", workArrangement: "onsite", jobType: "full_time" },
	{ n: 3, name: "Priya Devi", skills: ["Customer Service", "Call Centre", "English Language"], years: 3, industry: "BPO & Call Center", workArrangement: "onsite", jobType: "full_time" },
	{ n: 4, name: "Muhammad Hafiz", skills: ["Customer Service", "MS Office"], years: 1, industry: "Retail", workArrangement: "onsite", jobType: "full_time" },
	{ n: 5, name: "Lim Mei Ling", skills: ["Account Management", "Salesforce", "Sales Pipeline"], years: 7, industry: "Business Service", workArrangement: "hybrid", jobType: "full_time" },
	{ n: 6, name: "Ahmad Zaki", skills: ["Sales Pitching and Closure", "People Skills"], years: 4, industry: "Business Service", workArrangement: "remote", jobType: "contract" },
	{ n: 7, name: "Siti Nurhaliza", skills: ["Customer Oriented", "Team Player"], years: 0, industry: "Apparel", workArrangement: "onsite", jobType: "part_time" },
	{ n: 8, name: "Rajesh Kumar", skills: ["Adobe Suite", "Collaboration", "Digital Marketing"], years: 5, industry: "Advertising & Arts & Media", workArrangement: "hybrid", jobType: "full_time" },
];

type SampleApplication = {
	id: string;
	applicant: number | "jobseeker";
	job: string;
	appliedDaysAgo: number;
	// v1 stage rows after "received": [stage name, days ago].
	stages: [string, number][];
	status: string;
	interview?: { inDays: number; hour: number; type: string; response?: string; result?: string };
};

const APPLICATIONS: SampleApplication[] = [
	{ id: "sample-app-1", applicant: 1, job: "sample-job-1", appliedDaysAgo: 12, stages: [["screened", 11], ["shortlisted", 9], ["scheduled", 8]], status: "scheduled", interview: { inDays: 1, hour: 2, type: "online" } },
	{ id: "sample-app-2", applicant: 2, job: "sample-job-1", appliedDaysAgo: 1, stages: [], status: "received" },
	{ id: "sample-app-3", applicant: 8, job: "sample-job-1", appliedDaysAgo: 25, stages: [["screened", 24], ["shortlisted", 22], ["scheduled", 20], ["interviewed", 18], ["passed", 15]], status: "passed" },
	{ id: "sample-app-4", applicant: 3, job: "sample-job-2", appliedDaysAgo: 18, stages: [["screened", 17], ["scheduled", 15], ["interviewed", 12]], status: "interviewed" },
	{ id: "sample-app-5", applicant: 4, job: "sample-job-2", appliedDaysAgo: 5, stages: [], status: "received" },
	{ id: "sample-app-6", applicant: 5, job: "sample-job-3", appliedDaysAgo: 10, stages: [["screened", 9], ["shortlisted", 8], ["scheduled", 6]], status: "scheduled", interview: { inDays: 3, hour: 6, type: "physical", response: "reschedule_requested" } },
	{ id: "sample-app-7", applicant: 6, job: "sample-job-3", appliedDaysAgo: 9, stages: [["screened", 8], ["kiv", 7]], status: "kiv" },
	{ id: "sample-app-8", applicant: 7, job: "sample-job-4", appliedDaysAgo: 6, stages: [["screened", 5], ["shortlisted", 4], ["offer", 4]], status: "offer" },
	{ id: "sample-app-9", applicant: 4, job: "sample-job-4", appliedDaysAgo: 4, stages: [["rejected", 3]], status: "rejected" },
	{ id: "sample-app-10", applicant: 3, job: "sample-job-3", appliedDaysAgo: 15, stages: [["screened", 14], ["scheduled", 11], ["interviewed", 9], ["evaluation", 8]], status: "evaluation" },
	// The JOBSEEKER_EMAIL person's own applications.
	{ id: "sample-app-js-1", applicant: "jobseeker", job: "sample-job-1", appliedDaysAgo: 8, stages: [["screened", 7], ["shortlisted", 5], ["scheduled", 4]], status: "scheduled", interview: { inDays: 2, hour: 3, type: "online" } },
	{ id: "sample-app-js-2", applicant: "jobseeker", job: "sample-job-2", appliedDaysAgo: 4, stages: [["screened", 3]], status: "screened" },
	{ id: "sample-app-js-3", applicant: "jobseeker", job: "sample-job-3", appliedDaysAgo: 2, stages: [], status: "received" },
];

function buildSql(employerEmail: string | undefined, jobseekerEmail: string | undefined) {
	const sql: string[] = [REMOVE];
	const userByEmail = (email: string) => `(SELECT id FROM user WHERE email = ${q(email)} LIMIT 1)`;
	let orgId: string;
	if (employerEmail) {
		orgId = `(SELECT m.organization_id FROM member m JOIN user u ON u.id = m.user_id WHERE u.email = ${q(employerEmail)} AND m.status = 'active' ORDER BY m.created_at LIMIT 1)`;
	} else {
		sql.push(
			`INSERT INTO organization (id, legal_name, display_name, status) VALUES ('sample-org', 'Maju Jaya Sdn Bhd (sample)', 'Maju Jaya (sample)', 'approved');`,
		);
		orgId = q("sample-org");
	}
	const createdBy = employerEmail ? userByEmail(employerEmail) : "NULL";

	for (const j of JOBS) {
		sql.push(`INSERT INTO job (id, organization_id, title, description, industry_id, country_id, state_id, city_id,
  employment_type, work_arrangement, work_eligibility, location_type, salary_min, salary_max, salary_type_id, currency_type_id,
  salary_currency, experience_type_id, status, is_active, views, created_by_id, published_at, created_at, updated_at)
VALUES (${q(j.id)}, ${orgId}, ${q(j.title)}, ${q(`<p>Sample job for the dashboards: ${j.title}.</p>`)},
  (SELECT id FROM industries WHERE name = ${q(j.industry)} LIMIT 1), 132, ${stateOf(j.city)}, ${malaysianCity(j.city)},
  ${q(j.employmentType)}, ${q(j.workArrangement)}, 'local', ${q(j.workArrangement === "remote" ? "remote" : "onsite")},
  ${j.salary[0]}, ${j.salary[1]}, (SELECT id FROM salary_types WHERE name = ${q(j.salaryType)}), 1, 'MYR', ${j.experienceTypeId},
  ${q(j.status)}, 1, ${j.views}, ${createdBy}, ${j.status === "published" ? ago(j.postedDaysAgo) : "NULL"}, ${ago(j.postedDaysAgo)}, ${ago(j.postedDaysAgo)});`);
		j.skills.forEach((skill, i) => {
			sql.push(
				`INSERT INTO job_skills (id, job_id, skill_id) SELECT ${q(`sample-${j.id}-skill-${i}`)}, ${q(j.id)}, id FROM skills WHERE name = ${q(skill)} LIMIT 1;`,
			);
		});
	}

	for (const a of APPLICANTS) {
		const userId = `sample-applicant-${a.n}`;
		sql.push(
			`INSERT INTO user (id, full_name, email, email_verified) VALUES (${q(userId)}, ${q(a.name)}, ${q(`${userId}@example.com`)}, 1);`,
			`INSERT INTO jobseeker_profile (id, user_id, full_name, city, state, location, job_title, preferred_industry, years_experience,
  professional_skills, desired_job_type, work_arrangement, work_eligibility)
VALUES (${q(`sample-profile-${a.n}`)}, ${q(userId)}, ${q(a.name)}, 'Petaling Jaya', 'Selangor', 'Petaling Jaya, Selangor', NULL,
  ${q(a.industry)}, ${a.years}, ${q(JSON.stringify(a.skills))}, ${q(a.jobType)}, ${q(a.workArrangement)}, 'citizen');`,
		);
	}

	for (const app of APPLICATIONS) {
		if (app.applicant === "jobseeker" && !jobseekerEmail) continue;
		const userId = app.applicant === "jobseeker" ? userByEmail(jobseekerEmail!) : q(`sample-applicant-${app.applicant}`);
		const lastChange = app.stages.at(-1)?.[1] ?? app.appliedDaysAgo;
		sql.push(`INSERT INTO application (id, user_id, job_id, status, date_applied, created_at, updated_at)
VALUES (${q(app.id)}, ${userId}, ${q(app.job)}, ${q(app.status)}, ${ago(app.appliedDaysAgo)}, ${ago(app.appliedDaysAgo)}, ${ago(lastChange)});`);
		const stages: [string, number][] = [["received", app.appliedDaysAgo], ...app.stages];
		stages.forEach(([stage, days], i) => {
			sql.push(`INSERT INTO application_stages (id, application_id, stage_id, stage_name, status, created_at, updated_at)
VALUES (${q(`${app.id}-stage-${i}`)}, ${q(app.id)}, (SELECT id FROM stages WHERE name = ${q(stage)}), ${q(stage)},
  ${q(i === stages.length - 1 ? "active" : "completed")}, ${ago(days, 1)}, ${ago(days, 1)});`);
		});
		if (app.interview) {
			const i = app.interview;
			sql.push(`INSERT INTO interviews (id, candidate_id, job_id, application_id, scheduled_at, interview_duration, interview_type,
  result, candidate_response)
VALUES (${q(`${app.id}-interview`)}, ${userId}, ${q(app.job)}, ${q(app.id)}, ${at(i.inDays, i.hour)}, 45, ${q(i.type)},
  ${q(i.result ?? "pending")}, ${q(i.response ?? "pending")});`);
		}
	}

	if (jobseekerEmail) {
		sql.push(
			`INSERT INTO saved_job (id, job_id, user_id) VALUES ('sample-saved-1', 'sample-job-4', ${userByEmail(jobseekerEmail)});`,
		);
	}
	return sql.join("\n");
}

async function seed() {
	const target = targetFromArgs();
	if (process.argv.includes("--remove")) {
		await target.runSql(REMOVE);
		console.log(`Removed the sample rows from ${target.label}.`);
		return;
	}
	if ((await target.count("cities")) === 0) {
		console.error("Run `bun run seed:local` first — the sample jobs use v1's cities, skills and salary types.");
		process.exit(1);
	}
	const employerEmail = process.env.EMPLOYER_EMAIL?.trim() || undefined;
	const jobseekerEmail = process.env.JOBSEEKER_EMAIL?.trim() || undefined;
	if (employerEmail) {
		const org = await target.value(
			`SELECT m.organization_id AS v FROM member m JOIN user u ON u.id = m.user_id WHERE u.email = ${q(employerEmail)} AND m.status = 'active' LIMIT 1`,
		);
		if (!org) {
			console.error(`${employerEmail} has no company yet — finish employer onboarding with it first.`);
			process.exit(1);
		}
	}
	if (jobseekerEmail && !(await target.value(`SELECT id AS v FROM user WHERE email = ${q(jobseekerEmail)}`))) {
		console.error(`No account with ${jobseekerEmail} — sign up with it first.`);
		process.exit(1);
	}
	await target.runSql(buildSql(employerEmail, jobseekerEmail));
	console.log(`Added sample data to ${target.label}:`);
	console.log(`  ${JOBS.length} jobs for ${employerEmail ? `${employerEmail}'s company` : "a sample company"}`);
	console.log(`  ${APPLICANTS.length} sample applicants, ${APPLICATIONS.filter((a) => a.applicant !== "jobseeker").length} applications, interviews`);
	if (jobseekerEmail) console.log(`  3 applications and 1 saved job for ${jobseekerEmail}`);
	console.log("Remove it all with: bun run seed:sample:local -- --remove");
}

seed().catch((error) => {
	console.error("Seed failed:", error);
	process.exit(1);
});
