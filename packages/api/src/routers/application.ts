import { organization } from "@jobgiga-app/db/schema/auth";
import { cities } from "@jobgiga-app/db/schema/cities";
import { application, job } from "@jobgiga-app/db/schema/jobs";
import { states } from "@jobgiga-app/db/schema/states";
import { desc, eq } from "drizzle-orm";
import { protectedProcedure } from "../index";
import { jobLocation, loadApplicationEvents } from "../lib/jobs/queries";
import { toIso, toPipelineStatus } from "../shared/application-status";

// biome-ignore lint: db is driver-specific (D1 vs bun-sqlite), loosely typed
// here, same as the other routers.
type AnyDb = any;

// v1's application router (packages/api/src/routers/application.ts), the
// parts the dashboards use so far, under v1's names. apply, withdraw and the
// employer-side pipeline calls come with the Apply and Applicants pages.
export const applicationRouter = {
	// The signed-in jobseeker's applications, newest first, each with its
	// history (for the progress steps). Status comes back as the redesign's
	// pipeline step (see shared/application-status.ts).
	myApplications: protectedProcedure.handler(async ({ context }) => {
		const db = context.db as AnyDb;
		const rows = (await db
			.select({
				id: application.id,
				status: application.status,
				dateApplied: application.dateApplied,
				jobId: job.id,
				title: job.title,
				address: job.address,
				cityName: cities.name,
				stateName: states.name,
				companyName: organization.displayName,
			})
			.from(application)
			.innerJoin(job, eq(job.id, application.jobId))
			.innerJoin(organization, eq(organization.id, job.organizationId))
			.leftJoin(cities, eq(cities.id, job.cityId))
			.leftJoin(states, eq(states.id, job.stateId))
			.where(eq(application.userId, context.session.user.id))
			.orderBy(desc(application.dateApplied))) as AnyDb[];
		const events = await loadApplicationEvents(
			db,
			rows.map((r) => r.id as string),
		);
		return rows.map((r) => ({
			application: { id: r.id as string, status: toPipelineStatus(r.status), appliedAt: toIso(r.dateApplied) },
			posting: { id: r.jobId as string, title: r.title as string, location: jobLocation(r) },
			companyName: r.companyName as string,
			events: events.get(r.id) ?? [],
		}));
	}),
};
