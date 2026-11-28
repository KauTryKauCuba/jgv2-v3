import {
	jobseekerCertification,
	jobseekerEducation,
	jobseekerProfile,
	jobseekerProfileLanguage,
	jobseekerReference,
	jobseekerWorkingExperience,
	member,
	user,
} from "@jobgiga-app/db/schema/auth";
import { CANDIDATE_RESPONSE, INTERVIEW_RESULT, interviewPanel, interviews } from "@jobgiga-app/db/schema/interviews";
import { application, applicationFeedback, applicationStages, job } from "@jobgiga-app/db/schema/jobs";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
	type InterviewEvaluation,
	type PanelEvaluation,
	summarizeEvaluations,
} from "../../shared/interview-evaluation";
import { toInterviewMode, toIso, toPipelineStatus, type PipelineStatus } from "../../shared/application-status";
import { toMalaysianMobileE164 } from "../../shared/phone";
import { toTeamRole } from "../../shared/team-roles";
import { canManageApplication, canViewApplication, type HiringScope, loadJobHiringManagers } from "../employer/scope";
import { inChunks } from "../jobs/queries";
import { fileUrl } from "../uploads";

// The redesign's applicant rows (lib/job-applications.ts
// getApplicationsForEmployer / getApplicationsForJobPosting) built from v1's
// tables:
// - application            → the row itself (status mapped to the redesign's step)
// - interviews (latest)    → application.interviewDetails; its round is its
//                            place in that application's interviews, oldest first
// - interview_panel        → the panel (interviewerUserIds / interviewers)
// - application_feedback   → each panelist's scorecard for the current round
// - application_stages     → hiredAt (v1's "passed" stage row)
// Things v3 doesn't have yet are sent empty: screening answers and the terms
// snapshot (jobseekers can't apply in v3 yet), video pitches, hiring managers.

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed here.
type AnyDb = any;

export type InterviewDetails = {
	round: number;
	mode: "onsite" | "online" | "phone";
	scheduledAt: string;
	durationMinutes: number | null;
	location: string | null;
	meetingLink: string | null;
	interviewers: string[];
	interviewerUserIds: string[];
	notes: string | null;
};

export type InterviewResponseStatus =
	| "pending"
	| "accepted"
	| "declined"
	| "reschedule_requested"
	| "attended"
	| "no_show";

/** v1's interview result + candidate response → the redesign's interview_response_status. */
export function toInterviewResponse(result: string, candidateResponse: string | null): InterviewResponseStatus {
	if (result === INTERVIEW_RESULT.NO_SHOW) return "no_show";
	if (result === INTERVIEW_RESULT.ATTENDED || result === INTERVIEW_RESULT.PASSED || result === INTERVIEW_RESULT.FAILED) {
		return "attended";
	}
	return (candidateResponse ?? CANDIDATE_RESPONSE.PENDING) as InterviewResponseStatus;
}

/** Display names for members: "About you" name, else the account's. */
async function memberNames(db: AnyDb, organizationId: string) {
	const rows = (await db
		.select({ userId: member.userId, memberName: member.name, accountName: user.name, email: member.email })
		.from(member)
		.leftJoin(user, eq(user.id, member.userId))
		.where(eq(member.organizationId, organizationId))) as AnyDb[];
	return new Map(
		rows
			.filter((r) => r.userId)
			.map((r) => [r.userId as string, ((r.memberName as string | null) || (r.accountName as string | null) || (r.email as string | null)) ?? ""]),
	);
}

