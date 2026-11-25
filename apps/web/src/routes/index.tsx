import { createFileRoute, redirect } from "@tanstack/react-router";

// Like the redesign, the home page is the employer landing page.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/employer", replace: true });
  },
});
