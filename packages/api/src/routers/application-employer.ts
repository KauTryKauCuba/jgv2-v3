import { member, organization, organizationAddress, organizationBadge } from "@jobgiga-app/db/schema/auth";
import { CANDIDATE_RESPONSE, INTERVIEW_RESULT, interviewPanel, interviews } from "@jobgiga-app/db/schema/interviews";
import { application, applicationFeedback, applicationStages, job, JOB_STATUS } from "@jobgiga-app/db/schema/jobs";
import { ORPCError } from "@orpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure } from "../index";
import { buildApplicantExport, EXPORT_MAX_APPLICATIONS } from "../lib/applicants/export";
import {
	loadApplicantProfile,
	loadApplicantRows,
	loadLatestInterviews,
	loadPanelEvaluations,
	loadTeamMembers,
} from "../lib/applicants/rows";
import { computeMatchResults, loadEmployerAccess } from "../lib/employer/dashboard";
import {
	canManageApplication,
	canViewApplication,
	canViewJob,
	type HiringScope,
	loadHiringManagerOptions,
	loadJobHiringManagers,
} from "../lib/employer/scope";
import { namesByJob, postingFromRow } from "../lib/jobs/posting";
import { loadEmployerResponsiveness } from "../lib/jobs/queries";
import { fileUrl } from "../lib/uploads";
import {
	type PipelineStatus,
	toPipelineStatus,
	toV1ApplicationStatus,
	toV1InterviewType,
} from "../shared/application-status";
import type { EmployerAddress } from "../shared/employer-profile";
import {
	EVALUATION_CRITERIA,
	isPanelEvaluationComplete,
	summarizeEvaluations,
} from "../shared/interview-evaluation";

// The redesign's employer applicant routes (api/employer/applications/*,
// applicants/export, the Applicants and posting pages' loaders) on v1's
// tables — see lib/applicants/rows.ts for where each field comes from.
// Same rules and error messages as the redesign. Not in v3 yet: hiring
// managers (Team), notifications, and the redesign's per-posting hiring
// scope — everyone who can manage the company sees all of its applicants.

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

const SETTABLE_STATUSES = [
	"applied",
	"screened",
	"shortlisted",
	"interview",
	"interviewed",
	"evaluation",
	"kiv",
	"offer",
	"hired",
	"rejected",
	"withdrawn",
] as const;
const RECOMMENDATIONS = ["strong_hire", "hire", "no_hire", "strong_no_hire"] as const;
const UNDO_WINDOW_MS = 2 * 60 * 1000;
// v1's live-and-after statuses: the ones that can have real applicants.
const POSTING_PAGE_STATUSES: string[] = [JOB_STATUS.PUBLISHED, JOB_STATUS.FILLED, JOB_STATUS.CLOSED, JOB_STATUS.FLAGGED];

function bad(message: string): never {
	throw new ORPCError("BAD_REQUEST", { message });
}
function notFound(): never {
	throw new ORPCError("NOT_FOUND", { message: "Not found." });
}

// SQLite's datetime('now') format, matching v1's text timestamps.
const sqliteNow = () => new Date().toISOString().replace("T", " ").slice(0, 19);

/** The caller's company. A panelist works from Interviews, as in the redesign. */
async function requireCompany(db: AnyDb, userId: string, activeOrganizationId: string | null) {
	const access = await loadEmployerAccess(db, userId, activeOrganizationId);
	if (!access) notFound();
	return access;
}

async function loadAddresses(db: AnyDb, organizationId: string): Promise<EmployerAddress[]> {
	const rows = (await db
		.select()
		.from(organizationAddress)
		.where(eq(organizationAddress.organizationId, organizationId))
		.orderBy(asc(organizationAddress.createdAt))) as AnyDb[];
	return rows.map((a) => ({
		id: a.id,
		label: a.label,
		addressLine1: a.addressLine1,
		addressLine2: a.addressLine2 ?? null,
		area: a.area ?? null,
		city: a.city,
		state: a.state,
		postcode: a.postcode,
		isJobDefault: Boolean(a.isJobDefault),
	}));
}

/** The application, checked to belong to one of this company's jobs. */
async function loadOwnApplication(db: AnyDb, organizationId: string, id: string) {
	const [row] = (await db
		.select({ id: application.id, status: application.status, userId: application.userId, jobId: application.jobId })
		.from(application)
		.innerJoin(job, eq(job.id, application.jobId))
		.where(and(eq(application.id, id), eq(job.organizationId, organizationId)))
		.limit(1)) as AnyDb[];
	if (!row) notFound();
	return row as { id: string; status: string; userId: string; jobId: string };
}