/** Each application's latest interview in the redesign's interviewDetails shape. */
export async function loadLatestInterviews(db: AnyDb, organizationId: string, applicationIds: string[]) {
	const rows = (await inChunks(applicationIds, (chunk) =>
		db
			.select({
				id: interviews.id,
				applicationId: interviews.applicationId,
				scheduledAt: interviews.scheduledAt,
				interviewDuration: interviews.interviewDuration,
				interviewType: interviews.interviewType,
				location: interviews.location,
				meetingLink: interviews.meetingLink,
				remarks: interviews.remarks,
				result: interviews.result,
				candidateResponse: interviews.candidateResponse,
				jobseekerConfirmedAttendance: interviews.jobseekerConfirmedAttendance,
				createdAt: interviews.createdAt,
			})
			.from(interviews)
			.where(inArray(interviews.applicationId, chunk))
			.orderBy(asc(interviews.createdAt)),
	)) as AnyDb[];
	const latest = new Map<string, AnyDb & { round: number }>();
	const rounds = new Map<string, number>();
	for (const row of rows) {
		const round = (rounds.get(row.applicationId) ?? 0) + 1;
		rounds.set(row.applicationId, round);
		latest.set(row.applicationId, { ...row, round });
	}
	const interviewIds = [...latest.values()].map((r) => r.id as string);
	const panelRows = (await inChunks(interviewIds, (chunk) =>
		db
			.select({ interviewId: interviewPanel.interviewId, userId: interviewPanel.interviewerId, createdAt: interviewPanel.createdAt })
			.from(interviewPanel)
			.where(inArray(interviewPanel.interviewId, chunk))
			.orderBy(asc(interviewPanel.createdAt)),
	)) as AnyDb[];
	const names = await memberNames(db, organizationId);
	const panelOf = new Map<string, string[]>();
	for (const p of panelRows) {
		if (!p.userId) continue;
		panelOf.set(p.interviewId, [...(panelOf.get(p.interviewId) ?? []), p.userId]);
	}

	const out = new Map<
		string,
		{ interviewId: string; details: InterviewDetails; response: InterviewResponseStatus; confirmed: boolean }
	>();
	for (const [applicationId, row] of latest) {
		const panel = panelOf.get(row.id) ?? [];
		out.set(applicationId, {
			interviewId: row.id,
			details: {
				round: row.round,
				mode: toInterviewMode(row.interviewType),
				scheduledAt: toIso(row.scheduledAt),
				durationMinutes: row.interviewDuration ?? null,
				location: row.location ?? null,
				meetingLink: row.meetingLink ?? null,
				interviewers: panel.map((id) => names.get(id) ?? ""),
				interviewerUserIds: panel,
				notes: row.remarks ?? null,
			},
			response: toInterviewResponse(row.result, row.candidateResponse),
			confirmed: Boolean(row.jobseekerConfirmedAttendance),
		});
	}
	return out;
}

/** The redesign's getPanelEvaluations: scorecards for each application's current round. */
export async function loadPanelEvaluations(
	db: AnyDb,
	organizationId: string,
	currentRound: Map<string, number | null>,
): Promise<Map<string, PanelEvaluation[]>> {
	const ids = [...currentRound.keys()];
	const rows = (await inChunks(ids, (chunk) =>
		db
			.select({
				applicationId: applicationFeedback.applicationId,
				panelistId: applicationFeedback.panelistId,
				rating: applicationFeedback.rating,
				comment: applicationFeedback.comment,
				round: applicationFeedback.round,
				scores: applicationFeedback.scores,
				recommendation: applicationFeedback.recommendation,
			})
			.from(applicationFeedback)
			.where(inArray(applicationFeedback.applicationId, chunk))
			.orderBy(asc(applicationFeedback.createdAt)),
	)) as AnyDb[];
	const names = await memberNames(db, organizationId);
	const result = new Map<string, PanelEvaluation[]>();
	for (const row of rows) {
		// v1 feedback (a plain 1–5 rating) has no round or scorecard — the
		// redesign's screens can't show it, so it's left out.
		if (!row.scores || !row.recommendation) continue;
		if (row.round !== currentRound.get(row.applicationId)) continue;
		const list = result.get(row.applicationId) ?? [];
		list.push({
			evaluatorUserId: row.panelistId,
			evaluatorName: names.get(row.panelistId) ?? null,
			round: row.round,
			scores: row.scores,
			recommendation: row.recommendation as InterviewEvaluation["recommendation"],
			notes: row.comment ?? null,
		});
		result.set(row.applicationId, list);
	}
	return result;
}

/**
 * The redesign's applicant rows for a company — every application, or one
 * job's (`jobId`), or particular ones (`applicationIds`). Newest first.
 * `scope` is the viewer's hiring scope (lib/employer/scope.ts): rows they
 * can't see are left out, and `canManage` says whether they may move each
 * one along.
 */
