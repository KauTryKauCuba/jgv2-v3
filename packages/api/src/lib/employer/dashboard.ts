import { jobseekerProfile, member, organization, user } from "@jobgiga-app/db/schema/auth";
import { cities } from "@jobgiga-app/db/schema/cities";
import { industries } from "@jobgiga-app/db/schema/industries";
import { CANDIDATE_RESPONSE, INTERVIEW_RESULT, interviews } from "@jobgiga-app/db/schema/interviews";
import { application, applicationStages, job } from "@jobgiga-app/db/schema/jobs";
import { states } from "@jobgiga-app/db/schema/states";
import { and, asc, eq, inArray, ne } from "drizzle-orm";
import {
	type PipelineStatus,
	toInterviewMode,
	toIso,
	toPipelineStatus,
	toPostingStatus,
	toWorkArrangement,
} from "../../shared/application-status";
import {
	type CriteriaFlags,
	employmentTypeMatchScore,
	experienceFitScore,
	hardFilterCheck,
	industryMatchScore,
	type MatchBreakdown,
	skillsOverlapScore,
	weightedScore,
	withCriteriaDefaults,
	workArrangementMatchScore,
} from "../../shared/matching";
import { inChunks, jobLocation, loadSkillNames } from "../jobs/queries";
import { canonicalizeSkill } from "../matching/skills-taxonomy";
import { fileUrl } from "../uploads";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed
// here, same as the routers.
type AnyDb = any;

/**
 * The company the signed-in employer works for (their first active
 * membership — v3 has no company switcher yet), and whether they can manage
 * it. v1's roles: "hr manager" and "hr staff" manage; a "panelist" (or
 * access level "panel") only sits on interviews.
 */
export async function loadEmployerAccess(db: AnyDb, userId: string) {
	const [row] = await db
		.select({
			memberId: member.id,
			role: member.role,
			accessLevel: member.accessLevel,
			organizationId: organization.id,
			smartMatchEnabled: organization.smartMatchEnabled,
			smartMatchCriteria: organization.smartMatchCriteria,
		})
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.where(and(eq(member.userId, userId), eq(member.status, "active")))
		.orderBy(asc(member.createdAt))
		.limit(1);
	if (!row) return null;
	const canManage = row.accessLevel !== "panel" && row.role !== "panelist";
	return {
		organizationId: row.organizationId as string,
		canManage,
		smartMatchEnabled: Boolean(row.smartMatchEnabled),
		criteria: withCriteriaDefaults(row.smartMatchCriteria as Partial<CriteriaFlags> | null),
	};
}

type InterviewDetails = {
	round: number;
	mode: "onsite" | "online" | "phone";
	scheduledAt: string;
	durationMinutes: number | null;
	// The redesign's interview_response_status, from v1's candidate_response
	// and result.
	response: string;
};