/** The redesign's canViewApplication (lib/employer/scope.ts). */
async function assertCanView(db: AnyDb, access: { scope: HiringScope; organizationId: string }, jobId: string, id: string) {
	if (access.scope.kind === "all") return;
	const latest = (await loadLatestInterviews(db, access.organizationId, [id])).get(id);
	if (!canViewApplication(access.scope, jobId, latest?.details.interviewerUserIds)) notFound();
}

const interviewDetailsInput = z
	.object({
		round: z.number().int().min(1),
		mode: z.enum(["onsite", "online", "phone"]),
		scheduledAt: z.string(),
		durationMinutes: z.number().positive().nullable(),
		location: z.string().nullish(),
		meetingLink: z.string().nullish(),
		interviewerUserIds: z.array(z.string()).optional(),
		notes: z.string().nullish(),
	})
	.nullable()
	.optional();

const nonEmpty = (v: string | null | undefined) => (typeof v === "string" && v.trim().length > 0 ? v.trim() : null);

function badge(db: AnyDb, organizationId: string, badgeKey: string) {
	return db.insert(organizationBadge).values({ id: crypto.randomUUID(), organizationId, badgeKey }).onConflictDoNothing();
}

export const applicationEmployerProcedures = {
	// The redesign's /employer/interviews page data
	// (getInterviewApplicationsForEmployer + getShortlistedApplicationsForEmployer):
	// applicants at the interview steps, plus the shortlisted ones to schedule
	// next. A panel member sees only the interviews they're on, and can't
	// schedule (canSchedule false, no shortlist).
	listInterviews: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const userId = context.session.user.id;
		const access = await requireCompany(db, userId, context.activeOrganizationId);
		const [rows, addresses, teamMembers] = await Promise.all([
			loadApplicantRows(db, context.origin, access.organizationId, { scope: access.scope }),
			loadAddresses(db, access.organizationId),
			loadTeamMembers(db, context.origin, access.organizationId),
		]);
		const interviewSteps: PipelineStatus[] = ["interview", "interviewed", "evaluation", "evaluated"];
		// Rows are already limited to what this teammate can see.
		const applications = rows.filter((r) => interviewSteps.includes(r.application.status));
		// Only the ones they can schedule: their own jobs (all, for full access).
		const shortlisted = access.canManage ? rows.filter((r) => r.application.status === "shortlisted" && r.canManage) : [];
		return { applications, shortlisted, addresses, teamMembers, canSchedule: access.canManage };
	}),

	// The redesign's /employer/applicants page data.
	listForEmployer: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const access = await requireCompany(db, context.session.user.id, context.activeOrganizationId);
		if (!access.canManage) throw new ORPCError("FORBIDDEN", { message: "Panel members see their candidates from Interviews." });
		const [applications, addresses, teamMembers, responsiveness] = await Promise.all([
			loadApplicantRows(db, context.origin, access.organizationId, { scope: access.scope }),
			loadAddresses(db, access.organizationId),
			loadTeamMembers(db, context.origin, access.organizationId),
			loadEmployerResponsiveness(db, [access.organizationId]),
		]);
		// Company-wide reply-time stats — Owners/Admins only, as in the redesign.
		const stats = access.fullAccess ? (responsiveness.get(access.organizationId) ?? null) : null;
		return {
			applications,
			addresses,
			teamMembers,
			smartMatchEnabled: access.smartMatchEnabled,
			criteria: access.criteria,
			responsiveness: stats && stats.sampleSize > 0 ? stats : null,
			waitingLong: stats?.waitingLong ?? 0,
		};
	}),

	// The redesign's /employer/jobs/<slug> page data: a live (or filled,
	// closed, flagged) posting with its own applicants.
	postingPage: protectedProcedure.input(z.object({ slug: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const access = await requireCompany(db, context.session.user.id, context.activeOrganizationId);
		if (!access.canManage) throw new ORPCError("FORBIDDEN", { message: "Panel members see their candidates from Interviews." });
		const [row] = (await db
			.select()
			.from(job)
			.where(and(eq(job.organizationId, access.organizationId), eq(job.slug, input.slug)))
			.limit(1)) as AnyDb[];
		if (!row || !POSTING_PAGE_STATUSES.includes(row.status)) notFound();
		// A Hiring manager only gets the postings they're assigned to.
		if (!canViewJob(access.scope, row.id)) notFound();
		const [[company], skills, benefits, applications, addresses, teamMembers, contactRows] = await Promise.all([
			db
				.select({ name: organization.displayName, logo: organization.companyLogo })
				.from(organization)
				.where(eq(organization.id, access.organizationId))
				.limit(1) as Promise<AnyDb[]>,
			namesByJob(db, [row.id], "skills"),
			namesByJob(db, [row.id], "benefits"),
			loadApplicantRows(db, context.origin, access.organizationId, { jobId: row.id, scope: access.scope }),
			loadAddresses(db, access.organizationId),
			loadTeamMembers(db, context.origin, access.organizationId),
			row.contactUserId
				? (db
						.select({ name: member.name, position: member.positionTitle, avatarKey: member.avatarKey })
						.from(member)
						.where(
							and(
								eq(member.organizationId, access.organizationId),
								eq(member.userId, row.contactUserId),
								eq(member.status, "active"),
							),
						)
						.limit(1) as Promise<AnyDb[]>)
				: Promise.resolve([] as AnyDb[]),
		]);
		const contact = contactRows[0];
		const [hiringManagerOptions, managers] = await Promise.all([
			loadHiringManagerOptions(db, context.origin, access.organizationId),
			loadJobHiringManagers(db, context.origin, [row.id]),
		]);
		return {
			posting: {
				...postingFromRow(row, {
					skills: skills.get(row.id) ?? [],
					benefits: benefits.get(row.id) ?? [],
					applicantCount: applications.length,
				}),
				contact: contact
					? { name: contact.name ?? "", position: contact.position ?? null, avatarUrl: fileUrl(context.origin, contact.avatarKey) }
					: null,
			},
			company: { name: (company?.name as string) ?? "", logoUrl: fileUrl(context.origin, company?.logo) },
			applications,
			addresses,
			teamMembers,
			canManagePosting: access.fullAccess,
			hiringManagerOptions,
			hiringManagerIds: (managers.get(row.id) ?? []).map((m) => m.teamMemberId),
		};
	}),

	// The redesign's GET /api/employer/applications/<id>: one applicant in the
	// list's shape, with what its profile window needs alongside.
	getForEmployer: protectedProcedure.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const access = await requireCompany(db, context.session.user.id, context.activeOrganizationId);
		const own = await loadOwnApplication(db, access.organizationId, input.id);
		await assertCanView(db, access, own.jobId, input.id);
		const [[applicant], addresses, teamMembers, matches] = await Promise.all([
			loadApplicantRows(db, context.origin, access.organizationId, { applicationIds: [input.id], scope: access.scope }),
			loadAddresses(db, access.organizationId),
			loadTeamMembers(db, context.origin, access.organizationId),
			computeMatchResults(db, context.origin, access.organizationId, access.criteria, access.scope),
		]);
		if (!applicant) notFound();
		const match = matches.find((m) => m.applicationId === input.id);
		return { applicant, addresses, teamMembers, fit: match ? { score: match.score, eligible: match.eligible } : null };
	}),

	// The redesign's GET /api/employer/applications/<id>/profile.
	applicantProfile: protectedProcedure.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const access = await requireCompany(db, context.session.user.id, context.activeOrganizationId);
		const app = await loadOwnApplication(db, access.organizationId, input.id);
		await assertCanView(db, access, app.jobId, input.id);
		const profile = await loadApplicantProfile(db, context.origin, app.userId);
		if (!profile) notFound();
		return { profile };
	}),

	// The redesign's PATCH /api/employer/applications/<id>: move an applicant
	// along, schedule/reschedule their interview, mark attendance, or undo
	// the move just made. v1's tables: application.status (v1 value), an
	// application_stages row per move, the interviews row and its panel.
	updateStatus: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				status: z.string(),
				interviewDetails: interviewDetailsInput,
				interviewResponseStatus: z.string().optional(),
				undo: z.boolean().optional(),
			}),
		)
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const userId = context.session.user.id;
			const access = await requireCompany(db, userId, context.activeOrganizationId);
			const settable: string[] = input.undo ? [...SETTABLE_STATUSES, "evaluated"] : [...SETTABLE_STATUSES];
			if (!settable.includes(input.status)) bad("Invalid status.");
			const status = input.status as PipelineStatus;

			// Interview details: the panel must be active members of this company.
			let details = null as null | {
				round: number;
				mode: "onsite" | "online" | "phone";
				scheduledAt: string;
				durationMinutes: number | null;
				location: string | null;
				meetingLink: string | null;
				interviewerUserIds: string[];
				notes: string | null;
			};
			if (input.interviewDetails) {
				const d = input.interviewDetails;
				if (Number.isNaN(Date.parse(d.scheduledAt))) bad("Invalid interview details.");
				if (d.mode === "onsite" && !nonEmpty(d.location)) bad("Invalid interview details.");
				if (d.mode === "online" && !nonEmpty(d.meetingLink)) bad("Invalid interview details.");
				const panel = [...new Set((d.interviewerUserIds ?? []).map((i) => i.trim()).filter(Boolean))];
				if (panel.length > 0) {
					const active = new Set(
						(
							(await db
								.select({ userId: member.userId })
								.from(member)
								.where(and(eq(member.organizationId, access.organizationId), eq(member.status, "active")))) as AnyDb[]
						)
							.map((m) => m.userId)
							.filter(Boolean),
					);
					if (!panel.every((id) => active.has(id))) bad("Interviewers must be active members of your team.");
				}
				details = {
					round: d.round,
					mode: d.mode,
					scheduledAt: new Date(d.scheduledAt).toISOString(),
					durationMinutes: d.durationMinutes ?? null,
					location: nonEmpty(d.location),
					meetingLink: nonEmpty(d.meetingLink),
					interviewerUserIds: panel,
					notes: nonEmpty(d.notes),
				};
			}
			if (input.interviewResponseStatus !== undefined && !["attended", "no_show"].includes(input.interviewResponseStatus)) {
				bad("Invalid interview response status.");
			}

			const existing = await loadOwnApplication(db, access.organizationId, input.id);
			await assertCanView(db, access, existing.jobId, input.id);
			// A Panel member (or a Hiring manager on another job's panel) can see
			// this candidate but not move them along.
			if (!canManageApplication(access.scope, existing.jobId)) {
				throw new ORPCError("FORBIDDEN", { message: "Only the job's hiring manager or an admin can move this applicant." });
			}
			const current = toPipelineStatus(existing.status);

			if (input.undo) {
				// Only the latest move, from exactly that stage, within the window.
				const stageRows = (await db
					.select({ id: applicationStages.id, stageName: applicationStages.stageName, createdAt: applicationStages.createdAt })
					.from(applicationStages)
					.where(eq(applicationStages.applicationId, input.id))
					// rowid breaks ties between moves made in the same second.
					.orderBy(desc(applicationStages.createdAt), desc(sql`rowid`))
					.limit(2)) as AnyDb[];
				const [last, before] = stageRows;
				const fromStatus = before ? toPipelineStatus(before.stageName) : "applied";
				const madeAt = last ? Date.parse(`${String(last.createdAt).replace(" ", "T")}Z`) : 0;
				const undoable =
					last && toPipelineStatus(last.stageName) === current && fromStatus === status && Date.now() - madeAt < UNDO_WINDOW_MS;
				if (!undoable) {
					throw new ORPCError("CONFLICT", {
						message: "This move can't be undone any more — move them back from their profile instead.",
					});
				}
				await db.batch([
					db
						.update(application)
						.set({ status: toV1ApplicationStatus(status), updatedAt: sqliteNow() })
						.where(eq(application.id, input.id)),
					db.delete(applicationStages).where(eq(applicationStages.id, last.id)),
				]);
				const [row] = await loadApplicantRows(db, context.origin, access.organizationId, {
					applicationIds: [input.id],
					scope: access.scope,
				});
				return { application: row!.application, undone: true };
			}

			if (status === "interview" && current !== "interview" && !details) bad("Set up the interview details first.");
			if (status === "evaluation" && current !== "interviewed") bad("Mark attendance before starting the evaluation.");

			let nextStatus: PipelineStatus = status;
			const queries: unknown[] = [];
			const latest = (await loadLatestInterviews(db, access.organizationId, [input.id])).get(input.id) ?? null;

			if (input.interviewDetails !== undefined) {
				if (details) {
					const values = {
						scheduledAt: details.scheduledAt,
						interviewDuration: details.durationMinutes,
						interviewType: toV1InterviewType(details.mode),
						location: details.location,
						meetingLink: details.meetingLink,
						remarks: details.notes,
						// A (re)schedule resets the reply and attendance.
						result: INTERVIEW_RESULT.PENDING,
						candidateResponse: CANDIDATE_RESPONSE.PENDING,
						jobseekerConfirmedAttendance: false,
					};
					// Same round as the current interview → reschedule it; else a new round.
					const interviewId = latest && latest.details.round === details.round ? latest.interviewId : crypto.randomUUID();
					if (interviewId === latest?.interviewId) {
						queries.push(db.update(interviews).set(values).where(eq(interviews.id, interviewId)));
						queries.push(db.delete(interviewPanel).where(eq(interviewPanel.interviewId, interviewId)));
					} else {
						queries.push(
							db.insert(interviews).values({
								id: interviewId,
								candidateId: existing.userId,
								jobId: existing.jobId,
								applicationId: input.id,
								scheduledBy: userId,
								...values,
							}),
						);
					}
					const memberIds = new Map(
						(
							(await db
								.select({ id: member.id, userId: member.userId })
								.from(member)
								.where(eq(member.organizationId, access.organizationId))) as AnyDb[]
						).map((m) => [m.userId, m.id]),
					);
					for (const panelist of details.interviewerUserIds) {
						queries.push(
							db.insert(interviewPanel).values({
								id: crypto.randomUUID(),
								interviewId,
								interviewerId: panelist,
								memberId: memberIds.get(panelist) ?? null,
							}),
						);
					}
				} else if (latest && latest.response !== "attended" && latest.response !== "no_show") {
					// Leaving the interview step: the interview that never happened is cancelled.
					queries.push(db.delete(interviews).where(eq(interviews.id, latest.interviewId)));
				}
			}

			if (input.interviewResponseStatus === "attended" || input.interviewResponseStatus === "no_show") {
				if (!latest) bad("Set up the interview details first.");
				queries.push(
					db
						.update(interviews)
						.set({ result: input.interviewResponseStatus === "attended" ? INTERVIEW_RESULT.ATTENDED : INTERVIEW_RESULT.NO_SHOW })
						.where(eq(interviews.id, latest.interviewId)),
				);
				// Marking attendance closes the round.
				nextStatus = "interviewed";
			}

			const now = sqliteNow();
			const v1Status = toV1ApplicationStatus(nextStatus);
			queries.push(
				db
					.update(application)
					.set({
						status: v1Status,
						updatedAt: now,
						...(nextStatus === "rejected" && current !== "rejected"
							? { rejectionType: "manual", rejectedBy: userId, rejectedAt: now }
							: {}),
					})
					.where(eq(application.id, input.id)),
			);
			if (nextStatus !== current) {
				queries.push(
					db.insert(applicationStages).values({
						id: crypto.randomUUID(),
						applicationId: input.id,
						stageName: v1Status,
						status: "completed",
						createdAt: now,
						updatedAt: now,
					}),
				);
			}
			if (nextStatus === "screened") queries.push(badge(db, access.organizationId, "first_candidate_screened"));
			if (nextStatus === "hired" && current !== "hired") queries.push(badge(db, access.organizationId, "first_hire"));
			await db.batch(queries);

			const [row] = await loadApplicantRows(db, context.origin, access.organizationId, {
				applicationIds: [input.id],
				scope: access.scope,
			});
			return { application: row!.application };
		}),

	// The redesign's PATCH /api/employer/applications/<id>/evaluation: the
	// caller's own scorecard, on v1's application_feedback row.
	submitEvaluation: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				scores: z.record(z.string(), z.number()),
				recommendation: z.string(),
				notes: z.string().nullish(),
			}),
		)
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const userId = context.session.user.id;
			const access = await requireCompany(db, userId, context.activeOrganizationId);
			const scores: Record<string, number> = {};
			for (const [key, raw] of Object.entries(input.scores)) {
				if (!(EVALUATION_CRITERIA as readonly string[]).includes(key) || !Number.isInteger(raw) || raw < 1 || raw > 5) {
					bad("Invalid scores.");
				}
				scores[key] = raw;
			}
			if (Object.keys(scores).length === 0) bad("Invalid scores.");
			if (!(RECOMMENDATIONS as readonly string[]).includes(input.recommendation)) bad("Invalid recommendation.");

			const app = await loadOwnApplication(db, access.organizationId, input.id);
			await assertCanView(db, access, app.jobId, input.id);
			const latest = (await loadLatestInterviews(db, access.organizationId, [input.id])).get(input.id) ?? null;
			if (!latest) bad("Schedule an interview before evaluating this candidate.");
			const panel = latest.details.interviewerUserIds;
			if (panel.length > 0 && !panel.includes(userId) && access.accessLevel !== "owner") {
				throw new ORPCError("FORBIDDEN", { message: "Only interviewers on this panel (or an Owner) can evaluate this candidate." });
			}

			const values = Object.values(scores);
			const notes = input.notes?.trim() || null;
			const row = {
				round: latest.details.round,
				scores,
				recommendation: input.recommendation,
				comment: notes,
				// v1's 1–5 rating: the scorecard's average, rounded.
				rating: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
			};
			await db
				.insert(applicationFeedback)
				.values({ id: crypto.randomUUID(), applicationId: input.id, panelistId: userId, ...row })
				.onConflictDoUpdate({
					target: [applicationFeedback.applicationId, applicationFeedback.panelistId],
					set: { ...row, updatedAt: sqliteNow() },
				});

			const evaluations =
				(await loadPanelEvaluations(db, access.organizationId, new Map([[input.id, latest.details.round]]))).get(input.id) ?? [];
			let status = toPipelineStatus(app.status);
			// Only from "evaluation" itself, once every panelist has scored.
			if (status === "evaluation" && isPanelEvaluationComplete(panel, evaluations)) {
				const now = sqliteNow();
				await db.batch([
					db.update(application).set({ status: toV1ApplicationStatus("evaluated"), updatedAt: now }).where(eq(application.id, input.id)),
					db.insert(applicationStages).values({
						id: crypto.randomUUID(),
						applicationId: input.id,
						stageName: toV1ApplicationStatus("evaluated"),
						status: "completed",
						createdAt: now,
						updatedAt: now,
					}),
				]);
				status = "evaluated";
			}
			return { evaluations, evaluation: summarizeEvaluations(evaluations), status };
		}),

	// The redesign's POST /api/employer/applications/<id>/evaluation: an
	// Owner closes the evaluation without waiting for the rest of the panel.
	completeEvaluation: protectedProcedure.input(z.object({ id: z.string() })).handler(async ({ input, context }) => {
		const db = context.db as AnyDb;
		const access = await requireCompany(db, context.session.user.id, context.activeOrganizationId);
		const app = await loadOwnApplication(db, access.organizationId, input.id);
		if (access.accessLevel !== "owner") {
			throw new ORPCError("FORBIDDEN", { message: "Only an Owner can complete an evaluation early." });
		}
		if (toPipelineStatus(app.status) !== "evaluation") bad("This candidate isn't in the evaluation stage.");
		const latest = (await loadLatestInterviews(db, access.organizationId, [input.id])).get(input.id) ?? null;
		const evaluations =
			(await loadPanelEvaluations(db, access.organizationId, new Map([[input.id, latest?.details.round ?? null]]))).get(input.id) ??
			[];
		if (evaluations.length === 0) bad("At least one interviewer needs to submit an evaluation first.");
		const now = sqliteNow();
		await db.batch([
			db.update(application).set({ status: toV1ApplicationStatus("evaluated"), updatedAt: now }).where(eq(application.id, input.id)),
			db.insert(applicationStages).values({
				id: crypto.randomUUID(),
				applicationId: input.id,
				stageName: toV1ApplicationStatus("evaluated"),
				status: "completed",
				createdAt: now,
				updatedAt: now,
			}),
		]);
		return { evaluations, evaluation: summarizeEvaluations(evaluations), status: "evaluated" as const };
	}),

	// The redesign's POST /api/employer/applicants/export for the rows on
	// screen: an Excel file, in the order given. Ids the company can't see
	// are skipped.
	exportApplicants: protectedProcedure
		.input(z.object({ applicationIds: z.array(z.string()), title: z.string().optional() }))
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const access = await requireCompany(db, context.session.user.id, context.activeOrganizationId);
			const ids = input.applicationIds;
			if (ids.length === 0) bad("There are no applicants to export.");
			if (ids.length > EXPORT_MAX_APPLICATIONS) {
				bad(`That's more than ${EXPORT_MAX_APPLICATIONS} applicants — filter the list first.`);
			}
			const rows = await loadApplicantRows(db, context.origin, access.organizationId, {
				applicationIds: ids,
				scope: access.scope,
			});
			const byId = new Map(rows.map((r) => [r.application.id, r]));
			const ordered = ids.map((id) => byId.get(id)).filter((r): r is (typeof rows)[number] => !!r);
			if (ordered.length === 0) bad("There are no applicants to export.");
			const { fileName, bytes } = await buildApplicantExport(
				db,
				context.origin,
				context.session.user.id,
				ordered,
				input.title?.slice(0, 80),
				context.activeOrganizationId,
			);
			return new File([new Uint8Array(bytes)], fileName, {
				type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
			});
		}),
};
