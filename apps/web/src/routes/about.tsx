import { createFileRoute, redirect } from "@tanstack/react-router";

// Like the redesign, a bare /about link goes to the visitor's own side.
// TODO(auth): send signed-in jobseekers to /jobseeker/about.
export const Route = createFileRoute("/about")({
  beforeLoad: () => {
    throw redirect({ to: "/employer/about", replace: true });
  },
});