/** Every application to the company's jobs, newest first, in the redesign's shape. */
async function loadCompanyApplications(db: AnyDb, origin: string, jobIds: string[]) {
	const rows = (await inChunks(jobIds, (chunk) =>
		db
			.select({
				id: application.id,
				status: application.status,
				dateApplied: application.dateApplied,
				updatedAt: application.updatedAt,
				jobId: application.jobId,
				userId: application.userId,
				accountName: user.name,
				accountImage: user.image,
				profileName: jobseekerProfile.fullName,
				profileAvatarKey: jobseekerProfile.avatarKey,
			})
			.from(application)
			.innerJoin(user, eq(user.id, application.userId))
			.leftJoin(jobseekerProfile, eq(jobseekerProfile.userId, application.userId))
			.where(inArray(application.jobId, chunk)),
	)) as AnyDb[];
	const ids = rows.map((r) => r.id as string);

	// Each application's interviews, oldest first: the round is its place in that list.
	const interviewRows = (await inChunks(ids, (chunk) =>
		db
			.select({
				applicationId: interviews.applicationId,
				scheduledAt: interviews.scheduledAt,
				interviewDuration: interviews.interviewDuration,
				interviewType: interviews.interviewType,
				result: interviews.result,
				candidateResponse: interviews.candidateResponse,
			})
			.from(interviews)
			.where(inArray(interviews.applicationId, chunk))
			.orderBy(asc(interviews.scheduledAt)),
	)) as AnyDb[];
	const latestInterview = new Map<string, InterviewDetails>();
	const rounds = new Map<string, number>();
	for (const i of interviewRows) {
		const round = (rounds.get(i.applicationId) ?? 0) + 1;
		rounds.set(i.applicationId, round);
		const response =
			i.result === INTERVIEW_RESULT.NO_SHOW
				? "no_show"
				: i.result === INTERVIEW_RESULT.PASSED || i.result === INTERVIEW_RESULT.FAILED
					? "attended"
					: (i.candidateResponse ?? CANDIDATE_RESPONSE.PENDING);
		latestInterview.set(i.applicationId, {
			round,
			mode: toInterviewMode(i.interviewType),
			scheduledAt: toIso(i.scheduledAt),
			durationMinutes: i.interviewDuration ?? null,
			response,
		});
	}

	// When each hire happened: v1 logs a "passed" stage row.
	const passedRows = (await inChunks(ids, (chunk) =>
		db
			.select({ applicationId: applicationStages.applicationId, createdAt: applicationStages.createdAt })
			.from(applicationStages)
			.where(and(inArray(applicationStages.applicationId, chunk), eq(applicationStages.stageName, "passed"))),
	)) as AnyDb[];
	const hiredAt = new Map<string, string>();
	for (const p of passedRows) if (!hiredAt.has(p.applicationId)) hiredAt.set(p.applicationId, toIso(p.createdAt));

	return rows
		.map((r) => ({
			id: r.id as string,
			v1Status: r.status as string,
			status: toPipelineStatus(r.status),
			appliedAt: toIso(r.dateApplied),
			updatedAt: toIso(r.updatedAt),
			hiredAt: hiredAt.get(r.id) ?? null,
			jobId: r.jobId as string,
			userId: r.userId as string,
			applicantName: ((r.profileName as string | null) || (r.accountName as string)) ?? "",
			applicantAvatarUrl: fileUrl(origin, r.profileAvatarKey) ?? (r.accountImage as string | null) ?? null,
			interview: latestInterview.get(r.id) ?? null,
		}))
		.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt));
}

const FUNNEL_STAGES: PipelineStatus[] = [
	"applied",
	"screened",
	"shortlisted",
	"interview",
	"interviewed",
	"evaluation",
	"evaluated",
	"offer",
	"hired",
];
const DAY = 1000 * 60 * 60 * 24;

/**
 * The redesign's buildDashboardData (src/lib/employer-dashboard.ts), on v1's
 * tables. Month labels come back as month numbers (0–11) so the page can
 * show them in the reader's language.
 */
