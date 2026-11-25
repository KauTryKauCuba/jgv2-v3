import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/legal/legal-page-view";

export const Route = createFileRoute("/jobseeker/terms")({
  component: JobseekerTermsPage,
  head: () => ({
    meta: [
      { title: "Terms & Conditions · JobGiga for jobseekers" },
      { name: "description", content: "The basics of using JobGiga, for employers and jobseekers alike." },
    ],
  }),
});

function JobseekerTermsPage() {
  return <LegalPageView role="jobseeker" doc="terms" />;
}
