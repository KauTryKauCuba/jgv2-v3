import { createFileRoute, redirect } from "@tanstack/react-router";

// Like the redesign, a bare /security link goes to the visitor's own side.
// TODO(auth): send signed-in jobseekers to /jobseeker/security.
export const Route = createFileRoute("/security")({
  beforeLoad: () => {
    throw redirect({ to: "/employer/security", replace: true });
  },
});