export async function buildDashboardData(db: AnyDb, origin: string, organizationId: string) {
	const postings = (await db
		.select({ id: job.id, title: job.title, status: job.status, views: job.views })
		.from(job)
		.where(and(eq(job.organizationId, organizationId), ne(job.status, "archived")))) as AnyDb[];
	const titles = new Map(postings.map((p) => [p.id as string, p.title as string]));
	const applications = await loadCompanyApplications(
		db,
		origin,
		postings.map((p) => p.id),
	);
	const now = Date.now();

	// Calendar week, Monday 00:00 to the next Monday.
	const startOfWeek = new Date(now);
	const dayOffset = startOfWeek.getDay() === 0 ? -6 : 1 - startOfWeek.getDay();
	startOfWeek.setHours(0, 0, 0, 0);
	startOfWeek.setDate(startOfWeek.getDate() + dayOffset);
	const endOfWeek = new Date(startOfWeek);
	endOfWeek.setDate(startOfWeek.getDate() + 7);

	const isScheduled = (a: (typeof applications)[number]) => a.status === "interview" && a.interview !== null;
	const stats = {
		activePostings: postings.filter((p) => toPostingStatus(p.status) === "active").length,
		totalApplicants: applications.length,
		interviewsThisWeek: applications.filter((a) => {
			if (!isScheduled(a)) return false;
			const at = new Date(a.interview!.scheduledAt).getTime();
			return at >= startOfWeek.getTime() && at < endOfWeek.getTime();
		}).length,
		needsEvaluation: applications.filter((a) => a.status === "evaluation").length,
		rescheduleRequests: applications.filter((a) => a.interview?.response === "reschedule_requested").length,
		postingsNeedingAttention: postings.filter((p) => p.status === "rejected" || p.status === "flagged").length,
		noShows: applications.filter((a) => a.interview?.response === "no_show" || a.v1Status === "absent").length,
		newApplicants: applications.filter((a) => a.status === "applied").length,
		kiv: applications.filter((a) => a.status === "kiv").length,
		staleOffers: applications.filter((a) => a.status === "offer" && (now - new Date(a.updatedAt).getTime()) / DAY >= 3)
			.length,
		interviewedNotEvaluated: applications.filter((a) => a.status === "interviewed").length,
	};

	const funnel = FUNNEL_STAGES.map((stage) => ({
		stage,
		count: applications.filter((a) => a.status === stage).length,
	}));

	const recentApplicants = applications.slice(0, 5).map((a) => ({
		applicationId: a.id,
		applicantName: a.applicantName,
		applicantAvatarUrl: a.applicantAvatarUrl,
		jobPostingTitle: titles.get(a.jobId) ?? "",
		appliedAt: a.appliedAt,
		status: a.status,
	}));

	const upcomingInterviews = applications
		.filter((a) => isScheduled(a) && new Date(a.interview!.scheduledAt).getTime() > now)
		.sort((a, b) => a.interview!.scheduledAt.localeCompare(b.interview!.scheduledAt))
		.slice(0, 5)
		.map((a) => ({
			applicationId: a.id,
			applicantName: a.applicantName,
			applicantAvatarUrl: a.applicantAvatarUrl,
			jobPostingTitle: titles.get(a.jobId) ?? "",
			scheduledAt: a.interview!.scheduledAt,
			mode: a.interview!.mode,
			round: a.interview!.round,
			durationMinutes: a.interview!.durationMinutes,
		}));

	const hired = applications.filter((a) => a.status === "hired");
	const trend = new Map<string, { month: number; hires: number }>();
	for (let i = 5; i >= 0; i--) {
		const d = new Date(now);
		d.setDate(1);
		d.setMonth(d.getMonth() - i);
		trend.set(`${d.getFullYear()}-${d.getMonth()}`, { month: d.getMonth(), hires: 0 });
	}
	// No "passed" stage row (older data) → fall back to the last update.
	for (const a of hired) {
		const at = new Date(a.hiredAt ?? a.updatedAt);
		const entry = trend.get(`${at.getFullYear()}-${at.getMonth()}`);
		if (entry) entry.hires++;
	}
	const hiringTrend = [...trend.values()];
	const days = hired.map((a) => (new Date(a.hiredAt ?? a.updatedAt).getTime() - new Date(a.appliedAt).getTime()) / DAY);
	const avgTimeToHireDays = days.length > 0 ? Math.round(days.reduce((s, d) => s + d, 0) / days.length) : null;

	const applicantCounts = new Map<string, number>();
	for (const a of applications) applicantCounts.set(a.jobId, (applicantCounts.get(a.jobId) ?? 0) + 1);
	const postingPerformance = postings
		.map((p) => ({
			id: p.id as string,
			title: p.title as string,
			status: toPostingStatus(p.status),
			applicantCount: applicantCounts.get(p.id) ?? 0,
			viewCount: (p.views as number) ?? 0,
		}))
		.sort((a, b) => b.applicantCount - a.applicantCount)
		.slice(0, 6);

	return {
		stats,
		funnel,
		recentApplicants,
		upcomingInterviews,
		hiringTrend,
		avgTimeToHireDays,
		postingPerformance,
		hasPostings: postings.length > 0,
	};
}

export type DashboardData = Awaited<ReturnType<typeof buildDashboardData>>;

// v1's experience_types → the minimum years a job asks for (none for
// "No Experience Needed", "Fresh Graduate" and "<1 year").
const MIN_YEARS_BY_EXPERIENCE_TYPE: Record<number, number> = { 4: 1, 5: 3, 6: 5, 7: 10 };

// v1's job.work_eligibility → which of the redesign's work authorizations a
// job accepts. "local" means Malaysians (and PRs); "international" is open.
function acceptedWorkAuthorizations(workEligibility: string): string[] {
	return workEligibility === "local" ? ["citizen", "permanent_resident"] : [];
}

/**
 * The redesign's computeMatchResults (src/lib/match-results.ts) on v1's
 * tables: every active applicant to the company's live jobs, scored against
 * the job. v1's job has no soft skills, nice-to-have skills or driving
 * licence, so those parts are left out of the score (and reweighted), as the
 * redesign does for any missing signal.
 */
