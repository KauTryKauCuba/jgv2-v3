import { createFileRoute, redirect } from "@tanstack/react-router";

// Like the redesign, a bare /release-notes link goes to the visitor's own side.
// TODO(auth): send signed-in jobseekers to /jobseeker/release-notes.
export const Route = createFileRoute("/release-notes")({
  beforeLoad: () => {
    throw redirect({ to: "/employer/release-notes", replace: true });
  },
});
