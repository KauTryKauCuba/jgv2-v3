import {
	invitation,
	jobseekerCertification,
	jobseekerEducation,
	jobseekerProfile,
	jobseekerProfileLanguage,
	jobseekerWorkingExperience,
	member,
	organization,
	organizationAddress,
	user,
} from "@jobgiga-app/db/schema/auth";
import { CANDIDATE_RESPONSE, INTERVIEW_RESULT, interviewPanel, interviews } from "@jobgiga-app/db/schema/interviews";
import { application, applicationFeedback, applicationStages, job, JOB_STATUS, jobHiringManagers } from "@jobgiga-app/db/schema/jobs";
import { and, eq, inArray, like } from "drizzle-orm";
import { type PipelineStatus, toV1ApplicationStatus } from "../../shared/application-status";
import { INDUSTRIES } from "../../shared/industries";
import { toMalaysianMobileE164 } from "../../shared/phone";
import { V1_MEMBER_FOR_ROLE } from "../../shared/team-roles";
import { formatPlace } from "../../shared/work-locations";
import { benefitStatements, jobValuesFrom, skillStatements, uniqueJobSlug } from "../jobs/posting";
import { parsePostingBody } from "../jobs/posting-input";
import type { Storage } from "../storage/types";
import {
	buildDummyApplicantProfile,
	cityStateForDummyLocation,
	DUMMY_APPLICANT_EMAIL_DOMAIN,
	DUMMY_APPLICANTS,
	dummyPreferredWorkPlaces,
	ROLE_INDUSTRY,
} from "./applicants";
import { DUMMY_COMPANIES, seedLoginEmail } from "./companies";
import { DUMMY_JOB_POSTINGS } from "./postings";
import { buildDummyTeamEmail, buildDummyTeamLoginEmail, DUMMY_TEAM_ROSTER, slugifyName } from "./team";

// The redesign's "Sample data" (My Profile's DummyDataCard and the routes it
// calls: api/employer/{job-postings,team,applications}/dummy and
// api/employer/dummy-companies) on v1's tables:
// - postings   → `job` (+ job_skills, job_benefits), saved through Post a
//                job's own helpers (lib/jobs/posting*.ts)
// - teammates  → `member` (+ `invitation` for the pending ones, a placeholder
//                `user` for the joined ones), Hiring managers' jobs in
//                job_hiring_managers
// - applicants → a jobseeker each (`user` + `jobseeker_profile` and its
//                child tables) with an `application`, a row in
//                application_stages for every move, `interviews` +
//                `interview_panel` for anyone who got that far, and the
//                panel's scorecards in application_feedback
// - demo companies → two `organization`s registered by sample owner accounts,
//                with the user on their team
//
// How "Remove" finds exactly these rows: every one of them has an id starting
// with "sample-" (like the CLI seed's rows), and on top of that each kind is
// looked up the redesign's way, scoped to the current company — postings and
// teammates by the company's own id, applicants by an email that carries the
// company's id (applicant1.<company id>@dummy-applicant.jobgiga.test), demo
// companies by the user's own membership. Nothing without the prefix is ever
// deleted, so a company's real postings, applicants and team are untouched.
//
// Not ported (v3 doesn't have them): video pitches, AI interviews, screening
// answers and notifications. The redesign's postingName marker "__dummy__"
// isn't set either — v3's Post a job form shows that field.
//
// D1 rules: writes go through db.batch() (no transactions), id lists through
// chunks of at most 100 bound values, dates are read inside the functions.

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

export type SampleDataContext = {
	db: AnyDb;
	storage?: Storage;
	userId: string;
	organizationId: string;
	companyName: string;
};

export const SAMPLE_ID_PREFIX = "sample-";
const SAMPLE_LIKE = `${SAMPLE_ID_PREFIX}%`;
const sampleId = () => `${SAMPLE_ID_PREFIX}${crypto.randomUUID()}`;

/** A sample row's id — never a real one's. */
export function isSampleId(id: string | null | undefined): boolean {
	return typeof id === "string" && id.startsWith(SAMPLE_ID_PREFIX);
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// SQLite's datetime('now') format, matching v1's text timestamps.
const sqliteTime = (date: Date) => date.toISOString().replace("T", " ").slice(0, 19);

// D1 caps a statement at 100 bound values (so lists are chunked) and a batch
// is one round trip — large enough to be quick, small enough to stay light.
const ID_CHUNK = 90;
const BATCH_SIZE = 80;

function chunks<T>(list: T[], size = ID_CHUNK): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
	return out;
}

async function runBatches(db: AnyDb, queries: unknown[]) {
	for (const part of chunks(queries, BATCH_SIZE)) {
		if (part.length > 0) await db.batch(part);
	}
}

// ── Whether the company has sample data ───────────────────────────────────

