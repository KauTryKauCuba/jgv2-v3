import type { RouterClient } from "@orpc/server";
import { publicProcedure } from "../index";
import { aiRouter } from "./ai";
import { authRouter } from "./auth";
import { employerRouter } from "./employer";
import { geoRouter } from "./geo";
import { jobseekerRouter } from "./jobseeker";
import { onboardingRouter } from "./onboarding";
import { phoneRouter } from "./phone";

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
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