export async function loadApplicantRows(
	db: AnyDb,
	origin: string,
	organizationId: string,
	options: { jobId?: string; applicationIds?: string[]; scope: HiringScope },
) {
	const conditions = [eq(job.organizationId, organizationId)];
	if (options.jobId) conditions.push(eq(job.id, options.jobId));
	const select = {
		id: application.id,
		jobId: application.jobId,
		userId: application.userId,
		status: application.status,
		dateApplied: application.dateApplied,
		updatedAt: application.updatedAt,
		rejectionRemarks: application.rejectionRemarks,
		jobTitle: job.title,
		postingName: job.postingName,
		salaryMin: job.salaryMin,
		salaryMax: job.salaryMax,
		salaryPeriod: job.salaryPeriod,
		accountName: user.name,
		accountImage: user.image,
		accountPhone: user.phoneNumber,
		accountPhoneVerified: user.phoneVerified,
		profileId: jobseekerProfile.id,
		fullName: jobseekerProfile.fullName,
		avatarKey: jobseekerProfile.avatarKey,
		location: jobseekerProfile.location,
		birthYear: jobseekerProfile.birthYear,
		targetRole: jobseekerProfile.jobTitle,
		yearsExperience: jobseekerProfile.yearsExperience,
		skills: jobseekerProfile.professionalSkills,
		expectedSalaryMin: jobseekerProfile.expectedSalaryFrom,
		expectedSalaryMax: jobseekerProfile.expectedSalaryTo,
		employmentType: jobseekerProfile.desiredJobType,
		workArrangement: jobseekerProfile.workArrangement,
		noticePeriod: jobseekerProfile.noticePeriod,
		resumeFileName: jobseekerProfile.resumeFileName,
		mobileNumber: jobseekerProfile.mobileNumber,
	};
	const base = () =>
		db
			.select(select)
			.from(application)
			.innerJoin(job, eq(job.id, application.jobId))
			.innerJoin(user, eq(user.id, application.userId))
			.leftJoin(jobseekerProfile, eq(jobseekerProfile.userId, application.userId));
	const rows = (
		options.applicationIds
			? await inChunks(options.applicationIds, (chunk) =>
					base().where(and(...conditions, inArray(application.id, chunk))),
				)
			: await base()
					.where(and(...conditions))
					.orderBy(desc(application.dateApplied))
	) as AnyDb[];
	rows.sort((a, b) => toIso(b.dateApplied).localeCompare(toIso(a.dateApplied)));
	const ids = rows.map((r) => r.id as string);

	const [latest, passedRows] = await Promise.all([
		loadLatestInterviews(db, organizationId, ids),
		inChunks(ids, (chunk) =>
			db
				.select({ applicationId: applicationStages.applicationId, createdAt: applicationStages.createdAt })
				.from(applicationStages)
				.where(and(inArray(applicationStages.applicationId, chunk), eq(applicationStages.stageName, "passed")))
				.orderBy(desc(applicationStages.createdAt)),
		) as Promise<AnyDb[]>,
	]);
	const hiredAt = new Map<string, string>();
	for (const p of passedRows) if (!hiredAt.has(p.applicationId)) hiredAt.set(p.applicationId, toIso(p.createdAt));
	const managers = await loadJobHiringManagers(db, origin, [...new Set(rows.map((r) => r.jobId as string))]);
	const evaluationsByApp = await loadPanelEvaluations(
		db,
		organizationId,
		new Map(ids.map((id) => [id, latest.get(id)?.details.round ?? null])),
	);

	const visible = rows.filter((r) =>
		canViewApplication(options.scope, r.jobId, latest.get(r.id)?.details.interviewerUserIds),
	);
	return visible.map((r) => {
		const interview = latest.get(r.id) ?? null;
		const evaluations = evaluationsByApp.get(r.id) ?? [];
		const status: PipelineStatus = toPipelineStatus(r.status);
		const e164 = r.mobileNumber ? toMalaysianMobileE164(r.mobileNumber) : null;
		return {
			application: {
				id: r.id as string,
				jobPostingId: r.jobId as string,
				// No jobseeker profile (an old v1 account): the account stands in.
				jobseekerProfileId: (r.profileId as string | null) ?? (r.userId as string),
				status,
				interviewDetails: interview?.details ?? null,
				interviewResponseStatus: interview ? interview.response : null,
				jobseekerConfirmedAttendance: interview?.confirmed ?? false,
				version: 1,
				rejectionReasonCode: null,
				termsSnapshot: null,
				screeningAnswers: null,
				screeningEligible: null,
				screeningPreferredMet: null,
				screeningPreferredTotal: null,
				appliedAt: toIso(r.dateApplied),
				updatedAt: toIso(r.updatedAt),
				hiredAt: status === "hired" ? (hiredAt.get(r.id) ?? toIso(r.updatedAt)) : null,
			},
			jobPostingId: r.jobId as string,
			jobPostingTitle: ((r.postingName as string | null) || (r.jobTitle as string)) ?? "",
			applicantName: ((r.fullName as string | null) || (r.accountName as string | null)) ?? "",
			applicantAvatarUrl: fileUrl(origin, r.avatarKey) ?? (r.accountImage as string | null) ?? null,
			applicantLocation: (r.location as string | null) ?? "",
			applicantBirthYear: (r.birthYear as number | null) ?? null,
			applicantTargetRole: (r.targetRole as string | null) ?? null,
			applicantYearsExperience: (r.yearsExperience as number | null) ?? null,
			applicantSkills: (r.skills as string[] | null) ?? [],
			applicantExpectedSalaryMin: (r.expectedSalaryMin as number | null) ?? null,
			applicantExpectedSalaryMax: (r.expectedSalaryMax as number | null) ?? null,
			postingSalaryMin: (r.salaryMin as number | null) ?? null,
			postingSalaryMax: (r.salaryMax as number | null) ?? null,
			postingSalaryPeriod: (r.salaryPeriod as string | null) ?? "month",
			applicantEmploymentType: (r.employmentType as string | null) ?? null,
			applicantWorkArrangement: (r.workArrangement as string | null) ?? null,
			applicantNoticePeriod: (r.noticePeriod as string | null) ?? null,
			applicantResumeFileName: (r.resumeFileName as string | null) ?? null,
			applicantPhoneVerified: !!e164 && Boolean(r.accountPhoneVerified) && r.accountPhone === e164,
			evaluations,
			evaluation: summarizeEvaluations(evaluations),
			// v3 has no video pitches yet.
			videoPitch: null,
			canManage: canManageApplication(options.scope, r.jobId),
			// The job's joined Hiring managers, pre-filled onto a new interview's panel.
			hiringManagerUserIds: (managers.get(r.jobId) ?? [])
				.filter((m) => m.status === "active" && m.userId)
				.map((m) => m.userId as string),
		};
	});
}