/** The redesign's companyHasSampleData: any sample posting, teammate or applicant. */
export async function companyHasSampleData(db: AnyDb, organizationId: string): Promise<boolean> {
	const [postingRows, teammateRows, applicantRows] = (await Promise.all([
		db
			.select({ id: job.id })
			.from(job)
			.where(and(eq(job.organizationId, organizationId), like(job.id, SAMPLE_LIKE)))
			.limit(1),
		db
			.select({ id: member.id })
			.from(member)
			.where(and(eq(member.organizationId, organizationId), like(member.id, SAMPLE_LIKE)))
			.limit(1),
		db
			.select({ id: user.id })
			.from(user)
			.where(and(like(user.id, SAMPLE_LIKE), like(user.email, applicantEmailPattern(organizationId))))
			.limit(1),
	])) as AnyDb[][];
	return Boolean(postingRows?.[0] || teammateRows?.[0] || applicantRows?.[0]);
}

// ── Job postings ───────────────────────────────────────────────────────────

/** The redesign's deleteDummyPostings. Their skills, benefits, hiring managers and applications go with them. */
export async function removeSamplePostings(ctx: SampleDataContext) {
	await ctx.db.delete(job).where(and(eq(job.organizationId, ctx.organizationId), like(job.id, SAMPLE_LIKE)));
}

/**
 * The redesign's POST /api/employer/job-postings/dummy: every sample posting,
 * saved as Post a job saves one, with whoever added them as each one's
 * "Posted by" contact. Leftovers from an earlier run are cleared first, so a
 * second click never piles up duplicates.
 */
export async function addSamplePostings(ctx: SampleDataContext) {
	const { db, userId, organizationId } = ctx;
	await removeSamplePostings(ctx);
	const now = new Date();
	const queries: unknown[] = [];
	for (const [index, p] of DUMMY_JOB_POSTINGS.entries()) {
		const { status, ...body } = p as typeof p & { rejectionReason?: string; flagReason?: string };
		// Post a job's own checks and clean-up ("pending" = a complete posting).
		const parsed = parsePostingBody({ ...body, status: "pending" } as Record<string, unknown>, { mode: "create" });
		if (!parsed.ok) throw new Error(`Sample posting "${p.title}": ${parsed.error}`);
		const f = parsed.fields;
		// The redesign saves each posting's requirements as written, screening
		// or not — Post a job drops them when screening is off.
		const raw = p as Record<string, unknown>;
		f.minYearsExperience = (raw.minYearsExperience as number | undefined) ?? null;
		f.minQualificationTier = (raw.minQualificationTier as string | undefined) ?? null;
		f.workAuthorizations = (raw.workAuthorizations as string[] | undefined) ?? [];
		f.drivingLicense = (raw.drivingLicense as string | undefined) ?? null;
		f.customScreeningQuestions = (raw.customScreeningQuestions as unknown[] | undefined) ?? [];
		f.screeningPreferred = (raw.screeningPreferred as string[] | undefined) ?? [];
		f.status = status;
		f.contactUserId = userId;

		const id = sampleId();
		const values = await jobValuesFrom(db, f);
		const slug = await uniqueJobSlug(db, ctx.companyName, p.title);
		const [skillsQ, benefitsQ] = await Promise.all([
			skillStatements(db, id, f.skills ?? []),
			benefitStatements(db, id, organizationId, f.benefits ?? []),
		]);
		// Newest first on Manage Job, in the redesign's order.
		const createdAt = sqliteTime(new Date(now.getTime() - index * 60 * 1000));
		queries.push(
			db.insert(job).values({
				...values,
				id,
				organizationId,
				slug,
				createdById: userId,
				publishedAt: values.status === JOB_STATUS.PUBLISHED ? createdAt : null,
				rejectionReason: (raw.rejectionReason as string | undefined) ?? null,
				flagReason: (raw.flagReason as string | undefined) ?? null,
				flaggedAt: raw.flagReason ? createdAt : null,
				createdAt,
				updatedAt: createdAt,
			}),
			...skillsQ,
			...benefitsQ,
		);
	}
	await runBatches(db, queries);
	return DUMMY_JOB_POSTINGS.length;
}

// ── Team ──────────────────────────────────────────────────────────────────

/** The redesign's deleteDummyTeam: the sample teammates, their invites and placeholder accounts. */
export async function removeSampleTeam(ctx: SampleDataContext) {
	const { db, organizationId } = ctx;
	const rows = (await db
		.select({ userId: member.userId })
		.from(member)
		.where(and(eq(member.organizationId, organizationId), like(member.id, SAMPLE_LIKE)))) as { userId: string | null }[];
	const userIds = rows.map((r) => r.userId).filter((id): id is string => isSampleId(id));
	await runBatches(db, [
		db.delete(member).where(and(eq(member.organizationId, organizationId), like(member.id, SAMPLE_LIKE))),
		db.delete(invitation).where(and(eq(invitation.organizationId, organizationId), like(invitation.id, SAMPLE_LIKE))),
		...chunks(userIds).map((chunk) => db.delete(user).where(and(inArray(user.id, chunk), like(user.id, SAMPLE_LIKE)))),
	]);
}

