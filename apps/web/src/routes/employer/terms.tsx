import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/legal/legal-page-view";

export const Route = createFileRoute("/employer/terms")({
  component: EmployerTermsPage,
  head: () => ({
    meta: [
      { title: "Terms & Conditions · JobGiga for employers" },
      { name: "description", content: "The basics of using JobGiga, for employers and jobseekers alike." },
    ],
  }),
});

function EmployerTermsPage() {
  return <LegalPageView role="employer" doc="terms" />;
}