export type ApplicantRow = Awaited<ReturnType<typeof loadApplicantRows>>[number];

/**
 * The redesign's getEmployerTeamMembers shape, from v1's member rows —
 * joined members only (for panel pickers and names). Roles via
 * shared/team-roles.ts. The Team page has its own list with invites.
 */
export async function loadTeamMembers(db: AnyDb, origin: string, organizationId: string) {
	const rows = (await db
		.select({
			id: member.id,
			userId: member.userId,
			email: member.email,
			accessLevel: member.accessLevel,
			role: member.role,
			name: member.name,
			position: member.positionTitle,
			avatarKey: member.avatarKey,
			createdAt: member.createdAt,
			accountName: user.name,
			accountEmail: user.email,
			accountImage: user.image,
		})
		.from(member)
		.leftJoin(user, eq(user.id, member.userId))
		.where(and(eq(member.organizationId, organizationId), eq(member.status, "active")))
		.orderBy(asc(member.createdAt))) as AnyDb[];
	return rows.map((r) => ({
		id: r.id as string,
		userId: (r.userId as string | null) ?? null,
		email: ((r.email as string | null) || (r.accountEmail as string | null)) ?? "",
		role: toTeamRole(r.role, r.accessLevel),
		position: (r.position as string | null) ?? null,
		status: "active" as "active" | "pending" | "declined",
		invitedAt: toIso(r.createdAt),
		joinedAt: toIso(r.createdAt),
		name: ((r.name as string | null) || (r.accountName as string | null)) ?? null,
		avatarUrl: fileUrl(origin, r.avatarKey) ?? (r.accountImage as string | null) ?? null,
		inviteExpiresAt: null,
	}));
}

export type TeamMemberRow = Awaited<ReturnType<typeof loadTeamMembers>>[number];

/**
 * The redesign's getJobseekerProfileById (JobseekerProfileWithResume) for an
 * applicant, from v3's jobseeker_profile and its child tables. `resumeUrl`
 * is the file's browser URL.
 */