/** One roster entry's rows: a joined member with a placeholder account, or a pending invite. */
function rosterStatements(
	db: AnyDb,
	opts: {
		organizationId: string;
		inviterId: string;
		entry: (typeof DUMMY_TEAM_ROSTER)[number];
		displayEmail: string;
		loginEmail: string;
		createdAt: string;
		expiresAt: string;
	},
) {
	const { entry } = opts;
	const role = entry.role ?? "admin";
	const v1 = V1_MEMBER_FOR_ROLE[role];
	const memberId = sampleId();
	if (entry.status === "active") {
		const accountId = sampleId();
		return {
			memberId,
			queries: [
				db.insert(user).values({ id: accountId, name: entry.name, email: opts.loginEmail, image: entry.avatarUrl, createdAt: opts.createdAt }),
				db.insert(member).values({
					id: memberId,
					organizationId: opts.organizationId,
					userId: accountId,
					name: entry.name,
					email: opts.displayEmail,
					role: v1.role,
					accessLevel: v1.accessLevel,
					status: "active",
					contactRole: entry.hiringRole ?? null,
					positionTitle: entry.position,
					phoneNumber: entry.phone ?? null,
					profileCompletedAt: opts.createdAt,
					createdAt: opts.createdAt,
				}),
			],
		};
	}
	const invitationId = sampleId();
	return {
		memberId,
		queries: [
			// No token: a sample invite can't be opened or accepted.
			db.insert(invitation).values({
				id: invitationId,
				organizationId: opts.organizationId,
				email: opts.displayEmail,
				role,
				position: entry.position,
				status: "pending",
				inviterId: opts.inviterId,
				expiresAt: opts.expiresAt,
				tokenHash: null,
				createdAt: opts.createdAt,
			}),
			db.insert(member).values({
				id: memberId,
				organizationId: opts.organizationId,
				userId: null,
				email: opts.displayEmail,
				role: v1.role,
				accessLevel: v1.accessLevel,
				positionTitle: entry.position,
				invitationId,
				status: "pending",
				createdAt: opts.createdAt,
			}),
		],
	};
}

/**
 * The redesign's POST /api/employer/team/dummy: the 10-person sample roster,
 * with each sample Hiring manager assigned to the sample postings in their
 * own area (never to the company's real jobs).
 */
export async function addSampleTeam(ctx: SampleDataContext) {
	const { db, organizationId, userId } = ctx;
	await removeSampleTeam(ctx);
	const now = Date.now();
	const expiresAt = new Date(now + 7 * DAY_MS).toISOString();
	const postings = (await db
		.select({ id: job.id, title: job.title })
		.from(job)
		.where(and(eq(job.organizationId, organizationId), like(job.id, SAMPLE_LIKE)))) as { id: string; title: string }[];

	const queries: unknown[] = [];
	for (const [index, entry] of DUMMY_TEAM_ROSTER.entries()) {
		const slug = slugifyName(entry.name);
		const { memberId, queries: rows } = rosterStatements(db, {
			organizationId,
			inviterId: userId,
			entry,
			displayEmail: buildDummyTeamEmail(slug),
			loginEmail: buildDummyTeamLoginEmail(slug, organizationId),
			// A second apart, so the Team page lists them in the roster's order.
			createdAt: sqliteTime(new Date(now - (DUMMY_TEAM_ROSTER.length - index) * 1000)),
			expiresAt,
		});
		queries.push(...rows);
		if (entry.role === "hiring_manager") {
			for (const posting of postings.filter((p) => entry.jobTitles?.includes(p.title))) {
				queries.push(db.insert(jobHiringManagers).values({ id: sampleId(), jobId: posting.id, memberId }));
			}
		}
	}
	await runBatches(db, queries);
}

// ── Applicants ────────────────────────────────────────────────────────────

function applicantEmailPattern(organizationId: string) {
	return `%.${organizationId}@${DUMMY_APPLICANT_EMAIL_DOMAIN}`;
}

/**
 * The redesign's deleteDummyApplicants: the sample jobseekers this company's
 * "Add sample data" created — their accounts, profiles and everything that
 * hangs off them (applications, stage history, interviews and panels,
 * scorecards). Their photos are external links, so there are no files.
 */
export async function removeSampleApplicants(ctx: SampleDataContext) {
	const { db, organizationId } = ctx;
	const rows = (await db
		.select({ id: user.id })
		.from(user)
		.where(and(like(user.id, SAMPLE_LIKE), like(user.email, applicantEmailPattern(organizationId))))) as { id: string }[];
	const ids = rows.map((r) => r.id);
	if (ids.length === 0) return;
	await runBatches(
		db,
		chunks(ids).flatMap((chunk) => [
			db.delete(application).where(and(inArray(application.userId, chunk), like(application.id, SAMPLE_LIKE))),
			db.delete(jobseekerProfile).where(and(inArray(jobseekerProfile.userId, chunk), like(jobseekerProfile.id, SAMPLE_LIKE))),
			db.delete(user).where(and(inArray(user.id, chunk), like(user.id, SAMPLE_LIKE))),
		]),
	);
}

// Roughly how many days ago an application at this stage would realistically
// have come in (the redesign's STAGE_DAYS_AGO).
const STAGE_DAYS_AGO: Record<string, number> = {
	applied: 2,
	screened: 5,
	shortlisted: 8,
	interview: 6,
	interviewed: 10,
	evaluation: 11,
	evaluated: 12,
	kiv: 18,
	offer: 15,
	hired: 21,
	rejected: 14,
};

