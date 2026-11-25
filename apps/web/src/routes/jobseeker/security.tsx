import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/legal/legal-page-view";

export const Route = createFileRoute("/jobseeker/security")({
  component: JobseekerSecurityPage,
  head: () => ({
    meta: [
      { title: "Security · JobGiga for jobseekers" },
      { name: "description", content: "How JobGiga protects your account and the data in it." },
    ],
  }),
});

function JobseekerSecurityPage() {
  return <LegalPageView role="jobseeker" doc="security" />;
}
