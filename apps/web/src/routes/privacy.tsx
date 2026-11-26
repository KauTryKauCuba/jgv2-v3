import { createFileRoute, redirect } from "@tanstack/react-router";

// Like the redesign, a bare /privacy link goes to the visitor's own side.
// TODO(auth): send signed-in jobseekers to /jobseeker/privacy.
export const Route = createFileRoute("/privacy")({
  beforeLoad: () => {
    throw redirect({ to: "/employer/privacy", replace: true });
  },
});
