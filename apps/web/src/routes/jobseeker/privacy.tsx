import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/legal/legal-page-view";

export const Route = createFileRoute("/jobseeker/privacy")({
  component: JobseekerPrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy · JobGiga for jobseekers" },
      { name: "description", content: "What JobGiga collects, why, and what you can do about it." },
    ],
  }),
});

function JobseekerPrivacyPage() {
  return <LegalPageView role="jobseeker" doc="privacy" />;
}
