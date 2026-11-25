import type { RouterClient } from "@orpc/server";
import { publicProcedure } from "../index";

// Every API procedure, grouped by area like v1 (job, application, company, …).
// Add a file per area in this folder and register it here.
export const appRouter = {
	healthCheck: publicProcedure.handler(() => "OK"),
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
