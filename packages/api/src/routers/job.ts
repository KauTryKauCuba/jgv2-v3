import { job, JOB_STATUS, savedJob } from "@jobgiga-app/db/schema/jobs";
import { ORPCError } from "@orpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../index";
import { type JobCard, loadEmployerResponsiveness, loadJobCards } from "../lib/jobs/queries";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed
// here, same as the other routers.
type AnyDb = any;

// v1's job router (packages/api/src/routers/job.ts), the parts the
// dashboards use so far, under v1's names. The rest (get, create, update,
// recordView, the admin and analytics calls) comes with Find Job, Post a job
// and Manage Job.
export const jobRouter = {
	// Live jobs, newest first — v1's job.list, without its filters yet (they
	// come with the Find Job page). Each row is what the redesign's job cards
	// show, plus the company's typical reply time.
	list: publicProcedure
		.input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
		.handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const jobs: JobCard[] = await loadJobCards(
				db,
				and(eq(job.status, JOB_STATUS.PUBLISHED), eq(job.isActive, true)),
				input?.limit ?? 50,
			);
			const responsiveness = await loadEmployerResponsiveness(
				db,
				jobs.map((j) => j.organizationId),
			);
			return jobs.map((j) => ({ ...j, responsiveness: responsiveness.get(j.organizationId) ?? null }));
		}),

	// v1's job.bookmark.* — the redesign's heart button (SaveJobButton).
	bookmark: {
		save: protectedProcedure.input(z.object({ jobId: z.string() })).handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			const userId = context.session.user.id;
			const [jobRow] = await db.select({ id: job.id }).from(job).where(eq(job.id, input.jobId)).limit(1);
			if (!jobRow) throw new ORPCError("NOT_FOUND", { message: "Job not found" });
			const [existing] = await db
				.select({ id: savedJob.id })
				.from(savedJob)
				.where(and(eq(savedJob.jobId, input.jobId), eq(savedJob.userId, userId)))
				.limit(1);
			// Saving twice is fine: the heart just stays on.
			if (existing) return { saved: true as const };
			await db.insert(savedJob).values({ id: crypto.randomUUID(), jobId: input.jobId, userId });
			return { saved: true as const };
		}),

		unsave: protectedProcedure.input(z.object({ jobId: z.string() })).handler(async ({ input, context }) => {
			const db = context.db as AnyDb;
			await db
				.delete(savedJob)
				.where(and(eq(savedJob.jobId, input.jobId), eq(savedJob.userId, context.session.user.id)));
			return { saved: false as const };
		}),

		// The signed-in user's saved jobs, newest first. The dashboard only
		// needs the ids; Saved Jobs will add the job details here.
		listSavedJobs: protectedProcedure.handler(async ({ context }) => {
			const db = context.db as AnyDb;
			const rows = await db
				.select({ id: savedJob.id, jobId: savedJob.jobId, savedAt: savedJob.savedAt })
				.from(savedJob)
				.where(eq(savedJob.userId, context.session.user.id))
				.orderBy(desc(savedJob.savedAt));
			return rows as { id: string; jobId: string; savedAt: string }[];
		}),
	},
};