function appliedAtFor(status: string, index: number, now: number): Date {
	return new Date(now - ((STAGE_DAYS_AGO[status] ?? 3) + (index % 4)) * DAY_MS);
}

// Hired some days after they applied — never 0 days to hire.
function hiredAtFor(appliedAt: Date, index: number): Date {
	return new Date(appliedAt.getTime() + (3 + (index % 6)) * DAY_MS);
}

// Upcoming interviews one a day (wrapping after 28 days) at a rotating
// Malaysia-time slot; ones that already happened 1–8 days ago.
const INTERVIEW_HOURS = [9, 11, 14, 16] as const;
const MEETING_LINK = "https://meet.google.com/dummy-interview";

function interviewTime(scheduleIndex: number, past: boolean, now: number): Date {
	const days = past ? -(1 + (scheduleIndex % 8)) : scheduleIndex % 28;
	const hour = INTERVIEW_HOURS[scheduleIndex % INTERVIEW_HOURS.length] ?? 9;
	// Today's date in Malaysia (UTC+8), then that hour there.
	const myt = new Date(now + 8 * HOUR_MS);
	return new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), myt.getUTCDate() + days, hour - 8));
}

// One interviewer's scorecard — varied per panelist and candidate.
const SCORE_SETS = [
	{ communication: 4, technicalSkill: 4, problemSolving: 3, cultureFit: 4, roleKnowledge: 4 },
	{ communication: 5, technicalSkill: 4, problemSolving: 4, cultureFit: 5, roleKnowledge: 4 },
	{ communication: 3, technicalSkill: 4, problemSolving: 4, cultureFit: 3, roleKnowledge: 3 },
	{ communication: 4, technicalSkill: 5, problemSolving: 5, cultureFit: 4, roleKnowledge: 5 },
] as const;
const RECOMMENDATIONS = ["hire", "strong_hire", "hire", "no_hire"] as const;
const EVALUATION_NOTES = [
	"Clear communicator — walked through past work confidently.",
	"Strong problem solving; would ramp up quickly.",
	"Good fundamentals, a little light on hands-on depth.",
	"Solid all-round candidate, good culture fit.",
];

// The steps each application went through after "applied", in order — one
// application_stages row each, as the Applicants page's moves write them.
// Offers and hires came straight from the shortlist (the redesign gives
// them no interview).
function stepsTo(status: PipelineStatus, round: number): PipelineStatus[] {
	const toShortlist: PipelineStatus[] = ["screened", "shortlisted"];
	const earlierRound: PipelineStatus[] = round > 1 ? ["interview", "interviewed"] : [];
	switch (status) {
		case "applied":
			return [];
		case "screened":
			return ["screened"];
		case "shortlisted":
			return toShortlist;
		case "interview":
			return [...toShortlist, ...earlierRound, "interview"];
		case "interviewed":
			return [...toShortlist, ...earlierRound, "interview", "interviewed"];
		case "evaluation":
			return [...toShortlist, ...earlierRound, "interview", "interviewed", "evaluation"];
		case "evaluated":
			return [...toShortlist, ...earlierRound, "interview", "interviewed", "evaluation", "evaluated"];
		case "kiv":
			return ["screened", "kiv"];
		case "offer":
			return [...toShortlist, "offer"];
		case "hired":
			return [...toShortlist, "offer", "hired"];
		case "rejected":
			return ["screened", "rejected"];
		case "withdrawn":
			return ["withdrawn"];
	}
	return [];
}

/** `count` moments evenly between two times (exclusive). */
function spread(count: number, from: number, to: number): number[] {
	const end = Math.max(to, from + (count + 1) * 60 * 1000);
	return Array.from({ length: count }, (_, k) => from + ((k + 1) * (end - from)) / (count + 1));
}

type Timeline = { steps: { step: PipelineStatus; at: Date }[]; round1At: Date | null };

/**
 * When each move happened: before the interview it was set up for, after
 * the one it follows, never in the future, and hires on hiredAtFor.
 */
