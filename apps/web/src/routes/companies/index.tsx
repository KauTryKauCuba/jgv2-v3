import { createFileRoute } from "@tanstack/react-router";
import { CompaniesPageView } from "@/components/companies/companies-page-view";

export const Route = createFileRoute("/companies/")({
  component: CompaniesPageView,
  head: () => ({
    meta: [
      { title: "Find companies · JobGiga" },
      { name: "description", content: "Browse companies hiring on JobGiga — see what they do and their open roles." },
    ],
  }),
});
