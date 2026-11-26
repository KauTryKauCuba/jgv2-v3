import { createFileRoute } from "@tanstack/react-router";
import { LegalPageView } from "@/components/legal/legal-page-view";

export const Route = createFileRoute("/employer/privacy")({
  component: EmployerPrivacyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy · JobGiga for employers" },
      { name: "description", content: "What JobGiga collects, why, and what you can do about it." },
    ],
  }),
});

function EmployerPrivacyPage() {
  return <LegalPageView role="employer" doc="privacy" />;
}