function timelineFor(opts: {
	status: PipelineStatus;
	round: number;
	appliedAt: Date;
	interviewAt: Date | null;
	index: number;
	now: number;
}): Timeline {
	const { status, round, appliedAt, interviewAt, index, now } = opts;
	const steps = stepsTo(status, round);
	const applied = appliedAt.getTime();
	const latest = now - 30 * 60 * 1000;
	const times: number[] = [];

	if (!interviewAt) {
		if (status === "hired") {
			const hired = Math.min(hiredAtFor(appliedAt, index).getTime(), latest);
			times.push(...spread(steps.length - 1, applied, hired), hired);
		} else {
			const end = Math.min(latest, applied + (1 + (index % 3)) * DAY_MS);
			times.push(...spread(steps.length, applied, end));
		}
		return { steps: steps.map((step, k) => ({ step, at: new Date(times[k]!) })), round1At: null };
	}

	const final = interviewAt.getTime();
	const lastInterviewStep = steps.lastIndexOf("interview");
	// Round 1 (when this is round 2) sits halfway between applying and round 2.
	const round1At = round > 1 ? applied + (Math.min(final, latest) - applied) / 2 : null;
	const scheduledBy = Math.min(latest, final - DAY_MS);
	if (round1At !== null) {
		// screened, shortlisted, interview → before round 1; interviewed just after it.
		times.push(...spread(3, applied, Math.min(round1At - DAY_MS / 2, latest)));
		times.push(Math.min(round1At + 2 * HOUR_MS, latest));
		// Round 2 set up a day after round 1.
		times.push(Math.min(round1At + DAY_MS, scheduledBy));
	} else {
		times.push(...spread(lastInterviewStep + 1, applied, scheduledBy));
	}
	// After the interview: attendance marked 2 hours later, evaluation started
	// an hour after that, completed the next day.
	const after = [2 * HOUR_MS, 3 * HOUR_MS, DAY_MS];
	for (let k = lastInterviewStep + 1; k < steps.length; k++) {
		times.push(Math.min(final + after[k - lastInterviewStep - 1]!, latest));
	}
	// Never out of order.
	for (let k = 1; k < times.length; k++) times[k] = Math.max(times[k]!, times[k - 1]! + 1000);
	return {
		steps: steps.map((step, k) => ({ step, at: new Date(times[k]!) })),
		round1At: round1At === null ? null : new Date(round1At),
	};
}

/**
 * The redesign's POST /api/employer/applications/dummy: each sample
 * applicant as a jobseeker with an application to the sample posting for
 * their role (or, when that one isn't live, one of the live ones in turn),
 * with interviews, panels and scorecards for anyone at those stages.
 */
