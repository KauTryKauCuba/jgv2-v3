import { createFileRoute } from "@tanstack/react-router";
import { ReleaseNotesView } from "@/components/release-notes/release-notes-view";

export const Route = createFileRoute("/jobseeker/release-notes")({
  component: JobseekerReleaseNotesPage,
  head: () => ({
    meta: [
      { title: "Release notes · JobGiga for jobseekers" },
      { name: "description", content: "What's changed in JobGiga for jobseekers, newest first." },
    ],
  }),
});

function JobseekerReleaseNotesPage() {
  return <ReleaseNotesView role="jobseeker" />;
}
