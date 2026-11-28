import type { RouterClient } from "@orpc/server";
import { publicProcedure } from "../index";
import { adminRouter } from "./admin";
import { aiRouter } from "./ai";
import { applicationRouter } from "./application";
import { authRouter } from "./auth";
import { employerRouter } from "./employer";
import { geoRouter } from "./geo";
import { jobRouter } from "./job";
import { jobseekerRouter } from "./jobseeker";
import { onboardingRouter } from "./onboarding";
import { phoneRouter } from "./phone";
import { adsRouter } from "./ads";
import { sampleDataRouter } from "./sample-data";
import { teamRouter } from "./team";

// Every API procedure, grouped by area like v1 (job, application, company, …).
// Add a file per area in this folder and register it here.
export const appRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),
	auth: authRouter,
	ai: aiRouter,
	onboarding: onboardingRouter,
	phone: phoneRouter,
	geo: geoRouter,
	jobseeker: jobseekerRouter,
	employer: employerRouter,
	job: jobRouter,
	application: applicationRouter,
	admin: adminRouter,
	team: teamRouter,
	ads: adsRouter,
	sampleData: sampleDataRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