export async function computeMatchResults(db: AnyDb, origin: string, organizationId: string, criteria: CriteriaFlags) {
	const postings = (await db
		.select({
			id: job.id,
			title: job.title,
			employmentType: job.employmentType,
			workArrangement: job.work_arrangement,
			workEligibility: job.work_eligibility,
			experienceTypeId: job.experienceTypeId,
			industry: industries.name,
			address: job.address,
			cityName: cities.name,
			stateName: states.name,
		})
		.from(job)
		.leftJoin(industries, eq(industries.id, job.industryId))
		.leftJoin(cities, eq(cities.id, job.cityId))
		.leftJoin(states, eq(states.id, job.stateId))
		.where(and(eq(job.organizationId, organizationId), eq(job.status, "published")))) as AnyDb[];
	if (postings.length === 0) return [];
	const byId = new Map(postings.map((p) => [p.id as string, p]));
	const requiredSkills = await loadSkillNames(
		db,
		postings.map((p) => p.id),
	);

	const candidates = (await inChunks(
		postings.map((p) => p.id as string),
		(chunk) =>
			db
				.select({
					applicationId: application.id,
					status: application.status,
					jobId: application.jobId,
					accountName: user.name,
					accountImage: user.image,
					fullName: jobseekerProfile.fullName,
					avatarKey: jobseekerProfile.avatarKey,
					professionalSkills: jobseekerProfile.professionalSkills,
					softSkills: jobseekerProfile.softSkills,
					otherSkills: jobseekerProfile.otherSkills,
					yearsExperience: jobseekerProfile.yearsExperience,
					preferredIndustry: jobseekerProfile.preferredIndustry,
					workArrangement: jobseekerProfile.workArrangement,
					desiredJobType: jobseekerProfile.desiredJobType,
					workEligibility: jobseekerProfile.workEligibility,
					drivingLicense: jobseekerProfile.drivingLicense,
				})
				.from(application)
				.innerJoin(user, eq(user.id, application.userId))
				.leftJoin(jobseekerProfile, eq(jobseekerProfile.userId, application.userId))
				.where(inArray(application.jobId, chunk)),
	)) as AnyDb[];

	const results = candidates
		// Only people still in the running.
		.filter((c) => !["rejected", "withdrawn", "hired"].includes(toPipelineStatus(c.status)))
		.map((c) => {
			const posting = byId.get(c.jobId);
			const { eligible, reasons } = hardFilterCheck({
				requiredWorkAuthorizations: acceptedWorkAuthorizations(posting.workEligibility),
				candidateWorkAuthorization: c.workEligibility ?? "",
				requiredDrivingLicense: null,
				candidateDrivingLicense: c.drivingLicense ?? null,
				enabledWorkAuthorization: criteria.workAuthorization,
				enabledDrivingLicense: criteria.drivingLicense,
			});
			const allSkills = [...(c.professionalSkills ?? []), ...(c.softSkills ?? []), ...(c.otherSkills ?? [])];
			const breakdown: MatchBreakdown = {
				skills: skillsOverlapScore(requiredSkills.get(c.jobId) ?? [], allSkills, canonicalizeSkill),
				softSkills: null,
				niceToHaveSkills: null,
				experience: experienceFitScore(
					MIN_YEARS_BY_EXPERIENCE_TYPE[posting.experienceTypeId as number] ?? null,
					c.yearsExperience ?? 0,
				),
				industry: industryMatchScore(posting.industry ?? null, c.preferredIndustry ?? ""),
				workArrangement: workArrangementMatchScore(toWorkArrangement(posting.workArrangement), c.workArrangement ?? ""),
				employmentType: employmentTypeMatchScore(posting.employmentType, c.desiredJobType ?? ""),
			};
			return {
				applicationId: c.applicationId as string,
				jobPostingId: c.jobId as string,
				jobPostingTitle: posting.title as string,
				jobPostingLocation: jobLocation(posting),
				jobPostingEmploymentType: posting.employmentType as string,
				applicantName: ((c.fullName as string | null) || (c.accountName as string)) ?? "",
				applicantAvatarUrl: fileUrl(origin, c.avatarKey) ?? (c.accountImage as string | null) ?? null,
				score: weightedScore(breakdown, criteria),
				eligible,
				ineligibleReasons: reasons,
				breakdown,
			};
		});

	results.sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score);
	return results;
}
