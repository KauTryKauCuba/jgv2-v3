import { createFileRoute } from "@tanstack/react-router";
import { AboutView } from "@/components/about/about-view";

export const Route = createFileRoute("/employer/about")({
  component: EmployerAboutPage,
  head: () => ({
    meta: [
      { title: "About · JobGiga for employers" },
      {
        name: "description",
        content:
          "JobGiga helps Malaysian employers hire with an AI assistant that sets up your company, writes your job posts and organises your applicants.",
      },
    ],
  }),
});

function EmployerAboutPage() {
  return <AboutView role="employer" />;
}