export async function addSampleApplicants(ctx: SampleDataContext): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
	const { db, organizationId, userId } = ctx;
	const now = Date.now();
	const allPostings = (await db
		.select({ id: job.id, title: job.title, status: job.status })
		.from(job)
		.where(and(eq(job.organizationId, organizationId), like(job.id, SAMPLE_LIKE)))) as { id: string; title: string; status: string }[];
	if (allPostings.length === 0) return { ok: false, error: "Post a job first, then add dummy applicants." };
	// Only live postings can have applicants — in the redesign's order.
	const order = (title: string) => DUMMY_JOB_POSTINGS.findIndex((p) => p.title === title);
	const postings = allPostings
		.filter((p) => p.status === JOB_STATUS.PUBLISHED)
		.sort((a, b) => order(a.title) - order(b.title));
	if (postings.length === 0) return { ok: false, error: "You need at least one active job posting first." };

	await removeSampleApplicants(ctx);

	// Interview panels: whoever is adding the sample data, plus the joined
	// sample teammates who work on that job (the roster's jobTitles).
	const [me] = (await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).limit(1)) as AnyDb[];
	const members = (await db
		.select({ id: member.id, userId: member.userId, email: member.email, name: member.name, status: member.status })
		.from(member)
		.where(eq(member.organizationId, organizationId))) as {
		id: string;
		userId: string | null;
		email: string | null;
		name: string | null;
		status: string;
	}[];
	const memberIdOf = new Map(members.filter((m) => m.userId).map((m) => [m.userId as string, m.id]));
	const sampleTeammates = members.filter((m) => isSampleId(m.id) && m.status === "active" && m.userId);
	function panelFor(jobTitle: string): { userId: string; name: string }[] {
		const panel = [{ userId, name: (me?.name as string) || (me?.email as string) || "Interviewer" }];
		for (const teammate of sampleTeammates) {
			const roster = DUMMY_TEAM_ROSTER.find((m) => buildDummyTeamEmail(slugifyName(m.name)) === teammate.email);
			if (roster?.jobTitles?.includes(jobTitle)) panel.push({ userId: teammate.userId as string, name: teammate.name ?? roster.name });
		}
		return panel;
	}

	const postingsByTitle = new Map(postings.map((p) => [p.title, p]));
	// Cycled per stage so every reply/attendance state on Interviews shows up.
	const INTERVIEW_STAGE_RESPONSES = ["accepted", "pending", "declined", "reschedule_requested"] as const;
	const PAST_INTERVIEW_RESPONSES = ["attended", "attended", "attended", "no_show"] as const;
	let interviewStageIndex = 0;
	let pastInterviewIndex = 0;
	let interviewScheduleIndex = 0;
	const currentYear = new Date(now).getFullYear();

	const queries: unknown[] = [];
	for (const [i, applicant] of DUMMY_APPLICANTS.entries()) {
		const posting = postingsByTitle.get(applicant.targetRole) ?? postings[i % postings.length]!;
		const extras = buildDummyApplicantProfile(applicant, i);
		const status = applicant.status as PipelineStatus;
		const round = applicant.interviewRound ?? 1;
		const appliedAt = appliedAtFor(status, i, now);

		// ── The jobseeker ──
		const applicantUserId = sampleId();
		const profileId = sampleId();
		const phoneE164 = toMalaysianMobileE164(extras.phone);
		const { city, state } = cityStateForDummyLocation(applicant.location);
		queries.push(
			db.insert(user).values({
				id: applicantUserId,
				name: applicant.fullName,
				email: `applicant${i + 1}.${organizationId}@${DUMMY_APPLICANT_EMAIL_DOMAIN}`,
				// About two in three proved their number, so the "Phone verified" seal shows on some.
				phoneNumber: phoneE164 ?? "",
				phoneVerified: Boolean(phoneE164) && i % 3 !== 2,
				createdAt: sqliteTime(new Date(appliedAt.getTime() - (2 + (i % 20)) * DAY_MS)),
			}),
			db.insert(jobseekerProfile).values({
				id: profileId,
				userId: applicantUserId,
				// A real (if generic) headshot, as in the redesign.
				avatarKey: `https://i.pravatar.cc/300?img=${(i % 70) + 1}`,
				fullName: applicant.fullName,
				birthYear: extras.birthYear,
				gender: extras.gender,
				maritalStatus: extras.maritalStatus,
				nationality: extras.nationality,
				mobileNumber: extras.phone,
				drivingLicense: extras.drivingLicense,
				location: formatPlace({ area: null, city, state }),
				city,
				state,
				country: "Malaysia",
				preferredWorkPlaces: dummyPreferredWorkPlaces(applicant.location),
				jobTitle: applicant.targetRole,
				preferredIndustry: ROLE_INDUSTRY[applicant.targetRole] ?? INDUSTRIES[i % INDUSTRIES.length]!,
				yearsExperience: applicant.yearsExperience,
				professionalSkills: extras.skills,
				softSkills: extras.softSkills,
				desiredJobType: applicant.employmentType,
				expectedSalaryFrom: applicant.expectedSalaryMin,
				expectedSalaryTo: applicant.expectedSalaryMax,
				bio: applicant.bio,
				noticePeriod: applicant.noticePeriod,
				workArrangement: applicant.workArrangement,
				workEligibility: applicant.workAuthorization,
			}),
			db.insert(jobseekerEducation).values({
				id: sampleId(),
				jobseekerProfileId: profileId,
				schoolName: extras.education.institution,
				fieldOfStudy: extras.education.fieldOfStudy,
				educationLevel: extras.education.qualificationTier,
				graduationYear: extras.education.graduationYear,
				sortOrder: 0,
			}),
			...extras.languages.map((lang, sortOrder) =>
				db.insert(jobseekerProfileLanguage).values({
					id: sampleId(),
					jobseekerProfileId: profileId,
					language: lang.language,
					dialects: lang.dialects,
					spokenLevel: lang.spokenLevel,
					writtenLevel: lang.writtenLevel,
					sortOrder,
				}),
			),
		);
		if (extras.workExperience) {
			queries.push(
				db.insert(jobseekerWorkingExperience).values({
					id: sampleId(),
					jobseekerProfileId: profileId,
					company: extras.workExperience.company,
					jobTitle: extras.workExperience.title,
					// v3 keeps "Jan 2022", as the profile form does.
					periodStart: `Jan ${currentYear - applicant.yearsExperience}`,
					isCurrent: true,
					jobDescription: extras.workExperience.achievements,
					sortOrder: 0,
				}),
			);
		}
		if (extras.certification) {
			queries.push(
				db.insert(jobseekerCertification).values({
					id: sampleId(),
					jobseekerProfileId: profileId,
					name: extras.certification.name,
					issuer: extras.certification.issuer,
					year: extras.certification.year,
					sortOrder: 0,
				}),
			);
		}

		// ── Interviews ──
		const hasInterview = status === "interview" || status === "interviewed" || status === "evaluation" || status === "evaluated";
		let response: (typeof INTERVIEW_STAGE_RESPONSES)[number] | (typeof PAST_INTERVIEW_RESPONSES)[number] | null = null;
		if (status === "interview") {
			response = INTERVIEW_STAGE_RESPONSES[interviewStageIndex++ % INTERVIEW_STAGE_RESPONSES.length]!;
		} else if (status === "interviewed") {
			// Marking attendance is what moves an application to "interviewed",
			// so that's the only stage a no-show can sit at.
			response = PAST_INTERVIEW_RESPONSES[pastInterviewIndex++ % PAST_INTERVIEW_RESPONSES.length]!;
		} else if (hasInterview) {
			response = "attended";
		}
		const interviewAt = hasInterview ? interviewTime(interviewScheduleIndex++, status !== "interview", now) : null;
		const timeline = timelineFor({ status, round, appliedAt, interviewAt, index: i, now });
		const lastAt = timeline.steps.at(-1)?.at ?? appliedAt;

		// ── The application and its history ──
		const applicationId = sampleId();
		queries.push(
			db.insert(application).values({
				id: applicationId,
				userId: applicantUserId,
				jobId: posting.id,
				status: toV1ApplicationStatus(status),
				...(status === "rejected" ? { rejectionType: "manual", rejectedBy: userId, rejectedAt: sqliteTime(lastAt) } : {}),
				dateApplied: sqliteTime(appliedAt),
				createdAt: sqliteTime(appliedAt),
				updatedAt: sqliteTime(lastAt),
			}),
			db.insert(applicationStages).values({
				id: sampleId(),
				applicationId,
				stageName: toV1ApplicationStatus("applied"),
				status: "completed",
				createdAt: sqliteTime(appliedAt),
				updatedAt: sqliteTime(appliedAt),
			}),
			...timeline.steps.map(({ step, at }) =>
				db.insert(applicationStages).values({
					id: sampleId(),
					applicationId,
					stageName: toV1ApplicationStatus(step),
					status: "completed",
					createdAt: sqliteTime(at),
					updatedAt: sqliteTime(at),
				}),
			),
		);

		if (hasInterview && interviewAt && response) {
			const panel = panelFor(posting.title);
			const interviewSteps = timeline.steps.filter((s) => s.step === "interview");
			const addInterview = (opts: { scheduledAt: Date; createdAt: Date; result: string; candidateResponse: string; confirmed: boolean }) => {
				const interviewId = sampleId();
				queries.push(
					db.insert(interviews).values({
						id: interviewId,
						candidateId: applicantUserId,
						jobId: posting.id,
						applicationId,
						scheduledAt: opts.scheduledAt.toISOString(),
						scheduledBy: userId,
						interviewDuration: 45,
						meetingLink: MEETING_LINK,
						location: null,
						interviewType: "online",
						remarks: null,
						result: opts.result,
						candidateResponse: opts.candidateResponse,
						jobseekerConfirmedAttendance: opts.confirmed,
						createdAt: sqliteTime(opts.createdAt),
						updatedAt: sqliteTime(opts.createdAt),
					}),
					// A second apart, so the panel keeps its order.
					...panel.map((p, k) =>
						db.insert(interviewPanel).values({
							id: sampleId(),
							interviewId,
							interviewerId: p.userId,
							memberId: memberIdOf.get(p.userId) ?? null,
							createdAt: sqliteTime(new Date(opts.createdAt.getTime() + k * 1000)),
						}),
					),
				);
			};
			// Round 2: the first round already happened, and they came.
			if (round > 1 && timeline.round1At) {
				addInterview({
					scheduledAt: timeline.round1At,
					createdAt: interviewSteps[0]?.at ?? appliedAt,
					result: INTERVIEW_RESULT.ATTENDED,
					candidateResponse: CANDIDATE_RESPONSE.ACCEPTED,
					confirmed: true,
				});
			}
			const attended = response === "attended";
			const pastResult = response === "no_show" ? INTERVIEW_RESULT.NO_SHOW : attended ? INTERVIEW_RESULT.ATTENDED : INTERVIEW_RESULT.PENDING;
			addInterview({
				scheduledAt: interviewAt,
				createdAt: interviewSteps.at(-1)?.at ?? appliedAt,
				result: status === "interview" ? INTERVIEW_RESULT.PENDING : pastResult,
				// Someone who came (or didn't) had accepted the invite.
				candidateResponse: status === "interview" ? response : CANDIDATE_RESPONSE.ACCEPTED,
				confirmed: status !== "interview" && attended,
			});

			// Panel scorecards: "evaluated" = every panelist submitted;
			// "evaluation" = only the first, so it waits on the rest (when there is a rest).
			const evaluators = status === "evaluated" ? panel : status === "evaluation" && panel.length > 1 ? panel.slice(0, 1) : [];
			for (const [j, evaluator] of evaluators.entries()) {
				const scores = { ...SCORE_SETS[(i + j) % SCORE_SETS.length]! };
				const values = Object.values(scores);
				const at = sqliteTime(new Date(Math.min(interviewAt.getTime() + (4 + j) * HOUR_MS, now - 60 * 1000)));
				queries.push(
					db.insert(applicationFeedback).values({
						id: sampleId(),
						applicationId,
						panelistId: evaluator.userId,
						rating: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
						comment: EVALUATION_NOTES[(i + j) % EVALUATION_NOTES.length],
						round,
						scores,
						recommendation: RECOMMENDATIONS[(i + j) % RECOMMENDATIONS.length],
						createdAt: at,
						updatedAt: at,
					}),
				);
			}
		}
	}
	await runBatches(db, queries);
	return { ok: true, count: DUMMY_APPLICANTS.length };
}

