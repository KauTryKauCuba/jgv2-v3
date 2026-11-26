import { createFileRoute, redirect } from "@tanstack/react-router";

// Like the redesign, a bare /terms link goes to the visitor's own side.
// TODO(auth): send signed-in jobseekers to /jobseeker/terms.
export const Route = createFileRoute("/terms")({
  beforeLoad: () => {
    throw redirect({ to: "/employer/terms", replace: true });
  },
});
