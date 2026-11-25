import { createFileRoute } from "@tanstack/react-router";
import { AboutView } from "@/components/about/about-view";

export const Route = createFileRoute("/jobseeker/about")({
  component: JobseekerAboutPage,
  head: () => ({
    meta: [
      { title: "About · JobGiga for jobseekers" },
      {
        name: "description",
        content:
          "JobGiga turns the resume you already have into a complete profile, so you can apply in one click and track every application.",
      },
    ],
  }),
});

function JobseekerAboutPage() {
  return <AboutView role="jobseeker" />;
}