// ── Demo companies ────────────────────────────────────────────────────────

/**
 * The redesign's removeDummyCompanies: every demo company this user is on
 * the team of — the whole company (its address, team and invites go with
 * it), the sample accounts on its team, and its logo file. Returns how many
 * were removed.
 */
export async function removeDemoCompanies(ctx: { db: AnyDb; storage?: Storage; userId: string }): Promise<number> {
	const { db, storage, userId } = ctx;
	const rows = (await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(and(eq(member.userId, userId), like(member.organizationId, SAMPLE_LIKE)))) as { organizationId: string }[];
	const organizationIds = [...new Set(rows.map((r) => r.organizationId))];
	if (organizationIds.length === 0) return 0;
	const [teamRows, orgRows] = (await Promise.all([
		db
			.select({ userId: member.userId })
			.from(member)
			.where(and(inArray(member.organizationId, organizationIds), like(member.userId, SAMPLE_LIKE))),
		db
			.select({ logo: organization.companyLogo })
			.from(organization)
			.where(inArray(organization.id, organizationIds)),
	])) as [{ userId: string | null }[], { logo: string | null }[]];
	const sampleUserIds = [...new Set(teamRows.map((r) => r.userId).filter((id): id is string => isSampleId(id)))];
	await runBatches(db, [
		db.delete(organization).where(and(inArray(organization.id, organizationIds), like(organization.id, SAMPLE_LIKE))),
		...chunks(sampleUserIds).map((chunk) => db.delete(user).where(and(inArray(user.id, chunk), like(user.id, SAMPLE_LIKE)))),
	]);
	// The logos are files; they go once their companies are gone.
	if (storage) {
		for (const { logo } of orgRows) {
			if (logo?.startsWith(`logos/${SAMPLE_ID_PREFIX}`)) await storage.delete(logo).catch(() => {});
		}
	}
	return organizationIds.length;
}

