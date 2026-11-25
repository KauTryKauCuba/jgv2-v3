import { createFileRoute, notFound } from "@tanstack/react-router";
import { CompanyNotFoundView, CompanyProfileView } from "@/components/companies/company-profile-view";
import { findCompany } from "@/data/companies/sample-companies";

// TODO(api): load the company from oRPC (v1's company.get) instead of the sample list.
export const Route = createFileRoute("/companies/$companyId")({
  loader: ({ params }) => {
    const company = findCompany(params.companyId);
    if (!company) throw notFound();
    return company;
  },
  component: CompanyPage,
  notFoundComponent: CompanyNotFoundView,
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `${loaderData.companyName} · JobGiga` },
          { name: "description", content: `${loaderData.companyName} — ${loaderData.industry}. See open roles on JobGiga.` },
        ]
      : [{ title: "Company not found · JobGiga" }],
  }),
});

function CompanyPage() {
  const company = Route.useLoaderData();
  return <CompanyProfileView company={company} />;
}
