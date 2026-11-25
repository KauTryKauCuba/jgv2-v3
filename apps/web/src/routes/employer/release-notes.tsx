import { createFileRoute } from "@tanstack/react-router";
import { ReleaseNotesView } from "@/components/release-notes/release-notes-view";

export const Route = createFileRoute("/employer/release-notes")({
  component: EmployerReleaseNotesPage,
  head: () => ({
    meta: [
      { title: "Release notes · JobGiga for employers" },
      { name: "description", content: "What's changed in JobGiga for employers, newest first." },
    ],
  }),
});

function EmployerReleaseNotesPage() {
  return <ReleaseNotesView role="employer" />;
}