/**
 * The redesign's seedDummyCompanies: both demo companies fresh, with this
 * user on each team (Owner on ParcelTracker, Admin on WHALE). Any earlier
 * copies are removed first, so it's safe to call again.
 */
export async function addDemoCompanies(ctx: SampleDataContext) {
	const { db, storage, userId } = ctx;
	await removeDemoCompanies(ctx);
	const [me] = (await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, userId)).limit(1)) as AnyDb[];
	const now = Date.now();
	const expiresAt = new Date(now + 7 * DAY_MS).toISOString();
	const queries: unknown[] = [];
	for (const [companyIndex, def] of DUMMY_COMPANIES.entries()) {
		const organizationId = sampleId();
		const ownerId = sampleId();
		// ParcelTracker first in the company switcher, as in the redesign.
		const base = now - (DUMMY_COMPANIES.length - companyIndex) * 60 * 1000;
		const at = (seconds: number) => sqliteTime(new Date(base + seconds * 1000));

		let logoKey: string | null = null;
		if (storage) {
			logoKey = `logos/${sampleId()}.svg`;
			await storage.save(logoKey, new TextEncoder().encode(def.company.logoSvg), "image/svg+xml");
		}
		queries.push(
			db.insert(user).values({ id: ownerId, name: def.ownerName, email: seedLoginEmail(def.ownerEmail, userId), createdAt: at(0) }),
			db.insert(organization).values({
				id: organizationId,
				legalName: def.company.companyName,
				displayName: def.company.companyName,
				companyLogo: logoKey,
				companySize: def.company.companySize,
				ssmNumber: def.company.ssmNumber,
				website: def.company.websiteUrl,
				email: def.company.companyEmail,
				phoneNumber: def.company.companyPhone,
				description: def.company.companyDescription,
				industry: def.company.industry,
				industryCategory: def.company.industryCategory,
				foundedYear: def.company.foundedYear,
				companyType: def.company.companyType,
				benefits: def.company.benefits,
				createdByUserId: ownerId,
				createdAt: at(0),
				updatedAt: new Date(base).toISOString(),
			}),
			db.insert(organizationAddress).values({
				id: sampleId(),
				organizationId,
				label: def.address.label,
				addressLine1: def.address.addressLine1,
				addressLine2: def.address.addressLine2 ?? null,
				city: def.address.city,
				state: def.address.state,
				postcode: def.address.postcode,
				isJobDefault: true,
				sortOrder: 0,
				createdAt: at(0),
			}),
			db.insert(member).values({
				id: sampleId(),
				organizationId,
				userId: ownerId,
				name: def.ownerName,
				email: def.ownerEmail,
				role: V1_MEMBER_FOR_ROLE.owner.role,
				accessLevel: V1_MEMBER_FOR_ROLE.owner.accessLevel,
				status: "active",
				contactRole: def.ownerContactRole,
				positionTitle: def.ownerContactPosition,
				phoneNumber: def.ownerContactPhone,
				createdAt: at(0),
			}),
			// The user's own place on its team. No invite, so no welcome step.
			db.insert(member).values({
				id: sampleId(),
				organizationId,
				userId,
				name: (me?.name as string | null) ?? null,
				email: (me?.email as string | null) ?? null,
				role: V1_MEMBER_FOR_ROLE[def.targetRole].role,
				accessLevel: V1_MEMBER_FOR_ROLE[def.targetRole].accessLevel,
				status: "active",
				profileCompletedAt: at(1),
				createdAt: at(1),
			}),
		);
		for (const [index, entry] of DUMMY_TEAM_ROSTER.entries()) {
			const displayEmail = `${def.teammateEmailPrefix}-${slugifyName(entry.name)}@seed.jobgiga.test`;
			queries.push(
				...rosterStatements(db, {
					organizationId,
					inviterId: ownerId,
					entry,
					displayEmail,
					loginEmail: seedLoginEmail(displayEmail, userId),
					createdAt: at(2 + index),
					expiresAt,
				}).queries,
			);
		}
	}
	await runBatches(db, queries);
}
