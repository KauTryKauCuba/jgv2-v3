import type { QueryClient } from "@tanstack/react-query";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/sonner";
import type { orpc } from "@/utils/orpc";
import "../index.css";

// Dev tools are loaded only in development, so they're not in the production bundle.
const TanStackRouterDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-router-devtools").then((m) => ({ default: m.TanStackRouterDevtools })))
  : () => null;
const ReactQueryDevtools = import.meta.env.DEV
  ? lazy(() => import("@tanstack/react-query-devtools").then((m) => ({ default: m.ReactQueryDevtools })))
  : () => null;
// Development-only DB map switch (src/dev/db-map). Remove this and its line below to drop it.
const DbMapOverlay = import.meta.env.DEV
  ? lazy(() => import("@/dev/db-map/db-map-overlay").then((m) => ({ default: m.DbMapOverlay })))
  : () => null;

export interface RouterAppContext {
	orpc: typeof orpc;
	queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
	component: RootComponent,
	head: () => ({
		meta: [
			{ title: "JobGiga - Find Your Next Opportunity" },
			{
				name: "description",
				content:
					"Discover thousands of job openings or hire exceptional talent for your team. JobGiga connects job seekers with top employers.",
			},
		],
	}),
});

function RootComponent() {
	return (
		<>
			<HeadContent />
			<div className="flex min-h-svh flex-col">
				<Outlet />
			</div>
			<Toaster richColors />
			<Suspense>
				<TanStackRouterDevtools position="bottom-left" />
				<ReactQueryDevtools buttonPosition="bottom-right" />
				<DbMapOverlay />
			</Suspense>
		</>
	);
}