export async function loadApplicantProfile(db: AnyDb, origin: string, userId: string) {
	const [p] = (await db.select().from(jobseekerProfile).where(eq(jobseekerProfile.userId, userId)).limit(1)) as AnyDb[];
	if (!p) return null;
	const by = (table: AnyDb) =>
		db.select().from(table).where(eq(table.jobseekerProfileId, p.id)).orderBy(asc(table.sortOrder)) as Promise<AnyDb[]>;
	const [work, education, certifications, languages, references] = await Promise.all([
		by(jobseekerWorkingExperience),
		by(jobseekerEducation),
		by(jobseekerCertification),
		by(jobseekerProfileLanguage),
		by(jobseekerReference),
	]);
	return {
		id: p.id as string,
		avatarUrl: fileUrl(origin, p.avatarKey),
		fullName: p.fullName as string,
		birthYear: (p.birthYear as number | null) ?? null,
		gender: p.gender ?? null,
		maritalStatus: p.maritalStatus ?? null,
		nationality: p.nationality ?? null,
		phone: p.mobileNumber ?? null,
		drivingLicense: p.drivingLicense ?? null,
		resumeFileName: p.resumeFileName ?? null,
		resumeFileSize: p.resumeFileSize ?? null,
		resumeUrl: fileUrl(origin, p.resumeUrl),
		location: p.location as string,
		city: p.city as string,
		country: p.country as string,
		area: p.area ?? null,
		latitude: p.latitude ?? null,
		longitude: p.longitude ?? null,
		preferredWorkPlaces: p.preferredWorkPlaces ?? [],
		state: p.state as string,
		targetRole: p.jobTitle ?? null,
		preferredIndustry: p.preferredIndustry ?? null,
		yearsExperience: p.yearsExperience ?? null,
		professionalSkills: (p.professionalSkills as string[]) ?? [],
		softSkills: (p.softSkills as string[]) ?? [],
		otherSkills: (p.otherSkills as string[]) ?? [],
		employmentType: p.desiredJobType ?? null,
		expectedSalaryMin: p.expectedSalaryFrom ?? null,
		expectedSalaryMax: p.expectedSalaryTo ?? null,
		bio: p.bio ?? null,
		linkedinUrl: p.linkedinUrl ?? null,
		portfolioUrl: p.portfolioUrl ?? null,
		githubUrl: p.githubUrl ?? null,
		noticePeriod: p.noticePeriod ?? null,
		workArrangement: p.workArrangement ?? null,
		workAuthorization: p.workEligibility ?? null,
		workExperiences: work.map((w) => ({
			id: w.id,
			company: w.company,
			title: w.jobTitle,
			startDate: w.periodStart,
			endDate: w.periodEnd ?? null,
			isCurrent: Boolean(w.isCurrent),
			achievements: w.jobDescription ?? null,
			sortOrder: w.sortOrder,
		})),
		education: education.map((e) => ({
			id: e.id,
			institution: e.schoolName,
			fieldOfStudy: e.fieldOfStudy ?? null,
			qualificationTier: e.educationLevel,
			cgpa: e.cgpa ?? null,
			graduationYear: e.graduationYear ?? null,
			sortOrder: e.sortOrder,
		})),
		certifications: certifications.map((c) => ({
			id: c.id,
			name: c.name,
			issuer: c.issuer ?? null,
			year: c.year ?? null,
			fileUrl: fileUrl(origin, c.fileKey),
			fileName: c.fileName ?? null,
			fileSize: c.fileSize ?? null,
			sortOrder: c.sortOrder,
		})),
		languages: languages.map((l) => ({
			id: l.id,
			language: l.language,
			dialects: l.dialects ?? [],
			spokenLevel: l.spokenLevel,
			writtenLevel: l.writtenLevel,
			sortOrder: l.sortOrder,
		})),
		references: references.map((r) => ({
			id: r.id,
			fullName: r.fullName,
			jobTitle: r.jobTitle ?? null,
			company: r.company ?? null,
			phone: r.phone ?? null,
			email: r.email ?? null,
			sortOrder: r.sortOrder,
		})),
	};
}

export type ApplicantProfile = NonNullable<Awaited<ReturnType<typeof loadApplicantProfile>>>;
