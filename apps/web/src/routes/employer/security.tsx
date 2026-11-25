import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/legal/legal-page-view";

export const Route = createFileRoute("/employer/security")({
  component: EmployerSecurityPage,
  head: () => ({
    meta: [
      { title: "Security · JobGiga for employers" },
      { name: "description", content: "How JobGiga protects your account and the data in it." },
    ],
  }),
});

function EmployerSecurityPage() {
  return <LegalPageView role="employer" doc="security" />;
}
